/**
 * Workspace — first-class container for a single FDPM operator-state.
 *
 * SPEC-WORKSPACE §10 locks the interface a future RemoteWorkspace MUST
 * implement without breaking LocalWorkspace. Today's tree only ships
 * LocalWorkspace; this file holds the contract every implementation
 * keeps so the Host stays implementation-agnostic.
 */
import { z } from "zod";
import type { Operation } from "../operations/operation.js";
import type { Store } from "../store/store.js";
import type { ProfileRegistry } from "../profile/registry.js";
import type { PluginRuntime } from "../../plugin/runtime.js";

/** Current SPEC-WORKSPACE schema version this code reads/writes. */
export const SPEC_WORKSPACE_VERSION = "1.0" as const;
/** Current registry schema version this code reads/writes. */
export const SPEC_WORKSPACE_REGISTRY_VERSION = "1.0" as const;

/**
 * SPEC-WORKSPACE §11 workspace.json schema. Unknown fields rejected at
 * parse time — typos surface as `verification` errors with a clear
 * `evidence.field_path`, not silent drops.
 */
export const WorkspaceIdentity = z
  .object({
    spec_workspace: z.literal(SPEC_WORKSPACE_VERSION),
    id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "id must be a ULID"),
    name: z.string().min(1),
    created_at: z.string().datetime({ offset: false }),
    created_by_host_version: z.string().min(1),
    spec_core_version: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    /** Present iff auto-minted; cleared on first rename. */
    _minted: z.boolean().optional(),
  })
  .strict();

export type WorkspaceIdentity = z.infer<typeof WorkspaceIdentity>;

/**
 * SPEC-WORKSPACE §12 workspace registry schema.
 *
 * `current` is the operator-selected default workspace_id, used when
 * neither FDPM_DATA_DIR nor FDPM_WORKSPACE is set. `workspaces[]` is
 * the operator-local catalog with last-seen path per id.
 */
export const RegistryEntry = z
  .object({
    id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    name: z.string().min(1),
    path: z.string().min(1),
    last_used: z.string().datetime({ offset: false }).optional(),
    last_backup: z.string().datetime({ offset: false }).optional(),
  })
  .strict();
export type RegistryEntry = z.infer<typeof RegistryEntry>;

export const WorkspaceRegistry = z
  .object({
    spec_workspace_registry: z.literal(SPEC_WORKSPACE_REGISTRY_VERSION),
    current: z.string().optional(),
    workspaces: z.array(RegistryEntry),
  })
  .strict();
export type WorkspaceRegistry = z.infer<typeof WorkspaceRegistry>;

/**
 * SPEC-WORKSPACE §10 — the cross-implementation interface. Host holds
 * a `Workspace`, never a concrete LocalWorkspace.
 */
export interface Workspace {
  /** Stable ULID minted at init. Immutable for the workspace's lifetime. */
  readonly id: string;
  /** Operator-chosen friendly name. Mutable via `fdpm workspace rename`. */
  name: string;
  /** Local-only filesystem path. Future RemoteWorkspace returns null. */
  readonly path: string | null;

  getIdentity(): WorkspaceIdentity;
  getStore(): Store;
  getProfileRegistry(): ProfileRegistry;
  getPluginRuntime(): PluginRuntime;

  appendOp(project_id: string, op: Operation): Promise<void>;
  getOperationLog(project_id: string): Promise<Operation[]>;
  /** SPEC-REPL §10.2 freshness key. Sync; safe per-command. */
  statProjectLog(project_id: string): { mtime_ns: bigint; size: bigint } | null;
  listProjects(): Promise<string[]>;
}
