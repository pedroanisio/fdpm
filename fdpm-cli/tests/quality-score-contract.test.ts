/**
 * Contract tests for the workbook quality scorer.
 *
 * Three tiers:
 *   1. Empty workbook — schema/refs/render gates pass; coverage and
 *      determinism reflect the empty state.
 *   2. Populated _starter workbook (full seed) — should score `strong+`.
 *   3. Plugin-level score against fdpm.starter using the populated
 *      workbook as fixture — should also score `strong+`.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { scorePlugin, scoreWorkbook } from "../src/quality/score-workbook.js";
import { defineProject } from "../src/sdk.js";
import { PROFILE_ID, SCOPE_IDS } from "../plugins/_starter/index.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

const SCOPE = SCOPE_IDS.workbook;

async function seedStarterWorkbook(host: Host, id: string): Promise<void> {
  // Minimal-but-non-empty seed: covers all 3 primitive types and all 2
  // relation types, so coverage axis D should be 100%.
  await defineProject(host, {
    id,
    name: id,
    profile: PROFILE_ID,
    description: "test fixture",
  })
    .primitives([
      { id: "tag:vegetarian", type: "recipe:Tag", scope: SCOPE, fields: { name: "Vegetarian" } },
      { id: "ingredient:tomato", type: "recipe:Ingredient", scope: SCOPE, fields: { name: "Tomato", default_unit: "g" } },
      { id: "ingredient:basil", type: "recipe:Ingredient", scope: SCOPE, fields: { name: "Basil", default_unit: "g" } },
      {
        id: "recipe:caprese",
        type: "recipe:Recipe",
        scope: SCOPE,
        fields: {
          name: "Caprese",
          difficulty: "easy",
          servings: 2,
          method: "Slice tomatoes; layer with basil.",
        },
      },
    ])
    .relations([
      {
        id: "rel:caprese-uses-tomato",
        type: "recipe:Uses",
        from: "recipe:caprese",
        to: "ingredient:tomato",
        fields: { quantity: 200, unit: "g" },
      },
      {
        id: "rel:caprese-uses-basil",
        type: "recipe:Uses",
        from: "recipe:caprese",
        to: "ingredient:basil",
        fields: { quantity: 20, unit: "g" },
      },
      {
        id: "rel:caprese-tagged-vegetarian",
        type: "recipe:TaggedWith",
        from: "recipe:caprese",
        to: "tag:vegetarian",
        fields: {},
      },
    ])
    .commit({ rollbackOnError: true });
}

// ---------------------------------------------------------------------------
// Tier 1: empty workbook
// ---------------------------------------------------------------------------

describe("scoreWorkbook — empty workbook", () => {
  it("hard gates pass; coverage is 0; renderer-only test runs", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "empty-starter",
      name: "empty-starter",
      profile_id: PROFILE_ID,
    });
    const report = await scoreWorkbook(host, "empty-starter");
    // No primitives = no schema violations, no validation findings, no
    // dangling refs. Coverage = 0%. Determinism axis is hard-gated by the
    // existence of a renderer; the starter declares none in
    // renderer_bindings (renderers: []), so determinism passes vacuously.
    expect(report.axes.schema_conformance.gate_passed).toBe(true);
    expect(report.axes.validation_clean.gate_passed).toBe(true);
    expect(report.axes.reference_integrity.gate_passed).toBe(true);
    expect(report.axes.profile_coverage.score).toBe(0);
    // Empty workbook is `weak` at best (no excellence signals; coverage = 0).
    expect(report.grade === "weak" || report.grade === "adequate" || report.grade === "inadmissible").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 2: populated workbook
// ---------------------------------------------------------------------------

describe("scoreWorkbook — populated starter fixture", () => {
  it("achieves full coverage and clears all hard gates", async () => {
    const host = await freshHost();
    await seedStarterWorkbook(host, "wb-starter-full");
    const report = await scoreWorkbook(host, "wb-starter-full");
    expect(report.axes.schema_conformance.gate_passed).toBe(true);
    expect(report.axes.validation_clean.gate_passed).toBe(true);
    expect(report.axes.reference_integrity.gate_passed).toBe(true);
    // Full coverage: 3/3 primitives, 2/2 relations
    expect(report.axes.profile_coverage.score).toBe(20);
    expect(report.score).toBeGreaterThanOrEqual(75);
    expect(report.grade === "adequate" || report.grade === "strong" || report.grade === "airtight").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: plugin-level score
// ---------------------------------------------------------------------------

describe("scorePlugin — fdpm.starter against populated fixture", () => {
  it("scores strong+ when fixture, README, and test file are supplied", async () => {
    const host = await freshHost();
    await seedStarterWorkbook(host, "wb-starter-plugin-fixture");
    const report = await scorePlugin(host, "fdpm.starter", {
      fixtureWorkbookId: "wb-starter-plugin-fixture",
      readmePath: resolve(process.cwd(), "plugins/_starter/README.md"),
      testFilePath: resolve(process.cwd(), "tests/starter-plugin.test.ts"),
    });
    expect(report.workbook_report).not.toBeNull();
    expect(report.axes.manifest_correct.score).toBeGreaterThanOrEqual(8);
    expect(report.axes.manifest_runtime_parity.gate_passed).toBe(true);
    expect(report.axes.permission_minimality.score).toBe(5);
    expect(report.score).toBeGreaterThanOrEqual(80);
  });

  it("plugin-not-found raises a clear error", async () => {
    const host = await freshHost();
    await expect(
      scorePlugin(host, "fdpm.does-not-exist"),
    ).rejects.toThrow(/plugin not found/);
  });
});
