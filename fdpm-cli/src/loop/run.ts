/**
 * A loop-forward run as a resumable state machine.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * `runPipeline` (executor.ts) drives this in a loop with drivers. The MCP
 * server drives it one tool call at a time: `current()` is the prompt the
 * orchestrator sees, `submit()` is what it answers with, and every bound —
 * iterations, model calls, tokens, wall clock, attempts, carry size — is
 * checked here, never by the caller. The state is a plain serialisable
 * object so a run survives the process that started it.
 */
import { createHash } from "node:crypto";
import type { Host } from "../core/host.js";
import type { CheckFailure } from "./checks/repo.js";
import { evaluateContract } from "./contract.js";
import type { StageRun, StageRunResult } from "./drivers.js";
import { UnknownValidatorError, type NamedValidator, type ValidatorIO } from "./named.js";
import { loadPipeline, type CarryModel, type PipelineModel, type StageModel, type StopModel } from "./pipeline.js";
import { pointerValue } from "./pointer.js";
import { renderTemplate } from "./template.js";

export type TerminalState = StopModel["terminal_state"];

export interface AttemptRecord {
  iteration: number;
  stage: string;
  attempt: number;
  output_digest: string;
  accepted: boolean;
  failures: CheckFailure[];
  usage: { input_tokens: number; output_tokens: number };
  model_calls: number;
  driver_error?: string;
  duration_ms: number;
}

export interface Terminal {
  state: TerminalState;
  reason: string;
  executor_error?: string;
}

/** Everything a run needs to continue in another process. */
export interface RunState {
  run_id: string;
  workbook_id: string;
  pipeline_id: string;
  inputs: Record<string, unknown>;
  started_at: number;
  iteration: number;
  stage_index: number;
  attempt: number;
  feedback: string;
  carries: Record<string, unknown>;
  stage_outputs: Record<string, unknown>;
  records: AttemptRecord[];
  stop_history: Record<string, string[]>;
  fired_stops: string[];
  model_calls: number;
  total_tokens: number;
  cost_usd?: number;
  terminal?: Terminal;
  receipt_id?: string;
  /** Why the receipt could not be written, when it could not; the run still ended. */
  receipt_error?: string;
  /** The last accepted output of the last stage that produced one. */
  last_accepted?: { stage_id: string; output: unknown };
}

export interface RunOutcome {
  terminal_state: TerminalState;
  reason: string;
  iterations: number;
  model_calls: number;
  total_tokens: number;
  wall_clock_ms: number;
  cost_usd?: number;
  records: AttemptRecord[];
  final_output?: { stage_id: string; output: unknown };
  handoff?: Record<string, unknown>;
  stage_outputs: Record<string, unknown>;
  receipt_id?: string;
  receipt_error?: string;
  executor_error?: string;
}

export interface ReceiptOptions {
  receiptScope: string;
  submissionScope?: string;
  submissionEdgeType?: string;
  receiptSlug?: string;
}

