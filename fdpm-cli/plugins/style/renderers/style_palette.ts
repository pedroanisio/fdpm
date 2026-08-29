/**
 * `image/png` — the palette as pixels.
 *
 * The HTML page and the SVG plate are documents about the colours. This
 * is the colours: a raster chip sheet that can be dropped into a picker,
 * sampled with an eyedropper, or diffed against a previous release to see
 * whether a hue moved. Everything else the schema carries is deliberately
 * absent — a PNG is the wrong container for prose, and a palette sheet
 * that also tried to be a specification would be worse at both.
 *
 * What is drawn: for every style, its palette chips, then its forbidden
 * colours (marked with a diagonal bar, since a forbidden colour must not
 * read as an available one), then its rendered colour tokens. Each chip
 * carries its own name and hex in ink chosen for contrast against the
 * chip itself.
 *
 * `paletteSheetLayout` is exported and is the renderer's real contract.
 * The geometry is a computed fact about the registry, so a caller — the
 * suite included — can address a specific chip's centre rather than guess
 * at a coordinate, and a pixel read back there is a genuine check that
 * the declared colour is the painted colour.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { encodePng, Raster, textHeight, textWidth, type Rgb } from "../../../src/core/render/png.js";
import { hexToRgb, readRegistry, type RegistryView } from "./_model.js";

const GROUND: Rgb = [255, 255, 255];
const INK: Rgb = [22, 24, 29];
const MUTED: Rgb = [107, 114, 128];
const LINE: Rgb = [216, 219, 226];
/** Painted where a colour is declared but carries no hex. */
const UNSET: Rgb = [244, 245, 247];

const PAD = 24;
const CHIP_W = 128;
const CHIP_H = 96;
const GAP = 12;
const LABEL_H = 30;
const PER_ROW = 6;
const SHEET_W = PAD * 2 + PER_ROW * CHIP_W + (PER_ROW - 1) * GAP;
const TITLE_SCALE = 3;
const HEADING_SCALE = 2;
const LABEL_SCALE = 2;
const CAPTION_SCALE = 1;

/** One painted chip, addressable by a caller. */
export interface SheetCell {
  styleId: string;
  /** "palette" | "forbidden" | "token" — what the chip stands for. */
  band: "palette" | "forbidden" | "token";
  name: string;
  /** The declared hex, or null when the entry carries none. */
  hex: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  cells: SheetCell[];
  /** Header baselines, so the painter and the layout cannot disagree. */
  bands: { label: string; x: number; y: number; scale: number }[];
}

/** The centre of a cell — the point a sampler should read. */
export function cellCentre(cell: SheetCell): { x: number; y: number } {
  return {
    x: cell.x + Math.floor(cell.width / 2),
    y: cell.y + Math.floor((cell.height - LABEL_H) / 2),
  };
}

/**
 * Compute the whole sheet before painting any of it. Layout and paint are
 * separate passes on purpose: the canvas height depends on how many chips
 * there are, and a painter that discovers its own extent as it goes is a
 * painter that clips.
 */
export function paletteSheetLayout(registry: RegistryView): SheetLayout {
  const cells: SheetCell[] = [];
  const bands: SheetLayout["bands"] = [];
  let y = PAD;

  bands.push({ label: "STYLE REGISTRY", x: PAD, y, scale: TITLE_SCALE });
  y += textHeight(TITLE_SCALE) + 6;
  bands.push({
    label: `${registry.styles.length} STYLES / ${registry.workbookId.toUpperCase()}`,
    x: PAD,
    y,
    scale: CAPTION_SCALE,
  });
  y += textHeight(CAPTION_SCALE) + 20;

  const band = (
    styleId: string,
    kind: SheetCell["band"],
    label: string,
    entries: { name: string; hex: string | null }[],
  ): void => {
    if (entries.length === 0) return;
    bands.push({ label, x: PAD, y, scale: HEADING_SCALE });
    y += textHeight(HEADING_SCALE) + 8;
    entries.forEach((entry, i) => {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      cells.push({
        styleId,
        band: kind,
        name: entry.name,
        hex: entry.hex,
        x: PAD + col * (CHIP_W + GAP),
        y: y + row * (CHIP_H + LABEL_H + GAP),
        width: CHIP_W,
        height: CHIP_H + LABEL_H,
      });
    });
    const rows = Math.ceil(entries.length / PER_ROW);
    y += rows * (CHIP_H + LABEL_H + GAP) + 8;
  };

  for (const style of registry.styles) {
    bands.push({ label: `${style.name} ${style.code}`.toUpperCase(), x: PAD, y, scale: HEADING_SCALE });
    y += textHeight(HEADING_SCALE) + 12;
    band(
      style.styleId,
      "palette",
      "PALETTE",
      style.palette.map((p) => ({ name: p.name, hex: p.hex })),
    );
    band(
      style.styleId,
      "forbidden",
      "FORBIDDEN",
      style.forbiddenColors.map((c) => ({ name: c.name, hex: c.hex ?? null })),
    );
    band(
      style.styleId,
      "token",
      "TOKENS",
      style.tokens.colors.map((t) => ({ name: t.name, hex: t.value })),
    );
    y += 12;
  }

  if (registry.styles.length === 0) {
    bands.push({ label: "NO STYLES IN THIS WORKBOOK", x: PAD, y, scale: HEADING_SCALE });
    y += textHeight(HEADING_SCALE);
  }

  return { width: SHEET_W, height: y + PAD, cells, bands };
}

