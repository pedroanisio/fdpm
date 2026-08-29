import { describe, expect, it } from "vitest";
import type { RendererInput } from "../../../src/plugin/types.js";
import { buildPaperModel } from "../../../plugins/academic_paper_v0_4_1/renderers/paper_document.js";
import { renderArgumentGraph } from "../../../plugins/academic_paper_v0_4_1/renderers/argument_graph.js";
import { renderBibliography } from "../../../plugins/academic_paper_v0_4_1/renderers/bibliography.js";
import { renderPaperPdf } from "../../../plugins/academic_paper_v0_4_1/renderers/paper_pdf.js";
import { renderPaperLatex } from "../../../plugins/academic_paper_v0_4_1/renderers/paper_latex.js";
import {
  renderPaperMarkdown,
  renderPaperHtml,
} from "../../../plugins/academic_paper_v0_4_1/renderers/paper_document.js";

/**
 * Renderers for `profile:academic-paper:0.4.1`.
 *
 * The profile carries 24 primitive types and 61 relation types, and the two
 * renderers it shipped with read only nine of those types. Everything that
 * makes the model a *paper* rather than a record set — the argument graph
 * (`ClaimDerivesFrom`, `ClaimCounterReads`, `ClaimSupersededBy`,
 * `FindingSupportedBy`, `FindingTestsHypothesis`) and the citation apparatus
 * (`Citation` with its locator and its cited `Work`) — went unrendered.
 *
 * The fixture below is a small but complete paper exercising exactly those
 * edges, so a renderer that ignores them fails rather than merely looks thin.
 */

let n = 0;
const P = (type: string, id: string, fields: Record<string, unknown> = {}) => ({
  id,
  uid: `u${(n += 1)}`,
  type_id: `acad:${type}`,
  field_values: { id: id.split(":").pop(), ...fields },
  revision: 1,
});
const R = (type: string, source_id: string, target_id: string) => ({
  id: `r${(n += 1)}`,
  uid: `ru${n}`,
  type_id: `acad:${type}`,
  source_id,
  target_id,
  field_values: {},
  revision: 1,
});

const PRIMS = [
  P("Paper", "acad:Paper:p1", { title: "On Measurement", abstract: "An abstract." }),
  // `position` is a number: sorting it as a string puts 10 before 2.
  P("Author", "acad:Author:a2", { fullName: "Zoe Vidal", position: 2 }),
  P("Author", "acad:Author:a10", { fullName: "Ana Brum", position: 10 }),
  P("Author", "acad:Author:a1", { fullName: "Ken Ito", position: 1 }),
  P("Section", "acad:Section:s1", { title: "Introduction", order: 1, bodyText: "Opening prose." }),
  P("Claim", "acad:Claim:c1", { statement: "Measurement is theory-laden." }),
  P("Claim", "acad:Claim:c2", { statement: "Instruments encode commitments." }),
  P("Claim", "acad:Claim:c3", { statement: "Neutral observation is possible." }),
  P("Claim", "acad:Claim:c4", { statement: "An earlier, weaker formulation." }),
  P("Evidence", "acad:Evidence:e1", { summary: "Calibration study." }),
  P("Finding", "acad:Finding:f1", { statement: "Readings diverged by instrument." }),
  P("Work", "acad:Work:w1", {
    title: "The Structure of Scientific Revolutions",
    authorsFreeText: ["Kuhn, Thomas S."],
    year: 1962,
    publisher: "University of Chicago Press",
    doi: "10.7208/chicago/9780226458144.001.0001",
  }),
  P("Work", "acad:Work:w2", {
    title: "Representing and Intervening",
    authorsFreeText: ["Hacking, Ian"],
    year: 1983,
    venue: "Cambridge University Press",
  }),
  P("Citation", "acad:Citation:cit1", { citingLocator: "pp. 52-53" }),
  P("Equation", "acad:Equation:eq1", { label: "1", tex: "E = mc^2" }),
  P("Figure", "acad:Figure:fig1", { caption: "Instrument drift over time." }),
  P("Table", "acad:Table:t1", { caption: "Calibration results." }),
  P("Method", "acad:Method:m1", { name: "Comparative calibration", procedure: "Two instruments, one sample." }),
  P("Quotation", "acad:Quotation:q1", { body: "Paradigms are constitutive." }),
];

