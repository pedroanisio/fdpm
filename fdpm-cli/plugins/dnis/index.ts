/**
 * DNIS plugin entry point — built-in profile per SPEC-CORE §5.6.
 *
 * Profile id: profile:dnis:0.1
 * Ships:
 *   - 2 primitive types (dnis:Document, dnis:Node) under cat:dnis:document
 *   - 2 relation types (dnis:DerivedFrom, dnis:MigratedFrom)
 *   - 1 scope (scope:dnis:document)
 *
 * No renderers, validators, or transformers in this revision; the
 * runtime contract for DNIS Operations lives in src/core/dnis/adapter.ts
 * (the host adapter), which uses these types as its persistence shape.
 *
 * SPEC-CORE §5.6.7: plugins MAY read DNIS primitives via standard
 * primitive read paths but MUST NOT register types whose ids collide
 * with `dnis:*`, contribute alternative adapters, or bypass the host
 * adapter to write `dnis:*` primitives directly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  DomainProfile,
  PrimitiveTypeDef,
  RelationTypeDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { CATEGORIES } from "./categories.js";
import { SCOPES, SCOPE_SETS, DEFAULT_SCOPE_SET } from "./scopes.js";
import { ALL_PRIMITIVES } from "./primitives.js";
import { RELATIONS } from "./relations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROFILE_ID = "profile:dnis:0.1" as const;
export const SCOPE_IDS = {
  document: "scope:dnis:document",
} as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "DNIS",
  label: "Document Node Identity",
  description:
    "Document Node Identity profile per SPEC-CORE §5.6 (which adopts SPEC-DNIS as a normative extension of §5). Registers the primitive types (dnis:Document, dnis:Node) and relation types (dnis:DerivedFrom, dnis:MigratedFrom) that the runtime adapter (src/core/dnis/adapter.ts) materialises SPEC-DNIS Operations into.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS as RelationTypeDef[],
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  ctx.logger.info(
    `dnis activated: ${ALL_PRIMITIVES.length} primitive types (dnis:Document, dnis:Node), ${RELATIONS.length} relation types (dnis:DerivedFrom, dnis:MigratedFrom). Profile id: ${PROFILE_ID}.`,
  );
}

export function onInstall(ctx: PluginContext): void {
  ctx.logger.debug(`on-install fired for ${ctx.pluginId}`);
}

export function onEnable(ctx: PluginContext): void {
  ctx.logger.debug(`on-enable fired for ${ctx.pluginId}`);
}

export function onDisable(ctx: PluginContext): void {
  ctx.logger.debug(`on-disable fired for ${ctx.pluginId}`);
}

export function onUninstall(ctx: PluginContext): void {
  ctx.logger.debug(`on-uninstall fired for ${ctx.pluginId}`);
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

// Avoid unused-import error on PrimitiveTypeDef when ALL_PRIMITIVES is
// the only consumer; the explicit re-export keeps it in the public surface
// for downstream callers wanting to introspect the registered types.
export type { PrimitiveTypeDef };
