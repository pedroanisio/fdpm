/**
 * Scopes — partition units for cross-primitive id uniqueness.
 *
 * EDUCATIONAL NOTE — what is a scope, really?
 *   A scope is a "namespace" within a workbook. Two primitives with the
 *   same id can coexist in DIFFERENT scopes; SPEC-CORE uses the
 *   (scope_id, id) pair as the uniqueness key when a primitive type
 *   declares `scoped: true`.
 *
 *   For most plugins, ONE scope is enough — every primitive lives in
 *   the workbook-level scope, and ids are globally unique within the
 *   workbook. The starter follows this pattern: one scope,
 *   `scope:starter:workbook`.
 *
 *   Multiple scopes earn their keep when you have a notion of
 *   "containers within a workbook" — e.g., the planning plugin has
 *   `scope:plan:workbook` and `scope:plan:iteration` so the same task
 *   id could (in principle) live in different iterations. If you don't
 *   need that, don't add scopes; you can always add them in a minor
 *   profile bump (it's an additive change — see
 *   property:profile-id-stability).
 */
import type { ScopeDef } from "../../src/core/models/meta.js";

export const SCOPES: ScopeDef[] = [
  {
    id: "scope:starter:workbook",
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope; every recipe primitive lives here.",
  },
];

/**
 * Scope sets — named groups of scopes for primitive types that can
 * legitimately live in any of several scopes. The starter ships one
 * empty scope set because we have a single scope.
 */
export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";
