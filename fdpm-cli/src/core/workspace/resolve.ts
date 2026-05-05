/**
 * SPEC-WORKSPACE §8.3 / §15: data-dir precedence resolution.
 *
 * Order (first match wins):
 *   1. Explicit CLI `--data-dir <path>`
 *   2. `$FDPM_DATA_DIR`
 *   3. `$FDPM_WORKSPACE` resolved against the registry (by id or name)
 *   4. Registry `current` entry's path
 *   5. `defaultDataDir()` (legacy `~/.fdpm-cli`)
 *
 * Returns `null` to mean "no resolution; let downstream fall back to
 * the default data dir" — this is distinct from "user explicitly asked
 * for no persistence" which is handled by `--no-persist`.
 *
 * Lookup failures (FDPM_WORKSPACE points at an unknown name/id, or
 * `current` references a deleted workspace) surface as `not_found`. We
 * deliberately fail loudly here rather than silently fall through to
 * the legacy default, since a misconfigured FDPM_WORKSPACE almost
 * certainly means the operator wanted a specific workspace.
 */
import { FDPMException } from "../errors/fdpm-exception.js";
import { findById, findByName, readRegistry } from "./registry.js";

export interface ResolveInput {
  /** From `--data-dir <path>`. Absent when the flag is not present. */
  cliDataDir?: string | undefined;
  /** Defaults to `process.env`; injected for tests. */
  env?: NodeJS.ProcessEnv;
  /** Override for the registry path; used by tests. */
  registryPath?: string;
}

export interface ResolveResult {
  /** Resolved data directory path, or `null` if none of the inputs matched. */
  dataDir: string | null;
  /** Which precedence rule fired. */
  source: "cli" | "env_data_dir" | "env_workspace" | "registry_current" | "default";
}

export async function resolveWorkspaceDataDir(input: ResolveInput = {}): Promise<ResolveResult> {
  const env = input.env ?? process.env;

  if (input.cliDataDir) {
    return { dataDir: input.cliDataDir, source: "cli" };
  }
  if (env["FDPM_DATA_DIR"]) {
    return { dataDir: env["FDPM_DATA_DIR"], source: "env_data_dir" };
  }

  const wsName = env["FDPM_WORKSPACE"];
  if (wsName) {
    const registry = await readRegistry(input.registryPath);
    const entry = findById(registry, wsName) ?? findByName(registry, wsName);
    if (!entry) {
      throw new FDPMException(
        "not_found",
        `workspace not found in registry: ${wsName}`,
        {
          evidence: {
            lookup: wsName,
            registry_size: registry.workspaces.length,
            source: "FDPM_WORKSPACE",
          },
        },
      );
    }
    return { dataDir: entry.path, source: "env_workspace" };
  }

  const registry = await readRegistry(input.registryPath);
  if (registry.current) {
    const entry = findById(registry, registry.current);
    if (!entry) {
      throw new FDPMException(
        "not_found",
        `workspace not found in registry: ${registry.current}`,
        { evidence: { current: registry.current, source: "registry.current" } },
      );
    }
    return { dataDir: entry.path, source: "registry_current" };
  }

  return { dataDir: null, source: "default" };
}
