import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { resolve } from "node:path";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Content parity between the ported TypeScript plugin and the Python
 * source (src/fdpm/plugins/formal_specification.py).
 *
 * The Python source declares:
 *   32 PrimitiveTypeDef
 *   30 RelationTypeDef
 *   23 ValidationRuleDef
 *    3 RendererBinding
 *    3 TemplateDef
 *    9 CategoryDef
 *    8 ScopeDef
 *    2 scope_sets ("process", "paper"), default_scope_set="process"
 *
 * The 32 primitive type ids match `_ALL_PRIMITIVE_IDS` in the source.
 */

const EXPECTED_PRIMITIVE_IDS = [
  "fs:AblationStudy",
  "fs:Actor",
  "fs:Assumption",
  "fs:Audience",
  "fs:ChangeRecord",
  "fs:Citation",
  "fs:ComplexityAnalysis",
  "fs:Component",
  "fs:Configuration",
  "fs:Contract",
  "fs:Dataset",
  "fs:Definition",
  "fs:DesignDecision",
  "fs:EnumDef",
  "fs:Equation",
  "fs:Example",
  "fs:Experiment",
  "fs:FailureMode",
  "fs:Figure",
  "fs:FormalProperty",
  "fs:Guideline",
  "fs:Hyperparameter",
  "fs:Invariant",
  "fs:Limitation",
  "fs:Notation",
  "fs:Phase",
  "fs:Principle",
  "fs:Requirement",
  "fs:Result",
  "fs:Section",
  "fs:TestCase",
  "fs:TypeDefinition",
];

