---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.spec-authoring-dnis` — spec-authoring × DNIS

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

| Property | Value |
|---|---|
| Plugin id | `fdpm.spec-authoring-dnis` |
| Version | `0.1.0` |
| Profile | `profile:spec-authoring-dnis:0.1` |
| Extends | [`profile:spec-authoring:0.1`](../spec_authoring/) + [`profile:dnis:0.1`](../dnis/) |
| Host compatibility | `>=1.2,<2` |
| Own primitive types | none — composition only |

## What a composition profile is

A composition profile registers **no primitive types of its own**. It declares
`extends` over two existing profiles so a single workbook can hold both
vocabularies at once, and adds only the relation types and renderers that span
the two — edges the individual profiles cannot declare because neither owns
both endpoints.

This is the mechanism that keeps DNIS adoption additive: a domain profile
never learns about node trees, and `profile:dnis:0.1` never learns about the
domain. The join lives here.

## What this pairing buys

Section numbering stops being authored and starts being **derived**.

Under [`spec_authoring`](../spec_authoring/) alone, a `spec:Section` carries a
hand-written `number`. Insert a section above it and every subsequent number
is wrong until someone renumbers by hand — and cross-references that quoted
the old numbers are now silently false.

Under this profile a build script models its structure as `dnis:Node`
primitives instead. Order is a DNIS **position**, identity is the node uid,
and the number is computed at render time by walking the graph. Inserting a
section is one operation; the numbering follows.

The spec-authoring renderer detects which mode a workbook is in and walks the
DNIS node graph when one is present, falling back to `spec:Section` primitives
when it is not. Both modes are live — see
[`docs/specs/SPEC-SECTIONS-TREE.md`](../../../docs/specs/SPEC-SECTIONS-TREE.md),
whose v0.2.0 revision records the pivot from "add `order:int`" to "adopt
SPEC-DNIS for identity and order".

## Used by

The `build-spec-*.ts` scripts that opt into DNIS numbering, including
[`build-spec-document-plan.ts`](../../scripts/build-spec-document-plan.ts).
`tests/spec-builds-determinism.test.ts` gates their output.

---

← [Repository README](../../../README.md) · [Plugin index](../)
