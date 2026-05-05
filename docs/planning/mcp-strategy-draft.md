---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-05"
---

# MCP Strategy — Working Draft

**Status:** working draft, not a committed roadmap. Captures a session's
conversation about how fdpm should expose itself to LLM agents through
MCP, what the failure modes are, and which paths remain open. The
falsifiable parts are gated by an eval (see §6); everything above v2 is
contingent on that eval producing a number worth betting on.

**Audience:** fdpm contributors deciding what to build, in what order,
under what kill criteria. Not a user-facing document. Not a product brief.

**Companion documents:**
- [PURPOSE.md](../../PURPOSE.md) — the committed framing this draft argues toward.
- [README.md](../../README.md) — the public surface; "Eval design" and
  "Trust model" sections are the load-bearing commitments.
- [docs/specs/MCP-SERVER-SURFACE.md](../specs/MCP-SERVER-SURFACE.md) — what
  the MCP server exposes today.

---

## 1 · The question this strategy answers

Can an LLM agent — given only the fdpm MCP server, a domain plugin,
and no prior fdpm-specific prompting — drive a workbook competently
on first contact?

Today the answer is **no**. The MCP server exposes 30 generic
CRUD-shaped tools (`primitive_create`, `primitive_patch`,
`relation_create`, ...) and the `fdpm://workbook/{id}/render/{target}`
resource. To complete a planning task an agent has to: infer that "task"
maps to `plan:Task`, learn which field encodes status, learn the AC
graph, learn that `done` requires outgoing `plan:Verifies` with all
ACs `met`, then sequence three or four `primitive_patch` calls without
leaving the workbook in a state that violates a CEL rule. Generic CRUD
forces the agent to re-derive your domain on every cold start.

The strategy below is the architectural commitment to make the answer
"yes" — not by training agents on fdpm, but by reshaping fdpm's MCP
surface so a cold agent inherits the domain vocabulary on first contact.

---

## 2 · What we accepted as the architectural commitment

A plugin ships an installable domain vocabulary in **four parts**,
ordered by how a cold agent encounters them:

| # | Part | Verb | Carrier |
|---|------|------|---------|
| 1 | **Verbs** | act | per-verb MCP tools, plugin-namespaced op kinds |
| 2 | **Resources** | read | MCP resources, plugin-contributed URI schemes |
| 3 | **Prompts** | orient | MCP prompts, parameterized workflow templates |
| 4 | **Expressions** | compose | one MCP tool, `workbook.operation(expr)` |

Cutting across all four: **discovery tools** (`list_verbs`,
`describe_verb`, `applicable_operations(entity)`, `list_resources`,
`describe_language`, `workbook.dry_run(expr)`).

The conceptual reframe in the human-facing surface is captured by the
`project` → `workbook` rename ([fdpm-cli/scripts/rename_project_to_workbook.py](../../fdpm-cli/scripts/rename_project_to_workbook.py)).
The naming change matters for the agent surface too — agents primed on
"workbook" arrive thinking in spreadsheet-shaped composition, which
the expression language deliberately rewards.

### Why this shape and not "more tools"

The catalog-attention failure mode is real: large flat tool lists
measurably degrade model attention on tool selection. The four-part
split solves three problems at once:

- **Reads stay out of the tool catalog.** Resources are the read
  surface. Tools that bloat the catalog with `get_*` variants are
  the failure mode the architecture exists to avoid.
- **The cold-start gap is closed by prompts.** Tool descriptions
  answer *what does this verb do?*; prompts answer *how do I use
  these verbs together to accomplish X?*. Without prompts an agent
  has to discover workflows by trial.
- **Composition gets a single entry point.** `workbook.operation` is
  one tool, not 48. Batch / cross-primitive / atomic actions go
  through it; the catalog stays small.

Plus a fourth thing the design has to handle but that isn't a
"part" of the vocabulary:

- **Progressive disclosure.** Verbs and resources are summarized at
  connect; the full surface is fetched on demand. Converging on the
  direction MCP Skills (SEP-2640) is taking, without locking to its
  draft shape.

---

## 3 · The conversation's load-bearing decisions

Each row records a decision, the alternative we rejected, and why.

