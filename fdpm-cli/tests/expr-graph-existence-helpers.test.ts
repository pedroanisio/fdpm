import { describe, it, expect } from "vitest";
import {
  primitiveExists,
  targetsExist,
} from "../src/core/expr/helpers.js";
import {
  EXPR_HELPER_SET_VERSION,
  STANDARD_GRAPH_HELPER_IDS,
} from "../src/core/expr/std.js";
import { Host } from "../src/core/host.js";
import type { RelationInstance } from "../src/core/models/instance.js";
import { importTransfer } from "../src/core/host-extra.js";
import { newHost } from "./fixtures.js";

/**
 * Coverage for the helper-set v1.1.0 additions:
 *   - graph.exists(target_id)         — id-membership over workbook primitives
 *   - graph.target_exists(rel_id)     — every outbound edge of rel_id resolves
 *
 * Tests cover three layers:
 *   (1) the pure helper functions in isolation,
 *   (2) the helper-set inventory (STANDARD_GRAPH_HELPER_IDS / version),
 *   (3) end-to-end via a CEL `expression` validation rule pushed onto a
 *       seeded workbook — confirms the helpers are reachable from CEL and
 *       that findings fire / don't-fire as expected.
 */

// ---------------------------------------------------------------------------
// (1) Pure helper functions
// ---------------------------------------------------------------------------

describe("expr/helpers: primitiveExists", () => {
  it("returns true when the id matches some primitive", () => {
    expect(primitiveExists([{ id: "a" }, { id: "b" }], "a")).toBe(true);
    expect(primitiveExists([{ id: "a" }, { id: "b" }], "b")).toBe(true);
  });

  it("returns false when the id is absent", () => {
    expect(primitiveExists([{ id: "a" }, { id: "b" }], "c")).toBe(false);
  });

  it("returns false on an empty primitive set", () => {
    expect(primitiveExists([], "a")).toBe(false);
  });

  it("does NOT match by substring or prefix", () => {
    expect(primitiveExists([{ id: "task:foo" }], "foo")).toBe(false);
    expect(primitiveExists([{ id: "task:foo" }], "task")).toBe(false);
  });
});

describe("expr/helpers: targetsExist", () => {
  const rels = (xs: Array<Partial<RelationInstance>>): RelationInstance[] =>
    xs.map(
      (r, i) =>
        ({
          id: `rel:${i}`,
          revision: 0,
          field_values: {},
          ...r,
        }) as RelationInstance,
    );

  it("returns true when every outgoing edge of the type resolves", () => {
    const r = rels([
      { type_id: "T", source_id: "s", target_id: "a" },
      { type_id: "T", source_id: "s", target_id: "b" },
    ]);
    expect(targetsExist(r, [{ id: "a" }, { id: "b" }], "s", "T")).toBe(true);
  });

  it("returns false when ANY outgoing edge of the type points at a missing primitive", () => {
    const r = rels([
      { type_id: "T", source_id: "s", target_id: "a" },
      { type_id: "T", source_id: "s", target_id: "ghost" },
    ]);
    expect(targetsExist(r, [{ id: "a" }, { id: "b" }], "s", "T")).toBe(false);
  });

  it("ignores edges of a different relation type", () => {
    const r = rels([
      { type_id: "OTHER", source_id: "s", target_id: "ghost" },
      { type_id: "T", source_id: "s", target_id: "a" },
    ]);
    expect(targetsExist(r, [{ id: "a" }], "s", "T")).toBe(true);
  });

  it("ignores edges from a different source instance", () => {
    const r = rels([
      { type_id: "T", source_id: "other", target_id: "ghost" },
      { type_id: "T", source_id: "s", target_id: "a" },
    ]);
    expect(targetsExist(r, [{ id: "a" }], "s", "T")).toBe(true);
  });

  it("returns true vacuously when the source has no outgoing edges of that type", () => {
    expect(targetsExist([], [{ id: "a" }], "s", "T")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (2) Inventory + version invariants
// ---------------------------------------------------------------------------

describe("expr/std: graph helper inventory", () => {
  it("declares 5 graph helpers including the v1.1.0 additions", () => {
    expect(STANDARD_GRAPH_HELPER_IDS).toEqual([
      "graph.incoming",
      "graph.outgoing",
      "graph.acyclic",
      "graph.exists",
      "graph.target_exists",
    ]);
  });

  it("helper-set version is 1.2.0 (additive minor bumps from 1.0.0 → 1.1.0 → 1.2.0)", () => {
    // 1.0.0 → 1.1.0: graph.exists / graph.target_exists.
    // 1.1.0 → 1.2.0: fn.section_of (SPEC-SECTIONS-TREE v0.2 §6.4 — render-time
    //                NodeId → §N.M.K resolver). Both bumps are additive (no
    //                existing helper changed); minor per the §M14 bump rules.
    expect(EXPR_HELPER_SET_VERSION).toBe("1.2.0");
  });
});

// ---------------------------------------------------------------------------
// (3) End-to-end via CEL validation rule on a seeded workbook
// ---------------------------------------------------------------------------

async function seedProject(
  host: Host,
  workbookId: string,
  primitives: Array<{ id: string; type_id: string; field_values: Record<string, unknown> }>,
  relations: Array<{
    id: string;
    type_id: string;
    source_id: string;
    target_id: string;
    field_values?: Record<string, unknown>;
  }>,
): Promise<void> {
  await importTransfer(host, {
    spec_core: "1.1",
    workbook: {
      id: workbookId,
      name: workbookId,
      profile_id: "test:demo",
      created_at: new Date().toISOString(),
      revision: 0,
    },
    primitives: primitives.map((p) => ({ ...p, revision: 0 })),
    relations: relations.map((r) => ({
      field_values: {},
      ...r,
      revision: 0,
    })),
    templates: [],
    test_suites: [],
    operation_log: [],
  } as any);
}

describe("expr/runtime: graph.exists evaluates via CEL", () => {
  it("rule that requires graph.exists(target) FIRES when target is missing", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:exists:must-resolve",
      name: "Sections must reference an existing companion id",
      targets: ["test:section"],
      level: "error",
      // Arbitrary semantic: every section instance must have a companion
      // primitive at id "section:companion-of-<self.id>".
      // Here we hard-code the id to keep the test tight.
      expression: 'graph.exists("section:partner")',
      message: "companion missing",
    } as any);

    await seedProject(
      host,
      "p1",
      [
        // Note: NO partner primitive — the rule must fire.
        {
          id: "section:lonely",
          type_id: "test:section",
          field_values: { title: "lonely", number: 1 },
        },
      ],
      [],
    );

    const report = host.validateProject("p1");
    const finding = report.primitives
      .find((e) => e.target_id === "section:lonely")
      ?.findings.find((f) => f.rule_id === "test:exists:must-resolve");
    expect(finding).toBeDefined();
    expect(finding?.level).toBe("error");
  });

  it("rule that requires graph.exists(target) PASSES when target is present", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:exists:must-resolve",
      name: "Sections must reference an existing companion id",
      targets: ["test:section"],
      level: "error",
      expression: 'graph.exists("section:partner")',
      message: "companion missing",
    } as any);

    await seedProject(
      host,
      "p2",
      [
        {
          id: "section:happy",
          type_id: "test:section",
          field_values: { title: "happy", number: 1 },
        },
        {
          id: "section:partner",
          type_id: "test:section",
          field_values: { title: "partner", number: 2 },
        },
      ],
      [],
    );

    const report = host.validateProject("p2");
    const findings =
      report.primitives.find((e) => e.target_id === "section:happy")?.findings ?? [];
    expect(findings.some((f) => f.rule_id === "test:exists:must-resolve")).toBe(false);
  });
});

