/**
 * `kc:CartridgePdfRenderer` — the portable practitioner edition.
 *
 * Markdown is the diffable artifact and the citation index is the verification
 * surface. This view is what leaves the workbook: a paginated reference with a
 * competence boundary, six visibly distinct registers, citations beside the
 * claims they support, and the gaps/conflicts kept in the reading sequence.
 *
 * The layout follows the generator's contracts rather than flattening every
 * primitive into the same card. L3 stays ordered; L4 always reads symptom →
 * cause → correction; L5 names the exact invariant being suspended. All copy
 * flows through the shared WinAnsi and width-aware helpers, and every block can
 * continue onto another A4 page without clipping.
 */
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import {
  A4_HEIGHT,
  A4_WIDTH,
  toPdfFontText,
  wrapToWidth,
} from "../../../src/core/render/pdf.js";
import { embedPdfFonts, type EmbeddedPdfFonts } from "../../../src/core/render/pdf-fonts.js";
import { KC_UNENFORCEABLE_CHECKS } from "../validators.js";
import { T } from "../ids.js";
import {
  buildModel,
  citationRef,
  fieldOf,
  numberOf,
  type CartridgeModel,
  type LayerItem,
} from "./_model.js";

// A closed print palette: warm paper, one near-black ink scale, one blue
// structural accent, and one red audit accent. Rank is always also carried by
// position, weight, or a text label, so the document survives greyscale.
const PAPER: RGB = rgb(0.985, 0.979, 0.963);
const INK: RGB = rgb(0.10, 0.12, 0.15);
const MUTED: RGB = rgb(0.34, 0.38, 0.43);
const QUIET: RGB = rgb(0.56, 0.58, 0.60);
const RULE: RGB = rgb(0.82, 0.80, 0.75);
const ACCENT: RGB = rgb(0.13, 0.31, 0.49);
const ACCENT_WASH: RGB = rgb(0.91, 0.94, 0.96);
const AUDIT: RGB = rgb(0.51, 0.16, 0.14);
const AUDIT_WASH: RGB = rgb(0.96, 0.91, 0.88);

const MARGIN = 60;
const TOP = 72;
const BOTTOM = 70;
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;
const LABEL_WIDTH = 86;

// A quiet 1.25 modular scale around 9.5pt body type.
const BODY = 9.5;
const SMALL = 7.6;
const SUBHEAD = 11.875;
const HEADING = 14.844;
const DISPLAY = 23.194;
const BODY_LEAD = 13.1;
const SMALL_LEAD = 10.4;

type Fonts = EmbeddedPdfFonts;

interface TocEntry {
  label: string;
  page: number;
}

interface CardRow {
  label: string;
  value: string;
  tone?: "normal" | "accent" | "audit" | "muted";
  mono?: boolean;
}

function row(label: string, value: string | number | undefined, opts: Omit<CardRow, "label" | "value"> = {}): CardRow {
  const text = value === undefined || value === "" ? "—" : String(value);
  return { label, value: text, ...opts };
}

