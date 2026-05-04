/**
 * Build a planning project that tracks implementation of the render-DSL
 * rollout described by `scripts/build-spec-render-dsl.ts`.
 *
 * Run:
 *   rm -rf /tmp/fdpm-plan-render-dsl
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-render-dsl npx tsx \
 *     cli/scripts/build-plan-render-dsl-implementation.ts
 *
 * Render outputs:
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-render-dsl npx tsx cli/src/bin/fdpm.ts \
 *     render plan-render-dsl-implementation text/markdown \
 *     --renderer-id plan:RoadmapRenderer -o docs/planning/render-dsl-roadmap.md
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-render-dsl npx tsx cli/src/bin/fdpm.ts \
 *     render plan-render-dsl-implementation image/svg+xml \
 *     --renderer-id plan:GanttSvgRenderer -o docs/planning/render-dsl-gantt.svg
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-render-dsl npx tsx cli/src/bin/fdpm.ts \
 *     render plan-render-dsl-implementation text/markdown \
 *     --renderer-id plan:AgentBoardRenderer -o docs/planning/render-dsl-board.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID, SCOPE_IDS } from "../plugins/planning/index.js";

const PROJECT_ID = "plan-render-dsl-implementation";

const iterationSpecs: PrimitiveSpec[] = [
  {
    id: "iteration:render-dsl-v0",
    type: "plan:Iteration",
    scope: SCOPE_IDS.iteration,
    fields: {
      name: "render-dsl-v0",
      start_date: "2026-05-04",
      end_date: "2026-05-16",
      goal:
        "Land the first production render-time DSL consumer on the shared core/expr runtime, with parity tests, strict-mode semantics, and spec sync.",
    },
  },
];

const wbsSpecs: PrimitiveSpec[] = [
  {
    id: "wbs:render-dsl-rollout",
    type: "plan:WorkBreakdown",
    scope: SCOPE_IDS.project,
    fields: {
      name: "render-dsl-rollout",
      summary:
        "Implementation rollout for the CEL-only render-time DSL described in scripts/build-spec-render-dsl.ts.",
      status: "Active",
    },
  },
];

const milestoneSpecs: PrimitiveSpec[] = [
  {
    id: "milestone:runtime-glue",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "runtime-glue",
      target_date: "2026-05-07",
      summary: "Render-time template parsing and shared core/expr evaluation path landed.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:first-template",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "first-template",
      target_date: "2026-05-10",
      summary: "At least one spec_md.ts section migrated to a template-driven renderer path.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:spec-sync",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "spec-sync",
      target_date: "2026-05-12",
      summary: "Implementation behavior, determinism harness, and SPEC text are reconciled.",
      status: "Upcoming",
    },
  },
];

const acSpecs: PrimitiveSpec[] = [
  {
    id: "ac:runtime-path",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "Render-time placeholder evaluation consumes the host-owned cli/src/core/expr runtime; no second evaluator or direct cel-js import exists in render-time glue.",
      expression: 'graph.exists("task:runtime-glue")',
      status: "open",
      evidence_refs: ["scripts/build-spec-render-dsl.ts", "src/core/expr/runtime.ts"],
    },
  },
  {
    id: "ac:error-policy",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "Default render policy emits bytes with inline markers while recording render errors; strict mode only changes exit behavior.",
      expression: 'graph.exists("task:error-policy")',
      status: "open",
      evidence_refs: ["scripts/build-spec-expression-runtime.ts", "tests/error-render.test.ts"],
    },
  },
  {
    id: "ac:first-section",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "At least one spec:SpecMarkdownRenderer section is rendered from a template-driven DSL path with parity against the pre-DSL output.",
      expression: 'graph.exists("task:first-template-section")',
      status: "open",
      evidence_refs: ["plugins/spec_authoring/renderers/spec_md.ts"],
    },
  },
  {
    id: "ac:test-surface",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "The live render test surface covers variable resolution, error markers, iteration, conditional structure, and determinism.",
      expression: 'graph.exists("task:render-tests") && graph.exists("task:determinism-harness")',
      status: "open",
      evidence_refs: ["tests/render.test.ts", "tests/error-render.test.ts", "tests/spec-builds-determinism.test.ts"],
    },
  },
  {
    id: "ac:spec-sync",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "SPEC-RENDER-DSL, SPEC-EXPRESSION-RUNTIME, and the renderer implementation describe the same runtime policy and dependency ordering.",
      expression: 'graph.exists("task:spec-sync")',
      status: "open",
      evidence_refs: ["scripts/build-spec-render-dsl.ts", "docs/specs/SPEC-RENDER-DSL.md"],
    },
  },
];

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
};

const tasks: Task[] = [
  {
    id: "task:contract-audit",
    name: "contract-audit",
    summary:
      "Translate scripts/build-spec-render-dsl.ts into an executable rollout checklist: shared runtime contract, error policy, bounds, template forms, and migration ordering.",
    kind: "Investigation",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:template-lexer",
    name: "template-lexer",
    summary:
      "Build the render-time template lexer/parser for text vs. placeholder segments and the if/endif/include directive envelope without introducing a second CEL parser.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:error-policy",
    name: "error-policy",
    summary:
      "Implement the shared render-time policy: inline markers plus RenderFinding capture by default; strict mode changes exit semantics only.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:runtime-glue",
    name: "runtime-glue",
    summary:
      "Wire placeholder evaluation through cli/src/core/expr/ with the closed activation surface and helper inventory defined by SPEC-EXPRESSION-RUNTIME.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:first-template-section",
    name: "first-template-section",
    summary:
      "Migrate the smallest spec_md.ts projection to a template-driven renderer path and prove parity against the old output.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:strict-mode",
    name: "strict-mode",
    summary:
      "Expose the CLI/renderer strictness switch that fails on render_errors while still emitting bytes for preview/debug use.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P1",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:render-tests",
    name: "render-tests",
    summary:
      "Extend the live render suites with variable, iteration, conditional, include, and error-marker coverage rather than creating a disconnected test surface.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-07",
    planned_finish: "2026-05-07",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:determinism-harness",
    name: "determinism-harness",
    summary:
      "Add the two-run render determinism gate for the render-time DSL path and bind it to the live spec fixtures.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:spec-sync",
    name: "spec-sync",
    summary:
      "Update build-spec-render-dsl.ts and the rendered SPEC so the implementation plan, bounds, and render-time policy match the shipped runtime.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 45,
    status: "Ready",
    priority: "P1",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:core-amendment",
    name: "core-amendment",
    summary:
      "Amend SPEC-CORE only after the first template-driven sections and parity gates are real, so the architecture doc points at a shipped path.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-05-09",
    planned_finish: "2026-05-09",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:rollout-review",
    name: "rollout-review",
    summary:
      "Human review of the migrated renderer output, strict-mode ergonomics, and spec wording before widening the migration beyond the first template-driven sections.",
    kind: "Review",
    executor: "Human",
    human_estimate: "half day",
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-09",
    planned_finish: "2026-05-09",
    assignee_id: "actor:Person:Maintainer",
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
    is_root: true,
    ...(t.ai_minutes !== undefined ? { ai_minutes: t.ai_minutes } : {}),
    ...(t.human_estimate !== undefined ? { human_estimate: t.human_estimate } : {}),
    ...(t.planned_start ? { planned_start: t.planned_start } : {}),
    ...(t.planned_finish ? { planned_finish: t.planned_finish } : {}),
    ...(t.assignee_id ? { assignee_id: t.assignee_id } : {}),
  },
}));

const relations: RelationSpec[] = [
  ...tasks.map((t, i) => ({
    id: `rel:in-iter-${i}`,
    type: "plan:InIteration",
    from: t.id,
    to: "iteration:render-dsl-v0",
  })),
  ...tasks.map((t, i) => ({
    id: `rel:contains-${i}`,
    type: "plan:Contains",
    from: "wbs:render-dsl-rollout",
    to: t.id,
  })),

  { id: "rel:dep-1", type: "plan:DependsOn", from: "task:template-lexer", to: "task:contract-audit" },
  { id: "rel:dep-2", type: "plan:DependsOn", from: "task:error-policy", to: "task:contract-audit" },
  { id: "rel:dep-3", type: "plan:DependsOn", from: "task:runtime-glue", to: "task:template-lexer" },
  { id: "rel:dep-4", type: "plan:DependsOn", from: "task:runtime-glue", to: "task:error-policy" },
  { id: "rel:dep-5", type: "plan:DependsOn", from: "task:first-template-section", to: "task:runtime-glue" },
  { id: "rel:dep-6", type: "plan:DependsOn", from: "task:strict-mode", to: "task:error-policy" },
  { id: "rel:dep-7", type: "plan:DependsOn", from: "task:strict-mode", to: "task:runtime-glue" },
  { id: "rel:dep-8", type: "plan:DependsOn", from: "task:render-tests", to: "task:runtime-glue" },
  { id: "rel:dep-9", type: "plan:DependsOn", from: "task:render-tests", to: "task:first-template-section" },
  { id: "rel:dep-10", type: "plan:DependsOn", from: "task:determinism-harness", to: "task:render-tests" },
  { id: "rel:dep-11", type: "plan:DependsOn", from: "task:spec-sync", to: "task:runtime-glue" },
  { id: "rel:dep-12", type: "plan:DependsOn", from: "task:spec-sync", to: "task:render-tests" },
  { id: "rel:dep-13", type: "plan:DependsOn", from: "task:core-amendment", to: "task:spec-sync" },
  { id: "rel:dep-14", type: "plan:DependsOn", from: "task:rollout-review", to: "task:strict-mode" },
  { id: "rel:dep-15", type: "plan:DependsOn", from: "task:rollout-review", to: "task:determinism-harness" },
  { id: "rel:dep-16", type: "plan:DependsOn", from: "task:rollout-review", to: "task:spec-sync" },

  { id: "rel:verifies-1", type: "plan:Verifies", from: "task:contract-audit", to: "ac:runtime-path" },
  { id: "rel:verifies-2", type: "plan:Verifies", from: "task:template-lexer", to: "ac:runtime-path" },
  { id: "rel:verifies-3", type: "plan:Verifies", from: "task:error-policy", to: "ac:error-policy" },
  { id: "rel:verifies-4", type: "plan:Verifies", from: "task:runtime-glue", to: "ac:runtime-path" },
  { id: "rel:verifies-5", type: "plan:Verifies", from: "task:first-template-section", to: "ac:first-section" },
  { id: "rel:verifies-6", type: "plan:Verifies", from: "task:strict-mode", to: "ac:error-policy" },
  { id: "rel:verifies-7", type: "plan:Verifies", from: "task:render-tests", to: "ac:test-surface" },
  { id: "rel:verifies-8", type: "plan:Verifies", from: "task:determinism-harness", to: "ac:test-surface" },
  { id: "rel:verifies-9", type: "plan:Verifies", from: "task:spec-sync", to: "ac:spec-sync" },
  { id: "rel:verifies-10", type: "plan:Verifies", from: "task:core-amendment", to: "ac:spec-sync" },

  { id: "rel:mile-1", type: "plan:HitsMilestone", from: "task:runtime-glue", to: "milestone:runtime-glue" },
  { id: "rel:mile-2", type: "plan:HitsMilestone", from: "task:first-template-section", to: "milestone:first-template" },
  { id: "rel:mile-3", type: "plan:HitsMilestone", from: "task:determinism-harness", to: "milestone:spec-sync" },
  { id: "rel:mile-4", type: "plan:HitsMilestone", from: "task:spec-sync", to: "milestone:spec-sync" },
];

async function main() {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "Render DSL implementation rollout",
    profile: PROFILE_ID,
    description:
      "Executable plan for implementing the CEL-only render-time DSL specified by scripts/build-spec-render-dsl.ts using the shared host-owned cli/src/core/expr runtime.",
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
