/**
 * Build a planning workbook that tracks implementation of the
 * sections-as-tree numbering rollout described by
 * `fdpm-cli/scripts/build-spec-sections-tree.ts` (SPEC-SECTIONS-TREE v0.1).
 *
 * The plan mirrors that SPEC's structure 1:1:
 *
 *   - 6 implementation changes (CHG-1..CHG-6) → 6 plan:Task primitives.
 *   - 4 migration steps (MIG-1..MIG-4)        → 4 plan:Milestone primitives.
 *   - 5 acceptance criteria (AC-1..AC-5)      → 5 plan:AcceptanceCriterion
 *                                                primitives, each with a
 *                                                CEL `expression` checking
 *                                                that the verifying task
 *                                                exists in the graph.
 *   - 4 risks (RSK-1..RSK-4) with planned mitigations → planning blockers
 *     are emitted only for risks whose mitigation has not yet shipped.
 *
 * Dependency edges (plan:DependsOn) follow the SPEC's natural ordering:
 * schema change first, renderer DFS next, fallback detection alongside,
 * then codemod, tests, and finally the v0.2 deprecation removal.
 *
 * Run:
 *   rm -rf /tmp/fdpm-plan-sections-tree
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-sections-tree npx tsx \
 *     fdpm-cli/scripts/build-plan-sections-tree-implementation.ts
 *
 * Render outputs:
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-sections-tree-implementation text/markdown \
 *     --renderer-id plan:RoadmapRenderer -o docs/planning/sections-tree-roadmap.md
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-sections-tree-implementation image/svg+xml \
 *     --renderer-id plan:GanttSvgRenderer -o docs/planning/sections-tree-gantt.svg
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-sections-tree-implementation text/markdown \
 *     --renderer-id plan:AgentBoardRenderer -o docs/planning/sections-tree-board.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import {
  PROFILE_ID,
  SCOPE_IDS,
  // Primitive type ids
  PLAN_ITERATION,
  PLAN_WORK_BREAKDOWN,
  PLAN_MILESTONE,
  PLAN_ACCEPTANCE_CRITERION,
  PLAN_TASK,
  // Relation type ids
  PLAN_REL_IN_ITERATION,
  PLAN_REL_CONTAINS,
  PLAN_REL_DEPENDS_ON,
  PLAN_REL_VERIFIES,
  PLAN_REL_HITS_MILESTONE,
} from "../plugins/planning/index.js";
import { ALL_BUILD_SPEC_PATHS } from "./_spec-paths.js";

const MIGRATE_SECTION_NUMBERS_PATH =
  "fdpm-cli/scripts/migrate-section-numbers.ts" as const;

const PROJECT_ID = "plan-sections-tree-implementation";
const ITERATION_ID = "iteration:sections-tree-v0";
const WBS_ID = "wbs:sections-tree-rollout";

// ── Iteration ────────────────────────────────────────────────────────────

const iterationSpecs: PrimitiveSpec[] = [
  {
    id: ITERATION_ID,
    type: PLAN_ITERATION,
    scope: SCOPE_IDS.iteration,
    fields: {
      name: "sections-tree-v0",
      start_date: "2026-05-04",
      end_date: "2026-05-15",
      goal: `Land graph-derived section numbering in spec_authoring v0.1 with a back-compat fallback, ship the codemod, and prove byte-equal output for all ${ALL_BUILD_SPEC_PATHS.length} existing build-spec-*.ts scripts.`,
    },
  },
];

// ── Work breakdown ───────────────────────────────────────────────────────

const wbsSpecs: PrimitiveSpec[] = [
  {
    id: WBS_ID,
    type: PLAN_WORK_BREAKDOWN,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "sections-tree-rollout",
      summary:
        "Implementation rollout for SPEC-SECTIONS-TREE v0.1 — replace hand-authored `number` strings on spec:Section with graph-derived numbering via a new `order: int` field on spec:HasSection.",
      status: "Active",
    },
  },
];

// ── Milestones (mapped from SPEC MIG-1..MIG-4) ───────────────────────────

const milestoneSpecs: PrimitiveSpec[] = [
  {
    id: "milestone:back-compat-shipped",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "back-compat-shipped",
      target_date: "2026-05-08",
      summary:
        "MIG-1: order field + DFS renderer + fallback detection landed; existing scripts render byte-equal without changes.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:codemod-shipped",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "codemod-shipped",
      target_date: "2026-05-11",
      summary: `MIG-2: codemod migrate-section-numbers.ts ships and is run against all ${ALL_BUILD_SPEC_PATHS.length} build-spec-*.ts scripts; each migrated SPEC re-renders byte-equal.`,
      status: "Upcoming",
    },
  },
  {
    id: "milestone:deprecation-marked",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "deprecation-marked",
      target_date: "2026-05-13",
      summary:
        "MIG-3: number field on spec:Section marked deprecated in profile docs; fdpm profile inspect surfaces the deprecation.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:v0-2-removal",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "v0-2-removal",
      target_date: "2026-05-15",
      summary:
        "MIG-4: number field removed from spec:Section in spec_authoring v0.2; presence raises an error finding. Tracked separately, depends on a full minor-release cycle of fallback behaviour.",
      status: "Upcoming",
    },
  },
];

// ── Acceptance criteria (mirror SPEC AC-1..AC-5) ─────────────────────────

const acSpecs: PrimitiveSpec[] = [
  {
    id: "ac:order-field-registered",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-1: spec:HasSection.order field is registered and accepts non-negative integers. Verified by the profile schema test once the relation declaration in fdpm-cli/plugins/spec_authoring/relations.ts grows the field.",
      expression: 'graph.exists("task:relations-order")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/plugins/spec_authoring/relations.ts",
        "fdpm-cli/scripts/build-spec-sections-tree.ts",
      ],
    },
  },
  {
    id: "ac:dfs-headings-correct",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-2: rendering a workbook with `order` edges produces correct §N.M.K headings via DFS (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling). Verified by the new fixture in spec_md.test.ts.",
      expression:
        'graph.exists("task:renderer-dfs") && graph.exists("task:tests-dfs-fixture")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.test.ts",
      ],
    },
  },
  {
    id: "ac:zero-diff-pre-codemod",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion: `AC-3: all ${ALL_BUILD_SPEC_PATHS.length} existing build-spec-*.ts scripts render byte-equal output before and after the renderer change, when the migration codemod has NOT been run. Verified by a differential CI test diffing pre- and post-renderer outputs.`,
      expression:
        'graph.exists("task:fallback-detection") && graph.exists("task:tests-fallback-fixture")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/scripts/",
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.test.ts",
      ],
    },
  },
  {
    id: "ac:zero-diff-post-codemod",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion: `AC-4: after running the codemod, all ${ALL_BUILD_SPEC_PATHS.length} existing build-spec-*.ts scripts no longer set \`number\` on any spec:Section and still render byte-equal output. Verified by a per-SPEC byte-diff gate inside the codemod.`,
      expression:
        'graph.exists("task:codemod") && graph.exists("task:codemod-apply")',
      status: "open",
      evidence_refs: [
        MIGRATE_SECTION_NUMBERS_PATH,
        ...ALL_BUILD_SPEC_PATHS,
      ],
    },
  },
  {
    id: "ac:replay-determinism",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-5: byte-equal SHA-256 across two consecutive replays of any sections-tree workbook's log. Verified by extending the replay-determinism harness inherited from SPEC-UID coverage to also exercise (order, uid)-keyed sibling ordering.",
      expression: 'graph.exists("task:tests-determinism")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.test.ts",
      ],
    },
  },
];

// ── Tasks (mirror SPEC CHG-1..CHG-6 plus three test/codemod-execution tasks) ─

type Task = {
  id: string;
  name: string;
  summary: string;
  kind:
    | "Implementation"
    | "Test"
    | "Documentation"
    | "Investigation"
    | "Review"
    | "Refactor";
  executor: "AI" | "Human" | "Either";
  ai_minutes?: number;
  human_estimate?: string;
  status:
    | "Backlog"
    | "Ready"
    | "In_progress"
    | "Blocked"
    | "In_review"
    | "Done"
    | "Cancelled";
  priority: "P0" | "P1" | "P2" | "P3";
  planned_start?: string;
  planned_finish?: string;
  assignee_id?: string;
};

const tasks: Task[] = [
  // CHG-1 — schema: add `order: int` to spec:HasSection
  {
    id: "task:relations-order",
    name: "relations-order",
    summary:
      "CHG-1: Add `order: int` (optional, default 0) to spec:HasSection in fdpm-cli/plugins/spec_authoring/relations.ts. No cardinality changes; add the field after the existing description block and re-export through index.ts ids module.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 20,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  // CHG-2 — renderer DFS
  {
    id: "task:renderer-dfs",
    name: "renderer-dfs",
    summary:
      "CHG-2: Replace renderSections flat-filter in spec_md.ts with a DFS rooted at the document, sorting children by `(order, uid)`. Introduce `deriveNumber(path: number[]): string` that joins ancestor indices with '.'.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  // CHG-3 — fallback detection
  {
    id: "task:fallback-detection",
    name: "fallback-detection",
    summary:
      "CHG-3: Detect 'no `order` edges in workbook' and route through the legacy compareSectionNumbers path; emit `info`-level deprecation findings on mixed-mode workbooks (Section with both authored `number` and a derivable position).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  // CHG-5 — tests for renderer (graph + fallback + mixed)
  {
    id: "task:tests-dfs-fixture",
    name: "tests-dfs-fixture",
    summary:
      "Pure-graph fixture in spec_md.test.ts: build a Document with three nested sections (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling) using only `order` edges; assert the rendered headings exactly.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:tests-fallback-fixture",
    name: "tests-fallback-fixture",
    summary:
      "Fallback fixture in spec_md.test.ts: a workbook authored with the v0.0 pattern (only authored `number`, no `order` edges) renders byte-equal to its pre-renderer-change output.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:tests-mixed-mode",
    name: "tests-mixed-mode",
    summary:
      "Mixed-mode fixture in spec_md.test.ts: a workbook with both authored `number` and `order` edges produces the expected count of `info`-level deprecation findings — one per mixed Section.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P1",
    planned_start: "2026-05-07",
    planned_finish: "2026-05-07",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:tests-determinism",
    name: "tests-determinism",
    summary:
      "Replay-determinism gate: run the same log twice through the new (order, uid) sibling ordering and assert byte-equal SHA-256. Tiebreak shuffle: insert siblings with identical `order` in two different insertion orders and assert the rendered output is invariant.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-07",
    planned_finish: "2026-05-07",
    assignee_id: "actor:Bot:Builder",
  },
  // CHG-4 — codemod
  {
    id: "task:codemod",
    name: "codemod",
    summary:
      "CHG-4: New script fdpm-cli/scripts/migrate-section-numbers.ts. Parses build-spec-*.ts; replaces `number: \"N\"` with `fields: { order: N * 10 }` on the matching spec:HasSection; drops `number` from spec:Section. Sparse 10/20/30 keeps insertion O(1).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:codemod-diff-gate",
    name: "codemod-diff-gate",
    summary:
      "Codemod self-check: per-SPEC differential — if rendered output diverges by even one byte before/after migration, the codemod refuses to write the file. Mitigates RSK-2 (codemod silent loss).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:codemod-apply",
    name: "codemod-apply",
    summary: `Run the codemod against all ${ALL_BUILD_SPEC_PATHS.length} existing build-spec-*.ts scripts. Commit the migrated forms in a separate PR; verify each migrated SPEC re-renders byte-equal to its pre-codemod render.`,
    kind: "Refactor",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-09",
    planned_finish: "2026-05-09",
    assignee_id: "actor:Bot:Builder",
  },
  // CHG-6 — profile schema deprecation note
  {
    id: "task:deprecate-number-field",
    name: "deprecate-number-field",
    summary:
      "CHG-6: In fdpm-cli/plugins/spec_authoring/primitives/document.ts, mark the `number` field on spec:Section as deprecated in its description. No structural change in v0.1; description-only.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 15,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-12",
    planned_finish: "2026-05-12",
    assignee_id: "actor:Bot:Builder",
  },
  // Hardening: lint + perf mitigations from SPEC §16
  {
    id: "task:lint-sparse-order",
    name: "lint-sparse-order",
    summary:
      "Mitigation MIT-3: add validator spec:val:section-order-sparse — emits an `info` finding when a sibling group has more than two ties. Documents the 10/20/30 convention without forcing it.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-05-11",
    planned_finish: "2026-05-11",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:perf-baseline",
    name: "perf-baseline",
    summary:
      "Mitigation MIT-4: benchmark render time on the largest existing SPEC (SPEC-DNIS, ~120 sections); fail CI if the post-change render exceeds 2× the pre-change baseline. Mitigates RSK-4 (render-time perf regression).",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P3",
    planned_start: "2026-05-12",
    planned_finish: "2026-05-12",
    assignee_id: "actor:Bot:Builder",
  },
  // Human review gates
  {
    id: "task:rollout-review",
    name: "rollout-review",
    summary:
      "Human review of the migrated SPEC outputs and the codemod's diff-gate behaviour before merging the codemod-applied PR. Spot-checks the back-compat path on at least two unmigrated scripts and the post-codemod path on at least two migrated scripts.",
    kind: "Review",
    executor: "Human",
    human_estimate: "half day",
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-10",
    planned_finish: "2026-05-10",
    assignee_id: "actor:Person:Maintainer",
  },
  // SPEC text sync
  {
    id: "task:spec-status-flip",
    name: "spec-status-flip",
    summary:
      "Once back-compat lands and the renderer test fixtures are green, flip SPEC-SECTIONS-TREE status from Proposal to Stable in build-spec-sections-tree.ts and re-render docs/specs/SPEC-SECTIONS-TREE.md.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 20,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-05-13",
    planned_finish: "2026-05-13",
    assignee_id: "actor:Bot:Builder",
  },
];

const taskSpecs: PrimitiveSpec[] = tasks.map((t) => ({
  id: t.id,
  type: PLAN_TASK,
  scope: SCOPE_IDS.workbook,
  fields: {
    name: t.name,
    summary: t.summary,
    kind: t.kind,
    executor_kind: t.executor,
    status: t.status,
    priority: t.priority,
    is_root: true,
    ...(t.ai_minutes !== undefined ? { ai_minutes: t.ai_minutes } : {}),
    ...(t.human_estimate !== undefined ? { human_estimate: t.human_estimate } : {}),
    ...(t.planned_start ? { planned_start: t.planned_start } : {}),
    ...(t.planned_finish ? { planned_finish: t.planned_finish } : {}),
    ...(t.assignee_id ? { assignee_id: t.assignee_id } : {}),
  },
}));

// ── Relations ────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // All tasks live in the iteration and are contained by the WBS.
  ...tasks.map((t, i) => ({
    id: `rel:in-iter-${i}`,
    type: PLAN_REL_IN_ITERATION,
    from: t.id,
    to: ITERATION_ID,
  })),
  ...tasks.map((t, i) => ({
    id: `rel:contains-${i}`,
    type: PLAN_REL_CONTAINS,
    from: WBS_ID,
    to: t.id,
  })),

  // Dependency edges (plan:DependsOn). The source DEPENDS ON the target.
  // CHG-2 (renderer-dfs) depends on CHG-1 (relations-order).
  { id: "rel:dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:renderer-dfs", to: "task:relations-order" },
  // CHG-3 (fallback-detection) depends on CHG-2.
  { id: "rel:dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:fallback-detection", to: "task:renderer-dfs" },
  // Renderer tests depend on CHG-2 and CHG-3.
  { id: "rel:dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:tests-dfs-fixture", to: "task:renderer-dfs" },
  { id: "rel:dep-4", type: PLAN_REL_DEPENDS_ON, from: "task:tests-fallback-fixture", to: "task:fallback-detection" },
  { id: "rel:dep-5", type: PLAN_REL_DEPENDS_ON, from: "task:tests-mixed-mode", to: "task:fallback-detection" },
  { id: "rel:dep-6", type: PLAN_REL_DEPENDS_ON, from: "task:tests-determinism", to: "task:renderer-dfs" },
  { id: "rel:dep-7", type: PLAN_REL_DEPENDS_ON, from: "task:tests-determinism", to: "task:tests-dfs-fixture" },
  // Codemod depends on the renderer being correct (so byte-equal can be proven).
  { id: "rel:dep-8", type: PLAN_REL_DEPENDS_ON, from: "task:codemod", to: "task:tests-dfs-fixture" },
  { id: "rel:dep-9", type: PLAN_REL_DEPENDS_ON, from: "task:codemod", to: "task:tests-fallback-fixture" },
  { id: "rel:dep-10", type: PLAN_REL_DEPENDS_ON, from: "task:codemod-diff-gate", to: "task:codemod" },
  { id: "rel:dep-11", type: PLAN_REL_DEPENDS_ON, from: "task:codemod-apply", to: "task:codemod-diff-gate" },
  // Deprecation note can only land after the codemod has demonstrated it works.
  { id: "rel:dep-12", type: PLAN_REL_DEPENDS_ON, from: "task:deprecate-number-field", to: "task:codemod-apply" },
  // Sparse-order linter depends on the order field existing.
  { id: "rel:dep-13", type: PLAN_REL_DEPENDS_ON, from: "task:lint-sparse-order", to: "task:relations-order" },
  // Perf baseline benchmarks the post-change renderer.
  { id: "rel:dep-14", type: PLAN_REL_DEPENDS_ON, from: "task:perf-baseline", to: "task:renderer-dfs" },
  // Human review gates the codemod-applied PR.
  { id: "rel:dep-15", type: PLAN_REL_DEPENDS_ON, from: "task:rollout-review", to: "task:codemod-apply" },
  { id: "rel:dep-16", type: PLAN_REL_DEPENDS_ON, from: "task:rollout-review", to: "task:tests-determinism" },
  // SPEC status flip is the last documentation step.
  { id: "rel:dep-17", type: PLAN_REL_DEPENDS_ON, from: "task:spec-status-flip", to: "task:rollout-review" },
  { id: "rel:dep-18", type: PLAN_REL_DEPENDS_ON, from: "task:spec-status-flip", to: "task:deprecate-number-field" },

  // Verifies edges (plan:Verifies): each task verifies an acceptance criterion.
  { id: "rel:ver-1", type: PLAN_REL_VERIFIES, from: "task:relations-order", to: "ac:order-field-registered" },
  { id: "rel:ver-2", type: PLAN_REL_VERIFIES, from: "task:renderer-dfs", to: "ac:dfs-headings-correct" },
  { id: "rel:ver-3", type: PLAN_REL_VERIFIES, from: "task:tests-dfs-fixture", to: "ac:dfs-headings-correct" },
  { id: "rel:ver-4", type: PLAN_REL_VERIFIES, from: "task:fallback-detection", to: "ac:zero-diff-pre-codemod" },
  { id: "rel:ver-5", type: PLAN_REL_VERIFIES, from: "task:tests-fallback-fixture", to: "ac:zero-diff-pre-codemod" },
  { id: "rel:ver-6", type: PLAN_REL_VERIFIES, from: "task:codemod", to: "ac:zero-diff-post-codemod" },
  { id: "rel:ver-7", type: PLAN_REL_VERIFIES, from: "task:codemod-apply", to: "ac:zero-diff-post-codemod" },
  { id: "rel:ver-8", type: PLAN_REL_VERIFIES, from: "task:tests-determinism", to: "ac:replay-determinism" },

  // Milestones — which task completion satisfies each milestone.
  { id: "rel:mile-1", type: PLAN_REL_HITS_MILESTONE, from: "task:fallback-detection", to: "milestone:back-compat-shipped" },
  { id: "rel:mile-2", type: PLAN_REL_HITS_MILESTONE, from: "task:tests-fallback-fixture", to: "milestone:back-compat-shipped" },
  { id: "rel:mile-3", type: PLAN_REL_HITS_MILESTONE, from: "task:codemod-apply", to: "milestone:codemod-shipped" },
  { id: "rel:mile-4", type: PLAN_REL_HITS_MILESTONE, from: "task:rollout-review", to: "milestone:codemod-shipped" },
  { id: "rel:mile-5", type: PLAN_REL_HITS_MILESTONE, from: "task:deprecate-number-field", to: "milestone:deprecation-marked" },
  { id: "rel:mile-6", type: PLAN_REL_HITS_MILESTONE, from: "task:spec-status-flip", to: "milestone:deprecation-marked" },
  // milestone:v0-2-removal is intentionally not satisfied by any v0.1 task —
  // it tracks the v0.2 removal which depends on a full minor-release cycle.
];

// ── Commit ───────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC-SECTIONS-TREE implementation rollout",
    profile: PROFILE_ID,
    description:
      "Executable plan for implementing graph-derived section numbering as specified by fdpm-cli/scripts/build-spec-sections-tree.ts. Tracks the six implementation changes, the codemod, the test surface, and the v0.1 → v0.2 deprecation timeline; mirrors the SPEC's AC-1..AC-5 acceptance criteria one-to-one.",
  })
    .primitives([
      ...iterationSpecs,
      ...wbsSpecs,
      ...milestoneSpecs,
      ...acSpecs,
      ...taskSpecs,
    ])
    .relations(relations)
    .commit();

  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render to Markdown roadmap:");
  console.log(
    `  FDPM_DATA_DIR=/tmp/fdpm-plan-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \\`,
  );
  console.log(
    `    render ${PROJECT_ID} text/markdown --renderer-id plan:RoadmapRenderer \\`,
  );
  console.log(`    -o docs/planning/sections-tree-roadmap.md`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