export interface RunConfig {
  host: Host;
  io: ValidatorIO;
  repoRoot: string;
  /** Where evidence bundles resolve; see StageContext.evidenceRoot. */
  evidenceRoot: string;
  modeRelationType?: string;
  modeBinding?: string;
  driverConsumedBindings?: readonly string[];
  registry?: ReadonlyMap<string, NamedValidator>;
  receipt?: ReceiptOptions;
  /** Called before every contract evaluation (a host reload when another process writes the store). */
  refreshBeforeValidate?: () => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Control: inputs are checked against the declared VariableSpecs before anything runs. */
export function checkInputs(model: PipelineModel, inputs: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const declared = new Set(model.inputs.map((i) => i.variable_name));
  for (const name of Object.keys(inputs)) {
    if (!declared.has(name)) throw new InputError(`input ${JSON.stringify(name)} is not declared by ${model.id}`);
  }
  for (const spec of model.inputs) {
    let value = inputs[spec.variable_name];
    if (value === undefined && spec.default_value !== undefined) value = spec.default_value;
    if (value === undefined) {
      if (spec.is_required) throw new InputError(`required input ${spec.variable_name} is missing`);
      continue;
    }
    if (spec.type === "enum" && (typeof value !== "string" || !(spec.enum_values ?? []).includes(value))) {
      throw new InputError(`input ${spec.variable_name} must be one of ${(spec.enum_values ?? []).join("|")}`);
    }
    if ((spec.type === "string" || spec.type === "enum") && typeof value !== "string") throw new InputError(`input ${spec.variable_name} must be a string`);
    if (spec.type === "number" && typeof value !== "number") throw new InputError(`input ${spec.variable_name} must be a number`);
    if (spec.type === "integer" && !Number.isInteger(value)) throw new InputError(`input ${spec.variable_name} must be an integer`);
    if (spec.type === "boolean" && typeof value !== "boolean") throw new InputError(`input ${spec.variable_name} must be a boolean`);
    resolved[spec.variable_name] = value;
  }
  return resolved;
}

function initialCarry(c: CarryModel): unknown {
  return JSON.parse(c.initial_value);
}

function stopFires(stop: StopModel, output: unknown, outputText: string, history: string[]): boolean {
  switch (stop.kind) {
    case "field_equals":
      return stop.path !== undefined && stop.match_value !== undefined && pointerValue(output, stop.path) === JSON.parse(stop.match_value);
    case "field_truthy":
      return stop.path !== undefined && Boolean(pointerValue(output, stop.path));
    case "output_match":
      return stop.pattern !== undefined && new RegExp(stop.pattern).test(outputText);
    case "score_threshold": {
      const v = stop.path === undefined ? undefined : pointerValue(output, stop.path);
      if (typeof v !== "number" || stop.threshold === undefined) return false;
      return stop.comparator === "lte" ? v <= stop.threshold : v >= stop.threshold;
    }
    case "unchanged": {
      const n = stop.observation_count ?? stop.window ?? 2;
      if (history.length < n) return false;
      const last = history.slice(-n);
      return last.every((d) => d === last[0]);
    }
    default:
      return false;
  }
}

export class LoopRun {
  readonly model: PipelineModel;
  readonly state: RunState;
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  private constructor(
    readonly config: RunConfig,
    model: PipelineModel,
    state: RunState,
  ) {
    this.model = model;
    this.state = state;
    this.now = config.now ?? (() => Date.now());
    this.log = config.log ?? (() => {});
  }

  /** Load the pipeline, check the inputs, and position the run at the first stage. */
  static start(config: RunConfig, args: { runId: string; workbookId: string; pipelineId: string; inputs: Readonly<Record<string, unknown>> }): LoopRun {
    const model = loadPipeline(config.host, args.workbookId, args.pipelineId, config.modeRelationType === undefined ? {} : { modeRelationType: config.modeRelationType });
    const inputs = checkInputs(model, args.inputs);
    const now = config.now ?? (() => Date.now());
    const state: RunState = {
      run_id: args.runId,
      workbook_id: args.workbookId,
      pipeline_id: args.pipelineId,
      inputs,
      started_at: now(),
      iteration: 1,
      stage_index: 0,
      attempt: 1,
      feedback: "",
      carries: Object.fromEntries(model.carries.map((c) => [c.carry_name, initialCarry(c)])),
      stage_outputs: {},
      records: [],
      stop_history: {},
      fired_stops: [],
      model_calls: 0,
      total_tokens: 0,
    };
    const run = new LoopRun(config, model, state);
    run.checkBudgetOrEnd();
    return run;
  }

  /** Continue a persisted run. The pipeline is re-read from the workbook; the state is trusted as saved. */
  static resume(config: RunConfig, state: RunState): LoopRun {
    const model = loadPipeline(config.host, state.workbook_id, state.pipeline_id, config.modeRelationType === undefined ? {} : { modeRelationType: config.modeRelationType });
    return new LoopRun(config, model, state);
  }

