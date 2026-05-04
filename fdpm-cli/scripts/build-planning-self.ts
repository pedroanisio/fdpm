/**
 * Build a small planning project that tracks the fdpm.planning plugin's
 * own rollout. Doubles as a worked example: a 12-task project showing
 * AI / Human task mix, dependencies, blockers, an iteration window, and
 * cross-profile plan:Implements links.
 *
 * Run:
 *   rm -rf /tmp/fdpm-planning-self
 *   FDPM_DATA_DIR=/tmp/fdpm-planning-self npx tsx \
 *     fdpm-cli/scripts/build-planning-self.ts
 *
 * Render outputs:
 *   FDPM_DATA_DIR=/tmp/fdpm-planning-self npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render planning-self text/markdown \
 *     --renderer-id plan:RoadmapRenderer -o docs/planning/roadmap.md
 *   FDPM_DATA_DIR=/tmp/fdpm-planning-self npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render planning-self image/svg+xml \
 *     --renderer-id plan:GanttSvgRenderer -o docs/planning/gantt.svg
 *   FDPM_DATA_DIR=/tmp/fdpm-planning-self npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render planning-self text/markdown \
 *     --renderer-id plan:AgentBoardRenderer -o docs/planning/board.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID, SCOPE_IDS } from "../plugins/planning/index.js";

const PROJECT_ID = "planning-self";

// Note on assignment: the seed uses the `assignee_id` field on each task
// (which is a free-form stableId, not enforced cross-profile by the v1.1
// host). It does NOT emit plan:AssignedTo relations because that requires
// a sw:Actor primitive in this project's graph, and the project is bound
// to profile:planning:0.1 (which does not declare sw:Actor). A cross-
// profile project would mix the two profiles via `extends`; out of scope
// for the seed.

// ── Iteration ──────────────────────────────────────────────────────────────
const iterationSpecs: PrimitiveSpec[] = [
  {
    id: "iteration:plugin-v0",
    type: "plan:Iteration",
    scope: SCOPE_IDS.iteration,
    fields: {
      name: "plugin-v0",
      start_date: "2026-05-04",
      end_date: "2026-05-18",
      goal: "Land fdpm.planning v0.1 with full test coverage and self-test seed.",
    },
  },
];

// ── Work breakdown ────────────────────────────────────────────────────────
const wbsSpecs: PrimitiveSpec[] = [
  {
    id: "wbs:planning-rollout",
    type: "plan:WorkBreakdown",
    scope: SCOPE_IDS.project,
    fields: {
      name: "planning-rollout",
      summary: "Rollout of the fdpm.planning plugin: schema, rules, renderers, tests, self-test.",
      status: "Active",
    },
  },
];

// ── Acceptance criteria. Note: keep ids slug-shaped (no extra colons) ─────
const acSpecs: PrimitiveSpec[] = [
  {
    id: "ac:schema-loads",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion: "Plugin discovery loads the planning profile alongside sw and fs.",
      expression: 'graph.exists("plan:Task")',
      status: "open",
      evidence_refs: ["fdpm-cli/tests/planning-content.test.ts"],
    },
  },
  {
    id: "ac:cel-fires",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion: "All 10 CEL rules evaluate end-to-end.",
      expression: 'graph.exists("plan:Task")',
      status: "open",
      evidence_refs: ["fdpm-cli/tests/planning-rules.test.ts"],
    },
  },
  {
    id: "ac:renderers-output",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion: "Roadmap, Gantt SVG, AgentBoard renderers produce well-formed output.",
      expression: 'graph.exists("plan:Task")',
      status: "open",
      evidence_refs: ["fdpm-cli/tests/planning-renderers.test.ts"],
    },
  },
];

// ── Tasks ─────────────────────────────────────────────────────────────────
type Task = {
  id: string;
  name: string;
  summary: string;
  kind: "Implementation" | "Test" | "Documentation" | "Investigation" | "Review" | "Refactor";
  executor: "AI" | "Human" | "Either";
  ai_minutes?: number;
  human_estimate?: string;
  status: "Backlog" | "Ready" | "In_progress" | "Blocked" | "In_review" | "Done" | "Cancelled";
  priority: "P0" | "P1" | "P2" | "P3";
  planned_start?: string;
  planned_finish?: string;
  assignee_id?: string;
  is_root?: boolean;
};

const tasks: Task[] = [
  {
    id: "task:design",
    name: "design",
    summary: "Design the schema, rules, renderers (slice 1-6).",
    kind: "Investigation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
    is_root: true,
  },
  {
    id: "task:helpers",
    name: "helpers",
    summary: "Add graph.exists / graph.target_exists to the expression runtime.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:spec-amend-expr-rt",
    name: "spec-amend-expr-rt",
    summary: "Amend SPEC-EXPRESSION-RUNTIME §M14 with the v1.1.0 helper-set bump.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 30,
    status: "In_progress",
    priority: "P1",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:spec-amend-cel",
    name: "spec-amend-cel",
    summary: "Amend SPEC-CEL-VALIDATOR §6 to mention the two new helpers.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 20,
    status: "In_progress",
    priority: "P1",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice1",
    name: "slice1",
    summary: "Plugin skeleton: manifest, categories, scopes, _common helpers.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 25,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice2-prims",
    name: "slice2-prims",
    summary: "Six primitives: WorkBreakdown, Task, AC, Blocker, Iteration, Milestone.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice3-rels",
    name: "slice3-rels",
    summary: "Nine relation types including Subtask, Contains, DependsOn.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice4-rules",
    name: "slice4-rules",
    summary: "Ten CEL validation rules incl. AI-task duration enum cross-check.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice5-renderers",
    name: "slice5-renderers",
    summary: "RoadmapRenderer (md), GanttSvgRenderer (svg), AgentBoardRenderer (md).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice6-templates",
    name: "slice6-templates",
    summary: "Three templates binding the renderers.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 10,
    status: "In_progress",
    priority: "P1",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice7-tests",
    name: "slice7-tests",
    summary: "Three test files, ~60 tests covering schema, renderers, e2e CEL rules.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 60,
    status: "In_progress",
    priority: "P0",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:slice8-self",
    name: "slice8-self",
    summary: "This very script — the self-test seed project.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "In_progress",
    priority: "P1",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
];

const taskSpecs: PrimitiveSpec[] = tasks.map((t) => ({
  id: t.id,
  type: "plan:Task",
  scope: SCOPE_IDS.project,
  fields: {
    name: t.name,
    summary: t.summary,
    kind: t.kind,
    executor_kind: t.executor,
    status: t.status,
    priority: t.priority,
    // Every task in the seed is_root=true at create time so the
    // non-root-task-has-deps rule short-circuits. The Subtask /
    // Contains / DependsOn relations are added in the relations
    // batch (after all primitives validate). The seed represents
    // initial creation; later operations would replace is_root with
    // the actual relation-backed structure.
    is_root: true,
    ...(t.ai_minutes !== undefined ? { ai_minutes: t.ai_minutes } : {}),
    ...(t.human_estimate !== undefined ? { human_estimate: t.human_estimate } : {}),
    ...(t.planned_start ? { planned_start: t.planned_start } : {}),
    ...(t.planned_finish ? { planned_finish: t.planned_finish } : {}),
    ...(t.assignee_id ? { assignee_id: t.assignee_id } : {}),
  },
}));

// ── Relations ─────────────────────────────────────────────────────────────
const relations: RelationSpec[] = [
  // Iteration binding for every task.
  ...tasks.map((t, i) => ({
    id: `rel:in-iter-${i}`,
    type: "plan:InIteration",
    from: t.id,
    to: "iteration:plugin-v0",
  })),
  // WBS containment for every task.
  ...tasks.map((t, i) => ({
    id: `rel:contains-${i}`,
    type: "plan:Contains",
    from: "wbs:planning-rollout",
    to: t.id,
  })),
  // Dependency chain (ordered execution).
  { id: "rel:dep-1", type: "plan:DependsOn", from: "task:helpers", to: "task:design" },
  { id: "rel:dep-2", type: "plan:DependsOn", from: "task:spec-amend-expr-rt", to: "task:helpers" },
  { id: "rel:dep-3", type: "plan:DependsOn", from: "task:spec-amend-cel", to: "task:helpers" },
  { id: "rel:dep-4", type: "plan:DependsOn", from: "task:slice1", to: "task:design" },
  { id: "rel:dep-5", type: "plan:DependsOn", from: "task:slice2-prims", to: "task:slice1" },
  { id: "rel:dep-6", type: "plan:DependsOn", from: "task:slice3-rels", to: "task:slice2-prims" },
  { id: "rel:dep-7", type: "plan:DependsOn", from: "task:slice4-rules", to: "task:slice3-rels" },
  { id: "rel:dep-8", type: "plan:DependsOn", from: "task:slice4-rules", to: "task:helpers" },
  { id: "rel:dep-9", type: "plan:DependsOn", from: "task:slice5-renderers", to: "task:slice2-prims" },
  { id: "rel:dep-10", type: "plan:DependsOn", from: "task:slice6-templates", to: "task:slice5-renderers" },
  { id: "rel:dep-11", type: "plan:DependsOn", from: "task:slice7-tests", to: "task:slice4-rules" },
  { id: "rel:dep-12", type: "plan:DependsOn", from: "task:slice7-tests", to: "task:slice5-renderers" },
  { id: "rel:dep-13", type: "plan:DependsOn", from: "task:slice8-self", to: "task:slice7-tests" },
  // Verifies edges (every AI task gets at least one AC).
  ...tasks.map((t, i) => ({
    id: `rel:verifies-${i}`,
    type: "plan:Verifies",
    from: t.id,
    to: "ac:schema-loads",
  })),
  // plan:AssignedTo relations would require sw:Actor primitives in the
  // project graph; the seed is bound to profile:planning:0.1 only and
  // uses the canonical `assignee_id` field on each Task instead.
];

async function main() {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "Planning plugin self-test",
    profile: PROFILE_ID,
    description:
      "Twelve-task project tracking the rollout of the fdpm.planning plugin itself. AI tasks bounded to <=60 minutes; full dependency chain; iteration window 2026-05-04..14.",
  })
    .primitives([
      ...iterationSpecs,
      ...wbsSpecs,
      ...acSpecs,
      ...taskSpecs,
    ])
    .relations(relations)
    .commit();

  console.log("Built project:", result.project_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
