/**
 * The executor over the real codex-delegation workbook, driven by scripted
 * stage outputs: every terminal path, every bound, and the receipt.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import type { Fetcher } from "../../src/loop/checks/reference.js";
import { gitSnapshot } from "../../src/loop/checks/repo.js";
import { ScriptedDriver, type Script } from "../../src/loop/drivers.js";
import { InputError, checkInputs, runPipeline, type ExecutorOptions } from "../../src/loop/executor.js";
import type { ValidatorIO } from "../../src/loop/named.js";
import { PipelineLoadError, loadPipeline } from "../../src/loop/pipeline.js";
import { SCOPE_ID as LF_SCOPE } from "../../plugins/loop_forward/ids.js";
import { SCOPE_ID as SA_SCOPE } from "../../plugins/silent_acceptance/ids.js";
import { buildCodexDelegation } from "../../scripts/build-codex-delegation.js";
import { CDEL_R } from "../../scripts/codex-delegation/profile.js";
import { PIPELINE_ID, WORKBOOK_ID } from "../../scripts/codex-delegation/seed.js";

const REPO_ROOT = resolve(process.cwd(), "..");
const SNAPSHOT = gitSnapshot(REPO_ROOT);

async function builtHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  await buildCodexDelegation(host);
  return host;
}

const noFetch: Fetcher = async () => {
  throw new Error("no network in tests");
};
const io: ValidatorIO = {
  fetch: noFetch,
  runArtifact: async () => ({ exit_code: 0, stdout: "", stderr: "", timed_out: false, sandboxed: true, command: [], duration_ms: 0 }),
  artifactTimeoutMs: 1,
};

const INPUTS = {
  repo_path: REPO_ROOT,
  mode: "research",
  goal: "State what src/sdk.ts exports.",
  context_files: ["fdpm-cli/src/sdk.ts"],
  constraints: "read-only",
  proof_command: "true",
};

/** Valid outputs for each stage; `stop` sets the order stage's stop_reason. */
const outputs = (stop = "continue") => ({
  order: {
    stop_reason: stop,
    mode: "research",
    order_path: "_tmp/order.md",
    goal: INPUTS.goal,
    context_files: ["fdpm-cli/src/sdk.ts"],
    constraints: "read-only",
    proof_command: "true",
  },
  delegate: {
    mode: "research",
    validated: true,
    return: {
      answer: "The SDK is a facade over Host.",
      evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 2, quote: " * @fdpm/cli SDK — thin programmatic facade over Host." }],
      confidence: 0.9,
      open_questions: [],
      unverified_claims: [],
    },
  },
  review: { verdict: "integrate", findings: [], independently_read: ["fdpm-cli/src/sdk.ts"], notes: "read it" },
  apply: { written: [], rejected: [], proof_command: "true", proof_exit_code: 0, proof_output_tail: "", committed: false },
});

/** A script that answers every stage validly; the order stage stops on the given iteration. */
function happyScript(stopAtIteration: number, override: (stage: string, iteration: number, attempt: number) => string | undefined = () => undefined): Script {
  return (run) => {
    const custom = override(run.stage.name, run.iteration, run.attempt);
    if (custom !== undefined) return { outputText: custom, evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT } };
    const all = outputs(run.iteration >= stopAtIteration ? "answered" : "continue");
    const text = JSON.stringify(all[run.stage.name as keyof ReturnType<typeof outputs>]);
    return { outputText: text, evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT } };
  };
}

function options(host: Host, driver: ScriptedDriver, over: Partial<ExecutorOptions> = {}): ExecutorOptions {
  return {
    host,
    workbookId: WORKBOOK_ID,
    pipelineId: PIPELINE_ID,
    inputs: INPUTS,
    driverFor: () => driver,
    io,
    repoRoot: REPO_ROOT,
    modeRelationType: CDEL_R.StageRunsInMode,
    modeBinding: "mode",
    driverConsumedBindings: ["repo_path", "mode"],
    receipt: { receiptScope: LF_SCOPE, submissionScope: SA_SCOPE, submissionEdgeType: CDEL_R.ReceiptSubmitted, receiptSlug: "test-run" },
    ...over,
  };
}

