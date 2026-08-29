/**
 * `application/pdf` — the paper as a paper.
 *
 * The Markdown and HTML views are for reading inside the tooling. This is the
 * artefact that leaves it: circulated to a co-author, attached to a review,
 * archived against a submission. So it is paginated, carries its own
 * provenance, and states the argument's shape rather than assuming the reader
 * can query the workbook.
 *
 * The order is the order a paper is read — byline, abstract, then sections
 * with their claims, each claim followed by the evidence that supports it and
 * anything that reads against it, then findings, limitations, and the
 * references. A claim with no supporting evidence is marked, because that is
 * the fact a reviewer is looking for and prose hides it.
 *
 * pdf-lib's StandardFonts are WinAnsi, so every string is sanitised on the way
 * in via `src/core/render/pdf.ts`. Without that a single accented name — which
 * is most papers — makes the whole render throw.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { PdfCursor, drawPageNumbers } from "../../../src/core/render/pdf.js";
import { buildPaperModel } from "./paper_document.js";

interface Prim {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

const FG: RGB = rgb(0.09, 0.09, 0.11);
const MUTED: RGB = rgb(0.42, 0.45, 0.5);
const ACCENT: RGB = rgb(0.17, 0.37, 0.66);
const ALERT: RGB = rgb(0.7, 0.15, 0.12);

const BODY = 10;
const SMALL = 8.5;
const H1 = 22;
const H2 = 13;

const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

/** Whichever field this type uses for its sentence. */
function label(p: Prim): string {
  return str(p, "statement") || str(p, "summary") || str(p, "title") || str(p, "name") || str(p, "id");
}

