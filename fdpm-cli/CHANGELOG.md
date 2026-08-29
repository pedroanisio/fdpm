---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code"
  date: "2026-05-04"
---

# Changelog

All notable changes to `@fdpm/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this workbook adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The SDK surface re-exported from `src/sdk.ts` carries its own
`0.x` stability note documented inside the file; breaking changes to
the SDK shape are still recorded here so embedders see them on
upgrade.

## [Unreleased]

### Fixed

#### `spec:SpecMarkdownRenderer` — references without optional fields rendered a `[[render-error]]` marker into the SPEC

`spec:Reference.locator` and `.verification_note` are optional (the note
is required only for `unverified` / `cannot_verify`). `REFERENCE_ITEM_TEMPLATE`
guarded both with `${if: doc.fields.<field>}`, but the guard is evaluated
by CEL, where reading an absent map key is an **error**, not a falsy
value. Every reference that omitted either field therefore emitted
`[[render-error: doc.fields.verification_note :: No such key …]]` into
the rendered document and pushed a render finding.

- Both guards now use the CEL presence macro (`${if: has(doc.fields.…)}`).
- Re-rendered from source, marker-free: SPEC-CEL-VALIDATOR, SPEC-CORE,
  SPEC-DOCUMENT-PLAN, SPEC-EXPRESSION-RUNTIME, SPEC-MCP-SERVER,
  SPEC-RENDER-DSL, SPEC-REPL. The SPEC-EXPRESSION-RUNTIME re-render also
  absorbs a pre-existing column-alignment drift in the §M activation
  table (the committed file predated a build-script change; the
  determinism test compares two fresh builds, never the committed file,
  so the drift was invisible to it).
- Test: `tests/spec-md-body-eval.test.ts` renders one reference with
  neither optional field and one with both — no marker, no findings,
  optional parts omitted rather than emptied.


#### `fdpm-mcp` — connected clients never heard about workbooks created after connect (SPEC-MCP-SERVER §10.1, §15.4)

`resources/list` and `prompts/list` are computed from the live `Host` on
every request, but the server declared neither `resources.listChanged`
nor `prompts.listChanged` and sent no notification after a SIGHUP
reload. MCP clients cache both lists, so a workbook built while a client
was connected stayed invisible in its resource list — readable by URI,
missing from the listing. Observed against the live server after
building the `spec-document-plan` workbook: `fdpm.workbook.list` and
`fdpm.workbook.get` saw it; the client's `resources/list` showed 20 of
21 workbooks.

- Capabilities now declare `resources: { listChanged: true }` and
  `prompts: { listChanged: true }`. `tools.listChanged` stays
  undeclared: the advertised tool array is frozen at boot (it is the
  array the §8.5 byte budget was measured against), so a reload cannot
  change it.
- The SIGHUP handler moved out of the binary into
  [`src/mcp/reload.ts`](src/mcp/reload.ts) (`handleReload`), which after
  a successful `Host.reload()` clears the freshness map, writes the
  `reload` audit entry, then sends
  `notifications/resources/list_changed` and
  `notifications/prompts/list_changed`.
- A rejected reload (`host_compat` / `internal`) notifies nothing and
  leaves the freshness map intact — the pre-reload Host is still what
  the server serves, so the client's cached lists are still correct.
  A notification that cannot be delivered (transport closed mid-reload)
  is reported on stderr and never fails the reload or the process.
- SPEC-MCP-SERVER 0.1.8 adds §10.1 and §15.4 and corrects §15.3, which
  claimed SIGHUP drained and exited; §20 now lists the invariants it
  always declared it would, including
  `spec:inv:reload-notifies-list-changed`.
- Tests: [`tests/mcp/reload-notify.test.ts`](tests/mcp/reload-notify.test.ts)
  — a workbook created out-of-band becomes enumerable and both
  notifications fire; both failure paths notify nothing; a throwing
  notifier does not fail the reload; and the wire-level `initialize`
  response declares the two `listChanged` capabilities and not a third.

### Added

#### `fdpm-mcp` — plugin-shipped prompts as skills; `planning/triage_iteration` (SPEC-MCP-SERVER §13.5)

PURPOSE.md's third layer: prompts carry the domain "how to think" that
tool descriptions cannot. Shipped as skills, not templates.

- Plugin API: `ctx.registerPrompt(reg)` → runtime prompt registry
  (validated at install, `promptId` unique across plugins, listed
  sorted, torn down on deactivate). `PromptRegistration` =
  `{ promptId: "<plugin>/<slug>", title, description, arguments, render }`.
- Skill contract ([`src/mcp/prompts.ts`](src/mcp/prompts.ts)): the
  description must say *when* to use the prompt (40..300 chars); the
  listing entry is ≤ 600 B (progressive disclosure — `prompts/list` is
  metadata only); the rendered body must contain "When to use", "Call
  order" and "Failure modes" and stay ≤ 16 KB; arguments are resolved
  and type-checked; the plugin's render output is validated before it
  reaches a client (PALS's LAW).
- `fdpm-mcp` declares the `prompts` capability and serves
  `prompts/list` and `prompts/get`.
- `planning/triage_iteration`: when to use, a nine-step call order over
  real tools and resources, failure modes by real `plan:val:*` ids —
  tests cross-check both against the manifest and the plugin sources.
- CLI `fdpm plugin prompts` / `fdpm plugin prompt <id> --arg k=v`;
  SDK / package root `listPrompts(host)`, `renderPrompt(host, { id, args })`.
- Tests (+45): contract, registry, prompt content, CLI E2E, SDK, stdio
  E2E (capability declared, empty with plugins off, list/get with
  plugins on).

#### `fdpm-mcp` — audit report: error classes from `mcp-audit.jsonl` (SPEC-MCP-SERVER §9.5)

The audit log recorded every call's outcome but nothing read it, so
nothing said which tool, reason or rule fails most. This closes the
flywheel — instrument where tools fail, set a success SLO, turn the
error classes into eval cases — the way Honeycomb ran its MCP server.

- Tier-2 rejections now record the distinct `rule_ids` they fired on
  the audit `complete` entry: the error class a §7 rejection belongs to.
- [`src/persistence/mcp-audit-report.ts`](src/persistence/mcp-audit-report.ts)
  — typed parse of the JSONL (malformed lines are counted in
  `source.skipped`, never coerced), per-tool outcomes (`ok` / `failed` /
  `rejected` / `replayed` / `dry_run`), error classes (`<tool>
  category/reason` for protocol errors, `<tool> rule:<id>` for
  rejections) with count and share, success-rate SLO with the shortfall
  in calls, nearest-rank p50/p95 latency, absolute (`since`/`until`) or
  relative (`1h` | `24h` | `7d` | `all`) windows.
- Three surfaces, one implementation: resource
  `fdpm://audit/report[/{window}]` (reads go through resources — no
  catalog bytes), `fdpm mcp audit-report [--window|--since|--until|--top|--slo|--json]`,
  SDK / package-root `auditReport(host, opts)`.
- `Host.dataDir` read-only getter (classified not-exposed).
- Tests (+30): aggregator, resource (incl. a live rejection becoming a
  `rule:` class), CLI E2E on the real binary, SDK, audit-log `rule_ids`,
  stdio E2E reading the report over the wire.

#### `fdpm-mcp` — Tier-3 hardening: `dry_run` previews, mandatory idempotency keys, pre-execution audit (SPEC-MCP-SERVER §8.7)

