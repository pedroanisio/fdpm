/**
 * MCP per-call dispatcher — the middleware chain that runs between
 * `tools/call` arrival and `Host.*` invocation.
 *
 * Order matters and is normative (SPEC-MCP-SERVER §15.2):
 *
 *   1. Resolve tool by name.
 *   2. Tier gate (destructive-tier off → permission/destructive_disabled).
 *      A Tier-3 call with `dry_run: true` (strict boolean) is a preview
 *      with no side effect: it passes this gate and the confirmation
 *      gate (§8.7).
 *   3. Per-session rate limit (excess → permission/rate_limited).
 *   4. Freshness check.
 *      - Tier 1 (lenient): silent `host.reloadProjectTail` then continue.
 *      - Tier 2/3 (strict): refuse with `permission` + reason `stale_state`.
 *   5. Input schema validation.
 *   5b. Tier-3 idempotency (§8.7): a real (non-dry-run) destructive call
 *       MUST carry `idempotency_key`; `(tool, key)` is looked up in the
 *       session cache — same args → replay the recorded result (no
 *       handler run, audit `replayed: true`); different args →
 *       conflict/idempotency_key_reused; pending → coalesce.
 *   6. Audit-start log entry (Tier-3: tier, idempotency_key, dry_run —
 *      the intent record, written BEFORE the handler runs).
 *   7. Handler call (try/catch).
 *   8. Result ceiling (Tier 1 only): a read whose serialised result exceeds
 *      `ctx.maxResultBytes` is refused with `quota` +
 *      `evidence.reason: "result_too_large"` naming the tool's narrowing
 *      levers. Writes are measured but never refused — see `result-budget.ts`.
 *   9. Audit-complete log entry (ok/error, duration, validation_status,
 *      result_bytes).
 *  10. Return MCP CallToolResult shape.
 *
 * Response shape:
 *   - Tier 1 success: `{ content: [text], structuredContent: <handler return>, isError: false }`.
 *   - Tier 2 success (validation_report.accepted=true): `{ structuredContent: <full envelope>, isError: false }`.
 *   - Tier 2 rejection (validation_report.accepted=false): `{ structuredContent: { ok: false, ... }, isError: false }` (per SPEC §8.2 / §12: protocol succeeded, operation rejected).
 *   - Genuine protocol error (FDPMException): `{ structuredContent: { error: env }, isError: true }`.
 */

import { FDPMException } from "../core/errors/fdpm-exception.js";
import { staleStateException } from "../core/errors/stale-state.js";
import { MCP_RELOAD_ADVICE } from "./reload.js";
import {
  DEFAULT_MAX_RESULT_BYTES,
  resultTooLargeException,
  serialiseResult,
} from "./result-budget.js";
import type { Host } from "../core/host.js";
import type { McpToolEntry, DispatchCtx, Tier } from "./types.js";
import { findTool } from "./manifest.js";
import { resolveProjectIdsExtractor } from "./tool-metadata-map.js";
import {
  type McpAuditLog,
  type McpAuditCompleteEntry,
  type McpAuditStartEntry,
  hashArgs,
} from "../persistence/mcp-audit-log.js";
import { mintUid } from "../core/identity/uid.js";

/**
 * Tier → required scope. Declared here rather than imported from the
 * HTTP layer so the MCP core keeps no dependency on the transport;
 * `tests/http/scope-gate.test.ts` asserts it never diverges from
 * `src/http/principal.ts`.
 */
const SCOPE_FOR_TIER: Record<Tier, string> = {
  read_only: "fdpm.read",
  validating_write: "fdpm.write",
  destructive: "fdpm.admin",
};

/** Shape returned to the MCP transport layer. */
export interface CallToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
  isError: boolean;
}

export interface Dispatcher {
  call(name: string, rawArgs: unknown): Promise<CallToolResult>;
}

interface Tier2EnvelopeShape {
  ok: boolean;
  operation?: unknown;
  validation_report: { accepted: boolean; findings?: unknown[]; target_id?: string };
  post_state_summary: unknown;
}

