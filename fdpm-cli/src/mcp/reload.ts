/**
 * Operator-triggered reload (SIGHUP on POSIX, SIGBREAK on Windows):
 * swap the live Host and tell connected clients that the server's
 * live-computed lists changed.
 *
 * `resources/list` and `prompts/list` are answered from the live Host on
 * every request, so a workbook (or plugin prompt) that appeared on disk
 * after a client connected becomes enumerable the instant
 * `Host.reload()` returns. MCP clients cache both lists and re-fetch
 * only on `notifications/{resources,prompts}/list_changed`; without
 * those notifications the new workbook is readable by URI but missing
 * from the client's list.
 *
 * `tools/list` is deliberately not notified: the advertised tool array
 * is frozen at boot — it is the very array the catalog budget was
 * measured against — so a reload cannot change it.
 *
 * Failure contract: `Host.reload()` either swaps wholesale or leaves the
 * previous Host intact. When it rejects, the client's cached lists still
 * describe what the server serves, so nothing is invalidated and the
 * freshness map is left alone; the outcome is recorded in the MCP audit
 * log and the server keeps serving the pre-reload state.
 */
import { FDPMException } from "../core/errors/fdpm-exception.js";
import type { McpAuditReloadEntry } from "../persistence/mcp-audit-log.js";

/** Outcome of one reload attempt; mirrors the audit log's `outcome`. */
export type ReloadOutcome = "ok" | "host_compat" | "internal";

/** Signals operators can use to reload the long-running MCP process. */
export type ReloadSignal = "SIGHUP" | "SIGBREAK";

/** Recovery text shared by MCP instructions and stale-state envelopes. */
export const MCP_RELOAD_ADVICE =
  "operator must send SIGHUP on macOS/Linux or press Ctrl+Break (SIGBREAK) on Windows; restart fdpm-mcp if no console is attached";

/** Select the reload event Node can receive without terminating on the host OS. */
export function reloadSignalForPlatform(platform: NodeJS.Platform): ReloadSignal {
  return platform === "win32" ? "SIGBREAK" : "SIGHUP";
}

/** The Host surface a reload touches (structural: the real Host satisfies it). */
export interface ReloadableHost {
  reload(): Promise<{ reloadedAt: number; workbooks: readonly string[] }>;
  listProjects(): readonly unknown[];
}

/** The MCP Server surface a reload touches. */
export interface ListChangedNotifier {
  sendResourceListChanged(): Promise<void>;
  sendPromptListChanged(): Promise<void>;
}

/** The session surface a reload touches. */
export interface FreshnessResettable {
  clearFreshnessMap(): void;
}

/** The audit surface a reload touches (McpAuditLog satisfies it). */
export interface ReloadAuditSink {
  write(entry: McpAuditReloadEntry): void;
}

export interface ReloadDeps {
  host: ReloadableHost;
  audit: ReloadAuditSink;
  session: FreshnessResettable;
  notifier: ListChangedNotifier;
  /** Signal that triggered this attempt; defaults to the native platform signal. */
  signal?: ReloadSignal;
  /** Operator log sink; defaults to stderr (stdout carries JSON-RPC). */
  log?: (line: string) => void;
}

export async function handleReload(deps: ReloadDeps): Promise<ReloadOutcome> {
  const { host, audit, session, notifier } = deps;
  const log = deps.log ?? ((line: string): void => void process.stderr.write(line));
  const signal = deps.signal ?? reloadSignalForPlatform(process.platform);

  log(`fdpm-mcp: ${signal} received — invoking host.reload()\n`);
  let result: { reloadedAt: number; workbooks: readonly string[] };
  try {
    result = await host.reload();
  } catch (err) {
    const compat = err instanceof FDPMException && err.category === "host_compat";
    const outcome: ReloadOutcome = compat ? "host_compat" : "internal";
    const message = err instanceof Error ? err.message : String(err);
    log(`fdpm-mcp: reload failed (${outcome}): ${message}\n`);
    audit.write({
      ts: new Date().toISOString(),
      phase: "reload",
      reloaded_at: Date.now(),
      project_count: host.listProjects().length,
      outcome,
      error_message: message,
    });
    // Pre-reload Host stays intact per Host.reload's contract: the
    // client's cached lists are still accurate, so no notification and
    // no freshness reset.
    return outcome;
  }

  log(`fdpm-mcp: reloaded at ${result.reloadedAt}, ${result.workbooks.length} workbooks\n`);
  session.clearFreshnessMap();
  audit.write({
    ts: new Date().toISOString(),
    phase: "reload",
    reloaded_at: result.reloadedAt,
    project_count: result.workbooks.length,
    outcome: "ok",
  });

  // The reload has already happened; a client that never hears about it
  // keeps a stale list, but losing the hint must not take the server
  // down (the transport may have closed mid-reload).
  await notify(notifier.sendResourceListChanged(), "resources/list_changed", log);
  await notify(notifier.sendPromptListChanged(), "prompts/list_changed", log);
  return "ok";
}

async function notify(
  sent: Promise<void>,
  label: string,
  log: (line: string) => void,
): Promise<void> {
  try {
    await sent;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`fdpm-mcp: could not send ${label} (client list may be stale): ${message}\n`);
  }
}