| Decision | Rejected alternative | Why |
|---|---|---|
| Plugins emit first-class operation kinds (`planning.task.complete`) | Generic CRUD with state encoded as field-patches | Audit log records intent, not just mechanism. Replay handler registry is the price; we pay it. |
| Operation log is the truth; expressions never re-execute at replay time | `workbook.operation` op stores expression, replay re-evaluates | Couples project history to expression-engine semantics forever. Replay must be deterministic across language versions. |
| Verbs are syntactically distinct from formulas (`plugin.entity.verb`) | Verbs as Excel-style functions inline anywhere a value can go | Excel formulas are pure and re-evaluating; verbs have side effects, transactionality, and (sometimes) async. Conflating them invites every Excel idiom that doesn't apply (`IFERROR`, recalculation, in-band error values). |
| Per-verb MCP tools are the primary surface; expressions are the batch escape hatch | Expression language as primary | Cold-start agents need typed tool descriptions. Per-verb tools win debuggability when something fails mid-workflow. |
| Reads through resources, not `get_*` tools | "Just expose what agents need as tools" | Tool catalog size degrades agent attention. Resources are the read surface. |
| Excel/PowerQuery M syntax at the surface, transaction semantics at the verb call | Pure spreadsheet semantics throughout | Surface borrowing helps agent comprehension; semantic borrowing breaks side-effects, transactions, and the audit log. |
| `LET` for binding pure values; no let-binding of action results | Full transaction language with `let $x = create(...); start($x)` | Crosses into roughly 10× the implementation work. Most "I need let-bindings" turn out to be "I need a better verb." |
| Plugin-version migration contract: `plugin_id@semver` per op kind, declared migration matrix | Best-effort skip-on-unknown-kind during replay | Soft-failing replay corrupts state silently. Hard-fail is safer; plugin authors own the migration matrix forward. |
| Eval gate at end of v2, not v1 | v1 = testable product | v1 has no surface to test the agent thesis (no prompts, no discovery). Calling v1 a product is a category error. |
| In-house plugin authorship only for v1–v2 | Open community-plugin tier with signing in v1 | Architecture is unproven. Signing/sandboxing/trust hardening designed against an unstable substrate gets thrown away. Eval first. |

---

## 4 · What's shipped vs. what's designed

### Shipped today

- Event-sourced workbook core: replay, time-travel, undo, audit
  ([fdpm-cli/src/core/store/](../../fdpm-cli/src/core/store/)).
- Plugin runtime: profiles, validators, renderers, transformers,
  importers, exporters
  ([fdpm-cli/src/plugin/](../../fdpm-cli/src/plugin/)).
- MCP server: Tier 1/2/3 generic CRUD tools
  ([fdpm-cli/src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts)).
- MCP resource surface: `fdpm://workbook/{id}/render/{target}`.
- Renderers as the human-review surface: markdown / HTML / PDF / SVG.
- The closed `OperationKind` enum (23 kinds) and the hardcoded replay
  switch ([fdpm-cli/src/core/store/replay.ts](../../fdpm-cli/src/core/store/replay.ts)).

### Designed but not implemented

- Plugin-emitted operation kinds (verbs as first-class ops).
- Per-verb MCP tools.
- Plugin-version migration contract.
- `ctx.registerPrompt(reg)` API.
- Plugin-contributed resource URI schemes (beyond render).
- Discovery tools.
- Plugin-shipped MCP prompts.
- Progressive-disclosure catalog summarization.
- MCP change notifications.
- `workbook.operation(expr)` filter language.

### Not in current roadmap

- Web UI on top of MCP (future, post-eval).
- Community plugin distribution, signing, third-party trust hardening
  (post-eval, contingent on architecture surviving).
- Full transaction language (let-binding action results, async handles,
  parallel execution).
- Reactive / scheduled re-evaluation of expressions.

---

## 5 · The build plan, with phase boundaries

### v1 — substrate proof

**Goal:** prove the operation-kind extensibility plumbing works. Not a
testable product against the agent thesis. Not eval-gated.

Deliverables:
- Plugin namespace for op kinds (`<plugin_id>.<entity>.<verb>`).
- Replay handler registry replacing the hardcoded `switch` in
  [fdpm-cli/src/core/store/replay.ts](../../fdpm-cli/src/core/store/replay.ts).
