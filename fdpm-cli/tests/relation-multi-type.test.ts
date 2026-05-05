import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { ValidationPipeline } from "../src/core/validation/pipeline.js";
import type { DomainProfile, RelationTypeDef } from "../src/core/models/meta.js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../src/core/models/instance.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Regression test for the relation-validator multi-type bug.
 *
 * Symptom (pre-fix): a RelationTypeDef declared with
 *   source_types: [A, B, C], target_types: [X, Y, Z]
 * compiled to source_type_id="A", target_type_id="X" — collapsing the
 * list to its first element. The validator at pipeline.ts compared only
 * against the singleton ids and rejected every relation whose endpoints
 * weren't both of `A`/`X`. This silently broke the formal-specification
 * profile (where most relations have 32-element type lists).
 *
 * Fix: validator now consults the full `source_types`/`target_types`
 * list when present, falls back to the singleton otherwise, and treats
 * `"*"` (and the legacy `core:any` placeholder) as wildcards.
 */

function profileWithRelation(rel: RelationTypeDef): DomainProfile {
  return {
    id: "test:multi",
    version: "1.0.0",
    label: "Multi-type Test",
    extends: [],
    categories: [{ id: "test:cat", label: "Cat" }],
    scopes: [{ id: "test:scope", label: "Scope", rank: 0 }],
    primitive_types: [
      {
        id: "t:a",
        fields: [],
        id_format: { pattern: "^a-[a-z0-9]+$", uniqueness: "workbook" },
        inline_structs: [],
        is_partition_unit: false,
      },
      {
        id: "t:b",
        fields: [],
        id_format: { pattern: "^b-[a-z0-9]+$", uniqueness: "workbook" },
        inline_structs: [],
        is_partition_unit: false,
      },
      {
        id: "t:c",
        fields: [],
        id_format: { pattern: "^c-[a-z0-9]+$", uniqueness: "workbook" },
        inline_structs: [],
        is_partition_unit: false,
      },
      {
        id: "t:z",
        fields: [],
        id_format: { pattern: "^z-[a-z0-9]+$", uniqueness: "workbook" },
        inline_structs: [],
        is_partition_unit: false,
      },
    ],
    relation_types: [rel],
    validation_rules: [],
    renderer_bindings: [],
    inline_structs: [],
  };
}

function prim(id: string, type_id: string): PrimitiveInstance {
  return { id, type_id, field_values: {}, revision: 0 };
}

function rel(
  source_id: string,
  target_id: string,
  type_id = "test:rel:multi",
): RelationInstance {
  return {
    id: `r-${source_id}-${target_id}`,
    type_id,
    source_id,
    target_id,
    field_values: {},
    revision: 0,
  };
}

