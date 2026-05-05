/**
 * spec-authoring-dnis composition profile.
 *
 * Profile id: profile:spec-authoring-dnis:0.1
 *
 * What this is: a profile that `extends` both profile:spec-authoring:0.1
 * and profile:dnis:0.1. It contributes no primitive types, no relation
 * types, and no scopes of its own; the §4.3 profile-resolution merge
 * (src/core/profile/registry.ts) flattens the extends chain at resolve
 * time and the resulting profile registers every primitive/relation/
 * scope from both parents.
 *
 * What this enables: a single SPEC-CORE workbook can hold both
 *   - spec-authoring's typed primitives (spec:Document, spec:Stakeholder,
 *     spec:Term, spec:Reference, spec:ADR, ...) — the typed records the
 *     spec_md renderer dispatches on, and
 *   - DNIS's typed primitives (dnis:Document, dnis:Node) plus the
 *     dnis:DerivedFrom / dnis:MigratedFrom relations — the graph the
 *     renderer's new DNIS path walks for §N.M.K numbering.
 *
 * Why this lives as a separate plugin: blast-radius. Adding `extends`
 * to plugins/spec_authoring/index.ts directly would couple every
 * existing spec-authoring workbook to the dnis plugin. A composition
 * profile is opt-in — only build scripts that explicitly target this
 * profile's id pull in the DNIS surface. Existing build-spec-*.ts
 * scripts continue to use profile:spec-authoring:0.1 verbatim.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROFILE_ID = "profile:spec-authoring-dnis:0.1" as const;
export const PARENT_SPEC_AUTHORING = "profile:spec-authoring:0.1" as const;
export const PARENT_DNIS = "profile:dnis:0.1" as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Spec-Authoring DNIS Composition",
  label: "Spec-Authoring + DNIS",
  description:
    "Composition profile extending profile:spec-authoring:0.1 and profile:dnis:0.1. A workbook on this profile can hold both spec-authoring's typed primitives and a DNIS Node tree for graph-derived section numbering. Contributes no types of its own.",
  // Resolution order matters only for collision diagnostics; the two
  // parent profiles use disjoint id namespaces (spec:* vs. dnis:*) so
  // no collisions are possible.
  extends: [PARENT_SPEC_AUTHORING, PARENT_DNIS],
  categories: [],
  scopes: [],
  primitive_types: [],
  relation_types: [],
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  ctx.logger.info(
    `spec-authoring-dnis activated: composition profile ${PROFILE_ID} extends ${PARENT_SPEC_AUTHORING} + ${PARENT_DNIS}.`,
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
