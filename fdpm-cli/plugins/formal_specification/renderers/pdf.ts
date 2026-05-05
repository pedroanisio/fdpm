import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type {
  RendererFn,
  RendererOutput,
} from "../../../src/plugin/types.js";
import {
  buildDocumentTreeAuto,
  fieldRows,
  formatCitation,
  typeLabel,
  type SectionBlock,
} from "./_common.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";
import type { DomainProfile } from "../../../src/core/models/meta.js";

/**
 * `application/pdf` renderer for the formal_specification profile.
 *
 * Pure-TypeScript construction via pdf-lib. The visual design mirrors the
 * HTML renderer (`html.ts`) as closely as a non-CSS engine permits:
 *   - Times Roman body, Helvetica-Bold headings (closest standard-font
 *     analogues to the HTML's Charter/Inter pairing).
 *   - Navy heading colour (#003366), matching --accent in the HTML CSS.
 *   - Section underline, status pill, left-rule primitive blocks, bold
 *     field names within wrapped rows, monospace blocks for multi-line
 *     values — all paralleling the HTML structure.
 *
 * True visual parity (full CSS, web fonts, exact box model) would
 * require a headless-browser pipeline (Puppeteer + Chromium); per
 * project policy on dependencies that route is out of scope. The two
 * renderers therefore stay in *structural* lockstep, with the PDF
 * approximating the HTML's typographic intent.
 */

const A4_WIDTH = 595.276; // points
const A4_HEIGHT = 841.89;
const MARGIN = 64;
const FOOTER_RESERVE = 28; // bottom strip reserved for page number
const LINE_HEIGHT = 13.5;
const BODY_SIZE = 10;
const SMALL_SIZE = 9;
const H1_SIZE = 26;
const H2_SIZE = 16;
const H3_SIZE = 12;

const ACCENT: RGB = rgb(0x00 / 255, 0x33 / 255, 0x66 / 255); // --accent
const FG: RGB = rgb(0x1a / 255, 0x1a / 255, 0x1a / 255);     // --fg
const MUTED: RGB = rgb(0x66 / 255, 0x66 / 255, 0x66 / 255);  // --muted
const RULE: RGB = rgb(0xdd / 255, 0xdd / 255, 0xdd / 255);   // --rule
const CODE_BG: RGB = rgb(0xf6 / 255, 0xf6 / 255, 0xf6 / 255); // --code-bg
const PILL_TEXT: RGB = rgb(0x33 / 255, 0x33 / 255, 0x33 / 255);

const PRIMITIVE_RULE_INSET = 6;   // gap between left rule and content
const PRIMITIVE_RULE_WIDTH = 2;
const PRIMITIVE_INDENT = PRIMITIVE_RULE_INSET + PRIMITIVE_RULE_WIDTH + 8;

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
  pageNumber: number;
}

export const renderPdf: RendererFn = async (input): Promise<RendererOutput> => {
  const tree = buildDocumentTreeAuto(input);
  const doc = await PDFDocument.create();
  doc.setTitle(tree.project_id);
  doc.setSubject(`${tree.profile.id} v${tree.profile.version}`);
  doc.setProducer("fdpm formal_specification renderer");

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const cur: Cursor = startPage(
    doc,
    { serif, serifBold, serifItalic, sans, sansBold, mono },
    1,
  );

  drawTitlePage(cur, tree.project_id, tree.profile);

  for (const block of tree.sections) {
    pageBreak(cur);
    drawSection(cur, block, tree.profile);
  }

  if (tree.unsectioned.length > 0) {
    pageBreak(cur);
    drawHeading(cur, "Appendix — Unsectioned", H2_SIZE);
    drawWrapped(
      cur,
      "Primitives not anchored to any section via fs:ContainedIn or matching scope_id.",
      { font: cur.serifItalic, size: SMALL_SIZE, colour: MUTED },
    );
    cur.y -= LINE_HEIGHT * 0.4;
    for (const p of tree.unsectioned) drawPrimitive(cur, p, tree.profile);
  }

  if (tree.citations.length > 0) {
    pageBreak(cur);
    drawHeading(cur, "Bibliography", H2_SIZE);
    for (const c of tree.citations) {
      const key = String(c.field_values["key"] ?? c.id);
      drawWrapped(cur, `[${key}] ${formatCitation(c)}`, {
        font: cur.serif,
        size: BODY_SIZE,
        boldRunUntil: `[${key}]`.length,
        boldFont: cur.serifBold,
        indent: 12,
        hangingIndent: 12,
      });
      cur.y -= LINE_HEIGHT * 0.25;
    }
  }

  // Stamp page numbers on every page (done at end so total is known).
  stampPageNumbers(doc, sans);

  const bytes = await doc.save();
  return {
    bytes,
    contentType: "application/pdf",
    filename: `${tree.project_id}.pdf`,
    ...(tree.findings.length > 0 ? { findings: tree.findings } : {}),
  };
};

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
}

