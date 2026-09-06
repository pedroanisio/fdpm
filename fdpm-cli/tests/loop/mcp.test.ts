/**
 * The loop-forward executor driven one tool call at a time, the way Claude
 * Code drives it from VS Code: start → prompt → submit → running → wait →
 * prompt → … → terminal, with every failure path exercised.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import type { Fetcher } from "../../src/loop/checks/reference.js";
import { gitSnapshot } from "../../src/loop/checks/repo.js";
import { ScriptedDriver, type StageDriver, type StageRun, type StageRunResult } from "../../src/loop/drivers.js";
import { LF_SCOPE, LOOP_TOOLS, LoopService, type LoopServiceOptions, callLoopTool, type Next } from "../../src/loop/mcp.js";
import type { ValidatorIO } from "../../src/loop/named.js";
import { wiringFor } from "../../src/loop/wiring.js";
import { buildCodexDelegation } from "../../scripts/build-codex-delegation.js";
import { PIPELINE_ID, WORKBOOK_ID } from "../../scripts/codex-delegation/seed.js";

const REPO_ROOT = resolve(process.cwd(), "..");
const SNAPSHOT = gitSnapshot(REPO_ROOT);
const scratch = mkdtempSync(join(tmpdir(), "fdpm-loop-mcp-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const noFetch: Fetcher = async () => {
  throw new Error("no network in tests");
};
const io: ValidatorIO = {
  fetch: noFetch,
  runArtifact: async () => ({ exit_code: 0, stdout: "", stderr: "", timed_out: false, sandboxed: true, command: [], duration_ms: 0 }),
  artifactTimeoutMs: 1,
};

async function memoryHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  await buildCodexDelegation(host);
  return host;
}

const INPUTS = { repo_path: REPO_ROOT, mode: "research", goal: "State what src/sdk.ts exports.", context_files: ["fdpm-cli/src/sdk.ts"], constraints: "read-only", proof_command: "true" };

const order = (stop = "continue") => ({ stop_reason: stop, mode: "research", order_path: "_tmp/order.md", goal: INPUTS.goal, context_files: ["fdpm-cli/src/sdk.ts"], constraints: "read-only", proof_command: "true" });
const envelope = {
  mode: "research",
  validated: true,
  return: { answer: "The SDK is a facade over Host.", evidence: [{ path: "fdpm-cli/src/sdk.ts", line: 2, quote: " * @fdpm/cli SDK — thin programmatic facade over Host." }], confidence: 0.9, open_questions: [], unverified_claims: [] },
};
const review = { verdict: "integrate", findings: [], independently_read: ["fdpm-cli/src/sdk.ts"], notes: "read it" };
const apply = { written: [], rejected: [], proof_command: "true", proof_exit_code: 0, proof_output_tail: "", committed: false };

/** The solver, scripted: answers the delegate stage after a tick, with git evidence. */
const solver = (): ScriptedDriver => new ScriptedDriver(() => ({ outputText: JSON.stringify(envelope), evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT } }));

function service(host: Host, driver: StageDriver | undefined, dataDir: string | null = null, extra: Partial<LoopServiceOptions> = {}): LoopService {
  return new LoopService({ host, dataDir, repoRoot: REPO_ROOT, packageRoot: process.cwd(), io, automaticDriverFor: () => driver, ...extra });
}

const startArgs = { workbook_id: WORKBOOK_ID, pipeline_id: PIPELINE_ID, inputs: INPUTS, receipt_slug: "mcp-run" };

