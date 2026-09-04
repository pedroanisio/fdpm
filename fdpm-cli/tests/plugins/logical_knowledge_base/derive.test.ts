/**
 * The derivation is the plugin. These tests pin what it produces and the
 * properties that make it correct, so a re-vendored schema that changes
 * them fails here rather than silently shipping a different profile.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DomainProfile, PrimitiveTypeDef, RelationTypeDef } from "../../../src/core/models/meta.js";
import {
  ARGUMENT_GRAPH_RENDERER_ID,
  ELEMENT_RELATION_ID,
  EXTERNAL_TARGET_TYPE_ID,
  HEADER_TYPE_ID,
  INSTANCE_ID_PATTERN,
  PROFILE_ID,
  PROVENANCE_RELATION_ID,
  REF_RELATION_PREFIX,
  ROOT_COLLECTIONS,
  SOURCE_ID_FIELD,
  STEP_RELATION_ID,
  TARGET_FAMILIES,
  THEORY_RENDERER_ID,
  derivationSummary,
  derive,
  deriveProfile,
  hostIdFor,
  kindToLocal,
  nodeArms,
  referenceRelationId,
  slugForHostId,
  typeIdFor,
} from "../../../plugins/logical_knowledge_base/derive.js";
import { LKB_UPSTREAM_SHA256 } from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import profileJson from "../../../plugins/logical_knowledge_base/generated/profile.json" with { type: "json" };
import { NODE_COMMAND, tsxArgs } from "../../_helpers/process.js";

describe("the vendored schema", () => {
  it("is the upstream build this plugin was derived from", () => {
    expect(LKB_UPSTREAM_SHA256).toBe(
      "3b836300581013a1eecfa694a6b89ba65ae9fab63ebca1a0dd698b8243b4af7d",
    );
  });
});

describe("node arms", () => {
  it("enumerates every kind of the fourteen root collections plus nested steps and elements", () => {
    const arms = nodeArms();
    const perCollection = new Map<string, number>();
    for (const a of arms.filter((x) => x.placement === "root")) {
      perCollection.set(a.collection, (perCollection.get(a.collection) ?? 0) + 1);
    }
    // Counted from the schema's unions; a re-vendored schema that changes
    // any of these must change this table and the plugin version.
    expect(Object.fromEntries(perCollection)).toEqual({
      namespaces: 1,
      imports: 1,
      modules: 1,
      declarations: 27,
      statements: 7,
      rules: 16,
      constraints: 7,
      queries: 13,
      proofs: 4,
      argumentation: 7,
      processes: 1,
      conflictPolicies: 1,
      provenanceRecords: 1,
      interoperabilityMappings: 1,
    });
    expect(arms.filter((a) => a.placement === "step")).toHaveLength(19);
    expect(arms.filter((a) => a.placement === "element")).toHaveLength(8);
    expect(arms).toHaveLength(115);
    expect(new Set(arms.map((a) => a.kind)).size).toBe(arms.length);
    expect(new Set(arms.map((a) => a.typeId)).size).toBe(arms.length);
    expect([...ROOT_COLLECTIONS]).toEqual([...perCollection.keys()]);
  });

  it("names types from kinds reversibly", () => {
    expect(kindToLocal("predicate_declaration")).toBe("PredicateDeclaration");
    expect(typeIdFor("event_condition_action_rule")).toBe("lkb:EventConditionActionRule");
    expect(hostIdFor("module", "org.example/Core#v1")).toBe("lkb:module:org.example-Core-v1");
    expect(slugForHostId("://")).toBe("node");
    expect(new RegExp(INSTANCE_ID_PATTERN).test(hostIdFor("claim", "c:1"))).toBe(true);
  });
});

describe("the derived profile", () => {
  const profile = deriveProfile();

  it("is a valid DomainProfile with 117 primitive types", () => {
    expect(() => DomainProfile.parse(profile)).not.toThrow();
    expect(profile.id).toBe(PROFILE_ID);
    expect(profile.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(profile.primitive_types).toHaveLength(117);
    expect(profile.primitive_types[0]!.id).toBe(HEADER_TYPE_ID);
    expect(profile.primitive_types.at(-1)!.id).toBe(EXTERNAL_TARGET_TYPE_ID);
    for (const t of profile.primitive_types) expect(() => PrimitiveTypeDef.parse(t)).not.toThrow();
    for (const r of profile.relation_types) expect(() => RelationTypeDef.parse(r)).not.toThrow();
  });

  it("gives every node type a source_id and keeps the schema's id pattern on it", () => {
    for (const t of profile.primitive_types) {
      const f = t.fields.find((x) => x.name === SOURCE_ID_FIELD);
      expect(f, `${t.id} has no ${SOURCE_ID_FIELD}`).toBeDefined();
      expect(f!.required).toBe(true);
      expect(f!.validations.some((v) => v.kind === "pattern" && String(v.value).startsWith("^[A-Za-z]"))).toBe(true);
      expect(t.id_format.pattern).toBe(INSTANCE_ID_PATTERN);
    }
  });

  it("keeps the expression language as tagged JSON, never as primitives", () => {
    const rule = profile.primitive_types.find((t) => t.id === "lkb:DerivationRule")!;
    const body = rule.fields.find((f) => f.name === "body")!;
    expect(body.kind).toBe("list");
    expect(body.item_field?.kind).toBe("json");
    expect(body.item_field?.format).toBe("lkb:Formula");
    const claim = profile.primitive_types.find((t) => t.id === "lkb:Claim")!;
    expect(claim.fields.find((f) => f.name === "formula")).toMatchObject({ kind: "json", format: "lkb:Formula", required: true });
    const ids = new Set(profile.primitive_types.map((t) => t.id));
    for (const astKind of ["lkb:AndFormula", "lkb:VariableTerm", "lkb:NamedType", "lkb:TopConcept"]) {
      expect(ids.has(astKind)).toBe(false);
    }
  });

  it("maps scalars, enums, datetimes and structs from the schema", () => {
    const pred = profile.primitive_types.find((t) => t.id === "lkb:PredicateDeclaration")!;
    expect(pred.fields.find((f) => f.name === "arity")).toMatchObject({ kind: "integer", required: true });
    expect(pred.fields.find((f) => f.name === "variadic")).toMatchObject({ kind: "boolean", required: false });
    expect(pred.fields.find((f) => f.name === "parameters")).toMatchObject({ kind: "list" });
    expect(pred.fields.find((f) => f.name === "parameters")!.item_field).toMatchObject({ kind: "struct", struct_id: "Parameter" });
    const rule = profile.primitive_types.find((t) => t.id === "lkb:DerivationRule")!;
    expect(rule.fields.find((f) => f.name === "phase")).toMatchObject({
      kind: "enum",
      enum_values: ["compile", "ingest", "derive", "validate", "decide", "execute", "explain"],
    });
    expect(rule.fields.find((f) => f.name === "family")).toMatchObject({ kind: "enum", enum_values: ["derivation"] });
    expect(rule.fields.find((f) => f.name === "confidence")?.validations).toEqual([
      { kind: "min", value: 0, level: "error" },
      { kind: "max", value: 1, level: "error" },
    ]);
    const prov = profile.primitive_types.find((t) => t.id === "lkb:ProvenanceRecord")!;
    expect(prov.fields.find((f) => f.name === "createdAt")).toMatchObject({ kind: "datetime" });
    expect(profile.inline_structs.some((s) => s.id === "Parameter")).toBe(true);
    expect(profile.inline_structs.some((s) => s.id === "SourceLocation")).toBe(true);
  });

  it("lifts every Reference field into a typed edge and keeps no Reference as a field", () => {
    const d = derive();
    const refIds = new Set(profile.relation_types.filter((r) => r.id.startsWith(REF_RELATION_PREFIX)).map((r) => r.id));
    for (const nt of d.nodeTypes) {
      for (const l of nt.lifted) {
        if (l.lift === "reference") expect(refIds.has(referenceRelationId(l.field))).toBe(true);
      }
      for (const f of nt.type.fields) {
        expect(f.struct_id, `${nt.type.id}.${f.name} stores a Reference as a struct`).not.toBe("Reference");
        expect(f.item_field?.struct_id, `${nt.type.id}.${f.name} stores Reference[] as a list`).not.toBe("Reference");
      }
    }
    const parent = profile.relation_types.find((r) => r.id === referenceRelationId("parentModule"))!;
    expect(parent.source_types).toEqual(["lkb:Module"]);
    expect(parent.target_types).toBe("*");
    expect(parent.cardinality).toBe("many-to-one");
    const overrides = profile.relation_types.find((r) => r.id === referenceRelationId("overrides"))!;
    expect(overrides.cardinality).toBe("many-to-many");
    expect((overrides.source_types as string[]).length).toBe(16);
    // Where the schema fixes the family in a refinement, the targets are declared.
    expect(overrides.target_types).toHaveLength(17); // 16 rule kinds + the external-target stub
    expect(overrides.target_types).toContain("lkb:DerivationRule");
    expect(overrides.target_types).toContain(EXTERNAL_TARGET_TYPE_ID);
    expect(profile.relation_types.find((r) => r.id === referenceRelationId("priorityOver"))!.target_types).toEqual(overrides.target_types);
    const members = profile.relation_types.find((r) => r.id === referenceRelationId("members"))!;
    expect(members.source_types).toEqual(["lkb:ConstraintGroup"]);
    expect(members.target_types).toHaveLength(8); // 7 constraint kinds + external
    const mentions = profile.relation_types.find((r) => r.id === "lkb:mentions")!;
    expect(mentions.source_types).toBe("*");
    expect(mentions.target_types).toBe("*");
    expect(mentions.fields.map((f) => [f.name, f.kind, f.required])).toEqual([
      ["path", "string", true],
      ["count", "integer", true],
      ["target_family", "enum", false],
    ]);
    expect(parent.fields.map((f) => f.name)).toEqual(["resolution", "target_family", "external_uri", "position"]);
    expect(parent.fields.find((f) => f.name === "target_family")!.enum_values).toEqual([...TARGET_FAMILIES]);
    expect(TARGET_FAMILIES).toHaveLength(25);
  });

  it("carries provenance and containment as their own relation types", () => {
    const prov = profile.relation_types.find((r) => r.id === PROVENANCE_RELATION_ID)!;
    expect(prov.target_types).toEqual(["lkb:ProvenanceRecord"]);
    expect(prov.fields.find((f) => f.name === "role")!.enum_values).toEqual([
      "source", "derived_from", "quoted_from", "generated_by", "validated_by", "reviewed_by", "asserted_by",
    ]);
    const steps = profile.relation_types.find((r) => r.id === STEP_RELATION_ID)!;
    expect(steps.source_types).toEqual(["lkb:Counterexample", "lkb:DerivationGraph", "lkb:ExplanationTrace", "lkb:ProofTree"]);
    expect((steps.target_types as string[]).length).toBe(19);
    expect(steps.fields.find((f) => f.name === "slot")!.enum_values).toEqual(["steps", "trace"]);
    const elements = profile.relation_types.find((r) => r.id === ELEMENT_RELATION_ID)!;
    expect(elements.source_types).toEqual(["lkb:ProcessModel"]);
    expect((elements.target_types as string[]).length).toBe(8);
  });

  it("declares the two renderers", () => {
    expect(profile.renderers.map((r) => [r.renderer_id, r.output_format])).toEqual([
      [THEORY_RENDERER_ID, "text/markdown"],
      [ARGUMENT_GRAPH_RENDERER_ID, "image/svg+xml"],
    ]);
  });

  it("is deterministic and matches the committed generated/profile.json", () => {
    expect(JSON.parse(JSON.stringify(deriveProfile()))).toEqual(JSON.parse(JSON.stringify(deriveProfile())));
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profileJson);
  });

  it("build-profile.ts --check passes against the committed artefacts", () => {
    const script = join(process.cwd(), "plugins", "logical_knowledge_base", "scripts", "build-profile.ts");
    const out = execFileSync(NODE_COMMAND, tsxArgs([script, "--check"]), { cwd: process.cwd(), encoding: "utf8" });
    expect(out).toContain("current");
  });

  it("pins the derivation's counts", () => {
    // 130 top-level Reference fields collapse to 73 relation types (one per
    // field NAME, as uixo does per property); 194 fields carry the expression
    // language as tagged JSON; 44 nested plain objects become shared structs.
    expect(derivationSummary()).toEqual({
      nodeKinds: 115,
      primitiveTypes: 117,
      relationTypes: 77,
      referenceFields: 130,
      referenceRelationTypes: 73,
      astFields: 194,
      structs: 44,
    });
  });
});
