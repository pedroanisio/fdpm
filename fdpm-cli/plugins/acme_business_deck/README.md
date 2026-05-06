---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# acme.business-deck

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Business presentation deck plugin for FDPM, derived end-to-end from
the Zod v4 schema in `schemas/business-deck.ts` via
[`@fdpm/zod-bridge`](../../packages/zod-bridge). Models 13 business-domain
entities (Claim, Evidence, Risk, Option, Entity, VisualArtifact,
Objection, PersuasionStrategy, Presenter, ExpectedQuestion,
AudienceSegment, PainPoint, Slide) with field-level Zod validators,
CEL constraints, and a deck-coherence cross-deck validator.

This README is the plugin's **Product Page** per
howto-zod-to-fdpm-plugin §12. The structured facts below are derived
mechanically from `generated/product-page-bundle.json`; the prose is
hand-authored. Drift between the two is detected by
`scripts/run-bridge.ts --check`.

## At a glance

| Field | Value |
|---|---|
| Plugin id | `acme.business-deck` |
| Plugin version | `0.1.0` |
| Profile id | `profile:acme-business-deck:0.1` |
| Host compatibility | `>=1.1,<2` |
| Entities | 13 |
| Relation types | 12 |
| Validator rule_ids (closed set) | 189 |
| Feature flags surfaced | 13 |
| Source schema | [`schemas/business-deck.ts`](schemas/business-deck.ts) |

## Capabilities

| Capability | Count | Notes |
|---|---|---|
| `cap:profile` | 1 | The DomainProfile registered at activate time. |
| `cap:validator` (per-entity) | 13 | One per emitted PrimitiveTypeDef. |
| `cap:validator` (deck-coherence) | 1 | Walks `context.workbook` to enforce cross-deck invariants. |
| `cap:renderer` | 13 | Markdown renderer per Entity, target `text/markdown`. |
| `cap:importer` | 13 | JSON importer per Entity, format `acme.business-deck:<entity>-json`. |
| `cap:exporter` | 13 | Deterministic JSON exporter per Entity. |
| `cap:expr-helper` | 13 | `acme.isValid<Entity>` predicates, all `pure: true`. |

## Entities

| Schema | Primitive type id | Identity | Notes |
|---|---|---|---|
| `ClaimSchema` | `acme:Claim` | `id` (ClaimId brand) | parent_claim_id self-ref (acyclic) |
| `EvidenceSchema` | `acme:Evidence` | `id` (EvidenceId brand) | claims_supported m:m → Claim |
| `RiskSchema` | `acme:Risk` | `id` (RiskId brand) | |
| `OptionSchema` | `acme:Option` | `id` (OptionId brand) | risk_ids, differentiation_claim_ids |
| `EntitySchema` | `acme:Entity` | `id` (EntityId brand) | information-architecture entity |
| `VisualArtifactSchema` | `acme:VisualArtifact` | `id` (VisualArtifactId brand) | |
| `ObjectionSchema` | `acme:Objection` | `id` (ObjectionId brand) | source_segment_id m:1 → AudienceSegment |
| `PersuasionStrategySchema` | `acme:PersuasionStrategy` | `id` (PersuasionStrategyId brand) | |
| `PresenterSchema` | `acme:Presenter` | `id` (PresenterId brand) | speaks_for_claim_ids |
| `ExpectedQuestionSchema` | `acme:ExpectedQuestion` | `id` (ExpectedQuestionId brand) | addresses_objection_id, references_evidence_ids |
| `AudienceSegmentSchema` | `acme:AudienceSegment` | `id` (SegmentId brand) | name-mismatch with IdSchema; explicit-list override |
| `PainPointSchema` | `acme:PainPoint` | `id` (PainPointId brand) | affected_persona_ids → AudienceSegment |
| `SlideSchema` | `acme:Slide` | `slide_number` (integer) | non-`id` identity; supports/uses/addresses fan-out |

## Cross-deck invariants (deck-coherence validator)

The schema's three top-level superRefine functions
(checkReferentialIntegrity, checkUniqueness, checkPostureAndDelivery)
lift to a deck-wide validator registered against `acme:Slide` that
walks `context.workbook.primitives`. Rule ids:

