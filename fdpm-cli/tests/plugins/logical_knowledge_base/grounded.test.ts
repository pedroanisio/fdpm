/**
 * Dung's grounded semantics over declared frameworks: the textbook cases,
 * then the framework primitives the fixture builds.
 */
import { describe, expect, it } from "vitest";
import { frameworks, groundedLabelling, groundedResults, labellingByNode, type Attack } from "../../../plugins/logical_knowledge_base/grounded.js";
import { hostIdFor, referenceRelationId, typeIdFor } from "../../../plugins/logical_knowledge_base/derive.js";

const attack = (from: string, to: string, via = `${from}>${to}`): Attack => ({ from, to, via, kind: "attack_relation" });

describe("groundedLabelling", () => {
  it("accepts unattacked arguments and what they defend", () => {
    // a → b → c: a in, b out, c in (reinstated).
    const l = groundedLabelling(["a", "b", "c"], [attack("a", "b"), attack("b", "c")]);
    expect([...l]).toEqual([["a", "in"], ["b", "out"], ["c", "in"]]);
  });
  it("leaves mutual and odd-cycle attacks undecided", () => {
    const mutual = groundedLabelling(["a", "b"], [attack("a", "b"), attack("b", "a")]);
    expect([...mutual.values()]).toEqual(["undec", "undec"]);
    const odd = groundedLabelling(["a", "b", "c"], [attack("a", "b"), attack("b", "c"), attack("c", "a")]);
    expect([...odd.values()]).toEqual(["undec", "undec", "undec"]);
    // A defender outside the cycle breaks it: d → a makes a out, b in, c out.
    const broken = groundedLabelling(["a", "b", "c", "d"], [attack("a", "b"), attack("b", "c"), attack("c", "a"), attack("d", "a")]);
    expect([...broken]).toEqual([["a", "out"], ["b", "in"], ["c", "out"], ["d", "in"]]);
  });
  it("ignores attacks whose endpoints are not members and terminates on empty input", () => {
    expect([...groundedLabelling([], [])]).toEqual([]);
    expect([...groundedLabelling(["a"], [attack("x", "a")])]).toEqual([["a", "in"]]);
  });
});

describe("frameworks() over the graph", () => {
  const F = hostIdFor("argumentation_framework", "af:1");
  const A = hostIdFor("argument", "arg:a");
  const B = hostIdFor("argument", "arg:b");
  const C = hostIdFor("claim", "claim:c");
  const ATT = hostIdFor("attack_relation", "att:ab");
  const REB = hostIdFor("rebuttal", "reb:bc");
  const SUP = hostIdFor("support_relation", "sup:ac");
  const prim = (id: string, kind: string, fv: Record<string, unknown> = {}) => ({ id, type_id: typeIdFor(kind), field_values: { source_id: id, ...fv } });
  const rel = (source_id: string, field: string, target_id: string, position = 0) => ({ type_id: referenceRelationId(field), source_id, target_id, field_values: { resolution: "local", position } });
  const primitives = [
    prim(F, "argumentation_framework", { semantics: "grounded" }),
    prim(A, "argument"), prim(B, "argument"), prim(C, "claim", { status: "proposed" }),
    prim(ATT, "attack_relation", { attackKind: "generic" }), prim(REB, "rebuttal"), prim(SUP, "support_relation"),
  ];
  const relations = [
    rel(F, "argumentRefs", A, 0), rel(F, "argumentRefs", B, 1), rel(F, "argumentRefs", C, 2),
    rel(F, "relationRefs", ATT, 0), rel(F, "relationRefs", REB, 1), rel(F, "relationRefs", SUP, 2),
    rel(ATT, "attacker", A), rel(ATT, "attacked", B),
    rel(REB, "rebuttingClaim", B), rel(REB, "targetClaim", C),
    rel(SUP, "supporter", A), rel(SUP, "supported", C),
  ];

  it("reads members, attacks (not supports) and the declared acceptance set", () => {
    const [f] = frameworks(primitives, relations);
    expect(f!.members).toEqual([A, B, C]);
    expect(f!.attacks.map((a) => [a.kind, a.from, a.to])).toEqual([
      ["attack_relation", A, B],
      ["rebuttal", B, C],
    ]);
    expect(f!.declaredAccepted).toBeUndefined();
    const [r] = groundedResults(primitives, relations);
    expect(r!.accepted).toEqual([A, C]);
    expect(r!.disagreement).toBeUndefined();
    expect([...labellingByNode(primitives, relations)]).toEqual([[A, "in"], [B, "out"], [C, "in"]]);
  });

  it("reports the difference when the author's acceptedArguments disagree", () => {
    const declared = [...relations, rel(F, "acceptedArguments", B, 0), rel(F, "acceptedArguments", C, 1)];
    const [r] = groundedResults(primitives, declared);
    expect(r!.framework.declaredAccepted).toEqual([B, C]);
    expect(r!.disagreement).toEqual({ missing: [A], extra: [B] });
  });

  it("only computes for grounded semantics", () => {
    const preferred = primitives.map((p) => (p.id === F ? { ...p, field_values: { ...p.field_values, semantics: "preferred" } } : p));
    expect(groundedResults(preferred, relations)).toEqual([]);
    expect(frameworks(preferred, relations)[0]!.semantics).toBe("preferred");
  });
});
