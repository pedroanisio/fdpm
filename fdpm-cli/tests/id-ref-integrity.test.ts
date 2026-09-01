/**
 * Referential integrity for `id-ref` fields.
 *
 * The meta-model has always had `kind: "id-ref"` with a mandatory
 * `ref_type_id`, and `meta.ts` enforces that a profile declaring one
 * supplies the other. Nothing resolved the reference: a field could name
 * a primitive that never existed, or one of the wrong type, and the write
 * was accepted. Deleting the referent then left the pointer dangling, and
 * `--dry-run` reported the deletion as clean because delete-preview only
 * ever looked at `source_id` / `target_id`.
 *
 * That matters most for reified n-ary structure. FDPM relations are
 * strictly binary, so an n-ary rule is modelled as a primitive plus
 * binary pairs carrying a `rule_id` back-reference — and that
 * back-reference was exactly the unchecked kind.
 */

import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { previewPrimitiveDelete } from "../src/core/operations/delete-preview.js";
import type { DomainProfile } from "../src/core/models/meta.js";

/** A rule reified as a primitive, with pairs pointing back at it. */
const REF_PROFILE: DomainProfile = {
  id: "test:refs",
  version: "1.0.0",
  label: "Reference test",
  extends: [],
  categories: [{ id: "test:cat:r", label: "Rules" }],
  scopes: [],
  primitive_types: [
    {
      id: "test:Rule",
      fields: [{ name: "title", kind: "string", required: true, validations: [] }],
      id_format: { pattern: "^rule:[a-z0-9-]+$", uniqueness: "workbook" },
      inline_structs: [],
    },
    {
      id: "test:Claim",
      id_format: { pattern: "^claim:[a-z0-9-]+$", uniqueness: "workbook" },
      inline_structs: [],
      fields: [
        { name: "text", kind: "string", required: true, validations: [] },
        // Single reference: the reified back-pointer.
        {
          name: "rule_id",
          kind: "id-ref",
          ref_type_id: "test:Rule",
          required: false,
          validations: [],
        },
        // A list of references — the `antecedent_ids` shape.
        {
          name: "antecedent_ids",
          kind: "list",
          required: false,
          validations: [],
          item_field: {
            name: "value",
            kind: "id-ref",
            ref_type_id: "test:Rule",
            required: true,
            validations: [],
          },
        },
      ],
    },
  ],
  relation_types: [],
} as unknown as DomainProfile;

async function seeded() {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(REF_PROFILE);
  await host.createProject({ workbook_id: "p1", name: "P1", profile_id: "test:refs" });
  await host.createPrimitive("p1", {
    id: "rule:one",
    type_id: "test:Rule",
    field_values: { title: "R1" },
  });
  return host;
}

/**
 * A rejected write throws `FDPMException("validation")` carrying the
 * findings; it does not return a report. Pull the id-ref finding out of
 * the thrown error, failing loudly if the write was accepted instead.
 */
async function idRefFindingFrom(
  run: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(FDPMException);
    const e = err as FDPMException;
    expect(e.category).toBe("validation");
    const findings = (e.findings ?? []) as Array<Record<string, unknown>>;
    const f = findings.find((x) => x["rule_id"] === "core:field:id-ref");
    expect(f, `no core:field:id-ref finding in ${JSON.stringify(findings)}`).toBeDefined();
    return f as Record<string, unknown>;
  }
  throw new Error("expected the write to be rejected, but it was accepted");
}