function isTier2Envelope(v: unknown): v is Tier2EnvelopeShape {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["ok"] !== "boolean") return false;
  const vr = o["validation_report"];
  if (typeof vr !== "object" || vr === null) return false;
  if (typeof (vr as { accepted?: unknown }).accepted !== "boolean") return false;
  if (!("post_state_summary" in o)) return false;
  return true;
}

/**
 * Construct a dispatcher bound to a specific (host, ctx, audit-log) triple.
 * `resolveTool` is an optional seam used only by unit tests to inject a
 * synthetic tool registry.
 */
export function createDispatcher(
  host: Host,
  ctx: DispatchCtx,
  audit: McpAuditLog | null,
  resolveTool: (name: string) => McpToolEntry<unknown, unknown> | null = findTool,
): Dispatcher {
  return {
    async call(name, rawArgs) {
      return dispatchOne(host, ctx, audit, name, rawArgs, resolveTool);
    },
  };
}

async function dispatchOne(
  host: Host,
  ctx: DispatchCtx,
  audit: McpAuditLog | null,
  name: string,
  rawArgs: unknown,
  resolveTool: (name: string) => McpToolEntry<unknown, unknown> | null,
): Promise<CallToolResult> {
  const callId = mintUid();
  const start = Date.now();
  const argsHashEarly = hashArgs(rawArgs);

  // 1. Tool lookup.
  const tool = resolveTool(name);
  if (tool === null) {
    const env = errorEnvelope(
      new FDPMException("not_found", `tool not found: ${name}`, {
        evidence: { reason: "unknown_tool", tool: name },
      }),
    );
    writeComplete(audit, ctx, name, callId, argsHashEarly, rawArgs, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "n/a",
      error_category: env.category,
      error_reason: reasonOf(env),
    });
    return errorResult(env);
  }

  // Tier-3 preview detection (§8.7). Only a strict boolean `true` on the
  // raw args counts — a truthy string must not open the gate. The input
  // schema re-validates the field below.
  const isDestructive = tool.tier === "destructive";
  const dryRun =
    isDestructive &&
    typeof rawArgs === "object" &&
    rawArgs !== null &&
    (rawArgs as Record<string, unknown>)["dry_run"] === true;

  // 2. Tier gate. Tier 3 tools may only run when explicitly enabled;
  // a dry-run preview appends nothing and passes.
  if (isDestructive && !dryRun && !ctx.enableDestructive) {
    const env = errorEnvelope(
      new FDPMException(
        "permission",
        `destructive tool refused: ${tool.name}`,
        { evidence: { reason: "destructive_disabled", tool: tool.name } },
      ),
    );
    writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "n/a",
      error_category: env.category,
      error_reason: reasonOf(env),
    });
    return errorResult(env);
  }

  // 2a. Scope gate. Only engaged on a network transport, where
  // `ctx.principal` is present. stdio has no principal and keeps its
  // pre-existing behaviour: `enableDestructive` remains the only tier
  // control there. A dry-run still requires the tier's scope — previewing
  // a delete reveals what exists, which is itself an authorization
  // decision.
  if (ctx.principal !== undefined) {
    const requiredScope = SCOPE_FOR_TIER[tool.tier];
    if (!ctx.principal.scopes.includes(requiredScope)) {
      const env = errorEnvelope(
        new FDPMException(
          "permission",
          `this token is not authorized for ${tool.tier} tools; required scope ${requiredScope}`,
          {
            evidence: {
              reason: "insufficient_scope",
              required_scope: requiredScope,
              tier: tool.tier,
              tool: tool.name,
            },
          },
        ),
      );
      writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
        ok: false,
        duration_ms: Date.now() - start,
        validation_status: "n/a",
        error_category: env.category,
        error_reason: reasonOf(env),
      });
      return errorResult(env);
    }
  }

  // 2b. Confirmation-token gate (SPEC-MCP-SERVER §9.3, opt-in).
  // Tier 2/3 calls MUST carry `_confirmation_token` matching
  // `ctx.confirmationToken` when `ctx.requireConfirmationToken` is
  // true. The token is stripped from the args after acceptance so the
  // per-tool strict input schema does not reject it as an unknown
  // key. Tier 1 calls are unaffected.
  let argsForValidation: unknown = rawArgs;
  if (
    ctx.requireConfirmationToken === true &&
    (tool.tier === "validating_write" || (isDestructive && !dryRun))
  ) {
    const provided =
      typeof rawArgs === "object" && rawArgs !== null
        ? (rawArgs as Record<string, unknown>)["_confirmation_token"]
        : undefined;
    if (typeof provided !== "string" || provided !== ctx.confirmationToken) {
      const env = errorEnvelope(
        new FDPMException(
          "permission",
          `confirmation token required for ${tool.name}`,
          {
            evidence: { reason: "confirmation_required", tool: tool.name },
          },
        ),
      );
      writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
        ok: false,
        duration_ms: Date.now() - start,
        validation_status: "n/a",
        error_category: env.category,
        error_reason: reasonOf(env),
      });
      return errorResult(env);
    }
    if (typeof rawArgs === "object" && rawArgs !== null) {
      const cloned: Record<string, unknown> = {
        ...(rawArgs as Record<string, unknown>),
      };
      delete cloned["_confirmation_token"];
      argsForValidation = cloned;
    }
  } else if (
    typeof rawArgs === "object" &&
    rawArgs !== null &&
    "_confirmation_token" in (rawArgs as Record<string, unknown>)
  ) {
    // Strip the reserved field even when confirmation mode is off so
    // strict zod schemas do not flag it as an unknown key.
    const cloned: Record<string, unknown> = {
      ...(rawArgs as Record<string, unknown>),
    };
    delete cloned["_confirmation_token"];
    argsForValidation = cloned;
  }

  // 3. Per-session rate limit.
  if (!ctx.session.rateLimiter.consume()) {
    const env = errorEnvelope(
      new FDPMException("permission", `rate limit exceeded for session ${ctx.session.id}`, {
        evidence: { reason: "rate_limited", session: ctx.session.id },
      }),
    );
    writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "n/a",
      error_category: env.category,
      error_reason: reasonOf(env),
    });
    return errorResult(env);
  }

  // 4. Freshness check (SPEC-MCP-SERVER §10 / §21).
  // Resolves the tool's workbook-id extractor, expands ["*"] wildcards,
  // calls `session.checkFreshness`, and either tail-replays (Tier 1
  // lenient) or refuses (Tier 2/3 strict). Skipped when the tool's
  // extractor returns [] (no workbook state addressed).
  try {
    const project_ids = resolveProjectIds(host, tool.name, rawArgs);
    if (project_ids.length > 0) {
      const { stale } = ctx.session.checkFreshness(host, project_ids);
      if (stale.length > 0) {
        if (tool.tier === "read_only") {
          // Lenient: tail-replay each stale workbook, then continue.
          for (const pid of stale) {
            await host.reloadProjectTail(pid);
          }
          ctx.session.markFresh(host, stale);
        } else {
          // Strict: refuse with a stale-state envelope. Surface the
          // first stale workbook (operators see a deterministic id;
          // the audit log preserves the args hash for cross-reference).
          const first = stale[0]!;
          const observed = host.statProjectLog(first);
          const cached = ctx.session.freshnessSnapshot().get(first);
          const detail: {
            cached_mtime_ns?: string;
            cached_size?: string;
            observed_mtime_ns?: string;
            observed_size?: string;
          } = {};
          if (cached !== undefined) {
            detail.cached_mtime_ns = cached.mtime_ns.toString();
            detail.cached_size = cached.size.toString();
          }
          if (observed !== null) {
            detail.observed_mtime_ns = observed.mtime_ns.toString();
            detail.observed_size = observed.size.toString();
          }
          const env = errorEnvelope(
            staleStateException({
              workbook_id: first,
              advice: MCP_RELOAD_ADVICE,
              detail,
            }),
          );
          writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
            ok: false,
            duration_ms: Date.now() - start,
            validation_status: "n/a",
            error_category: env.category,
            error_reason: reasonOf(env),
          });
          return errorResult(env);
        }
      }
    }
  } catch (err) {
    // Tail-replay can throw `host_compat` (truncated/rewritten log).
    // Surface it as an MCP error envelope; do NOT fall through to
    // the handler with stale state.
    const env = errorEnvelope(err);
    writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "n/a",
      error_category: env.category,
      error_reason: reasonOf(env),
    });
    return errorResult(env);
  }

  // 5. Input validation. Uses `argsForValidation` so the
  // confirmation-token gate's strip is honored.
  const parsed = tool.input.safeParse(argsForValidation);
  if (!parsed.success) {
    const env = errorEnvelope(
      new FDPMException("validation", `invalid arguments for ${tool.name}`, {
        findings: parsed.error.issues,
      }),
    );
    writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "fail",
      error_category: env.category,
    });
    return errorResult(env);
  }

  // 5b. Tier-3 idempotency (§8.7). Gate refusals above are never cached;
  // only what the handler decides is.
  const auditExtra: AuditStartExtra | undefined = isDestructive
    ? {
        tier: "destructive",
        dry_run: dryRun,
        ...(dryRun
          ? {}
          : { idempotency_key: (parsed.data as { idempotency_key?: string }).idempotency_key }),
      }
    : undefined;
  let settle: ((result: CallToolResult) => void) | null = null;
  if (isDestructive && !dryRun) {
    const key = (parsed.data as { idempotency_key?: unknown }).idempotency_key;
    if (typeof key !== "string" || key.length === 0) {
      const env = errorEnvelope(
        new FDPMException("validation", `idempotency_key is required for ${tool.name}`, {
          evidence: { reason: "idempotency_key_required", tool: tool.name },
        }),
      );
      writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
        ok: false,
        duration_ms: Date.now() - start,
        validation_status: "n/a",
        error_category: env.category,
        error_reason: reasonOf(env),
      }, auditExtra);
      return errorResult(env);
    }
    const cacheKey = `${tool.name}\u0000${key}`;
    const argsHashForKey = hashArgs(argsForValidation);
    const hit = ctx.session.idempotency.lookup(cacheKey);
    if (hit !== undefined) {
      if (hit.args_hash !== argsHashForKey) {
        const env = errorEnvelope(
          new FDPMException(
            "conflict",
            `idempotency_key ${JSON.stringify(key)} was already used for ${tool.name} with different arguments`,
            { evidence: { reason: "idempotency_key_reused", tool: tool.name } },
          ),
        );
        writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
          ok: false,
          duration_ms: Date.now() - start,
          validation_status: "n/a",
          error_category: env.category,
          error_reason: reasonOf(env),
        }, auditExtra);
        return errorResult(env);
      }
      // Same key, same args: replay (or coalesce onto the in-flight call).
      const replayed = (await hit.promise) as CallToolResult;
      writeStartAndComplete(audit, ctx, tool.name, callId, argsHashEarly, rawArgs, {
        ok: !replayed.isError,
        duration_ms: Date.now() - start,
        validation_status: "n/a",
        replayed: true,
      }, auditExtra);
      return replayed;
    }
    const pending = new Promise<CallToolResult>((resolve) => {
      settle = resolve;
    });
    ctx.session.idempotency.register(cacheKey, argsHashForKey, pending);
  }

  // 6. Audit-start — for Tier-3 this is the intent record (§8.7).
  writeStart(audit, ctx, tool.name, callId, argsHashEarly, parsed.data, auditExtra);

  // Capture project_ids again so the success/error finalizers can
  // re-seed the freshness map after a Tier-2 write — without this,
  // two consecutive same-session writes appear stale to each other
  // because every append changes (mtime_ns, size).
  const project_ids_for_seed = resolveProjectIds(host, tool.name, rawArgs);

  // 7. Handler invocation. The outcome — success or handler error — is
  // what the idempotency entry records; `settle` is always called.
  let outcome: CallToolResult;
  try {
    const result = await tool.handler(host, parsed.data, ctx);
    if (
      (tool.tier === "validating_write" || tool.tier === "destructive") &&
      project_ids_for_seed.length > 0
    ) {
      // Write succeeded → re-record post-write tuple so the next call
      // from this session sees its own write as fresh, not stale.
      ctx.session.markFresh(host, project_ids_for_seed);
    }
    outcome = finalizeSuccess(
      audit,
      ctx,
      tool,
      callId,
      argsHashEarly,
      parsed.data,
      start,
      result,
      dryRun,
    );
  } catch (err) {
    if (
      (tool.tier === "validating_write" || tool.tier === "destructive") &&
      project_ids_for_seed.length > 0
    ) {
      // Even on §7 rejection: Host's `runWithValidation` does NOT
      // append before rejecting, but other error paths (host_compat
      // mid-write, etc.) may have appended. Re-recording is cheap
      // and idempotent regardless.
      ctx.session.markFresh(host, project_ids_for_seed);
    }
    outcome = finalizeError(audit, ctx, tool, callId, argsHashEarly, parsed.data, start, err);
  }
  if (settle !== null) (settle as (r: CallToolResult) => void)(outcome);
  return outcome;
}

