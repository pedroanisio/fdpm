/**
 * `application/pdf` — the document as a specification you would hand to
 * someone.
 *
 * The first version of this renderer produced 41 pages of undifferentiated
 * grey: a title floating in an otherwise empty page, every entity's
 * payload flattened into one comma-separated run-on, no contents, no
 * running head, and every en dash and arrow replaced by `?` because the
 * WinAnsi sanitiser threw away characters the font renders perfectly.
 * That last one was corruption rather than a design fault, and it is
 * fixed in `src/core/render/pdf.ts`.
 *
 * What this does instead:
 *
 *  - **Title page** with a rule, the workbook identity, and the metrics
 *    as a real figure row rather than a key-value dump.
 *  - **Contents** with page numbers, filled in after layout, so a
 *    forty-page document is navigable on paper.
 *  - **Palette** with the colours actually drawn, each with its hex, its
 *    custom-property name and its prose. A design document is mostly
 *    colour tokens and printing their names is not printing them.
 *  - **Findings** first, not buried at whatever depth containment put
 *    them at.
 *  - **Structure** where prose is prose, facts are an aligned definition
 *    list in a fixed gutter, depth is a left rule rather than indent
 *    alone, and every measure sits in a tabular column.
 *  - **Running head** and page numbers on every page.
 *
 * Measure is capped well inside the page width. A9.5pt line running the
 * full 483pt of an A4 text block is about 110 characters, which is
 * roughly twice a comfortable measure and the reason the first version
 * read as a wall.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { A4_HEIGHT, A4_WIDTH, toWinAnsi, wrapToWidth } from "../../../src/core/render/pdf.js";
import { displayName, readDocument, type DocumentView, type NodeView } from "./_model.js";
import {
  byClass,
  colorTokens,
  findings,
  hexToRgb,
  humanKey,
  present,
  readableInkOn,
  shortClass,
  type Fact,
  type Tone,
  type Value,
} from "./_present.js";

// ── Page geometry and palette ──────────────────────────────────────────

const MARGIN = 54;
const FOOTER = 34;
const CONTENT_W = A4_WIDTH - 2 * MARGIN;
/** Prose measure: ~72 characters at 9.5pt, not the full 487pt block. */
const PROSE_W = 340;
const GUTTER = 108;

const FG: RGB = rgb(0.08, 0.09, 0.11);
const MUTED: RGB = rgb(0.44, 0.47, 0.52);
const FAINT: RGB = rgb(0.72, 0.75, 0.79);
const RULE: RGB = rgb(0.87, 0.89, 0.91);
const ACCENT: RGB = rgb(0.18, 0.37, 0.66);
const TONE: Record<Tone, RGB> = {
  ok: rgb(0.11, 0.5, 0.29),
  warn: rgb(0.54, 0.35, 0),
  error: rgb(0.7, 0.15, 0.12),
  info: rgb(0.18, 0.37, 0.66),
  muted: rgb(0.44, 0.47, 0.52),
};

const BODY = 9;
const SMALL = 7.6;
const LEAD = 12.2;

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

interface TocEntry {
  label: string;
  level: 0 | 1;
  page: number;
}

/**
 * Layout state. `y` is a PDF coordinate (origin bottom-left) so the
 * cursor moves by decreasing it; every draw goes through `need`, which
 * breaks the page before anything can land below the bottom margin.
 */
