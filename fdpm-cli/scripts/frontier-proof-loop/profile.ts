/**
 * profile:frontier-proof-loop:0.1 — composition profile.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * What this is: a profile that `extends` four parents and contributes the
 * edges between them that none of them can declare alone.
 *
 *   profile:loop-forward:2.0            the orchestration contract — agents,
 *                                       prompts, stages, tool grants, output
 *                                       contracts, validators, run receipts
 *   profile:silent-acceptance:2.1       the verification boundary of Silent
 *                                       Acceptance v2.1.0 §9.1 — consumer,
 *                                       pinned solver configuration, nine
 *                                       per-class dispositions, verifiers,
 *                                       oracles, acceptance authority
 *   profile:re-crt:6.2                  proof state — reason DAG, obstruction
 *                                       DAG, claims, evidence bundles
 *   profile:logical-knowledge-base:1.0  knowledge state — declarations,
 *                                       claims, arguments, provenance
 *
 * The four parents use disjoint id namespaces (lf:*, sa:*, recrt:*, lkb:*),
 * so the §4.3 extends-merge cannot collide; this profile's own vocabulary
 * lives under fpl:*.
 *
 * Contributed primitive type
 *   fpl:Pursuit   a frontier problem and the two base-profile workbooks that
 *                 hold its proof state and knowledge state
 *
 * Contributed relation types (the bridges)
 *   sa:VerificationBoundary  → lf:Stage                the boundary a stage's output crosses
 *   sa:Verifier              → lf:OutputValidator |    the pipeline record that implements
 *                              lf:OutputContract       the declared mechanism
 *   sa:Verifier              → sa:Oracle               what the mechanism checks against
 *   sa:AcceptedRisk          → sa:Verifier             the declared, not yet calibrated verifier
 *                                                      that is a risk's compensating control
 *   sa:SolverConfiguration   → lf:AgentDefinition      the pinned configuration's model
 *   sa:SolverConfiguration   → lf:PromptTemplate       the prompts its prompt_set_digest covers
 *   sa:AcceptanceAuthority   → lkb:AgentDeclaration    the authority as a knowledge-base agent
 *   lf:AgentDefinition       → lkb:AgentDeclaration    a pipeline agent as a knowledge-base agent
 *   lf:Pipeline              → fpl:Pursuit             what the pipeline is registered to run
 *   lf:RunReceipt            → fpl:Pursuit             what a run advanced
 *   lf:RunReceipt            → sa:OutputSubmission     the outputs a run presented to a boundary
 *   lf:RunReceipt            → recrt:ProofNode         the nodes a run wrote (all unverified)
 *   lf:RunReceipt            → recrt:EvidenceBundle    the bundles captured during a run
 *   sa:AcceptanceDecision    → recrt:EvidenceBundle    the evidence an accept decision cites
 *   fpl:Pursuit              → recrt:Theorem           the statement a pursuit aims at
 *   recrt:ProofNode          → lkb:Claim               the knowledge-base claim a node asserts
 *
 * Contributed rules close what the parents cannot see: a stage with no
 * boundary is silent acceptance; a boundary that guards no stage is a
 * declaration about nothing; a verifier no pipeline record implements is a
 * comment; a pursuit whose two state workbooks are the same id conflates the
 * proof and knowledge authorities.
 */
import type { DomainProfile } from "../../src/core/models/meta.js";

export const PROFILE_ID = "profile:frontier-proof-loop:0.1" as const;
export const PROFILE_VERSION = "0.1.0" as const;
export const SILENT_ACCEPTANCE_VERSION = "2.1.0" as const;
export const SILENT_ACCEPTANCE_DOI = "10.5281/zenodo.19401266" as const;

export const PARENT_LOOP_FORWARD = "profile:loop-forward:2.0" as const;
export const PARENT_SILENT_ACCEPTANCE = "profile:silent-acceptance:2.1" as const;
export const PARENT_RE_CRT = "profile:re-crt:6.2" as const;
export const PARENT_LKB = "profile:logical-knowledge-base:1.0" as const;
export const PARENTS = [PARENT_LOOP_FORWARD, PARENT_SILENT_ACCEPTANCE, PARENT_RE_CRT, PARENT_LKB] as const;

/** Primitive type ids contributed here. */
export const FPL = {
  Pursuit: "fpl:Pursuit",
} as const;

