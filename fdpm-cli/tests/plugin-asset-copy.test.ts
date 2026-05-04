import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
