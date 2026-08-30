---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

# fdpm — Agent-driven domain workbench, event-sourced, plugin-extensible

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](./DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

---

> **ARCHITECTURAL REQUIREMENT (PALS's LAW):** LLMs will always produce some
> form of error. Absence of output verification is a design defect, not a
> runtime bug. All LLM output must be treated as untrusted and validated
> explicitly.

## Who this is for

The primary user of an FDPM workbook is an **LLM agent**, talking to
the runtime through MCP. Humans are reviewers — they read renders,
audit the operation log, and (in a future iteration) interact through
a web UI sitting on the same MCP surface. The CLI exists; it is the
debug surface and the script-automation surface, not the design
target. See [PURPOSE.md](PURPOSE.md) for the full framing.

Where the agent surface and the CLI surface conflict, the agent
surface wins and the CLI inherits the same shape. This is a
deliberate inversion of the original "CLI for operators" framing.

## How the agent drives a workbook

A plugin ships an installable domain vocabulary in four parts,
ordered by how a cold agent encounters them:

1. **Verbs (act)** — domain-specific operation kinds.
   `planning.task.complete`, `fs.assumption.invalidate`,
   `dnis.node.split`. Each verb is a first-class entry in the
   operation log: namespaced by plugin, replayable, auditable.
   Verbs are exposed as per-verb MCP tools so a cold agent can
   call them by name with typed payloads.
2. **Resources (read)** — plugin-contributed read-only views of
   workbook state, addressed by URI
   (`fdpm://workbook/{id}/render/{target}` ships today;
   plugin-authored URI schemes are the v2 commitment). Reads go
   through resources, not through `get_*` tools. This is a
   structural rule: tools that bloat the catalog with read
   variants degrade agent attention on tool selection, which is
   the failure mode the architecture exists to avoid.
3. **Prompts (orient)** — MCP prompts shipped by each plugin
   (`planning/triage_iteration`, `fs/audit_assumptions`,
   `sw/review_decisions`). The user invokes a prompt; the prompt
   delivers the *how to think* layer that tool descriptions alone
   cannot. This is what closes the cold-start gap.
4. **Expressions (compose)** — a filter language exposed through
   one MCP tool, `workbook.operation(expr)`, that lets the agent
   compose queries, graph traversals, guards, and verb invocations
   atomically. The grammar borrows dynamic-array idioms from
   spreadsheets and PowerQuery M — `FILTER`, `MAP`, `FOR_EACH`,
   `LET`, structured-table references like
   `plan:Task[iteration="iter-q2"]` — at the surface; the
   semantics diverge (verbs are syntactically distinct, fail with
   structured errors that don't propagate as values, produce
   auditable ops). Expressions compile down to the same atomic
   verb ops; the log is the truth, not the expression text.

Cutting across all four: **discovery tools** —
`list_verbs`, `describe_verb`, `applicable_operations(entity)`,
`describe_language`, `list_resources`, `workbook.dry_run(expr)` —
let an agent learn the vocabulary at runtime. To keep the catalog
small enough that the agent can reason about it, verbs and
resources are **summarized at connect** and the full surface is
fetched on demand. This is progressive disclosure, converging on
the direction MCP Skills (SEP-2640) is taking without locking to
its draft shape.

**Change notifications** (`notifications/tools/list_changed`,
`notifications/resources/list_changed`,
`notifications/prompts/list_changed`) keep long-running agents
from operating against stale catalogs when another actor edits the
workbook concurrently.

How humans participate:

- **Renderers** produce the human-readable artifact for a workbook
  at a given revision. `text/markdown`, `text/html`,
  `application/pdf`, SVG diagrams — every plugin contributes.
- **The operation log** records every state change as a typed,
  plugin-namespaced op with `actor`, `plugin_id`, `request_id`,
  and `causation_op_id`. A human can replay to any revision,
  inspect why an agent chose a verb, and undo via inverse ops.

## Implementation status (vs. the design above)

The runtime, plugin model, MCP server, and renderer pipeline below
are shipped. The verb / resource / prompt / expression surfaces are
the in-flight architectural direction; they extend the existing
event-sourced core without breaking it. The architecture is a
hypothesis, not a finished product — see "Eval design" below.

| Layer | Status |
| --- | --- |
| Event-sourced workbook core (replay, time-travel, undo, audit) | Shipped |
| Plugin runtime (profiles, validators, renderers, transformers, importers, exporters) | Shipped |
| MCP server (Tier 1/2/3 generic CRUD tools) | Shipped |
| MCP resource surface (`fdpm://workbook/{id}/render/{target}`) | Shipped |
| MCP schema resources (`fdpm://schema/profile`) and the tool-catalog byte budget (SPEC-MCP-SERVER §8.5) | Shipped |
| MCP server instructions (`initialize.instructions`, mirrored at `fdpm://guide`) — cold-start orientation until plugin prompts land (SPEC-MCP-SERVER §8.6) | Shipped |
| MCP Tier-3 hardening — `dry_run` previews (also CLI `--dry-run` and SDK `preview*Delete`), mandatory idempotency keys with replay, pre-execution audit (SPEC-MCP-SERVER §8.7) | Shipped |
| MCP audit report — `fdpm://audit/report[/{window}]`, `fdpm mcp audit-report`, SDK `auditReport`: error classes from the audit log (SPEC-MCP-SERVER §9.5) | Shipped |
| Renderers as the human-review surface (markdown / HTML / PDF / SVG) | Shipped |
| Plugin-emitted operation kinds (verbs as first-class ops) | v1; SPEC-PLUGIN-VERBS in flight |
| Per-verb MCP tools, plugin-version migration contract | v1 |
| `ctx.registerPrompt(reg)` API with the skill contract (when to use / call order / failure modes, budgets) (SPEC-MCP-SERVER §13.5) | Shipped |
| Plugin-contributed resource URI schemes (beyond render) | v2 |
| Discovery tools (`list_verbs`, `describe_verb`, `applicable_operations`, `list_resources`) | v2 |
| First plugin-shipped MCP prompt (`planning/triage_iteration`) via `prompts/list` / `prompts/get`, CLI and SDK | Shipped |
| Plugin prompts as domain operating instructions — `loop-forward/author_pipeline` and `loop-forward/audit_pipeline`, with a drift gate over the ids they cite and a measured body-byte ratchet | Shipped |
| `profile:knowledge-cartridge:1.0` — talent cartridges as a typed graph, with the generator protocol's verification pass running as validators and the checks it cannot make declared rather than dropped | Shipped |
| Progressive-disclosure / Skills-shaped catalog summarization | v2 |
| MCP change notifications (`tools`/`resources`/`prompts` list_changed) | v2 |
| **Three-arm cold-agent eval gate** | **End of v2** |
| `workbook.operation(expr)` filter language (sources + FILTER + LET) | v3, scoped down |
| Expression language extras (MAP, FOR_EACH, LAMBDA, transitive closures) | Open-ended; revise after v2 eval result |
| Web UI (humans on the same MCP surface) | Future |
| Community plugin distribution, signing, third-party trust hardening | Post-eval; not in current roadmap |

## Eval design (the falsifiable contract)

The verb / resource / prompt / expression architecture is a
hypothesis. The eval at end of v2 is what tells us whether the
hypothesis holds.

**Design.** Three arms run in parallel against the same 50-instruction
test set, on the same model snapshot, with no prior fdpm exposure:

1. **Verbs only** — per-verb MCP tools, no discovery, no prompts.
2. **Verbs + discovery** — adds `list_verbs`, `describe_verb`,
   `applicable_operations(entity)`, `list_resources`.
3. **Verbs + discovery + prompts** — adds the first plugin-shipped
   MCP prompt and any prompt-layer tooling needed to invoke it.

The differential between arm 2 and arm 3 isolates the marginal
contribution of prompts. If arm 3 doesn't beat arm 2 by at least
**15 percentage points** on first-try success, prompts didn't pay
for themselves and the v3+ work that depends on the prompt thesis
is reconsidered.

**Pass criteria** for a single instruction (all four required):

1. Terminal workbook state matches the instruction's stated goal.
2. The audit log replays in isolation against a fresh workbook and
   produces the same terminal state (proves no hidden environment
   coupling).
3. No destructive ops (Tier 3) executed outside the instruction's
   stated scope.
4. Verb-sequence length within 2× the human-baseline sequence for
   the same instruction.

**Test-set composition.** The 50 instructions cover: simple verb
calls (single-primitive, no graph traversal), multi-step workflows
(chained verbs across primitives), batch operations (high-cardinality
matches that an expression would express atomically),
ambiguity-resolution cases (instructions where the agent must pick
between several applicable verbs), and refusal cases (instructions
that should be refused as out-of-scope or destructive).

**What "the eval failed" means.** If arm 3's first-try success rate
is below the threshold deemed acceptable for the agent product
case, the entire post-v2 roadmap is reopened. v3 (expression
language) does not start until v2 produces a number worth
betting on. This is the kill criterion the roadmap is gated by.

## Trust model (current state)

**In-house authorship only.** Every plugin shipped today is
treated as `core` trust. The `community` and `verified` tiers
exist in the manifest schema and in plugin-runtime behavior, but
the surfaces that need third-party hardening — verb registration,
prompt registration, expression emission — are not exercised
against them. Plugin authors today are FDPM contributors; the
runtime trusts them.

Distribution, signing, sandboxing, and community-tier hardening
are post-eval work. The architecture has to survive its own eval
before it's worth opening to third parties. If the eval fails,
none of this matters; if the eval succeeds, the trust mechanisms
get designed against a stable substrate rather than a moving one.

A from-scratch TypeScript implementation of the FDPM Core SPEC v1.2
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
- **SPEC-WORKSPACE 0.1.0** — Workspace as first-class primitive: ULID
  identity persisted in `workspace.json`, XDG-located registry,
  `.fdpmbak` backup format with sha256 per file, atomic restore with
  five-step verification pipeline, and the `fdpm workspace`
  subcommand suite (init / list / info / switch / rename / forget /
  backup / restore / verify). Phase 1 of the R2 remote-server
  roadmap — the interface boundary a future `RemoteWorkspace` slots
  into without breaking local consumers.
- **Regression-tested implementation surface**. Coverage spans:
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
    fields; end-to-end create-workbook/create-Section flow +
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

<!-- BEGIN GENERATED: env-vars (scripts/build-env-docs.ts) -->

| Variable | Default | Purpose |
| --- | --- | --- |
| `FDPM_DATA_DIR` | `~/.fdpm-cli` | Persistence directory for profiles and workbook logs. |
| `FDPM_PLUGIN_PATH` | unset | Extra plugin search paths (colon-separated). |
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
| `FDPM_REGISTRY_PATH` | `$XDG_STATE_HOME/fdpm/workspaces.json` | SPEC-WORKSPACE §12: override path to the operator-local workspace registry. |

<!-- END GENERATED: env-vars -->

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

# Create a workbook
fdpm workbook create --id demo --name "Demo" --profile test:demo

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
| `fdpm workbook create`            | `POST /workbooks`                               |
| `fdpm workbook list`              | `GET /workbooks`                                |
| `fdpm workbook get <id>`          | `GET /workbooks/{id}`                           |
| `fdpm workbook delete <id>`       | `DELETE /workbooks/{id}`                        |
| `fdpm workbook split <id>`        | `POST /workbooks/{id}:split`                    |
| `fdpm workbook clone <id>`        | `POST /workbooks/{id}:clone`                    |
| `fdpm workbook rebuild-from-log`  | `POST /workbooks/{id}:rebuild-from-log`         |
| `fdpm primitive {list,get,create,replace,patch,delete,field-patch}` | `/workbooks/{id}/primitives/...` |
| `fdpm relation {list,get,create,replace,patch,delete,field-patch}`  | `/workbooks/{id}/relations/...`  |
| `fdpm structure reorder`         | `POST /workbooks/{id}/structure:reorder`        |
| `fdpm structure reparent`        | `POST /workbooks/{id}/structure:reparent`       |
| `fdpm edit <workbook>`            | `POST /workbooks/{id}/edits`                    |
| `fdpm template {list,create,apply}` | `/workbooks/{id}/templates`                  |
| `fdpm test-suite {list,create,run}` | `/workbooks/{id}/test-suites`                |
| `fdpm transfer {export,import}`  | `/transfer/...`                                |
| `fdpm log show`                  | `GET /workbooks/{id}/log`                       |
| `fdpm log at <id> <revision>`    | `GET /workbooks/{id}/at?revision=N`             |
| `fdpm log undo <id>`             | `POST /workbooks/{id}:undo`                     |
| `fdpm log audit <id>`            | `GET /workbooks/{id}/log` projected as AuditRecord |
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
| `fdpm render <workbook> <target>` | invokes the matching `cap:renderer`; output gated by §6.5 |
| `fdpm workspace init`            | SPEC-WORKSPACE §16.1 (mint workspace.json + register)        |
| `fdpm workspace list`            | SPEC-WORKSPACE §12 (registry catalog)                        |
| `fdpm workspace info [lookup]`   | SPEC-WORKSPACE §11 (workspace.json identity)                 |
| `fdpm workspace switch <lookup>` | SPEC-WORKSPACE §16.5 (set `registry.current`)                |
| `fdpm workspace rename <lookup> <new>` | SPEC-WORKSPACE §16.3 (mutate name, clear `_minted`)    |
| `fdpm workspace forget <lookup>` | SPEC-WORKSPACE §16.7 (drop registry entry; data dir untouched) |
| `fdpm workspace backup -o <out>` | SPEC-WORKSPACE §13 (`.fdpmbak` zip + manifest at offset 0)   |
| `fdpm workspace restore <bundle> --data-dir <p>` | SPEC-WORKSPACE §14 (verify-first → atomic rename → Host.load) |
| `fdpm workspace verify [lookup]` | SPEC-WORKSPACE §16 verify (out-of-band Host.load round-trip) |

## Plugin runtime (SPEC-PLUGGABLE-ARCHITECTURE 1.1)

Server-side plugin runtime under `fdpm-cli/src/plugin/`. Capabilities supported:

| Capability ID            | Notes                                          |
| ------------------------ | ---------------------------------------------- |
| `cap:profile`            | DomainProfile contribution; the headline use.  |
| `cap:validator`          | Custom validator function for a primitive type. Runs in §7.1 step 6 with exception barrier. |
| `cap:renderer`           | Server-side renderer; gated by `render:server`.|
| `cap:transformer`        | Primitive→primitive transform; emits Core operation list. |
| `cap:importer`           | `ProjectTransfer` ingest; gated by `import:workbook`. |
| `cap:exporter`           | `ProjectTransfer` egress; gated by `export:workbook`. |
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

**Importer dispatch** (`cap:importer`, gated by `import:workbook`):
operators run a registered importer via:

```bash
fdpm transfer import-as <format> -f raw.json \
  --workbook-id <id> --workbook-name "<name>" \
  [--workbook-description <text>] \
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
fdpm render <workbook> <target> \
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

> **Note (current architecture):** the `community` and `verified`
> tiers exist and behave as documented for the capabilities shipped
> today (profile / validator / renderer / transformer / importer /
> exporter). The new surfaces — plugin-emitted operation kinds, MCP
> prompts, expression emission — are exercised against `core` trust
> only. Community-tier authorship of those surfaces is post-eval
> work. See "Trust model (current state)" above.

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
  workbooks are unaffected.
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
when a workbook contains a `dnis:Document` and one or more active
`dnis:Node` primitives of `kind: "section"`, the renderer DFS-walks
the dnis:Node graph (parent_node_id, sorted by SPEC-DNIS Position)
and derives §N.M.K headings from the path. The legacy
`spec:Section` / `spec:HasSection` path stays available verbatim
for unmigrated workbooks; mixed-mode workbooks emit a
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
- `IDFormatRule.uniqueness` widened to `"global" | "workbook" |
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
straightforward JSONL writer (one file per workbook) so a CLI is useful
between invocations. The shape on disk is exactly the locked
`Operation` shape, so a future bytes-on-disk SPEC supersedes this file
without changing semantics.

```
$FDPM_DATA_DIR/                     (default: ~/.fdpm-cli)
├── workspace.json                  (SPEC-WORKSPACE §11 identity: ULID + name)
├── manifest.json
├── profiles/
│   └── test_demo.json              (registered DomainProfiles)
└── workbooks/<workbook_id>/log.jsonl (one Operation per line)
```

`--no-persist` runs in-memory only; `--data-dir <path>` overrides.

## Workspace lifecycle (SPEC-WORKSPACE 0.1)

The data directory above is now identified by a `workspace.json`
that the host auto-mints on first touch. Every workspace has a stable
ULID `id` (immutable across path moves and machine migrations) and an
operator-chosen `name` you can rename later. A per-operator-per-machine
**registry** at `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`
catalogs the known workspaces; setting `FDPM_WORKSPACE=<name|id>`
resolves the data dir through it.

Data-dir resolution precedence (first match wins):

1. `--data-dir <path>` (CLI flag)
2. `$FDPM_DATA_DIR`
3. `$FDPM_WORKSPACE` resolved by name or id via the registry
4. registry's `current` entry
5. `~/.fdpm-cli` (legacy default)

Worked example — backup, restore, verify:

```bash
# Inspect the active workspace (auto-minted on first invocation).
fdpm workspace info --json

# List all known workspaces; * marks the current one.
fdpm workspace list

# Give the auto-minted workspace a friendly name (clears _minted).
fdpm workspace rename <id-or-name> production

# Write a backup. The bundle is a zip whose first entry is
# backup-manifest.json — operators can introspect without `fdpm`
# installed on the target machine:
#   unzip -p prod-2026-05-05.fdpmbak backup-manifest.json | jq .
fdpm workspace backup -o ./prod-2026-05-05.fdpmbak

# Restore to a fresh data dir under a new identity. --name mints a
# fresh ULID so the original workspace and the restored one can
# coexist in the registry.
fdpm workspace restore ./prod-2026-05-05.fdpmbak \
  --data-dir /tmp/prod-restore --name prod-clone

# Out-of-band Host.load() round-trip — proves the workspace's
# operation log replays cleanly. Useful in CI and as a smoke test
# after operator-led data dir surgery.
fdpm workspace verify prod-clone
```

Restore failure modes (each carries a structured `evidence.reason`):

| Scenario | Category | `evidence.reason` |
| --- | --- | --- |
| Bundle missing or unparseable manifest | `verification` | `manifest_invalid` |
| Bundle's `workspace_id` already in the registry, no flags | `conflict` | `workspace_id_collision` |
| Any data entry's sha256 disagrees with the manifest | `verification` | `sha256_mismatch` |
| Target dir on a different filesystem than the temp dir | `verification` | `cross_fs_rename` |
| Step 5 `Host.load()` throws (typically version skew) | `host_compat` | `version_skew` |

In every failure mode, the target dir is left untouched (or, for the
`host_compat` case, left in place so the operator can downgrade
`fdpm` and retry without re-extracting). `--force-overwrite` replaces
an existing `workspace_id`; `--name <new>` mints a fresh one;
`--skip-verify` opts out of step 5 when external verification is in
place.

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
  `fdpm analyse parallelism <workbook>` subcommand that walks the
  per-phase reads/writes and reports the Bernstein-safe set + the
  longest serial RAW chain.

## Limitations and honest gaps

- **§5.4.1 split atomicity**: rollback on per-target failure issues
  forward `workbook.delete` ops rather than rewinding the log
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

## Adjacent packages

- [`fdpm-cli/packages/zod-bridge`](fdpm-cli/packages/zod-bridge/) —
  `@fdpm/zod-bridge@0.4.0`. Deterministic, one-way translation from Zod v4
  schemas plus a `defineDomain()` sidecar into runnable FDPM plugins:
  `DomainProfile`, validators, view/product pages, USL-NG Core companion
  data, generated `fdpm-plugin.json` / `index.ts`, and schema-derived
  renderer / importer / exporter / expr-helper capabilities. Reference
  implementation of the workbook `howto-zod-to-fdpm-plugin`: the schema and
  sidecar are the source of truth, generated artefacts are derivations, and
  the bridge's snapshot gates keep them in sync.

## License

License file is not currently checked into this repository snapshot.

## See also

- [docs/specs/SPEC-CORE.md](docs/specs/SPEC-CORE.md) — the SPEC this implements.
- [docs/specs/SPEC-DNIS.md](docs/specs/SPEC-DNIS.md) — Document Node Identity Specification; adopted by SPEC-CORE 1.2 §5.6.
- [docs/specs/SPEC-SECTIONS-TREE.md](docs/specs/SPEC-SECTIONS-TREE.md) — sections-as-DNIS-Nodes proposal; SPEC-CORE / SPEC-DNIS migrated to the DNIS-backed section path.
- [docs/specs/SPEC-RENDER-DSL.md](docs/specs/SPEC-RENDER-DSL.md) — render-time DSL; helper-set v1.2.0 ships `fn.section_of`.
- [docs/specs/SPEC-EXPRESSION-RUNTIME.md](docs/specs/SPEC-EXPRESSION-RUNTIME.md) — host CEL runtime + helper-set + Tier-A/B activation.
- [docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md](docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md) — companion SPEC; server-side capabilities implemented (see "Plugin runtime" above).
- [docs/adrs/decisions.md](docs/adrs/decisions.md) — architectural decision records, generated from `sw:Decision` primitives by [fdpm-cli/scripts/build-adrs.ts](fdpm-cli/scripts/build-adrs.ts).
- [CLAUDE.md](CLAUDE.md) — workbook-level engineering rules.
- [PURPOSE.md](PURPOSE.md) — repository purpose and non-goals.
