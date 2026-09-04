/**
 * The text syntax: parse produces schema-shaped trees, the printer prints
 * them back, and parse ∘ print is the identity on the tree.
 */
import { describe, expect, it } from "vitest";
import { parseFormula, parseTerm } from "../../../plugins/logical_knowledge_base/formula.js";
import { printFormula } from "../../../plugins/logical_knowledge_base/renderers/_formula.js";
import { FormulaSchema, ValueExpressionSchema } from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import { pred, constTerm, varTerm, forall, implies, not } from "./_fixture.js";

const parse = (s: string, variables?: string[]) => {
  const r = parseFormula(s, variables ? { variables } : {});
  if (!r.ok) throw new Error(`${s}: ${r.error} at ${r.position}`);
  return r.formula;
};

/** The fixture helpers stamp `targetFamily: "symbol"` on references; the parser cannot know a family. */
const withoutFamily = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(withoutFamily);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => k !== "targetFamily")
        .map(([k, x]) => [k, withoutFamily(x)]),
    );
  }
  return v;
};

describe("parseFormula", () => {
  it("builds the fixture's formulas from notation", () => {
    expect(parse("pred:Human(const:socrates)")).toEqual(withoutFamily(pred("pred:Human", [constTerm("const:socrates")])));
    expect(parse("∀x. pred:Human(x) ⇒ pred:Mortal(x)")).toEqual(
      withoutFamily(forall(["x"], implies(pred("pred:Human", [varTerm("x")]), pred("pred:Mortal", [varTerm("x")])))),
    );
    expect(parse("¬pred:Mortal(const:socrates)")).toEqual(withoutFamily(not(pred("pred:Mortal", [constTerm("const:socrates")]))));
    expect(parse("prop:rain")).toEqual({ kind: "proposition_reference_formula", proposition: { kind: "reference", targetId: "prop:rain", resolution: "local" } });
  });

  it("honours precedence and associativity", () => {
    const f = parse("a | b & c ⇒ d ↔ e");
    expect(f["kind"]).toBe("biconditional_formula");
    const left = f["left"] as Record<string, unknown>;
    expect(left["kind"]).toBe("logical_implication_formula");
    expect((left["antecedent"] as Record<string, unknown>)["kind"]).toBe("or_formula");
    const or = left["antecedent"] as { operands: Record<string, unknown>[] };
    expect(or.operands[1]!["kind"]).toBe("and_formula");
    // Right-associative implication.
    const chain = parse("a ⇒ b ⇒ c") as { consequent: Record<string, unknown> };
    expect(chain.consequent["kind"]).toBe("logical_implication_formula");
    expect(parse("(a ⇒ b) ⇒ c")["antecedent"]).toMatchObject({ kind: "logical_implication_formula" });
    expect(parse("a -> b")["kind"]).toBe("material_implication_formula");
    expect(parse("a xor b")["kind"]).toBe("xor_formula");
    expect(parse("not not a")).toEqual({ kind: "not_formula", operand: { kind: "not_formula", operand: parse("a") } });
  });

  it("parses comparisons, arithmetic, literals, lists and functions", () => {
    expect(parse("fn:age(x) >= 18", ["x"])).toEqual({
      kind: "comparison_formula",
      operator: "gte",
      left: { kind: "function_application_term", function: { kind: "reference", targetId: "fn:age", resolution: "local" }, arguments: [{ kind: "variable_term", name: "x" }] },
      right: { kind: "integer_literal", value: "18" },
    });
    expect(parse("x + 2 * y = 7.5", ["x", "y"])).toMatchObject({
      kind: "equality_formula",
      left: { kind: "arithmetic_expression", operator: "add", operands: [{ kind: "variable_term", name: "x" }, { kind: "arithmetic_expression", operator: "multiply" }] },
      right: { kind: "decimal_literal", value: "7.5" },
    });
    expect(parse('name = "Socrates\\" of Athens"')).toMatchObject({ right: { kind: "string_literal", value: 'Socrates" of Athens' } });
    expect(parse("x ∈ [1, 2, 3]", ["x"])).toMatchObject({ kind: "membership_formula", set: { kind: "list_term" } });
    expect(parse("a ≠ b")["kind"]).toBe("inequality_formula");
    expect(parse("-x < 0", ["x"])).toMatchObject({ left: { kind: "arithmetic_expression", operator: "negate" } });
    expect(parse("⊤ ∧ ⊥")).toEqual({ kind: "and_formula", operands: [{ kind: "truth_constant_formula", value: "true" }, { kind: "truth_constant_formula", value: "false" }] });
    expect(parseTerm("f(1) + g(2, 3)")).toMatchObject({ ok: true, formula: { kind: "arithmetic_expression", operator: "add" } });
  });

  it("produces trees the vendored schema accepts", () => {
    for (const s of ["∀x, y. R(x, y) ⇒ R(y, x)", "∃x. P(x) ∧ ¬Q(x)", "p ∨ q ↔ ¬(¬p ∧ ¬q)", "f(a) = g(b, 1)", "x < 3 ∨ x ≥ 10"]) {
      const f = parse(s, ["x"]);
      const result = FormulaSchema.safeParse(f);
      expect(result.success, `${s}: ${JSON.stringify(result.success ? "" : result.error.issues.slice(0, 2))}`).toBe(true);
    }
    const t = parseTerm("[1, 2.5, \"s\"]");
    expect(t.ok && ValueExpressionSchema.safeParse(t.formula).success).toBe(true);
  });

  it("round-trips through the printer", () => {
    const cases: [string, string[]][] = [
      ["∀x. (pred:Human(x) ⇒ pred:Mortal(x))", []],
      ["(a ∧ b ∧ c)", []],
      ["¬p", []],
      ["(p ⇒ (q ⇒ r))", []],
      ["fn:age(x) ≥ 18", ["x"]],
      ["(p ↔ q)", []],
      ["x ∈ [1, 2]", ["x"]],
      ["(x + 1) * 2 = fn:f(x)", ["x"]],
    ];
    for (const [s, variables] of cases) {
      const once = parse(s, variables);
      const printed = printFormula(once);
      const twice = parse(printed, variables);
      expect(twice, `${s} → ${printed}`).toEqual(once);
    }
  });

  it("returns typed errors with positions and never throws", () => {
    expect(parseFormula("")).toMatchObject({ ok: false, error: "unexpected end of input" });
    expect(parseFormula("a ⇒")).toMatchObject({ ok: false, position: 3 });
    expect(parseFormula("∀. p")).toMatchObject({ ok: false, error: expect.stringContaining("variable name") });
    expect(parseFormula("p q")).toMatchObject({ ok: false, error: "unexpected 'q'", position: 2 });
    expect(parseFormula('"open')).toMatchObject({ ok: false, error: "unterminated string literal" });
    expect(parseFormula("a $ b")).toMatchObject({ ok: false, error: "unexpected character '$'", position: 2 });
    expect(parseFormula("f(1")).toMatchObject({ ok: false, error: "expected ')'" });
    expect(parseFormula("1 + 2")).toMatchObject({ ok: false, error: expect.stringContaining("expected a formula") });
  });
});
