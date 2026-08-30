import { Store, type AppendInput, type AppendOutput } from "./store/store.js";
import { ProfileRegistry } from "./profile/registry.js";
import { ValidationPipeline } from "./validation/pipeline.js";
import { FDPMException } from "./errors/fdpm-exception.js";
import { JsonlLogStore, defaultDataDir } from "../persistence/jsonl-log.js";
import { LocalWorkspace } from "./workspace/local.js";
import type { Workspace } from "./workspace/types.js";
import { createHash } from "node:crypto";
import type { Operation } from "./operations/operation.js";
import { DomainProfile, DomainProfile as DomainProfileSchema } from "./models/meta.js";
import type { ProjectStateSlice } from "./store/state.js";
import { PluginRuntime } from "../plugin/runtime.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationReport,
} from "./models/instance.js";
import { ExpressionRuntime } from "./expr/runtime.js";
import { RenderDslEngine } from "./render/template.js";
import {
  applyPatch,
  touchedTopLevelPaths,
  type JsonPatchOp,
} from "./operations/json-patch.js";
import { v7 as uuidv7 } from "uuid";
import { mintUid } from "./identity/uid.js";
import { emitHostWarning } from "./diagnostics/warnings.js";

/**
 * Host — composes Store + ProfileRegistry + ValidationPipeline +
 * persistence. The Host is the only object commands should hold.
 *
 * Every state-changing entry point on the Host:
 *  1. Verifies the proposed operation through the §8 gate (Store does this).
 *  2. Runs the §7 validation pipeline against the proposed post-state.
 *  3. Calls Store.append (atomic + log).
 *  4. Persists the operation to JSONL.
 *
 * If validation fails at step 2, no operation is appended.
 */
export interface HostOptions {
  dataDir?: string | null;
  snapshotEvery?: number;
  /** Disable plugin discovery entirely (used by tests). */
  noPlugins?: boolean;
  /** Override built-in plugin search dirs (used by tests). */
  builtinDirs?: string[];
  /** Override $FDPM_PLUGIN_PATH search dirs (used by tests). */
  pluginPaths?: string[];
  /** Override cwd for plugin discovery (used by tests). */
  cwd?: string;
}

/**
 * Typed intent for `Host.appendBatchWithCausation`. Each variant
 * mirrors the shape its single-entry counterpart accepts.
 *
 * The optional `uid` on primitive.create / relation.create is
 * SPEC-CORE 1.2 §5.6.1's "DNIS NID == SPEC-CORE uid" pin: the DNIS
 * host adapter pre-mints the NID inside the inner DNIS planner, then
 * passes it here so the persisted primitive's `uid` equals the NID.
 * Without this override the host auto-mints a fresh ULID per
 * primitive, which breaks the §5.6.1 invariant that callers rely on
 * for parent_node_id resolution and lineage walks. Only the DNIS
 * adapter SHOULD set `uid`; ordinary plugin/transformer callers leave
 * it undefined and accept the host's auto-mint.
 */
export type DnisBatchIntent =
  | {
      kind: "primitive.create";
      primitive: {
        id: string;
        type_id: string;
        field_values: Record<string, unknown>;
        scope_id?: string;
        uid?: string;
      };
    }
  | {
      kind: "primitive.replace";
      primitive: {
        id: string;
        type_id: string;
        field_values: Record<string, unknown>;
        scope_id?: string;
      };
    }
  | {
      kind: "relation.create";
      relation: {
        id: string;
        type_id: string;
        source_id: string;
        target_id: string;
        field_values?: Record<string, unknown>;
        uid?: string;
      };
    }
  // Tier 3 from the SPEC-MCP-SERVER perspective: callers other than the
  // DNIS adapter (notably the v0.1.1 batch-delete tools) reach this
  // path. Atomic-rollback semantics still apply: deleting a primitive
  // referenced by an existing relation rejects the whole batch and
  // restores the pre-batch projection.
  | {
      kind: "primitive.delete";
      payload: { id: string };
    }
  | {
      kind: "relation.delete";
      payload: { id: string };
    };

/** The bridge writes these beside the profile; DomainProfile does not model them. */
function stripBridgeExtras(profile: DomainProfile): Record<string, unknown> {
  const { enum_defs, constraints, validation_rules, ...core } = profile as unknown as Record<
    string,
    unknown
  >;
  return core;
}

export class Host {
  /**
   * Composition fields. Each is replaced atomically by `Host.reload()`
   * (SPEC-REPL §10.3). They are NOT `readonly` so the swap can happen
   * in place — every existing `host.store.X` consumer keeps working
   * because the `host` reference itself is stable across reloads;
   * only the field assignments change. The atomic-swap contract is:
   * within any single command boundary, callers see one consistent
   * (store, profiles, pipeline, persistence, plugins) tuple. Reloads
   * happen between commands.
   *
   * The fields below are therefore mutable from the perspective of
   * `Host.reload()` only. Internal callers (Host's own methods) and
   * external callers (CLI / REPL / SPEC-MCP-SERVER) read them like
   * `readonly` fields and MUST NOT reassign them.
   */
  store: Store;
  profiles: ProfileRegistry;
  expr: ExpressionRuntime;
  renderDsl: RenderDslEngine;
  pipeline: ValidationPipeline;
  persistence: JsonlLogStore | null;
  /**
   * SPEC-WORKSPACE §10. Populated after `Host.load()` / `Host.reload()`
   * for any Host with persistence enabled; remains null when the Host is
   * constructed with `dataDir: null` (used by the no-persist test helper)
   * and during the brief window between Host construction and `load()`.
   * Long-lived consumers should access via `host.workspace` after load;
   * existing callers reading `host.persistence` keep working unchanged
   * (Principle 7: plugin call sites unchanged).
   */
  workspace: Workspace | null;
  plugins: PluginRuntime;
  private hostOptions: HostOptions;

  constructor(opts?: HostOptions) {
    this.hostOptions = opts ?? {};
    this.store = new Store(opts?.snapshotEvery);
    this.profiles = new ProfileRegistry();
    this.expr = new ExpressionRuntime();
    this.renderDsl = new RenderDslEngine(this.expr);
    this.pipeline = new ValidationPipeline(this.expr);
    this.persistence =
      opts?.dataDir === null ? null : new JsonlLogStore(opts?.dataDir ?? defaultDir());
    this.workspace = null;
    this.plugins = new PluginRuntime(this);
  }

  async load(): Promise<void> {
    // Order of operations matters: plugins contribute profiles which
    // operations may reference. The replay must see every profile_id
    // before it visits any op.
    //
    //   1. Persisted user-registered profiles (operator-installed,
    //      plugin-independent).
    //   2. Plugin discovery → registration → auto-activation
    //      (built-ins + verified plugins). Activation calls each
    //      plugin's activate() which registers its DomainProfile.
    //   3. Replay the operation log against the now-populated registry.
    if (this.persistence) {
      this.persistence.init();
      // SPEC-WORKSPACE §15: open (or auto-mint) the LocalWorkspace
      // before any persistence reads. The Workspace is the typed identity
      // surface; `host.persistence` remains the raw JsonlLogStore for
      // existing tier-bypass callers (host-extra.ts, MCP audit log).
      this.workspace = await LocalWorkspace.open(this.persistence.dataDir, {
        store: this.store,
        profiles: this.profiles,
        plugins: this.plugins,
      });
      const profileFiles = await this.persistence.listProfileFiles();
      for (const path of profileFiles) {
        const raw = await this.persistence.readProfileFile(path);
        const result = DomainProfile.safeParse(raw);
        if (!result.success) {
          emitHostWarning({
            code: "profile.invalid",
            message: `skipping invalid profile at ${path}`,
            evidence: { path, issues: result.error.issues },
          });
          continue;
        }
        if (this.profiles.has(result.data.id)) continue;
        this.profiles.register(result.data);
      }
    }

    if (!this.hostOptions.noPlugins) {
      try {
        await this.plugins.discoverAndRegister({
          ...(this.hostOptions.builtinDirs && { builtinDirs: this.hostOptions.builtinDirs }),
          ...(this.hostOptions.pluginPaths && { pluginPaths: this.hostOptions.pluginPaths }),
          ...(this.hostOptions.cwd && { cwd: this.hostOptions.cwd }),
        });
        await this.plugins.activateAuto();
      } catch (err) {
        // Plugin failures NEVER crash the host (Principle 4 / §6.4).
        emitHostWarning({
          code: "plugin.runtime_error",
          message: `plugin runtime error during load: ${(err as Error).message}`,
          evidence: { error: (err as Error).message },
        });
      }
    }

    if (this.persistence) {
      const ops = await this.persistence.readAllLogs();
      if (ops.length > 0) this.store.loadFromOperations(ops);
    }
  }

