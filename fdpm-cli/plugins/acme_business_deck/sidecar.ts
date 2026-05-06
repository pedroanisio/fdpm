/**
 * Business-deck plugin sidecar — single source of truth for the
 * bridge derivation, shared by activate() at runtime and
 * scripts/run-bridge.ts at build time.
 *
 * Per howto-zod-to-fdpm-plugin §4 (`example:bridge-entry-module`,
 * `decision:schema-as-source-of-truth`).
 *
 * Schema source: schemas/business-deck.ts (6811 lines, ported verbatim
 * from static/schemas/business-deck.ts). The schema covers business
 * presentation decks across pitch / exec update / board review /
 * investment case / regulatory briefing / customer business review.
 *
 * 12 entities are lifted to FDPM PrimitiveTypeDefs:
 *   11 by the {Name}IdSchema convention (Claim, Evidence, Risk,
 *   Option, Entity, VisualArtifact, Objection, PersuasionStrategy,
 *   Presenter, ExpectedQuestion, PainPoint), plus
 *   AudienceSegment (paired with SegmentIdSchema — name-mismatch
 *   forces the explicit override) and
 *   Slide (uses `slide_number: z.number()` as identity, not an `id`
 *   field with a brand).
 *
 * 12 cross-entity references lift to RelationTypeDefs.
 *
 * Three top-level superRefine validators in the source schema
 * (checkReferentialIntegrity, checkUniqueness, checkPostureAndDelivery)
 * lift to a deck-coherence cap:validator in index.ts — they walk
 * `context.workbook.primitives` for cross-deck invariants.
 *
 * One declared loss: the data-driven BuiltInBusinessConstraints catalog
 * (line 3046 of the schema) is structural in shape but rule-evaluation
 * is dynamic; the bridge cannot represent it as CEL. Per-entity Zod
 * constraints + the deck-coherence validator cover the structural
 * rules; the catalog is a soft layer on top.
 */

import { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import {
  AudienceSegmentSchema,
  ClaimIdSchema,
  ClaimSchema,
  EntityIdSchema,
  EntitySchema,
  EvidenceIdSchema,
  EvidenceSchema,
  ExpectedQuestionIdSchema,
  ExpectedQuestionSchema,
  ObjectionIdSchema,
  ObjectionSchema,
  OptionIdSchema,
  OptionSchema,
  PainPointIdSchema,
  PainPointSchema,
  PersuasionStrategyIdSchema,
  PersuasionStrategySchema,
  PresenterIdSchema,
  PresenterSchema,
  RiskIdSchema,
  RiskSchema,
  SegmentIdSchema,
  SlideSchema,
  VisualArtifactIdSchema,
  VisualArtifactSchema,
} from "./schemas/business-deck.js";

export const PROFILE_ID = "profile:acme-business-deck:0.1" as const;
export const PLUGIN_ID = "acme.business-deck" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

/**
 * Slide uses an integer `slide_number` as identity rather than a
 * branded id field. We omit `idSchema` to skip the bridge's
 * reference-equality check (a fresh `z.number().int().positive()`
 * here would not match the schema's _def by reference). The
 * identity-resolution layer in the bridge accepts the field name
 * alone for non-string identities; the host's id_format pattern
 * uses the slide_number as the slug.
 */
export function buildBusinessDeckSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Claim: { schema: ClaimSchema, identityKind: "id-field", idField: "id", idSchema: ClaimIdSchema },
      Evidence: { schema: EvidenceSchema, identityKind: "id-field", idField: "id", idSchema: EvidenceIdSchema },
      Risk: { schema: RiskSchema, identityKind: "id-field", idField: "id", idSchema: RiskIdSchema },
      Option: { schema: OptionSchema, identityKind: "id-field", idField: "id", idSchema: OptionIdSchema },
      // EntitySchema is the information-architecture entity (line 918);
      // not to be confused with the FDPM primitive notion of "entity".
      Entity: { schema: EntitySchema, identityKind: "id-field", idField: "id", idSchema: EntityIdSchema },
      VisualArtifact: { schema: VisualArtifactSchema, identityKind: "id-field", idField: "id", idSchema: VisualArtifactIdSchema },
      Objection: { schema: ObjectionSchema, identityKind: "id-field", idField: "id", idSchema: ObjectionIdSchema },
      PersuasionStrategy: { schema: PersuasionStrategySchema, identityKind: "id-field", idField: "id", idSchema: PersuasionStrategyIdSchema },
      Presenter: { schema: PresenterSchema, identityKind: "id-field", idField: "id", idSchema: PresenterIdSchema },
      ExpectedQuestion: { schema: ExpectedQuestionSchema, identityKind: "id-field", idField: "id", idSchema: ExpectedQuestionIdSchema },
      // AudienceSegment paired with SegmentIdSchema — name mismatch
      // forces the explicit-entities override beyond the
      // {Name}IdSchema convention. SPEC-FDPM-BRIDGE-ZOD §5.1 sanctions
      // this case via the entities[] explicit list.
      AudienceSegment: { schema: AudienceSegmentSchema, identityKind: "id-field", idField: "id", idSchema: SegmentIdSchema },
      PainPoint: { schema: PainPointSchema, identityKind: "id-field", idField: "id", idSchema: PainPointIdSchema },
      // Slide carries no `id` field; identity is the integer
      // slide_number. Omit idSchema (the bridge's reference-equality
      // check would fail on a fresh z.number().int().positive() here).
      Slide: { schema: SlideSchema, identityKind: "id-field", idField: "slide_number" },
    },
    references: [
      // Self-referential parent claim — directed acyclic to prevent
      // claim-support cycles.
      { from: "Claim", field: "parent_claim_id", to: "Claim", cardinality: "many-to-one", acyclic: true },
      // Evidence supports claims (m:m). Inverse computed by the deck-
      // coherence validator since Claim doesn't carry a back-reference
      // field in the source schema.
      { from: "Evidence", field: "claims_supported", to: "Claim", cardinality: "many-to-many" },
      // Slide cross-references — m:m fan-out into claim/evidence/objection.
      { from: "Slide", field: "supports_claim_ids", to: "Claim", cardinality: "many-to-many" },
      { from: "Slide", field: "uses_evidence_ids", to: "Evidence", cardinality: "many-to-many" },
      { from: "Slide", field: "addresses_objection_ids", to: "Objection", cardinality: "many-to-many" },
      // Option cross-references.
      { from: "Option", field: "risk_ids", to: "Risk", cardinality: "many-to-many" },
      { from: "Option", field: "differentiation_claim_ids", to: "Claim", cardinality: "many-to-many" },
      // Presenter and ExpectedQuestion — speaker-plan + qa-plan layers.
      { from: "Presenter", field: "speaks_for_claim_ids", to: "Claim", cardinality: "many-to-many" },
      { from: "ExpectedQuestion", field: "addresses_objection_id", to: "Objection", cardinality: "many-to-one" },
      { from: "ExpectedQuestion", field: "references_evidence_ids", to: "Evidence", cardinality: "many-to-many" },
      // Audience-segment edges — Objection sources, PainPoint targeting.
      { from: "Objection", field: "source_segment_id", to: "AudienceSegment", cardinality: "many-to-one" },
      { from: "PainPoint", field: "affected_persona_ids", to: "AudienceSegment", cardinality: "many-to-many" },
    ],
    // No discriminated unions in this schema; declare empty variants[]
    // so the helper functions below typecheck under
    // strictPropertyInitialization. The runtime cost is zero.
    variants: [],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: "acme",
      profileId: PROFILE_ID,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
    },
  });
}

/**
 * Per pitch-deck convention: this plugin has no variant-per-primitive
 * fan-out (no z.discriminatedUnion in the schema). Both helpers exist
 * only because the runtime registration loop and the manifest-parity
 * test reuse them; for business-deck both return empty results.
 */
export function variantFieldsByEntity(
  sidecar: ReturnType<typeof buildBusinessDeckSidecar>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // Cast widens the empty-array type. The schema has no
  // z.discriminatedUnion so this loop is empty in practice.
  const variants = (sidecar as unknown as {
    variants?: ReadonlyArray<{ from: string; field: string; strategy: string }>;
  }).variants ?? [];
  for (const v of variants) {
    if (v.strategy !== "variant-per-primitive") continue;
    if (!out.has(v.from)) out.set(v.from, new Set());
    out.get(v.from)!.add(v.field);
  }
  return out;
}

export function validatorSchemaFor(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entitySchema: any,
  variantFields: Map<string, Set<string>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const drop = variantFields.get(entityName);
  if (!drop || drop.size === 0) return entitySchema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const omitFn = (entitySchema as any).omit?.bind(entitySchema);
  if (!omitFn) return entitySchema;
  return omitFn(
    Object.fromEntries(Array.from(drop).map((f) => [f, true as const])),
  );
}
