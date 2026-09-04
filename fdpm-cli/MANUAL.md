---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
revision: "0.2.0 — pass-2 refinement: corrected version-output field names, fixed broken tsx alias, fixed wrong log/undo flag names, replaced fabricated exit-code table with the real EXIT_CODE_FOR_CATEGORY map, completed read-surface description, added missing taxonomy entries"
---

# fdpm — User Manual

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

A hands-on walkthrough of the `fdpm` CLI, organised by what you actually want
to do. Every example in this manual is one that has been run end-to-end against
the in-tree `formal-specification` plugin and the roadmap fixture
(`roadmap-unified-v04.fs-v3.json`); copy-paste should work.

For the full normative reference (every command, every flag, every option),
see the repository [`README.md`](../README.md). For the SPEC, see
[../docs/specs/SPEC-CORE.md](../docs/specs/SPEC-CORE.md) and
[../docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md](../docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md).

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Mental model](#2-mental-model-in-30-seconds)
3. [Storage and persistence](#3-storage-and-persistence)
4. [Working with profiles](#4-working-with-profiles)
5. [Creating and inspecting workbooks](#5-creating-and-inspecting-workbooks)
6. [Editing primitives](#6-editing-primitives) — five surfaces
7. [Editing relations](#7-editing-relations)
8. [Structural edits — reorder & reparent](#8-structural-edits--reorder--reparent)
9. [Batch transactions](#9-batch-transactions) — and what batch reports mean
10. [Importing legacy data with cap:importer plugins](#10-importing-legacy-data-with-capimporter-plugins)
11. [Inspecting the operation log](#11-inspecting-the-operation-log)
12. [Time-travel and undo](#12-time-travel-and-undo)
13. [Templates and test-suites](#13-templates-and-test-suites)
14. [Splitting and cloning workbooks](#14-splitting-and-cloning-workbooks)
15. [Plugin administration](#15-plugin-administration)
16. [Rendering workbook output](#16-rendering-workbook-output)
17. [Workbook-wide validation](#17-workbook-wide-validation)
18. [Diffing and migration](#18-diffing-and-migration)
19. [Output, errors, and exit codes](#19-output-errors-and-exit-codes)
20. [Recipes — common workflows](#20-recipes--common-workflows)
21. [Troubleshooting](#21-troubleshooting)
22. [MCP audit report](#22-mcp-audit-report)
23. [Remote MCP server](#23-remote-mcp-server) — Claude Connectors and ChatGPT

---

## 1. Quick start

```sh
# From the repo root.
cd /path/to/repo

# 1. Install once.
npm --prefix fdpm-cli install

# 2. Pick a data dir (this is where the operation log lives — keep it).
export FDPM_DATA_DIR=$HOME/.fdpm-cli

# 3. Build once and point `fdpm` at the generated CLI entrypoint.
#
npm --prefix fdpm-cli run build
alias fdpm='node /path/to/repo/fdpm-cli/dist/src/bin/fdpm.js'

# 4. Smoke test.
fdpm version --json
# => { "spec_core": "1.3", "spec_core_revision": "1.3.0",
#      "host": "fdpm-cli", "host_version": "1.3.0" }

fdpm health readyz
# => ready profiles=N

fdpm profile list --json | jq '.profiles | map(.id)'
# => ["core:empty", "profile:academic-paper:0.4.1", …, "profile:uml:2.5"]
#    core:empty plus one profile per bundled plugin; the generated
#    inventory is docs/architecture/PROFILES.md.

# 5. Create your first workbook against the formal-specification profile.
fdpm workbook create --json \
  --id demo --name "Demo" \
  --profile profile:formal-specification:3.0
```

If `version` and `profile list` work, the runtime is healthy and the
formal-specification plugin auto-activated.

---

## 2. Mental model in 30 seconds

- A **workbook** is a typed graph: a bag of **primitives** (nodes) and
  **relations** (edges), governed by a **profile** that declares allowed
  primitive types, relation types, validation rules, and scopes.
- Every state-changing command becomes one **operation** appended to a per-
  workbook log. The log *is* the source of truth; the in-memory state is
  derived (event-sourcing, SPEC-CORE §5).
- Every operation passes a **verification gate** (§8) and a **validation
  pipeline** (§7) before it appends. If either rejects, nothing changes.
- Operations replay deterministically — your data dir is portable, your
  history is auditable, and you can time-travel to any past revision.

---

## 3. Storage and persistence

The CLI keeps everything under one directory:

| Subdirectory | What it holds |
|---|---|
| `<data-dir>/profiles/` | Operator-registered profiles (one JSON per profile). Plugin-contributed profiles are NOT persisted here — plugins re-register on every startup. |
| `<data-dir>/workbooks/<workbook-id>/log.jsonl` | Append-only operation log. Every state change in chronological order. |

Three ways to choose the data dir, in order of precedence:

```sh
fdpm --data-dir /tmp/scratch workbook list   # 1. CLI flag
FDPM_DATA_DIR=/tmp/scratch fdpm workbook list # 2. Env var
fdpm workbook list                            # 3. Default: $HOME/.fdpm-cli
```

For ephemeral runs (tests, scratch experiments), use in-memory mode:

```sh
fdpm --no-persist workbook create --json --id tmp --name Tmp \
  --profile core:empty
# every change in-memory only; nothing on disk
```

### Environment variables

<!-- BEGIN GENERATED: env-vars (scripts/build-env-docs.ts) -->

| Variable | Default | Purpose |
| --- | --- | --- |
| `FDPM_MCP_EXPECTED_AUDIENCE` | `the value of FDPM_MCP_PUBLIC_URL` | Fdpm-mcp-http: the `aud` value a bearer token must carry, when the authorization server does not use the resource URL; Keycloak's audience mapper emits the resource CLIENT ID, and privileges granted as Keycloak client roles are then read from resource_access.<audience>.roles as well as from `scope`. |
| `FDPM_MCP_ADVERTISED_SCOPES` | `fdpm.read` | Fdpm-mcp-http: scopes published in protected resource metadata and in the 401 challenge; defaults to the read scope alone so clients elevate on challenge rather than being handed the whole catalogue (must include fdpm.read). |
| `FDPM_MCP_HTTP_PORT` | `8080` | Fdpm-mcp-http: TCP port the remote MCP server listens on. |
| `FDPM_MCP_HTTP_HOST` | `127.0.0.1` | Fdpm-mcp-http: bind address; defaults to loopback so a local server is not reachable from the network by accident, and a container opts in to 0.0.0.0 explicitly (the Dockerfile does). |
| `FDPM_MCP_PUBLIC_URL` | `(required)` | Fdpm-mcp-http: the exact connector URL clients type, path included; also the RFC 9728 `resource` value and the expected token audience. |
| `FDPM_MCP_OAUTH_ISSUER` | `(required)` | Fdpm-mcp-http: authorization server issuer advertised as the first entry of `authorization_servers` in protected resource metadata. |
| `FDPM_MCP_ALLOWED_HOSTS` | `(required)` | Fdpm-mcp-http: comma-separated Host header allow-list for DNS-rebinding protection; the server refuses to start when empty. |
| `FDPM_MCP_ALLOWED_ORIGINS` | `(none)` | Fdpm-mcp-http: comma-separated browser Origin allow-list; a request with no Origin (native clients) is always allowed. |
| `FDPM_MCP_AUTH_MODE` | `introspection` | Fdpm-mcp-http: bearer verification strategy, `introspection` (RFC 7662) or `static` (single shared token). |
| `FDPM_MCP_INTROSPECTION_URL` | `(required when auth mode is introspection)` | Fdpm-mcp-http: RFC 7662 token introspection endpoint. |
| `FDPM_MCP_CLIENT_ID` | `(required when auth mode is introspection)` | Fdpm-mcp-http: client id this resource server authenticates to the introspection endpoint with. |
| `FDPM_MCP_CLIENT_SECRET` | `(required when auth mode is introspection)` | Fdpm-mcp-http: client secret for the introspection endpoint; supply via a secret store, never a literal in a manifest. |
| `FDPM_MCP_STATIC_TOKEN` | `(required when auth mode is static)` | Fdpm-mcp-http: shared bearer token for `static` auth mode; minimum 32 characters and compared in constant time. |
| `FDPM_MCP_STATIC_SCOPES` | `fdpm.read,fdpm.write,fdpm.admin` | Fdpm-mcp-http: scopes granted to the static token. |
| `FDPM_MCP_TENANT_CLAIM` | `tenant` | Fdpm-mcp-http: name of the verified token claim carrying the tenant id. |
| `FDPM_MCP_SINGLE_TENANT` | `(unset — multi-tenant)` | Fdpm-mcp-http: pin every principal to one tenant, ignoring the claim; the single-tenant deployment mode. |
| `FDPM_MCP_MAX_TENANT_HOSTS` | `32` | Fdpm-mcp-http: maximum simultaneously loaded tenant Hosts before LRU eviction. |
| `FDPM_MCP_HOST_IDLE_SECONDS` | `900` | Fdpm-mcp-http: idle seconds after which an unpinned tenant Host is evicted from the pool. |
| `FDPM_MCP_SESSION_IDLE_SECONDS` | `1800` | Fdpm-mcp-http: idle seconds after which an MCP session is closed. |
| `FDPM_MCP_MAX_SESSIONS` | `1000` | Fdpm-mcp-http: maximum concurrent MCP sessions before new ones are refused with quota. |
| `FDPM_MCP_KEEPALIVE_SECONDS` | `15` | Fdpm-mcp-http: SSE keep-alive interval; must be below the ingress idle timeout. |
| `FDPM_MCP_SWEEP_SECONDS` | `60` | Fdpm-mcp-http: interval between idle sweeps of sessions and pooled Hosts. |
| `FDPM_ENV_FILE` | `~/.fdpm/.env then ./.env (layered)` | Explicit .env file for the CLI and MCP server, replacing the layered default search; a variable already set in the environment always wins, and only documented FDPM_* names are applied. |
| `FDPM_DATA_DIR` | `~/.fdpm-cli` | Persistence directory for profiles and workbook logs. |
| `FDPM_PLUGIN_PATH` | unset | Extra plugin search paths separated by the OS path-list delimiter (`:` on POSIX, `;` on Windows). |
| `FDPM_FSYNC` | `1` | 0 -> skip the fsync after each operation-log write (faster bulk import, loses the tail on host crash). |
| `FDPM_LOG_LEVEL` | `info` | Plugin logger threshold: debug \| info \| warn \| error \| silent. |
| `FDPM_DEBUG` | unset | Truthy -> also emit plugin debug logs. |
| `FDPM_VERBOSE` | unset | Truthy -> expand human-mode error output. |
| `FDPM_JSON_COMPACT` | unset | 1 -> emit compact (single-line) JSON; set by `fdpm repl --json` and SPEC-MCP-SERVER. |
| `FDPM_MAX_REQUEST_BYTES` | `5242880` | Cap on -f / stdin input size in bytes. |
| `FDPM_MAX_FIELD_PATCH_OPS` | `100` | Cap on operations per field-patch request. |
| `FDPM_LOG_PAGE_MAX` | `10000` | Max events returned by one log page. |
| `FDPM_MAX_BATCH_OPS` | `500` | Cap on operations per edit batch. |
| `FDPM_AUDIT_DIFF_MAX_BYTES` | `32768` | Max bytes of diff evidence in audit projection. |
| `FDPM_TRUSTED_KEYS` | `""` | Comma-separated keys allowed for verified plugin trust. |
| `FDPM_MAX_RENDER_BYTES` | `52428800` | Cap on renderer output size in bytes. |
| `FDPM_SNAPSHOT_EVERY_OPS` | `1000` | Store snapshot after every N appended operations. |
| `FDPM_NO_PLUGINS` | unset | Truthy -> fdpm-mcp constructs Host with noPlugins=true. |
| `FDPM_MCP_ENABLE_DESTRUCTIVE` | unset | Fdpm-mcp: truthy -> expose Tier-3 destructive tools (off by default). |
| `FDPM_MCP_ENABLE_PLUGINS` | `""` | Fdpm-mcp: comma-separated plugin ids whose MCP tools are exposed. |
| `FDPM_MCP_MAX_CALLS_PER_MINUTE` | `120` | Fdpm-mcp: per-session rate limit on tool calls. |
| `FDPM_MCP_REQUIRED_PLUGINS` | `` | Fdpm-mcp-http: comma-separated plugin ids that MUST be active; boot refuses if one is missing or left disabled, so a plugin installed from outside the image cannot fail silently. |
| `FDPM_MCP_MAX_RESOURCE_BYTES` | `1048576` | Fdpm-mcp: cap on the bytes one resources/read may serve; over-cap reads are refused with a `quota` envelope. |
| `FDPM_MCP_MAX_RESULT_BYTES` | `32768` | Fdpm-mcp: cap on the bytes one read-only tools/call result may serve; over-cap results are refused with a `quota` envelope naming the tool's narrowing arguments. |
| `FDPM_MCP_AUDIT_FULL_ARGS` | unset | Fdpm-mcp: truthy -> log full args (default: sha256 hash only). |
| `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN` | unset | SPEC-MCP-SERVER §9.3: exactly `1` gates Tier 2/3 calls behind an `_confirmation_token` argument; requires FDPM_MCP_CONFIRMATION_TOKEN. |
| `FDPM_MCP_CONFIRMATION_TOKEN` | unset | Fdpm-mcp: the token Tier 2/3 calls must present when the gate above is on; startup refuses if the gate is on and this is empty. |
| `FDPM_MCP_CATALOG_BUDGET_BYTES` | `28500` | Fdpm-mcp: cap on the UTF-8 byte size of the advertised tools/list catalog; boot refuses when exceeded (SPEC-MCP-SERVER §8.5). |
| `FDPM_WORKSPACE` | unset | SPEC-WORKSPACE §8.3: workspace id or name to resolve via the registry; ignored when FDPM_DATA_DIR is set. |
| `FDPM_REGISTRY_PATH` | `platform state directory` | SPEC-WORKSPACE §12: override the native operator-local registry path (XDG state on Linux, Application Support on macOS, LocalAppData on Windows). |

<!-- END GENERATED: env-vars -->

Path-list values follow the host operating system: use `:` between entries in
`FDPM_PLUGIN_PATH` on Linux and macOS, and `;` on Windows. Unless overridden,
the workspace registry lives under the XDG state directory on Linux,
`~/Library/Application Support/fdpm/workspaces.json` on macOS, and
`%LOCALAPPDATA%\fdpm\workspaces.json` on Windows.

One-shot CLI ergonomics:
- `fdpm` one-shot commands default plugin startup logs to `warn`, so human command output is not preceded by plugin activation banners.
- Use `--verbose` to show plugin startup info logs, `--quiet` to suppress them, or `--log-level <debug|info|warn|error|silent>` for explicit control.

---

## 4. Working with profiles

A profile is a domain schema. The CLI ships two activated by default:

- `core:empty` — zero-content seed. Used when you want to register your own
  profile from scratch.
- `profile:formal-specification:3.0` — contributed by the in-tree
  `formal-specification` plugin. 32 primitive types, 30 relation types.

```sh
# List all profiles.
fdpm profile list --json | jq '.profiles[] | {id, version, types: (.primitive_types | length)}'

# Inspect a specific profile (resolved, with extends-chain merged).
fdpm profile get profile:formal-specification:3.0 --json | jq '.primitive_types | map(.id)'

# Register your own profile from a JSON file.
fdpm profile register -f my-profile.json --json

# Revise it: same id, higher version. Both revisions stay registered.
fdpm profile register -f my-profile-v2.json --json

# Take a revision back out (refused while anything still references it).
fdpm profile retire my:profile@1.0.0 --dry-run
fdpm profile retire my:profile@1.0.0

# Turn a registered profile into a plugin skeleton you can extend.
fdpm profile promote my:profile -o ./out
```

A registered profile survives restarts (it's persisted under
`<data-dir>/profiles/`).

### Revisions

A profile id names a **family of revisions**: the registry keys on
`(id, version)`, and `fdpm profile list` prints one row per revision.
Registering the same `(id, version)` twice is a `conflict` that names the
versions already registered — bump the `version` instead.

A bare id means "the newest revision" everywhere except one place that
matters: a workbook. `fdpm workbook create --profile my:profile` resolves the
newest revision **once** and pins it onto the workbook, so registering a newer
revision later never re-validates an existing workbook against a schema its
operations were not written under. Bind a specific one with
`--profile my:profile@1.0.0`, and read the pin back from
`fdpm workbook list --json` (`profile_version`). A workbook created before
pinning existed carries no pin and resolves to the *oldest* revision.

`extends` entries are refs too — `parent:id` or `parent:id@1.2.0`. An unpinned
parent is pinned at registration when its current revision is one you
registered; a plugin's revisions are left unpinned, because a plugin ships only
its current release and pinning to one would dangle on the next upgrade.

`fdpm profile retire <ref>` removes a revision and its file. It refuses while a
workbook binds it, another profile extends it, or a plugin contributed it —
`--dry-run` reports exactly which. Deleting the file by hand instead is what
breaks a workbook: every read path resolves its profile through the registry.

### Promoting a profile to a plugin

`fdpm profile promote <ref> -o <dir>` writes a loadable plugin directory —
manifest, `profile.json`, `index.js`, `README.md` — whose `activate()`
registers the profile, with the verb / renderer / prompt / validator slots
named where you fill them in. A profile-only plugin is a schema; adding those
makes it a domain vocabulary an agent can be dropped into cold.

It refuses to write into a plugin discovery path, and there is no flag to make
it: a generated plugin that lands in `~/.fdpm/plugins` would activate at the
next start with nobody having read it. Copy it in yourself after review, then
`fdpm plugin enable <plugin-id>` (a filesystem plugin is `community` trust, so
it stays disabled until you say otherwise).

---

## 5. Creating and inspecting workbooks

```sh
# Create a workbook. The id must match ^[a-z0-9][a-z0-9-]*$.
fdpm workbook create --json \
  --id roadmap-v04 --name "Roadmap Unified v0.4" \
  --profile profile:formal-specification:3.0

# List all workbooks.
fdpm workbook list --json | jq

# Get a workbook's metadata + embedded primitives + relations.
fdpm workbook get roadmap-v04 --json | jq '{id, name, revision, primitives: (.primitives | length), relations: (.relations | length)}'

# Rename a workbook, or rewrite the description that has gone stale.
fdpm workbook update roadmap-v04 --name "Roadmap Unified v0.5"
fdpm workbook update roadmap-v04 --description "Now covers the Q3 milestones."
fdpm workbook update roadmap-v04 --clear-description

# Both in one operation.
fdpm workbook update roadmap-v04 --json \
  --name "Roadmap Unified v0.5" --description "Now covers the Q3 milestones."

# Delete a project (the log file stays — only the projection is dropped).
fdpm workbook delete roadmap-v04

# Preview first: what would be removed (counts, revision), nothing appended.
fdpm workbook delete roadmap-v04 --dry-run --json
```

`workbook update` requires at least one of `--name`, `--description` or
`--clear-description`; an update that would change nothing is rejected
rather than appended as a no-op, and `--description` and
`--clear-description` are mutually exclusive. `--profile` is deliberately
absent: every primitive and relation in the workbook validates against
its profile, so re-binding one is a migration, not an edit.

The `revision` field on a workbook is monotonic: every accepted operation
bumps it by 1. Use it for optimistic concurrency (`If-Match` semantics
on individual edits).

---

## 6. Editing primitives

There are **five** edit surfaces for primitives, each mapping to a
SPEC-CORE §9.7 endpoint. Pick the smallest one that fits.

| Verb | When to use | Spec |
|---|---|---|
| `create` | Add a new primitive. | §9.7.3 POST |
| `replace` | Overwrite ALL field_values atomically. | §9.7.3 PUT |
| `patch` | Merge a partial `field_values` object. | §9.7.3 PATCH |
| `field-patch` | Apply RFC-6902 JSON Patch ops to `field_values`. | §9.7.4 |
| `delete` | Remove. | §9.7.3 DELETE |

All write commands accept the body via `-f <file>` or `-f -` (stdin).
All write commands return `{op_id, project_revision, report}` so you can
chain them or check `report.accepted`.

### 6.1 Create

```sh
echo '{
  "id": "section:why",
  "type_id": "fs:Section",
  "field_values": {
    "number": 1, "title": "Why", "status": "stable", "version": "0.4.0",
    "description": "Frames v0.4.0 as the unified successor."
  },
  "scope_id": "scope:fs:specification"
}' | fdpm primitive create roadmap-v04 -f - --json
```

### 6.2 Patch (partial)

Only the listed fields change; everything else is preserved.

```sh
echo '{"field_values": {"title": "Why This Edition Exists (edited)"}}' \
  | fdpm primitive patch roadmap-v04 section:why -f - --json
```

Use `--if-match <revision>` to fail loudly on a stale read:

```sh
echo '{"field_values": {"status": "reviewed"}}' \
  | fdpm primitive patch roadmap-v04 section:why -f - --if-match 3 --json
```

### 6.3 Replace (whole-record)

`type_id` is immutable; supplying a different one returns a `conflict`
error. `field_values` is replaced wholesale — fields you omit are dropped.

```sh
echo '{
  "type_id": "fs:Section",
  "field_values": {
    "number": 2, "title": "How to Read (replaced)",
    "status": "draft", "version": "0.5.0",
    "description": "Replaced wholesale."
  }
}' | fdpm primitive replace roadmap-v04 section:how-to-read -f - --json
```

### 6.4 field-patch (RFC-6902)

Surgical edits inside `field_values`. Supported ops: `replace`, `add`,
`remove`, `copy`, `move`, `test`. The keys `id` and `type_id` are reserved
and rejected.

```sh
echo '{"operations": [
  {"op": "replace", "path": "/version", "value": "0.4.1"},
  {"op": "add",     "path": "/reviewed_by", "value": "ops"}
]}' | fdpm primitive field-patch roadmap-v04 section:why -f - --json
```

A field-patch is one operation in the log — atomic across all its
inner ops.

### 6.5 Delete

```sh
fdpm primitive delete roadmap-v04 change:0.4.1:1 --json

# Preview: the primitive and every relation that references it; nothing appended.
# The same preview backs the MCP tools' `dry_run` and the SDK previewPrimitiveDelete.
fdpm primitive delete roadmap-v04 change:0.4.1:1 --dry-run --json
```

The primitive disappears from the projection, but the `primitive.create`
operation that brought it into being stays in the log forever (you can
still time-travel to before its deletion).

---

## 7. Editing relations

Same five write surfaces (`create / replace / patch / field-patch /
delete`), plus three read commands: `list` (every relation in the
workbook), `get <id>` (one), and `search` (filter by `--type`,
`--id-like`, `--id-regex`, `--match`, `--match-regex`). Primitives
have the same read triple. Relations have `source_id` and
`target_id` instead of a scope, and the validation pipeline checks both
endpoints exist and match the relation type's declared `source_types` /
`target_types` lists.

```sh
echo '{
  "id": "rel:change-references-why",
  "type_id": "fs:References",
  "source_id": "change:0.4.1:1",
  "target_id": "section:why",
  "field_values": {"kind": "see_also"}
}' | fdpm relation create roadmap-v04 -f - --json
```

If you see `core:relation:source-type` or `core:relation:target-type` in
the findings, the primitive's type isn't in the relation type's allowed
list. Inspect the relation type:

```sh
fdpm profile get profile:formal-specification:3.0 --json \
  | jq '.relation_types[] | select(.id=="fs:References") | {source_types, target_types, fields}'
```

---

## 8. Structural edits — reorder & reparent

The CLI knows about scopes (e.g. `scope:fs:specification`) and the
position of partition-unit primitives within them.

### Reorder

The new ordering MUST be a permutation of the current scope membership
— same set of ids, possibly re-sequenced. Submitting a strict subset
returns `verification: reorder must be a permutation`.

```sh
# 1. Discover current membership.
fdpm primitive list roadmap-v04 --json \
  | jq '[.primitives[] | select(.scope_id=="scope:fs:specification") | .id]' > /tmp/order.json

# 2. Edit /tmp/order.json into the new ordering (full permutation, no missing ids).
# 3. Apply.
echo '{"scope_id": "scope:fs:specification", "ordering": '"$(cat /tmp/order.json)"'}' \
  | fdpm structure reorder roadmap-v04 -f - --json
```

### Reparent

Move a partition-unit primitive to a different scope, optionally at a
specific position:

```sh
echo '{
  "primitive_id": "section:why",
  "from_scope_id": "scope:fs:specification",
  "to_scope_id":   "scope:fs:method",
  "position": 0
}' | fdpm structure reparent roadmap-v04 -f - --json
```

---

## 9. Batch transactions

When you need several edits to land atomically (all-or-nothing), use
`fdpm edit`. The body is a JSON object with an `operations[]` array.

```sh
cat > /tmp/batch.json <<'EOF'
{
  "expected_project_revision": 970,
  "operations": [
    {"kind": "primitive.patch", "payload": {
      "id": "section:why",
      "field_values": {"status": "reviewed"}
    }},
    {"kind": "primitive.patch", "payload": {
      "id": "section:how-to-read",
      "field_values": {"status": "reviewed"}
    }},
    {"kind": "relation.create", "payload": {
      "id": "rel:why-references-how-to-read",
      "type_id": "fs:References",
      "source_id": "section:why",
      "target_id": "section:how-to-read",
      "field_values": {"kind": "see_also"}
    }}
  ]
}
EOF

fdpm edit roadmap-v04 -f /tmp/batch.json --json
```

`expected_project_revision` is optional optimistic-concurrency. If any
operation in the batch fails validation, the whole transaction is rolled
back — no partial state lands in the log.

### 9.1 Batch validation reports describe the finished workbook

The MCP batch tools — `fdpm.primitive.create_batch` and
`fdpm.relation.create_batch` — return one `validation_report` per entry.
Those reports describe the workbook the batch produced, not the
intermediate states it passed through.

The distinction matters because entries apply in array order so that a
later entry can reference an earlier one: `create A`, then `relate to A`
has to work, which means each entry is first checked against the
workbook as it stood when that entry applied. A cross-entity rule on the
first entry would therefore be judged against a workbook missing every
entry after it. Creating a header and its three children in one batch
would report the header as childless.

After the batch commits, every entry is re-validated against the settled
workbook and its report replaced. Two consequences:

- A finding the same batch falsified is gone. The header above reports
  three children, because it has three.
- A finding that only exists once the batch is complete now rejects it.
  Four items created under a header that permits three are each
  individually valid and violate the header's rule collectively; that
  batch is rejected and rolled back, where it previously committed and
  reported success.

The second case is the reason to re-read a report rather than assume a
batch that assembled cleanly is accepted. `ok: false` with
`isError: false` still means *rejected, nothing written* — see
[§21](#operation---json-says-accepted-false-but-no-exception).

`fdpm edit` (above) is a different path: it returns per-operation
outcomes, not validation reports, so this re-check does not apply to it.

---

## 10. Importing legacy data with cap:importer plugins

The CLI ships an `fs-v3` importer plugin that turns the legacy
`{primitives, relations}` JSON dump into a canonical `ProjectTransfer`
and runs it through the standard import pipeline.

```sh
fdpm transfer import-as fs-v3 \
  -f roadmap-unified-v04.fs-v3.json \
  --workbook-id roadmap-v04 \
  --workbook-name "Roadmap Unified v0.4" \
  --json
```

What happens:

1. The `fs-v3` plugin's importer is called with the raw JSON.
2. It synthesises a `ProjectTransfer` envelope (renaming `scope`→
   `scope_id`, `fields`→`field_values`, `source`→`source_id`,
   `target`→`target_id`, folding relation `metadata`/`strength` into
   `field_values`).
3. The host re-validates the importer's output against the canonical
   `ProjectTransfer` zod schema (Silent Acceptance: plugin output is verified).
4. `importTransfer` issues `primitive.create` and `relation.create` ops
   for every record.

For canonical `ProjectTransfer` JSON (already in the right shape — e.g.
output from `fdpm transfer export`), use the plain `import` subcommand:

```sh
fdpm transfer export roadmap-v04 > /tmp/snapshot.json
fdpm transfer import -f /tmp/snapshot.json --json
```

Listing available importers:

```sh
fdpm plugin list --json | jq '.plugins'
fdpm plugin capabilities fdpm.fs-v3-importer --json
```

---

## 11. Inspecting the operation log

Every state change is logged. You can read the log raw or projected as
audit records (with diffs).

```sh
# All operations in chronological order.
fdpm log show roadmap-v04 --json | jq '.operations | length'

# Filter by kind, actor, or revision range.
fdpm log show roadmap-v04 --kind primitive.patch --json
fdpm log show roadmap-v04 --from 100 --to 200 --json
# Other filters: --actor <id>, --plugin <id>, --request-id <id>, --limit <n>.

# Audit projection — same operations, but with `before`/`after` diffs.
fdpm log audit roadmap-v04 --json | jq '.audit_records[0]'
```

The log is forever. Even after `primitive delete` removes a record from
the projection, its creation, every patch, and the deletion stay in the
log; that's how time-travel works.

---

## 12. Time-travel and undo

```sh
# Project state as of a specific revision (the projection at that point).
fdpm log at roadmap-v04 500 --json | jq '.primitives | length'

# Undo the most recent operation.
fdpm log undo roadmap-v04 --json

# Undo a specific operation by op_id (must be the last touch on its target).
fdpm log undo roadmap-v04 --target-op 01KQRMYVSV8HXKW0K0GND1JX1D --json
```

`undo` doesn't rewrite history — it appends the **inverse** operation. So
`undo` can itself be undone (it's just another op in the log).

---

## 13. Templates and test-suites

A **template** is a named bundle of primitives + relations that you can
stamp into a workbook. A **test-suite** is a named bundle of declarative
checks (expressions over primitives) that produces a `SuiteRunReport`.

```sh
# Capture the current workbook as a template.
echo '{"id":"tmpl:phase-skeleton","label":"Phase Skeleton",
       "primitive_ids":["phase:1","phase:2"],
       "relation_ids":[]}' \
  | fdpm template create roadmap-v04 -f - --json

# List templates and apply one to a fresh workbook.
fdpm template list roadmap-v04 --json
fdpm template apply other-workbook tmpl:phase-skeleton --json

# Define and run a test suite.
echo '{"id":"suite:no-empty-titles","label":"No empty titles",
       "checks":[{"id":"chk:title-nonempty","target_type_id":"fs:Section",
                  "expression":"len(field_values.title) > 0",
                  "level":"error","message":"Section title must not be empty"}]}' \
  | fdpm test-suite create roadmap-v04 -f - --json

fdpm test-suite run roadmap-v04 suite:no-empty-titles --json
```

Note that `expression` is stored verbatim in v1.1; the CLI does not
evaluate the DSL itself — that's a host-side concern delegated to the
profile or a `cap:validator` plugin.

---

## 14. Splitting and cloning workbooks

### Split

Partition a workbook along its `is_partition_unit=true` type (in
formal-specification, that's `fs:Section`):

```sh
echo '{
  "partition": [
    {"target_project_name": "Roadmap (Spec)",   "sections": ["section:why","section:how-to-read"]},
    {"target_project_name": "Roadmap (Method)", "sections": ["section:projection-model"]}
  ],
  "cross_partition_relations": "drop",
  "include_unassigned": "first"
}' | fdpm workbook split roadmap-v04 -f - --json
```

`cross_partition_relations` must be `"drop"` in v1.1. The dropped
relations are returned in the response so you can audit what was lost.

### Clone

Deep-copy a workbook into a new id:

```sh
fdpm workbook clone roadmap-v04 \
  --target-id roadmap-v04-staging \
  --target-name "Roadmap (staging)" --json
```

Both `split` and `clone` are recorded in the log of every workbook
involved (source + each target), via a shared `request_id`.

---

## 15. Plugin administration

Plugins are auto-discovered from `fdpm-cli/plugins/` (in-tree, `core` trust)
and from `$FDPM_PLUGIN_PATH` (filesystem, `community` trust by default).
The CLI auto-activates `core` and `verified` plugins; `community` /
`unknown` start `disabled` until you `enable` them.

```sh
# List discovered plugins with state and trust tier.
fdpm plugin list --json

# Inspect one.
fdpm plugin get fdpm.formal-specification --json
fdpm plugin manifest fdpm.formal-specification --json
fdpm plugin capabilities fdpm.formal-specification --json

# Lifecycle.
fdpm plugin enable my-plugin.id
fdpm plugin disable my-plugin.id
fdpm plugin reload my-plugin.id

# A plugin whose activate() raised lands in `quarantined` — the host
# stays alive. Operator-only escape hatch:
fdpm plugin quarantine-clear my-plugin.id   # → disabled (then `enable` to retry)
```

To install a third-party plugin, point `FDPM_PLUGIN_PATH` at a directory
holding `<plugin-id>/fdpm-plugin.json` + the entry module:

```sh
mkdir -p ~/.fdpm/plugins/acme.thing
# ...drop fdpm-plugin.json + index.js into that dir
FDPM_PLUGIN_PATH=~/.fdpm/plugins fdpm plugin list
```

### The resource surface is gated like the tool surface

`resources/read` moves more content than any tool call —
`fdpm://workbook/{id}/render/{target}` serves an entire rendered workbook — so
it carries the three controls that apply to a read:

| Control | Behaviour |
|---|---|
| Rate limit | The **same** `FDPM_MCP_MAX_CALLS_PER_MINUTE` bucket tool calls draw on. One budget per session, not one per surface. |
| Audit trail | One `resource_read` line per read in `mcp-audit.jsonl`, successful or refused, carrying the URI, the provider, the duration and the byte count — never the content. |
| Byte ceiling | `FDPM_MCP_MAX_RESOURCE_BYTES` (default 1 MiB). An over-cap read is refused with a `quota` envelope naming both the size and the ceiling. |

Tier gating, the confirmation token and idempotency do **not** apply: a read has
no tier to refuse, nothing to confirm and nothing to replay.

```sh
# Refuse anything over 256 KiB, and see the reads in the report.
FDPM_MCP_MAX_RESOURCE_BYTES=262144 fdpm-mcp
fdpm mcp audit-report --window 24h --json | jq .resources
```

A malformed ceiling is a **startup refusal** (exit 2), not a silent fallback —
an operator who mistypes `1MB` learns at boot rather than believing a limit is
in force that is not.

Providers declare whether they read workbook state
(`ResourceProvider.readsWorkbookState`). The guard performs the tail replay for
those that do, so a provider added later inherits freshness rather than having
to remember it. Today only the render provider declares `true`; the guide,
schema, profile and audit providers serve static or already-fresh content.

### Plugin-shipped MCP prompts

Plugins can ship MCP prompts — skills that tell an agent *when* to use a
set of tools, in what *order*, and how to handle *failures*
(SPEC-MCP-SERVER §13.5). The CLI shows what an MCP client would see:

```sh
# Metadata only (what prompts/list returns): id, plugin, title, arguments.
fdpm plugin prompts

# Render one with arguments (what prompts/get returns).
fdpm plugin prompt planning/triage_iteration --arg workbook_id=plan-roadmap-2026-q2
fdpm plugin prompt planning/triage_iteration --arg workbook_id=p --arg focus=auth --json
```

A prompt whose body lacks the three sections, or whose listing entry
exceeds 600 bytes, is rejected at plugin activation; a missing required
argument or an unknown one is a `validation` error naming the argument.

The bundled plugins ship these:

| Prompt id | Plugin | Use it when |
|---|---|---|
| `planning/triage_iteration` | `fdpm.planning` | Ranking Ready tasks and claiming work at an iteration checkpoint. |
| `loop-forward/author_pipeline` | `fdpm.loop-forward` | Building a bounded multi-stage prompt pipeline, or extending one. |
| `loop-forward/audit_pipeline` | `fdpm.loop-forward` | Reviewing a pipeline before running, approving or inheriting it. |
| `knowledge-cartridge/build_cartridge` | `fdpm.knowledge-cartridge` | Compressing a corpus into a six-layer competence cartridge. |
| `fact-fiction/ground_fiction` | `fdpm.fact-fiction` | Writing historical fiction whose invented layer stays accountable to the record. |
| `uml/model_a_domain` | `fdpm.uml` | Modelling a domain as UML classes, attributes and associations in a workbook. |

```sh
# Author a loop-forward pipeline: the call order that satisfies the
# endpoint-before-edge rule, and the eight validator ids it can trip.
fdpm plugin prompt loop-forward/author_pipeline --arg workbook_id=my-pipelines

# Audit one: routes review through the five design-graph renderers.
fdpm plugin prompt loop-forward/audit_pipeline --arg workbook_id=my-pipelines --json
```

`fdpm plugin prompts` is the discovery call — run it first rather than
guessing an id, because the set grows with whatever plugins are active.

---

## 16. Rendering workbook output

`fdpm render` invokes a plugin-registered renderer against a workbook's
current state. The target is a MIME type such as `text/markdown`,
`text/html`, `application/pdf`, or `image/svg+xml`.

```sh
# Render markdown to stdout.
fdpm render roadmap-v04 text/markdown \
  --renderer-id fs:SpecRenderer

# Render HTML to a file.
fdpm render roadmap-v04 text/html \
  --renderer-id fs:SpecHtmlRenderer \
  --output /tmp/spec.html

# Binary output requires --output.
fdpm render roadmap-v04 application/pdf \
  --renderer-id fs:SpecPdfRenderer \
  --output /tmp/spec.pdf
```

Use `--renderer-id` whenever more than one renderer matches the target.
Without it, the host picks the first registered match for that MIME type.

`--strict` keeps the rendered bytes but sets a verification exit code
when render findings are present:

```sh
fdpm render roadmap-v04 text/markdown \
  --renderer-id fs:SpecRenderer \
  --strict
```

`--json` emits only a summary envelope; it does not inline the rendered
bytes for binary targets.

---

## 17. Workbook-wide validation

`fdpm validate <workbook>` reruns the profile validators against the
current projection without writing anything. This is useful after
imports, migrations, or bulk edits.

```sh
# Full validation report.
fdpm validate roadmap-v04 --json

# Only error-level findings.
fdpm validate roadmap-v04 --min-level error --json

# Restrict to specific targets and rules.
fdpm validate roadmap-v04 \
  --target section:why rel:contains:why:phase-1 \
  --rule fs:val:phase-has-question \
  --json
```

By default, warnings do not fail the command. `--strict` escalates
warnings into a validation exit code:

```sh
fdpm validate roadmap-v04 --strict
```

---

## 18. Diffing and migration

`fdpm diff` compares two snapshots: either two revisions of one workbook
or the current state of two workbooks.

```sh
# Same workbook, historical diff.
fdpm diff roadmap-v04 --from-revision 120 --to-revision 140 --json

# Same workbook, historical diff against current state.
fdpm diff roadmap-v04 --from-revision 120 --detail --json

# Cross-workbook diff.
fdpm diff roadmap-v04 \
  --from-workbook roadmap-v04 \
  --to-workbook roadmap-v05 \
  --json
```

`--detail` includes before/after values for modified fields.

`fdpm migrate` applies explicit, auditable rewrites. The currently shipped
migration is `normalize-metadata`, which lifts legacy relation
`field_values._metadata.*` keys onto top-level `field_values`.

```sh
# Preview only.
fdpm migrate normalize-metadata roadmap-v04 --dry-run --json

# Apply the migration.
fdpm migrate normalize-metadata roadmap-v04 --json
```

Migrations append normal operations to the log, so `fdpm log undo` can
revert them.

---

## 19. Output, errors, and exit codes

Every command supports `--json` for machine-readable output. Without it,
write commands emit a one-line success message; read commands emit a
human-readable table.

Errors come out on stderr in this shape (with `--json`):

```json
{
  "error": {
    "category": "validation",
    "message": "validation failed for section:bad",
    "findings": [
      {"level":"error","rule_id":"core:field:required",
       "field_path":"field_values.title","message":"required field missing: title"}
    ]
  }
}
```

Exit codes — the authoritative source is `EXIT_CODE_FOR_CATEGORY` in
[src/core/errors/fdpm-exception.ts](src/core/errors/fdpm-exception.ts):

| Category            | Exit | When |
|---------------------|------|------|
| `validation`        | 2    | Pipeline rejected the proposed state. |
| `verification`      | 3    | Schema gate rejected the operation payload. |
| `not_found`         | 4    | Workbook / primitive / relation / profile id absent. |
| `conflict`          | 5    | Duplicate id, immutable field changed, If-Match mismatch. |
| `permission`        | 6    | (Plugin runtime) operation not authorised by manifest. |
| `unauthenticated`   | 7    | Caller identity required but not provided. |
| `quota`             | 8    | Limit exceeded (e.g. field-patch ops cap). |
| `unsupported_media` | 9    | Importer / transfer payload media type not supported. |
| `host_compat`       | 10   | Plugin manifest version excludes this host. |
| `internal`          | 70   | Anything unexpected. |

Treat the table as a snapshot. If it disagrees with the source map,
the source wins.

---

## 20. Recipes — common workflows

### 20.1 Bootstrap a workbook from a legacy dump

```sh
fdpm transfer import-as fs-v3 \
  -f roadmap-unified-v04.fs-v3.json \
  --workbook-id roadmap-v04 --workbook-name "Roadmap Unified v0.4" --json

fdpm workbook list --json | jq
```

### 20.2 Sweep all sections to status=reviewed atomically

```sh
fdpm primitive list roadmap-v04 --json \
  | jq '{operations: [.primitives[] | select(.type_id=="fs:Section") |
         {kind:"primitive.patch", payload:{id, field_values:{status:"reviewed"}}}]}' \
  | fdpm edit roadmap-v04 -f - --json
```

A single batch op lands all the patches atomically; if even one fails
validation, none of them apply.

### 20.3 Round-trip: export, edit, re-import

```sh
fdpm transfer export roadmap-v04 > /tmp/snap.json

# (edit /tmp/snap.json by hand or with jq)

fdpm workbook delete roadmap-v04
fdpm transfer import -f /tmp/snap.json --json
```

### 20.4 Find every Citation that references a Phase

```sh
fdpm relation list roadmap-v04 --json \
  | jq '.relations[] | select(.type_id=="fs:References") |
        select(.source_id | startswith("citation:"))'
```

### 20.5 Time-travel debugging

```sh
# Find when a specific primitive was last changed.
fdpm log show roadmap-v04 --json \
  | jq '.operations[] | select(.payload.id=="section:why")'

# Pull state as of just before that revision.
fdpm log at roadmap-v04 503 --json | jq '.primitives["section:why"]'
```

### 20.6 Tear it all down

```sh
fdpm workbook delete roadmap-v04
rm -rf $FDPM_DATA_DIR    # nukes the log too — irreversible
```

---

## 21. Troubleshooting

### `validation failed`
The operation payload was syntactically valid but the resulting state
violates the profile (missing required field, ID format mismatch, enum
not allowed, relation endpoints of the wrong type, etc.). Inspect
`findings` in the JSON output — every finding has a `rule_id`,
`field_path`, and `message`.

### `payload schema violation for <kind>` (verification category)
The payload doesn't match the operation's payload schema. Usually a
missing field or wrong type at the JSON level (not the profile level).
Compare your body against the schema in
[src/core/operations/payloads.ts](src/core/operations/payloads.ts).

### `workbook ... not found` after restart
Your data dir didn't survive (e.g. you used `--no-persist`, or
`$FDPM_DATA_DIR` points somewhere ephemeral). Persistent workbooks live
under `<data-dir>/workbooks/<id>/log.jsonl`.

### `reorder must be a permutation`
The ordering you submitted isn't a permutation of the current scope
membership. Run `fdpm primitive list <workbook> --json | jq` and filter
on `scope_id` to see the exact set you must permute.

### Plugin shows `state: rejected` or `state: quarantined`
- `rejected`: the manifest didn't pass schema validation, or
  `host_compatibility.fdpm` excludes this host. `fdpm plugin manifest
  <id> --json` and check the diagnostics.
- `quarantined`: the plugin's `activate()` (or some capability call)
  raised at runtime. The host caught it, removed the plugin's
  contributions, and stayed up. `fdpm plugin get <id> --json` shows
  `errorMessage`. To retry: `fdpm plugin quarantine-clear <id>` then
  `fdpm plugin enable <id>`.

### Operation `--json` says `accepted: false` but no exception
The validation pipeline can return both `accepted: false` (any error
finding) and a list of warnings (`level: "warning"`). Write commands
turn `accepted: false` into a thrown `FDPMException`. If you need to
preview validation without committing, build a test-suite or call
`host.pipeline.runPrimitive(...)` programmatically — there's no
"dry-run" CLI flag in v1.1.

### `transfer import-as` complains the importer produced an invalid `ProjectTransfer`
The importer plugin returned a malformed transfer. The host re-validates
on every import (Silent Acceptance: plugin output is verified). The error envelope's `evidence.issues`
points to the offending field; file a bug against the importer plugin.

## 22. MCP audit report

`fdpm-mcp` appends one JSON line per tool call to
`<data-dir>/mcp-audit.jsonl` (start + complete, with `ok`,
`error_category`/`error_reason`, `validation_status`, and — for Tier-2
rejections — the `rule_ids` that fired). `fdpm mcp audit-report`
aggregates it so you can see which tool, reason or rule fails most and
fix the description, the instructions, or the profile that causes it.

```bash
# Whole history, human summary: success rate vs the SLO, per-tool rows,
# error classes ranked by count.
fdpm mcp audit-report

# Last 24 hours, top 5 classes, JSON (same shape as fdpm://audit/report).
fdpm mcp audit-report --window 24h --top 5 --json

# Absolute bounds and a stricter SLO.
fdpm mcp audit-report --since 2026-08-28T00:00:00Z --slo 0.95
```

Error classes read `<tool> <label>`: `fdpm.primitive.create rule:core:id-format`
is a §7 rejection (the agent's id did not match `id_pattern`),
`fdpm.primitive.delete validation/idempotency_key_required` is a
protocol error. `slo.shortfall` is how many more successful calls the
window needed to meet the target. The same report is served to agents
as the MCP resource `fdpm://audit/report[/{1h|24h|7d|all}]` and to
embedders as the SDK `auditReport(host, opts)`.

Unparseable lines are counted in `source.skipped` and never coerced. An
in-memory data dir has no log and reports zero calls.

---

## 23. Remote MCP server

`fdpm-mcp` speaks stdio and is spawned by the client that uses it. To
reach Claude Connectors or ChatGPT you need a network endpoint instead:
`fdpm-mcp-http`, which serves the **same** tools, resources and prompts
over MCP Streamable HTTP.

Both binaries build their MCP server with the same factory
(`src/mcp/build-server.ts`), so the two transports cannot drift apart.
The differences are all outside the tool surface: callers are
authenticated, scoped, and isolated per tenant.

### What changes when you go remote

| | `fdpm-mcp` (stdio) | `fdpm-mcp-http` (remote) |
|---|---|---|
| Transport | stdio | Streamable HTTP |
| Caller identity | none — the operator spawned it | bearer token → principal |
| Tool authorization | `--enable-destructive` only | `--enable-destructive` **and** the tier's scope |
| Data | one `FDPM_DATA_DIR` | one directory per tenant under the root |
| Sessions | one per process | one per `Mcp-Session-Id` |
| Audit | `mcp-audit.jsonl` | same, plus `principal.sub` and `tenant` |

### Scopes

Each tier requires exactly one scope. They are **not** hierarchical:
`fdpm.admin` does not imply `fdpm.write`.

| Tier | Scope | Examples |
|---|---|---|
| read-only | `fdpm.read` | `fdpm.workbook.list`, `fdpm.primitive.get` |
| validating write | `fdpm.write` | `fdpm.primitive.create_batch`, `fdpm.workbook.update` |
| destructive | `fdpm.admin` | `fdpm.primitive.delete`, `fdpm.workbook.delete` |

Enforcement and advertisement are separate. Every tier is always gated,
whatever is advertised. `FDPM_MCP_ADVERTISED_SCOPES` controls only what
protected resource metadata and the `401` challenge tell a client to ask
for, and it defaults to `fdpm.read` alone — a connector that needs to
write learns the scope from the challenge:

```
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="fdpm.read"
```

Widen it deliberately (`fdpm.read,fdpm.write`) when you want writing
clients to be granted the scope at first connection instead.

A call without the scope is refused with the same vocabulary the
destructive gate already uses:

```json
{ "error": { "category": "permission", "message": "this token is not authorized for validating_write tools; required scope fdpm.write",
             "evidence": { "reason": "insufficient_scope", "required_scope": "fdpm.write", "tier": "validating_write" } } }
```

### Running it locally

The `static` auth mode takes one shared bearer token and needs no
authorization server, which makes it the fastest way to see the thing
work end to end.

```sh
export FDPM_DATA_DIR=/tmp/fdpm-remote
export FDPM_MCP_PUBLIC_URL=http://127.0.0.1:8080/mcp
export FDPM_MCP_OAUTH_ISSUER=http://127.0.0.1:9000
export FDPM_MCP_ALLOWED_HOSTS=127.0.0.1
export FDPM_MCP_AUTH_MODE=static
export FDPM_MCP_STATIC_TOKEN=$(head -c 32 /dev/urandom | base64)
export FDPM_MCP_SINGLE_TENANT=default
# The server binds 127.0.0.1 by default; a container opts in to 0.0.0.0.

node dist/src/bin/fdpm-mcp-http.js
# => {"level":"info","msg":"fdpm-mcp-http ready","port":8080,...}
```

Check the three things a connector checks, in order:

```sh
# 1. Probes answer without a token.
curl -s localhost:8080/healthz

# 2. An unauthenticated call is 401 AND points at the metadata.
curl -is localhost:8080/mcp -X POST -d '{}' | head -3
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer resource_metadata="http://127.0.0.1:8080/.well-known/oauth-protected-resource"

# 3. `resource` matches the connector URL exactly, path included.
curl -s localhost:8080/.well-known/oauth-protected-resource | jq .

# 4. A real MCP handshake.
curl -s localhost:8080/mcp \
  -H "authorization: Bearer $FDPM_MCP_STATIC_TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
       "protocolVersion":"2025-11-25","capabilities":{},
       "clientInfo":{"name":"curl","version":"0"}}}' -D- | grep -i mcp-session-id
```

### Single-tenant and multi-tenant

Set `FDPM_MCP_SINGLE_TENANT` and every caller is pinned to that one
tenant, whatever their token claims. Leave it unset and the tenant is
read from the verified claim named by `FDPM_MCP_TENANT_CLAIM`, and each
tenant gets its own directory under `$FDPM_DATA_DIR/tenants/<id>`.

Tenant ids must match `^[a-z0-9][a-z0-9-]{0,63}$`. The tenant is **never**
taken from a tool argument — only from a verified token claim.

### Production auth

`static` mode shares one credential across everyone who has it. For real
deployments use `introspection`, which validates each bearer against your
authorization server (RFC 7662) and checks that the token's audience
matches `FDPM_MCP_PUBLIC_URL`:

```sh
export FDPM_MCP_AUTH_MODE=introspection
export FDPM_MCP_INTROSPECTION_URL=https://auth.example.com/oauth2/introspect
export FDPM_MCP_CLIENT_ID=fdpm-resource-server
export FDPM_MCP_CLIENT_SECRET=...   # from a secret store
export FDPM_MCP_TENANT_CLAIM=tenant
```

Your authorization server, not this server, runs the OAuth 2.1 flow.
`fdpm-mcp-http` is a resource server: it publishes protected resource
metadata pointing at your issuer and validates the tokens your issuer
mints.

### Adding it to Claude

1. Deploy behind TLS at a stable URL ending in your MCP path, e.g.
   `https://mcp.example.com/mcp`.
2. Set `FDPM_MCP_PUBLIC_URL` to **exactly** that URL. Claude compares it
   against the `resource` field character for character, path included.
3. Add it under **Customize → Connectors → Add custom connector**.
4. Claude reads the 401's `resource_metadata` pointer, fetches your
   authorization server's metadata, and runs the OAuth flow.

If Claude reports it cannot reach the server while your logs show the
request arriving, the 401 handshake is the thing to check first — a
`WWW-Authenticate` header on a 200 is ignored.

### Adding it to ChatGPT

Developer mode connects to the same URL and needs no extra tools. Deep
research is different: it consumes only `search` and `fetch` and ignores
every other tool, so it is not supported by this server today. See the
CHANGELOG for the current state.

### Which protocol revision this speaks

`fdpm-mcp-http` targets MCP revision **2025-11-25**, which is what the
installed SDK advertises (`LATEST_PROTOCOL_VERSION`) and what Claude's
connector infrastructure accepts.

A newer revision, **2026-07-28**, makes the protocol stateless: it removes
the `initialize` handshake and the `Mcp-Session-Id` header, carries
capabilities in `_meta` on every request, adds a mandatory
`server/discover`, and drops SSE resumption in favour of the Tasks
extension. This server does not implement it. Support arrives with v2 of
the TypeScript SDK, which is pre-release at the time of writing; its
`createMcpHandler` serves both eras from one server, so the migration does
not fork the codebase.

The practical consequence today: none for Claude or ChatGPT. The
consequence later: the session manager and the ingress session affinity
both become unnecessary, because a stateless protocol routes round-robin.

### Deploying

`Dockerfile` and `k8s/` in this package are working examples. Read the
comment at the top of `k8s/statefulset.yaml` before changing the
topology: per-pod ReadWriteOnce volumes and tenant affinity are a
correctness requirement of the write-lock design, not a performance
preference.

---

For the full normative reference, command-by-command, see the repository
[`README.md`](../README.md). For the spec, see
[../docs/specs/SPEC-CORE.md](../docs/specs/SPEC-CORE.md).
