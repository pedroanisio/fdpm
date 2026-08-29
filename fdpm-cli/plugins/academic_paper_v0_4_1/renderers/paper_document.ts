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
  /** Claims this claim is derived from, keyed by the deriving claim. */
  derivedFrom: Map<string, Prim[]>;
  /** Claims that read against this one, keyed by the claim being countered. */
  counteredBy: Map<string, Prim[]>;
  /** Claims that supersede this one, keyed by the superseded claim. */
  supersededBy: Map<string, Prim[]>;
  findingEvidence: Map<string, Prim[]>;
  findingTests: Map<string, Prim[]>;
  citations: PaperCitation[];
  /** The Concept a Definition defines, keyed by definition id. */
  conceptFor: Map<string, Prim>;
  /** Nesting depth from the section's parent chain; 0 for a top-level section. */
  depthOf: Map<string, number>;
  /** True when a bibliography-role section carries its own prose reference list. */
  hasAuthoredBibliography: boolean;
  methods: Prim[];
  /** Apparatus keyed by the section it belongs to; "" holds the unattached. */
  quotationsBySection: Map<string, Prim[]>;
  equationsBySection: Map<string, Prim[]>;
  figuresBySection: Map<string, Prim[]>;
  tablesBySection: Map<string, Prim[]>;
  /** Citations reaching a work, keyed by work id, so a reference can say who cited it. */
  citationsForWork: Map<string, PaperCitation[]>;
  slug: (p: Prim) => string;
}

/**
 * A citation resolved to both ends.
 *
 * `acad:Citation` is the profile's join between a passage and a source: it
 * carries the locator, points at the cited `acad:Work`, and points back at
 * whichever claim, finding or section is doing the citing. Read as a bare
 * primitive it says nothing, which is why the reference list could not
 * previously cite anything.
 */
export interface PaperCitation {
  citation: Prim;
  work: Prim | undefined;
  citing: Prim | undefined;
  locator: string;
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

  /* Every reference in this profile is written twice: as a relation edge and
     as the referenced primitive's `id` in the field the edge mirrors. A
     workbook authored through the batch tools carries both, one authored
     field-first carries only the second, and a renderer that reads only
     edges renders an empty document for the latter. Resolution therefore
     tries the edge and falls back to the field. */
  const bySlug = new Map<string, Prim>();
  for (const p of primitives) bySlug.set(`${p.type_id}::${slugOf(p)}`, p);
  const ref = (type: string, relation: string, from: Prim, field: string): Prim | undefined =>
    targets(relation, from.id)[0] ?? bySlug.get(`acad:${type}::${str(from, field)}`);

  const sections = of("Section")
    .slice()
    .sort((a, b) => Number(str(a, "order") || 0) - Number(str(b, "order") || 0) || str(a, "title").localeCompare(str(b, "title")));

  const claimsBySection = new Map<string, Prim[]>();
  for (const c of of("Claim")) {
    const sec = ref("Section", "acad:ClaimSection", c, "section");
    const key = sec?.id ?? "";
    claimsBySection.set(key, [...(claimsBySection.get(key) ?? []), c]);
  }
  const evidenceFor = new Map<string, Prim[]>();
  for (const e of of("Evidence")) {
    const viaEdge = targets("acad:EvidenceSupports", e.id);
    const viaField = arr(e, "supports")
      .map((slug) => bySlug.get(`acad:Claim::${slug}`))
      .filter((x): x is Prim => x !== undefined);
    for (const c of viaEdge.length > 0 ? viaEdge : viaField) {
      evidenceFor.set(c.id, [...(evidenceFor.get(c.id) ?? []), e]);
    }
  }

  /* Section nesting comes from the parent chain. The renderer used to read a
     `level` field, which this profile does not define, so every section was
     rendered flat at depth 2 whatever its parent said. */
  const parentOf = new Map<string, string>();
  for (const s of of("Section")) {
    const parent = ref("Section", "acad:SectionParent", s, "parent");
    if (parent !== undefined && parent.id !== s.id) parentOf.set(s.id, parent.id);
  }
  const depthOf = new Map<string, number>();
  for (const s of of("Section")) {
    let depth = 0;
    let cursor = parentOf.get(s.id);
    const seen = new Set<string>([s.id]);
    while (cursor !== undefined && !seen.has(cursor) && depth < 3) {
      seen.add(cursor);
      depth += 1;
      cursor = parentOf.get(cursor);
    }
    depthOf.set(s.id, depth);
  }