describe("pipeline loading", () => {
  it("reads the codex-delegation pipeline into a typed model", async () => {
    const host = await builtHost();
    const model = loadPipeline(host, WORKBOOK_ID, PIPELINE_ID, { modeRelationType: CDEL_R.StageRunsInMode });
    expect(model.stages.map((s) => s.name)).toEqual(["order", "delegate", "review", "apply"]);
    expect(model.stages[1]?.modes).toHaveLength(4);
    expect(model.stages[1]?.contract.on_invalid).toBe("fail");
    expect(model.stages[0]?.contract.max_attempts).toBe(2);
    expect(model.loop.max_iterations).toBe(2);
    expect(model.stops.map((s) => s.condition_id).sort()).toEqual(["answered", "approval_required", "blocked", "do_it_yourself", "rejected_twice"]);
    expect(model.carries[0]?.carry_name).toBe("review_findings");
    expect(model.agents.map((a) => a.provider).sort()).toEqual(["anthropic", "openai"]);
  });

  it("refuses a pipeline whose records are incomplete", async () => {
    const host = await builtHost();
    await host.deleteRelation(WORKBOOK_ID, "lf:StageHasOutputContract:cdel-review--cdel-review");
    expect(() => loadPipeline(host, WORKBOOK_ID, PIPELINE_ID)).toThrow(PipelineLoadError);
    expect(() => loadPipeline(host, WORKBOOK_ID, PIPELINE_ID)).toThrow(/exactly one output contract/);
  });

  it("checks inputs against the declared VariableSpecs", async () => {
    const host = await builtHost();
    const model = loadPipeline(host, WORKBOOK_ID, PIPELINE_ID);
    expect(() => checkInputs(model, { ...INPUTS, mode: "yolo" })).toThrow(InputError);
    expect(() => checkInputs(model, { repo_path: "/x" })).toThrow(/required input mode/);
    expect(() => checkInputs(model, { ...INPUTS, surprise: 1 })).toThrow(/not declared/);
    expect(checkInputs(model, INPUTS)["mode"]).toBe("research");
  });
});

