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

## [0.3.0] — 2026-05-06

Minor release. **Sidecar consumer.** Adds the
[`SPEC-DOMAIN-SIDECAR`](../../docs/specs/SPEC-DOMAIN-SIDECAR.md) v0.1.3
input surface and a sidecar-driven orchestrator that emits the seven
artefacts mandated by [`SPEC-FDPM-BRIDGE`](../../docs/specs/SPEC-FDPM-BRIDGE.md)
§2.2.

The legacy `assembleDomainProfile` entrypoint from v0.2.0 is unchanged.
Sidecar-aware callers use the new `assembleDomainProfileFromSidecar`.

### Added

- **`defineDomain<T>`** (`src/sidecar-types.ts`) — identity passthrough
  for editor autocomplete + compile-time type-checking. The returned
  `Domain` is the bridge's input contract.
- **Eight parse-time validation passes** (`src/sidecar-validator.ts`),
  per `SPEC-DOMAIN-SIDECAR` §11.3:
  1. schema-name resolution
  2. path resolution (top-level fields)
  3. aggregate consistency (no cross-aggregate parts; no self-aggregation)
  4. inverse pairing (`inverse.on` resolves; matches `references[].to`)
  5. variant consistency (discriminator matches the source z.discriminatedUnion)
  6. identity consistency (idField present; idSchema reference-equal;
     naturalKey constraints — non-empty, no duplicates, scalar fields
     only, all required)
  7. variant-local references (`from` matches a generated per-variant
     primitive name)
  8. DNIS field consistency (`fdpm.dnis.managedFields[]` resolve;
     unwrapped type is `z.string()`; `nodeKind` non-empty; `lineage`
     in `{"track","none"}`).
  Plus pre-pass shape gates: `sidecar:missing-version`,
  `sidecar:missing-entities`, `sidecar:hash-manifest-malformed`,
  `sidecar:hash-algorithm-unsupported`. Failure aborts with
  `SidecarError` carrying a stable `code` — no partial output.
- **`zod-ast-canonical-v1` schema hash** (`src/sidecar-hash.ts`) per
  `SPEC-FDPM-BRIDGE-ZOD` §7. Strips comments, normalises whitespace,
  SHA-256s the canonical text. Emits `"<algorithm>:<hex>"`.
  `recomputeSchemaHashes` returns drift entries; the orchestrator
  raises `sidecar:hash-drift` when any are present.
- **`assembleDomainProfileFromSidecar`** (`src/sidecar-orchestrator.ts`)
  emits the seven artefacts:
  1. `DomainProfile` — primitives (one per entity, one per variant
     arm with `variant-per-primitive`, one `dnis:Node` sibling per
     DNIS-managed field), relations (sidecar `references[]` only;
     bridge does NOT infer references from source shapes per
     `SPEC-FDPM-BRIDGE` §8.1), enum defs, and profile-level CEL
     constraints (including `graph.acyclic("<rel-id>")` for
     self-referential edges with `acyclic: true`).
  2. `ValidatorFn` per Entity, with closed-set rule_ids in
     `ruleIdsByType`.
  3. `ViewPageDescriptor` — one panel per emitted primitive.
  4. `ProductPageBundle` — `declaredLoss[]` flows through to
     `feature_flag_states` as `declared-loss:<feature>` entries.
  5. `MigrationHints`.
  6. `SidecarAuditLog` — classifications, candidates, overrides,
     divergences (incl. `aggregate.cascade-default` and
     `dnis.field-promoted`), and losses. Carries
     `bridgeRealization`, `generalSpecVersion`, `realizationSpecVersion`,
     `sidecarSpecVersion`, and `generatedAt` per
     `SPEC-FDPM-BRIDGE` §11.5.
  7. `usl-ng-core.json` companion — sidecar standard sections only.
     The entire `fdpm` section (including `dnis`) is excluded per
     `SPEC-FDPM-BRIDGE` §11.6 / `SPEC-DOMAIN-SIDECAR` §12.1.
- **DNIS managed-fields support** (`SPEC-FDPM-BRIDGE` §17 +
  `SPEC-DOMAIN-SIDECAR` §9.4) at field-promotion granularity:
  declared `fdpm.dnis.managedFields[]` cause the named field to
  disappear from the parent entity's emitted primitive and reappear
  as a `<vendor>:<Entity><Field>Node` sibling joined by a one-to-one
  `<vendor>:<Entity>Has<Field>` relation. Only `z.string()`
  (post-unwrap) is promotable in this revision; other types raise
  `sidecar:dnis-field-invalid`. Source schemas are never mutated.

### Changed

- **`RelationTypeDef.cardinality`** widened from a 3-value union to
  the full 4-value union (`one-to-one | one-to-many | many-to-one |
  many-to-many`) per `SPEC-FDPM-BRIDGE` §8.2. v0.2.0 only emitted
  `"one-to-one"`; the addition is non-breaking for storage/render
  consumers.

### Out of scope (deferred)

- `liftOverrides` — the type is accepted and shipped to the USL-NG
  companion verbatim, but the orchestrator does not yet flip
  inline↔lift at emission. The classifier-driven default is
  preserved; documented in `SPEC-DOMAIN-SIDECAR` §7 for the next
  patch.
- DNIS `lineage: "track"` runtime instance creation — relation type
  is registered; per-edit `dnis:DerivedFrom` instances are the host
  adapter's responsibility per `SPEC-FDPM-BRIDGE` §17.5.

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