- Payload validation registry (Zod schemas registered per kind).
- Plugin-version migration contract: `plugin_id@semver` per op kind,
  declared migrations, refused upgrade if any historical kind has no
  migration path.
- Required-plugins manifest stored alongside the project log; replay
  refuses to start without all required plugins loaded.
- Per-verb MCP tools auto-generated from registered verbs.
- One plugin (planning) ships three verbs (`task.complete`, `task.start`,
  `assumption.invalidate`). Round-trip through `rebuild-from-log`
  validated.
- `ctx.registerPrompt(reg)` API in the plugin context, even though no
  prompts use it yet. Locking the API shape early.

**Exit criteria:** `rebuild-from-log` round-trips a project that used
all three verbs. Plugin-version migration tested end-to-end against a
hand-crafted scenario. No eval.

### v2 — discovery, prompts, eval

**Goal:** ship the surface that lets a cold agent learn the vocabulary
at runtime. **This is the eval gate.**

Deliverables:
- Discovery tools: `list_verbs`, `describe_verb`,
  `applicable_operations(entity)`, `list_resources`.
- Plugin-contributed resource URI schemes (e.g.
  `fdpm://workbook/{id}/planning/iteration/{iter_id}/state`).
- Progressive-disclosure layer: verbs and resources summarized at
  connect; full surface fetched on demand.
- MCP change notifications: `tools/list_changed`,
  `resources/list_changed`, `prompts/list_changed`.
- First plugin-shipped MCP prompt: `planning/triage_iteration`.
- Three-arm cold-agent eval (see §6).

**Exit criteria:** the eval (§6). v3 does not start until v2 produces a
number worth betting on.

### v3 — expression language, scoped down

**Goal:** ship the composition / batch surface for cases where N-tool-
call sequences are too expensive or non-atomic.

Deliverables:
- `workbook.operation(expr)` and `workbook.dry_run(expr)`.
- Expression grammar v0: source functions (`primitives`, `relations`,
  `outgoing`, `incoming`), `FILTER`, `LET`, structured-table
  references, CEL-shaped predicates.
- Static tier analysis on expressions; dry-run hash required for
  Tier-3-emitting expressions.
- Re-run the eval on high-cardinality batch instructions specifically.

**Deferred to v3.5+:** `MAP`, `FOR_EACH`, `LAMBDA`, transitive
closures, named queries, multi-plugin orchestration prompts.

**Estimate:** open-ended; revise after v2 eval result. The earlier
"2–3 months" anchor was optimistic; realistic v3 scope is 4–6 months
of disciplined work, and that's contingent on v2 not surfacing
architectural issues that force rework.

### v4 — vocabulary expansion

**Goal:** port verbs from the other plugins (fs, sw, dnis, spec) and
ship multi-plugin orchestration prompts. Roughly 45 of the 48 cataloged
verbs land here.

This phase is a placeholder. Its real shape depends on what v2 and v3
reveal about which verbs agents actually use vs. which ones we
imagined they would.

---

## 6 · The eval (the falsifiable contract)

The architecture is a hypothesis. The eval is what tells us whether the
hypothesis holds.

### Three-arm differential design

Three arms run in parallel against the same 50-instruction test set, on
the same model snapshot, with no prior fdpm exposure:

1. **Verbs only** — per-verb MCP tools, no discovery, no prompts.
2. **Verbs + discovery** — adds `list_verbs`, `describe_verb`,
   `applicable_operations(entity)`, `list_resources`.
3. **Verbs + discovery + prompts** — adds the first plugin-shipped MCP
   prompt and any prompt-layer tooling needed to invoke it.

The differential between arm 2 and arm 3 isolates the marginal
contribution of prompts. If arm 3 doesn't beat arm 2 by at least
**15 percentage points** on first-try success, prompts didn't pay for
themselves and the v3+ work that depends on the prompt thesis is
reconsidered.

### Pass criteria for a single instruction

All four required:

1. Terminal workbook state matches the instruction's stated goal.
2. The audit log replays in isolation against a fresh workbook and
   produces the same terminal state. Proves no hidden environment
   coupling.
