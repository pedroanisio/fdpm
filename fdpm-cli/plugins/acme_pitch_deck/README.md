---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# acme.pitch-deck

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Strategic pitch-deck plugin for FDPM, derived end-to-end from the
Zod v4 schema in `schemas/pitch-deck.schema.v2.ts` via
[`@fdpm/zod-bridge`](../../packages/zod-bridge). Models eight
business-domain entities (Audience, Source, DataPoint, StrategicClaim,
Risk, Competitor, AntiPattern, Slide) plus thirteen Slide visual
variants, with field-level Zod validators, CEL constraints, and a
deck-coherence cross-deck validator.

This README is the plugin's **Product Page** per
howto-zod-to-fdpm-plugin §12. The structured facts below are derived
mechanically from `generated/product-page-bundle.json`; the prose is
hand-authored. Drift between the two is detected by
`scripts/run-bridge.ts --check`.

## At a glance

| Field | Value |
|---|---|
| Plugin id | `acme.pitch-deck` |
| Plugin version | `0.1.0` |
| Profile id | `profile:acme-pitch-deck:0.1` |
| Host compatibility | `>=1.1,<2` |
| Schemas (Entities + variant arms) | 21 |
| Relation types | 21 |
| Validator rule_ids (closed set) | 396 |
| Feature flags surfaced | 13 |
| Source schema | [`schemas/pitch-deck.schema.v2.ts`](schemas/pitch-deck.schema.v2.ts) |

## Capabilities

| Capability | Count | Notes |
|---|---|---|
| `cap:profile` | 1 | The DomainProfile registered at activate time. |
| `cap:validator` (per-entity) | 21 | One per emitted PrimitiveTypeDef, including 13 Slide visual variants. |
| `cap:validator` (deck-coherence) | 1 | Walks `context.workbook` to enforce cross-deck invariants. |
| `cap:renderer` | 8 | Markdown renderer per Entity, target `text/markdown#<typeId>`. |
| `cap:importer` | 8 | JSON importer per Entity, format `acme.pitch-deck:<entity>-json`. |
| `cap:exporter` | 8 | Deterministic JSON exporter per Entity (lex-sorted by id). |
| `cap:expr-helper` | 8 | `acme.isValid<Entity>` predicates, all `pure: true`. |

## Entities

The bridge classifies a Zod schema as an **Entity** (lifted to its
own PrimitiveTypeDef) using either the `{Name}IdSchema` companion
convention or an explicit `entities[]` list in the sidecar. This
plugin uses the explicit form; `sidecar.ts` is the source of truth.

| Schema | Primitive type id | Strategy |
|---|---|---|
| `Audience` | `acme:Audience` | explicit-entities-list |
| `Source` | `acme:Source` | explicit-entities-list |
| `DataPoint` | `acme:DataPoint` | explicit-entities-list |
| `StrategicClaim` | `acme:StrategicClaim` | explicit-entities-list |
| `Risk` | `acme:Risk` | explicit-entities-list |
| `Competitor` | `acme:Competitor` | explicit-entities-list |
| `AntiPattern` | `acme:AntiPattern` | explicit-entities-list |
| `Slide` | `acme:Slide` | explicit-entities-list (parent) |
| `Slide.visual` arms (13) | `acme:Slide_<Tag>` | variant-per-primitive |

## Cross-deck invariants (deck-coherence validator)

The schema's `superRefine` cross-deck rules cannot be expressed via
single-primitive validators (they need read access to the full
workbook). They lift to a deck-wide validator registered against
`acme:Slide` that consumes `context.workbook.primitives`. Rule ids:

- `acme.pitch-deck:deck.audience-coverage` — every audience addressed in every argumentative phase
- `acme.pitch-deck:deck.claim-bidirectional` — `slide.claimsAdvanced` ⇔ `claim.appearsOnSlides`
- `acme.pitch-deck:deck.claim-cycle` — claim support graph must be acyclic
- `acme.pitch-deck:deck.evidence-bidirectional` — `slide.evidenceUsed` ⇔ `dataPoint.usedOnSlides`
- `acme.pitch-deck:deck.slide-display-numbers` — contiguous 1..N
- `acme.pitch-deck:deck.source-freshness-missing` — load-bearing claims need fresh sources (warning)
- `acme.pitch-deck:deck.time-budget-coverage` — annotate `estimatedSpeakingSeconds` on all slides or none

## Build, regenerate, drift-check

```bash
# Regenerate every bridge-owned artefact (writes to plugins/acme_pitch_deck/).
npm run bridge

# CI gate — assert in-tree files match a fresh bridge run.
# Exits 1 with a diff list if the schema changed without regenerating.
npm run bridge:check

# Plugin tests (six categories per how-to §8: mapping, CEL,
# validator-equivalence, roundtrip, determinism, expr-helper purity).
npm test
```

## Generated artefact layout

```
plugins/acme_pitch_deck/
├── fdpm-plugin.json             # extended manifest (regenerated)
├── package.json                 # peer-dep on zod ^4 and @fdpm/zod-bridge
├── sidecar.ts                   # the bridge sidecar, single source of truth
├── index.ts                     # runtime glue (activate, deck-coherence)
├── schemas/
│   └── pitch-deck.schema.v2.ts  # the Zod source of truth
├── scripts/
│   └── run-bridge.ts            # writes everything below; --check for CI
├── generated/                   # all six files written by the bridge
│   ├── profile.json
│   ├── view-page.json
│   ├── product-page-bundle.json
│   ├── audit.json
│   ├── migration-hints.json
│   └── usl-ng-core.json
└── capabilities/
    └── <Entity>.capabilities.json   # one per Entity (renderer/importer/exporter/expr-helper)
```

## Feature-flag posture

The plugin exercises 13 of the bridge's feature-flagged Limitations.
Their snapshot is in `generated/product-page-bundle.json` under
`feature_flag_states[]`. The notable ones for this plugin:

- `flag:zod-discriminated-union` — `Slide.visual` uses
  `variant-per-primitive` (default), producing 13 sibling primitives
  + 13 parent→arm relations.
- `flag:zod-cross-field-refine` — the schema's `superRefine`
  invariants cannot be auto-translated to CEL; they are enforced
  through the deck-coherence cap:validator.
- `flag:zod-recursive-lazy` — not exercised (no recursive schemas).
- `flag:zod-record` — not exercised (no `z.record` fields).
