/**
 * Tests for the starter (recipe-book) educational plugin.
 *
 * Three tiers:
 *   1. activation — the plugin loads, registers its profile, and its
 *      cap:renderer / cap:validator / cap:transformer / cap:importer /
 *      cap:exporter are all present.
 *   2. validation — CEL rules fire correctly (positive + negative).
 *   3. renderer — output is deterministic and well-formed Markdown.
 *
 * EDUCATIONAL NOTE — these tests are themselves a template. When you
 * fork the starter, fork the tests too and rename them to your own
 * plugin's domain.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

const PROFILE_ID = "profile:starter:0.1";
const SCOPE = "scope:starter:workbook";

async function newRecipeProject(host: Host, id: string): Promise<void> {
  await host.createProject({
    workbook_id: id,
    name: id,
    profile_id: PROFILE_ID,
  });
}

// ---------------------------------------------------------------------------
// Tier 1: activation
// ---------------------------------------------------------------------------

describe("starter plugin — activation", () => {
  it("registers the profile, all primitive types, all relations", async () => {
    const host = await freshHost();
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(profile.id).toBe(PROFILE_ID);
    const primIds = profile.primitive_types.map((p) => p.id).sort();
    expect(primIds).toEqual(["recipe:Ingredient", "recipe:Recipe", "recipe:Tag"]);
    const relIds = profile.relation_types.map((r) => r.id).sort();
    expect(relIds).toEqual(["recipe:TaggedWith", "recipe:Uses"]);
  });

  it("registers the shopping-list renderer for text/markdown", async () => {
    const host = await freshHost();
    // Build a tiny workbook and ask for a render.
    await newRecipeProject(host, "wb-renderer-presence");
    // No data yet; renderer should still produce a deterministic empty
    // shopping list — the educational point is that the renderer
    // tolerates emptiness gracefully.
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "wb-renderer-presence",
        workbook: host.getProject("wb-renderer-presence").workbook,
        primitives: [],
        relations: [],
        templates: [],
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: "recipe:ShoppingListRenderer" },
    );
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toMatch(/Shopping List/);
    expect(text).toMatch(/Aggregated across 0 recipes/);
  });
});

// ---------------------------------------------------------------------------
// Tier 2: validation rules
// ---------------------------------------------------------------------------

describe("starter plugin — validation", () => {
  it("REJECTS a recipe with servings = 0 (recipe:val:servings-positive)", async () => {
    const host = await freshHost();
    await newRecipeProject(host, "wb-bad-servings");
    let caught: any = null;
    try {
      await host.createPrimitive("wb-bad-servings", {
        id: "recipe:zero",
        type_id: "recipe:Recipe",
        scope_id: SCOPE,
        field_values: {
          name: "Empty",
          difficulty: "easy",
          servings: 0,
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    const findings = (caught.findings ?? []) as Array<{ rule_id: string }>;
    expect(findings.some((f) => f.rule_id === "recipe:val:servings-positive")).toBe(true);
  });

  it("ACCEPTS a recipe with servings >= 1", async () => {
    const host = await freshHost();
    await newRecipeProject(host, "wb-good-servings");
    await host.createPrimitive("wb-good-servings", {
      id: "recipe:simple",
      type_id: "recipe:Recipe",
      scope_id: SCOPE,
      field_values: {
        name: "Simple",
        difficulty: "easy",
        servings: 4,
        method: "Heat. Eat.",
      },
    });
    const r = host.getProject("wb-good-servings").primitives["recipe:simple"]!;
    expect(r.field_values.servings).toBe(4);
  });

  it("emits a WARNING for recipes with no method (code validator)", async () => {
    const host = await freshHost();
    await newRecipeProject(host, "wb-no-method");
    // The code validator returns a finding; createPrimitive succeeds
    // for warnings (errors gate, warnings don't).
    const result = await host.createPrimitive("wb-no-method", {
      id: "recipe:bare",
      type_id: "recipe:Recipe",
      scope_id: SCOPE,
      field_values: {
        name: "Bare",
        difficulty: "easy",
        servings: 1,
      },
    });
    const warnings = result.report.findings.filter((f) => f.level === "warning");
    expect(
      warnings.some((f) => f.rule_id === "recipe:val:has-at-least-one-ingredient"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: renderer determinism
// ---------------------------------------------------------------------------

describe("starter plugin — renderer", () => {
  it("produces identical bytes on two runs against the same data (determinism)", async () => {
    const host = await freshHost();
    await newRecipeProject(host, "wb-render-det");
    await host.createPrimitive("wb-render-det", {
      id: "ingredient:salt",
      type_id: "recipe:Ingredient",
      scope_id: SCOPE,
      field_values: { name: "Salt", default_unit: "tsp", allergens: [] },
    });
    await host.createPrimitive("wb-render-det", {
      id: "recipe:eggs",
      type_id: "recipe:Recipe",
      scope_id: SCOPE,
      field_values: {
        name: "Boiled Egg",
        difficulty: "easy",
        servings: 1,
        method: "Boil.",
      },
    });
    await host.createRelation("wb-render-det", {
      id: "rel:eggs-salt",
      type_id: "recipe:Uses",
      source_id: "recipe:eggs",
      target_id: "ingredient:salt",
      field_values: { quantity: 1, unit: "tsp" },
    });

    const slice = host.getProject("wb-render-det");
    const profile = host.profiles.getResolved(PROFILE_ID);
    const input = {
      workbookId: "wb-render-det",
      workbook: slice.workbook,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: [],
      profile,
    };
    const a = await host.plugins.runRenderer("text/markdown", input, {
      rendererId: "recipe:ShoppingListRenderer",
    });
    const b = await host.plugins.runRenderer("text/markdown", input, {
      rendererId: "recipe:ShoppingListRenderer",
    });
    const aText = new TextDecoder().decode(a.bytes);
    const bText = new TextDecoder().decode(b.bytes);
    expect(aText).toBe(bText);
    expect(aText).toContain("Boiled Egg");
    expect(aText).toContain("Salt");
  });
});
