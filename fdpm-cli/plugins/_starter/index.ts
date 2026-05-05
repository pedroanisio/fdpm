/**
 * Starter plugin entry point.
 *
 * Profile id: profile:starter:0.1
 * Domain: a recipe book (Recipe, Ingredient, Tag).
 *
 * READ THIS FILE TOP-TO-BOTTOM if you are about to write your first
 * FDPM plugin. It is the smallest production-shaped plugin in the
 * codebase — every common capability kind appears, with an educational
 * comment explaining why.
 *
 * Companion documents:
 *   ./README.md       — Product Page (per spec-plugin-authoring-howto §7)
 *   ./EDUCATION.md    — what to read first, what to delete on fork
 *
 * Ships:
 *   - 3 primitive types (recipe:Recipe, recipe:Ingredient, recipe:Tag)
 *   - 2 relation types (recipe:Uses [with metadata], recipe:TaggedWith)
 *   - 2 CEL validation rules (1 error, 1 warning)
 *   - 1 code validator (recipe:val:has-at-least-one-ingredient — warning)
 *   - 1 expression helper (fn.fdpm.starter.minutes-to-hours)
 *   - 1 transformer (recipe:to-shopping-list)
 *   - 1 renderer (recipe:ShoppingListRenderer → text/markdown)
 *   - 1 importer + 1 exporter (recipe-jsonl)
 *   - 4 lifecycle hooks (the standard four; mostly inert)
 *
 * EDUCATIONAL NOTE — manifest-runtime parity:
 *   What's in fdpm-plugin.json's `capabilities[]` MUST match what
 *   `activate()` actually registers. The host cross-checks at load
 *   time and a mismatch produces a `manifest_runtime_mismatch`
 *   finding. So when you fork: edit the manifest AND the
 *   register* calls together. Don't add a capability to one without
 *   adding it to the other.
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
import { RECIPE, INGREDIENT } from "./primitives/recipe.js";
import { TAG } from "./primitives/meta.js";
import { RELATIONS } from "./relations.js";
import { VALIDATION_RULES } from "./validation_rules.js";
import { renderShoppingList } from "./renderers/shopping_list.js";
import { registerStarterCapabilities } from "./_capabilities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_PRIMITIVES: PrimitiveTypeDef[] = [RECIPE, INGREDIENT, TAG];

export const PROFILE_ID = "profile:starter:0.1" as const;
export const SCOPE_IDS = {
  workbook: "scope:starter:workbook",
} as const;

/**
 * The DomainProfile — the shape the host registers via
 * ctx.registerProfile(). Every property here is declarative; nothing
 * runs at registration time except the host's structural validation
 * of the profile itself.
 *
 * EDUCATIONAL NOTE — the profile id is your contract:
 *   Workbooks bind to a specific profile_id at create time and never
 *   re-bind. If you change "profile:starter:0.1" → "profile:starter:0.2"
 *   on a non-additive change, every existing workbook loses its host —
 *   no validation, no rendering, no anything. NEVER bump for ADDITIVE
 *   changes (new optional fields, new types, new validators). Bump
 *   ONLY for breaking changes (renaming a primitive type, removing a
 *   field, narrowing an enum). See spec-plugin-authoring-howto's
 *   property:profile-id-stability.
 */
export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "0.1.0",
  name: "Starter (Recipe Book)",
  label: "Starter",
  description:
    "Educational template for FDPM plugin authors. Models a small recipe-book domain. Every common capability kind is exercised. See README.md and EDUCATION.md.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS as RelationTypeDef[],
  validation_rules: VALIDATION_RULES as ValidationRuleDef[],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

/**
 * activate(ctx) — called by the host once after Install / Enable.
 *
 * EDUCATIONAL NOTE — idempotent activation (property:idempotent-activation):
 *   activate() may be called more than once across a plugin's
 *   lifecycle (Install → Enable → Activate → Disable → Enable →
 *   Activate). The host atomically removes everything you registered
 *   on Disable, so re-running activate against a clean slate is the
 *   normal flow. That means activate() MUST be deterministic:
 *     - No reading wall-clock time.
 *     - No mintUid() / random ids inside the activation path.
 *     - No reads from external services.
 *   If you need any of those, do them in a lifecycle hook (onEnable)
 *   or inside a renderer/validator/transformer, not in activate.
 */
export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: "recipe:ShoppingListRenderer",
    fn: renderShoppingList,
  });
  registerStarterCapabilities(ctx);
  ctx.logger.info(
    `starter activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ${VALIDATION_RULES.length} CEL rules + 1 cap:validator, 1 renderer (recipe:ShoppingListRenderer/md), 1 expr-helper, 1 transformer, 1 importer (recipe-jsonl), 1 exporter (recipe-jsonl). Profile id: ${PROFILE_ID}.`,
  );
}

/**
 * Lifecycle hooks. EDUCATIONAL NOTE — the four phases in
 * spec-plugin-authoring-howto §3:
 *
 *   onInstall  — fires once per host process when this plugin is
 *                discovered for the first time. Use for one-shot
 *                setup that survives across enables (rare).
 *   onEnable   — fires before activate() each time the plugin is
 *                enabled. Use for resource acquisition (file handles,
 *                network connections) that activate doesn't own.
 *   onDisable  — fires after activate's registrations have been
 *                removed. Use for resource teardown that mirrors
 *                onEnable.
 *   onUninstall — fires when the plugin is removed entirely. Mirrors
 *                onInstall.
 *
 *   Most plugins (including this one) leave them as no-op debug logs.
 *   They exist so the manifest-runtime parity check finds them
 *   declared AND exported. If you don't need a hook, the
 *   no-op-with-debug-log shape is the canonical placeholder.
 */
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

/**
 * Default export — what the host imports as the plugin's entry module.
 * MUST satisfy PluginEntryModule's shape. The fields here are the
 * complete public contract — anything else you export from this file
 * is invisible to the host.
 */
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
