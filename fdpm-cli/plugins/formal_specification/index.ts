/**
 * Formal Specification plugin (port of src/fdpm/plugins/formal_specification.py).
 *
 * Decomposed per SPEC-PLUGGABLE §6.1 / §9.1:
 *   - one file per primitive category
 *   - relations/, validation_rules.ts, renderer_bindings.ts, templates.ts
 *   - _common.ts holds the FieldDef helpers
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
  ValidationRuleDef,
  RendererBinding,
  TemplateDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { CATEGORIES } from "./categories.js";
import { SCOPES, SCOPE_SETS, DEFAULT_SCOPE_SET } from "./scopes.js";
import { STRUCTURE_PRIMITIVES } from "./primitives/structure.js";
import { TYPE_SYSTEM_PRIMITIVES } from "./primitives/type_system.js";
import { SEMANTICS_PRIMITIVES } from "./primitives/semantics.js";
import { PROCESS_PRIMITIVES } from "./primitives/process.js";
import { ASSURANCE_PRIMITIVES } from "./primitives/assurance.js";
import { MATHEMATICS_PRIMITIVES } from "./primitives/mathematics.js";
import { ARCHITECTURE_PRIMITIVES } from "./primitives/architecture.js";
import { EMPIRICAL_PRIMITIVES } from "./primitives/empirical.js";
import { BIBLIOGRAPHY_PRIMITIVES } from "./primitives/bibliography.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { RENDERER_BINDINGS } from "./renderer_bindings.js";
import { TEMPLATES } from "./templates.js";
import { renderMarkdown } from "./renderers/markdown.js";
import { renderHtml } from "./renderers/html.js";
import { renderPdf } from "./renderers/pdf.js";
import { registerFormalSpecificationCapabilities } from "./_capabilities.js";

export { renderMarkdown, renderHtml, renderPdf };

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  ...STRUCTURE_PRIMITIVES,
  ...TYPE_SYSTEM_PRIMITIVES,
  ...SEMANTICS_PRIMITIVES,
  ...PROCESS_PRIMITIVES,
  ...ASSURANCE_PRIMITIVES,
  ...MATHEMATICS_PRIMITIVES,
  ...ARCHITECTURE_PRIMITIVES,
  ...EMPIRICAL_PRIMITIVES,
  ...BIBLIOGRAPHY_PRIMITIVES,
];

/**
 * Stable string constants exposed for SDK consumers (see the SDK
 * docstring in src/sdk.ts for the rationale). PROFILE_ID is the id
 * a `host.createProject({...profile_id: PROFILE_ID})` call would
 * use; SCOPE_IDS lists every scope this profile declares so user
 * code can avoid hard-coding strings.
 */
export const PROFILE_ID = "profile:formal-specification:3.0" as const;
export const SCOPE_IDS = {
  specification: "scope:fs:specification",
  method: "scope:fs:method",
  practice: "scope:fs:practice",
  paperTheory: "scope:fs:paper:theory",
  paperArchitecture: "scope:fs:paper:architecture",
  paperTraining: "scope:fs:paper:training",
  paperEvaluation: "scope:fs:paper:evaluation",
  execution: "scope:fs:execution",
} as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "3.1.0",
  name: "Formal Specification",
  label: "Formal Specification",
  description:
    "Primitives, relations, and validation rules for modeling formal specifications, technical papers, and typed execution roadmaps. v3.1: adds enforcement to Invariant, full Assumption Ledger fields, DesignDecision lifecycle, Phase domain/state-component/objective, Citation category, four new relation types, and corrects four enum mismatches.",
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
    target: "text/markdown",
    rendererId: "fs:SpecRenderer",
    fn: renderMarkdown,
  });
  ctx.registerRenderer({
    target: "text/html",
    rendererId: "fs:SpecHtmlRenderer",
    fn: renderHtml,
  });
  ctx.registerRenderer({
    target: "application/pdf",
    rendererId: "fs:SpecPdfRenderer",
    fn: renderPdf,
  });
  registerFormalSpecificationCapabilities(ctx);
  ctx.logger.info(
    `formal-specification activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} CEL rules + 3 cap:validator implementations, 3 renderers (md/html/pdf), 1 expr-helper, 1 transformer, 1 importer (fs-jsonl), 1 exporter (fs-jsonl)`,
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