class Doc {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  page: PDFPage;
  y = 0;
  /** Left rules to close when the current nesting level ends. */
  private rules: { x: number; from: number }[] = [];
  readonly toc: TocEntry[] = [];
  section = "";

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.page = this.newPage();
  }

  newPage(): PDFPage {
    // Close every open rule at the page foot, then reopen at the head, so
    // a nested block that spans pages keeps its depth cue on both.
    for (const rule of this.rules) this.closeRule(rule, MARGIN + FOOTER);
    this.page = this.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
    for (const rule of this.rules) rule.from = this.y;
    return this.page;
  }

  private closeRule(rule: { x: number; from: number }, to: number): void {
    if (rule.from - to <= 1) return;
    this.page.drawLine({
      start: { x: rule.x, y: rule.from },
      end: { x: rule.x, y: to },
      thickness: 0.75,
      color: RULE,
    });
  }

  pushRule(x: number): void {
    this.rules.push({ x, from: this.y });
  }

  popRule(): void {
    const rule = this.rules.pop();
    if (rule) this.closeRule(rule, this.y);
  }

  need(points: number): void {
    if (this.y - points < MARGIN + FOOTER) this.newPage();
  }

  get pageIndex(): number {
    return this.pdf.getPages().indexOf(this.page);
  }

  /** Draw one already-fitting line and advance. */
  line(
    text: string,
    opts: { x?: number; font?: PDFFont; size?: number; color?: RGB; lead?: number },
  ): void {
    const lead = opts.lead ?? LEAD;
    this.need(lead);
    this.y -= lead;
    this.page.drawText(toWinAnsi(text), {
      x: opts.x ?? MARGIN,
      y: this.y,
      size: opts.size ?? BODY,
      font: opts.font ?? this.fonts.body,
      color: opts.color ?? FG,
    });
  }

  /** Wrap to `width` and draw every line. */
  para(
    text: string,
    opts: { x?: number; width?: number; font?: PDFFont; size?: number; color?: RGB; lead?: number },
  ): void {
    const font = opts.font ?? this.fonts.body;
    const size = opts.size ?? BODY;
    for (const l of wrapToWidth(text, font, size, opts.width ?? PROSE_W)) {
      this.line(l, { ...opts, font, size });
    }
  }

  gap(points: number): void {
    this.y -= points;
  }
}

// ── Chrome ─────────────────────────────────────────────────────────────

function heading(doc: Doc, label: string, level: 0 | 1): void {
  doc.need(level === 0 ? 64 : 34);
  if (level === 0) {
    if (doc.y < A4_HEIGHT - MARGIN - 12) doc.newPage();
    doc.section = label;
  }
  doc.gap(level === 0 ? 6 : 14);
  doc.line(label, {
    font: doc.fonts.bold,
    size: level === 0 ? 17 : 10.5,
    lead: level === 0 ? 20 : 14,
  });
  if (level === 0) {
    doc.page.drawLine({
      start: { x: MARGIN, y: doc.y - 6 },
      end: { x: A4_WIDTH - MARGIN, y: doc.y - 6 },
      thickness: 1.2,
      color: FG,
    });
    doc.gap(14);
  } else {
    doc.gap(4);
  }
  doc.toc.push({ label, level, page: doc.pageIndex });
}

function badge(doc: Doc, x: number, y: number, label: string, tone: Tone): number {
  const text = toWinAnsi(label);
  const w = doc.fonts.bold.widthOfTextAtSize(text, SMALL - 0.6) + 10;
  doc.page.drawRectangle({
    x,
    y: y - 2.5,
    width: w,
    height: 11,
    borderColor: TONE[tone],
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
    opacity: 0,
    borderOpacity: 1,
  });
  doc.page.drawText(text, {
    x: x + 5,
    y: y + 0.5,
    size: SMALL - 0.6,
    font: doc.fonts.bold,
    color: TONE[tone],
  });
  return w + 5;
}

// ── Values ─────────────────────────────────────────────────────────────

/** Render one value inline at `x`, returning the height consumed. */
function drawValue(doc: Doc, value: Value, x: number, width: number): void {
  switch (value.kind) {
    case "color": {
      const rgbv = hexToRgb(value.hex);
      doc.need(LEAD);
      doc.y -= LEAD;
      if (rgbv) {
        doc.page.drawRectangle({
          x,
          y: doc.y - 1,
          width: 26,
          height: 9,
          color: rgb(rgbv[0] / 255, rgbv[1] / 255, rgbv[2] / 255),
          borderColor: RULE,
          borderWidth: 0.5,
        });
      }
      doc.page.drawText(toWinAnsi(value.hex), {
        x: x + 31,
        y: doc.y,
        size: SMALL,
        font: doc.fonts.mono,
        color: FG,
      });
      return;
    }
    case "status":
      doc.need(LEAD);
      doc.y -= LEAD;
      badge(doc, x, doc.y, value.text, value.tone);
      return;
    case "group":
      for (const entry of value.entries) drawFact(doc, entry, x, width);
      return;
    case "list":
      if (value.items.length === 0) {
        doc.line("none", { x, size: SMALL, color: MUTED });
        return;
      }
      // A list of scalars reads as one line; a list that nests keeps its
      // structure, because collapsing a group loses the keys inside it.
      if (value.items.every((i) => i.kind !== "group" && i.kind !== "list")) {
        const joined = value.items.map((i) => i.text).filter(Boolean).join(" · ");
        doc.para(joined, { x, width, size: SMALL, color: FG });
        return;
      }
      for (const item of value.items) drawValue(doc, item, x, width);
      return;
    case "ref":
      doc.para(value.text, { x, width, size: SMALL, color: ACCENT });
      return;
    case "code":
      doc.para(value.text, { x, width, font: doc.fonts.mono, size: SMALL, color: FG });
      return;
    case "ratio":
    case "measure":
      doc.para(value.text, { x, width, font: doc.fonts.mono, size: SMALL, color: FG });
      return;
    default:
      doc.para(value.text, { x, width, size: SMALL, color: FG });
  }
}

