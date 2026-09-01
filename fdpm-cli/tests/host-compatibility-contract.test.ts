import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseManifest, isHostCompatible, isSemverCompatible } from "../src/plugin/manifest.js";
import { SPEC_CORE_VERSION } from "../src/core/version/spec.js";
import { EXPR_HELPER_SET_VERSION } from "../src/core/expr/std.js";

const PLUGIN_MANIFESTS = [
  "plugins/fact_fiction/fdpm-plugin.json",
  "plugins/formal_specification/fdpm-plugin.json",
  "plugins/planning/fdpm-plugin.json",
  "plugins/software_architecture/fdpm-plugin.json",
  "plugins/spec_authoring/fdpm-plugin.json",
];

describe("bundled plugin host_compatibility contracts", () => {
  it("every bundled manifest admits the current host version", () => {
    const [hostMajor, hostMinor] = SPEC_CORE_VERSION.split(".").map((part) =>
      parseInt(part, 10),
    );
    for (const relativePath of PLUGIN_MANIFESTS) {
      const raw = JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
      const manifest = parseManifest(raw, relativePath);
      expect(
        isHostCompatible(manifest.host_compatibility.fdpm, hostMajor!, hostMinor!),
      ).toBe(true);
    }
  });

  it("expr_helper_set pins remain compatible with the shipped helper set version", () => {
    for (const relativePath of PLUGIN_MANIFESTS) {
      const raw = JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
      const manifest = parseManifest(raw, relativePath);
      const pin = manifest.host_compatibility.expr_helper_set;
      if (!pin) continue;
      expect(isSemverCompatible(pin, EXPR_HELPER_SET_VERSION)).toBe(true);
    }
  });
});
