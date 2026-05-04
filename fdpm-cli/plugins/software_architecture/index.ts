/**
 * Software Architecture plugin (port of
 * src/fdpm/plugins/software_architecture.py).
 *
 * Decomposed per SPEC-PLUGGABLE §6.1 / §9.1:
 *   - one file per primitive category
 *   - relations.ts, validation_rules.ts, renderer_bindings.ts, templates.ts
 *   - _common.ts holds the FieldDef helpers (with stableId() for the
 *     entity references used by State/Transition/FailureMode/Contract/Event)
 *   - this file is the entry point; it assembles the DomainProfile and
 *     exports `manifest`, `activate`, and lifecycle hooks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  DomainProfile,
  PrimitiveTypeDef,
  RelationTypeDef,
  RendererBinding,
  TemplateDef,
  ValidationRuleDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { CATEGORIES } from "./categories.js";
import { SCOPES, SCOPE_SETS, DEFAULT_SCOPE_SET } from "./scopes.js";
import { IDENTITY_PRIMITIVES } from "./primitives/identity.js";
import { SEMANTICS_PRIMITIVES } from "./primitives/semantics.js";
import { BEHAVIOR_PRIMITIVES } from "./primitives/behavior.js";
import { INTERFACE_PRIMITIVES } from "./primitives/interface.js";
import { EVIDENCE_PRIMITIVES } from "./primitives/evidence.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { RENDERER_BINDINGS } from "./renderer_bindings.js";
import { TEMPLATES } from "./templates.js";
import { renderOpenApi } from "./renderers/openapi.js";
import { renderAdr } from "./renderers/adr.js";
import { registerSoftwareArchitectureCapabilities } from "./_capabilities.js";

export { renderOpenApi, renderAdr };

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  ...IDENTITY_PRIMITIVES,
  ...SEMANTICS_PRIMITIVES,
  ...BEHAVIOR_PRIMITIVES,
  ...INTERFACE_PRIMITIVES,
  ...EVIDENCE_PRIMITIVES,
];

/**
 * Stable string constants exposed for SDK consumers. Hard-coding these
 * ids in user code (e.g. scripts/build-cli-architecture.ts) is fragile;
 * importing PROFILE_ID gives a refactor-safe handle. SCOPE_IDS lists
 * the four scopes this profile declares.
 */
export const PROFILE_ID = "profile:software-architecture:1.0" as const;
export const SCOPE_IDS = {
  domain: "scope:sw:domain",
  runtime: "scope:sw:runtime",
  deployment: "scope:sw:deployment",
  organizational: "scope:sw:organizational",
} as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "1.0.0",
  name: "Software Architecture",
  label: "Software Architecture",
  description:
    "Primitives, relations, and validation rules for documenting software systems including domain models, services, APIs, state machines, decisions, and operational behavior.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS as RelationTypeDef[],
  validation_rules: VALIDATION_RULES as ValidationRuleDef[],
  renderer_bindings: [],
  renderers: RENDERER_BINDINGS as RendererBinding[],
  inline_structs: [],
  templates: TEMPLATES as TemplateDef[],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  ctx.registerRenderer({
    target: "application/x-yaml",
    rendererId: "sw:OpenAPIRenderer",
    fn: renderOpenApi,
  });
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: "sw:ADRRenderer",
    fn: renderAdr,
  });
  registerSoftwareArchitectureCapabilities(ctx);
  ctx.logger.info(
    `software-architecture activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} CEL rules + 3 cap:validator implementations, 2 renderers (sw:OpenAPIRenderer/yaml, sw:ADRRenderer/md), 1 expr-helper, 1 transformer, 1 importer (sw-jsonl), 1 exporter (sw-jsonl)`,
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
