import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";

/**
 * `fdpm diff <workbook>` — structural diff across two snapshots.
 *
 * Two modes:
 *   1. Time-travel: --from-revision <N> [--to-revision <M>] compares
 *      revisions of the same workbook.
 *   2. Cross-workbook: --from-workbook <id> [--to-workbook <id>] compares
 *      two distinct workbooks (whichever shares the same profile).
 *
 * Output: per-collection (primitives, relations) lists of added,
 * removed, and modified IDs. Modified entries also list the top-level
 * field paths whose values differ. No deep field-by-field diff yet —
 * that's a follow-up if the workflow demands it.
 */
export function buildDiffCommand(host: Host): Command {
  const cmd = new Command("diff");
  cmd
    .description("Structural diff between two snapshots of a workbook (time-travel or cross-workbook)")
    .argument("<workbook>", "workbook id (target of the diff; also the default for both sides)")
    .option("--from-revision <n>", "left side: this workbook at revision N")
    .option("--from-workbook <id>", "left side: another workbook's current state")
    .option("--to-revision <n>", "right side: this workbook at revision N (defaults to current)")
    .option("--to-workbook <id>", "right side: another workbook's current state")
    .option(
      "--detail",
      "include before/after values for each modified field (verbose)",
    )
    .option("--json", "emit JSON")
    .action(
      (
        workbookId: string,
        opts: {
          fromRevision?: string;
          fromProject?: string;
          toRevision?: string;
          toProject?: string;
          detail?: boolean;
          json?: boolean;
        },
      ) => {
        const ctx: OutputContext = { json: !!opts.json };

        const fromCount = (opts.fromRevision != null ? 1 : 0) + (opts.fromProject != null ? 1 : 0);
        const toCount = (opts.toRevision != null ? 1 : 0) + (opts.toProject != null ? 1 : 0);
        if (fromCount === 0)
          throw new FDPMException(
            "verification",
            "diff requires --from-revision or --from-workbook",
          );
        if (fromCount > 1 || toCount > 1)
          throw new FDPMException(
            "verification",
            "specify only one of --from-revision / --from-workbook (and likewise for --to)",
          );

        const from = opts.fromRevision != null
          ? { revision: parseInt(opts.fromRevision, 10) }
          : { workbook_id: opts.fromProject! };
        const to = opts.toRevision != null
          ? { revision: parseInt(opts.toRevision, 10) }
          : opts.toProject != null
            ? { workbook_id: opts.toProject }
            : undefined;

        const result = host.diffProject({
          workbook_id: workbookId,
          from,
          ...(to !== undefined && { to }),
          ...(opts.detail === true && { detail: true }),
        });

        emit(ctx, result, () => {
          const lines: string[] = [];
          lines.push(
            `${result.from.workbook_id}@${result.from.revision} → ${result.to.workbook_id}@${result.to.revision}`,
          );
          const renderModified = (
            m: {
              id: string;
              changed_fields: string[];
              before?: Record<string, unknown>;
              after?: Record<string, unknown>;
            },
          ): string => {
            if (opts.detail !== true || m.before === undefined || m.after === undefined)
              return `  ~ ${m.id}\t${m.changed_fields.join(",")}`;
            const detailLines = [`  ~ ${m.id}`];
            for (const f of m.changed_fields) {
              detailLines.push(
                `      ${f}: ${JSON.stringify(m.before[f])} -> ${JSON.stringify(m.after[f])}`,
              );
            }
            return detailLines.join("\n");
          };
          lines.push(`primitives: +${result.primitives.added.length} -${result.primitives.removed.length} ~${result.primitives.modified.length}`);
          for (const id of result.primitives.added) lines.push(`  + ${id}`);
          for (const id of result.primitives.removed) lines.push(`  - ${id}`);
          for (const m of result.primitives.modified) lines.push(renderModified(m));
          lines.push(`relations: +${result.relations.added.length} -${result.relations.removed.length} ~${result.relations.modified.length}`);
          for (const id of result.relations.added) lines.push(`  + ${id}`);
          for (const id of result.relations.removed) lines.push(`  - ${id}`);
          for (const m of result.relations.modified) lines.push(renderModified(m));
          return lines.join("\n");
        });
      },
    );
  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  diff: {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(1),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
