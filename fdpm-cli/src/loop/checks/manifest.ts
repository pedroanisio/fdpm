/**
 * Evidence-bundle manifest roots: sha256 over the sorted "sha256  path" lines
 * of every file under a directory. The acceptance authority recomputes this
 * from the files before it accepts anything; a reported root that does not
 * recompute is a bundle that was described rather than captured.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join("/"));
  }
}

/** The manifest lines, one per file, sorted by path. */
export function manifestLines(dir: string): string[] {
  statSync(dir);
  const files: string[] = [];
  walk(dir, dir, files);
  files.sort();
  return files.map((path) => `${sha256(readFileSync(join(dir, path)))}  ${path}`);
}

/** sha256 over the newline-joined manifest lines. An empty directory has a defined root, not an error. */
export function manifestRoot(dir: string): string {
  return sha256(`${manifestLines(dir).join("\n")}\n`);
}