  const conceptFor = new Map<string, Prim>();
  for (const d of of("Definition")) {
    const concept = ref("Concept", "acad:DefinitionConcept", d, "concept");
    if (concept !== undefined) conceptFor.set(d.id, concept);
  }
  const group = (rels: { source: string; target: string }[]): Map<string, Prim[]> => {
    const out = new Map<string, Prim[]>();
    for (const { source, target } of rels) {
      const value = byId.get(target);
      if (value === undefined) continue;
      out.set(source, [...(out.get(source) ?? []), value]);
    }
    return out;
  };
  const edges = (type: string) =>
    relations.filter((r) => r.type_id === type).map((r) => ({ source: r.source_id, target: r.target_id }));
  const flip = (type: string) =>
    relations.filter((r) => r.type_id === type).map((r) => ({ source: r.target_id, target: r.source_id }));

  /* `CounterReads` is keyed by the claim being *countered*, not the one doing
     the countering: a reader looking at a claim wants to know what reads
     against it, which is the inbound direction. */
  const derivedFrom = group(edges("acad:ClaimDerivesFrom"));
  const counteredBy = group(flip("acad:ClaimCounterReads"));
  const supersededBy = group(edges("acad:ClaimSupersededBy"));
  const findingEvidence = group(edges("acad:FindingSupportedBy"));
  const findingTests = group(edges("acad:FindingTestsHypothesis"));

  const citations = of("Citation").map((c) => ({
    citation: c,
    work: targets("acad:CitationCitedWork", c.id)[0],
    citing:
      targets("acad:CitationCitingClaim", c.id)[0] ??
      targets("acad:CitationCitingFinding", c.id)[0] ??
      targets("acad:CitationCitingSection", c.id)[0],
    /* The field is `citingLocator`; `locator` belongs to Evidence. Reading
       the wrong one dropped the page reference from every citation. */
    locator: str(c, "citingLocator"),
  }));

  /* Six primitive types the profile defines — Method, Equation, Figure,
     Table, Quotation and Citation — reached no renderer, so a workbook could
     carry a paper's whole apparatus and the document would not show it. Each
     is attached to the section it belongs to; "" collects any that name no
     section, which are printed after the body rather than dropped. */
  const bySection = (type: string, relation: string): Map<string, Prim[]> => {
    const out = new Map<string, Prim[]>();
    for (const item of of(type)) {
      const section = ref("Section", relation, item, "section");
      const key = section?.id ?? "";
      out.set(key, [...(out.get(key) ?? []), item]);
    }
    return out;
  };
  const citationsForWork = new Map<string, PaperCitation[]>();
  for (const c of citations) {
    if (c.work === undefined) continue;
    citationsForWork.set(c.work.id, [...(citationsForWork.get(c.work.id) ?? []), c]);
  }

  const affiliationOf = new Map<string, string[]>();
  for (const a of of("Author")) {
    affiliationOf.set(a.id, targets("acad:AuthorAffiliations", a.id).map((x) => str(x, "institution")).filter(Boolean));
  }

  return {
    paper: of("Paper")[0],
    authors: of("Author")
      .slice()
      .sort((a, b) => authorPosition(a) - authorPosition(b) || str(a, "fullName").localeCompare(str(b, "fullName"))),
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
    derivedFrom,
    counteredBy,
    supersededBy,
    findingEvidence,
    findingTests,
    citations,
    conceptFor,
    depthOf,
    methods: of("Method"),
    quotationsBySection: bySection("Quotation", "acad:QuotationSection"),
    equationsBySection: bySection("Equation", "acad:EquationSection"),
    figuresBySection: bySection("Figure", "acad:FigureSection"),
    tablesBySection: bySection("Table", "acad:TableSection"),
    citationsForWork,
    hasAuthoredBibliography: sections.some(
      (s) => str(s, "role") === "bibliography" && str(s, "bodyText").trim() !== "",
    ),
    slug: slugOf,
  };
}

