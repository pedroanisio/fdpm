import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodSchemaToValidator } from "../src/index.js";

const Customer = z.object({
  id: z.string().regex(/^cust-[a-z0-9]+$/),
  name: z.string().min(1).max(120),
  tier: z.enum(["free", "pro", "enterprise"]),
  age: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).max(8),
});

const opts = { pluginId: "acme.customers", typeName: "customer" } as const;

describe("Validator-Zod equivalence", () => {
  const { validator, ruleIds } = zodSchemaToValidator(Customer, opts);

  it("returns no findings for valid input", () => {
    const out = validator({
      id: "p1",
      type_id: "acme:Customer",
      field_values: {
        id: "cust-001",
        name: "Alice",
        tier: "pro",
        age: 30,
        tags: ["vip"],
      },
    });
    expect(out).toEqual([]);
  });

  it("findings count == safeParse issues count", () => {
    const bad = {
      id: "BAD",            // regex
      name: "",             // min_length
      tier: "gold",         // invalid enum
      age: -1,              // greater_than (>=0)
      tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],  // too_big
    };
    const findings = validator({
      id: "p2",
      type_id: "acme:Customer",
      field_values: bad,
    });
    const safeparse = Customer.safeParse(bad);
    expect(safeparse.success).toBe(false);
    if (!safeparse.success) {
      expect(findings.length).toBe(safeparse.error.issues.length);
    }
  });

  it("rule_id is namespaced and includes path", () => {
    const findings = validator({
      id: "p3",
      type_id: "acme:Customer",
      field_values: { id: "cust-001", name: "A", tier: "gold", tags: [] },
    });
    const tierFinding = findings.find((f) => f.path?.includes("tier"));
    expect(tierFinding).toBeDefined();
    expect(tierFinding!.rule_id).toMatch(
      /^acme\.customers:zod\.customer\.invalid_value\.tier$/,
    );
  });

  it("ruleIds enumerate the closed set including universal codes", () => {
    expect(ruleIds.some((r) => r.endsWith(".invalid_type"))).toBe(true);
    expect(ruleIds.some((r) => r.endsWith(".unrecognized_keys"))).toBe(true);
    expect(ruleIds.length).toBeGreaterThan(0);
  });

  it("path field is prefixed with field_values", () => {
    const findings = validator({
      id: "p4",
      type_id: "acme:Customer",
      field_values: { id: "BAD", name: "X", tier: "pro", tags: [] },
    });
    expect(findings[0]!.path?.[0]).toBe("field_values");
  });
});
