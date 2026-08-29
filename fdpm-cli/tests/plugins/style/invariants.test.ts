/**
 * PALS's LAW control 4 — the failure-path suite.
 *
 * A verification layer with no failing-input test is unverified. Every
 * test below feeds malformed, incomplete or adversarial input and asserts
 * that it is REJECTED, naming the specific invariant that fires. A test
 * that only proves the happy path would prove nothing about the control.
 *
 * The three layers under test:
 *   1. `StyleRegistryInput`      — strict typed parse (unknown keys fail)
 *   2. `parseStyleRegistry`      — referential validity of the closed world
 *   3. `validateStyleWorkbook`   — the cross-entity invariants
 * plus the entity `superRefine`s, which are exercised directly.
 */
import { describe, expect, it } from "vitest";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  assertProjectionInvariants,
  parseStyleRegistry,
  projectStyleRegistry,
  StyleRegistryInput,
} from "../../../plugins/style/ingest.js";
import {
  contrastRatio,
  isHistoricalYear,
  relativeLuminance,
  validateStyleWorkbook,
  wcagMinimumContrast,
} from "../../../plugins/style/invariants.js";
import {
  ColorGrammar,
  ComplianceCheck,
  CompositionGrammar,
  IconographyGrammar,
  LineGrammar,
  MotionGrammar,
  Style,
  TypefaceSpec,
  isCanonicalCssTimingFunction,
} from "../../../plugins/style/schemas/style.js";
import { bauhausOf, registryWith, renameRule, validRegistry } from "./fixtures/registry.js";

type Json = Record<string, unknown>;

/** Run the whole ingest verification chain and return the thrown error. */
function rejectionOf(registry: unknown): FDPMException {
  try {
    const parsed = parseStyleRegistry(registry);
    assertProjectionInvariants(projectStyleRegistry(parsed));
  } catch (e) {
    return e as FDPMException;
  }
  throw new Error("expected the registry to be rejected, but it was accepted");
}

/** Every rule_id raised by the cross-entity invariants for a registry. */
function violationIds(registry: unknown): string[] {
  const parsed = parseStyleRegistry(registry);
  const p = projectStyleRegistry(parsed);
  const result = validateStyleWorkbook(
    p.primitives.map((x) => ({ id: x.id, type_id: x.type, field_values: x.fields })),
    p.relations.map((x) => ({ id: x.id, type_id: x.type, source_id: x.from, target_id: x.to, field_values: x.fields ?? {} })),
  );
  return result.violations.map((v) => v.rule_id);
}

// ═══════════════════════════════════════════════════════════════════════
// Baseline: the fixture must actually be valid, or every rejection test
// below proves nothing.
// ═══════════════════════════════════════════════════════════════════════