/**
 * Resolve the workbook_id set this call addresses. Empty array means
 * "skip the freshness check"; `["*"]` is the wildcard sentinel that
 * expands to every known workbook (with a stderr warning per SPEC §10
 * lenient-mode notes).
 */
function resolveProjectIds(
  host: Host,
  toolName: string,
  rawArgs: unknown,
): readonly string[] {
  // The boot-time check in `manifest.ts` guarantees every MANIFEST
  // tool has an entry in `TOOL_TO_COMMAND_METADATA`. Test harnesses
  // that inject synthetic tools via the `resolveTool` seam are the
  // only callers that legitimately reach a missing entry; treat those
  // as "no workbook state" rather than crashing the dispatch path.
  let extractor: ReturnType<typeof resolveProjectIdsExtractor>;
  try {
    extractor = resolveProjectIdsExtractor(toolName);
  } catch {
    return [];
  }
  // The extractor expects a Record<string, unknown>; defend against
  // primitive/array/null inputs by short-circuiting to the empty set.
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return [];
  }
  const ids = extractor(rawArgs as Record<string, unknown>);
  if (ids.length === 0) return [];
  if (ids.length === 1 && ids[0] === "*") {
    process.stderr.write(
      `[fdpm-mcp] tool ${toolName} requested wildcard freshness scan\n`,
    );
    return host.listProjects().map((p) => p.id);
  }
  return ids;
}