  get terminal(): Terminal | undefined {
    return this.state.terminal;
  }

  get stage(): StageModel {
    return this.model.stages[this.state.stage_index]!;
  }

  private get deadline(): number {
    return this.state.started_at + this.model.loop.max_wall_clock_ms;
  }

  private end(state: TerminalState, reason: string, executorError?: string): void {
    if (this.state.terminal) return;
    this.state.terminal = { state, reason, ...(executorError !== undefined ? { executor_error: executorError } : {}) };
  }

  private budgetExceeded(): string | undefined {
    const loop = this.model.loop;
    const s = this.state;
    if (s.model_calls >= loop.max_model_calls) return `max_model_calls (${loop.max_model_calls}) reached`;
    if (s.total_tokens >= loop.max_total_tokens) return `max_total_tokens (${loop.max_total_tokens}) reached`;
    if (this.now() >= this.deadline) return `max_wall_clock_ms (${loop.max_wall_clock_ms}) reached`;
    if (loop.max_cost_usd !== undefined && s.cost_usd !== undefined && s.cost_usd >= loop.max_cost_usd) return `max_cost_usd (${loop.max_cost_usd}) reached`;
    return undefined;
  }

  private checkBudgetOrEnd(): void {
    const over = this.budgetExceeded();
    if (over) this.end("exhausted", over);
  }

  private bindStage(stage: StageModel): Record<string, unknown> {
    const bound: Record<string, unknown> = {};
    for (const b of stage.bindings) {
      if (b.source_kind === "pipeline_input") bound[b.variable_name] = this.state.inputs[b.input_name!];
      else if (b.source_kind === "literal") bound[b.variable_name] = b.literal_value;
      else if (b.source_kind === "carried") bound[b.variable_name] = this.state.carries[b.carry_name!];
      else {
        const source = this.model.stages.find((s) => s.id === b.readsStageId)!;
        const upstream = this.state.stage_outputs[source.name];
        if (upstream === undefined) throw new Error(`${stage.id} binds ${b.variable_name} from ${source.name}, which has no accepted output this iteration`);
        bound[b.variable_name] = b.source_path === "" || b.source_path === undefined ? upstream : pointerValue(upstream, b.source_path);
      }
    }
    return bound;
  }

  private modeFor(bindings: Record<string, unknown>, stage: StageModel): string | undefined {
    const key = this.config.modeBinding;
    if (key === undefined) return undefined;
    const value = bindings[key] ?? this.state.inputs[key];
    const mode = typeof value === "string" ? value : undefined;
    if (stage.modes.length > 0 && mode !== undefined && !stage.modes.some((m) => m.endsWith(`:${mode}`))) {
      throw new InputError(`stage ${stage.name} may not run in mode ${JSON.stringify(mode)}; declared modes: ${stage.modes.join(", ")}`);
    }
    return mode;
  }

  /**
   * The prompt for the current stage and attempt, or undefined when the run
   * has ended. Rendering can itself end the run (a binding to a stage with
   * no output, a mode the stage does not declare): those are recorded as
   * executor errors, never thrown at the caller.
   */
  current(): StageRun | undefined {
    if (this.state.terminal) return undefined;
    try {
      const stage = this.stage;
      const bindings = this.bindStage(stage);
      const mode = this.modeFor(bindings, stage);
      const systemTemplate = stage.system_prompt_mode === "disabled" ? undefined : stage.system_prompt_mode === "override" ? stage.overrideSystemTemplate : stage.agent.systemTemplate;
      const systemPrompt = systemTemplate ? systemTemplate.messages.map((m) => renderTemplate(m.content, {}, { driverConsumed: [] })).join("\n\n") : "";
      const baseTask = stage.taskTemplate.messages.map((m) => renderTemplate(m.content, bindings, { driverConsumed: this.config.driverConsumedBindings ?? [] })).join("\n\n");
      const stageDeadline = stage.timeout_ms === undefined ? this.deadline : Math.min(this.deadline, this.now() + stage.timeout_ms);
      return {
        stage,
        iteration: this.state.iteration,
        attempt: this.state.attempt,
        systemPrompt,
        taskPrompt: this.state.feedback === "" ? baseTask : `${baseTask}\n\n${this.state.feedback}`,
        bindings,
        deadlineAt: stageDeadline,
        ...(mode !== undefined ? { mode } : {}),
      };
    } catch (err) {
      this.fail(err);
      return undefined;
    }
  }

