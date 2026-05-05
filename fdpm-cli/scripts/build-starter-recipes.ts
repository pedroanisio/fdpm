/**
 * Build a small recipe-book workbook against the fdpm.starter plugin.
 *
 * This is the example workbook for the educational starter plugin. It
 * doubles as a worked example of the SDK's defineProject().commit()
 * pattern — the canonical way to author a workbook programmatically
 * against any plugin.
 *
 * Domain: 3 recipes that share ingredients deliberately, so the
 * shopping-list renderer's cross-recipe AGGREGATION shows visibly.
 *
 *   Caprese Salad   uses tomato + basil + olive-oil   tags: vegetarian, quick
 *   Tomato Soup     uses tomato + basil + salt        tags: vegetarian
 *   Salad Dressing  uses olive-oil + salt             tags: quick
 *
 * Run (against your default data dir):
 *   npx tsx fdpm-cli/scripts/build-starter-recipes.ts
 *
 * Or against a throwaway dir to play with it without polluting your store:
 *   rm -rf /tmp/fdpm-starter-recipes
 *   FDPM_DATA_DIR=/tmp/fdpm-starter-recipes npx tsx \
 *     fdpm-cli/scripts/build-starter-recipes.ts
 *
 * Render the shopping list (after the seed):
 *   fdpm render starter-recipes-example text/markdown \
 *     --renderer-id recipe:ShoppingListRenderer
 *
 * EDUCATIONAL NOTE — defineProject().commit() vs raw Host.* calls:
 *   defineProject() is the SDK's append-only authoring builder; .commit()
 *   sends the whole batch through the host with optional rollback if
 *   any single op fails. It's the right tool for greenfield workbook
 *   construction (this script). For LIVE workbook edits (operator
 *   adding a single recipe later) use Host.createPrimitive directly or
 *   the planning SDK's helper pattern at plugins/planning/sdk.ts.
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID, SCOPE_IDS } from "../plugins/_starter/index.js";

const PROJECT_ID = "starter-recipes-example";

// ── Tags ──────────────────────────────────────────────────────────────────
const tagSpecs: PrimitiveSpec[] = [
  {
    id: "tag:vegetarian",
    type: "recipe:Tag",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Vegetarian",
      description: "No meat, fish, or animal-derived stocks.",
    },
  },
  {
    id: "tag:quick",
    type: "recipe:Tag",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Quick",
      description: "Total time (prep + cook) under 30 minutes.",
    },
  },
];

// ── Ingredients ──────────────────────────────────────────────────────────
// Four ingredients, three of which appear in multiple recipes — so the
// shopping-list renderer's per-unit aggregation visibly does work.
const ingredientSpecs: PrimitiveSpec[] = [
  {
    id: "ingredient:tomato",
    type: "recipe:Ingredient",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Tomatoes, ripe",
      default_unit: "g",
      allergens: [],
    },
  },
  {
    id: "ingredient:basil",
    type: "recipe:Ingredient",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Basil, fresh",
      default_unit: "g",
      allergens: [],
    },
  },
  {
    id: "ingredient:olive-oil",
    type: "recipe:Ingredient",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Olive oil, extra-virgin",
      default_unit: "ml",
      allergens: [],
    },
  },
  {
    id: "ingredient:salt",
    type: "recipe:Ingredient",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Salt, fine sea",
      default_unit: "tsp",
      allergens: [],
    },
  },
];

// ── Recipes ──────────────────────────────────────────────────────────────
const recipeSpecs: PrimitiveSpec[] = [
  {
    id: "recipe:caprese-salad",
    type: "recipe:Recipe",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Caprese Salad",
      summary: "Tomato, basil, mozzarella with a drizzle of olive oil.",
      difficulty: "easy",
      prep_minutes: 10,
      cook_minutes: 0,
      servings: 2,
      method:
        "Slice tomatoes and mozzarella into rounds. Layer alternately with basil leaves. Drizzle with olive oil. Season with salt to taste. Serve immediately.",
    },
  },
  {
    id: "recipe:tomato-soup",
    type: "recipe:Recipe",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Tomato Soup",
      summary: "Simple roasted-tomato soup with basil.",
      difficulty: "easy",
      prep_minutes: 15,
      cook_minutes: 35,
      servings: 4,
      method:
        "Halve the tomatoes and roast at 200°C / 400°F for 30 minutes with a pinch of salt. Blend with the basil leaves until smooth. Adjust seasoning. Serve hot.",
    },
  },
  {
    id: "recipe:salad-dressing",
    type: "recipe:Recipe",
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "Quick Salad Dressing",
      summary: "Three-ingredient emulsified dressing.",
      difficulty: "easy",
      prep_minutes: 3,
      cook_minutes: 0,
      servings: 4,
      method:
        "Whisk olive oil and salt with a splash of vinegar (not tracked here — the workbook is intentionally minimal) until emulsified. Use immediately.",
    },
  },
];

// ── Relations ────────────────────────────────────────────────────────────
// recipe:Uses edges carry (quantity, unit) on the EDGE itself — see
// plugins/_starter/relations.ts for why. The shopping-list renderer
// reads these to aggregate per-ingredient totals across recipes.
const relations: RelationSpec[] = [
  // Caprese Salad: tomato + basil + olive-oil
  {
    id: "rel:caprese-uses-tomato",
    type: "recipe:Uses",
    from: "recipe:caprese-salad",
    to: "ingredient:tomato",
    fields: { quantity: 300, unit: "g" },
  },
  {
    id: "rel:caprese-uses-basil",
    type: "recipe:Uses",
    from: "recipe:caprese-salad",
    to: "ingredient:basil",
    fields: { quantity: 10, unit: "g" },
  },
  {
    id: "rel:caprese-uses-oil",
    type: "recipe:Uses",
    from: "recipe:caprese-salad",
    to: "ingredient:olive-oil",
    fields: { quantity: 30, unit: "ml" },
  },

  // Tomato Soup: tomato + basil + salt
  {
    id: "rel:soup-uses-tomato",
    type: "recipe:Uses",
    from: "recipe:tomato-soup",
    to: "ingredient:tomato",
    fields: { quantity: 1000, unit: "g" },
  },
  {
    id: "rel:soup-uses-basil",
    type: "recipe:Uses",
    from: "recipe:tomato-soup",
    to: "ingredient:basil",
    fields: { quantity: 15, unit: "g" },
  },
  {
    id: "rel:soup-uses-salt",
    type: "recipe:Uses",
    from: "recipe:tomato-soup",
    to: "ingredient:salt",
    fields: { quantity: 1, unit: "tsp" },
  },

  // Salad Dressing: olive-oil + salt
  {
    id: "rel:dressing-uses-oil",
    type: "recipe:Uses",
    from: "recipe:salad-dressing",
    to: "ingredient:olive-oil",
    fields: { quantity: 100, unit: "ml" },
  },
  {
    id: "rel:dressing-uses-salt",
    type: "recipe:Uses",
    from: "recipe:salad-dressing",
    to: "ingredient:salt",
    fields: { quantity: 0.5, unit: "tsp" },
  },

  // Tags
  {
    id: "rel:caprese-tag-veg",
    type: "recipe:TaggedWith",
    from: "recipe:caprese-salad",
    to: "tag:vegetarian",
    fields: {},
  },
  {
    id: "rel:caprese-tag-quick",
    type: "recipe:TaggedWith",
    from: "recipe:caprese-salad",
    to: "tag:quick",
    fields: {},
  },
  {
    id: "rel:soup-tag-veg",
    type: "recipe:TaggedWith",
    from: "recipe:tomato-soup",
    to: "tag:vegetarian",
    fields: {},
  },
  {
    id: "rel:dressing-tag-quick",
    type: "recipe:TaggedWith",
    from: "recipe:salad-dressing",
    to: "tag:quick",
    fields: {},
  },
];

async function main(): Promise<void> {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "Starter Recipes (worked example)",
    profile: PROFILE_ID,
    description:
      "Worked example for the fdpm.starter educational plugin: 3 recipes, 4 ingredients, 2 tags, 12 relations. Designed so the shopping-list renderer demonstrates ingredient aggregation across recipes.",
  })
    .primitives([
      ...tagSpecs,
      ...ingredientSpecs,
      ...recipeSpecs,
    ])
    .relations(relations)
    .commit({ rollbackOnError: true });

  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render the shopping list with:");
  console.log(
    `  fdpm render ${PROJECT_ID} text/markdown --renderer-id recipe:ShoppingListRenderer`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  if (e && typeof e === "object" && "findings" in e) {
    console.error(
      "Findings:",
      JSON.stringify((e as { findings: unknown }).findings, null, 2),
    );
  }
  process.exit(1);
});