export async function renderPaperPdf(input: RendererInput): Promise<RendererOutput> {
  const model = buildPaperModel(input.primitives as never, input.relations as never);
  const prims = input.primitives as unknown as Prim[];

  const doc = await PDFDocument.create();
  /* A PDF embeds a creation and modification date by default, which would
     make two renders of an unchanged workbook differ. Both are pinned so the
     output is a function of the workbook alone and can be diffed. */
  const epoch = new Date(0);
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  doc.setProducer("fdpm acad:PaperPdfRenderer");
  doc.setCreator("fdpm acad:PaperPdfRenderer");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const paper = model.paper as unknown as Prim | undefined;
  const title = str(paper, "title") || input.workbookId;
  doc.setTitle(title);

  const cur = new PdfCursor(doc, { margin: 62, footerReserve: 30 });

  const heading = (t: string, size: number, font: PDFFont = bold, color: RGB = FG): void => {
    cur.ensure(size * 2.2);
    cur.advance(size * 0.7);
    cur.text(t, { font, size, color });
  };
  const para = (t: string, opts: { font?: PDFFont; size?: number; color?: RGB; indent?: number } = {}): void => {
    if (!t) return;
    cur.text(t, {
      font: opts.font ?? regular,
      size: opts.size ?? BODY,
      color: opts.color ?? FG,
      ...(opts.indent === undefined ? {} : { indent: opts.indent }),
    });
  };

  // -- Title block ---------------------------------------------------------
  cur.text(title, { font: bold, size: H1, color: FG, lineHeight: H1 * 1.2 });
  cur.advance(6);

  const byline = model.authors
    .map((a) => {
      const name = str(a as unknown as Prim, "fullName");
      const affs = model.affiliationOf.get((a as unknown as Prim).id) ?? [];
      return affs.length > 0 ? `${name} (${affs.join("; ")})` : name;
    })
    .filter(Boolean)
    .join(", ");
  if (byline) para(byline, { font: italic, size: BODY, color: MUTED });

  para(`${input.workbookId} · ${str(paper, "venue") || "unpublished"}`, {
    size: SMALL,
    color: MUTED,
  });

  const abstract = str(paper, "abstract");
  if (abstract) {
    heading("Abstract", H2);
    para(abstract);
  }

  // -- Sections, claims, and what stands behind them ------------------------
  for (const section of model.sections) {
    const sec = section as unknown as Prim;
    heading(str(sec, "title") || sec.id, H2);
    para(str(sec, "body") || str(sec, "summary"));

    for (const claim of model.claimsBySection.get(sec.id) ?? []) {
      const c = claim as unknown as Prim;
      cur.advance(4);
      para(`Claim. ${label(c)}`, { font: bold, size: BODY });

      const support = model.evidenceFor.get(c.id) ?? [];
      for (const e of support) {
        para(`Evidence: ${label(e as unknown as Prim)}`, { size: SMALL, color: MUTED, indent: 14 });
      }
      if (support.length === 0) {
        /* The point of the whole view: an unsupported claim is a reviewable
           fact, and a bullet list does not show it. */
        para("No evidence attached to this claim.", { size: SMALL, color: ALERT, indent: 14 });
      }
      for (const d of model.derivedFrom.get(c.id) ?? []) {
        para(`Derives from: ${label(d as unknown as Prim)}`, { size: SMALL, color: ACCENT, indent: 14 });
      }
      for (const k of model.counteredBy.get(c.id) ?? []) {
        para(`Read against by: ${label(k as unknown as Prim)}`, { size: SMALL, color: ALERT, indent: 14 });
      }
      for (const s of model.supersededBy.get(c.id) ?? []) {
        para(`Superseded by: ${label(s as unknown as Prim)}`, { size: SMALL, color: ALERT, indent: 14 });
      }
    }
  }

  const emitList = (title: string, items: readonly unknown[], line: (p: Prim) => string): void => {
    if (items.length === 0) return;
    heading(title, H2);
    for (const item of items) para(line(item as Prim), { indent: 8 });
  };

  emitList("Findings", model.findings, (f) => {
    const tests = model.findingTests.get(f.id) ?? [];
    const suffix = tests.length > 0 ? ` (tests: ${tests.map((t) => label(t as unknown as Prim)).join("; ")})` : "";
    return `${label(f)}${suffix}`;
  });
  emitList("Limitations", model.limitations, (l) => label(l));
  emitList(
    "Methods",
    prims.filter((p) => p.type_id === "acad:Method"),
    (m) => `${str(m, "name")}${str(m, "description") ? ` — ${str(m, "description")}` : ""}`,
  );
  emitList(
    "Equations",
    prims.filter((p) => p.type_id === "acad:Equation"),
    (e) => `(${str(e, "label") || "—"}) ${str(e, "latex") || label(e)}`,
  );
  emitList(
    "Figures",
    prims.filter((p) => p.type_id === "acad:Figure"),
    (f) => `${str(f, "label") ? `${str(f, "label")}. ` : ""}${str(f, "caption") || label(f)}`,
  );
  emitList(
    "Tables",
    prims.filter((p) => p.type_id === "acad:Table"),
    (t) => `${str(t, "label") ? `${str(t, "label")}. ` : ""}${str(t, "caption") || label(t)}`,
  );

  if (model.works.length > 0) {
    heading("References", H2);
    for (const work of model.works) {
      const w = work as unknown as Prim;
      const authors = Array.isArray(w.field_values["authors"])
        ? (w.field_values["authors"] as unknown[]).map(String).join(", ")
        : str(w, "authors");
      const bits = [authors, str(w, "year"), str(w, "title"), str(w, "containerTitle") || str(w, "publisher")]
        .filter(Boolean)
        .join(". ");
      para(bits, { size: SMALL, indent: 8 });
      const doi = str(w, "doi");
      if (doi) para(`doi:${doi}`, { size: SMALL, color: ACCENT, indent: 16 });
    }
  }

  drawPageNumbers(doc, regular, MUTED);

  return {
    bytes: await doc.save(),
    contentType: "application/pdf",
    filename: `${input.workbookId}.pdf`,
  };
}
