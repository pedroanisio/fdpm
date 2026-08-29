/**
 * `image/png` — the wireframe as pixels.
 *
 * The same nesting the SVG draws, rastered: a thumbnail you can drop into
 * a ticket, a chat, or a visual diff between two revisions of a document.
 * It shares `_wireframe.ts` with the vector view, so the two are the same
 * drawing rather than two drawings that resemble each other — a raster
 * that disagreed with its own vector would be worse than not having one.
 *
 * `componentSheetLayout` is exported and is this renderer's contract: the
 * geometry is a computed fact about the document, so a caller can address
 * a specific box and read the pixel back rather than guess a coordinate.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { encodePng, Raster, textHeight, textWidth, type Rgb } from "../../../src/core/render/png.js";
import { readDocument, type DocumentView } from "./_model.js";
import { boxCaption, wireframeLayout, MARGIN, type WireframeLayout } from "./_wireframe.js";

const GROUND: Rgb = [255, 255, 255];
const INK: Rgb = [22, 24, 29];
const MUTED: Rgb = [107, 114, 128];
const LINE: Rgb = [201, 205, 214];
const ALERT: Rgb = [179, 38, 30];

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

const SHEET_W = 1120;
const HEADER = 58;
const TITLE_SCALE = 3;
const CAPTION_SCALE = 1;

export interface SheetLayout extends WireframeLayout {
  /** The document the geometry was computed from. */
  document: DocumentView;
}

/**
 * Compute the whole sheet before painting any of it — the same
 * measure-then-place discipline the vector view uses, for the same
 * reason: a raster silently drops ink outside its surface.
 */
export function componentSheetLayout(input: RendererInput): SheetLayout {
  const document = readDocument(input);
  const wire = wireframeLayout(document, { width: SHEET_W, top: HEADER });
  return { ...wire, document };
}

/** The centre of a box's header strip — the point a sampler should read. */
export function boxHeaderCentre(box: { x: number; y: number; width: number; headerHeight: number }): {
  x: number;
  y: number;
} {
  return {
    x: box.x + Math.floor(box.width / 2),
    y: box.y + Math.floor(box.headerHeight / 2),
  };
}

/** Truncate so a caption cannot run past its box. */
function fit(s: string, scale: number, width: number): string {
  let out = s.toUpperCase();
  if (textWidth(out, scale) <= width) return out;
  while (out.length > 1 && textWidth(`${out}-`, scale) > width) out = out.slice(0, -1);
  return `${out}-`;
}

export function renderComponentSheet(input: RendererInput): RendererOutput {
  const layout = componentSheetLayout(input);
  const doc = layout.document;
  const raster = new Raster(SHEET_W, Math.max(layout.height, HEADER + MARGIN), GROUND);

  raster.text(MARGIN, MARGIN - 4, "UIXO DOCUMENT", INK, TITLE_SCALE);
  raster.text(
    MARGIN,
    MARGIN + textHeight(TITLE_SCALE) + 2,
    `${doc.nodeCount} ENTITIES / ${doc.edgeCount} EDGES / ${doc.roots.length} ROOTS / DEPTH ${layout.maxDepthReached}`,
    MUTED,
    CAPTION_SCALE,
  );

  if (doc.nodeCount === 0) {
    raster.text(MARGIN, HEADER, "NO UIXO PRIMITIVES IN THIS WORKBOOK", MUTED, 2);
    return out(raster);
  }

  for (const b of layout.boxes) {
    raster.fillRect(b.x, b.y, b.width, b.height, depthFill(b.depth));
    raster.strokeRect(b.x, b.y, b.width, b.height, LINE);
    raster.fillRect(b.x + 1, b.y + 1, b.width - 2, b.headerHeight - 1, depthFill(b.depth + 1));
    raster.text(
      b.x + 6,
      b.y + Math.floor((b.headerHeight - textHeight(2)) / 2),
      fit(boxCaption(b), 2, b.width - 12),
      INK,
      2,
    );
  }

  if (doc.cycleBroken.length > 0) {
    raster.text(
      MARGIN,
      layout.height - MARGIN + 4,
      `${doc.cycleBroken.length} ENTITY(IES) REACHABLE ONLY BY BREAKING A CYCLE`,
      ALERT,
      CAPTION_SCALE,
    );
  }

  return out(raster);
}

function out(raster: Raster): RendererOutput {
  return {
    bytes: encodePng(raster),
    contentType: "image/png",
    filename: "uixo-component-sheet.png",
  };
}
