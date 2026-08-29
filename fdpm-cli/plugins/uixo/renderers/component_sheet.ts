/**
 * `image/png` — the poster as pixels.
 *
 * The same layout the SVG draws, rastered: a thumbnail for a ticket, a
 * chat, or a visual diff between two revisions of a document. It shares
 * `_poster.ts` with the vector view, so the two are the same drawing
 * rather than two drawings that resemble each other — a raster that
 * disagreed with its own vector would be worse than not having one.
 *
 * The raster face is a 5×7 bitmap (`src/core/render/png.ts`), so type is
 * drawn at integer scales and every string is upper-cased. That is a real
 * limitation and the reason the vector view carries the fine typography;
 * what the raster is for is the colour and the shape, which survive.
 *
 * `componentSheetLayout` is exported and is this renderer's contract: the
 * geometry is a computed fact about the document, so a caller can address
 * a specific item and read the pixel back rather than guess a coordinate.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { encodePng, Raster, textHeight, textWidth, type Rgb } from "../../../src/core/render/png.js";
import { readDocument, type DocumentView } from "./_model.js";
import { posterLayout, type Poster, type PosterItem } from "./_poster.js";
import { hexToRgb, readableInkOn, type Tone } from "./_present.js";

const GROUND: Rgb = [255, 255, 255];
const INK: Rgb = [22, 24, 29];
const LINE: Rgb = [201, 205, 214];
const BAR: Rgb = [139, 147, 161];
const UNSET: Rgb = [244, 245, 247];

const TONE_RGB: Record<Tone | "fg", Rgb> = {
  ok: [27, 127, 75],
  warn: [138, 90, 0],
  error: [179, 38, 30],
  info: [47, 95, 168],
  muted: [107, 114, 128],
  fg: INK,
};

/** The SVG's depth ramp, as RGB. The two views must key depth alike. */
const DEPTH_FILL: Rgb[] = [
  [247, 248, 250],
  [238, 241, 245],
  [229, 233, 239],
  [220, 225, 233],
  [211, 218, 227],
  [203, 211, 222],
];
export const depthFill = (depth: number): Rgb => DEPTH_FILL[depth % DEPTH_FILL.length]!;

export interface SheetLayout extends Poster {
  document: DocumentView;
}

export function componentSheetLayout(input: RendererInput): SheetLayout {
  const document = readDocument(input);
  return { ...posterLayout(document), document };
}

/** The centre of a swatch or box — the point a sampler should read. */
export function itemCentre(item: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
} {
  return { x: item.x + Math.floor(item.w / 2), y: item.y + Math.floor(item.h / 2) };
}

/**
 * Pick the largest integer scale whose rendering of `s` fits `width`,
 * truncating with a visible hyphen only when even scale 1 will not.
 * Shrinking before cutting matters: a cut name is a different name.
 */
function fit(s: string, width: number, scales: number[]): { text: string; scale: number } {
  const label = s.toUpperCase();
  for (const scale of scales) {
    if (textWidth(label, scale) <= width) return { text: label, scale };
  }
  const scale = scales[scales.length - 1]!;
  let out = label;
  while (out.length > 1 && textWidth(`${out}-`, scale) > width) out = out.slice(0, -1);
  return { text: `${out}-`, scale };
}

/** Map a poster point size onto the nearest raster scale step. */
const scaleFor = (size: number): number => (size >= 20 ? 3 : size >= 12 ? 2 : size >= 9.5 ? 2 : 1);

function paint(raster: Raster, item: PosterItem): void {
  switch (item.kind) {
    case "title": {
      const scale = scaleFor(item.size);
      // Poster `y` is a text baseline; the raster draws from the top.
      raster.text(item.x, item.y - textHeight(scale), item.text, INK, scale);
      return;
    }
    case "label": {
      const scale = scaleFor(item.size);
      raster.text(item.x, item.y - textHeight(scale), item.text, TONE_RGB[item.tone], scale);
      return;
    }
    case "rule":
      raster.fillRect(item.x, item.y, item.w, Math.max(Math.round(item.weight), 1), INK);
      return;
    case "swatch": {
      const rgb = hexToRgb(item.hex);
      raster.fillRect(item.x, item.y, item.w, item.h, rgb ?? UNSET);
      raster.strokeRect(item.x, item.y, item.w, item.h, LINE);
      if (rgb) {
        const ink: Rgb = readableInkOn(item.hex) === "#000000" ? [0, 0, 0] : [255, 255, 255];
        raster.text(item.x + 6, item.y + item.h - 14, item.hex.toUpperCase(), ink, 2);
      }
      const name = fit(item.name, item.w, [2, 1]);
      raster.text(item.x, item.y + item.h + 5, name.text, INK, name.scale);
      if (item.css) {
        const set = fit(item.css, item.w, [1]);
        raster.text(item.x, item.y + item.h + 5 + textHeight(2) + 3, set.text, TONE_RGB.muted, 1);
      }
      return;
    }
    case "box": {
      raster.fillRect(item.x, item.y, item.w, item.h, depthFill(item.depth));
      raster.strokeRect(item.x, item.y, item.w, item.h, LINE);
      raster.fillRect(item.x + 1, item.y + 1, item.w - 2, 25, depthFill(item.depth + 1));
      const caption = fit(item.caption, item.w - 12, [2, 1]);
      raster.text(item.x + 6, item.y + 6, caption.text, INK, caption.scale);
      return;
    }
    case "chip": {
      raster.strokeRect(item.x, item.y, item.w, item.h, TONE_RGB[item.tone]);
      const label = fit(item.text, item.w - 12, [1]);
      raster.text(
        item.x + 6,
        item.y + Math.max(Math.floor((item.h - textHeight(1)) / 2), 1),
        label.text,
        TONE_RGB[item.tone],
        1,
      );
      return;
    }
    case "bar":
      raster.fillRect(item.x, item.y, Math.max(item.w, 1), item.h, BAR);
      raster.text(item.x + item.w + 6, item.y, item.value.toUpperCase(), TONE_RGB.muted, 1);
      return;
    default:
  }
}

export function renderComponentSheet(input: RendererInput): RendererOutput {
  const layout = componentSheetLayout(input);
  const raster = new Raster(layout.width, Math.max(layout.height, 40), GROUND);
  for (const item of layout.items) paint(raster, item);

  if (layout.document.cycleBroken.length > 0) {
    raster.text(
      28,
      layout.height - 18,
      `${layout.document.cycleBroken.length} ENTITY(IES) REACHABLE ONLY BY BREAKING A CYCLE`,
      TONE_RGB.error,
      1,
    );
  }

  return {
    bytes: encodePng(raster),
    contentType: "image/png",
    filename: "uixo-component-sheet.png",
  };
}
