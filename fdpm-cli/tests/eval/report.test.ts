import { describe, expect, it } from "vitest";
import type { ArmId } from "../../src/eval/arms.js";
import { buildDifferentialReport, renderReportMarkdown, type InstructionRunResult } from "../../src/eval/report.js";
import type { EvalCategory } from "../../src/eval/schema.js";
import type { InstructionScore } from "../../src/eval/score.js";

function score(passed: boolean, failing: Array<InstructionScore["criteria"][number]["id"]> = []): InstructionScore {
  const ids = ["terminal_state", "replay", "destructive_scope", "verb_budget"] as const;
  return {
    instruction_id: "x",
    passed,
    criteria: ids.map((id) => ({ id, passed: !failing.includes(id), detail: "" })),
    metrics: { tool_calls: 3, writes: 1, reads: 2, rejected: 0, protocol_errors: 0, resource_reads: 0, new_operations: 1, baseline_writes: 1, verb_budget: 2 },
    error_classes: {},
  };
}

function result(
  arm: ArmId,
  id: string,
  category: EvalCategory,
  over: Partial<InstructionRunResult> = {},
): InstructionRunResult {
  return {
    arm,
    instruction_id: id,
    category,
    status: "scored",
    score: score(true),
    error: null,
    transcript: { terminal: "end_turn", turns: 2, tool_calls: 3, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, wall_ms: 10 },
    error_classes: {},
    ...over,
  };
}

const OPTS = { model: "fake", test_set: { id: "unit", instructions: 4 }, now: () => 0 };

describe("differential report", () => {
  it("computes per-arm rates, the differential and the verdict", () => {
    const rows: InstructionRunResult[] = [
      // arm 1: 1/4
      result("tools", "a", "simple"),
      result("tools", "b", "multi_step", { score: score(false, ["terminal_state"]) }),
      result("tools", "c", "batch", { score: score(false, ["verb_budget"]) }),
      result("tools", "d", "refusal", { score: score(false, ["destructive_scope"]) }),
      // arm 2: 2/4
      result("tools_discovery", "a", "simple"),
      result("tools_discovery", "b", "multi_step"),
      result("tools_discovery", "c", "batch", { score: score(false, ["terminal_state"]) }),
      result("tools_discovery", "d", "refusal", { status: "driver_error", score: null, error: "api" }),
      // arm 3: 4/4
      result("tools_discovery_prompts", "a", "simple"),
      result("tools_discovery_prompts", "b", "multi_step"),
      result("tools_discovery_prompts", "c", "batch"),
      result("tools_discovery_prompts", "d", "refusal", { error_classes: { "fdpm.primitive.create rule:core:id-format": 2 } }),
    ];
    const r = buildDifferentialReport(rows, OPTS);
    expect(r.arms.map((a) => a.arm)).toEqual(["tools", "tools_discovery", "tools_discovery_prompts"]);
    expect(r.arms[0]!.first_try_success_rate).toBe(0.25);
    expect(r.arms[1]!.first_try_success_rate).toBe(0.5);
    expect(r.arms[1]!.driver_error).toBe(1);
    expect(r.arms[2]!.first_try_success_rate).toBe(1);
    expect(r.arms[0]!.criterion_failures).toEqual({ terminal_state: 1, replay: 0, destructive_scope: 1, verb_budget: 1 });
    expect(r.arms[0]!.by_category.simple).toEqual({ n: 1, passed: 1, rate: 1 });
    expect(r.arms[2]!.error_classes).toEqual([{ class: "fdpm.primitive.create rule:core:id-format", count: 2 }]);
    expect(r.arms[2]!.usage.input_tokens).toBe(400);
    expect(r.differential.discovery_vs_tools_pp).toBe(25);
    expect(r.differential.prompts_vs_discovery_pp).toBe(50);
    expect(r.differential.prompts_paid_off).toBe(true);
    expect(r.kill_criterion.met).toBe(true);
    expect(r.kill_criterion.verdict).toContain("the prompt thesis holds");
    expect(r.generated_at).toBe("1970-01-01T00:00:00.000Z");
  });

  it("counts an invalid setup as a failure and says when prompts did not pay off", () => {
    const rows: InstructionRunResult[] = [
      result("tools_discovery", "a", "simple"),
      result("tools_discovery", "b", "simple", { status: "invalid_setup", score: null, error: "setup" }),
      result("tools_discovery_prompts", "a", "simple"),
      result("tools_discovery_prompts", "b", "simple"),
    ];
    const r = buildDifferentialReport(rows, { ...OPTS, threshold_pp: 60, acceptable_rate: 0.5 });
    expect(r.arms[0]!.invalid_setup).toBe(1);
    expect(r.arms[0]!.first_try_success_rate).toBe(0.5);
    expect(r.differential.prompts_vs_discovery_pp).toBe(50);
    expect(r.differential.prompts_paid_off).toBe(false);
    expect(r.kill_criterion.met).toBe(true);
    expect(r.kill_criterion.verdict).toContain("prompts did not pay for themselves");
  });

  it("reopens the roadmap when arm 3 is below the acceptable rate", () => {
    const rows: InstructionRunResult[] = [
      result("tools_discovery", "a", "simple", { score: score(false, ["terminal_state"]) }),
      result("tools_discovery_prompts", "a", "simple", { score: score(false, ["terminal_state"]) }),
    ];
    const r = buildDifferentialReport(rows, OPTS);
    expect(r.kill_criterion.met).toBe(false);
    expect(r.kill_criterion.verdict).toContain("reopened");
  });

  it("is incomplete without arms 2 and 3, and rejects bad thresholds", () => {
    const r = buildDifferentialReport([result("tools", "a", "simple")], OPTS);
    expect(r.differential.prompts_vs_discovery_pp).toBeNull();
    expect(r.kill_criterion.verdict).toContain("incomplete");
    expect(() => buildDifferentialReport([], { ...OPTS, threshold_pp: -1 })).toThrow(/threshold_pp/);
    expect(() => buildDifferentialReport([], { ...OPTS, acceptable_rate: 0 })).toThrow(/acceptable_rate/);
  });

  it("renders a markdown report with every section", () => {
    const rows = [result("tools_discovery", "a", "simple"), result("tools_discovery_prompts", "a", "simple")];
    const md = renderReportMarkdown(buildDifferentialReport(rows, OPTS));
    for (const h of ["## First-try success by arm", "## By category", "## Criterion failures", "## Terminal reasons", "## Error classes", "## Differential and kill criterion", "**Verdict:**"]) {
      expect(md).toContain(h);
    }
    expect(md).toContain("| tools_discovery | 1 | 1 | 100.0% |");
  });
});
