/**
 * Stage drivers: how the executor gets one stage's output from one agent.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * A driver produces text and evidence; it never validates. Validation is the
 * executor's, against the stage contract, so a driver cannot vouch for what it
 * returns. Three drivers:
 *
 *   ScriptedDriver     canned outputs for tests — deterministic, no I/O
 *   CodexWrapperDriver runs scripts/codex-delegate.sh; the wrapper's own
 *                      boundary runs first, the executor re-checks after
 *   AnthropicDriver    a bounded tool-use loop over the fdpm MCP server,
 *                      with tool grants enforced per call and approvals owned
 *                      by the operator, never by the model
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DriveBounds, DriveTranscript, ModelClient, ToolExecutionResult, ToolExecutor } from "../eval/driver.js";
import { driveInstruction } from "../eval/driver.js";
import type { FdpmMcpSession } from "../eval/mcp-client.js";
import { gitSnapshot } from "./checks/repo.js";
import type { AgentModel, GrantModel, StageModel } from "./pipeline.js";

export interface StageRun {
  stage: StageModel;
  iteration: number;
  attempt: number;
  systemPrompt: string;
  taskPrompt: string;
  bindings: Readonly<Record<string, unknown>>;
  /** The delegation mode selected for this run, when the stage has modes. */
  mode?: string;
  /** Absolute deadline (epoch ms) the driver must respect. */
  deadlineAt: number;
}

export interface StageRunResult {
  outputText: string;
  usage: { input_tokens: number; output_tokens: number };
  modelCalls: number;
  costUsd?: number;
  /** Facts captured around the run, handed to named validators as `ctx.evidence`. */
  evidence: Record<string, unknown>;
  /** A driver-level failure that is not the model's output (spawn error, timeout). */
  error?: string;
}

export interface StageDriver {
  readonly kind: string;
  run(run: StageRun): Promise<StageRunResult>;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

// ── Scripted ───────────────────────────────────────────────────────────────

export type Script = (run: StageRun) => string | { outputText: string; evidence?: Record<string, unknown>; error?: string };

export class ScriptedDriver implements StageDriver {
  readonly kind = "scripted";
  readonly runs: StageRun[] = [];
  constructor(private readonly script: Script) {}
  async run(run: StageRun): Promise<StageRunResult> {
    this.runs.push(run);
    const out = this.script(run);
    const result = typeof out === "string" ? { outputText: out } : out;
    const base: StageRunResult = {
      outputText: result.outputText,
      usage: { input_tokens: run.taskPrompt.length, output_tokens: result.outputText.length },
      modelCalls: 1,
      evidence: result.evidence ?? {},
    };
    return result.error === undefined ? base : { ...base, error: result.error };
  }
}

// ── Codex wrapper ──────────────────────────────────────────────────────────

export interface CodexWrapperOptions {
  wrapperPath: string;
  /** Directory the order files are written to (the repository's _tmp/). */
  scratchDir: string;
  /** Binding name that carries the repository path the delegation runs in. */
  repoBinding?: string;
  /** Binding name that carries the mode, when the stage's mode is not fixed. */
  modeBinding?: string;
  /** A pipeline whose stages carry no repository binding runs every delegation here. */
  fixedRepo?: string;
  /** A pipeline whose stages carry no mode binding runs every delegation in this mode. */
  fixedMode?: string;
  /**
   * Hand the stage the envelope's `return` payload rather than the envelope.
   * The codex-delegation pipeline's contracts are written over the envelope
   * `{mode, validated, return}`; the frontier-proof loop's are written over
   * the raw attempt payload. The wrapper's own verdict is kept as evidence
   * either way, and the executor re-validates whatever it is handed.
   */
  unwrapEnvelope?: boolean;
  model?: string;
  effort?: string;
  spawn?: typeof spawn;
}

/**
 * Write the rendered task prompt as the work order, run the wrapper, and hand
 * back the validated envelope it printed — or its stderr, when it refused.
 * Git snapshots are captured here as evidence so `cdel.no_git_mutation` in
 * the executor compares what this process saw, not what the wrapper reported.
 */
export class CodexWrapperDriver implements StageDriver {
  readonly kind = "codex-wrapper";
  constructor(private readonly opts: CodexWrapperOptions) {}