function startPage(doc: PDFDocument, fonts: Fonts, pageNumber: number): Cursor {
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  return { doc, page, y: A4_HEIGHT - MARGIN, ...fonts, pageNumber };
}

function pageBreak(cur: Cursor): void {
  cur.pageNumber += 1;
  cur.page = cur.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  cur.y = A4_HEIGHT - MARGIN;
}

function ensureSpace(cur: Cursor, needed: number): void {
  if (cur.y - needed < MARGIN + FOOTER_RESERVE) pageBreak(cur);
}

interface DrawOptions {
  font?: PDFFont;
  size?: number;
  colour?: RGB;
  indent?: number;
  /** Subsequent wrapped lines are indented by indent + this. */
  hangingIndent?: number;
  /** Render the first `boldRunUntil` chars in `boldFont` (used for citation keys). */
  boldRunUntil?: number;
  boldFont?: PDFFont;
}

function drawText(cur: Cursor, text: string, opts: DrawOptions = {}): void {
  const font = opts.font ?? cur.serif;
  const size = opts.size ?? BODY_SIZE;
  const colour = opts.colour ?? FG;
  const indent = opts.indent ?? 0;
  ensureSpace(cur, size + 4);
  cur.y -= size;
  cur.page.drawText(stripUnsafe(text), {
    x: MARGIN + indent,
    y: cur.y,
    size,
    font,
    color: colour,
  });
  cur.y -= LINE_HEIGHT - size + 2;
}

/**
 * Word-wrapped paragraph. Supports a "bold prefix" run (used to bold the
 * field name in `name: value` rows and the citation key in bibliography
 * entries) and a hanging indent for subsequent wrapped lines.
 */
