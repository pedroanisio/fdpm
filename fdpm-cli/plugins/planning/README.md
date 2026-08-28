---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
---

# Planning Plugin

`fdpm.planning` — a server-side FDPM CLI plugin that contributes the
**Planning** domain profile: a typed vocabulary for software
implementation and testing workflows. Covers work breakdown, per-task
acceptance criteria, dependency and blocker management, descriptive
Gantt scheduling, and concurrent execution by humans and multiple AI
agents working in parallel.

| Field             | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Plugin id         | `fdpm.planning`                                       |
| Plugin version    | `0.1.0`                                               |
| Profile id        | `profile:planning:0.1`                                |
| Helper-set pin    | `expr_helper_set: ">=1.1.0,<2"`                       |
| Kind              | `server`                                              |
| Host compat.      | `fdpm >=1.1, <2`                                      |
| License           | MIT                                                   |
| Entry point       | [`index.ts`](./index.ts)                              |

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## What this plugin contributes

When activated against an FDPM host, this plugin registers:

- **1** `DomainProfile` (`profile:planning:0.1`)
- **4** primitive categories (`work`, `scheduling`, `execution`, `assurance`)
- **3** scopes (`workbook`, `iteration`, `execution`)
- **6** primitive types under the `plan:` namespace
- **9** relation types
- **12** validation rules (10 in v0.1, +2 added in pass-2 refine)
- **3** templates bound 1:1 to **3** executable renderers
- **1** MCP prompt (`planning/triage_iteration`) — see *MCP prompt* below

Activation log:

```
planning activated: 6 primitive types, 9 relation types, 12 validators, 3 renderers (plan:RoadmapRenderer/md, plan:GanttSvgRenderer/svg, plan:AgentBoardRenderer/md)
```

## MCP prompt: `planning/triage_iteration`

Registered with `ctx.registerPrompt` (SPEC-MCP-SERVER §13.5) and served
by `fdpm-mcp` as `prompts/list` metadata and a `prompts/get` body.
Written as a skill: **When to use** (start or checkpoint of an
iteration), **Call order** (workbook.get → board via the render
resource → task/blocker/iteration search → DependsOn/BlockedBy
readiness → rank → patch transitions with claims → AC + `plan:Verifies`
before Done → `dry_run` before deletes → `log.tail` verification), and
**Failure modes** by rule id (`plan:val:done-task-has-ac`,
`plan:val:ai-task-has-machine-checkable-ac`, `plan:val:ai-minutes-numeric-bucket`,
`plan:val:blocked-task-has-blocker`, `plan:val:claim-has-expiry`,
`plan:val:no-circular-deps`, `stale_state`). Arguments: `workbook_id`
(required), `iteration_id`, `focus`.

```sh
fdpm plugin prompt planning/triage_iteration --arg workbook_id=<id>
```

`tests/planning-prompt.test.ts` cross-checks every tool name against the
MCP manifest and every `plan:val:*` id against this plugin's sources.

## Hard constraint: AI task duration

AI-task durations are **bounded to {5, 10, 15, …, 60} minutes** in
5-minute increments. Tasks longer than 60 minutes MUST be split.
Enforced at the field-shape layer (Enum) AND cross-checked by
`plan:val:ai-task-duration-bounded` (CEL).

Human task duration is unbounded (`human_estimate` is a free-form string).

## Primitives

| Id                          | Category          | Purpose                                                  |
| --------------------------- | ----------------- | -------------------------------------------------------- |
| `plan:WorkBreakdown`        | `cat:plan:work`   | Root or branch container for a tree of tasks.            |
| `plan:Task`                 | `cat:plan:work`   | A unit of executable work.                               |
| `plan:AcceptanceCriterion`  | `cat:plan:assurance` | Free-text + optional CEL expression. AI tasks must have ≥1 with non-empty expression.|
| `plan:Blocker`              | `cat:plan:execution` | Concrete in-flight blocker (distinct from `sw:Risk`).  |
| `plan:Iteration`            | `cat:plan:scheduling` | Sprint / cycle / iteration window.                    |
| `plan:Milestone`            | `cat:plan:scheduling` | Target-date checkpoint.                                |

## Relations

