/**
 * profile:codex-delegation:0.1 — composition profile for the Claude Code →
 * Codex CLI delegation described in docs/how-to.md.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * What this is: a profile that `extends` two parents and contributes the
 * delegation mode neither of them models plus the edges neither can declare
 * alone.
 *
 *   profile:loop-forward:2.0        the orchestration contract — agents,
 *                                   prompts, stages, tool grants, output
 *                                   contracts, validators, run receipts
 *   profile:silent-acceptance:2.1   the verification boundary of Silent
 *                                   Acceptance v2.1.0 §9.1 — consumer,
 *                                   pinned solver configuration, nine
 *                                   per-class dispositions, verifiers,
 *                                   oracles, acceptance authority
 *
 * The parents use disjoint id namespaces (lf:*, sa:*), so the extends-merge
 * cannot collide; this profile's own vocabulary lives under cdel:*.
 *
 * Contributed primitive type
 *   cdel:DelegationMode   the sandbox tier, write scope, network access and
 *                         git authority a delegated run executes under —
 *                         the wrapper script's behaviour as validated data
 *                         rather than as shell control flow nothing checks
 *
 * Contributed relation types (the bridges)
 *   lf:Stage                 → cdel:DelegationMode      the tiers a stage may run under
 *   cdel:DelegationMode      → lf:OutputContract        the return contract the mode enforces
 *   sa:VerificationBoundary  → lf:Stage                 the boundary a stage's output crosses
 *   sa:Verifier              → lf:OutputValidator |     the pipeline record that implements
 *                              lf:OutputContract        the declared mechanism
 *   sa:Verifier              → sa:Oracle                what the mechanism checks against
 *   sa:AcceptedRisk          → sa:Verifier              the declared, not yet calibrated verifier
 *                                                       that is a risk's compensating control
 *   sa:SolverConfiguration   → lf:AgentDefinition       the pinned configuration's model
 *   sa:SolverConfiguration   → lf:PromptTemplate        the prompts its prompt_set_digest covers
 *   sa:SolverConfiguration   → lf:ToolGrant             the grants its tool_set_digest covers
 *   lf:RunReceipt            → sa:OutputSubmission      the outputs a run presented to a boundary
 *
 * Four of the contributed rules are decidable on the instance and therefore
 * block. They are the containment invariants docs/how-to.md previously stated
 * only in prose — "never use danger-full-access", "never git commit or push",
 * "write mode requires a git repo so the diff is reviewable" — moved from a
 * sentence a model may or may not honour to a constraint the host enforces on
 * every write. The remaining three are workbook-completeness rules: an edge
 * cannot exist before both of its endpoints do, so they warn during authoring
 * and are conclusive under `fdpm validate`.
 */
import type { DomainProfile } from "../../src/core/models/meta.js";

export const PROFILE_ID = "profile:codex-delegation:0.1" as const;
export const PROFILE_VERSION = "0.1.0" as const;
export const SILENT_ACCEPTANCE_VERSION = "2.1.0" as const;
export const SILENT_ACCEPTANCE_DOI = "10.5281/zenodo.19401266" as const;

export const PARENT_LOOP_FORWARD = "profile:loop-forward:2.0" as const;
export const PARENT_SILENT_ACCEPTANCE = "profile:silent-acceptance:2.1" as const;
export const PARENTS = [PARENT_LOOP_FORWARD, PARENT_SILENT_ACCEPTANCE] as const;

/** Primitive type ids contributed here. */
export const CDEL = {
  DelegationMode: "cdel:DelegationMode",
} as const;

/** Relation type ids contributed here. */
export const CDEL_R = {
  StageRunsInMode: "cdel:StageRunsInMode",
  ModeReturnsContract: "cdel:ModeReturnsContract",
  BoundaryGuardsStage: "cdel:BoundaryGuardsStage",
  VerifierImplementedBy: "cdel:VerifierImplementedBy",
  VerifierChecksAgainst: "cdel:VerifierChecksAgainst",
  RiskMitigatedByVerifier: "cdel:RiskMitigatedByVerifier",
  ConfigurationRunsAgent: "cdel:ConfigurationRunsAgent",
  ConfigurationUsesTemplate: "cdel:ConfigurationUsesTemplate",
  ConfigurationGrantsTool: "cdel:ConfigurationGrantsTool",
  ReceiptSubmitted: "cdel:ReceiptSubmitted",
} as const;