/** One definition row: key in the gutter, value in the column beside it. */
function drawFact(doc: Doc, fact: Fact, x: number, width: number): void {
  const keyX = x;
  const valX = x + GUTTER;
  const valW = Math.max(width - GUTTER, 80);

  const before = doc.y;
  const beforePage = doc.pageIndex;
  drawValue(doc, fact.value, valX, valW);

  // The key is drawn against the value's FIRST line, which is only known
  // after the value has been laid out — and only if the value did not
  // start a new page under it.
  const keyY = doc.pageIndex === beforePage ? before - LEAD : A4_HEIGHT - MARGIN - LEAD;
  doc.page.drawText(toWinAnsi(humanKey(fact.key)), {
    x: keyX,
    y: keyY,
    size: SMALL,
    font: doc.fonts.body,
    color: MUTED,
  });
}

// ── Entities ───────────────────────────────────────────────────────────

function entityBlock(doc: Doc, view: DocumentView, node: NodeView, seen: Set<string>): void {
  const p = present(view, node);
  const x = MARGIN + 0;

  doc.need(46);
  doc.gap(8);

  // Title line: name, class, badges — measured left to right so nothing
  // overlaps whatever the label's width turns out to be.
  const name = toWinAnsi(displayName(node));
  doc.y -= 13;
  doc.page.drawText(name, { x, y: doc.y, size: 10.5, font: doc.fonts.bold, color: FG });
  let cursor = x + doc.fonts.bold.widthOfTextAtSize(name, 10.5) + 7;
  const cls = toWinAnsi(shortClass(node.className));
  doc.page.drawText(cls, { x: cursor, y: doc.y + 0.5, size: SMALL, font: doc.fonts.mono, color: MUTED });
  cursor += doc.fonts.mono.widthOfTextAtSize(cls, SMALL) + 8;
  for (const b of p.badges) cursor += badge(doc, cursor, doc.y, b.label, b.tone);

  const eid = toWinAnsi(node.entityId);
  const eidW = doc.fonts.mono.widthOfTextAtSize(eid, SMALL);
  doc.page.drawText(eid, {
    x: A4_WIDTH - MARGIN - eidW,
    y: doc.y + 0.5,
    size: SMALL,
    font: doc.fonts.mono,
    color: FAINT,
  });

  if (p.swatch) {
    const c = hexToRgb(p.swatch);
    if (c) {
      doc.gap(4);
      doc.need(24);
      doc.y -= 18;
      doc.page.drawRectangle({
        x,
        y: doc.y - 2,
        width: 96,
        height: 20,
        color: rgb(c[0] / 255, c[1] / 255, c[2] / 255),
        borderColor: RULE,
        borderWidth: 0.5,
      });
      const ink = readableInkOn(p.swatch) === "#000000" ? rgb(0, 0, 0) : rgb(1, 1, 1);
      doc.page.drawText(toWinAnsi(p.swatch), {
        x: x + 6,
        y: doc.y + 4,
        size: SMALL,
        font: doc.fonts.mono,
        color: ink,
      });
      if (p.cssName) {
        doc.page.drawText(toWinAnsi(p.cssName), {
          x: x + 106,
          y: doc.y + 4,
          size: SMALL,
          font: doc.fonts.mono,
          color: MUTED,
        });
      }
    }
  } else if (p.cssName) {
    doc.line(p.cssName, { x, font: doc.fonts.mono, size: SMALL, color: MUTED });
  }

  if (p.description) {
    doc.gap(2);
    doc.para(p.description, { x, width: PROSE_W, size: BODY, color: FG });
  }

  if (p.facts.length > 0) {
    doc.gap(3);
    for (const fact of p.facts) drawFact(doc, fact, x, CONTENT_W);
  }

  const linkLine = (groups: NodeView["crossLinks"], arrow: string): void => {
    for (const g of groups) {
      const names = g.targets
        .map((t) => {
          const target = view.nodes.get(t);
          return target ? displayName(target) : t;
        })
        .join(", ");
      doc.para(`${arrow} ${humanKey(g.property)}: ${names}`, {
        x,
        width: CONTENT_W,
        size: SMALL,
        color: MUTED,
      });
    }
  };
  linkLine(node.crossLinks, "->");
  linkLine(node.backLinks, "<-");

  const kids = node.children.filter((c) => !seen.has(c));
  if (kids.length > 0) {
    doc.gap(3);
    doc.pushRule(MARGIN - 8);
    for (const kid of kids) {
      seen.add(kid);
      const child = view.nodes.get(kid);
      if (child) entityBlock(doc, view, child, seen);
    }
    doc.popRule();
  }
}

