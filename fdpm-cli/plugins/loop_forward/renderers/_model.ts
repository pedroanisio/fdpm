/**
 * The reading layer shared by all five Family A renderers.
 *
 * A renderer receives a flat `PrimitiveInstance[]` and `RelationInstance[]`.
 * Walking that twice in five files would mean five subtly different
 * answers to the same question, so the walk happens once here and the
 * renderers consume a typed view.
 *
 * Two properties this module owes its callers:
 *
 *  - **Total.** A pipeline whose stage is missing, whose task template
 *    was never ingested, or whose binding points at a stage that is not
 *    in the workbook still produces a view. The gap is recorded as a
 *    `null` reference, never as a thrown error: a renderer that crashes
 *    on an incomplete workbook is useless exactly when it would be most
 *    informative, and half of what Family A exists to show IS the gaps.
 *
 *  - **Ordered.** Stages come back in `position` order, validators in
 *    theirs, and every other collection is sorted by a stable key. The
 *    host returns instances as a set; without this the same document
 *    would render two ways and no test could assert on bytes.
 */
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../../../src/core/models/instance.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import { R, T } from "../ids.js";

// -- Field readers ------------------------------------------------------
//
// `field_values` is `Record<string, unknown>`. These narrow once, at the
// boundary, so no renderer writes a cast.

export function readString(instance: PrimitiveInstance, key: string): string | null {
  const value = instance.field_values[key];
  return typeof value === "string" ? value : null;
}

