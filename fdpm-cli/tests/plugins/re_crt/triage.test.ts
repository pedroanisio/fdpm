import { describe, expect, it } from "vitest";
import { classifyOpenLeaves, type TriageInput } from "../../../plugins/re_crt/triage.js";

/**
 * §4.9 open-leaf triage — the grounded labelling of the induced argumentation
 * framework (Dung 1995; Caminada 2006).
 *
 * This is the reason the plugin exists. In the source ontology the same
 * classification is defined in OWL through `recrt:UndefeatedActiveBarrier`,
 * which is an `owl:complementOf`; "no bypass defeats this barrier" is not
 * provable under the open-world assumption, so the triage derives nothing on
 * open data — a leaf reaches the helper class `BlockedOpen` and stops. A
 * workbook is a closed graph, so the same question is simply decidable here.
 *
 * The 5.0 bug the ontology's 6.0 release exists to correct is the acceptance
 * criterion: reinstatement is UNIVERSAL. A leaf blocked by two barriers with
 * only one defeated stays blocked. An existential test ("some bypass targets
 * the leaf") calls it bypassed, which is unsound.
 */

const leaf = (id: string) => ({ id, kind: "open" as const });
const barrier = (id: string, type: "barrier" | "conditional_barrier" | "bypass" | "open_bypass") => ({
  id,
  obstructionType: type,
});

/** Two barriers explain the leaf; only b1 is defeated. */
const PARTIALLY_DEFEATED: TriageInput = {
  openLeaves: [leaf("n:leaf")],
  obstructions: [
    barrier("o:b1", "barrier"),
    barrier("o:b2", "barrier"),
    barrier("o:y1", "bypass"),
  ],
  explainedByBarrier: [
    { leaf: "n:leaf", barrier: "o:b1" },
    { leaf: "n:leaf", barrier: "o:b2" },
  ],
  bypassDefeatsBarrier: [{ bypass: "o:y1", barrier: "o:b1" }],
};

describe("classifyOpenLeaves — §4.9 grounded triage", () => {
  it("classifies every open leaf, leaving none unlabelled", () => {
    const out = classifyOpenLeaves(PARTIALLY_DEFEATED);
    expect(out.size).toBe(1);
    expect([...out.values()].every((s) => s !== undefined)).toBe(true);
  });

  /* The 5.0 defect, as an executable case. An existential reading returns
     "blocked_but_bypassed" here and sends a researcher at a leaf that is
     still firmly blocked by b2. */
  it("keeps a leaf blocked when only some of its barriers are defeated", () => {
    expect(classifyOpenLeaves(PARTIALLY_DEFEATED).get("n:leaf")).toBe("blocked_no_bypass");
  });

  it("reinstates a leaf only when every explaining barrier is defeated", () => {
    const out = classifyOpenLeaves({
      ...PARTIALLY_DEFEATED,
      bypassDefeatsBarrier: [
        { bypass: "o:y1", barrier: "o:b1" },
        { bypass: "o:y1", barrier: "o:b2" },
      ],
    });
    expect(out.get("n:leaf")).toBe("blocked_but_bypassed");
  });

  it("reports a leaf no active barrier explains as unblocked", () => {
    const out = classifyOpenLeaves({
      openLeaves: [leaf("n:leaf")],
      obstructions: [],
      explainedByBarrier: [],
      bypassDefeatsBarrier: [],
    });
    expect(out.get("n:leaf")).toBe("unblocked");
  });

  /* Only barriers block. A δ edge pointing at a bypass is a data error the
     host's endpoint typing cannot catch, because both ends are
     recrt:ObstructionNode — the distinction is a field value. It must not
     silently make the leaf look blocked. */
  it("ignores a delta edge that points at a bypass rather than a barrier", () => {
    const out = classifyOpenLeaves({
      openLeaves: [leaf("n:leaf")],
      obstructions: [barrier("o:y1", "bypass")],
      explainedByBarrier: [{ leaf: "n:leaf", barrier: "o:y1" }],
      bypassDefeatsBarrier: [],
    });
    expect(out.get("n:leaf")).toBe("unblocked");
  });

  /* Defeat is bipartite in 6.1: only a VALIDATED bypass defeats. An
     open_bypass records a potential defeat and must not reinstate. */
  it("does not let an unvalidated open_bypass reinstate a leaf", () => {
    const out = classifyOpenLeaves({
      openLeaves: [leaf("n:leaf")],
      obstructions: [barrier("o:b1", "barrier"), barrier("o:oy", "open_bypass")],
      explainedByBarrier: [{ leaf: "n:leaf", barrier: "o:b1" }],
      bypassDefeatsBarrier: [{ bypass: "o:oy", barrier: "o:b1" }],
    });
    expect(out.get("n:leaf")).toBe("blocked_no_bypass");
  });

  it("treats a conditional_barrier as active", () => {
    const out = classifyOpenLeaves({
      openLeaves: [leaf("n:leaf")],
      obstructions: [barrier("o:cb", "conditional_barrier")],
      explainedByBarrier: [{ leaf: "n:leaf", barrier: "o:cb" }],
      bypassDefeatsBarrier: [],
    });
    expect(out.get("n:leaf")).toBe("blocked_no_bypass");
  });

  /* A defeat cycle forces the grounded labelling's 'undec' status, which the
     three-way partition cannot represent. The ontology forbids cycles with a
     SHACL shape and declares recrt:UndecidedOpen as the documented
     failure-mode target; the classifier must report it rather than loop. */
  it("reports undecided rather than looping when defeat cycles", () => {
    const out = classifyOpenLeaves({
      openLeaves: [leaf("n:leaf")],
      obstructions: [
        barrier("o:b1", "barrier"),
        barrier("o:y1", "bypass"),
        barrier("o:y2", "bypass"),
      ],
      explainedByBarrier: [{ leaf: "n:leaf", barrier: "o:b1" }],
      bypassDefeatsBarrier: [
        { bypass: "o:y1", barrier: "o:b1" },
        { bypass: "o:y1", barrier: "o:y2" },
        { bypass: "o:y2", barrier: "o:y1" },
      ],
    });
    expect(out.get("n:leaf")).toBe("undecided");
  });

  it("is deterministic across runs on the same input", () => {
    const a = [...classifyOpenLeaves(PARTIALLY_DEFEATED).entries()];
    const b = [...classifyOpenLeaves(PARTIALLY_DEFEATED).entries()];
    expect(a).toEqual(b);
  });
});