describe("expr/runtime: graph.target_exists evaluates via CEL", () => {
  it("rule that requires graph.target_exists FIRES on a dangling outbound relation", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:target-exists:must-resolve",
      name: "All test:rel:contains targets must exist",
      targets: ["test:section"],
      level: "error",
      expression: 'graph.target_exists("test:rel:contains")',
      message: "dangling reference",
    } as any);

    await seedProject(
      host,
      "p3",
      [
        {
          id: "section:src",
          type_id: "test:section",
          field_values: { title: "src", number: 1 },
        },
        // No para:real or para:ghost primitives — both edges below dangle.
      ],
      [
        {
          id: "rel:dangling",
          type_id: "test:rel:contains",
          source_id: "section:src",
          target_id: "para:ghost",
        },
      ],
    );

    const report = host.validateProject("p3");
    const finding = report.primitives
      .find((e) => e.target_id === "section:src")
      ?.findings.find((f) => f.rule_id === "test:target-exists:must-resolve");
    expect(finding).toBeDefined();
  });

  it("rule that requires graph.target_exists PASSES when every outbound target resolves", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:target-exists:must-resolve",
      name: "All test:rel:contains targets must exist",
      targets: ["test:section"],
      level: "error",
      expression: 'graph.target_exists("test:rel:contains")',
      message: "dangling reference",
    } as any);

    await seedProject(
      host,
      "p4",
      [
        {
          id: "section:src",
          type_id: "test:section",
          field_values: { title: "src", number: 1 },
        },
        {
          id: "para:real",
          type_id: "test:para",
          field_values: { text: "hi" },
        },
      ],
      [
        {
          id: "rel:resolves",
          type_id: "test:rel:contains",
          source_id: "section:src",
          target_id: "para:real",
        },
      ],
    );

    const report = host.validateProject("p4");
    const findings =
      report.primitives.find((e) => e.target_id === "section:src")?.findings ?? [];
    expect(findings.some((f) => f.rule_id === "test:target-exists:must-resolve")).toBe(
      false,
    );
  });

  it("graph.target_exists composes with graph.outgoing for the 'must have at least one and all resolve' idiom", async () => {
    const host = await newHost();
    const profile = host.profiles.getRaw("test:demo");

    profile.validation_rules.push({
      id: "test:non-empty-and-resolves",
      name: "Section must contain at least one paragraph and all targets resolve",
      targets: ["test:section"],
      level: "error",
      expression:
        'graph.outgoing("test:rel:contains").size() >= 1 && graph.target_exists("test:rel:contains")',
      message: "either empty or dangling",
    } as any);

    await seedProject(
      host,
      "p5",
      [
        {
          id: "section:empty",
          type_id: "test:section",
          field_values: { title: "empty", number: 1 },
        },
        // No outgoing edges → first conjunct fails → rule fires.
      ],
      [],
    );

    const report = host.validateProject("p5");
    const finding = report.primitives
      .find((e) => e.target_id === "section:empty")
      ?.findings.find((f) => f.rule_id === "test:non-empty-and-resolves");
    expect(finding).toBeDefined();
  });
});