| Id                  | Source → Target                                           | Notes                                          |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `plan:Subtask`      | Task → Task                                               | Transitive. Work-decomposition tree.           |
| `plan:Contains`     | WorkBreakdown → Task \| WorkBreakdown                     | Transitive. Aggregation under a labeled root.  |
| `plan:DependsOn`    | Task → Task                                               | Transitive. Default finish-to-start lag.       |
| `plan:BlockedBy`    | Task → Blocker                                            |                                                |
| `plan:Verifies`     | Task → AcceptanceCriterion                                |                                                |
| `plan:AssignedTo`   | Task → `sw:Actor`                                         | Cross-profile.                                 |
| `plan:InIteration`  | Task → Iteration                                          |                                                |
| `plan:Implements`   | Task → `*` (any primitive)                                | Cross-profile work-tracking link.              |
| `plan:HitsMilestone`| Task → Milestone                                          |                                                |

## Validation rules

12 CEL rules. Six are field-only and fire predictably; three require
graph state and need careful authoring (see §Authoring); three more were
added in pass-2 refine.

| Rule id                                    | Level   | Notes                                                         |
| ------------------------------------------ | ------- | ------------------------------------------------------------- |
| `plan:val:ai-task-duration-bounded`        | error   | AI tasks need `ai_minutes ∈ {5..60}`.                         |
| `plan:val:non-root-task-has-deps`          | error   | Needs Subtask/Contains/DependsOn or `is_root=true`.            |
| `plan:val:no-circular-deps`                | error   | DependsOn must be acyclic. `graph.acyclic`.                   |
| `plan:val:done-task-has-ac`                | error   | Done tasks need ≥1 Verifies edge.                             |
| `plan:val:blocked-task-has-blocker`        | error   | Blocked tasks need ≥1 BlockedBy edge.                         |
| `plan:val:planned-dates-ordered`           | error   | `planned_finish ≥ planned_start`.                             |
| `plan:val:claim-has-expiry`                | error   | claim_holder_id ⇒ claim_until.                                |
| `plan:val:ai-task-has-machine-checkable-ac`| error   | AI tasks need ≥1 Verifies edge.                               |
| `plan:val:implements-target-exists`        | error   | Defense-in-depth: Core's relation gate already enforces this. |
| `plan:comp:in-progress-has-assignee`       | warning | In_progress tasks should have assignee_id.                    |
| `plan:val:iteration-dates-ordered`         | error   | Iteration `end_date ≥ start_date`. Pass-2.                    |
| `plan:val:milestone-hit-not-future`        | warning | Milestone `Hit` must not be future-dated. Pass-2.             |

## Renderers

| Renderer id            | Output           | What it produces                                               |
| ---------------------- | ---------------- | -------------------------------------------------------------- |
| `plan:RoadmapRenderer` | text/markdown    | Hierarchical view: iterations → tasks-by-status; breakdowns; loose tasks; active blockers. |
| `plan:GanttSvgRenderer`| image/svg+xml    | Descriptive Gantt: bars for tasks with both planned dates set; status colours; today line. |
| `plan:AgentBoardRenderer` | text/markdown | Kanban grouped by assignee; explicit Available-to-claim queue with stale-claim detection.  |

Templates (`plan:tpl:roadmap`, `plan:tpl:gantt`, `plan:tpl:agent-board`)
bind to the three renderers 1:1.

---

## Authoring AI tasks (read before scripting)

Three rules require **graph state**: `non-root-task-has-deps`,
`done-task-has-ac`, `ai-task-has-machine-checkable-ac`. The host
validates each `Host.createPrimitive` call against the post-state of
that single op — meaning a primitive validates BEFORE any subsequent
relation can add the edges those rules look for.

Practical consequences:

- A naive `createPrimitive(task) → createRelation(verifies)` flow will
  reject AI tasks with `executor_kind=AI` because the AC rule can't find
  an outbound `plan:Verifies` edge yet.
- Same for `Done` tasks — flip status only after the Verifies edge is
  in place.

### Recommended pattern for AI-from-the-start tasks

Four ops, executed in order:

```ts
// 1. Create the AC.
await host.createPrimitive("p", {
  id: "ac:slug",
  type_id: "plan:AcceptanceCriterion",
  scope_id: "scope:plan:workbook",
  field_values: {
    criterion: "test passes",
    expression: 'instance.field_values.status == "Done"',
    status: "open",
  },
});

// 2. Create the Task as Either or Human (NOT AI yet).
await host.createPrimitive("p", {
  id: "task:slug",
  type_id: "plan:Task",
  scope_id: "scope:plan:workbook",
  field_values: {
    name: "slug", summary: "...", kind: "Implementation",
    status: "Backlog", priority: "P1",
    executor_kind: "Either",   // bypass AI rule at create time
    is_root: true,             // bypass non-root rule at create time
  },
});

// 3. Create the Verifies edge.
await host.createRelation("p", {
  id: "rel:verifies-slug",
  type_id: "plan:Verifies",
  source_id: "task:slug",
  target_id: "ac:slug",
});

// 4. Replace the Task to flip executor_kind to AI.
await host.replacePrimitive("p", {
  id: "task:slug",
  type_id: "plan:Task",
  scope_id: "scope:plan:workbook",
  field_values: {
    /* ...same as step 2 plus: */
    executor_kind: "AI",
    ai_minutes: 30,
  },
});
```

