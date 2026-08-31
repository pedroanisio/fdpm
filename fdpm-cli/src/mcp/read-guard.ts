/**
 * The controls that apply to `resources/read`.
 *
 * `createDispatcher` gates `tools/call`. Nothing gated `resources/read`, and
 * that was the wrong way round: the tool surface mostly moves small typed
 * envelopes, while `fdpm://workbook/{id}/render/{target}` serves an entire
 * rendered workbook. The surface carrying the most content had no rate limit,
 * left no audit entry, and had no size ceiling.
 *
 * WHY NOT ROUTE READS THROUGH THE DISPATCHER. Four of its seven gates are
 * write-side by construction — a read has no tier to refuse, nothing to
 * confirm, no idempotency key to replay, and no post-write freshness stamp to
 * record. Threading them through the read path would mean four branches that
 * are always false, and a reader of `dispatch.ts` would have to work out which
 * of its gates a read reaches. Three controls apply, so three controls live
 * here, and both surfaces draw on the same session.
 *
 * THE RATE LIMIT IS SHARED, NOT DUPLICATED. `ctx.session.rateLimiter` is one
 * token bucket per session. A second bucket for reads would let a caller spend
 * the tool budget and the read budget in the same minute and stay inside both,
 * which is not a limit.
 *
 * THE CEILING IS MEASURED ON WHAT IS SERVED. A blob resource travels as base64
 * in the JSON-RPC frame, so a cap applied to the decoded bytes would admit a
 * binary render at about 1.33x the stated ceiling. The check runs on the
 * `text` or `blob` string the provider returns — the thing that actually
 * crosses the wire.
 */
import { FDPMException } from "../core/errors/fdpm-exception.js";
import type { Host } from "../core/host.js";
import type { McpAuditLog } from "../persistence/mcp-audit-log.js";
import type { McpSession } from "./session.js";
import { RESOURCE_PROVIDERS } from "./resources/registry.js";
import type { ResourceReadResult } from "./resources/types.js";

/** Operator override for the resource ceiling. */
export const MAX_RESOURCE_BYTES_ENV = "FDPM_MCP_MAX_RESOURCE_BYTES";

/**
 * 1 MiB. Large enough for any render in this tree — the biggest SPEC markdown
 * is well under it — and small enough that a runaway render is refused rather
 * than posted into an agent's context window.
 */
export const DEFAULT_MAX_RESOURCE_BYTES = 1_048_576;

/**
 * Resolve the ceiling from the environment.
 *
 * A malformed value throws rather than falling back to the default. The
 * alternative — silently ignoring `FDPM_MCP_MAX_RESOURCE_BYTES=1MB` — leaves an
 * operator believing a limit is in force that is not, which is the failure mode
 * a size cap exists to prevent. `resolveCatalogBudget` refuses the same way.
 */
export function resolveMaxResourceBytes(
  env: Readonly<Record<string, string | undefined>>,
): number {
  const raw = env[MAX_RESOURCE_BYTES_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RESOURCE_BYTES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FDPMException(
      "verification",
      `${MAX_RESOURCE_BYTES_ENV} must be a positive integer number of bytes, got ${JSON.stringify(raw)}`,
      { evidence: { env: MAX_RESOURCE_BYTES_ENV, value: raw } },
    );
  }
  return parsed;
}

export interface ReadGuard {
  read(uri: string): Promise<ResourceReadResult>;
}

export interface ReadGuardOptions {
  host: Host;
  session: McpSession;
  audit: McpAuditLog;
  maxResourceBytes: number;
}

/** Bytes as they cross the wire: base64 for a blob, UTF-8 for text. */
function servedBytes(result: ResourceReadResult): number {
  if (result.text !== undefined) return Buffer.byteLength(result.text, "utf8");
  if (result.blob !== undefined) return result.blob.length;
  return 0;
}

