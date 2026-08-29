/**
 * document-plan-dnis composition profile.
 *
 * Profile id: profile:document-plan-dnis:3.1
 *
 * Extends profile:document-plan:3.1 (bridge-generated: the plan header
 * and the five registries) and profile:dnis:0.1 (dnis:Document,
 * dnis:Node, lineage relations). A DocumentPlan's section tree is a
 * depth-limited, ordered tree whose nodes keep identity across moves,
 * splits and merges — SPEC-DNIS's contract — so each SectionNode is
 * materialised as a dnis:Node primitive (SPEC-CORE §5.6) by build.ts and
 * this profile contributes the typed relations between nodes and the
 * registries, plus the docplan:PlanOutlineRenderer.
 *
 * Why a separate plugin (the spec_authoring_dnis precedent): blast
 * radius. fdpm.document-plan stays a pure bridge product that can be
 * regenerated from the schema; everything that needs a dnis:Node on one
 * side lives here, opt-in.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  DomainProfile,
  FieldDefT,
  RelationTypeDef,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { renderPlanOutline, PLAN_OUTLINE_RENDERER_ID } from "./renderers/plan_outline.js";
import { COHERENCE_RULE_ID, comparativeClaimBaselineValidator } from "./validators/coherence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PLUGIN_ID = "fdpm.document-plan-dnis" as const;
export const PROFILE_ID = "profile:document-plan-dnis:3.1" as const;
export const PARENT_DOCUMENT_PLAN = "profile:document-plan:3.1" as const;
export const PARENT_DNIS = "profile:dnis:0.1" as const;
export { PLAN_OUTLINE_RENDERER_ID };
export {
  COHERENCE_RULE_ID,
  COMPARATIVE_MARKERS,
  BASELINE_DEPENDENCY_REASONS,
  findComparativeClaimsWithoutBaseline,
  comparativeClaimBaselineValidator,
  type CoherenceFinding,
} from "./validators/coherence.js";

/** Relation type ids contributed by this profile (source → target). */
export const REL = {
  PlanHasDocument: "docplan:PlanHasDocument",
  PlanTranslationOf: "docplan:PlanTranslationOf",
  NodeUsesConcept: "docplan:NodeUsesConcept",
  NodeAdvancesThread: "docplan:NodeAdvancesThread",
  NodeCites: "docplan:NodeCites",
  NodeOwnedBy: "docplan:NodeOwnedBy",
  AssetPlacedIn: "docplan:AssetPlacedIn",
  AssetReproducedFrom: "docplan:AssetReproducedFrom",
  ConceptIntroducedIn: "docplan:ConceptIntroducedIn",
} as const;

function field(
  name: string,
  kind: FieldDefT["kind"],
  description: string,
  extra: Partial<FieldDefT> = {},
): FieldDefT {
  return { name, kind, required: false, validations: [], description, ...extra };
}

function relation(
  id: string,
  name: string,
  source: string,
  target: string,
  cardinality: RelationTypeDef["cardinality"],
  description: string,
  fields: FieldDefT[] = [],
): RelationTypeDef {
  return {
    id,
    name,
    source_type_id: source,
    target_type_id: target,
    cardinality,
    fields,
    symmetric: false,
    transitive: false,
    description,
  };
}

export const RELATION_TYPES: RelationTypeDef[] = [
  relation(
    REL.PlanHasDocument,
    "Plan has DNIS document",
    "docplan:DocumentPlan",
    "dnis:Document",
    "one-to-one",
    "The dnis:Document whose node tree is this plan's structure (front matter, body, back matter).",
  ),
  relation(
    REL.PlanTranslationOf,
    "Plan is a translation of",
    "docplan:DocumentPlan",
    "docplan:DocumentPlan",
    "many-to-one",
    "Mirrors DocumentPlan.translation_of when the source plan is present in the same workbook.",
  ),
  relation(
    REL.NodeUsesConcept,
    "Node uses concept",
    "dnis:Node",
    "docplan:Concept",
    "many-to-many",
    "Mirrors SectionNode.concept_ids. The concept must be introduced at or before this node in reading order (checked at ingest).",
  ),
  relation(
    REL.NodeAdvancesThread,
    "Node advances thread",
    "dnis:Node",
    "docplan:Thread",
    "many-to-many",
    "Mirrors SectionNode.thread_ids. A thread advanced by fewer than two nodes fails ingest.",
  ),
  relation(
    REL.NodeCites,
    "Node cites source",
    "dnis:Node",
    "docplan:ContentSource",
    "many-to-many",
    "One edge per EvidenceRef in the node's ClaimBlock. The locator and the relation of the passage to the claim ride on the edge.",
    [
      field("locator", "string", "Position inside the source: pages, section, timestamp, figure."),
      field("supports", "enum", "Relation of the cited passage to the claim.", {
        enum_values: ["asserts", "illustrates", "qualifies", "contradicts"],
      }),
      field("note", "string", "Why this passage carries the claim."),
    ],
  ),
  relation(
    REL.NodeOwnedBy,
    "Node owned by person",
    "dnis:Node",
    "docplan:Person",
    "many-to-one",
    "Mirrors SectionNode.owner_id: the person responsible for drafting the node.",
  ),
  relation(
    REL.AssetPlacedIn,
    "Asset placed in node",
    "docplan:Asset",
    "dnis:Node",
    "many-to-one",
    "Mirrors Asset.node_id: the node the asset appears in.",
  ),
  relation(
    REL.AssetReproducedFrom,
    "Asset reproduced from source",
    "docplan:Asset",
    "docplan:ContentSource",
    "many-to-one",
    "Mirrors Asset.source_id when the asset is reproduced rather than original.",
  ),
  relation(
    REL.ConceptIntroducedIn,
    "Concept introduced in node",
    "docplan:Concept",
    "dnis:Node",
    "many-to-one",
    "Mirrors Concept.introduced_in: the node that defines the term for the reader.",
  ),
];

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: "3.1.0",
  name: "Document Plan + DNIS",
  label: "Document Plan (DNIS tree)",
  description:
    "Composition profile extending profile:document-plan:3.1 and profile:dnis:0.1. A workbook on this profile holds one DocumentPlan header, its registries, and the plan's section tree as dnis:Node primitives, connected by the docplan:* relations declared here.",
  extends: [PARENT_DOCUMENT_PLAN, PARENT_DNIS],
  categories: [],
  scopes: [],
  primitive_types: [],
  relation_types: RELATION_TYPES,
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export async function activate(ctx: PluginContext): Promise<void> {
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `${PLUGIN_ID} manifest mismatch: fdpm-plugin.json declares id="${manifest.id}".`,
    );
  }
  ctx.registerProfile(PROFILE);
  // Coherence judge: a comparative claim needs a baseline earlier in reading
  // order (warning-level, lexical heuristic — see validators/coherence.ts).
  ctx.registerValidator({
    type_id: "dnis:Node",
    rule_id: COHERENCE_RULE_ID,
    fn: comparativeClaimBaselineValidator,
  });
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: PLAN_OUTLINE_RENDERER_ID,
    fn: renderPlanOutline,
  });
  ctx.logger.info(
    `${PLUGIN_ID} activated: composition profile ${PROFILE_ID} extends ${PARENT_DOCUMENT_PLAN} + ${PARENT_DNIS}; ${RELATION_TYPES.length} relation types; renderer ${PLAN_OUTLINE_RENDERER_ID}; validator ${COHERENCE_RULE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = { manifest, activate, deactivate };
export default entry;
