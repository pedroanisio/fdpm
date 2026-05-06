/**
 * testcase:cel-translation-table for acme.business-deck.
 * Asserts the schema exercises the bridge's 23-rule CEL translation
 * and produces non-trivial constraints addressed via self.field_values.
 */

import { describe, expect, it } from "vitest";
import { assembleDomainProfileFromSidecar } from "@fdpm/zod-bridge";
import { buildBusinessDeckSidecar } from "../../../plugins/acme_business_deck/sidecar.js";

describe("acme.business-deck — CEL translation", () => {
  const sidecar = buildBusinessDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });
  const constraints = result.profile.constraints ?? [];

  it("emits at least one CEL constraint per entity (heuristic floor)", () => {
    expect(constraints.length).toBeGreaterThan(20);
  });

  it("namespaces every constraint with the acme.<entity>. prefix", () => {
    const pattern = /^acme\.[a-z][a-z0-9_]*\..+/;
    for (const c of constraints) {
      expect(c.name, `constraint ${c.name}`).toMatch(pattern);
      expect(c.expression.length).toBeGreaterThan(0);
    }
  });

  it("addresses fields via self.field_values.<name>", () => {
    const targeted = constraints.filter((c) =>
      c.expression.includes("self.field_values."),
    );
    expect(targeted.length).toBeGreaterThan(constraints.length * 0.3);
  });

  it("emits an acyclic graph constraint for the Claim parent self-reference", () => {
    const acyclic = constraints.find(
      (c) =>
        c.name.includes("acyclic") &&
        c.expression.includes("graph.acyclic"),
    );
    expect(acyclic).toBeDefined();
  });
});