function citationText(item: LayerItem): string {
  return item.citations.length === 0 ? "UNCITED" : item.citations.map(citationRef).join(" · ");
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function toneColor(tone: CardRow["tone"]): RGB {
  switch (tone) {
    case "accent":
      return ACCENT;
    case "audit":
      return AUDIT;
    case "muted":
      return MUTED;
    default:
      return INK;
  }
}

/** Downward-flowing page state with a hard bottom bound on every line. */
class Book {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  readonly toc: TocEntry[] = [];
  readonly pageSections: string[] = [];
  page!: PDFPage;
  y = 0;
  sectionName = "Cover";

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
  }

  newPage(section = this.sectionName): PDFPage {
    this.sectionName = section;
    this.page = this.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pageSections.push(section);
    this.page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: PAPER });
    this.y = A4_HEIGHT - TOP;
    return this.page;
  }

  ensure(points: number): boolean {
    if (this.y - points >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  gap(points: number): void {
    if (this.ensure(points)) return;
    this.y -= points;
  }

  line(
    text: string,
    opts: {
      x?: number;
      font?: PDFFont;
      size?: number;
      color?: RGB;
      lead?: number;
    } = {},
  ): boolean {
    const lead = opts.lead ?? BODY_LEAD;
    const broke = this.ensure(lead);
    this.y -= lead;
    const font = opts.font ?? this.fonts.body;
    this.page.drawText(toPdfFontText(text, font), {
      x: opts.x ?? MARGIN,
      y: this.y,
      font,
      size: opts.size ?? BODY,
      color: opts.color ?? INK,
    });
    return broke;
  }

  para(
    text: string,
    opts: {
      x?: number;
      width?: number;
      font?: PDFFont;
      size?: number;
      color?: RGB;
      lead?: number;
    } = {},
  ): void {
    if (!text) return;
    const font = opts.font ?? this.fonts.body;
    const size = opts.size ?? BODY;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_WIDTH;
    for (const line of wrapToWidth(text, font, size, width, toPdfFontText)) {
      this.line(line, { ...opts, x, font, size });
    }
  }

  startSection(label: string, description: string): void {
    this.newPage(label);
    this.toc.push({ label, page: this.pdf.getPageCount() });
    const index = String(this.toc.length).padStart(2, "0");
    this.line(index, { font: this.fonts.mono, size: SMALL, color: ACCENT, lead: SMALL_LEAD });
    this.para(label, { font: this.fonts.bold, size: HEADING, lead: 18.4, width: 350 });
    this.gap(4);
    this.para(description, { color: MUTED, width: 350 });
    this.gap(13);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4_WIDTH - MARGIN, y: this.y },
      thickness: 1,
      color: RULE,
    });
    this.gap(14);
  }
}

function drawCardHeader(
  book: Book,
  eyebrow: string,
  title: string,
  tone: "normal" | "accent" | "audit" = "normal",
): void {
  const wash = tone === "audit" ? AUDIT_WASH : ACCENT_WASH;
  const ink = tone === "audit" ? AUDIT : tone === "accent" ? ACCENT : INK;
  const pending = wrapToWidth(
    title || "Untitled",
    book.fonts.bold,
    SUBHEAD,
    CONTENT_WIDTH - 28,
    toPdfFontText,
  );
  let continuation = false;

  while (pending.length > 0) {
    if (book.y - (20 + 15.2) < BOTTOM) book.newPage();
    const maxLines = Math.max(1, Math.floor((book.y - BOTTOM - 20) / 15.2));
    const titleLines = pending.splice(0, maxLines);
    const height = 20 + titleLines.length * 15.2;
    const top = book.y;
    book.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: wash,
    });
    book.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: 3,
      height,
      color: ink,
    });
    book.page.drawText(toPdfFontText(`${eyebrow.toUpperCase()}${continuation ? " / CONTINUED" : ""}`, book.fonts.mono), {
      x: MARGIN + 14,
      y: top - 13,
      font: book.fonts.mono,
      size: SMALL,
      color: ink,
    });
    let y = top - 29;
    for (const line of titleLines) {
      book.page.drawText(line, {
        x: MARGIN + 14,
        y,
        font: book.fonts.bold,
        size: SUBHEAD,
        color: INK,
      });
      y -= 15.2;
    }
    book.y = top - height - 3;
    continuation = true;
  }
}

