/**
 * The loop-forward executor: run an lf:Pipeline to a terminal state and write
 * the lf:RunReceipt that proves what happened.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * This is the driver-driven form of `LoopRun` (run.ts): each stage's prompt
 * goes to the driver chosen for its agent, and the driver's result goes back
 * to the run to be judged. The MCP server (mcp.ts) drives the same state
 * machine one tool call at a time. Every bound is owned by the run, never by
 * a model; a receipt is written whatever the terminal state.
 */
import type { StageDriver } from "./drivers.js";
import type { StageModel } from "./pipeline.js";
import { LoopRun, type RunConfig, type RunOutcome } from "./run.js";

export { InputError, checkInputs, type AttemptRecord, type ReceiptOptions, type RunOutcome, type TerminalState } from "./run.js";

export interface ExecutorOptions extends RunConfig {
  workbookId: string;
  pipelineId: string;
  inputs: Readonly<Record<string, unknown>>;
  /** Choose the driver for a stage; the executor never guesses. */
  driverFor: (stage: StageModel) => StageDriver;
  runId?: string;
}

export async function runPipeline(opts: ExecutorOptions): Promise<RunOutcome> {
  const log = opts.log ?? (() => {});
  const run = LoopRun.start(opts, {
    runId: opts.runId ?? `run-${(opts.now ?? Date.now)()}`,
    workbookId: opts.workbookId,
    pipelineId: opts.pipelineId,
    inputs: opts.inputs,
  });
  for (;;) {
    const stageRun = run.current();
    if (stageRun === undefined) break;
    const driver = opts.driverFor(stageRun.stage);
    log(`iteration ${stageRun.iteration} stage ${stageRun.stage.name} attempt ${stageRun.attempt} via ${driver.kind}`);
    const result = await driver.run(stageRun);
    await run.submit(result);
  }
  return run.finish();
}
