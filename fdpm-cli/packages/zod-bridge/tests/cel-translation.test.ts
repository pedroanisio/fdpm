import { evaluate } from "@marcbachmann/cel-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodSchemaToCelConstraints } from "../src/index.js";

/**
 * Each row of type:ZodToCelTranslationTable. Verifies BOTH:
 *   (a) emitted CEL fragment matches the expected substring;
 *   (b) the fragment evaluates correctly against representative values
 *       on the host's CEL evaluator (cel-js v7.x).
 */

const ctx = { selfPath: "self.x", namePrefix: "test.x" } as const;

function emit(schema: z.ZodType): string[] {
  return zodSchemaToCelConstraints(schema, ctx).map((c) => c.expression);
}

function evalCel(expr: string, x: unknown): boolean {
  // cel-js wants bigint for ints; coerce numeric x to BigInt when it's an integer.
  const ctxBinding: { self: { x: unknown } } = { self: { x } };
  const result = evaluate(expr, ctxBinding);
  return Boolean(result);
}

describe("CEL translation table — string", () => {
  it("rule 1: z.string().min(n) -> size >= n", () => {
    const e = emit(z.string().min(3));
    expect(e).toContain("size(self.x) >= 3");
    expect(evalCel("size(self.x) >= 3", "abcd")).toBe(true);
    expect(evalCel("size(self.x) >= 3", "ab")).toBe(false);
  });
  it("rule 2: z.string().max(n) -> size <= n", () => {
    expect(emit(z.string().max(5))).toContain("size(self.x) <= 5");
  });
  it("rule 3: z.string().length(n) -> size == n", () => {
    expect(emit(z.string().length(2))).toContain("size(self.x) == 2");
  });
  it("rule 4: z.string().regex(/p/) -> .matches('p') without flags", () => {
    const e = emit(z.string().regex(/^[a-z]+$/));
    expect(e.some((x) => x.startsWith("self.x.matches("))).toBe(true);
    expect(evalCel(`self.x.matches("^[a-z]+$")`, "abc")).toBe(true);
    expect(evalCel(`self.x.matches("^[a-z]+$")`, "ABC")).toBe(false);
  });
  it("rule 4b: regex with /i flag falls back (no constraint emitted)", () => {
    const e = emit(z.string().regex(/^[a-z]+$/i));
    expect(e.some((x) => x.includes("matches"))).toBe(false);
  });
  it("rule 5: startsWith", () => {
    const e = emit(z.string().startsWith("hi-"));
    expect(e).toContain('self.x.startsWith("hi-")');
  });
  it("rule 6: endsWith", () => {
    const e = emit(z.string().endsWith(".txt"));
    expect(e).toContain('self.x.endsWith(".txt")');
  });
  it("rule 7: includes -> contains", () => {
    const e = emit(z.string().includes("foo"));
    expect(e).toContain('self.x.contains("foo")');
  });
  it("rule 8: z.iso.datetime() emits timestamp parse check", () => {
    const e = emit((z.iso?.datetime?.() as z.ZodType) ?? z.string().datetime());
    expect(e.some((x) => x.startsWith("timestamp("))).toBe(true);
    expect(evalCel(`timestamp(self.x).getFullYear() > 0`, "2026-05-06T11:30:00Z")).toBe(true);
  });
});

describe("CEL translation table — number", () => {
  it("rule 9: .min(n) -> >= n", () => {
    const e = emit(z.number().min(3));
    expect(e).toContain("self.x >= 3");
  });
  it("rule 10: .max(n) -> <= n", () => {
    const e = emit(z.number().max(7));
    expect(e).toContain("self.x <= 7");
  });
  it("rule 11: .gt(n) / .lt(n) (exclusive)", () => {
    expect(emit(z.number().gt(3))).toContain("self.x > 3");
    expect(emit(z.number().lt(7))).toContain("self.x < 7");
  });
  it("rule 12: .int() -> int(self.x) == self.x", () => {
    const e = emit(z.number().int());
    expect(e.some((x) => x.includes("int(self.x)"))).toBe(true);
  });
  it("rule 13: .positive() -> > 0", () => {
    expect(emit(z.number().positive())).toContain("self.x > 0");
  });
  it("rule 13: .negative() -> < 0", () => {
    expect(emit(z.number().negative())).toContain("self.x < 0");
  });
  it("rule 14: .nonnegative() -> >= 0", () => {
    expect(emit(z.number().nonnegative())).toContain("self.x >= 0");
  });
  it("rule 14: .nonpositive() -> <= 0", () => {
    expect(emit(z.number().nonpositive())).toContain("self.x <= 0");
  });
  it("rule 15: .multipleOf(k) -> % k == 0", () => {
    expect(emit(z.number().multipleOf(5))).toContain("self.x % 5 == 0");
  });
});

describe("CEL translation table — enum/array/literal/optional", () => {
  it("rule 16: z.enum([a,b,c]) -> in ['a','b','c']", () => {
    const e = emit(z.enum(["a", "b", "c"]));
    expect(e).toContain('self.x in ["a", "b", "c"]');
    expect(evalCel('self.x in ["a", "b", "c"]', "b")).toBe(true);
    expect(evalCel('self.x in ["a", "b", "c"]', "z")).toBe(false);
  });
  it("rule 17/20: z.array(T).min(n) and .nonempty()", () => {
    expect(emit(z.array(z.string()).min(2))).toContain("size(self.x) >= 2");
    expect(emit(z.array(z.string()).nonempty())).toContain("size(self.x) >= 1");
  });
  it("rule 18: z.array(T).max(n)", () => {
    expect(emit(z.array(z.string()).max(8))).toContain("size(self.x) <= 8");
  });
  it("rule 19: z.array(T).length(n)", () => {
    expect(emit(z.array(z.string()).length(3))).toContain("size(self.x) == 3");
  });
  it("rule 21: z.optional() emits no constraint at the value level", () => {
    expect(emit(z.string().optional())).toEqual([]);
  });
  it("rule 23: z.literal(v) -> == v", () => {
    expect(emit(z.literal("greeting"))).toContain('self.x == "greeting"');
  });
  it("array item composition with .all", () => {
    const e = emit(z.array(z.string().min(1)).max(8));
    expect(e.some((x) => x.startsWith("self.x.all("))).toBe(true);
  });
});
