import { Command } from "commander";
import type { Host } from "../core/host.js";
import { compileRegexOrThrow, emit, parseFieldMatchArgs, readInput, renderTable, type OutputContext } from "./util.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";

/**
 * `cite` builds a default relation id like `rel:cites:foo-bar` from the
 * source/target ids; we only need to strip characters that are illegal
 * in the host's relation-id regex (which excludes `:` and other
 * separators inside the part). Replace any non-alphanumeric/dash with
 * dashes so the generated id is always well-formed.
 *
 * Exported only so it can be unit-tested (the rest of `cite` is a thin
 * wrapper around `host.createRelation`).
 */
export function sanitizeIdPart(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/**
 * SPEC-UID §4 principle 4: operators keep typing slugs by default; the
 * `--by-uid` flag opts into uid-based addressing. This helper resolves
 * the user-provided positional argument into the (workbook_id, slug)
 * pair the rest of the command machinery expects.
 *
 * When `byUid` is set, the positional must be a uid that exists in the
 * host's uid_index AND points at the requested workbook AND is of the
 * requested kind. Mismatches are explicit errors, not silent fallbacks
 * to slug resolution.
 */
export function resolveSlug(
  host: import("../core/host.js").Host,
  workbook_id: string,
  positional: string,
  kind: "primitive" | "relation",
  byUid: boolean,
): string {
  if (!byUid) return positional;
  const entry = host.lookupUid(positional);
  if (!entry)
    throw new FDPMException("not_found", `no artifact with uid: ${positional}`);
  if (entry.kind !== kind)
    throw new FDPMException(
      "verification",
      `uid ${positional} resolves to a ${entry.kind}, not a ${kind}`,
      { evidence: { uid: positional, found_kind: entry.kind, expected_kind: kind } },
    );
  if (entry.workbook_id !== workbook_id)
    throw new FDPMException(
      "not_found",
      `uid ${positional} belongs to workbook ${entry.workbook_id}, not ${workbook_id}`,
      { evidence: { uid: positional, found_project: entry.workbook_id, expected_project: workbook_id } },
    );
  return entry.id;
}

/**
 * Primitive commands map to §9.7.3/§9.7.4:
 *   POST   /workbooks/{id}/primitives                  -> primitive create
 *   GET    /workbooks/{id}/primitives                  -> primitive list
 *   GET    /workbooks/{id}/primitives/{pid}            -> primitive get
 *   PUT    /workbooks/{id}/primitives/{pid}            -> primitive replace
 *   PATCH  /workbooks/{id}/primitives/{pid}            -> primitive patch
 *   DELETE /workbooks/{id}/primitives/{pid}            -> primitive delete
 *   PATCH  /workbooks/{id}/primitives/{pid}:field-patch -> primitive field-patch
 */
export function buildPrimitiveCommand(host: Host): Command {
  const cmd = new Command("primitive");
  cmd.description("Primitive CRUD + field-patch");

  cmd
    .command("list")
    .argument("<workbook>", "workbook id")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slice = host.getProject(workbook);
      const items = Object.values(slice.primitives);
      emit(ctx, { primitives: items }, () =>
        renderTable(items, [
          { header: "ID", value: (p) => p.id },
          { header: "TYPE", value: (p) => p.type_id },
          { header: "REV", value: (p) => p.revision, align: "right" },
        ], { empty: "(no primitives)" }),
      );
    });

  cmd
    .command("get")
    .argument("<workbook>", "workbook id")
    .argument("<id>", "primitive id (slug, or uid with --by-uid)")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action((workbook, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, workbook, id, "primitive", !!opts.byUid);
      const slice = host.getProject(workbook);
      const item = slice.primitives[slug];
      if (!item) throw new FDPMException("not_found", `primitive not found: ${slug}`);
      emit(ctx, item);
    });

  cmd
    .command("cite")
    .argument("<workbook>", "workbook id")
    .argument("<source_id>", "primitive id that asserts the claim")
    .argument("<citation_id>", "id of the fs:Citation primitive that backs the claim")
    .description(
      "Bind a primitive to a citation via fs:References (kind=see_also). Sugar over `relation create`.",
    )
    .option(
      "--kind <kind>",
      "fs:References kind (uses | refines | overrides | see_also)",
      "see_also",
    )
    .option("--rel-id <id>", "explicit relation id (default: rel:cites:<src>-<cit>)")
    .option("--context <text>", "free-text context recorded on the relation")
    .option("--json", "emit JSON")
    .action(async (workbook, sourceId, citationId, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const relId =
        opts.relId != null
          ? opts.relId
          : `rel:cites:${sanitizeIdPart(sourceId)}-${sanitizeIdPart(citationId)}`;
      const context =
        opts.context != null
          ? opts.context
          : `Citation reference for the claim asserted by this primitive.`;
      const result = await host.createRelation(workbook, {
        id: relId,
        type_id: "fs:References",
        source_id: sourceId,
        target_id: citationId,
        field_values: { kind: opts.kind, context },
      });
      emit(ctx, {
        relation_id: relId,
        op_id: result.append.op.op_id,
        project_revision: result.append.project_revision,
        report: result.report,
      });
    });

  cmd
    .command("search")
    .argument("<workbook>", "workbook id")
    .description(
      "Find primitives by type, id substring/regex, and/or field-value match",
    )
    .option("--type <type_id>", "exact type_id match")
    .option("--id-like <substr>", "case-insensitive substring match on id")
    .option("--id-regex <pattern>", "regex match on id (JS regex syntax)")
    .option(
      "--match <needle...>",
      "substring (case-insensitive) found anywhere in field_values; pass --match path=needle to scope to one top-level field",
    )
    .option("--match-regex <pattern...>", "same as --match but regex; supports path=pattern syntax")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const fieldMatch = parseFieldMatchArgs(opts.match, opts.matchRegex);
      const items = host.searchPrimitives(workbook, {
        ...(opts.type != null && { typeId: opts.type }),
        ...(opts.idLike != null && { idLike: opts.idLike }),
        ...(opts.idRegex != null && { idRegex: compileRegexOrThrow(opts.idRegex, "--id-regex") }),
        ...(fieldMatch.length > 0 && { fieldMatch }),
      });
      emit(ctx, { count: items.length, primitives: items }, () =>
        renderTable(items, [
          { header: "ID", value: (p) => p.id },
          { header: "TYPE", value: (p) => p.type_id },
          { header: "REV", value: (p) => p.revision, align: "right" },
        ], { empty: "(no primitives)" }),
      );
    });

  cmd
    .command("create")
    .argument("<workbook>", "workbook id")
    .description("Create a primitive (POST /workbooks/{id}/primitives)")
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const body = (await readInput(opts.file)) as {
        id: string;
        type_id: string;
        field_values: Record<string, unknown>;
        scope_id?: string;
      };
      const result = await host.createPrimitive(workbook, body);
      emit(
        ctx,
        {
          id: body.id,
          op_id: result.append.op.op_id,
          project_revision: result.append.project_revision,
          report: result.report,
        },
        () => `created ${body.id} (rev ${result.append.project_revision})`,
      );
    });

  cmd
    .command("replace")
    .argument("<workbook>", "workbook id")
    .argument("<id>", "primitive id (slug, or uid with --by-uid)")
    .description("PUT — full replacement of field_values")
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--if-match <revision>", "expected primitive revision")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (workbook, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, workbook, id, "primitive", !!opts.byUid);
      const body = (await readInput(opts.file)) as {
        type_id: string;
        field_values: Record<string, unknown>;
        scope_id?: string;
      };
      const result = await host.replacePrimitive(workbook, {
        id: slug,
        ...body,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
      });
      emit(ctx, {
        id: slug,
        op_id: result.append.op.op_id,
        project_revision: result.append.project_revision,
        report: result.report,
      });
    });

  cmd
    .command("patch")
    .argument("<workbook>", "workbook id")
    .argument("<id>", "primitive id (slug, or uid with --by-uid)")
    .description(
      "PATCH — partial update of field_values (validates only touched paths by default; use --full-validate for whole-record gating)",
    )
    .requiredOption("-f, --file <path>", "JSON body file (or - for stdin)")
    .option("--if-match <revision>", "expected primitive revision")
    .option(
      "--full-validate",
      "validate the entire merged primitive (rejects edits when other fields have pre-existing violations)",
    )
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (workbook, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, workbook, id, "primitive", !!opts.byUid);
      const body = (await readInput(opts.file)) as {
        field_values: Record<string, unknown>;
        scope_id?: string;
      };
      const result = await host.patchPrimitive(workbook, {
        id: slug,
        ...body,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
        ...(opts.fullValidate === true && { fullValidate: true }),
      });
      emit(ctx, {
        id: slug,
        op_id: result.append.op.op_id,
        project_revision: result.append.project_revision,
        report: result.report,
      });
    });

  cmd
    .command("delete")
    .argument("<workbook>", "workbook id")
    .argument("<id>", "primitive id (slug, or uid with --by-uid)")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (workbook, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, workbook, id, "primitive", !!opts.byUid);
      const result = await host.deletePrimitive(workbook, slug);
      emit(ctx, { id: slug, op_id: result.op.op_id, deleted: true }, () => `deleted ${slug}`);
    });

  cmd
    .command("field-patch")
    .argument("<workbook>", "workbook id")
    .argument("<id>", "primitive id (slug, or uid with --by-uid)")
    .description("RFC-6902 subset patch on field_values (§9.7.4)")
    .requiredOption("-f, --file <path>", "JSON body file with operations[] (or - for stdin)")
    .option("--if-match <revision>", "expected primitive revision")
    .option("--by-uid", "interpret <id> as a uid (ULID) instead of a slug")
    .option("--json", "emit JSON")
    .action(async (workbook, id, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const slug = resolveSlug(host, workbook, id, "primitive", !!opts.byUid);
      const body = (await readInput(opts.file)) as { operations: unknown[] };
      const result = await host.fieldPatchPrimitive(workbook, {
        id: slug,
        operations: body.operations,
        ...(opts.ifMatch != null && { expected_revision: parseInt(String(opts.ifMatch), 10) }),
      });
      emit(ctx, {
        id: slug,
        op_id: result.append.op.op_id,
        project_revision: result.append.project_revision,
        report: result.report,
      });
    });

  return cmd;
}

const PROJECT_DEPTH_2 = firstPositionalAfter(2);
const PROJECT_JSON = projectFromJsonField("workbook", "workbook_id");

export const commandMetadata: CommandMetadataMap = {
  "primitive list":         { readOnly: true,  projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive get":          { readOnly: true,  projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive cite":         { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive search":       { readOnly: true,  projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive create":       { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive replace":      { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive patch":        { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive delete":       { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
  "primitive field-patch":  { readOnly: false, projectIdsFromArgv: PROJECT_DEPTH_2, projectIdsFromJson: PROJECT_JSON },
};