function drawWrapped(cur: Cursor, text: string, opts: DrawOptions = {}): void {
  const font = opts.font ?? cur.serif;
  const boldFont = opts.boldFont ?? font;
  const size = opts.size ?? BODY_SIZE;
  const colour = opts.colour ?? FG;
  const indent = opts.indent ?? 0;
  const hanging = opts.hangingIndent ?? 0;
  const boldUntil = opts.boldRunUntil ?? 0;

  const safe = stripUnsafe(text);
  const maxWidth = A4_WIDTH - 2 * MARGIN - indent;

  // Build runs: [{text, bold}], one per word, preserving the bold prefix.
  type Run = { text: string; bold: boolean; trailingSpace: boolean };
  const runs: Run[] = [];
  let consumed = 0;
  const words = safe.split(/(\s+)/); // keep whitespace tokens to track positions
  for (const tok of words) {
    if (tok.length === 0) continue;
    if (/^\s+$/.test(tok)) {
      // Mark previous run as having trailing whitespace.
      if (runs.length > 0) runs[runs.length - 1]!.trailingSpace = true;
      consumed += tok.length;
      continue;
    }
    const start = consumed;
    const end = consumed + tok.length;
    const isBold = boldUntil > 0 && start < boldUntil;
    if (isBold && end > boldUntil) {
      // Word straddles bold boundary — split it.
      const cut = boldUntil - start;
      runs.push({ text: tok.slice(0, cut), bold: true, trailingSpace: false });
      runs.push({ text: tok.slice(cut), bold: false, trailingSpace: false });
    } else {
      runs.push({ text: tok, bold: isBold, trailingSpace: false });
    }
    consumed = end;
  }

  // Greedy line-fill across runs.
  let line: Run[] = [];
  let lineWidth = 0;
  let lineNumber = 0;
  const flush = () => {
    if (line.length === 0) return;
    const xStart =
      MARGIN + indent + (lineNumber > 0 ? hanging : 0);
    ensureSpace(cur, size + 4);
    cur.y -= size;
    let x = xStart;
    for (const r of line) {
      const f = r.bold ? boldFont : font;
      cur.page.drawText(r.text, {
        x,
        y: cur.y,
        size,
        font: f,
        color: colour,
      });
      x += f.widthOfTextAtSize(r.text, size);
      if (r.trailingSpace) {
        x += font.widthOfTextAtSize(" ", size);
      }
    }
    cur.y -= LINE_HEIGHT - size + 2;
    line = [];
    lineWidth = 0;
    lineNumber += 1;
  };

  const widthOf = (r: Run) => {
    const f = r.bold ? boldFont : font;
    return f.widthOfTextAtSize(r.text, size) + (r.trailingSpace ? font.widthOfTextAtSize(" ", size) : 0);
  };

  for (const r of runs) {
    const w = widthOf(r);
    const available = maxWidth - (lineNumber > 0 ? hanging : 0);
    if (lineWidth + w > available && line.length > 0) {
      // Drop trailing whitespace flag on last run before flushing.
      const last = line[line.length - 1]!;
      last.trailingSpace = false;
      flush();
    }
    line.push({ ...r });
    lineWidth += w;
  }
  if (line.length > 0) {
    line[line.length - 1]!.trailingSpace = false;
    flush();
  }
}

function drawHeading(cur: Cursor, text: string, size: number): void {
  ensureSpace(cur, size + LINE_HEIGHT);
  cur.y -= size;
  cur.page.drawText(stripUnsafe(text), {
    x: MARGIN,
    y: cur.y,
    size,
    font: cur.sansBold,
    color: ACCENT,
  });
  // Underline mirrors h2's `border-bottom` in the HTML.
  if (size >= H2_SIZE) {
    const ruleY = cur.y - 4;
    cur.page.drawLine({
      start: { x: MARGIN, y: ruleY },
      end: { x: A4_WIDTH - MARGIN, y: ruleY },
      thickness: 0.5,
      color: RULE,
    });
    cur.y = ruleY - 8;
  } else {
    cur.y -= LINE_HEIGHT * 0.4;
  }
}

function drawTitlePage(
  cur: Cursor,
  projectId: string,
  profile: { id: string; version: string },
): void {
  // Vertically centre title within the upper third of the page.
  cur.y = A4_HEIGHT * 0.62;
  const title = stripUnsafe(projectId);
  const titleWidth = cur.sansBold.widthOfTextAtSize(title, H1_SIZE);
  cur.page.drawText(title, {
    x: (A4_WIDTH - titleWidth) / 2,
    y: cur.y,
    size: H1_SIZE,
    font: cur.sansBold,
    color: ACCENT,
  });
  cur.y -= H1_SIZE * 1.2;

  const subtitle = `Profile  ${profile.id}  v${profile.version}`;
  const subWidth = cur.sans.widthOfTextAtSize(subtitle, BODY_SIZE + 1);
  cur.page.drawText(subtitle, {
    x: (A4_WIDTH - subWidth) / 2,
    y: cur.y,
    size: BODY_SIZE + 1,
    font: cur.sans,
    color: MUTED,
  });

  // Decorative rule under subtitle.
  cur.y -= 18;
  cur.page.drawLine({
    start: { x: A4_WIDTH * 0.35, y: cur.y },
    end: { x: A4_WIDTH * 0.65, y: cur.y },
    thickness: 0.75,
    color: ACCENT,
  });
}

