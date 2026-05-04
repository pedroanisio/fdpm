/**
 * Build a planning project that tracks implementation of DNIS
 * (`scripts/build-spec-dnis.ts`) using the fdpm.planning profile.
 *
 * Primary target:
 *   - Level 1 (Sequential) reference implementation
 * Secondary target:
 *   - Level 2 optimistic concurrency path
 *
 * Run:
 *   rm -rf /tmp/fdpm-plan-dnis
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-dnis node --import tsx \
 *     scripts/build-plan-dnis-implementation.ts
 *
 * Render outputs:
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-dnis node --import tsx src/bin/fdpm.ts \
 *     render plan-dnis-implementation text/markdown \
 *     --renderer-id plan:RoadmapRenderer -o dnis-implementation-roadmap.md
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-dnis node --import tsx src/bin/fdpm.ts \
 *     render plan-dnis-implementation image/svg+xml \
 *     --renderer-id plan:GanttSvgRenderer -o dnis-implementation-gantt.svg
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-dnis node --import tsx src/bin/fdpm.ts \
 *     render plan-dnis-implementation text/markdown \
 *     --renderer-id plan:AgentBoardRenderer -o dnis-implementation-board.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID, SCOPE_IDS } from "../plugins/planning/index.js";

const PROJECT_ID = "plan-dnis-implementation";

const iterationSpecs: PrimitiveSpec[] = [
  {
    id: "iteration:dnis-v0-l1",
    type: "plan:Iteration",
    scope: SCOPE_IDS.iteration,
    fields: {
      name: "dnis-v0-l1",
      start_date: "2026-05-04",
      end_date: "2026-05-23",
      goal:
        "Land a validator-backed DNIS Level 1 reference implementation, then extend it to Level 2 optimistic concurrency without pretending Level 3 is specified.",
    },
  },
];

const wbsSpecs: PrimitiveSpec[] = [
  {
    id: "wbs:dnis-rollout",
    type: "plan:WorkBreakdown",
    scope: SCOPE_IDS.project,
    fields: {
      name: "dnis-rollout",
      summary:
        "Implementation rollout for the Document Node Identity Specification encoded in scripts/build-spec-dnis.ts.",
      status: "Active",
    },
  },
];

const milestoneSpecs: PrimitiveSpec[] = [
  {
    id: "milestone:l1-core",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "l1-core",
      target_date: "2026-05-09",
      summary: "Document/Node model plus create-edit-move flow works end-to-end.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:l1-lineage",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "l1-lineage",
      target_date: "2026-05-13",
      summary: "split/merge/retire/compact, idempotency log, and reference resolution all work together.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:l1-proof",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "l1-proof",
      target_date: "2026-05-16",
      summary: "TV-1, TV-2, TV-3, TV-4, and TV-6 pass against a concrete Level 1 implementation.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:l2-concurrency",
    type: "plan:Milestone",
    scope: SCOPE_IDS.project,
    fields: {
      name: "l2-concurrency",
      target_date: "2026-05-20",
      summary: "expectedRevision and merge Mode A semantics are implemented and tested.",
      status: "Upcoming",
    },
  },
];

const acSpecs: PrimitiveSpec[] = [
  {
    id: "ac:l1-model-and-ops",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "The implementation ships the DNIS Level 1 model and primary operation surface: Document, Node, Operation, OperationResult, plus create/edit/move/split/merge/retire/compact semantics.",
      expression:
        'graph.exists("task:data-model") && graph.exists("task:position-engine") && graph.exists("task:operation-core") && graph.exists("task:operation-lineage") && graph.exists("task:compact-operation")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:req:nid-immutability",
        "spec:req:position-locality",
        "spec:req:atomic-operations",
        "spec:req:compact-no-revision-bump",
        "spec:inv:operation-atomicity",
      ],
    },
  },
  {
    id: "ac:idempotency-and-resolution",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "The store preserves the retry contract and resolver contract: OperationId snapshots are persisted atomically, payload mismatches are rejected, and active/retired/evolved/purged/not-found outcomes resolve correctly.",
      expression:
        'graph.exists("task:idempotency-log") && graph.exists("task:reference-resolution") && graph.exists("task:tv-l1-harness")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:req:idempotency-map",
        "spec:req:idempotency-payload-mismatch",
        "spec:req:reference-resolution",
        "spec:req:lineage-walk-transitive",
        "spec:inv:retired-node-resolvable",
      ],
    },
  },
  {
    id: "ac:hash-determinism",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "Canonicalization and content hashing are deterministic, document-wide, and never reused as identity.",
      expression:
        'graph.exists("task:hashing-canonicalization") && graph.exists("task:tv-l1-harness")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:req:hash-sha256",
        "spec:req:hash-canonicalization",
        "spec:req:hash-not-identity",
      ],
    },
  },
  {
    id: "ac:l1-proof",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "DNIS Level 1 stops being speculative: TV-1, TV-2, TV-3, TV-4, and TV-6 are executable and pass against the implementation.",
      expression:
        'graph.exists("task:tv-l1-harness") && graph.exists("task:spec-feedback-loop")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:ac:tv-1-identity-preservation-under-edit",
        "spec:ac:tv-2-idempotency-under-retry",
        "spec:ac:tv-3-lineage-after-split",
        "spec:ac:tv-4-position-locality",
        "spec:ac:tv-6-compact-preserves-revision",
      ],
    },
  },
  {
    id: "ac:l2-concurrency",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "Level 2 optimistic concurrency is real: single-target expectedRevision rejection works, merge Mode A is implemented, and stale writes do not mutate state.",
      expression:
        'graph.exists("task:level2-concurrency") && graph.exists("task:tv-l2-harness")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:req:expected-revision",
        "spec:ac:tv-5-stale-write-rejection",
      ],
    },
  },
  {
    id: "ac:boundary-honesty",
    type: "plan:AcceptanceCriterion",
    scope: SCOPE_IDS.project,
    fields: {
      criterion:
        "The implementation and docs preserve DNIS boundary honesty: Level 3 remains deferred, purge is explicitly operator-gated, and unresolved open questions are not silently guessed away.",
      expression:
        'graph.exists("task:security-privacy-boundary") && graph.exists("task:spec-feedback-loop")',
      status: "open",
      evidence_refs: [
        "scripts/build-spec-dnis.ts",
        "spec:req:nid-not-secret",
        "spec:conf:level-3-convergent",
        "Appendix A",
      ],
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
  is_root?: boolean;
};

const tasks: Task[] = [
  {
    id: "task:contract-audit",
    name: "contract-audit",
    summary:
      "Translate DNIS into an executable contract matrix: exact Level 1 scope, Level 2 additions, explicit non-goals, and the proof mapping from TV-1..TV-6 to code and docs.",
    kind: "Investigation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-04",
    planned_finish: "2026-05-04",
    assignee_id: "actor:Bot:Builder",
    is_root: true,
  },
  {
    id: "task:data-model",
    name: "data-model",
    summary:
      "Implement the DNIS Document, Node, Operation union, and OperationResult persistence shape with the readonly and branded-field invariants preserved at runtime.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-05",
    planned_finish: "2026-05-05",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:position-engine",
    name: "position-engine",
    summary:
      "Implement fractional-position generation plus compaction semantics so inserts/moves stay local and compact rebalances without revision churn.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-06",
    planned_finish: "2026-05-06",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:operation-core",
    name: "operation-core",
    summary:
      "Implement create, edit, and move with the exact DNIS preconditions, postconditions, identity rules, and atomicity guarantees.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-07",
    planned_finish: "2026-05-07",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:operation-lineage",
    name: "operation-lineage",
    summary:
      "Implement split, merge, and retire with lineage recording, retired-node resolution compatibility, and atomic multi-node mutation semantics.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:compact-operation",
    name: "compact-operation",
    summary:
      "Implement compact as a first-class operation that rebalances positions without bumping per-node revision or mutating audit fields.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-08",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:idempotency-log",
    name: "idempotency-log",
    summary:
      "Persist the OperationId to OperationResult map atomically with state mutation, including snapshot-on-first-apply retry semantics and payload mismatch handling.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-09",
    planned_finish: "2026-05-09",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:hashing-canonicalization",
    name: "hashing-canonicalization",
    summary:
      "Implement document-wide hashAlgorithm selection, algo:hex encoding, and deterministic canonicalization for JSON content at minimum.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-12",
    planned_finish: "2026-05-12",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:reference-resolution",
    name: "reference-resolution",
    summary:
      "Implement the five-outcome resolver for active, retired, evolved-via-lineage, purged, and not-found, including transitive lineage walk.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-12",
    planned_finish: "2026-05-12",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:tv-l1-harness",
    name: "tv-l1-harness",
    summary:
      "Encode TV-1, TV-2, TV-3, TV-4, and TV-6 as executable tests, including retry snapshot behavior, split lineage, move locality, and compact audit semantics.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 60,
    status: "In_review",
    priority: "P0",
    planned_start: "2026-05-13",
    planned_finish: "2026-05-14",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:level2-concurrency",
    name: "level2-concurrency",
    summary:
      "Add Level 2 optimistic-concurrency enforcement: expectedRevision on single-target operations and Mode A expectedRevisions for merge.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P1",
    planned_start: "2026-05-15",
    planned_finish: "2026-05-15",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:tv-l2-harness",
    name: "tv-l2-harness",
    summary:
      "Encode TV-5 as executable concurrency proof: stale writes reject cleanly, merge Mode A checks per-target revisions, and stale attempts do not mutate state.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 45,
    status: "In_review",
    priority: "P1",
    planned_start: "2026-05-16",
    planned_finish: "2026-05-16",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:security-privacy-boundary",
    name: "security-privacy-boundary",
    summary:
      "Document and enforce the real trust boundary: agent auth is external, purge is operator-gated, timestamp authority is server-side, and NIDs are never treated as secrets.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-19",
    planned_finish: "2026-05-19",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:spec-feedback-loop",
    name: "spec-feedback-loop",
    summary:
      "Feed implementation evidence back into DNIS: mark what is now proven, tighten any ambiguous clauses discovered during coding, and keep Level 3 explicitly deferred rather than implied.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-20",
    planned_finish: "2026-05-20",
    assignee_id: "actor:Bot:Builder",
  },
  {
    id: "task:level3-profile",
    name: "level3-profile",
    summary:
      "Separate design track for a future CRDT-backed Level 3 profile. No implementation claim is allowed until §10.3 becomes normative.",
    kind: "Investigation",
    executor: "Human",
    human_estimate: "1 day",
    status: "Backlog",
    priority: "P3",
    planned_start: "2026-05-20",
    planned_finish: "2026-05-20",
    assignee_id: "actor:Person:Maintainer",
  },
  {
    id: "task:rollout-review",
    name: "rollout-review",
    summary:
      "Human review of the Level 1/2 proof surface, unresolved open questions, and whether the repo should actually ship a reference implementation or keep DNIS as spec-only.",
    kind: "Review",
    executor: "Human",
    human_estimate: "half day",
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-05-21",
    planned_finish: "2026-05-21",
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
    to: "iteration:dnis-v0-l1",
  })),
  ...tasks.map((t, i) => ({
    id: `rel:contains-${i}`,
    type: "plan:Contains",
    from: "wbs:dnis-rollout",
    to: t.id,
  })),

  { id: "rel:dep-1", type: "plan:DependsOn", from: "task:data-model", to: "task:contract-audit" },
  { id: "rel:dep-2", type: "plan:DependsOn", from: "task:position-engine", to: "task:contract-audit" },
  { id: "rel:dep-3", type: "plan:DependsOn", from: "task:operation-core", to: "task:data-model" },
  { id: "rel:dep-4", type: "plan:DependsOn", from: "task:operation-core", to: "task:position-engine" },
  { id: "rel:dep-5", type: "plan:DependsOn", from: "task:operation-lineage", to: "task:operation-core" },
  { id: "rel:dep-6", type: "plan:DependsOn", from: "task:compact-operation", to: "task:position-engine" },
  { id: "rel:dep-7", type: "plan:DependsOn", from: "task:compact-operation", to: "task:operation-core" },
  { id: "rel:dep-8", type: "plan:DependsOn", from: "task:idempotency-log", to: "task:operation-lineage" },
  { id: "rel:dep-9", type: "plan:DependsOn", from: "task:hashing-canonicalization", to: "task:data-model" },
  { id: "rel:dep-10", type: "plan:DependsOn", from: "task:reference-resolution", to: "task:operation-lineage" },
  { id: "rel:dep-11", type: "plan:DependsOn", from: "task:reference-resolution", to: "task:idempotency-log" },
  { id: "rel:dep-12", type: "plan:DependsOn", from: "task:tv-l1-harness", to: "task:operation-lineage" },
  { id: "rel:dep-13", type: "plan:DependsOn", from: "task:tv-l1-harness", to: "task:compact-operation" },
  { id: "rel:dep-14", type: "plan:DependsOn", from: "task:tv-l1-harness", to: "task:idempotency-log" },
  { id: "rel:dep-15", type: "plan:DependsOn", from: "task:tv-l1-harness", to: "task:reference-resolution" },
  { id: "rel:dep-16", type: "plan:DependsOn", from: "task:tv-l1-harness", to: "task:hashing-canonicalization" },
  { id: "rel:dep-17", type: "plan:DependsOn", from: "task:level2-concurrency", to: "task:operation-lineage" },
  { id: "rel:dep-18", type: "plan:DependsOn", from: "task:level2-concurrency", to: "task:idempotency-log" },
  { id: "rel:dep-19", type: "plan:DependsOn", from: "task:level2-concurrency", to: "task:tv-l1-harness" },
  { id: "rel:dep-20", type: "plan:DependsOn", from: "task:tv-l2-harness", to: "task:level2-concurrency" },
  { id: "rel:dep-21", type: "plan:DependsOn", from: "task:security-privacy-boundary", to: "task:contract-audit" },
  { id: "rel:dep-22", type: "plan:DependsOn", from: "task:spec-feedback-loop", to: "task:tv-l1-harness" },
  { id: "rel:dep-23", type: "plan:DependsOn", from: "task:spec-feedback-loop", to: "task:tv-l2-harness" },
  { id: "rel:dep-24", type: "plan:DependsOn", from: "task:spec-feedback-loop", to: "task:security-privacy-boundary" },
  { id: "rel:dep-25", type: "plan:DependsOn", from: "task:rollout-review", to: "task:spec-feedback-loop" },
  { id: "rel:dep-26", type: "plan:DependsOn", from: "task:level3-profile", to: "task:rollout-review" },

  { id: "rel:verifies-1", type: "plan:Verifies", from: "task:data-model", to: "ac:l1-model-and-ops" },
  { id: "rel:verifies-1a", type: "plan:Verifies", from: "task:contract-audit", to: "ac:boundary-honesty" },
  { id: "rel:verifies-2", type: "plan:Verifies", from: "task:position-engine", to: "ac:l1-model-and-ops" },
  { id: "rel:verifies-3", type: "plan:Verifies", from: "task:operation-core", to: "ac:l1-model-and-ops" },
  { id: "rel:verifies-4", type: "plan:Verifies", from: "task:operation-lineage", to: "ac:l1-model-and-ops" },
  { id: "rel:verifies-5", type: "plan:Verifies", from: "task:compact-operation", to: "ac:l1-model-and-ops" },
  { id: "rel:verifies-6", type: "plan:Verifies", from: "task:idempotency-log", to: "ac:idempotency-and-resolution" },
  { id: "rel:verifies-7", type: "plan:Verifies", from: "task:reference-resolution", to: "ac:idempotency-and-resolution" },
  { id: "rel:verifies-8", type: "plan:Verifies", from: "task:tv-l1-harness", to: "ac:idempotency-and-resolution" },
  { id: "rel:verifies-9", type: "plan:Verifies", from: "task:hashing-canonicalization", to: "ac:hash-determinism" },
  { id: "rel:verifies-10", type: "plan:Verifies", from: "task:tv-l1-harness", to: "ac:hash-determinism" },
  { id: "rel:verifies-11", type: "plan:Verifies", from: "task:tv-l1-harness", to: "ac:l1-proof" },
  { id: "rel:verifies-12", type: "plan:Verifies", from: "task:spec-feedback-loop", to: "ac:l1-proof" },
  { id: "rel:verifies-13", type: "plan:Verifies", from: "task:level2-concurrency", to: "ac:l2-concurrency" },
  { id: "rel:verifies-14", type: "plan:Verifies", from: "task:tv-l2-harness", to: "ac:l2-concurrency" },
  { id: "rel:verifies-15", type: "plan:Verifies", from: "task:security-privacy-boundary", to: "ac:boundary-honesty" },
  { id: "rel:verifies-16", type: "plan:Verifies", from: "task:spec-feedback-loop", to: "ac:boundary-honesty" },

  { id: "rel:mile-1", type: "plan:HitsMilestone", from: "task:operation-core", to: "milestone:l1-core" },
  { id: "rel:mile-2", type: "plan:HitsMilestone", from: "task:reference-resolution", to: "milestone:l1-lineage" },
  { id: "rel:mile-3", type: "plan:HitsMilestone", from: "task:tv-l1-harness", to: "milestone:l1-proof" },
  { id: "rel:mile-4", type: "plan:HitsMilestone", from: "task:tv-l2-harness", to: "milestone:l2-concurrency" },
];

async function main() {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "DNIS implementation rollout",
    profile: PROFILE_ID,
    description:
      "Executable plan for implementing the Document Node Identity Specification from scripts/build-spec-dnis.ts, with Level 1 as the shipping target, Level 2 as the concurrency extension, and Level 3 kept explicitly deferred.",
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
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
