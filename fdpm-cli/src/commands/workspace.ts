/**
 * `fdpm workspace` — SPEC-WORKSPACE §16 lifecycle commands.
 *
 * Subcommands (all read/write the registry and workspace.json; none
 * mutate project operation logs, so freshness gating treats them as
 * project-less):
 *
 *   init <path>         — mint a workspace at <path>
 *   list                — registry catalog
 *   info [name|id]      — current workspace identity (or named one)
 *   switch <name|id>    — set registry.current
 *   rename <old> <new>  — rename a workspace; clears _minted
 *   forget <name|id>    — drop the registry entry; data dir untouched
 *   backup              — emit a .fdpmbak for the current workspace
 *   restore <bundle>    — recreate a workspace from a .fdpmbak
 *   verify [name|id]    — Host.load() round-trip; reports replayability
 */
import { Command } from "commander";
import { promises as fs, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { Host } from "../core/host.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  defaultRegistryPath,
  findById,
  findByName,
  readRegistry,
  upsertEntry,
  writeRegistry,
} from "../core/workspace/registry.js";
import { LocalWorkspace } from "../core/workspace/local.js";
import {
  type CommandMetadataMap,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
} from "./metadata.js";
import { emit, type OutputContext } from "./util.js";

function resolveByLookup(
  registry: Awaited<ReturnType<typeof readRegistry>>,
  lookup: string,
): { id: string; name: string; path: string } {
  const entry = findById(registry, lookup) ?? findByName(registry, lookup);
  if (!entry) {
    throw new FDPMException(
      "not_found",
      `workspace not found in registry: ${lookup}`,
      { evidence: { lookup, registry_size: registry.workspaces.length } },
    );
  }
  return { id: entry.id, name: entry.name, path: entry.path };
}