export function readNumber(instance: PrimitiveInstance, key: string): number | null {
  const value = instance.field_values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readBoolean(instance: PrimitiveInstance, key: string): boolean | null {
  const value = instance.field_values[key];
  return typeof value === "boolean" ? value : null;
}

export function readStringList(instance: PrimitiveInstance, key: string): string[] {
  const value = instance.field_values[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Parse a field this profile stored as serialized JSON.
 *
 * Returns `undefined` for absent and for unparseable alike, and the
 * callers treat both as "no payload". That collapse is deliberate: every
 * writer of these fields is `ingest.ts`, which produced them with
 * `JSON.stringify`, so an unparseable value means the workbook was
 * edited by something that does not honour the profile — a condition a
 * renderer reports as missing data rather than one it can repair.
 */
export function readJson(instance: PrimitiveInstance, key: string): unknown {
  const raw = instance.field_values[key];
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// -- View types ---------------------------------------------------------

export interface VariableView {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
  sensitivity: string;
  enumValues: string[];
  description: string;
}

export interface ToolGrantView {
  id: string;
  toolName: string;
  authority: string;
  approval: string;
}

export interface TemplateView {
  id: string;
  name: string;
  version: string;
  status: string;
  locale: string;
  messageCount: number;
  contentSensitivity: string;
  variables: VariableView[];
}

export interface AgentView {
  id: string;
  name: string;
  version: string;
  status: string;
  provider: string;
  modelId: string;
  samplingKind: string;
  samplingValue: number | null;
  maxOutputTokens: number;
  systemTemplate: TemplateView | null;
  grants: ToolGrantView[];
}

export interface ValidatorView {
  id: string;
  position: number;
  kind: string;
  path: string | null;
  pattern: string | null;
  min: number | null;
  max: number | null;
  validatorName: string | null;
}

export interface ContractView {
  id: string;
  format: string;
  hasJsonSchema: boolean;
  jsonSchema: unknown;
  onInvalid: string;
  maxAttempts: number | null;
  validators: ValidatorView[];
}

export interface BindingView {
  id: string;
  variableName: string;
  sourceKind: string;
  inputName: string | null;
  carryName: string | null;
  sourcePath: string | null;
  literalValue: unknown;
  /** Resolved target of a `stage_output` binding; null when unresolved. */
  readsStage: StageView | null;
}

export interface StageView {
  id: string;
  name: string;
  position: number;
  systemPromptMode: string;
  timeoutMs: number | null;
  agent: AgentView | null;
  taskTemplate: TemplateView | null;
  overrideTemplate: TemplateView | null;
  contract: ContractView | null;
  bindings: BindingView[];
  /** Attempts this stage may consume per iteration: 1, or its retry ceiling. */
  attemptsPerIteration: number;
}

export interface CarryView {
  id: string;
  name: string;
  valueType: string;
  carryMode: string;
  maxSerializedChars: number;
  sourcePath: string;
  sourceStage: StageView | null;
}

export interface StopConditionView {
  id: string;
  conditionId: string;
  kind: string;
  terminalState: string;
  path: string | null;
  pattern: string | null;
  comparator: string | null;
  threshold: number | null;
  window: number | null;
  observedStages: StageView[];
}

export interface LoopView {
  id: string;
  maxIterations: number;
  stopWhen: string;
  onExhausted: string;
  maxTotalTokens: number;
  maxWallClockMs: number;
  maxModelCalls: number;
  maxCostUsd: number | null;
  carries: CarryView[];
  stopConditions: StopConditionView[];
}

export interface ExampleView {
  id: string;
  exampleId: string;
  kind: string;
  outcome: string;
  /** Instance id of the stage whose contract this example is checked against. */
  stageId: string | null;
}

export interface EvaluationView {
  id: string;
  metric: string;
  unit: string;
  comparator: string;
  threshold: number;
  developmentDatasetRef: string;
  acceptanceDatasetRef: string;
  lastRunValue: number | null;
  lastRunPipelineVersion: string | null;
  evaluatedBy: string | null;
  approvedBy: string | null;
}

export interface PipelineView {
  id: string;
  name: string;
  version: string;
  status: string;
  description: string;
  inputs: VariableView[];
  stages: StageView[];
  loop: LoopView | null;
  examples: ExampleView[];
  evaluation: EvaluationView | null;
}

export interface StoreView {
  workbookId: string;
  templates: TemplateView[];
  agents: AgentView[];
  pipelines: PipelineView[];
}

// -- Walk ---------------------------------------------------------------

interface Index {
  byId: Map<string, PrimitiveInstance>;
  byType: Map<string, PrimitiveInstance[]>;
  /** relation type -> source id -> target ids, in stable order. */
  out: Map<string, Map<string, string[]>>;
}

function buildIndex(
  primitives: readonly PrimitiveInstance[],
  relations: readonly RelationInstance[],
): Index {
  const byId = new Map<string, PrimitiveInstance>();
  const byType = new Map<string, PrimitiveInstance[]>();
  for (const instance of primitives) {
    byId.set(instance.id, instance);
    const bucket = byType.get(instance.type_id);
    if (bucket) bucket.push(instance);
    else byType.set(instance.type_id, [instance]);
  }

  const out = new Map<string, Map<string, string[]>>();
  // Relations arrive as a set. Sorting by (source, target) makes every
  // adjacency list deterministic before any caller re-sorts by position.
  const sorted = [...relations].sort(
    (a, b) => a.source_id.localeCompare(b.source_id) || a.target_id.localeCompare(b.target_id),
  );
  for (const relation of sorted) {
    let bySource = out.get(relation.type_id);
    if (!bySource) {
      bySource = new Map<string, string[]>();
      out.set(relation.type_id, bySource);
    }
    const targets = bySource.get(relation.source_id);
    if (targets) targets.push(relation.target_id);
    else bySource.set(relation.source_id, [relation.target_id]);
  }
  return { byId, byType, out };
}

function targetsOf(index: Index, relationType: string, sourceId: string): PrimitiveInstance[] {
  const ids = index.out.get(relationType)?.get(sourceId) ?? [];
  const found: PrimitiveInstance[] = [];
  for (const id of ids) {
    const instance = index.byId.get(id);
    if (instance) found.push(instance);
  }
  return found;
}

function firstTarget(
  index: Index,
  relationType: string,
  sourceId: string,
): PrimitiveInstance | null {
  return targetsOf(index, relationType, sourceId)[0] ?? null;
}

function instancesOf(index: Index, typeId: string): PrimitiveInstance[] {
  return index.byType.get(typeId) ?? [];
}

function variableView(instance: PrimitiveInstance): VariableView {
  return {
    id: instance.id,
    name: readString(instance, "variable_name") ?? instance.id,
    type: readString(instance, "type") ?? "string",
    isRequired: readBoolean(instance, "is_required") ?? true,
    sensitivity: readString(instance, "sensitivity") ?? "internal",
    enumValues: readStringList(instance, "enum_values"),
    description: readString(instance, "description") ?? "",
  };
}

function templateView(index: Index, instance: PrimitiveInstance): TemplateView {
  const variables = targetsOf(index, R.TemplateDeclaresVariable, instance.id)
    .map(variableView)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: instance.id,
    name: readString(instance, "name") ?? instance.id,
    version: readString(instance, "version") ?? "0.0.0",
    status: readString(instance, "status") ?? "draft",
    locale: readString(instance, "locale") ?? "en-US",
    messageCount: readNumber(instance, "message_count") ?? 0,
    contentSensitivity: readString(instance, "content_sensitivity") ?? "internal",
    variables,
  };
}

function agentView(
  index: Index,
  instance: PrimitiveInstance,
  templates: Map<string, TemplateView>,
): AgentView {
  const systemTemplateInstance = firstTarget(index, R.AgentUsesSystemTemplate, instance.id);
  const grants = targetsOf(index, R.AgentGrantsTool, instance.id)
    .map((grant) => ({
      id: grant.id,
      toolName: readString(grant, "tool_name") ?? grant.id,
      authority: readString(grant, "authority") ?? "read",
      approval: readString(grant, "approval") ?? "none",
    }))
    .sort((a, b) => a.toolName.localeCompare(b.toolName) || a.authority.localeCompare(b.authority));
  return {
    id: instance.id,
    name: readString(instance, "name") ?? instance.id,
    version: readString(instance, "version") ?? "0.0.0",
    status: readString(instance, "status") ?? "draft",
    provider: readString(instance, "provider") ?? "",
    modelId: readString(instance, "model_id") ?? "",
    samplingKind: readString(instance, "sampling_kind") ?? "deterministic",
    samplingValue: readNumber(instance, "sampling_value"),
    maxOutputTokens: readNumber(instance, "max_output_tokens") ?? 0,
    systemTemplate: systemTemplateInstance
      ? (templates.get(systemTemplateInstance.id) ?? null)
      : null,
    grants,
  };
}

function contractView(index: Index, instance: PrimitiveInstance): ContractView {
  const validators = targetsOf(index, R.ContractHasValidator, instance.id)
    .map((validator) => ({
      id: validator.id,
      position: readNumber(validator, "position") ?? 0,
      kind: readString(validator, "kind") ?? "named",
      path: readString(validator, "path"),
      pattern: readString(validator, "pattern"),
      min: readNumber(validator, "min"),
      max: readNumber(validator, "max"),
      validatorName: readString(validator, "validator_name"),
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    id: instance.id,
    format: readString(instance, "format") ?? "text",
    hasJsonSchema: typeof instance.field_values["json_schema"] === "string",
    jsonSchema: readJson(instance, "json_schema"),
    onInvalid: readString(instance, "on_invalid") ?? "fail",
    maxAttempts: readNumber(instance, "max_attempts"),
    validators,
  };
}

/**
 * Build the whole view.
 *
 * Stages are materialised in two passes because a binding resolves to
 * another stage: pass one creates every stage with an empty binding
 * list, pass two fills the bindings in and can therefore point at a
 * stage object that already exists. A single pass would either recurse
 * forever on a malformed workbook or hand back a placeholder.
 */
export function readStore(input: RendererInput): StoreView {
  const index = buildIndex(input.primitives, input.relations);

  const templates = new Map<string, TemplateView>();
  for (const instance of instancesOf(index, T.PromptTemplate)) {
    templates.set(instance.id, templateView(index, instance));
  }

  const agents = new Map<string, AgentView>();
  for (const instance of instancesOf(index, T.AgentDefinition)) {
    agents.set(instance.id, agentView(index, instance, templates));
  }

  const contracts = new Map<string, ContractView>();
  for (const instance of instancesOf(index, T.OutputContract)) {
    contracts.set(instance.id, contractView(index, instance));
  }

  const pipelines: PipelineView[] = [];
  for (const pipelineInstance of instancesOf(index, T.Pipeline)) {
    const stageInstances = targetsOf(index, R.PipelineHasStage, pipelineInstance.id).sort(
      (a, b) =>
        (readNumber(a, "position") ?? 0) - (readNumber(b, "position") ?? 0) ||
        a.id.localeCompare(b.id),
    );

    // Pass one — every stage, bindings deferred.
    const stagesById = new Map<string, StageView>();
    const stages: StageView[] = stageInstances.map((instance) => {
      const contractInstance = firstTarget(index, R.StageHasOutputContract, instance.id);
      const contract = contractInstance ? (contracts.get(contractInstance.id) ?? null) : null;
      const agentInstance = firstTarget(index, R.StageRunsAgent, instance.id);
      const taskInstance = firstTarget(index, R.StageUsesTaskTemplate, instance.id);
      const overrideInstance = firstTarget(index, R.StageOverridesSystemTemplate, instance.id);
      const stage: StageView = {
        id: instance.id,
        name: readString(instance, "stage_name") ?? instance.id,
        position: readNumber(instance, "position") ?? 0,
        systemPromptMode: readString(instance, "system_prompt_mode") ?? "inherit",
        timeoutMs: readNumber(instance, "timeout_ms"),
        agent: agentInstance ? (agents.get(agentInstance.id) ?? null) : null,
        taskTemplate: taskInstance ? (templates.get(taskInstance.id) ?? null) : null,
        overrideTemplate: overrideInstance ? (templates.get(overrideInstance.id) ?? null) : null,
        contract,
        bindings: [],
        attemptsPerIteration:
          contract?.onInvalid === "retry" && contract.maxAttempts !== null
            ? contract.maxAttempts
            : 1,
      };
      stagesById.set(instance.id, stage);
      return stage;
    });

    // Carries must exist before bindings so a `carried` binding names a
    // channel the view already knows about.
    const loopInstance = firstTarget(index, R.PipelineHasLoop, pipelineInstance.id);
    const carries: CarryView[] = loopInstance
      ? targetsOf(index, R.LoopHasCarry, loopInstance.id)
          .map((instance) => {
            const sourceInstance = firstTarget(index, R.CarryCapturesStage, instance.id);
            return {
              id: instance.id,
              name: readString(instance, "carry_name") ?? instance.id,
              valueType: readString(instance, "value_type") ?? "string",
              carryMode: readString(instance, "carry_mode") ?? "replace",
              maxSerializedChars: readNumber(instance, "max_serialized_chars") ?? 0,
              sourcePath: readString(instance, "source_path") ?? "",
              sourceStage: sourceInstance ? (stagesById.get(sourceInstance.id) ?? null) : null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    // Pass two — bindings, now able to resolve to a real stage.
    for (const instance of stageInstances) {
      const stage = stagesById.get(instance.id);
      if (!stage) continue;
      stage.bindings = targetsOf(index, R.StageHasBinding, instance.id)
        .map((binding) => {
          const readsInstance = firstTarget(index, R.BindingReadsStage, binding.id);
          return {
            id: binding.id,
            variableName: readString(binding, "variable_name") ?? binding.id,
            sourceKind: readString(binding, "source_kind") ?? "literal",
            inputName: readString(binding, "input_name"),
            carryName: readString(binding, "carry_name"),
            sourcePath: readString(binding, "source_path"),
            literalValue: readJson(binding, "literal_value"),
            readsStage: readsInstance ? (stagesById.get(readsInstance.id) ?? null) : null,
          };
        })
        .sort((a, b) => a.variableName.localeCompare(b.variableName));
    }

    const stopConditions: StopConditionView[] = loopInstance
      ? targetsOf(index, R.LoopHasStopCondition, loopInstance.id)
          .map((instance) => ({
            id: instance.id,
            conditionId: readString(instance, "condition_id") ?? instance.id,
            kind: readString(instance, "kind") ?? "output_match",
            terminalState: readString(instance, "terminal_state") ?? "success",
            path: readString(instance, "path"),
            pattern: readString(instance, "pattern"),
            comparator: readString(instance, "comparator"),
            threshold: readNumber(instance, "threshold"),
            window: readNumber(instance, "window"),
            observedStages: targetsOf(index, R.StopConditionObservesStage, instance.id)
              .map((stageInstance) => stagesById.get(stageInstance.id))
              .filter((stage): stage is StageView => stage !== undefined)
              .sort((a, b) => a.position - b.position),
          }))
          .sort((a, b) => a.conditionId.localeCompare(b.conditionId))
      : [];

    const loop: LoopView | null = loopInstance
      ? {
          id: loopInstance.id,
          maxIterations: readNumber(loopInstance, "max_iterations") ?? 1,
          stopWhen: readString(loopInstance, "stop_when") ?? "any",
          onExhausted: readString(loopInstance, "on_exhausted") ?? "fail",
          maxTotalTokens: readNumber(loopInstance, "max_total_tokens") ?? 0,
          maxWallClockMs: readNumber(loopInstance, "max_wall_clock_ms") ?? 0,
          maxModelCalls: readNumber(loopInstance, "max_model_calls") ?? 0,
          maxCostUsd: readNumber(loopInstance, "max_cost_usd"),
          carries,
          stopConditions,
        }
      : null;

    const evaluationInstance = firstTarget(index, R.PipelineHasEvaluation, pipelineInstance.id);

    pipelines.push({
      id: pipelineInstance.id,
      name: readString(pipelineInstance, "name") ?? pipelineInstance.id,
      version: readString(pipelineInstance, "version") ?? "0.0.0",
      status: readString(pipelineInstance, "status") ?? "draft",
      description: readString(pipelineInstance, "description") ?? "",
      inputs: targetsOf(index, R.PipelineDeclaresInput, pipelineInstance.id)
        .map(variableView)
        .sort((a, b) => a.name.localeCompare(b.name)),
      stages,
      loop,
      examples: targetsOf(index, R.PipelineHasExample, pipelineInstance.id)
        .map((instance) => ({
          id: instance.id,
          exampleId: readString(instance, "example_id") ?? instance.id,
          kind: readString(instance, "kind") ?? "few_shot",
          outcome: readString(instance, "outcome") ?? "valid",
          stageId: readString(instance, "stage_id"),
        }))
        .sort((a, b) => a.exampleId.localeCompare(b.exampleId)),
      evaluation: evaluationInstance
        ? {
            id: evaluationInstance.id,
            metric: readString(evaluationInstance, "metric") ?? "",
            unit: readString(evaluationInstance, "unit") ?? "ratio",
            comparator: readString(evaluationInstance, "comparator") ?? "gte",
            threshold: readNumber(evaluationInstance, "threshold") ?? 0,
            developmentDatasetRef: readString(evaluationInstance, "development_dataset_ref") ?? "",
            acceptanceDatasetRef: readString(evaluationInstance, "acceptance_dataset_ref") ?? "",
            lastRunValue: readNumber(evaluationInstance, "last_run_value"),
            lastRunPipelineVersion: readString(evaluationInstance, "last_run_pipeline_version"),
            evaluatedBy: readString(evaluationInstance, "evaluated_by"),
            approvedBy: readString(evaluationInstance, "approved_by"),
          }
        : null,
    });
  }

  pipelines.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  return {
    workbookId: input.workbookId,
    templates: [...templates.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.locale.localeCompare(b.locale),
    ),
    agents: [...agents.values()].sort((a, b) => a.name.localeCompare(b.name)),
    pipelines,
  };
}

/**
 * Whether a binding's source can satisfy a variable of the given type.
 *
 * Mirrors `variableTypesCompatible` in the contract: everything fits a
 * `json` target, an `integer` widens to `number`, and nothing else
 * converts. A `stage_output` or `literal` source is reported as
 * `unknown` rather than guessed — the type lives in the source stage's
 * JSON Schema, and claiming a verdict the workbook does not carry would
 * be worse than saying so.
 */
export function bindingTypeVerdict(
  binding: BindingView,
  target: VariableView,
  inputs: readonly VariableView[],
  carries: readonly CarryView[],
): "ok" | "mismatch" | "unknown" {
  const fits = (source: string): "ok" | "mismatch" =>
    target.type === "json" || source === target.type || (source === "integer" && target.type === "number")
      ? "ok"
      : "mismatch";

  if (binding.sourceKind === "pipeline_input") {
    const input = inputs.find((candidate) => candidate.name === binding.inputName);
    return input === undefined ? "mismatch" : fits(input.type);
  }
  if (binding.sourceKind === "carried") {
    const carry = carries.find((candidate) => candidate.name === binding.carryName);
    return carry === undefined ? "mismatch" : fits(carry.valueType);
  }
  if (binding.sourceKind === "stage_output") {
    return binding.readsStage === null ? "mismatch" : "unknown";
  }
  return "unknown";
}
