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
