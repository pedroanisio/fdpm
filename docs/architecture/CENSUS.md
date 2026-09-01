---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "fdpm-cli/scripts/build-arch-census.ts"
  date: "generated artifact — see git history for the commit that produced it"
---

<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Source: fdpm-cli/scripts/build-arch-census.ts
     Regenerate: npx tsx scripts/build-arch-census.ts
     Verified by: fdpm-cli/tests/_meta/arch-census-drift.test.ts -->

# Repository census

Counted facts about this repository. **Architecture documents link here
rather than restating these numbers**, because a hand-typed count is a
scheduled lie — the six figures in the 2026-08-28 snapshot were all wrong
within a day of publication.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Source volume

TypeScript only (`.ts`/`.tsx`), excluding `node_modules/`, `dist/`
and plugin `generated/` trees.

| Area | Lines (nearest 1,000) |
|---|---:|
| `src/` | ≈30K |
| `plugins/` | ≈77K |
| `tests/` | ≈49K |
| `scripts/` | ≈43K |
| `packages/zod-bridge/` | ≈7K |
| **Total** | **≈206K** |

## Counts

| Fact | Value | Derivation |
|---|---:|---|
| Plugin directories | 20 | `plugins/*/` |
| `FDPM_*` environment variables | 27 | `FDPM_ENV_VARS` in `src/core/config/env.ts` |
| CI workflows | 3 | `.github/workflows/*.yml` |
| `SPEC-*.md` documents | 13 | `docs/specs/SPEC-*.md` |
| Distinct MCP tool ids | 29 | `fdpm.<group>.<verb>` literals under `src/mcp/` |

## Plugin directories (20)

- `_starter`
- `academic_paper_v0_4_1`
- `acme_business_deck`
- `acme_pitch_deck`
- `agent_memory`
- `dnis`
- `document_plan`
- `document_plan_dnis`
- `formal_specification`
- `formal_specification_dnis`
- `knowledge_cartridge`
- `loop_forward`
- `planning`
- `software_architecture`
- `software_requirements`
- `spec_authoring`
- `spec_authoring_dnis`
- `style`
- `uixo`
- `uml`

## CI workflows (3)

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/release.yml`

## SPEC documents (13)

- `docs/specs/SPEC-CEL-VALIDATOR.md`
- `docs/specs/SPEC-CORE.md`
- `docs/specs/SPEC-DNIS.md`
- `docs/specs/SPEC-DOCUMENT-PLAN.md`
- `docs/specs/SPEC-EXPRESSION-RUNTIME.md`
- `docs/specs/SPEC-MCP-SERVER.md`
- `docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md`
- `docs/specs/SPEC-PLUGIN-NAMING.md`
- `docs/specs/SPEC-RENDER-DSL.md`
- `docs/specs/SPEC-REPL.md`
- `docs/specs/SPEC-SECTIONS-TREE.md`
- `docs/specs/SPEC-UID.md`
- `docs/specs/SPEC-WORKSPACE.md`