  /**
   * SPEC-REPL §10.3 — full Host reload. Builds a fresh
   * (Store, ProfileRegistry, ValidationPipeline, JsonlLogStore,
   * PluginRuntime) tuple against the same constructor options, runs
   * the equivalent of `load()` against it, then atomically swaps the
   * fields in one synchronous tick.
   *
   * Atomicity contract: callers see either the pre-reload state or
   * the post-reload state, never a half-swapped state. Implementation
   * builds everything in temporaries and only assigns the fields once
   * everything succeeds. If construction throws before the swap, the
   * existing Host stays intact and `reload()` rejects (caller can
   * retry or surface the error).
   *
   * Includes plugin discovery + activation (matches SPEC-REPL §10.3's
   * "the equivalent of constructing a fresh Host"). For plugins-only
   * reload, see `reloadPlugins()`.
   *
   * Returns `{reloadedAt, workbooks}` for the SPEC-REPL freshness map
   * reset and the SPEC-MCP-SERVER audit log. `reloadedAt` is the
   * epoch-ms timestamp captured immediately before the swap;
   * `workbooks` is the list of project_ids visible after the swap.
   */
  async reload(): Promise<{ reloadedAt: number; workbooks: string[] }> {
    const newStore = new Store(this.hostOptions.snapshotEvery);
    const newProfiles = new ProfileRegistry();
    // Recreate expr + renderDsl too: plugins re-register expression
    // helpers during activate(), and re-registering into the existing
    // runtime would either conflict (quarantine the plugin) or shadow
    // the prior registration. A fresh runtime mirrors the "construct a
    // fresh Host" semantics SPEC-REPL §10.3 mandates.
    const newExpr = new ExpressionRuntime();
    const newRenderDsl = new RenderDslEngine(newExpr);
    const newPipeline = new ValidationPipeline(newExpr);
    const newPersistence =
      this.hostOptions.dataDir === null
        ? null
        : new JsonlLogStore(this.hostOptions.dataDir ?? defaultDir());
    // PluginRuntime captures `this` at construction; we hand it a
    // facade that reads from the temporaries until the swap, then
    // becomes the live Host. Since PluginRuntime only calls a small
    // surface (registerProfile, expr, etc.), we instead construct it
    // bound to a transient shell that exposes the same shape, then
    // re-bind after the swap. Pragmatic: PluginRuntime accepts `this`
    // and we delay construction until we have all temporaries.
    const newPlugins = new PluginRuntime(
      // The runtime needs a Host reference for capability registration
      // callbacks. We pass a transient object whose store/profiles
      // point at the temporaries; after the swap, the runtime's
      // captured reference will see the live Host's fields directly
      // because it captures `this` (the same object we mutate below).
      this,
    );
    // Drive the equivalent of load() against the temporaries, but
    // bypass `this`'s loaded state — assign the temporaries to `this`
    // BEFORE calling load() so plugins register profiles into
    // newProfiles, and replay populates newStore. We can't actually
    // do that without partial-swap risk; instead, run load logic
    // inline here against the temporaries.

    // 1. Persisted profiles.
    if (newPersistence) {
      newPersistence.init();
      const profileFiles = await newPersistence.listProfileFiles();
      for (const path of profileFiles) {
        const raw = await newPersistence.readProfileFile(path);
        const result = DomainProfile.safeParse(raw);
        if (!result.success) {
          emitHostWarning({
            code: "profile.invalid",
            message: `skipping invalid profile at ${path}`,
            evidence: { path, issues: result.error.issues },
          });
          continue;
        }
        if (newProfiles.has(result.data.id)) continue;
        newProfiles.register(result.data);
      }
    }

    // 2. Plugin discovery + activation. PluginRuntime's contributions
    // call back into `this` (the live Host), so we MUST swap fields
    // BEFORE plugin activation runs — otherwise plugins register
    // their profiles into `this.profiles` (the OLD registry) instead
    // of newProfiles. Solution: do the swap, run activation, and on
    // failure restore the snapshot.
    const snapshot = {
      store: this.store,
      profiles: this.profiles,
      expr: this.expr,
      renderDsl: this.renderDsl,
      pipeline: this.pipeline,
      persistence: this.persistence,
      workspace: this.workspace,
      plugins: this.plugins,
    };
    this.store = newStore;
    this.profiles = newProfiles;
    this.expr = newExpr;
    this.renderDsl = newRenderDsl;
    this.pipeline = newPipeline;
    this.persistence = newPersistence;
    // Workspace is rebuilt below once newPersistence has been init'd.
    this.workspace = null;
    this.plugins = newPlugins;

    try {
      if (this.persistence) {
        // Re-open the LocalWorkspace against the post-swap persistence.
        // workspace.json on disk is unchanged; this is a re-bind, not a
        // re-mint.
        this.workspace = await LocalWorkspace.open(this.persistence.dataDir, {
          store: this.store,
          profiles: this.profiles,
          plugins: this.plugins,
        });
      }

      if (!this.hostOptions.noPlugins) {
        try {
          await this.plugins.discoverAndRegister({
            ...(this.hostOptions.builtinDirs && { builtinDirs: this.hostOptions.builtinDirs }),
            ...(this.hostOptions.pluginPaths && { pluginPaths: this.hostOptions.pluginPaths }),
            ...(this.hostOptions.cwd && { cwd: this.hostOptions.cwd }),
          });
          await this.plugins.activateAuto();
        } catch (err) {
          emitHostWarning({
            code: "plugin.runtime_error",
            message: `plugin runtime error during reload: ${(err as Error).message}`,
            evidence: { error: (err as Error).message },
          });
        }
      }

      // 3. Replay the log into the new Store.
      if (this.persistence) {
        const ops = await this.persistence.readAllLogs();
        if (ops.length > 0) this.store.loadFromOperations(ops);
      }
    } catch (err) {
      // Restore the snapshot if anything in the post-swap initialization
      // throws so the Host stays usable.
      this.store = snapshot.store;
      this.profiles = snapshot.profiles;
      this.expr = snapshot.expr;
      this.renderDsl = snapshot.renderDsl;
      this.pipeline = snapshot.pipeline;
      this.persistence = snapshot.persistence;
      this.workspace = snapshot.workspace;
      this.plugins = snapshot.plugins;
      throw err;
    }

    const reloadedAt = Date.now();
    const workbooks = this.listProjects().map((p) => p.id);
    return { reloadedAt, workbooks };
  }

  /**
   * SPEC-REPL §10.2 freshness primitive. Host-level passthrough so
   * SPEC-MCP-SERVER and the REPL don't reach into `host.persistence`
   * directly. Returns null if no persistence layer is configured
   * (`--no-persist`) or if the workbook's log file does not exist.
   */
  statProjectLog(workbook_id: string): { mtime_ns: bigint; size: bigint } | null {
    if (!this.persistence) return null;
    return this.persistence.statProjectLog(workbook_id);
  }

