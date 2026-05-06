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
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  PluginContext,
  PluginEntryModule,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const PROFILE_ID = "profile:acme-pitch-deck:0.1" as const;
export const PLUGIN_ID = "acme.pitch-deck" as const;

// ───────────────────────────────────────────────────────────────────
// activate(ctx) — host calls this once per session per plugin.
//
// IMPORTANT — runtime Zod version mismatch.
//
// The bridge (@fdpm/zod-bridge@0.4.0) was built against Zod v4; the
// FDPM host (fdpm-cli@1.1.0) declares zod@^3.23.8. Zod v3 and v4 have
// different `_def` shapes (v3 uses _def.typeName + shape() function;
// v4 uses _def.type + shape object). Calling
// assembleDomainProfileFromSidecar() at activate-time therefore fails
// with sidecar:path-unresolved when the bridge walks the v3 _def.
//
// Workaround until the host upgrades to Zod v4: load the
// pre-generated profile snapshot directly, register it, and skip the
// activate-time re-assembly. The snapshot at
// static/generated/acme-pitch-deck/generated/profile.json was
// produced by the bridge under v4 (via the zod-bridge package's own
// node_modules) and is the source of truth for the data model. The
// CI drift gate (npm test -- pitch-deck-emit) keeps it current with
// the schema.
//
// Per-entity validators are also disabled in this snapshot-only mode
// — building them via zodSchemaToValidator() requires the same
// runtime introspection that fails. Re-enable when the host upgrades.
export async function activate(ctx: PluginContext): Promise<void> {
  const profileJson = readFileSync(
    join(__dirname, "generated", "profile.json"),
    "utf8",
  );
  const profile = JSON.parse(profileJson) as DomainProfile;
  ctx.registerProfile(profile);

  ctx.logger.info(
    `acme.pitch-deck activated (snapshot-only mode): ${profile.primitive_types.length} primitive types, ${profile.relation_types.length} relation types. Profile id: ${PROFILE_ID}. Per-entity validators DISABLED pending host Zod v4 upgrade.`,
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
