import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { PROFILE } from "../plugins/software_architecture/index.js";
import {
  projectThroughView,
  projectThroughViewInstance,
  isIdentityFilter,
} from "../plugins/software_architecture/renderers/_view.js";

/**
 * Pass-2 gap-audit coverage.
 *
 * One describe block per gap from docs/cli-architecture.md (the audit). Each
 * test asserts that the plugin can now CARRY the data the audit said it
 * couldn't, and — where renderers consume it — that the rendered output
 * surfaces it. Tests intentionally split between schema-level claims
 * (PROFILE) and runtime claims (Host.createPrimitive must accept the new
 * shapes without validation errors).
 */

const PROFILE_ID = "profile:software-architecture:1.0";

function findType(typeId: string) {
  const t = PROFILE.primitive_types.find((p) => p.id === typeId);
  if (!t) throw new Error(`type ${typeId} missing from PROFILE`);
  return t;
}
function findRel(relId: string) {
  const r = PROFILE.relation_types.find((rt) => rt.id === relId);
  if (!r) throw new Error(`relation ${relId} missing from PROFILE`);
  return r;
}
function findField(typeId: string, fieldName: string) {
  const f = findType(typeId).fields.find((x) => x.name === fieldName);
  if (!f) throw new Error(`field ${typeId}.${fieldName} missing`);
  return f;
}

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