function drawCardRow(book: Book, item: CardRow): void {
  const valueFont = item.mono ? book.fonts.mono : book.fonts.body;
  const valueSize = item.mono ? SMALL : BODY;
  const valueLead = item.mono ? SMALL_LEAD : BODY_LEAD;
  const valueX = MARGIN + 12 + LABEL_WIDTH;
  const valueWidth = CONTENT_WIDTH - 24 - LABEL_WIDTH;
  const lines = wrapToWidth(item.value, valueFont, valueSize, valueWidth, toPdfFontText);
  let firstOnPage = true;

  for (const line of lines) {
    const pageBreak = book.ensure(valueLead + 2);
    if (pageBreak) firstOnPage = true;
    book.y -= valueLead;
    if (firstOnPage) {
      const suffix = pageBreak ? " (CONT.)" : "";
      book.page.drawText(toPdfFontText(`${item.label.toUpperCase()}${suffix}`, book.fonts.bold), {
        x: MARGIN + 12,
        y: book.y + (valueLead - SMALL_LEAD) / 2,
        font: book.fonts.bold,
        size: SMALL,
        color: MUTED,
      });
      firstOnPage = false;
    }
    book.page.drawText(line, {
      x: valueX,
      y: book.y,
      font: valueFont,
      size: valueSize,
      color: toneColor(item.tone),
    });
  }

  book.gap(5);
  book.page.drawLine({
    start: { x: MARGIN + 12, y: book.y },
    end: { x: A4_WIDTH - MARGIN - 12, y: book.y },
    thickness: 0.45,
    color: RULE,
  });
  book.gap(5);
}

function drawCard(
  book: Book,
  eyebrow: string,
  title: string,
  rows: readonly CardRow[],
  tone: "normal" | "accent" | "audit" = "normal",
): void {
  drawCardHeader(book, eyebrow, title, tone);
  for (const item of rows) drawCardRow(book, item);
  book.gap(9);
}

function drawEmpty(book: Book, copy: string): void {
  book.para(copy, { font: book.fonts.italic, color: MUTED, width: 340 });
  book.gap(8);
}

function drawCover(book: Book, model: CartridgeModel, input: RendererInput): void {
  book.newPage("Cover");
  const cartridge = model.cartridge;
  const id = cartridge ? fieldOf(cartridge, "cartridge_id") : "Knowledge cartridge";
  const subject = cartridge ? fieldOf(cartridge, "subject") : "No cartridge header has been recorded";

  book.line("KNOWLEDGE CARTRIDGE  /  PRACTITIONER EDITION", {
    font: book.fonts.mono,
    size: SMALL,
    color: ACCENT,
    lead: SMALL_LEAD,
  });
  book.gap(58);
  book.para(id, { font: book.fonts.bold, size: DISPLAY, lead: 28, width: 355 });
  book.gap(7);
  book.para(subject, { font: book.fonts.body, size: HEADING, lead: 19.2, color: MUTED, width: 355 });

  if (cartridge) {
    book.gap(24);
    book.para(fieldOf(cartridge, "archetype"), {
      font: book.fonts.italic,
      size: BODY,
      color: INK,
      width: 330,
    });
    book.gap(16);
    for (const metric of [
      ["SOURCES", model.sources.length],
      ["LAYER ITEMS", model.layers.reduce((sum, layer) => sum + layer.items.length, 0)],
      ["DECLARED GAPS", model.gaps.length],
      ["CONFLICTS", model.conflicts.length],
    ] as const) {
      book.line(`${metric[0]}  ${metric[1]}`, {
        font: book.fonts.mono,
        size: SMALL,
        color: MUTED,
        lead: SMALL_LEAD,
      });
    }
    book.gap(18);
    book.para(
      `${fieldOf(cartridge, "snapshot_date")} · ${fieldOf(cartridge, "substrate")} · ${input.workbookId}`,
      { font: book.fonts.mono, size: SMALL, color: QUIET, lead: SMALL_LEAD, width: 355 },
    );
    book.gap(26);
    book.para(fieldOf(cartridge, "disclaimer"), {
      font: book.fonts.italic,
      size: SMALL,
      color: MUTED,
      lead: SMALL_LEAD,
      width: 355,
    });
  } else {
    book.gap(24);
    book.para(
      "This workbook has no kc:Cartridge header yet. Add the header after the six layers and their citations pass validation.",
      { color: MUTED, width: 340 },
    );
  }
}

function drawContents(book: Book): PDFPage {
  const page = book.newPage("Contents");
  page.drawText("CONTENTS", {
    x: MARGIN,
    y: A4_HEIGHT - TOP - SMALL_LEAD,
    font: book.fonts.mono,
    size: SMALL,
    color: ACCENT,
  });
  page.drawText("A reference arranged for use, not for ingestion order.", {
    x: MARGIN,
    y: A4_HEIGHT - TOP - 45,
    font: book.fonts.italic,
    size: BODY,
    color: MUTED,
  });
  return page;
}