  /**
   * SPEC-REPL §10.3 — plugins-only reload. Re-runs plugin discovery
   * and activation while preserving the Store projection and
   * persistence layer (the operation log doesn't need replaying).
   *
   * What gets recreated:
   *   - PluginRuntime (re-runs discoverAndRegister + activateAuto)
   *   - ProfileRegistry (plugins re-register their profiles; persisted
   *     operator-registered profiles are also re-loaded from disk)
   *   - ExpressionRuntime + RenderDslEngine + ValidationPipeline
   *     (plugins re-register their expression helpers and validators
   *     into the fresh runtime; reusing the old runtime would conflict
   *     and quarantine every plugin)
   *
   * What stays intact:
   *   - Store and its projection (the operation log is the source of
   *     truth and hasn't changed)
   *   - JsonlLogStore (the persistence layer is unaffected)
   *
   * Use case: operator added or updated a plugin while a long-lived
   * Host (REPL or MCP server) was running. SPEC-REPL §10.5 documents
   * that plugin staleness is NOT auto-detected; this is the explicit
   * recovery path.
   *
   * Returns `{reloadedAt, plugins}` where `plugins` is the count of
   * active plugins after the reload.
   */
  async reloadPlugins(): Promise<{ reloadedAt: number; plugins: number }> {
    const newProfiles = new ProfileRegistry();
    const newExpr = new ExpressionRuntime();
    const newRenderDsl = new RenderDslEngine(newExpr);
    const newPipeline = new ValidationPipeline(newExpr);
    const newPlugins = new PluginRuntime(this);

    const snapshot = {
      profiles: this.profiles,
      expr: this.expr,
      renderDsl: this.renderDsl,
      pipeline: this.pipeline,
      plugins: this.plugins,
    };
    this.profiles = newProfiles;
    this.expr = newExpr;
    this.renderDsl = newRenderDsl;
    this.pipeline = newPipeline;
    this.plugins = newPlugins;

    try {
      // Persisted operator-registered profiles must be re-loaded into
      // the fresh registry before plugin activation runs (plugin
      // activate() callbacks may reference them).
      if (this.persistence) {
        const profileFiles = await this.persistence.listProfileFiles();
        for (const path of profileFiles) {
          const raw = await this.persistence.readProfileFile(path);
          const result = DomainProfile.safeParse(raw);
          if (!result.success) {
            emitHostWarning({
              code: "profile.invalid",
              message: `skipping invalid profile at ${path} during plugin reload`,
              evidence: { path, issues: result.error.issues },
            });
            continue;
          }
          if (this.profiles.has(result.data.id)) continue;
          this.profiles.register(result.data);
        }
      }

      if (!this.hostOptions.noPlugins) {
        await this.plugins.discoverAndRegister({
          ...(this.hostOptions.builtinDirs && { builtinDirs: this.hostOptions.builtinDirs }),
          ...(this.hostOptions.pluginPaths && { pluginPaths: this.hostOptions.pluginPaths }),
          ...(this.hostOptions.cwd && { cwd: this.hostOptions.cwd }),
        });
        await this.plugins.activateAuto();
      }

      // Re-bind the workspace's profile/plugin references to the fresh
      // instances. Identity (workspace.json) is unchanged so we re-use
      // `LocalWorkspace.open` against the same dataDir; the registry
      // upsert is a no-op for path/name fields that did not move.
      if (this.persistence) {
        this.workspace = await LocalWorkspace.open(this.persistence.dataDir, {
          store: this.store,
          profiles: this.profiles,
          plugins: this.plugins,
        });
      }
    } catch (err) {
      this.profiles = snapshot.profiles;
      this.expr = snapshot.expr;
      this.renderDsl = snapshot.renderDsl;
      this.pipeline = snapshot.pipeline;
      this.plugins = snapshot.plugins;
      throw err;
    }

    return {
      reloadedAt: Date.now(),
      plugins: this.plugins.list().filter((p) => p.state === "active").length,
    };
  }

  /**
   * SPEC-REPL §10.2 lenient-mode incremental tail-replay.
   *
   * Reads the workbook's full JSONL log from disk and compares its
   * prefix to the in-memory operation log. Three outcomes:
   *
   *   - No change (cheap path): the in-memory log already covers the
   *     full on-disk log → returns {appliedOps: 0, newRevision} and
   *     skips replay entirely.
   *   - Pure append: the on-disk log extends the in-memory prefix
   *     identically → only the new tail ops are applied via
   *     `Store.appendReplayedOps`. Returns {appliedOps: N, newRevision}.
   *   - Divergent / truncated / rewritten: the on-disk log is shorter
   *     than the in-memory log, OR the prefix bytes differ → throws
   *     `host_compat`. Silent full-reload would mask a serious operator
   *     error (log restored from backup, file replaced, etc.); the
   *     caller can choose to recover with a full Host.reload().
   *
   * Returns `{appliedOps, newRevision}` for the REPL audit log and
   * the SPEC-MCP-SERVER per-call validation_status field.
   *
   * No-op (no persistence configured, or no log file on disk for this
   * workbook): returns {appliedOps: 0, newRevision: <current in-memory
   * revision, or 0 if the workbook is unknown>}.
   */
  async reloadProjectTail(
    workbook_id: string,
  ): Promise<{ appliedOps: number; newRevision: number }> {
    const currentLog = this.store.getOperationLog(workbook_id);
    const currentRev =
      currentLog.length > 0 ? currentLog[currentLog.length - 1]!.revision : 0;

    if (!this.persistence) {
      return { appliedOps: 0, newRevision: currentRev };
    }
    const stat = this.persistence.statProjectLog(workbook_id);
    if (stat === null) {
      return { appliedOps: 0, newRevision: currentRev };
    }

    const onDisk = await this.persistence.readLog(workbook_id);
    if (onDisk.length < currentLog.length) {
      throw new FDPMException(
        "host_compat",
        `workbook log shrank: in-memory has ${currentLog.length} ops, on-disk has ${onDisk.length}`,
        {
          evidence: {
            reason: "log_truncated",
            workbook_id,
            in_memory_count: currentLog.length,
            on_disk_count: onDisk.length,
          },
        },
      );
    }
    for (let i = 0; i < currentLog.length; i += 1) {
      if (onDisk[i]!.op_id !== currentLog[i]!.op_id) {
        throw new FDPMException(
          "host_compat",
          `workbook log prefix diverged at op[${i}]: in-memory ${currentLog[i]!.op_id}, on-disk ${onDisk[i]!.op_id}`,
          {
            evidence: {
              reason: "log_rewritten",
              workbook_id,
              divergence_index: i,
              in_memory_op_id: currentLog[i]!.op_id,
              on_disk_op_id: onDisk[i]!.op_id,
            },
          },
        );
      }
    }
    if (onDisk.length === currentLog.length) {
      return { appliedOps: 0, newRevision: currentRev };
    }
    const tail = onDisk.slice(currentLog.length);
    this.store.appendReplayedOps(workbook_id, tail);
    const newRev = tail[tail.length - 1]!.revision;
    return { appliedOps: tail.length, newRevision: newRev };
  }

