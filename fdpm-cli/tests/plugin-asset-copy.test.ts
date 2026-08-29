import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyPluginAssets,
  listPluginManifestPaths,
} from "../scripts/copy-plugin-assets.mjs";

function withTmpDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "fdpm-plugin-assets-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("copy-plugin-assets build step", () => {
  it("copies every source plugin manifest into the destination tree", () => {
    withTmpDir((outDir) => {
      copyPluginAssets(join(process.cwd(), "plugins"), outDir);
      expect(listPluginManifestPaths(outDir)).toEqual(
        listPluginManifestPaths(join(process.cwd(), "plugins")),
      );
    });
  });

  it("copies non-TypeScript assets and excludes .ts sources", () => {
    withTmpDir((root) => {
      const src = join(root, "src-plugins");
      const dst = join(root, "dist-plugins");
      mkdirSync(join(src, "demo", "nested"), { recursive: true });
      writeFileSync(join(src, "demo", "fdpm-plugin.json"), '{"id":"demo"}');
      writeFileSync(join(src, "demo", "index.ts"), "export const ignored = true;");
      writeFileSync(join(src, "demo", "README.md"), "# demo\n");
      writeFileSync(join(src, "demo", "nested", "asset.txt"), "payload");

      copyPluginAssets(src, dst);

      expect(() =>
        readFileSync(join(dst, "demo", "fdpm-plugin.json"), "utf8"),
      ).not.toThrow();
      expect(readFileSync(join(dst, "demo", "README.md"), "utf8")).toContain("# demo");
      expect(readFileSync(join(dst, "demo", "nested", "asset.txt"), "utf8")).toBe("payload");
      expect(() => readFileSync(join(dst, "demo", "index.ts"), "utf8")).toThrow();
    });
  });
});

/**
 * Pruning — the defect an operator hit on 2026-08-29.
 *
 * `plugins/academic_paper/` was deleted from source, but
 * `fdpm profile list` kept showing `profile:academic-paper:0.3`. The
 * build copies plugin assets and never removes any, and `tsc` does not
 * delete emit for a source file that no longer exists, so the deleted
 * plugin survived in `dist/plugins/` — and plugin discovery resolves
 * relative to itself (`dist/src/plugin/discovery.js` → `dist/plugins`),
 * so every built binary, including the MCP server, went on registering
 * a profile the operator had removed.
 *
 * A build step that cannot unpublish is a build step that lies about
 * the source tree.
 */
describe("copy-plugin-assets — pruning removed plugins", () => {
  it("removes a destination plugin whose source directory is gone", () => {
    withTmpDir((root) => {
      const src = join(root, "src-plugins");
      const dst = join(root, "dist-plugins");
      mkdirSync(join(src, "keeper"), { recursive: true });
      writeFileSync(join(src, "keeper", "fdpm-plugin.json"), '{"id":"keeper"}');

      // A previous build left a plugin behind: assets plus the compiled
      // output tsc emitted from its .ts sources.
      mkdirSync(join(dst, "ghost", "generated"), { recursive: true });
      writeFileSync(join(dst, "ghost", "fdpm-plugin.json"), '{"id":"ghost"}');
      writeFileSync(join(dst, "ghost", "generated", "profile.json"), "{}");
      writeFileSync(join(dst, "ghost", "index.js"), "export const activate = () => {};");
      writeFileSync(join(dst, "ghost", "index.d.ts"), "export declare const activate: () => void;");

      copyPluginAssets(src, dst);

      expect(listPluginManifestPaths(dst)).toEqual(["keeper/fdpm-plugin.json"]);
      expect(existsSync(join(dst, "ghost"))).toBe(false);
    });
  });

  it("keeps compiled output whose .ts source still exists", () => {
    withTmpDir((root) => {
      const src = join(root, "src-plugins");
      const dst = join(root, "dist-plugins");
      mkdirSync(join(src, "live"), { recursive: true });
      writeFileSync(join(src, "live", "fdpm-plugin.json"), '{"id":"live"}');
      writeFileSync(join(src, "live", "index.ts"), "export const activate = () => {};");

      // tsc emitted these next to the copied assets; they must survive.
      mkdirSync(join(dst, "live"), { recursive: true });
      for (const f of ["index.js", "index.js.map", "index.d.ts", "index.d.ts.map"]) {
        writeFileSync(join(dst, "live", f), "//");
      }

      copyPluginAssets(src, dst);

      for (const f of ["index.js", "index.js.map", "index.d.ts", "index.d.ts.map"]) {
        expect(existsSync(join(dst, "live", f)), `${f} must survive`).toBe(true);
      }
      expect(existsSync(join(dst, "live", "fdpm-plugin.json"))).toBe(true);
    });
  });

  it("removes stale compiled output when its .ts source is deleted", () => {
    withTmpDir((root) => {
      const src = join(root, "src-plugins");
      const dst = join(root, "dist-plugins");
      mkdirSync(join(src, "live"), { recursive: true });
      writeFileSync(join(src, "live", "fdpm-plugin.json"), '{"id":"live"}');
      writeFileSync(join(src, "live", "index.ts"), "export const activate = () => {};");

      mkdirSync(join(dst, "live"), { recursive: true });
      writeFileSync(join(dst, "live", "index.js"), "//");
      // renderers/old.ts was deleted from source; its emit must go too.
      mkdirSync(join(dst, "live", "renderers"), { recursive: true });
      writeFileSync(join(dst, "live", "renderers", "old.js"), "//");

      copyPluginAssets(src, dst);

      expect(existsSync(join(dst, "live", "index.js"))).toBe(true);
      expect(existsSync(join(dst, "live", "renderers", "old.js"))).toBe(false);
    });
  });

  it("leaves a destination that already matches source untouched", () => {
    withTmpDir((root) => {
      const src = join(root, "src-plugins");
      const dst = join(root, "dist-plugins");
      mkdirSync(join(src, "a"), { recursive: true });
      writeFileSync(join(src, "a", "fdpm-plugin.json"), '{"id":"a"}');
      copyPluginAssets(src, dst);
      const before = listPluginManifestPaths(dst);
      copyPluginAssets(src, dst);
      expect(listPluginManifestPaths(dst)).toEqual(before);
    });
  });
});
