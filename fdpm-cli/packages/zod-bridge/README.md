---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# `@fdpm/zod-bridge`

> Deterministic, one-way translation from **Zod v4** schemas plus a
> `defineDomain()` sidecar into runnable FDPM plugin artefacts.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Status

`v0.4.0` — sidecar-driven plugin emission is implemented and tested. The bridge
now writes deterministic `generated/*.json` artefacts, `fdpm-plugin.json`, and
`index.ts`, and derives the optional `cap:renderer`, `cap:importer`,
`cap:exporter`, and `cap:expr-helper` surfaces from schemas.

## Specification

This package is the reference implementation of the workbook
[`howto-zod-to-fdpm-plugin`](fdpm://workbook/howto-zod-to-fdpm-plugin).
Every claim the package makes — sidecar validation, soundness, determinism,
validator-Zod equivalence, round-trip I/O, and scaffold path safety — is
covered by tests in the `tests/` directory.

### `SPEC-DOMAIN-SIDECAR` and `SPEC-FDPM-BRIDGE(-ZOD)` are not in this repository

Source comments, tests and this package's CHANGELOG cite three specification
documents by section number — `SPEC-DOMAIN-SIDECAR`, `SPEC-FDPM-BRIDGE` and
`SPEC-FDPM-BRIDGE-ZOD`. **None of them has ever existed under `docs/specs/`.**
They were authored outside this tree and the citations were kept as written.

Do not go looking for them, and do not treat a section reference such as
"SPEC-DOMAIN-SIDECAR §11.3" as something you can open and check. Where the
contract matters, the executable statement of it is:

- [`src/sidecar-types.ts`](./src/sidecar-types.ts) — the sidecar manifest shape
- [`src/sidecar-validator.ts`](./src/sidecar-validator.ts) — parse-time rules
- [`src/sidecar-hash.ts`](./src/sidecar-hash.ts) — the `zod-ast-canonical-v1` hash
- this README's *What gets emitted*, *The 23 CEL translation rules* and
  *Feature flags* sections
- the suites under [`tests/`](./tests/)

A 2026-08-29 doc-hygiene audit found one of these citations rendered as a
Markdown link to a file that does not exist, and a peer-SPEC reference in
`SPEC-DOCUMENT-PLAN.md` marked `verified` against an absent locator. Both are
corrected; the remaining plain-text citations are left in place because they
carry real section numbers from documents that exist somewhere — but a reader
of this repository cannot verify them, and per
[`DISCLAIMER.md`](../../../DISCLAIMER.md) that limitation is stated rather
than hidden.

## Install

```bash
npm install @fdpm/zod-bridge zod@^4
```

`zod` is a peer dependency. The bridge itself depends only on
`@marcbachmann/cel-js` for offline CEL syntax compatibility.

## Quick start

```ts
import { z } from 'zod';
import {
  assembleDomainProfile,
  stableStringify,
  zodSchemaToMarkdownRenderer,
  zodSchemaToImporter,
  zodSchemaToExporter,
  zodSchemaToExprHelper,
} from '@fdpm/zod-bridge';

const Customer = z.object({
  id: z.string().regex(/^cust-[a-z0-9]+$/),
  name: z.string().min(1).max(120),
  tier: z.enum(['free', 'pro', 'enterprise']),
  age: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).max(8),
});

const result = assembleDomainProfile({
  schemas: { Customer },
  options: {
    profileId: 'profile:acme-customers:0.1',
    vendor: 'acme',
    pluginVersion: '0.1.0',
    hostCompatibility: '>=0.5.0 <0.6.0',
  },
  pluginId: 'acme.customers',
  schemaSources: { Customer: 'schemas/customer.ts' },
});

// Write the four artefacts to disk for the CI snapshot gate.
import { writeFileSync } from 'node:fs';
writeFileSync('generated/profile.json', stableStringify(result.profile));
writeFileSync('generated/view-page.json', stableStringify(result.viewPage));
writeFileSync('generated/product-page-bundle.json', stableStringify(result.productPage));
writeFileSync('generated/migration-hints.json', stableStringify(result.migrationHints));

// Optional capabilities can be derived from the same schema.
const renderer = zodSchemaToMarkdownRenderer(Customer, {
  primitive_type_id: 'acme:Customer',
});
const importer = zodSchemaToImporter(Customer, {
  primitive_type_id: 'acme:Customer',
  idFrom: (customer) => customer.id,
  pluginId: 'acme.customers',
  typeName: 'customer',
});
const exporter = zodSchemaToExporter(Customer, {
  primitive_type_id: 'acme:Customer',
  filename: () => 'customers.json',
  pluginId: 'acme.customers',
});
const helper = zodSchemaToExprHelper(Customer, {
  function_name: 'acme.isValidCustomer',
  arity: 1,
  arg_types: ['dyn'],
  return_type: 'boolean',
});
```

## What gets emitted

| Artefact | Type | Purpose |
|---|---|---|
| `result.profile` | `DomainProfile` | Argument to `ctx.registerProfile()` at activation |
| `result.viewPage` | `ViewPageDescriptor` | Emitted to `plugins/<id>/generated/view-page.json` and held by the CI drift gate. No runtime consumer today: the host registers no `fdpm://plugin/...` resource. |
| `result.productPage` | `ProductPageBundle` | Structured facts for the README; drift-protected |
| `result.migrationHints` | `MigrationHints` | Future migration input for `flag:auto-migration` |
| `result.audit` | `SidecarAuditLog` | Classifications, overrides, divergences, and declared losses |
| `result.uslNgCompanion` | `UslNgCompanion` | USL-NG Core companion sections from the sidecar |
| `result.ruleIdsByType` | `Record<id, string[]>` | Closed set of rule_ids the validator may emit; goes verbatim into `manifest.capabilities[].metadata.rule_ids` |

## The 23 CEL translation rules

The bridge emits CEL constraints for any Zod refinement that matches one of
the 23 rows of [`type:ZodToCelTranslationTable`](fdpm://workbook/howto-zod-to-fdpm-plugin#type:ZodToCelTranslationTable).
Refinements outside the table fall back to validator findings via `safeParse`.

| # | Zod node | Emitted CEL fragment |
|---|---|---|
| 1–3 | `z.string().min/max/length(n)` | `size(self.x) {>= == <=} n` |
| 4 | `z.string().regex(/p/)` (no flags) | `self.x.matches('p')` |
| 5–7 | `.startsWith / .endsWith / .includes` | matching CEL methods |
| 8 | `z.iso.datetime()` | `timestamp(self.x).getFullYear() > 0` |
| 9–14 | `z.number()` `.min / .max / .gt / .lt / .positive / .negative / .nonneg / .nonpos` | comparison ops |
| 15 | `.multipleOf(k)` | `self.x % k == 0` |
| 16 | `z.enum([...])` | `self.x in [...]` |
| 17–20 | `z.array(T)` `.min / .max / .length / .nonempty` | `size(self.x) ...` |
| 21 | `.optional()` | (no CEL; field-level `required: false`) |
| 22 | `.nullable()` | composes with inner |
| 23 | `z.literal(v)` | `self.x == v` |

## Feature flags

Thirteen feature-flag states in the bridge output record
*every* construct the bridge does not auto-translate, with a documented
implementation path:

| State | Flags |
|---|---|
| `enabled` (default-on) | `flag:zod-intersection` |
| `behind-flag` (opt-in escape hatch exists) | `flag:zod-cross-field-refine`, `flag:zod-discriminated-union`, `flag:zod-recursive-lazy`, `flag:zod-brand`, `flag:zod-regex-flags`, `flag:zod-pipe-transform`, `flag:zod-default` |
| `disabled` (fallback only) | `flag:scope-server-only`, `flag:zod-v3-support`, `flag:auto-migration`, `flag:zod-async-refine`, `flag:zod-function-promise` |

Each flag's `context` field on its paired `fs:DesignDecision` carries the
five-tuple: `state | default | owner | sunset_criterion | migration_path |
trigger_event`. Read those before opening an issue to lift a limitation.

## Tests

```bash
npm test
```

Runs the package regression suite:

| Test file | Property verified |
|---|---|
| `mapping.test.ts` | Field-mapping coverage |
| `cel-translation.test.ts` | CEL translation soundness |
| `validator-equiv.test.ts` | Validator/Zod equivalence |
| `roundtrip.test.ts` | Importer/exporter round-trip |
| `determinism.test.ts` | Byte-stable output for the CI gate |
| `sidecar-validator.test.ts` | Sidecar parse-time validation |
| `sidecar-orchestrator.test.ts` | Sidecar-driven artefact assembly |
| `scaffold.test.ts` | File emission, path safety, and runnable plugin scaffold |
| `pitch-deck-emit.test.ts`, `pitch-deck-trial.test.ts` | Production-schema emission path |
| `classifier.test.ts`, `regressions.test.ts` | Lift classification and trial-surfaced bug fixes |

## Public API

```ts
// Orchestrator
function assembleDomainProfile(args: AssembleArgs): AssembleResult;

// Per-step factories
function zodSchemaToPrimitiveType(name, schema, opts);
function zodSchemaToValidator(schema, opts);
function zodSchemaToCelConstraints(schema, ctx);
function buildViewPageDescriptor(pluginId, primitives, opts, generatedAt);
function buildProductPageBundle(args);

// Sidecar input and full artefact assembly
function defineDomain(domain);
function assembleDomainProfileFromSidecar(args);

// Optional capability derivation
function zodSchemaToMarkdownRenderer(schema, opts);
function zodSchemaToImporter(schema, opts);
function zodSchemaToExporter(schema, opts);
function zodSchemaToExprHelper(schema, opts);

// File emission
function writeArtefactsToDir(result, opts);
function writePluginScaffold(result, opts);

// Utility
function stableStringify(value): string;
```

See `src/index.ts` for the complete export list.

## Versioning

The bridge follows semver. Output stability across patch versions is a
contract: a `0.1.x` release MUST emit the same JSON for the same input. Minor
version bumps (`0.x.0`) MAY change emitted JSON; consumers SHOULD expect to
regenerate `generated/profile.json` and bump their plugin version when
upgrading.

## Related

- Workbook (spec): `howto-zod-to-fdpm-plugin`
- Plugin contract: `spec-plugin-authoring-howto`
- Host CEL evaluator: `@marcbachmann/cel-js@^7`
- Zod: `^4.0.0` (peer dep)