  private fail(err: unknown): void {
    const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const reason = err instanceof UnknownValidatorError ? `contract names an unimplemented validator: ${err.validatorName}` : `executor error: ${text}`;
    this.end("failed", reason, text);
  }

  private maxAttempts(stage: StageModel): number {
    return stage.contract.on_invalid === "retry" ? Math.max(1, stage.contract.max_attempts ?? 1) : 1;
  }

  /**
   * Judge one attempt's output against the stage contract and advance. The
   * budget is charged before the verdict so a run cannot exceed it by
   * submitting; the verdict is recorded whatever it is.
   */
  async submit(result: StageRunResult): Promise<AttemptRecord | undefined> {
    if (this.state.terminal) return undefined;
    const t0 = this.now();
    const stage = this.stage;
    const s = this.state;
    s.model_calls += result.modelCalls;
    s.total_tokens += result.usage.input_tokens + result.usage.output_tokens;
    if (result.costUsd !== undefined) s.cost_usd = (s.cost_usd ?? 0) + result.costUsd;

    let mode: string | undefined;
    try {
      mode = this.modeFor(this.bindStage(stage), stage);
    } catch (err) {
      this.fail(err);
      return undefined;
    }

    let record: AttemptRecord;
    try {
      if (this.config.refreshBeforeValidate) await this.config.refreshBeforeValidate();
      const verdict = await evaluateContract(
        result.outputText,
        stage.contract,
        {
          stageOutputs: new Map(Object.entries(s.stage_outputs)),
          inputs: s.inputs,
          workbookId: s.workbook_id,
          host: this.config.host,
          repoRoot: this.config.repoRoot,
          evidenceRoot: this.config.evidenceRoot,
          evidence: result.evidence,
          io: this.config.io,
          ...(mode !== undefined ? { mode } : {}),
        },
        this.config.registry,
      );
      // A driver that names its failures (a wrapper's boundary verdict) has
      // them recorded as they are; one that only reports an error gets the
      // generic driver failure. Either way the attempt is not accepted.
      const driverFailures: CheckFailure[] =
        result.error === undefined ? [] : result.failures !== undefined && result.failures.length > 0 ? result.failures : [{ check: "driver", error_class: "ERR_TRUNCATION" as const, message: result.error }];
      const failures = [...driverFailures, ...verdict.failures];
      const ok = verdict.ok && result.error === undefined;
      record = {
        iteration: s.iteration,
        stage: stage.name,
        attempt: s.attempt,
        output_digest: sha256(result.outputText),
        accepted: ok,
        failures,
        usage: result.usage,
        model_calls: result.modelCalls,
        ...(result.error !== undefined ? { driver_error: result.error } : {}),
        duration_ms: this.now() - t0,
      };
      s.records.push(record);
      if (ok) this.accept(stage, verdict.value, result.outputText);
      else this.reject(stage, failures);
    } catch (err) {
      this.fail(err);
      return undefined;
    }
    return record;
  }

