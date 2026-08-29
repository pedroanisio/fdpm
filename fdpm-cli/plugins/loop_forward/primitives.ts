/**
 * The fifteen primitive types of the loop-forward profile.
 *
 * DERIVATION — where these come from, and the one decision that shapes
 * all of them.
 *
 * `schemas/loop-forward.ts` is a vendored copy of the canonical v2
 * contract. It models a store as ONE root document: three entity
 * collections plus run receipts, with stages, bindings, carries, stop
 * conditions, tool grants and output contracts all nested inside. FDPM's
 * unit is a graph of primitives joined by typed relations, so the import
 * flattens that document — but not uniformly, and the two rules it
 * follows are worth stating because they are the whole design.
 *
 * RULE 1 — a nested object is LIFTED to a primitive when something else
 * in the document points at it. `Carry` is referenced by name from a
 * binding; `Stage` is referenced by id from a carry, a binding and a stop
 * condition; `OutputContract` is what a carry's `source_path` resolves
 * against. Left as struct fields these references are opaque strings the
 * host never checks, and the graph renderers have no edges to draw. So
 * Stage, Carry, StopCondition, VariableBinding, OutputContract,
 * OutputValidator, VariableSpec, ToolGrant, LoopConfig, PipelineExample
 * and EvaluationPolicy are all first-class.
 *
 * RULE 2 — `AttemptRecord` is NOT lifted, and this is deliberate. The
 * contract bounds `run_receipts` at 10,000 and each receipt's `records`
 * at 100,000 (MODEL_CALL_CEILING). Lifting the attempt record would let a
 * single workbook reach a hundred thousand primitives for one run. It
 * stays a serialized struct array on `lf:RunReceipt`, addressed by the
 * evidence renderers rather than by the graph.
 *
 * DISCRIMINATED UNIONS — the contract carries five
 * (`BindingSource.kind`, `StopCondition.kind`, `OutputValidator.kind`,
 * `OnInvalid.action`, `SamplingStrategy.kind`, plus `OutputContract`
 * discriminated on `format`). @fdpm/zod-bridge maps a union in field
 * position to an opaque `format: "json-union"` blob — the validator still
 * enforces it through safeParse, but the profile sees a string and
 * nothing can address the variant. Each union is therefore flattened
 * HERE into a discriminator enum plus the union of its arms' fields,
 * every arm-specific field optional. That is lossy in one direction only
 * (the profile permits a field combination the contract would reject),
 * and the loss is covered: `validators.ts` runs the real Zod schema over
 * every instance, so an arm mismatch is an error at write time, not a
 * silently accepted record.
 */
import type { PrimitiveTypeDef } from "../../src/core/models/meta.js";
import {
  boolField,
  enumOf,
  idTemplate,
  intField,
  jsonField,
  numberField,
  primitive,
  shortText,
  str,
  strList,
} from "./_common.js";
import {
  APPROVAL,
  BINDING_SOURCE_KIND,
  CARRY_MODE,
  CAT,
  CONTENT_SENSITIVITY,
  ENTITY_STATUS,
  EXAMPLE_KIND,
  ON_INVALID,
  OUTPUT_FORMAT,
  SAMPLING_KIND,
  SENSITIVITY,
  STOP_KIND,
  T,
  TERMINAL_STATE,
  TOOL_AUTHORITY,
  VALIDATOR_KIND,
  VARIABLE_TYPE,
} from "./ids.js";

/**
 * The lifecycle block every authored entity carries (§2 of the
 * contract). Repeated on three primitives rather than modelled as a
 * shared struct because the host addresses `field_values` by flat name
 * and a renderer reading `status` should not need to know which entity
 * it holds.
 */
function lifecycleFields() {
  return [
    shortText("name", "Kebab-case natural key. Unique per kind and version.", 64),
    shortText("version", "Semantic version of this entity's content.", 32),
    enumOf(
      "status",
      "Lifecycle state. Promotion to active requires the assurance evidence the contract enumerates.",
      ENTITY_STATUS,
    ),
    str("description", "What this entity is for."),
    strList("tags", "Unique kebab-case tags. Empty when untagged.", { required: false }),
    shortText("owner", "Accountable owner. May contain PII; mask in logs.", 256),
    intField("review_every_days", "Governance review cadence, in days."),
    shortText("last_reviewed_at", "UTC instant of the last governance review.", 32, {
      required: false,
    }),
    shortText("created_by", "Creating actor. May contain PII; mask in logs.", 256),
    shortText("created_at", "UTC creation instant. Immutable.", 32),
    shortText("modified_by", "Actor of the latest modification.", 256, { required: false }),
    shortText("modified_at", "UTC instant of the latest modification.", 32, {
      required: false,
    }),
    shortText(
      "deprecated_since",
      "Version at which deprecation began. Present exactly when status is deprecated or retired.",
      32,
      { required: false },
    ),
    shortText("sunset_version", "Version at or after which removal is permitted.", 32, {
      required: false,
    }),
    str("deprecation_reason", "Why the entity was deprecated.", { required: false }),
    intField("changelog_length", "Number of recorded changelog entries.", {
      required: false,
    }),
  ];
}

