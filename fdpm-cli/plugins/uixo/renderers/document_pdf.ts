/**
 * `application/pdf` — the document as a paginated specification.
 *
 * This is the view that leaves the workbook: the artefact attached to a
 * review, sent to someone without the CLI, or archived against a release.
 * That is why it is paginated and self-describing rather than a print of
 * the HTML — a PDF is read where the tooling is not, so it carries its
 * own provenance line, its own contents, and page numbers.
 *
 * Structure: a title page carrying the counts and the profile, then the
 * containment forest as an indented outline with each entity's attributes
 * and its links, then the two censuses.
 *
 * Indentation rather than nesting is deliberate. The wireframe views nest
 * boxes because a box has a width to give away; a page does not, and an
 * outline indented past six levels on A4 has no measure left. Depth is
 * shown by indent up to a cap and by an explicit depth marker beyond it,
 * so a deep document stays readable instead of collapsing into a column.
 *
 * pdf-lib's StandardFonts are WinAnsi, so every string is sanitised on
 * the way in — see `src/core/render/pdf.ts`. Without that a single exotic
 * character in a label makes the whole render throw.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { A4_WIDTH, PdfCursor, drawPageNumbers, wrapToWidth } from "../../../src/core/render/pdf.js";
import {
  displayName,
  flattenValue,
  readDocument,
  type DocumentView,
  type NodeView,
} from "./_model.js";

const FG: RGB = rgb(0.09, 0.09, 0.11);
const MUTED: RGB = rgb(0.42, 0.45, 0.5);
const ACCENT: RGB = rgb(0.17, 0.37, 0.66);
const ALERT: RGB = rgb(0.7, 0.15, 0.12);
const RULE: RGB = rgb(0.85, 0.87, 0.89);

const BODY = 9.5;
const SMALL = 8;
const H1 = 26;
const H2 = 14;
const INDENT_STEP = 14;
/** Past this depth the indent stops growing and the level is printed. */
const MAX_INDENT_DEPTH = 6;

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

function titlePage(cur: PdfCursor, doc: DocumentView, fonts: Fonts): void {
  cur.advance(120);
  cur.line("UIXO document", { font: fonts.bold, size: H1, color: FG });
  cur.advance(6);
  cur.text(doc.workbookId, { font: fonts.mono, size: 12, color: ACCENT });
  cur.advance(18);

  const rows: [string, string][] = [
    ["Profile", doc.profileId],
    ["Entities", String(doc.nodeCount)],
    ["Edges", String(doc.edgeCount)],
    ["Roots", String(doc.roots.length)],
    ["Distinct classes", String(doc.classCensus.length)],
    ["Distinct edge properties", String(doc.relationCensus.length)],
  ];
  for (const [key, value] of rows) {
    cur.ensure(15);
    cur.y -= 15;
    cur.page.drawText(key, { x: cur.margin, y: cur.y, size: BODY, font: fonts.bold, color: MUTED });
    cur.page.drawText(value, {
      x: cur.margin + 150,
      y: cur.y,
      size: BODY,
      font: fonts.mono,
      color: FG,
    });
  }

  if (doc.cycleBroken.length > 0) {
    cur.advance(18);
    cur.text(
      `${doc.cycleBroken.length} entity(ies) are reachable only by breaking a cycle in the containment graph. They are listed at their own root below.`,
      { font: fonts.body, size: BODY, color: ALERT },
    );
  }

  cur.advance(24);
  cur.text(
    "Containment below is a spanning forest over every edge, not a property the ontology declares: a node's parent is one incoming edge, preferring a structural property, and every other edge is listed as a link. See plugins/uixo/renderers/_model.ts.",
    { font: fonts.body, size: SMALL, color: MUTED },
  );
}

function heading(cur: PdfCursor, label: string, fonts: Fonts): void {
  cur.ensure(46);
  cur.advance(20);
  cur.line(label, { font: fonts.bold, size: H2, color: FG });
  cur.page.drawLine({
    start: { x: cur.margin, y: cur.y - 5 },
    end: { x: A4_WIDTH - cur.margin, y: cur.y - 5 },
    thickness: 0.75,
    color: RULE,
  });
  cur.advance(10);
}

