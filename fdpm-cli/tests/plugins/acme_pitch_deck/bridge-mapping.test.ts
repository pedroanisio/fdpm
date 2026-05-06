/**
 * testcase:bridge-mapping-table for acme.pitch-deck.
 *
 * The how-to demands every supported Zod construct in the plugin's
 * schema produce the documented FieldDef shape. The bridge package's
 * own mapping.test.ts proves the mapping rules in isolation; this
 * test proves the BINDING — that running the plugin's actual sidecar
 * over the actual schema produces the artefact set the plugin commits
 * (8 entities, 13 variant Slide arms = 21 PrimitiveTypeDefs).
 */

import { describe, expect, it } from "vitest";
import { assembleDomainProfileFromSidecar } from "@fdpm/zod-bridge";
import { buildPitchDeckSidecar } from "../../../plugins/acme_pitch_deck/sidecar.js";

describe("acme.pitch-deck — bridge mapping", () => {
  const sidecar = buildPitchDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  it("emits 21 primitive types (8 entities + 13 Slide visual variants)", () => {
    expect(result.profile.primitive_types.length).toBe(21);
  });

  it("emits 21 relation types (8 reference relations + 13 SlideVisual<Tag> relations)", () => {
    expect(result.profile.relation_types.length).toBe(21);
  });

  it("emits Slide as the parent primitive without the visual field", () => {
    const slide = result.profile.primitive_types.find((p) => p.id === "acme:Slide");
    expect(slide).toBeDefined();
    const hasVisual = slide!.fields.some((f) => f.name === "visual");
    expect(hasVisual).toBe(false);
  });

  it("emits one Slide_<Tag> primitive per Slide.visual variant", () => {
    const variants = result.profile.primitive_types
      .filter((p) => p.id.startsWith("acme:Slide_"))
      .map((p) => p.id)
      .sort();
    expect(variants.length).toBe(13);
    expect(variants).toContain("acme:Slide_Title");
    expect(variants).toContain("acme:Slide_StatTilesPlusChart");
  });

  it("emits one many-to-one parent->arm relation per variant", () => {
    const visualRels = result.profile.relation_types.filter((r) =>
      r.id.startsWith("acme:SlideVisual"),
    );
    expect(visualRels.length).toBe(13);
    for (const r of visualRels) {
      expect(r.source_type_id).toBe("acme:Slide");
      // Each relation targets one variant primitive.
      expect(r.target_type_id.startsWith("acme:Slide_")).toBe(true);
    }
  });

  it("emits id_format on every primitive (host's profile compiler requires it)", () => {
    for (const p of result.profile.primitive_types) {
      expect(p.id_format).toBeDefined();
      expect(p.id_format.pattern_kind).toBe("template");
    }
  });
});
