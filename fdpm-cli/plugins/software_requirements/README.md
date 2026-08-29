---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 5 (1M context) via Claude Code (doc-hygiene skill)"
  date: "2026-08-29"
---

# `fdpm.software-requirements` — SRS with traceability

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

A Software Requirements Specification profile: requirements, their
traceability edges, provenance, agreement state, change control, and the
baseline rules that decide when a requirement set is fit to freeze.

| Property | Value |
|---|---|
| Plugin id | `fdpm.software-requirements` |
| Version | `0.2.0` |
| Profile | `profile:software-requirements:0.2` |
| Host compatibility | `>=1.2,<2` |
| Primitive types | 8 |
| Relation types | 17 |
| Schema source | [`schemas/software-requirements.ts`](./schemas/software-requirements.ts) |

## What it is for

A requirement nobody agreed to, that traces to nothing and cites no source,
is a sentence — not a requirement. This profile makes those obligations
structural: **provenance** records where a requirement came from,
**agreement** records who accepted it, **traceability** relations connect it
to what satisfies and verifies it, and **change control** governs edits after
a baseline.

The 17 relation types are the point of the plugin. Coverage questions — which
requirements have no verification, which trace to a withdrawn source — become
graph queries and validation findings rather than spreadsheet review.

## Generation status — read before editing

This plugin is **hand-assembled from Zod**, not bridge-generated. It has a
schema and a [`generated/`](./generated/) tree but **no `scripts/run-bridge.ts`
and no CI workflow**, which means there is no drift gate: nothing mechanically
proves `generated/profile.json` still matches `schemas/software-requirements.ts`.

The August 2026 architecture snapshot recorded the consequence — schema and
`profile.json` were edited in tandem by hand on the `ingest/sr-profile-plugin`
branch. Until a `run-bridge.ts` exists here, **treat any edit as touching both
files and verify by hand.** This is the one plugin in the tree where the
generated artifacts are on the honour system.

## Source layout

```
software_requirements/
├── fdpm-plugin.json   manifest
├── index.ts           activate()
├── schemas/           Zod source
└── generated/         profile.json etc. — NO automated drift gate
```

---

← [Repository README](../../../README.md) · [Plugin index](../)