function fillContents(page: PDFPage, book: Book): void {
  let y = A4_HEIGHT - TOP - 88;
  for (const [index, entry] of book.toc.entries()) {
    const n = String(index + 1).padStart(2, "0");
    page.drawText(n, { x: MARGIN, y, font: book.fonts.mono, size: SMALL, color: ACCENT });
    page.drawText(toPdfFontText(entry.label, book.fonts.body), {
      x: MARGIN + 34,
      y,
      font: book.fonts.body,
      size: BODY,
      color: INK,
    });
    const folio = String(entry.page);
    const folioWidth = book.fonts.mono.widthOfTextAtSize(folio, SMALL);
    page.drawText(folio, {
      x: A4_WIDTH - MARGIN - folioWidth,
      y,
      font: book.fonts.mono,
      size: SMALL,
      color: MUTED,
    });
    page.drawLine({
      start: { x: MARGIN + 250, y: y + 2 },
      end: { x: A4_WIDTH - MARGIN - 26, y: y + 2 },
      thickness: 0.4,
      color: RULE,
      dashArray: [1.5, 3],
    });
    y -= 31;
  }
}

function drawEnvelope(book: Book, model: CartridgeModel): void {
  book.startSection(
    "Competence envelope",
    "The boundary was fixed before retrieval. Covered work and explicit exclusions are equally important claims.",
  );
  if (model.covered.length === 0) drawEmpty(book, "Nothing is declared covered.");
  for (const item of model.covered) {
    drawCard(book, "Covered", fieldOf(item, "statement"), [], "accent");
  }
  if (model.excluded.length === 0) {
    drawCard(
      book,
      "Boundary warning",
      "No exclusions are declared; the competence envelope is not bounded.",
      [],
      "audit",
    );
  }
  for (const item of model.excluded) {
    drawCard(book, "Explicitly excluded", fieldOf(item, "statement"), [], "audit");
  }
}

function layerDescription(typeId: string): string {
  switch (typeId) {
    case T.Primitive:
      return "Definitions, units, and notation. This layer establishes the vocabulary used by every rule below it.";
    case T.Invariant:
      return "Falsifiable constraints. Each rule names both its bound and a concrete violation.";
    case T.Constant:
      return "Numbers, ratios, and scales kept out of prose so they can be found and tested.";
    case T.Step:
      return "Ordered procedures. The ordering is part of the knowledge, and every step states what it constrains next.";
    case T.Diagnostic:
      return "Pattern recognition in the order a practitioner encounters it: symptom, cause, correction.";
    case T.Override:
      return "Conditions for suspending a rule. This is the adaptive-expertise layer, never an unbound opinion.";
    default:
      return "A typed layer of the cartridge.";
  }
}

function drawLayerItem(book: Book, model: CartridgeModel, layerType: string, item: LayerItem): void {
  const p = item.instance;
  const source = row("Source", citationText(item), {
    tone: item.citations.length === 0 ? "audit" : "accent",
    mono: true,
  });
  switch (layerType) {
    case T.Primitive:
      drawCard(book, p.id, fieldOf(p, "term"), [
        row("Definition", fieldOf(p, "definition")),
        row("Unit", fieldOf(p, "unit"), { mono: true }),
        source,
      ]);
      break;
    case T.Invariant:
      drawCard(book, p.id, fieldOf(p, "rule"), [
        row("Value", fieldOf(p, "value"), { mono: true }),
        row("Violated by", fieldOf(p, "falsifier"), { tone: "audit" }),
        source,
      ]);
      break;
    case T.Constant:
      drawCard(book, p.id, fieldOf(p, "name"), [
        row("Value", fieldOf(p, "value"), { mono: true }),
        row("Unit", fieldOf(p, "unit")),
        source,
      ]);
      break;
    case T.Step:
      drawCard(book, p.id, `${numberOf(p, "position")}. ${fieldOf(p, "action")}`, [
        row("Constrains next", fieldOf(p, "constrains_next")),
        row("Procedure", fieldOf(p, "procedure")),
        source,
      ], "accent");
      break;
    case T.Diagnostic:
      drawCard(book, p.id, fieldOf(p, "symptom"), [
        row("Cause", fieldOf(p, "cause")),
        row("Correction", fieldOf(p, "correction"), { tone: "accent" }),
        source,
      ]);
      break;
    case T.Override: {
      const targets = model.overrideTargets.get(p.id) ?? [];
      drawCard(book, p.id, fieldOf(p, "condition"), [
        row("Rationale", fieldOf(p, "rationale")),
        row("Suspends", targets.length > 0 ? targets.join(" · ") : "NOTHING", {
          tone: targets.length > 0 ? "audit" : "muted",
          mono: true,
        }),
      ], "audit");
      break;
    }
  }
}

