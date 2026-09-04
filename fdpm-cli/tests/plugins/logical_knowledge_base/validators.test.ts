/**
 * Every validator has a failing-input test (PALS's LAW control 4), first
 * as a unit against a constructed ValidatorContext, then through the host's
 * pipeline for the two rules whose value is that they run at write time:
 * node shape (the expression language) and the priority cycle.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import type { ValidatorContext } from "../../../src/plugin/types.js";
import {
  EXTERNAL_TARGET_TYPE_ID,
  HEADER_TYPE_ID,
  PROFILE_ID,
  STEP_RELATION_ID,
  hostIdFor,
  referenceRelationId,
  typeIdFor,
} from "../../../plugins/logical_knowledge_base/derive.js";
import {
  VALIDATOR_RULE_IDS,
  __validators as v,
  matchesTargetFamily,
} from "../../../plugins/logical_knowledge_base/validators.js";
import { pred, constTerm, varTerm } from "./_fixture.js";

const UID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const prim = (id: string, type_id: string, field_values: Record<string, unknown>): PrimitiveInstance =>
  ({ id, uid: UID, type_id, field_values, revision: 0 }) as PrimitiveInstance;
const rel = (id: string, type_id: string, source_id: string, target_id: string, field_values: Record<string, unknown> = {}): RelationInstance =>
  ({ id, uid: UID, type_id, source_id, target_id, field_values, revision: 0 }) as RelationInstance;
const ctxOf = (primitives: PrimitiveInstance[], relations: RelationInstance[] = []): ValidatorContext => ({
  relations,
  workbook: {
    primitives: Object.fromEntries(primitives.map((p) => [p.id, p])),
    relations: Object.fromEntries(relations.map((r) => [r.id, r])),
  },
});
const run = async (fn: (...a: unknown[]) => unknown, instance: unknown, ctx?: ValidatorContext) =>
  (await (fn as (i: unknown, t?: unknown, p?: unknown, c?: ValidatorContext) => unknown)(instance, undefined, undefined, ctx)) as { rule_id: string; level: string; message: string }[];

const HUMAN = prim(hostIdFor("predicate_declaration", "pred:Human"), typeIdFor("predicate_declaration"), {
  source_id: "pred:Human", name: "Human", arity: 1, parameters: [{ name: "x", type: { kind: "primitive_type", name: "string" } }],
});
const AGE = prim(hostIdFor("function_declaration", "fn:age"), typeIdFor("function_declaration"), {
  source_id: "fn:age", name: "age", arity: 1, parameters: [{ name: "x", type: { kind: "primitive_type", name: "string" } }], returnType: { kind: "primitive_type", name: "string" },
});
const SOCRATES = prim(hostIdFor("constant_declaration", "const:socrates"), typeIdFor("constant_declaration"), {
  source_id: "const:socrates", name: "socrates", valueType: { kind: "primitive_type", name: "string" },
});
const HEADER = prim(hostIdFor("logical_knowledge_base", "kb:t"), HEADER_TYPE_ID, { source_id: "kb:t", schemaVersion: "1.0.0", semanticModelVersion: "1.0.0" });
const claim = (id: string, formula: unknown) => prim(hostIdFor("claim", id), typeIdFor("claim"), { source_id: id, formula, status: "proposed" });

describe("lkb:val:node-shape — the arm schema over the stored fields", () => {
  it("accepts a schema-shaped node and rejects an unknown field, a bad enum and a malformed formula", async () => {
    expect(await run(v.nodeShape, HUMAN)).toEqual([]);
    const unknownField = prim("x", typeIdFor("predicate_declaration"), { ...HUMAN.field_values, invented: 1 });
    expect((await run(v.nodeShape, unknownField)).map((f) => f.rule_id)).toEqual([VALIDATOR_RULE_IDS.nodeShape]);
    const badEnum = prim("x", typeIdFor("derivation_rule"), {
      source_id: "r", active: true, phase: "whenever", family: "derivation", consequenceSemantics: "derivation", inferenceMethod: "forward",
      body: [pred("pred:Human", [varTerm("x")])], head: [pred("pred:Human", [varTerm("x")])],
    });
    const findings = await run(v.nodeShape, badEnum);
    expect(findings.some((f) => f.message.includes("phase"))).toBe(true);
    const badFormula = claim("c", { kind: "and_formula", operands: "not-an-array" });
    const ff = await run(v.nodeShape, badFormula);
    expect(ff.length).toBeGreaterThan(0);
    expect(ff[0]!.message).toMatch(/\$\.formula/);
  });

  it("ignores lifted fields, which are edges, and the header's collections", async () => {
    const rule = prim("r", typeIdFor("strict_rule"), {
      source_id: "r", active: true, phase: "derive", family: "strict", consequenceSemantics: "derivation", body: [], head: [],
    });
    // body/head min(1) upstream: the arm schema still enforces it here.
    expect((await run(v.nodeShape, rule)).length).toBeGreaterThan(0);
    const okRule = { ...rule, field_values: { ...rule.field_values, body: [pred("pred:Human", [varTerm("x")])], head: [pred("pred:Human", [varTerm("x")])] } };
    expect(await run(v.nodeShape, okRule)).toEqual([]);
    expect(await run(v.nodeShape, HEADER)).toEqual([]);
    const headerWithCollection = { ...HEADER, field_values: { ...HEADER.field_values, declarations: [] } };
    expect((await run(v.nodeShape, headerWithCollection)).length).toBe(1);
    expect(await run(v.nodeShape, prim("e", EXTERNAL_TARGET_TYPE_ID, { source_id: "ext:x" }))).toEqual([]);
  });
});

describe("lkb:val:reference-family and lkb:val:reference-resolution", () => {
  const stmt = prim(hostIdFor("assertion_statement", "s"), typeIdFor("assertion_statement"), { source_id: "s", formula: pred("pred:Human", [constTerm("const:socrates")]), status: "asserted" });
  const rule = prim(hostIdFor("strict_rule", "r"), typeIdFor("strict_rule"), { source_id: "r", active: true, phase: "derive", family: "strict", consequenceSemantics: "derivation", body: [], head: [] });
  const ext = prim(hostIdFor("external_target", "ext:x"), EXTERNAL_TARGET_TYPE_ID, { source_id: "ext:x" });
  const ctx = ctxOf([stmt, rule, ext, HUMAN]);

  it("ports matchesTargetFamily", () => {
    expect(matchesTargetFamily("predicate_declaration", "symbol")).toBe(true);
    expect(matchesTargetFamily("type_declaration", "symbol")).toBe(false);
    expect(matchesTargetFamily("modus_ponens_step", "proof")).toBe(true);
    expect(matchesTargetFamily("trigger", "process")).toBe(true);
    expect(matchesTargetFamily("assertion_statement", "rule")).toBe(false);
    expect(matchesTargetFamily("anything", "node")).toBe(true);
    expect(matchesTargetFamily("module", "nonsense")).toBe(false);
  });

  it("rejects a family the target is not in and accepts a matching one", async () => {
    const wrong = rel("e1", referenceRelationId("premiseRefs"), "arg", stmt.id, { resolution: "local", target_family: "rule" });
    const f = await run(v.referenceFamily, wrong, ctx);
    expect(f.map((x) => x.rule_id)).toEqual([VALIDATOR_RULE_IDS.referenceFamily]);
    expect(f[0]!.message).toContain("expects family 'rule'");
    const right = rel("e2", referenceRelationId("premiseRefs"), "arg", rule.id, { resolution: "local", target_family: "rule" });
    expect(await run(v.referenceFamily, right, ctx)).toEqual([]);
    expect(await run(v.referenceFamily, rel("e3", referenceRelationId("imports"), "m", ext.id, { resolution: "external", target_family: "module" }), ctx)).toEqual([]);
  });

  it("checks resolution against the target kind and external_uri", async () => {
    const localToExternal = rel("e4", referenceRelationId("imports"), "m", ext.id, { resolution: "local" });
    expect((await run(v.referenceResolution, localToExternal, ctx)).map((x) => x.message)).toEqual([expect.stringContaining("cannot target")]);
    const externalNoUri = rel("e5", referenceRelationId("imports"), "m", ext.id, { resolution: "external" });
    expect((await run(v.referenceResolution, externalNoUri, ctx)).map((x) => x.message)).toEqual(["External references must declare external_uri"]);
    const externalToNode = rel("e6", referenceRelationId("imports"), "m", rule.id, { resolution: "external", external_uri: "https://x" });
    expect((await run(v.referenceResolution, externalToNode, ctx)).map((x) => x.message)).toEqual([expect.stringContaining("must target an")]);
    const localWithUri = rel("e7", referenceRelationId("priorityOver"), rule.id, rule.id, { resolution: "local", external_uri: "https://x" });
    expect((await run(v.referenceResolution, localWithUri, ctx)).map((x) => x.message)).toEqual(["external_uri is only valid for external references"]);
    expect(await run(v.referenceResolution, rel("e8", referenceRelationId("imports"), "m", ext.id, { resolution: "external", external_uri: "https://x" }), ctx)).toEqual([]);
  });

  it("asks for the workbook context rather than skipping silently", async () => {
    const f = await run(v.referenceFamily, rel("e9", referenceRelationId("x"), "a", "b", { target_family: "rule" }));
    expect(f.map((x) => x.level)).toEqual(["warning"]);
  });
});

describe("lkb:val:arity", () => {
  const ctx = ctxOf([HUMAN, AGE, SOCRATES]);
  it("matches upstream's messages for predicate and function applications", async () => {
    const tooMany = claim("c1", pred("pred:Human", [constTerm("const:socrates"), constTerm("const:socrates")]));
    const f = await run(v.arity, tooMany, ctx);
    expect(f.map((x) => x.message)).toEqual([expect.stringMatching(/Predicate 'Human' requires exactly 1 argument\(s\); received 2/)]);
    const fnAsPred = claim("c2", pred("fn:age", [constTerm("const:socrates")]));
    expect((await run(v.arity, fnAsPred, ctx))[0]!.message).toContain("not a predicate or relation declaration");
    const okFn = claim("c3", { kind: "equality_formula", left: { kind: "function_application_term", function: { kind: "reference", targetId: "fn:age", resolution: "local" }, arguments: [constTerm("const:socrates")] }, right: constTerm("const:socrates") });
    expect(await run(v.arity, okFn, ctx)).toEqual([]);
    const badFn = claim("c4", { kind: "equality_formula", left: { kind: "function_application_term", function: { kind: "reference", targetId: "fn:age", resolution: "local" }, arguments: [] }, right: constTerm("const:socrates") });
    expect((await run(v.arity, badFn, ctx))[0]!.message).toMatch(/Function 'age' requires exactly 1/);
  });
  it("honours variadic declarations and leaves unresolved symbols to the document check", async () => {
    const variadic = { ...HUMAN, field_values: { ...HUMAN.field_values, variadic: true } };
    const f = await run(v.arity, claim("c5", pred("pred:Human", [constTerm("const:socrates"), constTerm("const:socrates")])), ctxOf([variadic, SOCRATES]));
    expect(f).toEqual([]);
    expect(await run(v.arity, claim("c6", pred("pred:Unknown", [])), ctx)).toEqual([]);
  });
});

describe("lkb:val:rule-cycle, lkb:val:self-parent, lkb:val:step-slot, lkb:val:single-header", () => {
  const a = hostIdFor("strict_rule", "a");
  const b = hostIdFor("strict_rule", "b");
  const c = hostIdFor("strict_rule", "c");
  it("refuses the edge that closes a cycle across both priority edge types", async () => {
    const existing = [rel("p1", referenceRelationId("priorityOver"), a, b), rel("p2", referenceRelationId("overrides"), b, c)];
    const closing = rel("p3", referenceRelationId("overrides"), c, a);
    const f = await run(v.ruleCycle, closing, ctxOf([], existing));
    expect(f.map((x) => x.rule_id)).toEqual([VALIDATOR_RULE_IDS.ruleCycle]);
    expect(await run(v.ruleCycle, rel("p4", referenceRelationId("priorityOver"), a, c), ctxOf([], existing))).toEqual([]);
  });
  it("refuses a node parenting itself", async () => {
    const m = hostIdFor("module", "m");
    expect((await run(v.selfParent, rel("s1", referenceRelationId("parentModule"), m, m))).length).toBe(1);
    expect(await run(v.selfParent, rel("s2", referenceRelationId("parentModule"), m, hostIdFor("module", "n")))).toEqual([]);
  });
  it("binds the trace slot to counterexamples", async () => {
    const tree = prim(hostIdFor("proof_tree", "p"), typeIdFor("proof_tree"), { source_id: "p" });
    const cx = prim(hostIdFor("counterexample", "x"), typeIdFor("counterexample"), { source_id: "x" });
    const step = hostIdFor("assumption_step", "s");
    const ctx = ctxOf([tree, cx]);
    expect((await run(v.stepSlot, rel("t1", STEP_RELATION_ID, tree.id, step, { slot: "trace", position: 0 }), ctx)).length).toBe(1);
    expect((await run(v.stepSlot, rel("t2", STEP_RELATION_ID, cx.id, step, { slot: "steps", position: 0 }), ctx)).length).toBe(1);
    expect(await run(v.stepSlot, rel("t3", STEP_RELATION_ID, cx.id, step, { slot: "trace", position: 0 }), ctx)).toEqual([]);
  });
  it("allows exactly one header per workbook", async () => {
    const second = prim(hostIdFor("logical_knowledge_base", "kb:2"), HEADER_TYPE_ID, { source_id: "kb:2", schemaVersion: "1.0.0", semanticModelVersion: "1.0.0" });
    expect((await run(v.singleHeader, second, ctxOf([HEADER, second]))).length).toBe(1);
    expect(await run(v.singleHeader, HEADER, ctxOf([HEADER]))).toEqual([]);
  });
});

describe("lkb:val:mentions-current and lkb:val:framework-grounded", () => {
  it("warns when a node's formulas and its mentions edges disagree, in either direction", async () => {
    const c = claim("c", pred("pred:Human", [constTerm("const:socrates")]));
    const none = await run(v.mentionsCurrent, c, ctxOf([HUMAN, SOCRATES, c]));
    expect(none.map((f) => [f.rule_id, f.level])).toEqual([[VALIDATOR_RULE_IDS.mentionsCurrent, "warning"]]);
    expect(none[0]!.message).toContain("missing 2");
    const { mentionEdges } = await import("../../../plugins/logical_knowledge_base/transfer.js");
    const edges = mentionEdges(c.id, c.field_values, (sid) => (sid === "pred:Human" ? HUMAN.id : sid === "const:socrates" ? SOCRATES.id : undefined));
    const rels = edges.map((e) => rel(e.id, e.type_id, e.source_id, e.target_id, e.field_values));
    expect(await run(v.mentionsCurrent, c, ctxOf([HUMAN, SOCRATES, c], rels))).toEqual([]);
    const stale = [...rels, rel("stale", "lkb:mentions", c.id, AGE.id, { path: "x", count: 1 })];
    expect((await run(v.mentionsCurrent, c, ctxOf([HUMAN, SOCRATES, AGE, c], stale)))[0]!.message).toContain("stale 1");
  });

  it("reports a declared acceptance set that the grounded extension contradicts", async () => {
    const F = hostIdFor("argumentation_framework", "af");
    const A = hostIdFor("argument", "a");
    const B = hostIdFor("argument", "b");
    const ATT = hostIdFor("attack_relation", "att");
    const fw = prim(F, typeIdFor("argumentation_framework"), { source_id: "af", semantics: "grounded" });
    const prims = [fw, prim(A, typeIdFor("argument"), { source_id: "a" }), prim(B, typeIdFor("argument"), { source_id: "b" }), prim(ATT, typeIdFor("attack_relation"), { source_id: "att", attackKind: "generic" })];
    const base = [
      rel("m1", referenceRelationId("argumentRefs"), F, A, { resolution: "local", position: 0 }),
      rel("m2", referenceRelationId("argumentRefs"), F, B, { resolution: "local", position: 1 }),
      rel("r1", referenceRelationId("relationRefs"), F, ATT, { resolution: "local", position: 0 }),
      rel("a1", referenceRelationId("attacker"), ATT, A, { resolution: "local" }),
      rel("a2", referenceRelationId("attacked"), ATT, B, { resolution: "local" }),
    ];
    // Nothing declared: nothing to contradict.
    expect(await run(v.frameworkGrounded, fw, ctxOf(prims, base))).toEqual([]);
    const wrong = [...base, rel("acc", referenceRelationId("acceptedArguments"), F, B, { resolution: "local", position: 0 })];
    const f = await run(v.frameworkGrounded, fw, ctxOf(prims, wrong));
    expect(f.map((x) => [x.rule_id, x.level])).toEqual([[VALIDATOR_RULE_IDS.frameworkGrounded, "warning"]]);
    expect(f[0]!.message).toContain(`grounded extension is {${A}}`);
    expect(f[0]!.message).toContain(`omits ${A}`);
    expect(f[0]!.message).toContain(`names ${B}`);
    const right = [...base, rel("acc", referenceRelationId("acceptedArguments"), F, A, { resolution: "local", position: 0 })];
    expect(await run(v.frameworkGrounded, fw, ctxOf(prims, right))).toEqual([]);
  });
});

describe("lkb:val:document — the whole upstream verifier over the reassembled workbook", () => {
  it("warns on the header when a formula names a symbol the workbook does not declare", async () => {
    const orphan = claim("c", pred("pred:Nobody", [constTerm("const:socrates")]));
    const f = await run(v.wholeDocument, HEADER, ctxOf([HEADER, SOCRATES, orphan]));
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.level === "warning" && x.rule_id === VALIDATOR_RULE_IDS.document)).toBe(true);
    expect(f.some((x) => /Unresolved local reference 'pred:Nobody'/.test(x.message))).toBe(true);
    expect(await run(v.wholeDocument, HEADER, ctxOf([HEADER, SOCRATES, HUMAN, claim("c", pred("pred:Human", [constTerm("const:socrates")]))]))).toEqual([]);
  });
});

describe("through the host pipeline", () => {
  let host: Host;
  const WB = "lkb-val";
  beforeAll(async () => {
    host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    await host.createProject({ workbook_id: WB, name: "validators", profile_id: PROFILE_ID });
    await host.createPrimitive(WB, { id: HEADER.id, type_id: HEADER_TYPE_ID, field_values: HEADER.field_values });
    await host.createPrimitive(WB, { id: HUMAN.id, type_id: HUMAN.type_id, field_values: HUMAN.field_values });
    await host.createPrimitive(WB, { id: SOCRATES.id, type_id: SOCRATES.type_id, field_values: SOCRATES.field_values });
  });

  it("rejects a malformed formula at write time and accepts a well-formed one", async () => {
    const bad = await host
      .createPrimitive(WB, { id: hostIdFor("claim", "bad"), type_id: typeIdFor("claim"), field_values: { source_id: "bad", formula: { kind: "predicate_application_formula", predicate: "pred:Human" }, status: "proposed" } })
      .then((r) => r.report, (e) => (e as { evidence?: { report?: unknown } }).evidence?.report ?? e);
    const findings = JSON.stringify(bad);
    expect(findings).toContain(VALIDATOR_RULE_IDS.nodeShape);
    const ok = await host.createPrimitive(WB, { id: hostIdFor("claim", "ok"), type_id: typeIdFor("claim"), field_values: { source_id: "ok", formula: pred("pred:Human", [constTerm("const:socrates")]), status: "proposed" } });
    expect(ok.report.accepted).toBe(true);
    expect(ok.report.findings.filter((f) => f.level === "error")).toEqual([]);
  });

  it("rejects the edge that closes a priority cycle", async () => {
    const ruleValues = (id: string) => ({ source_id: id, active: true, phase: "derive", family: "strict", consequenceSemantics: "derivation", body: [pred("pred:Human", [constTerm("const:socrates")])], head: [pred("pred:Human", [constTerm("const:socrates")])] });
    const r1 = hostIdFor("strict_rule", "r1");
    const r2 = hostIdFor("strict_rule", "r2");
    await host.createPrimitive(WB, { id: r1, type_id: typeIdFor("strict_rule"), field_values: ruleValues("r1") });
    await host.createPrimitive(WB, { id: r2, type_id: typeIdFor("strict_rule"), field_values: ruleValues("r2") });
    const first = await host.createRelation(WB, { id: "e1", type_id: referenceRelationId("priorityOver"), source_id: r1, target_id: r2, field_values: { resolution: "local", position: 0 } });
    expect(first.report.accepted).toBe(true);
    // Host.runWithValidation throws FDPMException with { findings } on the
    // exception itself (see tests/plugins/re_crt/validators.test.ts).
    const second = await host
      .createRelation(WB, { id: "e2", type_id: referenceRelationId("overrides"), source_id: r2, target_id: r1, field_values: { resolution: "local", position: 0 } })
      .then(
        (r) => r.report.findings.map((f) => f.rule_id),
        (e) => ((e as { findings?: { rule_id: string }[] }).findings ?? []).map((f) => f.rule_id),
      );
    expect(second).toContain(VALIDATOR_RULE_IDS.ruleCycle);
  });
});
