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
import { resolveWorkspaceDataDir } from "../core/workspace/resolve.js";
import { loadDotenv } from "../core/config/dotenv.js";

async function main(): Promise<void> {
  // Configuration first: every resolution below reads `process.env`. An
  // exported shell variable still wins over the file, so a one-off
  // `FDPM_DATA_DIR=… fdpm …` behaves as it always did.
  loadDotenv();

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

  // SPEC-WORKSPACE §8.3 precedence: --data-dir > FDPM_DATA_DIR
  // > FDPM_WORKSPACE > registry.current > default. `--no-persist`
  // short-circuits to the no-persistence Host construction path.
  let resolvedDataDir: string | undefined;
  if (runtime.persist !== false) {
    const resolved = await resolveWorkspaceDataDir({ cliDataDir: runtime.dataDir });
    if (resolved.dataDir !== null) resolvedDataDir = resolved.dataDir;
  }

  const host = new Host({
    ...(resolvedDataDir != null && { dataDir: resolvedDataDir }),
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