  private accept(stage: StageModel, value: unknown, outputText: string): void {
    const s = this.state;
    s.stage_outputs[stage.name] = value;
    s.last_accepted = { stage_id: stage.id, output: value };
    s.feedback = "";

    const history = s.stop_history[stage.id] ?? [];
    history.push(sha256(outputText));
    s.stop_history[stage.id] = history;
    for (const stop of this.model.stops.filter((x) => x.observesStageId === stage.id)) {
      if (stopFires(stop, value, outputText, history)) {
        if (!s.fired_stops.includes(stop.id)) s.fired_stops.push(stop.id);
        const all = this.model.stops.every((x) => s.fired_stops.includes(x.id));
        if (this.model.loop.stop_when === "any" || all) {
          this.end(stop.terminal_state, `stop condition ${stop.condition_id} on ${stage.name}`);
          return;
        }
      }
    }

    for (const carry of this.model.carries.filter((c) => c.capturesStageId === stage.id)) {
      const captured = pointerValue(value, carry.source_path);
      const next = carry.carry_mode === "append" ? `${String(s.carries[carry.carry_name] ?? "")}${typeof captured === "string" ? captured : JSON.stringify(captured)}\n` : captured;
      const size = typeof next === "string" ? next.length : JSON.stringify(next ?? null).length;
      if (size > carry.max_serialized_chars) {
        this.end("failed", `carry ${carry.carry_name} would hold ${size} chars, over its ${carry.max_serialized_chars} bound`);
        return;
      }
      s.carries[carry.carry_name] = next;
    }

    // Advance: next stage, or next iteration.
    if (s.stage_index + 1 < this.model.stages.length) {
      s.stage_index += 1;
      s.attempt = 1;
    } else if (s.iteration + 1 <= this.model.loop.max_iterations) {
      s.iteration += 1;
      s.stage_index = 0;
      s.attempt = 1;
      s.stage_outputs = {};
    } else {
      this.end(this.model.loop.on_exhausted === "fail" ? "failed" : "exhausted", `max_iterations (${this.model.loop.max_iterations}) reached`);
      return;
    }
    this.checkBudgetOrEnd();
  }

  private reject(stage: StageModel, failures: CheckFailure[]): void {
    const s = this.state;
    this.log(`  rejected (${failures.length} failure${failures.length === 1 ? "" : "s"})`);
    const max = this.maxAttempts(stage);
    if (s.attempt >= max) {
      this.end("failed", `stage ${stage.name} produced no accepted output in ${max} attempt${max === 1 ? "" : "s"}`);
      return;
    }
    const summary = failures.map((f) => `- [${f.error_class}] ${f.check}: ${f.message}`).join("\n");
    s.feedback = `${stage.contract.retry_feedback ?? "Your output did not pass the stage contract."}\n\nFailures:\n${summary}`;
    s.attempt += 1;
    this.checkBudgetOrEnd();
  }

  /** End the run from outside — the operator stopping it — with the reason recorded. */
  abort(reason: string): void {
    this.end("failed", `aborted: ${reason}`);
  }

  outcome(): RunOutcome {
    const s = this.state;
    const terminal = s.terminal ?? { state: "failed" as const, reason: "run has not ended" };
    const out: RunOutcome = {
      terminal_state: terminal.state,
      reason: terminal.reason,
      iterations: s.iteration,
      model_calls: s.model_calls,
      total_tokens: s.total_tokens,
      wall_clock_ms: this.now() - s.started_at,
      records: s.records,
      stage_outputs: s.stage_outputs,
      ...(s.cost_usd !== undefined ? { cost_usd: s.cost_usd } : {}),
      ...(terminal.executor_error !== undefined ? { executor_error: terminal.executor_error } : {}),
      ...(s.receipt_id !== undefined ? { receipt_id: s.receipt_id } : {}),
      ...(s.receipt_error !== undefined ? { receipt_error: s.receipt_error } : {}),
    };
    if (terminal.state === "success" && s.last_accepted) out.final_output = s.last_accepted;
    if (terminal.state === "blocked" || terminal.state === "approval_required" || terminal.state === "stagnated") {
      out.handoff = { iteration: s.iteration, carries: s.carries, stage_outputs: s.stage_outputs, reason: terminal.reason };
    }
    return out;
  }

