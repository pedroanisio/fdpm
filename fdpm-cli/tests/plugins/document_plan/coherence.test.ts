/**
 * docplan:coherence.comparative-claim-without-baseline
 *
 * A node whose claim is comparative ("cabe em poucas linhas", "em vez de",
 * "simpler", …) must declare a `context` or `logical_prerequisite`
 * dependency on an EARLIER node that establishes the baseline the
 * comparison is measured against. Otherwise the reader is told something
 * is simpler without having seen the complex thing.
 *
 * The rule is a lexical heuristic (documented marker list) and therefore a
 * WARNING, never an error: it makes the omission visible, it does not judge
 * the argument. It runs (a) as a cap:validator on every dnis:Node write in a
 * profile:document-plan-dnis workbook, (b) inside `fdpm validate`, and (c)
 * at ingest, where build.ts reports it alongside the build summary.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { buildDocumentPlanWorkbook } from "../../../plugins/document_plan_dnis/build.js";
import {
  COHERENCE_RULE_ID,
  COMPARATIVE_MARKERS,
  findComparativeClaimsWithoutBaseline,
} from "../../../plugins/document_plan_dnis/validators/coherence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DNIS_PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "document_plan_dnis");

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  return host;
}

function fixedClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 28, 12, 0, (tick += 1))).toISOString();
}

/** Minimal valid plan: `comp` compares against what `base` establishes. */
function plan(opts: { dependency?: "base" | "depois" | "none" } = {}): Record<string, unknown> {
  const dep = opts.dependency ?? "none";
  return {
    schema_version: "3.1.0",
    id: "1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b",
    work_type: "article",
    title: "Teste de coerência",
    description: "Plano mínimo para exercitar o validador de coerência comparativa.",
    language: "pt-BR",
    audience: { primary: "Leitores de teste", knowledge_level: "intermediate" },
    thesis: "Abstrações precisam de uma linha de base para serem julgadas.",
    purpose: "explain",
    success_criteria: ["O validador aponta afirmações comparativas sem linha de base."],
    structure: {
      sections: [
        { id: "base", kind: "section", title: "A linha de base", content: { claim: "Desenhar um triângulo exige sete objetos explícitos." } },
        { id: "comp", kind: "section", title: "A promessa", content: { claim: "Um efeito completo cabe em poucas linhas, em vez de dezenas." } },
        { id: "depois", kind: "section", title: "Depois", content: { claim: "Um capítulo posterior descreve o resto." } },
      ],
    },
    content: {},
    style: { tone: "technical" },
    constraints: {},
    ...(dep === "none" ? {} : { dependencies: [{ section_id: "comp", depends_on: [dep], reason: "context" }] }),
    metadata: { revision: 1, created_by: "test", created_at: "2026-08-28T00:00:00Z" },
  };
}

describe("docplan:coherence.comparative-claim-without-baseline", () => {
  it("exports a documented, non-empty marker list in both languages", () => {
    expect(COMPARATIVE_MARKERS.length).toBeGreaterThan(5);
    expect(COMPARATIVE_MARKERS).toEqual(expect.arrayContaining(["em vez de", "cabe em", "simpler", "instead of"]));
    expect(COHERENCE_RULE_ID).toBe("docplan:coherence.comparative-claim-without-baseline");
  });

  it("warns on a comparative claim with no baseline dependency (pure function + build report)", async () => {
    const host = await freshHost();
    const report = await buildDocumentPlanWorkbook(host, plan(), { workbookId: "coh-none", agentId: "agent:test", now: fixedClock() });
    const findings = findComparativeClaimsWithoutBaseline(host.getProject("coh-none").primitives);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule_id).toBe(COHERENCE_RULE_ID);
    expect(f.level).toBe("warning");
    expect(f.target_id).toBe(report.nodePrimitiveIdBySlug["comp"]);
    expect(f.message).toContain('"comp"');
    expect(f.message).toContain("em vez de");
    expect(report.coherence_warnings).toHaveLength(1);
    expect(report.coherence_warnings[0]!.target_id).toBe(f.target_id);
  });

  it("is satisfied by a context dependency on an EARLIER node", async () => {
    const host = await freshHost();
    const report = await buildDocumentPlanWorkbook(host, plan({ dependency: "base" }), { workbookId: "coh-ok", agentId: "agent:test", now: fixedClock() });
    expect(findComparativeClaimsWithoutBaseline(host.getProject("coh-ok").primitives)).toEqual([]);
    expect(report.coherence_warnings).toEqual([]);
  });

  it("is NOT satisfied by a context dependency on a LATER node", async () => {
    const host = await freshHost();
    await buildDocumentPlanWorkbook(host, plan({ dependency: "depois" }), { workbookId: "coh-later", agentId: "agent:test", now: fixedClock() });
    const findings = findComparativeClaimsWithoutBaseline(host.getProject("coh-later").primitives);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("earlier");
  });

  it("runs inside the host pipeline: fdpm validate reports the warning, and the write is still accepted", async () => {
    const host = await freshHost();
    const report = await buildDocumentPlanWorkbook(host, plan(), { workbookId: "coh-pipe", agentId: "agent:test", now: fixedClock() });
    const v = host.validateProject("coh-pipe", { ruleIds: new Set([COHERENCE_RULE_ID]) });
    expect(v.summary.errors).toBe(0);
    expect(v.summary.warnings).toBe(1);
    expect(v.primitives.map((r) => r.target_id)).toEqual([report.nodePrimitiveIdBySlug["comp"]]);

    const ok = await freshHost();
    await buildDocumentPlanWorkbook(ok, plan({ dependency: "base" }), { workbookId: "coh-pipe-ok", agentId: "agent:test", now: fixedClock() });
    expect(ok.validateProject("coh-pipe-ok", { ruleIds: new Set([COHERENCE_RULE_ID]) }).summary.warnings).toBe(0);
  });

  it("the manifest declares the validator with its closed rule_id set (parity)", () => {
    const manifest = JSON.parse(readFileSync(join(DNIS_PLUGIN_DIR, "fdpm-plugin.json"), "utf8")) as {
      capabilities: { capability_id: string; local_name: string; metadata?: { target_type_id?: string; rule_ids?: string[] } }[];
    };
    const cap = manifest.capabilities.find((c) => c.capability_id === "cap:validator" && c.local_name === "comparative-claim-baseline");
    expect(cap).toBeDefined();
    expect(cap!.metadata?.target_type_id).toBe("dnis:Node");
    expect(cap!.metadata?.rule_ids).toEqual([COHERENCE_RULE_ID]);
  });
});
