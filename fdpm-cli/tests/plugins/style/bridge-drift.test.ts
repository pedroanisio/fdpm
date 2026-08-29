/**
 * The generated artefacts on disk must be what the sidecar produces right
 * now. Without this gate a schema edit that is never regenerated ships a
 * profile describing the previous shape — the drift the whole bridge
 * exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../../plugins/style/fdpm-plugin.json" with { type: "json" };
import profile from "../../../plugins/style/generated/profile.json" with { type: "json" };
import audit from "../../../plugins/style/generated/audit.json" with { type: "json" };
import {
  ENTITY_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  RELATION_TYPES,
} from "../../../plugins/style/sidecar.js";

describe("bridge determinism", () => {
  it("`run-bridge --check` reports no drift against the committed files", () => {
    const out = execFileSync(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [join(process.cwd(), "plugins", "style", "scripts", "run-bridge.ts"), "--check"],
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

  it("advertises one renderer per entity plus the registry outline", () => {
    const renderers = manifest.capabilities.filter((c) => c.capability_id === "cap:renderer");
    expect(renderers).toHaveLength(ENTITY_NAMES.length + 1);
    const ids = renderers.map((c) => (c.metadata as { renderer_id?: string } | undefined)?.renderer_id);
    expect(ids).toContain("style:StyleOutlineRenderer");
  });

  it("emits the profile id the plugin registers, with every relation type", () => {
    expect(profile.id).toBe(PROFILE_ID);
    expect(profile.primitive_types).toHaveLength(ENTITY_NAMES.length);
    expect(profile.relation_types).toHaveLength(RELATION_TYPES.length);
  });
});

describe("normalisation goals the transcription exists to achieve", () => {
  /**
   * Transformations 3 and 4 in schemas/style.ts exist for exactly one
   * measurable reason: a field-level union or record reaches the host as
   * an opaque string. If any field regresses to `json-union` or
   * `json-record`, storage for it has silently become untyped.
   */
  it("emits no opaque json-union or json-record field", () => {
    const opaque: string[] = [];
    for (const pt of profile.primitive_types) {
      for (const f of pt.fields as { name: string; format?: string }[]) {
        if (f.format === "json-union" || f.format === "json-record") {
          opaque.push(`${pt.id}.${f.name} (${f.format})`);
        }
      }
    }
    expect(opaque).toEqual([]);
  });

  it("snake_cases every field name, as FieldDef.name requires", () => {
    const bad: string[] = [];
    for (const pt of profile.primitive_types) {
      for (const f of pt.fields as { name: string }[]) {
        if (!/^[a-z][a-z0-9_]*$/.test(f.name)) bad.push(`${pt.id}.${f.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("carries a declared loss for each structural transformation", () => {
    const losses = (audit.losses as { feature: string }[]).map((l) => l.feature);
    // Undeclared losses are the failure this audit exists to prevent: a
    // consumer must be able to read what the transcription gave up.
    expect(losses).toContain("style.type-layer-transcription");
    expect(losses).toContain("style.field-name-normalisation");
    expect(losses).toContain("style.union-flattening");
    expect(losses).toContain("style.record-to-entry-list");
    expect(losses).toContain("style.references-as-relations");
    expect(losses).toContain("style.cross-entity-invariants");
  });

  it("classifies all fifteen schemas as entities", () => {
    const entities = (audit.classifications as { kind: string; name: string }[])
      .filter((c) => c.kind === "Entity")
      .map((c) => c.name)
      .sort();
    expect(entities).toEqual([...ENTITY_NAMES].sort());
  });
});