describe("the fixture registry", () => {
  it("passes the typed parse, the referential check and every invariant", () => {
    const parsed = parseStyleRegistry(validRegistry());
    const projection = projectStyleRegistry(parsed);
    const result = validateStyleWorkbook(
      projection.primitives.map((x) => ({ id: x.id, type_id: x.type, field_values: x.fields })),
      projection.relations.map((x) => ({
        id: x.id,
        type_id: x.type,
        source_id: x.from,
        target_id: x.to,
        field_values: x.fields ?? {},
      })),
    );
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("projects two styles, twenty grammar sections and the expected entity mix", () => {
    const projection = projectStyleRegistry(parseStyleRegistry(validRegistry()));
    expect(projection.styleIds).toHaveLength(2);
    expect(projection.byType["style:Style"]).toBe(2);
    expect(projection.byType["style:Movement"]).toBe(2);
    expect(projection.byType["style:LineGrammar"]).toBe(2);
    expect(projection.byType["style:ColorGrammar"]).toBe(2);
    expect(projection.byType["style:MotionGrammar"]).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 1 — typed parse. An unknown field is a rejection, not a shrug.
// ═══════════════════════════════════════════════════════════════════════

describe("layer 1: typed parse", () => {
  it("rejects an unknown top-level key rather than dropping it", () => {
    const r = registryWith((reg) => {
      (reg as Json).unexpectedKey = "silently ignored?";
    });
    expect(StyleRegistryInput.safeParse(r).success).toBe(false);
    expect(rejectionOf(r).category).toBe("verification");
  });

  it("rejects an unknown key nested inside a grammar section", () => {
    const r = registryWith((reg) => {
      const grammar = bauhausOf(reg).grammar as Json;
      (grammar.color as Json).madeUpField = true;
    });
    expect(rejectionOf(r).message).toContain("StyleRegistryInput");
  });

  it("rejects a missing required section", () => {
    const r = registryWith((reg) => {
      delete (bauhausOf(reg).grammar as Json).motion;
    });
    expect(rejectionOf(r).category).toBe("verification");
  });

  it("rejects a wholly malformed payload", () => {
    for (const bad of [null, undefined, 42, "a registry", [], { styles: "not an array" }]) {
      expect(() => parseStyleRegistry(bad)).toThrow(FDPMException);
    }
  });

  it("rejects a truncated registry — the partial-completion failure mode", () => {
    const r = registryWith((reg) => {
      delete (bauhausOf(reg) as Json).compliance;
    });
    expect(rejectionOf(r).category).toBe("verification");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 2 — the closed world. Every cross-reference resolves, or nothing
// is written.
// ═══════════════════════════════════════════════════════════════════════

describe("layer 2: closed-world referential validity", () => {
  it("rejects a parentMovement that names no movement in the registry", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).identity as Json).parentMovement = "no-such-movement";
    });
    expect(rejectionOf(r).message).toContain("not a movement in this registry");
  });

  it("rejects an influencedStyles pointer to a style outside the registry", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).identity as Json).influencedStyles = ["suprematism"];
    });
    expect(rejectionOf(r).message).toContain("not a style in this registry");
  });

  it("rejects an exemplar that is not a reference of the style", () => {
    const r = registryWith((reg) => {
      const line = (bauhausOf(reg).grammar as Json).line as Json;
      (line.rules as Json[])[0]!.exemplars = ["bau-nonexistent"];
    });
    expect(rejectionOf(r).message).toContain("is not a reference of this style");
  });

  it("rejects a check whose testsRule names no rule", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).compliance as Json as { checks: Json[] }).checks[0]!.testsRule = "BAU-L-99";
    });
    expect(rejectionOf(r).message).toContain("not a rule declared by this style's grammar");
  });

  it("rejects duplicate style ids", () => {
    const r = registryWith((reg) => {
      const styles = reg.styles as Json[];
      (styles[1]!.identity as Json).id = "bauhaus";
    });
    expect(rejectionOf(r).message).toContain("duplicate StyleId");
  });

  it("rejects duplicate movement ids", () => {
    const r = registryWith((reg) => {
      (reg.movements as Json[])[1]!.id = "modernism";
    });
    expect(rejectionOf(r).message).toContain("duplicate MovementId");
  });

  it("reports every finding, not just the first", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).identity as Json).parentMovement = "nope";
      (bauhausOf(reg).identity as Json).negatedMovements = ["also-nope", "still-nope"];
    });
    const err = rejectionOf(r);
    const findings = err.findings ?? [];
    expect(findings.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 3 — cross-entity invariants.
// ═══════════════════════════════════════════════════════════════════════

describe("layer 3: rules and compliance", () => {
  it("rejects a defining rule with no exemplar", () => {
    const r = registryWith((reg) => {
      delete ((bauhausOf(reg).grammar as Json).line as Json as { rules: Json[] }).rules[0]!.exemplars;
    });
    expect(violationIds(r)).toContain("style:inv.rule.defining-without-exemplar");
  });

  it("rejects a non-advisory rule with no compliance check", () => {
    const r = registryWith((reg) => {
      const compliance = bauhausOf(reg).compliance as { checks: Json[] };
      compliance.checks = compliance.checks.filter((c) => c.testsRule !== "BAU-F-01");
    });
    expect(violationIds(r)).toContain("style:inv.rule.uncovered-by-check");
  });

  it("accepts an advisory rule with no check — coverage is a non-advisory rule", () => {
    // BAU-CP-01 is advisory and deliberately uncovered in the fixture.
    expect(violationIds(validRegistry())).toEqual([]);
  });

  it("rejects a check whose weight differs from the rule it tests", () => {
    const r = registryWith((reg) => {
      const compliance = bauhausOf(reg).compliance as { checks: Json[] };
      compliance.checks.find((c) => c.id === "CC-BAU-05")!.weight = "advisory";
    });
    expect(violationIds(r)).toContain("style:inv.check.weight-misaligned");
  });

  it("rejects a prohibition that does not use the P-number form", () => {
    const r = registryWith((reg) => renameRule(bauhausOf(reg), "BAU-L-P01", "BAU-L-77"));
    expect(violationIds(r)).toContain("style:inv.rule.prohibition-p-form");
  });

  it("rejects a requirement that steals the P-number form", () => {
    const r = registryWith((reg) => renameRule(bauhausOf(reg), "BAU-F-01", "BAU-F-P09"));
    expect(violationIds(r)).toContain("style:inv.rule.requirement-p-form");
  });

  it("rejects a rule id outside its style's code namespace", () => {
    const r = registryWith((reg) => renameRule(bauhausOf(reg), "BAU-F-01", "XYZ-F-01"));
    expect(violationIds(r)).toContain("style:inv.rule.code-namespace");
  });

  it("rejects a rule id whose section letter contradicts its section", () => {
    const r = registryWith((reg) => renameRule(bauhausOf(reg), "BAU-F-01", "BAU-CT-01"));
    expect(violationIds(r)).toContain("style:inv.rule.section-namespace");
  });

  it("rejects a check id outside the CC-<CODE>- namespace", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).compliance as { checks: Json[] }).checks[0]!.id = "CC-XXX-01";
    });
    expect(violationIds(r)).toContain("style:inv.check.code-namespace");
  });
});

