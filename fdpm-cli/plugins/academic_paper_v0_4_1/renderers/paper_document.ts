/**
 * The paper as a paper.
 *
 * This profile carried twenty-four per-entity field tables and no way to
 * read the thing they describe. A paper is a document with an argument:
 * sections in order, claims with the evidence that supports them,
 * findings against the hypotheses they test, and a reference list — so
 * that is what this renders, in the order a reader reads.
 *
 * `text/markdown` for review, `text/html` for circulation and print.
 * Both are built from `buildPaperModel`, so the two cannot drift.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";

interface Prim { id: string; type_id: string; field_values: Record<string, unknown> }
interface Rel { id: string; type_id: string; source_id: string; target_id: string }

const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};
const arr = (p: Prim | undefined, k: string): string[] => {
  const v = p?.field_values?.[k];
  return Array.isArray(v) ? v.map(String) : [];
};

export interface PaperModel {
  paper: Prim | undefined;
  authors: Prim[];
  affiliationOf: Map<string, string[]>;
  sections: Prim[];
  claimsBySection: Map<string, Prim[]>;
  evidenceFor: Map<string, Prim[]>;
  findings: Prim[];
  limitations: Prim[];
  works: Prim[];
  definitions: Prim[];
  funding: Prim[];
  errata: Prim[];
  slug: (p: Prim) => string;
}

/** Sections in declared order; everything else attached to them by edge. */
export function buildPaperModel(primitives: Prim[], relations: Rel[]): PaperModel {
  const byId = new Map(primitives.map((p) => [p.id, p]));
  const of = (t: string) => primitives.filter((p) => p.type_id === `acad:${t}`);
  const slugOf = (p: Prim) => str(p, "id") || p.id.split(":").pop() || p.id;

  const targets = (type: string, source: string): Prim[] =>
    relations.filter((r) => r.type_id === type && r.source_id === source)
      .map((r) => byId.get(r.target_id))
      .filter((x): x is Prim => x !== undefined);
  const sources = (type: string, target: string): Prim[] =>
    relations.filter((r) => r.type_id === type && r.target_id === target)
      .map((r) => byId.get(r.source_id))
      .filter((x): x is Prim => x !== undefined);

  const sections = of("Section")
    .slice()
    .sort((a, b) => Number(str(a, "order") || 0) - Number(str(b, "order") || 0) || str(a, "title").localeCompare(str(b, "title")));

  const claimsBySection = new Map<string, Prim[]>();
  for (const c of of("Claim")) {
    const sec = targets("acad:ClaimSection", c.id)[0];
    const key = sec?.id ?? "";
    claimsBySection.set(key, [...(claimsBySection.get(key) ?? []), c]);
  }
  const evidenceFor = new Map<string, Prim[]>();
  for (const e of of("Evidence")) {
    for (const c of targets("acad:EvidenceSupports", e.id)) {
      evidenceFor.set(c.id, [...(evidenceFor.get(c.id) ?? []), e]);
    }
  }
  const affiliationOf = new Map<string, string[]>();
  for (const a of of("Author")) {
    affiliationOf.set(a.id, targets("acad:AuthorAffiliations", a.id).map((x) => str(x, "institution")).filter(Boolean));
  }

  return {
    paper: of("Paper")[0],
    authors: of("Author").slice().sort((a, b) => str(a, "position").localeCompare(str(b, "position")) || str(a, "fullName").localeCompare(str(b, "fullName"))),
    affiliationOf,
    sections,
    claimsBySection,
    evidenceFor,
    findings: of("Finding"),
    limitations: of("Limitation"),
    works: of("Work").slice().sort((a, b) => str(a, "title").localeCompare(str(b, "title"))),
    definitions: of("Definition"),
    funding: of("Funding"),
    errata: of("Erratum"),
    slug: slugOf,
  };
  void sources;
}

