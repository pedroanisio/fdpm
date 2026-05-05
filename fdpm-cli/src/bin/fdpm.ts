#!/usr/bin/env node
import { Command } from "commander";
import { Host } from "../core/host.js";
import {
  buildCompletionsCommand,
  renderRootOnboarding,
} from "../commands/completions.js";
import { buildReplCommand } from "../commands/repl.js";
import { buildProgram } from "./program.js";
import { handleError } from "./error-handling.js";

async function main(): Promise<void> {
  // We need the parsed flags before constructing Host (for --data-dir
  // and --no-persist). Pre-parse top-level flags by inspecting argv.
  const argv = process.argv.slice(2);
  const persistIdx = argv.indexOf("--no-persist");
  const dataDirIdx = argv.indexOf("--data-dir");
  const persist = persistIdx === -1;
  const dataDir =
    dataDirIdx >= 0 && argv[dataDirIdx + 1] != null ? argv[dataDirIdx + 1] : undefined;

  if (argv.length === 0) {
    process.stdout.write(renderRootOnboarding() + "\n");
    return;
  }

  if (argv[0] === "completions") {
    // Completions doesn't need a Host; render the static script and exit.
    const program = new Command("fdpm");
    program.addCommand(buildCompletionsCommand());
    await program.parseAsync(process.argv);
    return;
  }

  // §6.6 plugin-logger ergonomics: when the user requested machine-readable
  // output via --json, default plugin logging to `warn` so activation banners
  // don't trail behind / interleave with the JSON. Explicit FDPM_LOG_LEVEL
  // wins. Apply BEFORE Host construction (which triggers plugin activation
  // and the very banners we want to suppress).
  if (argv.includes("--json") && process.env["FDPM_LOG_LEVEL"] === undefined) {
    process.env["FDPM_LOG_LEVEL"] = "warn";
  }

  const host = new Host({
    ...(dataDir != null && { dataDir }),
    ...(persist === false && { dataDir: null }),
  });
  await host.load();

  const program = buildProgram(host);
  // The REPL is wired here (not in buildProgram) because it depends
  // on buildProgram itself — the read loop reuses the same program
  // tree per input line.
  program.addCommand(buildReplCommand(host));

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    handleError(err);
  }
}

main().catch(handleError);