function drawSection(
  cur: Cursor,
  block: SectionBlock,
  profile: DomainProfile,
): void {
  const heading = `${block.number}. ${block.title}`;
  drawHeading(cur, heading, H2_SIZE);

  if (block.status) {
    drawPill(cur, block.status);
  }
  if (block.description) {
    drawWrapped(cur, block.description, { font: cur.serif, size: BODY_SIZE });
    cur.y -= LINE_HEIGHT * 0.3;
  }
  for (const p of block.primitives) drawPrimitive(cur, p, profile);
}

function drawPill(cur: Cursor, status: string): void {
  const text = stripUnsafe(status);
  const padX = 5;
  const padY = 2;
  const size = SMALL_SIZE;
  const w = cur.sans.widthOfTextAtSize(text, size) + padX * 2;
  const h = size + padY * 2;
  ensureSpace(cur, h + 6);
  cur.y -= h;
  cur.page.drawRectangle({
    x: MARGIN,
    y: cur.y,
    width: w,
    height: h,
    color: CODE_BG,
    borderColor: RULE,
    borderWidth: 0.5,
  });
  cur.page.drawText(text, {
    x: MARGIN + padX,
    y: cur.y + padY + 1,
    size,
    font: cur.sans,
    color: PILL_TEXT,
  });
  cur.y -= LINE_HEIGHT * 0.5;
}

/**
 * Render one primitive as a left-ruled block (mirrors `.fdpm-primitive`
 * in the HTML CSS: `border-left: 3px solid var(--rule); padding: 0 1em`).
 *
 * The whole block is rendered first, then a vertical rule is stroked
 * spanning the y-range we consumed. If a page break happens mid-block,
 * we stroke the partial rule on the old page before continuing.
 */
function drawPrimitive(
  cur: Cursor,
  p: PrimitiveInstance,
  profile: DomainProfile,
): void {
  let blockStartY = cur.y;
  let blockStartPage = cur.page;

  const strokeRule = (toY: number, page: PDFPage, fromY: number) => {
    page.drawRectangle({
      x: MARGIN,
      y: toY,
      width: PRIMITIVE_RULE_WIDTH,
      height: fromY - toY,
      color: RULE,
    });
  };

  // Guard against running out of space immediately.
  ensureSpace(cur, H3_SIZE + LINE_HEIGHT * 2);
  if (cur.page !== blockStartPage) {
    blockStartY = cur.y;
    blockStartPage = cur.page;
  }

  // Type label + ID heading.
  cur.y -= H3_SIZE;
  cur.page.drawText(stripUnsafe(typeLabel(p.type_id, profile)), {
    x: MARGIN + PRIMITIVE_INDENT,
    y: cur.y,
    size: H3_SIZE,
    font: cur.sansBold,
    color: ACCENT,
  });
  const labelWidth = cur.sansBold.widthOfTextAtSize(
    stripUnsafe(typeLabel(p.type_id, profile)),
    H3_SIZE,
  );
  cur.page.drawText(stripUnsafe(`  ${p.id}`), {
    x: MARGIN + PRIMITIVE_INDENT + labelWidth,
    y: cur.y,
    size: H3_SIZE - 1,
    font: cur.mono,
    color: MUTED,
  });
  cur.y -= LINE_HEIGHT * 0.6;

  for (const row of fieldRows(p, profile)) {
    if (row.value.includes("\n")) {
      // Multi-line: bold field name on its own line, then mono code block.
      drawWrapped(cur, `${row.name}:`, {
        font: cur.serifBold,
        size: BODY_SIZE,
        indent: PRIMITIVE_INDENT,
      });
      drawMonoBlock(cur, row.value, blockStartPage, () => {
        // Page-break callback: close the rule on the old page first.
        if (cur.page !== blockStartPage) {
          strokeRule(MARGIN + FOOTER_RESERVE, blockStartPage, blockStartY);
          blockStartPage = cur.page;
          blockStartY = cur.y;
        }
      });
    } else {
      const label = `${row.name}: `;
      drawWrapped(cur, `${label}${row.value}`, {
        font: cur.serif,
        size: BODY_SIZE,
        indent: PRIMITIVE_INDENT,
        hangingIndent: 8,
        boldRunUntil: label.length,
        boldFont: cur.serifBold,
      });
    }
    if (cur.page !== blockStartPage) {
      strokeRule(MARGIN + FOOTER_RESERVE, blockStartPage, blockStartY);
      blockStartPage = cur.page;
      blockStartY = cur.y;
    }
  }

  cur.y -= LINE_HEIGHT * 0.3;
  // Final stroke on the (possibly only) page.
  strokeRule(cur.y, blockStartPage, blockStartY);
  cur.y -= LINE_HEIGHT * 0.5;
}

