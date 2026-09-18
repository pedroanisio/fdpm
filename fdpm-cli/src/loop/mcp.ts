/**
 * The loop-forward executor as MCP tools, so an interactive agent session —
 * Claude Code in VS Code — is the orchestrator by tool calls alone: no API
 * key, no file exchange.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Protocol (one LoopRun per run_id, persisted after every transition):
 *
 *   fdpm_loop_start   → the first thing the run needs: a prompt for the
 *                       orchestrator, "running" if a solver stage was
 *                       dispatched, or the terminal outcome
 *   fdpm_loop_submit  → the orchestrator's output for the pending prompt; it
 *                       is judged against the stage contract exactly as a
 *                       driver's would be, and the answer says what happened
 *                       and what comes next
 *   fdpm_loop_wait    → block up to timeout_ms for a running solver stage
 *   fdpm_loop_status  → where the run is, without waiting
 *   fdpm_loop_abort   → end the run now; the receipt still gets written
 *   fdpm_loop_list    → the runs this server knows
 *
 * Solver stages (provider `openai`) run inside this server through the
 * delegation wrapper and are re-validated on return. Orchestrator stages
 * (provider `anthropic`) are the caller's. Nothing here can approve a write
 * on the orchestrator's behalf: the orchestrator writes through the fdpm MCP
 * server it already has, and this server reloads its own projection before
 * judging what was written.
 */
import { tmpdir } from "node:os";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Host } from "../core/host.js";
import { gitSnapshot, type GitSnapshot } from "./checks/repo.js";
import { CodexWrapperDriver, type StageDriver, type StageRunResult } from "./drivers.js";
import { productionIO, type ValidatorIO } from "./named.js";
import type { StageModel } from "./pipeline.js";
import { LoopRun, type AttemptRecord, type RunConfig, type RunOutcome, type RunState } from "./run.js";
import { wiringFor, type ProfileWiring } from "./wiring.js";

/** loop-forward and silent-acceptance scope ids, spelled here so src/ does not import a plugin. */
export const LF_SCOPE = "scope:loop-forward:workbook";
export const SA_SCOPE = "scope:silent-acceptance:workbook";

export type Next =
  | { kind: "prompt"; run_id: string; stage: string; iteration: number; attempt: number; system_prompt: string; task_prompt: string; deadline_at: string; mode?: string; contract_schema?: string }
  | { kind: "running"; run_id: string; stage: string; iteration: number; attempt: number; since: string }
  | { kind: "terminal"; run_id: string; outcome: RunOutcome };

export interface SubmitResult {
  accepted: boolean;
  record?: AttemptRecord;
  next: Next;
}

export interface RunSummary {
  run_id: string;
  workbook_id: string;
  pipeline_id: string;
  started_at: string;
  iteration: number;
  stage: string;
  attempt: number;
  model_calls: number;
  total_tokens: number;
  terminal?: RunOutcome["terminal_state"];
  receipt_id?: string;
  receipt_error?: string;
}

export interface LoopServiceOptions {
  host: Host;
  /** Where run state is persisted; null keeps runs in memory only. */
  dataDir: string | null;
  repoRoot: string;
  /** The package root, for the wrapper script and the Lean project. */
  packageRoot: string;
  /**
   * Where artifacts, wrapper orders and exchange files are written:
   * `<dataDir>/loop` by default, the OS temp dir for an in-memory service.
   * Never the repository: a published server has no checkout to write into.
   */
  scratchDir?: string;
  /** Where evidence bundles resolve: `<dataDir>/evidence` by default. */
  evidenceRoot?: string;
  io?: ValidatorIO;
  now?: () => number;
  log?: (line: string) => void;
  /** Providers whose stages the caller answers. */
  orchestratorProviders?: readonly string[];
  /** Driver for a non-orchestrator stage; undefined ends the run. Tests inject scripted drivers. */
  automaticDriverFor?: (stage: StageModel, wiring: ProfileWiring, args: StartArgs) => StageDriver | undefined;
  /** Git facts around an orchestrator stage; injectable so tests can move HEAD without a repository. */
  snapshot?: (repoPath: string) => GitSnapshot;
  /**
   * This server instance's identity, written into every run it owns. Every
   * Claude Code session starts its own loop server over the same run store;
   * a run stays with the server that started it while that server lives.
   */
  instanceId?: string;
  /** Whether the process that owns a persisted run is still running; injectable so tests can declare a server dead. */
  isAlive?: (pid: number) => boolean;
}

