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
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The SDK surface re-exported from `src/sdk.ts` carries its own
`0.x` stability note documented inside the file; breaking changes to
the SDK shape are still recorded here so embedders see them on
upgrade.

## [Unreleased]

### Added

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
in the same project. The §4.3 profile-resolution merge handles the
extends chain; existing `profile:spec-authoring:0.1` projects are
unaffected.

#### SPEC-SECTIONS-TREE v0.2 — sections as DNIS Nodes

The `spec:SpecMarkdownRenderer` gains a DNIS-backed section path:
when a project contains a `dnis:Document` and one or more active
`dnis:Node` primitives of `kind: "section"`, the renderer DFS-walks
the dnis:Node graph (parent_node_id, sorted by SPEC-DNIS Position)
and derives §N.M.K headings from the path. The legacy
`spec:Section`/`spec:HasSection` path is preserved verbatim for
unmigrated projects; mixed-mode projects emit a
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
"references"` so migrated projects retain their authored references
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

New `tsconfig.scripts.json` extends the project tsconfig and scopes
`scripts/**/*.ts` under `"types": ["node"]` so build scripts type-
check (and the IDE stops reporting `process` as undefined). Surfaced
two real type errors in `scripts/generate-build-from-transfer.ts`
that the project tsconfig was hiding (`PrimitiveInstance` /
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
`expectedRevision`, `project`) as `defineProject`. They live alongside
`ProjectBuilder` rather than on it because the builder is documented
as append-only / greenfield-only, and edits to a persisted project are
a different workflow.

- `patchPrimitive(host, { project, id, fields, scope?, expectedRevision?, fullValidate? }) → { revision, report }`
- `patchRelation(host, { project, id, fields, expectedRevision?, fullValidate? }) → { revision, report }`
- `deletePrimitive(host, { project, id }) → { revision }`
- `deleteRelation(host, { project, id }) → { revision }`
- New types: `PatchPrimitiveInput`, `PatchRelationInput`,
  `PatchResult`, `DeleteResult` (re-exported from the package root).

#### SDK — referential pre-flight on `commit()`

`ProjectBuilder.commit()` now runs a queue-time check for dangling
relation references **before** `createProject` is called. When a
relation's `from` or `to` doesn't resolve to a queued primitive,
commit fails fast with a `verification`-category `FDPMException`
listing every dangling ref at once, no project is created, no rollback
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
  project_id: string;
  primitives_created: number;   // count of persisted primitives
  relations_created: number;    // count of persisted relations
  failed_at: "project" | "primitive" | "relation" | "preflight";
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
  (`project_id` → `project`, `type_id` → `type`, `scope_id` → `scope`,
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

- `tests/sdk-edit.test.ts` — 15 cases covering the four new edit helpers (happy-path patch with revision bump + `ValidationReport` shape, `scope` alias forwarding, `expectedRevision` → `conflict`, validation errors → `validation`, `not_found` for unknown ids, `fullValidate` flag forwarding, no-op patch on a fields-less relation, delete success, delete on unknown project, end-to-end create→patch→delete roundtrip).
- `tests/sdk-public-surface.test.ts` — 3 cases pinning the package-root export contract (SDK helpers, host-extra functions referenced by the SDK docstring, `Host`/`FDPMException` value exports).
- `tests/sdk-p2.test.ts` — 15 cases for generic `fields` narrowing, the cross-namespace id-sharing rejection, referential pre-flight, and `partial_commit` evidence on every failure path (including survival through rollback success and rollback-failure wrap).
- `tests/sdk-p3.test.ts` — 11 cases pinning the `RenderOptions` rename and the alias-convention rules across every SDK input shape via `expectTypeOf`.
- `tests/sdk-pass2.test.ts` — 4 new P0 regression cases (double-commit guard on success path, double-commit guard on rolled-back failure, sealed-builder rejection of `primitives()`/`relations()` after commit, empty-project rollback edge case, cause-chain preservation through rollback-failure wrap).

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
- await renderProject(host, { project, target, rendererId: "fs:SpecRenderer" });
+ await renderProject(host, { project, target, renderer: "fs:SpecRenderer" });
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
- **`projectId` / `targetMimeType` renames on `RenderOptions`.** The
  audit proposed these as a consistency fix, but they go in the wrong
  direction — `project` is *already* the SDK alias (it strips `_id`
  from `project_id`), and `target` accepts both MIME types and
  symbolic ids per `RendererRegistration.target`. The real consistency
  issue was `rendererId` keeping the `Id` suffix, which is fixed
  above.
- **Builder methods `removePrimitive` / `patchPrimitive` on
  `ProjectBuilder`.** The builder is documented as append-only /
  greenfield-only. Adding edit / delete to it would conflate two
  workflows. The standalone `patchPrimitive` / `deletePrimitive` etc.
  helpers above provide the same capability without the conflation.

[Unreleased]: https://example.invalid/compare/v1.1.0...HEAD