A delete is not retry-safe unless the server can recognise a duplicate,
and an agent cannot show an operator what a delete will do without
running it. Both now hold on every Tier-3 tool.

- [`src/core/operations/delete-preview.ts`](src/core/operations/delete-preview.ts)
  — would-affect previews as pure reads: a primitive's type and every
  relation that references it; a relation's endpoints; a workbook's
  counts; batch variants with the first-missing-id `not_found` contract.
  One implementation behind three surfaces: MCP `dry_run`, CLI
  `--dry-run`, SDK `previewPrimitiveDelete` / `previewRelationDelete` /
  `previewWorkbookDelete` (also at the package root).
- Every Tier-3 tool accepts `dry_run` and `idempotency_key`.
  `dry_run: true` (strict boolean) returns
  `{ ok, dry_run, would_affect, post_state_summary }` with no
  `operation`, passes the destructive and confirmation gates (it has no
  side effect), and needs no key — PURPOSE.md's approval preview.
- A real destructive call without `idempotency_key` is refused
  (`validation` / `idempotency_key_required`). The session keeps
  `(tool, key) → result` for 5 minutes (cap 1,000): same key + same
  args replays the recorded outcome (handler errors included; audit
  `replayed: true`); same key + different args is refused (`conflict`
  / `idempotency_key_reused`); concurrent same-key calls coalesce onto
  one execution; gate refusals are never cached.
- Audit: the `start` entry is the intent record, written before the
  handler runs; for Tier-3 it carries `tier`, `idempotency_key`,
  `dry_run`; `complete` entries carry `replayed` / `dry_run`.
- CLI: `fdpm workbook|primitive|relation delete --dry-run`.
- Tests (+45): core previews, `tier3-dry-run`, `tier3-idempotency`
  (replay, conflict, per-tool scope, coalescing, TTL, cap, audit),
  pre-execution audit, stdio E2E dry-run through the disabled gate, SDK
  previews, CLI dry-run.

#### `fdpm-mcp` — server instructions and `fdpm://guide` (SPEC-MCP-SERVER §8.6)

The cold-start orientation layer. PURPOSE.md's eval asks whether a cold
agent, given only the server, can drive a workbook on first contact;
until plugin-shipped MCP prompts land (v0.2), `initialize.instructions`
is the server's answer.

- [`src/mcp/instructions.ts`](src/mcp/instructions.ts) — `SERVER_INSTRUCTIONS`,
  a static (per-manifest, no runtime state) text sent once per session:
  the cold-start workflow (list → `type_info` → write → read via
  resources), the response contract (`isError` vs `ok:false`,
  `validation_report.findings[]`, the recovery loop), the protocol-error
  categories and `evidence.reason`s (`destructive_disabled`,
  `stale_state`, `rate_limited`, `confirmation_required`), and the
  common `rule_id`s. `INSTRUCTIONS_BUDGET_BYTES` (4,000) caps it;
  `checkInstructionsBudget()` is enforced in CI and at boot (exit 2).
- New resource `fdpm://guide` (`text/markdown`,
  [`src/mcp/resources/guide.ts`](src/mcp/resources/guide.ts)) serves the
  same bytes for clients that ignore `initialize.instructions`.
- `fdpm.health` returns `instructions_bytes` (additive).
- CI: [`tests/mcp/instructions.test.ts`](tests/mcp/instructions.test.ts)
  (content contract, budget, every registry URI template named, no
  unknown tool named), [`tests/mcp/resources-guide.test.ts`](tests/mcp/resources-guide.test.ts),
  dedup contract in `tool-descriptions.test.ts`, and the stdio E2E checks
  `client.getInstructions()` and `fdpm://guide` are byte-identical.

#### `fdpm-mcp` — tool-catalog byte budget and schema-by-resource (SPEC-MCP-SERVER §8.5)

The `tools/list` catalog is now a measured, capped quantity. Every MCP
session pays for the whole registry (name + description + JSON Schema
per tool) before the agent does any work; on manifest 0.1.0 that was
33,929 bytes for 30 tools, 8,809 of them the `DomainProfile` schema
inlined into `fdpm.profile.register` (26 % of the catalog).

- [`src/mcp/catalog.ts`](src/mcp/catalog.ts) — `buildToolsListEntries`,
  `advertisedCatalog`, `measureCatalog`, `checkCatalogBudget`,
  `buildCatalogReport`, `resolveCatalogBudget`. `DEFAULT_CATALOG_BUDGET`
  is 28,000 bytes total / 2,000 bytes per tool — a ratchet on the
  measured size plus ~10 % headroom; raising it is a reviewed change
  that needs a CHANGELOG line.
- `fdpm-mcp` builds the advertised catalog once at boot (Core manifest
  followed by `discoverPluginTools` output, so plugin verbs are measured
  against the same budget and can never bulk-advertise past it),
  measures it, and **refuses to start with exit 2** when over budget,
  printing each violation. `tools/list` carries `_meta.catalog_bytes`
  and `_meta.catalog_budget_bytes`; the ready banner prints both.
- `FDPM_MCP_CATALOG_BUDGET_BYTES` (default `28000`) raises the total for
  a deployment that knowingly accepts the token cost. The per-tool
  limit is not tunable: an oversized tool is a defect in the tool.
- `fdpm.health` returns `catalog: { tool_count, total_bytes,
  budget_total_bytes, budget_per_tool_bytes, within_budget }`.
- New resource provider `fdpm://schema/{schema_id}`
  ([`src/mcp/resources/schema.ts`](src/mcp/resources/schema.ts)); first
  member `fdpm://schema/profile` serves the DomainProfile JSON Schema
  (`application/schema+json`), derived at read time from the same Zod
  schema the server validates with — resource and validator cannot drift.
- CI: [`tests/mcp/catalog-budget.test.ts`](tests/mcp/catalog-budget.test.ts)
  fails the build when the Core catalog exceeds the budget in either
  destructive mode or any tool exceeds the per-tool cap;
  [`tests/mcp/fdpm-mcp-stdio.test.ts`](tests/mcp/fdpm-mcp-stdio.test.ts)
  spawns the real binary over stdio and checks the boot gate, `_meta`,
  `fdpm.health.catalog`, the schema resource, and a wire-level Tier-2
  rejection. 48 new tests.

#### `@fdpm/zod-bridge@0.2.0` — Hybrid lift detection (Entity vs ValueObject)