function drawLayers(book: Book, model: CartridgeModel): void {
  for (const layer of model.layers) {
    book.startSection(layer.label, layerDescription(layer.typeId));
    const items = layer.typeId === T.Step
      ? layer.items.slice().sort((a, b) => numberOf(a.instance, "position") - numberOf(b.instance, "position"))
      : layer.items;
    if (items.length === 0) drawEmpty(book, "No items have been recorded in this layer.");
    for (const item of items) drawLayerItem(book, model, layer.typeId, item);
  }
}

function drawAudit(book: Book, model: CartridgeModel): void {
  book.startSection(
    "Declared gaps",
    "Covered questions the corpus could not answer. A gap is evidence about the boundary, not permission to invent a claim.",
  );
  if (model.gaps.length === 0) drawEmpty(book, "No gaps are declared.");
  for (const gap of model.gaps) {
    drawCard(book, fieldOf(gap, "grade") || "Gap", fieldOf(gap, "statement"), [
      row("Why unbacked", fieldOf(gap, "why_unbacked")),
    ], "audit");
  }

  book.startSection(
    "Unreconciled conflicts",
    "Incompatible source claims are kept side by side. The renderer does not average them or choose a winner.",
  );
  if (model.conflicts.length === 0) drawEmpty(book, "No source conflicts are recorded.");
  for (const conflict of model.conflicts) {
    drawCard(book, "Source conflict", fieldOf(conflict, "quantity"), [
      row(fieldOf(conflict, "key_a") || "Source A", fieldOf(conflict, "value_a")),
      row(fieldOf(conflict, "key_b") || "Source B", fieldOf(conflict, "value_b")),
    ], "audit");
  }
}

function drawCorpus(book: Book, model: CartridgeModel): void {
  book.startSection(
    "Sources & corpus",
    "The authority tiers are different kinds of evidence, not a shared ranking. Defects remain visible because they change retrieval coverage.",
  );
  if (model.sources.length === 0) drawEmpty(book, "No sources have been recorded.");
  for (const source of model.sources) {
    const key = fieldOf(source, "citation_key") || source.id;
    drawCard(book, key, fieldOf(source, "title"), [
      row("Tier", fieldOf(source, "tier"), { tone: "accent" }),
      row("Sentences", numberOf(source, "sentence_count") || "—", { mono: true }),
      row("Authorship", fieldOf(source, "authorship")),
      row("Edition", fieldOf(source, "edition_date")),
    ]);
  }

  if (model.defects.length > 0) {
    book.gap(4);
    book.para("Corpus defects", { font: book.fonts.bold, size: SUBHEAD, color: AUDIT, width: 340 });
    book.gap(8);
    for (const defect of model.defects) {
      drawCard(book, fieldOf(defect, "kind"), fieldOf(defect, "signal"), [
        row("Known fix", fieldOf(defect, "fix")),
        row("Attention", fieldOf(defect, "grade"), { tone: "audit" }),
      ], "audit");
    }
  }
}

