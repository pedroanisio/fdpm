/**
 * MCP audit log — SPEC-MCP-SERVER §9.4 / §21.
 *
 * Append-only JSONL file at `$FDPM_DATA_DIR/mcp-audit.jsonl`. One
 * `start` entry per dispatched tool call, one `complete` entry per
 * call. Both entries share a `call_id` (a ULID minted when the call
 * begins), so post-incident reviewers can correlate.
 *
 * `args_hash` (sha256 of the canonical JSON of the args) is the
 * default — it lets reviewers detect arg replay without exposing
 * potentially sensitive content. `FDPM_MCP_AUDIT_FULL_ARGS=1` /
 * `--audit-full-args` opts into logging the literal `args` for
 * debugging.
 *
 * The writer is intentionally synchronous on each call: the v0.1
 * latency budget (§3 dispatch p50 ≤ 25 % of CLI p50) is dominated by
 * Host work, and a `writeFileSync` append per call is dwarfed by
 * validation costs. This also matches the durability story —
 * audit-log entries land before the dispatcher returns, so a crash
 * after dispatch does not lose the audit trail.
 *
 * The write path is best-effort with a stderr warning on failure;
 * audit-log I/O errors MUST NOT prevent a tool call from completing,
 * because the alternative is silent denial of service via "the disk
 * is full" → every call fails open.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export interface McpAuditStartEntry {
  ts: string;
  call_id: string;
  phase: "start";
  session: string;
  tool: string;
  args_hash: string;
  args?: unknown;
  /**
   * Tier-3 intent fields (SPEC-MCP-SERVER §8.7). Present only for
   * destructive tools, so a reviewer can see BEFORE the outcome entry
   * what was about to be deleted, under which key, and whether it was
   * a preview.
   */
  tier?: "destructive";
  idempotency_key?: string;
  dry_run?: boolean;
}

export interface McpAuditCompleteEntry {
  ts: string;
  call_id: string;
  phase: "complete";
  session: string;
  tool: string;
  args_hash: string;
  args?: unknown;
  ok: boolean;
  duration_ms: number;
  validation_status: "pass" | "fail" | "n/a";
  error_category?: string;
  error_reason?: string;
  /** §8.7: the result was replayed from the idempotency cache; no handler ran. */
  replayed?: boolean;
  /** §8.7: a dry-run preview; nothing was appended. */
  dry_run?: boolean;
  /**
   * §9.5: distinct rule_ids the §7 pipeline fired on a Tier-2 rejection
   * (validation_status "fail", no error_category). The audit report
   * turns these into `rule:<id>` error classes.
   */
  rule_ids?: string[];
}

/**
 * Reload entry — emitted by `fdpm-mcp` when the platform reload signal
 * (SIGHUP on macOS/Linux, SIGBREAK on Windows) triggers `Host.reload()`.
 * Allows post-incident reviewers to correlate a gap
 * in tool calls with the operator-driven freshness reset, and to see
 * how many workbooks were live at the moment of the reload.
 */
export interface McpAuditReloadEntry {
  ts: string;
  phase: "reload";
  reloaded_at: number;
  project_count: number;
  outcome: "ok" | "host_compat" | "internal";
  error_message?: string;
}

export type McpAuditEntry =
  | McpAuditStartEntry
  | McpAuditCompleteEntry
  | McpAuditReloadEntry;

export class McpAuditLog {
  readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "mcp-audit.jsonl");
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /**
   * Write one audit entry. Failures are logged to stderr but never
   * thrown — see module header for rationale.
   */
  write(entry: McpAuditEntry): void {
    try {
      appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`fdpm-mcp: audit log write failed: ${msg}\n`);
    }
  }
}

/**
 * Stable hash for args. Canonicalises object key order so semantically
 * identical args always hash to the same value (replay-detection
 * usefulness depends on this).
 */
export function hashArgs(args: unknown): string {
  return createHash("sha256")
    .update(canonicalStringify(args), "utf8")
    .digest("hex");
}

function canonicalStringify(v: unknown): string {
  if (v === undefined) return "null";
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const keys = Object.keys(val as Record<string, unknown>).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = (val as Record<string, unknown>)[k];
      return out;
    }
    return val;
  });
}