export interface StartArgs {
  workbook_id: string;
  pipeline_id: string;
  inputs: Record<string, unknown>;
  receipt_slug?: string;
  codex_model?: string;
  codex_effort?: string;
  run_id?: string;
}

/** Git facts captured when a prompt was issued: an orchestrator stage "runs" between its prompt and its submit. */
interface Prompted {
  stage: string;
  iteration: number;
  attempt: number;
  repo: string;
  git_before: GitSnapshot;
}

/** Which server process holds a run. A sibling server adopts a run only when this process is gone. */
interface Owner {
  instance_id: string;
  pid: number;
}

interface Persisted {
  state: RunState;
  args: StartArgs;
  owner?: Owner;
  /** Set while a solver stage is in flight; a restart finds it and records the attempt as lost. */
  inflight?: { stage: string; iteration: number; attempt: number; since: number };
  prompted?: Prompted;
}

interface Managed {
  run: LoopRun;
  args: StartArgs;
  wiring: ProfileWiring;
  inflight?: { promise: Promise<void>; stage: string; iteration: number; attempt: number; since: number };
  prompted?: Prompted;
}

export class LoopError extends Error {
  constructor(
    readonly code: "not_found" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "LoopError";
  }
}

const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** `kill -0`: true while the process exists (EPERM means it exists under another user). */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class LoopService {
  private readonly runs = new Map<string, Managed>();
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly io: ValidatorIO;
  private readonly orchestrator: ReadonlySet<string>;
  readonly instanceId: string;
  private readonly isAlive: (pid: number) => boolean;
  /** Resolved scratch location (artifacts, wrapper orders); see LoopServiceOptions.scratchDir. */
  readonly scratchDir: string;
  /** Resolved evidence root; see LoopServiceOptions.evidenceRoot. */
  readonly evidenceRoot: string;

  constructor(private readonly opts: LoopServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.log = opts.log ?? (() => {});
    this.instanceId = opts.instanceId ?? `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    this.isAlive = opts.isAlive ?? processIsAlive;
    const lean = join(opts.packageRoot, "scripts", "frontier-proof-loop", "fplproofs");
    const base = opts.dataDir ?? join(tmpdir(), "fdpm-loop");
    this.scratchDir = opts.scratchDir ?? join(base, "loop");
    this.evidenceRoot = opts.evidenceRoot ?? join(base, "evidence");
    this.io = opts.io ?? productionIO({ artifactScratchDir: join(this.scratchDir, "artifacts"), ...(existsSync(lean) ? { leanProjectDir: lean } : {}) });
    this.orchestrator = new Set(opts.orchestratorProviders ?? ["anthropic"]);
  }

  // ── persistence ──────────────────────────────────────────────────────────

  private get runDir(): string | null {
    return this.opts.dataDir === null ? null : join(this.opts.dataDir, "loop-runs");
  }

  private persist(m: Managed): void {
    const dir = this.runDir;
    if (dir === null) return;
    mkdirSync(dir, { recursive: true });
    const doc: Persisted = {
      state: m.run.state,
      args: m.args,
      owner: { instance_id: this.instanceId, pid: process.pid },
      ...(m.inflight ? { inflight: { stage: m.inflight.stage, iteration: m.inflight.iteration, attempt: m.inflight.attempt, since: m.inflight.since } } : {}),
      ...(m.prompted ? { prompted: m.prompted } : {}),
    };
    const path = join(dir, `${m.run.state.run_id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(doc, null, 2), "utf8");
    // Atomic replace so a reader never sees a half-written run.
    rmSync(path, { force: true });
    writeFileSync(path, readFileSync(`${path}.tmp`));
    rmSync(`${path}.tmp`, { force: true });
  }

  /**
   * Load every persisted run that has not ended and that no living server
   * owns. Sibling servers — one per Claude Code session — share the run
   * store; a run belongs to the server that started it until that process
   * is gone, so a server starting mid-run never records another server's
   * live solver stage as lost or writes its receipt. A run whose owner is
   * gone is adopted: a solver stage that was in flight gets that attempt
   * recorded as a driver error — the output, if any, was never judged — and
   * the run continues under the contract's retry policy.
   */
  async resumeAll(): Promise<string[]> {
    const dir = this.runDir;
    if (dir === null || !existsSync(dir)) return [];
    const resumed: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      let doc: Persisted;
      try {
        doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as Persisted;
      } catch {
        continue;
      }
      if (doc.state.terminal) continue;
      if (doc.owner && doc.owner.instance_id !== this.instanceId && this.isAlive(doc.owner.pid)) {
        this.log(`run ${doc.state.run_id} belongs to live server ${doc.owner.instance_id} (pid ${doc.owner.pid}); not adopted`);
        continue;
      }
      const wiring = this.wiringOf(doc.state.workbook_id);
      const run = LoopRun.resume(this.config(wiring, doc.args), doc.state);
      const m: Managed = { run, args: doc.args, wiring, ...(doc.prompted ? { prompted: doc.prompted } : {}) };
      this.runs.set(run.state.run_id, m);
      if (doc.inflight) {
        await run.submit({ outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 0, evidence: {}, error: `the loop server restarted while ${doc.inflight.stage} was running; the attempt was lost` });
      }
      await this.pump(m);
      resumed.push(run.state.run_id);
    }
    return resumed;
  }

  // ── wiring ───────────────────────────────────────────────────────────────

  private wiringOf(workbookId: string): ProfileWiring {
    return wiringFor(this.opts.host.getProject(workbookId).workbook.profile_id);
  }

  private config(wiring: ProfileWiring, args: StartArgs): RunConfig {
    const host = this.opts.host;
    return {
      host,
      io: this.io,
      repoRoot: this.opts.repoRoot,
      evidenceRoot: this.evidenceRoot,
      ...(wiring.modeRelationType ? { modeRelationType: wiring.modeRelationType } : {}),
      ...(wiring.modeBinding ? { modeBinding: wiring.modeBinding } : {}),
      driverConsumedBindings: wiring.driverConsumed,
      receipt: {
        receiptScope: LF_SCOPE,
        submissionScope: SA_SCOPE,
        ...(wiring.submissionEdgeType ? { submissionEdgeType: wiring.submissionEdgeType } : {}),
        ...(args.receipt_slug ? { receiptSlug: args.receipt_slug } : {}),
      },
      // The orchestrator writes through its own fdpm MCP server — another
      // process — so this projection is stale by the time it judges a
      // register stage. Reload before every verdict.
      refreshBeforeValidate: async () => {
        if (host.dataDir !== null) await host.reload();
      },
      now: this.now,
      log: this.log,
    };
  }

  private driverFor(stage: StageModel, wiring: ProfileWiring, args: StartArgs): StageDriver | undefined {
    if (this.opts.automaticDriverFor) return this.opts.automaticDriverFor(stage, wiring, args);
    if (stage.agent.provider !== "openai") return undefined;
    return new CodexWrapperDriver({
      wrapperPath: join(this.opts.packageRoot, "scripts", "codex-delegate.sh"),
      scratchDir: join(this.scratchDir, "codex"),
      env: { CODEX_DELEGATE_SCRATCH: join(this.scratchDir, "codex-delegate") },
      ...(wiring.codexFixedMode ? { fixedMode: wiring.codexFixedMode, fixedRepo: this.opts.repoRoot } : {}),
      ...(wiring.codexUnwrapEnvelope ? { unwrapEnvelope: true } : {}),
      ...(args.codex_model ? { model: args.codex_model } : {}),
      ...(args.codex_effort ? { effort: args.codex_effort } : {}),
    });
  }

  // ── the pump ─────────────────────────────────────────────────────────────

  /**
   * Advance until the run needs the orchestrator, is waiting on a solver, or
   * has ended. Solver stages are dispatched asynchronously; the promise is
   * kept so `wait` can join it and so the next pump runs when it settles.
   */
  private async pump(m: Managed): Promise<Next> {
    for (;;) {
      if (m.inflight) return this.describe(m);
      const run = m.run;
      if (run.terminal) {
        await run.finish();
        this.persist(m);
        return this.describe(m);
      }
      const stageRun = run.current();
      if (stageRun === undefined) continue; // current() ended the run; loop to finish()
      if (this.orchestrator.has(stageRun.stage.agent.provider)) {
        // The orchestrator's stage runs from this prompt until its submit;
        // the git facts at both ends are its evidence, as a driver's would be.
        const key = { stage: stageRun.stage.name, iteration: stageRun.iteration, attempt: stageRun.attempt };
        if (!m.prompted || m.prompted.stage !== key.stage || m.prompted.iteration !== key.iteration || m.prompted.attempt !== key.attempt) {
          const repo = this.repoFor(stageRun);
          m.prompted = { ...key, repo, git_before: (this.opts.snapshot ?? gitSnapshot)(repo) };
        }
        this.persist(m);
        return this.describe(m);
      }
      const driver = this.driverFor(stageRun.stage, m.wiring, m.args);
      if (!driver) {
        run.abort(`no driver for provider ${stageRun.stage.agent.provider} at stage ${stageRun.stage.name}`);
        continue;
      }
      const since = this.now();
      this.log(`run ${run.state.run_id}: iteration ${stageRun.iteration} stage ${stageRun.stage.name} attempt ${stageRun.attempt} via ${driver.kind}`);
      const promise = driver
        .run(stageRun)
        .catch((err: unknown): StageRunResult => ({ outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 1, evidence: {}, error: `driver threw: ${err instanceof Error ? err.message : String(err)}` }))
        .then(async (result) => {
          // The marker stays set until the verdict is recorded: a status or
          // wait call that lands while submit() is suspended must still see
          // the stage as running, never as a prompt for a stage that is
          // about to be judged. Nothing awaits between the verdict and the
          // clear, so a concurrent submit cannot slip in between them.
          await run.submit(result);
          m.inflight = undefined;
          this.persist(m);
          await this.pump(m);
        });
      m.inflight = { promise, stage: stageRun.stage.name, iteration: stageRun.iteration, attempt: stageRun.attempt, since };
      this.persist(m);
      return this.describe(m);
    }
  }

  private describe(m: Managed): Next {
    const run = m.run;
    const id = run.state.run_id;
    if (m.inflight) return { kind: "running", run_id: id, stage: m.inflight.stage, iteration: m.inflight.iteration, attempt: m.inflight.attempt, since: iso(m.inflight.since) };
    if (run.terminal) return { kind: "terminal", run_id: id, outcome: run.outcome() };
    const stageRun = run.current();
    if (stageRun === undefined) return { kind: "terminal", run_id: id, outcome: run.outcome() };
    const schema = stageRun.stage.contract.json_schema;
    return {
      kind: "prompt",
      run_id: id,
      stage: stageRun.stage.name,
      iteration: stageRun.iteration,
      attempt: stageRun.attempt,
      system_prompt: stageRun.systemPrompt,
      task_prompt: stageRun.taskPrompt,
      deadline_at: iso(stageRun.deadlineAt),
      ...(stageRun.mode !== undefined ? { mode: stageRun.mode } : {}),
      ...(schema !== undefined ? { contract_schema: schema } : {}),
    };
  }

  /** The repository an orchestrator stage acts on: the pipeline's repo_path input when it has one, else the repo root. */
  private repoFor(stageRun: { bindings: Readonly<Record<string, unknown>> }): string {
    const bound = stageRun.bindings["repo_path"];
    return typeof bound === "string" && bound !== "" ? bound : this.opts.repoRoot;
  }

  private managed(runId: string): Managed {
    const m = this.runs.get(runId);
    if (!m) throw new LoopError("not_found", `unknown run ${JSON.stringify(runId)}`);
    return m;
  }

  // ── tools ────────────────────────────────────────────────────────────────

  async start(args: StartArgs): Promise<Next> {
    if (this.opts.host.dataDir !== null) await this.opts.host.reload();
    const runId = args.run_id ?? `run-${iso(this.now()).replace(/[-:]/g, "").toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
    if (this.runs.has(runId)) throw new LoopError("conflict", `run ${runId} already exists`);
    const wiring = this.wiringOf(args.workbook_id);
    if (args.receipt_slug !== undefined) {
      // The receipt is written when the run ends; a slug that already names
      // one would collide then, after the work was done. Refuse it now.
      const receiptId = `lf:receipt:${args.receipt_slug}`;
      if (this.opts.host.getProject(args.workbook_id).primitives[receiptId]) throw new LoopError("conflict", `receipt ${receiptId} already exists in ${args.workbook_id}; choose another receipt_slug`);
    }
    const run = LoopRun.start(this.config(wiring, args), { runId, workbookId: args.workbook_id, pipelineId: args.pipeline_id, inputs: args.inputs });
    const m: Managed = { run, args, wiring };
    this.runs.set(runId, m);
    return this.pump(m);
  }

  /** The orchestrator's output for the pending prompt. Judged like any driver result; the verdict is returned, never hidden. */
  async submit(runId: string, output: string | Record<string, unknown>): Promise<SubmitResult> {
    const m = this.managed(runId);
    if (m.inflight) throw new LoopError("conflict", `run ${runId} is waiting on its ${m.inflight.stage} stage; call fdpm_loop_wait`);
    if (m.run.terminal) throw new LoopError("conflict", `run ${runId} has ended (${m.run.terminal.state})`);
    const stageRun = m.run.current();
    if (stageRun === undefined) throw new LoopError("conflict", `run ${runId} has no pending prompt`);
    if (!this.orchestrator.has(stageRun.stage.agent.provider)) throw new LoopError("conflict", `stage ${stageRun.stage.name} is not the orchestrator's to answer`);
    const text = typeof output === "string" ? output : JSON.stringify(output);
    const repo = m.prompted?.repo ?? this.repoFor(stageRun);
    const evidence: Record<string, unknown> = {
      submitted_via: "fdpm_loop_submit",
      ...(m.prompted ? { git_before: m.prompted.git_before } : {}),
      git_after: (this.opts.snapshot ?? gitSnapshot)(repo),
    };
    m.prompted = undefined;
    const record = await m.run.submit({ outputText: text, usage: { input_tokens: stageRun.taskPrompt.length, output_tokens: text.length }, modelCalls: 1, evidence });
    this.persist(m);
    const next = await this.pump(m);
    return { accepted: record?.accepted === true, ...(record ? { record } : {}), next };
  }

  /** Join a running solver stage for at most `timeoutMs`; a caller with a short tool timeout polls. */
  async wait(runId: string, timeoutMs: number): Promise<Next> {
    const m = this.managed(runId);
    if (!m.inflight) return this.describe(m);
    const bounded = Math.max(0, Math.min(timeoutMs, 300_000));
    await Promise.race([m.inflight.promise, new Promise<void>((r) => setTimeout(r, bounded))]);
    return this.describe(m);
  }

  status(runId: string): { summary: RunSummary; next: Next; records: AttemptRecord[] } {
    const m = this.managed(runId);
    return { summary: this.summary(m), next: this.describe(m), records: m.run.state.records };
  }

  async abort(runId: string, reason: string): Promise<Next> {
    const m = this.managed(runId);
    if (m.run.terminal) return this.describe(m);
    m.run.abort(reason);
    m.inflight = undefined; // a solver still running is ignored on return: the run has ended
    return this.pump(m);
  }

  list(): RunSummary[] {
    return [...this.runs.values()].map((m) => this.summary(m));
  }

  private summary(m: Managed): RunSummary {
    const s = m.run.state;
    const stageName = s.terminal ? m.run.stage.name : (m.inflight?.stage ?? m.run.stage.name);
    return {
      run_id: s.run_id,
      workbook_id: s.workbook_id,
      pipeline_id: s.pipeline_id,
      started_at: iso(s.started_at),
      iteration: s.iteration,
      stage: stageName,
      attempt: s.attempt,
      model_calls: s.model_calls,
      total_tokens: s.total_tokens,
      ...(s.terminal ? { terminal: s.terminal.state } : {}),
      ...(s.receipt_id ? { receipt_id: s.receipt_id } : {}),
      ...(s.receipt_error ? { receipt_error: s.receipt_error } : {}),
    };
  }
}

