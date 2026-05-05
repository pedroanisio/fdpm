/**
 * Program builder shared between the one-shot CLI (`fdpm.ts`) and the
 * SPEC-REPL §8.3 read loop (`commands/repl.ts`).
 *
 * `buildProgram(host, opts)` returns a fresh Commander root with every
 * top-level subcommand wired against the supplied Host. Two callers:
 *
 *   - One-shot CLI: builds it once at startup, calls
 *     `program.parseAsync(process.argv)`, exits.
 *   - REPL: builds a fresh program per input line, calls
 *     `program.parseAsync(tokens, { from: 'user' })` so parse errors
 *     stay scoped to one line. The REPL passes
 *     `{exitOverride: true}` so a parse error on one line doesn't
 *     terminate the process.
 *
 * The program shape (description, top-level options, subcommand set)
 * MUST stay identical across the two surfaces — that's the SPEC-REPL
 * Principle 3 ("reuse the Commander tree verbatim"). Adding a new
 * top-level subcommand requires editing exactly one site (here).
 */
import { Command } from "commander";
import type { Host } from "../core/host.js";
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
import { renderRootAfterHelp } from "../commands/completions.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { renderEnvVarHelpLines } from "../core/config/env.js";

export interface BuildProgramOptions {
  /**
   * REPL-mode flag: when true, the returned Commander program has
   * `exitOverride()` set so per-line parse errors throw a
   * `CommanderError` instead of calling `process.exit`. The REPL's
   * read loop catches the throw and returns to the prompt.
   *
   * One-shot CLI passes false (or omits) so help/version display
   * exits cleanly.
   */
  exitOverride?: boolean;
  /**
   * REPL-mode write redirector: when supplied, Commander's stdout
   * (help text, version line, parse-error preamble) is routed through
   * `writeOut` instead of process.stdout. This is how the REPL keeps
   * the `--json` output stream pure: human-readable Commander output
   * goes to stderr, machine output stays on stdout.
   */
  writeOut?: (text: string) => void;
  writeErr?: (text: string) => void;
}

export function buildProgram(host: Host, opts: BuildProgramOptions = {}): Command {
  const program = new Command("fdpm");
  program
    .description(
      [
        "FDPM — full CLI implementation of SPEC-CORE v1.2",
        "",
        "Environment variables:",
        ...renderEnvVarHelpLines(),
        "  note: one-shot commands default plugin startup logs to warn; use --verbose, --quiet, or --log-level to override",
      ].join("\n"),
    )
    .addHelpText("after", renderRootAfterHelp())
    .version(HOST_VERSION)
    .option("--data-dir <path>", "override FDPM_DATA_DIR")
    .option("--no-persist", "run in-memory only, no JSONL log on disk")
    .option("--verbose", "show plugin startup info logs and expand human diagnostics")
    .option("--quiet", "suppress plugin startup logs")
    .option(
      "--log-level <level>",
      "set plugin startup log threshold: debug | info | warn | error | silent",
    )
    .enablePositionalOptions();

  if (opts.exitOverride === true) program.exitOverride();
  if (opts.writeOut !== undefined || opts.writeErr !== undefined) {
    program.configureOutput({
      ...(opts.writeOut !== undefined && { writeOut: opts.writeOut }),
      ...(opts.writeErr !== undefined && { writeErr: opts.writeErr }),
    });
  }

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

  return program;
}

/**
 * Return the list of top-level subcommand names registered on a
 * built program. Used by tab completion and `:help`.
 */
export function topLevelCommandNames(program: Command): string[] {
  return program.commands.map((c) => c.name()).sort();
}
