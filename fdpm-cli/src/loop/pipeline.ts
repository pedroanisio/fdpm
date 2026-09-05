/**
 * Read an lf:Pipeline and everything it reaches out of a workbook into a
 * typed model the executor can run.
 *
 * Loading is where the document's completeness is enforced: a stage with no
 * agent, no task template or no contract, a binding that reads a stage that
 * does not exist, an input no VariableSpec declares — each is a
 * PipelineLoadError with the record named, never a default. The profile's
 * own rules warn on some of these during authoring; here they block, because
 * a run is where they stop being drafting mistakes.
 */
import type { Host } from "../core/host.js";
import type { PrimitiveInstance, RelationInstance } from "../core/models/instance.js";
import type { ContractDef, ValidatorDef } from "./contract.js";

export class PipelineLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineLoadError";
  }
}

/** loop-forward 2.0 relation type ids, spelled here so src/ does not import a plugin. */
export const LF_R = {
  AgentUsesSystemTemplate: "lf:AgentUsesSystemTemplate",
  AgentGrantsTool: "lf:AgentGrantsTool",
  PipelineDeclaresInput: "lf:PipelineDeclaresInput",
  PipelineHasStage: "lf:PipelineHasStage",
  PipelineHasLoop: "lf:PipelineHasLoop",
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
} as const;

export interface TemplateModel {
  id: string;
  name: string;
  messages: Array<{ role: string; content: string }>;
}

export interface GrantModel {
  id: string;
  tool_name: string;
  authority: string;
  approval: "none" | "per_run" | "per_action";
}

export interface AgentModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  max_output_tokens: number;
  systemTemplate: TemplateModel;
  grants: GrantModel[];
}

export interface InputModel {
  variable_name: string;
  type: string;
  is_required: boolean;
  enum_values?: string[];
  default_value?: unknown;
}

export interface BindingModel {
  id: string;
  variable_name: string;
  source_kind: "literal" | "pipeline_input" | "stage_output" | "carried";
  literal_value?: unknown;
  input_name?: string;
  source_path?: string;
  carry_name?: string;
  readsStageId?: string;
  readsCarryId?: string;
}

export interface StageModel {
  id: string;
  name: string;
  position: number;
  timeout_ms?: number;
  system_prompt_mode: "inherit" | "disabled" | "override";
  agent: AgentModel;
  taskTemplate: TemplateModel;
  overrideSystemTemplate?: TemplateModel;
  bindings: BindingModel[];
  contract: ContractDef;
  /** cdel:DelegationMode ids the stage may run under, when the profile declares them. */
  modes: string[];
}

export interface LoopModel {
  id: string;
  max_iterations: number;
  stop_when: "any" | "all";
  on_exhausted: "fail" | "return_last";
  max_total_tokens: number;
  max_wall_clock_ms: number;
  max_model_calls: number;
  max_cost_usd?: number;
}

export interface CarryModel {
  id: string;
  carry_name: string;
  capturesStageId: string;
  source_path: string;
  value_type: string;
  initial_value: string;
  carry_mode: "replace" | "append";
  max_serialized_chars: number;
}

export interface StopModel {
  id: string;
  condition_id: string;
  kind: "output_match" | "field_equals" | "field_truthy" | "score_threshold" | "unchanged";
  terminal_state: "success" | "clean_noop" | "blocked" | "approval_required" | "exhausted" | "stagnated" | "failed";
  observesStageId: string;
  path?: string;
  pattern?: string;
  match_value?: string;
  comparator?: "gte" | "lte";
  threshold?: number;
  window?: number;
  observation_count?: number;
}

export interface PipelineModel {
  workbookId: string;
  id: string;
  name: string;
  version: string;
  inputs: InputModel[];
  agents: AgentModel[];
  stages: StageModel[];
  loop: LoopModel;
  carries: CarryModel[];
  stops: StopModel[];
}

// ── graph helpers ──────────────────────────────────────────────────────────

class Graph {
  constructor(
    readonly primitives: Readonly<Record<string, PrimitiveInstance>>,
    readonly relations: readonly RelationInstance[],
  ) {}

