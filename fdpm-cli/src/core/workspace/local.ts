/**
 * LocalWorkspace — SPEC-WORKSPACE §10 implementation backed by the local
 * filesystem and `JsonlLogStore`.
 *
 * Owns: workspace.json identity (read/auto-mint/write) and registry
 * upsert. Delegates: every persistence call to JsonlLogStore.
 *
 * Does NOT own: Store, ProfileRegistry, PluginRuntime. Those live on
 * Host; LocalWorkspace exposes them through the Workspace interface so
 * Host can pass `host.workspace` to consumers that previously held
 * `host` itself.
 */
import { promises as fs, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Operation } from "../operations/operation.js";
import type { Store } from "../store/store.js";
import type { ProfileRegistry } from "../profile/registry.js";
import type { PluginRuntime } from "../../plugin/runtime.js";
import { JsonlLogStore } from "../../persistence/jsonl-log.js";
import { mintUid } from "../identity/uid.js";
import { HOST_VERSION, SPEC_CORE_VERSION } from "../version/spec.js";
import { emitHostWarning } from "../diagnostics/warnings.js";
import { FDPMException } from "../errors/fdpm-exception.js";
import {
  defaultRegistryPath,
  readRegistry,
  uniqueName,
  upsertEntry,
  writeRegistry,
} from "./registry.js";
import {
  SPEC_WORKSPACE_VERSION,
  WorkspaceIdentity,
  type Workspace,
} from "./types.js";
import {
  backupWorkspace,
  type BackupOptions,
  type BackupResult,
} from "./backup.js";
import {
  restoreWorkspace,
  type RestoreOptions,
  type RestoreResult,
} from "./restore.js";

function workspaceJsonPath(dataDir: string): string {
  return join(dataDir, "workspace.json");
}

async function writeIdentity(dataDir: string, identity: WorkspaceIdentity): Promise<void> {
  const path = workspaceJsonPath(dataDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(identity, null, 2) + "\n", "utf8");
  await fs.rename(tmp, path);
}

/**
 * Read identity from disk if present. Returns null on ENOENT (caller
 * decides whether to auto-mint). Throws `verification` on parse / schema
 * failure — corrupt workspace.json is not the same as a missing one.
 */
async function readIdentity(dataDir: string): Promise<WorkspaceIdentity | null> {
  const path = workspaceJsonPath(dataDir);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(path, "utf8"));
  } catch (err) {
    throw new FDPMException(
      "verification",
      `workspace.json at ${path} is not valid JSON`,
      {
        evidence: {
          path,
          parse_error: (err as Error).message,
          reason: "workspace_json_invalid",
        },
      },
    );
  }
  const result = WorkspaceIdentity.safeParse(parsed);
  if (!result.success) {
    throw new FDPMException(
      "verification",
      `workspace.json at ${path} failed schema validation`,
      {
        evidence: {
          path,
          issues: result.error.issues,
          reason: "workspace_json_invalid",
        },
      },
    );
  }
  return result.data;
}

/** SPEC-WORKSPACE §15 auto-mint: id, name (basename), _minted=true. */
function mintIdentity(dataDir: string, registryName: string): WorkspaceIdentity {
  return {
    spec_workspace: SPEC_WORKSPACE_VERSION,
    id: mintUid(),
    name: registryName,
    created_at: new Date().toISOString(),
    created_by_host_version: HOST_VERSION,
    spec_core_version: SPEC_CORE_VERSION,
    description: "Auto-minted from pre-workspace data dir.",
    _minted: true,
  };
}

/**
 * One-process-one-warning latch for auto-mint notices. Multiple Hosts
 * within the same process pointing at the same dataDir don't double-warn.
 */
const mintedWarned = new Set<string>();

export interface LocalWorkspaceOpenOptions {
  /** Optional override; defaults to `defaultRegistryPath()`. */
  registryPath?: string;
  /** When false, auto-mint runs silently (used by tests / one-shots). */
  emitWarnings?: boolean;
}

export class LocalWorkspace implements Workspace {
  readonly id: string;
  name: string;
  readonly path: string;
  private identity: WorkspaceIdentity;
  private readonly persistence: JsonlLogStore;

  /**
   * Construct from already-resolved identity. Public callers should use
   * `LocalWorkspace.open()` which handles auto-mint and registry upsert.
   */
  private constructor(
    dataDir: string,
    identity: WorkspaceIdentity,
    persistence: JsonlLogStore,
    private readonly store: Store,
    private readonly profiles: ProfileRegistry,
    private readonly plugins: PluginRuntime,
  ) {
    this.path = dataDir;
    this.identity = identity;
    this.id = identity.id;
    this.name = identity.name;
    this.persistence = persistence;
  }