// ---------------------------------------------------------------------------
// Gap #1 — sw:Decision.date / deciders / last_reviewed_at
// ---------------------------------------------------------------------------
describe("gap #1 — Decision carries date, deciders, last_reviewed_at", () => {
  it("PROFILE schema declares the three new optional fields on sw:Decision", () => {
    const date = findField("sw:Decision", "date");
    expect(date.legacy_type).toBe("ISO8601");
    expect(date.required).toBe(false);
    const deciders = findField("sw:Decision", "deciders");
    expect(deciders.legacy_type).toBe("string[]");
    expect(deciders.required).toBe(false);
    const lr = findField("sw:Decision", "last_reviewed_at");
    expect(lr.legacy_type).toBe("ISO8601");
    expect(lr.required).toBe(false);
  });

  it("Host accepts a Decision with date + deciders + last_reviewed_at populated", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "g1",
      name: "g1",
      profile_id: PROFILE_ID,
    });
    const r = await host.createPrimitive("g1", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "Pick X",
        context: "Forces Y",
        rationale: "Because Z",
        alternatives: { name: "W", reason_rejected: "doesn't fit" },
        consequences: "Q",
        date: "2026-05-04",
        deciders: ["alice", "platform-team"],
        last_reviewed_at: "2026-05-04",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #2 — Contract.error_conditions: status_code / schema_id / media_type
// ---------------------------------------------------------------------------
describe("gap #2 — ErrorCondition has status_code / schema_id / media_type", () => {
  it("PROFILE inline_struct ErrorCondition lists the three new optional fields", () => {
    const c = findType("sw:Contract");
    const ec = (c.inline_structs ?? []).find((s) => s.id === "ErrorCondition");
    expect(ec).toBeDefined();
    const names = ec!.fields.map((f) => f.name);
    expect(names).toEqual([
      "name",
      "condition",
      "response",
      "status_code",
      "schema_id",
      "media_type",
    ]);
    for (const opt of ["status_code", "schema_id", "media_type"]) {
      const f = ec!.fields.find((x) => x.name === opt)!;
      expect(f.required, `ErrorCondition.${opt} must be optional`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Gap #3 — Endpoint.parameters
// ---------------------------------------------------------------------------
describe("gap #3 — Endpoint declares typed parameters", () => {
  it("PROFILE schema declares Parameter inline_struct with the documented shape", () => {
    const ep = findType("sw:Endpoint");
    const param = (ep.inline_structs ?? []).find((s) => s.id === "Parameter");
    expect(param).toBeDefined();
    const names = param!.fields.map((f) => f.name);
    expect(names).toEqual([
      "name",
      "in",
      "required",
      "description",
      "type",
      "schema_id",
    ]);
    const inField = param!.fields.find((f) => f.name === "in")!;
    expect(inField.legacy_type).toMatch(/Enum/);
  });

  it("Host accepts an Endpoint with typed path + query parameters", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g3", name: "g3", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("g3", {
      id: "endpoint:GET:order",
      type_id: "sw:Endpoint",
      field_values: {
        name: "Get order",
        protocol: "HTTP",
        method: "GET",
        path: "/orders/{id}",
        parameters: {
          name: "id",
          in: "path",
          required: true,
          type: "uuid",
          description: "Order id.",
        },
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #4 — Constraint.slo (typed SLO struct)
// ---------------------------------------------------------------------------
describe("gap #4 — Constraint carries an optional structured SLO", () => {
  it("PROFILE schema declares Slo inline_struct with comparator enum", () => {
    const c = findType("sw:Constraint");
    const slo = (c.inline_structs ?? []).find((s) => s.id === "Slo");
    expect(slo).toBeDefined();
    const names = slo!.fields.map((f) => f.name);
    expect(names).toEqual([
      "name",
      "expression",
      "comparator",
      "target",
      "unit",
      "window",
    ]);
    const cmp = slo!.fields.find((f) => f.name === "comparator")!;
    expect(cmp.legacy_type).toBe('Enum["lt", "le", "eq", "ge", "gt"]');
  });

  it("Host accepts a Constraint with a fully populated SLO", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g4", name: "g4", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("g4", {
      id: "constraint:runtime:p99-latency",
      type_id: "sw:Constraint",
      scope_id: "scope:sw:runtime",
      field_values: {
        statement: "p99 latency stays below 300ms over 7d.",
        slo: {
          name: "p99-charge-latency",
          expression: "histogram_quantile(0.99, charge_latency)",
          comparator: "lt",
          target: "300ms",
          unit: "ms",
          window: "7d",
        },
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("legacy `metric: string` form still parses (backwards compat)", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g4b", name: "g4b", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("g4b", {
      id: "constraint:runtime:throughput",
      type_id: "sw:Constraint",
      scope_id: "scope:sw:runtime",
      field_values: {
        statement: "1000 rps sustained.",
        metric: "rate(http_requests_total[1m])",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #5 — DependsOn.kind widened + direction
// ---------------------------------------------------------------------------
describe("gap #5 — DependsOn metadata covers more dependency kinds + direction", () => {
  it("PROFILE schema widens kind enum to the documented set", () => {
    const dep = findRel("sw:DependsOn");
    const kind = (dep.metadata_schema ?? []).find((m) => m.name === "kind")!;
    expect(kind.legacy_type).toBe(
      'Enum["compile", "runtime", "data", "network", "build", "test-only", "dev", "optional"]',
    );
  });

  it("PROFILE schema declares an optional `direction` metadata field", () => {
    const dep = findRel("sw:DependsOn");
    const dir = (dep.metadata_schema ?? []).find((m) => m.name === "direction")!;
    expect(dir).toBeDefined();
    expect(dir.required).toBe(false);
    expect(dir.legacy_type).toBe('Enum["forward", "reverse", "bidirectional"]');
  });

  it("Host accepts a DependsOn relation with new kinds + direction", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g5", name: "g5", profile_id: PROFILE_ID });
    for (const id of ["domain:Service:A", "domain:Service:B"]) {
      await host.createPrimitive("g5", {
        id,
        type_id: "sw:Entity",
        scope_id: "scope:sw:domain",
        field_values: {
          kind: "Service",
          name: id.split(":").pop(),
          lifecycle: "Active",
          description: "x",
        },
      });
    }
    const r = await host.createRelation("g5", {
      id: "rel:a-network-b",
      type_id: "sw:DependsOn",
      source_id: "domain:Service:A",
      target_id: "domain:Service:B",
      field_values: { kind: "network", direction: "forward" },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #6 — sw:QualityAttribute primitive
// ---------------------------------------------------------------------------
describe("gap #6 — sw:QualityAttribute primitive", () => {
  it("is registered with the ATAM-style scenario field set", () => {
    const qa = findType("sw:QualityAttribute");
    const names = qa.fields.map((f) => f.name);
    expect(names).toEqual([
      "name",
      "category",
      "source",
      "stimulus",
      "environment",
      "artifact",
      "response",
      "response_measure",
    ]);
  });

  it("Host accepts a QualityAttribute scenario", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g6", name: "g6", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("g6", {
      id: "qa:Performance:burst-write",
      type_id: "sw:QualityAttribute",
      scope_id: "scope:sw:runtime",
      field_values: {
        name: "burst-write",
        category: "Performance",
        source: "External client",
        stimulus: "1000 RPS sustained for 60s",
        environment: "Production, normal load",
        artifact: "Write path of the storage service",
        response: "All requests acknowledged within latency target",
        response_measure: "p99 < 200ms over the 60s burst",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #7 — sw:Risk primitive + sw:Risks relation
// ---------------------------------------------------------------------------
describe("gap #7 — sw:Risk primitive and sw:Risks relation", () => {
  it("Risk primitive declares title / likelihood / impact / mitigation", () => {
    const risk = findType("sw:Risk");
    const names = risk.fields.map((f) => f.name);
    expect(names).toContain("title");
    expect(names).toContain("likelihood");
    expect(names).toContain("impact");
    expect(names).toContain("mitigation");
    expect(names).toContain("owner");
    expect(names).toContain("review_by");
    expect(names).toContain("tags");
  });

  it("Risks relation has wildcard source and Risk target", () => {
    const r = findRel("sw:Risks");
    expect(r.source_types).toBe("*");
    expect(r.target_types).toEqual(["sw:Risk"]);
  });

  it("Host accepts a Risk + a wildcard-source Risks relation from a Decision", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g7", name: "g7", profile_id: PROFILE_ID });
    await host.createPrimitive("g7", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "X",
        context: "y",
        rationale: "z",
        alternatives: { name: "W", reason_rejected: "x" },
        consequences: "q",
      },
    });
    await host.createPrimitive("g7", {
      id: "risk:domain:vendor-lockin",
      type_id: "sw:Risk",
      scope_id: "scope:sw:domain",
      field_values: {
        name: "vendor-lockin",
        title: "Storage vendor lock-in if X is adopted.",
        likelihood: "Medium",
        impact: "High",
        mitigation: "Maintain a portable interface; quarterly re-eval.",
        owner: "platform-team",
        tags: ["supply-chain", "strategic"],
      },
    });
    const r = await host.createRelation("g7", {
      id: "rel:decision-risks",
      type_id: "sw:Risks",
      source_id: "decision:0001",
      target_id: "risk:domain:vendor-lockin",
    });
    expect(r.report.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap #8 — sw:Capability primitive + Delivers / RealizedBy relations
// ---------------------------------------------------------------------------
describe("gap #8 — Capability primitive plus Delivers / RealizedBy relations", () => {
  it("Capability declares name / summary / maturity", () => {
    const cap = findType("sw:Capability");
    const names = cap.fields.map((f) => f.name);
    expect(names).toEqual(["name", "summary", "maturity"]);
  });

  it("Delivers source = sw:Entity, target = sw:Capability", () => {
    const d = findRel("sw:Delivers");
    expect(d.source_types).toEqual(["sw:Entity"]);
    expect(d.target_types).toEqual(["sw:Capability"]);
  });

  it("RealizedBy source = sw:Capability, target = Endpoint or Event", () => {
    const r = findRel("sw:RealizedBy");
    expect(r.source_types).toEqual(["sw:Capability"]);
    expect(r.target_types).toEqual(["sw:Endpoint", "sw:Event"]);
  });
});

// ---------------------------------------------------------------------------
// Gap #9 — Actor + Stakeholder + HasConcern + InteractsWith
// ---------------------------------------------------------------------------
describe("gap #9 — Actor + Stakeholder + HasConcern + InteractsWith", () => {
  it("Actor declares name / kind / description with kind ∈ {Person, System, Bot}", () => {
    const a = findType("sw:Actor");
    const kind = a.fields.find((f) => f.name === "kind")!;
    expect(kind.legacy_type).toBe('Enum["Person", "System", "Bot"]');
  });

  it("Stakeholder requires concerns (min_items 1)", () => {
    const s = findType("sw:Stakeholder");
    const concerns = s.fields.find((f) => f.name === "concerns")!;
    expect(concerns.legacy_type).toBe("string[]");
    const minItems = concerns.validations.find((v) => v.kind === "min_items");
    expect(minItems?.value).toBe(1);
  });

  it("HasConcern targets Decision / QualityAttribute / Risk", () => {
    const r = findRel("sw:HasConcern");
    expect(r.source_types).toEqual(["sw:Stakeholder"]);
    expect(r.target_types).toEqual(["sw:Decision", "sw:QualityAttribute", "sw:Risk"]);
  });

  it("InteractsWith is from Actor to Entity / Endpoint / Capability", () => {
    const r = findRel("sw:InteractsWith");
    expect(r.source_types).toEqual(["sw:Actor"]);
    expect(r.target_types).toEqual(["sw:Entity", "sw:Endpoint", "sw:Capability"]);
  });
});

// ---------------------------------------------------------------------------
// Gap #10 — sw:Node primitive + sw:DeployedTo relation
// ---------------------------------------------------------------------------
describe("gap #10 — Node primitive + DeployedTo relation", () => {
  it("Node declares name / kind / multiplicity / placement", () => {
    const n = findType("sw:Node");
    const names = n.fields.map((f) => f.name);
    expect(names).toEqual(["name", "kind", "multiplicity", "placement"]);
    const kind = n.fields.find((f) => f.name === "kind")!;
    expect(kind.legacy_type).toContain("Container");
    expect(kind.legacy_type).toContain("ManagedService");
  });

  it("DeployedTo from Entity to Node, with optional instance_count metadata", () => {
    const r = findRel("sw:DeployedTo");
    expect(r.source_types).toEqual(["sw:Entity"]);
    expect(r.target_types).toEqual(["sw:Node"]);
    const m = r.metadata_schema?.find((x) => x.name === "instance_count");
    expect(m?.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gap #11 — sw:Subscribes (event-consumer side)
// ---------------------------------------------------------------------------
describe("gap #11 — Subscribes relation closes the Produces ↔ Subscribes pair", () => {
  it("Subscribes is the dual of Produces (Entity → Event with delivery semantics metadata)", () => {
    const r = findRel("sw:Subscribes");
    expect(r.source_types).toEqual(["sw:Entity"]);
    expect(r.target_types).toEqual(["sw:Event"]);
    const delivery = r.metadata_schema?.find((m) => m.name === "delivery")!;
    expect(delivery.legacy_type).toBe(
      'Enum["at-most-once", "at-least-once", "exactly-once"]',
    );
    expect(delivery.required).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gap #12 — Endpoint/Schema deprecation flags + DeprecatedBy chain
// ---------------------------------------------------------------------------
describe("gap #12 — Endpoint and Schema carry deprecation flags + DeprecatedBy", () => {
  it("Endpoint has optional `deprecated` and `deprecated_since`", () => {
    const dep = findField("sw:Endpoint", "deprecated");
    expect(dep.required).toBe(false);
    expect(dep.legacy_type).toBe("boolean");
    const since = findField("sw:Endpoint", "deprecated_since");
    expect(since.required).toBe(false);
  });

  it("Schema has optional `deprecated` and `version`", () => {
    expect(findField("sw:Schema", "deprecated").required).toBe(false);
    expect(findField("sw:Schema", "version").required).toBe(false);
  });

  it("DeprecatedBy is transitive and chains Endpoints/Schemas", () => {
    const r = findRel("sw:DeprecatedBy");
    expect(r.transitive).toBe(true);
    expect(r.source_types).toEqual(["sw:Endpoint", "sw:Schema"]);
    expect(r.target_types).toEqual(["sw:Endpoint", "sw:Schema"]);
  });
});

// ---------------------------------------------------------------------------
// Gap #13 — last_reviewed_at provenance fields
// ---------------------------------------------------------------------------
describe("gap #13 — provenance: last_reviewed_at on Decision/Assumption/Constraint/Guarantee", () => {
  for (const typeId of [
    "sw:Decision",
    "sw:Assumption",
    "sw:Constraint",
    "sw:Guarantee",
  ]) {
    it(`${typeId} has optional last_reviewed_at (ISO8601)`, () => {
      const f = findField(typeId, "last_reviewed_at");
      expect(f.required).toBe(false);
      expect(f.legacy_type).toBe("ISO8601");
    });
  }
});

// ---------------------------------------------------------------------------
// Gap #14 — UPDATE: closed by SPEC-CEL-VALIDATOR (shipped 2026-05-04). The
// 7 rules now carry CEL `expression` strings alongside the legacy `predicate`
// strings; the host evaluates them via cli/src/core/validation/cel/. These
// tests pin the migration so a future regression that drops the CEL form
// fails loudly here.
// ---------------------------------------------------------------------------
describe("gap #14 — sw rules carry CEL expressions and are wired through the §7 pipeline", () => {
  it("PROFILE ships the 7 Python-source rules + 5 pass-2 rules + 2 v1.1 rules in CEL form", () => {
    expect(PROFILE.validation_rules).toHaveLength(14);
  });

  it("every sw rule has a non-empty CEL `expression` field (post SPEC-CEL-VALIDATOR migration)", () => {
    // Rules that cannot be expressed under the current activation contract
    // are allowed to ship with `expression: "true"` as a documented no-op
    // (see sw:val:non-terminal-state-has-transition). Their `predicate`
    // string preserves the original intent for any future helper.
    const NOOP_BY_DESIGN = new Set(["sw:val:non-terminal-state-has-transition"]);
    for (const r of PROFILE.validation_rules) {
      const exprValue = (r as unknown as { expression?: unknown }).expression;
      const expression = typeof exprValue === "string" ? exprValue : "";
      expect(expression.length, `rule ${r.id} missing CEL expression`).toBeGreaterThan(0);
      if (NOOP_BY_DESIGN.has(r.id)) {
        expect(expression, `rule ${r.id} should be the documented no-op`).toBe("true");
        continue;
      }
      // Distinct from the legacy DSL `predicate` — the migration is real,
      // not a renamed string.
      expect(expression, `rule ${r.id} CEL expression must reference instance.*`).toMatch(
        /instance\.|graph\./,
      );
    }
  });

  it("every sw rule retains its legacy `predicate` for documentation provenance", () => {
    for (const r of PROFILE.validation_rules) {
      const predicate = (r as unknown as { predicate?: string }).predicate ?? "";
      expect(predicate.length, `rule ${r.id} lost its legacy predicate`).toBeGreaterThan(0);
    }
  });

  it("pass-2 rules reference fields/relations introduced by the gap audit", () => {
    const byId = new Map(PROFILE.validation_rules.map((r) => [r.id, r]));
    const pass2Rules = [
      "sw:val:decision-superseded-has-successor",
      "sw:val:risk-high-impact-has-mitigation",
      "sw:comp:capability-realized",
      "sw:comp:active-entity-deployed",
      "sw:val:deprecated-endpoint-has-successor",
    ];
    for (const id of pass2Rules) {
      expect(byId.has(id), `pass-2 rule ${id} missing`).toBe(true);
    }
    // Spot-check that specific pass-2 rules call the expected CEL fragment.
    const supersededRule = byId.get("sw:val:decision-superseded-has-successor")!;
    expect((supersededRule as unknown as { expression: string }).expression).toContain(
      'graph.incoming("sw:Supersedes")',
    );
    const capRule = byId.get("sw:comp:capability-realized")!;
    expect((capRule as unknown as { expression: string }).expression).toContain(
      'graph.outgoing("sw:RealizedBy")',
    );
    const deployRule = byId.get("sw:comp:active-entity-deployed")!;
    expect((deployRule as unknown as { expression: string }).expression).toContain(
      'graph.outgoing("sw:DeployedTo")',
    );
  });
});

// ---------------------------------------------------------------------------
// Gap #15 — templates pointing at the executable renderers
// ---------------------------------------------------------------------------
describe("gap #15 — template catalogue includes ADR + OpenAPI bindings", () => {
  it("sw:tpl:decision-log targets sw:ADRRenderer", () => {
    const t = PROFILE.templates.find((x) => x.id === "sw:tpl:decision-log")!;
    expect(t).toBeDefined();
    expect(t.target_renderer).toBe("sw:ADRRenderer");
  });
  it("sw:tpl:openapi-spec targets sw:OpenAPIRenderer", () => {
    const t = PROFILE.templates.find((x) => x.id === "sw:tpl:openapi-spec")!;
    expect(t).toBeDefined();
    expect(t.target_renderer).toBe("sw:OpenAPIRenderer");
  });
});

// ---------------------------------------------------------------------------
// Gap #16 — Entity.kind enum widening
// ---------------------------------------------------------------------------
describe("gap #16 — Entity.kind enum includes Library and DataStore", () => {
  it("PROFILE Entity.kind enum widens to include the two new values", () => {
    const kind = findField("sw:Entity", "kind");
    expect(kind.legacy_type).toContain('"Library"');
    expect(kind.legacy_type).toContain('"DataStore"');
  });

  it("Host accepts Entities with the new kinds", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g16", name: "g16", profile_id: PROFILE_ID });
    for (const k of ["Library", "DataStore"]) {
      const r = await host.createPrimitive("g16", {
        id: `domain:${k}:Test${k}`,
        type_id: "sw:Entity",
        scope_id: "scope:sw:domain",
        field_values: {
          kind: k,
          name: `Test${k}`,
          lifecycle: "Active",
          description: `A test ${k}.`,
        },
      });
      expect(r.report.accepted).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Gap #17 — sw:View / sw:Viewpoint + projection
// ---------------------------------------------------------------------------
describe("gap #17 — Viewpoint + View primitives + view-projection helper", () => {
  it("Viewpoint declares concerns (min_items 1) and optional model_kinds", () => {
    const vp = findType("sw:Viewpoint");
    const concerns = vp.fields.find((f) => f.name === "concerns")!;
    const minItems = concerns.validations.find((v) => v.kind === "min_items");
    expect(minItems?.value).toBe(1);
    const mk = vp.fields.find((f) => f.name === "model_kinds")!;
    expect(mk.required).toBe(false);
  });

  it("View binds to a Viewpoint via stableId and lists optional included filters", () => {
    const v = findType("sw:View");
    const vp = v.fields.find((f) => f.name === "viewpoint_id")!;
    expect(vp.legacy_type).toBe("StableID");
    expect(vp.validations.some((x) => x.kind === "references" && x.value === "sw:Viewpoint")).toBe(true);
    for (const opt of [
      "included_categories",
      "included_scope_ids",
      "included_type_ids",
      "stakeholder_ids",
    ]) {
      const f = v.fields.find((x) => x.name === opt)!;
      expect(f.required, `${opt} should be optional`).toBe(false);
    }
  });

  it("isIdentityFilter detects an empty filter", () => {
    expect(isIdentityFilter({})).toBe(true);
    expect(isIdentityFilter({ included_categories: [] })).toBe(true);
    expect(isIdentityFilter({ included_categories: ["cat:identity"] })).toBe(false);
  });

  it("projectThroughView intersects category / scope / type filters and drops dangling relations", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g17", name: "g17", profile_id: PROFILE_ID });
    await host.createPrimitive("g17", {
      id: "domain:Service:Foo",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: { kind: "Service", name: "Foo", lifecycle: "Active", description: "x" },
    });
    await host.createPrimitive("g17", {
      id: "deployment:Infrastructure:DB",
      type_id: "sw:Entity",
      scope_id: "scope:sw:deployment",
      field_values: { kind: "Infrastructure", name: "DB", lifecycle: "Active", description: "x" },
    });
    await host.createPrimitive("g17", {
      id: "concept:Order",
      type_id: "sw:Concept",
      scope_id: "scope:sw:domain",
      field_values: { name: "Order", definition: "An order placed by a customer." },
    });
    await host.createRelation("g17", {
      id: "rel:foo-deps-db",
      type_id: "sw:DependsOn",
      source_id: "domain:Service:Foo",
      target_id: "deployment:Infrastructure:DB",
      field_values: { kind: "runtime" },
    });
    const slice = host.getProject("g17");
    const profile = host.profiles.getResolved(slice.project.profile_id);

    // domain-only filter should keep Foo + Order, drop DB, drop the relation.
    const domainOnly = projectThroughView(
      {
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { included_scope_ids: ["scope:sw:domain"] },
    );
    expect(domainOnly.primitives.map((p) => p.id).sort()).toEqual([
      "concept:Order",
      "domain:Service:Foo",
    ]);
    expect(domainOnly.relations).toHaveLength(0);
    expect(domainOnly.excludedPrimitiveIds).toContain("deployment:Infrastructure:DB");

    // type-only filter to Concepts.
    const conceptsOnly = projectThroughView(
      {
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { included_type_ids: ["sw:Concept"] },
    );
    expect(conceptsOnly.primitives.map((p) => p.id)).toEqual(["concept:Order"]);

    // identity filter is the no-op.
    const identity = projectThroughView(
      {
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      {},
    );
    expect(identity.primitives.length).toBe(slice ? 3 : 0);
    expect(identity.relations.length).toBe(1);
  });

  it("projectThroughViewInstance reads filters off a sw:View primitive", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "g17b", name: "g17b", profile_id: PROFILE_ID });
    await host.createPrimitive("g17b", {
      id: "viewpoint:logical",
      type_id: "sw:Viewpoint",
      field_values: {
        name: "logical",
        description: "Domain-side logical view.",
        concerns: ["domain coherence"],
      },
    });
    await host.createPrimitive("g17b", {
      id: "view:logical:domain-only",
      type_id: "sw:View",
      field_values: {
        name: "domain-only",
        viewpoint_id: "viewpoint:logical",
        summary: "Just the domain scope.",
        included_scope_ids: ["scope:sw:domain"],
      },
    });
    await host.createPrimitive("g17b", {
      id: "concept:Order",
      type_id: "sw:Concept",
      scope_id: "scope:sw:domain",
      field_values: { name: "Order", definition: "Customer order." },
    });
    await host.createPrimitive("g17b", {
      id: "deployment:Infrastructure:DB",
      type_id: "sw:Entity",
      scope_id: "scope:sw:deployment",
      field_values: { kind: "DataStore", name: "DB", lifecycle: "Active", description: "x" },
    });
    const slice = host.getProject("g17b");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const viewPrim = slice.primitives["view:logical:domain-only"]!;

    const proj = projectThroughViewInstance(
      {
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      viewPrim,
    );
    // domain scope kept; deployment scope dropped. The View itself has no
    // scope_id at all (it is unscoped) so it doesn't survive a scope filter.
    expect(proj.primitives.map((p) => p.id).sort()).toEqual(["concept:Order"]);
  });

  it("projectThroughViewInstance refuses non-View primitives", () => {
    expect(() =>
      projectThroughViewInstance(
        { primitives: [], relations: [], profile: PROFILE },
        {
          id: "concept:X",
          type_id: "sw:Concept",
          scope_id: "scope:sw:domain",
          field_values: {},
          revision: 0,
        },
      ),
    ).toThrow(/expected type_id sw:View/);
  });
});

// ---------------------------------------------------------------------------
// Stabilization (pass-3) — sw:val:non-terminal-state-has-transition can not
// be expressed in CEL under the current activation contract because
// sw:Transition is a primitive, not a relation, and the link to the State
// is a field reference (Transition.from_state). The rule is listed but
// cannot fire as a violation. These tests pin that contract so a future
// edit doesn't accidentally re-introduce the false-positive behaviour.
// ---------------------------------------------------------------------------
describe("stabilization — non-terminal-state-has-transition is a noop until a primitive-by-field helper exists", () => {
  it("the rule's CEL expression is `true` (cannot detect violations under current activation)", () => {
    const r = PROFILE.validation_rules.find(
      (x) => x.id === "sw:val:non-terminal-state-has-transition",
    )!;
    expect((r as unknown as { expression: string }).expression).toBe("true");
  });

  it("creating a non-terminal State without any Transition does NOT emit a warning under the current contract", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "stab1", name: "x", profile_id: PROFILE_ID });
    // Need an Entity for the State.entity_id stableId reference.
    await host.createPrimitive("stab1", {
      id: "domain:Service:Foo",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Foo",
        lifecycle: "Proposed",  // avoid active-entity-deployed warning
        description: "x",
      },
    });
    const r = await host.createPrimitive("stab1", {
      id: "state:Foo:Pending",
      type_id: "sw:State",
      field_values: {
        entity_id: "domain:Service:Foo",
        name: "Pending",
        terminal: false,
      },
    });
    expect(r.report.accepted).toBe(true);
    // The rule must NOT fire — even though there's no Transition, the rule
    // cannot detect that under the current activation contract.
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:val:non-terminal-state-has-transition",
      ),
    ).toBe(false);
  });

  it("creating a terminal State emits no warning either (terminal short-circuits even when CEL fires)", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "stab2", name: "x", profile_id: PROFILE_ID });
    await host.createPrimitive("stab2", {
      id: "domain:Service:Foo",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Foo",
        lifecycle: "Proposed",
        description: "x",
      },
    });
    const r = await host.createPrimitive("stab2", {
      id: "state:Foo:Done",
      type_id: "sw:State",
      field_values: {
        entity_id: "domain:Service:Foo",
        name: "Done",
        terminal: true,
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:val:non-terminal-state-has-transition",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CEL rule firing — verify each new pass-2 rule actually evaluates against
// real instances. Each block tests both the satisfied path (no finding) and
// the violated path (the rule fires at its declared level). These tests
// exist *because* SPEC-CEL-VALIDATOR shipped — without CEL evaluation, none
// of these rules would do anything observable.
// ---------------------------------------------------------------------------
describe("pass-2 CEL rules fire end-to-end (relies on SPEC-CEL-VALIDATOR)", () => {
  it("sw:val:decision-superseded-has-successor REJECTS a Superseded decision with no incoming Supersedes edge", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel1", name: "x", profile_id: PROFILE_ID });
    // Create as Accepted first so the "alternatives" + rationale gates pass,
    // then attempt to flip to Superseded with no successor — must fail.
    await host.createPrimitive("cel1", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "x",
        context: "y",
        rationale: "z",
        alternatives: { name: "w", reason_rejected: "n" },
        consequences: "q",
      },
    });
    let caught: unknown = null;
    try {
      await host.replacePrimitive("cel1", {
        id: "decision:0001",
        type_id: "sw:Decision",
        scope_id: "scope:sw:domain",
        field_values: {
          status: "Superseded",
          title: "x",
          context: "y",
          rationale: "z",
          alternatives: { name: "w", reason_rejected: "n" },
          consequences: "q",
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught as { findings?: Array<{ rule_id: string; level: string }> })
      .findings ?? [];
    const fired = findings.find(
      (f) => f.rule_id === "sw:val:decision-superseded-has-successor" && f.level === "error",
    );
    expect(fired, "sw:val:decision-superseded-has-successor must fire").toBeDefined();
  });

  it("sw:val:decision-superseded-has-successor PASSES once the Supersedes chain exists", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel1b", name: "x", profile_id: PROFILE_ID });
    await host.createPrimitive("cel1b", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "old",
        context: "x",
        rationale: "x",
        alternatives: { name: "w", reason_rejected: "n" },
        consequences: "x",
      },
    });
    await host.createPrimitive("cel1b", {
      id: "decision:0002",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "new",
        context: "x",
        rationale: "x",
        alternatives: { name: "w", reason_rejected: "n" },
        consequences: "x",
      },
    });
    await host.createRelation("cel1b", {
      id: "rel:supersedes",
      type_id: "sw:Supersedes",
      source_id: "decision:0002",
      target_id: "decision:0001",
    });
    const result = await host.replacePrimitive("cel1b", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Superseded",
        title: "old",
        context: "x",
        rationale: "x",
        alternatives: { name: "w", reason_rejected: "n" },
        consequences: "x",
      },
    });
    expect(result.report.accepted).toBe(true);
  });

  it("sw:val:risk-high-impact-has-mitigation REJECTS a High-impact Risk with whitespace mitigation", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel2", name: "x", profile_id: PROFILE_ID });
    let caught: unknown = null;
    try {
      await host.createPrimitive("cel2", {
        id: "risk:domain:bad",
        type_id: "sw:Risk",
        scope_id: "scope:sw:domain",
        field_values: {
          name: "bad",
          title: "Some risk.",
          likelihood: "Low",
          impact: "High",
          mitigation: "   ", // whitespace-only — trim().size() == 0
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught as { findings?: Array<{ rule_id: string; level: string }> })
      .findings ?? [];
    expect(
      findings.some(
        (f) => f.rule_id === "sw:val:risk-high-impact-has-mitigation" && f.level === "error",
      ),
    ).toBe(true);
  });

  it("sw:val:risk-high-impact-has-mitigation does NOT fire when impact != High", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel2b", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel2b", {
      id: "risk:domain:ok",
      type_id: "sw:Risk",
      scope_id: "scope:sw:domain",
      field_values: {
        name: "ok",
        title: "Low-impact risk.",
        likelihood: "Low",
        impact: "Low",
        mitigation: "   ", // empty trim — but rule only fires for High
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("sw:comp:capability-realized FIRES (warning) when a Capability has no RealizedBy edges", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel3", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel3", {
      id: "capability:domain:Search",
      type_id: "sw:Capability",
      scope_id: "scope:sw:domain",
      field_values: {
        name: "Search",
        summary: "Full-text search across the catalogue.",
        maturity: "Beta",
      },
    });
    // Warning-level rules don't reject; verify the finding is in the report.
    expect(r.report.accepted).toBe(true);
    const fired = r.report.findings.find(
      (f) => f.rule_id === "sw:comp:capability-realized" && f.level === "warning",
    );
    expect(fired, "sw:comp:capability-realized warning must surface").toBeDefined();
  });

  it("sw:comp:active-entity-deployed FIRES (warning) on Active Entity with no DeployedTo", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel4", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel4", {
      id: "domain:Service:Lonely",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Lonely",
        lifecycle: "Active",
        description: "An active service with no deployment binding.",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:comp:active-entity-deployed" && f.level === "warning",
      ),
    ).toBe(true);
  });

  it("sw:comp:active-entity-deployed does NOT fire on Proposed entities", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel4b", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel4b", {
      id: "domain:Service:Future",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Future",
        lifecycle: "Proposed",
        description: "Proposed only — no deployment yet.",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:comp:active-entity-deployed",
      ),
    ).toBe(false);
  });

  it("sw:val:deprecated-endpoint-has-successor FIRES on a deprecated endpoint without a DeprecatedBy edge", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel5", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel5", {
      id: "endpoint:GET:legacy",
      type_id: "sw:Endpoint",
      field_values: {
        name: "Legacy endpoint",
        protocol: "HTTP",
        method: "GET",
        path: "/legacy",
        deprecated: true,
        deprecated_since: "v1",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:val:deprecated-endpoint-has-successor" && f.level === "warning",
      ),
    ).toBe(true);
  });

  it("sw:val:deprecated-endpoint-has-successor does NOT fire on a non-deprecated endpoint (has() guard)", async () => {
    const host = await freshHost();
    await host.createProject({ project_id: "cel5b", name: "x", profile_id: PROFILE_ID });
    const r = await host.createPrimitive("cel5b", {
      id: "endpoint:GET:current",
      type_id: "sw:Endpoint",
      field_values: {
        name: "Current endpoint",
        protocol: "HTTP",
        method: "GET",
        path: "/current",
      },
    });
    expect(r.report.accepted).toBe(true);
    expect(
      r.report.findings.some(
        (f) => f.rule_id === "sw:val:deprecated-endpoint-has-successor",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end — ADR renderer surfaces date / deciders / last_reviewed_at
// (gap #1) and the Views section (gap #17).
// ---------------------------------------------------------------------------
describe("end-to-end — ADR renderer surfaces gap #1 fields and gap #17 views", () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
    await host.createProject({
      project_id: "e2e-adr",
      name: "e2e",
      profile_id: PROFILE_ID,
    });
    // Two decisions; first carries date + deciders + last_reviewed_at.
    await host.createPrimitive("e2e-adr", {
      id: "decision:0001",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "Adopt foo",
        context: "ctx",
        rationale: "because",
        alternatives: { name: "bar", reason_rejected: "no" },
        consequences: "cq",
        date: "2026-05-04",
        deciders: ["alice", "bob"],
        last_reviewed_at: "2026-05-04",
      },
    });
    await host.createPrimitive("e2e-adr", {
      id: "decision:0002",
      type_id: "sw:Decision",
      scope_id: "scope:sw:domain",
      field_values: {
        status: "Accepted",
        title: "Plain decision",
        context: "ctx",
        rationale: "y",
        alternatives: { name: "z", reason_rejected: "n" },
        consequences: "q",
      },
    });
    // A Viewpoint + View that includes Decisions — should appear in
    // "Views referencing decisions".
    await host.createPrimitive("e2e-adr", {
      id: "viewpoint:governance",
      type_id: "sw:Viewpoint",
      field_values: {
        name: "governance",
        description: "Decisions and risks.",
        concerns: ["decision rationale"],
      },
    });
    await host.createPrimitive("e2e-adr", {
      id: "view:governance:adrs",
      type_id: "sw:View",
      field_values: {
        name: "adrs",
        viewpoint_id: "viewpoint:governance",
        summary: "All ADRs in the project.",
        included_type_ids: ["sw:Decision"],
      },
    });
  });

  it("ADR markdown carries Date / Deciders / Last reviewed for the populated decision", async () => {
    const slice = host.getProject("e2e-adr");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        projectId: "e2e-adr",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:ADRRenderer" },
    );
    const md = new TextDecoder().decode(out.bytes);
    expect(md).toContain("**Date:** 2026-05-04");
    expect(md).toContain("**Deciders:** alice, bob");
    expect(md).toContain("**Last reviewed:** 2026-05-04");
    // The plain decision has no date — make sure we did NOT emit a stray line.
    const sections = md.split(/^## ADR — /m);
    const plain = sections.find((s) => s.startsWith("`decision:0002`"));
    expect(plain).toBeDefined();
    expect(plain).not.toContain("**Date:**");
    expect(plain).not.toContain("**Deciders:**");
  });

  it("ADR markdown lists views that reference decisions", async () => {
    const slice = host.getProject("e2e-adr");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        projectId: "e2e-adr",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:ADRRenderer" },
    );
    const md = new TextDecoder().decode(out.bytes);
    expect(md).toContain("## Views referencing decisions");
    expect(md).toContain("`view:governance:adrs`");
    expect(md).toContain("All ADRs in the project");
    expect(md).toMatch(/\(2 decisions\)/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end — OpenAPI renderer honors gap #2 (typed status_code), gap #3
// (parameters), gap #12 (deprecated), gap #17 (x-fdpm-views).
// ---------------------------------------------------------------------------
describe("end-to-end — OpenAPI renderer surfaces gap #2/#3/#12/#17 fields", () => {
  it("emits parameters, deprecated flag, typed status_code, schema-version, and x-fdpm-views", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "e2e-openapi",
      name: "e2e",
      profile_id: PROFILE_ID,
    });
    await host.createPrimitive("e2e-openapi", {
      id: "domain:Service:Orders",
      type_id: "sw:Entity",
      scope_id: "scope:sw:domain",
      field_values: {
        kind: "Service",
        name: "Orders",
        lifecycle: "Active",
        description: "Orders.",
      },
    });
    await host.createPrimitive("e2e-openapi", {
      id: "schema:Order",
      type_id: "sw:Schema",
      field_values: {
        name: "Order",
        format: "JSONSchema",
        fields: { name: "id", type: "uuid", required: true, description: "Order id." },
        version: "1.2.0",
        deprecated: true,
      },
    });
    await host.createPrimitive("e2e-openapi", {
      id: "schema:OrderError",
      type_id: "sw:Schema",
      field_values: {
        name: "OrderError",
        format: "JSONSchema",
        fields: {
          name: "message",
          type: "string",
          required: true,
          description: "Error message.",
        },
      },
    });
    await host.createPrimitive("e2e-openapi", {
      id: "endpoint:GET:order",
      type_id: "sw:Endpoint",
      field_values: {
        name: "Get order",
        protocol: "HTTP",
        method: "GET",
        path: "/orders/{id}",
        parameters: {
          name: "id",
          in: "path",
          required: true,
          type: "uuid",
          description: "Order id.",
        },
        deprecated: true,
        deprecated_since: "v2",
      },
    });
    await host.createPrimitive("e2e-openapi", {
      id: "contract:Orders:Customer",
      type_id: "sw:Contract",
      field_values: {
        provider: "domain:Service:Orders",
        consumer: "domain:Service:Orders",
        preconditions: ["caller authenticated"],
        postconditions: ["order state preserved"],
        error_conditions: {
          name: "PaymentDeclined",
          condition: "Card issuer declines.",
          response: "402 + structured payload",
          status_code: "402",
          schema_id: "schema:OrderError",
          media_type: "application/problem+json",
        },
      },
    });
    await host.createRelation("e2e-openapi", {
      id: "rel:exposes",
      type_id: "sw:Exposes",
      source_id: "domain:Service:Orders",
      target_id: "endpoint:GET:order",
    });
    await host.createRelation("e2e-openapi", {
      id: "rel:implements",
      type_id: "sw:Implements",
      source_id: "domain:Service:Orders",
      target_id: "contract:Orders:Customer",
    });
    await host.createRelation("e2e-openapi", {
      id: "rel:output",
      type_id: "sw:OutputOf",
      source_id: "schema:Order",
      target_id: "endpoint:GET:order",
    });
    // A view that includes HTTP endpoints — should land in x-fdpm-views.
    await host.createPrimitive("e2e-openapi", {
      id: "viewpoint:api",
      type_id: "sw:Viewpoint",
      field_values: {
        name: "api",
        description: "External API surface.",
        concerns: ["external integrators"],
      },
    });
    await host.createPrimitive("e2e-openapi", {
      id: "view:api:http",
      type_id: "sw:View",
      field_values: {
        name: "http",
        viewpoint_id: "viewpoint:api",
        summary: "Just HTTP endpoints.",
        included_type_ids: ["sw:Endpoint"],
      },
    });

    const slice = host.getProject("e2e-openapi");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const out = await host.plugins.runRenderer(
      "application/x-yaml",
      {
        projectId: "e2e-openapi",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      },
      { rendererId: "sw:OpenAPIRenderer" },
    );
    const yaml = new TextDecoder().decode(out.bytes);

    // gap #3 — parameters block emitted.
    expect(yaml).toContain("parameters:");
    expect(yaml).toContain("name: id");
    expect(yaml).toContain("in: path");
    expect(yaml).toContain("required: true");

    // gap #12 — deprecated flag on the operation + x-fdpm-deprecated-since.
    expect(yaml).toContain("deprecated: true");
    expect(yaml).toMatch(/x-fdpm-deprecated-since:\s+v2/);

    // gap #12 — schema deprecated + x-fdpm-version.
    // (`deprecated: true` already asserted above appears under the schema too;
    // check the version ext field is present.)
    expect(yaml).toMatch(/x-fdpm-version:\s+1\.2\.0/);

    // gap #2 — typed 402 response (NOT a name-inferred fallback).
    expect(yaml).toMatch(/"402":/);
    expect(yaml).toContain("application/problem+json");
    expect(yaml).toContain("$ref: \"#/components/schemas/OrderError\"");

    // gap #17 — x-fdpm-views surfaces the view that includes HTTP endpoints.
    expect(yaml).toContain("x-fdpm-views:");
    expect(yaml).toContain('id: "view:api:http"');
    expect(yaml).toContain("Just HTTP endpoints.");
  });
});
