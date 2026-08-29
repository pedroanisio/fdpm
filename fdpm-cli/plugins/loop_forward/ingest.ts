/**
 * Ingest — turn a validated `LoopForwardStore` document into the
 * primitives and relations of a workbook.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * That banner is not decoration here: a loop-forward store is exactly the
 * kind of document a model writes. So this module has one entry point and
 * it refuses to guess. `parseLoopForwardStore` (the vendored contract's
 * own parse boundary) runs first and its typed issues are returned
 * verbatim; nothing is coerced, defaulted or truncated on the way in.
 * `ingestLoopForwardStore` accepts only the already-validated type, so
 * there is no path from raw input to a workbook that skips the parse.
 *
 * Determinism: instance uids come from `mintUidFromSeed`, keyed on the
 * instance id. Two ingests of the same document produce byte-equal
 * output — no clock, no randomness — which is what lets the renderer
 * tests assert on exact bytes.
 */
import { mintUidFromSeed } from "../../src/core/identity/uid.js";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../src/core/models/instance.js";
import {
  parseLoopForwardStore,
  type AgentDefinition,
  type Carry,
  type EvaluationPolicy,
  type LoopForwardPipeline,
  type LoopForwardStore,
  type OutputContract,
  type PipelineExample,
  type PromptTemplate,
  type RunReceipt,
  type Stage,
  type StopCondition,
  type VariableSpec,
} from "./schemas/loop-forward.js";
import { R, SCOPE_ID, T } from "./ids.js";

/** What one ingest produced, and what it could not represent. */
export interface IngestResult {
  primitives: PrimitiveInstance[];
  relations: RelationInstance[];
  /** Counts by primitive type id, for the activation log and the tests. */
  counts: Record<string, number>;
}

/** A parse failure, carrying the contract's own issue list. */
export interface IngestFailure {
  ok: false;
  issues: readonly { path: string; message: string }[];
}

export type IngestOutcome = ({ ok: true } & IngestResult) | IngestFailure;

const json = (value: unknown): string => JSON.stringify(value ?? null);

function primitiveOf(
  id: string,
  typeId: string,
  fieldValues: Record<string, unknown>,
): PrimitiveInstance {
  // Undefined is absence; the host stores `field_values` verbatim and a
  // key present with value undefined survives JSON round-trips as null,
  // which a renderer would then have to distinguish from a real null.
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return {
    id,
    uid: mintUidFromSeed(id),
    type_id: typeId,
    field_values: cleaned,
    scope_id: SCOPE_ID,
    revision: 0,
  };
}

function relationOf(
  typeId: string,
  sourceId: string,
  targetId: string,
  discriminator = "",
): RelationInstance {
  const id = `${typeId}:${sourceId}->${targetId}${discriminator}`;
  return {
    id,
    uid: mintUidFromSeed(id),
    type_id: typeId,
    source_id: sourceId,
    target_id: targetId,
    field_values: {},
    revision: 0,
  };
}

// -- Instance id construction -------------------------------------------
//
// Entities keep their UUID; anything lifted out of a nested position is
// keyed on its owner plus its own natural name, so the id is stable
// across ingests and readable in a finding.

const templateId = (uuid: string): string => `lf:template:${uuid}`;
const agentId = (uuid: string): string => `lf:agent:${uuid}`;
const pipelineId = (uuid: string): string => `lf:pipeline:${uuid}`;
const stageId = (uuid: string): string => `lf:stage:${uuid}`;
const receiptId = (uuid: string): string => `lf:receipt:${uuid}`;
const varId = (ownerUuid: string, name: string): string => `lf:var:${ownerUuid}-${name}`;
const grantId = (ownerUuid: string, index: number): string => `lf:grant:${ownerUuid}-${index}`;
const bindingId = (stageUuid: string, variable: string): string =>
  `lf:binding:${stageUuid}-${variable}`;
const contractId = (stageUuid: string): string => `lf:contract:${stageUuid}`;
const validatorId = (stageUuid: string, index: number): string =>
  `lf:validator:${stageUuid}-${index}`;
const loopId = (pipelineUuid: string): string => `lf:loop:${pipelineUuid}`;
const carryId = (pipelineUuid: string, name: string): string => `lf:carry:${pipelineUuid}-${name}`;
const stopId = (pipelineUuid: string, id: string): string => `lf:stop:${pipelineUuid}-${id}`;
const exampleId = (pipelineUuid: string, id: string): string =>
  `lf:example:${pipelineUuid}-${id}`;
const evalId = (pipelineUuid: string): string => `lf:eval:${pipelineUuid}`;

