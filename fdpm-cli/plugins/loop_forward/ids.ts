/**
 * Type ids, categories and scopes for the loop-forward profile.
 *
 * Every id the profile, the ingest and the five renderers address is
 * declared here once. A renderer that hard-codes `"lf:Stage"` inline
 * cannot be found by a grep for the type it reads, and a type rename
 * then leaves a renderer silently matching nothing — the failure mode is
 * an empty diagram, not an error.
 */
import type { CategoryDef, ScopeDef } from "../../src/core/models/meta.js";

export const VENDOR = "lf" as const;
export const PROFILE_ID = "profile:loop-forward:2.0" as const;
export const PLUGIN_ID = "fdpm.loop-forward" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const PROFILE_VERSION = "2.0.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

/** Primitive type ids. */
export const T = {
  PromptTemplate: "lf:PromptTemplate",
  VariableSpec: "lf:VariableSpec",
  AgentDefinition: "lf:AgentDefinition",
  ToolGrant: "lf:ToolGrant",
  Pipeline: "lf:Pipeline",
  Stage: "lf:Stage",
  VariableBinding: "lf:VariableBinding",
  OutputContract: "lf:OutputContract",
  OutputValidator: "lf:OutputValidator",
  LoopConfig: "lf:LoopConfig",
  Carry: "lf:Carry",
  StopCondition: "lf:StopCondition",
  PipelineExample: "lf:PipelineExample",
  EvaluationPolicy: "lf:EvaluationPolicy",
  RunReceipt: "lf:RunReceipt",
} as const;

/** Relation type ids. */
export const R = {
  TemplateDeclaresVariable: "lf:TemplateDeclaresVariable",
  AgentUsesSystemTemplate: "lf:AgentUsesSystemTemplate",
  AgentGrantsTool: "lf:AgentGrantsTool",
  PipelineDeclaresInput: "lf:PipelineDeclaresInput",
  PipelineHasStage: "lf:PipelineHasStage",
  PipelineHasLoop: "lf:PipelineHasLoop",
  PipelineHasExample: "lf:PipelineHasExample",
  PipelineHasEvaluation: "lf:PipelineHasEvaluation",
  StageRunsAgent: "lf:StageRunsAgent",
  StageUsesTaskTemplate: "lf:StageUsesTaskTemplate",
  StageOverridesSystemTemplate: "lf:StageOverridesSystemTemplate",
  StageHasBinding: "lf:StageHasBinding",
  StageHasOutputContract: "lf:StageHasOutputContract",
  ContractHasValidator: "lf:ContractHasValidator",
  BindingReadsStage: "lf:BindingReadsStage",
  BindingReadsCarry: "lf:BindingReadsCarry",
  LoopHasCarry: "lf:LoopHasCarry",
  LoopHasStopCondition: "lf:LoopHasStopCondition",
  CarryCapturesStage: "lf:CarryCapturesStage",
  StopConditionObservesStage: "lf:StopConditionObservesStage",
  ReceiptEvaluatesPipeline: "lf:ReceiptEvaluatesPipeline",
  ReplacedBy: "lf:ReplacedBy",
} as const;

export const CAT = {
  authoring: "cat:loop-forward:authoring",
  execution: "cat:loop-forward:execution",
  assurance: "cat:loop-forward:assurance",
  evidence: "cat:loop-forward:evidence",
} as const;

/**
 * Four categories, matching the four questions the contract answers:
 * what is said to the model, how the loop runs, what proves the output
 * is acceptable, and what happened when it ran.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: CAT.authoring,
    name: "Authoring",
    description:
      "Prompt templates, their typed variables, agents and the tools those agents may call.",
  },
  {
    id: CAT.execution,
    name: "Execution",
    description:
      "Pipelines, ordered stages, variable bindings, the loop policy, carries and stop conditions.",
  },
  {
    id: CAT.assurance,
    name: "Assurance",
    description:
      "Output contracts, their validators, executable examples and the evaluation policy that gates promotion to active.",
  },
  {
    id: CAT.evidence,
    name: "Evidence",
    description: "Terminal run receipts: what a run consumed and how it ended.",
  },
];

export const SCOPES: ScopeDef[] = [
  {
    id: "scope:loop-forward:workbook",
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope; every loop-forward primitive lives here.",
  },
];

export const SCOPE_ID = "scope:loop-forward:workbook" as const;
export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";

/** The closed vocabularies the contract defines, mirrored for the profile. */
export const ENTITY_STATUS = ["draft", "active", "deprecated", "retired"] as const;
export const VARIABLE_TYPE = [
  "string",
  "number",
  "integer",
  "boolean",
  "enum",
  "json",
] as const;
export const SENSITIVITY = ["public", "internal", "confidential", "pii"] as const;
export const CONTENT_SENSITIVITY = [
  "public",
  "internal",
  "confidential",
  "contains_pii",
] as const;
export const TOOL_AUTHORITY = [
  "read",
  "write",
  "destructive",
  "production",
  "external_message",
  "financial",
  "privacy_sensitive",
] as const;
export const APPROVAL = ["none", "per_run", "per_action"] as const;
export const OUTPUT_FORMAT = ["text", "markdown", "json"] as const;
export const VALIDATOR_KIND = ["regex", "range", "named"] as const;
export const ON_INVALID = ["fail", "retry"] as const;
export const BINDING_SOURCE_KIND = [
  "literal",
  "pipeline_input",
  "stage_output",
  "carried",
] as const;
export const CARRY_MODE = ["replace", "append"] as const;
export const STOP_KIND = [
  "output_match",
  "field_equals",
  "field_truthy",
  "score_threshold",
  "unchanged",
] as const;
export const TERMINAL_STATE = [
  "success",
  "clean_noop",
  "blocked",
  "approval_required",
  "exhausted",
  "stagnated",
  "failed",
] as const;
export const EXAMPLE_KIND = ["few_shot", "golden", "adversarial"] as const;
export const SAMPLING_KIND = ["deterministic", "temperature", "top_p"] as const;
