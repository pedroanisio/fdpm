/**
 * testcase:bridge-roundtrip for acme.pitch-deck.
 *
 * Importer/exporter round-trip property: for any workbook W bound to
 * a bridge-derived primitive type, decode(encode(W)) preserves the
 * primitive set field-for-field (ULIDs may differ; ids may match if
 * idFrom is deterministic).
 *
 * Plugin-scope check: build a workbook with N Audience primitives,
 * round-trip via the bridge's importer/exporter, assert deepEqual
 * field_values per primitive.
 */

import { describe, expect, it } from "vitest";
import { zodSchemaToExporter, zodSchemaToImporter } from "@fdpm/zod-bridge";
import { Schemas } from "../../../plugins/acme_pitch_deck/schemas/pitch-deck.schema.v2.js";

const PLUGIN_ID = "acme.pitch-deck";

describe("acme.pitch-deck — importer/exporter round-trip", () => {
  const audiences = [
    {
      id: "cfo",
      label: "Chief Financial Officer",
      primaryQuestion: "What is the financial impact?",
      evaluationCriteria: ["roi", "tco", "payback-period"],
      failureMode: "audience-uninterested",
    },
    {
      id: "ciso",
      label: "Chief Information Security Officer",
      primaryQuestion: "What is the residual risk?",
      evaluationCriteria: ["compliance", "blast-radius"],
      failureMode: "audience-skeptical",
    },
  ];

  it("exporter(import(W)) preserves the audience set field-for-field", () => {
    const { importer } = zodSchemaToImporter(Schemas.Audience, {
      primitive_type_id: "acme:Audience",
      idFrom: (p) => `acme:Audience:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: "audience",
    });
    const { exporter } = zodSchemaToExporter(Schemas.Audience, {
      primitive_type_id: "acme:Audience",
      filename: () => "audiences.json",
      pluginId: PLUGIN_ID,
    });

    const importResult = importer(JSON.stringify(audiences));
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
    expect(reparsed).toHaveLength(audiences.length);

    // Bag equality keyed by id; ordering is exporter's lexicographic id sort.
    for (const orig of audiences) {
      const found = reparsed.find((r) => r.id === orig.id);
      expect(found).toBeDefined();
      expect(found).toEqual(orig);
    }
  });

  it("importer reports atomic failure with rule_id namespacing on first invalid input", () => {
    const { importer } = zodSchemaToImporter(Schemas.Audience, {
      primitive_type_id: "acme:Audience",
      idFrom: (p) => `acme:Audience:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: "audience",
    });
    const broken = [
      audiences[0]!,
      { id: "incomplete" }, // missing required fields
      audiences[1]!,
    ];
    const result = importer(JSON.stringify(broken));
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.warnings.length).toBeGreaterThan(0);
      for (const w of result.warnings) {
        expect(w.rule_id.startsWith("acme.pitch-deck:zod.audience.")).toBe(true);
      }
      // Atomic — only the prefix that succeeded is in partialIntents.
      expect(result.partialIntents.length).toBe(1);
    }
  });

  it("exporter is byte-stable across input orderings of the same primitive set", () => {
    const { exporter } = zodSchemaToExporter(Schemas.Audience, {
      primitive_type_id: "acme:Audience",
      filename: () => "audiences.json",
      pluginId: PLUGIN_ID,
    });
    const a = audiences[0]!;
    const b = audiences[1]!;
    const view1 = {
      id: "wb",
      primitives: [
        { id: `acme:Audience:${a.id}`, type_id: "acme:Audience", field_values: a },
        { id: `acme:Audience:${b.id}`, type_id: "acme:Audience", field_values: b },
      ],
    };
    const view2 = {
      id: "wb",
      primitives: [view1.primitives[1]!, view1.primitives[0]!],
    };
    expect(exporter(view1).body).toBe(exporter(view2).body);
  });
});
