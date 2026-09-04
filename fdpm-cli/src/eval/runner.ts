/**
 * The runner — one instruction, one fresh data directory, one server, one
 * agent session, one score. Repeated per arm.
 *
 * Two drivers share the pipeline. The Anthropic driver puts a model in the
 * loop and is the measurement. The reference driver replays the
 * instruction's `reference_solution` through the same server and scorer;
 * it is the test set's self-check (every reference must pass all four
 * criteria) and the source of the verb baseline. A test set whose
 * references do not pass has no business grading a model.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ARMS, ARM_IDS, buildToolSurface, type ArmId } from "./arms.js";
import {
  DEFAULT_BOUNDS,
  anthropicModelClient,
  driveInstruction,
  type DriveBounds,
  type DriveTranscript,
  type Effort,
  type ModelClient,
} from "./driver.js";
import { makeExecutor, spawnFdpmMcp, type FdpmMcpSession, type ServerLaunch } from "./mcp-client.js";
import {
  buildDifferentialReport,
  type DifferentialReport,
  type InstructionRunResult,
} from "./report.js";
import { baselineWrites, type EvalCategory, type EvalInstruction, type EvalTestSet, type ToolCall } from "./schema.js";
import {
  canonicalJson,
  collectScoreInputs,
  countAuditLines,
  openScoringHost,
  scoreInstruction,
  type InstructionScore,
} from "./score.js";

export type DriverConfig =
  | { kind: "anthropic"; model: string; effort?: Effort }
  | { kind: "reference" }
  | { kind: "model"; client: ModelClient };

export interface RunFilter {
  ids?: string[];
  categories?: EvalCategory[];
  limit?: number;
}

export interface RunConfig {
  testSet: EvalTestSet;
  arms?: ArmId[];
  driver: DriverConfig;
  /** Receipt, report and transcripts are written here. */
  outDir: string;
  /** Parent of the per-instruction data directories (default: OS temp). */
  workDir?: string;
  bounds?: Partial<DriveBounds>;
  filter?: RunFilter;
  keepData?: boolean;
  launch?: ServerLaunch;
  log?: (line: string) => void;
  threshold_pp?: number;
  acceptable_rate?: number;
  runId?: string;
  now?: () => number;
}

export interface RunReceipt {
  run_id: string;
  started_at: string;
  finished_at: string;
  driver: string;
  model: string;
  arms: ArmId[];
  bounds: DriveBounds;
  test_set: { id: string; title: string; instructions: number; sha256: string };
  results: InstructionRunResult[];
  report: DifferentialReport;
}

export class SetupError extends Error {
  constructor(
    readonly call: ToolCall,
    readonly outcome: unknown,
  ) {
    super(`setup call ${call.tool} was not accepted: ${JSON.stringify(outcome).slice(0, 600)}`);
    this.name = "SetupError";
  }
}

export function testSetDigest(set: EvalTestSet): string {
  return createHash("sha256").update(canonicalJson(set)).digest("hex");
}

export function selectInstructions(set: EvalTestSet, filter: RunFilter | undefined): EvalInstruction[] {
  let out = set.instructions;
  if (filter?.ids !== undefined) {
    const wanted = new Set(filter.ids);
    out = out.filter((i) => wanted.has(i.id));
  }
  if (filter?.categories !== undefined) {
    const wanted = new Set(filter.categories);
    out = out.filter((i) => wanted.has(i.category));
  }
  if (filter?.limit !== undefined) out = out.slice(0, filter.limit);
  return out;
}