describe("§7 relation validator — multi-type list (regression)", () => {
  it("accepts a relation whose source matches ANY type in source_types[]", () => {
    const profile = profileWithRelation({
      id: "test:rel:multi",
      source_types: ["t:a", "t:b", "t:c"],
      target_types: ["t:z"],
      cardinality: "many-to-many",
      fields: [],
    } as RelationTypeDef);
    const pipeline = new ValidationPipeline();
    const prims = new Map<string, PrimitiveInstance>([
      ["a-1", prim("a-1", "t:a")],
      ["b-1", prim("b-1", "t:b")],
      ["c-1", prim("c-1", "t:c")],
      ["z-1", prim("z-1", "t:z")],
    ]);
    // T:A → T:Z (matches first of source_types)
    expect(pipeline.runRelation(rel("a-1", "z-1"), profile, prims).accepted).toBe(true);
    // T:B → T:Z (matches MIDDLE of source_types — this is the regression case)
    expect(pipeline.runRelation(rel("b-1", "z-1"), profile, prims).accepted).toBe(true);
    // T:C → T:Z (matches LAST of source_types)
    expect(pipeline.runRelation(rel("c-1", "z-1"), profile, prims).accepted).toBe(true);
  });

  it("rejects a relation whose source type is NOT in source_types[]", () => {
    const profile = profileWithRelation({
      id: "test:rel:multi",
      source_types: ["t:a", "t:b"],
      target_types: ["t:z"],
      cardinality: "many-to-many",
      fields: [],
    } as RelationTypeDef);
    const pipeline = new ValidationPipeline();
    const prims = new Map<string, PrimitiveInstance>([
      ["c-1", prim("c-1", "t:c")],
      ["z-1", prim("z-1", "t:z")],
    ]);
    const report = pipeline.runRelation(rel("c-1", "z-1"), profile, prims);
    expect(report.accepted).toBe(false);
    const f = report.findings.find((x) => x.rule_id === "core:relation:source-type");
    expect(f).toBeDefined();
    expect(f!.message).toMatch(/t:c/);
    expect(f!.message).toMatch(/t:a/); // listed in expected set
  });

  it("treats target_types: '*' as wildcard (any type accepted)", () => {
    const profile = profileWithRelation({
      id: "test:rel:multi",
      source_types: ["t:a"],
      target_types: "*",
      cardinality: "many-to-many",
      fields: [],
    } as RelationTypeDef);
    const pipeline = new ValidationPipeline();
    const prims = new Map<string, PrimitiveInstance>([
      ["a-1", prim("a-1", "t:a")],
      ["b-1", prim("b-1", "t:b")],
      ["c-1", prim("c-1", "t:c")],
    ]);
    expect(pipeline.runRelation(rel("a-1", "b-1"), profile, prims).accepted).toBe(true);
    expect(pipeline.runRelation(rel("a-1", "c-1"), profile, prims).accepted).toBe(true);
  });

  it("treats the compiled wildcard placeholder `core:any` as wildcard (back-compat)", () => {
    // Profiles compiled by an older compileRelationType — only the
    // singleton id is set, with the synthetic `core:any` value.
    const profile = profileWithRelation({
      id: "test:rel:multi",
      source_type_id: "core:any",
      target_type_id: "core:any",
      cardinality: "many-to-many",
      fields: [],
    } as RelationTypeDef);
    const pipeline = new ValidationPipeline();
    const prims = new Map<string, PrimitiveInstance>([
      ["a-1", prim("a-1", "t:a")],
      ["b-1", prim("b-1", "t:b")],
    ]);
    expect(pipeline.runRelation(rel("a-1", "b-1"), profile, prims).accepted).toBe(true);
  });

  it("falls back to the singleton source_type_id/target_type_id when no list is set", () => {
    const profile = profileWithRelation({
      id: "test:rel:multi",
      source_type_id: "t:a",
      target_type_id: "t:z",
      cardinality: "many-to-many",
      fields: [],
    } as RelationTypeDef);
    const pipeline = new ValidationPipeline();
    const prims = new Map<string, PrimitiveInstance>([
      ["a-1", prim("a-1", "t:a")],
      ["b-1", prim("b-1", "t:b")],
      ["z-1", prim("z-1", "t:z")],
    ]);
    expect(pipeline.runRelation(rel("a-1", "z-1"), profile, prims).accepted).toBe(true);
    const fail = pipeline.runRelation(rel("b-1", "z-1"), profile, prims);
    expect(fail.accepted).toBe(false);
    expect(
      fail.findings.some((f) => f.rule_id === "core:relation:source-type"),
    ).toBe(true);
  });
});

