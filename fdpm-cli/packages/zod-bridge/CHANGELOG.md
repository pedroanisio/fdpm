---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# Changelog — `@fdpm/zod-bridge`

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Output stability across patch versions is a contract: a `0.1.x` release MUST
emit the same JSON for the same input. Minor version bumps (`0.x.0`) MAY change
emitted JSON; consumers should expect to regenerate `generated/profile.json`
and bump their plugin version when upgrading.

## [0.2.0] — 2026-05-06

Minor release. Hybrid lift detection — the bridge now classifies
schemas into Entity vs ValueObject and emits one `PrimitiveTypeDef`
per Entity instead of collapsing nested objects into a single giant
primitive.

This addresses the architectural finding from the v0.1.0 trial against
`pitch-deck.schema.v2.ts`: identity must be declared, not inferred
from shape alone. The convention is borrowed from the
[`usl-ng-core`](https://github.com/pedroanisio/usl-ng-core) project's
Zod ingester (`crates/usl-ng-emit-zod/src/ingest/statements.rs:441`),
which has been Lean-verified against ~222 theorems including the full
Zod ↔ JSON Schema lens-pair.

### Added

- **Hybrid classifier** (`src/classifier.ts`) — three-pass detection:
  1. **Convention.** A schema `{Name}` paired with `{Name}Id` in the
     same `schemas` map → `Entity` with reason `id-schema-companion`.
     The companion schema itself is treated as the entity's id type
     and skipped at primitive emission.
  2. **Explicit list.** `BridgeOptions.entities: string[]` promotes
     additional schemas to `Entity`. Convention takes precedence on
     names already detected; explicit names not in the schemas map
     throw a clear error.
  3. **Default.** Everything else is `ValueObject`.
- **Audit log** in `AssembleResult.audit`. Records every
  classification with its reason; lists `candidatePromotions` —
  ValueObjects with Entity-like signals the heuristic detected
  (`has-id-field`, `referenced-by-multiple`). Signals are advisory;
  the bridge never auto-promotes.
- **`renderAuditLog(audit)`** — human-readable formatter for CI logs.
- **Public exports.** `classifySchemas`, `renderAuditLog`, plus types
  `AuditLog`, `ClassificationEntry`, `ClassificationCandidate`,
  `ClassificationReason`, `ShapeKind`.

### Changed

- **`assembleDomainProfile` now emits one PrimitiveTypeDef per
  schema-map key.** Previously collapsed every key into one primitive
  (the v0.1.x behavior); this was the root of the trial's
  multi-primitive findings. Schemas listed in the map → primitives;
  nested anonymous objects → inline structs (unchanged).
- **`AssembleResult` gains an `audit` field.** Existing consumers that
  destructure other fields are unaffected; consumers using strict
  spread copy will see the new field.
- **Id-companion schemas are skipped at primitive emission.** A
  schema named `CustomerId` that classifies as the id-companion of
  `Customer` is not emitted as its own primitive — its content is
  the entity's id field type.

### Determinism

Audit log is sorted lexicographically; same input → byte-equal log
across runs. `testcase:bridge-determinism` continues to pass against
the new structure.

### Tests

72/72 passing (was 61/61). New `tests/classifier.test.ts` adds 11
cases covering: convention detection, explicit list, precedence rules,
candidate signals, audit-log rendering, and determinism.

### Trial re-run

Against `pitch-deck.schema.v2.ts` with the explicit entities list
from the trial workbook (`PitchDeck`, `Audience`, `Source`,
`DataPoint`, `Claim`, `AntiPattern`, `Risk`, `Competitor`, `Slide`):

| Metric | v0.1.1 | v0.2.0 |
|---|---|---|
| Primitive types emitted | 1 | 9 |
| Total fields across primitives | 17 | 85 |
| Total constraints | 13 | 115 |
| Audit log emitted | no | yes |

### Reference

- Workbook `howto-zod-to-fdpm-plugin@180` documents the convention
  and cites `usl-ng-core` as the source. Option A (USL-NG Core
  upstream) is recorded as the v1.x destination.
- Workbook `trial-zod-bridge-pitch-deck` (rev 32+) carries the trial
  artefacts and the failure-mode catalogue this release closes.

## [0.1.1] — 2026-05-06

Patch release. Six correctness fixes surfaced by a real-schema trial
([`docs/journals/zod-bridge-pitch-deck-trial.md`](../../../docs/journals/zod-bridge-pitch-deck-trial.md))
against `static/schemas/pitch-deck.schema.v2.ts` (1347 lines, 13 named
sub-schemas, 2 discriminated unions, 1 z.record, 1 .transform() chain).
Each fix has a paired test in `tests/regressions.test.ts`.

### Fixed

- **Recursion-depth conflated with object nesting.** `mapField` counted
  plain `z.object` nesting against `recursionDepth`, tripping
  `flag:zod-recursive-lazy` on any 2-deep schema. Now `lazyDepth`
  tracks `z.lazy` unwrapping separately; object nesting is unbounded.
  ([`field-mapping.ts`](src/field-mapping.ts), trial failure:1.)
- **Struct-name compounding.** Recursive calls passed the full struct
  id as a typePath segment, producing quadratic names like
  `PitchDeckPitchDeckDesignSystemPalette`. Now passes
  `pascalCase(fieldName)` only; struct ids stay linear in depth.
  ([`field-mapping.ts`](src/field-mapping.ts), trial failure:2.)
- **`.transform()` / `.pipe()` hard-rejected.** `walker.ts` lumped `pipe`
  with `function`/`promise`. Per `flag:zod-pipe-transform` (state=
  behind-flag, default=validate-pre-transform) the bridge should walk
  the input side, not reject. Now does. `function` and `promise` remain
  hard rejects. ([`walker.ts`](src/walker.ts), trial failure:3.)
- **`z.union` / `z.discriminatedUnion` rejected at field level.**
  Variant-per-primitive splitting needs schema-set context that field
  mapping does not have; field-level fallback is payload-blob (string +
  `format: 'json-union'`), with end-to-end semantics enforced by the
  validator. ([`field-mapping.ts`](src/field-mapping.ts), trial failure:4.)
- **`z.record` had no field-mapping branch.** Fell through to the
  unknown-type catch with an ad-hoc flag id. Now emits string +
  `format: 'json-record'`. ([`field-mapping.ts`](src/field-mapping.ts),
  trial failure:5.)
- **Array-element struct id collisions.** Multiple arrays under the
  same parent (e.g. `audiences`, `slides`, `risks`) all produced struct
  ids ending in `Item`. Recursive call now passes
  `${arrayFieldName}Item` to disambiguate; result is e.g.
  `RootAudiencesItem` vs `RootSlidesItem`.
  ([`field-mapping.ts`](src/field-mapping.ts), trial failure:6.)

### Tests

`61/61` passing (was 49/49). Added `tests/regressions.test.ts` with one
test per fix plus boundary cases (5-deep nesting, real `z.lazy`,
`function`/`promise` still rejected).

### Trial workbook

A documentation workbook capturing this trial is in MCP:
`trial-zod-bridge-pitch-deck` (rev 32, 18 primitives, 13 relations).
Contents: bug catalogue, output statistics, two new
`fs:Limitation` entries pointing at spec gaps in the workbook
`howto-zod-to-fdpm-plugin` (no `flag:zod-record`; field-level union
fallback under-specified).

## [0.1.0] — 2026-05-06

Initial release. Reference implementation of the workbook
`howto-zod-to-fdpm-plugin` (revision 179).

### Added

- **`assembleDomainProfile(args)`** — the orchestrator. Consumes a map of
  Zod v4 object schemas plus `BridgeOptions` and emits four artefacts in a
  single deterministic pass: `DomainProfile`, `ViewPageDescriptor`,
  `ProductPageBundle`, `MigrationHints`. Plus `ruleIdsByType` for manifest
  rule_id population.
- **`zodSchemaToPrimitiveType(name, schema, opts)`** — translates one
  `z.object` to a `PrimitiveTypeDef` with vendor-namespaced id
  (`<vendor>:<TypeName>`), inline-struct nesting (default) or relation
  lifting (opt-in via `opts.liftMarkers`), and CEL constraints emitted via
  the 23-rule table.
- **`zodSchemaToValidator(schema, opts)`** — wraps `safeParse` into a
  `ValidatorFn`. Returns `{ validator, ruleIds }` where `ruleIds` is the
  closed set the validator may emit, computed by walking the schema's
  `_def` at build time. Suitable for `manifest.capabilities[].metadata.rule_ids`.
- **`zodSchemaToCelConstraints(schema, ctx)`** — the 23-rule translation
  table. First-match-wins; non-matching nodes return an empty constraint
  list (validator fallback handles them). Verified against the host CEL
  runtime by 25 test cases.
- **`buildViewPageDescriptor(...)`** — one panel per primitive type, fields
  in schema-declared order, enums rendered as dropdowns with inline values,
  optional fields tagged `optional-dim`, relation fields tagged `link`.
  Per-type overrides accepted via `BridgeOptions.viewPageOverrides`.
- **`buildProductPageBundle(...)`** — structured facts the plugin's README
  consumes for its Product Page (plugin id, version, profile id, host
  compat, schema sources, primitive type ids, relation types, expr-helpers,
  validator rule_ids, feature-flag snapshot).
- **`stableStringify(value)`** — deterministic JSON serializer (sorted keys
  at every depth, fixed indent, undefined/function values dropped). Locks
  the CI snapshot gate.
- **`DEFAULT_FEATURE_FLAG_STATES`** — snapshot of the 13 feature flags from
  workbook rev 179.

### Tests (49 passing)

| Suite | Workbook `fs:TestCase` |
|---|---|
| `tests/mapping.test.ts` | `testcase:bridge-mapping-table` |
| `tests/cel-translation.test.ts` | `testcase:cel-translation-table` |
| `tests/validator-equiv.test.ts` | `testcase:bridge-validator-equivalence` |
| `tests/roundtrip.test.ts` | `testcase:bridge-roundtrip` |
| `tests/determinism.test.ts` | `testcase:bridge-determinism` |

`testcase:expr-helper-purity` is deferred to `v0.2.0` along with the
optional-cap factories that produce the helpers it would test.

### Notes on the spec

- Workbook rule 8 reads `timestamp(self.<f>) != null`; the bridge actually
  emits `timestamp(self.<f>).getFullYear() > 0` because cel-js v7 rejects
  the former at type-check. The semantics are equivalent (both force the
  parse). Workbook will be patched in rev 180.
- Optional capabilities (`cap:renderer`, `cap:importer`, `cap:exporter`,
  `cap:expr-helper`) are documented in workbook §7 but not yet shipped as
  bridge factories. Consumers can hand-author them in ~10 lines per the §7
  examples.

### Dependencies

- Peer: `zod ^4.0.0`
- Runtime: `@marcbachmann/cel-js ^7.6.1`
- Dev: `vitest`, `typescript`, `@types/node`

[0.1.0]: https://github.com/anthropics/fdpm-cli/releases/tag/%40fdpm%2Fzod-bridge%400.1.0
