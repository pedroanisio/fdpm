import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";

async function seedProject(host: any, projectId: string, primitives: any[], relations: any[] = []) {
  await importTransfer(host, {
    spec_core: "1.1",
    project: {
      id: projectId,
      name: "Imported",
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: primitives.map((p, i) => ({ ...p, revision: 0 })),
    relations: relations.map((r, i) => ({ ...r, revision: 0 })),
    templates: [],
    test_suites: [],
    operation_log: [],
  });
}

describe("CEL Validation Integration", () => {
  it("evaluates a basic CEL expression on a primitive", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");
    
    // Add a CEL rule to the profile.
    profile.validation_rules.push({
      id: "test:cel:simple",
      name: "Simple CEL",
      targets: ["test:section"],
      level: "error",
      expression: "instance.field_values.number > 10",
      message: "Number must be > 10",
    });

    await seedProject(host, "p", [
      {
        id: "section:bad",
        type_id: "test:section",
        field_values: { title: "Bad", number: 5 },
      },
      {
        id: "section:good",
        type_id: "test:section",
        field_values: { title: "Good", number: 15 },
      }
    ]);

    const report = host.validateProject("p");
    const bad = report.primitives.find(p => p.target_id === "section:bad");
    const good = report.primitives.find(p => p.target_id === "section:good");

    expect(bad?.findings.some(f => f.rule_id === "test:cel:simple")).toBe(true);
    // Good should have no findings for this rule
    const goodFinding = good?.findings.find(f => f.rule_id === "test:cel:simple");
    expect(goodFinding).toBeUndefined();
  });

  it("evaluates a CEL expression using instance_type and profile", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");
    
    profile.validation_rules.push({
      id: "test:cel:meta",
      name: "Meta CEL",
      targets: ["test:section"],
      level: "error",
      expression: 'instance_type.id == "test:section" && profile.id == "test:demo"',
      message: "Meta mismatch",
    });

    await seedProject(host, "p", [
      {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "A", number: 1 },
      }
    ]);

    const report = host.validateProject("p");
    const finding = report.primitives.find(p => p.target_id === "section:a")
      ?.findings.find(f => f.rule_id === "test:cel:meta");
    expect(finding).toBeUndefined(); // Should be satisfied (returns true)
  });

  it("evaluates a relation predicate using graph helpers", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");
    
    profile.validation_rules.push({
      id: "test:cel:graph",
      name: "Graph Helper Test",
      targets: ["test:section"],
      level: "error",
      expression: 'graph.outgoing("test:SubSection").size() > 0',
      message: "Section must have at least one subsection",
    });

    await seedProject(host, "p", [
      {
        id: "section:lonely",
        type_id: "test:section",
        field_values: { title: "Lonely", number: 1 },
      },
      {
        id: "section:parent",
        type_id: "test:section",
        field_values: { title: "Parent", number: 2 },
      },
      {
        id: "section:child",
        type_id: "test:section",
        field_values: { title: "Child", number: 3 },
      }
    ], [
      {
        id: "rel:1",
        type_id: "test:SubSection",
        source_id: "section:parent",
        target_id: "section:child",
      }
    ]);

    const report = host.validateProject("p");
    const lonely = report.primitives.find(p => p.target_id === "section:lonely");
    const parent = report.primitives.find(p => p.target_id === "section:parent");

    if (!lonely?.findings.some(f => f.rule_id === "test:cel:graph")) {
      console.log('LONELY FINDINGS:', JSON.stringify(lonely?.findings, null, 2));
    }
    expect(lonely?.findings.some(f => f.rule_id === "test:cel:graph")).toBe(true);
    const parentFinding = parent?.findings.find(f => f.rule_id === "test:cel:graph");
    expect(parentFinding).toBeUndefined();
  });

  it("falls back to 'info' for unparseable legacy DSL", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");
    
    profile.validation_rules.push({
      id: "test:legacy",
      name: "Legacy Rule",
      targets: ["test:section"],
      level: "error",
      expression: "non_trivial(title", // Malformed syntax, not just unknown names
    });

    await seedProject(host, "p", [
      {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "A", number: 1 },
      }
    ]);

    const report = host.validateProject("p");
    const finding = report.primitives[0].findings.find(f => f.rule_id === "test:legacy");
    expect(finding?.level).toBe("info");
    expect(finding?.message).toContain("predicate not evaluated");
  });

  it("surfaces runtime errors as 'error' findings", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");
    
    profile.validation_rules.push({
      id: "test:cel:runtime",
      name: "Runtime Error Rule",
      targets: ["test:section"],
      level: "warning",
      // Accessing a field that is NOT on the context or null deref
      expression: "instance.field_values.non_existent.foo == true", 
    });

    await seedProject(host, "p", [
      {
        id: "section:a",
        type_id: "test:section",
        field_values: { title: "A", number: 1 },
      }
    ]);

    const report = host.validateProject("p");
    const finding = report.primitives[0].findings.find(f => f.rule_id === "test:cel:runtime");
    expect(finding?.level).toBe("error");
    expect(finding?.message).toBe("validator raised; see evidence");
  });
});
