import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, renderTable, type OutputContext } from "./util.js";
import { isValidProjectId } from "../core/identity/id-rules.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { splitProject, cloneProject, rebuildFromLog } from "../core/host-extra.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  idFlagArgv,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
  projectFromJsonField,
} from "./metadata.js";
import { previewWorkbookDelete } from "../core/operations/delete-preview.js";

function renderProjectGetHuman(
  slice: {
    workbook: {
      id: string;
      name: string;
      profile_id: string;
      revision: number;
      description?: string;
    };
  },
  counts: { primitives: number; relations: number; templates: number; test_suites: number },
): string {
  const lines = [
    `Workbook: ${slice.workbook.id}`,
    `Name: ${slice.workbook.name}`,
    `Profile: ${slice.workbook.profile_id}`,
    `Revision: ${slice.workbook.revision}`,
    ...(slice.workbook.description ? [`Description: ${slice.workbook.description}`] : []),
    "",
    "Counts:",
    `  Primitives: ${counts.primitives}`,
    `  Relations: ${counts.relations}`,
    `  Templates: ${counts.templates}`,
    `  Test suites: ${counts.test_suites}`,
  ];
  return lines.join("\n");
}

function renderProjectListHuman(
  workbooks: readonly {
    id: string;
    profile_label: string;
    profile_version: string;
    revision: number;
    name: string;
  }[],
): string {
  return renderTable(workbooks, [
    { header: "WORKBOOK ID", value: (p) => p.id },
    { header: "PROFILE", value: (p) => p.profile_label },
    { header: "PROFILE VER", value: (p) => p.profile_version },
    { header: "REV", value: (p) => p.revision, align: "right" },
    { header: "NAME", value: (p) => p.name },
  ], { empty: "(no workbooks)" });
}

function splitCanonicalProfileId(profileId: string): { labelSlug: string; version: string } {
  const parts = profileId.split(":");
  if (parts.length >= 3 && parts[0] === "profile") {
    return {
      labelSlug: parts.slice(1, -1).join(":"),
      version: parts.at(-1) ?? "",
    };
  }
  return { labelSlug: profileId, version: "" };
}

function humanizeProfileSlug(slug: string): string {
  return slug
    .split(":")
    .map((segment) =>
      segment
        .split("-")
        .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
        .join(" "),
    )
    .join(" / ");
}