/**
 * An author's place in the byline.
 *
 * `position` is an enum — `first`, `middle`, `last` — not a number. Comparing
 * it as text orders first before last before middle; coercing it to a number
 * yields NaN for every author and collapses the byline to alphabetical order.
 * Rank the enum. An author with no position sorts as middle, which is where
 * an unlabelled author belongs and leaves the tie to the name comparison.
 */
function authorPosition(a: Prim): number {
  const raw = str(a, "position");
  switch (raw) {
    case "first":
      return 0;
    case "middle":
      return 1;
    case "last":
      return 2;
    default:
      break;
  }
  /* A workbook that stored an ordinal instead of the enum still gets a
     sensible byline rather than an alphabetical one. */
  const ordinal = Number(raw);
  return raw !== "" && Number.isFinite(ordinal) ? ordinal : 1;
}

/**
 * A section's prose, split into paragraphs.
 *
 * `bodyText` is the field the profile gives a section for its text. The
 * renderer read `summary`, which the profile does not define, so a section
 * rendered as a bare heading followed by its claims and the document's actual
 * prose never reached the page — most visibly in a conclusion or a reference
 * section, which carry prose and no claims and so rendered as nothing at all.
 */
function paragraphs(s: Prim): string[] {
  return str(s, "bodyText")
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
}

/**
 * One reference line.
 *
 * The profile's author field is `authorsFreeText`, a list. The renderer read
 * `authors`, which does not exist, so every generated reference came out
 * anonymous.
 */
/** A quotation, its source locator kept with it. */
function quotationLine(q: Prim): string {
  const locator = str(q, "locator");
  return `${str(q, "body")}${locator ? ` (${locator})` : ""}`;
}

/** An equation reads as its TeX with the label it is referred to by. */
function equationLine(e: Prim): string {
  const label = str(e, "label");
  const role = str(e, "role");
  return `${str(e, "tex") || str(e, "mathml")}${label ? `  (${label})` : ""}${role ? ` — ${role}` : ""}`;
}

/** A figure or a table is its label and its caption. */
function captionLine(kind: string, c: Prim): string {
  const label = str(c, "label");
  return `${kind}${label ? ` ${label}` : ""}. ${str(c, "caption")}`;
}

