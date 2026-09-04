/**
 * The differential report — the number the roadmap is gated by.
 *
 * README "Eval design": if arm 3 does not beat arm 2 by at least 15
 * percentage points on first-try success, prompts did not pay for
 * themselves; and if arm 3's rate is below the rate deemed acceptable for
 * the agent product case, the post-v2 roadmap is reopened. Both rules are
 * computed here from scored results and nothing else — no model text, no
 * hand-entered numbers.
 */

import { ARM_IDS, type ArmId } from "./arms.js";
import { EVAL_CATEGORIES, type EvalCategory } from "./schema.js";
import type { CriterionId, InstructionScore } from "./score.js";
import type { DriveUsage, TerminalReason } from "./driver.js";

export type ResultStatus = "scored" | "invalid_setup" | "driver_error";

export interface InstructionRunResult {
  arm: ArmId;
  instruction_id: string;
  category: EvalCategory;
  status: ResultStatus;
  /** Present when status is `scored`. */
  score: InstructionScore | null;
  /** Why setup or the driver failed; empty when scored. */
  error: string | null;
  transcript: {
    terminal: TerminalReason | null;
    turns: number;
    tool_calls: number;
    usage: DriveUsage;
    wall_ms: number;
  };
  /** Audit error classes for this instruction: `<tool> <label>` → count. */
  error_classes: Record<string, number>;
}

export interface CategoryCell {
  n: number;
  passed: number;
  rate: number | null;
}

export interface ArmSummary {
  arm: ArmId;
  instructions: number;
  scored: number;
  invalid_setup: number;
  driver_error: number;
  passed: number;
  /** passed / instructions — an unscorable instruction counts as a failure. */
  first_try_success_rate: number | null;
  by_category: Record<EvalCategory, CategoryCell>;
  criterion_failures: Record<CriterionId, number>;
  terminal_reasons: Record<string, number>;
  usage: DriveUsage;
  tool_calls: number;
  /** Top error classes across the arm, count-descending. */
  error_classes: Array<{ class: string; count: number }>;
}

export interface DifferentialReport {
  generated_at: string;
  test_set: { id: string; instructions: number };
  model: string;
  arms: ArmSummary[];
  differential: {
    threshold_pp: number;
    /** arm3 − arm2, in percentage points; null when either arm is missing. */
    prompts_vs_discovery_pp: number | null;
    /** arm2 − arm1. */
    discovery_vs_tools_pp: number | null;
    prompts_paid_off: boolean | null;
  };
  kill_criterion: {
    acceptable_rate: number;
    arm3_rate: number | null;
    met: boolean | null;
    verdict: string;
  };
}

export interface ReportOptions {
  model: string;
  test_set: { id: string; instructions: number };
  /** README: 15 percentage points. */
  threshold_pp?: number;
  /** The rate "deemed acceptable for the agent product case"; operator-set. */
  acceptable_rate?: number;
  now?: () => number;
  top_error_classes?: number;
}

export const DEFAULT_THRESHOLD_PP = 15;
export const DEFAULT_ACCEPTABLE_RATE = 0.7;

const CRITERIA: ReadonlyArray<CriterionId> = ["terminal_state", "replay", "destructive_scope", "verb_budget"];

function emptyUsage(): DriveUsage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