  async run(run: StageRun): Promise<StageRunResult> {
    const repo = String(run.bindings[this.opts.repoBinding ?? "repo_path"] ?? this.opts.fixedRepo ?? "");
    const mode = run.mode ?? String(run.bindings[this.opts.modeBinding ?? "mode"] ?? this.opts.fixedMode ?? "");
    if (repo === "" || mode === "") {
      return { outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 0, evidence: {}, error: "codex driver needs a repository path and a mode binding" };
    }
    mkdirSync(this.opts.scratchDir, { recursive: true });
    const stamp = `${Date.now()}-${run.stage.name}-i${run.iteration}-a${run.attempt}`;
    const orderPath = join(this.opts.scratchDir, `${stamp}.order.md`);
    const outPath = join(this.opts.scratchDir, `${stamp}.envelope.json`);
    writeFileSync(orderPath, run.taskPrompt, "utf8");

    const args = ["--repo", repo, "--mode", mode, "--prompt-file", orderPath, "--output", outPath];
    if (this.opts.model) args.push("--model", this.opts.model);
    if (this.opts.effort) args.push("--effort", this.opts.effort);

    const before = gitSnapshot(repo);
    const started = Date.now();
    const { code, stdout, stderr, timedOut } = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolveRun) => {
      const child = (this.opts.spawn ?? spawn)(this.opts.wrapperPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      let timedOut = false;
      const remaining = Math.max(1_000, run.deadlineAt - Date.now());
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, remaining);
      child.stdout?.on("data", (c: Buffer) => (out += c.toString()));
      child.stderr?.on("data", (c: Buffer) => (err += c.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolveRun({ code: null, stdout: out, stderr: `${err}\n${e.message}`, timedOut });
      });
      child.on("close", (c) => {
        clearTimeout(timer);
        resolveRun({ code: c, stdout: out, stderr: err, timedOut });
      });
    });
    const after = gitSnapshot(repo);
    // The wrapper's stderr carries its boundary verdict when it refuses a
    // return; a digest alone leaves a rejected attempt undiagnosable.
    const stderrPath = join(this.opts.scratchDir, `${stamp}.wrapper.err`);
    writeFileSync(stderrPath, stderr, "utf8");
    const evidence: Record<string, unknown> = {
      git_before: before,
      git_after: after,
      wrapper_exit_code: code,
      wrapper_stderr_path: stderrPath,
      wrapper_stderr_tail: stderr.slice(-2_000),
      order_path: orderPath,
      envelope_path: outPath,
      duration_ms: Date.now() - started,
    };
    if (timedOut) return { outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 1, evidence, error: "delegation exceeded the stage deadline" };
    if (code !== 0) {
      // The wrapper refused at its boundary. Its stderr is the failure list;
      // returning it as the output guarantees the contract rejects it and
      // the executor records a failed attempt with the reason attached.
      return { outputText: stderr.trim(), usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 1, evidence, error: `wrapper exited ${code}` };
    }
    const envelopePath = stdout.trim().split("\n").pop() ?? outPath;
    let envelope = "";
    try {
      envelope = readFileSync(envelopePath, "utf8");
    } catch (e) {
      return { outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 1, evidence, error: `wrapper printed no readable envelope: ${e instanceof Error ? e.message : String(e)}` };
    }
    const handed = unwrapWrapperEnvelope(envelope, this.opts.unwrapEnvelope === true);
    Object.assign(evidence, handed.evidence);
    return { outputText: handed.outputText, usage: { input_tokens: run.taskPrompt.length, output_tokens: handed.outputText.length }, modelCalls: 1, evidence, ...(handed.error !== undefined ? { error: handed.error } : {}) };
  }
}

/**
 * What the stage is handed from a wrapper envelope. With `unwrap`, the
 * `return` payload is handed over and the envelope's mode and verdict are
 * kept as evidence; without it, the envelope itself is. An envelope that does
 * not parse, or that does not say `validated: true`, is a driver error rather
 * than output — the wrapper never writes such a file, so one is a broken run.
 */
export function unwrapWrapperEnvelope(envelopeText: string, unwrap: boolean): { outputText: string; evidence: Record<string, unknown>; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeText);
  } catch {
    return { outputText: envelopeText, evidence: {}, error: "wrapper envelope is not JSON" };
  }
  const env = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  if (!env || env["validated"] !== true || typeof env["mode"] !== "string" || !("return" in env)) {
    return { outputText: envelopeText, evidence: {}, error: "wrapper envelope lacks mode, validated:true or return" };
  }
  const evidence = { wrapper_mode: env["mode"], wrapper_validated: true, envelope_digest: sha256(envelopeText) };
  return unwrap ? { outputText: JSON.stringify(env["return"]), evidence } : { outputText: envelopeText, evidence };
}

// ── Anthropic ──────────────────────────────────────────────────────────────

/** How the operator answers approval requests. Default: nothing is approved. */
export interface ApprovalPolicy {
  /** Grant ids approved for the whole run (satisfies `per_run`). */
  perRun: ReadonlySet<string>;
  /** Called for every `per_action` call; resolves true to allow. */
  perAction: (grant: GrantModel, toolName: string, input: Record<string, unknown>) => Promise<boolean>;
}

export const DENY_ALL: ApprovalPolicy = { perRun: new Set(), perAction: async () => false };

