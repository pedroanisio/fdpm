---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.formal-specification-dnis` — formal-specification × DNIS

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

| Property | Value |
|---|---|
| Plugin id | `fdpm.formal-specification-dnis` |
| Version | `0.1.0` |
| Profile | `profile:formal-specification-dnis:0.1` |
| Extends | [`profile:formal-specification:3.0`](../formal_specification/) + [`profile:dnis:0.1`](../dnis/) |
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

A workbook holds [`formal_specification`](../formal_specification/)'s typed
primitives **and** a DNIS node tree, so section numbering is derived from graph
position rather than authored onto `fs:Section` primitives.

The consequence is in the renderers: `formal_specification`'s markdown, HTML
and PDF renderers **DFS-walk the DNIS graph** when one is present instead of
reading the legacy `fs:Section` primitives. One traversal feeds all three
outputs, so the three cannot disagree about structure — a class of bug that
per-renderer numbering logic invites.

## Source layout

```
formal_specification_dnis/
├── fdpm-plugin.json   manifest (declares the extends chain)
└── index.ts           activate(): registers the composition profile
```

Two files is the whole plugin. That is the point of a composition profile.

---

← [Repository README](../../../README.md) · [Plugin index](../)
