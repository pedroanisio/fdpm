---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 via Claude Code; curated into release-note form by Claude Opus 5 (1M context) via Claude Code"
  date: "2026-09-18"
---

# Changelog

All notable changes to `@fdpm/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The SDK surface re-exported from `src/sdk.ts` carries its own
`0.x` stability note documented inside the file; breaking changes to
the SDK shape are still recorded here so embedders see them on
upgrade. Entries state what changed and why; the tests named in a
pull request are the record of how it was verified.

## [Unreleased]

`1.3.0` is the first public-release candidate of `@fdpm/cli`; no earlier
version was tagged or published, so this section carries every notable
change since the project began. `@fdpm/zod-bridge` is versioned and
documented separately under `packages/zod-bridge/`.

### Added

#### Core and host

- Profile revisions: a profile id names a family keyed on `(id, version)`;
  registering a second version of a known id is accepted, an exact repeat
  is a `conflict` that names the registered versions. Workbooks pin the
  revision they were created under.
- `fdpm profile retire` / `fdpm.profile.retire` (Tier 3): remove one
  revision and its file; refused while a workbook binds it, another profile
  extends it, or a plugin contributed it.
- `fdpm profile promote`: turn a registered profile into a loadable plugin
  skeleton with the verb, renderer, prompt and validator slots named.
- `workbook.update`: a workbook's `name` and `description` are event-sourced
  and editable instead of write-once.
- `id-ref` fields are resolved on write (the referent must exist and have the
  declared type), and a delete preview names what it would orphan.
- `Host.appendBatchWithCausation`: atomic multi-entry op-log batches sharing
  a `causation_op_id`, validated entry by entry against the in-progress
  projection.
- Plugin-contributed profiles are parsed against `DomainProfile` on
  registration, like every other registration path.
- `FieldDef.name` enforces what SPEC-CORE requires (a valid identifier), not
  a house casing style; the legacy exemptions are gone.
- Shared rendering primitives `src/core/render/png.ts` and `pdf.ts`, so no
  plugin reaches into another plugin's private module.
- Errors: `FDPMException` accepts and forwards a `cause`.

#### MCP servers

- `fdpm-mcp-http`: the MCP server over HTTPS for hosted clients, with
  bearer-token verification (static or RFC 7662 introspection), issuer and
  audience checks, host and origin allow-lists, per-session rate limits, and
  Kubernetes manifests plus a Dockerfile that runs unprivileged on a
  read-only root filesystem.
- Tool-catalog byte budget with the profile schema served as a resource
  (`fdpm://schema/profile`); server instructions with a measured budget,
  mirrored at `fdpm://guide`.
- Tier-3 hardening: `dry_run` previews, mandatory `idempotency_key` with
  replay, pre-execution audit.
- Audit report from `mcp-audit.jsonl` as `fdpm://audit/report[/{window}]`,
  `fdpm mcp audit-report` and the SDK's `auditReport`; Tier-2 rejections
  record `rule_ids`.
- The resource surface is gated like the tool surface: rate limit, audit
  entry and size ceiling on `resources/read`.
- `resources` and `prompts` `list_changed` notifications after a reload.
- Plugin-shipped prompts as skills (`planning/triage_iteration`,
  `loop-forward/author_pipeline`, `loop-forward/audit_pipeline`) with a
  listing budget, a body budget and a drift gate over the ids they cite.
- `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN`: the opt-in confirmation gate for
  Tier 2/3 tools the specification describes is reachable.
- Protocol revision targeting is explicit and documented.

#### Loop-forward execution

- `src/loop/`: the loop-forward executor (resumable run state machine,
  drivers, named validators, artifact sandbox, reference and manifest
  checks) and the `fdpm-loop-mcp` server that runs a pipeline by tool calls
  with the caller as the orchestrator.
- `scripts/run-loop-forward.ts`: run a pipeline from a terminal with the
  Anthropic API or a file exchange as the orchestrator; every approval is
  the operator's.
- `scripts/codex-delegate.sh` and `profile:codex-delegation:0.2`: delegate
  to the Codex CLI under a declared mode with a verification boundary
  (`cdel.*` checks) the orchestrator cannot bypass.
- `profile:frontier-proof-loop:0.1` and its seed: an orchestrator commands a
  solver on a frontier problem, one checkable step at a time; every
  registered record stays unverified until the acceptance authority records
  a verdict. The first pursuit's instance ships as `static/fixtures/ecdlp`.

#### Plugins and profiles

