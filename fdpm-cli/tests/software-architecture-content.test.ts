import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";

/**
 * Content parity between the ported TypeScript plugin and the Python
 * source (src/fdpm/plugins/software_architecture.py).
 *
 * The Python source declares:
 *   15 PrimitiveTypeDef
 *   15 RelationTypeDef
 *    7 ValidationRuleDef
 *    2 RendererBinding
 *    3 TemplateDef
 *    5 CategoryDef
 *    4 ScopeDef
 */

// The 15 primitive ids ported byte-faithfully from
// src/fdpm/plugins/software_architecture.py. These MUST remain registered
// at every revision — they are the public API of the v1.0 profile.
const PYTHON_SOURCE_PRIMITIVE_IDS = [
  "sw:Assumption",
  "sw:Concept",
  "sw:Constraint",
  "sw:Contract",
  "sw:Decision",
  "sw:Endpoint",
  "sw:Entity",
  "sw:Event",
  "sw:Evidence",
  "sw:FailureMode",
  "sw:Guarantee",
  "sw:Invariant",
  "sw:Schema",
  "sw:State",
  "sw:Transition",
];

// Pass-2 additions (gap audit). Additive only — none replace or change the
// shape of a Python-source primitive.
const PASS2_PRIMITIVE_IDS = [
  "sw:Capability",       // gap #8
  "sw:Actor",            // gap #9
  "sw:Stakeholder",      // gap #9
  "sw:Node",             // gap #10
  "sw:QualityAttribute", // gap #6
  "sw:Risk",             // gap #7
  "sw:Viewpoint",        // gap #17
  "sw:View",             // gap #17
];

const EXPECTED_PRIMITIVE_IDS = [
  ...PYTHON_SOURCE_PRIMITIVE_IDS,
  ...PASS2_PRIMITIVE_IDS,
];

const PYTHON_SOURCE_RELATION_IDS = [
  "sw:Assumes",
  "sw:BelongsTo",
  "sw:Constrains",
  "sw:Consumes",
  "sw:DependsOn",
  "sw:Exposes",
  "sw:Implements",
  "sw:InputTo",
  "sw:Justifies",
  "sw:Mitigates",
  "sw:OutputOf",
  "sw:Produces",
  "sw:RefersTo",
  "sw:Supersedes",
  "sw:TriggeredBy",
];

// Pass-2 relation additions (gap audit). Additive only.
const PASS2_RELATION_IDS = [
  "sw:Delivers",       // gap #8 — Entity delivers Capability
  "sw:RealizedBy",     // gap #8 — Capability realized by Endpoint/Event
  "sw:HasConcern",     // gap #9 — Stakeholder has concern about Decision/QA/Risk
  "sw:InteractsWith",  // gap #9 — Actor ↔ Entity/Endpoint/Capability
  "sw:DeployedTo",     // gap #10 — Entity → Node
  "sw:Subscribes",     // gap #11 — Entity → Event (consumer side)
  "sw:Risks",          // gap #7 — anything → Risk
  "sw:DeprecatedBy",   // gap #12 — Endpoint/Schema → Endpoint/Schema
];

// v1.1 relation additions. Driven by sw-arch-rust-cli-greet review.
const V1_1_RELATION_IDS = [
  "sw:Threatens",      // v1.1 — FailureMode → Guarantee/Invariant/Constraint
  "sw:EmbodiedBy",     // v1.1 — Stakeholder → Actor
];

