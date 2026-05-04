import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import {
  manifest as FORMAL_SPEC_MANIFEST,
  PROFILE as FORMAL_SPEC_PROFILE,
} from "../plugins/formal_specification/index.js";
import {
  manifest as SOFTWARE_ARCHITECTURE_MANIFEST,
  PROFILE as SOFTWARE_ARCHITECTURE_PROFILE,
} from "../plugins/software_architecture/index.js";
import {
  manifest as SPEC_AUTHORING_MANIFEST,
  PROFILE as SPEC_AUTHORING_PROFILE,
} from "../plugins/spec_authoring/index.js";
import { manifest as PLANNING_MANIFEST } from "../plugins/planning/index.js";

const PROFILE_RENDERER_PLUGINS = [
  {
    pluginId: "fdpm.formal-specification",
    manifest: FORMAL_SPEC_MANIFEST,
    profile: FORMAL_SPEC_PROFILE,
  },
  {
    pluginId: "fdpm.software-architecture",
    manifest: SOFTWARE_ARCHITECTURE_MANIFEST,
    profile: SOFTWARE_ARCHITECTURE_PROFILE,
  },
  {
    pluginId: "fdpm.spec-authoring",
    manifest: SPEC_AUTHORING_MANIFEST,
    profile: SPEC_AUTHORING_PROFILE,
  },
] as const;

const RENDERER_PLUGINS = [
  ...PROFILE_RENDERER_PLUGINS,
  {
    pluginId: "fdpm.planning",
    manifest: PLANNING_MANIFEST,
    profile: null,
  },
] as const;

function manifestRenderers(
  manifest: { capabilities: Array<{ capability_id: string; metadata?: Record<string, unknown> }> },
) {
  return manifest.capabilities
    .filter((capability) => capability.capability_id === "cap:renderer")
    .map((capability) => ({
      rendererId: String(capability.metadata?.["renderer_id"]),
      target: String(capability.metadata?.["target"] ?? capability.metadata?.["output_format"]),
      outputPath: String(capability.metadata?.["output_path"] ?? ""),
    }))
    .sort((left, right) => left.rendererId.localeCompare(right.rendererId));
}

describe("plugin renderer contracts", () => {
  it("keeps profile renderer bindings aligned with manifest renderer metadata", () => {
    for (const plugin of PROFILE_RENDERER_PLUGINS) {
      const manifestBindings = manifestRenderers(plugin.manifest);
      const profileBindings = plugin.profile.renderers
        .map((binding) => ({
          rendererId: binding.renderer_id,
          target: binding.output_format,
          outputPath: binding.output_path,
        }))
        .sort((left, right) => left.rendererId.localeCompare(right.rendererId));
      expect(profileBindings).toEqual(manifestBindings);
    }
  });

  it("registers exactly the renderer ids and targets declared in each manifest", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();

    for (const plugin of RENDERER_PLUGINS) {
      const runtimeRenderers = host.plugins
        .listRenderers()
        .filter((renderer) => renderer.pluginId === plugin.pluginId)
        .map((renderer) => ({
          rendererId: renderer.rendererId,
          target: renderer.target,
        }))
        .sort((left, right) => left.rendererId.localeCompare(right.rendererId));
      const manifestBindings = manifestRenderers(plugin.manifest).map((binding) => ({
        rendererId: binding.rendererId,
        target: binding.target,
      }));
      expect(runtimeRenderers).toEqual(manifestBindings);
    }
  });
});