function finalizeSuccess(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: McpToolEntry<unknown, unknown>,
  callId: string,
  argsHash: string,
  args: unknown,
  start: number,
  result: unknown,
  dryRun: boolean = false,
): CallToolResult {
  // Tier-2 envelope detection: handlers return the SPEC §8.2 shape;
  // dispatcher decides between "happy" and "rejected by §7" based on
  // `validation_report.accepted`.
  if (tool.tier === "validating_write" && isTier2Envelope(result)) {
    const accepted = result.validation_report.accepted === true;
    // Per SPEC §12 / §8.2: protocol call succeeded; isError stays false
    // even when validation_report.accepted=false. The caller distinguishes
    // by inspecting structuredContent.ok.
    const envelope = { ...(result as unknown as Record<string, unknown>), ok: accepted };
    const serialised = serialiseResult(envelope);
    // Measured, not gated. A write's response is recorded so the operator can
    // see the echo growth a batch produces; refusing it would be worse than
    // serving it (see `result-budget.ts`).
    writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
      ok: accepted,
      duration_ms: Date.now() - start,
      validation_status: accepted ? "pass" : "fail",
      result_bytes: serialised.bytes,
      ...(accepted ? {} : { rule_ids: distinctRuleIds(result.validation_report.findings) }),
    });
    return {
      content: [{ type: "text", text: serialised.text }],
      structuredContent: envelope,
      isError: false,
    };
  }

  // Tier 1 (or any non-Tier-2 success): plain pass-through, once the
  // result is known to fit. `read_only` is the whole scope of the ceiling:
  // a read can be re-asked smaller, a completed write cannot be un-appended,
  // so refusing a write's response would invite a duplicating retry. See
  // `result-budget.ts`.
  const serialised = serialiseResult(result);
  const cap = ctx.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
  if (tool.tier === "read_only" && serialised.bytes > cap) {
    const err = resultTooLargeException({
      tool: tool.name,
      bytes: serialised.bytes,
      cap,
      ...(tool.narrowing === undefined ? {} : { narrowing: tool.narrowing }),
    });
    const env = errorEnvelope(err);
    writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: validationStatusFor(tool.tier, false),
      error_category: env.category,
      error_reason: reasonOf(env),
      result_bytes: serialised.bytes,
    });
    return errorResult(env);
  }

  writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
    ok: true,
    duration_ms: Date.now() - start,
    validation_status: validationStatusFor(tool.tier, true),
    result_bytes: serialised.bytes,
    ...(dryRun ? { dry_run: true } : {}),
  });
  return {
    content: [{ type: "text", text: serialised.text }],
    structuredContent: result as object,
    isError: false,
  };
}

