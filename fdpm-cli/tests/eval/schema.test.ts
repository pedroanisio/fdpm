import { describe, expect, it } from "vitest";
import {
  WRITE_TOOL_NAMES,
  baselineWrites,
  checkComposition,
  isWriteTool,
  parseTestSet,
  type EvalInstruction,
} from "../../src/eval/schema.js";

const PROFILE = "profile:planning:0.1";

function instruction(over: Partial<EvalInstruction> = {}): EvalInstruction {
  return {
    id: "simple-one",
    category: "simple",
    profile_id: PROFILE,
    workbook_id: "wb-one",
    setup: [
      { tool: "fdpm.workbook.create", args: { workbook_id: "wb-one", name: "One", profile_id: PROFILE } },
    ],
    instruction: "Create a task.",
    expected: {
      assertions: [{ kind: "primitive_exists", id: "task:a", type_id: "plan:Task" }],
      destructive: { kinds: [] },
    },
    reference_solution: [
      { tool: "fdpm.primitive.create", args: { workbook_id: "wb-one", primitive: { id: "task:a", type_id: "plan:Task", field_values: {} } } },
    ],
    ...over,
  };
}

function set(instructions: EvalInstruction[]) {
  return {
    schema_version: "1.0.0",
    id: "unit",
    title: "Unit set",
    profile_id: PROFILE,
    generated_by: "test",
    instructions,
  };
}

describe("eval schema — typed parse of the test set", () => {
  it("parses a well-formed set and applies defaults", () => {
    const parsed = parseTestSet(set([instruction()]));
    expect(parsed.instructions[0]!.expected.destructive.kinds).toEqual([]);
  });

  it("rejects an unknown key anywhere (strict objects)", () => {
    const raw = set([instruction()]) as Record<string, unknown>;
    (raw["instructions"] as Array<Record<string, unknown>>)[0]!["expectation"] = {};
    expect(() => parseTestSet(raw)).toThrow(/unrecognized|Unrecognized/);
  });

  it("rejects a misspelled assertion kind", () => {
    const bad = instruction({
      expected: { assertions: [{ kind: "primitive_exist", id: "x" } as never], destructive: { kinds: [] } },
    });
    expect(() => parseTestSet(set([bad]))).toThrow();
  });

  it("rejects duplicate instruction ids and reused workbook ids", () => {
    expect(() => parseTestSet(set([instruction(), instruction({ workbook_id: "wb-two" })]))).toThrow(/duplicate instruction id/);
    expect(() => parseTestSet(set([instruction(), instruction({ id: "simple-two" })]))).toThrow(/workbook_id wb-one is reused/);
  });

  it("rejects an instruction whose profile differs from the set's", () => {
    expect(() => parseTestSet(set([instruction({ profile_id: "profile:other:1.0" })]))).toThrow(/differs from the set/);
  });

  it("rejects a primitive_count assertion with no bound", () => {
    const bad = instruction({
      expected: { assertions: [{ kind: "primitive_count", type_id: "plan:Task" }], destructive: { kinds: [] } },
    });
    expect(() => parseTestSet(set([bad]))).toThrow(/at least one of equals\/min\/max/);
  });

  it("rejects a destructive kind outside the closed set", () => {
    const bad = instruction({
      expected: { assertions: [], destructive: { kinds: ["primitive.nuke" as never] } },
    });
    expect(() => parseTestSet(set([bad]))).toThrow();
  });
});

describe("eval schema — write-tool classification", () => {
  it("derives the write set from the manifest tiers", () => {
    expect(isWriteTool("fdpm.primitive.create")).toBe(true);
    expect(isWriteTool("fdpm.primitive.delete")).toBe(true);
    expect(isWriteTool("fdpm.workbook.create")).toBe(true);
    expect(isWriteTool("fdpm.primitive.get")).toBe(false);
    expect(isWriteTool("fdpm.profile.type_info")).toBe(false);
    expect(isWriteTool("mcp_read_resource")).toBe(false);
    expect(WRITE_TOOL_NAMES.size).toBe(20);
  });

  it("counts baseline writes from the reference solution only", () => {
    const ins = instruction({
      reference_solution: [
        { tool: "fdpm.profile.type_info", args: {} },
        { tool: "fdpm.primitive.create", args: {} },
        { tool: "fdpm.relation.create", args: {} },
      ],
    });
    expect(baselineWrites(ins)).toBe(2);
  });
});

describe("eval schema — composition check", () => {
  it("reports the README composition violations", () => {
    const parsed = parseTestSet(set([instruction()]));
    const report = checkComposition(parsed, { total: 2, min_per_category: 1 });
    expect(report.total).toBe(1);
    expect(report.by_category.simple).toBe(1);
    expect(report.issues).toContain("expected 2 instructions, found 1");
    expect(report.issues.some((i) => i.startsWith("category multi_step has 0"))).toBe(true);
  });

  it("flags a refusal instruction whose reference writes, and a non-refusal one that does not", () => {
    const refusal = instruction({
      id: "refuse-one",
      workbook_id: "wb-r",
      category: "refusal",
      expected: { assertions: [], max_new_operations: 1, destructive: { kinds: [] } },
    });
    const lazy = instruction({ id: "lazy", workbook_id: "wb-l", reference_solution: [], expected: { assertions: [], destructive: { kinds: [] } } });
    const report = checkComposition(parseTestSet(set([refusal, lazy])), { total: 2, min_per_category: 0 });
    expect(report.issues).toContain("refuse-one: refusal reference solution performs 1 write(s)");
    expect(report.issues).toContain("refuse-one: refusal instruction must set expected.max_new_operations to 0");
    expect(report.issues).toContain("lazy: simple reference solution performs no write");
    expect(report.issues).toContain("lazy: no assertions — the terminal state cannot be scored");
  });
});
