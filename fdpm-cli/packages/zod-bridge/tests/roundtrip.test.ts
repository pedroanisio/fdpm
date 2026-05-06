import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodSchemaToValidator } from "../src/index.js";

/**
 * The bridge's importer/exporter factories are deferred to v0.2.0; this test
 * verifies the round-trip property for a hand-written importer/exporter pair
 * built from the bridge's validator (the minimum useful product).
 */

const Customer = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.enum(["free", "pro"]),
  tags: z.array(z.string()),
});

const { validator } = zodSchemaToValidator(Customer, {
  pluginId: "acme.customers",
  typeName: "customer",
});

interface Workbook {
  primitives: Array<{ id: string; type_id: string; field_values: Record<string, unknown> }>;
}

function exporter(w: Workbook): string {
  const sorted = [...w.primitives].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sorted.map((p) => ({ ...p })), null, 2);
}

function importer(bytes: string): Workbook {
  const parsed = JSON.parse(bytes) as Array<{
    id: string;
    type_id: string;
    field_values: Record<string, unknown>;
  }>;
  return { primitives: parsed };
}

describe("Importer/exporter round-trip", () => {
  const w: Workbook = {
    primitives: [
      {
        id: "customer:1",
        type_id: "acme:Customer",
        field_values: { id: "cust-1", name: "Alice", tier: "pro", tags: ["vip"] },
      },
      {
        id: "customer:2",
        type_id: "acme:Customer",
        field_values: { id: "cust-2", name: "Bob", tier: "free", tags: [] },
      },
    ],
  };

  it("export -> import preserves field_values", () => {
    const bytes = exporter(w);
    const w2 = importer(bytes);
    expect(w2.primitives.length).toBe(w.primitives.length);
    for (const original of w.primitives) {
      const match = w2.primitives.find((p) => p.id === original.id);
      expect(match).toBeDefined();
      expect(match!.field_values).toEqual(original.field_values);
    }
  });

  it("imported primitives still validate", () => {
    const bytes = exporter(w);
    const w2 = importer(bytes);
    for (const p of w2.primitives) {
      expect(validator(p)).toEqual([]);
    }
  });

  it("export is byte-equal across runs", () => {
    expect(exporter(w)).toBe(exporter(w));
  });
});
