/**
 * Centralised string-id constants for the `fdpm.planning` profile.
 *
 * The profile primitives (`primitives/{work,assurance,scheduling}.ts`)
 * and relations (`relations.ts`) declare their `id` fields as raw string
 * literals. Build scripts under `fdpm-cli/scripts/build-plan-*.ts`
 * previously re-stated those same strings as `type: "plan:Task"` literals
 * at every use site — a manual mirror with no compile-time link back to
 * the schema.
 *
 * This module is the single source of truth for those id strings. Build
 * scripts import the named constants here; if a primitive or relation id
 * is renamed in the schema and not updated here, TypeScript surfaces the
 * mismatch at compile time. Drift becomes loud.
 *
 * Naming convention:
 *   - `PLAN_<TypeName>` for primitive type ids (e.g. `PLAN_TASK`).
 *   - `PLAN_REL_<RelationName>` for relation type ids (e.g.
 *     `PLAN_REL_DEPENDS_ON`).
 *
 * All values are typed `as const` so they are accepted as string-literal
 * types where the schema demands a specific id.
 *
 * Mirrors `plugins/spec_authoring/ids.ts`.
 */

// ── Primitive type ids ─────────────────────────────────────────────────────

// work.ts
export const PLAN_WORK_BREAKDOWN = "plan:WorkBreakdown" as const;
export const PLAN_TASK = "plan:Task" as const;

// assurance.ts
export const PLAN_ACCEPTANCE_CRITERION = "plan:AcceptanceCriterion" as const;
export const PLAN_BLOCKER = "plan:Blocker" as const;

// scheduling.ts
export const PLAN_ITERATION = "plan:Iteration" as const;
export const PLAN_MILESTONE = "plan:Milestone" as const;

// ── Relation type ids ──────────────────────────────────────────────────────

export const PLAN_REL_SUBTASK = "plan:Subtask" as const;
export const PLAN_REL_CONTAINS = "plan:Contains" as const;
export const PLAN_REL_DEPENDS_ON = "plan:DependsOn" as const;
export const PLAN_REL_BLOCKED_BY = "plan:BlockedBy" as const;
export const PLAN_REL_VERIFIES = "plan:Verifies" as const;
export const PLAN_REL_ASSIGNED_TO = "plan:AssignedTo" as const;
export const PLAN_REL_IN_ITERATION = "plan:InIteration" as const;
export const PLAN_REL_IMPLEMENTS = "plan:Implements" as const;
export const PLAN_REL_HITS_MILESTONE = "plan:HitsMilestone" as const;
