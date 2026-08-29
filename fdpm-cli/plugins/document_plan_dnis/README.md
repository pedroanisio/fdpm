---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.document-plan-dnis` — document-plan × DNIS

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

> **Full documentation for this plugin and its bridge-generated sibling lives
> in [`../document_plan/README.md`](../document_plan/README.md)**, which covers
> both as one system. This page is the summary and the pointers.

| Property | Value |
|---|---|
| Plugin id | `fdpm.document-plan-dnis` |
| Version | `0.1.0` |
| Profile | `profile:document-plan-dnis:3.1` |
| Extends | [`profile:document-plan:3.1`](../document_plan/) + [`profile:dnis:0.1`](../dnis/) |
| Host compatibility | `>=1.2,<2` |
| Relation types | 9 |
| Renderer | `docplan:PlanOutlineRenderer` (`text/markdown`) |
| Validator | `docplan:coherence.comparative-claim-without-baseline` |

## What a composition profile is

A composition profile registers **no primitive types of its own**. It declares
`extends` over two existing profiles so a single workbook can hold both
vocabularies at once, and adds only the relation types and renderers that span
the two — edges the individual profiles cannot declare because neither owns
both endpoints.

This is the mechanism that keeps DNIS adoption additive: a domain profile
never learns about node trees, and `profile:dnis:0.1` never learns about the
domain. The join lives here.

## What this pairing buys

One workbook holds the `DocumentPlan` header, its five registries (sources,
concepts, assets, threads, people) **and** the section tree as `dnis:Node`
primitives.

A plan's `structure` is an ordered tree whose nodes must survive moves, splits
and merges — exactly DNIS's contract. Each `SectionNode` becomes a `dnis:Node`
whose content JSON carries the node's own fields (claim, reasoning, evidence,
through-line, budget, status) plus `region` and the original `slug`.

The nine relation types are the ones neither parent profile could declare,
because each has a `dnis:Node` on one side: `NodeUsesConcept`,
`NodeAdvancesThread`, `NodeCites` (carrying `locator` / `supports` / `note`),
`NodeOwnedBy`, `AssetPlacedIn`, `ConceptIntroducedIn`, `PlanHasDocument`,
`AssetReproducedFrom`, `PlanTranslationOf`.

The coherence validator catches what the schema cannot state: a comparative
claim asserted without a baseline to compare against.

## Entry points

- [`build.ts`](./build.ts) — the ingestion function that turns a plan into a workbook
- [`renderers/`](./renderers/) — `docplan:PlanOutlineRenderer`
- [`validators/`](./validators/) — the coherence judge
- Specification: [`docs/specs/SPEC-DOCUMENT-PLAN.md`](../../../docs/specs/SPEC-DOCUMENT-PLAN.md)
- CI: `.github/workflows/plugin-document-plan.yml` covers this plugin

---

← [Repository README](../../../README.md) · [Plugin index](../)
