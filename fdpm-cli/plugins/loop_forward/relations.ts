/**
 * The twenty-two relation types of the loop-forward profile.
 *
 * These are the edges the Family A renderers walk. Three of them carry
 * the load and are worth naming:
 *
 *   lf:BindingReadsStage    — the same-iteration forward edge. The
 *                             contract permits it only toward a strictly
 *                             earlier stage, which is what makes one
 *                             iteration a DAG.
 *   lf:CarryCapturesStage   — the cross-iteration back edge. All backward
 *                             flow goes through a carry; the iteration
 *                             ceiling is what keeps that cycle safe.
 *   lf:StopConditionObservesStage
 *                           — how a run is allowed to end. Many-to-many
 *                             because the `unchanged` arm observes up to
 *                             32 outputs at once.
 *
 * Ordered containment (stages within a pipeline, validators within a
 * contract) is carried by a `position` field on the target primitive, not
 * by edge order: relation instances are a set and nothing in the host
 * promises to return them in insertion order.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { R, T } from "./ids.js";

function edge(args: {
  id: string;
  name: string;
  description: string;
  source: string;
  target: string | readonly string[];
  cardinality?: RelationTypeDef["cardinality"];
  acyclic?: boolean;
}): RelationTypeDef {
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    source_types: [args.source],
    target_types: typeof args.target === "string" ? [args.target] : [...args.target],
    cardinality: args.cardinality ?? "many-to-one",
    fields: [],
    symmetric: false,
    transitive: false,
  };
}

export const RELATIONS: RelationTypeDef[] = [
  // -- Authoring ---------------------------------------------------------
  edge({
    id: R.TemplateDeclaresVariable,
    name: "TemplateDeclaresVariable",
    description:
      "The template declares this variable. Every Mustache placeholder in its messages must resolve to one of these, and a template used as a system prompt may declare no required variable at all.",
    source: T.PromptTemplate,
    target: T.VariableSpec,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.AgentUsesSystemTemplate,
    name: "AgentUsesSystemTemplate",
    description:
      "The agent's system prompt. Aggregation: the template outlives the agent. An active agent requires an active template.",
    source: T.AgentDefinition,
    target: T.PromptTemplate,
  }),
  edge({
    id: R.AgentGrantsTool,
    name: "AgentGrantsTool",
    description: "The agent may call this tool at the declared authority and approval boundary.",
    source: T.AgentDefinition,
    target: T.ToolGrant,
    cardinality: "one-to-many",
  }),

  // -- Pipeline composition ---------------------------------------------
  edge({
    id: R.PipelineDeclaresInput,
    name: "PipelineDeclaresInput",
    description: "A caller-supplied run input, constant across iterations.",
    source: T.Pipeline,
    target: T.VariableSpec,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.PipelineHasStage,
    name: "PipelineHasStage",
    description:
      "Composition: the stage dies with the pipeline. Execution order is the stage's `position`, not the order of these edges.",
    source: T.Pipeline,
    target: T.Stage,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.PipelineHasLoop,
    name: "PipelineHasLoop",
    description: "The pipeline's bounded execution policy.",
    source: T.Pipeline,
    target: T.LoopConfig,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.PipelineHasExample,
    name: "PipelineHasExample",
    description:
      "An executable example. An active pipeline requires at least one golden and one adversarial.",
    source: T.Pipeline,
    target: T.PipelineExample,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.PipelineHasEvaluation,
    name: "PipelineHasEvaluation",
    description: "The promotion gate. An active pipeline requires one, with a passing receipt.",
    source: T.Pipeline,
    target: T.EvaluationPolicy,
    cardinality: "one-to-one",
  }),

  // -- Stage wiring ------------------------------------------------------
  edge({
    id: R.StageRunsAgent,
    name: "StageRunsAgent",
    description:
      "The agent this stage invokes. Aggregation: the agent outlives the pipeline. An active pipeline requires active agents.",
    source: T.Stage,
    target: T.AgentDefinition,
  }),
  edge({
    id: R.StageUsesTaskTemplate,
    name: "StageUsesTaskTemplate",
    description: "The user-turn template this stage renders. Its variables are what bindings must cover.",
    source: T.Stage,
    target: T.PromptTemplate,
  }),
  edge({
    id: R.StageOverridesSystemTemplate,
    name: "StageOverridesSystemTemplate",
    description:
      "Present only when the stage's system_prompt_mode is override: this template replaces the agent's system prompt for this stage.",
    source: T.Stage,
    target: T.PromptTemplate,
  }),
  edge({
    id: R.StageHasBinding,
    name: "StageHasBinding",
    description: "One binding per task-template variable the stage supplies.",
    source: T.Stage,
    target: T.VariableBinding,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.StageHasOutputContract,
    name: "StageHasOutputContract",
    description: "What the stage's output must satisfy before anything downstream reads it.",
    source: T.Stage,
    target: T.OutputContract,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.ContractHasValidator,
    name: "ContractHasValidator",
    description: "A declared check beyond the structural parse. Applied in `position` order.",
    source: T.OutputContract,
    target: T.OutputValidator,
    cardinality: "one-to-many",
  }),

  // -- Data flow ---------------------------------------------------------
  edge({
    id: R.BindingReadsStage,
    name: "BindingReadsStage",
    description:
      "The same-iteration forward edge: this binding reads the named stage's output at `source_path`. The contract permits it only toward a strictly earlier stage, which is what makes one iteration a DAG.",
    source: T.VariableBinding,
    target: T.Stage,
  }),
  edge({
    id: R.BindingReadsCarry,
    name: "BindingReadsCarry",
    description:
      "The cross-iteration read: this binding takes the value the carry captured at the end of the previous iteration, or its initial_value on iteration 1.",
    source: T.VariableBinding,
    target: T.Carry,
  }),
  edge({
    id: R.LoopHasCarry,
    name: "LoopHasCarry",
    description: "A named cross-iteration channel owned by this loop.",
    source: T.LoopConfig,
    target: T.Carry,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.LoopHasStopCondition,
    name: "LoopHasStopCondition",
    description: "An early-termination rule evaluated at the end of each iteration.",
    source: T.LoopConfig,
    target: T.StopCondition,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.CarryCapturesStage,
    name: "CarryCapturesStage",
    description:
      "The cross-iteration back edge: the carry captures this stage's output at the end of every iteration. All backward flow goes through a carry, and the iteration ceiling is what keeps that cycle safe.",
    source: T.Carry,
    target: T.Stage,
  }),
  edge({
    id: R.StopConditionObservesStage,
    name: "StopConditionObservesStage",
    description:
      "The stage output this condition tests. Many-to-many because the `unchanged` arm observes up to 32 outputs at once.",
    source: T.StopCondition,
    target: T.Stage,
    cardinality: "many-to-many",
  }),

  // -- Evidence and lifecycle -------------------------------------------
  edge({
    id: R.ReceiptEvaluatesPipeline,
    name: "ReceiptEvaluatesPipeline",
    description: "The pipeline and version this terminal receipt records a run of.",
    source: T.RunReceipt,
    target: T.Pipeline,
  }),
  {
    id: R.ReplacedBy,
    name: "ReplacedBy",
    description:
      "A deprecated entity's replacement. The contract requires the replacement to keep the same natural name, carry a strictly greater version, and belong to the same collection; the replacement graph is checked acyclic.",
    source_types: [T.PromptTemplate, T.AgentDefinition, T.Pipeline],
    target_types: [T.PromptTemplate, T.AgentDefinition, T.Pipeline],
    cardinality: "many-to-one",
    fields: [],
    symmetric: false,
    transitive: true,
  },
];
