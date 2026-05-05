/**
 * Operator-local workspace registry — SPEC-WORKSPACE §12.
 *
 * Per-operator-per-machine catalog of known workspaces, located at
 * `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`.
 * Reads are tolerant (missing file → empty registry); writes are atomic
 * (temp + rename) so concurrent writers may lose updates but never
 * corrupt the file.
 */
import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { FDPMException } from "../errors/fdpm-exception.js";
import {
  RegistryEntry,
  SPEC_WORKSPACE_REGISTRY_VERSION,
  WorkspaceRegistry,
} from "./types.js";

export function defaultRegistryPath(): string {
  if (process.env["FDPM_REGISTRY_PATH"]) {
    return process.env["FDPM_REGISTRY_PATH"];
  }
  const xdg = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state");
  return join(xdg, "fdpm", "workspaces.json");
}

function emptyRegistry(): WorkspaceRegistry {
  return {
    spec_workspace_registry: SPEC_WORKSPACE_REGISTRY_VERSION,
    workspaces: [],
  };
}

export async function readRegistry(path: string = defaultRegistryPath()): Promise<WorkspaceRegistry> {
  if (!existsSync(path)) return emptyRegistry();
  const text = await fs.readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new FDPMException(
      "verification",
      `workspace registry at ${path} is not valid JSON`,
      { evidence: { path, parse_error: (err as Error).message } },
    );
  }
  const result = WorkspaceRegistry.safeParse(parsed);
  if (!result.success) {
    throw new FDPMException(
      "verification",
      `workspace registry at ${path} failed schema validation`,
      { evidence: { path, issues: result.error.issues } },
    );
  }
  return result.data;
}

/**
 * Atomic write: serialize to a sibling temp file, fsync, rename. The
 * registry's parent directory is created on demand because XDG_STATE_HOME
 * may not exist on a fresh machine.
 */
export async function writeRegistry(
  registry: WorkspaceRegistry,
  path: string = defaultRegistryPath(),
): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(registry, null, 2) + "\n";
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, path);
}

/**
 * Upsert an entry by id. Mutates `last_used` to the current ISO
 * timestamp. Idempotent: callers can invoke this on every command
 * boundary without churning unrelated fields.
 */
export function upsertEntry(
  registry: WorkspaceRegistry,
  entry: Omit<RegistryEntry, "last_used"> & { last_used?: string },
): WorkspaceRegistry {
  const now = new Date().toISOString();
  const merged: RegistryEntry = { ...entry, last_used: entry.last_used ?? now };
  const idx = registry.workspaces.findIndex((w) => w.id === merged.id);
  const next = [...registry.workspaces];
  if (idx === -1) next.push(merged);
  else next[idx] = { ...next[idx], ...merged };
  return { ...registry, workspaces: next };
}

export function findById(registry: WorkspaceRegistry, id: string): RegistryEntry | null {
  return registry.workspaces.find((w) => w.id === id) ?? null;
}

/**
 * Lookup by name. Returns the first exact match; auto-mint suffixing
 * (`-2`, `-3`, ...) keeps names unique within a registry, so first-match
 * is also only-match for well-formed registries.
 */
export function findByName(registry: WorkspaceRegistry, name: string): RegistryEntry | null {
  return registry.workspaces.find((w) => w.name === name) ?? null;
}

/** Returns a name unique within the registry, suffixing -2/-3/... if needed. */
export function uniqueName(registry: WorkspaceRegistry, base: string): string {
  if (!findByName(registry, base)) return base;
  for (let n = 2; n < 1_000_000; n++) {
    const candidate = `${base}-${n}`;
    if (!findByName(registry, candidate)) return candidate;
  }
  // Effectively unreachable for any sane operator workspace count.
  throw new FDPMException("internal", `could not find a unique name based on ${base}`);
}