/** The lifecycle block, flattened the way `primitives.ts` declares it. */
function lifecycleValues(
  entity: PromptTemplate | AgentDefinition | LoopForwardPipeline,
): Record<string, unknown> {
  return {
    name: entity.name,
    version: entity.version,
    status: entity.status,
    description: entity.description,
    tags: entity.tags,
    owner: entity.governance.owner,
    review_every_days: entity.governance.review_every_days,
    last_reviewed_at: entity.governance.last_reviewed_at,
    created_by: entity.provenance.created_by,
    created_at: entity.provenance.created_at,
    modified_by: entity.provenance.modified_by,
    modified_at: entity.provenance.modified_at,
    deprecated_since: entity.deprecation?.deprecated_since,
    sunset_version: entity.deprecation?.sunset_version,
    deprecation_reason: entity.deprecation?.reason,
    changelog_length: entity.changelog.length,
  };
}

function variableValues(variable: VariableSpec): Record<string, unknown> {
  return {
    variable_name: variable.name,
    type: variable.type,
    description: variable.description,
    is_required: variable.is_required,
    default_value: variable.default === undefined ? undefined : json(variable.default),
    enum_values: variable.enum_values,
    sensitivity: variable.sensitivity,
  };
}

function contractValues(contract: OutputContract): Record<string, unknown> {
  return {
    format: contract.format,
    json_schema: contract.format === "json" ? json(contract.json_schema) : undefined,
    validator_count: contract.validators.length,
    on_invalid: contract.on_invalid.action,
    max_attempts:
      contract.on_invalid.action === "retry" ? contract.on_invalid.max_attempts : undefined,
    retry_feedback:
      contract.on_invalid.action === "retry" ? contract.on_invalid.feedback : undefined,
  };
}

function carryValues(carry: Carry): Record<string, unknown> {
  return {
    carry_name: carry.name,
    source_path: carry.source_path,
    value_type: carry.value_type,
    enum_values: carry.enum_values,
    initial_value: json(carry.initial_value),
    carry_mode: carry.carry_mode,
    max_serialized_chars: carry.max_serialized_chars,
  };
}

function stopValues(condition: StopCondition): Record<string, unknown> {
  const base = {
    condition_id: condition.id,
    kind: condition.kind,
    terminal_state: condition.terminal_state,
  };
  switch (condition.kind) {
    case "output_match":
      return { ...base, pattern: condition.pattern };
    case "field_equals":
      return { ...base, path: condition.path, match_value: json(condition.value) };
    case "field_truthy":
      return { ...base, path: condition.path };
    case "score_threshold":
      return {
        ...base,
        path: condition.path,
        comparator: condition.comparator,
        threshold: condition.threshold,
      };
    case "unchanged":
      return {
        ...base,
        window: condition.window,
        observation_count: condition.observations.length,
      };
  }
}

function exampleValues(example: PipelineExample): Record<string, unknown> {
  return {
    example_id: example.id,
    kind: example.kind,
    outcome: example.expected.outcome,
    stage_id: stageId(example.expected.stage_id),
    input: json(example.input),
    expected_output: json(example.expected.output),
    reason: example.expected.outcome === "invalid" ? example.expected.reason : undefined,
  };
}

function evaluationValues(policy: EvaluationPolicy): Record<string, unknown> {
  const receipt = policy.last_run;
  return {
    metric: policy.metric,
    unit: policy.unit,
    comparator: policy.comparator,
    threshold: policy.threshold,
    development_dataset_ref: policy.development_dataset_ref,
    acceptance_dataset_ref: policy.acceptance_dataset_ref,
    last_run_at: receipt?.at,
    last_run_pipeline_version: receipt?.pipeline_version,
    last_run_value: receipt?.value,
    last_run_sample_size: receipt?.sample_size,
    evaluated_by: receipt?.evaluated_by,
    approved_by: receipt?.approved_by,
    dataset_sha256: receipt?.dataset_sha256,
    artifact_sha256: receipt?.artifact_sha256,
  };
}

function receiptValues(receipt: RunReceipt): Record<string, unknown> {
  return {
    pipeline_version: receipt.pipeline_version,
    terminal_state: receipt.terminal_state,
    started_at: receipt.started_at,
    finished_at: receipt.finished_at,
    iteration_count: receipt.iteration_count,
    model_call_count: receipt.model_call_count,
    total_tokens: receipt.usage.total_tokens,
    wall_clock_ms: receipt.usage.wall_clock_ms,
    cost_usd: receipt.usage.cost_usd,
    records: json(receipt.records),
    final_output: receipt.final_output === undefined ? undefined : json(receipt.final_output),
    handoff: receipt.handoff === undefined ? undefined : json(receipt.handoff),
    evidence_refs: receipt.evidence_refs,
  };
}