// ── Sections ───────────────────────────────────────────────────────────

function titlePage(doc: Doc, view: DocumentView): void {
  doc.y = A4_HEIGHT - MARGIN;
  doc.page.drawLine({
    start: { x: MARGIN, y: doc.y - 4 },
    end: { x: A4_WIDTH - MARGIN, y: doc.y - 4 },
    thickness: 2.5,
    color: FG,
  });
  doc.gap(150);
  doc.line("UIXO document", { font: doc.fonts.bold, size: 34, lead: 38 });
  doc.gap(4);
  doc.line(view.workbookId, { font: doc.fonts.mono, size: 12, color: ACCENT, lead: 16 });
  doc.line(view.profileId, { font: doc.fonts.mono, size: 9, color: MUTED, lead: 13 });

  doc.gap(40);
  const metrics: [string, number][] = [
    ["Entities", view.nodeCount],
    ["Edges", view.edgeCount],
    ["Roots", view.roots.length],
    ["Classes", view.classCensus.length],
    ["Properties", view.relationCensus.length],
    ["Max depth", Math.max(...[...view.nodes.values()].map((n) => n.depth), 0)],
  ];
  const colW = CONTENT_W / metrics.length;
  const labelY = doc.y;
  metrics.forEach(([label, value], i) => {
    const x = MARGIN + i * colW;
    doc.page.drawText(toWinAnsi(label.toUpperCase()), {
      x,
      y: labelY,
      size: SMALL - 0.8,
      font: doc.fonts.body,
      color: MUTED,
    });
    doc.page.drawText(String(value), {
      x,
      y: labelY - 22,
      size: 20,
      font: doc.fonts.bold,
      color: FG,
    });
  });
  doc.y = labelY - 22;

  doc.gap(56);
  doc.para(
    "Containment is a spanning forest over every edge, not a property the ontology declares: a node's parent is one incoming edge, preferring a structural property, and every other edge is listed as a link. See plugins/uixo/renderers/_model.ts.",
    { width: PROSE_W, size: SMALL, color: MUTED, lead: 10.5 },
  );
  if (view.cycleBroken.length > 0) {
    doc.gap(6);
    doc.para(
      `${view.cycleBroken.length} entity(ies) are reachable only by breaking a cycle in the containment graph.`,
      { width: PROSE_W, size: SMALL, color: TONE.error, lead: 10.5 },
    );
  }
}