const RELS = [
  R("AuthorPaper", "acad:Author:a1", "acad:Paper:p1"),
  R("SectionPaper", "acad:Section:s1", "acad:Paper:p1"),
  R("ClaimSection", "acad:Claim:c1", "acad:Section:s1"),
  // The argument: c2 derives from c1, c3 counters c1, c1 supersedes c4.
  R("ClaimDerivesFrom", "acad:Claim:c2", "acad:Claim:c1"),
  R("ClaimCounterReads", "acad:Claim:c3", "acad:Claim:c1"),
  R("ClaimSupersededBy", "acad:Claim:c4", "acad:Claim:c1"),
  R("EvidenceSupports", "acad:Evidence:e1", "acad:Claim:c1"),
  R("FindingSupportedBy", "acad:Finding:f1", "acad:Evidence:e1"),
  R("FindingTestsHypothesis", "acad:Finding:f1", "acad:Claim:c1"),
  R("CitationCitedWork", "acad:Citation:cit1", "acad:Work:w1"),
  R("CitationCitingClaim", "acad:Citation:cit1", "acad:Claim:c1"),
  R("EquationSection", "acad:Equation:eq1", "acad:Section:s1"),
  R("FigureSection", "acad:Figure:fig1", "acad:Section:s1"),
  R("TableSection", "acad:Table:t1", "acad:Section:s1"),
  R("MethodPaper", "acad:Method:m1", "acad:Paper:p1"),
  R("QuotationSection", "acad:Quotation:q1", "acad:Section:s1"),
];

const input = (): RendererInput =>
  ({
    workbookId: "paper-wb",
    primitives: PRIMS,
    relations: RELS,
    profile: { id: "profile:academic-paper:0.4.1" },
  }) as unknown as RendererInput;

const text = (out: { bytes: Uint8Array }) => new TextDecoder().decode(out.bytes);

describe("buildPaperModel — the argument the profile encodes", () => {
  const m = () => buildPaperModel(PRIMS as never, RELS as never);

  it("orders authors by position numerically, not lexically", () => {
    // "10" < "2" as a string, which would put Ana Brum second.
    expect(m().authors.map((a) => String(a.field_values["fullName"]))).toEqual([
      "Ken Ito",
      "Zoe Vidal",
      "Ana Brum",
    ]);
  });

  it("reads the claim-to-claim edges the document renderer ignored", () => {
    const model = m();
    expect(model.derivedFrom.get("acad:Claim:c2")?.map((c) => c.id)).toEqual(["acad:Claim:c1"]);
    expect(model.counteredBy.get("acad:Claim:c1")?.map((c) => c.id)).toEqual(["acad:Claim:c3"]);
    expect(model.supersededBy.get("acad:Claim:c4")?.map((c) => c.id)).toEqual(["acad:Claim:c1"]);
  });

  it("links a finding to the evidence it rests on and the claim it tests", () => {
    const model = m();
    expect(model.findingEvidence.get("acad:Finding:f1")?.map((e) => e.id)).toEqual([
      "acad:Evidence:e1",
    ]);
    expect(model.findingTests.get("acad:Finding:f1")?.map((c) => c.id)).toEqual(["acad:Claim:c1"]);
  });

  it("resolves a citation to its cited work and its citing claim", () => {
    const [c] = m().citations;
    expect(c!.work?.id).toBe("acad:Work:w1");
    expect(c!.citing?.id).toBe("acad:Claim:c1");
    expect(c!.locator).toBe("pp. 52-53");
  });
});

