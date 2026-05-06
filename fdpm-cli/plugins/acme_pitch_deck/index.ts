/**
 * acme.pitch-deck plugin entry point.
 *
 * This file is the runtime glue between @fdpm/zod-bridge@0.4.0 and the
 * FDPM host. The plugin's data model (8 entities, 8 relations, 103 CEL
 * rules) is auto-derived from `static/schemas/pitch-deck.schema.v2.ts`
 * via a hand-authored sidecar; this file binds the derived
 * DomainProfile + per-entity validators into the host's
 * PluginContext.
 *
 * What is hand-authored here (per @PURPOSE.md and the
 * howto-zod-to-fdpm-plugin workbook §7): the sidecar shape, the
 * activate() registration sequence, and the choice of which optional
 * capabilities to wire in. Everything else is a deterministic function
 * of the schema.
 *
 * What is generated (NOT in this file):
 *   - PrimitiveTypeDefs (8) and RelationTypeDefs (8) — bridge.
 *   - 103 CEL field-validation rules — bridge.
 *   - Per-entity Zod validator closures + closed-set rule_ids — bridge.
 *   - The fdpm-plugin.json manifest — bridge wrote it; we copied it in.
 *
 * Cross-deck invariants (audience-coverage, time-budget, source
 * freshness, slide displayNumber contiguity) live in the schema's
 * superRefine. They are NOT lifted to CEL by the bridge (they exceed
 * the 23-rule table). This plugin runs the schema's full safeParse via
 * the per-entity validators registered below.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  assembleDomainProfileFromSidecar,
  defineDomain,
  zodSchemaToValidator,
} from "@fdpm/zod-bridge";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  PluginContext,
  PluginEntryModule,
  ValidatorFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { Schemas } from "./schemas/pitch-deck.schema.v2.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const PROFILE_ID = "profile:acme-pitch-deck:0.1" as const;
export const PLUGIN_ID = "acme.pitch-deck" as const;

// ───────────────────────────────────────────────────────────────────
// Sidecar — declares which Zod schemas are FDPM Entities and the
// cross-entity references the schema's superRefine validates.
// Stays in sync with schemas/pitch-deck.schema.v2.ts (the plugin's
// owned copy of static/schemas/pitch-deck.schema.v2.ts).
// ───────────────────────────────────────────────────────────────────

function buildSidecar() {
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
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: "acme",
      profileId: PROFILE_ID,
      pluginVersion: "0.1.0",
      hostCompatibility: ">=1.1,<2",
    },
  });
}

// ───────────────────────────────────────────────────────────────────
// activate(ctx) — host calls this once per session per plugin.
//
// We assemble the profile fresh at activate-time. Both the host and the
// bridge run on Zod v4, so the bridge's `_def`-walker reads the live
// schema correctly. The static snapshot at
// static/generated/acme-pitch-deck/generated/profile.json remains the
// human-reviewable artefact and the CI drift gate; this code does NOT
// read it (the schema is the source of truth).
// ───────────────────────────────────────────────────────────────────

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z", // determinism — not a real timestamp
  });

  // The bridge's DomainProfile has a slightly broader shape than the
  // host's (the bridge tracks bridge-internal extras). A JSON round-trip
  // strips those and gives the host the exact shape its compiler
  // accepts.
  const profile = JSON.parse(JSON.stringify(result.profile)) as DomainProfile;
  ctx.registerProfile(profile);

  // Per-entity validators. The bridge returns one closure per schema;
  // we register one (type_id, rule_id) entry per entity, keyed by the
  // canonical `acme:val:<entity>-zod` rule_id.
  for (const [entityName, entity] of Object.entries(sidecar.entities)) {
    const typeId = `acme:${entityName}`;
    const ruleId = `acme:val:${entityName.toLowerCase()}-zod`;
    const { validator } = zodSchemaToValidator(entity.schema, {
      pluginId: PLUGIN_ID,
      typeName: entityName.toLowerCase(),
    });
    const adapted: ValidatorFn = (instance) => {
      const findings = validator({
        id: instance.id,
        type_id: instance.type_id,
        field_values:
          (instance as { field_values?: Record<string, unknown> }).field_values ?? {},
      });
      return findings.map((f) => ({
        rule_id: f.rule_id,
        level: f.level === "warning" ? "warning" : "error",
        target_id: instance.id,
        message: f.message,
        ...(f.path && f.path.length > 0 ? { field_path: f.path.join(".") } : {}),
      })) as never;
    };
    ctx.registerValidator({ type_id: typeId, rule_id: ruleId, fn: adapted });
  }

  ctx.logger.info(
    `acme.pitch-deck activated: ${result.profile.primitive_types.length} primitive types, ${result.profile.relation_types.length} relation types, ${(result.profile.constraints ?? []).length} CEL rules + 8 cap:validator. Profile id: ${PROFILE_ID}.`,
  );
}

export function onInstall(ctx: PluginContext): void {
  ctx.logger.debug(`onInstall fired for ${ctx.pluginId}`);
}
export function onEnable(ctx: PluginContext): void {
  ctx.logger.debug(`onEnable fired for ${ctx.pluginId}`);
}
export function onDisable(ctx: PluginContext): void {
  ctx.logger.debug(`onDisable fired for ${ctx.pluginId}`);
}
export function onUninstall(ctx: PluginContext): void {
  ctx.logger.debug(`onUninstall fired for ${ctx.pluginId}`);
}
export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = {
  manifest,
  activate,
  onInstall,
  onEnable,
  onDisable,
  onUninstall,
  deactivate,
};
export default entry;
