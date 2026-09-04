/**
 * A second version of the document becomes operations against the existing
 * workbook, not a second workbook.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { exportTransfer, importTransfer } from "../../../src/core/host-extra.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { hostIdFor, referenceRelationId } from "../../../plugins/logical_knowledge_base/derive.js";
import { applyDocumentUpdate, planDocumentUpdate } from "../../../plugins/logical_knowledge_base/diff.js";
import { exportLkbJson, importLkbJson, parseDocument, splitDocument } from "../../../plugins/logical_knowledge_base/transfer.js";
import { serializeCanonicalLogicalKnowledgeBase } from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import { fixtureDocument, propRef } from "./_fixture.js";

type Json = Record<string, unknown>;
const WB = "lkb-diff";

/** Version 2 of the fixture: one node re-described, two added, one removed. */
function secondVersion(): Json {
  const doc = fixtureDocument();
  const statements = doc["statements"] as Json[];
  statements[0]!["confidence"] = 0.9;
  const declarations = doc["declarations"] as Json[];
  const kept = declarations.filter((d) => d["id"] !== "world:maybe");
  kept.push({ kind: "proposition_declaration", id: "prop:snow", name: "snow" });
  doc["declarations"] = kept;
  (doc["rules"] as Json[]).push({
    kind: "strict_rule",
    id: "rule:snow-wet",
    active: true,
    phase: "derive",
    family: "strict",
    consequenceSemantics: "derivation",
    body: [propRef("prop:snow")],
    head: [propRef("prop:wet")],
  });
  return doc;
}

describe("planDocumentUpdate", () => {
  it("plans creates, replaces and deletes by host id and edge id", () => {
    const v1 = parseDocument(fixtureDocument());
    const v2 = parseDocument(secondVersion());
    if (!v1.ok || !v2.ok) throw new Error("fixture invalid");
    const current = splitDocument(v1.document);
    const plan = planDocumentUpdate(current, v2.document);
    expect(plan.create_primitives.map((p) => p.id).sort()).toEqual([
      hostIdFor("proposition_declaration", "prop:snow"),
      hostIdFor("strict_rule", "rule:snow-wet"),
    ]);
    expect(plan.replace_primitives.map((p) => p.id)).toEqual([hostIdFor("assertion_statement", "stmt:socrates-human")]);
    expect(plan.delete_primitives).toEqual([hostIdFor("world_declaration", "world:maybe")]);
    // The removed world's parentWorld edge goes; the new rule's two mentions edges come.
    expect(plan.delete_relations).toHaveLength(1);
    expect(current.relations.find((r) => r.id === plan.delete_relations[0])!.type_id).toBe(referenceRelationId("parentWorld"));
    expect(plan.create_relations.map((r) => r.type_id)).toEqual(["lkb:mentions", "lkb:mentions"]);
    expect(plan.replace_relations).toEqual([]);
    expect(plan.unchanged.primitives).toBe(current.primitives.length - 2);
  });
});

describe("applyDocumentUpdate through the host", () => {
  let host: Host;
  beforeAll(async () => {
    host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    await importTransfer(host, importLkbJson(fixtureDocument(), { workbookId: WB }));
  });

  it("dry-run reports the plan and writes nothing", async () => {
    const before = host.getProject(WB).workbook.revision;
    const dry = await applyDocumentUpdate(host, WB, secondVersion(), { dryRun: true });
    expect(dry.applied).toBe(false);
    expect(dry.counts).toEqual({ created: 4, replaced: 1, deleted: 2 });
    expect(host.getProject(WB).workbook.revision).toBe(before);
  });

  it("applies the plan, keeps the workbook valid, and exports the new document canonically", async () => {
    const before = host.getProject(WB).workbook.revision;
    const result = await applyDocumentUpdate(host, WB, secondVersion());
    expect(result.applied).toBe(true);
    expect(host.getProject(WB).workbook.revision).toBe(before + 7);
    const report = host.validateProject(WB);
    expect(report.summary.errors, JSON.stringify(report.primitives.filter((p) => !p.accepted).slice(0, 3))).toBe(0);
    expect(report.summary.warnings).toBe(0);
    const v2 = parseDocument(secondVersion());
    if (!v2.ok) throw new Error("fixture invalid");
    expect(new TextDecoder().decode(exportLkbJson(exportTransfer(host, WB)))).toBe(
      serializeCanonicalLogicalKnowledgeBase(v2.document, 2) + "\n",
    );
    // Idempotent: applying the same version again is a no-op.
    const again = await applyDocumentUpdate(host, WB, secondVersion());
    expect(again.counts).toEqual({ created: 0, replaced: 0, deleted: 0 });
    expect(host.getProject(WB).workbook.revision).toBe(before + 7);
  });

  it("refuses an invalid document without touching the workbook", async () => {
    const before = host.getProject(WB).workbook.revision;
    const bad = secondVersion();
    (bad["rules"] as Json[])[0]!["phase"] = "whenever";
    await expect(applyDocumentUpdate(host, WB, bad)).rejects.toBeInstanceOf(FDPMException);
    expect(host.getProject(WB).workbook.revision).toBe(before);
  });
});
