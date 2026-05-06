/**
 * testcase:bridge-mapping-table for acme.business-deck.
 * Plugin-scope check: running the plugin's actual sidecar over the
 * actual schema produces 13 entities + 12 relations.
 */

import { describe, expect, it } from "vitest";
import { assembleDomainProfileFromSidecar } from "@fdpm/zod-bridge";
import { buildBusinessDeckSidecar } from "../../../plugins/acme_business_deck/sidecar.js";

describe("acme.business-deck — bridge mapping", () => {
  const sidecar = buildBusinessDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  it("emits 13 primitive types (one per declared entity)", () => {
    expect(result.profile.primitive_types.length).toBe(13);
  });

  it("emits 12 relation types (one per declared cross-entity reference)", () => {
    expect(result.profile.relation_types.length).toBe(12);
  });

  it("emits the expected entity primitive ids", () => {
    const ids = new Set(result.profile.primitive_types.map((p) => p.id));
    for (const expected of [
      "acme:Claim",
      "acme:Evidence",
      "acme:Risk",
      "acme:Option",
      "acme:Entity",
      "acme:VisualArtifact",
      "acme:Objection",
      "acme:PersuasionStrategy",
      "acme:Presenter",
      "acme:ExpectedQuestion",
      "acme:AudienceSegment",
      "acme:PainPoint",
      "acme:Slide",
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it("Slide identity is `slide_number` (the schema's non-id identity field)", () => {
    const slide = result.profile.primitive_types.find((p) => p.id === "acme:Slide");
    expect(slide).toBeDefined();
    const slideNumberField = slide!.fields.find((f) => f.name === "slide_number");
    expect(slideNumberField).toBeDefined();
    expect(slideNumberField!.kind).toBe("number");
    // No `id` field on Slide.
    expect(slide!.fields.find((f) => f.name === "id")).toBeUndefined();
  });

  it("emits Claim parent-self-reference relation as many-to-one with acyclic", () => {
    const rel = result.profile.relation_types.find(
      (r) =>
        r.source_type_id === "acme:Claim" &&
        r.target_type_id === "acme:Claim",
    );
    expect(rel).toBeDefined();
    expect(rel!.cardinality).toBe("many-to-one");
  });

  it("emits id_format on every primitive (host's profile compiler requires it)", () => {
    for (const p of result.profile.primitive_types) {
      expect(p.id_format).toBeDefined();
      expect(p.id_format.pattern_kind).toBe("template");
    }
  });
});