function finalizeError(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: McpToolEntry<unknown, unknown>,
  callId: string,
  argsHash: string,
  args: unknown,
  start: number,
  err: unknown,
): CallToolResult {
  const env = errorEnvelope(err);
  // Per SPEC §12: a `validation`-category throw from Host.* on a Tier 2
  // tool is the §7 pipeline rejecting an operation. That MUST surface
  // as `isError: false` with `ok: false` and a populated
  // validation_report — NOT as an MCP error envelope.
  if (
    tool.tier === "validating_write" &&
    env.category === "validation" &&
    err instanceof FDPMException
  ) {
    const report = {
      target_id: extractTargetId(args),
      findings: (err.findings ?? []) as unknown[],
      accepted: false,
    };
    const envelope = {
      ok: false,
      validation_report: report,
      post_state_summary: {},
    };
    writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
      ok: false,
      duration_ms: Date.now() - start,
      validation_status: "fail",
      rule_ids: distinctRuleIds(report.findings),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(envelope) }],
      structuredContent: envelope,
      isError: false,
    };
  }

  writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
    ok: false,
    duration_ms: Date.now() - start,
    validation_status: validationStatusFor(tool.tier, false),
    error_category: env.category,
    error_reason: reasonOf(env),
  });
  return errorResult(env);
}

