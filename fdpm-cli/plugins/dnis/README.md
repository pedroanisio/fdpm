---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.dnis` — Document Node Identity

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

The smallest plugin in the tree, and the one the most other plugins depend
on. It registers the vocabulary for **identity-stable, position-ordered
document nodes** — the contract that lets a section keep its identity across
a move, a split or a merge, instead of being re-identified by its number.

| Property | Value |
|---|---|
| Plugin id | `fdpm.dnis` |
| Version | `0.1.0` |
| Profile | `profile:dnis:0.1` |
| Host compatibility | `>=1.2,<2` |
| Primitive types | 2 — `dnis:Document`, `dnis:Node` |
| Relation types | 2 — `dnis:DerivedFrom`, `dnis:MigratedFrom` |

Normative source: **SPEC-CORE §5.6**, which adopts SPEC-DNIS as an extension
of §5 (The Instance Model). See
[`docs/specs/SPEC-DNIS.md`](../../../docs/specs/SPEC-DNIS.md) and
[`docs/specs/SPEC-CORE.md`](../../../docs/specs/SPEC-CORE.md).

## Why identity is not the section number

A section number is a *position*, and positions change. Numbering a node
`3.2.1` and treating that string as its identity means every insertion above
it silently renames a different node — references break without any operation
having touched them.

DNIS separates the two. A `dnis:Node` carries an opaque uid for identity and a
**position** for order; renumbering is a re-render, not a mutation of
identity. `dnis:DerivedFrom` and `dnis:MigratedFrom` record where a node came
from when it *is* legitimately replaced, so a split or merge leaves a trail
rather than a gap.

## Runtime adapter

The plugin contributes vocabulary only. The behaviour lives in
`src/core/dnis/adapter.ts` (`DnisHostAdapter`), which routes SPEC-DNIS
`Operation`s through the ordinary `Host` primitive/relation APIs and returns
an `OperationResult` drawn from the SPEC-CORE operation log, per §5.6.3.

That split is deliberate and is the reason this plugin adds no write path:
**plugins contribute vocabulary and judges, never new ways to mutate the
ledger.** A batch of DNIS operations becomes 1..n core operations sharing one
`causation_op_id`.

## Composition

`profile:dnis:0.1` is designed to be extended, not used alone. Three
composition profiles in this tree pair it with a domain vocabulary so one
workbook can hold both typed domain primitives and a node tree:

- [`spec_authoring_dnis`](../spec_authoring_dnis/) — `profile:spec-authoring-dnis:0.1`
- [`document_plan_dnis`](../document_plan_dnis/) — `profile:document-plan-dnis:3.1`
- [`formal_specification_dnis`](../formal_specification_dnis/) — `profile:formal-specification-dnis:0.1`

## Source layout

```
dnis/
├── fdpm-plugin.json   manifest
├── index.ts           activate(): registers the profile
├── primitives.ts      dnis:Document, dnis:Node
├── relations.ts       dnis:DerivedFrom, dnis:MigratedFrom
├── categories.ts      conceptual buckets
├── scopes.ts          uniqueness scopes
└── _common.ts         shared field builders
```

## Tests

DNIS behaviour is exercised through the adapter and its consumers rather than
in isolation — see `tests/` for the DNIS adapter suite and the
`build-spec-*.ts` determinism gate, which round-trips real section trees.

---

← [Repository README](../../../README.md) · [Plugin index](../)