  /**
   * Write the lf:RunReceipt (once) and the per-output submissions; returns the
   * outcome with the receipt id. A receipt that cannot be written — the id is
   * taken, the host refuses the record — is recorded as `receipt_error` on
   * the outcome: the run has ended either way, and the caller reads the
   * outcome rather than an exception thrown out of a tool call.
   */
  async finish(): Promise<RunOutcome> {
    if (!this.state.terminal) throw new Error("finish() before the run ended");
    if (this.config.receipt && this.state.receipt_id === undefined) {
      try {
        this.state.receipt_id = await this.writeReceipt(this.outcome());
        this.state.receipt_error = undefined;
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        this.state.receipt_error = `receipt not written: ${text}`;
        this.log(`run ${this.state.run_id}: ${this.state.receipt_error}`);
      }
    }
    return this.outcome();
  }

  private async writeReceipt(outcome: RunOutcome): Promise<string> {
    const r = this.config.receipt!;
    const host = this.config.host;
    const s = this.state;
    const finishedAt = this.now();
    const slug = r.receiptSlug ?? `${this.model.name}-${iso(s.started_at).replace(/[-:]/g, "").toLowerCase()}`;
    const receiptId = `lf:receipt:${slug}`;
    const fields: Record<string, unknown> = {
      pipeline_version: this.model.version,
      terminal_state: outcome.terminal_state,
      started_at: iso(s.started_at),
      finished_at: iso(finishedAt),
      iteration_count: outcome.iterations,
      model_call_count: outcome.model_calls,
      total_tokens: outcome.total_tokens,
      wall_clock_ms: finishedAt - s.started_at,
      records: JSON.stringify(outcome.records),
    };
    if (outcome.cost_usd !== undefined) fields["cost_usd"] = outcome.cost_usd;
    if (outcome.final_output) fields["final_output"] = JSON.stringify(outcome.final_output);
    if (outcome.handoff) fields["handoff"] = JSON.stringify(outcome.handoff);
    const created = await host.createPrimitive(s.workbook_id, { id: receiptId, type_id: "lf:RunReceipt", scope_id: r.receiptScope, field_values: fields });
    if (!created.report.accepted) throw new Error(`receipt rejected: ${JSON.stringify(created.report.findings)}`);
    await host.createRelation(s.workbook_id, {
      id: `lf:ReceiptEvaluatesPipeline:${slug}--${this.model.id.slice(this.model.id.lastIndexOf(":") + 1)}`,
      type_id: "lf:ReceiptEvaluatesPipeline",
      source_id: receiptId,
      target_id: this.model.id,
      field_values: {},
    });
    if (r.submissionScope && r.submissionEdgeType) {
      let n = 0;
      for (const rec of outcome.records.filter((x) => x.accepted)) {
        const key = `i${rec.iteration}-${rec.stage}`;
        const submissionId = `sa:submission:${slug}-${key}`;
        const sub = await host.createPrimitive(s.workbook_id, {
          id: submissionId,
          type_id: "sa:OutputSubmission",
          scope_id: r.submissionScope,
          field_values: {
            submission_id: `${slug}/${key}`,
            content_digest: rec.output_digest,
            output_ref: `${receiptId}#records[iteration=${rec.iteration},stage=${rec.stage},attempt=${rec.attempt}]`,
            produced_at: iso(finishedAt),
            producer_run_id: receiptId,
          },
        });
        if (!sub.report.accepted) throw new Error(`submission rejected: ${JSON.stringify(sub.report.findings)}`);
        await host.createRelation(s.workbook_id, { id: `${r.submissionEdgeType}:${slug}--${key}`, type_id: r.submissionEdgeType, source_id: receiptId, target_id: submissionId, field_values: {} });
        n += 1;
      }
      this.log(`receipt ${receiptId} with ${n} submission${n === 1 ? "" : "s"}`);
    }
    return receiptId;
  }
}
