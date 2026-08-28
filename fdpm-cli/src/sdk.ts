/**
 * @fdpm/cli SDK — thin programmatic facade over Host.
 *
 * The Host class is the source of truth and remains directly callable
 * for advanced use. The SDK adds:
 *
 *   1. `openHost(opts)` — convenience opener that awaits load() so
 *      consumers don't forget the bootstrap step.
 *   2. `defineProject(host, header).primitives([...]).relations([...])
 *      .commit()` — a builder that creates a workbook plus N primitives
 *      and N relations as a sequence of validated Host calls, with
 *      naming aliases (`type` for type_id, `from` / `to` for source_id
 *      / target_id, `fields` for field_values, and `scope` for
 *      scope_id) that match how operators talk about the domain. The
 *      builder is append-only and intended for greenfield workbook
 *      construction. NOT transactional — see `commit()` for the
 *      validation/atomicity trade-off.
 *   3. Edit helpers: `patchPrimitive`, `deletePrimitive`,
 *      `patchRelation`, `deleteRelation` — flat-args wrappers around
 *      the Host's edit/delete methods that share the same
 *      operator-friendly aliases as `defineProject`. Use these for
 *      modifying an existing workbook after it has been built.
 *   4. `renderProject(host, {workbook, target, ...})` — flat-args
 *      wrapper around `host.plugins.runRenderer` so callers don't have
 *      to assemble the renderer input envelope themselves.
 *
 * For structural / batch / time-travel operations — `batchEdit`,
 * `undo`, `rebuildFromLog`, `splitProject`, `cloneProject`,
 * `exportTransfer` / `importTransfer`, `createTemplate` /
 * `applyTemplate`, `createTestSuite` / `runTestSuite` — use the
 * functions re-exported from the package root (see
 * `src/core/host-extra.ts`). They take the Host as their first
 * argument and don't have SDK-flavoured aliases; the surface is small
 * enough that re-skinning them adds noise without value.
 *
 * Naming convention (alias layer):
 *   The SDK exposes operator-friendly names for arguments the Host
 *   spells with `_id` / suffix-heavy domain terms. Every INPUT shape
 *   in this file follows the same rules so callers can predict the
 *   alias without consulting the docs:
 *
 *     - Drop the `_id` / `Id` suffix on inputs:
 *         `workbook_id`         → `workbook`
 *         `type_id`            → `type`
 *         `scope_id`           → `scope`
 *         `source_id`          → `from`
 *         `target_id`          → `to`
 *         `rendererId`         → `renderer`
 *     - Rename `field_values` → `fields` (operator vocabulary).
 *     - Snake-case Host fields become camelCase on SDK inputs:
 *         `expected_revision`  → `expectedRevision`
 *
 *   OUTPUT shapes (CommitResult, RenderResult, PartialCommitFailure)
 *   keep the Host-flavoured names because they document provenance
 *   precisely (`pluginId`, `rendererId`, `workbook_id`). Stripping the
 *   suffix on outputs would lose meaning.
 *
 * Stability contract: SDK helpers forward to Host methods; they don't
 * reimplement them. The Host API remains the contract of record. The
 * SDK shape is `0.x` until the API has user-cycled at least once.
 */

import { Host, type HostOptions } from "./core/host.js";
import { FDPMException } from "./core/errors/fdpm-exception.js";
import type { ValidationReport } from "./core/models/instance.js";
import type { RendererOutput } from "./plugin/types.js";

// Re-export HostOptions so SDK consumers don't need to reach into
// "@fdpm/cli" subpaths just to type their openHost calls.
export type { HostOptions } from "./core/host.js";

/**
 * Open a fresh Host with `load()` already awaited.
 *
 * `openHost()` is exactly equivalent to:
 * ```ts
 * const host = new Host(opts);
 * await host.load();
 * ```
 * The convenience exists because forgetting `load()` is a common
 * mistake — methods that touch persistence will silently behave
 * differently against an unloaded host.
 */
