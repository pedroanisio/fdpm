/**
 * Recipe-domain primitives.
 *
 * Two types live here:
 *   recipe:Recipe     — a named dish with a method and yield.
 *   recipe:Ingredient — a thing you put in a recipe.
 *
 * EDUCATIONAL NOTE — splitting primitives across files:
 *   The planning plugin splits by category (work / scheduling /
 *   assurance / execution). The DNIS plugin keeps everything in one
 *   file. Both are fine. Split when a single file gets unwieldy
 *   (>~150 lines) OR when the primitives in one cluster have different
 *   review owners. Don't split on principle.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, intField, primitive, shortText, str, strList } from "../_common.js";

const DIFFICULTY_VALUES = ["easy", "medium", "hard"];

export const RECIPE: PrimitiveTypeDef = primitive({
  id: "recipe:Recipe",
  name: "Recipe",
  category: "cat:starter:recipe",
  description:
    "A named dish with a method and a yield. The recipe references its ingredients via the recipe:Uses relation, which carries quantity metadata. Tags attach via recipe:TaggedWith.",
  scoped: true,
  id_format: idTemplate("recipe:{slug}"),
  fields: [
    shortText("name", "Human-readable name (e.g. 'Tomato soup').", 120),
    shortText(
      "summary",
      "One-line description shown in renderers and lists.",
      280,
      { required: false },
    ),
    enumOf("difficulty", "How hard this is to cook well.", DIFFICULTY_VALUES),
    intField("prep_minutes", "Active preparation time in minutes.", { required: false }),
    intField("cook_minutes", "Cooking time in minutes (oven, stove, etc.).", { required: false }),
    intField("servings", "Number of servings the recipe yields."),
    str("method", "Cooking method as free text. Markdown allowed.", { required: false }),
  ],
});

export const INGREDIENT: PrimitiveTypeDef = primitive({
  id: "recipe:Ingredient",
  name: "Ingredient",
  category: "cat:starter:recipe",
  description:
    "A standalone ingredient. Lives independently of any specific recipe so the same ingredient can be referenced by many recipes (the shopping-list renderer aggregates across all recipes in a workbook).",
  scoped: true,
  id_format: idTemplate("ingredient:{slug}"),
  fields: [
    shortText("name", "Ingredient name (e.g. 'Tomatoes, ripe').", 120),
    enumOf("default_unit", "Default measurement unit when used in a recipe.", [
      "g",
      "kg",
      "ml",
      "l",
      "tsp",
      "tbsp",
      "cup",
      "piece",
      "pinch",
    ]),
    strList(
      "allergens",
      "Allergen tags relevant to this ingredient (e.g. ['dairy', 'gluten']). Empty list when none apply.",
      { required: false },
    ),
  ],
});
