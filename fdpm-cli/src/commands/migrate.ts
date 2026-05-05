import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";

/**
 * `fdpm migrate` — explicit, opt-in data migrations.
 *
 * Each migration is a pure rewrite of the persisted projection: it
 * appears in the operation log as a normal sequence of replace ops
 * (so `log undo` can revert them) and is therefore auditable and
 * reversible. Migrations never mutate state implicitly on import;
 * the operator must run them.
 */
export function buildMigrateCommand(host: Host): Command {
  const cmd = new Command("migrate");
  cmd.description("Data migrations (opt-in, auditable, reversible via log undo)");

  cmd
    .command("normalize-metadata")
    .argument("<workbook>", "workbook id")
    .description(
      "Lift legacy `field_values._metadata.*` keys onto top-level field_values for every relation",
    )
    .option("--dry-run", "report what would be normalised without writing")
    .option("--json", "emit JSON")
    .action(async (workbook: string, opts: { dryRun?: boolean; json?: boolean }) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await host.migrateNormalizeMetadata(workbook, {
        dryRun: opts.dryRun === true,
      });
      emit(ctx, result, () => {
        const lines: string[] = [];
        lines.push(
          `${result.workbook_id}\tinspected=${result.inspected}\tnormalised=${result.normalised.length}\tskipped=${result.skipped.length}\terrors=${result.errors.length}${result.dry_run ? "\t(dry-run)" : ""}`,
        );
        for (const id of result.normalised) lines.push(`  ~ ${id}`);
        for (const e of result.errors) lines.push(`  ! ${e.id}\t${e.message}`);
        return lines.join("\n");
      });
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "migrate normalize-metadata": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