export async function openHost(opts?: HostOptions): Promise<Host> {
  const host = new Host(opts);
  await host.load();
  return host;
}

/** Header passed to `defineProject` — the workbook's identity + profile. */
export interface ProjectHeader {
  id: string;
  name: string;
  profile: string;
  description?: string;
}

/**
 * Builder-friendly primitive spec.
 *
 * `fields` defaults to `Record<string, unknown>` because field shapes
 * are profile-defined and validated at commit time by the §7 pipeline.
 * The runtime validator is the type-safety net here.
 *
 * Profile-aware callers can narrow the field type by parameterising
 * the generic — for example a profile module can declare:
 *
 * ```ts
 * type SectionSpec = PrimitiveSpec<{ title: string; number: number }>;
 * ```
 *
 * and get TS-level field-name + value-type checking at the call site.
 * The runtime pipeline is still the source of truth — generic
 * narrowing is an IDE convenience, not a security boundary.
 */
export interface PrimitiveSpec<F extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: string;
  fields: F;
  scope?: string;
}

/**
 * Builder-friendly relation spec. See `PrimitiveSpec` re: the generic
 * field-type parameter — same trade-off applies.
 */
export interface RelationSpec<F extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: string;
  from: string;
  to: string;
  fields?: F;
}

/** Options for `ProjectBuilder.commit`. */
export interface CommitOptions {
  /**
   * On any commit failure, attempt to delete the partially-built
   * workbook before re-throwing. Pre-commit state is restored on
   * success. If the delete itself fails, the original error is
   * wrapped in an `internal`-category FDPMException with both
   * messages in the chain.
   */
  rollbackOnError?: boolean;
}

/** Result returned by `commit()`. */
export interface CommitResult {
  workbook_id: string;
  revision: number;
  primitives_created: number;
  relations_created: number;
}

/**
 * Shape attached to `FDPMException.evidence.partial_commit` when
 * `commit()` fails partway through without rollback. Lets embedders
 * inspect what persisted before the failure without walking the host
 * slice manually. Always present on the error envelope when at least
 * one create call succeeded before the failure.
 */
export interface PartialCommitFailure {
  workbook_id: string;
  /** Number of primitives that successfully persisted before the failure. */
  primitives_created: number;
  /** Number of relations that successfully persisted before the failure. */
  relations_created: number;
  /**
   * Where the failure happened. `workbook` means createProject itself
   * failed; `primitive` means a createPrimitive call failed; `relation`
   * means a createRelation call failed; `preflight` means a queue-time
   * referential check failed before any host call.
   */
  failed_at: "workbook" | "primitive" | "relation" | "preflight";
  /** Id of the spec that triggered the failure, when applicable. */
  failed_id?: string;
}

/**
 * Builder returned by `defineProject`. Chain `.primitives(...)` and
 * `.relations(...)` then `.commit()`.
 *
 * The builder is intentionally append-only — there's no remove(), and
 * no commit(false). For modifying an existing workbook, use the Host
 * methods directly (createPrimitive, patchPrimitive, etc.) or wrap
 * them in your own batch via `batchEdit`.
 */
export class ProjectBuilder {
  private readonly _primitives: PrimitiveSpec[] = [];
  private readonly _relations: RelationSpec[] = [];
  private readonly _seenPrimitiveIds = new Set<string>();
  private readonly _seenRelationIds = new Set<string>();
  private committed = false;

  constructor(
    private readonly host: Host,
    private readonly header: ProjectHeader,
  ) {}

