---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.spec-authoring` — SPECs as typed object graphs

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

The plugin that writes this repository's own specifications. Eleven of the
thirteen documents under [`docs/specs/`](../../../docs/specs/) are **rendered
from workbooks bound to this profile**, not typed by hand.

| Property | Value |
|---|---|
| Plugin id | `fdpm.spec-authoring` |
| Version | `0.1.0` |
| Profile | `profile:spec-authoring:0.1` |
| Host compatibility | `>=1.1,<2` |
| Primitive types | 29 |
| Relation types | 18 |
| Validation | 24 rules + 24 `cap:validator` implementations |
| Renderer | `spec:SpecMarkdownRenderer` (`text/markdown`) |
| Also contributes | 1 expr-helper, 1 transformer, 1 importer + 1 exporter (`spec-jsonl`) |

## The idea

A SPEC is not prose with headings — it is an object graph with referential
obligations. This profile models it as one: `Document`, `Section`,
`Stakeholder`, `QualityAttribute`, `ADR`, `Option`, `OpenQuestion`,
`Reference`, `Term`, `Requirement`, and the relations between them
(`spec:Verifies`, `spec:HasSection`, and sixteen more).

The payoff is mechanical: a requirement with no verifying acceptance
criterion is a **validation finding**, not something a reviewer has to notice.
A reference whose `verification` field says `verified` is making a checkable
claim about a locator — which is exactly the discipline
[`DISCLAIMER.md`](../../../DISCLAIMER.md) and `CLAUDE.md` rule 2 demand.

`spec:SpecMarkdownRenderer` then emits the canonical house structure:
frontmatter, PALS banner, disclaimer, numbered sections, ADR table,
trade-off matrix, references.

## How the SPEC corpus is built

```bash
# 1. build the workbook (use a scratch data dir — the script creates it fresh)
D=$(mktemp -d); FDPM_DATA_DIR=$D npx tsx scripts/build-spec-core.ts

# 2. render it to the tracked artifact
FDPM_DATA_DIR=$D npx tsx src/bin/fdpm.ts render spec-core text/markdown \
  --renderer-id spec:SpecMarkdownRenderer -o docs/specs/SPEC-CORE.md
```

Every build script prints its own render command on completion.
[`scripts/_spec-paths.ts`](../../scripts/_spec-paths.ts) is the single source
of truth for SPEC paths — never restate one inline.
`tests/spec-builds-determinism.test.ts` asserts the builds are byte-stable.

## Section numbering: legacy and DNIS

`spec:Section` primitives carry authored numbers. Newer build scripts instead
opt into [`spec_authoring_dnis`](../spec_authoring_dnis/), which pairs this
profile with `profile:dnis:0.1` so numbering is **derived from graph
position** rather than authored. Both paths are live; the DNIS path is the
direction of travel.

## Source layout

```
spec_authoring/
├── fdpm-plugin.json        manifest
├── index.ts                activate()
├── primitives/             the 29 primitive types
├── relations.ts            the 18 relation types
├── validation_rules.ts     24 CEL rules
├── _validators.ts          cap:validator implementations
├── _register_validators.ts validator registration
├── renderers/              spec:SpecMarkdownRenderer
├── renderer_bindings.ts    renderer wiring
├── templates.ts            section scaffolds
├── categories.ts           conceptual buckets
├── scopes.ts               uniqueness scopes
├── ids.ts                  id patterns
└── _capabilities.ts        capability descriptors
```

---

← [Repository README](../../../README.md) · [Plugin index](../)