function entityBlock(cur: PdfCursor, doc: DocumentView, node: NodeView, fonts: Fonts): void {
  const indent = Math.min(node.depth, MAX_INDENT_DEPTH) * INDENT_STEP;
  const marker = node.depth > MAX_INDENT_DEPTH ? `[depth ${node.depth}] ` : "";

  // Keep the caption with at least its first attribute row; a heading
  // stranded at a page foot is the classic paginated-outline defect.
  cur.ensure(28);
  cur.advance(6);
  cur.line(`${marker}${node.className}`, {
    font: fonts.mono,
    size: SMALL,
    color: MUTED,
    indent,
  });
  cur.line(displayName(node), { font: fonts.bold, size: BODY, color: FG, indent });
  cur.line(node.entityId, { font: fonts.mono, size: SMALL, color: ACCENT, indent });

  for (const [key, value] of node.attributes) {
    if (value === undefined || value === null) continue;
    if (key === "label") continue; // already the caption
    const rendered = flattenValue(value);
    if (rendered === "—" || rendered === "") continue;
    const lines = wrapToWidth(
      `${key}: ${rendered}`,
      fonts.body,
      SMALL,
      cur.contentWidth - indent - 10,
    );
    for (const line of lines) {
      cur.line(line, { font: fonts.body, size: SMALL, color: FG, indent: indent + 10 });
    }
  }

  const links = (
    label: string,
    groups: { property: string; targets: string[] }[],
  ): void => {
    for (const group of groups) {
      const names = group.targets
        .map((t) => {
          const target = doc.nodes.get(t);
          return target ? displayName(target) : t;
        })
        .join(", ");
      for (const line of wrapToWidth(
        `${label} ${group.property}: ${names}`,
        fonts.body,
        SMALL,
        cur.contentWidth - indent - 10,
      )) {
        cur.line(line, { font: fonts.body, size: SMALL, color: MUTED, indent: indent + 10 });
      }
    }
  };
  links("->", node.crossLinks);
  links("<-", node.backLinks);
}

function censusSection(
  cur: PdfCursor,
  title: string,
  rows: { label: string; count: number }[],
  fonts: Fonts,
): void {
  if (rows.length === 0) return;
  heading(cur, title, fonts);
  const max = Math.max(...rows.map((r) => r.count), 1);
  const barX = cur.margin + 250;
  const barMax = A4_WIDTH - cur.margin - barX - 30;
  for (const row of rows) {
    cur.ensure(13);
    cur.y -= 13;
    cur.page.drawText(row.label.slice(0, 46), {
      x: cur.margin,
      y: cur.y,
      size: SMALL,
      font: fonts.mono,
      color: FG,
    });
    cur.page.drawRectangle({
      x: barX,
      y: cur.y - 1,
      width: (row.count / max) * barMax,
      height: 6,
      color: MUTED,
    });
    cur.page.drawText(String(row.count), {
      x: barX + barMax + 8,
      y: cur.y,
      size: SMALL,
      font: fonts.body,
      color: MUTED,
    });
  }
}

export async function renderDocumentPdf(input: RendererInput): Promise<RendererOutput> {
  const doc = readDocument(input);
  const pdf = await PDFDocument.create();
  // A deterministic document: no creation date, no producer string, no
  // random object ids from metadata. Two renders of one workbook must be
  // comparable, and a timestamp would make every byte differ.
  pdf.setTitle(`UIXO document — ${doc.workbookId}`);
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const fonts: Fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const cur = new PdfCursor(pdf);
  titlePage(cur, doc, fonts);

  cur.newPage();
  heading(cur, "Structure", fonts);
  if (doc.nodeCount === 0) {
    cur.text("No uixo primitives in this workbook.", {
      font: fonts.body,
      size: BODY,
      color: MUTED,
    });
  } else {
    // `order` is the model's pre-order walk and already carries every node
    // exactly once, cycle-broken ones included — so this loop cannot
    // recurse, cannot repeat and cannot miss an entity.
    for (const id of doc.order) {
      const node = doc.nodes.get(id);
      if (node) entityBlock(cur, doc, node, fonts);
    }
  }

  censusSection(
    cur,
    "Edges by property",
    doc.relationCensus.map((r) => ({ label: r.property, count: r.count })),
    fonts,
  );
  censusSection(
    cur,
    "Classes in use",
    doc.classCensus.map((c) => ({ label: c.className, count: c.count })),
    fonts,
  );

  drawPageNumbers(pdf, fonts.body, MUTED);

  return {
    bytes: await pdf.save(),
    contentType: "application/pdf",
    filename: "uixo-document.pdf",
  };
}