  out(type: string, from: string): string[] {
    return this.relations.filter((r) => r.type_id === type && r.source_id === from).map((r) => r.target_id);
  }
  in(type: string, to: string): string[] {
    return this.relations.filter((r) => r.type_id === type && r.target_id === to).map((r) => r.source_id);
  }
  one(type: string, from: string, what: string): string {
    const targets = this.out(type, from);
    if (targets.length !== 1) throw new PipelineLoadError(`${from} must have exactly one ${what} (${type}); found ${targets.length}`);
    return targets[0]!;
  }
  prim(id: string, expectType?: string): PrimitiveInstance {
    const p = this.primitives[id];
    if (!p) throw new PipelineLoadError(`record ${id} does not exist`);
    if (expectType !== undefined && p.type_id !== expectType) throw new PipelineLoadError(`${id} is a ${p.type_id}, expected ${expectType}`);
    return p;
  }
}

const fieldStr = (p: PrimitiveInstance, name: string): string => {
  const v = p.field_values[name];
  if (typeof v !== "string") throw new PipelineLoadError(`${p.id}.${name} must be a string`);
  return v;
};
const fieldNum = (p: PrimitiveInstance, name: string): number => {
  const v = p.field_values[name];
  if (typeof v !== "number") throw new PipelineLoadError(`${p.id}.${name} must be a number`);
  return v;
};
const fieldNumOpt = (p: PrimitiveInstance, name: string): number | undefined => (typeof p.field_values[name] === "number" ? (p.field_values[name] as number) : undefined);
const fieldStrOpt = (p: PrimitiveInstance, name: string): string | undefined => (typeof p.field_values[name] === "string" ? (p.field_values[name] as string) : undefined);

function template(g: Graph, id: string): TemplateModel {
  const p = g.prim(id, "lf:PromptTemplate");
  const parsed = JSON.parse(fieldStr(p, "messages")) as unknown;
  if (!Array.isArray(parsed)) throw new PipelineLoadError(`${id}.messages must serialise a list`);
  const messages = parsed.map((m) => {
    const r = m as Record<string, unknown>;
    if (typeof r["role"] !== "string" || typeof r["content"] !== "string") throw new PipelineLoadError(`${id}.messages entries need role and content`);
    return { role: r["role"], content: r["content"] };
  });
  return { id, name: fieldStr(p, "name"), messages };
}

function agent(g: Graph, id: string): AgentModel {
  const p = g.prim(id, "lf:AgentDefinition");
  const grants = g.out(LF_R.AgentGrantsTool, id).map((gid) => {
    const gp = g.prim(gid, "lf:ToolGrant");
    return { id: gid, tool_name: fieldStr(gp, "tool_name"), authority: fieldStr(gp, "authority"), approval: fieldStr(gp, "approval") as GrantModel["approval"] };
  });
  return {
    id,
    name: fieldStr(p, "name"),
    provider: fieldStr(p, "provider"),
    model_id: fieldStr(p, "model_id"),
    max_output_tokens: fieldNum(p, "max_output_tokens"),
    systemTemplate: template(g, g.one(LF_R.AgentUsesSystemTemplate, id, "system template")),
    grants,
  };
}

function contract(g: Graph, id: string): ContractDef {
  const p = g.prim(id, "lf:OutputContract");
  const validators: ValidatorDef[] = g.out(LF_R.ContractHasValidator, id).map((vid) => {
    const vp = g.prim(vid, "lf:OutputValidator");
    const def: ValidatorDef = { position: fieldNum(vp, "position"), kind: fieldStr(vp, "kind") as ValidatorDef["kind"] };
    const path = fieldStrOpt(vp, "path");
    const pattern = fieldStrOpt(vp, "pattern");
    const name = fieldStrOpt(vp, "validator_name");
    const args = fieldStrOpt(vp, "args");
    const min = fieldNumOpt(vp, "min");
    const max = fieldNumOpt(vp, "max");
    if (path !== undefined) def.path = path;
    if (pattern !== undefined) def.pattern = pattern;
    if (name !== undefined) def.validator_name = name;
    if (args !== undefined) def.args = args;
    if (min !== undefined) def.min = min;
    if (max !== undefined) def.max = max;
    return def;
  });
  const declared = fieldNum(p, "validator_count");
  if (declared !== validators.length) throw new PipelineLoadError(`${id} declares validator_count ${declared} but ${validators.length} validators are attached`);
  const def: ContractDef = { format: fieldStr(p, "format") as ContractDef["format"], on_invalid: fieldStr(p, "on_invalid") as ContractDef["on_invalid"], validators };
  const schema = fieldStrOpt(p, "json_schema");
  const attempts = fieldNumOpt(p, "max_attempts");
  const feedback = fieldStrOpt(p, "retry_feedback");
  if (schema !== undefined) def.json_schema = schema;
  if (attempts !== undefined) def.max_attempts = attempts;
  if (feedback !== undefined) def.retry_feedback = feedback;
  return def;
}