  /**
   * Open (or auto-mint) the LocalWorkspace at `dataDir`. Caller passes
   * Host-owned Store / ProfileRegistry / PluginRuntime so the Workspace
   * can expose them through the interface.
   */
  static async open(
    dataDir: string,
    deps: { store: Store; profiles: ProfileRegistry; plugins: PluginRuntime },
    opts: LocalWorkspaceOpenOptions = {},
  ): Promise<LocalWorkspace> {
    const persistence = new JsonlLogStore(dataDir);
    persistence.init();

    let identity = await readIdentity(dataDir);
    let didMint = false;

    if (!identity) {
      const registryPath = opts.registryPath ?? defaultRegistryPath();
      const registry = await readRegistry(registryPath);
      const baseName = basename(dataDir) || "unnamed-workspace";
      const name = uniqueName(registry, baseName);
      identity = mintIdentity(dataDir, name);
      await writeIdentity(dataDir, identity);
      didMint = true;
      if (opts.emitWarnings !== false && !mintedWarned.has(dataDir)) {
        mintedWarned.add(dataDir);
        emitHostWarning({
          code: "workspace.auto_minted",
          message: `auto-minted workspace identity for ${dataDir}; use 'fdpm workspace rename' to set a friendly name`,
          evidence: { path: dataDir, id: identity.id, name: identity.name },
        });
      }
    }

    const ws = new LocalWorkspace(
      dataDir,
      identity,
      persistence,
      deps.store,
      deps.profiles,
      deps.plugins,
    );
    await ws.upsertSelfInRegistry(opts.registryPath ?? defaultRegistryPath(), { didMint });
    return ws;
  }

  /**
   * Best-effort registry upsert. Registry corruption / IO errors degrade
   * to a warning — the Host MUST stay usable even if XDG_STATE_HOME is
   * read-only or the registry is missing/malformed (Principle 4: never
   * crash the host on operator-state issues we can recover from).
   */
  private async upsertSelfInRegistry(registryPath: string, _ctx: { didMint: boolean }): Promise<void> {
    try {
      const registry = await readRegistry(registryPath);
      const next = upsertEntry(registry, {
        id: this.identity.id,
        name: this.identity.name,
        path: this.path,
      });
      await writeRegistry(next, registryPath);
    } catch (err) {
      emitHostWarning({
        code: "workspace.registry_unavailable",
        message: `workspace registry upsert skipped: ${(err as Error).message}`,
        evidence: { path: registryPath, error: (err as Error).message },
      });
    }
  }

  getIdentity(): WorkspaceIdentity {
    return this.identity;
  }
  getStore(): Store {
    return this.store;
  }
  getProfileRegistry(): ProfileRegistry {
    return this.profiles;
  }
  getPluginRuntime(): PluginRuntime {
    return this.plugins;
  }

  /** Direct access for the small surface that legitimately needs raw persistence (Host.load profile reads, REPL freshness). */
  getPersistence(): JsonlLogStore {
    return this.persistence;
  }

  async appendOp(_project_id: string, op: Operation): Promise<void> {
    await this.persistence.appendOp(op);
  }

  async getOperationLog(project_id: string): Promise<Operation[]> {
    return this.persistence.readLog(project_id);
  }

  statProjectLog(project_id: string): { mtime_ns: bigint; size: bigint } | null {
    return this.persistence.statProjectLog(project_id);
  }

  async listProjects(): Promise<string[]> {
    return this.persistence.listProjectIds();
  }

  /**
   * SPEC-WORKSPACE §13. Streams the data directory into a `.fdpmbak`
   * zip whose first entry is `backup-manifest.json`.
   */
  async backup(opts: BackupOptions): Promise<BackupResult> {
    const result = await backupWorkspace(this.path, this.identity, opts);
    // Best-effort registry update: record last_backup. Same Principle 4
    // tolerance as upsertSelfInRegistry — IO/permission issues degrade
    // to a warning, never a thrown.
    try {
      const registry = await readRegistry(defaultRegistryPath());
      const existing = registry.workspaces.find((w) => w.id === this.id);
      if (existing) {
        const next = upsertEntry(registry, {
          ...existing,
          last_backup: new Date().toISOString(),
        });
        await writeRegistry(next, defaultRegistryPath());
      }
    } catch (err) {
      emitHostWarning({
        code: "workspace.registry_unavailable",
        message: `last_backup registry update skipped: ${(err as Error).message}`,
        evidence: { path: this.path, error: (err as Error).message },
      });
    }
    return result;
  }

  /**
   * SPEC-WORKSPACE §14 static-equivalent. Independent of any
   * pre-existing LocalWorkspace instance because the target dir starts
   * empty (or non-existent).
   */
  static async restore(opts: RestoreOptions): Promise<RestoreResult> {
    return restoreWorkspace(opts);
  }

  /**
   * SPEC-WORKSPACE §16.3 — `fdpm workspace rename`. Mutates
   * workspace.json's `name` field, clears `_minted` if present, and
   * upserts the registry entry. Workspace_id is invariant.
   */
  async rename(newName: string, opts?: { registryPath?: string }): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      throw new FDPMException("verification", "workspace name cannot be empty");
    }
    const next: WorkspaceIdentity = {
      ...this.identity,
      name: trimmed,
    };
    if (next._minted) delete (next as { _minted?: boolean })._minted;
    await writeIdentity(this.path, next);
    this.identity = next;
    this.name = trimmed;
    const registryPath = opts?.registryPath ?? defaultRegistryPath();
    try {
      const registry = await readRegistry(registryPath);
      const updated = upsertEntry(registry, {
        id: next.id,
        name: trimmed,
        path: this.path,
      });
      await writeRegistry(updated, registryPath);
    } catch (err) {
      emitHostWarning({
        code: "workspace.registry_unavailable",
        message: `rename registry update skipped: ${(err as Error).message}`,
        evidence: { path: registryPath, error: (err as Error).message },
      });
    }
  }
}

/** Test hook: clears the auto-mint warning latch so per-test isolation holds. */
export function _resetAutoMintWarnings(): void {
  mintedWarned.clear();
}

/** Re-export for callers that still need the raw stat shape. */
export type { JsonlLogStore };

// Avoid unused-warning false positives on pure-typing imports above when the file is consumed via `tsc --noEmit`.
void statSync;
