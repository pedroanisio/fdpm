---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5 via Claude Code"
  date: "2026-08-28"
---

# fdpm.document-plan (+ fdpm.document-plan-dnis)

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Two plugins that turn a **DocumentPlan v3.1.0** (a planning contract for a
written work — essay to multi-volume book) into an FDPM workbook and back
into a reviewable plan outline.

| Plugin | Profile | What it contributes |
|---|---|---|
| `fdpm.document-plan` | `profile:document-plan:3.1` | Bridge-generated from [`schemas/document-plan.ts`](./schemas/document-plan.ts): the plan **header** (`docplan:DocumentPlan`) and the five registries (`docplan:ContentSource`, `docplan:Concept`, `docplan:Asset`, `docplan:Thread`, `docplan:Person`), one Zod validator and one field-table renderer per entity. |
| `fdpm.document-plan-dnis` | `profile:document-plan-dnis:3.1` | Composition profile extending the above **and** `profile:dnis:0.1`: the section tree lives as `dnis:Node` primitives, nine `docplan:*` relation types connect nodes to registries, and `docplan:PlanOutlineRenderer` renders the outline. [`build.ts`](../document_plan_dnis/build.ts) is the ingestion function. |

**Specification:** [`docs/specs/SPEC-DOCUMENT-PLAN.md`](../../../docs/specs/SPEC-DOCUMENT-PLAN.md) — built from
[`scripts/build-spec-document-plan.ts`](../../scripts/build-spec-document-plan.ts) on
`profile:spec-authoring-dnis:0.1`; every schema invariant appears there with its
validation message quoted verbatim.

## Why the tree is DNIS, not a bridge entity

A plan's `structure` is a depth-limited, ordered tree whose nodes must keep
identity across moves, splits and merges. That is SPEC-DNIS's contract
(SPEC-CORE §5.6), already used by the spec-authoring build scripts. Each
`SectionNode` becomes a `dnis:Node` with `kind = node.kind`
(`part | chapter | section | … | appendix`), reading order as a SPEC-DNIS
position, and the node's own fields (claim, reasoning, evidence,
through-line, budget, status, …) plus `region` and the original `slug` as
its content JSON. The `uid` of the primitive is the DNIS node id.

Everything with a `dnis:Node` on one side is declared in the composition
profile, not in the sidecar's `references` (which can only join bridge
entities): `NodeUsesConcept`, `NodeAdvancesThread`, `NodeCites` (carrying
`locator` / `supports` / `note`), `NodeOwnedBy`, `AssetPlacedIn`,
`ConceptIntroducedIn`, plus `PlanHasDocument`, `AssetReproducedFrom` and
`PlanTranslationOf`.

## Process — schema → plugin → workbook → document

```bash
# 0. (already done) schema copied from _ingest_bin/ into schemas/, entity
#    sub-schemas exported, sidecar.ts written.

# 1. Regenerate the bridge artefacts after any schema/sidecar edit, bump
#    PLUGIN_VERSION in sidecar.ts, and let CI's --check gate prove it.
cd fdpm-cli && npx tsx plugins/document_plan/scripts/run-bridge.ts
npx tsx plugins/document_plan/scripts/run-bridge.ts --check

# 2. Ingest a plan instance. The full DocumentPlanSchema (including its
#    superRefine cross-reference, ordering, budget and DAG rules) runs
#    first; a rejected plan writes nothing and exits with the
#    `verification` code.
FDPM_DATA_DIR=/tmp/fdpm-plans npx tsx fdpm-cli/scripts/build-document-plan.ts \
  fdpm-cli/tests/plugins/document_plan/fixtures/architecture-report.plan.json \
  --workbook-id arch-report-plan

# 3. Validate / inspect like any workbook.
FDPM_DATA_DIR=/tmp/fdpm-plans npx tsx fdpm-cli/src/bin/fdpm.ts validate arch-report-plan
FDPM_DATA_DIR=/tmp/fdpm-plans npx tsx fdpm-cli/src/bin/fdpm.ts primitive list arch-report-plan --json

# 4. Render the plan outline (also reachable as the MCP resource
#    fdpm://workbook/arch-report-plan/render/text/markdown#docplan:PlanOutlineRenderer).
FDPM_DATA_DIR=/tmp/fdpm-plans npx tsx fdpm-cli/src/bin/fdpm.ts render arch-report-plan text/markdown \
  --renderer-id docplan:PlanOutlineRenderer -o plan-outline.md
```

The outline renders the **plan** — every planning field, addressed to the
author. A manuscript renderer would print only `MANUSCRIPT_TEXT_FIELDS`.

## Declared losses (what the bridge does not carry, and where it is enforced instead)

Recorded in [`generated/audit.json`](./generated/audit.json):

| Construct | Stored as | Enforced by |
|---|---|---|
| `structure.*` recursive tree | `dnis:Node` primitives | `build.ts` (ingest) + DNIS adapter invariants |
| `superRefine` cross-references, concept order, thread continuity, budgets, DAG | — | `DocumentPlanSchema.safeParse` at ingest; host relation pipeline for endpoint existence |
| `AssertionText` self-referential `.refine` | — | per-entity Zod validator (header) / ingest (`safeParse`) for node content |
| `SourceIdentifier` discriminated union | flat `{kind, value}` struct | per-kind regexes at ingest only |

The bridge also emits CEL `constraints`; the host's `compileProfile` passes
them through untouched and the pipeline does not evaluate them — the Zod
validators are the operative judges.

## Coherence judge (profile-level)

The schema can express "this comparative claim rests on that baseline"
(`dependencies[].reason: "context" | "logical_prerequisite"`) but cannot
detect the omission. The composition plugin adds one warning-level
validator on `dnis:Node`, **`docplan:coherence.comparative-claim-without-baseline`**
([validators/coherence.ts](../document_plan_dnis/validators/coherence.ts)):
a claim carrying a comparative marker (pt-BR and English list, e.g.
*em vez de*, *cabe em*, *mais simples*, *simpler*, *instead of*) must have a
`context`/`logical_prerequisite` dependency on a node that precedes it in
reading order. It runs on every node write, inside `fdpm validate`, and at
ingest (`BuildReport.coherence_warnings`, printed by the build script). It is
a lexical heuristic: it makes the omission visible; it does not judge the
argument.

## Tests and CI

`tests/plugins/document_plan/` — bridge determinism + `--check`,
manifest ↔ sidecar parity, activation of both plugins, validator
accept/reject, and the fixture plan ingested and rendered end-to-end
(with the negative case: a leaf without a claim never reaches the log),
and `coherence.test.ts` for the comparative-claim judge.
CI: [`.github/workflows/plugin-document-plan.yml`](../../.github/workflows/plugin-document-plan.yml).

[← fdpm-cli](../../README.md)
