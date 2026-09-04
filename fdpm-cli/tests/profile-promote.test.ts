/**
 * `fdpm profile promote` — a registered profile becomes a plugin skeleton.
 *
 * PURPOSE.md: "A plugin that ships only a profile is a schema. A plugin
 * that ships verbs, resources, prompts, and renderers is a complete domain
 * vocabulary." Everything registered through `fdpm.profile.register` is
 * stuck in the first category with no route to the second — promote is
 * that route: it emits a reviewable plugin directory whose `activate()`
 * registers the profile, with the capability slots an author fills in.
 *
 * Two properties are load-bearing and both are asserted here:
 *
 *   1. The emitted plugin is REAL — its manifest parses against
 *      `PluginManifest`, and a Host pointed at the output directory
 *      discovers it, activates it, and registers the profile.
 *   2. The emitted plugin is NOT ACTIVE where it was written. PURPOSE.md
 *      puts plugin authorship in-house and defers third-party trust work
 *      until after the eval; a plugin generated from agent-authored input
 *      must not land inside a discovery path, where the next host start
 *      would activate it with no human in the loop. Promote refuses that
 *      target outright — the operator copies it in after reading it.
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { promoteProfile } from "../src/core/profile/promote.js";
import { parseManifest } from "../src/plugin/manifest.js";
import { TEST_PROFILE } from "./fixtures.js";

describe("promoteProfile", () => {
  let outRoot: string;
  let host: Host;

  beforeEach(async () => {
    outRoot = await mkdtemp(join(tmpdir(), "fdpm-promote-"));
    host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE);
  });

  afterEach(async () => {
    await rm(outRoot, { recursive: true, force: true });
  });

  it("emits a manifest, an entry module, the profile, and a README", async () => {
    const result = await promoteProfile(host, "test:demo", { outDir: outRoot });

    expect(result.plugin_id).toBe("promoted.test-demo");
    expect(result.profile_ref).toBe("test:demo@1.0.0");
    expect(result.files.map((f) => f.replace(`${result.dir}/`, "")).sort()).toEqual([
      "README.md",
      "fdpm-plugin.json",
      "index.js",
      "profile.json",
    ]);

    const manifest = parseManifest(
      JSON.parse(await readFile(join(result.dir, "fdpm-plugin.json"), "utf8")),
      "promoted",
    );
    expect(manifest.id).toBe("promoted.test-demo");
    expect(manifest.version).toBe(TEST_PROFILE.version);
    expect(manifest.capabilities.map((c) => c.capability_id)).toContain("cap:profile");

    const emitted = JSON.parse(await readFile(join(result.dir, "profile.json"), "utf8"));
    expect(emitted.id).toBe("test:demo");
    expect(emitted.primitive_types).toHaveLength(TEST_PROFILE.primitive_types.length);

    const readme = await readFile(join(result.dir, "README.md"), "utf8");
    expect(readme).toContain("DISCLAIMER.md");
    expect(readme).toContain("test:demo@1.0.0");
  });

  it("promotes an explicit revision and pins the plugin version to it", async () => {
    await host.registerProfile({ ...TEST_PROFILE, version: "2.0.0" });
    const result = await promoteProfile(host, "test:demo@1.0.0", { outDir: outRoot });
    expect(result.profile_ref).toBe("test:demo@1.0.0");
    const manifest = JSON.parse(await readFile(join(result.dir, "fdpm-plugin.json"), "utf8"));
    expect(manifest.version).toBe("1.0.0");
    expect(JSON.parse(await readFile(join(result.dir, "profile.json"), "utf8")).version).toBe(
      "1.0.0",
    );
  });

  it("the emitted plugin is discovered but NOT auto-activated, and works once enabled", async () => {
    const result = await promoteProfile(host, "test:demo", { outDir: outRoot });

    const consumer = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [outRoot] });
    await consumer.load();

    // Discovered, loadable — and still inert. A filesystem plugin is
    // `community` trust, which does not auto-activate; that is the second
    // half of the review gate the discovery-path refusal starts.
    const discovered = consumer.plugins.get(result.plugin_id);
    expect(discovered?.state).toBe("disabled");
    expect(discovered?.errorMessage).toBeUndefined();
    expect(consumer.profiles.has("test:demo")).toBe(false);

    await consumer.plugins.enable(result.plugin_id);

    expect(consumer.plugins.get(result.plugin_id)?.state).toBe("active");
    expect(consumer.profiles.has("test:demo@1.0.0")).toBe(true);
    expect(consumer.profiles.sourceOf("test:demo@1.0.0")).toEqual({
      kind: "plugin",
      plugin_id: result.plugin_id,
    });
  });

  it("refuses to write into a plugin discovery path", async () => {
    const discovery = join(outRoot, "plugins");
    await mkdir(discovery, { recursive: true });
    await expect(
      promoteProfile(host, "test:demo", { outDir: discovery, discoveryPaths: [discovery] }),
    ).rejects.toMatchObject({ category: "permission" });
    expect(existsSync(join(discovery, "promoted.test-demo"))).toBe(false);
  });

  it("refuses to overwrite an existing directory unless --force", async () => {
    const first = await promoteProfile(host, "test:demo", { outDir: outRoot });
    await writeFile(join(first.dir, "notes.txt"), "operator edits", "utf8");

    await expect(promoteProfile(host, "test:demo", { outDir: outRoot })).rejects.toBeInstanceOf(
      FDPMException,
    );
    expect(existsSync(join(first.dir, "notes.txt"))).toBe(true);

    const again = await promoteProfile(host, "test:demo", { outDir: outRoot, force: true });
    expect(again.dir).toBe(first.dir);
  });

  it("reports not_found for an unregistered profile", async () => {
    await expect(
      promoteProfile(host, "test:missing", { outDir: outRoot }),
    ).rejects.toMatchObject({ category: "not_found" });
  });
});
