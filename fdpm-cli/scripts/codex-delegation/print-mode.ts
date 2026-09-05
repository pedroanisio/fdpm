/**
 * Print one cdel:DelegationMode as JSON, for the wrapper and for review.
 *
 * The wrapper reads the mode's return schema and sandbox tier from here so
 * that the shell script, the fdpm workbook and the operator guide all quote
 * the same object rather than three copies of it.
 *
 *   npx tsx fdpm-cli/scripts/codex-delegation/print-mode.ts research
 *   npx tsx fdpm-cli/scripts/codex-delegation/print-mode.ts patch --schema
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MODES } from "./seed.js";

export function printMode(argv: string[]): number {
  const name = argv.find((a) => !a.startsWith("--"));
  const mode = MODES.find((m) => m.mode_name === name);
  if (!mode) {
    process.stderr.write(`unknown mode ${JSON.stringify(name)}; expected one of ${MODES.map((m) => m.mode_name).join("|")}\n`);
    return 2;
  }
  const payload = argv.includes("--schema") ? mode.schema : mode;
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = printMode(process.argv.slice(2));
}