  /**
   * Plugin-contributed profiles are startup contributions, not operator
   * profile-register commands. Persisted profiles load before plugins and
   * keep precedence: if a profile id is already present, activation treats
   * that contribution as already satisfied instead of failing startup.
   *
   * The profile is parsed against `DomainProfile`, the same schema
   * `fdpm profile register`, the MCP register tool and the persisted-
   * profile loader all use. This path used to skip that parse, so a
   * plugin could register a profile the operator could not — and eleven
   * of seventeen shipped profiles were in fact unparseable, including
   * three with no `version` at all, which `fdpm profile list` rendered as
   * the literal string "undefined".
   *
   * There are no exemptions. There briefly were three, for domains whose
   * camelCase vocabularies the old `FieldDef.name` pattern rejected —
   * until the pattern turned out to be a house style with no grounding in
   * SPEC-CORE, contradicted by the host's own compiler and by the bridge.
   * The rule was corrected instead; see FieldDef in models/meta.ts.
   */
  registerPluginProfile(profile: DomainProfile): "registered" | "already-present" {
    if (this.profiles.has(profile.id)) return "already-present";
    const parsed = DomainProfileSchema.safeParse(stripBridgeExtras(profile));
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new FDPMException(
        "validation",
        `plugin profile "${profile.id}" does not satisfy DomainProfile (${parsed.error.issues.length} issue(s)); first: ${detail}`,
        { findings: parsed.error.issues, evidence: { profile_id: profile.id } },
      );
    }
    this.profiles.register(profile);
    return "registered";
  }

  /** §1.5: core:empty is registered by the registry constructor. */
  async registerProfile(
    profile: DomainProfile,
    opts?: { persist?: boolean },
  ): Promise<void> {
    this.profiles.register(profile);
    // Default: persist (operator-registered profiles need to survive
    // restarts). Plugins pass persist=false because they re-register
    // their profiles on every startup via activate().
    const persist = opts?.persist ?? true;
    if (persist && this.persistence) {
      await this.persistence.writeProfile(profile.id, profile);
    }
  }

  // -- Workbook-level entry points -------------------------------------

  async createProject(input: {
    workbook_id: string;
    name: string;
    profile_id: string;
    description?: string;
  }): Promise<AppendOutput> {
    if (!this.profiles.has(input.profile_id))
      throw new FDPMException("not_found", `profile not found: ${input.profile_id}`);
    return this.appendAndPersist({
      kind: "workbook.create",
      workbook_id: input.workbook_id,
      payload: { ...input },
    });
  }

  async deleteProject(workbook_id: string): Promise<AppendOutput> {
    this.store.getProject(workbook_id); // throws not_found if absent
    const result = await this.appendAndPersist({
      kind: "workbook.delete",
      workbook_id,
      payload: { workbook_id },
    });
    if (this.persistence) {
      // The log entry stays — but for a CLI, we also clear the on-disk
      // workbook directory so a re-create with the same id starts fresh.
      // The deletion op IS the audit; we keep the log file but truncate
      // it logically by writing nothing (we keep the prior log so
      // history can be inspected, but new workbooks with same id need a
      // clean slate). v1.1 keeps the log; this is the same behaviour
      // as the in-memory model (the log is forever).
    }
    return result;
  }

  // -- Primitive entry points -----------------------------------------

  async createPrimitive(workbook_id: string, primitive: {
    id: string;
    uid?: string;
    type_id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    if (primitive.uid) {
      throw new FDPMException("verification", "uid cannot be set on creation (minted by Core)");
    }
    const uid = mintUid();
    const payload = { ...primitive, uid };

    return this.runWithValidation(workbook_id, "primitive.create", payload, () => {
      const proposed: PrimitiveInstance = {
        id: primitive.id,
        uid,
        type_id: primitive.type_id,
        field_values: primitive.field_values,
        revision: 0,
        ...(primitive.scope_id != null && { scope_id: primitive.scope_id }),
      };
      const profile = this.requireResolvedProfile(workbook_id);
      return this.pipeline.runPrimitive(proposed, profile, this.validationContext(workbook_id));
    });
  }

  async replacePrimitive(workbook_id: string, primitive: {
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
    expected_revision?: number;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const slice = this.store.getProject(workbook_id);
    const existing = slice.primitives[primitive.id];
    if (!existing) throw new FDPMException("not_found", `primitive not found: ${primitive.id}`);
    if (existing.type_id !== primitive.type_id)
      throw new FDPMException("conflict", "type_id is immutable");
    if (
      primitive.expected_revision !== undefined &&
      existing.revision !== primitive.expected_revision
    )
      throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
    return this.runWithValidation(workbook_id, "primitive.replace", primitive, () => {
      const proposed: PrimitiveInstance = {
        ...existing,
        field_values: primitive.field_values,
        ...(primitive.scope_id != null && { scope_id: primitive.scope_id }),
      };
      const profile = this.requireResolvedProfile(workbook_id);
      return this.pipeline.runPrimitive(proposed, profile, this.validationContext(workbook_id));
    });
  }

  /**
   * Partial-update a primitive. Validation scope defaults to *touched
   * top-level paths* (the keys present in `patch.field_values`), matching
   * `fieldPatchPrimitive` semantics. This means a patch on field B
   * succeeds even if field A has a pre-existing violation — necessary for
   * editing imported third-party data without hitting the L1.1 trap.
   *
   * Pass `fullValidate: true` to force whole-record validation (the
   * stricter semantic; preserves original §7.5 gating for callers that
   * deliberately want to fail on any pre-existing violation).
   */
  async patchPrimitive(workbook_id: string, patch: {
    id: string;
    field_values: Record<string, unknown>;
    scope_id?: string;
    expected_revision?: number;
    fullValidate?: boolean;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const slice = this.store.getProject(workbook_id);
    const existing = slice.primitives[patch.id];
    if (!existing) throw new FDPMException("not_found", `primitive not found: ${patch.id}`);
    if (
      patch.expected_revision !== undefined &&
      existing.revision !== patch.expected_revision
    )
      throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
    // Strip the harness-only flag from the persisted payload — operation
    // log records the user-facing patch shape, not internal toggles.
    const { fullValidate, ...persistPayload } = patch;
    return this.runWithValidation(workbook_id, "primitive.patch", persistPayload, () => {
      const merged: PrimitiveInstance = {
        ...existing,
        field_values: { ...existing.field_values, ...patch.field_values },
        ...(patch.scope_id != null && { scope_id: patch.scope_id }),
      };
      const profile = this.requireResolvedProfile(workbook_id);
      const ctx = this.validationContext(workbook_id);
      if (fullValidate) {
        return this.pipeline.runPrimitive(merged, profile, ctx);
      }
      const touched = new Set<string>(Object.keys(patch.field_values));
      if (patch.scope_id != null) touched.add("scope_id");
      return this.pipeline.runPrimitiveFieldPatch(merged, profile, touched, ctx);
    });
  }

  async deletePrimitive(workbook_id: string, id: string): Promise<AppendOutput> {
    const slice = this.store.getProject(workbook_id);
    if (!(id in slice.primitives))
      throw new FDPMException("not_found", `primitive not found: ${id}`);
    return this.appendAndPersist({
      kind: "primitive.delete",
      workbook_id,
      payload: { id },
    });
  }

  async fieldPatchPrimitive(workbook_id: string, payload: {
    id: string;
    operations: unknown[];
    expected_revision?: number;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const maxOps = parseInt(process.env["FDPM_MAX_FIELD_PATCH_OPS"] ?? "100", 10);
    if (payload.operations.length > maxOps)
      throw new FDPMException(
        "quota",
        `field-patch ops ${payload.operations.length} exceed cap ${maxOps}`,
        {
          evidence: {
            observed: payload.operations.length,
            cap: maxOps,
            unit: "ops",
            env: "FDPM_MAX_FIELD_PATCH_OPS",
          },
        },
      );
    const slice = this.store.getProject(workbook_id);
    const existing = slice.primitives[payload.id];
    if (!existing) throw new FDPMException("not_found", `primitive not found: ${payload.id}`);
    if (
      payload.expected_revision !== undefined &&
      existing.revision !== payload.expected_revision
    )
      throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
    return this.runWithValidation(workbook_id, "primitive.field-patch", payload, () => {
      const ops = payload.operations as JsonPatchOp[];
      const { result } = applyPatch(existing.field_values, ops, ["id", "type_id"]);
      const proposed: PrimitiveInstance = { ...existing, field_values: result };
      const profile = this.requireResolvedProfile(workbook_id);
      // §9.7.4: a field-patch's validation scope is the touched paths
      // only. Without this, an unrelated pre-existing violation in
      // another field blocks every targeted edit on the primitive,
      // making imported third-party data uneditable.
      const touched = touchedTopLevelPaths(ops);
      return this.pipeline.runPrimitiveFieldPatch(
        proposed,
        profile,
        touched,
        this.validationContext(workbook_id),
      );
    });
  }

  /**
   * Build the optional `CustomValidatorContext` passed to validators
   * when a primitive is created/replaced/patched/field-patched. Carries
   * the workbook's relations so graph-traversal predicates
   * (`has_incoming`, `has_outgoing`, `acyclic`) can run.
   */
  private validationContext(workbook_id: string): {
    relations: readonly RelationInstance[];
    workbook?: ProjectStateSlice;
    projectFingerprint?: string;
    gitProbeDir?: string;
  } {
    try {
      const slice = this.store.getProject(workbook_id);
      // `projectFingerprint` hashes the whole operation log, which grows
      // with every write, so computing it eagerly makes a run of N writes
      // O(N^2) in log size. Only the CEL-rule loop in `runPrimitive` reads
      // it, and only when a profile declares an expression rule for the
      // type being written — the relation path never touches it. So it is
      // computed on first read and memoised, and a write that nobody asks
      // about pays nothing.
      let fingerprint: string | undefined;
      const self = this;
      return {
        relations: Object.values(slice.relations),
        workbook: slice,
        get projectFingerprint(): string {
          fingerprint ??= self.projectFingerprint(workbook_id);
          return fingerprint;
        },
        gitProbeDir: this.hostOptions.cwd ?? process.cwd(),
      };
    } catch {
      // Workbook doesn't exist yet (e.g. createPrimitive on a workbook
      // that's about to be created via the same op stream — not a real
      // case in v1.1, but defensive). No relations to surface.
      return { relations: [], gitProbeDir: this.hostOptions.cwd ?? process.cwd() };
    }
  }

  // -- Relation entry points ------------------------------------------

  async createRelation(workbook_id: string, relation: {
    id: string;
    uid?: string;
    type_id: string;
    source_id: string;
    target_id: string;
    field_values?: Record<string, unknown>;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    if (relation.uid) {
      throw new FDPMException("verification", "uid cannot be set on creation (minted by Core)");
    }
    const uid = mintUid();
    const payload = { ...relation, uid };
    return this.runWithValidation(workbook_id, "relation.create", payload, () => {
      const proposed: RelationInstance = {
        id: relation.id,
        uid,
        type_id: relation.type_id,
        source_id: relation.source_id,
        target_id: relation.target_id,
        field_values: relation.field_values ?? {},
        revision: 0,
      };
      const profile = this.requireResolvedProfile(workbook_id);
      const slice = this.store.getProject(workbook_id);
      const prims = new Map(Object.entries(slice.primitives));
      return this.pipeline.runRelation(proposed, profile, prims, this.validationContext(workbook_id));
    });
  }

  async replaceRelation(workbook_id: string, relation: {
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
    expected_revision?: number;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const slice = this.store.getProject(workbook_id);
    const existing = slice.relations[relation.id];
    if (!existing) throw new FDPMException("not_found", `relation not found: ${relation.id}`);
    if (existing.type_id !== relation.type_id)
      throw new FDPMException("conflict", "type_id is immutable");
    if (
      relation.expected_revision !== undefined &&
      existing.revision !== relation.expected_revision
    )
      throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
    return this.runWithValidation(workbook_id, "relation.replace", relation, () => {
      const proposed: RelationInstance = {
        ...existing,
        field_values: relation.field_values,
      };
      const profile = this.requireResolvedProfile(workbook_id);
      const prims = new Map(Object.entries(slice.primitives));
      return this.pipeline.runRelation(proposed, profile, prims, this.validationContext(workbook_id));
    });
  }

  /** See `patchPrimitive` — same touched-paths default applies here. */
  async patchRelation(workbook_id: string, patch: {
    id: string;
    field_values: Record<string, unknown>;
    expected_revision?: number;
    fullValidate?: boolean;
  }): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const slice = this.store.getProject(workbook_id);
    const existing = slice.relations[patch.id];
    if (!existing) throw new FDPMException("not_found", `relation not found: ${patch.id}`);
    if (
      patch.expected_revision !== undefined &&
      existing.revision !== patch.expected_revision
    )
      throw new FDPMException("conflict", `If-Match revision mismatch: stored=${existing.revision}`);
    const { fullValidate, ...persistPayload } = patch;
    return this.runWithValidation(workbook_id, "relation.patch", persistPayload, () => {
      const merged: RelationInstance = {
        ...existing,
        field_values: { ...existing.field_values, ...patch.field_values },
      };
      const profile = this.requireResolvedProfile(workbook_id);
      const prims = new Map(Object.entries(slice.primitives));
      if (fullValidate) {
        return this.pipeline.runRelation(merged, profile, prims, this.validationContext(workbook_id));
      }
      const touched = new Set<string>(Object.keys(patch.field_values));
      return this.pipeline.runRelationFieldPatch(merged, profile, prims, touched);
    });
  }

  async deleteRelation(workbook_id: string, id: string): Promise<AppendOutput> {
    const slice = this.store.getProject(workbook_id);
    if (!(id in slice.relations))
      throw new FDPMException("not_found", `relation not found: ${id}`);
    return this.appendAndPersist({
      kind: "relation.delete",
      workbook_id,
      payload: { id },
    });
  }

  // -- Structure ------------------------------------------------------

  async reorder(workbook_id: string, scope_id: string, ordering: string[]): Promise<AppendOutput> {
    return this.appendAndPersist({
      kind: "structure.reorder",
      workbook_id,
      payload: { scope_id, ordering },
    });
  }

  async reparent(workbook_id: string, payload: {
    primitive_id: string;
    from_scope_id: string;
    to_scope_id: string;
    position?: number;
  }): Promise<AppendOutput> {
    return this.appendAndPersist({
      kind: "structure.reparent",
      workbook_id,
      payload,
    });
  }

  // -- Operation log read API -----------------------------------------

  getLog(
    workbook_id: string,
    filters?: {
      from_revision?: number;
      to_revision?: number;
      kind?: string[];
      actor?: string;
      plugin_id?: string;
      request_id?: string;
      limit?: number;
    },
  ): Operation[] {
    const log = this.store.getOperationLog(workbook_id);
    const max = parseInt(process.env["FDPM_LOG_PAGE_MAX"] ?? "10000", 10);
    const limit = Math.min(filters?.limit ?? 1000, max);
    let out = log;
    if (filters?.from_revision != null)
      out = out.filter((o) => o.revision >= filters.from_revision!);
    if (filters?.to_revision != null)
      out = out.filter((o) => o.revision <= filters.to_revision!);
    if (filters?.kind?.length) {
      const set = new Set(filters.kind);
      out = out.filter((o) => set.has(o.kind));
    }
    if (filters?.actor) out = out.filter((o) => o.actor === filters.actor);
    if (filters?.plugin_id) out = out.filter((o) => o.plugin_id === filters.plugin_id);
    if (filters?.request_id) out = out.filter((o) => o.request_id === filters.request_id);
    return out.slice(0, limit);
  }

  // -- Helpers --------------------------------------------------------

  requireResolvedProfile(workbook_id: string): DomainProfile {
    const slice = this.store.getProject(workbook_id);
    return this.profiles.getResolved(slice.workbook.profile_id);
  }

  /**
   * Wraps validation + append. If the report is not accepted, the
   * operation is NOT appended — the caller receives the rejected report.
   */
  private async runWithValidation(
    workbook_id: string,
    kind: AppendInput["kind"],
    payload: Record<string, unknown>,
    runReport: () => ValidationReport,
  ): Promise<{ append: AppendOutput; report: ValidationReport }> {
    const report = runReport();
    if (!report.accepted) {
      throw new FDPMException("validation", `validation failed for ${payload["id"] ?? "instance"}`, {
        findings: report.findings,
      });
    }
    const append = await this.appendAndPersist({ kind, workbook_id, payload });
    return { append, report };
  }

  async appendAndPersist(input: AppendInput): Promise<AppendOutput> {
    const result = this.store.append(input);
    if (this.persistence) await this.persistence.appendOp(result.op);
    return result;
  }

  /** Append with provided request_id (for batch). */
  async appendBatch(
    workbook_id: string,
    inputs: Omit<AppendInput, "workbook_id">[],
  ): Promise<AppendOutput[]> {
    const request_id = uuidv7();
    const full = inputs.map((i) => ({ ...i, workbook_id, request_id }));
    const out = this.store.appendBatch(full);
    if (this.persistence) {
      for (const o of out) await this.persistence.appendOp(o.op);
    }
    return out;
  }

  /**
   * Atomic batch with shared `causation_op_id` and per-entry §7
   * validation (SPEC-CORE §5.6.2 batch atomicity).
   *
   * The caller passes a list of typed "intents" describing what each
   * entry should do (`primitive.create`, `primitive.replace`,
   * `relation.create`). The method:
   *
   *   1. Pre-mints a fresh ULID for every intent's `op_id` so the lead
   *      entry's id can be set as every entry's `causation_op_id`.
   *   2. Runs the same §7 validation pipeline that the equivalent
   *      single-entry `createPrimitive`/`replacePrimitive`/`createRelation`
   *      methods run, raising `FDPMException("validation", ...)` with
   *      structured findings if any entry is rejected.
   *   3. Calls `store.appendBatch`, which provides single-workbook
   *      atomicity with rollback if any append fails (see store.ts
   *      `appendBatch`).
   *   4. Persists every committed op to the JSONL log.
   *
   * The validation pass is interleaved with synthesis so the projection
   * snapshot the validator sees reflects the prior intent's state for
   * graph-traversal predicates. (Two intents creating two nodes that
   * reference each other still validate correctly because we walk the
   * intent list in order.)
   *
   * The DNIS host adapter is the only intended caller for now.
   */
  async appendBatchWithCausation(
    workbook_id: string,
    intents: DnisBatchIntent[],
  ): Promise<{ outputs: AppendOutput[]; reports: ValidationReport[] }> {
    if (intents.length === 0) {
      return { outputs: [], reports: [] };
    }
    const request_id = uuidv7();
    const op_ids = intents.map(() => mintUid());
    const lead_op_id = op_ids[0]!;
    const profile = this.requireResolvedProfile(workbook_id);

    // Interleave validation with synthesis: each entry validates
    // against the projection that already includes prior entries. If
    // any entry fails, restore the entire pre-batch projection AND
    // log slice (matching store.appendBatch's rollback contract).
    const beforeLog = [...this.store.getOperationLog(workbook_id)];
    const beforeSnapshot = this.store.snapshotProjectForRollback(workbook_id);

    const outputs: AppendOutput[] = [];
    const reports: ValidationReport[] = [];

    try {
      for (let i = 0; i < intents.length; i += 1) {
        const intent = intents[i]!;
        const op_id = op_ids[i]!;
        const causation_op_id = i === 0 ? null : lead_op_id;
        const buildInput = (
          kind: AppendInput["kind"],
          payload: Record<string, unknown>,
        ): AppendInput => ({
          kind,
          workbook_id,
          payload,
          op_id,
          request_id,
          causation_op_id,
        });

        // Deletes don't produce a validation report — they only check
        // existence and append. Other intents always produce a report;
        // the assertion before push to `reports` enforces this.
        let report: ValidationReport | null = null;
        let input: AppendInput;
        const ctx = this.validationContext(workbook_id);

        switch (intent.kind) {
          case "primitive.create": {
            // SPEC-CORE 1.2 §5.6.1: DNIS adapter sets uid = the DNIS NID
            // so caller-side parent_node_id references resolve. Other
            // callers leave uid undefined and accept the auto-mint.
            const uid = intent.primitive.uid ?? mintUid();
            const proposed: PrimitiveInstance = {
              id: intent.primitive.id,
              uid,
              type_id: intent.primitive.type_id,
              field_values: intent.primitive.field_values,
              revision: 0,
              ...(intent.primitive.scope_id != null && {
                scope_id: intent.primitive.scope_id,
              }),
            };
            report = this.pipeline.runPrimitive(proposed, profile, ctx);
            input = buildInput("primitive.create", { ...intent.primitive, uid });
            break;
          }
          case "primitive.replace": {
            const slice = this.store.getProject(workbook_id);
            const existing = slice.primitives[intent.primitive.id];
            if (!existing)
              throw new FDPMException(
                "not_found",
                `primitive not found: ${intent.primitive.id}`,
              );
            if (existing.type_id !== intent.primitive.type_id)
              throw new FDPMException("conflict", "type_id is immutable");
            const proposed: PrimitiveInstance = {
              ...existing,
              field_values: intent.primitive.field_values,
              ...(intent.primitive.scope_id != null && {
                scope_id: intent.primitive.scope_id,
              }),
            };
            report = this.pipeline.runPrimitive(proposed, profile, ctx);
            input = buildInput("primitive.replace", intent.primitive);
            break;
          }
          case "relation.create": {
            const uid = intent.relation.uid ?? mintUid();
            const proposed: RelationInstance = {
              id: intent.relation.id,
              uid,
              type_id: intent.relation.type_id,
              source_id: intent.relation.source_id,
              target_id: intent.relation.target_id,
              field_values: intent.relation.field_values ?? {},
              revision: 0,
            };
            const slice = this.store.getProject(workbook_id);
            const prims = new Map(Object.entries(slice.primitives));
            report = this.pipeline.runRelation(proposed, profile, prims, this.validationContext(workbook_id));
            input = buildInput("relation.create", { ...intent.relation, uid });
            break;
          }
          case "primitive.delete": {
            const slice = this.store.getProject(workbook_id);
            if (!(intent.payload.id in slice.primitives))
              throw new FDPMException(
                "not_found",
                `primitive not found: ${intent.payload.id}`,
              );
            // No validation report for deletes — leaves `report` at
            // `null` and the post-switch dispatch skips the
            // accepted-check below.
            input = buildInput("primitive.delete", { id: intent.payload.id });
            break;
          }
          case "relation.delete": {
            const slice = this.store.getProject(workbook_id);
            if (!(intent.payload.id in slice.relations))
              throw new FDPMException(
                "not_found",
                `relation not found: ${intent.payload.id}`,
              );
            input = buildInput("relation.delete", { id: intent.payload.id });
            break;
          }
          default: {
            const _exhaustive: never = intent;
            throw new FDPMException(
              "verification",
              `unsupported batch intent kind: ${(_exhaustive as { kind: string }).kind}`,
            );
          }
        }

        if (report !== null) {
          if (!report.accepted) {
            throw new FDPMException(
              "validation",
              `validation failed for batch entry ${i} (${intent.kind})`,
              { findings: report.findings },
            );
          }
          reports.push(report);
        }

        // Append immediately so subsequent entries see this one in the
        // projection (e.g. the dnis:DerivedFrom relation needs the new
        // dnis:Node primitives to already exist; a delete in entry N
        // is visible to entry N+1).
        outputs.push(this.store.append(input));
      }
    } catch (err) {
      // Roll back: restore log + projection. We do NOT persist anything
      // until the entire batch succeeds, so JSONL is still consistent.
      this.store.restoreFromBatchSnapshot(workbook_id, beforeLog, beforeSnapshot);
      throw err;
    }

    if (this.persistence) {
      for (const o of outputs) await this.persistence.appendOp(o.op);
    }
    return { outputs, reports };
  }

  getProject(id: string): ProjectStateSlice {
    return this.store.getProject(id);
  }

  /**
   * The persistence directory this Host operates against, or `null`
   * for an in-memory Host. Read-only; consumers (the audit-report
   * resource, the SDK) use it to locate sidecar files such as
   * `mcp-audit.jsonl` without touching `persistence` directly.
   */
  get dataDir(): string | null {
    return this.persistence ? this.persistence.dataDir : null;
  }

  private projectFingerprint(workbook_id: string): string {
    const log = this.store.getOperationLog(workbook_id);
    return createHash("sha256").update(JSON.stringify(log), "utf8").digest("hex");
  }

  listProjects() {
    return this.store.listProjects();
  }

  /**
   * SPEC-UID §14: O(1) cross-workbook lookup by uid.
   *
   * Returns the index entry (`workbook_id`, `kind`, `id`) for the given
   * uid, or `null` if no artifact with that uid is loaded. Callers that
   * need the actual instance can chain `getProject(entry.workbook_id)`
   * and dereference by the returned `id`.
   */
  lookupUid(uid: string): { workbook_id: string; kind: "primitive" | "relation"; id: string } | null {
    return this.store.lookupUid(uid);
  }

  /** Resolve a primitive by uid; throws not_found if absent. */
  resolvePrimitiveByUid(uid: string): { workbook_id: string; primitive: PrimitiveInstance } {
    const entry = this.lookupUid(uid);
    if (!entry || entry.kind !== "primitive")
      throw new FDPMException("not_found", `primitive not found by uid: ${uid}`);
    const slice = this.getProject(entry.workbook_id);
    const prim = slice.primitives[entry.id];
    if (!prim)
      throw new FDPMException("internal", "uid_index drift: primitive missing", {
        evidence: { uid, ...entry },
      });
    return { workbook_id: entry.workbook_id, primitive: prim };
  }

  /** Resolve a relation by uid; throws not_found if absent. */
  resolveRelationByUid(uid: string): { workbook_id: string; relation: RelationInstance } {
    const entry = this.lookupUid(uid);
    if (!entry || entry.kind !== "relation")
      throw new FDPMException("not_found", `relation not found by uid: ${uid}`);
    const slice = this.getProject(entry.workbook_id);
    const rel = slice.relations[entry.id];
    if (!rel)
      throw new FDPMException("internal", "uid_index drift: relation missing", {
        evidence: { uid, ...entry },
      });
    return { workbook_id: entry.workbook_id, relation: rel };
  }

  /**
   * Migrate legacy `field_values._metadata.*` keys onto top-level
   * `field_values.*` for every relation in a workbook.
   *
   * Rationale: an earlier version of the importer wrote relation
   * field-values under a nested `_metadata` envelope, but the validator
   * (and the relation type schema) expects them at the top level. The
   * mismatch makes imported data uneditable through the validation gate
   * (see #7 in the operator-feedback list). This is an explicit,
   * opt-in normalisation: it does NOT run automatically on import, and
   * each rewrite is logged as a normal `relation.replace` op so the
   * change is auditable and reversible via `log undo`.
   *
   * Returns the per-relation outcome (no-op, normalised, or error).
   */
  async migrateNormalizeMetadata(
    workbook_id: string,
    opts?: { dryRun?: boolean },
  ): Promise<{
    workbook_id: string;
    dry_run: boolean;
    inspected: number;
    normalised: string[];
    skipped: string[];
    errors: Array<{ id: string; message: string }>;
  }> {
    const slice = this.store.getProject(workbook_id);
    const relations = Object.values(slice.relations);
    const normalised: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ id: string; message: string }> = [];

    // First pass: classify each relation as normalisable or skip-able and
    // build the rewritten field_values. This is pure (no side effects)
    // so the dry-run path returns the exact same classification the apply
    // path will see.
    type Plan = { id: string; type_id: string; field_values: Record<string, unknown> };
    const plans: Plan[] = [];
    for (const r of relations) {
      const meta = r.field_values["_metadata"];
      if (
        meta === undefined ||
        meta === null ||
        typeof meta !== "object" ||
        Array.isArray(meta)
      ) {
        skipped.push(r.id);
        continue;
      }
      const lifted: Record<string, unknown> = { ...r.field_values };
      delete lifted["_metadata"];
      for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
        if (k in lifted) continue; // preserve already-present top-level value
        lifted[k] = v;
      }
      plans.push({ id: r.id, type_id: r.type_id, field_values: lifted });
    }

    if (opts?.dryRun === true) {
      for (const p of plans) normalised.push(p.id);
      return {
        workbook_id,
        dry_run: true,
        inspected: relations.length,
        normalised,
        skipped,
        errors,
      };
    }

    // Apply atomically via batchEdit so either all relations migrate or
    // none do. The store-level `appendBatch` rolls back the whole
    // transaction on first failure, leaving the projection unchanged.
    if (plans.length > 0) {
      const { batchEdit } = await import("./host-extra.js");
      try {
        await batchEdit(
          this,
          workbook_id,
          plans.map((p) => ({
            kind: "relation.replace" as const,
            payload: { id: p.id, type_id: p.type_id, field_values: p.field_values },
          })),
        );
        for (const p of plans) normalised.push(p.id);
      } catch (err) {
        // Whole batch rolled back; report the failure against the batch
        // (not against a specific id, because the failing op's index may
        // not be surfaced through the FDPMException).
        errors.push({ id: "<batch>", message: (err as Error).message });
      }
    }

    return {
      workbook_id,
      dry_run: false,
      inspected: relations.length,
      normalised,
      skipped,
      errors,
    };
  }

  /**
   * Diff between two revisions of a workbook (or two distinct workbooks).
   *
   * Returns the set of primitive/relation IDs added, removed, or modified.
   * For modified entries, lists the top-level field paths whose values
   * differ. Read-only; uses the time-travel `getProjectAt` API and so
   * works only on workbooks whose log is fully replayable.
   *
   * `from` / `to` may be either revision numbers (compared against the
   * same workbook) or another workbook id (cross-workbook diff). When both
   * are revisions, omitting `to` means "current".
   */
  diffProject(input: {
    workbook_id: string;
    from: { revision: number } | { workbook_id: string };
    to?: { revision: number } | { workbook_id: string };
    detail?: boolean;
  }): {
    workbook_id: string;
    from: { workbook_id: string; revision: number };
    to: { workbook_id: string; revision: number };
    primitives: {
      added: string[];
      removed: string[];
      modified: Array<{
        id: string;
        changed_fields: string[];
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      }>;
    };
    relations: {
      added: string[];
      removed: string[];
      modified: Array<{
        id: string;
        changed_fields: string[];
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      }>;
    };
  } {
    // Defensive runtime check — TypeScript requires `from`, but JS
    // callers (and the CLI's option parsing) can pass undefined. Without
    // this, diff(p, {from:undef, to:undef}) compares current to current
    // and silently returns an empty diff, which is misleading.
    if (input.from === undefined) {
      throw new FDPMException(
        "verification",
        "diffProject requires a `from` side (revision or workbook_id)",
      );
    }
    // Capture current revision once so we can validate that requested
    // revisions are not in the future. Without this, getProjectAt
    // silently returns the current state for any revision >= current,
    // making "diff from=999999" appear as zero changes — confusingly
    // wrong rather than honestly wrong.
    const current = this.store.getProject(input.workbook_id);
    const resolveSide = (
      side: { revision: number } | { workbook_id: string } | undefined,
      sideName: "from" | "to",
    ): ProjectStateSlice => {
      if (side === undefined) return current;
      if ("revision" in side) {
        if (side.revision > current.workbook.revision) {
          throw new FDPMException(
            "not_found",
            `${sideName} revision ${side.revision} is past current ${current.workbook.revision} for workbook ${input.workbook_id}`,
          );
        }
        return this.store.getProjectAt(input.workbook_id, side.revision);
      }
      return this.store.getProject(side.workbook_id);
    };
    const a = resolveSide(input.from, "from");
    const b = resolveSide(input.to, "to");
    const detail = input.detail === true;

    const diffMap = <T extends { id: string; field_values: Record<string, unknown> }>(
      left: Record<string, T>,
      right: Record<string, T>,
    ) => {
      const added: string[] = [];
      const removed: string[] = [];
      const modified: Array<{
        id: string;
        changed_fields: string[];
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      }> = [];
      for (const id of Object.keys(right)) {
        if (!(id in left)) added.push(id);
        else {
          const changed: string[] = [];
          const lf = left[id]!.field_values;
          const rf = right[id]!.field_values;
          const keys = new Set([...Object.keys(lf), ...Object.keys(rf)]);
          for (const k of keys) {
            if (JSON.stringify(lf[k]) !== JSON.stringify(rf[k])) changed.push(k);
          }
          if (changed.length > 0) {
            const entry: {
              id: string;
              changed_fields: string[];
              before?: Record<string, unknown>;
              after?: Record<string, unknown>;
            } = { id, changed_fields: changed.sort() };
            if (detail) {
              const before: Record<string, unknown> = {};
              const after: Record<string, unknown> = {};
              for (const k of changed) {
                before[k] = lf[k];
                after[k] = rf[k];
              }
              entry.before = before;
              entry.after = after;
            }
            modified.push(entry);
          }
        }
      }
      for (const id of Object.keys(left)) {
        if (!(id in right)) removed.push(id);
      }
      return { added: added.sort(), removed: removed.sort(), modified };
    };

    return {
      workbook_id: input.workbook_id,
      from: { workbook_id: a.workbook.id, revision: a.workbook.revision },
      to: { workbook_id: b.workbook.id, revision: b.workbook.revision },
      primitives: diffMap(a.primitives, b.primitives),
      relations: diffMap(a.relations, b.relations),
    };
  }

  /**
   * Substring/regex search across primitives — read-only.
   *
   * Filter dimensions are AND-combined; multiple `fieldMatch` entries
   * are also AND-combined. The match for `fieldMatch` walks the full
   * `field_values` JSON of each candidate (case-insensitive substring
   * by default; `regex: true` switches to regex). This is sufficient for
   * the "find me the primitive whose name approximately matches X"
   * workflow; it is not a full query language.
   */
  searchPrimitives(
    workbook_id: string,
    filter?: {
      typeId?: string;
      idLike?: string;
      idRegex?: RegExp;
      fieldMatch?: ReadonlyArray<{ path?: string; needle: string; regex?: boolean }>;
    },
  ): PrimitiveInstance[] {
    const slice = this.store.getProject(workbook_id);
    return Object.values(slice.primitives).filter((p) =>
      matchesPrimitive(p, filter ?? {}),
    );
  }

  /** Same as `searchPrimitives` but for relations; adds source/target filters. */
  searchRelations(
    workbook_id: string,
    filter?: {
      typeId?: string;
      idLike?: string;
      idRegex?: RegExp;
      sourceId?: string;
      targetId?: string;
      fieldMatch?: ReadonlyArray<{ path?: string; needle: string; regex?: boolean }>;
    },
  ): RelationInstance[] {
    const slice = this.store.getProject(workbook_id);
    return Object.values(slice.relations).filter((r) =>
      matchesRelation(r, filter ?? {}),
    );
  }

  /**
   * Workbook-wide validation pass — read-only.
   *
   * Runs the same `runPrimitive` / `runRelation` validators that gate
   * writes, but against the *current* projection without any proposed
   * change. Returns every finding from every primitive and relation,
   * grouped. Used by `fdpm validate`; also a building block for
   * `--dry-run` and for surfacing pre-existing violations that block
   * later edits (the symptom that motivated touched-paths field-patch).
   *
   * Filters:
   *   - `targetIds`: restrict to specific primitive/relation IDs.
   *   - `ruleIds`: restrict to findings whose `rule_id` matches.
   *   - `minLevel`: drop findings below the given severity. With
   *     `minLevel: "warning"`, schema-drift warnings (extra fields, see
   *     #10) surface; with `minLevel: "error"` only blocking findings do.
   */
  validateProject(
    workbook_id: string,
    opts?: {
      targetIds?: ReadonlySet<string>;
      ruleIds?: ReadonlySet<string>;
      minLevel?: "info" | "warning" | "error";
    },
  ): {
    workbook_id: string;
    revision: number;
    summary: { errors: number; warnings: number; info: number };
    primitives: ValidationReport[];
    relations: ValidationReport[];
  } {
    const slice = this.store.getProject(workbook_id);
    const profile = this.profiles.getResolved(slice.workbook.profile_id);
    const ctx = this.validationContext(workbook_id);
    const prims = new Map(Object.entries(slice.primitives));

    const minRank = LEVEL_RANK[opts?.minLevel ?? "info"] ?? LEVEL_RANK.info!;
    const filterFindings = (r: ValidationReport): ValidationReport => {
      const kept = r.findings.filter((f) => {
        if (opts?.ruleIds && !opts.ruleIds.has(f.rule_id)) return false;
        const rank = LEVEL_RANK[f.level] ?? LEVEL_RANK.info!;
        if (rank < minRank) return false;
        return true;
      });
      return { ...r, findings: kept, accepted: kept.every((f) => f.level !== "error") };
    };

    const primitiveReports: ValidationReport[] = [];
    for (const p of Object.values(slice.primitives)) {
      if (opts?.targetIds && !opts.targetIds.has(p.id)) continue;
      const r = filterFindings(this.pipeline.runPrimitive(p, profile, ctx));
      if (r.findings.length > 0) primitiveReports.push(r);
    }

    const relationReports: ValidationReport[] = [];
    for (const r of Object.values(slice.relations)) {
      if (opts?.targetIds && !opts.targetIds.has(r.id)) continue;
      const rep = filterFindings(this.pipeline.runRelation(r, profile, prims, ctx));
      if (rep.findings.length > 0) relationReports.push(rep);
    }

    let errors = 0;
    let warnings = 0;
    let info = 0;
    for (const rep of [...primitiveReports, ...relationReports]) {
      for (const f of rep.findings) {
        if (f.level === "error") errors++;
        else if (f.level === "warning") warnings++;
        else info++;
      }
    }

    return {
      workbook_id,
      revision: slice.workbook.revision,
      summary: { errors, warnings, info },
      primitives: primitiveReports,
      relations: relationReports,
    };
  }
}

const LEVEL_RANK: Record<string, number> = {
  info: 10,
  warning: 20,
  error: 30,
};

/**
 * Shared matcher used by `searchPrimitives` and `searchRelations`. The
 * `fieldMatch` form intentionally serialises `field_values` to JSON for
 * the substring/regex check rather than implementing a path mini-language;
 * the operator workflow is "find the primitive whose name contains X",
 * not "evaluate a structured query." When `path` is set we narrow the
 * haystack to that top-level key's value (still serialised); when omitted
 * the whole `field_values` is searched.
 */
interface SearchFilter {
  typeId?: string;
  idLike?: string;
  idRegex?: RegExp;
  fieldMatch?: ReadonlyArray<{ path?: string; needle: string; regex?: boolean }>;
}

function matchesIdAndType(
  id: string,
  type_id: string,
  field_values: Record<string, unknown>,
  filter: SearchFilter,
): boolean {
  if (filter.typeId !== undefined && type_id !== filter.typeId) return false;
  if (filter.idLike !== undefined && !id.toLowerCase().includes(filter.idLike.toLowerCase()))
    return false;
  if (filter.idRegex !== undefined && !filter.idRegex.test(id)) return false;
  if (filter.fieldMatch !== undefined) {
    for (const fm of filter.fieldMatch) {
      const haystack = haystackFor(field_values, fm.path);
      if (fm.regex) {
        // Compile per-call (filter is opaque to the host; we accept the
        // O(n*m) cost for the convenience). Invalid pattern surfaces as
        // a typed FDPMException so CLI/API callers see a categorised
        // error, not a SyntaxError stack trace.
        let re: RegExp;
        try {
          re = new RegExp(fm.needle, "i");
        } catch (err) {
          throw new FDPMException(
            "verification",
            `fieldMatch regex "${fm.needle}" is invalid: ${(err as Error).message}`,
          );
        }
        if (!re.test(haystack)) return false;
      } else {
        if (!haystack.toLowerCase().includes(fm.needle.toLowerCase())) return false;
      }
    }
  }
  return true;
}

/**
 * Build the search haystack for a field-match. When `path` is set and
 * resolves to a scalar string, return the raw string (so anchored regex
 * patterns like `^Audit` work intuitively). Otherwise serialise to JSON
 * — sufficient for "does the JSON contain this needle anywhere" without
 * implementing a path mini-language for nested matching.
 */
function haystackFor(
  field_values: Record<string, unknown>,
  path: string | undefined,
): string {
  if (path === undefined) return JSON.stringify(field_values);
  const v = field_values[path];
  if (typeof v === "string") return v;
  return JSON.stringify(v ?? null);
}

function matchesPrimitive(p: PrimitiveInstance, filter: SearchFilter): boolean {
  return matchesIdAndType(p.id, p.type_id, p.field_values, filter);
}

function matchesRelation(
  r: RelationInstance,
  filter: SearchFilter & { sourceId?: string; targetId?: string },
): boolean {
  if (filter.sourceId !== undefined && r.source_id !== filter.sourceId) return false;
  if (filter.targetId !== undefined && r.target_id !== filter.targetId) return false;
  return matchesIdAndType(r.id, r.type_id, r.field_values, filter);
}

function defaultDir(): string {
  return defaultDataDir();
}