describe("§7 relation validator — multi-type list, end-to-end through Host", () => {
  it("Host.createRelation accepts any source/target combination from declared lists", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await host.registerProfile({
      id: "test:multi-host",
      version: "1.0.0",
      label: "Multi via Host",
      extends: [],
      categories: [{ id: "c", label: "C" }],
      scopes: [{ id: "s", label: "S", rank: 0 }],
      primitive_types: [
        {
          id: "t:a",
          fields: [],
          id_format: { pattern: "^a-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
        {
          id: "t:b",
          fields: [],
          id_format: { pattern: "^b-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
        {
          id: "t:z",
          fields: [],
          id_format: { pattern: "^z-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
      ],
      relation_types: [
        {
          id: "test:rel:m",
          source_types: ["t:a", "t:b"],
          target_types: ["t:z"],
          cardinality: "many-to-many",
          fields: [],
        } as RelationTypeDef,
      ],
      validation_rules: [],
      renderer_bindings: [],
      inline_structs: [],
    });
    await host.createProject({
      workbook_id: "demo",
      name: "Demo",
      profile_id: "test:multi-host",
    });
    await host.createPrimitive("demo", { id: "a-one", type_id: "t:a", field_values: {} });
    await host.createPrimitive("demo", { id: "b-one", type_id: "t:b", field_values: {} });
    await host.createPrimitive("demo", { id: "z-one", type_id: "t:z", field_values: {} });

    // T:A → T:Z (first source listed)
    const r1 = await host.createRelation("demo", {
      id: "r:a-z",
      type_id: "test:rel:m",
      source_id: "a-one",
      target_id: "z-one",
    });
    expect(r1.report.accepted).toBe(true);

    // T:B → T:Z (second source listed — the regression case)
    const r2 = await host.createRelation("demo", {
      id: "r:b-z",
      type_id: "test:rel:m",
      source_id: "b-one",
      target_id: "z-one",
    });
    expect(r2.report.accepted).toBe(true);
  });

  it("Host.createRelation rejects a relation whose source type is not in the list", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await host.registerProfile({
      id: "test:multi-host-2",
      version: "1.0.0",
      label: "Multi via Host 2",
      extends: [],
      categories: [{ id: "c", label: "C" }],
      scopes: [{ id: "s", label: "S", rank: 0 }],
      primitive_types: [
        {
          id: "t:a",
          fields: [],
          id_format: { pattern: "^a-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
        {
          id: "t:bad",
          fields: [],
          id_format: { pattern: "^bad-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
        {
          id: "t:z",
          fields: [],
          id_format: { pattern: "^z-[a-z]+$", uniqueness: "workbook" },
          inline_structs: [],
          is_partition_unit: false,
        },
      ],
      relation_types: [
        {
          id: "test:rel:strict",
          source_types: ["t:a"],
          target_types: ["t:z"],
          cardinality: "many-to-many",
          fields: [],
        } as RelationTypeDef,
      ],
      validation_rules: [],
      renderer_bindings: [],
      inline_structs: [],
    });
    await host.createProject({
      workbook_id: "demo",
      name: "Demo",
      profile_id: "test:multi-host-2",
    });
    await host.createPrimitive("demo", { id: "bad-one", type_id: "t:bad", field_values: {} });
    await host.createPrimitive("demo", { id: "z-one", type_id: "t:z", field_values: {} });

    await expect(
      host.createRelation("demo", {
        id: "r:bad-z",
        type_id: "test:rel:strict",
        source_id: "bad-one",
        target_id: "z-one",
      }),
    ).rejects.toThrow(FDPMException);
  });
});

describe("§7 relation validator — formal-specification profile (real-world)", () => {
  it("accepts an fs:References between fs:ChangeRecord and fs:Section (both in declared lists)", async () => {
    // Use the in-tree formal-specification plugin so we exercise the
    // real 32-element source_types / target_types lists. This is the
    // exact relation that failed pre-fix in the post-import edit
    // campaign on roadmap-unified-v04.
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    await host.createProject({
      workbook_id: "fs-demo",
      name: "FS Demo",
      profile_id: PROFILE_ID,
    });
    // Create a Section and a ChangeRecord, then relate them.
    const sec = await host.createPrimitive("fs-demo", {
      id: "section:demo",
      type_id: "fs:Section",
      field_values: {
        number: 1,
        title: "Demo",
        status: "stable",
        version: "0.1.0",
        description: "demo section for the relation-validator regression test",
      },
    });
    expect(sec.report.accepted).toBe(true);
    const ch = await host.createPrimitive("fs-demo", {
      id: "change:0.1:1",
      type_id: "fs:ChangeRecord",
      field_values: {
        version: "0.1",
        date: "2026-05-04T00:00:00Z",
        author: "test",
        summary: "demo change",
        affected_primitives: ["section:demo"],
      },
    });
    expect(ch.report.accepted).toBe(true);

    // fs:References is the relation that failed pre-fix.
    const r = await host.createRelation("fs-demo", {
      id: "rel:change-references-section",
      type_id: "fs:References",
      source_id: "change:0.1:1",
      target_id: "section:demo",
      field_values: { kind: "see_also" },
    });
    expect(r.report.accepted).toBe(true);
  });
});
