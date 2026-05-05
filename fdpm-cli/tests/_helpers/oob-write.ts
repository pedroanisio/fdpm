/**
 * Out-of-band write helpers for SPEC-REPL §10.2 freshness tests and
 * SPEC-MCP-SERVER staleness tests.
 *
 * These functions simulate what a second process would do to a
 * project's JSONL log on disk: append a new op, truncate the log,
 * or rewrite a prefix. Test fixtures use them to exercise the
 * lenient tail-replay path (`Host.reloadProjectTail`) and the
 * strict refusal path (`staleStateException`).
 *
 * Shared between the REPL test suite and the MCP test suite so the
 * two surfaces can't diverge on what "out-of-band write" means.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function logPath(dataDir: string, project_id: string): string {
  return join(dataDir, "projects", project_id, "log.jsonl");
}

/**
 * Append a single raw JSONL op line to a project's log without going
 * through the Host. Mimics what a second `fdpm` process invocation
 * would produce. The `op` argument is serialized verbatim (no
 * validation) — caller's responsibility to construct a well-formed
 * Operation envelope.
 */
export function appendRawOp(
  dataDir: string,
  project_id: string,
  op: Record<string, unknown>,
): void {
  const path = logPath(dataDir, project_id);
  const dir = join(dataDir, "projects", project_id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(op) + "\n", "utf8");
}

/**
 * Truncate a project's log to the first N lines (ops). Used to test
 * `Host.reloadProjectTail`'s `host_compat` rejection of shrinking
 * logs (which would otherwise indicate a backup restore or a wrong
 * file copied into place).
 */
export function truncateLogToOps(
  dataDir: string,
  project_id: string,
  keepFirstN: number,
): void {
  const path = logPath(dataDir, project_id);
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.length > 0);
  const kept = lines.slice(0, keepFirstN).join("\n") + (keepFirstN > 0 ? "\n" : "");
  writeFileSync(path, kept, "utf8");
}

/**
 * Replace the first op in a project's log with a different op (same
 * length is fine; content differs). Used to test
 * `Host.reloadProjectTail`'s `host_compat` rejection of rewritten
 * prefixes (which would otherwise indicate the project's log was
 * replaced wholesale).
 */
export function rewriteFirstOp(
  dataDir: string,
  project_id: string,
  newFirstOp: Record<string, unknown>,
): void {
  const path = logPath(dataDir, project_id);
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error(`rewriteFirstOp: ${path} is empty`);
  }
  lines[0] = JSON.stringify(newFirstOp);
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}