  /**
   * Append primitives to the pending batch. May be called multiple
   * times. Detects duplicate ids across all calls and rejects
   * immediately rather than waiting for the host to fail mid-commit.
   *
   * The optional generic parameter `F` narrows the `fields` shape per
   * call so a single builder can mix primitives of different types
   * without losing IDE-level field-name checking. Defaults to the
   * untyped `Record<string, unknown>`.
   */
  primitives<F extends Record<string, unknown> = Record<string, unknown>>(
    specs: ReadonlyArray<PrimitiveSpec<F>>,
  ): this {
    this.assertNotCommitted();
    if (!Array.isArray(specs)) {
      throw new FDPMException(
        "verification",
        `primitives() expects an array (got ${typeof specs})`,
      );
    }
    for (const s of specs) {
      assertSpecShape(s, "PrimitiveSpec", ["id", "type", "fields"]);
      if (this._seenPrimitiveIds.has(s.id)) {
        throw new FDPMException(
          "verification",
          `duplicate primitive id queued: ${s.id}`,
        );
      }
      this._seenPrimitiveIds.add(s.id);
      this._primitives.push(s);
    }
    return this;
  }

  /**
   * Append relations to the pending batch. May be called multiple
   * times. Detects duplicate ids across all calls. See `primitives`
   * re: the generic `F` parameter.
   */
  relations<F extends Record<string, unknown> = Record<string, unknown>>(
    specs: ReadonlyArray<RelationSpec<F>>,
  ): this {
    this.assertNotCommitted();
    if (!Array.isArray(specs)) {
      throw new FDPMException(
        "verification",
        `relations() expects an array (got ${typeof specs})`,
      );
    }
    for (const s of specs) {
      assertSpecShape(s, "RelationSpec", ["id", "type", "from", "to"]);
      if (this._seenRelationIds.has(s.id)) {
        throw new FDPMException(
          "verification",
          `duplicate relation id queued: ${s.id}`,
        );
      }
      this._seenRelationIds.add(s.id);
      this._relations.push(s);
    }
    return this;
  }