function paletteSection(doc: Doc, view: DocumentView): void {
  const tokens = colorTokens(view);
  if (tokens.length === 0) return;
  heading(doc, "Palette", 0);

  const perRow = 4;
  const cellW = CONTENT_W / perRow;
  const wellH = 34;

  const bands = new Map<string, typeof tokens>();
  for (const t of tokens) bands.set(t.set ?? "", [...(bands.get(t.set ?? "") ?? []), t]);

  for (const [set, group] of bands) {
    if (set !== "") heading(doc, set, 1);
    for (let i = 0; i < group.length; i += perRow) {
      const row = group.slice(i, i + perRow);
      const captionLines = Math.max(
        ...row.map((t) =>
          wrapToWidth(t.description ?? "", doc.fonts.body, SMALL - 0.8, cellW - 12).length,
        ),
        1,
      );
      const rowH = wellH + 12 + (t2 => t2)(captionLines) * 8.5 + 16;
      doc.need(rowH);
      doc.y -= rowH;
      row.forEach((t, col) => {
        const x = MARGIN + col * cellW;
        const c = hexToRgb(t.hex);
        const top = doc.y + rowH - 12;
        if (c) {
          doc.page.drawRectangle({
            x,
            y: top - wellH,
            width: cellW - 10,
            height: wellH,
            color: rgb(c[0] / 255, c[1] / 255, c[2] / 255),
            borderColor: RULE,
            borderWidth: 0.5,
          });
          const ink = readableInkOn(t.hex) === "#000000" ? rgb(0, 0, 0) : rgb(1, 1, 1);
          doc.page.drawText(toWinAnsi(t.hex), {
            x: x + 5,
            y: top - wellH + 5,
            size: SMALL - 0.4,
            font: doc.fonts.mono,
            color: ink,
          });
        }
        doc.page.drawText(toWinAnsi(t.name), {
          x,
          y: top - wellH - 11,
          size: SMALL,
          font: doc.fonts.bold,
          color: FG,
        });
        if (t.cssName) {
          doc.page.drawText(toWinAnsi(t.cssName), {
            x,
            y: top - wellH - 20,
            size: SMALL - 0.8,
            font: doc.fonts.mono,
            color: MUTED,
          });
        }
        const caption = wrapToWidth(t.description ?? "", doc.fonts.body, SMALL - 0.8, cellW - 12);
        caption.slice(0, 4).forEach((l, k) => {
          doc.page.drawText(toWinAnsi(l), {
            x,
            y: top - wellH - 29 - k * 8.5,
            size: SMALL - 0.8,
            font: doc.fonts.body,
            color: MUTED,
          });
        });
      });
    }
    doc.gap(6);
  }
}

function findingsSection(doc: Doc, view: DocumentView): void {
  const rows = findings(view);
  if (rows.length === 0) return;
  heading(doc, "Findings", 0);
  for (const r of rows) {
    doc.need(30);
    doc.gap(5);
    doc.y -= 11;
    let x = MARGIN;
    x += badge(doc, x, doc.y, r.severity ?? r.tone, r.tone);
    doc.page.drawText(toWinAnsi(r.name), {
      x,
      y: doc.y,
      size: BODY,
      font: doc.fonts.bold,
      color: FG,
    });
    x += doc.fonts.bold.widthOfTextAtSize(toWinAnsi(r.name), BODY) + 7;
    if (r.code) {
      doc.page.drawText(toWinAnsi(r.code), {
        x,
        y: doc.y,
        size: SMALL,
        font: doc.fonts.mono,
        color: MUTED,
      });
    }
    if (r.message) {
      doc.para(r.message, { x: MARGIN + 14, width: PROSE_W, size: SMALL, color: FG, lead: 10.5 });
    }
  }
}

function censusSection(doc: Doc, view: DocumentView): void {
  heading(doc, "Census", 0);
  const table = (title: string, rows: { label: string; count: number }[]): void => {
    if (rows.length === 0) return;
    heading(doc, title, 1);
    const max = Math.max(...rows.map((r) => r.count), 1);
    const barX = MARGIN + 220;
    const barMax = CONTENT_W - 220 - 34;
    for (const row of rows) {
      doc.need(11);
      doc.y -= 11;
      doc.page.drawText(toWinAnsi(row.label).slice(0, 44), {
        x: MARGIN,
        y: doc.y,
        size: SMALL,
        font: doc.fonts.mono,
        color: FG,
      });
      doc.page.drawRectangle({
        x: barX,
        y: doc.y - 0.5,
        width: (row.count / max) * barMax,
        height: 5.5,
        color: FAINT,
      });
      const n = String(row.count);
      doc.page.drawText(n, {
        x: A4_WIDTH - MARGIN - doc.fonts.body.widthOfTextAtSize(n, SMALL),
        y: doc.y,
        size: SMALL,
        font: doc.fonts.body,
        color: MUTED,
      });
    }
  };
  table(
    "Edges by property",
    view.relationCensus.map((r) => ({ label: r.property, count: r.count })),
  );
  table(
    "Classes in use",
    view.classCensus.map((c) => ({ label: c.className, count: c.count })),
  );
}