/**
 * Render a multi-line monospace block with a light grey background.
 *
 * pdf-lib paints in call order, so the background rectangle must be
 * drawn *before* the text or it would occlude it. We therefore measure
 * the block per page (computing y-advances without drawing), paint the
 * background, then re-emit the text on top.
 */
function drawMonoBlock(
  cur: Cursor,
  text: string,
  _startPage: PDFPage,
  onPageBreak: () => void,
): void {
  const size = BODY_SIZE - 1;
  const lineH = size + 3;
  const padX = 6;
  const padY = 4;
  const bgWidth = A4_WIDTH - 2 * MARGIN - PRIMITIVE_INDENT - 4;
  const lines = stripUnsafe(text).split("\n");

  let queue: string[] = [];
  let queueTopY = cur.y;

  const flushQueue = (page: PDFPage, finalY: number) => {
    if (queue.length === 0) return;
    // Background first.
    page.drawRectangle({
      x: MARGIN + PRIMITIVE_INDENT,
      y: finalY,
      width: bgWidth,
      height: queueTopY - finalY,
      color: CODE_BG,
    });
    // Then the text on top.
    let textY = queueTopY - padY - size;
    for (const line of queue) {
      page.drawText(line, {
        x: MARGIN + PRIMITIVE_INDENT + padX,
        y: textY,
        size,
        font: cur.mono,
        color: FG,
      });
      textY -= lineH;
    }
    queue = [];
  };

  // Reserve top padding before first line.
  cur.y -= padY;

  for (const line of lines) {
    if (cur.y - lineH < MARGIN + FOOTER_RESERVE) {
      // Add bottom padding, flush this page's queue, break.
      const flushBottom = cur.y - padY;
      flushQueue(cur.page, flushBottom);
      pageBreak(cur);
      onPageBreak();
      queueTopY = cur.y;
      cur.y -= padY;
    }
    queue.push(line);
    cur.y -= lineH;
  }
  // Bottom padding + final flush.
  cur.y -= padY;
  flushQueue(cur.page, cur.y);
}

function stampPageNumbers(doc: PDFDocument, font: PDFFont): void {
  const total = doc.getPageCount();
  for (let i = 0; i < total; i++) {
    const page = doc.getPage(i);
    const label = `${i + 1} / ${total}`;
    const w = font.widthOfTextAtSize(label, SMALL_SIZE);
    page.drawText(label, {
      x: (A4_WIDTH - w) / 2,
      y: 24,
      size: SMALL_SIZE,
      font,
      color: MUTED,
    });
  }
}

/**
 * pdf-lib's StandardFonts (WinAnsi) cannot encode every Unicode code
 * point. Strip code points outside U+0000–U+00FF; replace tabs with
 * four spaces. A future renderer that needs full Unicode should embed
 * a TTF font instead.
 */
function stripUnsafe(s: string): string {
  return s
    .replace(/\t/g, "    ")
    .replace(/\r/g, "")
    .split("")
    .map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : "?"))
    .join("");
}