  /**
   * Commit the workbook + all queued primitives and relations.
   *
   * Validation: every primitive and relation passes through the full
   * §7 validation pipeline (the same gate that `host.createX` uses for
   * direct calls). Schema violations, max_length errors, unknown
   * type_ids, etc. all surface as typed FDPMException with structured
   * findings before any state mutation for that op.
   *
   * Atomicity: NOT all-or-nothing. The workbook is created first; then
   * each primitive and relation is created via its own Host call (which
   * commits independently). On first failure, the FDPMException carries
   * the failing op's findings, but every op up to that point is already
   * persisted.
   *
   * Recovery options on failure:
   *   - Pass `{ rollbackOnError: true }` and the builder will delete
   *     the workbook before re-throwing, returning state to pre-commit.
   *   - Or call `host.deleteProject(id)` after catching the exception.
   *   - Or fix the failing spec and call `defineProject` again with a
   *     pruned input list.
   *
   * Why not `batchEdit`? It enforces only the §8 schema gate, not the
   * §7 validation pipeline (max_length, enum, etc.) — a typo'd field
   * value would slip through into the projection. Per-op validated
   * commits trade batch-atomicity for write-time validation, which is
   * the more important guarantee for a "build a doc" workflow. If you
   * need true atomicity AND validation, build a `ProjectTransfer` and
   * use `transfer.import`.
   */
  async commit(opts?: CommitOptions): Promise<CommitResult> {
    this.assertNotCommitted();
    this.committed = true;

    // Pre-flight: referential integrity for queued relations. The
    // host's createRelation will fail with a validation finding if
    // `from` or `to` doesn't resolve, but failing here means we can
    // do it BEFORE createProject runs — no workbook to roll back, no
    // partial state, and we can report all dangling refs at once
    // instead of one per host round-trip.
    const dangling = this.collectDanglingRelationRefs();
    if (dangling.length > 0) {
      const partial: PartialCommitFailure = {
        workbook_id: this.header.id,
        primitives_created: 0,
        relations_created: 0,
        failed_at: "preflight",
        failed_id: dangling[0]!.relation_id,
      };
      throw new FDPMException(
        "verification",
        `relation(s) reference unknown primitive ids: ${dangling.map((d) => `${d.relation_id} -> ${d.missing}`).join(", ")}`,
        {
          evidence: { partial_commit: partial, dangling_refs: dangling },
        },
      );
    }

    const projectInput: {
      workbook_id: string;
      name: string;
      profile_id: string;
      description?: string;
    } = {
      workbook_id: this.header.id,
      name: this.header.name,
      profile_id: this.header.profile,
    };
    if (this.header.description !== undefined) {
      projectInput.description = this.header.description;
    }
    try {
      await this.host.createProject(projectInput);
    } catch (err) {
      throw decorateWithPartialCommit(err, {
        workbook_id: this.header.id,
        primitives_created: 0,
        relations_created: 0,
        failed_at: "workbook",
      });
    }

    let primitivesCreated = 0;
    let relationsCreated = 0;
    let failedAt: "primitive" | "relation" | undefined;
    let failedId: string | undefined;
    try {
      for (const p of this._primitives) {
        const input: {
          id: string;
          type_id: string;
          field_values: Record<string, unknown>;
          scope_id?: string;
        } = { id: p.id, type_id: p.type, field_values: p.fields };
        if (p.scope !== undefined) input.scope_id = p.scope;
        try {
          await this.host.createPrimitive(this.header.id, input);
        } catch (err) {
          failedAt = "primitive";
          failedId = p.id;
          throw err;
        }
        primitivesCreated++;
      }
      for (const r of this._relations) {
        try {
          await this.host.createRelation(this.header.id, {
            id: r.id,
            type_id: r.type,
            source_id: r.from,
            target_id: r.to,
            field_values: r.fields ?? {},
          });
        } catch (err) {
          failedAt = "relation";
          failedId = r.id;
          throw err;
        }
        relationsCreated++;
      }
    } catch (err) {
      const partial: PartialCommitFailure = {
        workbook_id: this.header.id,
        primitives_created: primitivesCreated,
        relations_created: relationsCreated,
        failed_at: failedAt ?? "primitive",
        ...(failedId !== undefined ? { failed_id: failedId } : {}),
      };
      const decorated = decorateWithPartialCommit(err, partial);
      if (opts?.rollbackOnError === true) {
        // Best-effort rollback: deleteProject removes the partially-
        // built workbook so the caller sees pre-commit state. If the
        // delete itself fails (e.g. the host's projection has gone
        // sideways), we surface BOTH errors — the original error is
        // attached via Error.cause, and structured findings/evidence
        // from the original validation failure are preserved on the
        // wrapping exception so type-narrowing on FDPMException stays
        // useful. Partial-commit evidence is preserved through the
        // wrap so embedders still see what persisted before rollback
        // attempted to undo it.
        try {
          await this.host.deleteProject(this.header.id);
        } catch (rollbackErr) {
          const orig = decorated as Error & {
            evidence?: Record<string, unknown>;
            findings?: unknown[];
          };
          const wrapped: {
            evidence: Record<string, unknown>;
            findings?: unknown[];
            cause: unknown;
          } = {
            evidence: {
              original_error: orig.message,
              rollback_error: (rollbackErr as Error).message,
              ...(orig.evidence ?? {}),
            },
            cause: decorated,
          };
          if (orig.findings !== undefined) wrapped.findings = orig.findings;
          throw new FDPMException(
            "internal",
            `commit failed AND rollback failed for ${this.header.id}: ${orig.message} | rollback: ${(rollbackErr as Error).message}`,
            wrapped,
          );
        }
      }
      throw decorated;
    }

    const slice = this.host.getProject(this.header.id);
    return {
      workbook_id: this.header.id,
      revision: slice.workbook.revision,
      primitives_created: primitivesCreated,
      relations_created: relationsCreated,
    };
  }

  /**
   * Number of primitives and relations queued so far. Useful for
   * pre-commit logging and dry-run progress reporting. Reading this
   * does not commit the builder.
   */
  get pending(): { primitives: number; relations: number } {
    return {
      primitives: this._primitives.length,
      relations: this._relations.length,
    };
  }

  private assertNotCommitted(): void {
    if (this.committed) {
      throw new FDPMException(
        "verification",
        `ProjectBuilder for ${this.header.id} has already been committed`,
      );
    }
  }

