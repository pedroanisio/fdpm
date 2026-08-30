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
9. [Batch transactions](#9-batch-transactions)
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
# => { "spec_core": "1.1", "spec_core_revision": "1.1.1",
#      "host": "fdpm-cli", "host_version": "1.2.0" }

fdpm health readyz
# => ready profiles=N

fdpm profile list --json | jq '.profiles | map(.id)'
# => ["core:empty", "profile:formal-specification:3.0",
#      "profile:planning:0.1", "profile:software-architecture:1.0",
#      "profile:spec-authoring:0.1"]

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
| `FDPM_DATA_DIR` | `~/.fdpm-cli` | Persistence directory for profiles and workbook logs. |
| `FDPM_PLUGIN_PATH` | unset | Extra plugin search paths separated by the OS path-list delimiter (`:` on POSIX, `;` on Windows). |
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
| `FDPM_MCP_AUDIT_FULL_ARGS` | unset | Fdpm-mcp: truthy -> log full args (default: sha256 hash only). |
| `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN` | unset | SPEC-MCP-SERVER §9.3: exactly `1` gates Tier 2/3 calls behind an `_confirmation_token` argument; requires FDPM_MCP_CONFIRMATION_TOKEN. |
| `FDPM_MCP_CONFIRMATION_TOKEN` | unset | Fdpm-mcp: the token Tier 2/3 calls must present when the gate above is on; startup refuses if the gate is on and this is empty. |
| `FDPM_MCP_CATALOG_BUDGET_BYTES` | `26000` | Fdpm-mcp: cap on the UTF-8 byte size of the advertised tools/list catalog; boot refuses when exceeded (SPEC-MCP-SERVER §8.5). |
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
```

A registered profile survives restarts (it's persisted under
`<data-dir>/profiles/`). To remove one, delete its file and restart.

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

# Delete a project (the log file stays — only the projection is dropped).
fdpm workbook delete roadmap-v04

# Preview first: what would be removed (counts, revision), nothing appended.
fdpm workbook delete roadmap-v04 --dry-run --json
```

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
   `ProjectTransfer` zod schema (PALS's-LAW: plugin output is verified).
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
on every import (PALS's-LAW). The error envelope's `evidence.issues`
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

For the full normative reference, command-by-command, see the repository
[`README.md`](../README.md). For the spec, see
[../docs/specs/SPEC-CORE.md](../docs/specs/SPEC-CORE.md).
