/**
 * Categories — the high-level conceptual buckets your primitives live in.
 *
 * EDUCATIONAL NOTE — why bother with categories?
 *   Categories show up in renderers, the web frontend's profile detail
 *   page, and the workbook validation report's grouping. They cost
 *   nothing at runtime; they pay off in human-readable output. Pick
 *   2–4 categories that *describe* your domain (not your file layout).
 *
 *   For the recipe domain we have two:
 *     cat:starter:recipe — recipes themselves, their ingredients, the
 *                          things you eat.
 *     cat:starter:meta   — metadata about recipes (tags, classification).
 *
 *   If your domain has only one cluster, ship one category. The DNIS
 *   plugin does exactly this.
 */
import type { CategoryDef } from "../../src/core/models/meta.js";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:starter:recipe",
    name: "Recipe",
    description: "Recipes and their ingredients.",
  },
  {
    id: "cat:starter:meta",
    name: "Metadata",
    description: "Tags and other metadata that classify recipes.",
  },
];