/** Rule ids contributed here. */
export const CDEL_RULE = {
  noFullAccess: "cdel:val:no-full-access",
  writeTierCoherent: "cdel:val:write-tier-coherent",
  noGitAuthority: "cdel:val:no-git-authority",
  writeRequiresGit: "cdel:val:write-requires-git",
  stageGuarded: "cdel:val:stage-guarded",
  modeIsRun: "cdel:val:mode-is-run",
  verifierImplemented: "cdel:val:verifier-implemented",
} as const;

export const CAT = {
  delegation: "cat:codex-delegation:delegation",
} as const;

/** Sandbox tiers `codex exec --sandbox` accepts. */
export const SANDBOX_TIERS = ["read-only", "workspace-write", "danger-full-access"] as const;
export type SandboxTier = (typeof SANDBOX_TIERS)[number];

/** Delegation modes the wrapper implements. */
export const MODE_NAMES = ["research", "patch", "write"] as const;
export type ModeName = (typeof MODE_NAMES)[number];

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

const DELEGATION_MODE: PrimitiveTypeDef = {
  id: CDEL.DelegationMode,
  name: "Delegation Mode",
  category_id: CAT.delegation,
  description:
    "One tier of delegated execution: the sandbox the subordinate agent runs in, whether it may write the workspace, whether it may reach the network, and whether it holds any git authority. The wrapper script derives its `codex exec` flags from this record, so the containment claim and the command line cannot drift apart.",
  fields: [
    field("mode_name", "enum", true, "The mode the wrapper is invoked with (--mode).", { enum_values: [...MODE_NAMES] }),
    field("description", "text", true, "What this mode is for and what it deliberately cannot do."),
    field("sandbox_tier", "enum", true, "The value passed to `codex exec --sandbox`.", { enum_values: [...SANDBOX_TIERS] }),
    field("writes_workspace", "boolean", true, "Whether the subordinate agent may modify files in the target repository."),
    field("network_access", "boolean", true, "Whether the sandbox permits outbound network access (`sandbox_workspace_write.network_access`)."),
    field("git_allowed", "boolean", true, "Whether the subordinate agent holds any git authority. Always false: commits, pushes and releases stay with the orchestrator and the operator."),
    field("requires_git_repo", "boolean", true, "Whether the wrapper refuses to run outside a git working tree, so that every change it makes is diffable and revertible."),
    field("return_schema", "text", true, "The JSON Schema the wrapper validates the subordinate agent's last message against before returning it. A prose return contract is not a contract."),
    field("wrapper_flags", "list", false, "The exact `codex exec` arguments this mode produces, in order, for review against the wrapper source.", {
      item_field: { name: "item", kind: "string", required: true, validations: [] },
    }),
  ],
  id_format: { pattern: "cdel:mode:{slug}", uniqueness: "workbook", pattern_kind: "template" },
  inline_structs: [],
  is_partition_unit: false,
  scoped: false,
  constraints: [],
};

