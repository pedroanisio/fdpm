/**
 * SPEC-MCP-SERVER §6 Compliance / §8.4 — Classification CI gate.
 *
 * Every public method on `Host.prototype` must be either:
 *   (a) wrapped by an MCP tool entry in MANIFEST (its name listed in
 *       `EXPOSED_HOST_METHODS`), OR
 *   (b) explicitly declared as not exposed in `src/mcp/not-exposed.ts`.
 *
 * Adding a new public Host method without classifying it breaks this
 * test — that is the point. The fix is mechanical: either wire a tool
 * (and add the method name to `EXPOSED_HOST_METHODS`), or add the name
 * to `NOT_EXPOSED` with a one-line rationale.
 */

import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { EXPOSED_HOST_METHODS } from "../src/mcp/manifest.js";
import { NOT_EXPOSED } from "../src/mcp/not-exposed.js";

describe("MCP classification gate", () => {
  it("every public Host method is either exposed or explicitly not-exposed", () => {
    const all = Object.getOwnPropertyNames(Host.prototype).filter((name) => {
      if (name === "constructor") return false;
      if (name.startsWith("_")) return false;
      const desc = Object.getOwnPropertyDescriptor(Host.prototype, name);
      if (desc === undefined) return false;
      return typeof desc.value === "function";
    });

    const notExposed = new Set(NOT_EXPOSED);
    const unclassified = all.filter(
      (m) => !EXPOSED_HOST_METHODS.has(m) && !notExposed.has(m),
    );

    expect(
      unclassified,
      [
        "Unclassified Host method(s) detected.",
        "Each public Host method MUST be either:",
        "  - wrapped by an MCP tool (add to MANIFEST AND list the method",
        "    name in `EXPOSED_HOST_METHODS` in src/mcp/manifest.ts), OR",
        "  - explicitly listed in src/mcp/not-exposed.ts with rationale.",
        `Unclassified: ${unclassified.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("EXPOSED_HOST_METHODS and NOT_EXPOSED do not overlap", () => {
    const overlap = NOT_EXPOSED.filter((m) => EXPOSED_HOST_METHODS.has(m));
    expect(overlap, `methods listed both as exposed and not-exposed: ${overlap.join(", ")}`).toEqual([]);
  });
});
