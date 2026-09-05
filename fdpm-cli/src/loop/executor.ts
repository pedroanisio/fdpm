/**
 * The loop-forward executor: run an lf:Pipeline to a terminal state and write
 * the lf:RunReceipt that proves what happened.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Every bound is owned by this code, never by a model: iterations, model
 * calls, tokens, wall clock, attempts per stage, carry size. A stage output
 * reaches the next stage only after its contract accepted it; a stop
 * condition is evaluated over the accepted output; a receipt is written
 * whatever the terminal state, including a crash of the executor itself.
 */
import { createHash } from "node:crypto";
import type { Host } from "../core/host.js";
import type { CheckFailure } from "./checks/repo.js";
import { evaluateContract } from "./contract.js";
import type { StageDriver, StageRun, StageRunResult } from "./drivers.js";
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

export interface RunOutcome {
  terminal_state: TerminalState;
  reason: string;
  iterations: number;
  model_calls: number;
  total_tokens: number;
  wall_clock_ms: number;
  cost_usd?: number;
  records: AttemptRecord[];
  /** The last accepted output of the last stage that produced one. */
  final_output?: { stage_id: string; output: unknown };
  /** Resumable state for blocked / approval_required / stagnated. */
  handoff?: Record<string, unknown>;
  /** Accepted outputs by stage name, from the final iteration. */
  stage_outputs: Record<string, unknown>;
  receipt_id?: string;
  /** Uncaught error, when the executor itself failed. */
  executor_error?: string;
}

export interface ReceiptOptions {
  /** Scope id for lf:* records (scope:loop-forward:workbook). */
  receiptScope: string;
  /** Scope id for sa:OutputSubmission records, when submissions are written. */
  submissionScope?: string;
  /** Profile-specific edge from the receipt to each submission (e.g. cdel:ReceiptSubmitted). */
  submissionEdgeType?: string;
  receiptSlug?: string;
}