function makeRunId(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

// ── Fixture ──────────────────────────────────────────────────────────

export interface Fixture {
  setup_revision: number;
  audit_from: number;
}

const LogTail = { ops: [] as Array<{ revision: number }> };

/**
 * Execute the instruction's setup through the server; every call must be
 * accepted. Records the workbook revision and the audit offset the agent
 * phase starts at.
 */
export async function prepareFixture(session: FdpmMcpSession, instruction: EvalInstruction): Promise<Fixture> {
  for (const call of instruction.setup) {
    const outcome = await session.callTool(call.tool, call.args);
    if (!outcome.ok) throw new SetupError(call, outcome.structured);
  }
  let setup_revision = 0;
  if (instruction.setup.length > 0) {
    const tail = await session.callTool("fdpm.log.tail", { workbook_id: instruction.workbook_id, limit: 1 });
    const ops = (tail.structured as typeof LogTail | undefined)?.ops;
    const last = Array.isArray(ops) && ops.length > 0 ? ops[ops.length - 1] : undefined;
    if (last === undefined || typeof last.revision !== "number") {
      throw new SetupError(
        { tool: "fdpm.log.tail", args: { workbook_id: instruction.workbook_id, limit: 1 } },
        tail.structured,
      );
    }
    setup_revision = last.revision;
  }
  return { setup_revision, audit_from: countAuditLines(session.dataDir) };
}

// ── Reference driver ─────────────────────────────────────────────────

export interface ReferenceOutcome {
  transcript: DriveTranscript;
  /** Calls the server did not accept; a non-empty list means the reference is wrong. */
  rejected: Array<{ call: ToolCall; text: string }>;
}

export async function executeReference(session: FdpmMcpSession, instruction: EvalInstruction): Promise<ReferenceOutcome> {
  const started = Date.now();
  const transcript: DriveTranscript = {
    model: "reference",
    turns: 0,
    tool_calls: [],
    terminal: "end_turn",
    final_text: "",
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    api_errors: [],
    wall_ms: 0,
  };
  const rejected: ReferenceOutcome["rejected"] = [];
  for (const call of instruction.reference_solution) {
    const t0 = Date.now();
    const outcome = await session.callTool(call.tool, call.args);
    transcript.tool_calls.push({
      turn: 0,
      name: call.tool,
      input: call.args,
      accepted: true,
      is_error: !outcome.ok,
      result_excerpt: outcome.text.slice(0, 400),
      duration_ms: Date.now() - t0,
    });
    if (!outcome.ok) rejected.push({ call, text: outcome.text.slice(0, 600) });
  }
  transcript.wall_ms = Date.now() - started;
  return { transcript, rejected };
}

// ── One instruction ──────────────────────────────────────────────────

interface InstructionContext {
  arm: ArmId;
  instruction: EvalInstruction;
  driver: DriverConfig;
  modelClient: ModelClient | null;
  bounds: DriveBounds;
  workDir: string;
  keepData: boolean;
  launch?: ServerLaunch;
  log: (line: string) => void;
}

function baseResult(ctx: InstructionContext): InstructionRunResult {
  return {
    arm: ctx.arm,
    instruction_id: ctx.instruction.id,
    category: ctx.instruction.category,
    status: "scored",
    score: null,
    error: null,
    transcript: {
      terminal: null,
      turns: 0,
      tool_calls: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      wall_ms: 0,
    },
    error_classes: {},
  };
}

export interface InstructionOutcome {
  result: InstructionRunResult;
  transcript: DriveTranscript | null;
  score: InstructionScore | null;
}

async function runOne(ctx: InstructionContext): Promise<InstructionOutcome> {
  const result = baseResult(ctx);
  const dataDir = mkdtempSync(join(ctx.workDir, `${ctx.instruction.id}-${ctx.arm}-`));
  let session: FdpmMcpSession | null = null;
  let transcript: DriveTranscript | null = null;
  let fixture: Fixture | null = null;
  try {
    session = await spawnFdpmMcp({ dataDir, ...(ctx.launch && { launch: ctx.launch }) });
    try {
      fixture = await prepareFixture(session, ctx.instruction);
    } catch (err) {
      result.status = "invalid_setup";
      result.error = err instanceof Error ? err.message : String(err);
      return { result, transcript: null, score: null };
    }

    if (ctx.driver.kind === "reference") {
      const ref = await executeReference(session, ctx.instruction);
      transcript = ref.transcript;
      if (ref.rejected.length > 0) {
        result.error = `reference solution rejected: ${ref.rejected.map((r) => `${r.call.tool} → ${r.text}`).join(" | ")}`;
      }
    } else {
      const surface = buildToolSurface(ARMS[ctx.arm], await session.surface());
      transcript = await driveInstruction({
        model: ctx.modelClient!,
        surface,
        instruction: ctx.instruction.instruction,
        execute: makeExecutor(session, surface),
        bounds: ctx.bounds,
      });
      if (transcript.terminal === "api_error") {
        result.status = "driver_error";
        result.error = transcript.api_errors.join(" | ");
      }
    }
  } catch (err) {
    result.status = "driver_error";
    result.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    if (session !== null) {
      try {
        await session.close();
      } catch {
        // the child is gone either way
      }
    }
  }

  if (transcript !== null) {
    result.transcript = {
      terminal: transcript.terminal,
      turns: transcript.turns,
      tool_calls: transcript.tool_calls.length,
      usage: transcript.usage,
      wall_ms: transcript.wall_ms,
    };
  }

  let score: InstructionScore | null = null;
  if (fixture !== null && result.status !== "invalid_setup") {
    const host = await openScoringHost(dataDir);
    try {
      const inputs = collectScoreInputs({
        host,
        dataDir,
        instruction: ctx.instruction,
        setup_revision: fixture.setup_revision,
        audit_from: fixture.audit_from,
      });
      score = scoreInstruction(inputs);
      result.error_classes = score.error_classes;
      // A driver error is still scored (the state is what it is), but the
      // status keeps the cause visible in the report.
      result.score = score;
    } finally {
      await host.close();
    }
  }
  if (!ctx.keepData) rmSync(dataDir, { recursive: true, force: true });
  return { result, transcript, score };
}

// ── The run ──────────────────────────────────────────────────────────

async function makeModelClient(driver: DriverConfig): Promise<ModelClient | null> {
  switch (driver.kind) {
    case "reference":
      return null;
    case "model":
      return driver.client;
    case "anthropic": {
      const client = new Anthropic();
      // Preflight: credentials and the model id, without spending tokens.
      await client.models.retrieve(driver.model);
      return anthropicModelClient({ model: driver.model, client, ...(driver.effort && { effort: driver.effort }) });
    }
  }
}

function driverLabel(driver: DriverConfig): { driver: string; model: string } {
  switch (driver.kind) {
    case "reference":
      return { driver: "reference", model: "reference" };
    case "model":
      return { driver: "model", model: driver.client.model };
    case "anthropic":
      return { driver: "anthropic", model: driver.model };
  }
}

export async function runEval(config: RunConfig): Promise<RunReceipt> {
  const now = config.now ?? (() => Date.now());
  const log = config.log ?? (() => {});
  const arms = config.arms ?? [...ARM_IDS];
  const bounds: DriveBounds = { ...DEFAULT_BOUNDS, ...config.bounds };
  const runId = config.runId ?? makeRunId(now());
  const startedAt = new Date(now()).toISOString();
  const instructions = selectInstructions(config.testSet, config.filter);
  const workDir = config.workDir ?? mkdtempSync(join(tmpdir(), "fdpm-cold-agent-eval-"));
  mkdirSync(workDir, { recursive: true });
  mkdirSync(join(config.outDir, "transcripts"), { recursive: true });
  const modelClient = await makeModelClient(config.driver);
  const label = driverLabel(config.driver);

  log(`run ${runId}: ${instructions.length} instruction(s) × ${arms.length} arm(s), driver ${label.driver} (${label.model})`);
  const results: InstructionRunResult[] = [];
  for (const arm of arms) {
    mkdirSync(join(config.outDir, "transcripts", arm), { recursive: true });
    for (const instruction of instructions) {
      const outcome = await runOne({
        arm,
        instruction,
        driver: config.driver,
        modelClient,
        bounds,
        workDir,
        keepData: config.keepData === true,
        ...(config.launch && { launch: config.launch }),
        log,
      });
      results.push(outcome.result);
      writeFileSync(
        join(config.outDir, "transcripts", arm, `${instruction.id}.json`),
        JSON.stringify(
          {
            arm,
            instruction_id: instruction.id,
            category: instruction.category,
            status: outcome.result.status,
            error: outcome.result.error,
            score: outcome.score,
            transcript: outcome.transcript,
          },
          null,
          2,
        ),
      );
      const verdict =
        outcome.result.status !== "scored"
          ? outcome.result.status
          : outcome.score?.passed
            ? "pass"
            : `FAIL (${outcome.score?.criteria.filter((c) => !c.passed).map((c) => c.id).join(",")})`;
      log(`  [${arm}] ${instruction.id} (${instruction.category}): ${verdict}`);
    }
  }

  const report = buildDifferentialReport(results, {
    model: label.model,
    test_set: { id: config.testSet.id, instructions: instructions.length },
    ...(config.threshold_pp !== undefined && { threshold_pp: config.threshold_pp }),
    ...(config.acceptable_rate !== undefined && { acceptable_rate: config.acceptable_rate }),
    now,
  });
  const receipt: RunReceipt = {
    run_id: runId,
    started_at: startedAt,
    finished_at: new Date(now()).toISOString(),
    driver: label.driver,
    model: label.model,
    arms,
    bounds,
    test_set: {
      id: config.testSet.id,
      title: config.testSet.title,
      instructions: instructions.length,
      sha256: testSetDigest(config.testSet),
    },
    results,
    report,
  };
  writeFileSync(join(config.outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  if (!config.keepData) rmSync(workDir, { recursive: true, force: true });
  return receipt;
}

// ── The reference suite: every instruction against one server ────────

export interface ReferenceSuiteOptions {
  workDir?: string;
  launch?: ServerLaunch;
  log?: (line: string) => void;
  filter?: RunFilter;
  keepData?: boolean;
}

export interface ReferenceSuiteResult {
  results: InstructionRunResult[];
  /** One line per instruction whose reference did not pass; empty means the set is sound. */
  failures: string[];
  dataDir: string;
}

/**
 * Validate the test set: run every fixture and reference solution through
 * one server (workbook ids are unique per instruction, so fixtures do not
 * interact), then score each from one Host. Cheap enough for the vitest
 * gate, and the only proof that an expectation is reachable at all.
 */
export async function runReferenceSuite(set: EvalTestSet, opts: ReferenceSuiteOptions = {}): Promise<ReferenceSuiteResult> {
  const log = opts.log ?? (() => {});
  const workDir = opts.workDir ?? mkdtempSync(join(tmpdir(), "fdpm-eval-reference-"));
  mkdirSync(workDir, { recursive: true });
  const dataDir = mkdtempSync(join(workDir, "reference-"));
  const instructions = selectInstructions(set, opts.filter);
  const session = await spawnFdpmMcp({ dataDir, ...(opts.launch && { launch: opts.launch }), clientName: "fdpm-eval-reference" });

  type Pending = { instruction: EvalInstruction; result: InstructionRunResult; fixture: Fixture | null; audit_to: number };
  const pending: Pending[] = [];
  try {
    for (const instruction of instructions) {
      const ctx: InstructionContext = {
        arm: "tools_discovery_prompts",
        instruction,
        driver: { kind: "reference" },
        modelClient: null,
        bounds: DEFAULT_BOUNDS,
        workDir,
        keepData: true,
        log,
      };
      const result = baseResult(ctx);
      let fixture: Fixture | null = null;
      try {
        fixture = await prepareFixture(session, instruction);
        const ref = await executeReference(session, instruction);
        result.transcript = {
          terminal: ref.transcript.terminal,
          turns: 0,
          tool_calls: ref.transcript.tool_calls.length,
          usage: ref.transcript.usage,
          wall_ms: ref.transcript.wall_ms,
        };
        if (ref.rejected.length > 0) {
          result.error = `reference solution rejected: ${ref.rejected.map((r) => `${r.call.tool} → ${r.text}`).join(" | ")}`;
        }
      } catch (err) {
        result.status = "invalid_setup";
        result.error = err instanceof Error ? err.message : String(err);
      }
      pending.push({ instruction, result, fixture, audit_to: countAuditLines(dataDir) });
    }
  } finally {
    await session.close();
  }

  const host = await openScoringHost(dataDir);
  const failures: string[] = [];
  try {
    for (const p of pending) {
      if (p.fixture === null || p.result.status === "invalid_setup") {
        failures.push(`${p.instruction.id}: ${p.result.error ?? "setup failed"}`);
        continue;
      }
      const score = scoreInstruction(
        collectScoreInputs({
          host,
          dataDir,
          instruction: p.instruction,
          setup_revision: p.fixture.setup_revision,
          audit_from: p.fixture.audit_from,
          audit_to: p.audit_to,
        }),
      );
      p.result.score = score;
      p.result.error_classes = score.error_classes;
      const problems: string[] = [];
      if (p.result.error !== null) problems.push(p.result.error);
      for (const c of score.criteria) if (!c.passed) problems.push(`${c.id}: ${c.detail}`);
      if (score.metrics.writes !== baselineWrites(p.instruction)) {
        problems.push(`audit counted ${score.metrics.writes} write(s) but the reference declares ${baselineWrites(p.instruction)}`);
      }
      if (problems.length > 0) failures.push(`${p.instruction.id}: ${problems.join("; ")}`);
      log(`  reference ${p.instruction.id}: ${problems.length === 0 ? "pass" : "FAIL"}`);
    }
  } finally {
    await host.close();
  }
  if (opts.keepData !== true) rmSync(workDir, { recursive: true, force: true });
  return { results: pending.map((p) => p.result), failures, dataDir };
}