- `fdpm.logical-knowledge-base` (`profile:logical-knowledge-base:1.0`): the
  LogicalKnowledgeBase document as 117 primitive and 77 relation types,
  vendored by script with the upstream digest recorded; importer, exporter,
  derived `lkb:mentions` edges, grounded argumentation labelling, a formula
  parser, and two renderers.
- `fdpm.re-crt` (`profile:re-crt:6.2`): the RE-CRT reason and obstruction
  DAGs, duality maps, claim and theorem registries, evidence layer and
  open-leaf triage.
- `fdpm.silent-acceptance` (`profile:silent-acceptance:2.1`): the
  verification boundary of Silent Acceptance v2.1.0 as an assurance graph
  with four renderers.
- `fdpm.agent-memory` (`profile:agent-memory:2.0`): episode-scoped agent
  memory with the partition, supersession and evidence rules as validators.
- `fdpm.knowledge-cartridge` (`profile:knowledge-cartridge:1.0`): talent
  cartridges as a typed graph with the generator protocol's checks as
  validators.
- `fdpm.uixo` (`profile:uixo:1.2`): the UIXO v11 interaction ontology, 712
  classes and 210 derived relation types, matched against the source
  ontology's oracle; HTML, PDF, SVG and PNG views.
- `fdpm.uml` (`profile:uml:2.5`): the UML 2.5.1 Foundation subset, then the
  abstract-metaclass policy, signals and receptions, and structured
  classifiers (components, ports, connectors).
- `fdpm.style` (`profile:style:3.1`): StyleDefinition 3.1.0 as a
  bridge-derived profile with HTML, SVG and PNG views of a style registry.
- `fact_fiction`: the fact-fiction coupling model normalised so one source
  can be cited by many facts.
- `dnis` (`profile:dnis:0.1`) and the composition profiles
  `spec-authoring-dnis`, `formal-specification-dnis` and
  `document-plan-dnis`; SPEC-CORE 1.2 adopts SPEC-DNIS (§5.6), and the
  SPEC-CORE and SPEC-DNIS builds emit their section trees through the DNIS
  host adapter with byte-identical renders.
- `fn.section_of(node_id)` CEL helper (helper-set 1.2.0) and the
  `doc.section_index` render-time binding.
- READMEs for every plugin, drift-gated against their sources.

#### Documentation and tooling

- SPEC-WORKSPACE 0.1 (workspace as a first-class primitive, XDG registry,
  `.fdpmbak` backups, `fdpm workspace` commands) and SPEC-MCP-SERVER 0.1
  (Tier 1 read-only, Tier 2 validated writes, Tier 3 destructive surface,
  freshness gate, fuzz harness), each with their acceptance criteria as
  tests.
- Generated documentation for everything that counts the repository
  (`docs/architecture/CENSUS.md`, `PROFILES.md`, the `FDPM_*` tables) with
  drift tests; hand-typed figures are gone.
- Three-arm cold-agent eval runner (`src/eval`, `npm run eval:cold-agent`)
  with a generated 50-instruction test set; the reference suite runs
  through a real `fdpm-mcp`.
- Release gates: `npm run public:check` (package metadata, tracked-artifact
  hygiene, credential shapes, information-discipline rules, tarball
  allowlist, repository identity) and `npm run image:check` (runtime image
  contents), both wired into CI, plus git hooks under `scripts/git-hooks`
  installed with `npm run hooks:install`.
- `tsconfig.scripts.json` so build scripts type-check.
- License: Apache-2.0, canonical text at the root and in both package roots,
  pinned by digest in the readiness tests.
- SDK: standalone edit and delete helpers with the builder's aliases, a
  referential pre-flight on `commit()`, `partial_commit` evidence on every
  commit failure, generic `fields` typing on specs, and the alias convention
  documented in the module.
- `@fdpm/zod-bridge` 0.1.0 (Zod v4 to FDPM plugin generation) and 0.2.0
  (hybrid Entity/ValueObject lift detection); see the package changelog.

### Changed

- Working material (plans, prompts, session records, run logs, audits,
  reviews, drafts, research proofs, dated architecture analyses, a private
  cluster overlay) no longer lives in the repository; the release tree
  carries production assets and professional documentation only, and the
  `public:check` gate refuses local paths, scratch citations, coordination
  identifiers, session narrative and private endpoints in tracked files.
- The loop runtime writes scratch (artifacts, wrapper orders, exchange
  files) under `<data dir>/loop/` and resolves evidence bundles under
  `<data dir>/evidence/`; nothing a run produces is written into the
  repository. `bundle_path` in a stage output is relative to the evidence
  root.
