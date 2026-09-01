/**
 * `fdpm.re-crt` — RE-CRT 6.2 as an FDPM profile.
 *
 * The source is an OWL 2 DL + SHACL ontology (`re-crt.ttl`, w3id.org/re-crt).
 * Its own architecture is a two-layer split: OWL states what it can, and SHACL
 * closes what OWL 2 DL provably cannot — acyclicity, closed-world cardinality,
 * the type/beta invariant. This plugin makes the same split, one layer down:
 * the profile states the artifact shape, and validators close what a field
 * constraint cannot.
 *
 * Three things get STRONGER in the move, and they are the reason to make it:
 *
 *  1. The duality maps gain endpoint typing. In the .ttl, `explainedByBarrier`
 *     has none — `rdfs:range` is an entailment obligation and the ontology's
 *     validation protocol runs without inference, so a δ edge pointing at a
 *     bypass, or even at a proof node, validates. Here the host rejects it.
 *  2. Support homogeneity stops being a SHACL check and becomes structure:
 *     two relation types, so a cross-kind support edge is unrepresentable.
 *  3. The §4.9 triage runs. In OWL it is defined through
 *     `recrt:UndefeatedActiveBarrier`, an `owl:complementOf`; "no bypass
 *     defeats this barrier" is not provable under the open-world assumption,
 *     so on open data the classification derives nothing and a leaf stops at
 *     the helper class `BlockedOpen`. A workbook is a closed graph, so the
 *     question is simply decidable — see `triage.ts`.
 *
 * What does NOT come across, exactly as it does not come across into OWL: the
 * tensor encoding Theta, weighted-resolution arithmetic (sigma, sigma*, beta
 * propagation), REPLAY / E(v), the categorical semantics, and the nine
 * theorems. Those are metatheory and algorithms; the Claim and Theorem types
 * record them as data, which is all either mapping ever did.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DomainProfile as DomainProfileShape } from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule, RendererFn } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { RELATIONS } from "./relations.js";
import { OBSTRUCTION_DAG, OBSTRUCTION_NODE, PROOF_NODE, REASON_DAG } from "./primitives/graph.js";
import { RULE, RULE_BASIS, SIDE_CONDITION } from "./primitives/calculus.js";
import { CLAIM, EVIDENCE_BUNDLE, THEOREM } from "./primitives/registry.js";
import { renderTriageReport } from "./renderers/triage_report.js";
import {
  dagMembership,
  defeatEdgeBipartite,
  ruleSourceIsNotAssumption,
  supportEdgeAcyclic,
  supportTargetIsNotLeaf,
  defeatBipartite,
  derivedPremiseClosure,
  evidenceGate,
  leafRules,
  supportAcyclic,
  typeBetaInvariant,
} from "./validators/graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PLUGIN_ID = "fdpm.re-crt" as const;
export const PROFILE_ID = "profile:re-crt:6.2" as const;
export const TRIAGE_RENDERER_ID = "recrt:TriageRenderer" as const;

/**
 * The ontology versions itself "6.2"; FDPM requires major.minor.patch, so the
 * profile is 6.2.0. `owl:versionIRI <https://w3id.org/re-crt/6.2-owl-shacl>`
 * is the upstream identity this tracks.
 */
export const PROFILE: DomainProfileShape = {
  id: PROFILE_ID,
  version: "6.2.0",
  name: "re-crt",
  label: "RE-CRT 6.2",
  description:
    "Typed reason DAG, obstruction DAG, duality maps, claims and theorem registries, and the v6.2 evidence layer, mapped from the OWL 2 DL + SHACL ontology at w3id.org/re-crt.",
  extends: [],
  categories: [],
  scopes: [],
  primitive_types: [
    PROOF_NODE,
    OBSTRUCTION_NODE,
    REASON_DAG,
    OBSTRUCTION_DAG,
    RULE,
    RULE_BASIS,
    SIDE_CONDITION,
    CLAIM,
    THEOREM,
    EVIDENCE_BUNDLE,
  ],
  relation_types: RELATIONS,
  validation_rules: [],
  renderer_bindings: [],
} as unknown as DomainProfileShape;

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `re-crt manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }
  ctx.registerProfile(PROFILE);

  /* PART 2, one layer down. Each of these closes a constraint the profile
     layer cannot state; the rule ids mirror the SHACL shape names so a finding
     here is traceable to the shape it descends from. */
  const v = (type_id: string, rule_id: string, fn: Parameters<PluginContext["registerValidator"]>[0]["fn"]) =>
    ctx.registerValidator({ type_id, rule_id, fn });

  v("recrt:ProofNode", "recrt:val.support-acyclic", supportAcyclic("recrt:ProofSupports"));
  v("recrt:ObstructionNode", "recrt:val.support-acyclic", supportAcyclic("recrt:ObstructionSupports"));
  v("recrt:ProofNode", "recrt:val.derived-premise", derivedPremiseClosure);
  v("recrt:ProofNode", "recrt:val.leaf", leafRules);
  v("recrt:ProofNode", "recrt:val.evidence-gate", evidenceGate);
  v("recrt:ProofNode", "recrt:val.dag-membership", dagMembership("recrt:ProofInDAG", "Reason DAG"));
  v("recrt:ObstructionNode", "recrt:val.type-beta", typeBetaInvariant);
  v("recrt:ObstructionNode", "recrt:val.defeat-bipartite", defeatBipartite);
  v(
    "recrt:ObstructionNode",
    "recrt:val.dag-membership",
    dagMembership("recrt:ObstructionInDAG", "Obstruction DAG"),
  );

  /* Edge-scoped rules. A validator registered on a primitive type does not
     run when a relation is written, and these are properties of the edge. */
  v("recrt:ProofSupports", "recrt:val.leaf", supportTargetIsNotLeaf);
  v("recrt:ProofSupports", "recrt:val.support-acyclic", supportEdgeAcyclic("recrt:ProofSupports"));
  v("recrt:ObstructionSupports", "recrt:val.support-acyclic", supportEdgeAcyclic("recrt:ObstructionSupports"));
  v("recrt:HasRule", "recrt:val.leaf", ruleSourceIsNotAssumption);
  v("recrt:BypassDefeatsBarrier", "recrt:val.defeat-bipartite", defeatEdgeBipartite);

  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: TRIAGE_RENDERER_ID,
    fn: renderTriageReport as RendererFn,
  });

  ctx.logger.info(
    `re-crt activated: ${PROFILE.primitive_types.length} primitive types, ${RELATIONS.length} relation types, ` +
      `14 graph validators, 1 renderer (recrt:TriageRenderer/md). Profile id: ${PROFILE_ID}.`,
  );
}

/* The loader prefers `mod.default`, so the default export must carry the
   manifest as well as activate — a default of `{ activate }` alone is
   rejected at discovery with "entry module missing `manifest`". */
const entry: PluginEntryModule = { manifest, activate };
export default entry;
export { renderTriageReport };
