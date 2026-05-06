import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifySchemas, renderAuditLog } from "../src/index.js";

describe("classifier — convention detection ({Name}Id companion)", () => {
  it("schemas with a sibling {Name}Id classify as Entity", () => {
    const Customer = z.object({ name: z.string() });
    const CustomerId = z.string();
    const result = classifySchemas({ schemas: { Customer, CustomerId } });
    expect(result.byName.get("Customer")?.kind).toBe("Entity");
    expect(result.byName.get("Customer")?.reason).toBe("id-schema-companion");
    expect(result.byName.get("CustomerId")?.kind).toBe("ValueObject");
  });

  it("schemas without a sibling {Name}Id default to ValueObject", () => {
    const Address = z.object({ street: z.string() });
    const result = classifySchemas({ schemas: { Address } });
    expect(result.byName.get("Address")?.kind).toBe("ValueObject");
    expect(result.byName.get("Address")?.reason).toBe("default-value-object");
  });

  it("multiple Entity/Id pairs detected together", () => {
    const Customer = z.object({ id: z.string() });
    const CustomerId = z.string();
    const Order = z.object({ id: z.string() });
    const OrderId = z.string();
    const Address = z.object({ city: z.string() });
    const result = classifySchemas({
      schemas: { Customer, CustomerId, Order, OrderId, Address },
    });
    expect(result.byName.get("Customer")?.kind).toBe("Entity");
    expect(result.byName.get("Order")?.kind).toBe("Entity");
    expect(result.byName.get("Address")?.kind).toBe("ValueObject");
  });
});

describe("classifier — explicit entities list", () => {
  it("promotes named schemas to Entity", () => {
    const Audience = z.object({ id: z.string() });
    const Slide = z.object({ id: z.string() });
    const Footer = z.object({ text: z.string() });
    const result = classifySchemas({
      schemas: { Audience, Slide, Footer },
      explicitEntities: ["Audience", "Slide"],
    });
    expect(result.byName.get("Audience")?.kind).toBe("Entity");
    expect(result.byName.get("Audience")?.reason).toBe("explicit-entities-list");
    expect(result.byName.get("Slide")?.kind).toBe("Entity");
    expect(result.byName.get("Footer")?.kind).toBe("ValueObject");
  });

  it("convention takes precedence (Entity-by-companion stays attributed to convention)", () => {
    const Customer = z.object({ id: z.string() });
    const CustomerId = z.string();
    const result = classifySchemas({
      schemas: { Customer, CustomerId },
      explicitEntities: ["Customer"],
    });
    // Already Entity by convention; explicit list is a no-op for it.
    expect(result.byName.get("Customer")?.reason).toBe("id-schema-companion");
  });

  it("explicit name not in schemas map → throws", () => {
    const A = z.object({ x: z.string() });
    expect(() =>
      classifySchemas({ schemas: { A }, explicitEntities: ["B"] }),
    ).toThrow(/not in the schemas map/);
  });
});

describe("classifier — audit log candidate promotions", () => {
  it("flags ValueObjects with an `id` field as candidates", () => {
    const Audience = z.object({ id: z.string(), label: z.string() });
    const result = classifySchemas({ schemas: { Audience } });
    const candidate = result.audit.candidatePromotions.find(
      (c) => c.name === "Audience",
    );
    expect(candidate?.signals).toContain("has-id-field");
  });

  it("flags ValueObjects referenced by 2+ other schemas", () => {
    const Address = z.object({ city: z.string() });
    const Customer = z.object({ home: Address, work: Address });
    const Order = z.object({ shipTo: Address });
    const result = classifySchemas({
      schemas: { Address, Customer, Order },
    });
    const candidate = result.audit.candidatePromotions.find(
      (c) => c.name === "Address",
    );
    // Address is referenced 2× from Customer and 1× from Order.
    expect(candidate?.referenceCount).toBeGreaterThanOrEqual(2);
    expect(candidate?.signals).toContain("referenced-by-multiple");
  });

  it("Entities never appear in candidate-promotions list", () => {
    const Customer = z.object({ id: z.string() });
    const CustomerId = z.string();
    const result = classifySchemas({ schemas: { Customer, CustomerId } });
    const candidate = result.audit.candidatePromotions.find(
      (c) => c.name === "Customer",
    );
    expect(candidate).toBeUndefined();
  });
});

describe("classifier — renderAuditLog (human-readable output)", () => {
  it("renders both classification summary and candidate promotions", () => {
    const Customer = z.object({ id: z.string() });
    const CustomerId = z.string();
    const Audience = z.object({ id: z.string() });
    const Address = z.object({ city: z.string() });
    const result = classifySchemas({
      schemas: { Customer, CustomerId, Audience, Address },
    });
    const text = renderAuditLog(result.audit);
    expect(text).toContain("Entity");
    expect(text).toContain("Customer");
    expect(text).toContain("ValueObject");
    expect(text).toContain("CustomerId");
    expect(text).toContain("id-schema-companion");
    // Audience has an id field but is a ValueObject → should appear as candidate.
    expect(text).toContain("Audience");
    expect(text).toContain("has-id-field");
  });
});

describe("classifier — determinism", () => {
  it("same input produces same audit log across calls", () => {
    const A = z.object({ id: z.string() });
    const B = z.object({ a: A });
    const C = z.object({ a: A });
    const r1 = classifySchemas({ schemas: { A, B, C } });
    const r2 = classifySchemas({ schemas: { A, B, C } });
    expect(JSON.stringify(r1.audit)).toBe(JSON.stringify(r2.audit));
  });
});
