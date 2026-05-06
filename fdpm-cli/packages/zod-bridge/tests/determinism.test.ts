import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assembleDomainProfile, stableStringify } from "../src/index.js";

describe("Bridge output determinism", () => {
  const Customer = z.object({
    id: z.string().regex(/^cust-[a-z0-9]+$/),
    name: z.string().min(1).max(120),
    tier: z.enum(["free", "pro", "enterprise"]),
    age: z.number().int().nonnegative().optional(),
    tags: z.array(z.string()).max(8),
  });

  const args = {
    schemas: { Customer },
    options: {
      profileId: "profile:test:0.1",
      vendor: "acme",
      hostCompatibility: ">=0.5.0 <0.6.0",
      pluginVersion: "0.1.0",
    },
    pluginId: "acme.customers",
    schemaSources: { Customer: "schemas/customer.ts" },
    generatedAt: "2026-05-06T11:30:00Z",
  };

  it("same inputs produce byte-equal profile JSON", () => {
    const a = assembleDomainProfile(args);
    const b = assembleDomainProfile(args);
    expect(stableStringify(a.profile)).toBe(stableStringify(b.profile));
  });

  it("same inputs produce byte-equal viewPage JSON", () => {
    const a = assembleDomainProfile(args);
    const b = assembleDomainProfile(args);
    expect(stableStringify(a.viewPage)).toBe(stableStringify(b.viewPage));
  });

  it("same inputs produce byte-equal productPage JSON", () => {
    const a = assembleDomainProfile(args);
    const b = assembleDomainProfile(args);
    expect(stableStringify(a.productPage)).toBe(stableStringify(b.productPage));
  });

  it("stable-stringify orders keys deterministically", () => {
    const x = stableStringify({ b: 1, a: 2 });
    const y = stableStringify({ a: 2, b: 1 });
    expect(x).toBe(y);
  });

  it("derived viewPage panels are in schema-declared order", () => {
    const result = assembleDomainProfile(args);
    const panel = result.viewPage.panels[0]!;
    expect(panel.fields.map((f) => f.name)).toEqual([
      "id",
      "name",
      "tier",
      "age",
      "tags",
    ]);
  });
});