3. No destructive ops (Tier 3) executed outside the instruction's
   stated scope.
4. Verb-sequence length within 2× the human-baseline sequence for the
   same instruction.

### Test-set composition

The 50 instructions cover:
- **Simple verb calls** — single-primitive, no graph traversal.
- **Multi-step workflows** — chained verbs across primitives.
- **Batch operations** — high-cardinality matches that an expression
  would express atomically.
- **Ambiguity-resolution cases** — instructions where the agent must
  pick between several applicable verbs.
- **Refusal cases** — instructions that should be refused as
  out-of-scope or destructive.

### Kill criterion

If arm 3's first-try success rate is below the threshold deemed
acceptable for the agent product case, the entire post-v2 roadmap is
reopened. No v3 until v2's number justifies it.

---

## 7 · Paths still on the table

Decisions still open that the v2 eval doesn't directly resolve.

### 7.1 — Scope of the expression language (v3)

**Filter language vs. transaction language.** Settled at filter language
in this conversation. Open question: how far does "filter" stretch?

- **Conservative:** sources + FILTER + CEL predicates. No `LET`. Closest
  to v2 + atomic batch.
- **Middle (current commitment):** above + `LET` for pure values. The
  `LET` form lets you name an intermediate query result; it does NOT
  bind action results.
- **Aggressive:** above + `MAP`, `FOR_EACH`, `LAMBDA`, named queries.
  Approaches PowerQuery M's surface.

Each step adds parser complexity and tier-analysis surface. **Open:**
do we ship middle as v3 and aggressive as v3.5, or commit to aggressive
in v3 and risk schedule slip?

### 7.2 — How verb handlers cascade

When `planning.task.cancel($t)` is called and `$t` has subtasks, three
options:
- (a) refuse if any subtask isn't in a terminal state;
- (b) cascade-cancel transitively;
- (c) cascade only to subtasks the same actor owns.

This is a per-verb design decision, but it raises a meta-question: do
verb handlers declare their cascade semantics in metadata (so the
runtime can render the cascade in dry-run output), or is it
opaque-to-the-runtime handler code?

**Lean:** declare. Otherwise dry-run can't show the agent what an
expression will actually do.

### 7.3 — Whether prompts can call verbs

A prompt is a string the agent loads into context. It can describe
verbs and instruct the agent to call them, but it isn't a program.