describe("layer 3: references", () => {
  it("rejects a style with no primary reference", () => {
    const r = registryWith((reg) => {
      const refs = bauhausOf(reg).references as Json;
      refs.secondary = refs.primary;
      refs.primary = [];
    });
    expect(violationIds(r)).toContain("style:inv.reference.primary-required");
  });

  it("rejects a style with no counter-example — boundary definition is mandatory", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).references as Json).counterExamples = [];
    });
    expect(violationIds(r)).toContain("style:inv.reference.counter-example-required");
  });

  it("rejects a reference id outside the lowercase style-code namespace", () => {
    const r = registryWith((reg) => {
      const refs = bauhausOf(reg).references as { primary: Json[] };
      refs.primary[1]!.id = "zz-bayer-universal";
      const typography = (bauhausOf(reg).grammar as Json).typography as { rules: Json[] };
      typography.rules[0]!.exemplars = ["zz-bayer-universal"];
      const color = (bauhausOf(reg).grammar as Json).color as { rules: Json[]; prohibitions: Json[] };
      color.rules[0]!.exemplars = ["zz-bayer-universal"];
      color.prohibitions[0]!.exemplars = ["zz-bayer-universal"];
    });
    expect(violationIds(r)).toContain("style:inv.reference.code-namespace");
  });

  it("rejects an exemplar that is only a counter-example", () => {
    const r = registryWith((reg) => {
      const line = (bauhausOf(reg).grammar as Json).line as { rules: Json[] };
      line.rules[0]!.exemplars = ["bau-victorian-ornament"];
    });
    expect(violationIds(r)).toContain("style:inv.rule.exemplar-unresolved");
  });

  it("rejects year zero, which the proleptic calendar does not have", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).references as { primary: Json[] }).primary[0]!.year = 0;
    });
    expect(violationIds(r)).toContain("style:inv.reference.invalid-year");
  });

  it("isHistoricalYear accepts negative years and rejects zero and fractions", () => {
    expect(isHistoricalYear(-450)).toBe(true);
    expect(isHistoricalYear(1919)).toBe(true);
    expect(isHistoricalYear(0)).toBe(false);
    expect(isHistoricalYear(1919.5)).toBe(false);
    expect(isHistoricalYear("1919")).toBe(false);
  });
});

describe("layer 3: forbidden colours", () => {
  it("rejects a forbidden colour whose prohibitedBy names no prohibition", () => {
    const r = registryWith((reg) => {
      const color = (bauhausOf(reg).grammar as Json).color as { forbiddenColors: Json[] };
      color.forbiddenColors[0]!.prohibitedBy = "BAU-C-P99";
    });
    expect(violationIds(r)).toContain("style:inv.color.forbidden-without-prohibition");
  });

  it("rejects a forbidden colour pointing at a prohibition in another section", () => {
    const r = registryWith((reg) => {
      const color = (bauhausOf(reg).grammar as Json).color as { forbiddenColors: Json[] };
      color.forbiddenColors[0]!.prohibitedBy = "BAU-L-P01";
    });
    expect(violationIds(r)).toContain("style:inv.color.forbidden-without-prohibition");
  });
});

