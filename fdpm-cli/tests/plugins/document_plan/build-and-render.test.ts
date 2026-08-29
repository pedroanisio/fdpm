/**
 * End-to-end: a DocumentPlan JSON → workbook on profile:document-plan-dnis:3.1
 * (header + registries via the bridge profile, section tree via
 * DnisHostAdapter, node↔registry relations) → docplan:PlanOutlineRenderer.
 *
 * The fixture is the plan for the 2026-08-28 architecture snapshot of this
 * repository. PALS's LAW: the negative case proves a plan that fails the
 * schema's own cross-reference rules never reaches the log.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { buildDocumentPlanWorkbook, parseDocumentPlan } from "../../../plugins/document_plan_dnis/build.js";
import {
  PLAN_OUTLINE_RENDERER_ID,
  PROFILE_ID as COMPOSITION_PROFILE_ID,
  REL,
} from "../../../plugins/document_plan_dnis/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "architecture-report.plan.json");

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
}

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

function fixedClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 7, 28, 6, 0, tick)).toISOString();
  };
}

describe("document plan — ingest and render", () => {
  it("the fixture is a valid DocumentPlan v3.1.0", () => {
    const plan = parseDocumentPlan(loadFixture());
    expect(plan.schema_version).toBe("3.1.0");
    expect(plan.structure.sections).toHaveLength(3);
  });

  it("builds a workbook: 1 header, registries, 1 dnis:Document, 9 dnis:Nodes, typed relations", async () => {
    const host = await freshHost();
    const report = await buildDocumentPlanWorkbook(host, loadFixture(), {
      workbookId: "arch-report-plan",
      agentId: "agent:test",
      now: fixedClock(),
    });
    expect(report.profileId).toBe(COMPOSITION_PROFILE_ID);
    expect(report.nodes).toBe(9);
    // header 1 + sources 3 + concepts 3 + asset 1 + threads 2 + person 1 + dnis doc 1 + nodes 9
    expect(report.primitives).toBe(21);

    const slice = host.getProject("arch-report-plan");
    expect(slice.workbook.profile_id).toBe(COMPOSITION_PROFILE_ID);
    const byType = new Map<string, number>();
    for (const r of Object.values(slice.relations)) byType.set(r.type_id, (byType.get(r.type_id) ?? 0) + 1);
    expect(byType.get(REL.PlanHasDocument)).toBe(1);
    expect(byType.get(REL.NodeUsesConcept)).toBe(4);
    expect(byType.get(REL.NodeAdvancesThread)).toBe(6);
    expect(byType.get(REL.NodeOwnedBy)).toBe(1);
    expect(byType.get(REL.NodeCites)).toBe(6);
    expect(byType.get(REL.AssetPlacedIn)).toBe(1);
    expect(byType.get(REL.ConceptIntroducedIn)).toBe(3);
    expect(report.relations).toBe(22);

    // Node identity: the SectionNode slug is preserved in the content and
    // the dnis:Node's uid == its NID (SPEC-CORE §5.6.1).
    const ledgerPrimId = report.nodePrimitiveIdBySlug["ledger"]!;
    const ledger = slice.primitives[ledgerPrimId]!;
    expect(ledger.type_id).toBe("dnis:Node");
    expect(ledger.id).toBe(`dnis:node:${ledger.uid.toLowerCase()}`);
    const content = JSON.parse(ledger.field_values["content"] as string) as { slug: string; region: string; title: string };
    expect(content).toMatchObject({ slug: "ledger", region: "body", title: "The ledger" });
    expect(ledger.field_values["kind"]).toBe("section");
    // Reading order: "ledger" precedes "gates" under "thesis".
    const gates = slice.primitives[report.nodePrimitiveIdBySlug["gates"]!]!;
    expect(String(ledger.field_values["position"]) < String(gates.field_values["position"])).toBe(true);
    expect(gates.field_values["parent_node_id"]).toBe(slice.primitives[report.nodePrimitiveIdBySlug["thesis"]!]!.uid);

    // The header carries neither the tree nor the registries.
    const header = slice.primitives["docplan:DocumentPlan:8f4c1c8e-2a6e-4a55-9b7b-5c2b7a1d0e11"]!;
    expect(header.field_values["structure"]).toBeUndefined();
    expect(header.field_values["threads"]).toBeUndefined();
    expect((header.field_values["content"] as { examples?: unknown[] }).examples).toHaveLength(1);
  });

  it("renders the plan outline with §-numbered body, lettered appendix, and resolved citations", async () => {
    const host = await freshHost();
    await buildDocumentPlanWorkbook(host, loadFixture(), {
      workbookId: "arch-report-plan",
      agentId: "agent:test",
      now: fixedClock(),
    });
    const slice = host.getProject("arch-report-plan");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "arch-report-plan",
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile: host.profiles.getResolved(COMPOSITION_PROFILE_ID),
      },
      { rendererId: PLAN_OUTLINE_RENDERER_ID },
    );
    expect(out.rendererId).toBe(PLAN_OUTLINE_RENDERER_ID);
    expect(out.findings ?? []).toEqual([]);
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toContain("# How FDPM Thinks");
    expect(text).toContain("## 1 System thesis");
    expect(text).toContain("### 1.1 The ledger");
    expect(text).toContain("### 1.2 The two gates");
    expect(text).toContain("## 3 The gap between purpose and code");
    expect(text).toContain("### Appendix A: Evidence index");
    expect(text).toContain("### Preface");
    expect(text).toContain("[spec-core] SPEC — FDPM Core v1.2 — §5.5, §6");
    expect(text).toContain("**Concepts.** operation log");
    expect(text).toContain("**Threads.** single-writer ledger");
    expect(text).toContain("owner: FDPM operator");
    expect(text).toContain("| single-writer ledger |");
    expect(text).toContain("| Outline freeze |");
    expect(text.indexOf("### Preface")).toBeLessThan(text.indexOf("## 1 System thesis"));
    expect(text.indexOf("## 3 The gap")).toBeLessThan(text.indexOf("### Appendix A"));
  });

  it("refuses a plan that fails the schema's cross-reference rules before writing anything", async () => {
    const host = await freshHost();
    const plan = loadFixture();
    const structure = plan["structure"] as { sections: { id: string; content?: unknown }[] };
    const gap = structure.sections.find((s) => s.id === "gap")!;
    delete gap.content; // a leaf chapter without a claim
    await expect(
      buildDocumentPlanWorkbook(host, plan, { workbookId: "arch-report-bad", agentId: "agent:test", now: fixedClock() }),
    ).rejects.toMatchObject({ category: "verification" });
    expect(host.listProjects().map((p) => p.id)).not.toContain("arch-report-bad");
  });
});
