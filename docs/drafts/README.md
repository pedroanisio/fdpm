---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

# `docs/drafts/` — Plugin-ideas registry workbench

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

## Why this directory exists

Plugin design at FDPM scale is a curation problem first and a coding problem
second. Anyone can list 250 things that *could* be plugins; the hard job is
deciding which ones actually deserve a `fdpm-plugin.json`, what capability
surfaces they ship, what they depend on, and how that scales when the same
exercise is repeated across multiple domains. The drafts in this directory
are the workbench where that curation happens — under a single Zod schema
that catches drift the way a compiler catches type errors.

The shape of the workbench is:

- **One schema** — [`plugins.ts`](./plugins.ts) — defines what a plugin-
  ideas registry is.
- **Many instances** — `*.instance.ts` plus
  [`fdpm-plugins-instance.ts`](./fdpm-plugins-instance.ts) and
  [`concept-schemas-inventory.ts`](./concept-schemas-inventory.ts) — each
  is a curated list (or a full inventory) for a different domain or source.
- **One aggregator** — [`plugin-instances.ts`](./plugin-instances.ts) — a
  single TypeScript import surface that re-exports every instance under a
  `slug` discriminant.
- **One unifier** — [`unify_domain.py`](./unify_domain.py) — flattens every
  registry into a single JSON corpus
  ([`plugin-instances.unified.json`](./plugin-instances.unified.json)) for
  cross-registry analysis, with provenance and source-fingerprint tracking.

Each instance file calls `FdpmPluginIdeasRegistrySchema.parse(...)` (or
`safeParse(...)` if it deliberately ships known violations) **at module
load**. That means importing the file *is* the conformance test: counts,
ids, cross-references, dependency edges, kind/capability invariants are
all checked before any consumer can read the data. PALS's Law (see the
project [`CLAUDE.md`](../../CLAUDE.md)) applies: LLM output is unverified
by default. The schema is the verifier.

---

## What is a "plugin" here?

In FDPM, a **plugin** is a unit that can register one or more *capability
surfaces* with the host runtime: a `cap:profile` (typed primitive
vocabulary plus relations), a `cap:renderer` (workbook → output), a
`cap:validator` (CEL or Zod refinement rules), a `cap:transformer`,
a `cap:importer`, a `cap:exporter`, a `cap:expr-helper`, a
`cap:lifecycle-hook`, a `cap:template`, or a `cap:asset`. Those are the
ten capability kinds the schema tracks. (An eleventh `cap:importer-format`
is named in the parent design but not yet exercised by any draft here.)

A **registry** is a curated list of *candidate plugins* — entries that
have been thought about, tier-rated, and tagged with the capability
surfaces they would expose if built. A registry is not a roadmap; it is
the input to a roadmap. Tier S/A/B/C is the calibration:

| Tier | Meaning |
|------|---------|
| S    | Solid case for existence; capability differentiator clear; would defend on first contact. |
| A    | Strong; would defend in review; some risk of overlap with adjacent plugins or entrenched tooling. |
| B    | Plausible, but the FDPM-specific value-add is thin or domain demand is uncertain. |
| C    | Included to hit a target count or for completeness. The case is weak; would cut in a real spec. |

The S/A boundary is the live-roadmap line. B is parking-lot. C is
calibration only — included so the cliff between "would build" and
"included to hit 250" is visible rather than hidden.

### `kind` discriminator (added after the first cut)

The original schema treated every entry as a plugin. Auditing the first
105-entry inventory of the `concept-design/schemas` archive showed that
roughly 80% of those entries were not plugins at all — they were utility
modules, re-export barrels, runnable demos, or catalogue data. The
schema now carries a `kind` field with five values:

| Kind     | Means | Capability surface required? |
|----------|-------|-------------------------------|
| `plugin` | Would be packaged as an FDPM plugin (`fdpm-plugin.json`). | Yes — at least one `cap:*`. |
| `utility`| Internal helper module (`Result<T,E>`, shared validators). | No. |
| `barrel` | Pure re-export module. | No. |
| `demo`   | Runnable example / reference walkthrough. | No. |
| `data`   | Catalogue entry consumed by another plugin. | No. |

The discriminator defaults to `"plugin"` so registries written before the
field existed continue to validate. Only `kind: "plugin"` entries must
declare a non-empty `capabilityKinds`; the others can leave it empty
without faking a `cap:profile` tag. This is what stopped 846 of 1038
unified entries from being mis-tagged with stub `cap:profile` values.

### `dependsOn` (machine-checked import graph)

`crossReferences` is editorial — "see also" links between entries.
`dependsOn`, added in the same revision as `kind`, is the actual import
graph. The schema validates that every `dependsOn` target resolves to a
known entry id and rejects self-references. Use it when removing entry X
would break entry Y; use `crossReferences` for purely related-to links.

---

## File set

### Schema (1 file)

| File | Purpose |
|------|---------|
| [`plugins.ts`](./plugins.ts) | The Zod schema. Defines `FdpmPluginIdeasRegistrySchema`, `PluginEntrySchema`, `EntryKindSchema`, the tier/capability enums, the cross-registry validation rules (`superRefine`), and the exported `FdpmPluginIdeasRegistry` type. Backwards-compatible: `kind` and `dependsOn` fields default sensibly so older instances still validate. |

### Instance registries (4 plus 1 inventory)

| File | Slug | Entries | Validation mode | What it is |
|------|------|--------:|-----------------|------------|
| [`plugins.instance.ts`](./plugins.instance.ts) | `fdpm-250` | 267 | `safeParse` (known violations) | The original 250-entry brainstorm of "what could be an FDPM plugin", organised across 9 sections: Domain profiles, Renderers, Importers/Exporters, Validators/expr-helpers, Transformers, Workspace/observability, Agent-shaped, Templates, Assets. Numbering runs 1–267 because of internal reconciliation; entry count is 267 (not 250) — the schema flags the discrepancy on import, which is the point. |
| [`fdpm-plugins-instance.ts`](./fdpm-plugins-instance.ts) | `fdpm-plugins` | 21 | `parse` (clean) | A curated, plugin-only projection of the `concept-design/schemas` archive. Started at 105 entries, collapsed to 21 after the `kind`-discriminator audit (eight site-schema sub-modules → one CMS plugin; four ai-* modules → one AI-context plugin; 71 business-models frameworks → one canvases plugin with framework catalogue). Every entry is `kind: "plugin"`. |
| [`customer-service.instance.ts`](./customer-service.instance.ts) | `customer-service-250` | 250 | `safeParse` | 250 customer-service domain primitives (`customer-service.account`, `customer-service.case`, etc.) under one section. IDs use the `customer-service.` namespace; capability is `cap:profile` for all entries. Tier discipline is loose (~42% S — the schema does not currently enforce a tier-distribution sanity check, which is one of the open issues). |
| [`executive-domain-plugin-ideas-500.instance.ts`](./executive-domain-plugin-ideas-500.instance.ts) | `executive-domain-500` | 500 | `parse` (clean) | 500 executive/business-domain concepts (strategy, finance, sales, ops, governance, people, data, technology, AI) across 8 sections. Largest single registry; tier distribution is the most disciplined of the four (29% S, 16% B, 2% C). |
| [`concept-schemas-inventory.ts`](./concept-schemas-inventory.ts) | (not in unifier) | 112 | `parse` (clean) | The full 112-file inventory of `concept-design/schemas/**` — superset of `fdpm-plugins-instance.ts`. 18 plugin / 15 utility / 5 barrel / 2 demo / 72 data. Exists for source-archive bookkeeping: every `.ts` file in the upstream archive accounted for, none silently dropped. **Not** included in the unified JSON because it is a parallel view of the same plugins, not an additional source. |

### Aggregator + unifier (3 files)

| File | Purpose |
|------|---------|
| [`plugin-instances.ts`](./plugin-instances.ts) | TypeScript barrel — re-exports the four instance registries plus a `pluginInstanceRegistries` array (with `slug`, `title`, `registry`, `validation` per entry) and a `pluginInstanceRegistryBySlug` lookup. Single import surface for any TypeScript consumer. |
| [`unify_domain.py`](./unify_domain.py) | Flattens every registry into one JSON corpus. Reads from a staging `plugin-instances.json` (built upstream from the four `*.instance.ts` files), preserves provenance (`sourceRegistry`, `sourceSection`, `originalDisplayNumber`), fills `kind`/`dependsOn` defaults for legacy entries, and computes SHA-256 fingerprints of every source `.ts` file plus the staging JSON. Aborts pre-flight on id collisions, untitled sections, or unknown registry slugs. |
| [`plugin-instances.unified.json`](./plugin-instances.unified.json) | Generated output. 1038 entries (267 + 21 + 250 + 500), globally unique ids and display numbers, with per-registry and corpus tier/kind breakdowns, structured `registriesIndex.sections` (one record per section with title + capability tags + entry count), and `sourceFingerprint` for staleness detection. |