export function renderPaperMarkdown(input: RendererInput): RendererOutput {
  const m = buildPaperModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const p = m.paper;
  const L: string[] = [];

  L.push(`# ${str(p, "title") || input.workbook?.name || "Paper"}`, "");
  if (m.authors.length) {
    L.push(
      m.authors
        .map((a) => {
          const aff = m.affiliationOf.get(a.id) ?? [];
          return `${str(a, "fullName")}${aff.length ? ` (${aff.join("; ")})` : ""}`;
        })
        .join(" · "),
      "",
    );
  }
  const meta = [str(p, "year"), str(p, "epistemicMethod"), str(p, "format"), str(p, "language")].filter(Boolean);
  if (meta.length) L.push(`_${meta.join(" · ")}_`, "");
  if (str(p, "abstract")) L.push("## Abstract", "", str(p, "abstract"), "");

  for (const s of m.sections) {
    const depth = Math.min(Number(str(s, "level") || 2), 5);
    L.push(`${"#".repeat(Math.max(2, depth))} ${str(s, "title")}`, "");
    if (str(s, "summary")) L.push(str(s, "summary"), "");
    for (const c of m.claimsBySection.get(s.id) ?? []) {
      L.push(`**Claim (${str(c, "kind") || "claim"}).** ${str(c, "statement")}`, "");
      for (const e of m.evidenceFor.get(c.id) ?? []) {
        L.push(`> _${str(e, "kind") || "evidence"}:_ ${str(e, "summary") || str(e, "statement")}`, "");
      }
    }
  }

  if (m.findings.length) {
    L.push("## Findings", "");
    for (const f of m.findings) L.push(`- **${str(f, "statement") || str(f, "summary")}**${str(f, "confidence") ? ` _(${str(f, "confidence")})_` : ""}`);
    L.push("");
  }
  if (m.limitations.length) {
    L.push("## Limitations", "");
    for (const l of m.limitations) L.push(`- ${str(l, "statement") || str(l, "summary")}`);
    L.push("");
  }
  if (m.definitions.length) {
    L.push("## Definitions", "");
    for (const d of m.definitions) L.push(`- **${str(d, "term") || m.slug(d)}** — ${str(d, "definition") || str(d, "statement")}`);
    L.push("");
  }
  if (m.works.length) {
    L.push("## References", "");
    for (const w of m.works) {
      const bits = [str(w, "authors") || arr(w, "authors").join(", "), str(w, "title"), str(w, "year"), str(w, "venue"), str(w, "doi")].filter(Boolean);
      L.push(`- ${bits.join(". ")}`);
    }
    L.push("");
  }
  if (m.funding.length) {
    L.push("## Funding", "");
    for (const f of m.funding) L.push(`- ${str(f, "statement") || str(f, "grantNumber") || m.slug(f)}`);
    L.push("");
  }
  if (m.errata.length) {
    L.push("## Errata", "");
    for (const e of m.errata) L.push(`- ${str(e, "date")} — ${str(e, "description") || str(e, "statement")}`);
    L.push("");
  }

  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "paper.md",
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Print-ready, single file: a paper is circulated, not served. */
export function renderPaperHtml(input: RendererInput): RendererOutput {
  const m = buildPaperModel(input.primitives as unknown as Prim[], (input.relations ?? []) as unknown as Rel[]);
  const p = m.paper;
  const title = str(p, "title") || input.workbook?.name || "Paper";
  const H: string[] = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    "<style>",
    ":root{--ink:#111418;--muted:#5b6270;--rule:#dfe3ea;--bg:#fff}",
    "body{margin:0;padding:3rem 1.5rem;background:var(--bg);color:var(--ink);font:17px/1.7 Georgia,'Iowan Old Style',serif}",
    "main{max-width:42rem;margin:0 auto}",
    "h1{font-size:2.1rem;line-height:1.15;margin:0 0 .5rem;font-weight:600}",
    ".byline{font-size:1rem;color:var(--muted);margin:0 0 .25rem}",
    ".meta{font-size:.85rem;color:var(--muted);letter-spacing:.02em;text-transform:uppercase;margin:0 0 2rem}",
    "h2{font-size:1.25rem;margin:2.2rem 0 .6rem;font-weight:600}",
    "h3{font-size:1.05rem;margin:1.6rem 0 .4rem;font-weight:600}",
    ".claim{margin:.8rem 0;padding-left:.9rem;border-left:3px solid var(--rule)}",
    ".claim .kind{font:600 .72rem/1 -apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}",
    "blockquote{margin:.5rem 0 .5rem 1rem;color:var(--muted);font-size:.95rem}",
    "ol.refs{padding-left:1.3rem}ol.refs li{margin:.35rem 0;font-size:.95rem}",
    "@media print{body{padding:0;font-size:11pt}h2{break-after:avoid}.claim{break-inside:avoid}}",
    "@media (prefers-color-scheme:dark){:root{--ink:#e9ebef;--muted:#9aa2b1;--rule:#333a46;--bg:#15171b}}",
    "</style></head><body><main>",
    `<h1>${esc(title)}</h1>`,
  ];
  if (m.authors.length) {
    H.push(
      `<p class="byline">${esc(
        m.authors.map((a) => {
          const aff = m.affiliationOf.get(a.id) ?? [];
          return `${str(a, "fullName")}${aff.length ? ` (${aff.join("; ")})` : ""}`;
        }).join(" · "),
      )}</p>`,
    );
  }
  const meta = [str(p, "year"), str(p, "epistemicMethod"), str(p, "format")].filter(Boolean).join(" · ");
  if (meta) H.push(`<p class="meta">${esc(meta)}</p>`);
  if (str(p, "abstract")) H.push("<h2>Abstract</h2>", `<p>${esc(str(p, "abstract"))}</p>`);

  for (const s of m.sections) {
    H.push(`<h2>${esc(str(s, "title"))}</h2>`);
    if (str(s, "summary")) H.push(`<p>${esc(str(s, "summary"))}</p>`);
    for (const c of m.claimsBySection.get(s.id) ?? []) {
      H.push('<div class="claim">', `<div class="kind">${esc(str(c, "kind") || "claim")}</div>`, `<p>${esc(str(c, "statement"))}</p>`);
      for (const e of m.evidenceFor.get(c.id) ?? []) {
        H.push(`<blockquote>${esc(str(e, "kind") || "evidence")}: ${esc(str(e, "summary") || str(e, "statement"))}</blockquote>`);
      }
      H.push("</div>");
    }
  }
  if (m.findings.length) {
    H.push("<h2>Findings</h2><ul>");
    for (const f of m.findings) H.push(`<li>${esc(str(f, "statement") || str(f, "summary"))}</li>`);
    H.push("</ul>");
  }
  if (m.works.length) {
    H.push("<h2>References</h2><ol class=\"refs\">");
    for (const w of m.works) {
      const bits = [str(w, "authors") || arr(w, "authors").join(", "), str(w, "title"), str(w, "year"), str(w, "venue")].filter(Boolean);
      H.push(`<li>${esc(bits.join(". "))}</li>`);
    }
    H.push("</ol>");
  }
  H.push("</main></body></html>");
  return {
    bytes: new TextEncoder().encode(H.join("\n") + "\n"),
    contentType: "text/html",
    filename: "paper.html",
  };
}
