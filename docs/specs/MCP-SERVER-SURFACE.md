---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code (fdpm MCP introspection + source read)"
  date: "2026-05-05"
---

# fdpm MCP — full feature surface

Reference catalogue of every feature the `fdpm-mcp` server exposes over MCP.
Generated from a live inspection of the running server (`mcp__fdpm__fdpm_health`,
ToolSearch) cross-checked against the in-tree source — see [§Sources](#sources)
for file:line citations. Companion to [`SPEC-MCP-SERVER.md`](./SPEC-MCP-SERVER.md):
this document is the *what is exposed today* table; the spec is the *what the
contract says* prose.

## Disclaimer

This work is subject to the methodological caveats and commitments described
in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or
> verifiable reference should be taken for granted.

## Server identity

| Field | Value | Source |
|---|---|---|
| Server name | `fdpm-mcp` | [src/bin/fdpm-mcp.ts:198](../../fdpm-cli/src/bin/fdpm-mcp.ts#L198) |
| Server version | 1.2.0 | live `mcp__fdpm__fdpm_health` |
| MCP tool manifest version | 0.3.0 | [src/mcp/schemas.ts](../../fdpm-cli/src/mcp/schemas.ts) `MCP_TOOL_MANIFEST_VERSION` |
| Catalog byte budget | 26,000 B total / 2,000 B per tool (`FDPM_MCP_CATALOG_BUDGET_BYTES` raises the total); measured 23,567 B with destructive off, 22,577 B on | [src/mcp/catalog.ts](../../fdpm-cli/src/mcp/catalog.ts) `DEFAULT_CATALOG_BUDGET`; `fdpm.health.catalog` |
| Instructions byte budget | `SERVER_INSTRUCTIONS` measured at boot against `INSTRUCTIONS_BUDGET_BYTES` (4,000 B); over → refuse to start, exit 2. Same check in CI (`tests/mcp/instructions.test.ts`) | [src/mcp/instructions.ts](../../fdpm-cli/src/mcp/instructions.ts), [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Transport | stdio | [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Capabilities advertised | `tools`, `resources` | [src/bin/fdpm-mcp.ts:206-212](../../fdpm-cli/src/bin/fdpm-mcp.ts#L206-L212) |
| `initialize.instructions` | declared — static `SERVER_INSTRUCTIONS` (cold-start workflow, response contract, gating); 4,000 B budget; mirrored at `fdpm://guide` | [src/mcp/instructions.ts](../../fdpm-cli/src/mcp/instructions.ts) |
| `prompts` capability | not declared (plugin prompts are v0.2; `instructions` carries the generic layer meanwhile) | n/a |
| `resources/subscribe` | not declared (slice 1) | [src/bin/fdpm-mcp.ts:208-211](../../fdpm-cli/src/bin/fdpm-mcp.ts#L208-L211) |

**Total surface:** 30 tools (12 Tier-1 + 13 Tier-2 + 5 Tier-3) + 4 resource providers (render, profile, schema, guide) + server instructions. The advertised catalog is measured against a byte budget at boot and in CI (SPEC-MCP-SERVER §8.5).

## Tools — Tier 1: read-only (always advertised)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.health` | health probe | Liveness probe; returns server version, manifest version, profile/workbook counts, `catalog` (`tool_count`, `total_bytes`, `budget_total_bytes`, `budget_per_tool_bytes`, `within_budget`), and `instructions_bytes` |
| `fdpm.profile.list` | list profiles | List loaded `DomainProfile`s with id, version, optional label/name |
| `fdpm.profile.get` | fetch profile | Fetch a `DomainProfile` by id (raw, un-resolved); throws `not_found` if unknown |
| `fdpm.profile.type_info` | type contract | Minimum-sufficient construction contract for one type in a profile (id_pattern, fields, required, constraints). **Call before any create.** |
| `fdpm.workbook.list` | list workbooks | List loaded workbooks with id, name, profile_id, current revision |
| `fdpm.workbook.get` | fetch workbook | Full workbook slice (workbook meta + primitives + relations + templates) |
| `fdpm.primitive.search` | search primitives | Case-insensitive substring search on `field_values`; optional `type_id` narrow; returns `fields_excerpt` |
| `fdpm.primitive.get` | fetch primitive | Fetch one primitive by id within a workbook; throws `not_found` if absent |
| `fdpm.relation.list` | list relations | List relations; optional `type_id` / `source_id` / `target_id` AND-narrow |
| `fdpm.relation.get` | fetch relation | Fetch one relation by id |
| `fdpm.log.tail` | recent ops | Most recent N operations from a workbook's log (oldest-to-newest in slice; default 50, max 1000) |
| `fdpm.log.diff` | ops between revs | Operations between two revisions (inclusive); `to_revision` defaults to current |

## Tools — Tier 2: validating-write (always advertised)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.profile.register` | register profile | Register a `DomainProfile` (persisted). Input is an **opaque** `profile` object; read `fdpm://schema/profile` for the shape. Validated server-side with the same Zod schema: malformed → Tier-2 rejection (`ok: false`, findings `core:profile-schema` with `field_path`); unregistered `extends` parent → `not_found` |
| `fdpm.workbook.create` | create workbook | Create a new workbook bound to a registered profile; returns Tier-2 envelope with `validation_report` |
| `fdpm.primitive.create` | create primitive | Create one primitive; runs §7 validation pipeline; rejection via envelope (`ok: false`, `isError: false`) |
| `fdpm.primitive.create_batch` | atomic batch create | Atomically create 1..500 primitives; ALL succeed or WHOLE batch rolls back; later entries see earlier ones |
| `fdpm.primitive.replace` | full overwrite | Replace `field_values` entirely; `type_id` immutable; supports `expected_revision` (If-Match) |
| `fdpm.primitive.patch` | partial merge | Partial-update `field_values`; only touched paths are re-validated |
| `fdpm.primitive.field_patch` | JSON Patch | Apply a JSON Patch to `field_values`; touched-path validation |
| `fdpm.relation.create` | create relation | Create a typed edge between two primitives; runs validation pipeline |
| `fdpm.relation.create_batch` | atomic batch create | Atomically create 1..500 relations; cardinality bounds account for in-flight projection |
| `fdpm.relation.replace` | full overwrite | Replace relation `field_values`; supports If-Match |
| `fdpm.relation.patch` | partial merge | Partial-update relation `field_values` |
| `fdpm.structure.reorder` | reorder children | Change ordering of structural children under a parent |
| `fdpm.structure.reparent` | move in tree | Re-parent a primitive within the structural hierarchy |

## Tools — Tier 3: destructive (off by default; opt-in via `--enable-destructive`)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.workbook.delete` | delete workbook | Delete a workbook; refuses with `category=permission, reason=destructive_disabled` when not enabled |
| `fdpm.primitive.delete` | delete primitive | Delete a primitive by id |
| `fdpm.primitive.delete_batch` | atomic batch delete | Atomically delete 1..500 primitives; first missing id rejects the whole batch |
| `fdpm.relation.delete` | delete relation | Delete a relation by id |
| `fdpm.relation.delete_batch` | atomic batch delete | Atomically delete 1..500 relations; use **before** primitive batch when cleaning up referenced primitives |

## Resources

| URI template | Provider | Read behavior | Read-only? |
|---|---|---|---|
| `fdpm://workbook/{workbook_id}/render/{target}` | `fdpm.render` | Runs SPEC-REPL §10.2 lenient tail-replay, then invokes registered renderer for `target` (a MIME type like `text/markdown`, `application/x-yaml`, `application/pdf`). `text/*` → UTF-8 in `text` field; binary → base64 in `blob` | yes |
| `fdpm://profile/{profile_id}` (+ `#summary`, `#types`, `#resolved`), `fdpm://profiles` | `fdpm.profile` | Raw / projected / extends-resolved profile as `application/json`; the index lists every registered profile | yes |
| `fdpm://schema/{schema_id}` — today `fdpm://schema/profile` | `fdpm.schema` | DomainProfile JSON Schema (draft-7, `application/schema+json`) derived at read time from the server's own Zod validator; the input shape for `fdpm.profile.register` | yes |
| `fdpm://guide` | `fdpm.guide` | The server instructions as `text/markdown`, byte-identical to `initialize.instructions` | yes |

**Resource enumeration:** `enumerate()` is `loaded_projects × registered_renderers`.
Each loaded plugin contributes one or more renderer targets via
`ctx.registerRenderer(...)`. With six workbooks loaded and the
`software_architecture` (md+yaml), `spec_authoring` (md),
`formal_specification` (md+html+pdf), and `planning` (md+svg+md) plugins
active, `resources/list` advertises ~24+ concrete render URIs.

Source: [src/mcp/resources/render.ts](../../fdpm-cli/src/mcp/resources/render.ts)

## What's NOT exposed

| Capability | Status | Note |
|---|---|---|
| MCP `prompts` capability | not declared | no handlers registered |
| MCP `resources/subscribe` | not declared | `subscribe: false` implicit; deferred to slice 2 with freshness-watcher |
| MCP `roots` | not used | n/a |
| MCP `sampling` | not used | n/a |
| MCP `logging` | not used | n/a |
| MCP `completion` | not used | n/a |
| Direct CEL eval / ad-hoc query | not exposed | only structured tools |
| Renderer invocation as a tool | not exposed | renderers reachable only via `resources/read` |

## Operational gates

| Gate | Mechanism | Source |
|---|---|---|
| Tier-3 dispatch | `--enable-destructive` flag (or `FDPM_MCP_ENABLE_DESTRUCTIVE=1`) — when off, Tier-3 tools are advertised with a `⚠ DISABLED` banner (v0.1.2) and refused at dispatch with `permission`/`destructive_disabled` | [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts), `advertisedTools()` |
| Catalog byte budget | Advertised catalog (Core + plugin tools) measured in UTF-8 bytes at boot; over `DEFAULT_CATALOG_BUDGET` (26,000 B total / 2,000 B per tool) → refuse to start, exit 2, violations on stderr. `FDPM_MCP_CATALOG_BUDGET_BYTES` raises the total only. Same budget enforced in CI by `tests/mcp/catalog-budget.test.ts`; `tools/list._meta.catalog_bytes` and `fdpm.health.catalog` expose the measurement | [src/mcp/catalog.ts](../../fdpm-cli/src/mcp/catalog.ts), [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Freshness check | Every tool that addresses a `workbook_id` runs SPEC-REPL §10.2 lenient tail-replay before serving | [src/mcp/tool-metadata-map.ts](../../fdpm-cli/src/mcp/tool-metadata-map.ts) |
| CI manifest gate | `tests/mcp-classification.test.ts` — every public Host method must be in `EXPOSED_HOST_METHODS` or `not-exposed.NOT_EXPOSED`; new unclassified methods break the build | [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts), [src/mcp/not-exposed.ts](../../fdpm-cli/src/mcp/not-exposed.ts) |

## Sources

- Tool inventory: [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts) (`TIER_1_TOOLS`, `TIER_2_TOOLS`, `TIER_3_TOOLS`, `MANIFEST`)
- Tool descriptions: [src/mcp/tools/](../../fdpm-cli/src/mcp/tools/) (one file per tool; `name` + `description` constants)
- Server capability declaration: [src/bin/fdpm-mcp.ts:203-215](../../fdpm-cli/src/bin/fdpm-mcp.ts#L203-L215)
- Resource providers: [src/mcp/resources/](../../fdpm-cli/src/mcp/resources/) — `render.ts`, `profile.ts`, `schema.ts`, `guide.ts`, `registry.ts`, `types.ts`
- Server instructions: [src/mcp/instructions.ts](../../fdpm-cli/src/mcp/instructions.ts); contract test [tests/mcp/instructions.test.ts](../../fdpm-cli/tests/mcp/instructions.test.ts)
- Catalog measurement and budget: [src/mcp/catalog.ts](../../fdpm-cli/src/mcp/catalog.ts); CI gate [tests/mcp/catalog-budget.test.ts](../../fdpm-cli/tests/mcp/catalog-budget.test.ts); stdio E2E [tests/mcp/fdpm-mcp-stdio.test.ts](../../fdpm-cli/tests/mcp/fdpm-mcp-stdio.test.ts)
- Live introspection: `fdpm.health` returned `version: 1.2.0`, `manifest_version: 0.1.0`, `profiles_loaded: 8`, `projects_loaded: 6` at original generation time; manifest 0.2.0 / catalog rows added 2026-08-28 from source (`Claude Fable 5 via Claude Code`)

## See also

- [`SPEC-MCP-SERVER.md`](./SPEC-MCP-SERVER.md) — normative MCP server spec
- [`SPEC-PLUGGABLE-ARCHITECTURE.md`](./SPEC-PLUGGABLE-ARCHITECTURE.md) — plugin contract that produces renderers / profiles
- [`SPEC-REPL.md`](./SPEC-REPL.md) — §10.2 lenient tail-replay used by the freshness gate
