#!/usr/bin/env tsx
/**
 * `run-cold-agent-eval` — the three-arm cold-agent eval, from the shell.
 *
 * VERIFICATION BOUNDARY REQUIRED (Silent Acceptance v2.0.0):
 * LLM error rates are non-negligible across realistic deployments.
 * Passing LLM output onward with no declared verification boundary is a
 * design defect, not a runtime bug. All LLM output must be treated as
 * untrusted and validated explicitly, per error class.
 *
 * This entry point only parses flags and calls `src/eval`; the boundary
 * itself is documented in `src/eval/driver.ts` and enforced in
 * `src/eval/score.ts`.
 *
 * Usage:
 *   npx tsx scripts/run-cold-agent-eval.ts --reference-suite
 *       Validate the test set: every fixture and reference solution must
 *       pass all four criteria against the real fdpm-mcp. No model, no cost.
 *
 *   npx tsx scripts/run-cold-agent-eval.ts --driver reference --arms tools --limit 3
 *       Smoke the full per-instruction pipeline without a model.
 *
 *   npx tsx scripts/run-cold-agent-eval.ts --model claude-opus-5
 *       The measurement: 50 instructions × 3 arms with the named model
 *       snapshot. Needs Anthropic credentials (ANTHROPIC_API_KEY or an
 *       `ant auth login` profile); spends tokens.
 *
 * Flags:
 *   --test-set <path>        default eval/cold-agent-v1.json
 *   --arms <a,b,c>           default tools,tools_discovery,tools_discovery_prompts
 *   --driver anthropic|reference   default anthropic
 *   --model <id>             default claude-opus-5 (anthropic driver)
 *   --effort low|medium|high|xhigh|max
 *   --out <dir>              default eval/runs/<run-id>
 *   --work-dir <dir>         parent of per-instruction data dirs (default OS temp)
 *   --ids a,b  --categories simple,refusal  --limit N
 *   --max-turns N  --max-tool-calls N  --max-wall-ms N
 *   --threshold-pp N         default 15   --acceptable-rate R   default 0.7
 *   --keep-data              keep the per-instruction data directories
 *   --json                   print the receipt instead of the markdown report
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARM_IDS, isArmId, type ArmId } from "../src/eval/arms.js";
import type { DriveBounds, Effort } from "../src/eval/driver.js";
import { renderReportMarkdown } from "../src/eval/report.js";
import { runEval, runReferenceSuite, type DriverConfig, type RunFilter } from "../src/eval/runner.js";
import { EVAL_CATEGORIES, parseTestSet, type EvalCategory } from "../src/eval/schema.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TEST_SET = join(PKG_ROOT, "eval", "cold-agent-v1.json");
const DEFAULT_MODEL = "claude-opus-5";
const EFFORTS: ReadonlyArray<Effort> = ["low", "medium", "high", "xhigh", "max"];

function usageError(message: string): never {
  process.stderr.write(`run-cold-agent-eval: ${message}\n`);
  process.exit(2);
}

function parseFlags(argv: readonly string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (!a.startsWith("--")) usageError(`unexpected argument ${a}`);
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i += 1;
    } else {
      flags.set(a.slice(2), true);
    }
  }
  return flags;
}

function str(flags: Map<string, string | true>, name: string): string | undefined {
  const v = flags.get(name);
  if (v === undefined) return undefined;
  if (v === true) usageError(`--${name} needs a value`);
  return v;
}

function int(flags: Map<string, string | true>, name: string): number | undefined {
  const v = str(flags, name);
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) usageError(`--${name} must be a non-negative integer, got ${v}`);
  return n;
}

function num(flags: Map<string, string | true>, name: string): number | undefined {
  const v = str(flags, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) usageError(`--${name} must be a number, got ${v}`);
  return n;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const testSetPath = resolve(str(flags, "test-set") ?? DEFAULT_TEST_SET);
  if (!existsSync(testSetPath)) usageError(`test set not found: ${testSetPath}`);
  const testSet = parseTestSet(JSON.parse(readFileSync(testSetPath, "utf8")));

  const filter: RunFilter = {};
  const ids = str(flags, "ids");
  if (ids !== undefined) filter.ids = ids.split(",").map((s) => s.trim()).filter(Boolean);
  const cats = str(flags, "categories");
  if (cats !== undefined) {
    const list = cats.split(",").map((s) => s.trim()).filter(Boolean);
    for (const c of list) if (!(EVAL_CATEGORIES as readonly string[]).includes(c)) usageError(`unknown category ${c}`);
    filter.categories = list as EvalCategory[];
  }
  const limit = int(flags, "limit");
  if (limit !== undefined) filter.limit = limit;

  const log = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };

  if (flags.has("reference-suite")) {
    const suite = await runReferenceSuite(testSet, { filter, log, keepData: flags.has("keep-data") });
    const scored = suite.results.filter((r) => r.score?.passed === true).length;
    process.stdout.write(`reference suite: ${scored}/${suite.results.length} instruction(s) pass all four criteria\n`);
    for (const f of suite.failures) process.stdout.write(`- ${f}\n`);
    process.exitCode = suite.failures.length === 0 ? 0 : 1;
    return;
  }

  const armsRaw = str(flags, "arms");
  const armList = armsRaw === undefined ? [...ARM_IDS] : armsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const arms: ArmId[] = armList.filter(isArmId);
  if (arms.length !== armList.length || arms.length === 0) {
    usageError(`--arms must list one or more of ${ARM_IDS.join(", ")}; got ${armsRaw ?? "(none)"}`);
  }

  const driverName = str(flags, "driver") ?? "anthropic";
  let driver: DriverConfig;
  if (driverName === "reference") {
    driver = { kind: "reference" };
  } else if (driverName === "anthropic") {
    const effort = str(flags, "effort");
    if (effort !== undefined && !(EFFORTS as readonly string[]).includes(effort)) usageError(`--effort must be one of ${EFFORTS.join(", ")}`);
    driver = { kind: "anthropic", model: str(flags, "model") ?? DEFAULT_MODEL, ...(effort !== undefined && { effort: effort as Effort }) };
  } else {
    usageError(`--driver must be anthropic or reference, got ${driverName}`);
  }

  const bounds: Partial<DriveBounds> = {};
  const maxTurns = int(flags, "max-turns");
  if (maxTurns !== undefined) bounds.max_turns = maxTurns;
  const maxCalls = int(flags, "max-tool-calls");
  if (maxCalls !== undefined) bounds.max_tool_calls = maxCalls;
  const maxWall = int(flags, "max-wall-ms");
  if (maxWall !== undefined) bounds.max_wall_ms = maxWall;

  const runId = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${driverName}`;
  const outDir = resolve(str(flags, "out") ?? join(PKG_ROOT, "eval", "runs", runId));
  mkdirSync(outDir, { recursive: true });
  const workDir = str(flags, "work-dir");

  const receipt = await runEval({
    testSet,
    arms,
    driver,
    outDir,
    ...(workDir !== undefined && { workDir: resolve(workDir) }),
    bounds,
    filter,
    keepData: flags.has("keep-data"),
    log,
    runId,
    ...(num(flags, "threshold-pp") !== undefined && { threshold_pp: num(flags, "threshold-pp") }),
    ...(num(flags, "acceptable-rate") !== undefined && { acceptable_rate: num(flags, "acceptable-rate") }),
  });

  const markdown = renderReportMarkdown(receipt.report);
  writeFileSync(join(outDir, "report.md"), markdown);
  if (flags.has("json")) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stdout.write(markdown);
    process.stdout.write(`\nreceipt: ${join(outDir, "receipt.json")}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`run-cold-agent-eval: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(70);
});
