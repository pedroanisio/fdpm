# RE-CRT

`profile:re-crt:6.2` — the RE-CRT protocol's artifact layer: a typed reason
DAG, its dual obstruction DAG, the claims and theorem registries, the v6.2
evidence layer, and the §4.9 open-leaf triage.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Where it comes from

The source is an OWL 2 DL + SHACL ontology, `re-crt.ttl`, published at
`w3id.org/re-crt` and versioned `6.2-owl-shacl`. That file is itself a
two-layer design: OWL states what it can, and SHACL closes what OWL 2 DL
provably cannot — acyclicity (transitive + irreflexive is forbidden in DL),
closed-world cardinality, and the type/β invariant.

This plugin makes the same split one layer down. The profile states the
artifact shape; validators close what a field constraint cannot see.

## What the move buys

Three things are stronger here than in the ontology, and they are the reason
the mapping was worth making.

**The duality maps gain endpoint typing.** In the `.ttl`,
`explainedByBarrier` (δ) has none. `rdfs:range` is an entailment obligation,
not a constraint, and the ontology's own validation protocol runs without
inference — so `leaf explainedByBarrier <a bypass>`, and even
`explainedByBarrier <a proof node>`, validates there. The failure is silent
and directional: a δ edge that misses an active barrier makes the leaf
classify as *unblocked* — "most promising target" — when the data meant it
blocked. Here the host rejects the edge at error level with
`core:relation:target-type`.

**Support homogeneity stops being a check.** `SupportHomogeneityShape`
forbids a support edge crossing node kinds. Declared as two relation types —
`recrt:ProofSupports` and `recrt:ObstructionSupports` — a cross-kind edge is
unrepresentable rather than merely invalid.

**The §4.9 triage runs.** In OWL the classification is defined through
`recrt:UndefeatedActiveBarrier`, an `owl:complementOf`. "No bypass defeats
this barrier" is not provable under the open-world assumption, so on open data
the triage derives nothing: a leaf reaches the helper class `BlockedOpen` and
stops. A workbook is a closed graph, so the question is decidable by
iteration. `triage.ts` computes Dung's grounded labelling directly.

Reinstatement is **universal**, per the ontology's own 6.0 correction: a leaf
is bypassed only when *every* barrier explaining it is defeated. The
existential reading (5.0) called a leaf bypassed when one of its two barriers
fell, which sends a reader at a leaf that is still firmly blocked.

## Types

| Kind | Types |
|---|---|
| Graph | `recrt:ProofNode`, `recrt:ObstructionNode`, `recrt:ReasonDAG`, `recrt:ObstructionDAG` |
| Calculus | `recrt:Rule`, `recrt:RuleBasis`, `recrt:SideCondition` |
| Registries | `recrt:Claim`, `recrt:Theorem`, `recrt:EvidenceBundle` |

Fifteen relation types, including the duality maps `recrt:ExplainedByBarrier`
(δ) and `recrt:BypassTargets` (δ⊥), and the attack relation
`recrt:BypassDefeatsBarrier`.

## Validation

Errors — decidable from the instance or the edge being written:

| Rule | Closes |
|---|---|
| `recrt:val.support-acyclic` | §1.2 D4. OWL 2 DL cannot state it at all. |
| `recrt:val.type-beta` | barrier ⇒ β=1, bypass ⇒ β=0, conditional_barrier ⇒ β strictly between. |
| `recrt:val.defeat-bipartite` | Only (open_)bypass attacks; only (conditional_)barriers are attacked. Endpoint typing cannot express it — both ends are `recrt:ObstructionNode` and the distinction is a field value. |
| `recrt:val.leaf` | V7: open and assumption nodes are leaves; an assumption carries no rule. |

Warnings — **workbook-completeness** rules:

| Rule | Closes |
|---|---|
| `recrt:val.dag-membership` | Exactly one DAG membership. |
| `recrt:val.derived-premise` | V5: a derived node has a premise and a rule. |
| `recrt:val.evidence-gate` | v6.2: `cas_checked` / `proof_witnessed` must cite an `EvidenceBundle`. |

These warn rather than block, and the reason is structural: SHACL validates a
**finished** graph, FDPM validates **every write**. None of the three can hold
at the instant a node is created, because the relation that would satisfy them
cannot exist before the node it points at. Raised as errors they would make
the profile unusable — no node could ever be written. The constraint is not
weaker; the moment it can be decided is later, and `fdpm validate` is where it
is conclusive.

## The evidence layer

`recrt:EvidenceBundle` is a receipt, not an attestation. Identity is
`manifest_root`: a Merkle root over **file contents** — sorted `sha256  path`
lines, hashed — and deliberately not a digest of an archive, because tar
embeds mtimes, uids and traversal order, so an untouched-content repack
changes an archive digest and a check that fires on nothing gets switched off.

It establishes **integrity** (the evidence has not changed since the claim)
and **completeness** (the claim names what it depended on). It does **not**
establish correctness — a bundle hashes perfectly around a wrong solver — and
a self-reported hash beside its own bundle deters drift and accident, not a
forger, who would recompute it.

## What does not map

Exactly what does not map into OWL either: the tensor encoding Θ and its
operations, weighted-resolution arithmetic (σ, σ*, β propagation), REPLAY /
E(v), the categorical semantics, and the nine theorems. Those are metatheory
and algorithms. `recrt:Claim` and `recrt:Theorem` record them as data, which
is all either mapping ever did.

Also absent, and worth stating: FDPM has no description-logic reasoner, so
`owl:equivalentClass` definitions have no analogue. Per the triage note above,
that costs nothing here — but a future axiom that genuinely wants entailment
has nowhere to go.

## Rendering

`recrt:TriageRenderer` (`text/markdown`) reports the open leaves grouped by
status, with the barriers explaining each one.

```bash
fdpm render <workbook> text/markdown --renderer-id recrt:TriageRenderer
```

---

Up: [../../README.md](../../README.md)
