/**
 * testcase:bridge-roundtrip for acme.business-deck.
 * decode(encode(W)) preserves the entity set field-for-field.
 */

import { describe, expect, it } from "vitest";
import { zodSchemaToExporter, zodSchemaToImporter } from "@fdpm/zod-bridge";
import { ClaimSchema } from "../../../plugins/acme_business_deck/schemas/business-deck.js";

const PLUGIN_ID = "acme.business-deck";

describe("acme.business-deck — importer/exporter round-trip", () => {
  const claims = [
    {
      id: "c1",
      kind: "core" as const,
      text: "We win when audit-grade evidence is required.",
    },
    {
      id: "c2",
      kind: "supporting" as const,
      text: "Procurement freezes are a structural risk for fast-cycle vendors.",
      parent_claim_id: "c1" as never,
    },
  ];

  it("exporter(import(W)) preserves the claim set field-for-field", () => {
    const { importer } = zodSchemaToImporter(ClaimSchema, {
      primitive_type_id: "acme:Claim",
      idFrom: (p) => `acme:Claim:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    const { exporter } = zodSchemaToExporter(ClaimSchema, {
      primitive_type_id: "acme:Claim",
      filename: () => "claims.json",
      pluginId: PLUGIN_ID,
    });

    const importResult = importer(JSON.stringify(claims));
    expect(importResult.kind).toBe("ok");
    if (importResult.kind !== "ok") return;

    const view = {
      id: "wb-test",
      primitives: importResult.intents.map((it) => ({
        id: it.id,
        type_id: it.type_id,
        field_values: it.field_values,
      })),
    };
    const exported = exporter(view);
    const reparsed = JSON.parse(exported.body) as Array<Record<string, unknown>>;
    expect(reparsed).toHaveLength(claims.length);
    for (const orig of claims) {
      const found = reparsed.find((r) => r.id === orig.id);
      expect(found).toBeDefined();
      expect(found).toEqual(orig);
    }
  });

  it("importer reports atomic failure with rule_id namespacing on first invalid input", () => {
    const { importer } = zodSchemaToImporter(ClaimSchema, {
      primitive_type_id: "acme:Claim",
      idFrom: (p) => `acme:Claim:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    const broken = [claims[0]!, { id: "c-bad" }, claims[1]!];
    const result = importer(JSON.stringify(broken));
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.warnings.length).toBeGreaterThan(0);
      for (const w of result.warnings) {
        expect(w.rule_id.startsWith("acme.business-deck:zod.claim.")).toBe(true);
      }
      expect(result.partialIntents.length).toBe(1);
    }
  });

  it("exporter is byte-stable across input orderings of the same primitive set", () => {
    const { exporter } = zodSchemaToExporter(ClaimSchema, {
      primitive_type_id: "acme:Claim",
      filename: () => "claims.json",
      pluginId: PLUGIN_ID,
    });
    const a = claims[0]!;
    const b = claims[1]!;
    const view1 = {
      id: "wb",
      primitives: [
        { id: `acme:Claim:${a.id}`, type_id: "acme:Claim", field_values: a },
        { id: `acme:Claim:${b.id}`, type_id: "acme:Claim", field_values: b },
      ],
    };
    const view2 = {
      id: "wb",
      primitives: [view1.primitives[1]!, view1.primitives[0]!],
    };
    expect(exporter(view1).body).toBe(exporter(view2).body);
  });
});
