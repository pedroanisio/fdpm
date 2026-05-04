import { describe, it, expect } from "vitest";
import * as pkg from "../src/index.js";

/**
 * SDK public-surface regression — guards the export contract that
 * embedders rely on. The SDK docstring (sdk.ts) advertises specific
 * helpers as available; this test fails if any of those names stop
 * being exported from the package root, which would break embedder
 * imports without a louder signal.
 *
 * Two groups:
 *   1. SDK helpers proper (added in pass-2 / the P1 audit).
 *   2. host-extra functions that the SDK docstring directs embedders
 *      to use for batch / time-travel / structural ops. These are
 *      re-exported from index.ts and the docstring's recommendation
 *      relies on them remaining at the package root.
 */

describe("SDK public surface", () => {
  it("exports the core SDK helpers", () => {
    const expected = [
      "openHost",
      "defineProject",
      "ProjectBuilder",
      "renderProject",
      // Edit helpers — added in the P1 surface-completeness pass.
      "patchPrimitive",
      "patchRelation",
      "deletePrimitive",
      "deleteRelation",
    ];
    for (const name of expected) {
      expect(
        pkg,
        `expected ${name} to be exported from package root`,
      ).toHaveProperty(name);
      expect(typeof (pkg as Record<string, unknown>)[name]).toMatch(
        /^(function|object)$/,
      );
    }
  });

  it("re-exports host-extra functions referenced by the SDK docstring", () => {
    // The SDK docstring tells embedders to reach for these directly
    // instead of wrapping them in SDK shims. They MUST stay at the
    // package root or the docstring becomes a lie.
    const expected = [
      "batchEdit",
      "undo",
      "rebuildFromLog",
      "splitProject",
      "cloneProject",
      "exportTransfer",
      "importTransfer",
      "createTemplate",
      "applyTemplate",
      "createTestSuite",
      "runTestSuite",
    ];
    for (const name of expected) {
      expect(
        pkg,
        `expected ${name} to be re-exported from package root`,
      ).toHaveProperty(name);
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("exports the SDK type contract for embedder type-checking", () => {
    // Type-only imports compile-check via tsc; this runtime test
    // pins the value-shaped exports those types travel with.
    const Host = (pkg as Record<string, unknown>)["Host"];
    expect(typeof Host).toBe("function");
    const FDPMException = (pkg as Record<string, unknown>)["FDPMException"];
    expect(typeof FDPMException).toBe("function");
  });
});
