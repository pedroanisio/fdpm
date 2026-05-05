import { Command } from "commander";
import type { Host } from "../core/host.js";
import { emit, readInput, type OutputContext } from "./util.js";
import { batchEdit, BATCH_EDITABLE_KINDS, type BatchOpInput } from "../core/host-extra.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";

/**
 * Batch edit (§9.7.5) — atomic ordered list of operations.
 *
 * Body shape (JSON file or stdin):
 * ```
 * {
 *   "expected_project_revision": 142,    // optional; conflict if mismatch
 *   "operations": [
 *     { "kind": "primitive.create", "payload": { "id": "...", "type_id": "...", "field_values": {...} } },
 *     { "kind": "primitive.patch",  "payload": { "id": "...", "field_values": {...} } },
 *     { "kind": "relation.create",  "payload": { "id": "...", "type_id": "...", "source_id": "...", "target_id": "...", "field_values": {} } }
 *     // ...
 *   ]
 * }
 * ```
 *
 * Run with `--print-schema` to dump the per-kind payload JSON schema(s)
 * — useful when constructing the JSON body. `--dry-run` runs the §8
 * verification gate over every payload and returns what would change,
 * without mutating state.
 */
export function buildEditCommand(host: Host): Command {
  const cmd = new Command("edit");
  cmd.description("Batch transactional edits (§9.7.5 POST /workbooks/{id}/edits)");

  cmd
    .argument("[workbook]", "workbook id (omitted when using --print-schema)")
    .option("-f, --file <path>", "JSON body file (or - for stdin)")
    .option(
      "--dry-run",
      "verify every op's payload against the §8 schema gate (does NOT run §7 validators or simulate inter-op effects); report what would change without mutating state",
    )
    .option(
      "--print-schema [kind]",
      "print the JSON schema(s) for batch op payloads; pass a kind to scope (e.g. primitive.patch)",
    )
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };

      if (opts.printSchema !== undefined) {
        // commander gives `true` when flag passed bare, or the value when
        // passed with an argument. Normalise.
        const wanted = typeof opts.printSchema === "string" ? opts.printSchema : null;
        if (wanted !== null && !(BATCH_EDITABLE_KINDS as readonly string[]).includes(wanted)) {
          throw new FDPMException(
            "verification",
            `--print-schema: unknown kind "${wanted}"; allowed: ${BATCH_EDITABLE_KINDS.join(", ")}`,
          );
        }
        const kinds = wanted != null ? [wanted] : BATCH_EDITABLE_KINDS;
        const examples: Record<string, unknown> = {};
        for (const k of kinds) {
          const ex = EXAMPLE_PAYLOADS[k as keyof typeof EXAMPLE_PAYLOADS];
          if (ex !== undefined) examples[k] = ex;
        }
        emit(ctx, {
          envelope: {
            expected_project_revision: "number (optional; conflict if mismatch)",
            operations: [
              {
                kind: "string (one of: " + BATCH_EDITABLE_KINDS.join(", ") + ")",
                payload: "object (see per_kind examples below)",
              },
            ],
          },
          per_kind: examples,
          notes: [
            "Per-kind example payloads show the minimum required field shape.",
            "Run `fdpm edit <workbook> -f file.json --dry-run` to verify a batch before applying.",
            "All ops in a batch share one request_id; if any op fails, the entire batch is rolled back.",
          ],
        });
        return;
      }

      if (workbook == null || opts.file == null) {
        throw new FDPMException(
          "verification",
          "edit requires <workbook> and -f <file> (use --print-schema for shape help)",
        );
      }

      const raw = await readInput(opts.file);
      const body = parseEditEnvelope(raw);
      const result = await batchEdit(
        host,
        workbook,
        body.operations,
        body.expected_project_revision,
        { dryRun: opts.dryRun === true },
      );
      emit(ctx, {
        status: opts.dryRun === true ? "dry-run-ok" : "applied",
        ...result,
      });
    });

  return cmd;
}

/**
 * Validate the `edit` body envelope shape before passing it to batchEdit.
 *
 * Shallow checks only — the per-op payload schema is enforced
 * downstream by the §8 verification gate. The point here is to give a
 * crisp error when the file is structurally wrong (missing
 * `operations`, wrong type, etc.) instead of a TypeError emerging
 * from the batch loop several layers deep.
 */