// ── MCP surface ────────────────────────────────────────────────────────────

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({ type: "object", additionalProperties: false, required, properties });

export const LOOP_TOOLS: ReadonlyArray<ToolSpec> = [
  {
    name: "fdpm_loop_start",
    description:
      "Start a loop-forward pipeline run. Returns the first thing the run needs: a `prompt` for you (the orchestrator) to answer with fdpm_loop_submit, `running` while a solver stage executes inside the server (poll with fdpm_loop_wait), or the `terminal` outcome. Inputs must match the pipeline's declared VariableSpecs exactly.",
    inputSchema: obj(
      {
        workbook_id: { type: "string", minLength: 1 },
        pipeline_id: { type: "string", minLength: 1 },
        inputs: { type: "object", additionalProperties: true },
        receipt_slug: { type: "string", description: "Slug for lf:receipt:<slug>; defaults to pipeline name + timestamp. Refused if that receipt already exists in the workbook." },
        codex_model: { type: "string" },
        codex_effort: { type: "string", enum: ["minimal", "low", "medium", "high", "xhigh"] },
      },
      ["workbook_id", "pipeline_id", "inputs"],
    ),
  },
  {
    name: "fdpm_loop_submit",
    description:
      "Answer the pending prompt of a run with your stage output — exactly one JSON object matching the prompt's contract_schema, as a string or an object. The output is judged against the stage contract; the result reports `accepted`, the attempt record with any failures, and `next`. A rejected output re-issues the same stage with the failures appended when the contract allows a retry.",
    inputSchema: obj({ run_id: { type: "string", minLength: 1 }, output: { anyOf: [{ type: "string" }, { type: "object" }] } }, ["run_id", "output"]),
  },
  {
    name: "fdpm_loop_wait",
    description: "Wait up to timeout_ms (default 20000, max 300000) for a running solver stage, then report `next`. Poll repeatedly rather than asking for a long wait.",
    inputSchema: obj({ run_id: { type: "string", minLength: 1 }, timeout_ms: { type: "integer", minimum: 0, maximum: 300000 } }, ["run_id"]),
  },
  {
    name: "fdpm_loop_status",
    description: "Where a run is right now: summary, `next`, and every attempt record so far. Never waits.",
    inputSchema: obj({ run_id: { type: "string", minLength: 1 } }, ["run_id"]),
  },
  {
    name: "fdpm_loop_abort",
    description: "End a run now with a recorded reason. The receipt is still written; a solver stage still running is ignored on return.",
    inputSchema: obj({ run_id: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 } }, ["run_id", "reason"]),
  },
  {
    name: "fdpm_loop_list",
    description: "The runs this server knows, including ones resumed from disk.",
    inputSchema: obj({}, []),
  },
];