export interface ExecutorOptions {
  host: Host;
  workbookId: string;
  pipelineId: string;
  inputs: Readonly<Record<string, unknown>>;
  /** Choose the driver for a stage; the executor never guesses. */
  driverFor: (stage: StageModel) => StageDriver;
  io: ValidatorIO;
  repoRoot: string;
  /** Profile edge from a stage to its modes; loaded into StageModel.modes. */
  modeRelationType?: string;
  /** Binding name whose value selects a mode for multi-mode stages. */
  modeBinding?: string;
  /** Bindings drivers consume that need not appear in a template. */
  driverConsumedBindings?: readonly string[];
  registry?: ReadonlyMap<string, NamedValidator>;
  receipt?: ReceiptOptions;
  /**
   * Called before every contract evaluation. When the orchestrator stages run
   * by hand, their writes reach the data dir through the MCP server — another
   * process — and validators that read the store (fpl.written_ids_exist,
   * fpl.producer_status_guard) would otherwise judge a stale projection. The
   * CLI passes `host.reload` here in file-exchange mode.
   */
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
  if (c.value_type === "json") return JSON.parse(c.initial_value);
  if (c.value_type === "string") return JSON.parse(c.initial_value) as string;
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

export async function runPipeline(opts: ExecutorOptions): Promise<RunOutcome> {
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? (() => {});
  const startedAt = now();
  const model = loadPipeline(opts.host, opts.workbookId, opts.pipelineId, opts.modeRelationType === undefined ? {} : { modeRelationType: opts.modeRelationType });
  const inputs = checkInputs(model, opts.inputs);
  const loop = model.loop;
  const deadline = startedAt + loop.max_wall_clock_ms;

  const records: AttemptRecord[] = [];
  let modelCalls = 0;
  let totalTokens = 0;
  let costUsd: number | undefined;
  const carries = new Map<string, unknown>(model.carries.map((c) => [c.carry_name, initialCarry(c)]));
  const stopHistory = new Map<string, string[]>();
  const firedStops = new Set<string>();
  let stageOutputs = new Map<string, unknown>();
  let lastAccepted: { stage_id: string; output: unknown } | undefined;
  let terminal: TerminalState | undefined;
  let reason = "";
  let iterations = 0;
  let executorError: string | undefined;

  const budgetExceeded = (): string | undefined => {
    if (modelCalls >= loop.max_model_calls) return `max_model_calls (${loop.max_model_calls}) reached`;
    if (totalTokens >= loop.max_total_tokens) return `max_total_tokens (${loop.max_total_tokens}) reached`;
    if (now() >= deadline) return `max_wall_clock_ms (${loop.max_wall_clock_ms}) reached`;
    if (loop.max_cost_usd !== undefined && costUsd !== undefined && costUsd >= loop.max_cost_usd) return `max_cost_usd (${loop.max_cost_usd}) reached`;
    return undefined;
  };

  const bindStage = (stage: StageModel): Record<string, unknown> => {
    const bound: Record<string, unknown> = {};
    for (const b of stage.bindings) {
      if (b.source_kind === "pipeline_input") bound[b.variable_name] = inputs[b.input_name!];
      else if (b.source_kind === "literal") bound[b.variable_name] = b.literal_value;
      else if (b.source_kind === "carried") bound[b.variable_name] = carries.get(b.carry_name!);
      else {
        const source = model.stages.find((s) => s.id === b.readsStageId)!;
        const upstream = stageOutputs.get(source.name);
        if (upstream === undefined) throw new Error(`${stage.id} binds ${b.variable_name} from ${source.name}, which has no accepted output this iteration`);
        bound[b.variable_name] = b.source_path === "" || b.source_path === undefined ? upstream : pointerValue(upstream, b.source_path);
      }
    }
    return bound;
  };

  try {
    outer: for (let iteration = 1; iteration <= loop.max_iterations; iteration += 1) {
      iterations = iteration;
      stageOutputs = new Map();
      for (const stage of model.stages) {
        const over = budgetExceeded();
        if (over) {
          terminal = "exhausted";
          reason = over;
          break outer;
        }
        const bindings = bindStage(stage);
        // The run's mode is a pipeline input; a stage that does not bind it
        // into its prompt still runs under it, so fall back to the input.
        const modeValue = opts.modeBinding === undefined ? undefined : (bindings[opts.modeBinding] ?? inputs[opts.modeBinding]);
        const mode = typeof modeValue === "string" ? modeValue : undefined;
        if (stage.modes.length > 0 && mode !== undefined && !stage.modes.some((m) => m.endsWith(`:${mode}`))) {
          throw new InputError(`stage ${stage.name} may not run in mode ${JSON.stringify(mode)}; declared modes: ${stage.modes.join(", ")}`);
        }
        const systemTemplate = stage.system_prompt_mode === "disabled" ? undefined : stage.system_prompt_mode === "override" ? stage.overrideSystemTemplate : stage.agent.systemTemplate;
        const systemPrompt = systemTemplate ? systemTemplate.messages.map((m) => renderTemplate(m.content, {}, { driverConsumed: [] })).join("\n\n") : "";
        const baseTask = stage.taskTemplate.messages.map((m) => renderTemplate(m.content, bindings, { driverConsumed: opts.driverConsumedBindings ?? [] })).join("\n\n");
        const driver = opts.driverFor(stage);
        const maxAttempts = stage.contract.on_invalid === "retry" ? Math.max(1, stage.contract.max_attempts ?? 1) : 1;
        const stageDeadline = stage.timeout_ms === undefined ? deadline : Math.min(deadline, now() + stage.timeout_ms);

        let accepted = false;
        let feedback = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const over2 = budgetExceeded();
          if (over2) {
            terminal = "exhausted";
            reason = over2;
            break outer;
          }
          const run: StageRun = {
            stage,
            iteration,
            attempt,
            systemPrompt,
            taskPrompt: feedback === "" ? baseTask : `${baseTask}\n\n${feedback}`,
            bindings,
            deadlineAt: stageDeadline,
            ...(mode !== undefined ? { mode } : {}),
          };
          const t0 = now();
          log(`iteration ${iteration} stage ${stage.name} attempt ${attempt} via ${driver.kind}`);
          const result: StageRunResult = await driver.run(run);
          modelCalls += result.modelCalls;
          totalTokens += result.usage.input_tokens + result.usage.output_tokens;
          if (result.costUsd !== undefined) costUsd = (costUsd ?? 0) + result.costUsd;

          if (opts.refreshBeforeValidate) await opts.refreshBeforeValidate();
          const verdict = await evaluateContract(
            result.outputText,
            stage.contract,
            { stageOutputs, inputs, workbookId: opts.workbookId, host: opts.host, repoRoot: opts.repoRoot, evidence: result.evidence, io: opts.io, ...(mode !== undefined ? { mode } : {}) },
            opts.registry,
          );
          const failures = result.error === undefined ? verdict.failures : [{ check: "driver", error_class: "ERR_TRUNCATION" as const, message: result.error }, ...verdict.failures];
          const ok = verdict.ok && result.error === undefined;
          records.push({
            iteration,
            stage: stage.name,
            attempt,
            output_digest: sha256(result.outputText),
            accepted: ok,
            failures,
            usage: result.usage,
            model_calls: result.modelCalls,
            ...(result.error !== undefined ? { driver_error: result.error } : {}),
            duration_ms: now() - t0,
          });
          if (ok) {
            accepted = true;
            stageOutputs.set(stage.name, verdict.value);
            lastAccepted = { stage_id: stage.id, output: verdict.value };
            // Stop conditions observe accepted output only.
            const digestHistory = stopHistory.get(stage.id) ?? [];
            digestHistory.push(sha256(result.outputText));
            stopHistory.set(stage.id, digestHistory);
            for (const stop of model.stops.filter((s) => s.observesStageId === stage.id)) {
              if (stopFires(stop, verdict.value, result.outputText, digestHistory)) {
                firedStops.add(stop.id);
                const all = model.stops.every((s) => firedStops.has(s.id));
                if (loop.stop_when === "any" || all) {
                  terminal = stop.terminal_state;
                  reason = `stop condition ${stop.condition_id} on ${stage.name}`;
                  break outer;
                }
              }
            }
            // Carries capture accepted output.
            for (const carry of model.carries.filter((c) => c.capturesStageId === stage.id)) {
              const captured = pointerValue(verdict.value, carry.source_path);
              const next = carry.carry_mode === "append" ? `${String(carries.get(carry.carry_name) ?? "")}${typeof captured === "string" ? captured : JSON.stringify(captured)}\n` : captured;
              const size = typeof next === "string" ? next.length : JSON.stringify(next ?? null).length;
              if (size > carry.max_serialized_chars) {
                terminal = "failed";
                reason = `carry ${carry.carry_name} would hold ${size} chars, over its ${carry.max_serialized_chars} bound`;
                break outer;
              }
              carries.set(carry.carry_name, next);
            }
            break;
          }
          const summary = failures.map((f) => `- [${f.error_class}] ${f.check}: ${f.message}`).join("\n");
          feedback = `${stage.contract.retry_feedback ?? "Your output did not pass the stage contract."}\n\nFailures:\n${summary}`;
          log(`  rejected (${failures.length} failure${failures.length === 1 ? "" : "s"})`);
        }
        if (!accepted) {
          terminal = "failed";
          reason = `stage ${stage.name} produced no accepted output in ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}`;
          break outer;
        }
      }
    }
    if (terminal === undefined) {
      terminal = loop.on_exhausted === "fail" ? "failed" : "exhausted";
      reason = `max_iterations (${loop.max_iterations}) reached`;
    }
  } catch (err) {
    terminal = "failed";
    executorError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    reason = err instanceof UnknownValidatorError ? `contract names an unimplemented validator: ${err.validatorName}` : `executor error: ${executorError}`;
  }