function drawConstruction(book: Book, model: CartridgeModel): void {
  book.startSection(
    "Construction record",
    "Counts are computed from the graph. The unchecked controls are named explicitly; omission is not a passing result.",
  );
  const cartridge = model.cartridge;
  const h = model.harvest;
  drawCard(book, "Observed", "Harvest and citation accounting", [
    row("Harvested", h.total, { mono: true }),
    row("Retained", h.retained, { mono: true }),
    row("Discarded", h.discarded, { mono: true }),
    row("Discard rate", percent(h.discardRate), {
      mono: true,
      tone: h.discardRate !== null && h.discardRate < 0.5 ? "audit" : "accent",
    }),
    row("Uncited claims", model.uncited.length, {
      mono: true,
      tone: model.uncited.length > 0 ? "audit" : "accent",
    }),
    row("Source tokens", cartridge ? numberOf(cartridge, "source_token_estimate") || "—" : "—", {
      mono: true,
    }),
  ]);

  if (model.uncited.length > 0) {
    drawCard(book, "Citation failure", "Normative claims without a KEY:ordinal", [
      row("Claims", model.uncited.map((claim) => claim.id).join(" · "), { tone: "audit", mono: true }),
    ], "audit");
  }

  for (const check of KC_UNENFORCEABLE_CHECKS) {
    drawCard(book, "UNCHECKED", check.check, [row("Why", check.why)], "audit");
  }
}

function decoratePages(book: Book): void {
  const pages = book.pdf.getPages();
  pages.forEach((page, index) => {
    if (index > 0) {
      const section = book.pageSections[index] ?? "Knowledge cartridge";
      page.drawText(toPdfFontText(section, book.fonts.mono), {
        x: MARGIN,
        y: A4_HEIGHT - 35,
        font: book.fonts.mono,
        size: SMALL,
        color: QUIET,
      });
      page.drawLine({
        start: { x: MARGIN, y: A4_HEIGHT - 43 },
        end: { x: A4_WIDTH - MARGIN, y: A4_HEIGHT - 43 },
        thickness: 0.45,
        color: RULE,
      });
    }
    const folio = `${index + 1} / ${pages.length}`;
    const width = book.fonts.mono.widthOfTextAtSize(folio, SMALL);
    page.drawText(folio, {
      x: A4_WIDTH - MARGIN - width,
      y: 31,
      font: book.fonts.mono,
      size: SMALL,
      color: QUIET,
    });
  });
}

export async function renderCartridgePdf(input: RendererInput): Promise<RendererOutput> {
  const model = buildModel(input.primitives, input.relations);
  const pdf = await PDFDocument.create();
  const epoch = new Date(0);
  pdf.setCreationDate(epoch);
  pdf.setModificationDate(epoch);
  pdf.setProducer("fdpm kc:CartridgePdfRenderer");
  pdf.setCreator("fdpm kc:CartridgePdfRenderer");

  const cartridge = model.cartridge;
  const cartridgeId = cartridge ? fieldOf(cartridge, "cartridge_id") : "Knowledge cartridge";
  const subject = cartridge ? fieldOf(cartridge, "subject") : input.workbookId;
  pdf.setTitle(`${cartridgeId} · ${subject}`);
  pdf.setSubject("Knowledge cartridge practitioner edition: competence envelope, six layers, and audit back matter");
  pdf.setAuthor("FDPM knowledge-cartridge renderer");
  pdf.setKeywords([
    "knowledge cartridge",
    "competence envelope",
    "six layers",
    "declared gaps",
    "unreconciled conflicts",
  ]);
  pdf.setLanguage("en-US");

  const fonts = await embedPdfFonts(pdf);
  const book = new Book(pdf, fonts);

  drawCover(book, model, input);
  if (input.primitives.length > 0) {
    const contents = drawContents(book);
    drawEnvelope(book, model);
    drawLayers(book, model);
    drawAudit(book, model);
    drawCorpus(book, model);
    drawConstruction(book, model);
    fillContents(contents, book);
  }
  decoratePages(book);

  return {
    bytes: await pdf.save(),
    contentType: "application/pdf",
    filename: "knowledge-cartridge.pdf",
  };
}