/** Whichever of black or white reads better on `rgb`, by luminance. */
function inkOn(rgb: Rgb): Rgb {
  // Rec. 709 luma is sufficient here and avoids a hex round-trip; the
  // WCAG-accurate figure is computed in the HTML and SVG views, where it
  // is reported as a number rather than used to pick an ink.
  const luma = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return luma > 0.55 ? INK : GROUND;
}

/**
 * Fit `s` inside `width`, shrinking before cutting.
 *
 * Truncation is the last resort because a cut name is a *different* name:
 * "journal paper" clipped to "journal pa" reads as a token that does not
 * exist. Dropping a size step roughly doubles the characters that fit, so
 * most names survive intact; only a name too long even at the smallest
 * step loses its tail, and it is marked with a hyphen so the cut is
 * visible rather than silent.
 */
function fitLabel(s: string, width: number, scales: number[]): { text: string; scale: number } {
  const label = s.toUpperCase();
  for (const scale of scales) {
    if (textWidth(label, scale) <= width) return { text: label, scale };
  }
  const scale = scales[scales.length - 1]!;
  let out = label;
  while (out.length > 1 && textWidth(`${out}-`, scale) > width) out = out.slice(0, -1);
  return { text: `${out}-`, scale };
}

export function renderPaletteSheet(input: RendererInput): RendererOutput {
  const registry = readRegistry(input);
  const layout = paletteSheetLayout(registry);
  const raster = new Raster(layout.width, layout.height, GROUND);

  for (const band of layout.bands) {
    raster.text(band.x, band.y, band.label, band.scale === CAPTION_SCALE ? MUTED : INK, band.scale);
  }

  for (const cell of layout.cells) {
    const rgb = cell.hex === null ? null : hexToRgb(cell.hex);
    raster.fillRect(cell.x, cell.y, CHIP_W, CHIP_H, rgb ?? UNSET);
    raster.strokeRect(cell.x, cell.y, CHIP_W, CHIP_H, LINE);

    if (rgb === null) {
      raster.text(cell.x + 8, cell.y + CHIP_H - 20, "NO HEX", MUTED, LABEL_SCALE);
    } else {
      const ink = inkOn(rgb);
      raster.text(cell.x + 8, cell.y + CHIP_H - 20, cell.hex!.toUpperCase(), ink, LABEL_SCALE);
      if (cell.band === "forbidden") {
        // A forbidden colour must not read as an available one. The bar
        // is drawn in the chip's own contrast ink so it stays visible
        // whatever the hue.
        for (let i = 0; i < CHIP_H; i++) {
          raster.fillRect(cell.x + i, cell.y + CHIP_H - 1 - i, 3, 3, ink);
        }
      }
    }

    const label = fitLabel(cell.name, CHIP_W, [LABEL_SCALE, CAPTION_SCALE]);
    raster.text(cell.x, cell.y + CHIP_H + 6, label.text, INK, label.scale);
    raster.text(
      cell.x,
      cell.y + CHIP_H + 6 + textHeight(LABEL_SCALE) + 3,
      cell.band.toUpperCase(),
      MUTED,
      CAPTION_SCALE,
    );
  }

  return {
    bytes: encodePng(raster),
    contentType: "image/png",
    filename: "style-palette.png",
  };
}
