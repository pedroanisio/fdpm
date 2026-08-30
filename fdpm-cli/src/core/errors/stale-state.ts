/**
 * SPEC-REPL §11 + SPEC-MCP-SERVER §12 — staleness conflict envelope.
 *
 * The REPL's pre-dispatch freshness gate refuses write-capable
 * commands when a workbook's JSONL log mtime/size has changed since
 * the Host last loaded it (default strict mode). Same shape is used
 * by SPEC-MCP-SERVER when serving multiple concurrent sessions
 * against one data dir.
 *
 * The two surfaces produce different operator-facing advice — the
 * REPL says ":reload or restart", while MCP names SIGHUP on POSIX and
 * SIGBREAK / restart on Windows — so the advice is a constructor parameter rather than
 * a hardcoded string. This is the single helper both call so they
 * can't diverge on category, evidence shape, or message phrasing.
 */
import { FDPMException } from "./fdpm-exception.js";

export interface StaleStateOptions {
  /** Workbook whose log has been mutated by another writer. */
  workbook_id: string;
  /**
   * Surface-specific recovery hint surfaced to the operator (and to
   * any LLM agent driving the REPL). Examples:
   *   - REPL strict mode: "run :reload or restart the REPL"
   *   - MCP server: SIGHUP on POSIX; Ctrl+Break / SIGBREAK on Windows
   */
  advice: string;
  /**
   * Optional structured detail about what changed — included in the
   * envelope's evidence so log scrapers can group by reason.
   */
  detail?: {
    cached_mtime_ns?: string;
    cached_size?: string;
    observed_mtime_ns?: string;
    observed_size?: string;
  };
}

export function staleStateException(opts: StaleStateOptions): FDPMException {
  return new FDPMException(
    "permission",
    `stale state for workbook ${opts.workbook_id}`,
    {
      evidence: {
        reason: "stale_state",
        workbook_id: opts.workbook_id,
        advice: opts.advice,
        ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
      },
    },
  );
}