/** §9.5: the sorted, distinct rule_ids among a rejection's findings. */
function distinctRuleIds(findings: unknown): string[] {
  if (!Array.isArray(findings)) return [];
  const ids = new Set<string>();
  for (const f of findings) {
    if (f && typeof f === "object" && typeof (f as { rule_id?: unknown }).rule_id === "string") {
      ids.add((f as { rule_id: string }).rule_id);
    }
  }
  return [...ids].sort();
}

function validationStatusFor(tier: Tier, ok: boolean): "pass" | "fail" | "n/a" {
  if (tier === "validating_write") return ok ? "pass" : "fail";
  return "n/a";
}

function extractTargetId(args: unknown): string {
  if (typeof args !== "object" || args === null) return "(unknown)";
  const o = args as Record<string, unknown>;
  for (const top of ["primitive", "relation", "patch", "payload"] as const) {
    const v = o[top];
    if (v && typeof v === "object" && "id" in v && typeof (v as { id?: unknown }).id === "string") {
      return (v as { id: string }).id;
    }
  }
  if (typeof o["workbook_id"] === "string") return o["workbook_id"];
  return "(unknown)";
}

// -- Error / shaping helpers ------------------------------------------

interface ErrorEnvelope {
  category: string;
  message: string;
  evidence?: Record<string, unknown>;
  findings?: unknown[];
}

