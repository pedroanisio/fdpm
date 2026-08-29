/**
 * The primitives every pdf-lib renderer needs and none of them should own
 * privately: WinAnsi sanitisation, width-aware wrapping, and a cursor that
 * breaks pages before it draws off the bottom of one.
 *
 * These are not a house style. They are the three places a PDF renderer
 * silently produces a wrong document rather than an error:
 *
 *  - an unencodable code point makes `drawText` **throw** at render time,
 *    from data that validated cleanly at write time;
 *  - text longer than the measure runs off the page edge, and a PDF has no
 *    overflow to report;
 *  - a block drawn below the bottom margin lands on nothing.
 *
 * `plugins/formal_specification/renderers/pdf.ts` still carries its own
 * copies of the first two, written before this module existed. They are
 * not re-pointed here: that renderer is large, visually tuned and covered
 * by its own tests, and rewriting it is not part of adding a second PDF
 * renderer. New PDF renderers use this module.
 */

import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

/** A4 in points, the page every renderer here targets. */
export const A4_WIDTH = 595.276;
export const A4_HEIGHT = 841.89;

/**
 * Make `s` safe for pdf-lib's StandardFonts.
 *
 * Those fonts are WinAnsi-encoded and `drawText` throws on a code point
 * they cannot represent. Since the text is document data — a label, an
 * attribute value — a throw means one exotic character makes the whole
 * render fail. Substituting is the correct trade here, and the substitute
 * is visible (`?`) rather than a silent deletion, so a reader can tell
 * that a character was lost rather than never written.
 *
 * A renderer needing real Unicode must embed a TTF and not call this.
 */
export function toWinAnsi(s: string): string {
  let out = "";
  for (const ch of s.replace(/\t/g, "    ").replace(/\r/g, "")) {
    // Iterating by code POINT, so an astral character is one `ch` of
    // length 2 and is replaced once rather than twice.
    out += ch.length === 1 && ch.charCodeAt(0) <= 0xff ? ch : "?";
  }
  return out;
}

/**
 * Break `text` into lines that fit `maxWidth` at `size`.
 *
 * A word longer than the measure — a URL, an opaque id — is split at the
 * character that overflows rather than allowed to run off the page. The
 * loop is bounded by the input length in either branch, so no input makes
 * it spin.
 */
export function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const safe = toWinAnsi(text);
  if (safe === "") return [""];
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return [safe];

  const lines: string[] = [];
  let current = "";

  const flush = (): void => {
    if (current !== "") lines.push(current);
    current = "";
  };

  for (const word of safe.split(/\s+/).filter((w) => w.length > 0)) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    flush();
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Hard-split an unbreakable run. `cut` always advances by at least
    // one character, so the remainder strictly shrinks.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = 1;
      while (cut < rest.length && font.widthOfTextAtSize(rest.slice(0, cut + 1), size) <= maxWidth) {
        cut++;
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  flush();
  return lines.length > 0 ? lines : [""];
}

export interface PdfCursorOptions {
  margin?: number;
  /** Bottom strip kept clear for a page number or footer. */
  footerReserve?: number;
}

/**
 * A downward-flowing text cursor over a paginated document.
 *
 * `y` is a PDF coordinate (origin bottom-left), so the cursor moves by
 * decreasing it. Every draw goes through `ensure`, which starts a new
 * page when the block would cross the bottom margin — the check that
 * makes "drew below the page" unrepresentable rather than merely
 * unlikely.
 */
export class PdfCursor {
  readonly doc: PDFDocument;
  readonly margin: number;
  readonly footerReserve: number;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, opts: PdfCursorOptions = {}) {
    this.doc = doc;
    this.margin = opts.margin ?? 56;
    this.footerReserve = opts.footerReserve ?? 28;
    this.page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - this.margin;
  }

  /** Usable text width between the margins. */
  get contentWidth(): number {
    return A4_WIDTH - 2 * this.margin;
  }

  newPage(): void {
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - this.margin;
  }

  /** Start a new page if `needed` points would not fit below the cursor. */
  ensure(needed: number): void {
    if (this.y - needed < this.margin + this.footerReserve) this.newPage();
  }

  /** Move down without drawing. */
  advance(points: number): void {
    this.y -= points;
  }

  /**
   * Draw one line at the cursor, then advance. The line is sanitised but
   * NOT wrapped — use `text()` for content of unknown length.
   */
  line(
    content: string,
    opts: { font: PDFFont; size: number; color: RGB; indent?: number; lineHeight?: number },
  ): void {
    const lineHeight = opts.lineHeight ?? opts.size * 1.35;
    this.ensure(lineHeight);
    this.y -= lineHeight;
    this.page.drawText(toWinAnsi(content), {
      x: this.margin + (opts.indent ?? 0),
      y: this.y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
  }

  /** Wrap `content` to the remaining measure and draw every line. */
  text(
    content: string,
    opts: { font: PDFFont; size: number; color: RGB; indent?: number; lineHeight?: number },
  ): void {
    const indent = opts.indent ?? 0;
    for (const line of wrapToWidth(content, opts.font, opts.size, this.contentWidth - indent)) {
      this.line(line, opts);
    }
  }
}

/** Stamp `n / total` centred in every page's footer strip. */
export function drawPageNumbers(
  doc: PDFDocument,
  font: PDFFont,
  color: RGB,
  size = 9,
): void {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = `${i + 1} / ${pages.length}`;
    page.drawText(label, {
      x: (A4_WIDTH - font.widthOfTextAtSize(label, size)) / 2,
      y: 24,
      size,
      font,
      color,
    });
  });
}
