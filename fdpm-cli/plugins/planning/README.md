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
- **3** scopes (`project`, `iteration`, `execution`)
- **6** primitive types under the `plan:` namespace
- **9** relation types
- **12** validation rules (10 in v0.1, +2 added in pass-2 refine)
- **3** templates bound 1:1 to **3** executable renderers

Activation log:

```
planning activated: 6 primitive types, 9 relation types, 12 validators, 3 renderers (plan:RoadmapRenderer/md, plan:GanttSvgRenderer/svg, plan:AgentBoardRenderer/md)
```

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
  scope_id: "scope:plan:project",
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
  scope_id: "scope:plan:project",
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
  scope_id: "scope:plan:project",
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

## See also

- [`validation_rules.ts`](./validation_rules.ts) — full text of all 12 rules.
- [`scripts/build-planning-self.ts`](../../scripts/build-planning-self.ts) — worked-example seed (12 tasks, 49 relations, validates clean).
- [`SPEC-CEL-VALIDATOR`](../../../docs/specs/SPEC-CEL-VALIDATOR.md), [`SPEC-EXPRESSION-RUNTIME`](../../../docs/specs/SPEC-EXPRESSION-RUNTIME.md) — the host pipeline this plugin's rules ride on.
- [`software_architecture/`](../software_architecture/) — sibling profile contributing `sw:Actor` referenced by `plan:Task.assignee_id` and `plan:Task.claim_holder_id`.
- Project root: [`README.md`](../../../README.md), [`PURPOSE.md`](../../../PURPOSE.md), [`DISCLAIMER.md`](../../../DISCLAIMER.md)