Closes the architectural gap surfaced by the v0.1.0 trial: identity
must be declared, not inferred from shape. The new classifier
([`src/classifier.ts`](packages/zod-bridge/src/classifier.ts))
implements a three-pass detection borrowed from
[`usl-ng-core`](https://github.com/pedroanisio/usl-ng-core)'s
Zod ingester (Lean-verified upstream):

  1. **Convention.** `{Name}` + `{Name}Id` companion → Entity.
  2. **Explicit list.** `BridgeOptions.entities: string[]` promotes
     additional schemas to Entity.
  3. **Default.** Everything else is ValueObject.

The bridge now emits one `PrimitiveTypeDef` per schema-map key
(previously collapsed into one). Audit log surfaces candidate
promotions but never auto-applies them.

Trial re-run against `pitch-deck.schema.v2.ts`: **9 primitives**
(was 1), **85 fields** (was 17), **115 constraints** (was 13).
Workbook `howto-zod-to-fdpm-plugin@180` documents the convention
and records Option A (USL-NG Core upstream) as the v1.x direction.

72/72 tests passing.

### Changed

#### Server instructions budget ratcheted 4,000 → 4,500 B; PROMPTS block

- `INSTRUCTIONS_BUDGET_BYTES` 4,000 → 4,500 after the audit (§9.5) and
  prompts (§13.5) lines; measured 4,219 B. The ratchet is a reviewed
  change, recorded here.
- No manifest bump (a capability was added; no tool changed — 0.4.0).

#### Audit log gains `rule_ids`; server instructions name the audit resource

- `McpAuditCompleteEntry.rule_ids?: string[]` on Tier-2 rejections
  (additive; older readers ignore it). Instructions 3,964 B / 4,000.
- No manifest bump: a resource was added, no tool changed (0.4.0).

#### `fdpm-mcp` — MCP tool manifest `0.3.0` → `0.4.0`; Tier-3 calls require `idempotency_key`

- Tier-3 input schemas gained optional `dry_run` and `idempotency_key`
  (minor). A real (non-dry-run) Tier-3 call without a key is now
  refused — a behavioural tightening on the destructive surface only.
- Server instructions grew to 3,887 B (budget 4,000); catalog 25,312 B
  destructive off / 24,322 B on (budget 26,000).
- Roadmap task `p2-audit-gates` asked for a 100 ms same-workbook
  debounce; it is deliberately **not** implemented — with keys
  mandatory it would only refuse legitimate distinct deletes and make
  tests timing-dependent (ADR `decision:0008`).

**Migration.** Agents and scripts issuing Tier-3 calls must add
`idempotency_key` (any unique string; reuse it to retry). Preview first
with `dry_run: true`. Nothing changes for Tier-1/2 tools, the CLI
(`--dry-run` is additive), or the SDK (new exports only).

#### `fdpm-mcp` — MCP tool manifest `0.2.0` → `0.3.0`; descriptions deduplicated; catalog budget ratcheted

- The generic prose that thirteen Tier-2 descriptions repeated ("on
  rejection the response is `isError: false`, `ok: false` … read those,
  fix the input, retry"; "Returns the standard Tier-2 envelope") and the
  gating sentence five Tier-3 descriptions repeated now live once in
  `initialize.instructions`. Descriptions keep only tool-specific facts
  (what `type_info` must be consulted for, what rejects, batch
  preference, immutability rules). Catalog: 25,699 B → **23,567 B**
  (destructive off), 24,709 → 22,577 B (on).
- `DEFAULT_CATALOG_BUDGET.total_bytes` ratcheted **28,000 → 26,000**
  (~10 % headroom over the new measurement). `FDPM_MCP_CATALOG_BUDGET_BYTES`
  default in the docs follows.
- Manifest `0.3.0`: additive `fdpm.health.instructions_bytes`, new
  resource family, no tool/argument changes.

**Migration.** No client change is required. Clients that cached tool
descriptions keyed by manifest version see new text under `0.3.0`.
Operators who pinned `FDPM_MCP_CATALOG_BUDGET_BYTES=28000` explicitly may
keep it; the new default is lower, not higher.

#### `fdpm-mcp` — MCP tool manifest `0.1.0` → `0.2.0`

- `fdpm.profile.register` advertises an **opaque** `profile` object
  (`{ type: "object" }`; 8,809 → ~300 bytes of schema). The shape is
  served by `fdpm://schema/profile` and enforced server-side with the
  same Zod schema. A malformed profile is now a Tier-2 **rejection** —
  `isError: false`, `ok: false`, one `validation_report.findings[]` entry
  per Zod issue with `rule_id: "core:profile-schema"` and `field_path` —
  instead of a protocol-level `validation` error. Nothing is registered
  on rejection. The `extends` contract the description always claimed
  (parents registered first, else `not_found`) is now enforced; before,
  a dangling parent surfaced only at `fdpm.workbook.create`.
- `fdpm.health` output gained the `catalog` object (additive).
- `Host.registerPluginProfile` classified as not-exposed in
  [`src/mcp/not-exposed.ts`](src/mcp/not-exposed.ts) (plugin-activation
  path; never LLM-facing).

**Migration.** Clients that send a valid profile see no change. Clients
that branched on `isError: true` + `category: "validation"` for a
malformed profile must branch on `structuredContent.ok === false` and
read `validation_report.findings[]` — the same loop as every other Tier-2
tool. Operators whose catalog must exceed 28,000 bytes (many plugin
tools) set `FDPM_MCP_CATALOG_BUDGET_BYTES` explicitly; otherwise the
server refuses to start and prints the violations. Measured catalog after
this change: 25,699 B (destructive off) / 24,709 B (on).

### Fixed

#### `@fdpm/zod-bridge@0.1.1` — six trial-surfaced correctness fixes

A trial run of `@fdpm/zod-bridge@0.1.0` against a real production
schema (`static/schemas/pitch-deck.schema.v2.ts`) surfaced six bugs.
All fixed with paired regression tests; full narrative at
[`docs/journals/zod-bridge-pitch-deck-trial.md`](../docs/journals/zod-bridge-pitch-deck-trial.md);
documentation workbook at MCP `trial-zod-bridge-pitch-deck` (rev 32).

  - Decoupled lazy-recursion bound from object nesting depth.
  - Fixed quadratic struct-name compounding in nested objects.
  - Accepted `.transform()`/`.pipe()` per `flag:zod-pipe-transform`.
  - Field-level `z.union` and `z.discriminatedUnion` now fall back to
    payload-blob (`format: 'json-union'`) instead of throwing.
  - Added a `z.record` branch (`format: 'json-record'`).
  - Disambiguated array-element struct ids by parent field name.

61/61 tests passing (was 49/49).

### Added

#### `@fdpm/zod-bridge@0.1.0` — Zod v4 → FDPM plugin reference package

New workspace-sibling package at [`packages/zod-bridge/`](packages/zod-bridge/).
Deterministic, one-way translation from Zod v4 schemas into FDPM
`PrimitiveTypeDef`s, CEL constraints, validators, and approval-page
descriptors. Companion to the workbook `howto-zod-to-fdpm-plugin`
(rev 179) which is the normative spec.

  - **Public API** (`src/index.ts`): `assembleDomainProfile`,
    `zodSchemaToPrimitiveType`, `zodSchemaToValidator`,
    `zodSchemaToCelConstraints`, `buildViewPageDescriptor`,
    `buildProductPageBundle`, `stableStringify`, `BridgeError`.
  - **23-rule CEL translation table** (`src/cel.ts`) capped at the
    verified host CEL surface (`@marcbachmann/cel-js@^7` operators
    + helper-set v1.2.0 from `src/core/expr/std.ts` +
    `graph.*` helpers). Rule 8 (`z.iso.datetime()`) emits
    `timestamp(self.<f>).getFullYear() > 0` because cel-js v7 rejects
    `Timestamp != null` at type-check; the workbook's table uses
    `!= null` and will be patched in a follow-up rev.
  - **Validator equivalence** (`src/validator.ts`): the derived
    `ValidatorFn`'s findings are 1:1 with `schema.safeParse` issues
    modulo namespaced rule_id rewriting
    (`<plugin-id>:zod.<type>.<code>[.<path>]`). Rule_id closed set is
    enumerated at build time and goes verbatim into
    `manifest.capabilities[].metadata.rule_ids`.
  - **Determinism** (`src/stable-stringify.ts`): same input → byte-equal
    output across runs and processes. The CI snapshot gate
    (`generated/profile.json` matches a fresh bridge run) is the
    intended consumer; mismatches block the commit.
  - **Auto-emitted approval pages**: `buildViewPageDescriptor` emits
    one panel per primitive type with fields in schema-declared order,
    `buildProductPageBundle` emits the structured fact bundle that
    drives the README's Product Page. Eliminates schema-vs-page drift
    by construction.
  - **Feature-flag snapshot** (`DEFAULT_FEATURE_FLAG_STATES`): captures
    the 13 `fs:Limitation`/`fs:DesignDecision` pairs from the workbook
    at rev 179. One `enabled`, seven `behind-flag`, five `disabled`.
    Each flag carries an explicit transition contract; advancing a
    flag requires a paired bridge release and a workbook revision.
  - **Tests** (`tests/`, 49 passing): mapping-table coverage,
    cel-translation soundness (evaluated against the host CEL
    runtime), validator equivalence, importer/exporter round-trip,
    output determinism. Tested against `zod@4.4.3` +
    `@marcbachmann/cel-js@7.6.1`.

Deferred to `v0.2.0`: optional-cap factories
(`zodSchemaToMarkdownRenderer`, `zodSchemaToImporter`,
`zodSchemaToExporter`, `zodSchemaToExprHelper`). The workbook §7 shows
how to hand-author them; bridge core is sufficient to ship a useful
plugin today.

#### SPEC-WORKSPACE v0.1 — Workspace as first-class primitive

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

The FDPM data directory is now a typed, identified, registered
container. Phase 1 of the R2 remote-server roadmap: the interface
boundary that a future `RemoteWorkspace` will plug into without
breaking local consumers. Backup/restore, the operator subcommand
suite, and MCP-bin precedence are all in this slice.

  - **`Workspace` interface** (`src/core/workspace/types.ts`): `id`,
    `name`, `path | null`, `getStore()`, `getProfileRegistry()`,
    `getPluginRuntime()`, `appendOp()`, `getOperationLog()`,
    `statProjectLog()`, `listProjects()`, `backup()`. Strict zod
    schemas for `WorkspaceIdentity` and `WorkspaceRegistry` (unknown
    fields rejected at parse time — typos surface as `verification`
    errors with a clear `evidence.field_path`).

  - **`LocalWorkspace`** (`src/core/workspace/local.ts`):
    `LocalWorkspace.open()` reads or auto-mints `workspace.json` on
    first touch, upserts the registry entry, exposes the Workspace
    interface backed by the existing `JsonlLogStore`. Auto-mint emits a
    one-process-one-warning host warning per dataDir (Principle 4 —
    plugin failures never crash the host). `LocalWorkspace#rename()`
    mutates `workspace.json`'s `name`, clears `_minted`, and updates
    the registry.

  - **Operator-local registry** (`src/core/workspace/registry.ts`):
    XDG-located catalog at
    `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`.
    Atomic temp+rename writes; tolerant reads (missing file → empty
    registry); upsert-by-id, lookup-by-id/name, unique-name suffixing
    on collision.

  - **§8.3 precedence resolution** (`src/core/workspace/resolve.ts`):
    `--data-dir > FDPM_DATA_DIR > FDPM_WORKSPACE > registry.current >
    defaultDataDir()`. `FDPM_WORKSPACE` and `registry.current`
    misses surface as `not_found`; an absent default returns
    `{dataDir: null, source: "default"}` so callers can fall through
    to the legacy path.

  - **Backup** (`src/core/workspace/backup.ts`): streaming `.fdpmbak`
    writer (zip via `archiver`). Manifest at offset 0 — operators can
    `unzip -p bundle backup-manifest.json | jq .` without scanning the
    archive. Per-file sha256, manifest carries workspace identity,
    host version, spec_core version. §13 compression policy:
    text/json/jsonl/yaml/svg deflated; pre-compressed types
    (pdf/png/jpeg/etc.) stored. `LocalWorkspace#backup()` updates the
    registry's `last_backup` on success.

  - **Restore** (`src/core/workspace/restore.ts`): five-step pipeline:
    (1) read manifest via random-access central directory;
    (2) identity-collision check against the registry;
    (3) verify all sha256s — STREAMING; no bytes touch the target
        until every entry passes;
    (4) write to `${target}.tmp/` then atomic rename to `${target}`
        (cross-fs detected via EXDEV and refused with `verification` +
        `evidence.reason: "cross_fs_rename"`);
    (5) `Host.load()` round-trip — proves the bundle is replayable
        against this host; opt-out via `--skip-verify`.
    `--force-overwrite` replaces an existing `workspace_id`;
    `--name <new>` mints a fresh ULID for side-by-side restores.
    Uses `yauzl` for random-access reads.

  - **`fdpm workspace` subcommand suite** (`src/commands/workspace.ts`):
    `init / list / info / switch / rename / forget / backup / restore /
    verify`. Wired through `buildProgram` and `ALL_COMMAND_METADATA`.
    All subcommands carry SPEC-REPL §10.2 metadata as
    `NO_PROJECT_ARGV` / `NO_PROJECT_JSON` because workspace ops never
    touch workbook logs (the freshness gate has nothing to stat).
    `verify` does an out-of-band `Host.load()` round-trip and reports
    workbook count + elapsed_ms.

  - **Host integration** (`src/core/host.ts`): `host.workspace:
    Workspace | null` populated after `load()` / `reload()` /
    `reloadPlugins()`. `host.persistence` continues to point at the
    underlying `JsonlLogStore` so existing tier-bypass callers
    (`host-extra.ts`, `mcp-audit-log.ts`) work unchanged
    (Principle 7: plugin call sites unchanged).

  - **bin precedence** — `src/bin/fdpm.ts` and `src/bin/fdpm-mcp.ts`
    both resolve through `resolveWorkspaceDataDir`, so MCP servers
    honour `FDPM_WORKSPACE` and `registry.current` the same way the
    one-shot CLI does.

  - **New env vars**: `FDPM_WORKSPACE` (workspace id or name to
    resolve via the registry; ignored when `FDPM_DATA_DIR` is set),
    `FDPM_REGISTRY_PATH` (override for the registry file path).
    Documented in README, MANUAL, `.env.example`, and the env-contract
    test gate.

  - **New deps**: `archiver ^7.0.1` (MIT, ~3 MB transitive, no native
    build), `yauzl ^3.3.0` (MIT, random-access zip reader).

  - **Tests** (48 new across 3 suites):
    - `tests/workspace.test.ts` (24): identity round-trip, registry
      CRUD, atomic write, malformed-JSON refusal, unique-name
      suffixing, lookup by id/name, auto-mint stable id across loads,
      registry upsert, basename-derived name with `-2` suffix on
      collision, schema strictness, plugin-call invariance
      (`host.workspace.getStore() === host.store` etc.), reload
      preserves workspace identity, all five §8.3 precedence rules
      plus not_found failure modes.
    - `tests/workspace-backup-restore.test.ts` (15): bundle layout
      with manifest at offset 0, sha256 per file, identity collision
      policy under no flags / `--name` / `--force-overwrite`,
      `sha256_mismatch` refusal with target untouched, `--skip-verify`,
      missing-manifest refusal, registry `last_backup` update, rename
      clears `_minted` + rejects empty names.
    - `tests/workspace-subcommands.test.ts` (9): full subcommand
      smoke through `npx tsx src/bin/fdpm.ts` so emit()'s fd-1 sync
      write path is exercised end-to-end.

  - **SPEC** — `docs/specs/SPEC-WORKSPACE.md` (96 KB; 212 primitives,
    120 relations; `validate` clean: 0 errors / 0 warnings). Source
    in `fdpm-cli/scripts/build-spec-workspace.ts`; path constants in
    `fdpm-cli/scripts/_spec-paths.ts`.

#### SPEC-MCP-SERVER v0.1 — slice B-final + Phase C (freshness gate, Tier-2 surface, audit completion)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

Slice B-final wires the per-call freshness gate (SPEC-MCP-SERVER §10
/ §21) and adds the remaining Tier-1 read-only tools. Phase C adds the
Tier-2 validating-write surface with a `validation_report` envelope on
every response. The two ship together because the freshness map
(B-final) is required to make Tier-2 stale-state refusal work, and
the validation-report envelope (Phase C) is required to keep §7
rejections from leaking out as MCP-protocol errors.

  - **Per-session freshness map** (`src/mcp/session.ts`):
    `recordSeen` / `checkFreshness` / `markFresh` /
    `clearFreshnessMap`. Tracks `(mtime_ns, size)` for every workbook
    log this session has touched. Strict bigint-tuple equality on the
    pair; "not seen yet" → not stale (recorded fresh on first
    encounter). The map is purely in-memory; SIGHUP-triggered
    `Host.reload()` clears it.

  - **Per-call freshness gate** (`src/mcp/dispatch.ts`): resolves a
    `projectIdsFromJson` extractor (`src/mcp/tool-metadata-map.ts`)
    against each tool's raw args, expands `["*"]` wildcards via
    `host.listProjects()` (with a stderr warning), and either
    tail-replays silently (Tier-1 lenient) or refuses with
    `permission` + `evidence.reason: "stale_state"` (Tier-2/3 strict)
    when `(mtime_ns, size)` differs from the recorded tuple.
    `host_compat` from `Host.reloadProjectTail` propagates as an MCP
    error envelope. Successful Tier-2/3 writes re-seed the freshness
    map so the same session can issue consecutive writes against the
    same workbook.

  - **Six new Tier-1 read-only tools**: `fdpm.primitive.search`,
    `fdpm.primitive.get`, `fdpm.relation.list`, `fdpm.relation.get`,
    `fdpm.log.tail`, `fdpm.log.diff`. All wrap existing
    `Host.searchPrimitives` / `Host.searchRelations` / `Host.getLog`
    / `Host.getProject` reads — no new Host methods required.

  - **Eleven Tier-2 validating-write tools**: `fdpm.profile.register`,
    `fdpm.workbook.create`, `fdpm.primitive.create`,
    `fdpm.primitive.replace`, `fdpm.primitive.patch`,
    `fdpm.primitive.field_patch`, `fdpm.relation.create`,
    `fdpm.relation.replace`, `fdpm.relation.patch`,
    `fdpm.structure.reorder`, `fdpm.structure.reparent`. Each returns
    the SPEC §8.2 envelope `{ ok, operation, validation_report,
    post_state_summary }`. The dispatcher branches on
    `validation_report.accepted`:
      - `true`  → `isError: false`, `ok: true`.
      - `false` → `isError: false`, `ok: false` (per SPEC §12: the
        protocol call succeeded; the operation was rejected by Core
        validation).
      - genuine `FDPMException` (not_found, conflict, etc.) →
        `isError: true` with the typed envelope.

  - **`Host.*` validation throws are caught** by the dispatcher and
    mapped to the rejected-envelope shape so a §7 rejection always
    surfaces with `validation_report.findings` populated, never as a
    bare `validation`-category error envelope.

  - **SIGHUP handler** (`src/bin/fdpm-mcp.ts`): replaces the prior
    log-and-continue stub. Calls `host.reload()`, clears the session
    freshness map, and audits the reload as a `phase: "reload"` entry
    (`outcome: "ok" | "host_compat" | "internal"`). Reload failure
    leaves the previous Host intact per `Host.reload()`'s contract;
    the server keeps serving against the pre-reload state.

  - **Audit log enrichment** (`src/persistence/mcp-audit-log.ts`):
    new `McpAuditReloadEntry` for SIGHUP events;
    `validation_status` populated as `"pass" | "fail"` for Tier-2
    completes (was previously always `"n/a"` because Tier-2 hadn't
    landed). Tier-1 stays `"n/a"`.

  - **Tool ↔ command-metadata mapping** (`src/mcp/tool-metadata-map.ts`):
    explicit table that maps every MCP tool name to either an
    `ALL_COMMAND_METADATA` key, `null` (no workbook state), or an
    inline `ProjectIdsFromJson` extractor (used for the `log.*`
    tools whose closest CLI peer key isn't a 1:1 name match).
    Boot-time assertion in `manifest.ts` fails server start if any
    advertised tool lacks a mapping row.

  - **Tests**: 15 new tests across `tests/mcp/`:
      - `tier1-freshness.test.ts` — silent tail-replay,
        `host_compat` propagation, `["*"]` wildcard scan + stderr
        warning.
      - `tier2-validation-report.test.ts` — happy paths populate
        `validation_report`; §7 rejections surface with
        `isError: false`/`ok: false`.
      - `tier2-stale-state.test.ts` — strict-mode refusal on OOB
        write; success after `host.reload()` analogue.
      - `audit-log.test.ts` — 200 rapid calls produce 400 paired
        start/complete entries with correct `validation_status`.
      - `conformance-23-4.test.ts` — verbatim SPEC §23.4
        end-to-end.

#### SPEC-MCP-SERVER v0.1 — slice D (Tier 3 destructive surface, fuzz harness, plugin-tool stub)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

Phase D ships the destructive tool surface, the schema-fuzz CI gate,
and the plugin-tool exposure stub. SPEC-MCP-SERVER acceptance items
§22.3, §22.5, §22.7 (partial), and conformance items §23.1, §23.5
are now testable end-to-end in `tests/mcp/`.

  - **Tier 3 tools** (off by default; opt in via `--enable-destructive`
    / `FDPM_MCP_ENABLE_DESTRUCTIVE=1`):
    - `fdpm.workbook.delete` — wraps `Host.deleteProject`.
    - `fdpm.primitive.delete` — wraps `Host.deletePrimitive`.
    - `fdpm.relation.delete` — wraps `Host.deleteRelation`.

    All three carry `annotations.destructiveHint: true` and return a
    thin envelope `{ ok: true, operation, post_state_summary }`
    (no `validation_report` — the underlying Host methods return
    `AppendOutput`, not the validation envelope).

  - **Tier 3 manifest filtering**: `advertisedTools(...)` excludes
    Tier 3 tools when `enableDestructive` is false. The dispatcher's
    tier gate is the authoritative refusal point — defense-in-depth
    against a client that somehow learns the names regardless.
    `manifest.ts` `EXPOSED_HOST_METHODS` now lists `deleteProject`,
    `deletePrimitive`, `deleteRelation`; their entries in
    `not-exposed.ts` were removed (SPEC §22.3 / §23.1).

  - **Confirmation-token mode** (SPEC §9.3, opt-in): new optional
    fields `requireConfirmationToken` and `confirmationToken` on
    `DispatchCtx`. When true, Tier 2/3 calls without a matching
    `_confirmation_token` argument refuse with `permission` +
    `evidence.reason: "confirmation_required"`. The dispatcher
    strips the token from the args before strict-schema validation.
    The bin entry will wire `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN`
    in a follow-up; the gate itself ships now.

  - **Schema-fuzz CI gate** (SPEC §22.5 / §26): hand-rolled JSON
    Schema sampler under `tests/mcp/_fuzz/sampler.ts` plus a
    fuzz suite at `tests/mcp/schema-fuzz.test.ts`. Generates 10⁴
    inputs per tool per run, filters them through Ajv against the
    advertised JSON Schema, and asserts that every JSON-Schema-valid
    sample is also accepted by the runtime Zod validator. Catches
    drift between the advertised schema and the runtime contract.
    Runs in <2 s for the 25 currently-shipping tools.
    Adds `ajv@^8.17.1` to devDependencies.

  - **Plugin-tool exposure stub** (SPEC §13 / §22.7): new module
    `src/mcp/plugin-tools.ts` with a `discoverPluginTools()`
    function that returns `[]` unconditionally and emits a
    structured warning via `emitHostWarning(...)` when the operator
    opts in. The amendment to SPEC-PLUGGABLE-ARCHITECTURE adding the
    `mcp_tool` capability kind is deferred to v0.1.1; until it lands
    no plugin tools leak into the manifest. Conformance test at
    `tests/mcp/plugin-tools-stub.test.ts` guards the security posture.

  - **HTTP transport refusal conformance** (SPEC §23.5): new test
    `tests/mcp/conformance-23-5.test.ts` spawns the built
    `dist/src/bin/fdpm-mcp.js` with `--http-port`, `--http-host`,
    and `--sse` and asserts each exits non-zero with a stderr
    pointer to §6.1 / v0.2.

  - **Defense-in-depth in `resolveProjectIds`**: the freshness-step
    helper now treats a tool name absent from `TOOL_TO_COMMAND_METADATA`
    as "no workbook state" instead of throwing. The boot-time check in
    `manifest.ts` still rejects manifest drift; the runtime fallback
    only matters for synthetic test tools injected via the
    `resolveTool` seam.

#### SPEC-MCP-SERVER v0.1 — slice B-prelim (Tier 1 read-only surface)

> ARCHITECTURAL REQUIREMENT (PALS's LAW): LLMs will always produce some
> form of error. Absence of output verification is a design defect, not
> a runtime bug. All LLM output must be treated as untrusted and
> validated explicitly.

New `fdpm-mcp` binary implementing the SPEC-MCP-SERVER v0.1 stdio
transport with five Tier 1 read-only tools:

  - `fdpm.health` — server liveness + manifest version + counts.
  - `fdpm.profile.list` — registered DomainProfiles.
  - `fdpm.profile.get` — fetch a profile by id.
  - `fdpm.workbook.list` — loaded workbooks.
  - `fdpm.workbook.get` — workbook row + primitive/relation counts.

Architecture follows SPEC-MCP-SERVER §4 (Architectural Principles), §8
(Tool Surface tiers), §11 (Zod source of truth, JSON Schema derived),
§12 (Error Model — reuses FDPMException taxonomy), §15 (Lifecycle).

  - **Dependency**: `@modelcontextprotocol/sdk@^1.29.0` (pinned minor)
    plus `zod-to-json-schema@^3.25.2` for advertisement-time schema
    derivation.
  - **Binary**: `bin.fdpm-mcp` registered in `package.json`; `build`
    `chmod +x`s both `fdpm` and `fdpm-mcp`.
  - **HTTP transport refusal**: passing `--http-port`, `--http-host`,
    or `--sse` causes the process to refuse to start with a clear
    pointer to SPEC-MCP-SERVER §6.1 (deferred to v0.2). Conformance §5.
  - **Per-session rate limit**: token-bucket implementation in
    `src/mcp/session.ts` defaulting to 120 calls/minute
    (`--max-calls-per-minute` / `FDPM_MCP_MAX_CALLS_PER_MINUTE`).
    Excess calls return `permission` + `evidence.reason: "rate_limited"`.
  - **Tier gate**: `--enable-destructive` /
    `FDPM_MCP_ENABLE_DESTRUCTIVE=1` is required to expose Tier 3 tools.
    Slice B-prelim ships zero Tier 3 tools, but the gate logic is
    runtime-tested via a synthetic Tier 3 entry in the test fixture
    (see `tests/mcp/dispatch.test.ts`).
  - **Audit log**: append-only JSONL at
    `$FDPM_DATA_DIR/mcp-audit.jsonl` with one `start` and one
    `complete` entry per call. Args are sha256-hashed by default;
    `--audit-full-args` / `FDPM_MCP_AUDIT_FULL_ARGS=1` opts into full
    args for debugging.
  - **CI gates** (both mandatory):
    - `tests/mcp-classification.test.ts` — every public Host method
      is either wrapped by an MCP tool (named in
      `EXPOSED_HOST_METHODS`) or explicitly listed in
      `src/mcp/not-exposed.ts`. Adding a new public Host method
      breaks the build until classified.
    - `tests/mcp-source-imports.test.ts` — tool-handler modules
      under `src/mcp/tools/` MUST NOT import `host.persistence`,
      `host.store`, `node:child_process`, `node:vm`, or call `eval`
      / `new Function(`. SPEC-MCP-SERVER §6.1 compliance.

Known gaps deferred to slice B-final / slice C:

  - **Freshness check** — the dispatcher's freshness step is a no-op
    in slice B-prelim. Tier 1 tools are safe under this relaxation
    (they take an explicit `workbook_id` for a pure read or touch no
    workbook state). Tier 2 / Tier 3 tools cannot land until the
    freshness mechanism is wired (REPL track step 3+5; the
    `Host.reload` and `Host.statProjectLog` primitives exist but the
    dispatcher does not yet consult them). See the `SLICE-B-FINAL`
    marker in `src/mcp/dispatch.ts`.
  - **SIGHUP host.reload** — slice B-prelim logs the SIGHUP and
    continues; `Host.reload()` invocation is wired in slice B-final.
  - **Plugin tools** — `--enable-plugins` is parsed and threaded
    through `DispatchCtx` but no plugin tools ship in this slice.
    Plugin-tool exposure follows SPEC-MCP-SERVER §13 / the plugin
    manifest amendment.

New env vars (`FDPM_NO_PLUGINS`, `FDPM_MCP_ENABLE_DESTRUCTIVE`,
`FDPM_MCP_ENABLE_PLUGINS`, `FDPM_MCP_MAX_CALLS_PER_MINUTE`,
`FDPM_MCP_AUDIT_FULL_ARGS`) are registered in
`src/core/config/env.ts` and reflected in `.env.example`,
`README.md`, and `MANUAL.md` per the env-contract test.

#### SPEC-CORE 1.2 — SPEC-DNIS adoption (§5.6)

The Core SPEC is bumped 1.1.1 → 1.2.0. New §5.6 "Document Node
Identity — SPEC-DNIS adoption" makes SPEC-DNIS a normative extension
of §5 The Instance Model: an FDPM-CLI host claiming SPEC-CORE 1.2
conformance MUST register the built-in `profile:dnis:0.1` plus the
composition profile `profile:spec-authoring-dnis:0.1`, and MUST
expose the host adapter that maps SPEC-DNIS Operations onto SPEC-CORE
op-log entries. The integration is structural, not opaque — the
pre-1.2 "MAY layer on top of SPEC-CORE" wording is superseded.

`SPEC_CORE_VERSION` constant in `src/core/version/spec.ts` is now
`"1.2"` (was `"1.1"`); `HOST_VERSION` is `"1.2.0"`. `exportTransfer`
reports the runtime version instead of the previous hardcoded
`"1.1"`. The `core-versioning-001` regression test asserts the new
version explicitly.

#### DNIS — `profile:dnis:0.1` and the host adapter

New built-in plugin under `plugins/dnis/` registers `dnis:Document`,
`dnis:Node`, `dnis:DerivedFrom`, and `dnis:MigratedFrom` types per
SPEC-DNIS §5.6.1. The runtime adapter at `src/core/dnis/adapter.ts`
routes SPEC-DNIS Operations through `Host.appendBatchWithCausation`
(new method on `Host`) so each Operation materialises as one or more
SPEC-CORE op-log entries sharing a `causation_op_id`. The §8
OperationResult idempotency map is a deterministic projection of the
op log — no parallel persistence surface.

Test surface:
- `tests/dnis-store.test.ts` — TV-1..TV-7 against `InMemoryDnisStore`.
- `tests/dnis-host-adapter.test.ts` — §5.6.6 conformance fixture:
  TV-1, TV-3 (with op-log causation chaining + 5-entry split atomic
  batch), TV-5, TV-7 evidence shape, idempotency replay, document
  round-trip — all against a real `Host` instance.

CLI: `fdpm dnis create-doc | create-node | edit | move | list |
resolve` subcommands wired through the adapter. `split`, `merge`,
`compact` remain SDK-only (their payloads are JSON-shaped and the
CLI surface would be a thin pass-through).

#### Composition profile — `profile:spec-authoring-dnis:0.1`

New built-in plugin under `plugins/spec_authoring_dnis/` declares a
profile that `extends` both `profile:spec-authoring:0.1` and
`profile:dnis:0.1`. Build scripts that opt in get spec-authoring's
typed primitives AND DNIS's `dnis:Document`/`dnis:Node` registered
in the same workbook. The §4.3 profile-resolution merge handles the
extends chain; existing `profile:spec-authoring:0.1` workbooks are
unaffected.

#### SPEC-SECTIONS-TREE v0.2 — sections as DNIS Nodes

The `spec:SpecMarkdownRenderer` gains a DNIS-backed section path:
when a workbook contains a `dnis:Document` and one or more active
`dnis:Node` primitives of `kind: "section"`, the renderer DFS-walks
the dnis:Node graph (parent_node_id, sorted by SPEC-DNIS Position)
and derives §N.M.K headings from the path. The legacy
`spec:Section`/`spec:HasSection` path is preserved verbatim for
unmigrated workbooks; mixed-mode workbooks emit a
`spec:render:mixed-mode-sections` warning and the DNIS path wins.

The `dnis:Node` `content` JSON shape supports four optional fields
beyond `title` and `body_md`:
- `dispatch_kind` — keys into the existing `KIND_RENDERERS` table
  (e.g. `"adr"`, `"references"`, `"open_questions"`).
- `depth_override` — explicit heading depth (default: derived from
  DFS path length).
- `ref_slug` — author-supplied stable handle for fn.section_of.
  Survives title rewrites.
- `eval_body` — opt-in to body_md template evaluation through
  `ctx.renderDsl.renderTemplate`. Default off preserves byte-equal
  output for prose containing literal `${…}` documentation.
- `number_override` — literal §-label that overrides both the
  rendered heading and the section_index value. Use only when DFS
  can't represent the structure (letter appendices, mid-chain
  inserts that must keep stable labels).

#### `fn.section_of` helper (helper-set v1.2.0)

New CEL helper `fn.section_of(node_id)` in the standard inventory.
Resolves a dnis:Node id (NID, slug-form primitive id, author-
supplied `section:<ref-slug>`, or title-derived
`section:<lowercased-hyphenated>`) to its rendered §N.M.K heading
via the render-time `doc.section_index` Tier-A binding. Throws
`unknown-name` on miss — never silently coerces to `''` (PALS-LAW
Principle 4).

Helper-set version 1.1.0 → 1.2.0 (additive minor per §M14 bump
rules). The Tier-A activation gains `doc.section_index:
map<string, string>`, populated by the spec_md renderer's DFS at
render time, empty for validate-time and DNIS-less renders.
SPEC-RENDER-DSL bumped 0.1.5 → 0.1.6; SPEC-EXPRESSION-RUNTIME bumped
0.1.7 → 0.1.8.

#### Codemods — SPEC-CORE and SPEC-DNIS migrated to DNIS-backed sections

Both `scripts/build-spec-core.ts` and `scripts/build-spec-dnis.ts`
now target `profile:spec-authoring-dnis:0.1` and emit their section
trees via `DnisHostAdapter`. SPEC-CORE §5.6 becomes a child of §5
with `number_override: "5.6"`; SPEC-DNIS §A and §B carry
`number_override: "A"` and `"B"`. **Both renders are byte-identical
to the pre-migration baseline** (106299 bytes for SPEC-CORE, 69651
bytes for SPEC-DNIS).

The spec_md renderer's closing-references-section detection was
extended to recognise `dnis:Node` sections of `dispatch_kind:
"references"` so migrated workbooks retain their authored references
section without re-emitting the closing block.

#### `Host.appendBatchWithCausation`

New public method on `Host` for atomic multi-entry SPEC-CORE op-log
batches with shared `causation_op_id`. Pre-mints `op_id`s, sets the
lead entry's id as every entry's `causation_op_id`, runs §7
validation per entry against the in-progress projection (so a later
entry can validate against earlier entries' commits within the same
batch), atomic rollback on any failure. The DNIS adapter is the
intended caller; ordinary plugin/transformer code continues to use
`createPrimitive` / `createRelation` directly.

`AppendInput.op_id` is now caller-pre-mintable for SPEC-CORE 1.2
§5.6.1's "uid == NID" pin; ordinary callers leave it undefined.

#### Tooling — scripts/ type-checking

New `tsconfig.scripts.json` extends the workbook tsconfig and scopes
`scripts/**/*.ts` under `"types": ["node"]` so build scripts type-
check (and the IDE stops reporting `process` as undefined). Surfaced
two real type errors in `scripts/generate-build-from-transfer.ts`
that the workbook tsconfig was hiding (`PrimitiveInstance` /
`RelationInstance` literals were missing `uid`); both fixed by
seeding via `mintUidFromSeed` (matches the SPEC-UID upcaster
pattern).

#### Tests

- `tests/expr-section-of-helper.test.ts` (4 tests) — helper-set
  v1.2.0: NID/slug/ref-slug lookup, unknown-id render-error, empty-
  index validate-time semantics, end-to-end against a real DNIS
  document.
- `tests/spec-md-dnis-sections.test.ts` (6 tests) — DNIS section
  path coverage including title-collision disambiguation
  (`section:open-questions` / `-2` / `-3` in DFS order) and
  `number_override` for letter-appendix + mid-chain-insert cases.
- `tests/spec-md-body-eval.test.ts` (4 tests) — opt-in body_md
  template evaluation: default-off preserves literal `${…}`,
  opt-in resolves `${doc.fields.title}` and
  `${fn.section_of("section:foo")}`, unknown slug surfaces a
  render-error finding.
- `tests/dnis-host-adapter.test.ts` (6 tests) — §5.6.6 conformance
  against a real Host: TV-1, TV-3 with 5-entry causation chain
  + shared request_id, TV-5, TV-7 ordered evidence array, retry
  idempotency, document round-trip.

#### SDK — edit helpers

Standalone, flat-args helpers wrapping the Host's edit / delete
methods using the same operator-friendly aliases (`fields`, `scope`,
`expectedRevision`, `workbook`) as `defineProject`. They live alongside
`ProjectBuilder` rather than on it because the builder is documented
as append-only / greenfield-only, and edits to a persisted workbook are
a different workflow.

- `patchPrimitive(host, { workbook, id, fields, scope?, expectedRevision?, fullValidate? }) → { revision, report }`
- `patchRelation(host, { workbook, id, fields, expectedRevision?, fullValidate? }) → { revision, report }`
- `deletePrimitive(host, { workbook, id }) → { revision }`
- `deleteRelation(host, { workbook, id }) → { revision }`
- New types: `PatchPrimitiveInput`, `PatchRelationInput`,
  `PatchResult`, `DeleteResult` (re-exported from the package root).

#### SDK — referential pre-flight on `commit()`

`ProjectBuilder.commit()` now runs a queue-time check for dangling
relation references **before** `createProject` is called. When a
relation's `from` or `to` doesn't resolve to a queued primitive,
commit fails fast with a `verification`-category `FDPMException`
listing every dangling ref at once, no workbook is created, no rollback
is needed, and the builder is sealed against retry.

Failure carries `evidence.dangling_refs: Array<{ relation_id, missing,
side: "from" | "to" }>` and a `partial_commit` envelope with
`failed_at: "preflight"`.

#### SDK — `partial_commit` evidence on commit failures

Every `FDPMException` thrown from `commit()` now carries an
`evidence.partial_commit` object so embedders can inspect what
persisted before the failure without walking the host slice manually.
Survives the rollback success path AND the rollback-failure wrap.

```ts
export interface PartialCommitFailure {
  workbook_id: string;
  primitives_created: number;   // count of persisted primitives
  relations_created: number;    // count of persisted relations
  failed_at: "workbook" | "primitive" | "relation" | "preflight";
  failed_id?: string;           // id of the spec that triggered the failure
}
```

`PartialCommitFailure` is exported from the package root.

#### SDK — generic `fields` typing on specs

`PrimitiveSpec` and `RelationSpec` now take an optional generic
parameter `F extends Record<string, unknown>` defaulting to the
untyped record. Profile-aware callers can narrow per call:

```ts
type SectionFields = { title: string; number: number };
type SectionSpec = PrimitiveSpec<SectionFields>;
```

`ProjectBuilder.primitives` / `relations` propagate the generic per
call so a single builder can mix narrowed and untyped specs. Runtime
behaviour is unchanged — narrowing is an IDE convenience, not a
security boundary, and the §7 validation pipeline remains the source
of truth.

#### SDK — alias-convention documentation

The SDK's file-level docstring now formalizes the alias convention so
future helpers stay consistent:

- INPUT shapes drop `_id` / `Id` suffixes
  (`workbook_id` → `workbook`, `type_id` → `type`, `scope_id` → `scope`,
  `source_id` → `from`, `target_id` → `to`, `rendererId` → `renderer`).
- INPUT shapes rename `field_values` → `fields`.
- INPUT shapes use camelCase for snake_case Host fields
  (`expected_revision` → `expectedRevision`).
- OUTPUT shapes (`CommitResult`, `RenderResult`,
  `PartialCommitFailure`) intentionally keep the Host-flavoured names
  because they document provenance precisely.

#### Errors — `cause` chain on `FDPMException`

`FDPMException` constructor now accepts an optional `cause` in its
extras bag and forwards it to `super()` via the standard `Error`
options object. Used by the SDK's rollback-failure wrap to preserve
the original validation error reachable via `Error.cause`.

#### Tests

- `tests/sdk-edit.test.ts` — 15 cases covering the four new edit helpers (happy-path patch with revision bump + `ValidationReport` shape, `scope` alias forwarding, `expectedRevision` → `conflict`, validation errors → `validation`, `not_found` for unknown ids, `fullValidate` flag forwarding, no-op patch on a fields-less relation, delete success, delete on unknown workbook, end-to-end create→patch→delete roundtrip).
- `tests/sdk-public-surface.test.ts` — 3 cases pinning the package-root export contract (SDK helpers, host-extra functions referenced by the SDK docstring, `Host`/`FDPMException` value exports).
- `tests/sdk-p2.test.ts` — 15 cases for generic `fields` narrowing, the cross-namespace id-sharing rejection, referential pre-flight, and `partial_commit` evidence on every failure path (including survival through rollback success and rollback-failure wrap).
- `tests/sdk-p3.test.ts` — 11 cases pinning the `RenderOptions` rename and the alias-convention rules across every SDK input shape via `expectTypeOf`.
- `tests/sdk-pass2.test.ts` — 4 new P0 regression cases (double-commit guard on success path, double-commit guard on rolled-back failure, sealed-builder rejection of `primitives()`/`relations()` after commit, empty-workbook rollback edge case, cause-chain preservation through rollback-failure wrap).

### Changed

#### SDK — rollback wrap preserves cause chain and findings

When `commit({ rollbackOnError: true })` and the rollback itself
fails, the wrapping `internal`-category `FDPMException` now:

- Attaches the original error via `Error.cause` (was: only message
  text in `evidence.original_error`).
- Preserves the original error's `findings` array on the wrapper so
  type-narrowing on `FDPMException` still surfaces structured
  validation findings.
- Carries both the original and rollback error messages in
  `evidence.original_error` / `evidence.rollback_error`, plus any
  pre-existing evidence keys from the original error.

### Removed / Renamed (breaking)

#### SDK — `RenderOptions.rendererId` renamed to `renderer`

The SDK alias convention drops `Id` suffixes on input shapes. The
output envelope (`RenderResult`) keeps `rendererId` and `pluginId`
because those are provenance fields, not aliases.

```diff
- await renderProject(host, { workbook, target, rendererId: "fs:SpecRenderer" });
+ await renderProject(host, { workbook, target, renderer: "fs:SpecRenderer" });
```

`RenderResult.rendererId` and `RenderResult.pluginId` are unchanged.

### Rejected proposals

The following items were proposed during the SDK audit and **rejected
with documented rationale** (regression tests pin the rejection):

- **Cross-namespace ID uniqueness.** Forbidding a primitive and a
  relation from sharing an id at the SDK boundary was rejected:
  primitives and relations live in **separate id namespaces** in the
  host data model (see `Host.deletePrimitive` vs `Host.deleteRelation`
  at `src/core/host.ts:282` / `:457`). Forbidding overlap would block
  legitimate import workflows from systems with shared id namespaces.
  Pinned by `tests/sdk-p2.test.ts › "rejected: cross-namespace id
  sharing is allowed by design"`.
- **`workbookId` / `targetMimeType` renames on `RenderOptions`.** The
  audit proposed these as a consistency fix, but they go in the wrong
  direction — `workbook` is *already* the SDK alias (it strips `_id`
  from `workbook_id`), and `target` accepts both MIME types and
  symbolic ids per `RendererRegistration.target`. The real consistency
  issue was `rendererId` keeping the `Id` suffix, which is fixed
  above.
- **Builder methods `removePrimitive` / `patchPrimitive` on
  `ProjectBuilder`.** The builder is documented as append-only /
  greenfield-only. Adding edit / delete to it would conflate two
  workflows. The standalone `patchPrimitive` / `deletePrimitive` etc.
  helpers above provide the same capability without the conflation.

[Unreleased]: https://example.invalid/compare/v1.1.0...HEAD