const EXPECTED_RELATION_IDS = [
  ...PYTHON_SOURCE_RELATION_IDS,
  ...PASS2_RELATION_IDS,
  ...V1_1_RELATION_IDS,
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

const PROFILE_ID = "profile:software-architecture:1.0";

describe("software_architecture — content parity with Python source", () => {
  it("preserves the 15 Python-source primitive ids and adds the pass-2 set", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const ids = profile.primitive_types.map((p) => p.id).sort();
    // Python-source baseline — never lose any of these.
    for (const id of PYTHON_SOURCE_PRIMITIVE_IDS) {
      expect(ids).toContain(id);
    }
    // Total set = source + pass-2 additions, no surprises.
    expect(ids).toEqual([...EXPECTED_PRIMITIVE_IDS].sort());
    expect(profile.primitive_types).toHaveLength(EXPECTED_PRIMITIVE_IDS.length);
  });

  it("preserves the 15 Python-source relation ids (pass-2 additions land in slice 3)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const ids = profile.relation_types.map((r) => r.id).sort();
    for (const id of PYTHON_SOURCE_RELATION_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toEqual([...EXPECTED_RELATION_IDS].sort());
    expect(profile.relation_types).toHaveLength(EXPECTED_RELATION_IDS.length);
  });

  it("registers the 7 Python-source validation rules plus 5 pass-2 rules", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    // The 7 Python-source rules ported byte-faithfully (now CEL-form per
    // SPEC-CEL-VALIDATOR), plus 5 pass-2 rules covering Decision chain
    // integrity, Risk impact, Capability realization, Entity deployment,
    // and Endpoint deprecation, plus 2 v1.1 rules (FailureMode/Threatens
    // and Custom-schema/version) driven by the sw-arch-rust-cli-greet
    // review.
    expect(profile.validation_rules).toHaveLength(14);
    const ids = profile.validation_rules.map((r) => r.id).sort();
    expect(ids).toEqual([
      "sw:comp:active-entity-constrained",
      "sw:comp:active-entity-deployed",
      "sw:comp:capability-realized",
      "sw:comp:failure-threatens-something",
      "sw:val:assumption-has-invalidation",
      "sw:val:contract-has-conditions",
      "sw:val:custom-schema-has-version",
      "sw:val:decision-has-alternatives",
      "sw:val:decision-has-rationale",
      "sw:val:decision-superseded-has-successor",
      "sw:val:deprecated-endpoint-has-successor",
      "sw:val:invariant-not-manual",
      "sw:val:non-terminal-state-has-transition",
      "sw:val:risk-high-impact-has-mitigation",
    ]);
  });

  it("registers exactly 2 renderer bindings", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.renderers).toHaveLength(2);
  });

  it("registers the 3 Python-source templates plus 2 pass-2 renderer-bound templates (gap #15)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.templates).toHaveLength(5);
    const ids = profile.templates.map((t) => t.id).sort();
    expect(ids).toEqual([
      "sw:tpl:api-reference",
      "sw:tpl:architecture-overview",
      "sw:tpl:decision-log",
      "sw:tpl:failure-catalog",
      "sw:tpl:openapi-spec",
    ]);
    // Pass-2 templates point at the executable renderers (gap #15: close
    // the catalogue gap the renderers opened).
    const decisionLog = profile.templates.find((t) => t.id === "sw:tpl:decision-log");
    expect(decisionLog?.target_renderer).toBe("sw:ADRRenderer");
    const openapi = profile.templates.find((t) => t.id === "sw:tpl:openapi-spec");
    expect(openapi?.target_renderer).toBe("sw:OpenAPIRenderer");
  });

  it("declares 5 categories and 4 scopes", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.categories).toHaveLength(5);
    expect(profile.scopes).toHaveLength(4);
  });

  it("sw:Decision has the Alternative inline struct with two fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const dec = profile.primitive_types.find((p) => p.id === "sw:Decision");
    expect(dec?.inline_structs).toHaveLength(1);
    expect(dec?.inline_structs[0]?.id).toBe("Alternative");
    expect(dec?.inline_structs[0]?.fields).toHaveLength(2);
  });

  it("sw:Schema has the SchemaField inline struct with five fields", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const sch = profile.primitive_types.find((p) => p.id === "sw:Schema");
    expect(sch?.inline_structs).toHaveLength(1);
    expect(sch?.inline_structs[0]?.id).toBe("SchemaField");
    expect(sch?.inline_structs[0]?.fields).toHaveLength(5);
  });

  it("sw:Contract has the ErrorCondition inline struct with the documented field set", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const con = profile.primitive_types.find((p) => p.id === "sw:Contract");
    expect(con?.inline_structs).toHaveLength(1);
    expect(con?.inline_structs[0]?.id).toBe("ErrorCondition");
    // Pass-2 extension (gap #2): the original three Python-source fields
    // (name, condition, response) plus three optional fields used by the
    // OpenAPI renderer to emit typed responses.
    const fields = con?.inline_structs[0]?.fields.map((f) => f.name) ?? [];
    expect(fields).toEqual([
      "name",
      "condition",
      "response",
      "status_code",
      "schema_id",
      "media_type",
    ]);
    // The added fields are optional (legacy ErrorCondition documents stay valid).
    const optionalNames = con?.inline_structs[0]?.fields
      .filter((f) => f.required === false)
      .map((f) => f.name) ?? [];
    expect(optionalNames).toEqual(["status_code", "schema_id", "media_type"]);
  });

  it("sw:Transition declares the no_self_transition type-level constraint", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const tr = profile.primitive_types.find((p) => p.id === "sw:Transition");
    expect(tr?.constraints).toHaveLength(1);
    expect(tr?.constraints[0]?.name).toBe("no_self_transition");
    expect(tr?.constraints[0]?.expression).toBe("not_equal(from_state, to_state)");
    expect(tr?.constraints[0]?.level).toBe("error");
  });

  it("sw:Assumes and sw:RefersTo accept any source type (wildcard)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const assumes = profile.relation_types.find((r) => r.id === "sw:Assumes");
    const refers = profile.relation_types.find((r) => r.id === "sw:RefersTo");
    expect(assumes?.source_types).toBe("*");
    expect(refers?.source_types).toBe("*");
  });

  it("sw:DependsOn is transitive; sw:Supersedes is transitive", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const dep = profile.relation_types.find((r) => r.id === "sw:DependsOn");
    const sup = profile.relation_types.find((r) => r.id === "sw:Supersedes");
    expect(dep?.transitive).toBe(true);
    expect(sup?.transitive).toBe(true);
  });

  it("sw:BelongsTo enforces source cardinality 1..1", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const bt = profile.relation_types.find((r) => r.id === "sw:BelongsTo");
    expect(bt?.cardinality_bounds?.source_min).toBe(1);
    expect(bt?.cardinality_bounds?.source_max).toBe(1);
  });

  it("sw:Entity is scoped and uses the {scope}:{kind}:{name} id template", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    const ent = profile.primitive_types.find((p) => p.id === "sw:Entity");
    expect(ent?.scoped).toBe(true);
    expect(ent?.id_format.pattern).toBe("{scope}:{kind}:{name}");
  });

  it("scope_sets is empty and default_scope_set is '' (Python source parity)", async () => {
    const host = await loadHostWithPlugin();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.scope_sets).toEqual({});
    expect(profile.default_scope_set).toBe("");
  });

  it(
    "Decision.alternatives, Schema.fields, Contract.error_conditions are " +
      "single StructField (no [] suffix) — Python parity",
    async () => {
      const { PROFILE } = await import("../plugins/software_architecture/index.js");
      const find = (id: string, name: string) =>
        PROFILE.primitive_types.find((p) => p.id === id)!.fields.find((f) => f.name === name)!;
      expect(find("sw:Decision", "alternatives").legacy_type).toBe("StructField[Alternative]");
      expect(find("sw:Schema", "fields").legacy_type).toBe("StructField[SchemaField]");
      expect(find("sw:Contract", "error_conditions").legacy_type).toBe(
        "StructField[ErrorCondition]",
      );
    },
  );

  it("StableID reference fields carry a 'references' validation pointing at the target type", async () => {
    const { PROFILE } = await import("../plugins/software_architecture/index.js");
    const find = (id: string, name: string) =>
      PROFILE.primitive_types.find((p) => p.id === id)!.fields.find((f) => f.name === name)!;
    const stateEntity = find("sw:State", "entity_id");
    expect(stateEntity.legacy_type).toBe("StableID");
    const ref = stateEntity.validations?.find((v) => v.kind === "references");
    expect(ref?.value).toBe("sw:Entity");
    expect(find("sw:Event", "schema_id").validations?.find((v) => v.kind === "references")?.value).toBe(
      "sw:Schema",
    );
  });
});