/** lf:ToolGrant.tool_name is dotted (`fdpm.primitive.get`); the MCP server exposes underscores. */
export const mcpToolName = (grantToolName: string): string => grantToolName.replace(/\./g, "_");

export interface AnthropicDriverOptions {
  client: ModelClient;
  session: FdpmMcpSession;
  approvals?: ApprovalPolicy;
  bounds?: Partial<DriveBounds>;
  /** Called after every stage run with the full transcript, for the receipt's evidence. */
  onTranscript?: (run: StageRun, transcript: DriveTranscript) => void;
}

interface ServerTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/**
 * The agent sees exactly the tools its grants name — a grant that names a
 * tool the server does not expose is a load-time error, not a silently
 * missing tool — and every call is checked against the grant's approval
 * before it reaches the server.
 */
export class AnthropicDriver implements StageDriver {
  readonly kind = "anthropic";
  private tools?: ServerTool[];
  readonly denials: Array<{ stage: string; tool: string; reason: string }> = [];

  constructor(private readonly opts: AnthropicDriverOptions) {}

  private async serverTools(): Promise<ServerTool[]> {
    if (!this.tools) {
      const surface = await this.opts.session.surface();
      this.tools = surface.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    }
    return this.tools;
  }

  async surfaceFor(agent: AgentModel): Promise<{ tools: ServerTool[]; grantByTool: Map<string, GrantModel> }> {
    const available = new Map((await this.serverTools()).map((t) => [t.name, t]));
    const tools: ServerTool[] = [];
    const grantByTool = new Map<string, GrantModel>();
    for (const grant of agent.grants) {
      const name = mcpToolName(grant.tool_name);
      const tool = available.get(name);
      if (!tool) throw new Error(`${agent.id} is granted ${grant.tool_name}, but the fdpm MCP server exposes no tool named ${name}`);
      tools.push(tool);
      grantByTool.set(name, grant);
    }
    return { tools, grantByTool };
  }

  async run(run: StageRun): Promise<StageRunResult> {
    const { tools, grantByTool } = await this.surfaceFor(run.stage.agent);
    const approvals = this.opts.approvals ?? DENY_ALL;
    const denials = this.denials;
    const execute: ToolExecutor = async (name, input): Promise<ToolExecutionResult> => {
      const grant = grantByTool.get(name);
      if (!grant) return { text: `tool ${name} is not granted to this agent`, is_error: true };
      if (grant.approval === "per_run" && !approvals.perRun.has(grant.id)) {
        denials.push({ stage: run.stage.name, tool: name, reason: "per_run grant not approved for this run" });
        return { text: `${name} requires per-run approval (${grant.id}) and none was given; stop with approval_required if the task needs it`, is_error: true };
      }
      if (grant.approval === "per_action" && !(await approvals.perAction(grant, name, input))) {
        denials.push({ stage: run.stage.name, tool: name, reason: "per_action call denied" });
        return { text: `${name} requires per-action approval and it was denied; stop with approval_required if the task needs it`, is_error: true };
      }
      const outcome = await this.opts.session.callTool(name, input);
      return { text: JSON.stringify(outcome.structured ?? outcome), is_error: outcome.is_error || !outcome.ok };
    };

    const transcript = await driveInstruction({
      model: this.opts.client,
      surface: {
        arm: "tools",
        system: run.systemPrompt,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? "",
          // Every MCP tool schema is an object schema; the driver's type pins that rather than trusting the server's JSON.
          input_schema: { ...(t.inputSchema as Record<string, unknown>), type: "object" as const },
        })),
        server_tool_names: new Set(tools.map((t) => t.name)),
      },
      instruction: run.taskPrompt,
      execute,
      bounds: {
        ...this.opts.bounds,
        max_wall_ms: Math.max(1_000, Math.min(this.opts.bounds?.max_wall_ms ?? Number.MAX_SAFE_INTEGER, run.deadlineAt - Date.now())),
        max_tokens_per_turn: run.stage.agent.max_output_tokens,
      },
    });
    this.opts.onTranscript?.(run, transcript);
    const evidence: Record<string, unknown> = {
      terminal: transcript.terminal,
      turns: transcript.turns,
      tool_calls: transcript.tool_calls.length,
      denials: denials.filter((d) => d.stage === run.stage.name).length,
      api_errors: transcript.api_errors,
    };
    const result: StageRunResult = {
      outputText: transcript.final_text,
      usage: { input_tokens: transcript.usage.input_tokens, output_tokens: transcript.usage.output_tokens },
      modelCalls: transcript.turns,
      evidence,
    };
    if (transcript.terminal !== "end_turn" && transcript.terminal !== "stop_sequence") result.error = `model loop ended by ${transcript.terminal}`;
    return result;
  }
}
