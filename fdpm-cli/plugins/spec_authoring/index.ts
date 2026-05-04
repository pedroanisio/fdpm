/**
 * Spec Authoring plugin.
 *
 * Models a SPEC document as a typed object graph, with primitives covering
 * every recurring structural element observed in SPEC-CORE, SPEC-REPL,
 * SPEC-MCP-SERVER, and SPEC-PLUGGABLE-ARCHITECTURE:
 *
 *   - Document, Section, Term (document tree + Definitions table)
 *   - Stakeholder, Concern, QualityAttribute (§2/§3 framing)
 *   - ADR, Option, TradeoffAxis, QAScenario, Principle (§4/§14/§15/§16)
 *   - Requirement, AcceptanceCriterion, ConformanceItem, Invariant
 *     (§17 invariants, §18 acceptance, §18 conformance)
 *   - Tool, Endpoint, Capability, ConfigEntry, SchemaDefinition,
 *     ErrorCategory (§5 tool surface, §9 endpoints, §15 config, §16 errors)
 *   - Risk, Mitigation, OpenQuestion, FutureWork (§17/§20/§21/§22)
 *   - Reference, Revision, MigrationStep, ImplementationChange
 *     (§13 required changes, §19 migration, §23 references, §24 revisions)
 *
 * Every primitive carries its own validation rules; PALS-LAW invariants
 * (verifiable references, MUST-not-unverifiable, every QAScenario
 * complete) are enforced at the validator layer.
 *
 * Renderer: spec:SpecMarkdownRenderer produces a complete SPEC document
 * matching the SPEC-CORE house style (frontmatter, PALS banner,
 * disclaimer, numbered sections, ADR, trade-off matrix, references).
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
import { DOCUMENT_PRIMITIVES } from "./primitives/document.js";
import { FRAMING_PRIMITIVES } from "./primitives/framing.js";
import { ARCHITECTURE_PRIMITIVES } from "./primitives/architecture.js";
import { REQUIREMENTS_PRIMITIVES } from "./primitives/requirements.js";
import { CAPABILITY_PRIMITIVES } from "./primitives/capability.js";
import { RISK_PRIMITIVES } from "./primitives/risk.js";
import { PROVENANCE_PRIMITIVES } from "./primitives/provenance.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { TEMPLATES } from "./templates.js";
import { RENDERER_BINDINGS } from "./renderer_bindings.js";
import { renderSpecMarkdown } from "./renderers/spec_md.js";
import { registerSpecAuthoringValidators } from "./_register_validators.js";
import { registerSpecAuthoringExtraCapabilities } from "./_capabilities.js";

export { renderSpecMarkdown };
export * from "./ids.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  ...DOCUMENT_PRIMITIVES,
  ...FRAMING_PRIMITIVES,
  ...ARCHITECTURE_PRIMITIVES,
  ...REQUIREMENTS_PRIMITIVES,
  ...CAPABILITY_PRIMITIVES,
  ...RISK_PRIMITIVES,
  ...PROVENANCE_PRIMITIVES,
];

export const PROFILE_ID = "profile:spec-authoring:0.1" as const;
export const SCOPE_IDS = {
  normative: "scope:spec:normative",
  informative: "scope:spec:informative",
  operational: "scope:spec:operational",
  security: "scope:spec:security",
} as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Spec Authoring",
  label: "Spec Authoring",
  description:
    "Primitives, relations, and validation rules for authoring FDPM-style SPEC documents (SPEC-CORE / SPEC-MCP-SERVER house style). Models a SPEC as a typed object graph and renders the full Markdown document with the canonical structure.",
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
    rendererId: "spec:SpecMarkdownRenderer",
    fn: renderSpecMarkdown,
  });
  registerSpecAuthoringValidators(ctx);
  registerSpecAuthoringExtraCapabilities(ctx);
  ctx.logger.info(
    `spec-authoring activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} validation rules + ${VALIDATION_RULES.length} cap:validator implementations, 1 renderer (spec:SpecMarkdownRenderer/md), 1 expr-helper, 1 transformer, 1 importer (spec-jsonl), 1 exporter (spec-jsonl)`,
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
