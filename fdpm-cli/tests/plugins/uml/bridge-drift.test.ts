/**
 * The generated artefacts on disk must be what the sidecar produces
 * right now. Without this gate a schema edit that is never regenerated
 * ships a profile describing the previous shape — the drift the whole
 * bridge exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../../plugins/uml/fdpm-plugin.json" with { type: "json" };
import profile from "../../../plugins/uml/generated/profile.json" with { type: "json" };
import { ENTITY_NAMES, PLUGIN_ID, PLUGIN_VERSION, PROFILE_ID, RELATION_TYPES } from "../../../plugins/uml/sidecar.js";

describe("bridge determinism", () => {
  it("`run-bridge --check` reports no drift against the committed files", () => {
    const out = execFileSync(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [join(process.cwd(), "plugins", "uml", "scripts", "run-bridge.ts"), "--check"],
      { encoding: "utf8", cwd: process.cwd() },
    );
    expect(out).toContain("no drift");
  });
});

describe("manifest ↔ sidecar parity", () => {
  it("declares the plugin identity the sidecar pins", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    expect(manifest.version).toBe(PLUGIN_VERSION);
  });

  it("advertises one renderer per metaclass plus the model outline", () => {
    const renderers = manifest.capabilities.filter((c) => c.capability_id === "cap:renderer");
    expect(renderers).toHaveLength(ENTITY_NAMES.length + 1);
    const ids = renderers.map((c) => (c.metadata as { renderer_id?: string } | undefined)?.renderer_id);
    expect(ids).toContain("uml:ModelOutlineRenderer");
  });

  it("emits the profile id the plugin registers, with every relation type", () => {
    expect(profile.id).toBe(PROFILE_ID);
    expect(profile.primitive_types).toHaveLength(ENTITY_NAMES.length);
    expect(profile.relation_types).toHaveLength(RELATION_TYPES.length);
  });
});
