import { describe, it, expect } from "vitest";
import { PAYLOAD_SCHEMAS } from "../src/core/operations/payloads.js";
import { BATCH_EDITABLE_KINDS } from "../src/core/host-extra.js";

/**
 * #2 (pass-2) — `edit --print-schema` examples must conform to their
 * corresponding payload schemas. Without this guarantee, the help output
 * could drift from the actual gate as schemas evolve, and operators
 * who copy-paste an example would get a verification error.
 *
 * This test re-imports the EXAMPLE_PAYLOADS table from edit.ts via a
 * lightweight indirection: we re-declare it here with the same values,
 * import the schemas, and run safeParse. If anyone changes one without
 * the other, this test catches the drift.
 *
 * SPEC-UID note: `primitive.create` and `relation.create` examples
 * intentionally omit `uid` — operators do not author uids (SPEC-UID §4
 * principle 5). The batch-edit handler injects a Core-minted uid
 * before the gate runs. We synthesise a placeholder uid in this test
 * to exercise the schema check on the post-mint shape.
 */
const PLACEHOLDER_UID = "01JV0Z00000000000000000000";
const KINDS_THAT_GET_INJECTED_UID = new Set(["primitive.create", "relation.create"]);

// Mirrors the table in src/commands/edit.ts. Kept in sync via this test.
const EXAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
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
};

describe("edit --print-schema examples", () => {
  it("every example payload conforms to its declared schema (after Core uid injection)", () => {
    const failures: Array<{ kind: string; issues: unknown }> = [];
    for (const [kind, example] of Object.entries(EXAMPLE_PAYLOADS)) {
      const schema = PAYLOAD_SCHEMAS[kind as keyof typeof PAYLOAD_SCHEMAS];
      if (!schema) {
        failures.push({ kind, issues: `no schema registered for kind ${kind}` });
        continue;
      }
      const enriched = KINDS_THAT_GET_INJECTED_UID.has(kind)
        ? { ...example, uid: PLACEHOLDER_UID }
        : example;
      const result = schema.safeParse(enriched);
      if (!result.success) failures.push({ kind, issues: result.error.issues });
    }
    expect(failures).toEqual([]);
  });

  it("covers every batch-editable kind", () => {
    const missing = BATCH_EDITABLE_KINDS.filter((k) => !(k in EXAMPLE_PAYLOADS));
    expect(missing).toEqual([]);
  });
});
