# plan-dnis-implementation — Agent Board

> Profile: `profile:planning:0.1` v0.1.0. 16 tasks. Generated at 2026-05-04T19:02:41.620Z.

## 🎯 Available to claim

_No tasks available. Either every Ready task is claimed (and within its lease) or there are no Ready tasks._

---

## 👤 actor:Bot:Builder

### In_review (12)

- `task:contract-audit` _(Either/P0)_ — Translate DNIS into an executable contract matrix: exact Level 1 scope, Level 2 additions, explicit non-goals, and the proof mapping from TV-1..TV-6 to code and docs.
- `task:data-model` _(Either/P0)_ — Implement the DNIS Document, Node, Operation union, and OperationResult persistence shape with the readonly and branded-field invariants preserved at runtime.
- `task:position-engine` _(Either/P0)_ — Implement fractional-position generation plus compaction semantics so inserts/moves stay local and compact rebalances without revision churn.
- `task:operation-core` _(Either/P0)_ — Implement create, edit, and move with the exact DNIS preconditions, postconditions, identity rules, and atomicity guarantees.
- `task:operation-lineage` _(Either/P0)_ — Implement split, merge, and retire with lineage recording, retired-node resolution compatibility, and atomic multi-node mutation semantics.
- `task:compact-operation` _(Either/P0)_ — Implement compact as a first-class operation that rebalances positions without bumping per-node revision or mutating audit fields.
- `task:idempotency-log` _(Either/P0)_ — Persist the OperationId to OperationResult map atomically with state mutation, including snapshot-on-first-apply retry semantics and payload mismatch handling.
- `task:hashing-canonicalization` _(Either/P0)_ — Implement document-wide hashAlgorithm selection, algo:hex encoding, and deterministic canonicalization for JSON content at minimum.
- `task:reference-resolution` _(Either/P0)_ — Implement the five-outcome resolver for active, retired, evolved-via-lineage, purged, and not-found, including transitive lineage walk.
- `task:tv-l1-harness` _(Either/P0)_ — Encode TV-1, TV-2, TV-3, TV-4, and TV-6 as executable tests, including retry snapshot behavior, split lineage, move locality, and compact audit semantics.
- `task:level2-concurrency` _(Either/P1)_ — Add Level 2 optimistic-concurrency enforcement: expectedRevision on single-target operations and Mode A expectedRevisions for merge.
- `task:tv-l2-harness` _(Either/P1)_ — Encode TV-5 as executable concurrency proof: stale writes reject cleanly, merge Mode A checks per-target revisions, and stale attempts do not mutate state.

### Backlog (2)

- `task:security-privacy-boundary` _(Either/P1)_ — Document and enforce the real trust boundary: agent auth is external, purge is operator-gated, timestamp authority is server-side, and NIDs are never treated as secrets.
- `task:spec-feedback-loop` _(Either/P1)_ — Feed implementation evidence back into DNIS: mark what is now proven, tighten any ambiguous clauses discovered during coding, and keep Level 3 explicitly deferred rather than implied.

## 👤 actor:Person:Maintainer

### Backlog (2)

- `task:level3-profile` _(Human/P3)_ — Separate design track for a future CRDT-backed Level 3 profile. No implementation claim is allowed until §10.3 becomes normative.
- `task:rollout-review` _(Human/P1)_ — Human review of the Level 1/2 proof surface, unresolved open questions, and whether the repo should actually ship a reference implementation or keep DNIS as spec-only.
