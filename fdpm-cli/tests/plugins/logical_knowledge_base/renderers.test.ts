/**
 * The two renderers over the fixture, over the acceptance harness's six
 * fixture states, and the formula printer over every layout it claims.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { importTransfer } from "../../../src/core/host-extra.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import { buildFixture, structuralProblems, type FixtureState } from "../../../scripts/render-acceptance.js";
import { PROFILE_ID, deriveProfile } from "../../../plugins/logical_knowledge_base/derive.js";
import { printFormula, printShort } from "../../../plugins/logical_knowledge_base/renderers/_formula.js";
import { renderArgumentGraph } from "../../../plugins/logical_knowledge_base/renderers/argument_graph.js";
import { renderTheory } from "../../../plugins/logical_knowledge_base/renderers/theory.js";
import { importLkbJson } from "../../../plugins/logical_knowledge_base/transfer.js";
import { fixtureDocument, pred, constTerm, varTerm, forall, implies, not } from "./_fixture.js";

const text = (o: { bytes: Uint8Array }) => new TextDecoder().decode(o.bytes);
const STATES: FixtureState[] = ["empty", "short", "typical", "long", "malformed", "dense"];

describe("printFormula", () => {
  it("prints the connectives, quantifiers, applications and literals", () => {
    const human = pred("pred:Human", [constTerm("const:socrates")]);
    expect(printFormula(human)).toBe("pred:Human(const:socrates)");
    expect(printFormula(not(human))).toBe("¬pred:Human(const:socrates)");
    expect(printFormula(implies(human, pred("pred:Mortal", [varTerm("x")])))).toBe("(pred:Human(const:socrates) ⇒ pred:Mortal(x))");
    expect(printFormula(forall(["x"], human))).toBe("∀x. pred:Human(const:socrates)");
    expect(printFormula({ kind: "and_formula", operands: [human, { kind: "truth_constant_formula", value: "true" }] })).toBe("(pred:Human(const:socrates) ∧ ⊤)");
    expect(printFormula({ kind: "comparison_formula", operator: "lte", left: { kind: "integer_literal", value: "1" }, right: { kind: "integer_literal", value: "2" } })).toBe("1 ≤ 2");
    expect(printFormula({ kind: "string_literal", value: "a\"b" })).toBe('"a\\"b"');
    expect(printFormula({ kind: "rational_literal", numerator: "1", denominator: "3" })).toBe("1/3");
    expect(printFormula({ kind: "function_application_term", function: { kind: "reference", targetId: "fn:age", resolution: "local" }, arguments: [varTerm("x")] })).toBe("fn:age(x)");
    expect(printFormula({ kind: "reference", targetId: "ext:foaf", resolution: "external", externalUri: "https://x" })).toBe("ext:foaf↗");
    expect(printFormula({ kind: "collection_type", collectionKind: "list", elementType: { kind: "primitive_type", name: "string" } })).toBe("list<string>");
    expect(printFormula({ kind: "object_some_values_from_concept", property: { kind: "reference", targetId: "p", resolution: "local" }, filler: { kind: "top_concept" } })).toBe("∃p.⊤");
  });

  it("never throws: unknown kinds, junk, cycles of depth, and nulls", () => {
    expect(printFormula({ kind: "made_up_formula", weight: 3, inner: { kind: "top_concept" } })).toBe("made_up_formula(weight=3, inner=⊤)");
    expect(printFormula(null)).toBe("∅");
    expect(printFormula(42)).toBe("42");
    expect(printFormula({ kind: "and_formula", operands: "nope" })).toBe("()");
    let deep: Record<string, unknown> = { kind: "truth_constant_formula", value: "true" };
    for (let i = 0; i < 100; i += 1) deep = { kind: "not_formula", operand: deep };
    expect(printFormula(deep)).toMatch(/^¬+…$/);
    expect(printShort("x".repeat(500), 20)).toHaveLength(20);
  });
});

describe("over the imported fixture", () => {
  let input: RendererInput;
  beforeAll(async () => {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    await importTransfer(host, importLkbJson(fixtureDocument(), { workbookId: "lkb-render" }));
    const slice = host.getProject("lkb-render");
    input = {
      workbookId: "lkb-render",
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(PROFILE_ID),
      renderedAt: "2026-09-04T12:00:00.000Z",
    };
  });

  it("lkb:TheoryRenderer lists the document and reports the document check", () => {
    const out = renderTheory(input);
    expect(out.contentType).toBe("text/markdown");
    const md = text(out);
    expect(md.startsWith("# Socrates\n")).toBe(true);
    expect(md).toContain("The workbook assembles into a document the LogicalKnowledgeBase schema accepts.");
    expect(md).toContain("## Rules (2)");
    expect(md).toContain("- body: pred:Human(x)");
    expect(md).toContain("- head: pred:Mortal(x)");
    expect(md).toContain("- priorityOver: rule:mortality");
    expect(md).toContain("| `pred:Human` | Human | (x: string) |");
    expect(md).toContain("∀x. (pred:Human(x) ⇒ pred:Mortal(x))");
    expect(md).toContain("### `proof:socrates` — proof_tree");
    expect(md).toContain("- steps (3):");
    expect(md).toContain("| `arg:syllogism` | stmt:socrates-human, rule:mortality | claim:mortal | modus ponens |");
    expect(md).toContain("attack_relation (rebuttal)");
    expect(md).toContain("| `af:main` | grounded | 3 | 3 | arg:syllogism | arg:syllogism |");
    expect(md).toContain("`trg:start` trigger when pred:... → seq:main".replace("pred:...", "prop:rain"));
    expect(md).toContain("| `ext:foaf` | https://xmlns.com/foaf/0.1/ |");
    expect(md).toContain("Rendered 2026-09-04T12:00:00.000Z");
  });

  it("lkb:TheoryRenderer surfaces a broken document instead of hiding it", () => {
    const stmt = input.primitives.find((p) => p.type_id === "lkb:AssertionStatement")!;
    const broken = {
      ...input,
      primitives: input.primitives.map((p) =>
        p === stmt ? { ...p, field_values: { ...p.field_values, formula: pred("pred:Nobody", []) } } : p,
      ),
    };
    const md = text(renderTheory(broken));
    expect(md).toMatch(/\*\*\d+ issue\(s\)\*\*/);
    expect(md).toContain("Unresolved local reference 'pred:Nobody'");
  });

  it("lkb:ArgumentGraphRenderer draws claims, the argument, the support and the attack", () => {
    const out = renderArgumentGraph(input);
    expect(out.contentType).toBe("image/svg+xml");
    const svg = text(out);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    // The argument's premises are a statement and a rule, which are not
    // graph nodes; its conclusion, the support and the two attacks are the edges.
    expect(svg).toContain("2 claims, 1 arguments, 4 edges · grounded: 1 in, 0 out, 2 undecided");
    expect(svg).toContain("claim · accepted · grounded: undec");
    expect(svg).toContain("claim · rejected · grounded: undec");
    expect(svg).toContain("argument · grounded: in");
    expect(svg).toContain('stroke-dasharray="4 3"');
    expect(svg).toContain("modus ponens");
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain(">rebuttal<");
    expect((svg.match(/<rect /g) ?? []).length).toBe(4); // paper + 3 nodes (the framework is not a node)
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("is deterministic", () => {
    expect(text(renderTheory(input))).toBe(text(renderTheory(input)));
    expect(text(renderArgumentGraph(input))).toBe(text(renderArgumentGraph(input)));
  });
});

describe("acceptance states", () => {
  const profile = deriveProfile();
  for (const state of STATES) {
    it(`both renderers survive the '${state}' fixture`, async () => {
      const fixture = buildFixture(profile, state);
      const input: RendererInput = { workbookId: `acc-${state}`, profile, ...fixture };
      const md = renderTheory(input);
      expect((await structuralProblems(md, "text/markdown")).problems).toEqual([]);
      const svg = renderArgumentGraph(input);
      expect((await structuralProblems(svg, "image/svg+xml")).problems).toEqual([]);
      if (state === "empty") {
        expect(text(md)).toContain("No `lkb:LogicalKnowledgeBase` primitive");
        expect(text(svg)).toContain("No claims or arguments");
      }
    });
  }
});