function summariseArm(arm: ArmId, results: ReadonlyArray<InstructionRunResult>, top: number): ArmSummary {
  const rows = results.filter((r) => r.arm === arm);
  const by_category = Object.fromEntries(
    EVAL_CATEGORIES.map((c) => [c, { n: 0, passed: 0, rate: null }]),
  ) as Record<EvalCategory, CategoryCell>;
  const criterion_failures = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<CriterionId, number>;
  const terminal_reasons: Record<string, number> = {};
  const classes = new Map<string, number>();
  const usage = emptyUsage();
  let passed = 0;
  let scored = 0;
  let invalid_setup = 0;
  let driver_error = 0;
  let tool_calls = 0;

  for (const r of rows) {
    by_category[r.category].n += 1;
    tool_calls += r.transcript.tool_calls;
    usage.input_tokens += r.transcript.usage.input_tokens;
    usage.output_tokens += r.transcript.usage.output_tokens;
    usage.cache_read_input_tokens += r.transcript.usage.cache_read_input_tokens;
    usage.cache_creation_input_tokens += r.transcript.usage.cache_creation_input_tokens;
    const terminal = r.transcript.terminal ?? "none";
    terminal_reasons[terminal] = (terminal_reasons[terminal] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.error_classes)) classes.set(k, (classes.get(k) ?? 0) + v);

    if (r.status === "invalid_setup") {
      invalid_setup += 1;
      continue;
    }
    if (r.status === "driver_error" || r.score === null) {
      driver_error += 1;
      continue;
    }
    scored += 1;
    if (r.score.passed) {
      passed += 1;
      by_category[r.category].passed += 1;
    }
    for (const c of r.score.criteria) if (!c.passed) criterion_failures[c.id] += 1;
  }
  for (const c of EVAL_CATEGORIES) {
    const cell = by_category[c];
    cell.rate = cell.n > 0 ? cell.passed / cell.n : null;
  }
  return {
    arm,
    instructions: rows.length,
    scored,
    invalid_setup,
    driver_error,
    passed,
    first_try_success_rate: rows.length > 0 ? passed / rows.length : null,
    by_category,
    criterion_failures,
    terminal_reasons,
    usage,
    tool_calls,
    error_classes: [...classes.entries()]
      .map(([cls, count]) => ({ class: cls, count }))
      .sort((a, b) => b.count - a.count || a.class.localeCompare(b.class))
      .slice(0, top),
  };
}

function pp(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 1000) / 10;
}