/** Relation type ids contributed here. */
export const FPL_R = {
  BoundaryGuardsStage: "fpl:BoundaryGuardsStage",
  VerifierImplementedBy: "fpl:VerifierImplementedBy",
  VerifierChecksAgainst: "fpl:VerifierChecksAgainst",
  RiskMitigatedByVerifier: "fpl:RiskMitigatedByVerifier",
  ConfigurationRunsAgent: "fpl:ConfigurationRunsAgent",
  ConfigurationUsesTemplate: "fpl:ConfigurationUsesTemplate",
  AuthorityDeclaredAs: "fpl:AuthorityDeclaredAs",
  AgentDeclaredAs: "fpl:AgentDeclaredAs",
  PipelinePursues: "fpl:PipelinePursues",
  ReceiptAdvancesPursuit: "fpl:ReceiptAdvancesPursuit",
  ReceiptSubmitted: "fpl:ReceiptSubmitted",
  ReceiptProducedProofNode: "fpl:ReceiptProducedProofNode",
  ReceiptEvidencedBy: "fpl:ReceiptEvidencedBy",
  DecisionWitnessedBy: "fpl:DecisionWitnessedBy",
  PursuitTargetsTheorem: "fpl:PursuitTargetsTheorem",
  ProofNodeAssertsClaim: "fpl:ProofNodeAssertsClaim",
} as const;

/** Rule ids contributed here. */
export const FPL_RULE = {
  stageGuarded: "fpl:val:stage-guarded",
  boundaryGuardsStage: "fpl:val:boundary-guards-stage",
  verifierImplemented: "fpl:val:verifier-implemented",
  pursuitWorkbooksDistinct: "fpl:val:pursuit-workbooks-distinct",
} as const;

export const CAT = {
  pursuit: "cat:frontier-proof-loop:pursuit",
} as const;

type PrimitiveTypeDef = DomainProfile["primitive_types"][number];
type FieldDef = PrimitiveTypeDef["fields"][number];
type RelationTypeDef = DomainProfile["relation_types"][number];
type ValidationRuleDef = DomainProfile["validation_rules"][number];

const field = (
  name: string,
  kind: FieldDef["kind"],
  required: boolean,
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ name, kind, required, description, validations: [], ...extra });

const relation = (
  id: string,
  name: string,
  sources: string[],
  targets: string[],
  cardinality: RelationTypeDef["cardinality"],
  description: string,
): RelationTypeDef => ({
  id,
  name,
  source_type_id: sources[0]!,
  target_type_id: targets[0]!,
  source_types: sources,
  target_types: targets,
  cardinality,
  fields: [],
  symmetric: false,
  transitive: false,
  description,
});

const rule = (
  id: string,
  name: string,
  level: ValidationRuleDef["level"],
  applies_to: string[],
  predicate: string,
  expression: string,
  message: string,
  description: string,
): ValidationRuleDef => ({
  id,
  name,
  targets: applies_to,
  applies_to,
  level,
  predicate,
  expression,
  message,
  description,
});

const WORKBOOK_ID_PATTERN = "^[a-z0-9][a-z0-9-]*$";