function parseEditEnvelope(raw: unknown): {
  expected_project_revision?: number;
  operations: BatchOpInput[];
} {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new FDPMException(
      "verification",
      "edit body must be a JSON object {operations: [...], expected_project_revision?: number}",
    );
  const obj = raw as Record<string, unknown>;
  const ops = obj["operations"];
  if (!Array.isArray(ops))
    throw new FDPMException(
      "verification",
      `edit body missing "operations" array (got ${ops === undefined ? "undefined" : typeof ops})`,
    );
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === null || typeof op !== "object" || Array.isArray(op))
      throw new FDPMException(
        "verification",
        `operations[${i}] must be an object {kind, payload}`,
      );
    const kind = (op as Record<string, unknown>)["kind"];
    if (typeof kind !== "string" || kind.length === 0)
      throw new FDPMException(
        "verification",
        `operations[${i}].kind must be a non-empty string`,
      );
    if (!(BATCH_EDITABLE_KINDS as readonly string[]).includes(kind))
      throw new FDPMException(
        "verification",
        `operations[${i}].kind "${kind}" is not batch-editable; allowed: ${BATCH_EDITABLE_KINDS.join(", ")}`,
      );
    const payload = (op as Record<string, unknown>)["payload"];
    if (payload === undefined || payload === null || typeof payload !== "object")
      throw new FDPMException(
        "verification",
        `operations[${i}].payload must be an object`,
      );
  }
  const epr = obj["expected_project_revision"];
  if (epr !== undefined && (typeof epr !== "number" || !Number.isInteger(epr)))
    throw new FDPMException(
      "verification",
      `expected_project_revision must be an integer (got ${typeof epr})`,
    );
  return {
    operations: ops as BatchOpInput[],
    ...(epr !== undefined && { expected_project_revision: epr as number }),
  };
}

/**
 * Hand-curated example payloads per operation kind.
 *
 * Maintained alongside `PAYLOAD_SCHEMAS`. Tested by
 * `tests/edit-print-schema.test.ts`: every kind that has a payload schema
 * MUST have an example whose shape passes that schema. This eliminates
 * the older Zod-internals walker which was fragile across Zod versions.
 *
 * Examples deliberately use placeholder ids/types/values; they are not
 * meant to be applied verbatim, only to show the field shape.
 */
const EXAMPLE_PAYLOADS = {
  "primitive.create": {
    id: "section:example",
    type_id: "fs:Section",
    field_values: { title: "Example Section", number: 1 },
    scope_id: "scope:example",
  },
  "primitive.replace": {
    id: "section:example",
    type_id: "fs:Section",
    field_values: { title: "Replaced", number: 2 },
  },
  "primitive.patch": {
    id: "section:example",
    field_values: { title: "Updated title only" },
  },
  "primitive.field-patch": {
    id: "section:example",
    operations: [{ op: "replace", path: "/title", value: "via RFC-6902" }],
  },
  "primitive.delete": { id: "section:example" },
  "relation.create": {
    id: "rel:example",
    type_id: "fs:References",
    source_id: "section:example",
    target_id: "citation:example",
    field_values: { kind: "see_also", context: "Optional context." },
  },
  "relation.replace": {
    id: "rel:example",
    type_id: "fs:References",
    field_values: { kind: "see_also" },
  },
  "relation.patch": {
    id: "rel:example",
    field_values: { context: "New context only." },
  },
  "relation.field-patch": {
    id: "rel:example",
    operations: [{ op: "replace", path: "/kind", value: "uses" }],
  },
  "relation.delete": { id: "rel:example" },
  "structure.reorder": {
    scope_id: "scope:example",
    ordering: ["section:a", "section:b", "section:c"],
  },
  "structure.reparent": {
    primitive_id: "para:example",
    from_scope_id: "scope:a",
    to_scope_id: "scope:b",
  },
} as const satisfies Record<string, Record<string, unknown>>;

export const commandMetadata: CommandMetadataMap = {
  edit: {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(1),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