async function loadHostWithPlugin(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

describe("formal_specification — content parity with Python source", () => {
  it("registers exactly 32 primitive types, ids match Python _ALL_PRIMITIVE_IDS", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.primitive_types).toHaveLength(32);
    const ids = profile.primitive_types.map((p) => p.id).sort();
    expect(ids).toEqual([...EXPECTED_PRIMITIVE_IDS].sort());
  });

  it("registers exactly 30 relation types", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.relation_types).toHaveLength(30);
  });

  it("registers exactly 23 validation rules", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.validation_rules).toHaveLength(23);
  });

  it("registers exactly 3 renderer bindings (the executable renderer surface)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.renderers).toHaveLength(3);
  });

  it("registers exactly 3 templates", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.templates).toHaveLength(3);
  });

  it("declares 9 categories and 8 scopes", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.categories).toHaveLength(9);
    expect(profile.scopes).toHaveLength(8);
  });

  it("scope_sets has 'process' and 'paper'; default_scope_set is 'process'", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(Object.keys(profile.scope_sets).sort()).toEqual(["paper", "process"]);
    expect(profile.default_scope_set).toBe("process");
  });

  it("fs:Section is a partition unit (Core SPEC §5.4.3)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const section = profile.primitive_types.find((p) => p.id === "fs:Section");
    expect(section?.is_partition_unit).toBe(true);
  });

  it("fs:Section has the expected required fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const section = profile.primitive_types.find((p) => p.id === "fs:Section");
    const fieldNames = section!.fields.map((f) => f.name).sort();
    expect(fieldNames).toEqual(["description", "number", "status", "title", "version"]);
    const status = section!.fields.find((f) => f.name === "status");
    expect(status?.kind).toBe("enum");
    expect(status?.enum_values).toEqual(["stable", "draft", "deprecated"]);
  });

  it("fs:DesignDecision has the Alternative inline struct with two fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const dd = profile.primitive_types.find((p) => p.id === "fs:DesignDecision");
    expect(dd?.inline_structs).toHaveLength(1);
    expect(dd?.inline_structs[0]?.id).toBe("Alternative");
    expect(dd?.inline_structs[0]?.fields).toHaveLength(2);
  });

  it("fs:Equation has the Variable inline struct with three fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const eq = profile.primitive_types.find((p) => p.id === "fs:Equation");
    expect(eq?.inline_structs).toHaveLength(1);
    expect(eq?.inline_structs[0]?.id).toBe("Variable");
    expect(eq?.inline_structs[0]?.fields).toHaveLength(3);
  });

  it("fs:Component has the TensorSpec inline struct with four fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const comp = profile.primitive_types.find((p) => p.id === "fs:Component");
    expect(comp?.inline_structs).toHaveLength(1);
    expect(comp?.inline_structs[0]?.id).toBe("TensorSpec");
    expect(comp?.inline_structs[0]?.fields).toHaveLength(4);
  });

  it("end-to-end: create project on the profile, add a Section, list works", async () => {
    const host = await loadHostWithPlugin();
    await host.createProject({
      project_id: "paper",
      name: "Demo Paper",
      profile_id: PROFILE_ID,
    });
    const result = await host.createPrimitive("paper", {
      id: "section:1",
      type_id: "fs:Section",
      field_values: {
        number: 1,
        title: "Introduction",
        status: "draft",
        version: "1.0.0",
        description: "Sets the scene.",
      },
      scope_id: "scope:fs:specification",
    });
    expect(result.report.accepted).toBe(true);
    const slice = host.getProject("paper");
    expect(slice.primitives["section:1"]).toBeDefined();
  });

  it("validation rejects an fs:Section with bad enum value", async () => {
    const host = await loadHostWithPlugin();
    await host.createProject({
      project_id: "paper",
      name: "Demo",
      profile_id: PROFILE_ID,
    });
    await expect(
      host.createPrimitive("paper", {
        id: "section:1",
        type_id: "fs:Section",
        field_values: {
          number: 1,
          title: "X",
          status: "bogus", // not in enum
          version: "1.0.0",
          description: "x",
        },
      }),
    ).rejects.toThrow(/validation/);
  });

  /**
   * Regression: fs:Phase schema MUST declare reads/writes/formality_level/
   * revisit_label so the v0.4 source's per-phase Bernstein declarations
   * (added in patch P-08, verified by the v0.5.1 review's Bernstein
   * computation) participate in the §7 validation pipeline. Before the
   * post-v0.5.1 fix, the importer passed these fields through into
   * field_values but Core's schema didn't acknowledge them — the data
   * survived but was un-validated, masking any future regression in the
   * importer or the source. This test locks the schema in place.
   */
  it("fs:Phase declares reads, writes, formality_level, and revisit_label fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const phase = profile.primitive_types.find((p) => p.id === "fs:Phase");
    expect(phase).toBeDefined();
    const fields = phase!.fields;
    const fieldNames = new Set(fields.map((f) => f.name));
    expect(fieldNames.has("reads")).toBe(true);
    expect(fieldNames.has("writes")).toBe(true);
    expect(fieldNames.has("formality_level")).toBe(true);
    expect(fieldNames.has("revisit_label")).toBe(true);

    // reads/writes are struct-typed against the StateComponents inline struct.
    const reads = fields.find((f) => f.name === "reads");
    expect(reads?.kind).toBe("struct");
    expect(reads?.struct_id).toBe("StateComponents");
    expect(reads?.required).toBe(false);

    const writes = fields.find((f) => f.name === "writes");
    expect(writes?.kind).toBe("struct");
    expect(writes?.struct_id).toBe("StateComponents");
    expect(writes?.required).toBe(false);

    const formality = fields.find((f) => f.name === "formality_level");
    expect(formality?.kind).toBe("string");
    expect(formality?.required).toBe(false);

    const revisit = fields.find((f) => f.name === "revisit_label");
    expect(revisit?.kind).toBe("json");
    expect(revisit?.required).toBe(false);

    // The StateComponents inline struct must exist on fs:Phase and
    // declare a string-list `components` field — that's the actual
    // payload Bernstein analysis will iterate over.
    const sc = phase!.inline_structs.find((s) => s.id === "StateComponents");
    expect(sc).toBeDefined();
    expect(sc!.fields).toHaveLength(1);
    expect(sc!.fields[0]?.name).toBe("components");
    expect(sc!.fields[0]?.kind).toBe("list");
    expect(sc!.fields[0]?.item_field?.kind).toBe("string");
  });
});
