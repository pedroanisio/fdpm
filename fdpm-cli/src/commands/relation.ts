import { Command } from "commander";
import type { Host } from "../core/host.js";
import { compileRegexOrThrow, emit, parseFieldMatchArgs, readInput, renderTable, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { relationFieldPatch } from "../core/host-extra.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";
import type { JsonPatchOp } from "../core/operations/json-patch.js";
import { resolveSlug } from "./primitive.js";

export function buildRelationCommand(host: Host): Command {
  const cmd = new Command("relation");
  cmd.description("Relation CRUD + field-patch");

  cmd
    .command("list")
    .argument("<project>", "project id")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.getProject(project);
      const items = Object.values(slice.relations);
      emit(ctx, { relations: items }, () =>
        renderTable(items, [
          { header: "ID", value: (r) => r.id },
          { header: "TYPE", value: (r) => r.type_id },
          { header: "SOURCE", value: (r) => r.source_id },
          { header: "TARGET", value: (r) => r.target_id },
        ], { empty: "(no relations)" }),
      );
    });

  cmd
    .command("get")
    .argument("<project>", "project id")
    .argument("<id>", "relation id (slug, or uid with --by-uid)")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action((project, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, project, id, "relation", !!opts.byUid);
      const slice = host.getProject(project);
      const item = slice.relations[slug];
      if (!item) throw new FDPMException("not_found", `relation not found: ${slug}`);
      emit(ctx, item);
    });

  cmd
    .command("search")
    .argument("<project>", "project id")
    .description(
      "Find relations by type, id, source/target, and/or field-value match",
    )
    .option("--type <type_id>", "exact type_id match")
    .option("--id-like <substr>", "case-insensitive substring match on id")
    .option("--id-regex <pattern>", "regex match on id")
    .option("--source <id>", "exact source_id match")
    .option("--target <id>", "exact target_id match")
    .option("--match <needle...>", "field-value substring match (path=needle to scope)")
    .option("--match-regex <pattern...>", "field-value regex match (path=pattern to scope)")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const fieldMatch = parseFieldMatchArgs(opts.match, opts.matchRegex);
      const items = host.searchRelations(project, {
        ...(opts.type != null && { typeId: opts.type }),
        ...(opts.idLike != null && { idLike: opts.idLike }),
        ...(opts.idRegex != null && { idRegex: compileRegexOrThrow(opts.idRegex, "--id-regex") }),
        ...(opts.source != null && { sourceId: opts.source }),
        ...(opts.target != null && { targetId: opts.target }),
        ...(fieldMatch.length > 0 && { fieldMatch }),
      });
      emit(ctx, { count: items.length, relations: items }, () =>
        renderTable(items, [
          { header: "ID", value: (r) => r.id },
          { header: "TYPE", value: (r) => r.type_id },
          { header: "SOURCE", value: (r) => r.source_id },
          { header: "TARGET", value: (r) => r.target_id },
        ], { empty: "(no relations)" }),
      );
    });

  cmd
    .command("create")
    .argument("<project>", "project id")
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as {
        id: string;
        type_id: string;
        source_id: string;
        target_id: string;
        field_values?: Record<string, unknown>;
      };
      const result = await host.createRelation(project, body);
      emit(ctx, {
        id: body.id,
        op_id: result.append.op.op_id,
        project_revision: result.append.project_revision,
        report: result.report,
      });
    });

  cmd
    .command("replace")
    .argument("<project>", "project id")
    .argument("<id>", "relation id (slug, or uid with --by-uid)")
    .requiredOption("-f, --file <path>", "JSON body file")
    .option("--if-match <revision>", "expected revision")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (project, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, project, id, "relation", !!opts.byUid);
      const body = (await readInput(opts.file)) as {
        type_id: string;
        field_values: Record<string, unknown>;
      };
      const result = await host.replaceRelation(project, {
        id: slug,
        ...body,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
      });
      emit(ctx, result);
    });

  cmd
    .command("patch")
    .argument("<project>", "project id")
    .argument("<id>", "relation id (slug, or uid with --by-uid)")
    .description(
      "PATCH — partial update (validates only touched paths by default; --full-validate forces whole-record gating)",
    )
    .requiredOption("-f, --file <path>", "JSON body file")
    .option("--if-match <revision>", "expected revision")
    .option(
      "--full-validate",
      "validate the entire merged relation (rejects edits when other fields have pre-existing violations)",
    )
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (project, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, project, id, "relation", !!opts.byUid);
      const body = (await readInput(opts.file)) as { field_values: Record<string, unknown> };
      const result = await host.patchRelation(project, {
        id: slug,
        ...body,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
        ...(opts.fullValidate === true && { fullValidate: true }),
      });
      emit(ctx, result);
    });

  cmd
    .command("delete")
    .argument("<project>", "project id")
    .argument("<id>", "relation id (slug, or uid with --by-uid)")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (project, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, project, id, "relation", !!opts.byUid);
      const result = await host.deleteRelation(project, slug);
      emit(ctx, { id: slug, op_id: result.op.op_id, deleted: true });
    });

  cmd
    .command("field-patch")
    .argument("<project>", "project id")
    .argument("<id>", "relation id (slug, or uid with --by-uid)")
    .description("RFC-6902 subset patch on relation fields")
    .requiredOption("-f, --file <path>", "JSON body file with operations[]")
    .option("--if-match <revision>", "expected revision")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (project, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, project, id, "relation", !!opts.byUid);
      const body = (await readInput(opts.file)) as { operations: JsonPatchOp[] };
      const result = await relationFieldPatch(host, project, {
        id: slug,
        operations: body.operations,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
      });
      emit(ctx, { id: slug, op_id: result.op.op_id, project_revision: result.project_revision });
    });

  return cmd;
}

const RELATION_PROJECT_DEPTH_2 = firstPositionalAfter(2);
const RELATION_PROJECT_JSON = projectFromJsonField("project", "project_id");

export const commandMetadata: CommandMetadataMap = {
  "relation list":         { readOnly: true,  projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation get":          { readOnly: true,  projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation search":       { readOnly: true,  projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation create":       { readOnly: false, projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation replace":      { readOnly: false, projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation patch":        { readOnly: false, projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation delete":       { readOnly: false, projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
  "relation field-patch":  { readOnly: false, projectIdsFromArgv: RELATION_PROJECT_DEPTH_2, projectIdsFromJson: RELATION_PROJECT_JSON },
};
