/**
 * `fdpm.logical-knowledge-base` — a LogicalKnowledgeBase document as an FDPM profile.
 *
 * The data model is derived from the vendored schema (`schemas/lkb.ts`) by
 * `derive.ts`; this file binds the derived DomainProfile, the validators that
 * close what a FieldDef cannot state, the two renderers, the `lkb-json`
 * importer/exporter and the authoring prompt.
 *
 * Three things get STRONGER in the move, and they are the reason to make it:
 *
 *  1. Reference integrity moves from a batch check to a write-time invariant.
 *     Upstream, `collectReferenceIssues` runs over an assembled document; here
 *     every `Reference` field is an edge and the host refuses an edge to a
 *     node that does not exist before the write is appended.
 *  2. Every id-bearing node is addressable and revisioned. A proof step or a
 *     process element is a primitive with its own operation log, not an array
 *     entry inside its container.
 *  3. Provenance is a graph. `ProvenanceLink`s become `lkb:provenance` edges,
 *     so "everything asserted by record R" is a relation query, not a walk.
 *
 * What does NOT come across, stated rather than hidden: FDPM has no reasoner,
 * so entailment, consistency and satisfiability queries are stored, not
 * answered; references nested inside structs and formulas are checked by the
 * document-level validator (upstream's own checks, run over the reassembled
 * document), not by the host's edge check; the canonical serialization policy
 * and the migrations table are metadata here — the operation log and profile
 * revisions do their job.
 *
 * Hand-authored: derive.ts, validators.ts, transfer.ts, renderers/, prompts.ts,
 * this file. Generated: generated/profile.json and generated/schema-hash.json
 * (scripts/build-profile.ts, gated by its --check and by
 * tests/plugins/logical_knowledge_base/derive.test.ts). schemas/lkb.ts is
 * VENDORED by scripts/vendor-schema.ts and never edited in place.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule, RendererFn } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import {
  ARGUMENT_GRAPH_RENDERER_ID,
  PLUGIN_ID,
  PROFILE_ID,
  THEORY_RENDERER_ID,
  derivationSummary,
  deriveProfile,
} from "./derive.js";
import { LKB_PROMPTS } from "./prompts.js";
import { renderArgumentGraph } from "./renderers/argument_graph.js";
import { renderTheory } from "./renderers/theory.js";
import { TRANSFER_FORMAT, exportLkbJson, importLkbJson } from "./transfer.js";
import { registerLkbValidators } from "./validators.js";

export {
  PLUGIN_ID,
  PROFILE_ID,
  PROFILE_VERSION,
  HEADER_TYPE_ID,
  EXTERNAL_TARGET_TYPE_ID,
  THEORY_RENDERER_ID,
  ARGUMENT_GRAPH_RENDERER_ID,
  deriveProfile,
  derivationSummary,
  nodeArms,
  typeIdFor,
  hostIdFor,
} from "./derive.js";
export { renderTheory } from "./renderers/theory.js";
export { renderArgumentGraph } from "./renderers/argument_graph.js";
export { printFormula } from "./renderers/_formula.js";
export {
  TRANSFER_FORMAT,
  assembleDocument,
  collectMentions,
  exportLkbJson,
  importLkbJson,
  mentionEdges,
  parseDocument,
  planMentions,
  reconcileMentions,
  splitDocument,
  verifyWorkbook,
} from "./transfer.js";
export { frameworks, groundedLabelling, groundedResults, labellingByNode } from "./grounded.js";
export { parseFormula, parseTerm } from "./formula.js";
export { applyDocumentUpdate, planDocumentUpdate } from "./diff.js";
export { LKB_PROMPTS, AUTHOR_THEORY_PROMPT } from "./prompts.js";
export { registerLkbValidators, VALIDATOR_RULE_IDS } from "./validators.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

/** The profile, derived once per process; byte-equal to generated/profile.json. */
export const PROFILE: DomainProfile = deriveProfile();

export async function activate(ctx: PluginContext): Promise<void> {
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `${PLUGIN_ID} manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }
  if (manifest.version !== PROFILE.version) {
    throw new Error(
      `${PLUGIN_ID} version drift: fdpm-plugin.json declares ${manifest.version} but the profile derives ${PROFILE.version} from the schema's semantic model version.`,
    );
  }
  ctx.registerProfile(PROFILE);
  const validators = registerLkbValidators(ctx);

  ctx.registerRenderer({ target: "text/markdown", rendererId: THEORY_RENDERER_ID, fn: renderTheory as RendererFn });
  ctx.registerRenderer({
    target: "image/svg+xml",
    rendererId: ARGUMENT_GRAPH_RENDERER_ID,
    fn: renderArgumentGraph as RendererFn,
  });

  ctx.registerImporter({ format: TRANSFER_FORMAT, fn: importLkbJson });
  ctx.registerExporter({ format: TRANSFER_FORMAT, fn: exportLkbJson });

  for (const prompt of LKB_PROMPTS) ctx.registerPrompt(prompt);

  const s = derivationSummary();
  ctx.logger.info(
    `logical-knowledge-base activated: ${s.primitiveTypes} primitive types (${s.nodeKinds} node kinds + header + external target), ` +
      `${s.relationTypes} relation types (${s.referenceRelationTypes} reference fields, provenance, 2 containment), ` +
      `${validators.registrations} validator registrations over ${validators.ruleIds.length} rules, 2 renderers (${THEORY_RENDERER_ID}/md, ${ARGUMENT_GRAPH_RENDERER_ID}/svg), ` +
      `1 importer + 1 exporter (${TRANSFER_FORMAT}), ${LKB_PROMPTS.length} prompt. Profile id: ${PROFILE_ID}.`,
  );
}

/* The loader prefers `mod.default`, so the default export must carry the
   manifest as well as activate. */
const entry: PluginEntryModule = { manifest, activate };
export default entry;
