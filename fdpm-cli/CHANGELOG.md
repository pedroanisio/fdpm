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