function reference(w: Prim): string {
  const locator = str(w, "doi") ? `doi:${str(w, "doi")}` : str(w, "url");
  return [
    arr(w, "authorsFreeText").join(", "),
    str(w, "title"),
    str(w, "year"),
    str(w, "venue") || str(w, "publisher"),
    locator,
  ]
    .filter(Boolean)
    .join(". ");
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
    const depth = Math.min(2 + (m.depthOf.get(s.id) ?? 0), 5);
    L.push(`${"#".repeat(depth)} ${str(s, "title")}`, "");
    for (const para of paragraphs(s)) L.push(para, "");
    for (const c of m.claimsBySection.get(s.id) ?? []) {
      L.push(`**Claim (${str(c, "kind") || "claim"}).** ${str(c, "statement")}`, "");
      const evidence = m.evidenceFor.get(c.id) ?? [];
      /* An unsupported claim is the thing a reviewer is looking for, and a
         renderer that simply prints nothing under it hides exactly that. */
      if (evidence.length === 0) L.push("> _No evidence recorded for this claim._", "");
      for (const e of evidence) {
        L.push(`> _${str(e, "kind") || "evidence"}:_ ${str(e, "summary") || str(e, "statement")}`, "");
      }
    }
    L.push(...apparatusMarkdown(m, s.id));
  }

  /* A claim with no `acad:ClaimSection` edge belongs to the paper but to no
     section. Rendering only the per-section buckets dropped it from the
     document entirely — the one failure mode a reader cannot detect, because
     nothing on the page says a claim is missing. */
  const unplaced = m.claimsBySection.get("") ?? [];
  if (unplaced.length > 0) {
    L.push("## Claims not placed in a section", "");
    for (const c of unplaced) {
      L.push(`**Claim (${str(c, "kind") || "claim"}).** ${str(c, "statement")}`, "");
      const evidence = m.evidenceFor.get(c.id) ?? [];
      if (evidence.length === 0) L.push("> _No evidence recorded for this claim._", "");
      for (const e of evidence) {
        L.push(`> _${str(e, "kind") || "evidence"}:_ ${str(e, "summary") || str(e, "statement")}`, "");
      }
    }
  }
  L.push(...apparatusMarkdown(m, ""));

  if (m.methods.length) {
    L.push("## Methods", "");
    for (const method of m.methods) {
      const kind = str(method, "kind");
      L.push(`**${str(method, "name")}**${kind ? ` _(${kind})_` : ""}`, "");
      if (str(method, "procedure")) L.push(str(method, "procedure"), "");
    }
  }

  if (m.findings.length) {
    L.push("## Findings", "");
    for (const f of m.findings) L.push(`- **${str(f, "statement")}**${str(f, "outcome") ? ` _(${str(f, "outcome")})_` : ""}`);
    L.push("");
  }
  if (m.limitations.length) {
    L.push("## Limitations", "");
    for (const l of m.limitations) L.push(`- ${str(l, "statement") || str(l, "summary")}`);
    L.push("");
  }
  if (m.definitions.length) {
    L.push("## Definitions", "");
    for (const d of m.definitions) {
      const term = str(m.conceptFor.get(d.id), "label") || m.slug(d);
      const provenance = str(d, "provenance");
      L.push(`- **${term}** — ${str(d, "body")}${provenance ? ` _(${provenance})_` : ""}`);
    }
    L.push("");
  }
  /* A paper that wrote its own reference section gets that one, not a second
     generated list under a duplicate heading. */
  if (m.works.length && !m.hasAuthoredBibliography) {
    L.push("## References", "");
    for (const w of m.works) {
      const cited = (m.citationsForWork.get(w.id) ?? []).map((c) => c.locator).filter(Boolean);
      L.push(`- ${reference(w)}${cited.length > 0 ? ` — cited at ${cited.join("; ")}` : ""}`);
    }
    L.push("");
  }
  if (m.funding.length) {
    L.push("## Funding", "");
    for (const f of m.funding) {
      const award = [str(f, "awardTitle"), str(f, "awardId")].filter(Boolean).join(", ");
      L.push(`- ${str(f, "funder") || m.slug(f)}${award ? ` — ${award}` : ""}`);
    }
    L.push("");
  }
  if (m.errata.length) {
    L.push("## Errata", "");
    for (const e of m.errata) {
      const head = [str(e, "issuedDate"), str(e, "kind"), str(e, "title")].filter(Boolean).join(" · ");
      L.push(`- ${head}${str(e, "body") ? ` — ${str(e, "body")}` : ""}`);
    }
    L.push("");
  }

  return {
    bytes: new TextEncoder().encode(L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "paper.md",
  };
}

/**
 * The apparatus attached to one section, in reading order.
 *
 * Passing `""` renders whatever named no section, so an unattached figure is
 * still printed rather than silently dropped.
 */