  /**
   * Find any queued relation whose `from` or `to` doesn't resolve to a
   * queued primitive. Used by `commit()` to fail BEFORE createProject
   * runs so embedders don't have to deal with rollback for what is
   * fundamentally a typed-data wiring mistake.
   *
   * Note: only checks against queued primitives. The workbook doesn't
   * exist yet at commit start, so there are no pre-existing primitives
   * to consult — and the builder is greenfield-only by design (see the
   * class docstring). For edits to an existing workbook, embedders use
   * the standalone `patchPrimitive` / `patchRelation` helpers, which
   * delegate referential checks to the host's §7 pipeline.
   */
  private collectDanglingRelationRefs(): Array<{
    relation_id: string;
    missing: string;
    side: "from" | "to";
  }> {
    const queuedPrimIds = this._seenPrimitiveIds;
    const dangling: Array<{
      relation_id: string;
      missing: string;
      side: "from" | "to";
    }> = [];
    for (const r of this._relations) {
      if (!queuedPrimIds.has(r.from)) {
        dangling.push({ relation_id: r.id, missing: r.from, side: "from" });
      }
      if (!queuedPrimIds.has(r.to)) {
        dangling.push({ relation_id: r.id, missing: r.to, side: "to" });
      }
    }
    return dangling;
  }
}

/**
 * Attach a `partial_commit` evidence block to an exception thrown
 * during commit() so embedders can read what persisted before the
 * failure without walking the host slice manually. Mutates the
 * exception's evidence in place when it's an FDPMException; otherwise
 * wraps it in a new FDPMException carrying the original via Error.cause.
 */
function decorateWithPartialCommit(
  err: unknown,
  partial: PartialCommitFailure,
): Error {
  if (err instanceof FDPMException) {
    // FDPMException.evidence is `readonly` at the TS level but a
    // plain instance property at runtime. We narrow the cast to the
    // single field we mutate so the bypass is small and reviewable.
    const mut = err as { evidence?: Record<string, unknown> };
    if (mut.evidence === undefined) {
      mut.evidence = { partial_commit: partial };
    } else {
      mut.evidence["partial_commit"] = partial;
    }
    return err;
  }
  // Non-FDPM error — wrap so the partial-commit envelope is still
  // reachable, while preserving the original via Error.cause.
  return new FDPMException(
    "internal",
    `commit failed: ${(err as Error).message ?? String(err)}`,
    { evidence: { partial_commit: partial }, cause: err },
  );
}

/** Start a new ProjectBuilder. See `ProjectBuilder` for the chain. */
export function defineProject(host: Host, header: ProjectHeader): ProjectBuilder {
  return new ProjectBuilder(host, header);
}

// -- Edit helpers ------------------------------------------------------
//
// Standalone, flat-args wrappers around Host.patchX / Host.deleteX that
// share the operator-friendly aliases used by `defineProject` (`fields`
// for field_values, `scope` for scope_id, `expectedRevision` for
// expected_revision). They are NOT methods on ProjectBuilder by design:
// the builder is documented as append-only and intended for greenfield
// workbook construction. Edits to a persisted workbook belong to a
// different workflow and live as separate top-level functions so the
// two paths don't blur.

/** Flat-args input for `patchPrimitive`. */
export interface PatchPrimitiveInput {
  workbook: string;
  id: string;
  fields: Record<string, unknown>;
  scope?: string;
  /** If set, fail with `conflict` when the stored revision differs. */
  expectedRevision?: number;
  /**
   * Force whole-record validation. Default is touched-paths validation
   * (the §7.5 default), which lets you patch a field even when an
   * unrelated field has a pre-existing violation.
   */
  fullValidate?: boolean;
}

/** Result returned by `patchPrimitive` and `patchRelation`. */
export interface PatchResult {
  /** Workbook revision after the patch was appended. */
  revision: number;
  /** §7 validation report for the touched record. */
  report: ValidationReport;
}

/** Result returned by `deletePrimitive` and `deleteRelation`. */
export interface DeleteResult {
  /** Workbook revision after the delete was appended. */
  revision: number;
}

