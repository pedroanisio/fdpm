/**
 * fdpm.silent-acceptance — Silent Acceptance v2.1 as a typed FDPM graph.
 *
 * The source of truth is ../SILENT_ACCEPTANCE-v2.1.0.pdf. The model is
 * intentionally derived from normative §§3.1, 5, 9.1, 9.6, and 9.7:
 *
 * - one pinned solver configuration means model + harness + context policy +
 *   tools + prompts, not weights alone;
 * - one disposition exists for each of the nine intrinsic error classes;
 * - an active boundary carries every one of §9.1's ten declaration dimensions;
 * - configuration drift blocks boundary reuse until recalibration;
 * - verifier and acceptance authority are declared outside the producer's
 *   control domain.
 *
 * The graph cannot prove operating-system privileges, oracle truth, or that
 * deployed traffic crossed the verifier. Renderers expose those limits instead
 * of turning stored claims into self-certification.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DomainProfile, RendererBinding } from "../../src/core/models/meta.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import type { PluginContext, PluginEntryModule, RendererFn } from "../../src/plugin/types.js";
import {
  ASSURANCE_DASHBOARD_RENDERER_ID,
  BOUNDARY_DECLARATION_RENDERER_ID,
  CATEGORIES,
  CONTROL_DOMAIN_MAP_RENDERER_ID,
  DEFAULT_SCOPE_SET,
  HOST_COMPATIBILITY,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  SCOPES,
  SCOPE_SETS,
  STATE_MEDIA_TYPE,
  STATE_RENDERER_ID,
} from "./ids.js";
import { ALL_PRIMITIVES } from "./primitives.js";
import { RELATIONS } from "./relations.js";
import { SA_VALIDATORS } from "./validators.js";
import { renderBoundaryDeclaration } from "./renderers/boundary_declaration.js";
import { renderAssuranceDashboard } from "./renderers/assurance_dashboard.js";
import { renderControlDomainMap } from "./renderers/control_domain_map.js";
import { renderStateJson } from "./renderers/state_json.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RENDERERS: RendererBinding[] = [
  {
    renderer_id: BOUNDARY_DECLARATION_RENDERER_ID,
    name: "Verification Boundary Declaration",
    output_format: "text/markdown",
    output_path: "silent-acceptance-boundary.md",
    description: "Reviewable §9.1 declaration with all nine error-class dispositions and explicit assurance caveats.",
  },
  {
    renderer_id: ASSURANCE_DASHBOARD_RENDERER_ID,
    name: "Assurance Dashboard",
    output_format: "text/html",
    output_path: "silent-acceptance-assurance.html",
    description: "Responsive, printable assurance dashboard for coverage, calibration, residual risk, and control separation.",
  },
  {
    renderer_id: CONTROL_DOMAIN_MAP_RENDERER_ID,
    name: "Control Domain Map",
    output_format: "image/svg+xml",
    output_path: "silent-acceptance-control-domains.svg",
    description: "Accessible producer-boundary-consumer topology with verifier and acceptance-authority control domains.",
  },
  {
    renderer_id: STATE_RENDERER_ID,
    name: "Agent State Projection",
    output_format: STATE_MEDIA_TYPE,
    output_path: "silent-acceptance-state.json",
    description: "Bounded machine projection for agents coordinating verification and research work.",
  },
];

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Silent Acceptance Verification Boundaries",
  label: "Silent Acceptance 2.1",
  description:
    "A reviewable verification-boundary assurance case for LLM output: the complete nine-class intrinsic error taxonomy, one pinned solver configuration, per-class mechanism/recall/specificity/failure behaviour/oracle/severity/residual risk, a declared consumer tolerance, dated calibration, runtime verdict evidence, and acceptance authority outside the producer control domain.",
  extends: [],
  categories: CATEGORIES,
  scopes: SCOPES,
  primitive_types: ALL_PRIMITIVES,
  relation_types: RELATIONS,
  validation_rules: [],
  renderer_bindings: [],
  renderers: RENDERERS,
  inline_structs: [],
  templates: [],
  scope_sets: SCOPE_SETS,
  default_scope_set: DEFAULT_SCOPE_SET,
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(`silent-acceptance manifest id ${manifest.id} does not match ${PLUGIN_ID}`);
  }
  ctx.registerProfile(PROFILE);
  for (const validator of SA_VALIDATORS) ctx.registerValidator(validator);

  const views: [string, string, RendererFn][] = [
    ["text/markdown", BOUNDARY_DECLARATION_RENDERER_ID, renderBoundaryDeclaration as RendererFn],
    ["text/html", ASSURANCE_DASHBOARD_RENDERER_ID, renderAssuranceDashboard as RendererFn],
    ["image/svg+xml", CONTROL_DOMAIN_MAP_RENDERER_ID, renderControlDomainMap as RendererFn],
    [STATE_MEDIA_TYPE, STATE_RENDERER_ID, renderStateJson as RendererFn],
  ];
  for (const [target, rendererId, fn] of views) ctx.registerRenderer({ target, rendererId, fn });

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${ALL_PRIMITIVES.length} primitive types, ${RELATIONS.length} relation types, ` +
      `${SA_VALIDATORS.length} validators, ${views.length} renderers. Profile id: ${PROFILE_ID}.`,
  );
}

export {
  ASSURANCE_DASHBOARD_RENDERER_ID,
  BOUNDARY_DECLARATION_RENDERER_ID,
  CONTROL_DOMAIN_MAP_RENDERER_ID,
  DEFAULT_SCOPE_SET,
  HOST_COMPATIBILITY,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  PROFILE_VERSION,
  SCOPES,
  SCOPE_SETS,
  STATE_MEDIA_TYPE,
  STATE_RENDERER_ID,
} from "./ids.js";
export * from "./ids.js";
export { ALL_PRIMITIVES } from "./primitives.js";
export { RELATIONS } from "./relations.js";
export { RULE, SA_VALIDATORS } from "./validators.js";
export { renderBoundaryDeclaration } from "./renderers/boundary_declaration.js";
export { renderAssuranceDashboard } from "./renderers/assurance_dashboard.js";
export { renderControlDomainMap } from "./renderers/control_domain_map.js";
export { STATE_BUDGET_BYTES, renderStateJson } from "./renderers/state_json.js";
export { UNCHECKED_ASSURANCE_CLAIMS, buildBoundaryViews } from "./renderers/_model.js";

const entry: PluginEntryModule = { manifest, activate };
export default entry;