### Recommended pattern for top-level / root tasks

Set `is_root=true` at create time. It's a positive domain assertion
("this task is a self-contained root, not a subtask"), AND the create-
time exemption for `plan:val:non-root-task-has-deps`. Keep it if the
task remains a root; replace it off once a parent edge exists.

### Bulk authoring

For tens-to-hundreds of tasks committed atomically, prefer
[`host-extra.batchEdit`](../../src/core/host-extra.ts) — it skips
per-op validation. Run `host.validateProject(id)` after the batch
closes to surface findings without rejecting any single op.

The seed at [`scripts/build-planning-self.ts`](../../scripts/build-planning-self.ts)
demonstrates patterns within the SDK's `defineProject().commit()` flow.

---

## Concurrent multi-agent execution

Two complementary mechanisms:

- **Optimistic concurrency** via `expected_revision` (already in Core
  §9.7's If-Match). Two agents writing to the same primitive: the second
  write rejects unless the agent passed the revision it read.

- **Explicit claim/lease** via two optional Task fields:
  - `claim_holder_id` (stableId → `sw:Actor`)
  - `claim_until` (ISO-8601 lease expiry)

  `plan:val:claim-has-expiry` rejects a holder without an expiry.
  `plan:AgentBoardRenderer` surfaces tasks whose `Ready` status + claim
  combination either has no holder OR has a stale holder
  (`claim_until < now`) under "🎯 Available to claim".

A claim is short-term; assignee_id is durable. The two are independent.

---

## SDK helpers (Shape A operations)

[`sdk.ts`](./sdk.ts) ships a small surface of strict-by-default
operations that wrap `Host.*` calls and encode the planning profile's
invariants. Re-exported from the workbook SDK as the `planning`
namespace:

```ts
import { openHost, planning } from "@fdpm/cli";

const host = await openHost();
await planning.markDone(host, { workbook: "my-plan", taskId: "task:foo" });
```

Strict by default means every helper that flips `Task.status` passes
`fullValidate: true` to `host.patchPrimitive`, so the profile's
graph-stateful CEL rules (`done-task-has-ac`, `non-root-task-has-deps`,
`ai-task-has-machine-checkable-ac`) fire. `host.patchPrimitive` is
lenient by default — it skips profile-level CEL rules per
[pipeline.ts §runPrimitiveFieldPatch](../../src/core/validation/pipeline.ts) —
which is correct for editing imported third-party data, but wrong for
helpers that exist precisely to encode planning's workflow.

### State transitions

| Helper | Effect | Notable rule firings |
| --- | --- | --- |
| `markReady(host, {workbook, taskId})` | `status → Ready` | none planning-specific |
| `markInProgress(host, {workbook, taskId, holder?, ttlMinutes?})` | `status → In_progress`, optional claim atomically | `claim-has-expiry` if holder set |
| `markInReview(host, {workbook, taskId})` | `status → In_review` | none planning-specific |
| `markDone(host, {workbook, taskId})` | `status → Done` | **`done-task-has-ac` — fails if no Verifies edge exists** |
| `markCancelled(host, {workbook, taskId})` | `status → Cancelled` | none planning-specific |

### Claim / release

| Helper | Effect |
| --- | --- |
| `claimTask(host, {workbook, taskId, holder, ttlMinutes})` | sets `claim_holder_id` + `claim_until` |
| `releaseClaim(host, {workbook, taskId})` | clears both, idempotent |

### Schedule edges (idempotent)

| Helper | Effect |
| --- | --- |
| `addToIteration(host, {workbook, taskId, iterationId})` | creates `plan:InIteration` edge if absent |
| `hitsMilestone(host, {workbook, taskId, milestoneId})` | creates `plan:HitsMilestone` edge if absent |

### Blocker flow (composite, no auto-rollback)

`markBlocked` and `unblock` are multi-op helpers. If an intermediate op
fails, the workbook is left in whatever intermediate state the failing
op produced. Live-workbook edits have no transaction boundary outside
`defineProject().commit()`, which is for fresh authoring; the helpers
do not invent one.

```ts
await planning.markBlocked(host, {
  workbook: "my-plan",
  taskId: "task:foo",
  newBlocker: {
    id: "blocker:db-down",
    description: "Database is down",
    severity: "High",
  },
});
// → creates Blocker, plan:BlockedBy edge, flips Task.status = "Blocked"

await planning.unblock(host, {
  workbook: "my-plan",
  taskId: "task:foo",
  blockerId: "blocker:db-down",
  resolveBlocker: true, // also sets Blocker.resolved_at
});
```

### Trap-dodging composites

The README's §Authoring AI tasks documents a 4-step pattern to satisfy
the create-time validation order. Two helpers package that pattern:

```ts
// Born-AI task with AC + Verifies edge — single call, full validation.
await planning.createAITask(host, {
  workbook: "my-plan",
  task: {
    id: "task:foo",
    name: "foo",
    summary: "do the thing",
    kind: "Implementation",
    priority: "P1",
    aiMinutes: 30,           // bounded enum {5,10,15,…,60}
  },
  ac: {
    id: "ac:foo",
    criterion: "tests pass",
    expression: "true",      // CEL — must be non-empty for AI tasks
  },
});

// Back-fill an already-completed Human task.
await planning.createDoneTask(host, {
  workbook: "my-plan",
  task: { id: "task:bar", name: "bar", summary: "shipped last week",
          kind: "Documentation", priority: "P3" },
  ac: { id: "ac:bar", criterion: "doc shipped", expression: "true",
        status: "met" },
});
```

Both create the AC first → the Task as `executor_kind: "Either"` (so
the AI rule doesn't fire prematurely) → the `plan:Verifies` edge → a
`replacePrimitive` to flip the final field (`executor_kind: "AI"` /
`status: "Done"`) under full validation.

### Out of scope

- **`closeTask`** — ambiguous. Use `markDone` (success) or `markCancelled` (abort).
- **`archiveTask`** — no `archived` field exists in `plan:Task`. Pin a meaning (soft flag, hard delete, move to archive iteration, export+delete) and that's a separate change to the schema or the helper set.

### CLI surface

The single-op state-transition helpers are exposed as `fdpm planning <verb>`
subcommands (six verbs in v1; composite helpers ship later):

```bash
fdpm planning mark-ready       <workbook> <task-id>
fdpm planning mark-in-progress <workbook> <task-id>
fdpm planning mark-in-review   <workbook> <task-id>
fdpm planning mark-done        <workbook> <task-id>   # strict — needs Verifies edge
fdpm planning mark-cancelled   <workbook> <task-id>
fdpm planning release-claim    <workbook> <task-id>
```

Each subcommand emits `--json` for machine output and propagates the
SDK helper's exception verbatim. The web frontend wraps these via
`POST /api/planning/<verb>` (see `web/server/bridge.ts`); the bridge is
the only HTTP-shape mutation surface in the FDPM web app.

### Source + tests

- [`sdk.ts`](./sdk.ts) — implementation.
- [`tests/planning-sdk.test.ts`](../../tests/planning-sdk.test.ts) — 16 end-to-end tests including a `should-fail` test that proves the naive 1-op flow can't create an AI task and the helper does.
- [`src/commands/planning.ts`](../../src/commands/planning.ts) — `fdpm planning <verb>` Commander wiring.

---

## See also

- [`validation_rules.ts`](./validation_rules.ts) — full text of all 12 rules.
- [`scripts/build-planning-self.ts`](../../scripts/build-planning-self.ts) — worked-example seed (12 tasks, 49 relations, validates clean).
- [`SPEC-CEL-VALIDATOR`](../../../docs/specs/SPEC-CEL-VALIDATOR.md), [`SPEC-EXPRESSION-RUNTIME`](../../../docs/specs/SPEC-EXPRESSION-RUNTIME.md) — the host pipeline this plugin's rules ride on.
- [`software_architecture/`](../software_architecture/) — sibling profile contributing `sw:Actor` referenced by `plan:Task.assignee_id` and `plan:Task.claim_holder_id`.
- Workbook root: [`README.md`](../../../README.md), [`PURPOSE.md`](../../../PURPOSE.md), [`DISCLAIMER.md`](../../../DISCLAIMER.md)
