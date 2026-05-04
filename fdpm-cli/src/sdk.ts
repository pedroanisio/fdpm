/**
 * @fdpm/cli SDK — thin programmatic facade over Host.
 *
 * The Host class is the source of truth and remains directly callable
 * for advanced use. The SDK adds three things:
 *
 *   1. `openHost(opts)` — convenience opener that awaits load() so
 *      consumers don't forget the bootstrap step.
 *   2. `defineProject(host, header).primitives([...]).relations([...])
 *      .commit()` — a builder that creates a project plus N primitives
 *      and N relations as a sequence of validated Host calls, with
 *      naming aliases (`type` for type_id, `from` / `to` for source_id
 *      / target_id, `fields` for field_values, and `scope` for
 *      scope_id) that match how operators talk about the domain. NOT
 *      transactional — see `commit()` for the validation/atomicity
 *      trade-off.
 *   3. `renderProject(host, {project, target, ...})` — flat-args
 *      wrapper around `host.plugins.runRenderer` so callers don't have
 *      to assemble the renderer input envelope themselves.
 *
 * Stability contract: SDK helpers forward to Host methods; they don't
 * reimplement them. The Host API remains the contract of record. The
 * SDK shape is `0.x` until the API has user-cycled at least once.
 */

import { Host, type HostOptions } from "./core/host.js";
import { FDPMException } from "./core/errors/fdpm-exception.js";
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

/** Header passed to `defineProject` — the project's identity + profile. */
export interface ProjectHeader {
  id: string;
  name: string;
  profile: string;
  description?: string;
}

/**
 * Builder-friendly primitive spec.
 *
 * `fields` is `Record<string, unknown>` because field shapes are
 * profile-defined and validated at commit time by the §7 pipeline.
 * The runtime validator is the type-safety net here; per-profile
 * compile-time factory shims ("Layer 2" of the SDK proposal) would
 * narrow this further but are not yet shipped.
 */
export interface PrimitiveSpec {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  scope?: string;
}

/** Builder-friendly relation spec. See `PrimitiveSpec.fields` re: typing. */
export interface RelationSpec {
  id: string;
  type: string;
  from: string;
  to: string;
  fields?: Record<string, unknown>;
}

/** Options for `ProjectBuilder.commit`. */
export interface CommitOptions {
  /**
   * On any commit failure, attempt to delete the partially-built
   * project before re-throwing. Pre-commit state is restored on
   * success. If the delete itself fails, the original error is
   * wrapped in an `internal`-category FDPMException with both
   * messages in the chain.
   */
  rollbackOnError?: boolean;
}

/** Result returned by `commit()`. */
export interface CommitResult {
  project_id: string;
  revision: number;
  primitives_created: number;
  relations_created: number;
}

/**
 * Builder returned by `defineProject`. Chain `.primitives(...)` and
 * `.relations(...)` then `.commit()`.
 *
 * The builder is intentionally append-only — there's no remove(), and
 * no commit(false). For modifying an existing project, use the Host
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
   */
  primitives(specs: ReadonlyArray<PrimitiveSpec>): this {
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
   * times. Detects duplicate ids across all calls.
   */
  relations(specs: ReadonlyArray<RelationSpec>): this {
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
   * Commit the project + all queued primitives and relations.
   *
   * Validation: every primitive and relation passes through the full
   * §7 validation pipeline (the same gate that `host.createX` uses for
   * direct calls). Schema violations, max_length errors, unknown
   * type_ids, etc. all surface as typed FDPMException with structured
   * findings before any state mutation for that op.
   *
   * Atomicity: NOT all-or-nothing. The project is created first; then
   * each primitive and relation is created via its own Host call (which
   * commits independently). On first failure, the FDPMException carries
   * the failing op's findings, but every op up to that point is already
   * persisted.
   *
   * Recovery options on failure:
   *   - Pass `{ rollbackOnError: true }` and the builder will delete
   *     the project before re-throwing, returning state to pre-commit.
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

    const projectInput: {
      project_id: string;
      name: string;
      profile_id: string;
      description?: string;
    } = {
      project_id: this.header.id,
      name: this.header.name,
      profile_id: this.header.profile,
    };
    if (this.header.description !== undefined) {
      projectInput.description = this.header.description;
    }
    await this.host.createProject(projectInput);

    let primitivesCreated = 0;
    let relationsCreated = 0;
    try {
      for (const p of this._primitives) {
        const input: {
          id: string;
          type_id: string;
          field_values: Record<string, unknown>;
          scope_id?: string;
        } = { id: p.id, type_id: p.type, field_values: p.fields };
        if (p.scope !== undefined) input.scope_id = p.scope;
        await this.host.createPrimitive(this.header.id, input);
        primitivesCreated++;
      }
      for (const r of this._relations) {
        await this.host.createRelation(this.header.id, {
          id: r.id,
          type_id: r.type,
          source_id: r.from,
          target_id: r.to,
          field_values: r.fields ?? {},
        });
        relationsCreated++;
      }
    } catch (err) {
      if (opts?.rollbackOnError === true) {
        // Best-effort rollback: deleteProject removes the partially-
        // built project so the caller sees pre-commit state. If the
        // delete itself fails (e.g. the host's projection has gone
        // sideways), we surface BOTH errors via the cause chain.
        try {
          await this.host.deleteProject(this.header.id);
        } catch (rollbackErr) {
          throw new FDPMException(
            "internal",
            `commit failed AND rollback failed for ${this.header.id}: ${(err as Error).message} | rollback: ${(rollbackErr as Error).message}`,
            { evidence: { original_error: (err as Error).message } },
          );
        }
      }
      throw err;
    }

    const slice = this.host.getProject(this.header.id);
    return {
      project_id: this.header.id,
      revision: slice.project.revision,
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
}

/** Start a new ProjectBuilder. See `ProjectBuilder` for the chain. */
export function defineProject(host: Host, header: ProjectHeader): ProjectBuilder {
  return new ProjectBuilder(host, header);
}

/** Flat-args options for `renderProject`. */
export interface RenderOptions {
  project: string;
  target: string;
  /** Disambiguate when more than one renderer matches the target. */
  rendererId?: string;
}

/** Renderer result, with the plugin and renderer ids that produced it. */
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
 * Render a project through a registered renderer.
 *
 * Thin wrapper around `host.plugins.runRenderer` that builds the
 * renderer input envelope from the project's current state. Use
 * `host.plugins.runRenderer` directly if you need to render a
 * synthetic primitives/relations set without persisting them.
 */
export async function renderProject(
  host: Host,
  opts: RenderOptions,
): Promise<RenderResult> {
  const slice = host.getProject(opts.project);
  const profile = host.profiles.getResolved(slice.project.profile_id);
  const result = await host.plugins.runRenderer(
    opts.target,
    {
      projectId: opts.project,
      project: slice.project,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile,
    },
    opts.rendererId !== undefined ? { rendererId: opts.rendererId } : {},
  );
  return result;
}
