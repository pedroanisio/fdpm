#!/usr/bin/env node
import { Command } from "commander";
import { Host } from "../core/host.js";
import { buildProfileCommand } from "../commands/profile.js";
import { buildProjectCommand } from "../commands/project.js";
import { buildPrimitiveCommand } from "../commands/primitive.js";
import { buildRelationCommand } from "../commands/relation.js";
import { buildStructureCommand } from "../commands/structure.js";
import { buildEditCommand } from "../commands/edit.js";
import { buildTemplateCommand } from "../commands/template.js";
import { buildTestSuiteCommand } from "../commands/test-suite.js";
import { buildTransferCommand } from "../commands/transfer.js";
import { buildLogCommand } from "../commands/log.js";
import { buildHealthCommand, buildVersionCommand } from "../commands/health.js";
import { buildPluginCommand } from "../commands/plugin.js";
import { buildRenderCommand } from "../commands/render.js";
import { buildValidateCommand } from "../commands/validate.js";
import { buildDiffCommand } from "../commands/diff.js";
import { buildMigrateCommand } from "../commands/migrate.js";
import { buildDnisCommand } from "../commands/dnis.js";
import {
  buildCompletionsCommand,
  renderRootAfterHelp,
  renderRootOnboarding,
} from "../commands/completions.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { renderEnvVarHelpLines } from "../core/config/env.js";
import { handleError } from "./error-handling.js";

async function main(): Promise<void> {
  const program = new Command("fdpm");
  program
    .description(
      [
        "FDPM — full CLI implementation of SPEC-CORE v1.2",
        "",
        "Environment variables:",
        ...renderEnvVarHelpLines(),
        "  note: --json auto-sets FDPM_LOG_LEVEL=warn unless explicitly overridden",
      ].join("\n"),
    )
    .addHelpText("after", renderRootAfterHelp())
    .version(HOST_VERSION)
    .option("--data-dir <path>", "override FDPM_DATA_DIR")
    .option("--no-persist", "run in-memory only, no JSONL log on disk")
    .enablePositionalOptions();

  // We need the parsed flags before constructing Host (for --data-dir and
  // --no-persist). Pre-parse top-level flags by inspecting argv.
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

  program.addCommand(buildVersionCommand());
  program.addCommand(buildHealthCommand(host));
  program.addCommand(buildProfileCommand(host));
  program.addCommand(buildProjectCommand(host));
  program.addCommand(buildPrimitiveCommand(host));
  program.addCommand(buildRelationCommand(host));
  program.addCommand(buildStructureCommand(host));
  program.addCommand(buildEditCommand(host));
  program.addCommand(buildTemplateCommand(host));
  program.addCommand(buildTestSuiteCommand(host));
  program.addCommand(buildTransferCommand(host));
  program.addCommand(buildLogCommand(host));
  program.addCommand(buildPluginCommand(host));
  program.addCommand(buildRenderCommand(host));
  program.addCommand(buildValidateCommand(host));
  program.addCommand(buildDiffCommand(host));
  program.addCommand(buildMigrateCommand(host));
  program.addCommand(buildDnisCommand(host));

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    handleError(err);
  }
}

main().catch(handleError);