/**
 * Load the pipeline. `modeRelationType` names the profile-specific edge from
 * a stage to its delegation modes, when the profile has one.
 */
export function loadPipeline(host: Host, workbookId: string, pipelineId: string, opts: { modeRelationType?: string } = {}): PipelineModel {
  const slice = host.getProject(workbookId);
  const g = new Graph(slice.primitives, Object.values(slice.relations));
  const p = g.prim(pipelineId, "lf:Pipeline");

  const inputs: InputModel[] = g.out(LF_R.PipelineDeclaresInput, pipelineId).map((vid) => {
    const vp = g.prim(vid, "lf:VariableSpec");
    const model: InputModel = { variable_name: fieldStr(vp, "variable_name"), type: fieldStr(vp, "type"), is_required: vp.field_values["is_required"] === true };
    const enums = vp.field_values["enum_values"];
    if (Array.isArray(enums)) model.enum_values = enums.filter((e): e is string => typeof e === "string");
    if (vp.field_values["default_value"] !== undefined) model.default_value = vp.field_values["default_value"];
    return model;
  });
  const inputNames = new Set(inputs.map((i) => i.variable_name));

  const agents = new Map<string, AgentModel>();
  const stageIds = g.out(LF_R.PipelineHasStage, pipelineId);
  if (stageIds.length === 0) throw new PipelineLoadError(`${pipelineId} has no stages`);
  const stageNameById = new Map<string, string>();
  for (const sid of stageIds) stageNameById.set(sid, fieldStr(g.prim(sid, "lf:Stage"), "stage_name"));

  const loopId = g.one(LF_R.PipelineHasLoop, pipelineId, "loop config");
  const lp = g.prim(loopId, "lf:LoopConfig");
  const carries: CarryModel[] = g.out(LF_R.LoopHasCarry, loopId).map((cid) => {
    const cp = g.prim(cid, "lf:Carry");
    return {
      id: cid,
      carry_name: fieldStr(cp, "carry_name"),
      capturesStageId: g.one(LF_R.CarryCapturesStage, cid, "captured stage"),
      source_path: fieldStr(cp, "source_path"),
      value_type: fieldStr(cp, "value_type"),
      initial_value: fieldStr(cp, "initial_value"),
      carry_mode: fieldStr(cp, "carry_mode") as CarryModel["carry_mode"],
      max_serialized_chars: fieldNum(cp, "max_serialized_chars"),
    };
  });
  const carryByName = new Map(carries.map((c) => [c.carry_name, c]));

  const stages: StageModel[] = stageIds.map((sid) => {
    const sp = g.prim(sid, "lf:Stage");
    const agentId = g.one(LF_R.StageRunsAgent, sid, "agent");
    if (!agents.has(agentId)) agents.set(agentId, agent(g, agentId));
    const bindings: BindingModel[] = g.out(LF_R.StageHasBinding, sid).map((bid) => {
      const bp = g.prim(bid, "lf:VariableBinding");
      const b: BindingModel = { id: bid, variable_name: fieldStr(bp, "variable_name"), source_kind: fieldStr(bp, "source_kind") as BindingModel["source_kind"] };
      if (b.source_kind === "pipeline_input") {
        b.input_name = fieldStr(bp, "input_name");
        if (!inputNames.has(b.input_name)) throw new PipelineLoadError(`${bid} reads pipeline input ${b.input_name}, which ${pipelineId} does not declare`);
      } else if (b.source_kind === "stage_output") {
        b.source_path = fieldStrOpt(bp, "source_path") ?? "";
        b.readsStageId = g.one(LF_R.BindingReadsStage, bid, "source stage");
        if (!stageNameById.has(b.readsStageId)) throw new PipelineLoadError(`${bid} reads ${b.readsStageId}, which is not a stage of ${pipelineId}`);
      } else if (b.source_kind === "carried") {
        b.carry_name = fieldStr(bp, "carry_name");
        b.readsCarryId = g.one(LF_R.BindingReadsCarry, bid, "carry");
        if (!carryByName.has(b.carry_name)) throw new PipelineLoadError(`${bid} reads carry ${b.carry_name}, which the loop does not declare`);
      } else if (b.source_kind === "literal") {
        b.literal_value = bp.field_values["literal_value"];
      } else {
        throw new PipelineLoadError(`${bid} has unknown source_kind ${String(b.source_kind)}`);
      }
      return b;
    });
    const declaredBindings = fieldNum(sp, "binding_count");
    if (declaredBindings !== bindings.length) throw new PipelineLoadError(`${sid} declares binding_count ${declaredBindings} but ${bindings.length} bindings are attached`);
    const model: StageModel = {
      id: sid,
      name: stageNameById.get(sid)!,
      position: fieldNum(sp, "position"),
      system_prompt_mode: fieldStr(sp, "system_prompt_mode") as StageModel["system_prompt_mode"],
      agent: agents.get(agentId)!,
      taskTemplate: template(g, g.one(LF_R.StageUsesTaskTemplate, sid, "task template")),
      bindings,
      contract: contract(g, g.one(LF_R.StageHasOutputContract, sid, "output contract")),
      modes: opts.modeRelationType === undefined ? [] : g.out(opts.modeRelationType, sid),
    };
    const timeout = fieldNumOpt(sp, "timeout_ms");
    if (timeout !== undefined) model.timeout_ms = timeout;
    const override = g.out(LF_R.StageOverridesSystemTemplate, sid);
    if (model.system_prompt_mode === "override") {
      if (override.length !== 1) throw new PipelineLoadError(`${sid} is system_prompt_mode override but has ${override.length} override templates`);
      model.overrideSystemTemplate = template(g, override[0]!);
    }
    return model;
  });
  stages.sort((a, b) => a.position - b.position);
  const positions = new Set(stages.map((s) => s.position));
  if (positions.size !== stages.length) throw new PipelineLoadError(`${pipelineId} has stages sharing a position`);
  const declaredStages = fieldNum(p, "stage_count");
  if (declaredStages !== stages.length) throw new PipelineLoadError(`${pipelineId} declares stage_count ${declaredStages} but has ${stages.length} stages`);

  const loop: LoopModel = {
    id: loopId,
    max_iterations: fieldNum(lp, "max_iterations"),
    stop_when: fieldStr(lp, "stop_when") as LoopModel["stop_when"],
    on_exhausted: fieldStr(lp, "on_exhausted") as LoopModel["on_exhausted"],
    max_total_tokens: fieldNum(lp, "max_total_tokens"),
    max_wall_clock_ms: fieldNum(lp, "max_wall_clock_ms"),
    max_model_calls: fieldNum(lp, "max_model_calls"),
  };
  const cost = fieldNumOpt(lp, "max_cost_usd");
  if (cost !== undefined) loop.max_cost_usd = cost;

  const stops: StopModel[] = g.out(LF_R.LoopHasStopCondition, loopId).map((stid) => {
    const stp = g.prim(stid, "lf:StopCondition");
    const s: StopModel = {
      id: stid,
      condition_id: fieldStr(stp, "condition_id"),
      kind: fieldStr(stp, "kind") as StopModel["kind"],
      terminal_state: fieldStr(stp, "terminal_state") as StopModel["terminal_state"],
      observesStageId: g.one(LF_R.StopConditionObservesStage, stid, "observed stage"),
    };
    if (!stageNameById.has(s.observesStageId)) throw new PipelineLoadError(`${stid} observes ${s.observesStageId}, which is not a stage of ${pipelineId}`);
    const path = fieldStrOpt(stp, "path");
    const pattern = fieldStrOpt(stp, "pattern");
    const match = fieldStrOpt(stp, "match_value");
    const comparator = fieldStrOpt(stp, "comparator");
    const threshold = fieldNumOpt(stp, "threshold");
    const window = fieldNumOpt(stp, "window");
    const count = fieldNumOpt(stp, "observation_count");
    if (path !== undefined) s.path = path;
    if (pattern !== undefined) s.pattern = pattern;
    if (match !== undefined) s.match_value = match;
    if (comparator !== undefined) s.comparator = comparator as StopModel["comparator"];
    if (threshold !== undefined) s.threshold = threshold;
    if (window !== undefined) s.window = window;
    if (count !== undefined) s.observation_count = count;
    return s;
  });
  for (const c of carries) {
    if (!stageNameById.has(c.capturesStageId)) throw new PipelineLoadError(`${c.id} captures ${c.capturesStageId}, which is not a stage of ${pipelineId}`);
  }

  return {
    workbookId,
    id: pipelineId,
    name: fieldStr(p, "name"),
    version: fieldStr(p, "version"),
    inputs,
    agents: [...agents.values()],
    stages,
    loop,
    carries,
    stops,
  };
}