/**
 * Patch a primitive's fields (and optionally its scope).
 *
 * Thin wrapper around `host.patchPrimitive`. Validation runs on the
 * touched paths only by default — see `fullValidate` for the stricter
 * whole-record semantic. The original Host method's exceptions
 * (`not_found`, `conflict`, `validation`) propagate unchanged.
 */
export async function patchPrimitive(
  host: Host,
  input: PatchPrimitiveInput,
): Promise<PatchResult> {
  const patch: {
    id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
    expected_revision?: number;
    fullValidate?: boolean;
  } = { id: input.id, field_values: input.fields };
  if (input.scope !== undefined) patch.scope_id = input.scope;
  if (input.expectedRevision !== undefined)
    patch.expected_revision = input.expectedRevision;
  if (input.fullValidate !== undefined) patch.fullValidate = input.fullValidate;
  const out = await host.patchPrimitive(input.workbook, patch);
  return { revision: out.append.project_revision, report: out.report };
}

/** Flat-args input for `patchRelation`. */
export interface PatchRelationInput {
  workbook: string;
  id: string;
  fields: Record<string, unknown>;
  expectedRevision?: number;
  fullValidate?: boolean;
}

/**
 * Patch a relation's fields. Same semantics as `patchPrimitive`;
 * relations don't have a scope so the alias set is smaller.
 */
export async function patchRelation(
  host: Host,
  input: PatchRelationInput,
): Promise<PatchResult> {
  const patch: {
    id: string;
    field_values: Record<string, unknown>;
    expected_revision?: number;
    fullValidate?: boolean;
  } = { id: input.id, field_values: input.fields };
  if (input.expectedRevision !== undefined)
    patch.expected_revision = input.expectedRevision;
  if (input.fullValidate !== undefined) patch.fullValidate = input.fullValidate;
  const out = await host.patchRelation(input.workbook, patch);
  return { revision: out.append.project_revision, report: out.report };
}

/**
 * Delete a primitive by id. The Host enforces referential integrity —
 * dangling relations cascade per §7. Throws `not_found` if the
 * primitive doesn't exist on the workbook.
 */
export async function deletePrimitive(
  host: Host,
  args: { workbook: string; id: string },
): Promise<DeleteResult> {
  const out = await host.deletePrimitive(args.workbook, args.id);
  return { revision: out.project_revision };
}

/**
 * Delete a relation by id. Throws `not_found` if the relation doesn't
 * exist on the workbook.
 */
export async function deleteRelation(
  host: Host,
  args: { workbook: string; id: string },
): Promise<DeleteResult> {
  const out = await host.deleteRelation(args.workbook, args.id);
  return { revision: out.project_revision };
}

// -- Delete previews (dry-run surface) ---------------------------------
//
// The SDK face of the core delete-preview module: what a delete would
// remove and what references it, as a pure read. The MCP tools' `dry_run`
// and the CLI's `--dry-run` call the same functions.

import {
  previewPrimitiveDelete as corePreviewPrimitiveDelete,
  previewRelationDelete as corePreviewRelationDelete,
  previewWorkbookDelete as corePreviewWorkbookDelete,
  type PrimitiveDeletePreview,
  type RelationDeletePreview,
  type WorkbookDeletePreview,
} from "./core/operations/delete-preview.js";

export type { PrimitiveDeletePreview, RelationDeletePreview, WorkbookDeletePreview };

/** Preview a primitive delete: the primitive and every relation that references it. Throws `not_found`. */
export function previewPrimitiveDelete(
  host: Host,
  args: { workbook: string; id: string },
): PrimitiveDeletePreview {
  return corePreviewPrimitiveDelete(host, args.workbook, args.id);
}

/** Preview a relation delete: type and endpoints. Throws `not_found`. */
export function previewRelationDelete(
  host: Host,
  args: { workbook: string; id: string },
): RelationDeletePreview {
  return corePreviewRelationDelete(host, args.workbook, args.id);
}