export function buildDifferentialReport(
  results: ReadonlyArray<InstructionRunResult>,
  opts: ReportOptions,
): DifferentialReport {
  const threshold_pp = opts.threshold_pp ?? DEFAULT_THRESHOLD_PP;
  const acceptable_rate = opts.acceptable_rate ?? DEFAULT_ACCEPTABLE_RATE;
  if (!(threshold_pp >= 0)) throw new Error(`threshold_pp must be >= 0, got ${String(opts.threshold_pp)}`);
  if (!(acceptable_rate > 0 && acceptable_rate <= 1)) {
    throw new Error(`acceptable_rate must be in (0, 1], got ${String(opts.acceptable_rate)}`);
  }
  const top = opts.top_error_classes ?? 10;
  const present = ARM_IDS.filter((a) => results.some((r) => r.arm === a));
  const arms = present.map((a) => summariseArm(a, results, top));
  const rate = (a: ArmId): number | null => arms.find((s) => s.arm === a)?.first_try_success_rate ?? null;

  const r1 = rate("tools");
  const r2 = rate("tools_discovery");
  const r3 = rate("tools_discovery_prompts");
  const prompts_vs_discovery_pp = pp(r3, r2);
  const discovery_vs_tools_pp = pp(r2, r1);
  const prompts_paid_off = prompts_vs_discovery_pp === null ? null : prompts_vs_discovery_pp >= threshold_pp;
  const met = r3 === null ? null : r3 >= acceptable_rate;

  let verdict: string;
  if (r3 === null || r2 === null) {
    verdict = "incomplete: arms 2 and 3 are both required for the differential";
  } else if (!met) {
    verdict = `arm 3 first-try success ${(r3 * 100).toFixed(1)}% is below the acceptable ${(acceptable_rate * 100).toFixed(0)}%: the post-v2 roadmap is reopened`;
  } else if (!prompts_paid_off) {
    verdict = `arm 3 clears the acceptable rate but beats arm 2 by only ${prompts_vs_discovery_pp}pp (threshold ${threshold_pp}pp): prompts did not pay for themselves`;
  } else {
    verdict = `arm 3 clears the acceptable rate and beats arm 2 by ${prompts_vs_discovery_pp}pp (threshold ${threshold_pp}pp): the prompt thesis holds on this set`;
  }

  return {
    generated_at: new Date(opts.now ? opts.now() : Date.now()).toISOString(),
    test_set: opts.test_set,
    model: opts.model,
    arms,
    differential: { threshold_pp, prompts_vs_discovery_pp, discovery_vs_tools_pp, prompts_paid_off },
    kill_criterion: { acceptable_rate, arm3_rate: r3, met, verdict },
  };
}

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export function renderReportMarkdown(report: DifferentialReport): string {
  const lines: string[] = [];
  lines.push(`# Cold-agent eval — ${report.test_set.id}`);
  lines.push("");
  lines.push(`Generated: ${report.generated_at}  `);
  lines.push(`Model: \`${report.model}\`  `);
  lines.push(`Instructions: ${report.test_set.instructions}`);
  lines.push("");
  lines.push("## First-try success by arm");
  lines.push("");
  lines.push("| Arm | Instructions | Passed | Rate | Setup invalid | Driver errors | Tool calls | Input tokens | Output tokens |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const a of report.arms) {
    lines.push(
      `| ${a.arm} | ${a.instructions} | ${a.passed} | ${pct(a.first_try_success_rate)} | ${a.invalid_setup} | ${a.driver_error} | ${a.tool_calls} | ${a.usage.input_tokens} | ${a.usage.output_tokens} |`,
    );
  }
  lines.push("");
  lines.push("## By category");
  lines.push("");
  lines.push(`| Arm | ${EVAL_CATEGORIES.join(" | ")} |`);
  lines.push(`| --- | ${EVAL_CATEGORIES.map(() => "---:").join(" | ")} |`);
  for (const a of report.arms) {
    lines.push(
      `| ${a.arm} | ${EVAL_CATEGORIES.map((c) => `${a.by_category[c].passed}/${a.by_category[c].n}`).join(" | ")} |`,
    );
  }
  lines.push("");
  lines.push("## Criterion failures");
  lines.push("");
  lines.push(`| Arm | ${CRITERIA.join(" | ")} |`);
  lines.push(`| --- | ${CRITERIA.map(() => "---:").join(" | ")} |`);
  for (const a of report.arms) {
    lines.push(`| ${a.arm} | ${CRITERIA.map((c) => a.criterion_failures[c]).join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Terminal reasons");
  lines.push("");
  for (const a of report.arms) {
    const parts = Object.entries(a.terminal_reasons)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k}: ${v}`);
    lines.push(`- ${a.arm}: ${parts.join(", ") || "—"}`);
  }
  lines.push("");
  lines.push("## Error classes (seed set for the next teaching-surface fix)");
  lines.push("");
  for (const a of report.arms) {
    lines.push(`### ${a.arm}`);
    lines.push("");
    if (a.error_classes.length === 0) lines.push("- none");
    for (const c of a.error_classes) lines.push(`- \`${c.class}\` × ${c.count}`);
    lines.push("");
  }
  lines.push("## Differential and kill criterion");
  lines.push("");
  lines.push(`- arm 2 − arm 1: ${report.differential.discovery_vs_tools_pp ?? "—"} pp`);
  lines.push(
    `- arm 3 − arm 2: ${report.differential.prompts_vs_discovery_pp ?? "—"} pp (threshold ${report.differential.threshold_pp} pp) → prompts paid off: ${String(report.differential.prompts_paid_off)}`,
  );
  lines.push(
    `- arm 3 rate ${pct(report.kill_criterion.arm3_rate)} vs acceptable ${pct(report.kill_criterion.acceptable_rate)} → met: ${String(report.kill_criterion.met)}`,
  );
  lines.push(`- **Verdict:** ${report.kill_criterion.verdict}`);
  lines.push("");
  return lines.join("\n");
}