describe("LoopService", () => {
  it("runs a whole pipeline by tool calls: prompt, submit, running, wait, prompt, …, terminal", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const first = await s.start(startArgs);
    expect(first.kind).toBe("prompt");
    if (first.kind !== "prompt") return;
    expect(first.stage).toBe("order");
    expect(first.system_prompt).toContain("You are the orchestrator");
    expect(first.contract_schema).toContain("stop_reason");

    const afterOrder = await s.submit(first.run_id, order());
    expect(afterOrder.accepted).toBe(true);
    expect(afterOrder.next.kind).toBe("running"); // the solver stage was dispatched inside the server
    const afterWait = await s.wait(first.run_id, 5_000);
    expect(afterWait.kind).toBe("prompt");
    if (afterWait.kind !== "prompt") return;
    expect(afterWait.stage).toBe("review");
    expect(afterWait.task_prompt).toContain("The SDK is a facade over Host.");

    const afterReview = await s.submit(first.run_id, review);
    expect(afterReview.next.kind).toBe("prompt");
    const afterApply = await s.submit(first.run_id, apply);
    expect(afterApply.next.kind).toBe("prompt");
    if (afterApply.next.kind !== "prompt") return;
    expect(afterApply.next.iteration).toBe(2);
    expect(afterApply.next.stage).toBe("order");

    const done = await s.submit(first.run_id, order("answered"));
    expect(done.next.kind).toBe("terminal");
    if (done.next.kind !== "terminal") return;
    expect(done.next.outcome.terminal_state).toBe("success");
    expect(done.next.outcome.receipt_id).toBe("lf:receipt:mcp-run");
    expect(done.next.outcome.records).toHaveLength(5);
    expect(host.getProject(WORKBOOK_ID).primitives["lf:receipt:mcp-run"]?.field_values["terminal_state"]).toBe("success");
    expect(s.status(first.run_id).summary.terminal).toBe("success");
    expect(s.list()).toHaveLength(1);
  });

  it("re-issues a stage with the failures appended when the orchestrator's output is rejected", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const first = await s.start(startArgs);
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    const rejected = await s.submit(first.run_id, "Sure! Here is the plan.");
    expect(rejected.accepted).toBe(false);
    expect(rejected.record?.failures[0]?.error_class).toBe("ERR_SCHEMA");
    expect(rejected.next.kind).toBe("prompt");
    if (rejected.next.kind !== "prompt") return;
    expect(rejected.next.attempt).toBe(2);
    expect(rejected.next.task_prompt).toContain("Failures:");
    const accepted = await s.submit(first.run_id, order());
    expect(accepted.accepted).toBe(true);
  });

  it("refuses a submit while a solver stage is running, and an unknown run", async () => {
    const host = await memoryHost();
    let release: (() => void) | undefined;
    const slow: StageDriver = { kind: "slow", run: () => new Promise<StageRunResult>((r) => { release = () => r({ outputText: JSON.stringify(envelope), usage: { input_tokens: 1, output_tokens: 1 }, modelCalls: 1, evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT } }); }) };
    const s = service(host, slow);
    const first = await s.start(startArgs);
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    const running = await s.submit(first.run_id, order());
    expect(running.next.kind).toBe("running");
    await expect(s.submit(first.run_id, review)).rejects.toThrow(/waiting on its delegate stage/);
    expect((await s.wait(first.run_id, 50)).kind).toBe("running");
    release!();
    expect((await s.wait(first.run_id, 5_000)).kind).toBe("prompt");
    await expect(s.submit("no-such-run", order())).rejects.toThrow(/unknown run/);
  });

  it("ends a run when no driver exists for a solver stage, rather than guessing", async () => {
    const host = await memoryHost();
    const s = service(host, undefined);
    const first = await s.start(startArgs);
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    const ended = await s.submit(first.run_id, order());
    expect(ended.next.kind).toBe("terminal");
    if (ended.next.kind !== "terminal") return;
    expect(ended.next.outcome.terminal_state).toBe("failed");
    expect(ended.next.outcome.reason).toContain("no driver for provider openai");
  });

  it("aborts with the reason recorded and the receipt written", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const first = await s.start(startArgs);
    const aborted = await s.abort(first.run_id, "operator stopped it");
    expect(aborted.kind).toBe("terminal");
    if (aborted.kind !== "terminal") return;
    expect(aborted.outcome.reason).toBe("aborted: operator stopped it");
    expect(aborted.outcome.receipt_id).toBe("lf:receipt:mcp-run");
  });

  it("judges an orchestrator stage on the git facts between its prompt and its submit", async () => {
    const host = await memoryHost();
    // The snapshot moves HEAD once the review prompt has been issued: the
    // orchestrator committed during its stage. review observes HEAD.
    let calls = 0;
    const moving = (): typeof SNAPSHOT => {
      calls += 1;
      return calls >= 4 ? { ...SNAPSHOT, head: "0".repeat(40) } : SNAPSHOT;
    };
    const s = new LoopService({ host, dataDir: null, repoRoot: REPO_ROOT, packageRoot: process.cwd(), io, automaticDriverFor: () => solver(), snapshot: moving });
    const first = await s.start(startArgs);
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    await s.submit(first.run_id, order()); // snapshots 1 (prompt) and 2 (submit)
    await s.wait(first.run_id, 5_000); // review prompt issued: snapshot 3
    const judged = await s.submit(first.run_id, review); // snapshot 4: HEAD moved
    expect(judged.accepted).toBe(false);
    expect(judged.record?.failures.map((f) => f.error_class)).toContain("ERR_INSTRUCTION");
    expect(judged.record?.failures.map((f) => f.message).join(" ")).toContain("HEAD moved");
  });

  it("refuses to start a run whose receipt slug already names a receipt in the workbook", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const first = await s.start(startArgs);
    await s.abort(first.run_id, "make the receipt exist");
    expect(host.getProject(WORKBOOK_ID).primitives["lf:receipt:mcp-run"]).toBeDefined();
    await expect(s.start(startArgs)).rejects.toThrow(/lf:receipt:mcp-run already exists/);
    expect(s.list()).toHaveLength(1);
  });

  it("records a receipt that cannot be written as receipt_error on the outcome, never as a throw", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const first = await s.start({ ...startArgs, receipt_slug: "dup" });
    // Another writer takes the id between start and finish.
    const taken = await host.createPrimitive(WORKBOOK_ID, {
      id: "lf:receipt:dup",
      type_id: "lf:RunReceipt",
      scope_id: LF_SCOPE,
      field_values: { pipeline_version: "0.0.0", terminal_state: "failed", started_at: "2026-01-01T00:00:00Z", finished_at: "2026-01-01T00:00:01Z", iteration_count: 1, model_call_count: 0, total_tokens: 0, wall_clock_ms: 1000, records: "[]" },
    });
    expect(taken.report.accepted).toBe(true);
    const ended = await s.abort(first.run_id, "collide");
    expect(ended.kind).toBe("terminal");
    if (ended.kind !== "terminal") return;
    expect(ended.outcome.receipt_id).toBeUndefined();
    expect(ended.outcome.receipt_error).toMatch(/lf:receipt:dup/);
    expect(s.status(first.run_id).summary.receipt_error).toMatch(/lf:receipt:dup/);
    expect((await s.wait(first.run_id, 10)).kind).toBe("terminal");
  });

  it("carries a driver's structured boundary failures into the attempt record under their own error classes", async () => {
    const host = await memoryHost();
    const refusal = { check: "fpl.reference_resolves", error_class: "ERR_HALLUCINATION" as const, message: "Reference does not resolve: https://example.org/x (HTTP 404)." };
    const refusing: StageDriver = {
      kind: "refusing",
      run: async () => ({
        outputText: JSON.stringify(envelope.return),
        usage: { input_tokens: 1, output_tokens: 1 },
        modelCalls: 1,
        evidence: { git_before: SNAPSHOT, git_after: SNAPSHOT },
        error: "wrapper rejected the return at its verification boundary (1 failure)",
        failures: [refusal],
      }),
    };
    const s = service(host, refusing);
    const first = await s.start(startArgs);
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    await s.submit(first.run_id, order());
    await s.wait(first.run_id, 5_000);
    const rec = s.status(first.run_id).records.find((r) => r.stage === "delegate");
    expect(rec?.accepted).toBe(false);
    expect(rec?.driver_error).toContain("verification boundary");
    expect(rec?.failures[0]).toEqual(refusal);
    expect(rec?.failures.some((f) => f.check === "driver" && f.error_class === "ERR_TRUNCATION")).toBe(false);
  });

  it("wires the frontier loop's solver stages as attempt-mode delegations that unwrap the envelope", () => {
    const w = wiringFor("profile:frontier-proof-loop:0.1");
    expect(w.codexFixedMode).toBe("attempt");
    expect(w.codexUnwrapEnvelope).toBe(true);
    expect(wiringFor("profile:codex-delegation:0.2").modeBinding).toBe("mode");
    expect(wiringFor("profile:unknown:1.0")).toEqual({ driverConsumed: [] });
  });
});