describe("executor", () => {
  it("runs to success on a stop condition and writes a receipt with one submission per stage", async () => {
    const host = await builtHost();
    const driver = new ScriptedDriver(happyScript(2));
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("success");
    expect(outcome.reason).toContain("answered");
    expect(outcome.iterations).toBe(2);
    // Iteration 1: four stages; iteration 2: the order stage stops the loop.
    expect(outcome.records).toHaveLength(5);
    expect(outcome.records.every((r) => r.accepted)).toBe(true);
    expect(outcome.model_calls).toBe(5);
    expect(outcome.final_output?.stage_id).toBe("lf:stage:cdel-order");
    expect(driver.runs[1]?.mode).toBe("research");
    expect(driver.runs[0]?.systemPrompt).toContain("You are the orchestrator");

    const slice = host.getProject(WORKBOOK_ID);
    const receipt = slice.primitives[outcome.receipt_id!];
    expect(receipt?.type_id).toBe("lf:RunReceipt");
    expect(receipt?.field_values["terminal_state"]).toBe("success");
    expect(JSON.parse(String(receipt?.field_values["records"]))).toHaveLength(5);
    const submissions = Object.values(slice.relations).filter((r) => r.type_id === CDEL_R.ReceiptSubmitted && r.source_id === outcome.receipt_id);
    expect(submissions).toHaveLength(5); // one per accepted stage output, across both iterations
    expect(Object.values(slice.primitives).filter((p) => p.type_id === "sa:OutputSubmission")).toHaveLength(5);
    expect(host.validateProject(WORKBOOK_ID, { minLevel: "error" }).summary.errors).toBe(0);
  });

  it("fails the run when a stage with on_invalid=fail returns an invented path, and records why", async () => {
    const host = await builtHost();
    const driver = new ScriptedDriver(
      happyScript(2, (stage) =>
        stage === "delegate"
          ? JSON.stringify({ ...outputs().delegate, return: { ...outputs().delegate.return, evidence: [{ path: "fdpm-cli/src/ghost.ts", line: 1, quote: "x" }] } })
          : undefined,
      ),
    );
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("failed");
    expect(outcome.reason).toContain("stage delegate");
    const rejected = outcome.records.find((r) => r.stage === "delegate");
    expect(rejected?.accepted).toBe(false);
    expect(rejected?.failures.map((f) => f.error_class)).toContain("ERR_HALLUCINATION");
    expect(driver.runs).toHaveLength(2); // order, delegate — nothing after the failure
    expect(host.getProject(WORKBOOK_ID).primitives[outcome.receipt_id!]?.field_values["terminal_state"]).toBe("failed");
  });

  it("retries a retryable stage with the failures appended, then accepts", async () => {
    const host = await builtHost();
    const driver = new ScriptedDriver(happyScript(1, (stage, _i, attempt) => (stage === "order" && attempt === 1 ? "not json at all" : undefined)));
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("success");
    const orderRecords = outcome.records.filter((r) => r.stage === "order");
    expect(orderRecords.map((r) => r.accepted)).toEqual([false, true]);
    expect(driver.runs[1]?.taskPrompt).toContain("Failures:");
    expect(driver.runs[1]?.taskPrompt).toContain("ERR_SCHEMA");
  });

  it("stops as exhausted when the model-call budget is reached, before the next call", async () => {
    const host = await builtHost();
    await host.patchPrimitive(WORKBOOK_ID, { id: "lf:loop:cdel-main", field_values: { max_model_calls: 2 } });
    const driver = new ScriptedDriver(happyScript(9));
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("exhausted");
    expect(outcome.reason).toContain("max_model_calls");
    expect(driver.runs).toHaveLength(2);
  });

  it("ends stagnated when the review repeats itself, as the workbook's unchanged stop declares", async () => {
    const host = await builtHost();
    const driver = new ScriptedDriver(happyScript(99));
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("stagnated");
    expect(outcome.reason).toContain("rejected_twice");
    expect(outcome.handoff?.["iteration"]).toBe(2);
  });

  it("ends exhausted, not success, when iterations run out without a stop", async () => {
    const host = await builtHost();
    // A review that differs per iteration cannot trip the unchanged stop.
    const driver = new ScriptedDriver(
      happyScript(99, (stage, iteration) => (stage === "review" ? JSON.stringify({ ...outputs().review, notes: `iteration ${iteration}` }) : undefined)),
    );
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("exhausted");
    expect(outcome.reason).toContain("max_iterations");
    expect(outcome.final_output).toBeUndefined();
    expect(outcome.iterations).toBe(2);
  });

  it("fails closed on a contract naming a validator nothing implements", async () => {
    const host = await builtHost();
    await host.patchPrimitive(WORKBOOK_ID, { id: "lf:validator:cdel-order-2", field_values: { validator_name: "nope.unknown" } });
    const driver = new ScriptedDriver(happyScript(1));
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("failed");
    expect(outcome.reason).toContain("unimplemented validator: nope.unknown");
    expect(outcome.executor_error).toContain("UnknownValidatorError");
  });

  it("treats a driver error as a rejected attempt, never as output", async () => {
    const host = await builtHost();
    // Stop at iteration 2 so iteration 1 reaches the delegate stage at all.
    const driver = new ScriptedDriver((run) =>
      run.stage.name === "delegate" ? { outputText: JSON.stringify(outputs().delegate), error: "wrapper exited 1", evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT } } : happyScript(2)(run),
    );
    const outcome = await runPipeline(options(host, driver));
    expect(outcome.terminal_state).toBe("failed");
    const rec = outcome.records.find((r) => r.stage === "delegate");
    expect(rec?.driver_error).toBe("wrapper exited 1");
    expect(rec?.accepted).toBe(false);
  });

  it("refreshes the host projection before every contract evaluation when asked", async () => {
    const host = await builtHost();
    const driver = new ScriptedDriver(happyScript(1));
    const refreshes: number[] = [];
    const outcome = await runPipeline(options(host, driver, { refreshBeforeValidate: async () => { refreshes.push(driver.runs.length); } }));
    expect(outcome.terminal_state).toBe("success");
    // One refresh per attempt, each after the driver ran and before the verdict.
    expect(refreshes).toEqual(outcome.records.map((_, i) => i + 1));
  });

  it("refuses a mode the stage does not declare", async () => {
    const host = await builtHost();
    // Remove write from the delegate stage's modes, then ask for it.
    await host.deleteRelation(WORKBOOK_ID, "cdel:StageRunsInMode:cdel-delegate--write");
    const driver = new ScriptedDriver(happyScript(2));
    const outcome = await runPipeline(options(host, driver, { inputs: { ...INPUTS, mode: "write" } }));
    expect(outcome.terminal_state).toBe("failed");
    expect(outcome.reason).toContain("may not run in mode");
  });
});