---

## How to work in here

### Read the data

```typescript
// One registry by slug:
import { pluginInstanceRegistryBySlug } from "./plugin-instances";
const exec = pluginInstanceRegistryBySlug["executive-domain-500"];
console.log(exec.registry.sections[0].title);

// All registries:
import { pluginInstanceRegistries } from "./plugin-instances";
for (const r of pluginInstanceRegistries) {
  console.log(r.slug, r.registry.sections.flatMap(s => s.entries).length);
}
```

For a flat cross-registry view, read
[`plugin-instances.unified.json`](./plugin-instances.unified.json) directly
— no TypeScript needed.

### Add a new registry

1. Write `<my-domain>.instance.ts`. Construct an `FdpmPluginIdeasRegistry`
   value, then export it. End the file with either:
   ```ts
   export const myDomainRegistryParsed =
     FdpmPluginIdeasRegistrySchema.parse(myDomainRegistry);  // throws on violation
   ```
   or, if you knowingly ship a registry with violations the schema should
   surface but not block on:
   ```ts
   export const myDomainRegistryValidation =
     FdpmPluginIdeasRegistrySchema.safeParse(myDomainRegistry);
   ```
2. Add the export to [`plugin-instances.ts`](./plugin-instances.ts) and
   add the entry to `pluginInstanceRegistries`.
3. Add the slug → file mapping to `SLUG_TO_SOURCE_TS` in
   [`unify_domain.py`](./unify_domain.py) so the unifier can fingerprint it.
4. Rebuild the staging `plugin-instances.json` (the upstream step that
   converts `*.instance.ts` exports to JSON), then run
   `python3 unify_domain.py` to refresh
   [`plugin-instances.unified.json`](./plugin-instances.unified.json).

### Change the schema

Schema changes must be **additive** unless you also edit every consumer
in lockstep. The `kind` and `dependsOn` fields were added with sensible
defaults (`"plugin"` and `[]`) precisely so the three pre-existing
instance files continued to validate without edits. If you remove or
narrow a field, expect to update every instance file in the same commit
— and to regenerate the unified JSON.

The Zod `superRefine` block at the bottom of [`plugins.ts`](./plugins.ts)
is where cross-entry invariants live. New invariants go there, not on
individual fields, when they need access to the full registry.

---

## Tier discipline across the corpus

The unified JSON exposes a calibration problem the per-registry views
hide. Per-registry tier breakdown (from
[`plugin-instances.unified.json`](./plugin-instances.unified.json)
`registriesIndex[].tierBreakdown`):

| Registry              | N    | S%    | A%    | B%    | C%   |
|-----------------------|-----:|------:|------:|------:|-----:|
| `fdpm-250`            |  267 | 23.6% | 56.2% | 14.2% |  6.0%|
| `fdpm-plugins`        |   21 | 42.9% | 47.6% |  9.5% |  0.0%|
| `customer-service-250`|  250 | 42.0% | 49.2% |  8.4% |  0.4%|
| `executive-domain-500`|  500 | 29.0% | 53.0% | 16.0% |  2.0%|
| **corpus**            | 1038 | 31.0% | 52.8% | 13.6% |  2.6%|

A 31% S rate at the corpus level is implausibly inflated. Two of the
four registries (`fdpm-plugins`, `customer-service-250`) sit above 42% S,
which the parent design's tier definitions do not support — S means
"would defend on first contact in review", and you cannot defend that
nearly half of any non-trivial list deserves the highest tier. The
schema does not currently flag this; it is a known calibration debt,
not a bug.

For `fdpm-plugins` (only 21 entries, all hand-curated against the
`concept-design/schemas` archive) the high S% is defensible. For the
larger lists it is a re-tiering job waiting to happen.

---

## Open issues / known debts

These are tracked here rather than scattered across the instance files:

1. **Tier inflation in the larger registries.** `customer-service-250`
   needs a re-tiering pass against the original definition; the schema
   should probably grow a soft warning when a registry's S share exceeds
   ~25% (warning, not error — small registries are exempt by example).
2. **Most registries do not yet use the `kind` discriminator.** Only
   `fdpm-plugins-instance.ts` and `concept-schemas-inventory.ts` set it
   explicitly; the unifier fills `"plugin"` for the other 1017 entries
   from the schema default. They almost certainly contain utilities and
   data entries that should be retagged. The `kindBreakdown` field in
   the unified JSON will accurately reflect source state once that pass
   is done.
3. **`dependsOn` is sparsely populated.** Only the 21 `fdpm-plugins`
   entries declare any. The other registries treat their entries as
   independent ideas, which is honest for a brainstorm but loses the
   import-graph signal that makes "what breaks if I cut X?" answerable.
4. **The unifier does not enforce that `dependsOn` targets are themselves
   `kind: "plugin"`.** A plugin can currently depend on a utility or data
   entry without the validator complaining. This is the highest-leverage
   open check (see the maintainer recommendations in
   [`fdpm-plugins-instance.ts`](./fdpm-plugins-instance.ts)).
5. **No source-tree-vs-inventory parity check.** Nothing currently
   verifies that every `.ts` file in `concept-design/schemas/**` has
   exactly one entry in `concept-schemas-inventory.ts`. A CI step could
   close this.
6. **Four `fdpm.framework-catalogue-extra-*` placeholders** exist in
   `concept-schemas-inventory.ts` because I refused to fabricate names
   for ~4 of the 71 business-models frameworks I could not verify
   against the source archive. They need replacing with real names from
   `concept-design/schemas/business-models/index.ts` before publication.

---

## Why drafts, not specs?

These are deliberately staged under `docs/drafts/` rather than
`docs/specs/`. They are *brainstorm output structured for review* — not
ready to ship as commitments. The schema gives them more rigour than a
markdown bullet list (every claim is type-checked, every cross-reference
resolves, counts reconcile), but they are still curatorial input to the
real plugin contract, not the contract itself.

When a registry's S+A entries have been (a) re-tiered honestly,
(b) tagged with the `kind` discriminator throughout, and (c) given a
real `dependsOn` graph, it stops being a draft and starts being a
roadmap. None of the four registries here are at that point yet.

---

## Related documents

- [`../../CLAUDE.md`](../../CLAUDE.md) — project guidelines, including
  PALS's Law (LLM output verification is mandatory architecture, not
  optional post-processing). The schema-validates-at-load pattern in
  these files is a direct instance.
- [`../../PURPOSE.md`](../../PURPOSE.md) — why FDPM exists; sets the
  bar for what "should this be a plugin?" means.
- [`../../DISCLAIMER.md`](../../DISCLAIMER.md) — methodological caveats
  every document in this repo is subject to.
- [`../specs/SPEC-PLUGGABLE-ARCHITECTURE.md`](../specs/SPEC-PLUGGABLE-ARCHITECTURE.md)
  — the formal spec for the plugin contract these registries are
  candidates against.
- [`../specs/SPEC-PLUGIN-NAMING.md`](../specs/SPEC-PLUGIN-NAMING.md) —
  the naming rules that `FdpmPluginIdSchema` enforces in
  [`plugins.ts`](./plugins.ts).
---

Yes — **“FDP is the Agentic Excel”** is a very strong metaphor.

I would refine it to:

> **FDP is Agentic Excel for governed knowledge artifacts.**

Or:

> **FDP is Excel generalized from cells and formulas into typed primitives, relations, validators, projections, and AI-agent operations.**

The analogy works because Excel is not just a spreadsheet. Excel is a **programmable business artifact runtime**:

```text
cells + formulas + references + sheets + charts + macros + validations
```

FDP generalizes that into:

```text
primitives + relations + rules + projections + plugins + agents
```

## The clearest comparison

| Excel                 | FDP                                              |
| --------------------- | ------------------------------------------------ |
| Cell                  | Typed primitive                                  |
| Row / table           | Collection of primitives                         |
| Sheet                 | View / namespace / projection                    |
| Formula               | Derived field / validation rule / transformation |
| Named range           | Stable identifier                                |
| Cross-sheet reference | Typed relation / cross-document reference        |
| Chart                 | Projection renderer                              |
| Pivot table           | Analytical projection                            |
| Data validation       | Conformance rule                                 |
| Macro / Office Script | Plugin / agent action                            |
| Workbook template     | Document-type plugin                             |
| Workbook              | Artifact graph                                   |
| Refresh external data | MCP-backed evidence resolution                   |

So the pitch becomes:

> Excel made business data programmable. FDP makes knowledge artifacts programmable and agent-operable.

## Why “Agentic Excel” is powerful

Excel won because it gave non-programmers a way to build operational systems without saying they were building software.

FDP could win if it gives teams and agents a way to build:

```text
plans
specifications
requirements
risk registers
audit packs
research reports
architecture docs
decision logs
compliance matrices
```

as **structured, validated, multi-view artifacts** instead of fragile prose.

