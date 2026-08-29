/**
 * The plan header as a brief.
 *
 * `docplan:PlanOutlineRenderer` renders the section tree, but it lives in
 * the DNIS composition — a workbook on the base `profile:document-plan:3.1`
 * had six per-entity field tables and no way to read the plan itself.
 *
 * This renders what the header IS: the commitment a writer makes before
 * writing — thesis, audience, purpose, constraints, milestones — followed
 * by the registries that plan depends on, summarised rather than dumped.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";

interface Prim { id: string; type_id: string; field_values: Record<string, unknown> }

const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};
const arr = (p: Prim | undefined, k: string): unknown[] => {
  const v = p?.field_values?.[k];
  return Array.isArray(v) ? v : [];
};
const obj = (p: Prim | undefined, k: string): Record<string, unknown> => {
  const v = p?.field_values?.[k];
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

export function renderPlanBrief(input: RendererInput): RendererOutput {
  const primitives = input.primitives as unknown as Prim[];
  const of = (t: string) => primitives.filter((p) => p.type_id === `docplan:${t}`);
  const plan = of("DocumentPlan")[0];
  const L: string[] = [];

  L.push(`# ${str(plan, "title") || input.workbook?.name || "Document plan"}`, "");
  const meta = [str(plan, "work_type"), str(plan, "language"), str(plan, "status"), str(plan, "schema_version") && `schema ${str(plan, "schema_version")}`]
    .filter(Boolean)
    .join(" · ");
  if (meta) L.push(`_${meta}_`, "");
  if (str(plan, "description")) L.push(str(plan, "description"), "");

  for (const [heading, key] of [["Thesis", "thesis"], ["Purpose", "purpose"], ["Audience", "audience"]] as const) {
    const v = plan?.field_values?.[key];
    if (typeof v === "string" && v.trim()) L.push(`## ${heading}`, "", v, "");
    else if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && String(x).trim() !== "");
      if (entries.length) {
        L.push(`## ${heading}`, "");
        for (const [k, x] of entries) L.push(`- **${k.replace(/_/g, " ")}:** ${Array.isArray(x) ? x.join(", ") : String(x)}`);
        L.push("");
      }
    }
  }

  const style = obj(plan, "style");
  if (Object.keys(style).length) {
    L.push("## Style", "");
    for (const [k, v] of Object.entries(style)) L.push(`- **${k.replace(/_/g, " ")}:** ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    L.push("");
  }
  const constraints = arr(plan, "constraints");
  if (constraints.length) {
    L.push("## Constraints", "");
    for (const c of constraints) {
      L.push(typeof c === "string" ? `- ${c}` : `- ${Object.entries(c as Record<string, unknown>).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join("; ")}`);
    }
    L.push("");
  }
  const milestones = arr(plan, "milestones");
  if (milestones.length) {
    L.push("## Milestones", "", "| Milestone | Due | Status |", "|---|---|---|");
    for (const mRaw of milestones) {
      const m = mRaw as Record<string, unknown>;
      L.push(`| ${String(m["name"] ?? m["id"] ?? "—")} | ${String(m["due"] ?? m["date"] ?? "—")} | ${String(m["status"] ?? "—")} |`);
    }
    L.push("");
  }

  const registries: Array<[string, string, (p: Prim) => string]> = [
    ["Sources", "ContentSource", (p) => `${str(p, "citation") || str(p, "title") || str(p, "id")}${str(p, "kind") ? ` _(${str(p, "kind")})_` : ""}`],
    ["Concepts", "Concept", (p) => `**${str(p, "term") || str(p, "id")}** — ${str(p, "definition") || str(p, "gloss")}`],
    ["Assets", "Asset", (p) => `${str(p, "caption") || str(p, "id")}${str(p, "kind") ? ` _(${str(p, "kind")})_` : ""}`],
    ["Threads", "Thread", (p) => `${str(p, "name") || str(p, "id")} — ${str(p, "description") || str(p, "claim")}`],
    ["People", "Person", (p) => `${str(p, "name") || str(p, "id")}${str(p, "role") ? ` — ${str(p, "role")}` : ""}`],
  ];
  for (const [heading, type, line] of registries) {
    const items = of(type);
    if (!items.length) continue;
    L.push(`## ${heading} (${items.length})`, "");
    for (const p of items.slice().sort((a, b) => a.id.localeCompare(b.id))) L.push(`- ${line(p)}`);
    L.push("");
  }

  const counts = registries.map(([h, t]) => `${of(t).length} ${h.toLowerCase()}`).join(" · ");
  L.push("---", "", `_Registries: ${counts}. The section tree is rendered by \`docplan:PlanOutlineRenderer\` on the DNIS composition profile._`, "");

  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "plan-brief.md",
  };
}
