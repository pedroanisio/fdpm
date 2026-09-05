/**
 * Run a loop-forward pipeline from a workbook to a terminal state and write
 * its lf:RunReceipt.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 *   npx tsx scripts/run-loop-forward.ts \
 *     --workbook codex-delegation --pipeline lf:pipeline:cdel-codex-delegation \
 *     --input repo_path=/abs/repo --input mode=research --input goal="..." \
 *     --input context_files='["src/x.ts"]' --input constraints="" --input proof_command="npm test" \
 *     [--data-dir DIR] [--repo-root DIR] [--receipt-slug SLUG] \
 *     [--orchestrator anthropic|file] [--anthropic-model ID] [--effort low|medium|high|xhigh|max] \
 *     [--codex-model ID] [--codex-effort E] \
 *     [--approve-per-run GRANT_ID]... [--approve-per-action] \
 *     [--print-model] [--dry-run]
 *
 * Drivers are chosen by the agent's provider: `openai` runs through
 * scripts/codex-delegate.sh; `anthropic` runs a bounded tool-use loop against
 * a freshly spawned fdpm MCP server on the same data dir (needs
 * ANTHROPIC_API_KEY), or — with --orchestrator file — exchanges prompt and
 * output files under _tmp/loop-forward/ so an interactive agent session can
 * be the orchestrator by hand.
 *
 * Approvals are the operator's: a `per_run` grant is exercisable only when
 * named with --approve-per-run; a `per_action` grant prompts on a TTY when
 * --approve-per-action is given and is denied otherwise. Nothing here can
 * approve itself.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SCOPE_ID as LF_SCOPE } from "../plugins/loop_forward/ids.js";
import { SCOPE_ID as SA_SCOPE } from "../plugins/silent_acceptance/ids.js";
import { anthropicModelClient, type Effort } from "../src/eval/driver.js";
import { spawnFdpmMcp } from "../src/eval/mcp-client.js";
import { AnthropicDriver, CodexWrapperDriver, DENY_ALL, type ApprovalPolicy, type StageDriver, type StageRun, type StageRunResult } from "../src/loop/drivers.js";
import { runPipeline, type RunOutcome } from "../src/loop/executor.js";
import { productionIO } from "../src/loop/named.js";
import { loadPipeline } from "../src/loop/pipeline.js";
import { openHost } from "../src/sdk.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, "..");
const REPO_ROOT_DEFAULT = resolve(PACKAGE_ROOT, "..");
const WRAPPER = join(here, "codex-delegate.sh");
const LEAN_PROJECT = join(here, "frontier-proof-loop", "fplproofs");

/** Profile-specific wiring the executor cannot infer from loop-forward alone. */
const PROFILE_WIRING: Record<string, { modeRelationType?: string; submissionEdgeType?: string; modeBinding?: string; driverConsumed: string[]; codexFixedMode?: string; codexUnwrapEnvelope?: boolean }> = {
  "profile:codex-delegation": { modeRelationType: "cdel:StageRunsInMode", submissionEdgeType: "cdel:ReceiptSubmitted", modeBinding: "mode", driverConsumed: ["repo_path", "mode"] },
  // The frontier loop's stages carry no repository or mode binding: every
  // solver call is an attempt-mode delegation against the repository root.
  // Its attempt contract is written over the raw attempt payload, so the wrapper envelope is unwrapped.
  "profile:frontier-proof-loop": { submissionEdgeType: "fpl:ReceiptSubmitted", driverConsumed: [], codexFixedMode: "attempt", codexUnwrapEnvelope: true },
};