- The runtime image and the npm tarball exclude `dist/src/eval` (developer
  tooling that imports a devDependency); `.dockerignore` keeps the build
  context to what the image needs.
- Renderers: the generic per-entity field tables are gone; every profile
  renders as a document, and the bridge-generated entity renderer produces
  readable output.
- MCP tool manifest 0.1.0 → 0.4.0: opaque `profile` argument on
  `fdpm.profile.register`, descriptions deduplicated into the server
  instructions, `dry_run` and `idempotency_key` on Tier 3 (a real Tier-3
  call without a key is refused). Server-instructions budget 4,500 B and
  catalog budget 26,000 B, each a reviewed ratchet.
- `fdpm.profile.get` views report the resolved vocabulary, so a composition
  profile shows the types it inherits; the result-ceiling refusal advises
  narrowing steps that fit.
- SDK: the rollback wrap preserves the cause chain and structured findings.
- The repository is `github.com/pedroanisio/fdpm`; manifests, READMEs and
  the readiness gate name it consistently.

### Fixed

- The loop server adopted runs another live server owned; runs now carry an
  owner and are adopted only when the owner is gone, a receipt that cannot
  be written is recorded as `receipt_error`, and a duplicate `receipt_slug`
  is refused.
- A wrapper refusal at the delegation boundary surfaced as a JSON parse
  error over the Codex banner; the attempt now records the wrapper's own
  failures and the refused return.
- `fpl.reference_resolves` accepts any title a page declares for itself
  (`og:title`, `citation_title`, `<title>` with or without the site suffix).
- Batch validation reports described intermediate states rather than the
  workbook the batch produced.
- Write path: O(n²) writes, undurable appends and log corruption under
  concurrent writers; measured in `docs/architecture/PERFORMANCE-IO-ANALYSIS.md`.
- Deleting a primitive silently cascaded to the relations pointing at it
  (breaking: the delete is refused and names them unless `cascade: true` is
  passed; the preview reads the same function, so it can never report a
  clean delete that the delete then rejects).
- `structure.reparent` bypassed validation.
- Opening one workbook replayed the entire corpus on every start.
- Clean checkouts could not typecheck or build (the workspace package lacked
  a `prepare` script).
- Custom validators registered against a relation type were never
  dispatched.
- The four `fdpm.uixo` views dumped a tree instead of presenting the
  document, and one corrupted text.
- `plan:GanttSvgRenderer` drew most of its output outside the viewBox.
- `spec:SpecMarkdownRenderer` rendered a `[[render-error]]` marker for
  references without optional fields.
- Connected MCP clients never heard about workbooks created after connect.
- The packed-install smoke test expected an outdated refusal wording.
- `FDPM_MCP_CATALOG_BUDGET_BYTES` documented a default the code did not use;
  two SPEC citations marked verified pointed at files that never existed;
  the `MANUAL.md` profile-listing example printed `0` for every profile.
- CLI, MCP, build and test paths are portable across Linux, macOS and
  Windows (no POSIX-only utilities, `/tmp`, colon-delimited paths or
  `SIGHUP` assumptions).
- `copy-plugin-assets` prunes, so a deleted plugin disappears from `dist`.

### Security

- Bearer tokens are checked for issuer as well as audience; the advertised
  scope catalogue is the read scope alone (a writing client is told which
  scope to request by the 401 challenge); and the HTTP server binds loopback
  unless told otherwise.
- The `resources/read` surface carries the same rate limit, audit and size
  ceiling as `tools/call`.

### Removed

- `web/`: the Vite browser and its Node bridge (a human on the same MCP
  surface is future work).
- `fdpm.academic-paper` 0.3: identical to 0.4.1 apart from its vendor
  prefix; withdrawn.
- Breaking: SDK `RenderOptions.rendererId` is `renderer` (the output
  envelope keeps `rendererId` and `pluginId` as provenance).
- The one-shot migration and dry-run scripts, the roadmap and
  implementation-plan workbook builds, and the dated architecture analyses
  are no longer tracked.

### Rejected proposals

Recorded so the reasoning is not re-derived; each is pinned by a test.

- Cross-namespace id uniqueness at the SDK boundary: primitives and
  relations are separate id namespaces in the host model, and forbidding
  overlap would block imports from systems with shared namespaces.
- Renaming `RenderOptions.workbook` / `target`: they already follow the
  alias convention; only `rendererId` did not.
- Edit and delete methods on `ProjectBuilder`: the builder is append-only
  and greenfield-only; the standalone helpers cover edits without conflating
  the two workflows.

[Unreleased]: https://github.com/pedroanisio/fdpm/commits/main
