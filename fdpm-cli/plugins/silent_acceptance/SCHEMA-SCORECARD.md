---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "OpenAI Codex"
  date: "2026-09-04"
---

# Silent Acceptance schema scorecard

Assessment of `profile:silent-acceptance:2.1` against Rules for Great Schema
Design v2.0.0. “Documented” means a SHOULD-level trade-off is explicit in the
profile or README; it is not an unreported exception.

| # | Rule | Result | Evidence |
|---:|---|---|---|
| 1 | Unambiguous field types | Pass | Every field uses a closed FDPM scalar or enum type. |
| 2 | Constraints in schema | Pass | Rates, hashes, dates, sample sizes, formulas, graph cardinality, and cross-record gates are machine checked. |
| 3 | Closed, versioned enums | Pass | Error classes and lifecycle/result vocabularies are closed under profile version `2.1.0`. |
| 4 | Nullable vs optional vs absent | Pass | Conditional fields are optional-but-non-null; validators state exactly when absence is legal. |
| 5 | Array item/cardinality/order | Pass | Domain collections are graph relations, not opaque arrays; cardinality and ordering semantics are declared per edge. |
| 6 | Temporal precision/format | Pass | Dates and UTC instants have distinct formats and regex constraints. |
| 7 | Numeric units | Pass | Rates, confidence, and weights are declared dimensionless; sample sizes are counts. |
| 8 | Discriminated polymorphism | Pass | `disposition` discriminates covered and accepted-risk class arms; `decision`, `status`, and `verdict` are closed tags. |
| 9 | Defaults declared | Pass | Assurance facts have no hidden defaults; omission is explicit and validation-sensitive. |
| 10 | Stable opaque identity | Pass | Core gives every instance an immutable ULID `uid`; readable `id` is a separate stable symbolic address. |
| 11 | Navigable relationships | Pass | Every dependency is a typed, directed relation with declared endpoints. |
| 12 | Lifecycle ownership explicit | Pass | Relation descriptions classify declaration/verdict edges as composition and configuration/verifier/oracle references as associations; Core deletion remains explicit. |
| 13 | Foreign-key targets declared | Pass | Every relation declares source and target primitive types. |
| 14 | Cyclic topology declared | Pass | Downstream-boundary deferral permits cycles but requires visited-id traversal; other relations are bounded one-hop associations. |
| 15 | One source of truth per fact | Pass | Configuration, authority, verifier, and oracle details live once and are referenced; repeated class labels are equality-checked snapshots. |
| 16 | No bag-of-arrays entities | Pass | Each primitive carries its own identity, governance, evidence, or measured semantics. |
| 17 | Cross-cutting types reused | Pass | Shared owner/date/rate/hash builders generate one constraint definition consistently. |
| 18 | Computed vs stored explicit | Pass | Stored residual risk names its derivation and is recomputed by a validator. |
| 19 | Explicit monotonic version | Pass | Profile `2.1.0` and protocol `2.1.0` are machine-readable constants. |
| 20 | No duplicate-version entities | Pass | One canonical type exists for each concept. |
| 21 | Breaking changes classified | Pass | README compatibility policy classifies optional and breaking changes. |
| 22 | Deprecation annotated | Pass | No field is deprecated in the initial revision; future removal must follow the compatibility policy. |
| 23 | Sensitive-data classification | Pass | Fields accept non-personal team/service identifiers and explicitly forbid personal data. No PII payload is modeled. |
| 24 | Identity/provenance immutability | Documented | Core `uid` is immutable; configuration and evidence digests are described as immutable snapshots. Enforcement of field-level write-once semantics remains a Host/API concern. |
| 25 | Localization strategy | Documented | Schema identifiers are locale-neutral and operator prose is authored in one deployment language; UI localization is outside this assurance contract. |
| 26 | Multi-actor provenance | Pass | Owners, creators, timestamps, control domains, run ids, and evidence digests identify accountable actors and records. |
| 27 | Consistent naming | Pass | Type ids use `sa:PascalCase`; fields and relation semantics use predictable snake_case and directional names. |
| 28 | Mechanically generatable validators | Pass | The FDPM `DomainProfile` is executable schema and plugin validators close every declared cross-record constraint. |
| 29 | Intentional extension points | Pass | No `unknown`, `any`, open object, or accidental extension field exists. |
| 30 | Access patterns do not dictate structure | Pass | The model is normalized around protocol entities; renderers derive their own projections. |
| 31 | Standalone readability | Pass | Types, fields, relations, source sections, lifecycle, and limitations are described in schema metadata and README. |

## Totals

- MUST rules: 20/20 pass (Rule 23 is applicable and passes because PII is forbidden).
- SHOULD rules: 9 pass; 2 documented platform/deployment boundaries.
- Compatibility classification: initial `2.1.0` schema; future breaking changes require a new major profile family.