export const PROFILE: DomainProfile = {
  id: PROFILE_ID,
  version: PROFILE_VERSION,
  name: "Codex Delegation",
  label: "Codex Delegation 0.1 (loop-forward + silent-acceptance)",
  description:
    "Composition profile extending profile:loop-forward:2.0 and profile:silent-acceptance:2.1. A workbook on this profile holds the Claude Code → Codex CLI delegation pipeline of docs/how-to.md as validated data: the stages, the work-order and return contracts, the tool grants that are the containment, the delegation modes with their sandbox tiers, and the Silent Acceptance v2.1.0 verification boundary declared per stage over all nine intrinsic error classes with the operator as acceptance authority. Contributes one primitive type (cdel:DelegationMode) and the relations that join the two parents.",
  extends: [...PARENTS],
  categories: [
    {
      id: CAT.delegation,
      name: "Delegation",
      label: "Delegation",
      description: "Execution tiers a subordinate agent runs under.",
    },
  ],
  scopes: [],
  primitive_types: [DELEGATION_MODE],
  relation_types: [
    relation(
      CDEL_R.StageRunsInMode,
      "Stage runs in mode",
      ["lf:Stage"],
      [CDEL.DelegationMode],
      "many-to-many",
      "The delegation modes a stage may execute under; the run's `mode` input selects one of them. A stage the orchestrator runs itself declares none.",
    ),
    relation(
      CDEL_R.ModeReturnsContract,
      "Mode returns contract",
      [CDEL.DelegationMode],
      ["lf:OutputContract"],
      "one-to-one",
      "The lf:OutputContract whose json_schema is this mode's return_schema. The wrapper enforces it before the orchestrator reads a single line of the subordinate agent's output.",
    ),
    relation(
      CDEL_R.BoundaryGuardsStage,
      "Boundary guards stage",
      ["sa:VerificationBoundary"],
      ["lf:Stage"],
      "one-to-one",
      "The stage whose output crosses this boundary before any consumer receives it. Every stage has exactly one.",
    ),
    relation(
      CDEL_R.VerifierImplementedBy,
      "Verifier implemented by",
      ["sa:Verifier"],
      ["lf:OutputValidator", "lf:OutputContract"],
      "many-to-many",
      "The pipeline record that implements the declared mechanism: an lf:OutputValidator, or the lf:OutputContract whose schema is the mechanism. A verifier with no such edge names a check nothing runs.",
    ),
    relation(
      CDEL_R.VerifierChecksAgainst,
      "Verifier checks against",
      ["sa:Verifier"],
      ["sa:Oracle"],
      "many-to-many",
      "The oracle the mechanism consults; a calibration run measures the verifier's recall against it.",
    ),
    relation(
      CDEL_R.RiskMitigatedByVerifier,
      "Risk mitigated by verifier",
      ["sa:AcceptedRisk"],
      ["sa:Verifier"],
      "many-to-many",
      "A verifier that is declared and implemented but not yet calibrated, named as the compensating control of an accepted risk. The first passed calibration moves the class from accepted risk to covered.",
    ),
    relation(
      CDEL_R.ConfigurationRunsAgent,
      "Configuration runs agent",
      ["sa:SolverConfiguration"],
      ["lf:AgentDefinition"],
      "many-to-one",
      "The pipeline agent whose provider, model and sampling policy the pinned configuration's model_id names.",
    ),
    relation(
      CDEL_R.ConfigurationUsesTemplate,
      "Configuration uses template",
      ["sa:SolverConfiguration"],
      ["lf:PromptTemplate"],
      "many-to-many",
      "The prompt templates the configuration's prompt_set_digest was computed over.",
    ),
    relation(
      CDEL_R.ConfigurationGrantsTool,
      "Configuration grants tool",
      ["sa:SolverConfiguration"],
      ["lf:ToolGrant"],
      "many-to-many",
      "The tool grants the configuration's tool_set_digest was computed over. Delegation containment is the grant set, so the digest has to be recomputable from records rather than asserted.",
    ),
    relation(
      CDEL_R.ReceiptSubmitted,
      "Receipt submitted",
      ["lf:RunReceipt"],
      ["sa:OutputSubmission"],
      "one-to-many",
      "The stage outputs a run presented to their boundaries, one submission per output.",
    ),
  ],
  validation_rules: [
    rule(
      CDEL_RULE.noFullAccess,
      "No delegation mode runs without a sandbox",
      "error",
      [CDEL.DelegationMode],
      'sandbox_tier != "danger-full-access"',
      'instance.field_values.sandbox_tier != "danger-full-access"',
      'sandbox_tier is "danger-full-access": a non-interactive run has no approval surface, so the sandbox tier is the only containment left. Delegation with no containment is not delegation.',
      "Decidable on the instance; blocks. This is the invariant docs/how-to.md previously stated only as the prose sentence 'never use --yolo, --dangerously-bypass-approvals-and-sandbox, or danger-full-access'.",
    ),
    rule(
      CDEL_RULE.writeTierCoherent,
      "Write scope and sandbox tier agree",
      "error",
      [CDEL.DelegationMode],
      "writes_workspace == (sandbox_tier == \"workspace-write\")",
      'instance.field_values.writes_workspace == (instance.field_values.sandbox_tier == "workspace-write")',
      "writes_workspace and sandbox_tier disagree: a mode that writes the workspace runs at workspace-write, and a mode at workspace-write is a writing mode. A read-only tier that claims to write, or a write tier declared read-only, means the record and the command line describe different runs.",
      "Decidable on the instance; blocks. Keeps the declared containment and the flag the wrapper emits in step with each other in both directions.",
    ),
    rule(
      CDEL_RULE.noGitAuthority,
      "No delegation mode holds git authority",
      "error",
      [CDEL.DelegationMode],
      "git_allowed == false",
      "instance.field_values.git_allowed == false",
      "git_allowed is true: commits, pushes, releases and sign-off are the operator's, and a subordinate agent that can commit can erase the diff the orchestrator was going to review.",
      "Decidable on the instance; blocks. Encodes the docs/how-to.md routing policy line 'never delegate: commits, pushes, releases' as a constraint rather than an instruction.",
    ),
    rule(
      CDEL_RULE.writeRequiresGit,
      "A writing mode refuses to run outside a git repository",
      "error",
      [CDEL.DelegationMode],
      "!writes_workspace || requires_git_repo",
      "!instance.field_values.writes_workspace || instance.field_values.requires_git_repo",
      "writes_workspace is true but requires_git_repo is false: an edit made outside a working tree cannot be diffed or reverted, which removes the review step delegation exists for.",
      "Decidable on the instance; blocks.",
    ),
    rule(
      CDEL_RULE.stageGuarded,
      "Every stage is guarded by a verification boundary",
      "warning",
      ["lf:Stage"],
      'has_incoming(self, "cdel:BoundaryGuardsStage")',
      'graph.incoming("cdel:BoundaryGuardsStage").size() >= 1',
      "This stage consumes model output and no sa:VerificationBoundary guards it: that is silent acceptance (Silent Acceptance v2.1.0 §9.1, Corollary 4).",
      "Workbook-completeness rule: the boundary edge cannot exist before the stage does, so it warns rather than blocks; `fdpm validate` is where it is conclusive.",
    ),
    rule(
      CDEL_RULE.modeIsRun,
      "A declared mode is run by a stage",
      "warning",
      [CDEL.DelegationMode],
      'has_incoming(self, "cdel:StageRunsInMode")',
      'graph.incoming("cdel:StageRunsInMode").size() >= 1',
      "No lf:Stage runs this cdel:DelegationMode. A tier the pipeline never enters is a containment claim about nothing, and it drifts silently once the wrapper stops offering the mode.",
      "Workbook-completeness rule; warns rather than blocks because the stage edge cannot exist before the mode does. Stated on the mode rather than on the stage: which stages delegate is workbook data a profile rule cannot see, so a rule phrased over lf:Stage would fire on every orchestrator-run stage — and a rule that fires on the shape it calls legitimate trains its reader to ignore it.",
    ),
    rule(
      CDEL_RULE.verifierImplemented,
      "A verifier is implemented by a pipeline record",
      "warning",
      ["sa:Verifier"],
      'has_outgoing(self, "cdel:VerifierImplementedBy")',
      'graph.outgoing("cdel:VerifierImplementedBy").size() >= 1',
      "This sa:Verifier is implemented by no lf:OutputValidator or lf:OutputContract; a mechanism nothing runs is a comment, not a control.",
      "Workbook-completeness rule; warns rather than blocks because the implementing record may be created after the verifier.",
    ),
  ],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};