interface Args {
  workbook: string;
  pipeline: string;
  inputs: Record<string, unknown>;
  dataDir?: string;
  repoRoot: string;
  receiptSlug?: string;
  orchestrator: "anthropic" | "file";
  anthropicModel: string;
  effort?: Effort;
  codexModel?: string;
  codexEffort?: string;
  approvePerRun: Set<string>;
  approvePerAction: boolean;
  printModel: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    workbook: "",
    pipeline: "",
    inputs: {},
    repoRoot: REPO_ROOT_DEFAULT,
    orchestrator: "anthropic",
    anthropicModel: "claude-fable-5-1",
    approvePerRun: new Set(),
    approvePerAction: false,
    printModel: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      i += 1;
      return v;
    };
    switch (flag) {
      case "--workbook": args.workbook = next(); break;
      case "--pipeline": args.pipeline = next(); break;
      case "--data-dir": args.dataDir = next(); break;
      case "--repo-root": args.repoRoot = resolve(next()); break;
      case "--receipt-slug": args.receiptSlug = next(); break;
      case "--orchestrator": {
        const v = next();
        if (v !== "anthropic" && v !== "file") throw new Error("--orchestrator must be anthropic or file");
        args.orchestrator = v;
        break;
      }
      case "--anthropic-model": args.anthropicModel = next(); break;
      case "--effort": args.effort = next() as Effort; break;
      case "--codex-model": args.codexModel = next(); break;
      case "--codex-effort": args.codexEffort = next(); break;
      case "--approve-per-run": args.approvePerRun.add(next()); break;
      case "--approve-per-action": args.approvePerAction = true; break;
      case "--print-model": args.printModel = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--input": {
        const kv = next();
        const eq = kv.indexOf("=");
        if (eq === -1) throw new Error(`--input expects name=value, got ${JSON.stringify(kv)}`);
        const name = kv.slice(0, eq);
        const raw = kv.slice(eq + 1);
        // JSON when it parses as JSON, else the literal string.
        try {
          args.inputs[name] = raw.startsWith("[") || raw.startsWith("{") || raw === "true" || raw === "false" || /^-?\d+(\.\d+)?$/.test(raw) ? JSON.parse(raw) : raw;
        } catch {
          args.inputs[name] = raw;
        }
        break;
      }
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  if (!args.workbook || !args.pipeline) throw new Error("--workbook and --pipeline are required");
  return args;
}

/**
 * The orchestrator by hand: the prompt is written to a file, and the driver
 * waits for the operator (or an interactive agent session) to write the
 * output file next to it. The deadline is the stage's.
 */