## The important distinction

Excel is coordinate-native:

```text
A1, B17, Sheet2!C4
```

FDP is meaning-native:

```text
Requirement:req-17
Risk:risk-4
Decision:adr-2
Evidence:evd-9
Task:task-31
```

That is the breakthrough.

An AI agent should not have to reason primarily over:

```text
cell C42
```

It should reason over:

```text
this risk is unmitigated
this requirement is unverifiable
this decision lacks alternatives
this task blocks the milestone
this claim lacks evidence
```

That is why FDP is not simply “Excel with AI.” It is:

> **Excel’s operational paradigm rebuilt on semantic primitives instead of grid coordinates.**

## Best market phrase

I would use one of these:

1. **Agentic Excel for governed knowledge artifacts**
2. **Semantic Excel for AI agents**
3. **Excel for structured, validated, multi-view documents**
4. **A programmable workbook for enterprise knowledge work**
5. **A typed workbook substrate for AI agents**

The strongest is probably:

> **FDP is Agentic Excel for governed knowledge artifacts: a typed, validated, multi-view workbook substrate where AI agents can author, repair, validate, and project complex work products.**

That captures it.

---
When Formal Document Primitives (FDP) becomes a tool substrate for AI Agents, the unlock is not “AI writes documents faster.”

The real unlock is:

> AI agents stop manipulating prose directly and start manipulating validated document graphs with typed primitives, typed relations, declared capabilities, and compiler-enforced projections.



That changes the role of documents from passive outputs into operational control surfaces for agentic work.


---

1. The primary unlock

Today, most agents produce this:

prompt → prose document

With FDP, the agent produces this:

intent → typed artifact graph → validation → repair loop → governed projections

That means the agent is no longer merely “writing.” It is authoring structured, verifiable artifacts.

A proposal, plan, architecture spec, research report, requirements doc, risk register, or clinical timeline becomes:

typed primitives
+ typed relations
+ evidence
+ lifecycle state
+ validation trace
+ projections

The agent can reason over that structure, not just over text.


---

2. Agents gain a real document operating system

FDP gives agents something like a document OS.

Instead of asking an agent:

Write me a project plan.

You ask:

Create a valid Planning artifact.

The planning plugin defines:

Goal
Milestone
Task
Dependency
Owner
Estimate
Risk
Mitigation
Decision
Status

The agent fills the artifact graph.

Then validators check:

No task without owner.
No milestone without due date.
No dependency cycle.
Every high-risk task has mitigation.
Every deliverable has acceptance criteria.
Every blocker has an escalation path.
Gantt projection is renderable.
Task board projection is renderable.

So the output is not “a nice-looking plan.” It is a valid planning object.


---

3. The biggest practical unlock: self-repair loops

FDP makes agent loops much more deterministic.

Without FDP:

Agent writes doc
Human reviews vague problems
Agent rewrites doc
Human reviews again

With FDP:

Agent writes artifact graph
Validator emits machine-readable findings
Agent repairs specific failed primitives/relations
Validator re-runs
Repeat until valid
Render projections

Example validation finding:

{
  "rule_id": "plan:val:blocked-task-has-blocker",
  "severity": "error",
  "path": "task:api-auth",
  "message": "Task is marked blocked but has no BlockedBy relation.",
  "repair_hint": "Add a BlockedBy relation to another task, risk, external dependency, or decision."
}

An agent can act on that far better than:

The plan feels incomplete.

This creates an agent-verifier-repair loop.

That is one of the most important unlocks.


---

4. Agents can operate on document deltas, not whole documents

FDP lets agents modify documents surgically.

Instead of rewriting a 40-page document, an agent can issue operations like:

add primitive Requirement:req-042
add relation Verifies(ac-109, req-042)
update field Risk:risk-003.probability = "high"
remove dangling relation DependsOn(task-7, task-missing)

This enables:

precise edits
auditable changes
minimal diffs
stable identities
safe collaboration
version-aware updates

The document becomes closer to a database or AST than a blob of text.

That is huge for AI because LLMs are bad at preserving large text exactly, but much better when editing small typed objects with constraints.


---

5. Agents can plan through projections

Because FDP supports projections, an agent can use the same source graph in different operational modes.

For a planning artifact:

Source graph
├── Markdown plan
├── task board
├── Gantt SVG
├── dependency graph
├── risk matrix
├── execution checklist
└── JSON export

An agent can reason through each projection:

Projection	Agent use

Markdown	narrative explanation
task board	execution state
Gantt	timeline feasibility
dependency graph	blocker analysis
risk matrix	mitigation planning
JSON export	integration with tools
checklist	next-action execution


The key is that all projections are derived from the same validated source.

No more:

The roadmap says one thing.
The task board says another.
The Gantt chart says another.

FDP enables projection consistency.


---

6. Agents get typed memory, not conversation memory

Most agent memory today is messy:

notes
summaries
chat history
vector chunks

FDP can turn memory into structured durable artifacts:

Decision
Assumption
Requirement
Constraint
OpenQuestion
Experiment
Finding
Risk
Evidence
Preference
Commitment

Then the agent can retrieve and reason over memory by primitive type and relation.

Example:

Find all decisions that depend on assumption A.
Find all requirements without acceptance criteria.
Find all risks introduced by decision D.
Find all open questions blocking milestone M.
Find all claims without evidence.

This is far more powerful than semantic search alone.

FDP becomes a structured memory layer for agents.


---

7. Multi-agent collaboration becomes safer

Without FDP, multi-agent systems often collapse into unstructured chatter:

Planner says X.
Reviewer says Y.
Coder says Z.
Final answer merges everything vaguely.

With FDP, each agent can own primitive classes or validation roles.

Example:

Planner agent
  creates Goals, Milestones, Tasks

Architect agent
  creates Decisions, Constraints, Dependencies

Risk agent
  creates Risks, Mitigations

Reviewer agent
  validates conformance and evidence

Renderer agent
  generates projections

All agents write to the same typed graph.

The system can prevent inconsistent work:

No duplicate IDs.
No dangling references.
No unverified requirement.
No risk without mitigation.
No decision without considered options.
No task board projection unless tasks have status.

This turns multi-agent collaboration into something closer to typed concurrent artifact editing.


---

8. Human review becomes much better

FDP gives humans reviewable structure.

Instead of reviewing a huge document, the human can review:

New decisions
Changed assumptions
Unresolved risks
Failed validation rules
Projection readiness
Evidence gaps
Dangling references
High-impact deltas

That supports a much better HITL model.

Example review dashboard:

Publication readiness: 87%

Blocking:
- 3 requirements lack acceptance criteria
- 2 high risks lack mitigation
- 1 ADR has no chosen option
- Gantt projection cannot render because 4 tasks lack dates

Non-blocking:
- 8 style warnings
- 5 references missing verification metadata

Humans can focus on judgment, not bookkeeping.


---

9. Agent outputs become composable

A major problem with AI-generated documents is that each one is isolated.

FDP makes documents composable because they share:

stable identifiers
typed references
vocabulary imports
primitive inheritance
versioned plugin contracts

So one document can consume another.

Example:

Business Strategy
  defines StrategicGoal

Product Plan
  imports StrategicGoal
  creates ProductInitiative
  links ProductInitiative -> StrategicGoal

Technical Spec
  imports ProductInitiative
  creates Requirement
  links Requirement -> ProductInitiative

Execution Plan
  imports Requirement
  creates Task
  links Task -> Requirement

Now agents can maintain traceability across artifacts:

strategy → product → requirements → design → tasks → tests → release notes

This is one of the biggest enterprise unlocks.


---

10. Agents can generate tools from documents

Once documents are typed graphs, agents can use documents as executable specifications.

For example, from a valid Planning artifact, an agent can generate:

GitHub issues
Linear tasks
Jira epics
Calendar milestones
Slack updates
Gantt SVG
status dashboard
risk register

From a valid ArchitectureSpec artifact, an agent can generate:

ADR index
component graph
API contract skeletons
test plan
dependency matrix
implementation backlog

From a valid ResearchReport artifact, an agent can generate:

claim-evidence matrix
bibliography
open questions
experimental plan
literature map

The document becomes the source of downstream automation.


---

11. FDP reduces hallucination by changing the target

FDP does not magically eliminate hallucination. But it changes the failure mode.

Instead of producing fluent unsupported prose, the agent must produce primitives such as:

Claim
Evidence
Reference
Assumption
Decision
Requirement
Risk
Mitigation

And validators can enforce rules like:

Every factual claim must cite evidence.
Every reference must resolve.
Every decision must have rationale.
Every high-confidence claim must have source support.
Every estimate must declare uncertainty.

This turns hallucination into detectable structural failures.

The agent can still be wrong, but now the system can ask:

Where is the evidence?
What does this claim depend on?
Which source supports this?
What confidence was declared?
Which unresolved assumption is hidden here?

