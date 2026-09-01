/**
 * Fact-fiction plugin entry point.
 *
 * Profile id: profile:fact-fiction:0.1
 * Domain: fact-fiction coupling for historical fiction — the graph
 * form of the Zod spike at ~/spikes/schemas/narrative/fact-fiction
 * (spec 0.2.0). Five coupled layers: fact, inference (assessments),
 * fiction, narrative style, and linkage.
 *
 * Ships:
 *   - 9 primitive types (cat:ff:evidence / cat:ff:fiction / cat:ff:structure)
 *   - 10 relation types (citation, grounding, constraint, coupling,
 *     ordered structure chain, scene anchoring)
 *   - 6 CEL validation rules (2 errors, 4 epistemic warnings)
 *   - 1 renderer (ff:ManuscriptOutlineRenderer → text/markdown) that
 *     resolves the narrative-style cascade and surfaces UNCITED /
 *     UNASSESSED / DISPUTED / UNSUPPORTED
 *   - 1 MCP prompt (fact-fiction/ground_fiction)
 *
 * What normalization buys over the document form (see README.md):
 * shared sources, write-time referential integrity, per-instance
 * findings with rule ids, and an event-sourced history.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  DomainProfile,
  PrimitiveTypeDef,
  RelationTypeDef,
  ValidationRuleDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { CATEGORIES } from "./categories.js";
import { SCOPES, SCOPE_SETS, DEFAULT_SCOPE_SET } from "./scopes.js";
import { WORK } from "./primitives/work.js";
import { EVIDENCE_PRIMITIVES } from "./primitives/evidence.js";
import { FICTION_PRIMITIVES } from "./primitives/fiction.js";
import { STRUCTURE_PRIMITIVES } from "./primitives/structure.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { renderManuscriptOutline } from "./renderers/manuscript_outline.js";
import { FACT_FICTION_PROMPTS } from "./prompts.js";
import { MANUSCRIPT_OUTLINE_RENDERER_ID, PROFILE_ID } from "./ids.js";

export { renderManuscriptOutline };
export * from "./ids.js";
export * from "./enums.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  WORK,
  ...EVIDENCE_PRIMITIVES,
  ...FICTION_PRIMITIVES,
  ...STRUCTURE_PRIMITIVES,
];

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Fact-Fiction Coupling",
  label: "FactFiction",
  description:
    "Historical-fiction workbench: facts with shared sources and scholarly assessments, historicity-graded fiction elements, historical constraints, a typed fact-fiction coupling layer, and an arc/chapter/scene structure with narrative-style overrides.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS as RelationTypeDef[],
  validation_rules: VALIDATION_RULES as ValidationRuleDef[],
  renderer_bindings: [],
  renderers: [
    {
      renderer_id: MANUSCRIPT_OUTLINE_RENDERER_ID,
      output_format: "text/markdown",
      output_path: "outline.md",
    },
  ],
  inline_structs: [],
  templates: [],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: MANUSCRIPT_OUTLINE_RENDERER_ID,
    fn: renderManuscriptOutline,
  });
  for (const prompt of FACT_FICTION_PROMPTS) ctx.registerPrompt(prompt);
  ctx.logger.info(
    `fact-fiction activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} CEL rules, 1 renderer (${MANUSCRIPT_OUTLINE_RENDERER_ID}/md), ${FACT_FICTION_PROMPTS.length} prompt. Profile id: ${PROFILE_ID}.`,
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