describe("layer 3: grammar ↔ token coherence", () => {
  it("rejects animated motion grammar with an omitted motion token section", () => {
    const r = registryWith((reg) => {
      const motion = (bauhausOf(reg).grammar as Json).motion as Json;
      motion.kind = "animated";
      motion.character = "mechanical";
      motion.usesSquashStretch = false;
      motion.usesMotionBlur = false;
      motion.usesKineticMarks = false;
    });
    expect(violationIds(r)).toContain("style:inv.coherence.motion-kind");
  });

  it("rejects declared typefaces with an omitted typography token section", () => {
    const r = registryWith((reg) => {
      ((bauhausOf(reg).tokens as Json).typography as Json) = { kind: "omitted" };
      (bauhausOf(reg).tokens as Json).typography = { kind: "omitted" };
    });
    const ids = violationIds(r);
    expect(ids).toContain("style:inv.coherence.typography-omitted");
  });

  it("rejects a typeface role with no matching font stack", () => {
    const r = registryWith((reg) => {
      const typography = (bauhausOf(reg).tokens as Json).typography as { fontStacks: Json };
      delete (typography.fontStacks as Json).body;
    });
    expect(violationIds(r)).toContain("style:inv.coherence.font-stack-missing");
  });

  it("rejects a weight step in a typeface range with no weight-map entry", () => {
    const r = registryWith((reg) => {
      const typography = (bauhausOf(reg).tokens as Json).typography as { weightMap: Json };
      delete (typography.weightMap as Json)["5"];
    });
    expect(violationIds(r)).toContain("style:inv.coherence.weight-map-missing");
  });

  it("rejects a non-empty palette with omitted colour tokens", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).tokens as Json).colors = { kind: "omitted" };
      (bauhausOf(reg).tokens as Json).accessibility = { kind: "omitted" };
    });
    expect(violationIds(r)).toContain("style:inv.coherence.colors-omitted");
  });

  it("rejects abstract Length use with an omitted spacing section", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).tokens as Json).spacing = { kind: "omitted" };
      (bauhausOf(reg).tokens as Json).shape = { kind: "omitted" };
    });
    expect(violationIds(r)).toContain("style:inv.coherence.spacing-omitted");
  });

  it("rejects bimodal tonal range against continuous shading", () => {
    const r = registryWith((reg) => {
      const color = (bauhausOf(reg).grammar as Json).color as Json;
      color.lighting = { kind: "rendered", sources: ["cast"], treatment: "soft-gradient" };
    });
    expect(violationIds(r)).toContain("style:inv.coherence.bimodal-continuous-shading");
  });

  it("rejects bimodal tonal range against full-pbr lighting", () => {
    const r = registryWith((reg) => {
      const color = (bauhausOf(reg).grammar as Json).color as Json;
      color.lighting = { kind: "full-pbr" };
    });
    expect(violationIds(r)).toContain("style:inv.coherence.bimodal-continuous-shading");
  });

  it("accepts bimodal against a non-continuous rendered treatment", () => {
    const r = registryWith((reg) => {
      const color = (bauhausOf(reg).grammar as Json).color as Json;
      color.lighting = { kind: "rendered", sources: ["cast"], treatment: "spot-black" };
    });
    expect(violationIds(r)).not.toContain("style:inv.coherence.bimodal-continuous-shading");
  });
});

describe("layer 3: the stroke-weight derivation", () => {
  it("rejects a stroke weight that is not weight × base unit", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).tokens as Json as { shape: Json }).shape.strokeWeight = 3;
    });
    expect(violationIds(r)).toContain("style:inv.derivation.stroke-weight-uniform");
  });

  it("accepts a stroke weight inside the floating-point tolerance", () => {
    const r = registryWith((reg) => {
      // 0.125 × 8 = 1; nudge by less than derivationToleranceRatio.
      (bauhausOf(reg).tokens as Json as { shape: Json }).shape.strokeWeight = 1 + 1e-9;
    });
    expect(violationIds(r)).not.toContain("style:inv.derivation.stroke-weight-uniform");
  });

  it("requires a zero stroke weight when the grammar declares no lines", () => {
    const r = registryWith((reg) => {
      const line = (bauhausOf(reg).grammar as Json).line as Json;
      line.kind = "no-lines";
      delete line.stroke;
      delete line.strokeRoles;
      delete line.quality;
      delete line.contourHierarchy;
    });
    expect(violationIds(r)).toContain("style:inv.derivation.stroke-weight-no-lines");
  });

  it("checks a variable stroke against its band, not a point value", () => {
    const widen = (strokeWeight: number) =>
      registryWith((reg) => {
        const line = (bauhausOf(reg).grammar as Json).line as Json;
        line.stroke = { kind: "calligraphic", weightMin: 0.125, weightMax: 0.5 };
        (bauhausOf(reg).tokens as Json as { shape: Json }).shape.strokeWeight = strokeWeight;
      });
    // Band is [1, 4] px at baseUnit 8.
    expect(violationIds(widen(2))).not.toContain("style:inv.derivation.stroke-weight-band");
    expect(violationIds(widen(9))).toContain("style:inv.derivation.stroke-weight-band");
    expect(violationIds(widen(0.5))).toContain("style:inv.derivation.stroke-weight-band");
  });
});

