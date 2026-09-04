/**
 * The four criteria against a real Host with the planning plugin active.
 * The audit window is constructed by hand in the shape the parser accepts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Host } from "../../src/core/host.js";
import type { AuditEntry } from "../../src/persistence/mcp-audit-report.js";
import type { EvalInstruction } from "../../src/eval/schema.js";
import {
  canonicalJson,
  checkDestructiveScope,
  checkReplay,
  evaluateAssertions,
  openScoringHost,
  readWorkbookState,
  scoreInstruction,
  verbBudget,
} from "../../src/eval/score.js";

const PROFILE = "profile:planning:0.1";
const WB = "score-wb";

let dataDir: string;
let host: Host;
let setupRevision = 0;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-eval-score-"));
  host = await openScoringHost(dataDir);
  await host.createProject({ workbook_id: WB, name: "Score", profile_id: PROFILE });
  const a = await host.createPrimitive(WB, {
    id: "task:alpha",
    type_id: "plan:Task",
    field_values: { name: "Alpha", summary: "First", kind: "Implementation", executor_kind: "Human", status: "Ready", priority: "P1", is_root: true },
  });
  expect(a.report.accepted).toBe(true);
  const b = await host.createPrimitive(WB, {
    id: "task:beta",
    type_id: "plan:Task",
    field_values: { name: "Beta", summary: "Second", kind: "Test", executor_kind: "Human", status: "Backlog", priority: "P2", is_root: true },
  });
  expect(b.report.accepted).toBe(true);
  const r = await host.createRelation(WB, { id: "dep:beta-alpha", type_id: "plan:DependsOn", source_id: "task:beta", target_id: "task:alpha" });
  expect(r.report.accepted).toBe(true);
  setupRevision = r.append.project_revision;
}, 60_000);

afterAll(async () => {
  await host.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function complete(tool: string, ok = true, extra: Partial<Extract<AuditEntry, { phase: "complete" }>> = {}): AuditEntry {
  return {
    ts: "2026-09-04T12:00:00.000Z",
    call_id: `c-${tool}-${Math.random().toString(36).slice(2, 8)}`,
    session: "s",
    tool,
    args_hash: "h",
    phase: "complete",
    ok,
    duration_ms: 1,
    validation_status: ok ? "pass" : "fail",
    ...extra,
  } as AuditEntry;
}

function instruction(over: Partial<EvalInstruction> = {}): EvalInstruction {
  return {
    id: "score-one",
    category: "simple",
    profile_id: PROFILE,
    workbook_id: WB,
    setup: [],
    instruction: "x",
    expected: {
      assertions: [
        { kind: "workbook_exists", profile_id: PROFILE },
        { kind: "primitive_exists", id: "task:alpha", type_id: "plan:Task", fields: { status: "Ready", priority: "P1" } },
        { kind: "relation_exists", type_id: "plan:DependsOn", source_id: "task:beta", target_id: "task:alpha" },
        { kind: "primitive_count", type_id: "plan:Task", equals: 2 },
        { kind: "primitive_absent", id: "task:gamma" },
        { kind: "relation_absent", type_id: "plan:Subtask", source_id: "task:alpha", target_id: "task:beta" },
      ],
      destructive: { kinds: [] },
    },
    reference_solution: [{ tool: "fdpm.primitive.patch", args: {} }],
    ...over,
  };
}

describe("score — assertions over the live projection", () => {
  it("holds for the seeded state and names each failure precisely", () => {
    const { slice } = readWorkbookState(host, WB);
    expect(evaluateAssertions(instruction().expected.assertions, slice)).toEqual([]);
    const failures = evaluateAssertions(
      [
        { kind: "primitive_exists", id: "task:alpha", fields: { status: "Done" } },
        { kind: "primitive_exists", id: "task:zeta" },
        { kind: "primitive_count", type_id: "plan:Task", min: 3 },
        { kind: "relation_exists", type_id: "plan:Subtask", source_id: "task:alpha", target_id: "task:beta" },
        { kind: "workbook_exists", profile_id: "profile:other:1.0" },
      ],
      slice,
    );
    expect(failures).toHaveLength(5);
    expect(failures[0]).toContain('task:alpha.status = "Ready", expected "Done"');
    expect(failures[1]).toContain("task:zeta is absent");
    expect(failures[2]).toContain("minimum 3");
  });

  it("treats a missing workbook as failing every existence assertion", () => {
    const { slice } = readWorkbookState(host, "no-such-wb");
    expect(slice).toBeNull();
    const failures = evaluateAssertions(instruction().expected.assertions, slice);
    expect(failures.some((f) => f.startsWith("workbook_exists"))).toBe(true);
    expect(failures.some((f) => f.startsWith("primitive_exists"))).toBe(true);
  });
});

describe("score — replay and destructive scope", () => {
  it("replays the log from empty into the live projection, and detects tampering", () => {
    const { slice, log } = readWorkbookState(host, WB);
    expect(checkReplay(log, WB, slice).passed).toBe(true);
    const tampered = JSON.parse(canonicalJson(slice)) as NonNullable<typeof slice>;
    tampered.primitives["task:alpha"]!.field_values["status"] = "Done";
    expect(checkReplay(log, WB, tampered).passed).toBe(false);
  });

  it("flags deletes outside the instruction's scope and accepts those inside it", async () => {
    const before = readWorkbookState(host, WB).log.length;
    await host.deleteRelation(WB, "dep:beta-alpha");
    const { log } = readWorkbookState(host, WB);
    expect(log.length).toBe(before + 1);
    const none = checkDestructiveScope(log, setupRevision, instruction());
    expect(none.passed).toBe(false);
    expect(none.detail).toContain("relation.delete dep:beta-alpha (kind not authorised)");
    const wrongId = checkDestructiveScope(
      log,
      setupRevision,
      instruction({ expected: { assertions: [], destructive: { kinds: ["relation.delete"], ids: ["dep:other"] } } }),
    );
    expect(wrongId.passed).toBe(false);
    expect(wrongId.detail).toContain("id not authorised");
    const allowed = checkDestructiveScope(
      log,
      setupRevision,
      instruction({ expected: { assertions: [], destructive: { kinds: ["relation.delete"], ids: ["dep:beta-alpha"] } } }),
    );
    expect(allowed.passed).toBe(true);
    // Setup-era operations are never in scope: the same delete, before the cut, is ignored.
    expect(checkDestructiveScope(log, log.length, instruction()).passed).toBe(true);
  });
});

describe("score — the whole verdict", () => {
  it("passes when all four criteria hold and reports the metrics", () => {
    const ins = instruction({
      expected: {
        assertions: [{ kind: "primitive_exists", id: "task:alpha" }],
        destructive: { kinds: ["relation.delete"] },
      },
    });
    const { slice, log } = readWorkbookState(host, WB);
    const audit: AuditEntry[] = [
      complete("fdpm.profile.type_info"),
      complete("fdpm.primitive.patch", false, { rule_ids: ["plan:val:done-task-has-ac"] }),
      complete("fdpm.primitive.patch"),
      complete("fdpm.relation.delete"),
      complete("fdpm.primitive.get", false, { error_category: "not_found", error_reason: "primitive" }),
    ];
    const s = scoreInstruction({ instruction: ins, slice, log, setup_revision: setupRevision, audit });
    expect(s.passed).toBe(false); // 3 writes against a budget of 2 × 1
    expect(s.criteria.find((c) => c.id === "verb_budget")!.passed).toBe(false);
    expect(s.metrics).toMatchObject({ tool_calls: 5, writes: 3, reads: 2, rejected: 1, protocol_errors: 1, baseline_writes: 1, verb_budget: 2 });
    expect(s.error_classes).toEqual({
      "fdpm.primitive.patch rule:plan:val:done-task-has-ac": 1,
      "fdpm.primitive.get not_found/primitive": 1,
    });
    const s2 = scoreInstruction({ instruction: ins, slice, log, setup_revision: setupRevision, audit: audit.slice(0, 3) });
    expect(s2.passed).toBe(true);
    expect(s2.criteria.map((c) => c.passed)).toEqual([true, true, true, true]);
  });

  it("fails a refusal case that appended anything", () => {
    const ins = instruction({
      category: "refusal",
      expected: { assertions: [], max_new_operations: 0, destructive: { kinds: [] } },
      reference_solution: [],
    });
    const { slice, log } = readWorkbookState(host, WB);
    const s = scoreInstruction({ instruction: ins, slice, log, setup_revision: setupRevision, audit: [] });
    const terminal = s.criteria.find((c) => c.id === "terminal_state")!;
    expect(terminal.passed).toBe(false);
    expect(terminal.detail).toContain("maximum 0");
    expect(verbBudget(ins)).toBe(0);
    const clean = scoreInstruction({ instruction: ins, slice, log, setup_revision: log.length, audit: [] });
    expect(clean.passed).toBe(true);
  });
});
