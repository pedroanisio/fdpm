/**
 * `text/markdown` shopping-list renderer for recipe workbooks.
 *
 * Produces a Markdown document aggregating every ingredient used by
 * every recipe in the workbook, summing quantities across recipes when
 * the unit matches. Recipes appear separately at the end, each linked
 * to their ingredients.
 *
 * EDUCATIONAL NOTE — the determinism requirement:
 *   property:idempotent-activation in the spec workbook says renderers
 *   MUST be deterministic — same workbook revision in, same bytes out.
 *   That means:
 *     - Iterate primitives in a STABLE order. We sort by id throughout.
 *     - Don't read the clock, don't generate UUIDs, don't read env.
 *     - Floating-point sums need tie-breaking; we round to 2 decimals
 *       and convert to string with a fixed locale.
 *     - Map iteration is insertion-ordered in modern JS, but Object.values
 *       on a record is NOT guaranteed; sort keys before iteration.
 *
 *   The host caches renderer output by content hash. A non-deterministic
 *   renderer breaks the cache and invalidates downstream consumers'
 *   assumptions about "the same workbook produces the same artifact."
 *
 * EDUCATIONAL NOTE — escape only what would break parsing:
 *   Many renderers over-escape Markdown, producing literal backslashes
 *   in output that nobody wants to see. Escape \\, `, *, _, [, ], <
 *   inside text content. Don't escape ()/{}>/etc.
 */
import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../../src/core/models/instance.js";

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as Record<string, unknown>)[key] as T | undefined;
}

function relFv<T = unknown>(r: RelationInstance, key: string): T | undefined {
  return (r.field_values as Record<string, unknown>)[key] as T | undefined;
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_\[\]<])/g, "\\$1");
}

/** Round a number to 2 decimals deterministically. */
function round2(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 100) / 100;
  // toFixed gives a string with trailing zeros; strip them so 1.50 → 1.5
  return r.toString();
}

interface Aggregate {
  ingredientId: string;
  ingredientName: string;
  /** unit → summed quantity. Distinct units stay separate. */
  byUnit: Map<string, number>;
}

export const renderShoppingList: RendererFn = (input): RendererOutput => {
  const { primitives, relations, workbookId } = input;

  // Index primitives by id for relation-target lookups. Sort the id
  // list so any later iteration is deterministic.
  const primById = new Map<string, PrimitiveInstance>();
  for (const p of primitives) primById.set(p.id, p);

  // Bucket recipes and ingredients separately.
  const recipes = primitives
    .filter((p) => p.type_id === "recipe:Recipe")
    .sort((a, b) => a.id.localeCompare(b.id));

  // Aggregate quantities across all recipe:Uses edges.
  const aggregates = new Map<string, Aggregate>();
  // Collect Uses edges in a stable order so the per-recipe section
  // below mirrors the aggregate ordering.
  const usesEdges = relations
    .filter((r) => r.type_id === "recipe:Uses")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const edge of usesEdges) {
    const ingredient = primById.get(edge.target_id);
    if (!ingredient || ingredient.type_id !== "recipe:Ingredient") continue;
    const qty = relFv<number>(edge, "quantity");
    const unit = relFv<string>(edge, "unit");
    if (typeof qty !== "number" || typeof unit !== "string") continue;
    const name = String(fv<string>(ingredient, "name") ?? ingredient.id);
    const agg = aggregates.get(ingredient.id) ?? {
      ingredientId: ingredient.id,
      ingredientName: name,
      byUnit: new Map<string, number>(),
    };
    agg.byUnit.set(unit, (agg.byUnit.get(unit) ?? 0) + qty);
    aggregates.set(ingredient.id, agg);
  }

  const lines: string[] = [];
  lines.push(`# ${escapeMd(workbookId)} — Shopping List`);
  lines.push("");
  lines.push(
    `Aggregated across ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}.`,
  );
  lines.push("");

  lines.push("## Ingredients (aggregated)");
  lines.push("");
  if (aggregates.size === 0) {
    lines.push("_No ingredients found. Add `recipe:Uses` edges from your recipes to ingredients._");
  } else {
    const sortedAggs = [...aggregates.values()].sort((a, b) =>
      a.ingredientName.localeCompare(b.ingredientName) || a.ingredientId.localeCompare(b.ingredientId),
    );
    for (const agg of sortedAggs) {
      const unitParts = [...agg.byUnit.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([unit, qty]) => `${round2(qty)} ${unit}`);
      lines.push(`- **${escapeMd(agg.ingredientName)}** — ${unitParts.join(" + ")}`);
    }
  }
  lines.push("");

  lines.push("## Recipes");
  lines.push("");
  for (const recipe of recipes) {
    const name = String(fv<string>(recipe, "name") ?? recipe.id);
    const summary = fv<string>(recipe, "summary");
    const servings = fv<number>(recipe, "servings");
    lines.push(`### ${escapeMd(name)}`);
    lines.push("");
    lines.push(`\`${recipe.id}\`${servings != null ? ` · ${servings} servings` : ""}`);
    if (summary) {
      lines.push("");
      lines.push(escapeMd(summary));
    }
    const myUses = usesEdges.filter((e) => e.source_id === recipe.id);
    if (myUses.length > 0) {
      lines.push("");
      lines.push("Ingredients:");
      for (const edge of myUses) {
        const ingredient = primById.get(edge.target_id);
        const ingName = ingredient
          ? String(fv<string>(ingredient, "name") ?? ingredient.id)
          : edge.target_id;
        const qty = relFv<number>(edge, "quantity");
        const unit = relFv<string>(edge, "unit");
        const qtyStr = qty != null && unit != null ? `${round2(qty)} ${unit}` : "(no quantity)";
        lines.push(`- ${escapeMd(ingName)} — ${qtyStr}`);
      }
    }
    lines.push("");
  }

  const text = lines.join("\n").trimEnd() + "\n";
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: "shopping-list.md",
  };
};