/** Preview a workbook delete: counts of what would be removed. Throws `not_found`. */
export function previewWorkbookDelete(
  host: Host,
  args: { workbook: string },
): WorkbookDeletePreview {
  return corePreviewWorkbookDelete(host, args.workbook);
}

/**
 * Flat-args options for `renderProject`.
 *
 * Naming follows the SDK alias convention (see the file-level
 * docstring): `workbook` rather than `workbook_id`, and `renderer`
 * rather than `rendererId` — `_id` / `Id` suffixes are dropped on
 * INPUT shapes throughout the SDK. `target` keeps its bare name
 * because it's already operator-vocabulary (a MIME type or symbolic
 * id, see `RendererRegistration.target`) and has no `_id` suffix to
 * strip.
 */
export interface RenderOptions {
  workbook: string;
  target: string;
  /**
   * Disambiguate when more than one renderer matches `target`.
   * Renamed from `rendererId` for alias-convention consistency
   * (no `Id` suffix on SDK input shapes).
   */
  renderer?: string;
}

/**
 * Renderer result, with the plugin and renderer ids that produced
 * it. The `Id` suffixes are kept here because this is a provenance
 * envelope (an OUTPUT), not an input alias — the suffix communicates
 * "the id assigned by the plugin runtime" and pruning it would lose
 * meaning. The SDK alias convention applies to inputs only.
 */
export interface RenderResult extends RendererOutput {
  rendererId: string;
  pluginId: string;
}

/**
 * Validate a spec's structural shape at queue time so the operator
 * gets a crisp error from the SDK boundary instead of a deep host
 * exception when commit() runs. Only checks presence and basic types
 * of the fields the SDK itself owns; per-field schema validation
 * still runs in the §7 pipeline at commit time.
 */
function assertSpecShape(
  spec: unknown,
  kind: "PrimitiveSpec" | "RelationSpec",
  required: ReadonlyArray<string>,
): void {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new FDPMException(
      "verification",
      `${kind} must be an object (got ${spec === null ? "null" : Array.isArray(spec) ? "array" : typeof spec})`,
    );
  }
  const obj = spec as Record<string, unknown>;
  for (const key of required) {
    if (obj[key] === undefined) {
      throw new FDPMException(
        "verification",
        `${kind} missing required property: ${key}`,
      );
    }
    if (typeof obj[key] !== "string" && key !== "fields") {
      throw new FDPMException(
        "verification",
        `${kind}.${key} must be a string (got ${typeof obj[key]})`,
      );
    }
  }
}

/**
 * Render a workbook through a registered renderer.
 *
 * Thin wrapper around `host.plugins.runRenderer` that builds the
 * renderer input envelope from the workbook's current state. Use
 * `host.plugins.runRenderer` directly if you need to render a
 * synthetic primitives/relations set without persisting them.
 */
export async function renderProject(
  host: Host,
  opts: RenderOptions,
): Promise<RenderResult> {
  const slice = host.getProject(opts.workbook);
  const profile = host.profiles.getResolved(slice.workbook.profile_id);
  const result = await host.plugins.runRenderer(
    opts.target,
    {
      workbookId: opts.workbook,
      workbook: slice.workbook,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile,
    },
    opts.renderer !== undefined ? { rendererId: opts.renderer } : {},
  );
  return result;
}

/**
 * Planning plugin SDK helpers — strict-by-default operations on top of
 * `Host.*` that encode the planning profile's invariants. See
 * plugins/planning/sdk.ts for the full surface.
 *
 * Usage:
 * ```ts
 * import { openHost, planning } from "@fdpm/cli";
 * const host = await openHost();
 * await planning.markDone(host, { workbook: "my-plan", taskId: "task:foo" });
 * ```
 *
 * Pinned to the in-tree `fdpm.planning` plugin's profile
 * (`profile:planning:0.1`). Calling these helpers against a workbook
 * bound to a different profile yields `not_found` errors from Host.*.
 */
export * as planning from "../plugins/planning/sdk.js";
