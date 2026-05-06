---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-06"
---

# acme.pitch-deck — Generated Plugin Snapshot

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## What this directory is

The deterministic output of running [`@fdpm/zod-bridge@0.4.0`](../../../fdpm-cli/packages/zod-bridge/) against
[`static/schemas/pitch-deck.schema.v2.ts`](../../schemas/pitch-deck.schema.v2.ts).

Every file here is **auto-generated**. Hand edits will be lost the next time the bridge runs.

## How to regenerate

```bash
cd fdpm-cli/packages/zod-bridge
npm test -- pitch-deck-emit
```

The Vitest test [`tests/pitch-deck-emit.test.ts`](../../../fdpm-cli/packages/zod-bridge/tests/pitch-deck-emit.test.ts) writes to two locations:

- `/tmp/pitch-deck-bridge-out/` — hermetic CI run (test isolation).
- `<repo>/static/generated/acme-pitch-deck/` — this directory; the committed snapshot reviewers diff when the schema or sidecar changes.

Both runs are byte-equal for the same inputs (`writeArtefactsToDir` and `writePluginScaffold` are deterministic per the regression tests in [`scaffold.test.ts`](../../../fdpm-cli/packages/zod-bridge/tests/scaffold.test.ts)).

## File map

| Path | Purpose |
|---|---|
| `fdpm-plugin.json` | Plugin manifest. `id: acme.pitch-deck`, `version: 0.1.0`, 9 capabilities (1× `cap:profile` + 8× `cap:validator` with closed-set `rule_ids`). |
| `index.ts` | Auto-generated entry module. Exports `manifest`, `profile`, `activate(ctx)`. Imports profile from `generated/profile.json`. Carries the CI drift gate. |
| `generated/profile.json` | The `DomainProfile`: 8 PrimitiveTypeDefs + 8 RelationTypeDefs + 103 CEL constraints. The data-model substrate the FDPM host registers. |
| `generated/view-page.json` | One `ViewPagePanel` per emitted primitive (8 total) with field renders. |
| `generated/product-page-bundle.json` | Plugin metadata, schema summaries, relation catalogue, validator rule_id list (192 ids), feature-flag states. |
| `generated/audit.json` | Bridge audit log: classifications, candidates, divergences, losses, version stamps. |
| `generated/migration-hints.json` | `{ profile_id, generated_at, steps: [] }`. Stub until a baseline schema is supplied. |
| `generated/usl-ng-core.json` | USL-NG Core JSON companion. Standard sidecar sections only — `fdpm` is excluded per SPEC-FDPM-BRIDGE §11.6. |
| `capabilities/<Entity>.capabilities.json` | Per-entity descriptors for the four optional capabilities (`cap:renderer` / `cap:importer` / `cap:exporter` / `cap:expr-helper`). The closures themselves cannot be serialised; the descriptors carry the manifest entry shape so the author can paste-and-wire. |

## What the author still wires by hand

The bridge cannot derive these from a Zod schema (per `@PURPOSE.md` and the [`howto-zod-to-fdpm-plugin`](fdpm://workbook/howto-zod-to-fdpm-plugin) workbook):

- **MCP verbs** — domain operations (e.g. `pitch-deck.slide.split`, `pitch-deck.risk.accept`).
- **MCP prompts** — workflow templates (e.g. `pitch-deck/audit-coverage`, `pitch-deck/triage-stale-sources`).
- **Cross-entity validators** that escape the 23-rule CEL table — the schema's `superRefine` items: phase-based audience coverage, time-budget audit (`±20%` of `targetDurationMinutes`), source freshness against `staleAfterDays`, slide `displayNumber` contiguity. These remain as `cap:validator` closures the author imports from a sibling `validators.ts`.
- **Lifecycle hooks** (`cap:lifecycle-hook`) if any are needed.
- **Plugin-version migration handlers** for any future op-kind renames.
- **Per-entity `ctx.registerValidator(...)` wiring** in `activate()` — the closures depend on live Zod imports and cannot be inlined; `index.ts` ships the wiring as commented-out template lines.

## Honest caveats

- `migration-hints.json` is a stub; populated only when the bridge is given a baseline schema to diff.
- The CI drift gate in `index.ts` checks the snapshot's `id` field is correct. It does NOT re-call `assembleDomainProfileFromSidecar` and diff — that would couple plugin runtime to bridge runtime. Tighter gating is a separate decision.
- The optional `capabilities/*.capabilities.json` are descriptor JSONs, not imports — the actual closures are produced by `zodSchemaToMarkdownRenderer` / `zodSchemaToImporter` / `zodSchemaToExporter` / `zodSchemaToExprHelper` calls the author wires in.