export function buildWorkspaceCommand(host: Host): Command {
  const cmd = new Command("workspace");
  cmd.description("Workspace lifecycle (SPEC-WORKSPACE §16)");

  // ── init ──────────────────────────────────────────────────────────
  cmd
    .command("init")
    .description("Mint a workspace at <path> (or auto-mint at the active dataDir)")
    .option("--path <path>", "data directory; defaults to the active workspace's path")
    .option("--name <name>", "operator-friendly name; defaults to basename(path)")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const target = resolvePath(opts.path ?? host.workspace?.path ?? process.cwd());
      if (!existsSync(target)) await fs.mkdir(target, { recursive: true });
      const ws = await LocalWorkspace.open(target, {
        store: host.store,
        profiles: host.profiles,
        plugins: host.plugins,
      });
      if (opts.name && opts.name !== ws.name) await ws.rename(opts.name);
      const id = ws.getIdentity();
      emit(
        ctx,
        { ok: true, id: id.id, name: id.name, path: ws.path, minted: id._minted ?? false },
        () => `initialized workspace ${id.name} (${id.id}) at ${ws.path}`,
      );
    });

  // ── list ──────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List registered workspaces")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const registry = await readRegistry();
      emit(
        ctx,
        {
          current: registry.current ?? null,
          workspaces: registry.workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            path: w.path,
            current: w.id === registry.current,
            ...(w.last_used != null && { last_used: w.last_used }),
            ...(w.last_backup != null && { last_backup: w.last_backup }),
          })),
        },
        () => {
          if (registry.workspaces.length === 0) return "(no registered workspaces)";
          const lines: string[] = [];
          for (const w of registry.workspaces) {
            const marker = w.id === registry.current ? "*" : " ";
            lines.push(`${marker} ${w.name}  ${w.id}  ${w.path}`);
          }
          return lines.join("\n");
        },
      );
    });

  // ── info ──────────────────────────────────────────────────────────
  cmd
    .command("info")
    .argument("[lookup]", "workspace name or id; defaults to the active one")
    .description("Show identity for the active (or named) workspace")
    .option("--json", "emit JSON")
    .action(async (lookup, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      let identityPayload: Record<string, unknown>;
      if (lookup) {
        const registry = await readRegistry();
        const entry = resolveByLookup(registry, lookup);
        identityPayload = { id: entry.id, name: entry.name, path: entry.path };
      } else {
        if (!host.workspace) {
          throw new FDPMException(
            "not_found",
            "no active workspace; pass <lookup> or set FDPM_DATA_DIR / FDPM_WORKSPACE",
          );
        }
        identityPayload = {
          id: host.workspace.id,
          name: host.workspace.name,
          path: host.workspace.path,
          identity: host.workspace.getIdentity(),
        };
      }
      emit(ctx, identityPayload, () => JSON.stringify(identityPayload, null, 2));
    });

  // ── switch ────────────────────────────────────────────────────────
  cmd
    .command("switch")
    .argument("<lookup>", "workspace name or id")
    .description("Set registry.current — affects subsequent invocations")
    .option("--json", "emit JSON")
    .action(async (lookup, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const registry = await readRegistry();
      const entry = resolveByLookup(registry, lookup);
      const next = { ...registry, current: entry.id };
      await writeRegistry(next, defaultRegistryPath());
      emit(
        ctx,
        { ok: true, current: entry.id, name: entry.name, path: entry.path },
        () => `switched to ${entry.name} (${entry.id}) at ${entry.path}`,
      );
    });

  // ── rename ────────────────────────────────────────────────────────
  cmd
    .command("rename")
    .argument("<lookup>", "current workspace name or id")
    .argument("<newName>", "new name")
    .description("Rename a workspace; clears _minted if present")
    .option("--json", "emit JSON")
    .action(async (lookup, newName, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const registry = await readRegistry();
      const entry = resolveByLookup(registry, lookup);
      // Prefer mutating through LocalWorkspace.open against the entry's
      // path so workspace.json on disk is updated atomically alongside
      // the registry.
      const ws = await LocalWorkspace.open(entry.path, {
        store: host.store,
        profiles: host.profiles,
        plugins: host.plugins,
      });
      await ws.rename(newName);
      emit(
        ctx,
        { ok: true, id: entry.id, old_name: entry.name, new_name: newName },
        () => `renamed ${entry.name} -> ${newName}`,
      );
    });

  // ── forget ────────────────────────────────────────────────────────
  cmd
    .command("forget")
    .argument("<lookup>", "workspace name or id")
    .description("Drop the registry entry; data dir on disk is untouched")
    .option("--json", "emit JSON")
    .action(async (lookup, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const registry = await readRegistry();
      const entry = resolveByLookup(registry, lookup);
      const next = {
        ...registry,
        workspaces: registry.workspaces.filter((w) => w.id !== entry.id),
        ...(registry.current === entry.id ? { current: undefined } : {}),
      };
      await writeRegistry(next, defaultRegistryPath());
      emit(
        ctx,
        { ok: true, forgotten: entry.id, path: entry.path },
        () => `forgot ${entry.name} (${entry.id}); data dir at ${entry.path} unchanged`,
      );
    });

  // ── backup ────────────────────────────────────────────────────────
  cmd
    .command("backup")
    .description("Write a .fdpmbak bundle for the active workspace")
    .requiredOption("-o, --output <path>", "output path (use - for stdout)")
    .option("--force", "overwrite existing output file")
    .option("--compression-level <n>", "deflate level 0-9 (default 6)", parseDeflateLevel)
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (!host.workspace) {
        throw new FDPMException("not_found", "no active workspace to back up");
      }
      const ws = host.workspace as LocalWorkspace;
      const result = await ws.backup({
        output: opts.output,
        force: !!opts.force,
        ...(typeof opts.compressionLevel === "number" && {
          compressionLevel: opts.compressionLevel,
        }),
      });
      emit(
        ctx,
        {
          ok: true,
          output: result.output,
          bytes: result.bytes,
          files: result.manifest.files.length,
          projects: result.manifest.projects.length,
          profiles: result.manifest.profiles.length,
          workspace_id: result.manifest.workspace.id,
        },
        () =>
          `wrote ${result.output} (${result.bytes} bytes, ${result.manifest.files.length} entries)`,
      );
    });

  // ── restore ───────────────────────────────────────────────────────
  cmd
    .command("restore")
    .argument("<bundle>", ".fdpmbak path")
    .description("Recreate a workspace from a bundle")
    .requiredOption("--data-dir <path>", "target data dir for the restored workspace")
    .option("--force-overwrite", "replace existing workspace_id; replaces target dir")
    .option("--name <name>", "mint a fresh workspace_id and rename")
    .option("--skip-verify", "skip the post-restore Host.load() round-trip")
    .option("--json", "emit JSON")
    .action(async (bundle, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const result = await LocalWorkspace.restore({
        bundlePath: bundle,
        dataDir: resolvePath(opts.dataDir),
        ...(opts.forceOverwrite && { forceOverwrite: true }),
        ...(opts.name && { rename: opts.name }),
        ...(opts.skipVerify && { skipVerify: true }),
      });
      emit(
        ctx,
        {
          ok: true,
          data_dir: result.dataDir,
          workspace_id: result.identity.id,
          name: result.identity.name,
          reidentified: result.reidentified,
          files: result.manifest.files.length,
        },
        () =>
          `restored ${result.identity.name} (${result.identity.id}) at ${result.dataDir}` +
          (result.reidentified ? "; minted fresh id (--name)" : ""),
      );
    });

  // ── verify ────────────────────────────────────────────────────────
  cmd
    .command("verify")
    .argument("[lookup]", "workspace name or id; defaults to the active one")
    .description("Run Host.load() against the workspace to prove replayability")
    .option("--json", "emit JSON")
    .action(async (lookup, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const targetPath = await resolveTargetPath(host, lookup);
      const { Host } = await import("../core/host.js");
      const probe = new Host({ dataDir: targetPath, noPlugins: true });
      const t0 = Date.now();
      try {
        await probe.load();
      } catch (err) {
        if (err instanceof FDPMException) {
          throw new FDPMException(
            "host_compat",
            `workspace failed Host.load(): ${targetPath}`,
            {
              evidence: {
                target: targetPath,
                inner_category: err.category,
                inner_message: err.message,
                inner_evidence: err.evidence,
              },
              cause: err,
            },
          );
        }
        throw err;
      }
      const elapsed_ms = Date.now() - t0;
      const projects = (await probe.workspace?.listProjects()) ?? [];
      emit(
        ctx,
        {
          ok: true,
          target: targetPath,
          projects: projects.length,
          elapsed_ms,
        },
        () => `verified ${targetPath} (${projects.length} projects, ${elapsed_ms} ms)`,
      );
    });

  return cmd;
}

async function resolveTargetPath(host: Host, lookup?: string): Promise<string> {
  if (lookup) {
    const registry = await readRegistry();
    return resolveByLookup(registry, lookup).path;
  }
  if (!host.workspace) {
    throw new FDPMException(
      "not_found",
      "no active workspace; pass <lookup> or set FDPM_DATA_DIR / FDPM_WORKSPACE",
    );
  }
  return host.workspace.path ?? "";
}

function parseDeflateLevel(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 9) {
    throw new FDPMException(
      "verification",
      `--compression-level must be 0-9: ${value}`,
    );
  }
  return n;
}

/**
 * SPEC-REPL §10.2 metadata. None of the workspace subcommands touch
 * project logs, so the freshness gate has nothing to stat.
 */
export const commandMetadata: CommandMetadataMap = {
  "workspace init": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace list": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace info": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace switch": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace rename": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace forget": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace backup": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace restore": {
    readOnly: false,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
  "workspace verify": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};

// Suppress unused-import false positive for upsertEntry — kept exported
// from registry.ts for callers like LocalWorkspace.rename, but the
// workspace subcommand currently uses a direct construction for
// switch/forget. The import is preserved here as documentation of the
// dependency surface this file exercises.
void upsertEntry;
