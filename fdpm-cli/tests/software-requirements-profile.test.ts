import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { PROFILE, PROFILE_ID } from "../plugins/software_requirements/index.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

function findType(typeId: string) {
  const type = PROFILE.primitive_types.find((p) => p.id === typeId);
  if (!type) throw new Error(`missing primitive type ${typeId}`);
  return type;
}

function findField(typeId: string, fieldName: string) {
  const field = findType(typeId).fields.find((f) => f.name === fieldName);
  if (!field) throw new Error(`missing field ${typeId}.${fieldName}`);
  return field;
}

function findRelation(relationId: string) {
  const relation = PROFILE.relation_types.find((r) => r.id === relationId);
  if (!relation) throw new Error(`missing relation type ${relationId}`);
  return relation;
}

const SPEC_FIELDS = {
  project: "Tiled Prompt Application",
  version: "0.2.0",
  date: "2026-07-14",
  authors: ["FDPM Operator"],
  purpose: "Capture software requirements and scope boundaries for the Tiled Prompt Application.",
  intended_audience: ["product stakeholders", "implementation team"],
  scope: "Manage tiled prompt workflows and their requirements.",
};

const OUT_OF_SCOPE_BOUNDARY = {
  title: "Exclude native desktop packaging",
  polarity: "out_of_scope",
  statement: "Native desktop packaging is explicitly excluded from this product scope.",
  rationale: "The target delivery surface is the browser application.",
  priority: "must",
  acceptance_criteria: ["No requirement mandates native desktop packaging."],
  verification: "inspection",
};

const EXCLUDED_REQUIREMENT = {
  title: "Native desktop packaging",
  statement: "The system shall ship as a native desktop application package.",
  kind: "functional",
  rationale: "Recorded as an excluded requirement candidate so negative scope can trace to it.",
  priority: "wont",
  status: "rejected",
  acceptance_criteria: ["The rejected candidate remains linked to the excluding boundary."],
  verification: "inspection",
  origin_class: "operator",
  provenance_rank: "primary",
};