export const PROMPT_TEMPLATE: PrimitiveTypeDef = primitive({
  id: T.PromptTemplate,
  name: "PromptTemplate",
  category: CAT.authoring,
  description:
    "A localized, versioned conversation template. `messages` is an ordered role-tagged list whose Mustache placeholders — including sections and triple-stache — must all resolve to a declared lf:VariableSpec.",
  scoped: true,
  id_format: idTemplate("lf:template:{slug}"),
  fields: [
    ...lifecycleFields(),
    shortText("locale", "BCP 47 language or language-REGION. Translations are separate templates.", 16),
    jsonField(
      "messages",
      "Ordered [{role, content}] conversation template, serialized. Roles are system, user or assistant.",
    ),
    intField("message_count", "Number of messages, so a catalog need not parse the payload."),
    enumOf(
      "content_sensitivity",
      "Data classification of the message bodies. contains_pii means renderers redact.",
      CONTENT_SENSITIVITY,
    ),
  ],
});

export const VARIABLE_SPEC: PrimitiveTypeDef = primitive({
  id: T.VariableSpec,
  name: "VariableSpec",
  category: CAT.authoring,
  description:
    "One typed input declaration. Owned by a template (its placeholders) or by a pipeline (its run inputs); the owning edge says which.",
  scoped: true,
  id_format: idTemplate("lf:var:{slug}"),
  fields: [
    shortText("variable_name", "snake_case identifier used in placeholders and bindings.", 64),
    enumOf("type", "Declared value type. Bindings are type-checked against this.", VARIABLE_TYPE),
    str("description", "What the value means and who supplies it."),
    boolField("is_required", "False when a default is declared or the value may be omitted."),
    jsonField("default_value", "Serialized default. Present only when is_required is false.", {
      required: false,
    }),
    strList("enum_values", "Permitted values. Present exactly when type is enum.", {
      required: false,
    }),
    enumOf("sensitivity", "Data classification of the bound value.", SENSITIVITY),
  ],
});

export const AGENT_DEFINITION: PrimitiveTypeDef = primitive({
  id: T.AgentDefinition,
  name: "AgentDefinition",
  category: CAT.authoring,
  description:
    "A reusable agent: a system prompt, a model policy and a set of approval-aware tool grants. Referenced by stages; it outlives them.",
  scoped: true,
  id_format: idTemplate("lf:agent:{slug}"),
  fields: [
    ...lifecycleFields(),
    shortText("provider", "External provider registry key.", 64),
    shortText("model_id", "External provider model identifier.", 128),
    enumOf("sampling_kind", "Which sampling strategy the agent declares.", SAMPLING_KIND),
    numberField(
      "sampling_value",
      "Temperature (0-2) or top-p (0-1). Absent for deterministic sampling.",
      { required: false },
    ),
    intField("sampling_seed", "Sampling seed when the provider honours one.", {
      required: false,
    }),
    intField("max_output_tokens", "Per-call output ceiling, in tokens."),
    strList("stop_sequences", "Unique stop sequences. Empty when none.", { required: false }),
  ],
});

export const TOOL_GRANT: PrimitiveTypeDef = primitive({
  id: T.ToolGrant,
  name: "ToolGrant",
  category: CAT.authoring,
  description:
    "One tool an agent may call, with the authority class it exercises and the approval boundary that gates it. The contract already refuses write authority without approval, and any authority beyond read or write without per-action approval.",
  scoped: true,
  id_format: idTemplate("lf:grant:{slug}"),
  fields: [
    shortText("tool_name", "Stable tool name as the runtime exposes it.", 128),
    enumOf("authority", "The class of action this grant permits.", TOOL_AUTHORITY),
    enumOf("approval", "When a human must approve an exercise of this grant.", APPROVAL),
  ],
});

