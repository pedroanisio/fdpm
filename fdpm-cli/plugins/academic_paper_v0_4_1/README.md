---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.academic-paper` — academic papers as validated graphs

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

A bridge-generated plugin modelling an academic paper as a typed graph:
claims, evidence, methods, findings, limitations, citations, figures, tables,
equations — and the referential obligations between them.

| Property | Value |
|---|---|
| Plugin id | `fdpm.academic-paper-v0-4-1` |
| Version | `0.5.0` (plugin); the profile id keeps the source ontology's `0.4.1` |
| Profile | `profile:academic-paper:0.4.1` |
| Host compatibility | `>=1.1,<2` |
| Primitive types | 24 |
| Relation types | 61 |
| CEL rules | 279 |
| Validators | 24 per-primitive + 1 paper-coherence `cap:validator` |
| Renderers / importers / exporters | 24 each |
| Generated from | [`schemas/academic-paper.ts`](./schemas/academic-paper.ts) via `@fdpm/zod-bridge` |

Eighteen entities span the empirical, theoretical, methodological,
literary-critical, review, historical, essay and monograph genres.

## Generated, not hand-written

Everything under [`generated/`](./generated/) is produced by
[`scripts/run-bridge.ts`](./scripts/run-bridge.ts) from the Zod schema plus
[`sidecar.ts`](./sidecar.ts). **Do not edit `generated/` by hand** — change
the schema or the sidecar and regenerate:

```bash
npx tsx plugins/academic_paper_v0_4_1/scripts/run-bridge.ts          # write
npx tsx plugins/academic_paper_v0_4_1/scripts/run-bridge.ts --check  # CI gate
```

`--check` rebuilds in memory and diffs against the committed tree. Drift means
the schema changed without regeneration.

> **This plugin has a `run-bridge.ts` but no dedicated CI step.** The
> repository has no per-plugin workflows (the nested ones were removed on
> 2026-08-30); the root `.github/workflows/ci.yml` runs the whole test suite.
> The bridge drift gate here (`--check`) is available but not a separate CI
> step — run it yourself before committing a schema change.

## Paper coherence

The 279 CEL rules cover what a schema can state per field. The
**paper-coherence validator** covers what it cannot: referential integrity
across the graph, and kind-conditional required-ness — a field that is
mandatory for an empirical paper and meaningless for an essay cannot be
expressed as a plain `required` flag.

This is the general shape of validation in FDPM: schema conformance is not
correctness, so constraints the schema cannot express are asserted in code.

## Version twin

The `v0_4_1` suffix is deliberate. `profile:academic-paper:0.3` was withdrawn
once a structural diff proved the two profiles identical up to vendor prefix
— see the `Removed` section of [`CHANGELOG.md`](../../CHANGELOG.md). Python
tooling for `0.3` still sits at the repository root (`acad_validate.py`) and
has **not** been moved forward to `0.4.1`.

## Source layout

```
academic_paper_v0_4_1/
├── fdpm-plugin.json   manifest
├── index.ts           activate()
├── schemas/           the Zod source of truth
├── sidecar.ts         defineDomain() — bridge instructions
├── scripts/           run-bridge.ts (+ --check)
├── capabilities/      capability descriptors
└── generated/         GENERATED — profile.json, view-page.json, …
```

---

← [Repository README](../../../README.md) · [Plugin index](../)
