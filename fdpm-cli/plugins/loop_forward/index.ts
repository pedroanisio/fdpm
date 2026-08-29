/**
 * fdpm.loop-forward — the loop-forward v2 contract as an FDPM profile.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Profile id: profile:loop-forward:2.0
 * Domain:     versioned prompts, reusable agents, bounded multi-stage
 *             feedback loops, reproducible evaluation, run receipts.
 *
 * WHERE THE MODEL COMES FROM. `schemas/loop-forward.ts` is a VENDORED
 * verbatim copy of the canonical contract; its digest is recorded in
 * `generated/schema-hash.json`, so a copy that drifts from its source is
 * a checkable fact rather than a discovery. It is never edited here —
 * a change goes to the source and is re-vendored.
 *
 * HOW VALIDATION WORKS. The profile's PrimitiveTypeDefs flatten the
 * contract's six discriminated unions onto discriminator enums so the
 * graph is addressable (see primitives.ts). That flattening is lossy in
 * one direction — the profile permits an arm/field combination the
 * contract would reject — so `validators.ts` runs the real Zod schema
 * over every instance and the loss is closed at write time. The profile
 * is the shape; the Zod schema is the law.
 *
 * WHAT IT RENDERS. Five views, all of the design graph:
 *
 *   image/svg+xml   the dataflow graph — forward arcs above the stage
 *                   row, carries below it, and how the loop can end
 *   text/html       the verification surface — the five controls, per stage
 *   text/html       authority and approval, including what each pipeline
 *                   inherits through its stages' agents
 *   text/html       binding coverage — where every variable's value comes from
 *   text/markdown   the budget envelope — structural worst case vs declared
 *
 * The evidence views over `lf:RunReceipt` are not built. The primitive
 * type ships because the contract defines it and a workbook must be able
 * to hold one; no renderer reads it yet.
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
  CATEGORIES,
  DEFAULT_SCOPE_SET,
  HOST_COMPATIBILITY,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  SCOPES,
  SCOPE_SETS,
  VENDOR,
} from "./ids.js";
import { ALL_PRIMITIVES } from "./primitives.js";
import { RELATIONS } from "./relations.js";
import { ENTITY_VALIDATORS } from "./validators.js";
import { renderPipelineGraph } from "./renderers/pipeline_graph.js";
import { renderVerificationSurface } from "./renderers/verification_surface.js";
import { renderAuthorityMatrix } from "./renderers/authority_matrix.js";
import { renderBindingMatrix } from "./renderers/binding_matrix.js";
import { renderBudgetEnvelope } from "./renderers/budget_envelope.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PIPELINE_GRAPH_RENDERER_ID = "lf:PipelineGraphRenderer" as const;
export const VERIFICATION_SURFACE_RENDERER_ID = "lf:VerificationSurfaceRenderer" as const;
export const AUTHORITY_MATRIX_RENDERER_ID = "lf:AuthorityMatrixRenderer" as const;
export const BINDING_MATRIX_RENDERER_ID = "lf:BindingMatrixRenderer" as const;
export const BUDGET_ENVELOPE_RENDERER_ID = "lf:BudgetEnvelopeRenderer" as const;

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Loop-Forward Prompt Pipelines",
  label: "Loop-Forward 2.0",
  description:
    "The canonical loop-forward v2 contract: versioned prompt templates, reusable agents with approval-aware tool grants, bounded multi-stage feedback pipelines whose only backward data path is a named carry, per-stage output contracts, executable examples, an evaluation gate, and terminal run receipts.",
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

/**
 * activate(ctx) — deterministic, idempotent, no clock and no randomness.
 *
 * Manifest-runtime parity: what `fdpm-plugin.json` declares in
 * `capabilities[]` must equal what this function registers, or the host
 * emits a `manifest_runtime_mismatch` finding at load. The two lists
 * below are the ones to keep in step with it.
 */
export async function activate(ctx: PluginContext): Promise<void> {
  ctx.registerProfile(PROFILE);

  for (const registration of ENTITY_VALIDATORS) {
    ctx.registerValidator(registration);
  }

  const views: [string, string, RendererFn][] = [
    ["image/svg+xml", PIPELINE_GRAPH_RENDERER_ID, renderPipelineGraph as RendererFn],
    ["text/html", VERIFICATION_SURFACE_RENDERER_ID, renderVerificationSurface as RendererFn],
    ["text/html", AUTHORITY_MATRIX_RENDERER_ID, renderAuthorityMatrix as RendererFn],
    ["text/html", BINDING_MATRIX_RENDERER_ID, renderBindingMatrix as RendererFn],
    ["text/markdown", BUDGET_ENVELOPE_RENDERER_ID, renderBudgetEnvelope as RendererFn],
  ];
  for (const [target, rendererId, fn] of views) {
    ctx.registerRenderer({ target, rendererId, fn });
  }

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${PROFILE.primitive_types.length} primitive types, ` +
      `${PROFILE.relation_types?.length ?? 0} relation types, ${ENTITY_VALIDATORS.length} validators, ` +
      `${views.length} renderers (${views.map(([target]) => target).join(", ")}). Profile id: ${PROFILE_ID}.`,
  );
}

export {
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  HOST_COMPATIBILITY,
  VENDOR,
  CATEGORIES,
  SCOPES,
} from "./ids.js";
export { ALL_PRIMITIVES } from "./primitives.js";
export { RELATIONS } from "./relations.js";
export { ENTITY_VALIDATORS, validateInstanceAgainstContract } from "./validators.js";
export {
  ingestLoopForwardStore,
  readLoopForwardStore,
  type IngestOutcome,
  type IngestResult,
} from "./ingest.js";
export { renderPipelineGraph, pipelineGraphLayout } from "./renderers/pipeline_graph.js";
export { renderVerificationSurface, controlRows } from "./renderers/verification_surface.js";
export { renderAuthorityMatrix, pipelineAuthority } from "./renderers/authority_matrix.js";
export { renderBindingMatrix, coverageRows, strayBindings } from "./renderers/binding_matrix.js";
export { renderBudgetEnvelope, budgetEnvelope } from "./renderers/budget_envelope.js";
export { readStore, type StoreView, type PipelineView } from "./renderers/_model.js";

const entry: PluginEntryModule = { manifest, activate };
export default entry;