  const finishedAt = now();
  const outcome: RunOutcome = {
    terminal_state: terminal,
    reason,
    iterations,
    model_calls: modelCalls,
    total_tokens: totalTokens,
    wall_clock_ms: finishedAt - startedAt,
    records,
    stage_outputs: Object.fromEntries(stageOutputs),
    ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    ...(executorError !== undefined ? { executor_error: executorError } : {}),
  };
  if (terminal === "success" && lastAccepted) outcome.final_output = lastAccepted;
  if (terminal === "blocked" || terminal === "approval_required" || terminal === "stagnated") {
    outcome.handoff = { iteration: iterations, carries: Object.fromEntries(carries), stage_outputs: Object.fromEntries(stageOutputs), reason };
  }

  if (opts.receipt) {
    outcome.receipt_id = await writeReceipt(opts, model, outcome, startedAt, finishedAt);
  }
  return outcome;
}

async function writeReceipt(opts: ExecutorOptions, model: PipelineModel, outcome: RunOutcome, startedAt: number, finishedAt: number): Promise<string> {
  const r = opts.receipt!;
  const slug = r.receiptSlug ?? `${model.name}-${iso(startedAt).replace(/[-:]/g, "").toLowerCase()}`;
  const receiptId = `lf:receipt:${slug}`;
  const fields: Record<string, unknown> = {
    pipeline_version: model.version,
    terminal_state: outcome.terminal_state,
    started_at: iso(startedAt),
    finished_at: iso(finishedAt),
    iteration_count: outcome.iterations,
    model_call_count: outcome.model_calls,
    total_tokens: outcome.total_tokens,
    wall_clock_ms: outcome.wall_clock_ms,
    records: JSON.stringify(outcome.records),
  };
  if (outcome.cost_usd !== undefined) fields["cost_usd"] = outcome.cost_usd;
  if (outcome.final_output) fields["final_output"] = JSON.stringify(outcome.final_output);
  if (outcome.handoff) fields["handoff"] = JSON.stringify(outcome.handoff);
  const created = await opts.host.createPrimitive(opts.workbookId, { id: receiptId, type_id: "lf:RunReceipt", scope_id: r.receiptScope, field_values: fields });
  if (!created.report.accepted) throw new Error(`receipt rejected: ${JSON.stringify(created.report.findings)}`);
  await opts.host.createRelation(opts.workbookId, {
    id: `lf:ReceiptEvaluatesPipeline:${slug}--${model.id.slice(model.id.lastIndexOf(":") + 1)}`,
    type_id: "lf:ReceiptEvaluatesPipeline",
    source_id: receiptId,
    target_id: model.id,
    field_values: {},
  });

  // One submission per accepted stage output across every iteration — the
  // outputs a run presented to its boundaries — keyed by the record's digest
  // so a submission can be matched to the attempt that produced it.
  if (r.submissionScope && r.submissionEdgeType) {
    let n = 0;
    for (const rec of outcome.records.filter((x) => x.accepted)) {
      const key = `i${rec.iteration}-${rec.stage}`;
      const submissionId = `sa:submission:${slug}-${key}`;
      const sub = await opts.host.createPrimitive(opts.workbookId, {
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
      await opts.host.createRelation(opts.workbookId, {
        id: `${r.submissionEdgeType}:${slug}--${key}`,
        type_id: r.submissionEdgeType,
        source_id: receiptId,
        target_id: submissionId,
        field_values: {},
      });
      n += 1;
    }
    opts.log?.(`receipt ${receiptId} with ${n} submission${n === 1 ? "" : "s"}`);
  }
  return receiptId;
}
