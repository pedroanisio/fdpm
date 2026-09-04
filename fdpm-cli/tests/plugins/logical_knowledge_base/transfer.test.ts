/**
 * The document ↔ graph boundary, both ways, plus the failure paths (PALS's
 * LAW control 4: a verification layer with no failing-input test is
 * unverified).
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { exportTransfer, importTransfer } from "../../../src/core/host-extra.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  EXTERNAL_TARGET_TYPE_ID,
  HEADER_TYPE_ID,
  MENTIONS_RELATION_ID,
  PROFILE_ID,
  PROVENANCE_RELATION_ID,
  STEP_RELATION_ID,
  ELEMENT_RELATION_ID,
  hostIdFor,
  referenceRelationId,
} from "../../../plugins/logical_knowledge_base/derive.js";
import {
  TRANSFER_FORMAT,
  assembleDocument,
  collectMentions,
  exportLkbJson,
  importLkbJson,
  mentionEdgeId,
  parseDocument,
  planMentions,
  reconcileMentions,
  splitDocument,
  verifyWorkbook,
} from "../../../plugins/logical_knowledge_base/transfer.js";
import { VALIDATOR_RULE_IDS } from "../../../plugins/logical_knowledge_base/validators.js";
import { serializeCanonicalLogicalKnowledgeBase } from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import { FIXTURE_ID, FIXTURE_NODE_IDS, fixtureDocument, pred, constTerm } from "./_fixture.js";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

describe("the fixture", () => {
  it("is a valid LogicalKnowledgeBase document", () => {
    const parsed = parseDocument(fixtureDocument());
    expect(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.issues, null, 2)).toBe(true);
  });
});

describe("splitDocument", () => {
  const parsed = parseDocument(fixtureDocument());
  const split = parsed.ok ? splitDocument(parsed.document) : undefined;

  it("makes one primitive per node, plus the header and one external target", () => {
    expect(split).toBeDefined();
    const all = [...FIXTURE_NODE_IDS.root, ...FIXTURE_NODE_IDS.steps, ...FIXTURE_NODE_IDS.elements];
    expect(split!.summary.nodes).toBe(all.length);
    expect(split!.summary.external_targets).toBe(1);
    expect(split!.primitives).toHaveLength(all.length + 2);
    const header = split!.primitives.find((p) => p.type_id === HEADER_TYPE_ID)!;
    expect(header.id).toBe(hostIdFor("logical_knowledge_base", FIXTURE_ID));
    expect(header.field_values).toMatchObject({ source_id: FIXTURE_ID, schemaVersion: "1.0.0", title: "Socrates" });
    expect(Object.keys(header.field_values)).not.toContain("declarations");
    const external = split!.primitives.find((p) => p.type_id === EXTERNAL_TARGET_TYPE_ID)!;
    expect(external.field_values).toEqual({ source_id: "ext:foaf", external_uri: "https://xmlns.com/foaf/0.1/" });
  });

  it("lifts references, provenance and containment into edges with positions", () => {
    const byType = new Map<string, number>();
    for (const r of split!.relations) byType.set(r.type_id, (byType.get(r.type_id) ?? 0) + 1);
    expect(byType.get(referenceRelationId("memberRefs"))).toBe(3);
    expect(byType.get(referenceRelationId("imports"))).toBe(1);
    expect(byType.get(referenceRelationId("priorityOver"))).toBe(1);
    expect(byType.get(referenceRelationId("parentWorld"))).toBe(1);
    expect(byType.get(referenceRelationId("premiseRefs"))).toBe(2);
    expect(byType.get(referenceRelationId("appliedRules"))).toBe(1);
    expect(byType.get(PROVENANCE_RELATION_ID)).toBe(2);
    expect(byType.get(STEP_RELATION_ID)).toBe(3);
    expect(byType.get(ELEMENT_RELATION_ID)).toBe(2);
    const members = split!.relations
      .filter((r) => r.type_id === referenceRelationId("memberRefs"))
      .sort((a, b) => Number(a.field_values["position"]) - Number(b.field_values["position"]));
    expect(members.map((m) => m.target_id)).toEqual([
      hostIdFor("predicate_declaration", "pred:Human"),
      hostIdFor("predicate_declaration", "pred:Mortal"),
      hostIdFor("derivation_rule", "rule:mortality"),
    ]);
    expect(members[0]!.field_values).toMatchObject({ resolution: "local", target_family: "declaration", position: 0 });
    const ext = split!.relations.find((r) => r.type_id === referenceRelationId("imports"))!;
    expect(ext.target_id).toBe(hostIdFor("external_target", "ext:foaf"));
    expect(ext.field_values).toMatchObject({ resolution: "external", external_uri: "https://xmlns.com/foaf/0.1/" });
    const steps = split!.relations.filter((r) => r.type_id === STEP_RELATION_ID);
    expect(steps.map((s) => s.field_values["slot"])).toEqual(["steps", "steps", "steps"]);
    for (const r of split!.relations) expect(r.id.length).toBeLessThanOrEqual(256);
    for (const p of split!.primitives) expect(p.id.length).toBeLessThanOrEqual(256);
  });

  it("derives lkb:mentions edges from the references inside formulas and structs", () => {
    const rule = split!.primitives.find((p) => p.id === hostIdFor("derivation_rule", "rule:mortality"))!;
    expect(collectMentions(rule.field_values).map((m) => [m.targetId, m.path, m.count])).toEqual([
      ["pred:Human", "body[0].predicate", 1],
      ["pred:Mortal", "head[0].predicate", 1],
    ]);
    const mentions = split!.relations.filter((r) => r.type_id === MENTIONS_RELATION_ID);
    expect(split!.summary.mentions).toBe(mentions.length);
    expect(mentions.length).toBeGreaterThanOrEqual(12);
    const stmt = hostIdFor("assertion_statement", "stmt:socrates-human");
    const fromStmt = mentions.filter((r) => r.source_id === stmt).map((r) => [r.target_id, r.field_values["path"], r.field_values["target_family"]]);
    expect(fromStmt).toEqual([
      [hostIdFor("predicate_declaration", "pred:Human"), "formula.predicate", "symbol"],
      [hostIdFor("constant_declaration", "const:socrates"), "formula.arguments[0].symbol", "symbol"],
    ]);
    // A constant used twice in one formula is one edge with count 2.
    const query = mentions.filter((r) => r.source_id === hostIdFor("entailment_query", "q:socrates-mortal"));
    expect(query.find((r) => r.target_id === hostIdFor("constant_declaration", "const:socrates"))!.field_values["count"]).toBe(4);
    // Lifted top-level references are edges of their own kind, never mentions.
    expect(mentions.some((r) => r.source_id === hostIdFor("module", "mod:core"))).toBe(false);
    // Deterministic ids.
    expect(mentions[0]!.id).toBe(mentionEdgeId(mentions[0]!.source_id, mentions[0]!.target_id));
    // The exporter ignores them: the round trip below still holds.
    expect(planMentions(split!.primitives, split!.relations)).toEqual({ create: [], remove: [], replace: [] });
  });

  it("keeps formulas as JSON on the owning node and strips lifted fields", () => {
    const rule = split!.primitives.find((p) => p.id === hostIdFor("strict_rule", "rule:rain-wet"))!;
    expect(rule.field_values["body"]).toEqual([{ kind: "proposition_reference_formula", proposition: { kind: "reference", targetId: "prop:rain", resolution: "local", targetFamily: "symbol" } }]);
    expect(rule.field_values).not.toHaveProperty("priorityOver");
    expect(rule.field_values).not.toHaveProperty("provenance");
    const proof = split!.primitives.find((p) => p.id === hostIdFor("proof_tree", "proof:socrates"))!;
    expect(proof.field_values).not.toHaveProperty("steps");
    expect(proof.field_values).not.toHaveProperty("rootStep");
  });
});

describe("assembleDocument ∘ splitDocument", () => {
  it("is the identity up to canonical form", () => {
    const parsed = parseDocument(fixtureDocument());
    if (!parsed.ok) throw new Error("fixture invalid");
    const split = splitDocument(parsed.document);
    const assembled = assembleDocument(split.primitives, split.relations);
    expect(assembled.problems).toEqual([]);
    const reparsed = parseDocument(assembled.document);
    expect(reparsed.ok, reparsed.ok ? "" : JSON.stringify(reparsed.issues, null, 2)).toBe(true);
    if (!reparsed.ok) return;
    expect(serializeCanonicalLogicalKnowledgeBase(reparsed.document)).toBe(
      serializeCanonicalLogicalKnowledgeBase(parsed.document),
    );
  });

  it("reports a workbook with no header instead of inventing one", () => {
    const assembled = assembleDocument([{ id: "x", type_id: "lkb:Claim", field_values: { source_id: "c" } }], []);
    expect(assembled.document).toBeUndefined();
    expect(assembled.problems[0]!.message).toContain(HEADER_TYPE_ID);
    const verified = verifyWorkbook([], []);
    expect(verified.ok).toBe(false);
  });

  it("surfaces a dangling formula reference through the root schema", () => {
    const parsed = parseDocument(fixtureDocument());
    if (!parsed.ok) throw new Error("fixture invalid");
    const split = splitDocument(parsed.document);
    const stmt = split.primitives.find((p) => p.id === hostIdFor("assertion_statement", "stmt:socrates-human"))!;
    stmt.field_values["formula"] = pred("pred:Nobody", [constTerm("const:socrates")]);
    const verified = verifyWorkbook(split.primitives, split.relations);
    expect(verified.ok).toBe(false);
    if (verified.ok) return;
    expect(verified.issues.some((i) => /Unresolved local reference 'pred:Nobody'/.test(i.message))).toBe(true);
  });
});

describe(`${TRANSFER_FORMAT} importer and exporter through the host`, () => {
  let host: Host;
  beforeAll(async () => {
    host = await freshHost();
  });

  it("imports the fixture into a validated workbook and exports it back canonically", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(fixtureDocument()));
    const transfer = await host.plugins.runImporter(TRANSFER_FORMAT, bytes, { workbookId: "lkb-rt" });
    expect(transfer.workbook).toMatchObject({ id: "lkb-rt", profile_id: PROFILE_ID, name: "Socrates" });
    const result = await importTransfer(host, transfer);
    expect(result.primitives_imported).toBe(transfer.primitives.length);
    expect(result.relations_imported).toBe(transfer.relations.length);

    const report = host.validateProject("lkb-rt");
    expect(report.summary.errors, JSON.stringify(report.primitives.filter((p) => !p.accepted).slice(0, 3), null, 2)).toBe(0);
    expect(report.summary.warnings).toBe(0);

    const exported = exportLkbJson(exportTransfer(host, "lkb-rt"));
    const parsed = parseDocument(fixtureDocument());
    if (!parsed.ok) throw new Error("fixture invalid");
    expect(decode(exported)).toBe(serializeCanonicalLogicalKnowledgeBase(parsed.document, 2) + "\n");
  });

  it("accepts a document object or JSON text, and derives a workbook id from the document id", () => {
    const fromObject = importLkbJson(fixtureDocument());
    expect(fromObject.workbook.id).toBe("kb-socrates");
    expect(fromObject.workbook.created_at).toBe("2026-09-01T09:00:00Z");
    const fromText = importLkbJson(JSON.stringify(fixtureDocument()), { projectName: "Renamed" });
    expect(fromText.workbook.name).toBe("Renamed");
    expect(fromText.primitives.every((p) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(p.uid))).toBe(true);
  });

  it("refuses bytes that are not JSON", () => {
    expect(() => importLkbJson(new TextEncoder().encode("{not json"))).toThrowError(FDPMException);
  });

  it("refuses an invalid document with the schema's issues as evidence, writing nothing", async () => {
    const doc = fixtureDocument();
    (doc["rules"] as Record<string, unknown>[])[0]!["phase"] = "whenever";
    (doc["statements"] as Record<string, unknown>[])[0]!["formula"] = pred("pred:Nobody", []);
    let thrown: unknown;
    try {
      importLkbJson(doc);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(FDPMException);
    const ex = thrown as FDPMException;
    expect(ex.category).toBe("validation");
    const issues = (ex.evidence as { issues: { path: string; message: string }[] }).issues;
    expect(issues.some((i) => i.path.includes("phase"))).toBe(true);
    expect(host.listProjects().some((p) => p.id === "kb-socrates")).toBe(false);
  });

  it("keeps mentions current: drift is a warning, reconcileMentions repairs it", async () => {
    const stmt = hostIdFor("assertion_statement", "stmt:socrates-human");
    const edge = Object.values(host.getProject("lkb-rt").relations).find((r) => r.type_id === MENTIONS_RELATION_ID && r.source_id === stmt)!;
    await host.deleteRelation("lkb-rt", edge.id);
    const drifted = host.validateProject("lkb-rt");
    const warnings = drifted.primitives.flatMap((p) => p.findings).filter((f) => f.rule_id === VALIDATOR_RULE_IDS.mentionsCurrent);
    expect(warnings.map((w) => w.target_id)).toEqual([stmt]);
    expect(warnings[0]!.message).toContain("missing 1");
    const result = await reconcileMentions(host, "lkb-rt");
    expect(result).toEqual({ created: 1, replaced: 0, removed: 0 });
    expect(host.validateProject("lkb-rt").summary.warnings).toBe(0);
  });

  it("protects a declaration that formulas still cite: the host refuses the delete", async () => {
    const human = hostIdFor("predicate_declaration", "pred:Human");
    await expect(host.deletePrimitive("lkb-rt", human)).rejects.toMatchObject({ category: "conflict" });
    // The refusal is the point: the citing formulas would dangle. With cascade the edges go,
    // and the document check then names the dangling references.
    expect(host.getProject("lkb-rt").primitives[human]).toBeDefined();
  });

  it("refuses to export a workbook that does not assemble into a valid document", () => {
    const transfer = exportTransfer(host, "lkb-rt");
    const broken = {
      ...transfer,
      primitives: transfer.primitives.filter((p) => p.type_id !== HEADER_TYPE_ID),
    };
    expect(() => exportLkbJson(broken)).toThrowError(/does not assemble/);
  });
});