describe("acad:ArgumentGraphRenderer", () => {
  it("draws a node per claim, evidence and finding", async () => {
    const svg = text(await renderArgumentGraph(input()));
    for (const s of ["Measurement is theory-laden", "Calibration study", "Readings diverged"]) {
      expect(svg).toContain(s.slice(0, 24));
    }
  });

  it("distinguishes support from rebuttal, rather than drawing one edge style", async () => {
    const svg = text(await renderArgumentGraph(input()));
    // Every relation kind the argument uses must be legible in the output.
    for (const legend of ["supports", "derives from", "counters", "supersedes", "tests"]) {
      expect(svg.toLowerCase()).toContain(legend);
    }
  });

  it("is a standalone, sized SVG so a viewer can frame it", async () => {
    const out = await renderArgumentGraph(input());
    const svg = text(out);
    expect(out.contentType).toBe("image/svg+xml");
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("escapes markup in a claim rather than emitting it", async () => {
    const prims = [...PRIMS, P("Claim", "acad:Claim:cx", { statement: 'a <b> & "c"' })];
    const svg = text(await renderArgumentGraph({ ...input(), primitives: prims } as RendererInput));
    expect(svg).toContain("&lt;b&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<b>");
  });

  it("reports an empty argument as a finding instead of an empty canvas", async () => {
    const out = await renderArgumentGraph({
      ...input(),
      primitives: [PRIMS[0]!],
      relations: [],
    } as RendererInput);
    expect(out.findings?.some((f) => /no claims/i.test(f.message))).toBe(true);
  });
});

describe("acad:BibliographyRenderer", () => {
  it("emits a BibTeX entry per cited work", async () => {
    const bib = text(await renderBibliography(input()));
    expect(bib).toContain("@book{");
    expect(bib).toContain("title = {{The Structure of Scientific Revolutions}}");
    expect(bib).toContain("author = {Kuhn, Thomas S.}");
    expect(bib).toContain("year = {1962}");
    expect(bib).toContain("doi = {10.7208/chicago/9780226458144.001.0001}");
  });

  it("derives a stable citation key from author, year and title", async () => {
    const bib = text(await renderBibliography(input()));
    expect(bib).toContain("@book{kuhn1962structure");
  });

  /* Under most BibTeX styles an unbraced title is case-folded, so a naive
     emitter yields "the structure of scientific revolutions". The whole title
     takes one extra brace pair rather than one per capitalised word, which
     would leave the source as `{Representing} and {Intervening}`. */
  it("brace-protects capitals so BibTeX does not lowercase them", async () => {
    const bib = text(await renderBibliography(input()));
    expect(bib).toMatch(/title = \{\{The Structure of Scientific Revolutions\}\}/);
    expect(bib).toContain("title = {{Representing and Intervening}}");
  });

  it("escapes the characters BibTeX treats as syntax", async () => {
    const prims = [
      ...PRIMS,
      P("Work", "acad:Work:w3", { title: "Cost & Effect: 100% of #1", year: 2001 }),
    ];
    const bib = text(
      await renderBibliography({ ...input(), primitives: prims } as RendererInput),
    );
    expect(bib).toContain("\\&");
    expect(bib).toContain("\\%");
    expect(bib).toContain("\\#");
  });

  it("declares the BibTeX media type and a .bib filename", async () => {
    const out = await renderBibliography(input());
    expect(out.contentType).toBe("application/x-bibtex");
    expect(out.filename).toMatch(/\.bib$/);
  });

  it("still emits an uncited work, because a bibliography is not a citation list", async () => {
    const bib = text(await renderBibliography(input()));
    expect(bib).toContain("Representing and Intervening");
  });
});

describe("acad:PaperPdfRenderer", () => {
  it("produces a real PDF, not text with a pdf label", async () => {
    const out = await renderPaperPdf(input());
    expect(out.contentType).toBe("application/pdf");
    expect(out.filename).toMatch(/\.pdf$/);
    // %PDF-1.
    expect([...out.bytes.slice(0, 5)]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(out.bytes.byteLength).toBeGreaterThan(1000);
  });

  /* pdf-lib's StandardFonts are WinAnsi. A single character outside that
     encoding throws on draw, so a paper with an accented author name — which
     is most papers — must still render. */
  it("survives characters outside WinAnsi rather than throwing", async () => {
    const prims = [
      ...PRIMS,
      P("Author", "acad:Author:a3", { fullName: "Łukasz Ćwik — 東京", position: 3 }),
      P("Claim", "acad:Claim:c9", { statement: "A claim with 中文 and an emoji 🙂." }),
    ];
    const out = await renderPaperPdf({ ...input(), primitives: prims } as RendererInput);
    expect(out.bytes.byteLength).toBeGreaterThan(1000);
  });

  it("renders an empty workbook without throwing", async () => {
    const out = await renderPaperPdf({ ...input(), primitives: [], relations: [] } as RendererInput);
    expect(out.bytes.byteLength).toBeGreaterThan(500);
  });

  it("is deterministic, so an unchanged workbook re-renders byte-identically", async () => {
    const a = await renderPaperPdf(input());
    const b = await renderPaperPdf(input());
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});

/**
 * The prose views, enhanced.
 *
 * Six primitive types the profile defines — Method, Equation, Figure, Table,
 * Quotation, Citation — reached no renderer at all, so a workbook could carry
 * a paper's whole apparatus and the document would not show it. And the
 * References section listed works without the citations that reach them,
 * which is the one thing a reference is for.
 */
describe("acad:PaperDocumentRenderer — apparatus coverage", () => {
  const md = () => text(renderPaperMarkdown(input()));

  it("renders the byline in position order", () => {
    expect(md()).toMatch(/Ken Ito.*Zoe Vidal.*Ana Brum/s);
  });

  it("shows the methods the paper used", () => {
    expect(md()).toContain("Comparative calibration");
  });

  it("shows equations with their label and source", () => {
    const out = md();
    expect(out).toContain("E = mc^2");
    expect(out).toMatch(/\(1\)/);
  });

  it("shows figures and tables by caption", () => {
    const out = md();
    expect(out).toContain("Instrument drift over time.");
    expect(out).toContain("Calibration results.");
  });

  it("shows quotations", () => {
    expect(md()).toContain("Paradigms are constitutive.");
  });

  it("cites: a reference carries the locator and what cited it", () => {
    const out = md();
    expect(out).toContain("The Structure of Scientific Revolutions");
    expect(out).toContain("pp. 52-53");
  });

  it("marks a claim that nothing supports", () => {
    // c2, c3 and c4 have no acad:EvidenceSupports edge.
    expect(md().toLowerCase()).toContain("no evidence");
  });

  /* Regression. Claims were rendered only through their section bucket, so a
     claim carrying no `acad:ClaimSection` edge appeared in no view at all —
     silent data loss, and the one failure a reader cannot detect, because
     nothing on the page says a claim is missing. */
  it("renders a claim that belongs to no section instead of dropping it", () => {
    const out = md();
    for (const statement of [
      "Instruments encode commitments.",
      "Neutral observation is possible.",
      "An earlier, weaker formulation.",
    ]) {
      expect(out).toContain(statement);
    }
  });

  it("renders an unsectioned claim in the html view too", () => {
    const html = text(renderPaperHtml(input()));
    expect(html).toContain("Instruments encode commitments.");
  });

  it("escapes HTML in the html view rather than emitting it", () => {
    const prims = [...PRIMS, P("Finding", "acad:Finding:fx", { statement: "<script>x</script>" })];
    const html = text(renderPaperHtml({ ...input(), primitives: prims } as RendererInput));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });

  it("keeps both prose views built from the same model", () => {
    const html = text(renderPaperHtml(input()));
    for (const s of ["Comparative calibration", "Instrument drift over time.", "E = mc^2"]) {
      expect(html).toContain(s.replace(/</g, "&lt;"));
    }
  });
});

/**
 * `application/x-tex` — the paper as LaTeX source.
 *
 * The PDF renderer draws with pdf-lib: Helvetica, no math typesetting, no
 * journal class. That is the right artefact for circulation and the wrong one
 * for submission. LaTeX source is the submittable form — it carries the
 * equations as the TeX the profile already stores in `acad:Equation.tex`, and
 * it hands typesetting to a real engine.
 *
 * The pairing with the BibTeX renderer is the part that can break silently:
 * a `\cite{key}` whose key is not in the .bib compiles to a bold [?] rather
 * than an error, so the two renderers must derive keys from one function.
 */
describe("acad:LatexRenderer", () => {
  const tex = async () => text(await renderPaperLatex(input()));

  it("emits a complete, compilable document", async () => {
    const out = await tex();
    expect(out).toMatch(/\\documentclass(\[[^\]]*\])?\{\w+\}/);
    expect(out).toContain("\\begin{document}");
    expect(out).toContain("\\end{document}");
    expect(out.indexOf("\\begin{document}")).toBeLessThan(out.indexOf("\\end{document}"));
  });

  it("carries the title, byline in position order, and abstract", async () => {
    const out = await tex();
    expect(out).toContain("\\title{On Measurement}");
    expect(out).toMatch(/Ken Ito.*Zoe Vidal.*Ana Brum/s);
    expect(out).toContain("\\begin{abstract}");
  });

  it("uses the TeX the profile stores, in a numbered equation", async () => {
    const out = await tex();
    expect(out).toContain("\\begin{equation}");
    expect(out).toContain("E = mc^2");
  });

  it("cites with keys the bibliography renderer actually emits", async () => {
    const out = await tex();
    const bib = text(await renderBibliography(input()));
    const cites = [...out.matchAll(/\\cite\{([^}]+)\}/g)].map((m) => m[1]!);
    expect(cites.length).toBeGreaterThan(0);
    for (const key of cites) {
      // A key absent from the .bib compiles to [?] rather than failing.
      expect(bib).toContain(`{${key},`);
    }
  });

  it("points \\bibliography at the sibling .bib basename", async () => {
    const out = await tex();
    const bibOut = await renderBibliography(input());
    const base = bibOut.filename!.replace(/\.bib$/, "");
    expect(out).toContain(`\\bibliography{${base}}`);
  });

  it("escapes TeX syntax in prose rather than emitting a broken document", async () => {
    const prims = [
      ...PRIMS,
      P("Limitation", "acad:Limitation:lx", { statement: "Costs rose 50% & #3 failed_twice" }),
    ];
    const out = text(await renderPaperLatex({ ...input(), primitives: prims } as RendererInput));
    expect(out).toContain("50\\%");
    expect(out).toContain("\\&");
    expect(out).toContain("\\#");
    expect(out).toContain("failed\\_twice");
  });

  it("renders sections and figures with captions", async () => {
    const out = await tex();
    expect(out).toContain("\\section{Introduction}");
    expect(out).toContain("\\caption{Instrument drift over time.}");
  });

  it("declares the TeX media type and a .tex filename", async () => {
    const out = await renderPaperLatex(input());
    expect(out.contentType).toBe("application/x-tex");
    expect(out.filename).toMatch(/\.tex$/);
  });
});
