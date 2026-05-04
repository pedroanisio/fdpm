import { describe, it, expect } from "vitest";
import { newHost } from "./fixtures.js";
import { importTransfer } from "../src/core/host-extra.js";
import { PROFILE as SW_PROFILE } from "../plugins/software_architecture/index.js";

async function seedProject(host: any, projectId: string, primitives: any[], relations: any[] = []) {
  await importTransfer(host, {
    spec_core: "1.1",
    project: {
      id: projectId,
      name: "Imported",
      profile_id: SW_PROFILE.id,
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

describe("Software Architecture CEL Rules", () => {
  it("enforces sw:val:decision-has-alternatives", async () => {
    const host = await newHost();
    await host.registerProfile(SW_PROFILE);

    await seedProject(host, "p", [
      {
        id: "dec:bad",
        type_id: "sw:Decision",
        field_values: { name: "Bad", alternatives: [] },
      },
      {
        id: "dec:good",
        type_id: "sw:Decision",
        field_values: { name: "Good", alternatives: ["alt1"] },
      }
    ]);

    const report = host.validateProject("p");
    const bad = report.primitives.find(p => p.target_id === "dec:bad");
    const good = report.primitives.find(p => p.target_id === "dec:good");

    expect(bad?.findings.some(f => f.rule_id === "sw:val:decision-has-alternatives")).toBe(true);
    expect(good?.findings.find(f => f.rule_id === "sw:val:decision-has-alternatives")).toBeUndefined();
  });

  it("enforces sw:val:decision-has-rationale", async () => {
    const host = await newHost();
    await host.registerProfile(SW_PROFILE);

    await seedProject(host, "p", [
      {
        id: "dec:bad",
        type_id: "sw:Decision",
        field_values: { name: "Bad", rationale: "  " },
      },
      {
        id: "dec:good",
        type_id: "sw:Decision",
        field_values: { name: "Good", rationale: "Because of reasons." },
      }
    ]);

    const report = host.validateProject("p");
    const bad = report.primitives.find(p => p.target_id === "dec:bad");
    const good = report.primitives.find(p => p.target_id === "dec:good");

    expect(bad?.findings.some(f => f.rule_id === "sw:val:decision-has-rationale")).toBe(true);
    expect(good?.findings.find(f => f.rule_id === "sw:val:decision-has-rationale")).toBeUndefined();
  });

  it("enforces sw:comp:active-entity-constrained (graph helper)", async () => {
    const host = await newHost();
    await host.registerProfile(SW_PROFILE);

    await seedProject(host, "p", [
      {
        id: "ent:unconstrained",
        type_id: "sw:Entity",
        field_values: { name: "ActiveEntity", lifecycle: "Active" },
      },
      {
        id: "ent:constrained",
        type_id: "sw:Entity",
        field_values: { name: "ConstrainedEntity", lifecycle: "Active" },
      },
      {
        id: "inv:1",
        type_id: "sw:Invariant",
        field_values: { name: "Inv" },
      }
    ], [
      {
        id: "rel:1",
        type_id: "sw:Constrains",
        source_id: "inv:1",
        target_id: "ent:constrained",
      }
    ]);

    const report = host.validateProject("p");
    const bad = report.primitives.find(p => p.target_id === "ent:unconstrained");
    const good = report.primitives.find(p => p.target_id === "ent:constrained");

    expect(bad?.findings.some(f => f.rule_id === "sw:comp:active-entity-constrained")).toBe(true);
    expect(good?.findings.find(f => f.rule_id === "sw:comp:active-entity-constrained")).toBeUndefined();
  });
});
