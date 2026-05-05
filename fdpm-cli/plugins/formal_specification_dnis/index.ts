/**
 * formal-specification-dnis composition profile.
 *
 * Profile id: profile:formal-specification-dnis:0.1
 *
 * What this is: a profile that `extends` both
 * profile:formal-specification:3.0 and profile:dnis:0.1. It contributes
 * no primitive types, no relation types, and no scopes of its own; the
 * §4.3 profile-resolution merge (src/core/profile/registry.ts) flattens
 * the extends chain at resolve time and the resulting profile registers
 * every primitive/relation/scope from both parents.
 *
 * What this enables: a single SPEC-CORE project can hold both
 *   - formal_specification's typed primitives (fs:Phase, fs:Equation,
 *     fs:Citation, fs:FormalProperty, ...) — the typed records the
 *     fs:SpecRenderer family dispatches on, and
 *   - DNIS's typed primitives (dnis:Document, dnis:Node) plus the
 *     dnis:DerivedFrom / dnis:MigratedFrom relations — the graph the
 *     renderers' new DNIS path walks for §N.M.K numbering.
 *
 * Why this lives as a separate plugin: blast-radius. Adding `extends`
 * to plugins/formal_specification/index.ts directly would couple every
 * existing formal-specification project to the dnis plugin. A
 * composition profile is opt-in — only build scripts that explicitly
 * target this profile's id pull in the DNIS surface. Existing scripts
 * continue to use profile:formal-specification:3.0 verbatim.
 *
 * Renderer behaviour: the existing markdown / html / pdf renderers
 * already detect a dnis:Document + active dnis:Node sections at render
 * time (via buildDocumentTreeAuto in renderers/_common.ts) and DFS the
 * graph; this profile is what gives a project access to the dnis:*
 * primitives in the first place.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROFILE_ID = "profile:formal-specification-dnis:0.1" as const;
export const PARENT_FORMAL_SPECIFICATION = "profile:formal-specification:3.0" as const;
export const PARENT_DNIS = "profile:dnis:0.1" as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Formal-Specification DNIS Composition",
  label: "Formal-Specification + DNIS",
  description:
    "Composition profile extending profile:formal-specification:3.0 and profile:dnis:0.1. A project on this profile can hold both formal_specification's typed primitives and a DNIS Node tree for graph-derived section numbering. Contributes no types of its own.",
  // Resolution order matters only for collision diagnostics; the two
  // parent profiles use disjoint id namespaces (fs:* vs. dnis:*) so no
  // collisions are possible.
  extends: [PARENT_FORMAL_SPECIFICATION, PARENT_DNIS],
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
    `formal-specification-dnis activated: composition profile ${PROFILE_ID} extends ${PARENT_FORMAL_SPECIFICATION} + ${PARENT_DNIS}.`,
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