describe("layer 3: the WCAG contrast contract", () => {
  it("rejects a pair whose contrast is below the declared level's minimum", () => {
    const r = registryWith((reg) => {
      const tokens = (bauhausOf(reg).tokens as Json).colors as { tokens: Json };
      // #767676 on white is ~4.54:1 — passes AA normal text. #949494 does not.
      tokens.tokens.ink = "#949494";
    });
    expect(violationIds(r)).toContain("style:inv.wcag.below-minimum");
  });

  it("rejects a pair naming a colour token that does not exist", () => {
    const r = registryWith((reg) => {
      const acc = (bauhausOf(reg).tokens as Json).accessibility as { contrastPairs: Json[] };
      acc.contrastPairs[0]!.foreground = "not-a-token";
    });
    expect(violationIds(r)).toContain("style:inv.wcag.token-unresolved");
  });

  it("rejects a translucent colour — WCAG contrast is undefined for it", () => {
    const r = registryWith((reg) => {
      const tokens = (bauhausOf(reg).tokens as Json).colors as { tokens: Json };
      tokens.tokens.ink = "#1A1A1A80";
    });
    expect(violationIds(r)).toContain("style:inv.wcag.translucent-token");
  });

  it("rejects a pair whose foreground and background are the same token", () => {
    const r = registryWith((reg) => {
      const acc = (bauhausOf(reg).tokens as Json).accessibility as { contrastPairs: Json[] };
      acc.contrastPairs[0]!.background = "ink";
    });
    expect(violationIds(r)).toContain("style:inv.wcag.same-token");
  });

  it("computes the normative ratio: black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("returns the W3C relative luminance for the axis endpoints", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#1A1A1A80")).toBeUndefined();
    expect(relativeLuminance("not a colour")).toBeUndefined();
  });

  it("serves the normative minima and never widens them", () => {
    expect(wcagMinimumContrast("aa", "normal-text")).toBe(4.5);
    expect(wcagMinimumContrast("aa", "large-text")).toBe(3.0);
    expect(wcagMinimumContrast("aa", "ui-component")).toBe(3.0);
    expect(wcagMinimumContrast("aaa", "normal-text")).toBe(7.0);
    expect(wcagMinimumContrast("aaa", "large-text")).toBe(4.5);
    // SC 1.4.11 has no AAA strengthening.
    expect(wcagMinimumContrast("aaa", "ui-component")).toBe(3.0);
  });
});