describe("persistence", () => {
  async function diskHost(dir: string): Promise<Host> {
    const host = new Host({ dataDir: dir, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
    await host.load();
    return host;
  }

  it("persists a run after every transition and resumes it in a new process at the same prompt", async () => {
    const dir = join(scratch, "resume");
    const a = await diskHost(dir);
    await buildCodexDelegation(a);
    const sA = service(a, solver(), dir);
    const first = await sA.start({ ...startArgs, run_id: "persisted" });
    expect(first.kind).toBe("prompt");
    expect(existsSync(join(dir, "loop-runs", "persisted.json"))).toBe(true);

    const b = await diskHost(dir);
    const sB = service(b, solver(), dir, { isAlive: () => false }); // the first server's process is gone
    expect(await sB.resumeAll()).toEqual(["persisted"]);
    const status = sB.status("persisted");
    expect(status.next.kind).toBe("prompt");
    if (status.next.kind !== "prompt") return;
    expect(status.next.stage).toBe("order");
    const resumed = await sB.submit("persisted", order());
    expect(resumed.accepted).toBe(true);
  });

  it("records a solver stage that was in flight when the process died as a lost attempt, never as output", async () => {
    const dir = join(scratch, "inflight");
    const a = await diskHost(dir);
    await buildCodexDelegation(a);
    const never: StageDriver = { kind: "never", run: () => new Promise<StageRunResult>(() => {}) };
    const sA = service(a, never, dir);
    const first = await sA.start({ ...startArgs, run_id: "lost" });
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    const running = await sA.submit("lost", order());
    expect(running.next.kind).toBe("running");
    // The process "dies" here: nothing settles the driver. A new service reads the marker.
    const b = await diskHost(dir);
    const sB = service(b, solver(), dir, { isAlive: () => false });
    await sB.resumeAll();
    const status = sB.status("lost");
    const lost = status.records.find((r) => r.stage === "delegate");
    expect(lost?.accepted).toBe(false);
    expect(lost?.driver_error).toContain("restarted");
    // The delegate contract does not retry, so the run ended and its receipt was written.
    expect(status.next.kind).toBe("terminal");
    expect(status.summary.receipt_id).toBe("lf:receipt:mcp-run");
    expect(readdirSync(join(dir, "loop-runs"))).toContain("lost.json");
  });

  it("leaves a run alone while the server that owns it is alive, and adopts it once that server is gone", async () => {
    const dir = join(scratch, "owned");
    const a = await diskHost(dir);
    await buildCodexDelegation(a);
    const never: StageDriver = { kind: "never", run: () => new Promise<StageRunResult>(() => {}) };
    const sA = service(a, never, dir, { instanceId: "server-a" });
    const first = await sA.start({ ...startArgs, run_id: "shared" });
    if (first.kind !== "prompt") throw new Error("expected a prompt");
    expect((await sA.submit("shared", order())).next.kind).toBe("running");
    const onDisk = (): { owner?: { instance_id: string; pid: number }; state: { records: unknown[] } } => JSON.parse(readFileSync(join(dir, "loop-runs", "shared.json"), "utf8"));
    expect(onDisk().owner).toEqual({ instance_id: "server-a", pid: process.pid });

    // A second server, started by another session while the solver is still running: server A is alive.
    const b = await diskHost(dir);
    const sB = service(b, solver(), dir, { instanceId: "server-b" });
    expect(await sB.resumeAll()).toEqual([]);
    expect(() => sB.status("shared")).toThrow(/unknown run/);
    expect(sB.list()).toEqual([]);
    expect(onDisk().state.records).toHaveLength(1); // nothing was recorded as lost
    expect(onDisk().owner?.instance_id).toBe("server-a");

    // Server A is gone: the next server adopts the run and records the lost attempt.
    const c = await diskHost(dir);
    const sC = service(c, solver(), dir, { instanceId: "server-c", isAlive: () => false });
    expect(await sC.resumeAll()).toEqual(["shared"]);
    expect(onDisk().owner?.instance_id).toBe("server-c");
    const lost = sC.status("shared").records.find((r) => r.stage === "delegate");
    expect(lost?.driver_error).toContain("restarted");
  });
});

describe("callLoopTool", () => {
  it("advertises six tools with closed input schemas", () => {
    expect(LOOP_TOOLS.map((t) => t.name)).toEqual(["fdpm_loop_start", "fdpm_loop_submit", "fdpm_loop_wait", "fdpm_loop_status", "fdpm_loop_abort", "fdpm_loop_list"]);
    for (const t of LOOP_TOOLS) expect(t.inputSchema["additionalProperties"]).toBe(false);
  });

  it("routes calls and turns every error into an isError result rather than a throw", async () => {
    const host = await memoryHost();
    const s = service(host, solver());
    const listed = await callLoopTool(s, "fdpm_loop_list", {});
    expect(listed.structuredContent).toEqual({ runs: [] });
    const bad = await callLoopTool(s, "fdpm_loop_start", { workbook_id: WORKBOOK_ID, pipeline_id: PIPELINE_ID, inputs: "nope" });
    expect(bad.isError).toBe(true);
    const missing = await callLoopTool(s, "fdpm_loop_start", { workbook_id: WORKBOOK_ID, pipeline_id: PIPELINE_ID, inputs: { repo_path: REPO_ROOT } });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("required input mode");
    const started = await callLoopTool(s, "fdpm_loop_start", { ...startArgs });
    expect(started.isError).toBeUndefined();
    const next = (started.structuredContent as { next: Next }).next;
    expect(next.kind).toBe("prompt");
    const unknown = await callLoopTool(s, "fdpm_loop_status", { run_id: "ghost" });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]?.text).toContain("not_found");
    const noTool = await callLoopTool(s, "fdpm_loop_fly", {});
    expect(noTool.isError).toBe(true);
    const aborted = await callLoopTool(s, "fdpm_loop_abort", { run_id: next.run_id, reason: "test" });
    expect((aborted.structuredContent as { next: Next }).next.kind).toBe("terminal");
  });
});
