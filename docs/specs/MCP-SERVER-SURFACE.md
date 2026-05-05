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
| MCP tool manifest version | 0.1.0 | live `mcp__fdpm__fdpm_health` |
| Transport | stdio | [src/bin/fdpm-mcp.ts](../../fdpm-cli/src/bin/fdpm-mcp.ts) |
| Capabilities advertised | `tools`, `resources` | [src/bin/fdpm-mcp.ts:206-212](../../fdpm-cli/src/bin/fdpm-mcp.ts#L206-L212) |
| `prompts` capability | not declared | n/a |
| `resources/subscribe` | not declared (slice 1) | [src/bin/fdpm-mcp.ts:208-211](../../fdpm-cli/src/bin/fdpm-mcp.ts#L208-L211) |

**Total surface:** 30 tools (12 Tier-1 + 13 Tier-2 + 5 Tier-3) + 1 resource provider.

## Tools — Tier 1: read-only (always advertised)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.health` | health probe | Liveness probe; returns server version, manifest version, profile/project counts |
| `fdpm.profile.list` | list profiles | List loaded `DomainProfile`s with id, version, optional label/name |
| `fdpm.profile.get` | fetch profile | Fetch a `DomainProfile` by id (raw, un-resolved); throws `not_found` if unknown |
| `fdpm.profile.type_info` | type contract | Minimum-sufficient construction contract for one type in a profile (id_pattern, fields, required, constraints). **Call before any create.** |
| `fdpm.project.list` | list projects | List loaded projects with id, name, profile_id, current revision |
| `fdpm.project.get` | fetch project | Full project slice (project meta + primitives + relations + templates) |
| `fdpm.primitive.search` | search primitives | Case-insensitive substring search on `field_values`; optional `type_id` narrow; returns `fields_excerpt` |
| `fdpm.primitive.get` | fetch primitive | Fetch one primitive by id within a project; throws `not_found` if absent |
| `fdpm.relation.list` | list relations | List relations; optional `type_id` / `source_id` / `target_id` AND-narrow |
| `fdpm.relation.get` | fetch relation | Fetch one relation by id |
| `fdpm.log.tail` | recent ops | Most recent N operations from a project's log (oldest-to-newest in slice; default 50, max 1000) |
| `fdpm.log.diff` | ops between revs | Operations between two revisions (inclusive); `to_revision` defaults to current |

## Tools — Tier 2: validating-write (always advertised)

| Tool | Operation | Description |
|---|---|---|
| `fdpm.profile.register` | register profile | Register a new `DomainProfile` (in-memory only at v0.1) |
| `fdpm.project.create` | create project | Create a new project bound to a registered profile; returns Tier-2 envelope with `validation_report` |
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
| `fdpm.project.delete` | delete project | Delete a project; refuses with `category=permission, reason=destructive_disabled` when not enabled |
| `fdpm.primitive.delete` | delete primitive | Delete a primitive by id |
| `fdpm.primitive.delete_batch` | atomic batch delete | Atomically delete 1..500 primitives; first missing id rejects the whole batch |
| `fdpm.relation.delete` | delete relation | Delete a relation by id |
| `fdpm.relation.delete_batch` | atomic batch delete | Atomically delete 1..500 relations; use **before** primitive batch when cleaning up referenced primitives |

## Resources

| URI template | Provider | Read behavior | Read-only? |
|---|---|---|---|
| `fdpm://project/{project_id}/render/{target}` | `fdpm.render` | Runs SPEC-REPL §10.2 lenient tail-replay, then invokes registered renderer for `target` (a MIME type like `text/markdown`, `application/x-yaml`, `application/pdf`). `text/*` → UTF-8 in `text` field; binary → base64 in `blob` | yes |

**Resource enumeration:** `enumerate()` is `loaded_projects × registered_renderers`.
Each loaded plugin contributes one or more renderer targets via
`ctx.registerRenderer(...)`. With six projects loaded and the
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
| Tier-3 advertisement | `--enable-destructive` flag (or `FDPM_MCP_ENABLE_DESTRUCTIVE=1`) — when off, Tier-3 tools are absent from `tools/list` AND refused at dispatch (defense-in-depth) | [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts), `advertisedTools()` |
| Freshness check | Every tool that addresses a `project_id` runs SPEC-REPL §10.2 lenient tail-replay before serving | [src/mcp/tool-metadata-map.ts](../../fdpm-cli/src/mcp/tool-metadata-map.ts) |
| CI manifest gate | `tests/mcp-classification.test.ts` — every public Host method must be in `EXPOSED_HOST_METHODS` or `not-exposed.NOT_EXPOSED`; new unclassified methods break the build | [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts), [src/mcp/not-exposed.ts](../../fdpm-cli/src/mcp/not-exposed.ts) |

## Sources

- Tool inventory: [src/mcp/manifest.ts](../../fdpm-cli/src/mcp/manifest.ts) (`TIER_1_TOOLS`, `TIER_2_TOOLS`, `TIER_3_TOOLS`, `MANIFEST`)
- Tool descriptions: [src/mcp/tools/](../../fdpm-cli/src/mcp/tools/) (one file per tool; `name` + `description` constants)
- Server capability declaration: [src/bin/fdpm-mcp.ts:203-215](../../fdpm-cli/src/bin/fdpm-mcp.ts#L203-L215)
- Resource provider: [src/mcp/resources/](../../fdpm-cli/src/mcp/resources/) — `render.ts`, `registry.ts`, `types.ts`
- Live introspection: `fdpm.health` returned `version: 1.2.0`, `manifest_version: 0.1.0`, `profiles_loaded: 8`, `projects_loaded: 6` at generation time

## See also

- [`SPEC-MCP-SERVER.md`](./SPEC-MCP-SERVER.md) — normative MCP server spec
- [`SPEC-PLUGGABLE-ARCHITECTURE.md`](./SPEC-PLUGGABLE-ARCHITECTURE.md) — plugin contract that produces renderers / profiles
- [`SPEC-REPL.md`](./SPEC-REPL.md) — §10.2 lenient tail-replay used by the freshness gate
