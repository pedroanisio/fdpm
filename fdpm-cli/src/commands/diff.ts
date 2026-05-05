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
 * `fdpm diff <project>` — structural diff across two snapshots.
 *
 * Two modes:
 *   1. Time-travel: --from-revision <N> [--to-revision <M>] compares
 *      revisions of the same project.
 *   2. Cross-project: --from-project <id> [--to-project <id>] compares
 *      two distinct projects (whichever shares the same profile).
 *
 * Output: per-collection (primitives, relations) lists of added,
 * removed, and modified IDs. Modified entries also list the top-level
 * field paths whose values differ. No deep field-by-field diff yet —
 * that's a follow-up if the workflow demands it.
 */
export function buildDiffCommand(host: Host): Command {
  const cmd = new Command("diff");
  cmd
    .description("Structural diff between two snapshots of a project (time-travel or cross-project)")
    .argument("<project>", "project id (target of the diff; also the default for both sides)")
    .option("--from-revision <n>", "left side: this project at revision N")
    .option("--from-project <id>", "left side: another project's current state")
    .option("--to-revision <n>", "right side: this project at revision N (defaults to current)")
    .option("--to-project <id>", "right side: another project's current state")
    .option(
      "--detail",
      "include before/after values for each modified field (verbose)",
    )
    .option("--json", "emit JSON")
    .action(
      (
        projectId: string,
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
            "diff requires --from-revision or --from-project",
          );
        if (fromCount > 1 || toCount > 1)
          throw new FDPMException(
            "verification",
            "specify only one of --from-revision / --from-project (and likewise for --to)",
          );

        const from = opts.fromRevision != null
          ? { revision: parseInt(opts.fromRevision, 10) }
          : { project_id: opts.fromProject! };
        const to = opts.toRevision != null
          ? { revision: parseInt(opts.toRevision, 10) }
          : opts.toProject != null
            ? { project_id: opts.toProject }
            : undefined;

        const result = host.diffProject({
          project_id: projectId,
          from,
          ...(to !== undefined && { to }),
          ...(opts.detail === true && { detail: true }),
        });

        emit(ctx, result, () => {
          const lines: string[] = [];
          lines.push(
            `${result.from.project_id}@${result.from.revision} → ${result.to.project_id}@${result.to.revision}`,
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
    projectIdsFromJson: projectFromJsonField("project", "project_id"),
  },
};
