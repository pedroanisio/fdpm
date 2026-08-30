---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code"
  date: "2026-08-30"
---

# `fdpm.agent-memory`

The **agent-memory v2** contract as an FDPM domain profile: episode-scoped
memory for an autonomous agent — facts with provenance, hypotheses that owe
live evidence, the actions that produced them and the decisions derived from
them. A claim is never overwritten. It is superseded by a later one, and the
chain of replacements is the account of how it changed.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Up: [repository README](../../../README.md) · [plugin index](../)

---

## ARCHITECTURAL REQUIREMENT

```
ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
Absence of output verification is a design defect, not a runtime bug.
All LLM output must be treated as untrusted and validated explicitly.
```

A memory store is a document an agent writes about its own run, which makes
every record in it model output. The contract this profile imports exists
because of that, and the import keeps the property: nothing here trusts a
proposed write. What the host can check it checks from the type definitions;
what the host cannot, [`validators.ts`](./validators.ts) checks on every
write; and what neither can reach is named under
[Limits](#limits-stated-not-implied) rather than left for a reader to find.

---

## Identity

| | |
|---|---|
| Plugin id | `fdpm.agent-memory` |
| Profile id | `profile:agent-memory:2.0` |
| Profile version | `2.0.0` |
| Derived from contract | `2.0.0` |
| Host compatibility | `>=1.1,<2` |
| Primitive types | 6 |
| Relation types | 6 |
| Validator registrations | 19 |

---

## The model

Six primitives, partitioned by episode:

| Type | Category | What it holds |
|---|---|---|
| `am:Episode` | Partition | One bounded run: skill, objective, status, start, step horizon |
| `am:Fact` | Observation | A claim, its provenance, and the step it was observed at |
| `am:Hypothesis` | Reasoning | A claim under test, and the step it was settled at |
| `am:Artifact` | Observation | A file the run read, wrote or referred to |
| `am:Action` | Observation | Something the agent ran, and how it came out |
| `am:Decision` | Reasoning | A choice, and why |

Six edges:

| Relation | Shape | Meaning |
|---|---|---|
| `am:EpisodeHolds` | `Episode → {Fact, Hypothesis, Artifact, Action, Decision}` | The partition. Exactly one per held instance |
| `am:SupersededBy` | `Fact → Fact` | **Source is superseded BY target.** At most one leaves any fact |
| `am:Supports` | `Fact → Hypothesis` | Evidence for |
| `am:Refutes` | `Fact → Hypothesis` | Evidence against |
| `am:Produced` | `Action → Fact` | Provenance |
| `am:DerivedFrom` | `Decision → Fact` | What a choice rested on |

`am:Episode` is the profile's `is_partition_unit`. That is a claim the graph
makes good on rather than a label: no relation may cross an episode, so a
workbook split along episodes cannot sever an edge.

---

## How the import differs from the contract

Three decisions, each argued at the file where it lands.

**The discriminated union became six types, not one.**
([`primitives.ts`](./primitives.ts) RULE 1.) The contract models instances as
one union discriminated on `kind`. Flattening it into a single FDPM type would
have made eleven of fifteen fields optional and pushed every arm rule into a
validator. The union is the instance here, so the host's own required-field
and enum checks do the work. This is the opposite trade from
[`loop_forward`](../loop_forward/), whose unions sit in *field* position and
cannot be lifted.

**`episode_id` became an edge.** (RULE 2.) The contract carries it as a string
on every non-episode kind and then spends three semantic rules checking it.
As `am:EpisodeHolds`, two of those rules are the host's endpoint checks —
enforced per write — and the third becomes computable from the graph.

**The `superseded` boolean is gone.** (RULE 3.) The contract stores it and
then enforces a biconditional: the flag is true exactly when a supersession
edge leaves the fact. That redundancy exists because the contract's store is a
flat document with no index. Here the edge *is* the index, and carrying both
would need policing that no write order can satisfy — setting the flag and
drawing the edge are two writes, and whichever lands first violates the
biconditional. Liveness is read off the graph instead. Nothing is lost: a
contract store where the two disagree is one the contract already rejects.

---

## Where each contract rule went

| Contract rule | Enforced by |
|---|---|
| Id names the kind | `id_format` on each primitive type |
| Required fields, closed enums, non-negative steps | The host, from the `PrimitiveTypeDef`s |
| A relation starts/ends at the right kind | `source_types` / `target_types` on each `RelationTypeDef` |
| An endpoint must exist | The host, per write |
| One episode owns each instance | `am:val:episode-partition` |
| A relation may not cross episodes | `am:val:episode-partition` |
| A fact may not be superseded by itself | `am:val:supersede-shape` |
| At most one replacement per fact | `am:val:supersede-shape` |
| The chain may not be cyclic | `am:val:supersede-shape` |
| A replacement is observed strictly later | `am:val:supersede-shape` |
| Confirmed needs a live supporting fact | `am:val:evidence` |
| Refuted needs a refuting fact | `am:val:evidence` |
| A settled hypothesis records its test step | `am:val:evidence` |
| A settled episode accepts no writes | `am:val:episode-writable` |

Nothing the host already checks is restated in a validator: two findings for
one defect is worse than one.

---

## Write order

**Attach, then relate.** `am:val:episode-partition` refuses an edge whose
endpoints are not yet held by an episode, because an edge outside the
partition cannot be placed in it. In a batch, order the operations:

1. `am:Episode`
2. the held primitives
3. their `am:EpisodeHolds` edges
4. every other edge

This is a real constraint on `fdpm.primitive.create_batch` /
`fdpm.relation.create_batch`, not an accident of the implementation.

---

## Limits, stated not implied

- **Reopening a settled episode is not refused.** A validator sees the
  instance being written, never the one it replaces, so `complete → active`
  is indistinguishable here from an episode created active. The source
  contract caught this by comparing against stored state — a host capability
  this profile does not have. Closing an episode works; reopening one is not
  blocked.
- **No bounded merge operator.** The contract's 64-operation, all-or-nothing
  patch ceiling is a property of *its* write path. FDPM's write path is the
  host's, and its own batch bounds apply instead.
- **No retrieval surface.** The profile stores and constrains memory; it does
  not rank, embed or search it. Reads go through the host's ordinary
  primitive and relation queries.
- **No memory tiering and no valid-time axis.** Steps are transaction-time
  positions within an episode, not wall-clock intervals, so "what was true
  when X happened" is not answerable from this model.
- **Provenance is not self-checking.** [`schemas/agent-memory.ts`](./schemas/agent-memory.ts)
  is copied from a contract that lives in **another repository**, so
  `scripts/vendor-agent-memory.ts --check` runs only where that repository is
  present. [`generated/schema-hash.json`](./generated/schema-hash.json)
  records what was copied and when — it is evidence, not a guarantee that the
  copy is current.

---

## Layout

| File | What it owns |
|---|---|
| [`ids.ts`](./ids.ts) | Type ids, relation ids, categories, closed vocabularies, rule ids |
| [`primitives.ts`](./primitives.ts) | The six primitive types, and the three import decisions |
| [`relations.ts`](./relations.ts) | The six edges, and why direction is the contract |
| [`validators.ts`](./validators.ts) | The rules a per-field schema cannot express |
| [`index.ts`](./index.ts) | The `DomainProfile` and `activate` |
| [`schemas/`](./schemas/) | The vendored contract, verbatim but for one import rewrite |
| [`scripts/vendor-agent-memory.ts`](./scripts/vendor-agent-memory.ts) | Re-vendor, or `--check` for drift |

Tests: [`tests/plugins/agent_memory/`](../../tests/plugins/agent_memory/).
Every rule is fed the malformed graph it exists to reject, and the last block
writes through a real `Host` — a validator that only ever runs from a unit
test has never been shown to be reachable.

---

## A note on the host change this profile required

`ValidationPipeline.runRelation` dispatched **no** custom validators and took
no validator context, so `cap:validator` on a relation type could be declared
and could never fire. No plugin in the tree had registered one, so nothing
failed. Four of this profile's rules are relation-level, so the gap was fixed
rather than worked around: `runRelation` gained the same Step-6 dispatch,
exception barrier and profile scoping the primitive path has, and `Host`
supplies the context at every relation call site. The regression test is
[`tests/relation-custom-validators.test.ts`](../../tests/relation-custom-validators.test.ts),
which is written against the core pipeline and does not depend on this plugin.
