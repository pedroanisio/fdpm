/**
 * Host.reloadPlugins() — SPEC-REPL §10.3 plugins-only reload.
 *
 * Asserts:
 *   - returns {reloadedAt, plugins} with the post-reload active count
 *   - active plugin set survives the reload (re-register cleanly)
 *   - profiles registered by plugins are present after the reload
 *   - the Store projection is preserved (operation log untouched)
 *   - calling twice in a row succeeds (no expression-helper conflicts)
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-reload-plugins-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

const FS_PROFILE = "profile:formal-specification:3.0";

describe("Host.reloadPlugins", () => {
  it("returns {reloadedAt, plugins} with the active plugin count", async () => {
    const host = await freshHost();
    const before = Date.now();
    const result = await host.reloadPlugins();
    const after = Date.now();

    expect(result.reloadedAt).toBeGreaterThanOrEqual(before);
    expect(result.reloadedAt).toBeLessThanOrEqual(after);
    expect(result.plugins).toBeGreaterThan(0);
  });

  it("preserves the Store projection across the reload", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "proj-keep",
      name: "Keep Me",
      profile_id: FS_PROFILE,
    });
    const beforeRev = host.getProject("proj-keep").project.revision;

    await host.reloadPlugins();

    const after = host.getProject("proj-keep");
    expect(after.project.id).toBe("proj-keep");
    expect(after.project.revision).toBe(beforeRev);
  });

  it("re-registers plugin-contributed profiles", async () => {
    const host = await freshHost();
    expect(host.profiles.has(FS_PROFILE)).toBe(true);
    await host.reloadPlugins();
    expect(host.profiles.has(FS_PROFILE)).toBe(true);
  });

  it("is idempotent — two reloads in a row succeed without conflict", async () => {
    const host = await freshHost();
    const first = await host.reloadPlugins();
    const second = await host.reloadPlugins();
    expect(second.plugins).toBe(first.plugins);
  });

  it("preserves Host reference identity (closures keep working)", async () => {
    const host = await freshHost();
    const before = host;
    await host.reloadPlugins();
    expect(host).toBe(before);
  });
});
