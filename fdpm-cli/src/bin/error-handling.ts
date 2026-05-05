/**
 * Centralised error formatting for the `fdpm` binary surfaces.
 *
 * Two callers exist:
 *
 *   1. `fdpm.ts` (one-shot CLI): wraps `formatError` with `process.exit`
 *      via `handleError`. A failure ends the process.
 *
 *   2. `commands/repl.ts` (long-lived REPL, per SPEC-REPL §11.2): calls
 *      `formatError` directly. A failure prints to stderr and the loop
 *      returns to the prompt — no `process.exit`. The REPL still uses
 *      the returned exit code to compute the session-end summary in
 *      scripted mode (SPEC-REPL §9, §11.2).
 *
 * The `wantsJson` flag is bound at call time rather than read from
 * `process.argv` so the REPL can flip it per-session via its
 * `:json on|off` meta-command (SPEC-REPL §8.5).
 */

import {
  EXIT_CODE_FOR_CATEGORY,
  FDPMException,
} from "../core/errors/fdpm-exception.js";
import { isVerbose, renderHumanError } from "../core/diagnostics/error-render.js";

export interface FormattedError {
  /** Text to write to stderr (already includes a trailing newline). */
  readonly stderr: string;
  /** Exit code per the FDPMException category enum, or `internal` for unknowns. */
  readonly exitCode: number;
  /** Echo of the recognised category, useful for the REPL's session summary. */
  readonly category: string;
}

export function formatError(
  err: unknown,
  opts: { wantsJson: boolean; verbose?: boolean },
): FormattedError {
  const verbose = opts.verbose ?? isVerbose();
  if (err instanceof FDPMException) {
    const text = opts.wantsJson
      ? JSON.stringify({ error: err.toEnvelope() }, null, 2) + "\n"
      : renderHumanError(err, { verbose }) + "\n";
    return {
      stderr: text,
      exitCode: EXIT_CODE_FOR_CATEGORY[err.category],
      category: err.category,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (opts.wantsJson) {
    return {
      stderr:
        JSON.stringify({ error: { category: "internal", message } }, null, 2) +
        "\n",
      exitCode: EXIT_CODE_FOR_CATEGORY.internal,
      category: "internal",
    };
  }
  let text = `error: [internal] ${message}\n`;
  if (err instanceof Error && err.stack) text += err.stack + "\n";
  return {
    stderr: text,
    exitCode: EXIT_CODE_FOR_CATEGORY.internal,
    category: "internal",
  };
}

/**
 * One-shot CLI entry: write the formatted error to stderr and exit
 * with the matching code. Never returns. Used by `fdpm.ts`'s try/catch
 * around `program.parseAsync` and by the top-level `.catch()` on
 * `main()`.
 */
export function handleError(err: unknown): never {
  const formatted = formatError(err, {
    wantsJson: process.argv.includes("--json"),
  });
  process.stderr.write(formatted.stderr);
  process.exit(formatted.exitCode);
}