export function buildProjectCommand(host: Host): Command {
  const cmd = new Command("workbook");
  cmd.description("Workbook lifecycle — create, list, get, delete, split, clone");

  cmd
    .command("create")
    .description("Create a workbook (§9.1 POST /workbooks)")
    .requiredOption("--id <id>", "workbook id (slug)")
    .requiredOption("--name <name>", "workbook name")
    .requiredOption("--profile <profile_id>", "registered profile id")
    .option("--description <text>", "workbook description")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (!isValidProjectId(opts.id))
        throw new FDPMException("verification", `invalid workbook id: ${opts.id}`);
      const result = await host.createProject({
        workbook_id: opts.id,
        name: opts.name,
        profile_id: opts.profile,
        ...(opts.description != null && { description: opts.description }),
      });
      emit(ctx, { workbook_id: opts.id, revision: result.project_revision, op_id: result.op.op_id }, () =>
        `created ${opts.id} (rev ${result.project_revision})`,
      );
    });

  cmd
    .command("list")
    .description("List workbooks (§9.1 GET /workbooks)")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const workbooks = host.listProjects();
      const rows = workbooks.map((workbook) => {
        const profile = host.profiles.getResolved(workbook.profile_id);
        const canonical = splitCanonicalProfileId(workbook.profile_id);
        return {
          id: workbook.id,
          profile_label: profile.label ?? profile.name ?? humanizeProfileSlug(canonical.labelSlug),
          profile_version: canonical.version,
          revision: workbook.revision,
          name: workbook.name,
        };
      });
      emit(ctx, { workbooks }, () => renderProjectListHuman(rows));
    });

  cmd
    .command("get")
    .argument("<id>", "workbook id")
    .description("Workbook metadata + embedded primitives/relations (§9.1 GET /workbooks/{id})")
    .option("--at <revision>", "time-travel: state as of revision N (§9.8.2)")
    .option("--json", "emit JSON")
    .action((id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = opts.at !== undefined
        ? host.store.getProjectAt(id, parseInt(String(opts.at), 10))
        : host.getProject(id);
      const counts = {
        primitives: Object.keys(slice.primitives).length,
        relations: Object.keys(slice.relations).length,
        templates: Object.keys(slice.templates).length,
        test_suites: Object.keys(slice.test_suites).length,
      };
      emit(ctx, { ...slice, counts }, () => renderProjectGetHuman(slice, counts));
    });

  cmd
    .command("delete")
    .argument("<id>", "workbook id")
    .description("Delete a workbook (§9.1 DELETE /workbooks/{id})")
    .option("--dry-run", "preview what would be removed; append nothing")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (opts.dryRun) {
        const would_affect = previewWorkbookDelete(host, id);
        emit(
          ctx,
          { workbook_id: id, dry_run: true, would_affect },
          () =>
            `dry-run: would delete ${id} (${would_affect.primitive_count} primitive(s), ${would_affect.relation_count} relation(s), revision ${would_affect.revision})`,
        );
        return;
      }
      const result = await host.deleteProject(id);
      emit(ctx, { workbook_id: id, op_id: result.op.op_id, deleted: true }, () => `deleted ${id}`);
    });

  cmd
    .command("split")
    .argument("<id>", "source workbook id")
    .description("Split a workbook along a Section partition (§5.4.1 :split)")
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as Parameters<typeof splitProject>[2];
      const result = await splitProject(host, id, body);
      emit(ctx, result, () =>
        `split ${id} into ${result.project_ids.join(", ")}; dropped ${result.dropped_relations.length} relations`,
      );
    });

  cmd
    .command("clone")
    .argument("<id>", "source workbook id")
    .description("Deep-copy a workbook (§5.4.2 :clone)")
    .requiredOption("--name <name>", "target workbook name")
    .option("--target-id <id>", "target workbook id")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await cloneProject(host, id, {
        target_workbook_name: opts.name,
        ...(opts.targetId != null && { target_workbook_id: opts.targetId }),
      });
      emit(ctx, result, () =>
        `cloned ${id} -> ${result.workbook_id} (${result.primitives_copied} primitives, ${result.relations_copied} relations)`,
      );
    });

  cmd
    .command("rebuild-from-log")
    .argument("<id>", "workbook id")
    .description("Operator-only: discard projection, replay from log (§5.5.5, §6.5)")
    .option("--json", "emit JSON")
    .action(async (id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await rebuildFromLog(host, id);
      emit(ctx, { workbook_id: id, ...result, rebuilt: true }, () =>
        `rebuilt ${id} from log (rev ${result.revision})`,
      );
    });

  return cmd;
}

const PROJECT_ID_DEPTH_2 = firstPositionalAfter(2);
const PROJECT_JSON_FIELD = projectFromJsonField("id", "workbook_id", "workbook");

export const commandMetadata: CommandMetadataMap = {
  // The new workbook's id arrives via --id; the freshness check has
  // nothing to stat (the log doesn't exist yet), so this is also
  // effectively a no-op stat.
  "workbook create": {
    readOnly: false,
    projectIdsFromArgv: idFlagArgv(),
    projectIdsFromJson: PROJECT_JSON_FIELD,
  },
  "workbook list": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workbook get":              { readOnly: true,  projectIdsFromArgv: PROJECT_ID_DEPTH_2, projectIdsFromJson: PROJECT_JSON_FIELD },
  "workbook delete":           { readOnly: false, projectIdsFromArgv: PROJECT_ID_DEPTH_2, projectIdsFromJson: PROJECT_JSON_FIELD },
  "workbook split":            { readOnly: false, projectIdsFromArgv: PROJECT_ID_DEPTH_2, projectIdsFromJson: PROJECT_JSON_FIELD },
  "workbook clone":            { readOnly: false, projectIdsFromArgv: PROJECT_ID_DEPTH_2, projectIdsFromJson: PROJECT_JSON_FIELD },
  "workbook rebuild-from-log": { readOnly: false, projectIdsFromArgv: PROJECT_ID_DEPTH_2, projectIdsFromJson: PROJECT_JSON_FIELD },
};

export { renderProjectGetHuman, renderProjectListHuman, splitCanonicalProfileId, humanizeProfileSlug };