export const PIPELINE: PrimitiveTypeDef = primitive({
  id: T.Pipeline,
  name: "Pipeline",
  category: CAT.execution,
  description:
    "An ordered multi-agent feedback pipeline. Sole owner of its stages, loop config, examples and evaluation policy; those die with it.",
  scoped: true,
  id_format: idTemplate("lf:pipeline:{slug}"),
  fields: [
    ...lifecycleFields(),
    intField("stage_count", "Number of stages, in execution order."),
    intField("example_count", "Number of declared executable examples."),
  ],
});

export const STAGE: PrimitiveTypeDef = primitive({
  id: T.Stage,
  name: "Stage",
  category: CAT.execution,
  description:
    "One agent invocation per iteration. `position` is the execution order within the iteration and the ordering the forward-DAG rule is stated against: a stage may read only the output of a strictly earlier stage.",
  scoped: true,
  id_format: idTemplate("lf:stage:{slug}"),
  fields: [
    shortText("stage_name", "Kebab-case name, unique within the pipeline.", 64),
    intField("position", "Zero-based execution order within one iteration."),
    enumOf(
      "system_prompt_mode",
      "Tri-state from the contract: inherit takes the agent's system prompt, disabled runs with none, override replaces it with the stage's own template.",
      ["inherit", "disabled", "override"],
    ),
    intField("timeout_ms", "Per-attempt wall-clock limit, in milliseconds.", {
      required: false,
    }),
    intField("binding_count", "Number of variable bindings declared on this stage."),
  ],
});

export const VARIABLE_BINDING: PrimitiveTypeDef = primitive({
  id: T.VariableBinding,
  name: "VariableBinding",
  category: CAT.execution,
  description:
    "Binds one task-template variable to a data source. `source_kind` is the flattened discriminator of the contract's BindingSource union; exactly one of the four source columns carries a value, and the Zod validator enforces which.",
  scoped: true,
  id_format: idTemplate("lf:binding:{slug}"),
  fields: [
    shortText("variable_name", "The task-template variable this binding satisfies.", 64),
    enumOf("source_kind", "Where the value comes from.", BINDING_SOURCE_KIND),
    jsonField("literal_value", "Serialized constant. Present when source_kind is literal.", {
      required: false,
    }),
    shortText("input_name", "Pipeline input read. Present when source_kind is pipeline_input.", 64, {
      required: false,
    }),
    shortText(
      "source_path",
      "RFC 6901 JSON pointer into the source stage's output. Present when source_kind is stage_output.",
      512,
      { required: false },
    ),
    shortText("carry_name", "Carry read. Present when source_kind is carried.", 64, {
      required: false,
    }),
  ],
});

export const OUTPUT_CONTRACT: PrimitiveTypeDef = primitive({
  id: T.OutputContract,
  name: "OutputContract",
  category: CAT.assurance,
  description:
    "What a stage's output must satisfy before anything downstream may read it. The contract's three-arm union over `format` is flattened: `json_schema` is present exactly for the json arm, which the schema additionally requires to be an object with additionalProperties false and at least one property.",
  scoped: true,
  id_format: idTemplate("lf:contract:{slug}"),
  fields: [
    enumOf("format", "The shape the stage must emit.", OUTPUT_FORMAT),
    jsonField(
      "json_schema",
      "Serialized JSON Schema, compiled by Zod before the contract is accepted. Present exactly when format is json.",
      { required: false },
    ),
    intField("validator_count", "Number of declared validators beyond the structural parse."),
    enumOf(
      "on_invalid",
      "What happens when validation fails: fail stops the run, retry re-prompts.",
      ON_INVALID,
    ),
    intField("max_attempts", "Attempt ceiling. Present exactly when on_invalid is retry.", {
      required: false,
    }),
    str("retry_feedback", "Text fed back to the model on a retry.", { required: false }),
  ],
});

export const OUTPUT_VALIDATOR: PrimitiveTypeDef = primitive({
  id: T.OutputValidator,
  name: "OutputValidator",
  category: CAT.assurance,
  description:
    "One declared check beyond the structural parse, applied in order. The regex/range/named union is flattened onto `kind`.",
  scoped: true,
  id_format: idTemplate("lf:validator:{slug}"),
  fields: [
    intField("position", "Zero-based order within the contract's validator sequence."),
    enumOf("kind", "Which validator this is.", VALIDATOR_KIND),
    shortText(
      "path",
      "RFC 6901 pointer at the value checked. Required for range and for regex over json output.",
      512,
      { required: false },
    ),
    str("pattern", "ECMAScript regular expression. Present when kind is regex.", {
      required: false,
    }),
    numberField("min", "Inclusive lower bound. Present when kind is range.", { required: false }),
    numberField("max", "Inclusive upper bound. Present when kind is range.", { required: false }),
    shortText("validator_name", "Registered validator name. Present when kind is named.", 64, {
      required: false,
    }),
    jsonField("args", "Serialized arguments for a named validator.", { required: false }),
  ],
});