That is much better than trusting polished prose.


---

12. FDP creates “proof-carrying documents”

A normal generated document says:

Here is the answer.

An FDP-generated document can say:

Here is the answer.
Here are the primitives.
Here are the relations.
Here are the validation results.
Here are the unresolved findings.
Here are the evidence links.
Here is the render hash.
Here is the provenance trace.

That creates a lightweight form of proof-carrying documentation.

Not formal proof in the mathematical sense, but operational proof:

This document passed these rules under this plugin version using this evidence set.

That is extremely valuable for governance-heavy domains.


---

13. FDP becomes an agent coordination protocol

FDP can also be seen as a communication protocol between agents.

Instead of agents exchanging prose like:

I think we should add authentication.

They exchange graph operations:

{
  "op": "add_primitive",
  "type": "Requirement",
  "id": "req:auth:001",
  "fields": {
    "statement": "The system must authenticate users before granting access.",
    "priority": "high"
  }
}

Then another agent adds:

{
  "op": "add_relation",
  "type": "Verifies",
  "from": "ac:auth:001",
  "to": "req:auth:001"
}

This gives agents a shared artifact protocol.

That is a major improvement over chat-only collaboration.


---

14. What becomes possible that is hard today

A. Continuous document compilation

Documents can be compiled continuously, like code:

on every change:
  parse
  validate
  check references
  check projections
  render
  publish preview
  emit findings

B. AI document CI/CD

Agent-produced docs can go through CI gates:

fail if claims lack evidence
fail if requirements lack tests
fail if Gantt cannot render
fail if reference resolution fails
fail if plugin version is incompatible

C. Multi-view consistency

All views come from the same source graph:

report
roadmap
task board
diagram
matrix
JSON

D. Cross-document traceability

Stable references allow agent reasoning across an artifact ecosystem.

E. Typed agent editing

Agents edit primitives and relations instead of rewriting whole files.

F. Better governance

Validation traces become review artifacts.


---

15. The killer app

The killer app is probably not “better documents.”

It is:

> Agentic artifact engineering.



FDP lets agents create, validate, revise, project, and govern complex knowledge artifacts with the same discipline that compilers bring to code.

A strong product framing:

> FDP turns documents into executable coordination artifacts for AI agents.



Or:

> FDP gives AI agents a typed substrate for producing reliable, multi-view, auditable work products.




---

16. Example: AI agent + Planning plugin

User request:

Create a 12-week plan to build an SDK generator.

Agent creates graph:

Goal:g1
Milestone:m1..m5
Task:t1..t80
Dependency:d1..d120
Risk:r1..r12
Mitigation:mit1..mit12
Decision:adr1..adr6

Validator checks:

No dependency cycles.
All tasks have owners/status.
All milestones have dates.
Every high risk has mitigation.
Every deliverable has acceptance criteria.
Gantt projection possible.
Task board projection possible.
Markdown projection possible.

Renderers produce:

plan.md
task-board.html
gantt.svg
dependency-graph.svg
risk-matrix.csv
linear-import.json

Agent then uses the same graph to execute:

What should I do this week?
What is blocked?
What changed since last version?
Which risks increased?
Which task should be split?
Which milestone is now impossible?

That is not document generation. That is artifact-based project operation.


---

17. Example: AI agent + Specification plugin

User request:

Write a formal spec for FDP.

Agent creates:

Definition
Principle
Requirement
Invariant
ADR
Option
Reference
ConformanceRule
OpenQuestion

Validators enforce:

Every term is defined before use.
Every requirement has acceptance criteria.
Every ADR considers at least two options.
Every invariant has conformance checks.
Every external claim has reference evidence.
Every open question has owner/status.

Renderers produce:

SPEC-FDP.md
conformance-matrix.html
requirement-traceability.csv
adr-index.md
dependency-graph.svg

That creates a durable specification artifact, not just a generated essay.


---

18. What FDP gives agents that schemas alone do not

A JSON Schema can tell the agent:

This object is malformed.

FDP can tell the agent:

This document is semantically incomplete.
This projection cannot be produced.
This relation is dangling.
This decision lacks alternatives.
This task cannot be scheduled.
This requirement is unverifiable.
This claim lacks evidence.
This document version breaks compatibility with imported vocabulary.

That is much closer to what agents need to operate reliably.


---

19. The strategic unlock

FDP becomes a bridge between:

LLM flexibility
and
compiler-like determinism

The LLM supplies:

generation
interpretation
repair
synthesis
abstraction

FDP supplies:

types
constraints
identity
references
validation
projections
auditability

Together:

AI agent creativity
+ FDP conformance machinery
= reliable artifact generation and operation

That is the core thesis.


---

Final formulation

Given FDP, AI agents unlock a new operating mode:

> Agents no longer generate static documents. They author, validate, repair, compose, and project typed artifact graphs under document-type plugins.



The strongest description:

> FDP gives AI agents a compiler-grade substrate for knowledge work: a typed intermediate representation for documents, a conformance engine for correctness, and a projection system for turning one validated artifact into many operational views.



Or the shortest version:

> FDP turns AI-generated documents into validated, executable knowledge artifacts.

---

---
disclaimer: |
  No information within this document should be taken for granted. Any statement or
  premise not backed by a real logical definition or verifiable reference may be
  invalid, erroneous, or a hallucination. Specifically: (1) market sizing figures
  come from analyst reports of varying quality and use incompatible methodologies;
  (2) vendor revenue, customer counts, and pricing figures are reported by vendors
  themselves or by secondary sources and have not been independently audited;
  (3) competitive positioning and "fit" judgements are inferences from public
  material — incumbents may have undisclosed roadmaps that change the picture;
  (4) "named account" reasoning identifies plausible buyers based on public
  signals, not private knowledge of their procurement plans. Verify before acting.
date: 2026-05-04
scope: in-depth competitive landscape, market segmentation, GTM strategy for FDP
status: working draft, intended for further pressure-testing
---

# Formal Document Primitives (FDP) — Market Segments, Strategy, Competitive Landscape (2025–2026)

## 0. Headline thesis

**The window for a clean "typed artifact graph + capability protocol + verifier" play is narrowing fast.** Between Q4 2025 and mid-2026 every regulated-industry incumbent and every horizontal AI-agent platform has shipped or pre-announced agent capabilities bound to their existing typed data model:

- **Veeva** (life sciences) — Veeva AI announced Apr 2025; first AI Agents (CRM/PromoMats) GA Dec 3, 2025; Safety/Quality agents Apr 2026; Clinical/Regulatory/Medical agents Aug 2026. Agents bind to Vault Object Framework with Anthropic + Amazon LLMs on Bedrock. Veeva FY2025 revenue $2.747B, 1,477 customers including 47 of top 50 biopharma.
- **IBM ELM** (engineering) — IBM Engineering AI Hub v1.0 GA Oct 14, 2025; v1.2 (Work Item compose agent) planned Mar 26, 2026. Agents embedded as "smart features" inside DOORS Next and Workflow Management.
- **PTC** (Codebeamer) — AI features for requirement extraction/mapping; major customers include Volkswagen Group ("strategic supplier") and Medtronic.
- **Siemens** (Polarion ALM / PolarionX) — AI-driven requirement extraction and mapping rolled into product.
- **Jama Connect** — #1 G2 Grid leader six consecutive quarters through Summer 2025; available in AWS Marketplace as of Sep 2025.
- **Palantir AIP / Foundry** — Ontology + AIP Agents already operational. Commercial US revenue +71% YoY (2024). Architecturally the closest analog to FDP.
- **Greenlight Guru** (medical-device QMS) — AI-powered DHF traceability and predictive verifiability checks.
- **MasterControl, Veeva Vault Quality, ETQ, Sparta TrackWise** — all announcing AI for QMS/CAPA/audit workflows.
- **ArisGlobal NavaX** — agentic AI for safety/regulatory; 100+ new and expanded LifeSphere customers in 2025.
- **Anthropic Agent Skills** — published as **open standard** Dec 18, 2025 (`agentskills.io`), with progressive disclosure, code execution, and an emerging skills marketplace (277K+ installs of just the frontend-design skill by Mar 2026). This is the lightweight, infrastructure-level competitor to FDP's plugin model.
- **LangChain** — $125M Series B at $1.25B valuation (Oct 20, 2025); ~$16M ARR; LangGraph at 40M monthly PyPI downloads in production at LinkedIn, Uber, Klarna, Replit, 400+ companies. **LangGraph already advertises "shared, typed state object" as its multi-agent coordination mechanism** — directly competing with FDP's typed-graph thesis at the framework layer.
- **CrewAI** — $18M Series A; 60% of Fortune 500; 44,600+ GitHub stars; native MCP and A2A protocol support; HIPAA/SOC2 enterprise tier.

