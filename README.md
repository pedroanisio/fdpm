---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-04"
---

# fdpm — Full CLI implementation of SPEC-CORE v1.2 + plugin runtime + formal_specification port

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

> **ARCHITECTURAL REQUIREMENT (PALS's LAW):** LLMs will always produce some
> form of error. Absence of output verification is a design defect, not a
> runtime bug. All LLM output must be treated as untrusted and validated
> explicitly.

A from-scratch TypeScript CLI implementation of the FDPM Core SPEC v1.2
([docs/specs/SPEC-CORE.md](docs/specs/SPEC-CORE.md)) **and** the
companion Pluggable Architecture SPEC v1.1
([docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md](docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md))
on the server side. Independent of the existing Python `src/fdpm/` server.
Includes a faithful port of the `formal_specification` plugin (32 primitive
types, 30 relation types, 23 validation rules, 3 renderer bindings,
3 templates) decomposed per SPEC-PLUGGABLE §6.1 / §9.1.

SPEC-CORE 1.2 adopts SPEC-DNIS
([docs/specs/SPEC-DNIS.md](docs/specs/SPEC-DNIS.md)) as a normative
extension via the new §5.6 "Document Node Identity" — the Core ships
a built-in `profile:dnis:0.1` plus the composition profile
`profile:spec-authoring-dnis:0.1`, the `DnisHostAdapter` runtime,
and an `fdpm dnis` CLI surface. See "SPEC-DNIS adoption" below.

The HTTP-only Layer 7 (frontend shell, §10) is omitted because a CLI is the
operator surface; the §9.1 endpoint table maps directly to subcommands. The
SPEC's frontend capabilities (`cap:ui:*`) and `cap:route` (HTTP server) are
out of scope; everything else (`cap:profile`, `cap:validator`, `cap:renderer`,
`cap:transformer`, `cap:importer`, `cap:exporter`, `cap:lifecycle-hook`) is
implemented.

## Status

- **SPEC-CORE 1.2.0** — `spec_core` 1.2, document revision 1.2.0;
  §5.6 SPEC-DNIS adoption is normative.
- **SPEC-DNIS 0.1.7** — Document Node Identity Specification adopted
  by SPEC-CORE 1.2 §5.6 (was a peer "MAY layer" proposal pre-1.2).
  TV-1..TV-7 pass against both the in-memory store and the host
  adapter (the §5.6.6 reference fixture).
- **SPEC-PLUGGABLE 1.1.1** — server-side capabilities; companion SPEC.
- **SPEC-RENDER-DSL 0.1.6 / SPEC-EXPRESSION-RUNTIME 0.1.8** — helper-
  set v1.2.0 ships `fn.section_of(node_id)` for resolving DNIS
  NodeIds to rendered §N.M.K headings, plus the `doc.section_index`
  Tier-A binding.
- **SPEC-SECTIONS-TREE 0.2.0** — adopted DNIS for section identity;
  SPEC-CORE and SPEC-DNIS are migrated to DNIS-backed sections via
  `DnisHostAdapter` (codemod gated by byte-equality against the
  pre-migration rendered output — both pass).
- **718 tests passing across 77 test files**. Coverage spans:
  - Core: meta-model, profile resolution (incl. `extends` chains for
    composition profiles), validation pipeline, verification gate,
    event-sourced replay, time-travel, undo (per kind), atomic batch
    rollback, optimistic concurrency, split/clone, transfer round-
    trip, audit truncation, versioning.
  - DNIS / SPEC-CORE 1.2 §5.6: TV-1..TV-7 against the in-memory
    store; §5.6.6 conformance (TV-1, TV-3 with 5-entry split
    causation chain, TV-5, TV-7 evidence shape, idempotency replay,
    document round-trip) against a real Host instance via the
    `DnisHostAdapter`.
  - Render-DSL: helper-set v1.2.0 `fn.section_of` lookup, opt-in
    body_md template evaluation, slug-keyed `section_index` with
    title-collision disambiguation, `number_override` for letter
    appendices and mid-chain-insert sections.
  - Plugin runtime: discovery, manifest validation, lifecycle states,
    quarantine on activate-failure, trust-tier inference, forward-
    compat (v1.0 manifest on v1.x host), admin lifecycle
    (enable/disable), profile composition via `extends`.
  - formal_specification content parity: 32/30/23/5/3 counts match
    Python source; primitive ids match `_ALL_PRIMITIVE_IDS`; inline
    structs (Alternative, Variable, TensorSpec) carry expected
    fields; end-to-end create-project/create-Section flow +
    validation rejection on bad enum value.
  - Legacy spec parser: every Python source field-type spec form
    (string, ConstrainedText, Enum[...], T[], StructField[X][])
    round-trips to the CLI's structured `kind` form.

## Install / build

```bash
npm --prefix fdpm-cli install
npm --prefix fdpm-cli run build              # tsc → fdpm-cli/dist/
npm --prefix fdpm-cli test                   # vitest run
npm --prefix fdpm-cli run dev -- version     # tsx, no build needed
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `FDPM_DATA_DIR` | `~/.fdpm-cli` | Persistence directory for profiles and project logs. |
| `FDPM_PLUGIN_PATH` | unset | Extra plugin search paths (colon-separated). |
| `FDPM_LOG_LEVEL` | `info` | Plugin logger threshold: `debug`, `info`, `warn`, `error`, `silent`. |
| `FDPM_DEBUG` | unset | Truthy -> also emit plugin debug logs. |
| `FDPM_VERBOSE` | unset | Truthy -> expand human-mode error output. |
| `FDPM_JSON_COMPACT` | unset | `1` -> emit compact (single-line) JSON; set automatically by `fdpm repl --json` and SPEC-MCP-SERVER. |
| `FDPM_MAX_REQUEST_BYTES` | `5242880` | Cap on `-f` / stdin input size in bytes. |
| `FDPM_MAX_FIELD_PATCH_OPS` | `100` | Cap on operations per field-patch request. |
| `FDPM_LOG_PAGE_MAX` | `10000` | Max events returned by one log page. |
| `FDPM_MAX_BATCH_OPS` | `500` | Cap on operations per edit batch. |
| `FDPM_AUDIT_DIFF_MAX_BYTES` | `32768` | Max bytes of diff evidence in audit projection. |
| `FDPM_TRUSTED_KEYS` | `""` | Comma-separated keys allowed for verified plugin trust. |
| `FDPM_MAX_RENDER_BYTES` | `52428800` | Cap on renderer output size in bytes. |
| `FDPM_SNAPSHOT_EVERY_OPS` | `1000` | Store snapshot after every N appended operations. |
| `FDPM_NO_PLUGINS` | unset | Truthy -> `fdpm-mcp` constructs Host with `noPlugins=true`. |
| `FDPM_MCP_ENABLE_DESTRUCTIVE` | unset | `fdpm-mcp`: truthy -> expose Tier-3 destructive tools (off by default). |
| `FDPM_MCP_ENABLE_PLUGINS` | `""` | `fdpm-mcp`: comma-separated plugin ids whose MCP tools are exposed. |
| `FDPM_MCP_MAX_CALLS_PER_MINUTE` | `120` | `fdpm-mcp`: per-session rate limit on tool calls. |
| `FDPM_MCP_AUDIT_FULL_ARGS` | unset | `fdpm-mcp`: truthy -> log full args (default: sha256 hash only). |

One-shot CLI ergonomics:
- `fdpm` one-shot commands default plugin startup logs to `warn`, so operator-facing output is not buried under activation banners.
- Use `--verbose` to show plugin startup info logs, `--quiet` to suppress them, or `--log-level <debug|info|warn|error|silent>` for explicit control.

## Quick start (zero plugins)

```bash
# Enter the CLI package once, or keep using --prefix fdpm-cli from repo root.
cd fdpm-cli

# Inspect SPEC version
fdpm version --json

# core:empty is registered automatically
fdpm profile list --json

# Register your own profile (persisted under ~/.fdpm-cli/profiles/)
fdpm profile register -f my-profile.json

# Create a project
fdpm project create --id demo --name "Demo" --profile test:demo

# Add a primitive (validated against the §7 pipeline)
fdpm primitive create demo -f section.json

# List, time-travel, undo
fdpm primitive list demo
fdpm log show demo
fdpm log at demo 2          # state as of revision 2
fdpm log undo demo          # invert the most recent op
fdpm log audit demo         # AuditRecord projection (§13.3)
```

## Commands → SPEC §9.1 mapping

| Command                          | §9.1 endpoint                                  |
| -------------------------------- | ---------------------------------------------- |
| `fdpm profile list`              | `GET /profiles`                                |
| `fdpm profile get <id>`          | `GET /profiles/{id}`                           |
| `fdpm profile get <id> --raw`    | `GET /profiles/{id}/raw`                       |
| `fdpm profile register`          | (CLI-only; equivalent to plugin `activate()`)  |
| `fdpm project create`            | `POST /projects`                               |
| `fdpm project list`              | `GET /projects`                                |
| `fdpm project get <id>`          | `GET /projects/{id}`                           |
| `fdpm project delete <id>`       | `DELETE /projects/{id}`                        |
| `fdpm project split <id>`        | `POST /projects/{id}:split`                    |
| `fdpm project clone <id>`        | `POST /projects/{id}:clone`                    |
| `fdpm project rebuild-from-log`  | `POST /projects/{id}:rebuild-from-log`         |
| `fdpm primitive {list,get,create,replace,patch,delete,field-patch}` | `/projects/{id}/primitives/...` |
| `fdpm relation {list,get,create,replace,patch,delete,field-patch}`  | `/projects/{id}/relations/...`  |
| `fdpm structure reorder`         | `POST /projects/{id}/structure:reorder`        |
| `fdpm structure reparent`        | `POST /projects/{id}/structure:reparent`       |
| `fdpm edit <project>`            | `POST /projects/{id}/edits`                    |
| `fdpm template {list,create,apply}` | `/projects/{id}/templates`                  |
| `fdpm test-suite {list,create,run}` | `/projects/{id}/test-suites`                |
| `fdpm transfer {export,import}`  | `/transfer/...`                                |
| `fdpm log show`                  | `GET /projects/{id}/log`                       |
| `fdpm log at <id> <revision>`    | `GET /projects/{id}/at?revision=N`             |
| `fdpm log undo <id>`             | `POST /projects/{id}:undo`                     |
| `fdpm log audit <id>`            | `GET /projects/{id}/log` projected as AuditRecord |
| `fdpm health liveness`           | `GET /healthz`                                 |
| `fdpm health readiness`          | `GET /readyz`                                  |
| `fdpm version`                   | `GET /version`                                 |
| `fdpm plugin list`               | `GET /plugins` (§6.6)                          |
| `fdpm plugin get <id>`           | `GET /plugins/{id}`                            |
| `fdpm plugin manifest <id>`      | `GET /plugins/{id}/manifest`                   |
| `fdpm plugin capabilities <id>`  | `GET /plugins/{id}/capabilities`               |
| `fdpm plugin enable <id>`        | `POST /plugins/{id}:enable`                    |
| `fdpm plugin disable <id>`       | `POST /plugins/{id}:disable`                   |
| `fdpm plugin reload <id>`        | `POST /plugins/{id}:reload`                    |
| `fdpm plugin quarantine-clear`   | `POST /plugins/{id}:quarantine-clear`          |
| `fdpm render <project> <target>` | invokes the matching `cap:renderer`; output gated by §6.5 |

## Plugin runtime (SPEC-PLUGGABLE-ARCHITECTURE 1.1)

Server-side plugin runtime under `fdpm-cli/src/plugin/`. Capabilities supported:

| Capability ID            | Notes                                          |
| ------------------------ | ---------------------------------------------- |
| `cap:profile`            | DomainProfile contribution; the headline use.  |
| `cap:validator`          | Custom validator function for a primitive type. Runs in §7.1 step 6 with exception barrier. |
| `cap:renderer`           | Server-side renderer; gated by `render:server`.|
| `cap:transformer`        | Primitive→primitive transform; emits Core operation list. |
| `cap:importer`           | `ProjectTransfer` ingest; gated by `import:project`. |
| `cap:exporter`           | `ProjectTransfer` egress; gated by `export:project`. |
| `cap:lifecycle-hook`     | One callback per `on-install`/`on-enable`/`on-disable`/`on-uninstall` event. |

Out of scope by design (not a CLI concern): `cap:route` (no HTTP server),
all `cap:ui:*` (no frontend).

**Cross-plugin slot uniqueness** (§7.4): two plugins MUST NOT register
the same `(capability_id, slot_key)` pair. Slot keys:
- `cap:importer` / `cap:exporter` → `format`
- `cap:renderer` → `(target, rendererId)`
- `cap:transformer` → `(fromTypeId, toTypeId, name)`

The first registration wins; the second raises `PluginError(conflict)`,
which propagates out of `activate()` and quarantines the offending
plugin. The first plugin stays `active`. Reaching that quarantine path
without breaking the host is covered in `tests/plugin-runtime.test.ts`.

**Importer dispatch** (`cap:importer`, gated by `import:project`):
operators run a registered importer via:

```bash
fdpm transfer import-as <format> -f raw.json \
  --project-id <id> --project-name "<name>" \
  [--project-description <text>] \
  [--extra-profile-id <id>] \
  [--extra key=value ...]
```

`runImporter` runs the importer inside the per-plugin exception barrier
(§6.4): a raise quarantines the owning plugin and surfaces a
`PluginError(capability)` to the operator without touching the host.
The importer's output is then **re-validated through the canonical
`ProjectTransfer` Zod schema** (§6.5 / §8.1) before the import proceeds —
the host gates plugin output rather than trusting it. Per-primitive
field validation runs subsequently as part of `importTransfer`'s
`primitive.create` ops, so any field-shape, enum, or required-field
violation surfaces as a `validation`-category `FDPMException` at import
time rather than silently accepted.

**Renderer dispatch** (`cap:renderer`, gated by `render:server`):

```bash
fdpm render <project> <target> \
  [--renderer-id <id>] \   # disambiguate when multiple renderers match the target
  [-o <path>]              # write bytes to file (required for binary targets)
```

`runRenderer` runs the registered renderer inside the per-plugin
exception barrier (§6.4) and then re-validates the output through the
§6.5 verification gate:

1. **Content-type match** — `RendererOutput.contentType` MUST equal the
   target the renderer was registered under (a renderer cannot lie about
   what it produced).
2. **Size cap** — output bytes MUST NOT exceed `FDPM_MAX_RENDER_BYTES`
   (default 50 MiB).
3. **UTF-8 check** — for `text/*` targets, the bytes MUST decode as
   valid UTF-8 (reject malformed sequences early).

A gate failure surfaces `PluginError(verification)` and does NOT
quarantine the plugin (the function ran fine; only the output was
unacceptable). A raise from the renderer DOES quarantine.

**The `formal_specification` plugin ships three renderers**:

| target               | rendererId               | layout |
| -------------------- | ------------------------ | ------ |
| `text/markdown`      | `fs:SpecRenderer`        | front matter, sections by `field_values.number`, per-primitive field tables, bibliography appendix from `fs:Citation` |
| `text/html`          | `fs:SpecHtmlRenderer`    | self-contained HTML (no external assets) with print-friendly CSS (`@media print`) — open in a browser, print to PDF for visual fidelity |
| `application/pdf`    | `fs:SpecPdfRenderer`     | A4 multi-page via `pdf-lib`; built-in StandardFonts (Helvetica, Courier); section-per-page break |

Containment is inferred from `fs:ContainedIn` relations and `scope_id`
matching the section's id. Citations are pulled out of their containing
sections and emitted as a single bibliography appendix.

**Honest gaps**:
- The PDF is **functional**, not visually identical to the Python
  WeasyPrint output. Reaching visual parity would require shelling out
  to Python (cross-runtime coupling) or a headless browser (large dep
  tree). Neither is in scope for v1.1.
- pdf-lib's StandardFonts use WinAnsi; code points above U+00FF are
  replaced with `?`. A future renderer that needs full Unicode should
  embed a TTF font.
- Field-rendering for richly typed values (equations as LaTeX,
  attention maps, tensor shapes) is generic JSON. Per-field-type rich
  rendering belongs to a future plugin add.

**Lifecycle state machine** (§6.4) implemented in full:
`discovered → registered → active/disabled/quarantined`. First unhandled
exception in any plugin callable quarantines the *whole plugin* and
tears down its renderer/transformer/importer/exporter contributions.
Profile contributions are not unregistered on disable (Core's profile
registry has no unregister path in v1.1; see "honest gaps" below).

**Trust tiers** (§10.1):
- `core` — plugins under `fdpm-cli/plugins/<id>/` (in-tree). Auto-active.
- `verified` — manifest declares `trust.signed_by` matching one of the
  comma-separated keys in `$FDPM_TRUSTED_KEYS`. Auto-active.
- `community` — discovered, valid manifest, no signature. Starts
  `disabled`; operator runs `fdpm plugin enable <id>`.
- `unknown` — never reached in v1.1 (anything that lands as a
  filesystem plugin with a valid manifest is at least `community`).

**Discovery** (§6.3):
1. In-tree built-ins: scan `fdpm-cli/plugins/` (or `plugins/` from CWD).
2. Filesystem fallback: scan each directory in `$FDPM_PLUGIN_PATH`
   (colon-separated, default `~/.fdpm/plugins`).

A plugin directory must contain `fdpm-plugin.json` (the manifest) and
an entry module (`index.js`, `index.mjs`, or `index.ts` for `tsx`).

## SPEC-DNIS adoption (SPEC-CORE 1.2 §5.6)

SPEC-CORE 1.2 normatively adopts SPEC-DNIS as the contract for
paragraph-grain identity within document-shaped primitives.
Conformance is **MUST**: any FDPM-CLI host claiming SPEC-CORE 1.2
conformance MUST register the built-in `profile:dnis:0.1` plus the
composition profile `profile:spec-authoring-dnis:0.1`, and MUST
expose the host adapter that maps SPEC-DNIS Operations onto
SPEC-CORE op-log entries.

**What ships:**

- `plugins/dnis/` — built-in plugin registering `dnis:Document`,
  `dnis:Node`, `dnis:DerivedFrom`, `dnis:MigratedFrom` per §5.6.1.
- `plugins/spec_authoring_dnis/` — composition profile that
  `extends` both `profile:spec-authoring:0.1` and
  `profile:dnis:0.1`. Build scripts opting into DNIS-backed sections
  target this profile_id; existing `profile:spec-authoring:0.1`
  projects are unaffected.
- `src/core/dnis/` — the SPEC-DNIS surface:
  - `store.ts` — `InMemoryDnisStore`, the planning/cache layer.
  - `adapter.ts` — `DnisHostAdapter`, the §5.6.6 reference fixture.
    Routes SPEC-DNIS Operations through `Host.appendBatchWithCausation`
    so each Operation materialises as one or more SPEC-CORE op-log
    entries sharing a `causation_op_id`. The §8 OperationResult
    idempotency map is a deterministic projection of the op log.
  - `types.ts`, `position.ts` — branded ids, fractional-index
    Position with the §6.2 Insertion Property.
- `fdpm dnis` CLI — `create-doc | create-node | edit | move | list
  | resolve` subcommands wired through the adapter. The complex
  multi-target Operations (`split`, `merge`, `compact`) remain
  SDK-only.

**Section-tree integration (SPEC-SECTIONS-TREE v0.2):**

The `spec:SpecMarkdownRenderer` gains a DNIS-backed section path:
when a project contains a `dnis:Document` and one or more active
`dnis:Node` primitives of `kind: "section"`, the renderer DFS-walks
the dnis:Node graph (parent_node_id, sorted by SPEC-DNIS Position)
and derives §N.M.K headings from the path. The legacy
`spec:Section` / `spec:HasSection` path stays available verbatim
for unmigrated projects; mixed-mode projects emit a
`spec:render:mixed-mode-sections` warning and the DNIS path wins.

A dnis:Node section's `content` JSON supports four optional fields
beyond the required `title`/`body_md`:
- `dispatch_kind` — keys `KIND_RENDERERS` (e.g., `"adr"`,
  `"references"`, `"open_questions"`).
- `ref_slug` — author-supplied stable handle for cross-references.
- `eval_body` — opt-in body_md template evaluation through
  `ctx.renderDsl.renderTemplate`. Default off preserves byte-equal
  output for prose containing literal `${…}`.
- `number_override` — literal §-label that overrides both the
  rendered heading and the section_index value. Used when DFS
  can't represent the structure (letter appendices, mid-chain
  inserts).

**Cross-section references via `fn.section_of`:**

Helper-set v1.2.0 ships `fn.section_of(node_id)` (in
`SPEC-EXPRESSION-RUNTIME` / `SPEC-RENDER-DSL`). Resolves a
dnis:Node id (NID, slug-form primitive id, author-supplied
`section:<ref-slug>`, or title-derived
`section:<lowercased-hyphenated>` with collision suffixes) to its
rendered §N.M.K heading via the render-time `doc.section_index`
Tier-A binding. Throws `unknown-name` on miss — never silently
coerces to `''`.

**Migration status:**

Both `docs/specs/SPEC-CORE.md` and `docs/specs/SPEC-DNIS.md` are
built from sources that target `profile:spec-authoring-dnis:0.1`
and emit their section trees via `DnisHostAdapter`. Migration was
gated by byte-equality against the pre-migration rendered output;
both pass (106299 bytes for SPEC-CORE, 69651 bytes for SPEC-DNIS).

## formal_specification plugin (full Python-source port)

In-tree at `fdpm-cli/plugins/formal_specification/`. Port of
`src/fdpm/plugins/formal_specification.py` (3,251 LOC monolithic literal),
decomposed per SPEC-PLUGGABLE §6.1 / §9.1:

```
fdpm-cli/plugins/formal_specification/
├── fdpm-plugin.json           # manifest (cap:profile + cap:lifecycle-hook)
├── index.ts                   # entry: assembles + exports the DomainProfile
├── _common.ts                 # FieldDef helpers (str, text, int, enumOf, ...)
├── _id-lists.ts               # ALL_PRIMITIVE_IDS, CONTAINABLE_IDS
├── categories.ts              # 9 CategoryDef
├── scopes.ts                  # 8 ScopeDef + 2 scope_sets + default
├── primitives/
│   ├── structure.ts           # 5 types (Section is the partition unit)
│   ├── type_system.ts         # 3 types
│   ├── semantics.ts           # 5 types
│   ├── process.ts             # 2 types
│   ├── assurance.ts           # 7 types
│   ├── mathematics.ts         # 2 types
│   ├── architecture.ts        # 3 types
│   ├── empirical.ts           # 4 types
│   └── bibliography.ts        # 1 type
├── relations.ts               # 30 RelationTypeDef
├── validation_rules.ts        # 23 ValidationRuleDef
├── renderer_bindings.ts       # 3 RendererBinding (runtime-visible surface)
└── templates.ts               # 3 TemplateDef + RenderingRules
```

Content parity verified by automated test against the Python source's
counts (`tests/formal-specification-content.test.ts`).

### Meta-model extensions for the port

The CLI Core meta-model was extended (Option 2 — additive) to express
the Python source's declarations faithfully:

- `FieldDef.legacy_type` — escape-hatch string spec compatible with the
  Python plugin format (`"string"`, `"ConstrainedText"`, `"ISO8601"`,
  `'Enum["a","b"]'`, `"T[]"`, `"StructField[X][]"`). A `compileProfile`
  step at registration translates these into the structured `kind` +
  companion fields. The runtime sees only the structured form.
- `PrimitiveTypeDef.name`, `scoped`, `constraints` — Python parity.
- `RelationTypeDef.source_types`/`target_types` (lists or `"*"`),
  `cardinality_bounds` (Python `Cardinality(source_min, source_max,
  target_min, target_max)`), `symmetric`, `transitive`,
  `metadata_schema` (alias for `fields`).
- `DomainProfile.name`, `templates`, `scope_sets`, `default_scope_set`,
  `renderers` (Python alias for `renderer_bindings`).
- `IDFormatRule.pattern_kind: "regex" | "template"` — distinguishes
  CLI native regex patterns from Python template patterns
  (`"section:{number}"`). The validation pipeline normalises template
  patterns into regex at evaluation time.
- `IDFormatRule.uniqueness` widened to `"global" | "project" |
  "per_scope" | "per_parent"`.
- `CategoryDef`/`ScopeDef`/`ValidationRuleDef`/`RendererBinding`:
  Python aliases (`name` for `label`, `applies_to` for `targets`,
  `predicate` for `expression`, `renderer_id`+`output_format`+
  `output_path` for `primitive_type_id`+`target`).
- New `RenderingRules`, `TemplateDef`, `TypeConstraint` types.
- `CORE_ID_PATTERN` widened to admit CamelCase segment names
  (`fs:Section`) and dot-separated version suffixes
  (`profile:formal-specification:3.0`), per SPEC §12.1's "plus
  version suffix where applicable" allowance.

All extensions are additive — existing tests written against the v1.1.0
shape still pass unchanged.

## Architecture

```
fdpm-cli/src/
  bin/fdpm.ts              # commander entry
  core/
    models/                # §4 meta-model + §5 instance model (zod)
    operations/            # §5.5.1 closed kind set, payloads, inverse, JSON-Patch, upcast
    profile/               # core:empty + §4.3 resolution + registry + compile.ts (legacy normaliser)
    validation/            # §7 pipeline (steps 1–7, with custom validator slot)
    gate/                  # §8 verification gate
    store/                 # §6 store + state, replay (§5.5.3), append, snapshots
    audit/                 # §13.3 AuditRecord projection + truncation
    errors/                # §16 typed FDPMException
    identity/              # §12.1 ID rules + §11.3 reservations
    version/               # SPEC version + host metadata
    host.ts / host-extra.ts # entry points used by commands
  plugin/                  # SPEC-PLUGGABLE-ARCHITECTURE 1.1 runtime
    manifest.ts            # §5.1 JSON Schema → Zod port
    discovery.ts           # filesystem scan + entry-module dynamic import
    runtime.ts             # PluginRuntime: registry, lifecycle, capability dispatch
    context.ts             # PluginContext bound to (host, manifest, contributions)
    types.ts               # capability registration shapes
    errors.ts              # PluginError → FDPMException mapping
  commands/                # one module per command group (incl. plugin admin)
  persistence/             # JSONL log + profile dir under ~/.fdpm-cli/
fdpm-cli/plugins/
  formal_specification/    # full Python-source port (32 primitives, etc.)
```

```sh
rm -rf /tmp/fdpm-spec-mcp
FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/scripts/build-spec-mcp-server.ts
FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/src/bin/fdpm.ts \
  render spec-mcp-server text/markdown \
  --renderer-id spec:SpecMarkdownRenderer \
  -o docs/specs/SPEC-MCP-SERVER.md
```

### Architectural decisions

The recorded ADRs live at [docs/adrs/decisions.md](docs/adrs/decisions.md) and
are generated from `sw:Decision` primitives via the
`fdpm.software-architecture` plugin's `sw:ADRRenderer`. To regenerate after
adding a new decision, edit
[fdpm-cli/scripts/build-adrs.ts](fdpm-cli/scripts/build-adrs.ts) and run:

```sh
rm -rf /tmp/fdpm-adrs
FDPM_DATA_DIR=/tmp/fdpm-adrs npx tsx fdpm-cli/scripts/build-adrs.ts
```

## Persistence model

Per §6.4: the operation log shape is SPEC-locked; on-disk persistence
is deferred to a future `SPEC-CORE-PERSISTENCE`. The CLI ships a
straightforward JSONL writer (one file per project) so a CLI is useful
between invocations. The shape on disk is exactly the locked
`Operation` shape, so a future bytes-on-disk SPEC supersedes this file
without changing semantics.

```
$FDPM_DATA_DIR/                     (default: ~/.fdpm-cli)
├── manifest.json
├── profiles/
│   └── test_demo.json              (registered DomainProfiles)
└── projects/<project_id>/log.jsonl (one Operation per line)
```

`--no-persist` runs in-memory only; `--data-dir <path>` overrides.

## Conformance — §18 acceptance criteria

The CLI is conformant against:

- `core-meta-001`/`002`/`003` — meta-model strict mode, profile
  resolution (circular + collisions), `core:empty` registered.
- `core-instance-001`/`002` — instance creation requires a registered
  profile; invariants tested.
- `core-validation-001`/`002` — pipeline ordering, exception barrier
  for custom validators (Step 6 structure preserved). The CLI now has
  a plugin runtime, so the barrier is exercised by both direct
  `registerValidator` and plugin-supplied `cap:validator`.
- `core-gate-001` — payload rejection per kind; reserved namespaces.
- `core-edit-002`/`003`/`004`/`006` — immutable field rejection,
  batch atomic rollback, If-Match conflict, reorder permutation.
- **§9.7.4 path-scoped revalidation**: `:field-patch` runs the §7
  pipeline scoped to the *touched* top-level paths only. Type
  resolution, ID format, required-field, and custom-validator checks
  still run in full; per-field shape and declared-validation checks
  iterate touched paths only. This makes editing imported third-party
  data with pre-existing violations practical (a patch on field B
  succeeds even when field A is over `max_length`). Whole-record
  `PATCH` (`primitive patch`) keeps the strict full-record validation;
  the relaxation is `:field-patch`-only.
- `core-graphops-split-001`/`002`/`003`, `clone-001`/`002`,
  `meta-001` — split partition, refused inputs, no-partition-unit
  rejection, clone collision.
- `core-eventsource-001`–`007` — single op per affected record under
  one request_id; replay determinism; `:at` byte-equality; per-kind
  undo; snapshot equivalence; upcaster table is empty in v1.1
  (correct — only one schema version exists).
- `core-observability-002` — audit diff truncation + marker.
- `core-versioning-001` — `spec_core` is `"1.2"`; revision is
  `"1.2.0"`; both reported by `fdpm version`.

Criteria specifically about Layer 7 (`core-fe-*`) are N/A by design —
the CLI does not have a frontend shell.

### SPEC-PLUGGABLE acceptance criteria covered

Adapted from §13:

- **#1 Discovery** — adding a plugin directory with `fdpm-plugin.json`
  causes it to appear in `fdpm plugin list` after a fresh process
  invocation, without editing the CLI source.
- **#2 Built-ins migrated** — `formal_specification` is a package, not
  a single file; ships its own `fdpm-plugin.json`; loads via the
  discovery path.
- **#3 Decomposition** — no file in `fdpm-cli/plugins/formal_specification/`
  exceeds 600 LOC (largest is `relations.ts` at ~350 LOC).
- **#5 Admin API** — `fdpm plugin {list,get,manifest,capabilities,
  enable,disable,reload,quarantine-clear}` exist and pass tests.
- **#6 Failure isolation** — `tests/plugin-runtime.test.ts` asserts a
  raising `activate()` quarantines its plugin; the host stays alive
  and other operations succeed.
- **#7 Verification gate** — manifest validation and host-compat checks
  exercised in tests; bad manifests are rejected and logged.
- **#9 No global mutation** — plugins receive `PluginContext`; nothing
  in `fdpm-cli/plugins/**` imports the Core store directly.
- **#13 Manifest cross-version** — a v1.0.0 manifest loads on the v1.1
  host; v1.x range matching enforced via `host_compatibility.fdpm`.
- **#14 Lifecycle hooks** — the four-event dispatch is wired
  (`onInstall`/`onEnable`/`onDisable`/`onUninstall`); `formal_specification`
  registers an `on-enable` hook used in the smoke output.

Out of scope by design (CLI host): #4 (frontend slots), #8 (full
permission table — only the server-side permissions are wired),
#10–#12 (echo plugin / coverage targets / docs guide), #15–#17
(slot conflicts, frontend scoped client, first-paint budget).

Criteria explicitly about a frontend (`core-fe-*`, SPEC-PLUGGABLE
`cap:ui:*`) are N/A by design — the CLI has no frontend shell.

## What is intentionally not implemented

Everything listed in SPEC §20 (Out of Scope) plus:

- Frontend shell (§10) and `cap:ui:*` capabilities.
- `cap:route` (no HTTP server in the CLI).
- Multi-tenant authorisation, sandboxing, marketplace (§14.2 already
  declares these out of v1.0 scope).
- A test-suite expression engine — `runTestSuite` reports each check
  as a finding using its declared level. A real engine is plugin
  business per §17.1.
- `ValidationRuleDef.predicate` evaluation in the **CLI Core** is
  intentionally absent — the v1.1 pipeline ships no built-in DSL
  evaluator. **The formal_specification plugin closes this gap for
  its own 23 rules** by registering a `cap:validator` per rule that
  evaluates the predicate in TypeScript (see `_validators.ts` /
  `_register_validators.ts`). When a validator is registered for a
  given (type_id, rule_id) the pipeline suppresses the step-5 info
  emission for that rule, so each logical check produces exactly
  one finding at the rule's declared level. A profile that ships
  rules without paired `cap:validator` registrations still gets the
  v1.1 fallback (info-level finding with declared level on
  `evidence.declared_level`). A general `cap:predicate-evaluator`
  Core capability for declarative rather than per-rule evaluators
  would close the gap centrally; not in v1.1.
- Bernstein-condition parallelism analysis is **derivable** from the
  imported v0.4 roadmap data (the v3.2 schema completion locks in the
  `fs:Phase.reads` / `fs:Phase.writes` shape that supports it), but no
  CLI command performs the analysis yet. The natural next step is a
  `fdpm analyse parallelism <project>` subcommand that walks the
  per-phase reads/writes and reports the Bernstein-safe set + the
  longest serial RAW chain.

## Limitations and honest gaps

- **§5.4.1 split atomicity**: rollback on per-target failure issues
  forward `project.delete` ops rather than rewinding the log
  (consistent with §5.5.7's "no history rewriting"). The projection
  ends up correct; the audit trail records the failed split as
  attempted-then-undone. This is the conservative reading of the
  SPEC's "all-or-nothing" requirement (§5.4.1) layered on the
  forward-only log; a strict reading would require a transaction
  layer the SPEC explicitly defers.
- **Snapshots** are taken at the configured cadence but the `:at`
  endpoint replays from revision 0 every time it is called — the
  performance optimisation hint in §5.5.5 is implemented for
  future use but not consulted by `getProjectAt`. Correct enough
  for `core-eventsource-005`, slower than ideal for very long logs.
- **No URL-compatibility window** to honour (§9.6): N/A — there are
  no pre-migration paths in a CLI.
- **Plugin profile teardown is incomplete.** When a plugin is disabled,
  its renderer/transformer/importer/exporter contributions are torn
  down, but its `DomainProfile` registration stays in `host.profiles`.
  Core's `ProfileRegistry` has no `unregister(id)` path in v1.1 and
  the SPEC does not require one. A process restart re-runs `activate()`
  and re-registers, so the discrepancy is bounded by the process
  lifetime; documented here for honesty.
- **`cap:lifecycle-hook` `on-install` first-time tracking is best-effort.**
  The CLI runs `on-install` on every fresh process activation rather
  than once-per-installation. SPEC §4.4's first-time semantics need a
  persistent install marker, which is operator tooling deferred to a
  future SPEC.

## License

Same as the parent project (see [../LICENSE](../LICENSE) if present).

## See also

- [docs/specs/SPEC-CORE.md](docs/specs/SPEC-CORE.md) — the SPEC this implements.
- [docs/specs/SPEC-DNIS.md](docs/specs/SPEC-DNIS.md) — Document Node Identity Specification; adopted by SPEC-CORE 1.2 §5.6.
- [docs/specs/SPEC-SECTIONS-TREE.md](docs/specs/SPEC-SECTIONS-TREE.md) — sections-as-DNIS-Nodes proposal; SPEC-CORE / SPEC-DNIS migrated to the DNIS-backed section path.
- [docs/specs/SPEC-RENDER-DSL.md](docs/specs/SPEC-RENDER-DSL.md) — render-time DSL; helper-set v1.2.0 ships `fn.section_of`.
- [docs/specs/SPEC-EXPRESSION-RUNTIME.md](docs/specs/SPEC-EXPRESSION-RUNTIME.md) — host CEL runtime + helper-set + Tier-A/B activation.
- [docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md](docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md) — companion SPEC; server-side capabilities implemented (see "Plugin runtime" above).
- [docs/adrs/decisions.md](docs/adrs/decisions.md) — architectural decision records, generated from `sw:Decision` primitives by [fdpm-cli/scripts/build-adrs.ts](fdpm-cli/scripts/build-adrs.ts).
- [fdpm-cli/references/python-sources/formal_specification.py](fdpm-cli/references/python-sources/formal_specification.py) — the Python source the formal_specification plugin ports.
- [CLAUDE.md](CLAUDE.md) — project-level engineering rules.
- [PURPOSE.md](PURPOSE.md) — repository purpose and non-goals.