describe("id-ref validation", () => {
  it("accepts a reference that resolves to a primitive of the declared type", async () => {
    const host = await seeded();
    const { report } = await host.createPrimitive("p1", {
      id: "claim:a",
      type_id: "test:Claim",
      field_values: { text: "ok", rule_id: "rule:one" },
    });
    expect(report.accepted).toBe(true);
    expect(report.findings.filter((x) => x.rule_id === "core:field:id-ref")).toEqual([]);
  });

  it("rejects a reference that names nothing", async () => {
    const host = await seeded();
    const f = await idRefFindingFrom(() =>
      host.createPrimitive("p1", {
        id: "claim:b",
        type_id: "test:Claim",
        field_values: { text: "bad", rule_id: "rule:missing" },
      }),
    );
    expect(f.field_path).toBe("field_values.rule_id");
    expect(String(f.message)).toContain("rule:missing");
  });

  it("rejects a reference to a primitive of the wrong type", async () => {
    const host = await seeded();
    await host.createPrimitive("p1", {
      id: "claim:seed",
      type_id: "test:Claim",
      field_values: { text: "seed" },
    });
    const f = await idRefFindingFrom(() =>
      host.createPrimitive("p1", {
        id: "claim:c",
        type_id: "test:Claim",
        // claim:seed exists, but it is a Claim, not a Rule.
        field_values: { text: "wrong type", rule_id: "claim:seed" },
      }),
    );
    expect(f.evidence).toMatchObject({ expected_type_id: "test:Rule", actual_type_id: "test:Claim" });
  });

  it("checks every element of a list of references", async () => {
    const host = await seeded();
    const f = await idRefFindingFrom(() =>
      host.createPrimitive("p1", {
        id: "claim:d",
        type_id: "test:Claim",
        field_values: { text: "list", antecedent_ids: ["rule:one", "rule:ghost"] },
      }),
    );
    // The path must name the offending element, not just the field.
    expect(f.field_path).toBe("field_values.antecedent_ids[1]");
  });

  it("accepts a list whose every element resolves", async () => {
    const host = await seeded();
    const { report } = await host.createPrimitive("p1", {
      id: "claim:e",
      type_id: "test:Claim",
      field_values: { text: "all good", antecedent_ids: ["rule:one"] },
    });
    expect(report.accepted).toBe(true);
  });

  it("leaves an absent optional reference alone", async () => {
    const host = await seeded();
    const { report } = await host.createPrimitive("p1", {
      id: "claim:f",
      type_id: "test:Claim",
      field_values: { text: "no ref" },
    });
    expect(report.accepted).toBe(true);
  });
});

describe("delete-preview reports what a delete would orphan", () => {
  it("lists primitives whose id-ref field points at the doomed primitive", async () => {
    const host = await seeded();
    await host.createPrimitive("p1", {
      id: "claim:x",
      type_id: "test:Claim",
      field_values: { text: "points at rule:one", rule_id: "rule:one" },
    });
    const preview = previewPrimitiveDelete(host, "p1", "rule:one");
    expect(preview.referencing_fields).toBeDefined();
    expect(preview.referencing_fields).toContainEqual(
      expect.objectContaining({
        id: "claim:x",
        kind: "primitive",
        field_path: "field_values.rule_id",
      }),
    );
  });

  it("lists a list-element reference with its index", async () => {
    const host = await seeded();
    await host.createPrimitive("p1", {
      id: "claim:y",
      type_id: "test:Claim",
      field_values: { text: "list ref", antecedent_ids: ["rule:one"] },
    });
    const preview = previewPrimitiveDelete(host, "p1", "rule:one");
    expect(preview.referencing_fields).toContainEqual(
      expect.objectContaining({ id: "claim:y", field_path: "field_values.antecedent_ids[0]" }),
    );
  });

  it("reports nothing when no field references the primitive", async () => {
    const host = await seeded();
    await host.createPrimitive("p1", {
      id: "claim:z",
      type_id: "test:Claim",
      field_values: { text: "unrelated" },
    });
    const preview = previewPrimitiveDelete(host, "p1", "rule:one");
    expect(preview.referencing_fields).toEqual([]);
  });

  it("still reports referencing relations alongside referencing fields", async () => {
    // The existing guarantee must not regress.
    const host = await seeded();
    const preview = previewPrimitiveDelete(host, "p1", "rule:one");
    expect(Array.isArray(preview.referencing_relations)).toBe(true);
  });
});