The strategic implication: **FDP cannot win as a horizontal "typed graph for agents" platform against LangGraph/CrewAI/Anthropic Skills.** That ground is taken. FDP must be a **deep vertical play with a domain-ontology and capability-protocol moat** that incumbents in that vertical *do not* offer well — and it must be defensible against the incumbent in that vertical adding it.

The most defensible single play is **mid-market and emerging-tier safety-critical engineering** (medtech, automotive Tier 2/3, new-space, defense innovation) where Veeva/IBM/Siemens/Jama are too expensive or too rigid and where GenAI-native authoring is genuinely valued. Secondary play: **AI governance / model risk artifacts** under the new SR 26-02 regime (rescinding SR 11-7 in April 2026) where no incumbent has converged.

The rest of this document defends and qualifies that thesis.

---

## 1. Market sizing and segmentation

### 1.1 Headline TAM figures (annotated)

| Segment | 2024–2025 figure | Projection | Source / caveat |
|---|---|---|---|
| Requirements management tools (narrow) | ~$1.59B (2025) | $1.75B (2026) | Business Research Insights (cited via invensislearning.com) |
| Requirements management software (broad) | $13.77B (2024) | $35.57B (2032), 12.6% CAGR | Credence Research (cited via invensislearning.com) |
| Regulatory Information Management (RIMS) | n/a (pharma 42.6% of share) | rising; eCTD v4.0 mandate driver | Grand View Research |
| Aerospace & defense (whole industry) | $846.94B (2025) | $899.65B (2026), 6.2% CAGR | The Business Research Company. *Tooling slice: <1%* |
| Veeva (proxy for life-sciences vertical SaaS) | $2.747B FY2025 revenue | $3.04–3.06B FY2026 guidance | Veeva 10-K / FY2025 8-K |
| Model risk management technology | $1.65B (2024) | $3.85B (2033) | Articsledge citing industry surveys; verify before quoting |
| AI agent framework category | LangChain $1.25B valuation; $16M ARR; CrewAI $18M Series A | n/a | Sacra, Crunchbase, getlatka |

**Methodology caveat:** the two requirements-management figures differ by a factor of 8×. Business Research Insights counts narrow ALM tooling; Credence Research counts the broader "requirements software" segment including project/QMS adjacencies. For FDP planning purposes the *adjacent-tooling-spend-per-customer* matters more than the broad TAM. Useful per-customer benchmarks below.

### 1.2 Per-customer spend benchmarks (regulated industries)

These are far more actionable than TAMs:

- **Greenlight Guru (medical-device eQMS)** — entry ~$15k/yr, scales rapidly to $50–60k/yr; 2–3 year minimum contract; **price increases of up to +100% reported for 01/2026 ("package separation")**. ~1,000 device companies on platform.
- **MasterControl** — ~4× the cost of Verse-type entry vendors per peer reports; typically used by large medical-device and pharma manufacturers; per-instance configuration heavy.
- **Veeva Vault RIM Suite** — undisclosed per-customer pricing but Veeva ARPC (revenue per customer) ≈ $1.86M/yr (2.747B ÷ 1,477) across all products, with top-20 biopharma customers in the multi-tens-of-millions range.
- **IBM ELM / DOORS Next** — perpetual + subscription hybrids; tier-1 aerospace/defense deals routinely $5M–$50M ACV with services-heavy implementations.
- **Jama Connect** — typical mid-market deal $50k–$500k ACV; G2-leading but more "fit-for-purpose" than ELM's full lifecycle.
- **PTC Codebeamer** — referenced from Volkswagen Group, Medtronic, Veoneer; ACVs typically $250k–$2M.
- **Palantir Foundry/AIP** — well-known $5M–$50M+ deals; commercial growth at 71% YoY in US (2024).
- **LangChain (LangSmith / LangGraph platform)** — closer to per-seat/usage; 1,000 customers, $16M ARR ⇒ ~$16k ARPC, but enterprise tier likely $100k+.

**Implication:** In safety-critical regulated domains, customers already pay $50k–$5M+/yr for tooling that includes a typed data model + traceability. A new entrant must clear the "is the AI-agent uplift worth replacing the system that just got AI-agentified?" bar — which is hard against an incumbent that already owns the data.

### 1.3 Key segment health and AI-driven re-tooling pressure

- **Pharma/life-sciences (RIM, eCTD, SPL):** strong tailwind from eCTD v4.0 mandates (Japan Apr 2026, EU optional Dec 2025, US voluntary since Sep 2024 / mandatory ~2029). Veeva sweeping the segment — top-20 biopharmas standardising on Vault. Roche expanded Vault CRM Nov 2025; Novo Nordisk International committed Jan 2026.
- **Aerospace/defense:** $849.8B FY2025 US DoD budget; "advanced avionics and autonomous systems" 64% of defense spending. ARP4754B (Dec 2023) explicitly mandates traceable typed artifacts and MBSE, a structural tailwind for FDP-style architectures.
- **Medical devices:** EU MDR/IVDR ongoing implementation, FDA SaMD, IEC 62304, ISO 14971 — all require typed artifact graphs in practice. Greenlight Guru ~1,000 customers + Veeva MedTech Quality Suite expanding.
- **Automotive functional safety:** ASPICE 4.0 (Dec 2023) introduced Machine Learning Engineering and Hardware Engineering processes; ISO 26262 + ISO/SAE 21434 + ISO 21448 (SOTIF) form a compounding workload (~250 work products, 60 processes per project per industry sources).
- **Financial model risk:** **major regime change.** SR 11-7 was rescinded Apr 17, 2026 along with OCC 2011-12, FIL-22-2017 and replaced with **SR 26-02** — explicitly principles-driven, risk-tiered, and (per the SR 26-02 letter) "generative AI and agentic AI models are novel and rapidly evolving … not within the scope of this guidance." This *creates* a compliance/governance vacuum that vendors are racing to fill (Databricks, ValidMind, ModelOp, CIMCON, MathWorks Modelscape).

---

## 2. Competitive landscape — depth assessment

This is the core of the deliverable. Vendors are grouped by where they would actually compete with FDP.

### 2.1 Tier 1 — vertical incumbents who already own typed data + are adding agents

These are the most dangerous competitors. They have the data, the trust, and the regulatory relationships. They cannot be displaced head-on.

**Veeva Systems (NYSE: VEEV)**

- *Position:* dominant life-sciences vertical SaaS. FY2025 revenue $2.747B (+16% YoY), 1,477 customers, 47 of top 50 biopharma, 35 of top 50 use Vault across multiple R&D/quality/regulatory/medical/commercial domains. Surpassed $3B run-rate Q1 FY2026.
- *AI move:* Veeva AI (announced Apr 29, 2025; first agents Dec 3, 2025). Vault Object Framework (VOF) is essentially Veeva's typed-primitive system. Agents use Anthropic + Amazon LLMs on Bedrock; customers can extend or build custom agents with industry-specific prompts and safeguards.
- *Strengths:* unmatched data lock-in in pharma; certified validation; regulator relationships; industry-specific ontology (eCTD, SPL, IDMP, GxP).
- *Weaknesses:* expensive; closed ecosystem; "Veeva-only" thinking; limited beyond life sciences.
- *FDP fit:* head-to-head FDP play against Veeva in pharma is **not viable**. Below-tier biotechs and contract research organizations who can't afford Vault are the only realistic FDP wedge in life sciences, and even then Veeva Basics is closing that gap.

**IBM Engineering Lifecycle Management (ELM) — DOORS / DOORS Next / Workflow Management / Rhapsody**

- *Position:* dominant in tier-1 aerospace, defense, automotive systems engineering. Large-deal franchise. Lockheed Martin recently integrated IBM Granite LLMs into its AI Factory (used by 10,000+ Lockheed engineers, late 2024).
- *AI move:* IBM Engineering AI Hub v1.0 GA Oct 14, 2025; v1.2 GA Mar 26, 2026. Agents: Requirements quality analysis, Ask-your-requirements, Work Item synopsis, MBSE use case discovery, Work Item compose. Granite 4.0 + watsonx Orchestrate + Anthropic Claude partnership.
- *Strengths:* DOORS/DOORS Next installed base; tier-1 trust; certification and tooling for DO-178C / ARP4754B / ISO 26262.
- *Weaknesses:* notoriously rigid UI; expensive; slow product velocity; ELM is a brand on a portfolio of acquired tools; AI features limited and "in-tool smart features" rather than agent-orchestrated artifact authoring.
- *FDP fit:* head-to-head in tier-1 aerospace/defense **not viable in 36 months** without channel/SI muscle. **However: tier-2/3 suppliers and new-space companies who reject DOORS Next on cost/agility grounds are a real wedge.**

**Siemens Polarion ALM / PolarionX**

