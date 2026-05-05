/**
 * Relations.
 *
 * Two relations:
 *   recipe:Uses        — Recipe → Ingredient. Carries `quantity` and
 *                        `unit` as metadata on the EDGE itself, because
 *                        the same ingredient is used in different
 *                        amounts by different recipes.
 *
 *   recipe:TaggedWith  — Recipe → Tag. No edge metadata.
 *
 * EDUCATIONAL NOTE — `metadata_schema` vs `fields`:
 *   `fields` defines fields on the relation INSTANCE itself (rare —
 *   most relations are pure edges with no fields). `metadata_schema`
 *   defines fields the relation carries as a side-channel; the host
 *   validates these via the same FieldDefT machinery. Use
 *   metadata_schema when the edge has properties that don't deserve
 *   their own primitive type. Quantity-on-an-edge is the canonical
 *   example: making `RecipeUsesIngredient` a primitive type would be
 *   over-modeled.
 *
 * EDUCATIONAL NOTE — `target_types: "*"` (wildcard):
 *   Some relations target any primitive type (planning's plan:Implements
 *   does this). The wildcard string `"*"` is the convention. Avoid it
 *   unless you genuinely mean "any". A small array of allowed types is
 *   safer because the host can check at relation create time. The
 *   starter does NOT use wildcards.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { enumOf, numberField } from "./_common.js";

export const RELATIONS: RelationTypeDef[] = [
  {
    id: "recipe:Uses",
    name: "Uses",
    description:
      "Recipe uses ingredient in the given quantity. The (quantity, unit) metadata identifies HOW MUCH; one Recipe→Ingredient edge per usage.",
    source_types: ["recipe:Recipe"],
    target_types: ["recipe:Ingredient"],
    metadata_schema: [
      numberField("quantity", "How much of the ingredient is used."),
      enumOf(
        "unit",
        "Measurement unit. SHOULD match the ingredient's default_unit; mismatches are allowed (a recipe may need 'ml' of an ingredient whose default_unit is 'cup').",
        ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch"],
      ),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "recipe:TaggedWith",
    name: "TaggedWith",
    description: "Recipe is classified by the named tag.",
    source_types: ["recipe:Recipe"],
    target_types: ["recipe:Tag"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