export interface CallToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const ok = (value: Record<string, unknown>): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value });
const fail = (code: string, message: string): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }], structuredContent: { error: { code, message } }, isError: true });

const str = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || v === "") throw new LoopError("invalid", `${key} must be a non-empty string`);
  return v;
};

/** Route one tool call. Errors become `isError` results; nothing throws across the wire. */
export async function callLoopTool(service: LoopService, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    switch (name) {
      case "fdpm_loop_start": {
        const inputs = args["inputs"];
        if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) throw new LoopError("invalid", "inputs must be an object");
        const start: StartArgs = { workbook_id: str(args, "workbook_id"), pipeline_id: str(args, "pipeline_id"), inputs: inputs as Record<string, unknown> };
        if (typeof args["receipt_slug"] === "string") start.receipt_slug = args["receipt_slug"];
        if (typeof args["codex_model"] === "string") start.codex_model = args["codex_model"];
        if (typeof args["codex_effort"] === "string") start.codex_effort = args["codex_effort"];
        if (typeof args["run_id"] === "string") start.run_id = args["run_id"];
        const next = await service.start(start);
        return ok({ next });
      }
      case "fdpm_loop_submit": {
        const output = args["output"];
        if (typeof output !== "string" && (output === null || typeof output !== "object" || Array.isArray(output))) throw new LoopError("invalid", "output must be a string or an object");
        const result = await service.submit(str(args, "run_id"), output as string | Record<string, unknown>);
        return ok(result as unknown as Record<string, unknown>);
      }
      case "fdpm_loop_wait": {
        const timeout = typeof args["timeout_ms"] === "number" ? args["timeout_ms"] : 20_000;
        return ok({ next: await service.wait(str(args, "run_id"), timeout) });
      }
      case "fdpm_loop_status":
        return ok(service.status(str(args, "run_id")) as unknown as Record<string, unknown>);
      case "fdpm_loop_abort":
        return ok({ next: await service.abort(str(args, "run_id"), str(args, "reason")) });
      case "fdpm_loop_list":
        return ok({ runs: service.list() });
      default:
        return fail("not_found", `unknown tool ${name}`);
    }
  } catch (err) {
    if (err instanceof LoopError) return fail(err.code, err.message);
    return fail("error", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  }
}

