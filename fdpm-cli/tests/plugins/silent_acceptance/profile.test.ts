import { describe, expect, it } from "vitest";
import { DomainProfile } from "../../../src/core/models/meta.js";
import {
  ERROR_CLASSES,
  PROFILE,
  PROFILE_ID,
  PROFILE_VERSION,
  PLUGIN_ID,
  R,
  T,
  manifest,
} from "../../../plugins/silent_acceptance/index.js";
import { freshHost } from "./_fixture.js";

describe("silent-acceptance profile contract", () => {
  it("registers the requested v2.1 identity as a valid standalone profile", () => {
    expect(() => DomainProfile.parse(PROFILE)).not.toThrow();
    expect(PROFILE.id).toBe("profile:silent-acceptance:2.1");
    expect(PROFILE.version).toBe("2.1.0");
    expect(PROFILE_ID).toBe("profile:silent-acceptance:2.1");
    expect(PROFILE_VERSION).toBe("2.1.0");
    expect(PROFILE.extends).toEqual([]);
    expect(PROFILE.primitive_types).toHaveLength(Object.keys(T).length);
    expect(PROFILE.relation_types).toHaveLength(Object.keys(R).length);
  });

  it("closes the protocol taxonomy at exactly the nine intrinsic error classes", () => {
    expect(ERROR_CLASSES).toEqual([
      "ERR_HALLUCINATION",
      "ERR_OMISSION",
      "ERR_SCHEMA",
      "ERR_TRUNCATION",
      "ERR_SYCOPHANCY",
      "ERR_INSTRUCTION",
      "ERR_CALIBRATION",
      "ERR_SEMANTIC",
      "ERR_REASONING",
    ]);
    const coverage = PROFILE.primitive_types.find((type) => type.id === T.ErrorClassCoverage);
    const field = coverage?.fields.find((candidate) => candidate.name === "error_class");
    expect(field?.enum_values).toEqual(ERROR_CLASSES);
  });

  it("keeps manifest capabilities and runtime registrations aligned", async () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    const declared = manifest.capabilities
      .filter((capability) => capability.capability_id === "cap:renderer")
      .map((capability) => [capability.metadata?.["target"], capability.metadata?.["renderer_id"]])
      .sort();
    expect(declared).toEqual([
      ["application/vnd.fdpm.silent-acceptance+json", "sa:StateRenderer"],
      ["image/svg+xml", "sa:ControlDomainMapRenderer"],
      ["text/html", "sa:AssuranceDashboardRenderer"],
      ["text/markdown", "sa:BoundaryDeclarationRenderer"],
    ]);

    const host = await freshHost();
    expect(host.plugins.get(PLUGIN_ID)?.state).toBe("active");
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    const runtime = host.plugins
      .listRenderers()
      .filter((renderer) => renderer.pluginId === PLUGIN_ID)
      .map((renderer) => [renderer.target, renderer.rendererId])
      .sort();
    expect(runtime).toEqual(declared);
  });
});
