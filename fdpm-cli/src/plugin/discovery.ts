import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseManifest } from "./manifest.js";
import type { PluginEntryModule, PluginSource } from "./types.js";
import { PluginError } from "./errors.js";

/**
 * §6.3 Discovery — two sources, evaluated in order:
 *  1. Built-in plugins shipped in-tree under `cli/plugins/<id>/`.
 *  2. Filesystem fallback under `$FDPM_PLUGIN_PATH` (platform-delimited;
 *     default `~/.fdpm/plugins`).
 *
 * The Python entry-points source from the SPEC (§6.3 (1)) is N/A for a
 * Node CLI; the in-tree built-in directory plays the same role here.
 *
 * Built-in discovery is CWD-independent: we probe both the legacy
 * CWD-relative paths (`cli/plugins`, `plugins`) AND a path resolved
 * against this module's own filesystem location. The latter handles
 * the common operator case where `fdpm` is invoked from any working
 * directory — without it, plugins silently fail to load and surface
 * as "no importer registered" / "unknown profile" downstream errors.
 */

const __dirname_local = dirname(fileURLToPath(import.meta.url));

/**
 * Path resolved against this file's filesystem location.
 *
 * Dev (tsx):    src/plugin/discovery.ts → "../../plugins" = cli/plugins ✓
 * Built (tsc):  dist/src/plugin/discovery.js → "../../plugins" = dist/plugins ✓
 *
 * The `npm run copy-plugin-assets` step in `package.json` populates
 * `dist/plugins/` with each plugin's `fdpm-plugin.json` and any non-TS
 * assets, alongside the `tsc`-compiled `index.js`, so the resolved
 * directory always contains complete, loadable plugins.
 */
const SELF_RELATIVE_PLUGINS = resolve(__dirname_local, "..", "..", "plugins");

/**
 * Built-in plugin discovery paths. Only the self-relative path is included:
 * the CLI must work from any CWD, and CWD-relative fallbacks (`cli/plugins`,
 * `plugins`) cause non-determinism — when invoked near a half-built source
 * tree they pick up `index.ts` files whose `.js` import suffixes can't be
 * resolved by the runtime, masking the failure as "unknown profile" later.
 *
 * The build step (`npm run copy-plugin-assets`) ensures `fdpm-plugin.json`
 * and any non-TS plugin assets are copied into `dist/plugins/<id>/` next to
 * the compiled `index.js`, so the self-relative path always finds a
 * complete, loadable plugin.
 */
export const BUILTIN_PLUGIN_DIRS_DEFAULT = [SELF_RELATIVE_PLUGINS];

export interface DiscoveredPlugin {
  source: PluginSource;
  rawManifest: unknown;
  manifestPath: string;
}

export async function discoverPlugins(opts?: {
  builtinDirs?: string[];
  pluginPaths?: string[];
  cwd?: string;
}): Promise<DiscoveredPlugin[]> {
  const cwd = opts?.cwd ?? process.cwd();
  const builtinDirs = (opts?.builtinDirs ?? BUILTIN_PLUGIN_DIRS_DEFAULT).map(
    (d) => (isAbsolute(d) ? d : resolve(cwd, d)),
  );
  const pluginPaths = opts?.pluginPaths ?? defaultPluginPaths();

  const out: DiscoveredPlugin[] = [];
  // Built-ins
  for (const dir of builtinDirs) {
    if (!existsSync(dir)) continue;
    out.push(...(await scanDir(dir, true)));
  }
  // Filesystem
  for (const dir of pluginPaths) {
    if (!existsSync(dir)) continue;
    out.push(...(await scanDir(dir, false)));
  }
  return out;
}

async function scanDir(dir: string, builtin: boolean): Promise<DiscoveredPlugin[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: DiscoveredPlugin[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const root = join(dir, ent.name);
    const manifestPath = join(root, "fdpm-plugin.json");
    if (!existsSync(manifestPath)) continue;
    const text = await fs.readFile(manifestPath, "utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new PluginError("manifest", `invalid JSON at ${manifestPath}`, {
        evidence: { error: (err as Error).message },
      });
    }
    out.push({
      source: { kind: "filesystem", root, manifestPath, ...(builtin && { builtin: true }) },
      rawManifest: raw,
      manifestPath,
    });
  }
  return out;
}

export function defaultPluginPaths(): string[] {
  const env = process.env["FDPM_PLUGIN_PATH"];
  if (env) return parsePluginPathList(env);
  return [join(homedir(), ".fdpm", "plugins")];
}

/**
 * Parse a PATH-like plugin search list without corrupting Windows drive
 * letters. `node:path.delimiter` is `:` on POSIX and `;` on Windows; the
 * explicit parameter keeps all platform branches directly testable on one
 * host.
 */
export function parsePluginPathList(
  value: string,
  separator: string = delimiter,
): string[] {
  return value
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Load a plugin's entry module. The discovered plugin must have an
 * `index.js` (compiled) or `index.ts` (dev mode via tsx). The entry
 * module's default export must conform to PluginEntryModule.
 *
 * Note on the manifest's per-capability `entry` field:
 *   The SPEC (§5.1) lets each capability declare an `entry` string
 *   (e.g. `"acme_legal.profile:PROFILE"`). In the original Python
 *   runtime that maps to a Python entry-point pointing at a specific
 *   symbol per capability. In this Node ESM CLI, the entry is the
 *   module's *default export*, which exposes a single `activate(ctx)`
 *   that registers all the plugin's capabilities through PluginContext.
 *   The per-capability `entry` strings in `fdpm-plugin.json` are
 *   therefore **advisory in this CLI** — they are surfaced via
 *   `fdpm plugin manifest <id>` for tooling and humans, but the
 *   runtime never resolves them to symbols. The default export is the
 *   sole dispatch point.
 */
export async function loadEntryModule(
  manifestPath: string,
  manifest: { id: string; kind: string },
): Promise<PluginEntryModule> {
  const root = manifestPath.replace(/[\\/][^\\/]+$/, "");
  // Search for index.js (built) then index.ts (dev/tsx)
  const candidates = ["index.js", "index.mjs", "index.ts"];
  for (const c of candidates) {
    const path = join(root, c);
    if (!existsSync(path)) continue;
    try {
      const url = pathToFileURL(path).href;
      const mod = await import(url);
      const def: unknown = mod.default ?? mod.plugin ?? mod;
      const entry = validateEntryShape(def, manifest.id);
      return entry;
    } catch (err) {
      throw new PluginError(
        "discovery",
        `failed to load entry module for ${manifest.id} at ${path}: ${
          (err as Error).message
        }`,
        { pluginId: manifest.id },
      );
    }
  }
  throw new PluginError(
    "discovery",
    `no entry module found for ${manifest.id} (looked for index.js, index.mjs, index.ts in ${root})`,
    { pluginId: manifest.id },
  );
}

function validateEntryShape(mod: unknown, pluginId: string): PluginEntryModule {
  if (!mod || typeof mod !== "object")
    throw new PluginError("discovery", `entry module is not an object`, { pluginId });
  const m = mod as Record<string, unknown>;
  if (!m["manifest"] || typeof m["manifest"] !== "object")
    throw new PluginError("discovery", "entry module missing `manifest`", { pluginId });
  if (typeof m["activate"] !== "function")
    throw new PluginError("discovery", "entry module missing `activate(ctx)`", { pluginId });
  return m as unknown as PluginEntryModule;
}

export function parseDiscovered(d: DiscoveredPlugin) {
  return parseManifest(d.rawManifest, d.manifestPath);
}