export const LOOP_CONFIG: PrimitiveTypeDef = primitive({
  id: T.LoopConfig,
  name: "LoopConfig",
  category: CAT.execution,
  description:
    "The bounded feedback policy: how many iterations at most, how stop conditions combine, and the hard budget that always ends a run as exhausted.",
  scoped: true,
  id_format: idTemplate("lf:loop:{slug}"),
  fields: [
    intField("max_iterations", "Hard iteration ceiling. Always enforced; every run terminates."),
    enumOf("stop_when", "Whether any stop condition ends the loop, or only all of them.", [
      "any",
      "all",
    ]),
    enumOf(
      "on_exhausted",
      "Disposition when the ceiling or budget is reached. Both record terminal_state exhausted; return_last additionally preserves the last validated output.",
      ["fail", "return_last"],
    ),
    intField("max_total_tokens", "Cumulative token budget across the run."),
    intField("max_wall_clock_ms", "Wall-clock budget for the run, in milliseconds."),
    intField("max_model_calls", "Declared ceiling on model calls for the run."),
    numberField("max_cost_usd", "Optional cost ceiling, in USD.", { required: false }),
  ],
});

export const CARRY: PrimitiveTypeDef = primitive({
  id: T.Carry,
  name: "Carry",
  category: CAT.execution,
  description:
    "A named cross-iteration channel — the only path by which data flows backward. Captured from its source stage at the end of each iteration; iteration 1 reads initial_value.",
  scoped: true,
  id_format: idTemplate("lf:carry:{slug}"),
  fields: [
    shortText("carry_name", "snake_case name referenced by bindings of kind carried.", 64),
    shortText("source_path", "RFC 6901 pointer into the source stage's output.", 512),
    enumOf("value_type", "Declared type of the carried value.", VARIABLE_TYPE),
    strList("enum_values", "Permitted values. Present exactly when value_type is enum.", {
      required: false,
    }),
    jsonField("initial_value", "Serialized value read during iteration 1."),
    enumOf(
      "carry_mode",
      "replace keeps the latest capture; append concatenates oldest-first and requires a string value_type.",
      CARRY_MODE,
    ),
    intField("max_serialized_chars", "Ceiling on the serialized carried value, in characters."),
  ],
});

export const STOP_CONDITION: PrimitiveTypeDef = primitive({
  id: T.StopCondition,
  name: "StopCondition",
  category: CAT.execution,
  description:
    "One deterministic end-of-iteration rule and the terminal state it records. The five-arm union is flattened onto `kind`; `unchanged` is the stagnation detector and is the only arm that observes several outputs at once.",
  scoped: true,
  id_format: idTemplate("lf:stop:{slug}"),
  fields: [
    shortText("condition_id", "snake_case id, unique within the loop.", 64),
    enumOf("kind", "Which rule this is.", STOP_KIND),
    enumOf("terminal_state", "The state a run records when this condition fires.", TERMINAL_STATE),
    shortText("path", "RFC 6901 pointer read by field_equals, field_truthy and score_threshold.", 512, {
      required: false,
    }),
    str("pattern", "ECMAScript regular expression. Present when kind is output_match.", {
      required: false,
    }),
    jsonField("match_value", "Serialized comparand. Present when kind is field_equals.", {
      required: false,
    }),
    enumOf("comparator", "Direction of the threshold test.", ["gte", "lte"], {
      required: false,
    }),
    numberField("threshold", "Numeric threshold. Present when kind is score_threshold.", {
      required: false,
    }),
    intField(
      "window",
      "How many consecutive iterations must be identical. Present when kind is unchanged.",
      { required: false },
    ),
    intField("observation_count", "Number of observed outputs. Present when kind is unchanged.", {
      required: false,
    }),
  ],
});