- *Position:* strong in automotive (ISO 26262 / ASPICE), industrial, embedded systems. Volkswagen and other tier-1 auto OEMs.
- *AI move:* AI-driven requirement extraction and mapping (per market reports, no recent specific GA notice surfaced in this research).
- *Strengths:* Siemens portfolio integration (Teamcenter, NX, Capital).
- *Weaknesses:* steep learning curve; complex without Siemens infra (per reqsuite.io review).
- *FDP fit:* automotive Tier-2/3 wedge possible; OEM displacement not.

**PTC Codebeamer (formerly Intland, acquired 2022)**

- *Position:* automotive, medical devices, embedded systems. Volkswagen Group "strategic supplier" relationship; Medtronic customer reference.
- *AI move:* product comparison materials reference AI capabilities; pace less aggressive than Veeva/IBM in 2025.
- *Strengths:* combines RM with built-in risk/test management; ALM platform; strong regulatory templates.
- *Weaknesses:* complex UI; overwhelming for smaller teams.
- *FDP fit:* medium-aggressive challenger possible; PTC's AI move is the variable.

**Jama Connect (Jama Software)**

- *Position:* G2 Grid #1 in requirements management for 6 consecutive quarters (through Summer 2025). Strong mid-market. AWS Marketplace listing Sep 16, 2025.
- *Strengths:* customer satisfaction; live traceability matrix; Jira/Jenkins integration; aerospace and healthcare references.
- *Weaknesses:* expensive for small teams; limited deep customization; relies on adjacent tools; AI roadmap less visible than IBM ELM's.
- *FDP fit:* this is Jama's segment — mid-market regulated. **FDP overlaps directly here** and must either (a) be substantially better at the AI-agent-authoring + capability-protocol surface, or (b) target Jama's lower edge (small biotech / startup defense / new-space) where Jama's pricing is too high. Jama's relative AI maturity gap is probably the best wedge.

**Greenlight Guru (medical-device eQMS)**

- *Position:* ~1,000 medical-device companies; "purpose-built" for medtech (21 CFR 820, ISO 14971, ISO 13485, FDA).
- *AI move:* AI-powered DHF traceability and predictive verifiability checks; "AI-powered" QMS positioning.
- *Strengths:* deep medtech-specific templates and audit alignment; modern UX; SOC 2.
- *Weaknesses:* steep price increases reported (up to +100%) Jan 2026 with no new features ("package separation"); 2–3 year minimum contracts; **data export is not structured/machine-readable, creating high switching cost — and a reputational vulnerability**; complaints about CAPA/NCR module language and lack of configurability.
- *FDP fit:* **best single beachhead opportunity in medtech.** Greenlight Guru's 2026 pricing aggression + closed-data-format complaint + small/mid-market footprint together create the most exploitable opening in any vertical reviewed.

**MasterControl, ETQ, Sparta TrackWise (Honeywell), Veeva Vault Quality**
Mature QMS players in pharma/medical/manufacturing. Implementation heavy; costly. Veeva Vault Quality has the AI advantage. ETQ Reliance is cloud-modern but lighter on AI agents (verify before quoting).

**ArisGlobal LifeSphere + NavaX**
Pharma RIM/Safety. NavaX Agents launched 2025; 100+ new/expanded LifeSphere customers and 34 global go-lives in 2025. Direct Veeva competitor; FDP cannot displace either.

### 2.2 Tier 2 — horizontal "typed graph for agents" platforms

These are the most dangerous structural competitors. They do not own a vertical, but they own *the architecture pattern FDP claims as differentiation*.

**Palantir Foundry + AIP**

- *Position:* the closest architectural analog to FDP that exists in production. **Ontology** = typed object graph; **AIP Logic / Agent Studio** = agent runtime; **Apollo** = governed deployment. AIP Agents now in production, NVIDIA Nemotron integration Oct 2025.
- *Strengths:* governance, lineage, ABAC at object level; defense and healthcare credentials; +71% YoY US commercial growth (2024).
- *Weaknesses:* lock-in concerns; high price; consultative sale; "black box" perception in some commercial deals.
- *FDP fit:* **FDP cannot beat Palantir on capability — only on price, openness, or domain depth.** Palantir is the strongest structural threat to FDP's identity claim. The honest framing: FDP would need to be an open / lighter / domain-specific alternative, not a head-to-head replacement.

**LangChain (LangChain Inc.) — LangChain + LangGraph + LangSmith**

- *Position:* unicorn ($1.25B Oct 2025); ~$16M ARR; 1,000 customers, 163 employees. **LangGraph explicitly markets "shared, typed state object" between agent nodes** — this is structurally what FDP claims as its multi-agent coordination unique value.
- *Strengths:* developer mindshare; LangSmith observability; production at LinkedIn, Uber, Klarna, Replit, 400+ companies; v1.0 GA Oct 2025; integrations everywhere.
- *Weaknesses:* not vertical; not regulator-grade; thin governance/audit story compared to Palantir or Veeva.
- *FDP fit:* **FDP cannot win the horizontal "typed multi-agent state" market.** LangGraph already has it. FDP can only win by adding the things LangGraph lacks: domain-typed primitives (Requirement, Risk, Decision, Evidence, Trace), validation, capability protocol, and regulator-grade provenance.

**CrewAI**

60% of Fortune 500; $18M Series A; 100k+ daily executions; 150+ enterprise customers; 44,600+ GitHub stars; native MCP / A2A; HIPAA/SOC2. Role-based abstraction (researcher/writer/reviewer); not graph-typed; weaker fit for safety-critical artifact authoring. **FDP fit:** complementary, not competitive — CrewAI could plausibly *consume* FDP plugins.

**Microsoft Agent Framework (AutoGen + Semantic Kernel merged Oct 2025; GA Q1 2026)**