function apparatusMarkdown(m: PaperModel, sectionId: string): string[] {
  const L: string[] = [];
  for (const q of m.quotationsBySection.get(sectionId) ?? []) L.push(`> ${quotationLine(q)}`, "");
  for (const e of m.equationsBySection.get(sectionId) ?? []) L.push(`\`${equationLine(e)}\``, "");
  for (const f of m.figuresBySection.get(sectionId) ?? []) L.push(`_${captionLine("Figure", f)}_`, "");
  for (const t of m.tablesBySection.get(sectionId) ?? []) L.push(`_${captionLine("Table", t)}_`, "");
  return L;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The same apparatus as `apparatusMarkdown`, escaped for the HTML target. */
function apparatusHtml(m: PaperModel, sectionId: string): string[] {
  const H: string[] = [];
  for (const q of m.quotationsBySection.get(sectionId) ?? []) H.push(`<blockquote>${esc(quotationLine(q))}</blockquote>`);
  for (const e of m.equationsBySection.get(sectionId) ?? []) H.push(`<p><code>${esc(equationLine(e))}</code></p>`);
  for (const f of m.figuresBySection.get(sectionId) ?? []) H.push(`<p><em>${esc(captionLine("Figure", f))}</em></p>`);
  for (const t of m.tablesBySection.get(sectionId) ?? []) H.push(`<p><em>${esc(captionLine("Table", t))}</em></p>`);
  return H;
}

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
    const h = `h${Math.min(2 + (m.depthOf.get(s.id) ?? 0), 5)}`;
    H.push(`<${h}>${esc(str(s, "title"))}</${h}>`);
    for (const para of paragraphs(s)) H.push(`<p>${esc(para)}</p>`);
    for (const c of m.claimsBySection.get(s.id) ?? []) {
      H.push('<div class="claim">', `<div class="kind">${esc(str(c, "kind") || "claim")}</div>`, `<p>${esc(str(c, "statement"))}</p>`);
      const evidence = m.evidenceFor.get(c.id) ?? [];
      if (evidence.length === 0) H.push("<blockquote>No evidence recorded for this claim.</blockquote>");
      for (const e of evidence) {
        H.push(`<blockquote>${esc(str(e, "kind") || "evidence")}: ${esc(str(e, "summary") || str(e, "statement"))}</blockquote>`);
      }
      H.push("</div>");
    }
    H.push(...apparatusHtml(m, s.id));
  }

  const unplacedHtml = m.claimsBySection.get("") ?? [];
  if (unplacedHtml.length > 0) {
    H.push("<h2>Claims not placed in a section</h2>");
    for (const c of unplacedHtml) {
      H.push('<div class="claim">', `<div class="kind">${esc(str(c, "kind") || "claim")}</div>`, `<p>${esc(str(c, "statement"))}</p>`);
      const evidence = m.evidenceFor.get(c.id) ?? [];
      if (evidence.length === 0) H.push("<blockquote>No evidence recorded for this claim.</blockquote>");
      for (const e of evidence) {
        H.push(`<blockquote>${esc(str(e, "kind") || "evidence")}: ${esc(str(e, "summary") || str(e, "statement"))}</blockquote>`);
      }
      H.push("</div>");
    }
  }
  H.push(...apparatusHtml(m, ""));

  if (m.methods.length) {
    H.push("<h2>Methods</h2>");
    for (const method of m.methods) {
      const kind = str(method, "kind");
      H.push(`<h3>${esc(str(method, "name"))}${kind ? ` <em>(${esc(kind)})</em>` : ""}</h3>`);
      if (str(method, "procedure")) H.push(`<p>${esc(str(method, "procedure"))}</p>`);
    }
  }
  if (m.findings.length) {
    H.push("<h2>Findings</h2><ul>");
    for (const f of m.findings) {
      const outcome = str(f, "outcome");
      H.push(`<li>${esc(str(f, "statement"))}${outcome ? ` <em>(${esc(outcome)})</em>` : ""}</li>`);
    }
    H.push("</ul>");
  }
  /* The HTML target dropped limitations and definitions entirely, so the two
     targets disagreed about what the paper contained. They are built from one
     model precisely so that cannot happen. */
  if (m.limitations.length) {
    H.push("<h2>Limitations</h2><ul>");
    for (const l of m.limitations) H.push(`<li>${esc(str(l, "statement"))}</li>`);
    H.push("</ul>");
  }
  if (m.definitions.length) {
    H.push("<h2>Definitions</h2><ul>");
    for (const d of m.definitions) {
      const term = str(m.conceptFor.get(d.id), "label") || m.slug(d);
      const provenance = str(d, "provenance");
      H.push(
        `<li><strong>${esc(term)}</strong> — ${esc(str(d, "body"))}${provenance ? ` <em>(${esc(provenance)})</em>` : ""}</li>`,
      );
    }
    H.push("</ul>");
  }
  if (m.works.length && !m.hasAuthoredBibliography) {
    H.push("<h2>References</h2><ol class=\"refs\">");
    for (const w of m.works) {
      const cited = (m.citationsForWork.get(w.id) ?? []).map((c) => c.locator).filter(Boolean);
      H.push(`<li>${esc(reference(w))}${cited.length > 0 ? ` — cited at ${esc(cited.join("; "))}` : ""}</li>`);
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