**Open:** do we want a "structured prompt" form where a prompt can
also pre-load tool calls (e.g. "before this prompt fires, the agent
sees the result of `list_blockers(iteration_id)`")? MCP supports
this in spirit through resource references inside prompts. Concrete
question: does the planning plugin's `triage_iteration` prompt
**include** a resource reference to the iteration's state, so the
agent has the data already when it reads the instructions?

**Lean:** yes; this is the actual cold-start cure. Prompts that
contain only prose are weaker.

### 7.4 — Multi-plugin orchestration

A `release/cut` prompt that invokes `planning.task.complete`,
`fs.assumption.review`, and `sw.decision.accept` in sequence is the
**actual lever** for the agent product. One plugin's verbs aren't
enough; cross-plugin workflows are.

**Open:** does a plugin own the orchestration, or is there a
"workflow plugin" that imports verbs from other plugins? The first
couples plugins to each other; the second adds a meta-plugin
abstraction we haven't designed.

**Lean:** workflow plugins as a v4 concern. v2 and v3 stay
single-plugin to keep the eval clean.

### 7.5 — Resource update semantics

If an agent is mid-workflow and another actor (human or agent) edits
the workbook, `notifications/resources/list_changed` fires. Open
questions:
- Does the agent get a structured diff, or just "stale"?
- Does the runtime checkpoint the agent's intent and replay it
  against the new state, or refuse and ask the agent to re-plan?
- For long-running expressions, do we snapshot the read state at the
  start of the expression so the dry-run preview is consistent?

**Lean:** at-start snapshot for expressions; "stale, re-read" for
ad-hoc tool calls. Don't try to build optimistic-concurrency for
agent operations in v2.

### 7.6 — Web UI shape

PURPOSE.md commits to "web UI on the same MCP surface." Open
questions:
- Is the web UI an MCP **client** (talks to the same server an agent
  talks to), or does it bypass MCP for direct host access?
- Does the web UI expose the expression language to humans, or only
  per-verb forms and rendered output?
- Where does the human review of agent-proposed actions happen — in
  the web UI's chat surface, in a separate "approval queue," or
  inline in the operation log?

**Lean:** web UI is an MCP client. Everything else is post-eval.

### 7.7 — When community plugins open

Currently deferred. Open questions when it does open:
- Signing scheme: per-plugin keys, per-publisher keys, or a CA model?
- Capability-scoped op emission: a planning plugin can only emit
  `planning.*` ops, signed payloads, etc.?
- Marketplace / registry shape: filesystem-discovered (today),
  HTTP-fetched, npm-style?
- Trust-tier grants for prompt registration vs. verb registration:
  same gate, or separate?

**Lean:** all of this is post-eval. None of it is worth designing
against an unproven substrate.

---

## 8 · What this strategy is not committing to

Things we discussed but explicitly rejected:

- **String-encoded RPC** (`workbook.operation("planning.task.complete($id)")`
  as opaque dispatcher). Loses per-tool schemas; reinvents eval.
- **Pure spreadsheet semantics throughout.** Verbs are not formulas;
  in-band error values (`#REF!`, `#N/A`) are not propagated; no
  recalculation; no implicit type coercion.
- **Cell addressing** (`A1:D5`). Workbooks are graphs, not grids.
- **Excel-style `IFERROR` over verb calls.** Verb failures fail the
  expression's report-row for that match; they don't propagate as
  values that subsequent expressions can mask.
- **Generic `workbook.transition` verb.** Collapses Path B back into
  Path A (transition over a state field). The point of plugin-emitted
  op kinds is that `complete` and `reopen` are different ops with
  different guards and different replay handlers.
- **Soft-failing replay** when a plugin's op kind isn't recognized.
  Hard-fail; the operator downgrades the plugin and tries again.
- **Trust-tier hardening for community plugins in v1–v2.** Post-eval.

---

## 9 · Unanswered questions worth holding

These don't block v1 or v2, but the strategy doesn't answer them:

1. **What's the eval threshold for "the architecture is worth keeping"?**
   The 15-point differential between arm 2 and arm 3 says whether
   prompts pay off. But what arm 3 absolute-success rate is the
   threshold for "ship it"? 60%? 80%? Not chosen.
2. **What if arm 1 (verbs only) is already good enough?** If verbs +
   nothing else hits 70% first-try success, do we still build prompts
   and the expression language? They might be over-engineering.
   Possible — and that's a result the eval has to honestly surface.
3. **What does cold-agent fairness look like?** "No prior fdpm
   exposure" can be operationalized by stripping fdpm from the
   model's system prompt, but the model's training data may already
   contain fdpm references (especially after this strategy ships
   publicly). The eval design must control for this; how isn't
   specified.
4. **Reproducibility across model snapshots.** Today's eval result on
   one model may not hold tomorrow. Does the strategy commit to a
   re-run cadence (every model release? every quarter?), or is the
   eval a one-time gate?
5. **Failure mode taxonomy.** When the eval fails, what categories of
   failure tell us *why*? The four pass criteria distinguish "wrong
   terminal state" from "audit log unrelayable" from "destructive
   excursion" from "verb-sequence too long," but those are coarse.
   Finer instrumentation would let us fix the right thing.

These are the questions to revisit when the eval result lands.

---

## 10 · Where this draft fits

This document is a working artifact. It captures one
session's-worth of architectural conversation and pins the decisions
that were sharp enough to commit to. It will go stale; the live
sources of truth are PURPOSE.md and README.md. Treat this draft as a
research note, not a spec.

When v1 starts, the open questions in §7 should migrate to either
(a) a SPEC document (SPEC-PLUGIN-VERBS, SPEC-WORKBOOK-EXPRESSION) or
(b) issue-tracker tickets that block phase exit. Anything still in §7
when v3 starts is unfinished thinking and should pause v3 until
resolved.

When the v2 eval lands, this document gets archived. Either the
architecture survives (and its committed shape moves into the SPEC
documents), or it doesn't (and this document becomes a record of
what we tried and why it didn't work). Both outcomes are honest.