/** Fill the reserved contents page once every section's page is known. */
function drawContents(doc: Doc, page: PDFPage, view: DocumentView): void {
  const pages = doc.pdf.getPages();
  const total = pages.length;
  let y = A4_HEIGHT - MARGIN - 26;
  page.drawText("Contents", { x: MARGIN, y, size: 17, font: doc.fonts.bold, color: FG });
  page.drawLine({
    start: { x: MARGIN, y: y - 8 },
    end: { x: A4_WIDTH - MARGIN, y: y - 8 },
    thickness: 1.2,
    color: FG,
  });
  y -= 30;

  for (const entry of doc.toc) {
    if (y < MARGIN + FOOTER + 12) break;
    const indent = entry.level === 0 ? 0 : 16;
    const font = entry.level === 0 ? doc.fonts.bold : doc.fonts.body;
    const size = entry.level === 0 ? BODY + 0.5 : SMALL;
    const label = toWinAnsi(entry.label);
    const num = String(entry.page + 1);
    const labelW = font.widthOfTextAtSize(label, size);
    const numW = doc.fonts.body.widthOfTextAtSize(num, SMALL);

    page.drawText(label, { x: MARGIN + indent, y, size, font, color: FG });
    // Leader dots between the label and the folio: the thing that makes a
    // contents page usable on paper.
    const from = MARGIN + indent + labelW + 5;
    const to = A4_WIDTH - MARGIN - numW - 5;
    if (to > from) {
      const dots = Math.floor((to - from) / 4);
      page.drawText(".".repeat(Math.max(dots, 0)), {
        x: from,
        y,
        size: SMALL,
        font: doc.fonts.body,
        color: FAINT,
      });
    }
    page.drawText(num, {
      x: A4_WIDTH - MARGIN - numW,
      y,
      size: SMALL,
      font: doc.fonts.body,
      color: MUTED,
    });
    y -= entry.level === 0 ? 16 : 12;
  }

  void total;
  void view;
}

/** Running head and folio on every page but the title. */
function drawChrome(doc: Doc, view: DocumentView): void {
  const pages = doc.pdf.getPages();
  pages.forEach((page, i) => {
    if (i === 0) return;
    page.drawLine({
      start: { x: MARGIN, y: A4_HEIGHT - MARGIN + 12 },
      end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - MARGIN + 12 },
      thickness: 0.5,
      color: RULE,
    });
    page.drawText(toWinAnsi(`UIXO document — ${view.workbookId}`), {
      x: MARGIN,
      y: A4_HEIGHT - MARGIN + 18,
      size: SMALL - 0.8,
      font: doc.fonts.body,
      color: MUTED,
    });
    const folio = `${i + 1} / ${pages.length}`;
    page.drawText(folio, {
      x: A4_WIDTH - MARGIN - doc.fonts.body.widthOfTextAtSize(folio, SMALL),
      y: MARGIN - 6,
      size: SMALL,
      font: doc.fonts.body,
      color: MUTED,
    });
  });
}

export async function renderDocumentPdf(input: RendererInput): Promise<RendererOutput> {
  const view = readDocument(input);
  const pdf = await PDFDocument.create();
  // Deterministic: no wall-clock date, so two renders of one workbook are
  // byte-comparable and can be diffed across revisions.
  pdf.setTitle(`UIXO document — ${view.workbookId}`);
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const fonts: Fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const doc = new Doc(pdf, fonts);
  titlePage(doc, view);

  // Reserved now, drawn last: the folios it lists do not exist yet.
  const contentsPage = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  doc.page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  doc.y = A4_HEIGHT - MARGIN;

  paletteSection(doc, view);
  findingsSection(doc, view);

  heading(doc, "Structure", 0);
  if (view.nodeCount === 0) {
    doc.para("No uixo primitives in this workbook.", { size: BODY, color: MUTED });
  } else {
    const seen = new Set<string>();
    for (const root of view.roots) {
      if (seen.has(root)) continue;
      seen.add(root);
      const node = view.nodes.get(root);
      if (node) entityBlock(doc, view, node, seen);
    }
  }

  censusSection(doc, view);

  drawContents(doc, contentsPage, view);
  drawChrome(doc, view);

  return {
    bytes: await pdf.save(),
    contentType: "application/pdf",
    filename: "uixo-document.pdf",
  };
}

/** Classes present, for a caller that wants the same cut the PDF used. */
export const pdfClassCensus = byClass;