describe("software requirements profile — negative scope", () => {
  it("registers the first-class scope boundary primitive and relations", async () => {
    const host = await freshHost();
    const profile = host.profiles.getResolved(PROFILE_ID);

    expect(profile.primitive_types.map((p) => p.id).sort()).toContain("srs:ScopeBoundary");
    expect(profile.relation_types.map((r) => r.id).sort()).toEqual(
      expect.arrayContaining([
        "srs:DefinesScopeBoundary",
        "srs:ConstrainsRequirement",
        "srs:ExcludesRequirement",
      ]),
    );
    expect(profile.validation_rules.map((r) => r.id).sort()).toEqual(
      expect.arrayContaining([
        "srs:val:scope-boundary-statement-non-trivial",
        "srs:val:scope-boundary-rationale-non-trivial",
        "srs:val:scope-boundary-acceptance-min-one",
        "srs:val:out-of-scope-boundary-links-exclusion",
      ]),
    );
  });

  it("adds document-level out_of_scope and non_goals fields to Specification", () => {
    const outOfScope = findField("srs:Specification", "out_of_scope");
    expect(outOfScope.kind).toBe("list");
    expect(outOfScope.required).toBe(false);
    expect(outOfScope.default).toEqual([]);

    const nonGoals = findField("srs:Specification", "non_goals");
    expect(nonGoals.kind).toBe("list");
    expect(nonGoals.required).toBe(false);
    expect(nonGoals.default).toEqual([]);
  });

  it("declares scope boundary polarity and exclusion traceability", () => {
    const polarity = findField("srs:ScopeBoundary", "polarity");
    expect(polarity.kind).toBe("enum");
    expect(polarity.enum_values).toEqual(["in_scope", "out_of_scope"]);

    const verification = findField("srs:Requirement", "verification");
    expect(verification.kind).toBe("enum");
    expect(verification.enum_values).toEqual(
      expect.arrayContaining(["test", "inspection", "test_inspection"]),
    );

    const defines = findRelation("srs:DefinesScopeBoundary");
    expect(defines.source_types).toEqual(["srs:Specification"]);
    expect(defines.target_types).toEqual(["srs:ScopeBoundary"]);

    const excludes = findRelation("srs:ExcludesRequirement");
    expect(excludes.source_types).toEqual(["srs:ScopeBoundary"]);
    expect(excludes.target_types).toEqual(["srs:Requirement"]);

    const includes = findRelation("srs:Includes");
    expect(includes.target_types).toContain("srs:ScopeBoundary");
  });

  it("accepts a specification with explicit negative scope lists", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "srs-negative-doc", name: "srs", profile_id: PROFILE_ID });

    const result = await host.createPrimitive("srs-negative-doc", {
      id: "srs:spec:tiled-prompt-application",
      type_id: "srs:Specification",
      field_values: {
        ...SPEC_FIELDS,
        out_of_scope: ["Native desktop packaging is not part of this product slice."],
        non_goals: ["The SRS does not define vendor-specific cloud deployment policy."],
      },
    });

    expect(result.report.accepted).toBe(true);
  });

  it("warns when an out-of-scope boundary is not linked to an excluded requirement", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "srs-boundary-warning", name: "srs", profile_id: PROFILE_ID });

    const result = await host.createPrimitive("srs-boundary-warning", {
      id: "srs:scope:SB-TPA-001",
      type_id: "srs:ScopeBoundary",
      field_values: OUT_OF_SCOPE_BOUNDARY,
    });

    expect(result.report.accepted).toBe(true);
    expect(
      result.report.findings.some(
        (f) =>
          f.rule_id === "srs:val:out-of-scope-boundary-links-exclusion" &&
          f.level === "warning",
      ),
    ).toBe(true);
  });

  it("can trace an out-of-scope boundary to an excluded requirement candidate", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "srs-boundary-linked", name: "srs", profile_id: PROFILE_ID });

    await host.createPrimitive("srs-boundary-linked", {
      id: "srs:scope:SB-TPA-002",
      type_id: "srs:ScopeBoundary",
      field_values: OUT_OF_SCOPE_BOUNDARY,
    });
    await host.createPrimitive("srs-boundary-linked", {
      id: "srs:req:REQ-TPA-999",
      type_id: "srs:Requirement",
      field_values: EXCLUDED_REQUIREMENT,
    });
    const relation = await host.createRelation("srs-boundary-linked", {
      id: "srs:excludes:desktop-packaging",
      type_id: "srs:ExcludesRequirement",
      source_id: "srs:scope:SB-TPA-002",
      target_id: "srs:req:REQ-TPA-999",
      field_values: {
        note: "The browser-only delivery scope excludes native package requirements.",
      },
    });

    expect(relation.report.accepted).toBe(true);

    const report = host.validateProject("srs-boundary-linked");
    const boundary = report.primitives.find((p) => p.target_id === "srs:scope:SB-TPA-002");
    expect(
      boundary?.findings.some(
        (f) => f.rule_id === "srs:val:out-of-scope-boundary-links-exclusion",
      ) ?? false,
    ).toBe(false);
  });

  it("rejects a scope boundary with no substantive statement", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "srs-boundary-invalid", name: "srs", profile_id: PROFILE_ID });

    let caught: unknown = null;
    try {
      await host.createPrimitive("srs-boundary-invalid", {
        id: "srs:scope:SB-TPA-003",
        type_id: "srs:ScopeBoundary",
        field_values: {
          ...OUT_OF_SCOPE_BOUNDARY,
          statement: "   ",
        },
      });
    } catch (err) {
      caught = err;
    }

    const findings = (caught as { findings?: Array<{ rule_id: string; level: string }> } | null)
      ?.findings ?? [];
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "srs:val:scope-boundary-statement-non-trivial",
          level: "error",
        }),
      ]),
    );
  });
});
