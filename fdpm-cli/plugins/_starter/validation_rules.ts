/**
 * Validation rules — declarative CEL-evaluated checks the host runs on
 * every primitive create / replace / patch.
 *
 * EDUCATIONAL NOTE — three layers of validation, in order of cost:
 *   1. FIELD SHAPE — `Enum[...]`, `max_length`, `min_items`. Defined on
 *      FieldDefT in primitives. The host evaluates these for free on
 *      every field. Use these whenever you can — they're the cheapest
 *      and produce the friendliest errors.
 *
 *   2. CEL RULES — what's in this file. The rule's `expression` is
 *      evaluated by SPEC-EXPRESSION-RUNTIME and can read the
 *      primitive's fields, walk the graph (graph.outgoing,
 *      graph.incoming, graph.acyclic), and compose helpers. Use these
 *      for cross-field invariants and cross-primitive constraints.
 *
 *   3. CODE VALIDATORS — what `_capabilities.ts` registers via
 *      `cap:validator`. JS code; can do anything. Use these only when
 *      CEL can't express it (e.g., "this number must be in a hard-coded
 *      set of buckets" — CEL doesn't have set membership for numeric
 *      literals as of helper-set v1.1.0).
 *
 *   Don't reach for higher layers when a lower one fits. Most rules
 *   should be field-shape + CEL.
 *
 * EDUCATIONAL NOTE — the "create-time graph trap":
 *   CEL rules that walk the graph (graph.outgoing, graph.incoming) run
 *   AT THE MOMENT a primitive is created — before any subsequent
 *   relation create has happened. This means a rule like "every Recipe
 *   must have at least one Uses edge" REJECTS the very Recipe you're
 *   trying to create, because the relation doesn't exist yet.
 *
 *   Workarounds (each plugin chooses one):
 *     A. Use a "starter exempt" field on the primitive that the rule
 *        respects (the planning plugin uses `is_root=true` for this).
 *     B. Author primitives in a specific order: AC first, recipe
 *        second, relation third, then `replacePrimitive` to flip a
 *        flag. The planning README documents this in detail.
 *     C. Make the rule a WARNING (level: "warning") and run a separate
 *        `validateProject` pass after batch authoring.
 *     D. Make the check WEAKER ("Recipe with at least one Uses OR
 *        explicitly marked as no-ingredients").
 *
 *   The starter uses option D for its has-ingredient rule. See the
 *   rule definition below.
 */
import type { ValidationRuleDef } from "../../src/core/models/meta.js";

type Rule = Omit<ValidationRuleDef, "level"> & {
  level: "error" | "warning" | "info";
};

const rule = (
  id: string,
  name: string,
  level: "error" | "warning" | "info",
  applies_to: string[],
  predicate: string,
  expression: string,
  description: string,
): Rule => ({
  id,
  name,
  level,
  applies_to,
  targets: applies_to,
  predicate,
  expression,
  description,
});

export const VALIDATION_RULES: ValidationRuleDef[] = [
  // (1) Servings must be positive. A pure field-shape check could not
  // express ">0" (only enums and max-length / min-items today), so this
  // is a CEL rule.
  rule(
    "recipe:val:servings-positive",
    "Recipe.servings must be positive",
    "error",
    ["recipe:Recipe"],
    "field(servings) > 0",
    "instance.field_values.servings > 0",
    "A recipe with zero or negative servings is meaningless. Set servings to a positive integer.",
  ),

  // (2) Cook + prep time, when both present, must be at least 1 minute
  // total. Demonstrates a multi-field invariant CEL handles cleanly.
  rule(
    "recipe:val:nonzero-total-time",
    "Total time must be at least 1 minute when both prep and cook are set",
    "warning",
    ["recipe:Recipe"],
    "when(has(prep_minutes) and has(cook_minutes), prep_minutes + cook_minutes >= 1)",
    "!(has(instance.field_values.prep_minutes) && has(instance.field_values.cook_minutes)) || (instance.field_values.prep_minutes + instance.field_values.cook_minutes >= 1)",
    "When both prep_minutes and cook_minutes are declared, their sum SHOULD be at least 1 minute. A zero-time recipe is suspicious.",
  ),
];