describe("layer 3: registry topology", () => {
  it("rejects a movement parent cycle — the graph must be a forest", () => {
    const r = registryWith((reg) => {
      const movements = reg.movements as Json[];
      movements[0]!.parentMovement = "historicism";
      movements[1]!.parentMovement = "modernism";
    });
    expect(violationIds(r)).toContain("style:inv.movement.parent-cycle");
  });

  it("rejects two styles sharing a code, which namespaces rule ids", () => {
    const r = registryWith((reg) => {
      const styles = reg.styles as Json[];
      (styles[1]!.identity as Json).code = "BAU";
    });
    expect(violationIds(r)).toContain("style:inv.registry.duplicate-style-code");
  });

  it("permits an influence cycle, which GRAPH_TOPOLOGY declares attested", () => {
    const r = registryWith((reg) => {
      const styles = reg.styles as Json[];
      (styles[1]!.identity as Json).influencedStyles = ["bauhaus"];
    });
    // bauhaus -> de-stijl -> bauhaus. Not an error.
    expect(violationIds(r)).toEqual([]);
  });

  it("rejects a self-influence edge, which no topology permits", () => {
    const r = registryWith((reg) => {
      (bauhausOf(reg).identity as Json).influencedStyles = ["bauhaus", "de-stijl"];
    });
    expect(violationIds(r)).toContain("style:inv.style.self-influence");
  });

  it("rejects a grammar section declared twice", () => {
    const violations = validateStyleWorkbook(
      [
        { id: "style:Style:x", type_id: "style:Style", field_values: { code: "XX" } },
        { id: "style:LineGrammar:a", type_id: "style:LineGrammar", field_values: {} },
        { id: "style:LineGrammar:b", type_id: "style:LineGrammar", field_values: {} },
      ],
      [
        { id: "r1", type_id: "style:HasGrammar", source_id: "style:Style:x", target_id: "style:LineGrammar:a", field_values: { section: "line" } },
        { id: "r2", type_id: "style:HasGrammar", source_id: "style:Style:x", target_id: "style:LineGrammar:b", field_values: { section: "line" } },
      ],
    ).violations.map((v) => v.rule_id);
    expect(violations).toContain("style:inv.grammar.section-duplicated");
    expect(violations).toContain("style:inv.grammar.section-missing");
  });

  it("rejects a HasGrammar edge whose section contradicts the target type", () => {
    const violations = validateStyleWorkbook(
      [
        { id: "style:Style:x", type_id: "style:Style", field_values: { code: "XX" } },
        { id: "style:ColorGrammar:c", type_id: "style:ColorGrammar", field_values: {} },
      ],
      [
        { id: "r1", type_id: "style:HasGrammar", source_id: "style:Style:x", target_id: "style:ColorGrammar:c", field_values: { section: "line" } },
      ],
    ).violations.map((v) => v.rule_id);
    expect(violations).toContain("style:inv.grammar.section-type-mismatch");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Entity superRefines — the arm discipline that replaces the source's 47
// discriminated unions.
// ═══════════════════════════════════════════════════════════════════════

describe("union flattening: arms stay disjoint", () => {
  const line = (over: Json) =>
    LineGrammar.safeParse({ grammar_id: "g", kind: "lines", stroke_kind: "uniform", stroke_weight: 1, stroke_roles: ["contour"], quality: "clean", contour_hierarchy: "uniform", ...over });

  it("accepts a well-formed uniform line grammar", () => {
    expect(line({}).success).toBe(true);
  });

  it("rejects a no-lines grammar carrying stroke fields", () => {
    const r = LineGrammar.safeParse({ grammar_id: "g", kind: "no-lines", stroke_weight: 2 });
    expect(r.success).toBe(false);
  });

  it("rejects a uniform stroke carrying a min/max band", () => {
    expect(line({ stroke_weight_min: 1, stroke_weight_max: 3 }).success).toBe(false);
  });

  it("rejects a variable stroke carrying a point weight", () => {
    expect(line({ stroke_kind: "calligraphic", stroke_weight_min: 1, stroke_weight_max: 3 }).success).toBe(false);
  });

  it("rejects an inverted stroke band", () => {
    const r = LineGrammar.safeParse({
      grammar_id: "g",
      kind: "lines",
      stroke_kind: "expressive",
      stroke_weight_min: 4,
      stroke_weight_max: 1,
      stroke_roles: ["contour"],
      quality: "brush",
      contour_hierarchy: "uniform",
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate stroke roles", () => {
    expect(line({ stroke_roles: ["contour", "contour"] }).success).toBe(false);
  });

  it("rejects an empty stroke-role set on a line-bearing grammar", () => {
    expect(line({ stroke_roles: [] }).success).toBe(false);
  });

  it("rejects a static motion grammar carrying animated fields", () => {
    expect(MotionGrammar.safeParse({ grammar_id: "g", kind: "static", character: "snappy" }).success).toBe(false);
  });

  it("rejects an animated motion grammar missing its fields", () => {
    expect(MotionGrammar.safeParse({ grammar_id: "g", kind: "animated", character: "snappy" }).success).toBe(false);
  });

  it("rejects a modular grid without columns", () => {
    const r = CompositionGrammar.safeParse({
      grammar_id: "g",
      layout_kind: "modular-grid",
      layout_gutter: 2,
      hierarchy_methods: ["size"],
      negative_space: "functional",
      permits_bleed: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a degenerate diagonal layout at 0 and ±90 degrees", () => {
    const diagonal = (angle: number) =>
      CompositionGrammar.safeParse({
        grammar_id: "g",
        layout_kind: "diagonal",
        layout_angle_degrees: angle,
        hierarchy_methods: ["size"],
        negative_space: "functional",
        permits_bleed: false,
      }).success;
    expect(diagonal(45)).toBe(true);
    expect(diagonal(-30)).toBe(true);
    expect(diagonal(0)).toBe(false);
    expect(diagonal(90)).toBe(false);
    expect(diagonal(-90)).toBe(false);
    expect(diagonal(120)).toBe(false);
  });

  it("rejects a threshold check missing its threshold, and a binary one carrying it", () => {
    const base = { check_id: "CC-BAU-01", description: "d", weight: "strong" as const };
    expect(ComplianceCheck.safeParse({ ...base, kind: "threshold" }).success).toBe(false);
    expect(
      ComplianceCheck.safeParse({
        ...base,
        kind: "binary",
        threshold_metric: "m",
        threshold_operator: ">=",
        threshold_value: 1,
      }).success,
    ).toBe(false);
    expect(ComplianceCheck.safeParse({ ...base, kind: "qualitative" }).success).toBe(false);
    expect(ComplianceCheck.safeParse({ ...base, kind: "binary" }).success).toBe(true);
  });

  it("rejects a threshold unit on a non-threshold check", () => {
    expect(
      ComplianceCheck.safeParse({
        check_id: "CC-BAU-01",
        description: "d",
        weight: "strong",
        kind: "binary",
        threshold_unit: "px",
      }).success,
    ).toBe(false);
  });

  it("rejects a rendered colour section with no tokens", () => {
    const r = ColorGrammar.safeParse({
      grammar_id: "g",
      application_methods: ["flat"],
      gradients: "forbidden",
      lighting_kind: "rendered",
      palette: [],
      forbidden_colors: [],
      palette_derivation_rule: null,
      color_relationships: ["arbitrary"],
      palette_limit_kind: "unlimited",
    });
    // lighting "rendered" needs sources + treatment, and an empty palette
    // needs a derivation rule.
    expect(r.success).toBe(false);
  });

  it("rejects a palette larger than its declared cap", () => {
    const r = ColorGrammar.safeParse({
      grammar_id: "g",
      application_methods: ["flat"],
      gradients: "forbidden",
      lighting_kind: "none",
      palette: [
        { name: "a", hex: "#000000", role: "primary" },
        { name: "b", hex: "#111111", role: "accent" },
      ],
      forbidden_colors: [],
      palette_derivation_rule: null,
      color_relationships: ["arbitrary"],
      palette_limit_kind: "capped",
      palette_limit_max: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("intra-entity invariants", () => {
  it("rejects a weight range that overflows the 1..9 step domain", () => {
    expect(
      TypefaceSpec.safeParse({
        role: "heading",
        classification: "latin-geometric-sans",
        exemplars: [],
        weight_min: 8,
        weight_span: 4,
        permits_italic: false,
        casing: "free",
      }).success,
    ).toBe(false);
  });

  it("rejects a subgenre breakdown whose primary contradicts the headline", () => {
    const r = IconographyGrammar.safeParse({
      grammar_id: "g",
      motifs: [],
      figure_treatment: "idealized",
      figure_treatments_by_subgenre: [
        { subgenre: "bijin-ga", treatment: "realistic", dominance: "primary" },
        { subgenre: "yakusha-e", treatment: "caricatured", dominance: "minority" },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a subgenre breakdown with no primary, or two", () => {
    const withDominance = (a: string, b: string) =>
      IconographyGrammar.safeParse({
        grammar_id: "g",
        motifs: [],
        figure_treatment: "idealized",
        figure_treatments_by_subgenre: [
          { subgenre: "x", treatment: "idealized", dominance: a },
          { subgenre: "y", treatment: "idealized", dominance: b },
        ],
      }).success;
    expect(withDominance("minority", "minority")).toBe(false);
    expect(withDominance("primary", "primary")).toBe(false);
    expect(withDominance("primary", "minority")).toBe(true);
  });

  it("rejects provenance whose modification predates its creation", () => {
    const style = (over: Json) =>
      Style.safeParse({
        ...minimalStyle(),
        provenance: {
          created_by: "a",
          created_at: "2026-08-28T00:00:00Z",
          ...over,
        },
      }).success;
    expect(style({})).toBe(true);
    expect(style({ modified_by: "b", modified_at: "2020-01-01T00:00:00Z" })).toBe(false);
    // both-or-neither
    expect(style({ modified_by: "b" })).toBe(false);
    expect(style({ modified_at: "2027-01-01T00:00:00Z" })).toBe(false);
  });

  it("rejects a document from an unsupported schema major", () => {
    expect(Style.safeParse({ ...minimalStyle(), schema_version: "4.0.0" }).success).toBe(false);
    expect(Style.safeParse({ ...minimalStyle(), schema_version: "3.9.1" }).success).toBe(true);
  });

  it("rejects a closed period whose end precedes its start", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      period: { kind: "closed", start: 1933, end: 1919 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a WCAG contract with no pairs — an unfalsifiable claim", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_colors_kind: "rendered",
      tokens_colors: [{ name: "ink", value: "#000000" }],
      tokens_accessibility_kind: "wcag",
      tokens_accessibility_version: "2.1",
      tokens_accessibility_level: "aa",
      tokens_contrast_pairs: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a ui-component pair under a WCAG 2.0 contract (SC 1.4.11 postdates it)", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_colors_kind: "rendered",
      tokens_colors: [
        { name: "ink", value: "#000000" },
        { name: "paper", value: "#FFFFFF" },
      ],
      tokens_accessibility_kind: "wcag",
      tokens_accessibility_version: "2.0",
      tokens_accessibility_level: "aa",
      tokens_contrast_pairs: [{ foreground: "ink", background: "paper", usage: "ui-component" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a prompt fragment beyond the 1000-code-point cap", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_prompt_kind: "rendered",
      tokens_prompt_positive: "a".repeat(1001),
      tokens_prompt_negative: "",
    });
    expect(r.success).toBe(false);
  });

  it("counts the prompt cap in code points, not UTF-16 units", () => {
    // 600 astral-plane characters = 600 code points but 1200 UTF-16 units.
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_prompt_kind: "rendered",
      tokens_prompt_positive: "𝔘".repeat(600),
      tokens_prompt_negative: "",
    });
    expect(r.success).toBe(true);
  });

  it("requires all three line heights when typography renders", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_typography_kind: "rendered",
      tokens_font_stacks: [{ role: "body", stack: "Futura" }],
      tokens_scale: [{ name: "base", value: 16 }],
      tokens_line_heights: [{ name: "base", value: 1.5 }],
      tokens_letter_spacing: [],
      tokens_weight_map: [{ step: 4, weight: 400 }],
    });
    expect(r.success).toBe(false);
  });

  it("requires a timing entry for every motion character when motion renders", () => {
    const r = Style.safeParse({
      ...minimalStyle(),
      tokens_motion_kind: "rendered",
      tokens_timing_map: [{ character: "mechanical", timing: "linear" }],
      tokens_default_duration_ms: 200,
    });
    expect(r.success).toBe(false);
  });

  it("accepts only canonical CSS timing functions", () => {
    expect(isCanonicalCssTimingFunction("ease-in-out")).toBe(true);
    expect(isCanonicalCssTimingFunction("cubic-bezier(0.4,0,0.2,1)")).toBe(true);
    // Interior whitespace is not canonical.
    expect(isCanonicalCssTimingFunction("cubic-bezier(0.4, 0, 0.2, 1)")).toBe(false);
    // x coordinates must lie in [0, 1]; y may overshoot.
    expect(isCanonicalCssTimingFunction("cubic-bezier(0,-0.5,1,1.5)")).toBe(true);
    expect(isCanonicalCssTimingFunction("cubic-bezier(1.5,0,0.2,1)")).toBe(false);
    expect(isCanonicalCssTimingFunction("springy")).toBe(false);
  });
});

/** The smallest Style that parses, for isolating one refinement at a time. */
function minimalStyle(): Json {
  return {
    style_id: "test-style",
    schema_version: "3.1.0",
    locale: "en-US",
    code: "TST",
    name: "Test",
    aliases: [],
    period: { kind: "open", start: 1900 },
    geographic_centers: [],
    origin_medium: { kind: "single", family: "digital" },
    provenance: { created_by: "t", created_at: "2026-08-28T00:00:00Z" },
    ornament_stance: "prohibited",
    machine_attitude: "collaborative",
    form_function_relation: "form-follows-function",
    human_relation: "body-conforming",
    axioms: [{ statement: "s", source: "src" }],
    minimum_pass_ratio: 0.8,
    tokens_colors_kind: "omitted",
    tokens_typography_kind: "omitted",
    tokens_spacing_kind: "omitted",
    tokens_shape_kind: "omitted",
    tokens_motion_kind: "omitted",
    tokens_prompt_kind: "omitted",
    tokens_accessibility_kind: "omitted",
  };
}