const PURSUIT: PrimitiveTypeDef = {
  id: FPL.Pursuit,
  name: "Pursuit",
  category_id: CAT.pursuit,
  description:
    "A frontier problem the loop pursues, and the two base-profile workbooks where its proof state (re-crt) and knowledge state (logical-knowledge-base) are registered. The orchestrator reads it; only the acceptance authority moves its status.",
  fields: [
    field("title", "string", true, "Short name of the problem.", { validations: [{ kind: "max_length", value: 200, level: "error" }] }),
    field("domain", "enum", true, "Field of the pursuit.", { enum_values: ["mathematics", "physics", "science"] }),
    field("statement", "text", true, "The problem, stated so that an acceptance criterion can be checked against it."),
    field("target_kind", "enum", true, "What the loop is asked to produce.", {
      enum_values: ["proof", "disproof", "counterexample", "bound", "reduction", "formalization", "computation"],
    }),
    field("acceptance_criterion", "text", true, "What the acceptance authority checks before the pursuit is marked verified. Decided by the operator, never by an agent."),
    field("status", "enum", true, "open: no run yet; active: runs in progress; verified / refuted: the acceptance authority recorded a witnessed verdict; abandoned: closed without one.", {
      enum_values: ["open", "active", "verified", "refuted", "abandoned"],
    }),
    field("proofs_workbook_id", "string", true, "Workbook on profile:re-crt:6.2 holding the reason DAG, obstruction DAG, claims and evidence bundles.", {
      validations: [{ kind: "pattern", value: WORKBOOK_ID_PATTERN, level: "error" }],
    }),
    field("knowledge_workbook_id", "string", true, "Workbook on profile:logical-knowledge-base:1.0 holding declarations, claims, arguments and provenance.", {
      validations: [{ kind: "pattern", value: WORKBOOK_ID_PATTERN, level: "error" }],
    }),
    field("evidence_root", "string", true, "Repository path under which evidence bundles for this pursuit are written; recrt:EvidenceBundle.bundle_path is relative to it."),
    field("external_refs", "list", false, "Locators (DOI, arXiv, URL) the pursuit rests on. Every entry must resolve; an unresolvable locator is removed, not kept.", {
      item_field: { name: "item", kind: "string", required: true, validations: [] },
    }),
    field("opened_at", "string", true, "Date the pursuit was registered (YYYY-MM-DD).", {
      validations: [{ kind: "pattern", value: "^\\d{4}-\\d{2}-\\d{2}$", level: "error" }],
    }),
    field("owner", "string", true, "Accountable team identifier for the pursuit (non-personal)."),
  ],
  id_format: { pattern: "fpl:pursuit:{slug}", uniqueness: "workbook", pattern_kind: "template" },
  inline_structs: [],
  is_partition_unit: false,
  scoped: false,
  constraints: [],
};

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Frontier Proof Loop",
  label: "Frontier Proof Loop 0.1 (loop-forward + silent-acceptance + re-crt + lkb)",
  description:
    "Composition profile extending profile:loop-forward:2.0, profile:silent-acceptance:2.1, profile:re-crt:6.2 and profile:logical-knowledge-base:1.0. A workbook on this profile holds a loop-forward pipeline in which an orchestrator agent commands a solver agent on frontier proofs, the Silent Acceptance v2.1.0 verification boundary declared per stage, and the registry of pursuits whose proof and knowledge state live in re-crt and logical-knowledge-base workbooks. Contributes one primitive type (fpl:Pursuit) and the relations that join the four parents.",
  extends: [...PARENTS],
  categories: [{ id: CAT.pursuit, name: "Pursuit", label: "Pursuit", description: "Frontier problems and the workbooks that hold their state." }],
  scopes: [],
  primitive_types: [PURSUIT],
  relation_types: [
    relation(FPL_R.BoundaryGuardsStage, "Boundary guards stage", ["sa:VerificationBoundary"], ["lf:Stage"], "one-to-one", "The stage whose output crosses this boundary before any consumer receives it. Every stage has exactly one."),
    relation(FPL_R.VerifierImplementedBy, "Verifier implemented by", ["sa:Verifier"], ["lf:OutputValidator", "lf:OutputContract"], "many-to-many", "The pipeline record that implements the declared mechanism: an lf:OutputValidator, or the lf:OutputContract whose schema is the mechanism. A verifier with no such edge names a check nothing runs."),
    relation(FPL_R.VerifierChecksAgainst, "Verifier checks against", ["sa:Verifier"], ["sa:Oracle"], "many-to-many", "The oracle the mechanism consults; a calibration run measures the verifier's recall against it."),
    relation(FPL_R.RiskMitigatedByVerifier, "Risk mitigated by verifier", ["sa:AcceptedRisk"], ["sa:Verifier"], "many-to-many", "A verifier that is declared and implemented but not yet calibrated, named as the compensating control of an accepted risk. The first passed calibration moves the class from accepted risk to covered."),
    relation(FPL_R.ConfigurationRunsAgent, "Configuration runs agent", ["sa:SolverConfiguration"], ["lf:AgentDefinition"], "many-to-one", "The pipeline agent whose provider, model and sampling policy the pinned configuration's model_id names."),
    relation(FPL_R.ConfigurationUsesTemplate, "Configuration uses template", ["sa:SolverConfiguration"], ["lf:PromptTemplate"], "many-to-many", "The prompt templates the configuration's prompt_set_digest was computed over."),
    relation(FPL_R.AuthorityDeclaredAs, "Authority declared as", ["sa:AcceptanceAuthority"], ["lkb:AgentDeclaration"], "many-to-one", "The acceptance authority as a knowledge-base agent, so provenance edges can name who accepted a claim."),
    relation(FPL_R.AgentDeclaredAs, "Agent declared as", ["lf:AgentDefinition"], ["lkb:AgentDeclaration"], "one-to-one", "The knowledge base's declaration of a pipeline agent, so provenance edges can name who generated a claim."),
    relation(FPL_R.PipelinePursues, "Pipeline pursues", ["lf:Pipeline"], [FPL.Pursuit], "one-to-many", "The pursuits this pipeline is registered to run against."),
    relation(FPL_R.ReceiptAdvancesPursuit, "Receipt advances pursuit", ["lf:RunReceipt"], [FPL.Pursuit], "many-to-one", "Every run receipt names the pursuit it ran for."),
    relation(FPL_R.ReceiptSubmitted, "Receipt submitted", ["lf:RunReceipt"], ["sa:OutputSubmission"], "one-to-many", "The stage outputs a run presented to their boundaries, one submission per output."),
    relation(FPL_R.ReceiptProducedProofNode, "Receipt produced proof node", ["lf:RunReceipt"], ["recrt:ProofNode"], "many-to-many", "When proof state shares the workbook: the nodes a run wrote, all unverified at the time of writing."),
    relation(FPL_R.ReceiptEvidencedBy, "Receipt evidenced by", ["lf:RunReceipt"], ["recrt:EvidenceBundle"], "many-to-many", "The evidence bundles captured during the run."),
    relation(FPL_R.DecisionWitnessedBy, "Decision witnessed by", ["sa:AcceptanceDecision"], ["recrt:EvidenceBundle"], "many-to-one", "The evidence bundle whose manifest_root the acceptance authority recomputed before an accept decision."),
    relation(FPL_R.PursuitTargetsTheorem, "Pursuit targets theorem", [FPL.Pursuit], ["recrt:Theorem"], "many-to-one", "When the theorem registry shares the workbook: the statement the pursuit aims at."),
    relation(FPL_R.ProofNodeAssertsClaim, "Proof node asserts claim", ["recrt:ProofNode"], ["lkb:Claim"], "many-to-one", "When knowledge state shares the workbook: the knowledge-base claim a proof node asserts."),
  ],
  validation_rules: [
    rule(
      FPL_RULE.stageGuarded,
      "Every stage is guarded by a verification boundary",
      "warning",
      ["lf:Stage"],
      'has_incoming(self, "fpl:BoundaryGuardsStage")',
      'graph.incoming("fpl:BoundaryGuardsStage").size() >= 1',
      "This stage consumes model output and no sa:VerificationBoundary guards it: that is silent acceptance (Silent Acceptance v2.1.0 §9.1, Corollary 4).",
      "Workbook-completeness rule: the boundary edge cannot exist before the stage does, so it warns rather than blocks; `fdpm validate` is where it is conclusive.",
    ),
    rule(
      FPL_RULE.boundaryGuardsStage,
      "A boundary in this workbook guards a stage",
      "warning",
      ["sa:VerificationBoundary"],
      'has_outgoing(self, "fpl:BoundaryGuardsStage")',
      'graph.outgoing("fpl:BoundaryGuardsStage").size() >= 1',
      "This boundary guards no lf:Stage; in a frontier-proof-loop workbook a boundary is declared for a stage's output.",
      "Workbook-completeness rule; warns rather than blocks for the same reason as fpl:val:stage-guarded.",
    ),
    rule(
      FPL_RULE.verifierImplemented,
      "A verifier is implemented by a pipeline record",
      "warning",
      ["sa:Verifier"],
      'has_outgoing(self, "fpl:VerifierImplementedBy")',
      'graph.outgoing("fpl:VerifierImplementedBy").size() >= 1',
      "This sa:Verifier is implemented by no lf:OutputValidator or lf:OutputContract; a mechanism nothing runs is a comment, not a control.",
      "Workbook-completeness rule; warns rather than blocks because the implementing record may be created after the verifier.",
    ),
    rule(
      FPL_RULE.pursuitWorkbooksDistinct,
      "A pursuit's proof and knowledge workbooks are distinct",
      "error",
      [FPL.Pursuit],
      "proofs_workbook_id != knowledge_workbook_id",
      "instance.field_values.proofs_workbook_id != instance.field_values.knowledge_workbook_id",
      "proofs_workbook_id and knowledge_workbook_id name the same workbook; the proof state (re-crt) and the knowledge state (logical-knowledge-base) are held in separate workbooks so their authorities stay distinct.",
      "Decidable on the instance; blocks.",
    ),
  ],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};
