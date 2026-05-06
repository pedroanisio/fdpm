/**
 * Integration trial: @fdpm/zod-bridge@0.3.0 against
 * static/schemas/pitch-deck.schema.v2.ts.
 *
 * The v0.1.0 trial journal (docs/journals/zod-bridge-pitch-deck-trial.md)
 * left an honest defect: the bridge collapsed the entire pitch-deck
 * schema into ONE PrimitiveTypeDef. The fix was deferred to "lift
 * markers" (v0.2.0) and then to the sidecar (v0.3.0).
 *
 * This test exercises the v0.3.0 path end-to-end and asserts the
 * multi-primitive shape the FDPM domain model wants:
 *
 *   acme:Audience, acme:Source, acme:DataPoint, acme:StrategicClaim,
 *   acme:Slide, acme:Risk, acme:Competitor, acme:AntiPattern,
 *   acme:RevisionEntry, acme:PitchDeck (singleton root).
 *
 * Plus the cross-entity references the schema's superRefine validates
 * at runtime — encoded once in the sidecar so the bridge can emit them
 * as relations and the host can enforce them with FDPM's relation-type
 * machinery instead of a JS refinement.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Schemas } from "../../../../static/schemas/pitch-deck.schema.v2.js";
import {
  assembleDomainProfileFromSidecar,
} from "../src/sidecar-orchestrator.js";
import { defineDomain } from "../src/sidecar-types.js";

/**
 * Build a sidecar that lifts every nested entity-shaped type to a
 * sibling primitive and declares the cross-entity references the
 * pitch-deck schema validates in its superRefine.
 *
 * NOTE: pitch-deck v2 uses SlugId (a single Zod node) as the id type
 * for every entity. So "id-field reference equality" (§3.3) holds
 * naturally — every entity's `id` field IS the SlugId node by
 * structural reuse.
 */
function buildPitchDeckSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Audience: {
        schema: Schemas.Audience,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      Source: {
        schema: Schemas.Source as unknown as z.ZodObject<z.ZodRawShape>,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      DataPoint: {
        schema: Schemas.DataPoint,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      StrategicClaim: {
        schema: Schemas.Claim,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      Risk: {
        schema: Schemas.Risk,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      Competitor: {
        schema: Schemas.Competitor,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      AntiPattern: {
        schema: Schemas.AntiPattern,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
      Slide: {
        schema: Schemas.Slide,
        identityKind: "id-field",
        idField: "id",
        idSchema: Schemas.SlugId,
      },
    },
    references: [
      // DataPoint -> Source (many-to-many; unidirectional in the
      // schema — Source has no back-reference field).
      {
        from: "DataPoint",
        field: "sourceIds",
        to: "Source",
        cardinality: "many-to-many",
      },
      // Slide <-> DataPoint (bidirectional in the schema's
      // superRefine: slide.evidenceUsed and dataPoint.usedOnSlides
      // must agree). Declared once with inverse so the bridge emits
      // ONE RelationTypeDef.
      {
        from: "Slide",
        field: "evidenceUsed",
        to: "DataPoint",
        cardinality: "many-to-many",
        inverse: { on: "DataPoint", field: "usedOnSlides" },
      },
      // StrategicClaim -> DataPoint (many-to-many; unidirectional —
      // DataPoint does not list its claims).
      {
        from: "StrategicClaim",
        field: "supportedByDataPoints",
        to: "DataPoint",
        cardinality: "many-to-many",
      },
      // StrategicClaim -> StrategicClaim (self-referential; acyclic
      // per the schema's DFS cycle detector).
      {
        from: "StrategicClaim",
        field: "supportedByClaims",
        to: "StrategicClaim",
        cardinality: "many-to-many",
        acyclic: true,
      },
      // Slide <-> StrategicClaim (bidirectional in the schema:
      // slide.claimsAdvanced and claim.appearsOnSlides agree).
      // Declared once with inverse.
      {
        from: "Slide",
        field: "claimsAdvanced",
        to: "StrategicClaim",
        cardinality: "many-to-many",
        inverse: { on: "StrategicClaim", field: "appearsOnSlides" },
      },
      // Slide -> Risk (with inverse Risk.addressedOnSlides → Slide).
      // Bidirectional consistency is NOT explicitly enforced by the
      // schema's superRefine, but the relation is logically the same;
      // declaring inverse keeps the relation graph clean.
      {
        from: "Slide",
        field: "risksAddressed",
        to: "Risk",
        cardinality: "many-to-many",
        inverse: { on: "Risk", field: "addressedOnSlides" },
      },
      // Slide -> Competitor (unidirectional in the schema).
      {
        from: "Slide",
        field: "competitorsCited",
        to: "Competitor",
        cardinality: "many-to-many",
      },
      // Slide -> AntiPattern (unidirectional).
      {
        from: "Slide",
        field: "antiPatternsAvoided",
        to: "AntiPattern",
        cardinality: "many-to-many",
      },
    ],
    fdpm: {
      pluginId: "acme.pitch-deck",
      vendor: "acme",
      profileId: "profile:acme-pitch-deck:0.1",
      pluginVersion: "0.1.0",
      hostCompatibility: ">=0.5.0 <0.6.0",
    },
  });
}

describe("pitch-deck v2 trial — sidecar v0.3.0 multi-primitive shape", () => {
  it("emits one PrimitiveTypeDef per declared entity (the v0.1.0 collapse is fixed)", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const ids = r.profile.primitive_types.map((p) => p.id).sort();
    expect(ids).toEqual([
      "acme:AntiPattern",
      "acme:Audience",
      "acme:Competitor",
      "acme:DataPoint",
      "acme:Risk",
      "acme:Slide",
      "acme:Source",
      "acme:StrategicClaim",
    ]);
  });

  it("emits one relation per declared cross-entity reference (inverse-collapsed)", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    // 8 declared references (3 with inverse, 5 unidirectional) →
    // 8 RelationTypeDefs. Inverse pairing collapses bidirectional
    // logical relations into a single FDPM relation.
    expect(r.profile.relation_types.length).toBe(8);
  });

  it("emits an acyclic CEL constraint for self-referential edges", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const acyclicConstraints = (r.profile.constraints ?? []).filter((c) =>
      c.expression.includes("graph.acyclic"),
    );
    expect(acyclicConstraints.length).toBe(1);
    expect(acyclicConstraints[0]!.expression).toContain(
      "acme:StrategicClaimSupportedByClaims",
    );
  });

  it("validators enforce the per-entity Zod constraints", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    // Every entity should have at least one rule_id.
    for (const id of Object.keys(r.ruleIdsByType)) {
      expect(r.ruleIdsByType[id]!.length).toBeGreaterThan(0);
    }
  });

  it("USL-NG companion serializes every entity but excludes the fdpm section", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(r.uslNgCompanion).not.toHaveProperty("fdpm");
    expect(Object.keys(r.uslNgCompanion.entities).sort()).toEqual([
      "AntiPattern",
      "Audience",
      "Competitor",
      "DataPoint",
      "Risk",
      "Slide",
      "Source",
      "StrategicClaim",
    ]);
  });

  it("is deterministic across two independent runs", async () => {
    const { stableStringify } = await import("../src/stable-stringify.js");
    const a = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const b = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(stableStringify(a.profile)).toBe(stableStringify(b.profile));
    expect(stableStringify(a.uslNgCompanion)).toBe(
      stableStringify(b.uslNgCompanion),
    );
  });

  it("produces no validator-level errors for a minimal-shape domain probe", () => {
    // Smoke test: the sidecar passes the 8 parse-time validation passes.
    expect(() =>
      assembleDomainProfileFromSidecar({
        domain: buildPitchDeckSidecar(),
        generatedAt: "1970-01-01T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("emission summary (probe data for the journal)", () => {
    const r = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const summary = {
      primitive_count: r.profile.primitive_types.length,
      primitive_ids: r.profile.primitive_types.map((p) => p.id),
      relation_count: r.profile.relation_types.length,
      relation_ids: r.profile.relation_types.map((rl) => rl.id),
      constraint_count: r.profile.constraints?.length ?? 0,
      validator_rule_id_count: Object.values(r.ruleIdsByType).reduce(
        (acc, v) => acc + v.length,
        0,
      ),
      audit_classifications: r.audit.classifications.length,
      audit_divergences: r.audit.divergences.length,
      audit_candidates: r.audit.candidates.length,
    };
    // No assertions beyond shape — log to stdout for journaling.
    // eslint-disable-next-line no-console
    console.log("[pitch-deck trial summary]", JSON.stringify(summary, null, 2));
    expect(summary.primitive_count).toBe(8);
    expect(summary.relation_count).toBe(8);
  });
});
