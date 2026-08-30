/**
 * fdpm.knowledge-cartridge — talent cartridges as a typed graph.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Profile id: profile:knowledge-cartridge:1.0
 * Domain:     a corpus compressed into an executable competence module —
 *             six layers, every claim addressed, every hole declared.
 *
 * WHERE THE MODEL COMES FROM. `GENERATOR.md` in this directory is the
 * seven-pass protocol, and it is the source of truth for every vocabulary and
 * every check here. It did the design work: its Pass-5 "layer type contracts"
 * are row shapes rather than prose, and its Pass-3 transposition test is a
 * five-arm discriminated union. Where this plugin and that document disagree,
 * the document is right and the plugin is a bug.
 *
 * WHY SIX TYPES AND NOT ONE. Pass 6 asks "L4 has >= 8 rows" and "L5 exists and
 * is non-empty". Against one polymorphic item type carrying a `layer` string
 * those are filters over a column, and nothing stops a diagnostic shipping
 * without a correction. Against six primitive types they are cardinality
 * checks and each layer's mandatory register is a required field.
 *
 * HOW VALIDATION WORKS. Nine of Pass 6's eleven checks are graph facts and are
 * enforced at write time by `validators.ts`. The load-bearing one is
 * `kc:val:normative-claim-cited`: Pass 4 names GAP FILLING as the most
 * dangerous failure in the protocol — a fluent uncited claim inside a document
 * whose every other claim is cited — and that validator is its control. The
 * three checks that cannot be made from the graph are declared in
 * `KC_UNENFORCEABLE_CHECKS` and printed as UNCHECKED by the citation index,
 * because a scoreboard that showed only enforceable checks would be the
 * self-certification the protocol warns about.
 *
 * WHAT IT RENDERS. Four views — three for a reader, one for an agent:
 *
 *   text/markdown   the cartridge itself — the deliverable, laid out to the
 *                   Pass-5 register contracts, with gaps and conflicts in the
 *                   back matter rather than hidden
 *   text/html       the citation index — evidence inverted source-by-source,
 *                   plus the Pass-6 scoreboard including what it cannot check
 *   image/svg+xml   the layer map — depth per layer against its floor, which
 *                   is how you see a textbook wearing a cartridge's clothes
 *   application/json  the bounded state projection an agent loads, which caps
 *                   its own size and declares whatever it had to drop
 *
 * WHAT IT MOVES. `kc-jsonl` exports and re-imports a cartridge, because a
 * module that cannot leave the workspace that built it is not a module.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  PluginContext,
  PluginEntryModule,
  RendererFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import {
  CARTRIDGE_RENDERER_ID,
  CATEGORIES,
  CITATION_INDEX_RENDERER_ID,
  DEFAULT_SCOPE_SET,
  HOST_COMPATIBILITY,
  LAYER_MAP_RENDERER_ID,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  SCOPES,
  SCOPE_SETS,
  STATE_RENDERER_ID,
  VENDOR,
} from "./ids.js";
import { ALL_PRIMITIVES } from "./primitives.js";
import { RELATIONS } from "./relations.js";
import { KC_VALIDATORS } from "./validators.js";
import { KNOWLEDGE_CARTRIDGE_PROMPTS } from "./prompts.js";
import { renderCartridge } from "./renderers/cartridge_md.js";
import { renderCitationIndex } from "./renderers/citation_index.js";
import { renderLayerMap } from "./renderers/layer_map.js";
import { renderStateJson } from "./renderers/state_json.js";
import { KC_JSONL_FORMAT, kcJsonlExporter, kcJsonlImporter } from "./io.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export {
  CARTRIDGE_RENDERER_ID,
  CITATION_INDEX_RENDERER_ID,
  LAYER_MAP_RENDERER_ID,
  STATE_RENDERER_ID,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  HOST_COMPATIBILITY,
  VENDOR,
};
export { KNOWLEDGE_CARTRIDGE_PROMPTS, BUILD_CARTRIDGE_PROMPT } from "./prompts.js";
export { KC_VALIDATORS, KC_UNENFORCEABLE_CHECKS, RULE } from "./validators.js";
export { renderCartridge, renderCitationIndex, renderLayerMap, renderStateJson };
export { KC_JSONL_FORMAT, kcJsonlExporter, kcJsonlImporter } from "./io.js";
export { KC_STATE_BUDGET_BYTES } from "./renderers/state_json.js";
export * from "./ids.js";

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Knowledge Cartridges",
  label: "Knowledge Cartridge 1.0",
  description:
    "A corpus compressed into an executable competence module: a bounded competence envelope, a tiered source list, verbatim harvest with both its retained and discarded arms, six layers of procedural knowledge — primitives, invariants, constants, procedures, diagnostics, judgement — and the gaps and source conflicts the corpus could not resolve. Every normative claim carries a KEY:ordinal or it is not written.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS,
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

  for (const registration of KC_VALIDATORS) {
    ctx.registerValidator(registration);
  }

  for (const prompt of KNOWLEDGE_CARTRIDGE_PROMPTS) {
    ctx.registerPrompt(prompt);
  }

  const views: [string, string, RendererFn][] = [
    ["text/markdown", CARTRIDGE_RENDERER_ID, renderCartridge as RendererFn],
    ["text/html", CITATION_INDEX_RENDERER_ID, renderCitationIndex as RendererFn],
    ["image/svg+xml", LAYER_MAP_RENDERER_ID, renderLayerMap as RendererFn],
    ["application/json", STATE_RENDERER_ID, renderStateJson as RendererFn],
  ];
  for (const [target, rendererId, fn] of views) {
    ctx.registerRenderer({ target, rendererId, fn });
  }

  ctx.registerImporter({ format: KC_JSONL_FORMAT, fn: kcJsonlImporter });
  ctx.registerExporter({ format: KC_JSONL_FORMAT, fn: kcJsonlExporter });

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${PROFILE.primitive_types.length} primitive types, ` +
      `${PROFILE.relation_types?.length ?? 0} relation types, ${KC_VALIDATORS.length} validators, ` +
      `${KNOWLEDGE_CARTRIDGE_PROMPTS.length} prompt, ${views.length} renderers, ` +
      `1 importer + 1 exporter (${KC_JSONL_FORMAT}). Profile id: ${PROFILE_ID}.`,
  );
}

const entry: PluginEntryModule = { manifest, activate };
export default entry;
