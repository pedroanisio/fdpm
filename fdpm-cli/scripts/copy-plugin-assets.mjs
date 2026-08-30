import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export function listPluginManifestPaths(rootDir) {
  return walk(rootDir)
    .filter((path) => path.endsWith("fdpm-plugin.json"))
    .map((path) => relative(rootDir, path))
    .sort();
}

/**
 * Compiled artefacts tsc emits next to the copied assets. Each maps back
 * to a `.ts` source, so they are legitimate only while that source lives.
 */
const EMIT_SUFFIXES = [".js", ".js.map", ".d.ts", ".d.ts.map"];

/** `renderers/x.js` -> `renderers/x.ts`; null when it is not emit. */
function sourceOfEmit(rel) {
  for (const suffix of EMIT_SUFFIXES) {
    if (rel.endsWith(suffix)) return `${rel.slice(0, -suffix.length)}.ts`;
  }
  return null;
}

/**
 * Mirror `sourceDir` into `destDir`: copy every non-TypeScript asset, and
 * REMOVE anything in the destination the source no longer justifies.
 *
 * The prune is the point. Without it a deleted plugin survives in
 * `dist/plugins/` forever — and plugin discovery resolves relative to
 * itself (`dist/src/plugin/discovery.js` -> `dist/plugins`), so every
 * built binary keeps registering a profile the operator removed from the
 * source tree. `tsc` does not delete emit for a vanished source either,
 * so both cases are handled here: an asset survives if the source file
 * exists, and compiled output survives if its `.ts` source exists.
 */
export function copyPluginAssets(sourceDir, destDir) {
  for (const sourcePath of walk(sourceDir)) {
    if (sourcePath.endsWith(".ts")) continue;
    const rel = relative(sourceDir, sourcePath);
    const destPath = join(destDir, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
  pruneOrphans(sourceDir, destDir);
}

/** Delete destination files (then empty directories) with no source. */
export function pruneOrphans(sourceDir, destDir) {
  if (!existsSync(destDir)) return [];
  const removed = [];
  for (const destPath of walk(destDir)) {
    const rel = relative(destDir, destPath);
    const emitSource = sourceOfEmit(rel);
    const justified = emitSource
      ? existsSync(join(sourceDir, emitSource)) || existsSync(join(sourceDir, rel))
      : existsSync(join(sourceDir, rel));
    if (!justified) {
      rmSync(destPath, { force: true });
      removed.push(rel);
    }
  }
  pruneEmptyDirs(destDir, destDir);
  return removed;
}

/** Remove directories left empty by the prune (never the root itself). */
function pruneEmptyDirs(dir, root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name), root);
  }
  if (dir !== root && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyPluginAssets("plugins", "dist/plugins");
}
