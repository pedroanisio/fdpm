/**
 * Planning plugin entry point.
 *
 * Profile id: profile:planning:0.1
 * Ships:
 *   - 6 primitive types (cat:plan:work / cat:plan:scheduling /
 *     cat:plan:execution / cat:plan:assurance)
 *   - 9 relation types
 *   - 10 CEL validation rules (including the AI-task duration enum
 *     and the cross-profile plan:Implements existence check that
 *     uses helper-set v1.1.0 graph.target_exists)
 *   - 3 templates bound to 3 executable renderers (Roadmap markdown,
 *     Gantt SVG, AgentBoard markdown)
 *
 * Hard constraint: AI-task duration is bounded to {5, 10, 15, ..., 60}
 * minutes; tasks longer than 60 minutes must be split. Enforced at the
 * field-shape layer (Enum) AND at the rule layer (CEL).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  DomainProfile,
  PrimitiveTypeDef,
  RelationTypeDef,
  TemplateDef,
  ValidationRuleDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { CATEGORIES } from "./categories.js";
import { SCOPES, SCOPE_SETS, DEFAULT_SCOPE_SET } from "./scopes.js";
import { WORK_PRIMITIVES } from "./primitives/work.js";
import { ASSURANCE_PRIMITIVES } from "./primitives/assurance.js";
import { SCHEDULING_PRIMITIVES } from "./primitives/scheduling.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { TEMPLATES } from "./templates.js";
import { renderRoadmap } from "./renderers/roadmap.js";
import { renderGantt } from "./renderers/gantt.js";
import { renderAgentBoard } from "./renderers/agent_board.js";
import { registerPlanningCapabilities } from "./_capabilities.js";
import { PLANNING_PROMPTS } from "./prompts.js";

export { renderRoadmap, renderGantt, renderAgentBoard };
export * from "./ids.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  ...WORK_PRIMITIVES,
  ...ASSURANCE_PRIMITIVES,
  ...SCHEDULING_PRIMITIVES,
];

export const PROFILE_ID = "profile:planning:0.1" as const;
export const SCOPE_IDS = {
  workbook: "scope:plan:workbook",
  iteration: "scope:plan:iteration",
  execution: "scope:plan:execution",
} as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Planning",
  label: "Planning",
  description:
    "Planning-and-tracking profile for software implementation and testing workflows. Covers work breakdown, per-task acceptance criteria (free-text and CEL-evaluable), dependency and blocker management, descriptive Gantt scheduling, and concurrent execution by humans and multiple AI agents working in parallel. AI-task durations are bounded to [5,60] minutes in 5-minute steps.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS as RelationTypeDef[],
  validation_rules: VALIDATION_RULES as ValidationRuleDef[],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: TEMPLATES as TemplateDef[],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  for (const prompt of PLANNING_PROMPTS) ctx.registerPrompt(prompt);
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: "plan:RoadmapRenderer",
    fn: renderRoadmap,
  });
  ctx.registerRenderer({
    target: "image/svg+xml",
    rendererId: "plan:GanttSvgRenderer",
    fn: renderGantt,
  });
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: "plan:AgentBoardRenderer",
    fn: renderAgentBoard,
  });
  registerPlanningCapabilities(ctx);
  ctx.logger.info(
    `planning activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} CEL rules + 3 cap:validator implementations, 3 renderers (plan:RoadmapRenderer/md, plan:GanttSvgRenderer/svg, plan:AgentBoardRenderer/md), 1 expr-helper, 1 transformer, 1 importer (plan-jsonl), 1 exporter (plan-jsonl), 1 MCP prompt (planning/triage_iteration)`,
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
