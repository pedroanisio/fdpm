/**
 * Host-level non-fatal diagnostics.
 *
 * These are the messages the host emits when it intentionally swallows a
 * failure rather than aborting — corrupted profile files, plugin
 * activation errors, plugin teardown failures, quarantines. They MUST
 * never throw (Principle 4 / §6.4: plugin failures never crash the host),
 * but they also MUST be visible to the operator.
 *
 * The complication is `--json` mode. The CLI's machine-readable contract
 * is "stdout is JSON; stderr is for humans". A bare `warning: ...` text
 * line on stderr violates that contract for any consumer that parses
 * stderr alongside stdout. The fix is to mirror the bin handler's
 * branch: under `--json`, emit one JSONL envelope per line; under
 * human mode, keep the existing text format.
 *
 * The helper here is the single funnel — every host-side diagnostic that
 * used to call `process.stderr.write("warning: ...")` should call
 * `emitHostWarning(...)` instead so the JSON-mode contract holds
 * uniformly.
 */

/**
 * Structured payload for a host warning. The `code` is a short stable
 * identifier so machine consumers can react to specific classes of
 * warning without parsing the human message.
 */
export interface HostWarning {
  code: string;
  message: string;
  evidence?: Record<string, unknown>;
}

/**
 * The bin handler decides JSON-vs-human by checking `process.argv` for
 * `--json`. We do the same here so the helper has no upward dependency
 * on the bin module — any caller (host, plugin runtime, future
 * subsystems) can use it without threading a flag through five layers.
 */
function wantsJson(): boolean {
  return process.argv.includes("--json");
}

/**
 * Emit a host-level non-fatal warning to stderr.
 *
 * - JSON mode: writes one JSONL line `{"warning":{...}}` so consumers
 *   that already parse stdout JSON can opt in to parsing stderr too.
 * - Human mode: writes the legacy `warning: <message>` text so existing
 *   operator workflows are unchanged.
 *
 * Always writes to stderr — stdout is reserved for command output.
 *
 * The optional `write` parameter is for tests that want to capture
 * output without spying on `process.stderr` globally; production callers
 * never pass it.
 */
export function emitHostWarning(
  warning: HostWarning,
  write: (chunk: string) => void = (s) => void process.stderr.write(s),
): void {
  if (wantsJson()) {
    write(JSON.stringify({ warning }) + "\n");
    return;
  }
  write(`warning: ${warning.message}\n`);
}
