---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Fable 5 via Claude Code"
  date: "2026-09-01"
---

# Fact-Fiction Coupling Plugin

`fdpm.fact-fiction` — a server-side FDPM CLI plugin contributing the
**Fact-Fiction Coupling** domain profile: a typed vocabulary for
historical fiction that keeps the invented layer honest about its
relationship to the historical record. It is the graph form of the
fact-fiction Zod spike (spec 0.2.0), which modelled the same five
coupled layers — fact, inference, fiction, narrative style, linkage —
as one self-contained JSON document.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

This profile validates **structure, not historical truth**: a conforming
workbook can still be wrong about history. What it enforces is that every
epistemic claim is explicit, referenced, and auditable.

| Field          | Value                             |
| -------------- | --------------------------------- |
| Plugin id      | `fdpm.fact-fiction`               |
| Plugin version | `0.1.0`                           |
| Profile id     | `profile:fact-fiction:0.1`        |
| Kind           | `server`                          |
| Host compat.   | `fdpm >=1.1, <2`                  |
| License        | MIT                               |
| Entry point    | [`index.ts`](./index.ts)          |

## Why a graph instead of a document

The spike's document form had one flaw its own model could not avoid:
sources were embedded per fact with globally-unique ids, so a book cited
by thirty facts needed thirty copies of the citation under thirty fresh
UUIDs. Here `ff:Source` is a first-class primitive and citation is an
`ff:Cites` edge — one source, any number of citing facts, each edge
optionally carrying a `locator` ("Poem, ll. 1-25").

Everything else the spike enforced in a hand-written root `superRefine`
is core machinery now:

| Spike mechanism | Plugin mechanism |
| --- | --- |
| Global ID-uniqueness sweeps | `id_format` templates (`fact:{slug}`, `src:{slug}`, …) |
| fiction → fact / constraint reference sweeps | `ff:BasedOn` / `ff:ConstrainedBy` edges, endpoint-typed |
| scene → fact / fiction sweeps | `ff:Depicts` / `ff:Features` edges |
| link → both-ends sweep | `ff:CouplesTo` edge (relation + explanation as metadata) |
| assessment → source sweep | `ff:Assessment.source_id` id-ref, resolved by `core:field:id-ref` |
| `min(1)` sources/assessments per fact | warning rules `ff:val:fact-cited` (+ renderer flags), see below |
| Zod array order (arcs/chapters/scenes) | integer `order` metadata on `ff:HasArc`/`ff:HasChapter`/`ff:HasScene` |

## Types

**Evidence** (`cat:ff:evidence`)

- `ff:Fact` — a historical fact; `disputed=true` requires `dispute_note`
  (`ff:val:disputed-fact-has-note`).
- `ff:Source` — shared source with type and reliability enums.
  `reliability` has **no default**: state `unknown` explicitly.
- `ff:Assessment` — a scholarly position on a fact (`fact_id` id-ref).
  At least one of `confidence_level` / `confidence_score` is required
  (`ff:val:assessment-has-confidence`); the score is range-checked to
  [0, 1]. Multiple assessments per fact model scholarly disagreement.

**Fiction** (`cat:ff:fiction`)

- `ff:FictionElement` — mechanism (8-value enum) and historicity
  (5-value grading from `documented_fact` to `fully_invented`).
- `ff:Constraint` — what the fiction may not violate; `hard` = anachronism,
  `soft` = implausibility; supported by facts via `ff:SupportedBy`.

**Structure** (`cat:ff:structure`)

- `ff:Work` — the root: world boundary plus the **global narrative style**
  (POV, temporal mode, tone, narrator distance/reliability, diction and
  interiority policy) as flat validated enum/bool fields.
- `ff:Arc` / `ff:Chapter` / `ff:Scene` — the manuscript hierarchy, each
  with an optional `style_override` JSON blob.

## The style cascade

Overrides merge **work → arc → chapter → scene**, most specific wins,
supplied keys replace, omitted keys inherit — the spike's
`NarrativeStyleOverrideSchema` semantics, resolved read-side by
`ff:ManuscriptOutlineRenderer` rather than by the validator. The
rendered outline prints each scene's effective deviation from the
global style.

## The review document

`ff:ManuscriptOutlineRenderer` (`text/markdown`, `outline.md`) renders
the document a historical consultant reads: the factual layer with
**DISPUTED / UNCITED / UNASSESSED** flags, the source list with
citation counts, the fiction layer with its grounding edges, the
coupling table (relation + explanation), constraints with
**UNSUPPORTED** flags, and the ordered structure tree with effective
styles. The flags mirror the warning rules, so the document and
`validateProject` tell the same story.

```sh
fdpm render <workbook> --target text/markdown --renderer-id ff:ManuscriptOutlineRenderer
```

## Authoring notes (the create-time graph trap)

Facts are created before their citations can exist, so the min-edge
requirements are **warnings**, not errors: author freely, then run
`validateProject` (or re-read the outline) and clear `ff:val:fact-cited`,
`ff:val:fiction-grounded`, `ff:val:scene-anchored`, and
`ff:val:constraint-supported`. The two error rules
(`ff:val:disputed-fact-has-note`, `ff:val:assessment-has-confidence`)
are single-write invariants and never trap.

The MCP prompt **`fact-fiction/ground_fiction`** walks an agent through
exactly this audit: find the flags, share (never duplicate) sources,
cite, assess, couple.

## Deliberate deviations from the spike

- `tone` was an enum array with min 1; the core cannot enum-check list
  elements, so it became `tone_primary` (validated) + `tones_additional`
  (free list).
- Free-text dates (`"-1274"`, `"c. 600 BCE"`) get **no ordering rule** —
  lexicographic comparison would reject correct BCE ranges.
- `_meta` / `schemaVersion` literals on every instance are gone: the
  profile is the ontology, and it is versioned.

## Tests

`fdpm-cli/tests/plugins/fact_fiction/` — profile shape, rule behavior
end-to-end through the Host (including the shared-source regression the
spike could not express), renderer cascade and flags, prompt budgets
and drift gates.

---

- Workbook root: [`README.md`](../../../README.md), [`PURPOSE.md`](../../../PURPOSE.md), [`DISCLAIMER.md`](../../../DISCLAIMER.md)
- Sibling profile docs: [`docs/architecture/PROFILES.md`](../../../docs/architecture/PROFILES.md)