function errorEnvelope(err: unknown): ErrorEnvelope {
  if (err instanceof FDPMException) {
    return err.toEnvelope() as ErrorEnvelope;
  }
  const message = err instanceof Error ? err.message : String(err);
  return { category: "internal", message };
}

function reasonOf(env: ErrorEnvelope): string | undefined {
  const ev = env.evidence;
  if (ev && typeof ev["reason"] === "string") return ev["reason"];
  return undefined;
}

function errorResult(env: ErrorEnvelope): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: env }) }],
    structuredContent: { error: env },
    isError: true,
  };
}

// -- Audit-log helpers ------------------------------------------------

/** Tier-3 intent fields recorded on the start entry (§8.7). */
interface AuditStartExtra {
  tier: "destructive";
  dry_run: boolean;
  idempotency_key?: string;
}

function writeStart(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: string,
  callId: string,
  argsHash: string,
  args: unknown,
  extra?: AuditStartExtra,
): void {
  if (audit === null) return;
  const entry: McpAuditStartEntry = {
    ts: new Date().toISOString(),
    call_id: callId,
    phase: "start",
    session: ctx.session.id,
    tool,
    args_hash: argsHash,
  };
  if (ctx.auditFullArgs) entry.args = args;
  if (extra !== undefined) {
    entry.tier = extra.tier;
    entry.dry_run = extra.dry_run;
    if (extra.idempotency_key !== undefined) entry.idempotency_key = extra.idempotency_key;
  }
  audit.write(entry);
}

function writeComplete(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: string,
  callId: string,
  argsHash: string,
  args: unknown,
  fields: {
    ok: boolean;
    duration_ms: number;
    validation_status: "pass" | "fail" | "n/a";
    error_category?: string;
    error_reason?: string;
    replayed?: boolean;
    dry_run?: boolean;
    rule_ids?: string[];
    result_bytes?: number;
  },
): void {
  if (audit === null) return;
  const entry: McpAuditCompleteEntry = {
    ts: new Date().toISOString(),
    call_id: callId,
    phase: "complete",
    session: ctx.session.id,
    tool,
    args_hash: argsHash,
    ok: fields.ok,
    duration_ms: fields.duration_ms,
    validation_status: fields.validation_status,
  };
  if (ctx.auditFullArgs) entry.args = args;
  if (fields.error_category !== undefined) entry.error_category = fields.error_category;
  if (fields.error_reason !== undefined) entry.error_reason = fields.error_reason;
  if (fields.replayed === true) entry.replayed = true;
  if (fields.dry_run === true) entry.dry_run = true;
  if (fields.rule_ids !== undefined && fields.rule_ids.length > 0) entry.rule_ids = fields.rule_ids;
  if (fields.result_bytes !== undefined) entry.result_bytes = fields.result_bytes;
  audit.write(entry);
}

function writeStartAndComplete(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: string,
  callId: string,
  argsHash: string,
  args: unknown,
  fields: {
    ok: boolean;
    duration_ms: number;
    validation_status: "pass" | "fail" | "n/a";
    error_category?: string;
    error_reason?: string;
    replayed?: boolean;
    dry_run?: boolean;
    rule_ids?: string[];
    result_bytes?: number;
  },
  extra?: AuditStartExtra,
): void {
  writeStart(audit, ctx, tool, callId, argsHash, args, extra);
  writeComplete(audit, ctx, tool, callId, argsHash, args, fields);
}

export type { McpToolEntry } from "./types.js";
