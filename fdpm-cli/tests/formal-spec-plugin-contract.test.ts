import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import {
  manifest as FORMAL_SPEC_MANIFEST,
  PROFILE,
  PROFILE_ID,
} from "../plugins/formal_specification/index.js";
import { FS_V3_DEFAULTS } from "../plugins/fs_v3_importer/index.js";

const EXPECTED_RENDERERS = [
  "fs:SpecHtmlRenderer",
  "fs:SpecPdfRenderer",
  "fs:SpecRenderer",
];

describe("formal_specification plugin contract", () => {
  it("keeps manifest renderer capabilities and PROFILE.renderers in sync", () => {
    const manifestRendererIds = FORMAL_SPEC_MANIFEST.capabilities
      .filter((cap) => cap.capability_id === "cap:renderer")
      .map((cap) => String(cap.metadata?.["renderer_id"]))
      .sort();
    const profileRendererIds = PROFILE.renderers.map((renderer) => renderer.renderer_id).sort();
    expect(profileRendererIds).toEqual(EXPECTED_RENDERERS);
    expect(manifestRendererIds).toEqual(EXPECTED_RENDERERS);
  });

  it("registers exactly the renderer ids declared by the manifest and profile", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const runtimeRendererIds = host.plugins
      .listRenderers()
      .filter((renderer) => renderer.pluginId === "fdpm.formal-specification")
      .map((renderer) => renderer.rendererId)
      .sort();
    expect(runtimeRendererIds).toEqual(EXPECTED_RENDERERS);
  });

  it("keeps the fs-v3 importer defaults pinned to the exported formal-spec profile id", () => {
    expect(FS_V3_DEFAULTS.profileId).toBe(PROFILE_ID);
    const importerManifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "plugins/fs_v3_importer/fdpm-plugin.json"), "utf8"),
    ) as {
      capabilities?: Array<{ capability_id?: string; metadata?: { default_profile_id?: string } }>;
    };
    const importerCapability = importerManifest.capabilities?.find(
      (capability) => capability.capability_id === "cap:importer",
    );
    expect(importerCapability?.metadata?.default_profile_id).toBe(PROFILE_ID);
  });
});
