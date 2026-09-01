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
| MCP tool manifest version | 0.4.0 | [src/mcp/schemas.ts](../../fdpm-cli/src/mcp/schemas.ts) `MCP_TOOL_MANIFEST_VERSION` |
| Catalog byte budget | 26,000 B total / 2,000 B per tool (`FDPM_MCP_CATALOG_BUDGET_BYTES` raises the total); measured 23,567 B with destructive off, 22,577 B on | [src/mcp/catalog.ts](../../fdpm-cli/src/mcp/catalog.ts) `DEFAULT_CATALOG_BUDGET`; `fdpm.health.catalog` |
| Instructions byte budget | `SERVER_INSTRUCTIONS` measured at boot against `INSTRUCTIONS_BUDGET_BYTES` (4,000 B); over → refuse to start, exit 2. Same check in CI (`tests/mcp/instructions.test.ts`) | [src/mcp/instructions.ts](../../fdpm-cli/src/mcp/instructions.ts), [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Transport | stdio | [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Capabilities advertised | `tools`, `resources` | [src/bin/fdpm-mcp.ts:206-212](../../fdpm-cli/src/bin/fdpm-mcp.ts#L206-L212) |
| `initialize.instructions` | declared — static `SERVER_INSTRUCTIONS` (cold-start workflow, response contract, gating); 4,000 B budget; mirrored at `fdpm://guide` | [src/mcp/instructions.ts](../../fdpm-cli/src/mcp/instructions.ts) |
| `prompts` capability | declared — plugin-shipped skills via `ctx.registerPrompt`; `prompts/list` metadata only, `prompts/get` validated body (§13.5) | [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts), [src/mcp/prompts.ts](../../fdpm-cli/src/mcp/prompts.ts) |
| `resources/subscribe` | not declared (slice 1) | [src/bin/fdpm-mcp.ts:208-211](../../fdpm-cli/src/bin/fdpm-mcp.ts#L208-L211) |

**Total surface:** 30 tools (12 Tier-1 + 13 Tier-2 + 5 Tier-3) + 4 resource providers (render, profile, schema, guide) + server instructions. The advertised catalog is measured against a byte budget at boot and in CI (SPEC-MCP-SERVER §8.5).

## Tools — Tier 1: read-only (always advertised)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.health` | health probe | Liveness probe; returns server version, manifest version, profile/workbook counts, `catalog` (`tool_count`, `total_bytes`, `budget_total_bytes`, `budget_per_tool_bytes`, `within_budget`), `instructions_bytes`, and `max_result_bytes` (the Tier-1 result ceiling in force) |
| `fdpm.profile.list` | list profiles | List loaded `DomainProfile`s with id, version, optional label/name |
| `fdpm.profile.get` | fetch profile | Fetch a `DomainProfile` by id (raw, un-resolved); throws `not_found` if unknown. `view` selects `full` (default) \| `summary` \| `type_ids` \| `types`; `fields` projects top-level keys. `full` runs from 448 B to 5.4 MB across the loaded profiles and is refused over the result ceiling — the refusal names the views |
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
| `fdpm.workbook.delete` | delete workbook | Delete a workbook. `dry_run: true` → counts preview, no append, passes the gate; otherwise `idempotency_key` required (§8.7) |
| `fdpm.primitive.delete` | delete primitive | Delete a primitive by id. `dry_run` → type + referencing relations; `idempotency_key` required otherwise |
| `fdpm.primitive.delete_batch` | atomic batch delete | Atomically delete 1..500 primitives; first missing id rejects the whole batch; `dry_run` previews every id (first missing → `not_found`); `idempotency_key` required otherwise |
| `fdpm.relation.delete` | delete relation | Delete a relation by id. `dry_run` → endpoints; `idempotency_key` required otherwise |
| `fdpm.relation.delete_batch` | atomic batch delete | Atomically delete 1..500 relations; use **before** primitive batch when cleaning up referenced primitives; `dry_run` / `idempotency_key` as above |

## Resources

| URI template | Provider | Read behavior | Read-only? |
|---|---|---|---|
| `fdpm://workbook/{workbook_id}/render/{target}` | `fdpm.render` | Runs SPEC-REPL §10.2 lenient tail-replay, then invokes registered renderer for `target` (a MIME type like `text/markdown`, `application/x-yaml`, `application/pdf`). `text/*` → UTF-8 in `text` field; binary → base64 in `blob` | yes |
| `fdpm://profile/{profile_id}` (+ `#summary`, `#types`, `#resolved`), `fdpm://profiles` | `fdpm.profile` | Raw / projected / extends-resolved profile as `application/json`; the index lists every registered profile | yes |
| `fdpm://schema/{schema_id}` — today `fdpm://schema/profile` | `fdpm.schema` | DomainProfile JSON Schema (draft-7, `application/schema+json`) derived at read time from the server's own Zod validator; the input shape for `fdpm.profile.register` | yes |
| `fdpm://guide` | `fdpm.guide` | The server instructions as `text/markdown`, byte-identical to `initialize.instructions` | yes |
| `fdpm://audit/report[/{window}]` — `window` ∈ `1h` \| `24h` \| `7d` \| `all` | `fdpm.audit` | Aggregated `mcp-audit.jsonl` for the data dir as `application/json`: per-tool outcomes, error classes (`rule:<rule_id>` for rejections, `category/reason` for protocol errors), success-rate SLO, p50/p95 (§9.5). Empty report for an in-memory host | yes |

**Resource enumeration:** `enumerate()` is `loaded_projects × registered_renderers`.
Each loaded plugin contributes one or more renderer targets via
`ctx.registerRenderer(...)`. With six workbooks loaded and the
`software_architecture` (md+yaml), `spec_authoring` (md),
`formal_specification` (md+html+pdf), and `planning` (md+svg+md) plugins
active, `resources/list` advertises ~24+ concrete render URIs.

Source: [src/mcp/resources/render.ts](../../fdpm-cli/src/mcp/resources/render.ts)

## Prompts (plugin-shipped skills)

| Prompt | Plugin | Arguments | Body |
|---|---|---|---|
| `planning/triage_iteration` | `fdpm.planning` | `workbook_id` (required), `iteration_id`, `focus` | When to use; nine-step call order over tools + resources; failure modes by `plan:val:*` id |

Contract: listing entry ≤ 600 B; body ≤ 16 KB with the three sections; arguments resolved/type-checked; render output validated. Source: [src/mcp/prompts.ts](../../fdpm-cli/src/mcp/prompts.ts), [plugins/planning/prompts.ts](../../fdpm-cli/plugins/planning/prompts.ts).

## What's NOT exposed

| Capability | Status | Note |
|---|---|---|
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
| Tier-3 idempotency | Real destructive calls MUST carry `idempotency_key`; session cache `(tool, key) → result`, TTL 5 min, cap 1,000 — same args replay (`replayed: true` in audit), different args → `conflict`/`idempotency_key_reused`, concurrent same-key calls coalesce; gate refusals never cached | [src/mcp/dispatch.ts](../../fdpm-cli/src/mcp/dispatch.ts) step 5b, [src/mcp/session.ts](../../fdpm-cli/src/mcp/session.ts) `IdempotencyCache` |
| Tier-3 dry-run | `dry_run: true` (strict boolean) bypasses the destructive and confirmation gates, runs the core delete preview, appends nothing; audit `start` carries `tier`/`dry_run`/`idempotency_key` before the handler runs | [src/core/operations/delete-preview.ts](../../fdpm-cli/src/core/operations/delete-preview.ts) |
| Tool-result ceiling | A Tier-1 result over `FDPM_MCP_MAX_RESULT_BYTES` (default 32,768 B) is refused with `quota`/`result_too_large`, carrying the measured `bytes`, the `cap`, and the tool's declared `narrowing` arguments. Never truncated. Tier-2/3 results are measured into the audit log but served, because the append has already happened. Every completed handler run records `result_bytes` | [src/mcp/result-budget.ts](../../fdpm-cli/src/mcp/result-budget.ts), [src/mcp/dispatch.ts](../../fdpm-cli/src/mcp/dispatch.ts) |
| Resource byte ceiling | A `resources/read` payload over `FDPM_MCP_MAX_RESOURCE_BYTES` (default 1,048,576 B) is refused with `quota`/`resource_too_large`; measured on what crosses the wire (base64 length for a blob) | [src/mcp/read-guard.ts](../../fdpm-cli/src/mcp/read-guard.ts) |
| Audit `rule_ids` | Tier-2 rejections record the distinct `rule_ids` they fired on the audit `complete` entry; the audit report turns them into `rule:<id>` error classes | [src/mcp/dispatch.ts](../../fdpm-cli/src/mcp/dispatch.ts) `distinctRuleIds`, [src/persistence/mcp-audit-report.ts](../../fdpm-cli/src/persistence/mcp-audit-report.ts) |
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