Multi-language (C#/Python/Java), Azure-native; production SLAs. Will own the Azure-locked enterprise segment. **FDP fit:** Microsoft will not build domain-typed regulated-industry primitives at this layer; FDP can sit above as a domain ontology layer.

**Anthropic Agent Skills (open standard, agentskills.io, Dec 18, 2025)**

SKILL.md format; progressive disclosure; cross-platform (Claude.ai, Claude Code, Cursor, Gemini CLI, Codex CLI). 17 official skills + thousands of community skills; 277K+ installs of `frontend-design` alone by Mar 2026. *Critical observation:* this is a lightweight rival to FDP's "plugin-defined document type" idea, with a much lower bar to creation and an emerging marketplace effect. **FDP fit: embrace, not compete.** FDP could be packaged as a Skills implementation — a typed-graph + capability-protocol skill — rather than a separate runtime. This dramatically lowers FDP's distribution friction.

**OpenAI Agents SDK + Structured Outputs**

Strict-mode JSON schema (35% → 100% schema compliance per OpenAI internal benchmarks, Aug 2024). OpenAI Assistants API ecosystem. **FDP fit:** primitives, not a competitor — FDP would consume these.

**Pydantic AI / Instructor / BAML / Outlines / Guidance**

Per-call typed I/O; not cross-document graph. **FDP fit:** primitives FDP would build on.

### 2.3 Tier 3 — adjacent, structural

**Knowledge graph + LLM stack:** Neo4j (Knowledge Graph Builder), TigerGraph, Stardog, Ontotext GraphDB. Strong for memory and retrieval; weak for author-time validation and projection. FDP-adjacent but not direct.

**Databricks (post-SR 26-02)** — Unity Catalog as MRM lineage substrate; AutoML + Agent Bricks. Aggressive 2026 push into model-risk management on the back of SR 26-02. Direct competitor for the model-risk play.

**MathWorks Modelscape** — implemented at HSBC Group Risk Analytics; classical-finance-model-management; agent layer thin.

**ValidMind, ModelOp, CIMCON** — model-risk dedicated SaaS; the core competitors for the SR 26-02 governance opportunity.

**DITA CCMS players** — Heretto, easyDITA, Bluestream XDocs, Adobe AEM Guides, Docuvera. Slow ROI (12–18 months typical); authoring friction. FDP should not position against these directly; partnerships possible.

### 2.4 Competitive whitespace map

Two-axis map: **vertical-domain depth** (X) vs. **AI-agent-native authoring + multi-projection capability** (Y).

```
                    HIGH AI/AGENT NATIVE
                            |
                            |
          LangGraph         |              FDP target
          CrewAI            |              (open, vertical,
          Anthropic Skills  |               regulator-grade,
                            |               agent-authored)
                            |
                            |       Palantir AIP + Foundry
                            |       (closed, generic,
                            |        regulator-grade)
                            |
        ----------------------------------|-------------- HIGH
                            |             VERTICAL DEPTH
                            |
                            |       Veeva AI (life sciences)
                            |       IBM AI Hub (engineering)
                            |       Greenlight Guru AI
                            |       PTC/Siemens AI features
                            |       (closed, vertical,
                            |        bolt-on agents)
                            |
                            |
        Pydantic AI         |       DOORS Next (no AI Hub)
        Instructor/BAML     |       Polarion (no agents)
        (typed but per-call)|       MasterControl (limited AI)
                            |
                    LOW AI/AGENT NATIVE
```

The empty quadrant FDP is targeting is the **upper-right open corner** — vertical-deep + agent-native + open + regulator-grade. The closest occupant is **Palantir AIP** (closed, generic) and the most direct vertical occupants (Veeva AI, IBM AI Hub) are closed and incumbent-locked.

The thesis works *if and only if* "open + agent-native + regulator-grade + vertical-deep" is a position customers value enough to switch from incumbents. This is the load-bearing assumption. It is plausible but unproven.

---

## 3. Buyer personas, procurement, named accounts

### 3.1 Personas by segment

| Segment | Economic buyer | Technical evaluator | Trigger |
|---|---|---|---|
| Aerospace tier-1 | VP Engineering / Chief Engineer / VP Safety | Systems Engineering, Safety Engineering, IT&D | New program kickoff, certification finding, cost-out program |
| Aerospace tier-2/3 + new-space | Head of Engineering / CTO | Lead Systems Engineer, lead software engineer | DOORS replacement, FAA/EASA finding, fundraise milestone |
| Medical device — large | VP Quality / VP Regulatory / Chief Medical Officer | Quality Engineering, Regulatory Operations | EU MDR audit, FDA Form 483, M&A integration |
| Medical device — startup/SMB | CEO/COO + Head of QA | one or two QA/RA engineers | First 510(k), CE Mark, Series A diligence |
| Pharma — top-50 | Head of Regulatory Affairs / Head of Quality | Reg Ops, Quality Systems, MLR teams | eCTD v4.0 mandate, GxP audit, AI-Act compliance |
| Pharma — emerging biotech | VP Regulatory / Head of Quality | Reg Ops contractor pool | First IND/CTA, FDA pre-submission |
| Automotive — OEM | Functional Safety Manager / VP Software | ASPICE assessor, ISO 26262 lead | Certification milestone, supplier finding, SDV initiative |
| Banks (post-SR 26-02) | Chief Risk Officer / Head of Model Risk | Model risk validators, model owners | SR 26-02 readiness, ECB/PRA exam, GenAI rollout |

### 3.2 Top 20 named accounts (ranked by FDP fit, not size)

Reasoning: rank reflects (a) public signals of structured-content/agent investment, (b) likely incumbent unhappiness, (c) deal-size potential, (d) reachability for a new entrant.

1. **Anduril** — defense/new-space; software-first; explicitly hostile to legacy DOORS/Polarion stacks; AI-native culture. Best top-of-funnel candidate.
2. **Shield AI** — same profile.
3. **SpaceX** — known for in-house tooling; would only adopt if FDP is a *substrate* they extend. Hard to sell to but symbolic.
4. **Relativity Space, Rocket Lab** — new-space tier; smaller than SpaceX; more reachable.
5. **Joby Aviation, Archer Aviation** — eVTOL OEMs; need ARP4754B + DO-178C compliance fast; price-sensitive vs. tier-1 stack.
6. **Tempus AI** (medtech AI) — SaMD; clinical AI; structured-evidence-heavy.
7. **GRAIL** — multi-cancer early detection; FDA-regulated; structured-evidence and traceability heavy.
8. **Color Health** — population genomics; clinical decision support.
9. **Veracyte** — molecular diagnostics; FDA + CLIA.
10. **Insulet, Dexcom** — connected medical devices; software-defined; modern stacks.
11. **Moderna, BioNTech, Regeneron** — Veeva customers but heavy AI investment; potential for FDP as *complement* (e.g., model-risk for AI-regulated submissions, see SR 26-02 / EU AI Act).
12. **Mobileye, Aurora, Zoox, Waymo, Cruise** — AV stacks need ISO 26262 + ISO 21448 (SOTIF) + ISO/SAE 21434 evidence at agent-author scale.
13. **Rivian, Lucid, Polestar** — modern EV OEMs; less locked into Polarion than VW/Toyota/BMW.
14. **GE Aerospace, Honeywell Aerospace, Collins Aerospace** — IBM ELM customers but with massive regulatory authoring bottlenecks; FDP could be a "right-side of the V" agent layer.
15. **Lockheed Martin** — already running IBM Granite + AI Factory across 10,000+ engineers; high openness to AI substrates but very long sales cycle.
16. **Palantir-adjacent customers in healthcare** (e.g., NHS England partners) — for FDP-as-domain-ontology layered above AIP.
17. **JPMorgan Chase Model Risk** — flagship for SR 26-02 transition; uses Databricks today.
18. **Goldman Sachs Model Risk** — same as above; advanced quant orgs.
19. **HSBC Group Risk Analytics** — already on MathWorks Modelscape; potential expansion.
20. **Bayer Crop Science / Bayer Pharmaceuticals** — Veeva Vault customer; potential for FDP in AI governance / safety case domains beyond Veeva's footprint.

**Caveat:** This list is a working hypothesis built from public signals. Real prioritization should come from a 30-call ICP discovery sprint before pitching anyone.

---

## 4. Strategic plays — viability assessment

Each evaluated for: market size × winnability vs. incumbents × time-to-revenue × defensibility.

| Play | Win viability | Time to first $1M ARR | Defensibility | Verdict |
|---|---|---|---|---|
| A. FDP for Aerospace Requirements (replace DOORS Next) | Low at tier-1, **medium at tier-2/3 + new-space** | 18–30 months | High once anchored | **Pursue tier-2/3 + new-space wedge only** |
| B. FDP for Medical Device Submissions (DHF/ISO14971/IEC62304) | **High at sub-Greenlight-Guru tier and Greenlight refugees** | 9–18 months | High | **Strongest single beachhead** |
| C. FDP for Pharma Regulatory (eCTD/SPL) | Very low — Veeva owns this | n/a | n/a | **Avoid head-on** |
| D. FDP for Financial Model Risk (post-SR 26-02) | Medium — early window before Databricks/ValidMind/ModelOp lock in | 12–24 months | Medium (Databricks threat) | **Pursue as second segment** |
| E. FDP for Automotive Functional Safety | Medium at Tier 2/3 and new-AV; very low at OEM | 18–30 months | Medium | **Defer to v2** |
| F. FDP as Multi-Agent Substrate (LangChain/Crew alternative) | **Very low — LangGraph already wins this** | n/a | Low | **Do not pursue** |
| G. FDP for AI Governance (EU AI Act / NIST AI RMF / ISO 42001 / SR 26-02) | Medium-high — *new* category, no clear incumbent | 12–18 months | Medium-high if standards-anchored | **Pursue as differentiator alongside B or D** |

**Highest-leverage strategic move (recommendation):**

**Anchor on Play B (medtech wedge against Greenlight Guru) and bolt on Play G (AI governance artifacts) as a horizontal cross-sell.** Reasoning:

- B has a concrete distressed buyer pool (Greenlight Guru's January 2026 pricing event + closed-data-export complaint).
- G is a regulator-driven greenfield with no entrenched incumbent and growing budget.
- Both share the same FDP primitives (Requirement, Risk, Mitigation, Evidence, Decision, Verification) — minimal product divergence.
- Both align with the "agent-authored typed artifact graph + capability protocol" thesis.
- Both have customers who are already paying $50k–$500k/yr for tooling, so the willingness-to-pay exists.

**Anti-recommendation:** Do **not** pursue F. The horizontal multi-agent typed-state market is taken by LangGraph + CrewAI + Anthropic Skills + Microsoft Agent Framework. FDP would be the seventh entrant.

---

## 5. Pricing and business model

| Model | Comparable | Realistic FDP ACV (Year 1) | Notes |
|---|---|---|---|
| Per-seat enterprise SaaS | Greenlight Guru, Jama, Veeva | $25k–$150k SMB; $250k–$1M mid-market | Most digestible for regulated buyers |
| Platform + plugins | Atlassian, Anthropic Skills | $50k platform + $10–50k per plugin | Aligns with FDP architecture; needs marketplace |
| Usage-based | OpenAI, Anthropic API | $0.x–$5/agent-call + $0.0x/validation | Risky in regulated buyers — they want predictable budgets |
| Open-core + commercial support | Neo4j, Confluent, Pydantic | $0 open; $50k–$500k enterprise | Strong distribution; supports Anthropic-Skills strategy |
| Verticalized stack | Palantir, Veeva | $1M–$10M ACV | Requires services muscle FDP doesn't have early |
| White-label OEM | Embed in Jama, Codebeamer, ValidMind | Low ACV but high reach | Worth one or two pilot OEM deals |

**Recommended initial model:** **Open-core (Apache 2.0 plugin SDK + reference primitives) + commercial enterprise tier with regulator-grade governance, audit, and validated cloud, priced $75k–$300k ACV** for the medtech wedge. This is below Greenlight Guru's 2026 step-up, well below Veeva, and gives a credible "we will not lock your data in a proprietary format" counter-message that Greenlight Guru cannot match.

---

## 6. Channel and partnership strategy

**Tier-1 partnerships (months 0–12):**

- One Big-4 advisory practice in **medtech regulatory** (Deloitte Life Sciences, EY Health, PwC Health, KPMG Healthcare). Goal: 3 named-customer pilots in 6 months.
- One systems integrator with FDA validation experience (e.g., USDM Life Sciences, ProSymmetry) for implementation.
- One notified body or test lab relationship (BSI, TÜV SÜD, NSAI) to get the artifact format reviewed for audit-readiness — *this is a powerful trust signal*.

**Tier-2 partnerships (months 6–18):**

- Anthropic Skills / Claude Developer Platform — release FDP primitives as official skills with Anthropic co-marketing.
- Databricks — for the model-risk play, integrate FDP artifact graphs into Unity Catalog lineage.
- AWS Marketplace — Jama-style listing for procurement frictionlessness; AWS Healthcare/Life Sciences and AWS Aerospace programs.
- Hyperscaler regulated-industry programs: AWS for Health, Azure for Industry, Google Cloud for Healthcare.

**Standards bodies (months 12–24):**

- Engage with OASIS DITA, HL7 SPL, CDISC, SAE/RTCA (ARP4754B / DO-178C), AAMI (medical), ASTM (additive manufacturing) — not to *create* a standard but to ensure FDP primitives map cleanly into existing artifact formats. This is essential for regulator credibility.

---

## 7. Risk register and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Veeva extends Vault Quality / Vault MedTech to capture medtech SMB | High | Win speed; openness; price; lock customers via Anthropic-Skills distribution before Veeva extends downward |
| Anthropic Skills marketplace becomes the de facto plugin distribution channel | High | **Embrace** — release FDP primitives as official Anthropic Skills from day one |
| LangChain ships a "domain ontologies" feature in LangGraph | Medium | Beat them to depth in one specific vertical; standards-body alignment |
| Palantir AIP wins the entire vertical-typed-graph category | Medium | Position as open / lower-cost / vertical-specific; don't compete head-on |
| Regulator skeptical of AI-authored artifacts | Medium | Notified-body engagement; provenance/audit/sign-off as first-class; position FDP as making AI artifacts *safer*, not riskier |
| SR 26-02 settles quickly with Databricks/ValidMind dominance | Medium | Move within 6 months; lead with model-risk customer win |
| Format-tax / reasoning degradation when authoring directly in primitives | Medium | Architect as "free-form reasoning → projection into primitives" rather than direct typed authoring |
| Greenlight Guru reverses pricing increases | Low | Wedge story is bigger than pricing — also data lock-in and AI capability gap |
| Long regulated sales cycles burn cash | High | Open-source distribution + freemium + Anthropic Skills ecosystem to keep CAC low |
| FDP is reduced to a thin wrapper over Anthropic Skills | Medium | Differentiate with **cross-document graph** + **capability protocol** + **regulator-grade provenance/validation** — none of which Skills provide |

---

## 8. Recommended GTM sequencing (12 / 24 / 36 months)

**Months 0–6:** wedge product = **medtech eQMS-grade typed-artifact graph** with primitives covering ISO 14971 risk, IEC 62304 software lifecycle, 21 CFR 820 design controls. Open-core SDK + Anthropic Skills release. Early-design-partner cohort: 5–10 small/mid medical-device companies, mostly Greenlight Guru refugees and pre-Greenlight startups.

**Months 6–12:** first $1M ARR target. Add validators that map artifacts onto **EU MDR Annex II technical documentation**, **FDA SaMD Pre-Submission templates**, and an MLR-style review skill. Notified-body co-validation pilot. First case study (probably an EU MDR submission cycle).

**Months 12–18:** second segment = **AI governance artifacts** (model risk under SR 26-02; ISO 42001 AIMS; EU AI Act Annex III high-risk-AI documentation). Reuse the same primitives with finance-domain-specific plugin. Target: 2 banks + 3 medtech AI/SaMD customers.

**Months 18–24:** third segment = **automotive functional safety SMB** (Tier 3, AV startups). Same primitives + ISO 26262 / ASPICE plugins.

**Months 24–36:** depending on signal — either expand into aerospace tier-2/3 or deepen the existing two segments. Announce a $20–40M Series B if traction is real.

**12-month milestones (binary):**

- ≥10 paying customers
- ≥$1M ARR
- One notified-body sign-off or co-marketing
- One published peer-reviewed or regulator-recognized validation study

If any of these fail to land, the product-market-fit hypothesis needs to be revisited — likely by switching the wedge segment.

**Capital requirement (rough):** $8–15M seed + Series A combined to reach Month-24 milestones. This is well within the AI-infra fundraising environment that produced LangChain's $260M total raise and CrewAI's $18M Series A.

---

## 9. Honest limits of this analysis

- The competitor moves between Q4 2025 and Q2 2026 are happening fast enough that several specific feature claims may already be stale by the time this is read. Re-verify Veeva AI agent rollout dates, IBM Engineering AI Hub roadmap, and Anthropic Skills marketplace velocity before pitching.
- The "Greenlight Guru pricing crisis" angle relies on a single source (OpenRegulatory) and customer reports; talk to actual Greenlight customers before betting a wedge on it.
- The aerospace tier-1 dismissal is structural, but *individual* programs (e.g., a new Lockheed F-X variant or a Boeing recovery program) might create unusual openings — a special-situations sales motion could be high-leverage despite low base rate.
- The SR 26-02 read assumes the April 2026 rescission will *not* be reversed and that the EU AI Act and ISO 42001 will continue to drive AI-governance budget. Both assumptions are reasonable but watch for political turbulence.
- "Anthropic Skills as distribution channel" is a strategic bet on Claude's continued central role in the agent ecosystem. If OpenAI or Google decisively recapture mindshare in 2026, the recommendation needs to update — but the same pattern (release primitives as the dominant platform's plugin format) should still apply, just with a different host.
- I have not done diligence on FDP's own engineering team capacity, founder profile, or capital position. The recommendations assume a competent technical founding team with credible ability to ship a regulated SaaS within 12 months. If that's missing, *narrow further* — pick *one* primitive plugin (e.g., ISO 14971 risk) and ship that as a standalone Anthropic Skill before committing to the platform vision.

---

## Appendix A — sources consulted

- Anthropic. "Equipping agents for the real world with Agent Skills." Engineering blog. Dec 2025.
- AWS Labs / Amazon. CODESTRUCT (arXiv 2604.05407).
- Business Research Insights. "Aerospace and Defense Market" (2025).
- Coherent Market Insights. "Aerospace and Defense Market Share & Opportunities 2026-2033."
- Credence Research, via invensislearning.com. "11 Best Requirements Management Tools for 2026."
- Crunchbase. "LangChain Company Profile & Funding."
- Databricks Blog. "Model Risk Management in 2026: A Banker's Guide to the Revised Interagency Guidance." Apr 2026.
- Federal Reserve Board. SR 26-02 "Revised Guidance on Model Risk Management." Apr 17, 2026.
- Federal Reserve Board. SR 11-7 "Guidance on Model Risk Management." Apr 4, 2011 (rescinded Apr 17, 2026).
- Grand View Research. "Regulatory Information Management System Market" (2025).
- IBM. "Introducing IBM Engineering AI Hub v1.0." Oct 2025; v1.2 release notes Feb–Mar 2026.
- IBM. "Lockheed Martin Adds IBM Granite to its Suite of Next-Generation AI Factory Tools." Dec 2024.
- inflectra.com. "Best Requirements Management Tools for 2025."
- jamasoftware.com. SoftwareReviews / G2 reports, Aug–Sep 2025.
- Latenode / Sacra / texau. LangChain funding history.
- Medium / agent-kits.com / nxcode.io / redwerk.com. "AI Agent Framework Landscape" 2025–2026 reviews.
- OpenRegulatory. "Greenlight Guru Price: Crazy increase (12/2025 update)." Dec 15, 2025.
- Palantir. AIP, Foundry, Apollo product docs and Oct 2025 announcements.
- PTC. Codebeamer product comparison materials and customer references.
- ptc.com. "ASPICE 101: What is Automotive SPICE?" 2025.
- reqsuite.io. "Requirements Management Tools 2026: A Comparison for Medium Sized Product Developers."
- riskpublishing.com. "Model Risk Management: SR 11-7 Guidance and Validation Framework." 2025–2026.
- ValidMind. "How Model Risk Management Teams Comply with SR 11-7." Oct 2025.
- Veeva Systems. FY2025 10-K, Q4 FY2025 8-K, Q1 FY2026 results, "Announcing Veeva AI" (Apr 29, 2025), "Veeva AI Agents to Be Released" (Oct 14, 2025), "Veeva AI Agents Now Available" (Dec 3, 2025).

(References are reproduced as encountered in current search results; a few may carry pre-print or vendor-attributed claims that should be re-verified before being relied on.)