/** How a stage resolves its system prompt — the contract's tri-state. */
function systemPromptMode(stage: Stage): "inherit" | "disabled" | "override" {
  if (stage.system_override_template_id === undefined) return "inherit";
  if (stage.system_override_template_id === null) return "disabled";
  return "override";
}

/**
 * Project a validated store into workbook instances.
 *
 * Accepts only the parsed type: the parse boundary is
 * `readLoopForwardStore` below, and there is no path around it.
 */
export function ingestLoopForwardStore(store: LoopForwardStore): IngestResult {
  const primitives: PrimitiveInstance[] = [];
  const relations: RelationInstance[] = [];

  for (const template of store.prompt_templates) {
    const id = templateId(template.id);
    primitives.push(
      primitiveOf(id, T.PromptTemplate, {
        ...lifecycleValues(template),
        locale: template.locale,
        messages: json(template.messages),
        message_count: template.messages.length,
        content_sensitivity: template.content_sensitivity,
      }),
    );
    for (const variable of template.variables) {
      const vid = varId(template.id, variable.name);
      primitives.push(primitiveOf(vid, T.VariableSpec, variableValues(variable)));
      relations.push(relationOf(R.TemplateDeclaresVariable, id, vid));
    }
    const replacement = template.deprecation?.replaced_by_id;
    if (replacement) relations.push(relationOf(R.ReplacedBy, id, templateId(replacement)));
  }

  for (const agent of store.agents) {
    const id = agentId(agent.id);
    const sampling = agent.model.sampling;
    primitives.push(
      primitiveOf(id, T.AgentDefinition, {
        ...lifecycleValues(agent),
        provider: agent.model.provider,
        model_id: agent.model.model_id,
        sampling_kind: sampling.kind,
        sampling_value: sampling.kind === "deterministic" ? undefined : sampling.value,
        sampling_seed: sampling.seed,
        max_output_tokens: agent.model.max_output_tokens,
        stop_sequences: agent.model.stop_sequences,
      }),
    );
    relations.push(
      relationOf(R.AgentUsesSystemTemplate, id, templateId(agent.system_prompt_template_id)),
    );
    agent.tool_policy.forEach((grant, index) => {
      const gid = grantId(agent.id, index);
      primitives.push(
        primitiveOf(gid, T.ToolGrant, {
          tool_name: grant.tool_name,
          authority: grant.authority,
          approval: grant.approval,
        }),
      );
      relations.push(relationOf(R.AgentGrantsTool, id, gid));
    });
    const replacement = agent.deprecation?.replaced_by_id;
    if (replacement) relations.push(relationOf(R.ReplacedBy, id, agentId(replacement)));
  }

  for (const pipeline of store.pipelines) {
    const id = pipelineId(pipeline.id);
    primitives.push(
      primitiveOf(id, T.Pipeline, {
        ...lifecycleValues(pipeline),
        stage_count: pipeline.stages.length,
        example_count: pipeline.examples.length,
      }),
    );

    for (const input of pipeline.inputs) {
      const vid = varId(pipeline.id, input.name);
      primitives.push(primitiveOf(vid, T.VariableSpec, variableValues(input)));
      relations.push(relationOf(R.PipelineDeclaresInput, id, vid));
    }

    // Stages first: carries, stop conditions and bindings all point at
    // them, and a relation to a primitive that does not exist yet is the
    // one thing the host's §7 pipeline refuses outright.
    pipeline.stages.forEach((stage, position) => {
      const sid = stageId(stage.id);
      primitives.push(
        primitiveOf(sid, T.Stage, {
          stage_name: stage.name,
          position,
          system_prompt_mode: systemPromptMode(stage),
          timeout_ms: stage.timeout_ms,
          binding_count: stage.bindings.length,
        }),
      );
      relations.push(relationOf(R.PipelineHasStage, id, sid));
      relations.push(relationOf(R.StageRunsAgent, sid, agentId(stage.agent_id)));
      relations.push(
        relationOf(R.StageUsesTaskTemplate, sid, templateId(stage.task_prompt_template_id)),
      );
      if (stage.system_override_template_id) {
        relations.push(
          relationOf(
            R.StageOverridesSystemTemplate,
            sid,
            templateId(stage.system_override_template_id),
          ),
        );
      }

      const cid = contractId(stage.id);
      primitives.push(primitiveOf(cid, T.OutputContract, contractValues(stage.output)));
      relations.push(relationOf(R.StageHasOutputContract, sid, cid));
      stage.output.validators.forEach((validator, index) => {
        const vid = validatorId(stage.id, index);
        primitives.push(
          primitiveOf(vid, T.OutputValidator, {
            position: index,
            kind: validator.kind,
            path: validator.kind === "named" ? undefined : validator.path,
            pattern: validator.kind === "regex" ? validator.pattern : undefined,
            min: validator.kind === "range" ? validator.min : undefined,
            max: validator.kind === "range" ? validator.max : undefined,
            validator_name: validator.kind === "named" ? validator.name : undefined,
            args: validator.kind === "named" ? json(validator.args) : undefined,
          }),
        );
        relations.push(relationOf(R.ContractHasValidator, cid, vid));
      });

      for (const binding of stage.bindings) {
        const bid = bindingId(stage.id, binding.variable_name);
        const source = binding.source;
        primitives.push(
          primitiveOf(bid, T.VariableBinding, {
            variable_name: binding.variable_name,
            source_kind: source.kind,
            literal_value: source.kind === "literal" ? json(source.value) : undefined,
            input_name: source.kind === "pipeline_input" ? source.input_name : undefined,
            source_path: source.kind === "stage_output" ? source.path : undefined,
            carry_name: source.kind === "carried" ? source.carry_name : undefined,
          }),
        );
        relations.push(relationOf(R.StageHasBinding, sid, bid));
        if (source.kind === "stage_output") {
          relations.push(relationOf(R.BindingReadsStage, bid, stageId(source.stage_id)));
        }
        if (source.kind === "carried") {
          relations.push(
            relationOf(R.BindingReadsCarry, bid, carryId(pipeline.id, source.carry_name)),
          );
        }
      }
    });

    const lid = loopId(pipeline.id);
    primitives.push(
      primitiveOf(lid, T.LoopConfig, {
        max_iterations: pipeline.loop.max_iterations,
        stop_when: pipeline.loop.stop_when,
        on_exhausted: pipeline.loop.on_exhausted,
        max_total_tokens: pipeline.loop.budget.max_total_tokens,
        max_wall_clock_ms: pipeline.loop.budget.max_wall_clock_ms,
        max_model_calls: pipeline.loop.budget.max_model_calls,
        max_cost_usd: pipeline.loop.budget.max_cost_usd,
      }),
    );
    relations.push(relationOf(R.PipelineHasLoop, id, lid));

    for (const carry of pipeline.loop.carries) {
      const cid = carryId(pipeline.id, carry.name);
      primitives.push(primitiveOf(cid, T.Carry, carryValues(carry)));
      relations.push(relationOf(R.LoopHasCarry, lid, cid));
      relations.push(relationOf(R.CarryCapturesStage, cid, stageId(carry.source_stage_id)));
    }

    for (const condition of pipeline.loop.stop_conditions) {
      const sid = stopId(pipeline.id, condition.id);
      primitives.push(primitiveOf(sid, T.StopCondition, stopValues(condition)));
      relations.push(relationOf(R.LoopHasStopCondition, lid, sid));
      const observed =
        condition.kind === "unchanged"
          ? condition.observations.map((observation) => observation.stage_id)
          : [condition.stage_id];
      // A condition may observe the same stage at two pointers; the edge
      // is about reachability, so it is emitted once per distinct stage.
      for (const stageUuid of [...new Set(observed)]) {
        relations.push(relationOf(R.StopConditionObservesStage, sid, stageId(stageUuid)));
      }
    }

    for (const example of pipeline.examples) {
      const eid = exampleId(pipeline.id, example.id);
      primitives.push(primitiveOf(eid, T.PipelineExample, exampleValues(example)));
      relations.push(relationOf(R.PipelineHasExample, id, eid));
    }

    if (pipeline.evaluation !== undefined) {
      const eid = evalId(pipeline.id);
      primitives.push(primitiveOf(eid, T.EvaluationPolicy, evaluationValues(pipeline.evaluation)));
      relations.push(relationOf(R.PipelineHasEvaluation, id, eid));
    }

    const replacement = pipeline.deprecation?.replaced_by_id;
    if (replacement) relations.push(relationOf(R.ReplacedBy, id, pipelineId(replacement)));
  }

  for (const receipt of store.run_receipts) {
    const rid = receiptId(receipt.id);
    primitives.push(primitiveOf(rid, T.RunReceipt, receiptValues(receipt)));
    relations.push(relationOf(R.ReceiptEvaluatesPipeline, rid, pipelineId(receipt.pipeline_id)));
  }

  const counts: Record<string, number> = {};
  for (const instance of primitives) {
    counts[instance.type_id] = (counts[instance.type_id] ?? 0) + 1;
  }

  return { primitives, relations, counts };
}

/**
 * The parse boundary. Untrusted input in, either instances or the
 * contract's own typed issues out — never a partial workbook.
 */
export function readLoopForwardStore(input: unknown): IngestOutcome {
  const parsed = parseLoopForwardStore(input);
  if (!parsed.ok) return { ok: false, issues: parsed.error.issues };
  return { ok: true, ...ingestLoopForwardStore(parsed.value) };
}