- `acme.business-deck:deck.claim-cycle` — claim parent graph must be acyclic
- `acme.business-deck:deck.claim-parent-resolves` — Claim.parent_claim_id ⊆ workbook
- `acme.business-deck:deck.evidence-claims-resolve` — Evidence.claims_supported ⊆ workbook
- `acme.business-deck:deck.objection-segment-resolves` — Objection.source_segment_id ⊆ workbook
- `acme.business-deck:deck.option-claims-resolve` — Option.differentiation_claim_ids ⊆ workbook
- `acme.business-deck:deck.option-risks-resolve` — Option.risk_ids ⊆ workbook
- `acme.business-deck:deck.painpoint-segments-resolve` — PainPoint.affected_persona_ids ⊆ workbook
- `acme.business-deck:deck.presenter-claims-resolve` — Presenter.speaks_for_claim_ids ⊆ workbook
- `acme.business-deck:deck.question-evidence-resolve` — ExpectedQuestion.references_evidence_ids ⊆ workbook
- `acme.business-deck:deck.question-objection-resolves` — ExpectedQuestion.addresses_objection_id ⊆ workbook
- `acme.business-deck:deck.slide-claims-resolve` — Slide.supports_claim_ids ⊆ workbook
- `acme.business-deck:deck.slide-evidence-resolve` — Slide.uses_evidence_ids ⊆ workbook
- `acme.business-deck:deck.slide-numbers-contiguous` — slide_numbers form 1..N
- `acme.business-deck:deck.slide-numbers-unique` — slide_numbers are unique
- `acme.business-deck:deck.slide-objections-resolve` — Slide.addresses_objection_ids ⊆ workbook
- `acme.business-deck:deck.slug-uniqueness` — field_values.id is unique within each non-Slide type

## Build, regenerate, drift-check

```bash
# Regenerate every bridge-owned artefact (writes to plugins/acme_business_deck/).
npm run bridge

# CI gate — assert in-tree files match a fresh bridge run.
npm run bridge:check

# Plugin tests (six categories per how-to §8 + failure-modes + manifest-parity + version-bump).
npm test
```

## Generated artefact layout

```
plugins/acme_business_deck/
├── fdpm-plugin.json             # extended manifest (regenerated)
├── package.json                 # peer-dep on zod ^4 and @fdpm/zod-bridge
├── sidecar.ts                   # the bridge sidecar, single source of truth
├── index.ts                     # runtime glue (activate, deck-coherence)
├── schemas/
│   └── business-deck.ts         # the Zod source of truth
├── scripts/
│   └── run-bridge.ts            # writes everything below; --check for CI
├── generated/
│   ├── profile.json
│   ├── view-page.json
│   ├── product-page-bundle.json
│   ├── audit.json
│   ├── migration-hints.json
│   ├── usl-ng-core.json
│   └── schema-hash.json         # sha256 schema+sidecar + pinned plugin version
└── capabilities/
    └── <Entity>.capabilities.json   # one per Entity (renderer/importer/exporter/expr-helper)
```

## Declared losses (per SPEC-FDPM-BRIDGE §8.2)

- The data-driven `BuiltInBusinessConstraints` catalog (line 3046 of
  the source schema) is structural in shape but rule evaluation is
  dynamic. The bridge cannot represent it as CEL. Per-entity Zod
  constraints + the deck-coherence validator cover the structural
  hard rules; the catalog's `should` and `nice_to_have` severities
  are dropped at the plugin layer.
- The `validateBusinessDeck()` runtime function (line 6715) returning
  `ValidationReportWithSolidity` is not lifted; it is a soft
  post-parse layer the host does not consume.

## Feature-flag posture

13 of the bridge's feature-flagged Limitations surface in
`generated/product-page-bundle.json` under `feature_flag_states[]`.
The schema deliberately avoids constructs that hit fallbacks:

- `flag:zod-discriminated-union` — **not exercised** (zero discriminated unions).
- `flag:zod-cross-field-refine` — **exercised** by the schema's three
  top-level superRefine functions; lifted to the deck-coherence cap:validator.
- `flag:zod-record` — **not exercised** (zero records).
- `flag:zod-recursive-lazy` — **not exercised** (zero lazy schemas).
- `flag:zod-pipe-transform` — **not exercised** (zero transforms).
- `flag:zod-brand` — **exercised** for 12 entity ID brands; bridge strips at translation per documented behavior.
