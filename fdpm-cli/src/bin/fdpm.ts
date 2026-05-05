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
import { resolveOneShotCliRuntimeOptions } from "./runtime-options.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

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

  const runtime = resolveOneShotCliRuntimeOptions(argv);
  if (runtime.logLevelOverride !== undefined) {
    process.env["FDPM_LOG_LEVEL"] = runtime.logLevelOverride;
  }

  const host = new Host({
    ...(runtime.dataDir != null && { dataDir: runtime.dataDir }),
    ...(runtime.persist === false && { dataDir: null }),
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