/**
 * The workbook a URI addresses, or null when it addresses none.
 *
 * Only used to decide what to refresh, so a URI shape this does not recognise
 * costs a missed refresh and never a wrong one.
 */
function workbookIdOf(uri: string): string | null {
  const m = /^fdpm:\/\/workbook\/([^/]+)\//.exec(uri);
  return m ? decodeURIComponent(m[1]!) : null;
}

function categoryOf(err: unknown): { category: string; reason: string } {
  if (err instanceof FDPMException) {
    const reason =
      typeof err.evidence?.["reason"] === "string"
        ? (err.evidence["reason"] as string)
        : err.category;
    return { category: err.category, reason };
  }
  return { category: "internal", reason: "internal" };
}

export function createReadGuard(opts: ReadGuardOptions): ReadGuard {
  const { host, session, audit, maxResourceBytes } = opts;

  return {
    async read(uri: string): Promise<ResourceReadResult> {
      const started = Date.now();
      const callId = `res-${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      const record = (
        ok: boolean,
        extra: { bytes?: number; provider?: string; error_category?: string; error_reason?: string },
      ): void => {
        audit.write({
          ts: new Date().toISOString(),
          call_id: callId,
          phase: "resource_read",
          session: session.id,
          uri,
          ok,
          duration_ms: Date.now() - started,
          ...extra,
        });
      };

      // 1. Rate limit — the same bucket tool calls draw on.
      if (!session.rateLimiter.consume()) {
        record(false, { error_category: "permission", error_reason: "rate_limited" });
        throw new FDPMException(
          "permission",
          `rate limit exceeded for session ${session.id}`,
          { evidence: { reason: "rate_limited", session: session.id, uri } },
        );
      }

      // 2. Resolve the provider once. `match` is the provider's own parser;
      //    calling it twice would be a second parse of the same string and a
      //    second chance for the two calls to disagree.
      let provider: (typeof RESOURCE_PROVIDERS)[number] | undefined;
      let matched: unknown = null;
      for (const p of RESOURCE_PROVIDERS) {
        const m = p.match(uri);
        if (m !== null) {
          provider = p;
          matched = m;
          break;
        }
      }

      if (provider === undefined) {
        record(false, { error_category: "not_found", error_reason: "not_found" });
        throw new FDPMException("not_found", `no resource provider matches URI: ${uri}`, {
          evidence: { uri, providers: RESOURCE_PROVIDERS.map((p) => p.id) },
        });
      }

      // 3. Freshness, for providers that declare they read workbook state.
      //    Declared rather than inferred: a provider added later inherits the
      //    refresh, or states that it does not need one.
      if (provider.readsWorkbookState === true) {
        const workbookId = workbookIdOf(uri);
        if (workbookId !== null) {
          try {
            await host.reloadProjectTail(workbookId);
          } catch {
            // A tail replay that cannot run is not a read failure. The
            // provider is about to fail with a better message (not_found for
            // an unknown workbook, host_compat for a rewritten log), and
            // pre-empting it here would replace that with a worse one.
          }
        }
      }

      // 4. Read, then measure what would be served.
      let result: ResourceReadResult;
      try {
        result = await provider.read(host, matched);
      } catch (err) {
        const { category, reason } = categoryOf(err);
        record(false, { provider: provider.id, error_category: category, error_reason: reason });
        throw err;
      }

      const bytes = servedBytes(result);
      if (bytes > maxResourceBytes) {
        record(false, {
          provider: provider.id,
          bytes,
          error_category: "quota",
          error_reason: "resource_too_large",
        });
        throw new FDPMException(
          "quota",
          `resource ${uri} is ${bytes} B, over the ${maxResourceBytes} B ceiling`,
          {
            evidence: {
              reason: "resource_too_large",
              uri,
              bytes,
              cap: maxResourceBytes,
              env: MAX_RESOURCE_BYTES_ENV,
            },
          },
        );
      }

      record(true, { provider: provider.id, bytes });
      return result;
    },
  };
}
