/**
 * MCP per-call dispatcher — the middleware chain that runs between
 * `tools/call` arrival and `Host.*` invocation.
 *
 * Order matters and is normative (SPEC-MCP-SERVER §15.2):
 *
 *   1. Resolve tool by name.
 *   2. Tier gate (destructive-tier off → permission/destructive_disabled).
 *   3. Per-session rate limit (excess → permission/rate_limited).
 *   4. Freshness check.
 *      - Tier 1 (lenient): silent `host.reloadProjectTail` then continue.
 *      - Tier 2/3 (strict): refuse with `permission` + reason `stale_state`.
 *   5. Input schema validation.
 *   6. Audit-start log entry.
 *   7. Handler call (try/catch).
 *   8. Audit-complete log entry (ok/error, duration, validation_status).
 *   9. Return MCP CallToolResult shape.
 *
 * Response shape:
 *   - Tier 1 success: `{ content: [text], structuredContent: <handler return>, isError: false }`.
 *   - Tier 2 success (validation_report.accepted=true): `{ structuredContent: <full envelope>, isError: false }`.
 *   - Tier 2 rejection (validation_report.accepted=false): `{ structuredContent: { ok: false, ... }, isError: false }` (per SPEC §8.2 / §12: protocol succeeded, operation rejected).
 *   - Genuine protocol error (FDPMException): `{ structuredContent: { error: env }, isError: true }`.
 */

import { FDPMException } from "../core/errors/fdpm-exception.js";
import { staleStateException } from "../core/errors/stale-state.js";
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

  // 2. Tier gate. Tier 3 tools may only run when explicitly enabled.
  if (tool.tier === "destructive" && !ctx.enableDestructive) {
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

  // 2b. Confirmation-token gate (SPEC-MCP-SERVER §9.3, opt-in).
  // Tier 2/3 calls MUST carry `_confirmation_token` matching
  // `ctx.confirmationToken` when `ctx.requireConfirmationToken` is
  // true. The token is stripped from the args after acceptance so the
  // per-tool strict input schema does not reject it as an unknown
  // key. Tier 1 calls are unaffected.
  let argsForValidation: unknown = rawArgs;
  if (
    ctx.requireConfirmationToken === true &&
    (tool.tier === "validating_write" || tool.tier === "destructive")
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
              advice: "operator must SIGHUP fdpm-mcp",
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

  // 6. Audit-start.
  writeStart(audit, ctx, tool.name, callId, argsHashEarly, parsed.data);

  // Capture project_ids again so the success/error finalizers can
  // re-seed the freshness map after a Tier-2 write — without this,
  // two consecutive same-session writes appear stale to each other
  // because every append changes (mtime_ns, size).
  const project_ids_for_seed = resolveProjectIds(host, tool.name, rawArgs);

  // 7. Handler invocation.
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
    return finalizeSuccess(
      audit,
      ctx,
      tool,
      callId,
      argsHashEarly,
      parsed.data,
      start,
      result,
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
    return finalizeError(audit, ctx, tool, callId, argsHashEarly, parsed.data, start, err);
  }
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
): CallToolResult {
  // Tier-2 envelope detection: handlers return the SPEC §8.2 shape;
  // dispatcher decides between "happy" and "rejected by §7" based on
  // `validation_report.accepted`.
  if (tool.tier === "validating_write" && isTier2Envelope(result)) {
    const accepted = result.validation_report.accepted === true;
    writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
      ok: accepted,
      duration_ms: Date.now() - start,
      validation_status: accepted ? "pass" : "fail",
    });
    // Per SPEC §12 / §8.2: protocol call succeeded; isError stays false
    // even when validation_report.accepted=false. The caller distinguishes
    // by inspecting structuredContent.ok.
    const envelope = { ...(result as unknown as Record<string, unknown>), ok: accepted };
    return {
      content: [{ type: "text", text: JSON.stringify(envelope) }],
      structuredContent: envelope,
      isError: false,
    };
  }

  // Tier 1 (or any non-Tier-2 success): plain pass-through.
  writeComplete(audit, ctx, tool.name, callId, argsHash, args, {
    ok: true,
    duration_ms: Date.now() - start,
    validation_status: validationStatusFor(tool.tier, true),
  });
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
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

function writeStart(
  audit: McpAuditLog | null,
  ctx: DispatchCtx,
  tool: string,
  callId: string,
  argsHash: string,
  args: unknown,
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
  },
): void {
  writeStart(audit, ctx, tool, callId, argsHash, args);
  writeComplete(audit, ctx, tool, callId, argsHash, args, fields);
}

export type { McpToolEntry } from "./types.js";
