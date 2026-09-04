/**
 * Every node kind, once, through the whole boundary: schema → split →
 * assemble → schema, and through the host: import → validate → export.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { exportTransfer, importTransfer } from "../../../src/core/host-extra.js";
import { nodeArms } from "../../../plugins/logical_knowledge_base/derive.js";
import { assembleDocument, exportLkbJson, importLkbJson, parseDocument, splitDocument } from "../../../plugins/logical_knowledge_base/transfer.js";
import { serializeCanonicalLogicalKnowledgeBase } from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import { generateAllKindsDocument } from "./_generate.js";

describe("one node of every kind", () => {
  const { document, kinds } = generateAllKindsDocument();

  it("covers all 115 node kinds", () => {
    expect(new Set(kinds).size).toBe(nodeArms().length);
  });

  it("is a document the vendored schema accepts", () => {
    const parsed = parseDocument(document);
    expect(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.issues.slice(0, 15), null, 2)).toBe(true);
  });

  it("splits into one primitive per node and assembles back to the same canonical document", () => {
    const parsed = parseDocument(document);
    if (!parsed.ok) throw new Error("generated document invalid");
    const split = splitDocument(parsed.document);
    // One node per kind, plus the single step the proof tree's `steps: min(1)` requires.
    expect(split.summary.nodes).toBe(kinds.length + 1);
    const typeIds = new Set(split.primitives.map((p) => p.type_id));
    for (const arm of nodeArms()) expect(typeIds.has(arm.typeId), `${arm.typeId} missing after split`).toBe(true);
    const assembled = assembleDocument(split.primitives, split.relations);
    expect(assembled.problems).toEqual([]);
    const again = parseDocument(assembled.document);
    expect(again.ok, again.ok ? "" : JSON.stringify(again.issues.slice(0, 10), null, 2)).toBe(true);
    if (!again.ok) return;
    expect(serializeCanonicalLogicalKnowledgeBase(again.document)).toBe(serializeCanonicalLogicalKnowledgeBase(parsed.document));
  });

  it("imports into a workbook with zero findings and exports the same canonical document", async () => {
    const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await host.load();
    const transfer = importLkbJson(document, { workbookId: "lkb-all-kinds" });
    await importTransfer(host, transfer);
    const report = host.validateProject("lkb-all-kinds");
    const failing = report.primitives.filter((p) => p.findings.length > 0).slice(0, 5);
    expect(report.summary.errors, JSON.stringify(failing, null, 2)).toBe(0);
    expect(report.summary.warnings, JSON.stringify(failing, null, 2)).toBe(0);
    const parsed = parseDocument(document);
    if (!parsed.ok) throw new Error("generated document invalid");
    expect(new TextDecoder().decode(exportLkbJson(exportTransfer(host, "lkb-all-kinds")))).toBe(
      serializeCanonicalLogicalKnowledgeBase(parsed.document, 2) + "\n",
    );
  }, 60_000);
});
