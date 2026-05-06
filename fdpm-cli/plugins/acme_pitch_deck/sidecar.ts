/**
 * Pitch-deck plugin sidecar — single source of truth for the bridge
 * derivation, shared by activate() at runtime and scripts/run-bridge.ts
 * at build time.
 *
 * Per howto-zod-to-fdpm-plugin §4 (`example:bridge-entry-module`,
 * `decision:schema-as-source-of-truth`): the sidecar describes which
 * Zod schemas are FDPM Entities, the cross-entity references the
 * schema's superRefine validates, and the variant-per-primitive fan-out
 * for `Slide.visual`.
 *
 * Runtime calls assembleDomainProfileFromSidecar(buildPitchDeckSidecar())
 * and registers the resulting profile + per-entity validators. Build
 * time calls the same function and writes generated/* to disk via the
 * bridge's writeArtefactsToDir + writePluginScaffold.
 */

import { z } from "zod";
import { defineDomain } from "@fdpm/zod-bridge";
import { Schemas } from "./schemas/pitch-deck.schema.v2.js";

export const PROFILE_ID = "profile:acme-pitch-deck:0.1" as const;
export const PLUGIN_ID = "acme.pitch-deck" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

/**
 * Map from entity name → set of fields the bridge has been told to
 * fan out to sibling primitives (variant-per-primitive). Both
 * activate() and the manifest-parity test need to compute the
 * "validator schema" for a parent entity by omitting its variant
 * fields; centralising the calculation here keeps them in sync.
 */
export function variantFieldsByEntity(
  sidecar: ReturnType<typeof buildPitchDeckSidecar>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const v of sidecar.variants ?? []) {
    if (v.strategy !== "variant-per-primitive") continue;
    if (!out.has(v.from)) out.set(v.from, new Set());
    out.get(v.from)!.add(v.field);
  }
  return out;
}

/**
 * The Zod schema that should be fed to zodSchemaToValidator and
 * enumerateRuleIds for the parent entity. After variant-per-primitive
 * fan-out, the parent's emitted PrimitiveTypeDef no longer carries
 * the variant field — so the runtime validator must not enforce its
 * presence and the manifest's closed rule_id set must not contain
 * rules for it.
 */
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

export function buildPitchDeckSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Audience: { schema: Schemas.Audience, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Source: { schema: Schemas.Source as unknown as z.ZodObject<z.ZodRawShape>, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      DataPoint: { schema: Schemas.DataPoint, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      StrategicClaim: { schema: Schemas.Claim, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Risk: { schema: Schemas.Risk, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Competitor: { schema: Schemas.Competitor, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      AntiPattern: { schema: Schemas.AntiPattern, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Slide: { schema: Schemas.Slide, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
    },
    references: [
      { from: "DataPoint", field: "sourceIds", to: "Source", cardinality: "many-to-many" },
      { from: "Slide", field: "evidenceUsed", to: "DataPoint", cardinality: "many-to-many",
        inverse: { on: "DataPoint", field: "usedOnSlides" } },
      { from: "StrategicClaim", field: "supportedByDataPoints", to: "DataPoint", cardinality: "many-to-many" },
      { from: "StrategicClaim", field: "supportedByClaims", to: "StrategicClaim", cardinality: "many-to-many", acyclic: true },
      { from: "Slide", field: "claimsAdvanced", to: "StrategicClaim", cardinality: "many-to-many",
        inverse: { on: "StrategicClaim", field: "appearsOnSlides" } },
      { from: "Slide", field: "risksAddressed", to: "Risk", cardinality: "many-to-many",
        inverse: { on: "Risk", field: "addressedOnSlides" } },
      { from: "Slide", field: "competitorsCited", to: "Competitor", cardinality: "many-to-many" },
      { from: "Slide", field: "antiPatternsAvoided", to: "AntiPattern", cardinality: "many-to-many" },
    ],
    variants: [
      { from: "Slide", field: "visual", discriminator: "kind", strategy: "variant-per-primitive" },
    ],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: "acme",
      profileId: PROFILE_ID,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
    },
  });
}