export const LOOP_SERVER_INSTRUCTIONS = [
  "fdpm-loop: run a loop-forward pipeline with yourself as the orchestrator, by tool calls only.",
  "1. fdpm_loop_start(workbook_id, pipeline_id, inputs) — read `next`.",
  "2. If next.kind is \"prompt\": read system_prompt and task_prompt, do the stage's work (read workbooks through the fdpm server, write through it when the stage says to), then fdpm_loop_submit(run_id, output) with exactly one JSON object matching contract_schema. The result says whether it was accepted and what comes next; a rejection re-issues the stage with the failures appended when the contract allows a retry.",
  "3. If next.kind is \"running\": a solver stage (Codex, through the delegation wrapper) is executing inside this server. Call fdpm_loop_wait(run_id) repeatedly until next changes. Do not edit the repository while it runs: the git-mutation check will reject the stage.",
  "4. If next.kind is \"terminal\": the run ended; outcome.receipt_id names the lf:RunReceipt written to the workbook (outcome.receipt_error says why one could not be written). Send the fdpm server SIGHUP (or reload) to see it there.",
  "A run belongs to the server that started it: a loop server started by another session leaves it alone while this one lives, and adopts it only once this process is gone.",
  "When a solver attempt is rejected, the record's failures carry the wrapper's own verdict check by check (for example fpl.reference_resolves); a cited https title must be one the page declares for itself (og:title, citation_title or <title>, with or without the site suffix), and PDF or repository-path locators do not resolve.",
  "Every stage output you submit is validated against the stage contract exactly as a solver's would be. Nothing you submit becomes verified: registered records stay unverified until the acceptance authority records a verdict.",
].join("\n");