export const PIPELINE_EXAMPLE: PrimitiveTypeDef = primitive({
  id: T.PipelineExample,
  name: "PipelineExample",
  category: CAT.assurance,
  description:
    "An executable few-shot, golden or adversarial case. The contract checks each against the referenced stage's output contract: a valid example must pass it and an invalid one must fail it, so an adversarial example that stopped being adversarial is a parse error rather than a quiet regression.",
  scoped: true,
  id_format: idTemplate("lf:example:{slug}"),
  fields: [
    shortText("example_id", "snake_case id, unique within the pipeline.", 64),
    enumOf("kind", "What role the example plays.", EXAMPLE_KIND),
    enumOf("outcome", "Whether the expected output should pass or fail its stage contract.", [
      "valid",
      "invalid",
    ]),
    str("stage_id", "Instance id of the stage whose output contract this example is checked against."),
    jsonField("input", "Serialized run inputs, checked against the pipeline's declared inputs."),
    jsonField("expected_output", "Serialized expected stage output."),
    str("reason", "Why the output is invalid. Present when outcome is invalid.", {
      required: false,
    }),
  ],
});

export const EVALUATION_POLICY: PrimitiveTypeDef = primitive({
  id: T.EvaluationPolicy,
  name: "EvaluationPolicy",
  category: CAT.assurance,
  description:
    "The promotion gate: a metric with a threshold, separated development and acceptance datasets, and the last acceptance receipt. The contract refuses a receipt whose evaluator is also its approver, and refuses to call a pipeline active without one that meets the threshold on the current version.",
  scoped: true,
  id_format: idTemplate("lf:eval:{slug}"),
  fields: [
    shortText("metric", "snake_case metric name.", 64),
    enumOf("unit", "Unit of the metric value.", ["ratio", "count", "ms", "usd"]),
    enumOf("comparator", "Direction of the promotion test.", ["gte", "lte"]),
    numberField("threshold", "Value the metric must reach."),
    str("development_dataset_ref", "Reference to the development dataset."),
    str("acceptance_dataset_ref", "Reference to the acceptance dataset. Must differ from development."),
    shortText("last_run_at", "UTC instant of the last acceptance run.", 32, { required: false }),
    shortText("last_run_pipeline_version", "Pipeline version the receipt evaluated.", 32, {
      required: false,
    }),
    numberField("last_run_value", "Metric value the acceptance run produced.", {
      required: false,
    }),
    intField("last_run_sample_size", "Sample size of the acceptance run.", { required: false }),
    shortText("evaluated_by", "Actor that ran the evaluation.", 256, { required: false }),
    shortText("approved_by", "Actor that approved it. Must differ from evaluated_by.", 256, {
      required: false,
    }),
    shortText("dataset_sha256", "Digest of the evaluated dataset.", 64, { required: false }),
    shortText("artifact_sha256", "Digest of the evaluated artifact.", 64, { required: false }),
  ],
});

export const RUN_RECEIPT: PrimitiveTypeDef = primitive({
  id: T.RunReceipt,
  name: "RunReceipt",
  category: CAT.evidence,
  description:
    "A terminal, immutable record of one run. `records` stays a serialized array rather than a lifted primitive: the contract bounds it at 100,000 attempts per receipt, and lifting it would let one run become a hundred thousand primitives.",
  scoped: true,
  id_format: idTemplate("lf:receipt:{slug}"),
  fields: [
    shortText("pipeline_version", "Version of the pipeline this run executed.", 32),
    enumOf("terminal_state", "How the run ended.", TERMINAL_STATE),
    shortText("started_at", "UTC start instant.", 32),
    shortText("finished_at", "UTC finish instant.", 32),
    intField("iteration_count", "Iterations executed."),
    intField("model_call_count", "Model calls made; equals the attempt-record count."),
    intField("total_tokens", "Cumulative tokens; equals the attempt-record sum."),
    intField("wall_clock_ms", "Total wall-clock time, in milliseconds."),
    numberField("cost_usd", "Total cost in USD, when the provider reported one.", {
      required: false,
    }),
    jsonField(
      "records",
      "Serialized ordered attempt history: iteration, stage, attempt, output digest, validation result and usage.",
    ),
    jsonField(
      "final_output",
      "Serialized {stage_id, output}. Required when terminal_state is success.",
      { required: false },
    ),
    jsonField(
      "handoff",
      "Serialized resumable state. Required when the run ended blocked, approval_required or stagnated.",
      { required: false },
    ),
    strList("evidence_refs", "Unique references to external evidence.", { required: false }),
  ],
});

export const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  PROMPT_TEMPLATE,
  VARIABLE_SPEC,
  AGENT_DEFINITION,
  TOOL_GRANT,
  PIPELINE,
  STAGE,
  VARIABLE_BINDING,
  OUTPUT_CONTRACT,
  OUTPUT_VALIDATOR,
  LOOP_CONFIG,
  CARRY,
  STOP_CONDITION,
  PIPELINE_EXAMPLE,
  EVALUATION_POLICY,
  RUN_RECEIPT,
];
