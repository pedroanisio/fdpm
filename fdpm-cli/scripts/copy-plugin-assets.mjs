import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function listPluginManifestPaths(rootDir) {
  return walk(rootDir)
    .filter((path) => path.endsWith("fdpm-plugin.json"))
    .map((path) => relative(rootDir, path))
    .sort();
}

export function copyPluginAssets(sourceDir, destDir) {
  for (const sourcePath of walk(sourceDir)) {
    if (sourcePath.endsWith(".ts")) continue;
    const rel = relative(sourceDir, sourcePath);
    const destPath = join(destDir, rel);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  copyPluginAssets("plugins", "dist/plugins");
}