class FileExchangeDriver implements StageDriver {
  readonly kind = "file-exchange";
  constructor(private readonly dir: string) {}
  async run(run: StageRun): Promise<StageRunResult> {
    mkdirSync(this.dir, { recursive: true });
    const base = join(this.dir, `${run.stage.name}.i${run.iteration}.a${run.attempt}`);
    const promptPath = `${base}.prompt.md`;
    const outputPath = `${base}.output.json`;
    rmSync(outputPath, { force: true });
    writeFileSync(promptPath, `# SYSTEM\n\n${run.systemPrompt}\n\n# TASK\n\n${run.taskPrompt}\n\n# WRITE YOUR OUTPUT TO\n\n${outputPath}\n`, "utf8");
    process.stderr.write(`[file-exchange] prompt at ${promptPath}; waiting for ${outputPath}\n`);
    const started = Date.now();
    while (Date.now() < run.deadlineAt) {
      if (existsSync(outputPath)) {
        const text = readFileSync(outputPath, "utf8");
        return { outputText: text, usage: { input_tokens: run.taskPrompt.length, output_tokens: text.length }, modelCalls: 1, evidence: { prompt_path: promptPath, output_path: outputPath, waited_ms: Date.now() - started } };
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    return { outputText: "", usage: { input_tokens: 0, output_tokens: 0 }, modelCalls: 0, evidence: { prompt_path: promptPath }, error: "no output file appeared before the stage deadline" };
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const host = await openHost(args.dataDir === undefined ? {} : { dataDir: args.dataDir });
  const profileId = host.getProject(args.workbook).workbook.profile_id;
  const wiringKey = Object.keys(PROFILE_WIRING).find((k) => profileId.startsWith(k));
  const wiring = wiringKey === undefined ? { driverConsumed: [] as string[] } : PROFILE_WIRING[wiringKey]!;

  if (args.printModel) {
    const model = loadPipeline(host, args.workbook, args.pipeline, wiring.modeRelationType === undefined ? {} : { modeRelationType: wiring.modeRelationType });
    process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);
    return 0;
  }

  const scratch = join(args.repoRoot, "_tmp", "loop-forward");
  mkdirSync(scratch, { recursive: true });

  const approvals: ApprovalPolicy = {
    perRun: args.approvePerRun,
    perAction: async (grant, tool, input) => {
      if (!args.approvePerAction || !process.stdin.isTTY) return false;
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        const answer = await rl.question(`approve ${tool} (${grant.id})? ${JSON.stringify(input).slice(0, 300)} [y/N] `);
        return /^y(es)?$/i.test(answer.trim());
      } finally {
        rl.close();
      }
    },
  };

  let session: Awaited<ReturnType<typeof spawnFdpmMcp>> | undefined;
  const drivers = new Map<string, StageDriver>();
  const driverFor = (provider: string): StageDriver => {
    const cached = drivers.get(provider);
    if (cached) return cached;
    let driver: StageDriver;
    if (provider === "openai") {
      driver = new CodexWrapperDriver({
        wrapperPath: WRAPPER,
        scratchDir: join(scratch, "codex"),
        ...(wiring.codexFixedMode ? { fixedMode: wiring.codexFixedMode, fixedRepo: args.repoRoot } : {}),
        ...(wiring.codexUnwrapEnvelope ? { unwrapEnvelope: true } : {}),
        ...(args.codexModel ? { model: args.codexModel } : {}),
        ...(args.codexEffort ? { effort: args.codexEffort } : {}),
      });
    } else if (args.orchestrator === "file") {
      driver = new FileExchangeDriver(join(scratch, "exchange"));
    } else {
      if (!process.env["ANTHROPIC_API_KEY"]) throw new Error("ANTHROPIC_API_KEY is not set; use --orchestrator file to run the orchestrator stages by hand");
      if (!session) throw new Error("mcp session not open");
      driver = new AnthropicDriver({
        client: anthropicModelClient({ model: args.anthropicModel, ...(args.effort ? { effort: args.effort } : {}) }),
        session,
        approvals: args.approvePerRun.size === 0 && !args.approvePerAction ? DENY_ALL : approvals,
      });
    }
    drivers.set(provider, driver);
    return driver;
  };

  if (args.dryRun) {
    const model = loadPipeline(host, args.workbook, args.pipeline, wiring.modeRelationType === undefined ? {} : { modeRelationType: wiring.modeRelationType });
    process.stdout.write(`pipeline ${model.id} v${model.version}: ${model.stages.length} stages, max ${model.loop.max_iterations} iterations, ${model.loop.max_model_calls} model calls\n`);
    for (const s of model.stages) process.stdout.write(`  ${s.position} ${s.name} → ${s.agent.provider} (${s.agent.grants.length} grants, ${s.contract.validators.length} validators, on_invalid=${s.contract.on_invalid})\n`);
    return 0;
  }

  const needsAnthropic = args.orchestrator === "anthropic" && loadPipeline(host, args.workbook, args.pipeline).agents.some((a) => a.provider === "anthropic");
  if (needsAnthropic) {
    if (host.dataDir === null) throw new Error("the anthropic driver needs a persistent data dir to spawn the MCP server against");
    session = await spawnFdpmMcp({ dataDir: host.dataDir, clientName: "fdpm-loop-forward" });
  }

  let outcome: RunOutcome;
  try {
    outcome = await runPipeline({
      host,
      workbookId: args.workbook,
      pipelineId: args.pipeline,
      inputs: args.inputs,
      driverFor: (stage) => driverFor(stage.agent.provider),
      io: productionIO(existsSync(LEAN_PROJECT) ? { leanProjectDir: LEAN_PROJECT } : {}),
      repoRoot: args.repoRoot,
      ...(wiring.modeRelationType ? { modeRelationType: wiring.modeRelationType } : {}),
      ...(wiring.modeBinding ? { modeBinding: wiring.modeBinding } : {}),
      driverConsumedBindings: wiring.driverConsumed,
      // By-hand orchestrator stages write through the MCP server, not through
      // this process's host; reload the projection before each contract is
      // judged so store-reading validators see what was actually written.
      ...(args.orchestrator === "file" ? { refreshBeforeValidate: async () => { await host.reload(); } } : {}),
      receipt: {
        receiptScope: LF_SCOPE,
        submissionScope: SA_SCOPE,
        ...(wiring.submissionEdgeType ? { submissionEdgeType: wiring.submissionEdgeType } : {}),
        ...(args.receiptSlug ? { receiptSlug: args.receiptSlug } : {}),
      },
      log: (line) => process.stderr.write(`${line}\n`),
    });
  } finally {
    await session?.close();
  }
  process.stdout.write(`${JSON.stringify({ terminal_state: outcome.terminal_state, reason: outcome.reason, iterations: outcome.iterations, model_calls: outcome.model_calls, receipt_id: outcome.receipt_id, final_output: outcome.final_output ?? null, records: outcome.records.map((r) => ({ iteration: r.iteration, stage: r.stage, attempt: r.attempt, accepted: r.accepted, failures: r.failures })) }, null, 2)}\n`);
  return outcome.terminal_state === "success" ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 2;
    });
}
