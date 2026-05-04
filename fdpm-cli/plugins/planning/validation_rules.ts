import type { ValidationRuleDef } from "../../src/core/models/meta.js";

/**
 * Planning plugin validation rules.
 *
 * All rules ship with a CEL `expression` evaluated by the §7 ValidationPipeline
 * via the host's expression runtime. The legacy DSL `predicate` field is
 * preserved for documentation parity with the other shipped plugins.
 *
 * Helper-set v1.1.0 dependency: rule `plan:val:implements-target-exists`
 * relies on `graph.target_exists` (added in helper-set v1.1.0). The plugin
 * manifest pins `expr_helper_set: ">=1.1.0,<2"` so older hosts refuse to
 * load this plugin rather than evaluate the rule against an absent helper.
 *
 * Activation contract notes (per SPEC-EXPRESSION-RUNTIME §M7):
 *   - `instance.field_values.<f>` reads optional fields; predicates use the
 *     CEL `has()` macro to distinguish absent from null.
 *   - `graph.outgoing(rel_id).size()` walks relations from the current
 *     instance; returns 0 vacuously when there is no edge of that type.
 *   - `graph.target_exists(rel_id)` is vacuously true on instances with no
 *     outbound edges of that type — pair with the size guard for non-empty
 *     contracts.
 *
 * AUTHORING PATTERN (read this before adding tasks programmatically).
 *
 * Three rules require GRAPH STATE that doesn't exist at primitive-create
 * time: plan:val:non-root-task-has-deps, plan:val:done-task-has-ac, and
 * plan:val:ai-task-has-machine-checkable-ac. The host's per-write
 * validation evaluates rules on the post-state of each individual write —
 * meaning a Task created via Host.createPrimitive runs all 12 rules
 * BEFORE any subsequent Host.createRelation can add the edges those rules
 * look for. Practical consequences when writing a build script:
 *
 *   1. The simple flow `createPrimitive(task) ; createRelation(verifies)`
 *      will fail on AI tasks with executor_kind=AI because the AC rule
 *      can't find an outbound Verifies edge yet.
 *
 *   2. Recommended workaround for AI-from-the-start tasks (4 ops):
 *        a. Create the AcceptanceCriterion primitive first.
 *        b. Create the Task with executor_kind="Either" or "Human".
 *           (Either is a real semantic value; Human is also fine.)
 *        c. Create the plan:Verifies relation Task → AC.
 *        d. host.replacePrimitive on the Task to flip executor_kind="AI".
 *
 *   3. Recommended workaround for "this is a top-level task with no
 *      parent yet": set is_root=true at create time. is_root is a
 *      positive domain assertion ("self-contained root") AND the
 *      create-time exemption for plan:val:non-root-task-has-deps; the
 *      task may keep is_root=true if it remains a root, or have it
 *      replaced off once a parent edge exists.
 *
 *   4. For batch authoring of tens-to-hundreds of tasks at once, prefer
 *      host-extra `batchEdit` (fdpm-cli/src/core/host-extra.ts) — it skips
 *      per-op validation entirely and the operator runs validateProject
 *      after the batch closes. This is the only path that lets a Done
 *      task be committed without splitting the operation across
 *      create + replace.
 *
 * The seed at fdpm-cli/scripts/build-planning-self.ts demonstrates patterns 2
 * and 3 within the SDK's defineProject/.commit() flow.
 */

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
  // (1) AI-task duration enum is enforced by the field's `Enum[5,...,60]`
  // already; this rule cross-checks that AI tasks have actually populated
  // the field. Without it, an AI task with executor_kind=AI but missing
  // ai_minutes would pass the field-shape check.
  rule(
    "plan:val:ai-task-duration-bounded",
    "AI tasks must declare a bounded duration",
    "error",
    ["plan:Task"],
    'when(field("executor_kind") == "AI", non_trivial(ai_minutes))',
    'instance.field_values.executor_kind != "AI" || (has(instance.field_values.ai_minutes) && int(instance.field_values.ai_minutes) >= 5 && int(instance.field_values.ai_minutes) <= 60 && int(instance.field_values.ai_minutes) % 5 == 0)',
    "AI tasks must declare ai_minutes in {5, 10, 15, ..., 60}. Tasks longer than 60 minutes must be split.",
  ),

  // (2) Non-root, non-subtasked, non-contained tasks must declare an
  // explicit DependsOn — the user's hard requirement. Tasks marked
  // is_root=true are exempt (see field doc).
  rule(
    "plan:val:non-root-task-has-deps",
    "Tasks without a parent must declare dependencies",
    "error",
    ["plan:Task"],
    "is_root or has_incoming(self, \"plan:Subtask\") or has_incoming(self, \"plan:Contains\") or has_outgoing(self, \"plan:DependsOn\")",
    '(has(instance.field_values.is_root) && instance.field_values.is_root == true) || graph.incoming("plan:Subtask").size() >= 1 || graph.incoming("plan:Contains").size() >= 1 || graph.outgoing("plan:DependsOn").size() >= 1',
    "Every task must declare context: it must be a subtask of another task, contained in a WorkBreakdown, marked is_root=true, or list explicit dependencies via plan:DependsOn.",
  ),

  // (3) Dependency cycles. Reuses the v1.0.0 acyclic helper.
  rule(
    "plan:val:no-circular-deps",
    "DependsOn must be acyclic",
    "error",
    ["plan:Task"],
    "acyclic(self, \"plan:DependsOn\")",
    'graph.acyclic("plan:DependsOn")',
    "Two tasks that DependsOn each other (directly or transitively) cannot both be scheduled. The dependency graph MUST be a DAG.",
  ),

  // (4) Done tasks: at minimum, every Done task must have at least one
  // plan:Verifies edge. We can't (yet) check that the AC at the other end
  // is `met` — that would need a graph helper for cross-primitive field
  // inspection, deferred to a future helper-set bump. This rule catches
  // the strictly weaker but still useful "Done with no AC at all".
  rule(
    "plan:val:done-task-has-ac",
    "Done tasks must have at least one acceptance criterion",
    "error",
    ["plan:Task"],
    'when(field("status") == "Done", has_outgoing(self, "plan:Verifies"))',
    'instance.field_values.status != "Done" || graph.outgoing("plan:Verifies").size() >= 1',
    "A task marked Done must have at least one plan:Verifies edge to a plan:AcceptanceCriterion. (AC status itself is not cross-checked here; see Future Work.)",
  ),

  // (5) Blocked tasks must have a blocker. Otherwise the status is unclaimed.
  rule(
    "plan:val:blocked-task-has-blocker",
    "Blocked tasks must reference a blocker",
    "error",
    ["plan:Task"],
    'when(field("status") == "Blocked", has_outgoing(self, "plan:BlockedBy"))',
    'instance.field_values.status != "Blocked" || graph.outgoing("plan:BlockedBy").size() >= 1',
    "A task with status=Blocked must have at least one outgoing plan:BlockedBy edge. Without one, 'Blocked' is unclaimed.",
  ),

  // (6) Date sanity.
  rule(
    "plan:val:planned-dates-ordered",
    "Planned finish must not precede planned start",
    "error",
    ["plan:Task"],
    'planned_finish >= planned_start (when both set)',
    '!has(instance.field_values.planned_start) || !has(instance.field_values.planned_finish) || instance.field_values.planned_finish >= instance.field_values.planned_start',
    "When both planned_start and planned_finish are set, planned_finish must be greater than or equal to planned_start. ISO-8601 strings sort lexicographically when same TZ.",
  ),

  // (7) A claim without an expiry is an unbounded lock — disallowed.
  rule(
    "plan:val:claim-has-expiry",
    "Claim holder requires a claim expiry",
    "error",
    ["plan:Task"],
    "claim_holder_id implies claim_until",
    "!has(instance.field_values.claim_holder_id) || has(instance.field_values.claim_until)",
    "A task with claim_holder_id set MUST also set claim_until. A claim without an expiry is an unbounded lock; the renderer cannot surface stale claims without an expiry.",
  ),

  // (8) AI tasks MUST have at least one AC with a non-empty CEL expression.
  // Two-step check: count outgoing Verifies (must be >=1) AND that at least
  // one of the targeted AC primitives in the project carries a non-empty
  // expression. The second half is hard to express in pure CEL today —
  // graph.outgoing returns ids, not the AC field_values. We approximate
  // with a structural check: AI task must have at least one Verifies edge.
  // The "at least one machine-checkable AC" half is covered by a code-side
  // CI check rather than CEL. NOTE: this is documented in the rule message.
  rule(
    "plan:val:ai-task-has-machine-checkable-ac",
    "AI tasks must have at least one acceptance criterion (machine-checkable AC enforced via CI)",
    "error",
    ["plan:Task"],
    'when(field("executor_kind") == "AI", has_outgoing(self, "plan:Verifies"))',
    'instance.field_values.executor_kind != "AI" || graph.outgoing("plan:Verifies").size() >= 1',
    "AI-executable tasks must declare at least one plan:Verifies edge to a plan:AcceptanceCriterion. The stricter requirement — at least one of those ACs must have a non-empty CEL `expression` field — cannot be expressed in pure CEL against the v1.1.0 activation; planning's CI check enforces it. Without machine-checkable acceptance, an AI executor has no autonomous way to know it succeeded.",
  ),

  // (9) Cross-profile plan:Implements link must not dangle. Uses the
  // helper-set v1.1.0 graph.target_exists. Vacuously true when the task
  // has no outgoing Implements edge.
  rule(
    "plan:val:implements-target-exists",
    "plan:Implements targets must exist in the project",
    "error",
    ["plan:Task"],
    'forall edges of plan:Implements: graph.exists(target)',
    'graph.target_exists("plan:Implements")',
    "Defense-in-depth check: the Core's relation gate already rejects dangling relations at create time AND cascades target deletion. This rule guards against any future Core relaxation by re-asserting at validate-time. On a v1.1 host using the standard relation gate, the rule is a no-op in practice; it is kept because (a) the cost is one graph.target_exists call per task, and (b) policy may relax in the future.",
  ),

  // (10) In-progress task should have an assignee. Warning, not error —
  // brief no-assignee periods during reassignment are legitimate.
  rule(
    "plan:comp:in-progress-has-assignee",
    "In-progress tasks should have an assignee",
    "warning",
    ["plan:Task"],
    'when(field("status") == "In_progress", has(field("assignee_id")))',
    'instance.field_values.status != "In_progress" || has(instance.field_values.assignee_id)',
    "Tasks in In_progress should declare assignee_id (a sw:Actor). Brief gaps during reassignment are tolerated; the warning surfaces stale unattributed work.",
  ),

  // ---------------------------------------------------------------------------
  // Pass-2 additions: Iteration + Milestone date sanity.
  // ---------------------------------------------------------------------------

  // (11) Iteration window must be coherent. Mirrors plan:val:planned-dates-
  // ordered for tasks. Both fields are required on plan:Iteration so the
  // has() guards are unnecessary, but we keep them for symmetry with the
  // task-level rule.
  rule(
    "plan:val:iteration-dates-ordered",
    "Iteration end_date must not precede start_date",
    "error",
    ["plan:Iteration"],
    "end_date >= start_date",
    "instance.field_values.end_date >= instance.field_values.start_date",
    "An iteration's end_date must be greater than or equal to its start_date. ISO-8601 strings sort lexicographically when same TZ.",
  ),

  // (12) A milestone declared `Hit` must not have a target_date in the
  // future. Either the date or the status is wrong. Warning, not error —
  // off-by-one timezone differences during the day of a milestone hit are
  // a real (if mild) edge case the operator should review, not be blocked
  // by. Uses env.NOW (frozen at evaluator construction per
  // SPEC-EXPRESSION-RUNTIME §M7) so the rule is deterministic across a
  // single validate call.
  rule(
    "plan:val:milestone-hit-not-future",
    "Milestone marked Hit must not be dated in the future",
    "warning",
    ["plan:Milestone"],
    'when(field("status") == "Hit", target_date <= env.NOW)',
    'instance.field_values.status != "Hit" || instance.field_values.target_date <= env.NOW',
    "When status is set to Hit, target_date must be at or before env.NOW. A future-dated 'Hit' milestone is almost always a typo — either the status should be Upcoming or the date is wrong.",
  ),
];
