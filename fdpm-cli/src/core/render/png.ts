/**
 * A minimal raster surface and a PNG encoder, in TypeScript, with no
 * dependency beyond `node:zlib`.
 *
 * Host infrastructure rather than a plugin's private helper: it was
 * written for `plugins/style`'s palette sheet and moved here the moment
 * `plugins/uixo` needed the same thing. A plugin reaching into another
 * plugin's module is a dependency the manifest does not record and the
 * loader does not enforce, and a second copy of an encoder is a second
 * copy of its bugs.
 *
 * Why not a library: what plugins raster here is axis-aligned rectangles
 * of flat colour with monospaced labels. A rasteriser earns its place
 * when it has to resolve fonts, curves, blending and colour management;
 * none of that appears here, and pulling in an image toolchain to fill
 * rectangles would trade a hundred lines for a native build step, a
 * platform matrix and a version to track.
 *
 * The encoder writes the smallest correct PNG for that job: 8-bit
 * truecolour (colour type 2), no alpha channel, no interlace, filter type
 * 0 on every scanline. Correctness here is not "an image viewer opened
 * it" — the suite parses the chunk stream, verifies each CRC against an
 * independent implementation, inflates IDAT and reads back the pixels the
 * palette declared.
 *
 * Determinism: `deflateSync` at a pinned level over identical input
 * yields identical output, and nothing in this module reads a clock or an
 * environment. Two renders of one workbook are byte-equal.
 */

import { deflateSync } from "node:zlib";

export type Rgb = readonly [number, number, number];

// ── CRC-32 (PNG Annex D) ───────────────────────────────────────────────

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── The 5×7 bitmap face ────────────────────────────────────────────────
//
// Uppercase, digits and the punctuation a colour sheet needs. A label is
// upper-cased before it is drawn; a character with no glyph draws as a
// space rather than as a substitute shape, because a wrong glyph in a
// hex code is worse than a gap.

const GLYPH_W = 5;
const GLYPH_H = 7;

const FONT: Record<string, readonly string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["..##.", ".#...", "#....", "#....", "#....", ".#...", "..##."],
  ")": [".##..", "...#.", "....#", "....#", "....#", "...#.", ".##.."],
};

/** Advance per character at `scale`, including the one-column gap. */
export const charAdvance = (scale: number): number => (GLYPH_W + 1) * scale;

/** Width in pixels of `s` drawn at `scale`. */
export const textWidth = (s: string, scale: number): number =>
  s.length === 0 ? 0 : s.length * charAdvance(scale) - scale;

/** Height in pixels of a line drawn at `scale`. */
export const textHeight = (scale: number): number => GLYPH_H * scale;

// ── Raster ─────────────────────────────────────────────────────────────

export class Raster {
  readonly width: number;
  readonly height: number;
  /** Row-major RGB, three bytes per pixel. */
  readonly data: Uint8Array;

  constructor(width: number, height: number, background: Rgb) {
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
      throw new RangeError(`raster dimensions must be positive integers, got ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    this.fillRect(0, 0, width, height, background);
  }

  /** Paint an axis-aligned rectangle, clipped to the surface. */
  fillRect(x: number, y: number, w: number, h: number, rgb: Rgb): void {
    const x0 = Math.max(0, Math.trunc(x));
    const y0 = Math.max(0, Math.trunc(y));
    const x1 = Math.min(this.width, Math.trunc(x + w));
    const y1 = Math.min(this.height, Math.trunc(y + h));
    for (let py = y0; py < y1; py++) {
      let at = (py * this.width + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.data[at++] = rgb[0];
        this.data[at++] = rgb[1];
        this.data[at++] = rgb[2];
      }
    }
  }

  /** A one-pixel-thick rectangle outline. */
  strokeRect(x: number, y: number, w: number, h: number, rgb: Rgb): void {
    this.fillRect(x, y, w, 1, rgb);
    this.fillRect(x, y + h - 1, w, 1, rgb);
    this.fillRect(x, y, 1, h, rgb);
    this.fillRect(x + w - 1, y, 1, h, rgb);
  }

  /**
   * Draw `s` with its top-left at (x, y). The string is upper-cased
   * because the face has no lowercase; a character with no glyph advances
   * without painting.
   */
  text(x: number, y: number, s: string, rgb: Rgb, scale = 1): void {
    let cursor = Math.trunc(x);
    for (const ch of s.toUpperCase()) {
      const glyph = FONT[ch];
      if (glyph !== undefined) {
        for (let row = 0; row < GLYPH_H; row++) {
          const bits = glyph[row]!;
          for (let col = 0; col < GLYPH_W; col++) {
            if (bits[col] === "#") {
              this.fillRect(cursor + col * scale, y + row * scale, scale, scale, rgb);
            }
          }
        }
      }
      cursor += charAdvance(scale);
    }
  }

  /** The RGB triple at (x, y), or null when the point is off-surface. */
  pixel(x: number, y: number): Rgb | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const at = (y * this.width + x) * 3;
    return [this.data[at]!, this.data[at + 1]!, this.data[at + 2]!];
  }
}

// ── Encoder ────────────────────────────────────────────────────────────

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

/** Encode a raster as an 8-bit truecolour PNG. */
export function encodePng(raster: Raster): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, raster.width);
  view.setUint32(4, raster.height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  // One filter byte (type 0, "None") per scanline, then the RGB row.
  // Filtering exists to help compression; a sheet of flat rectangles
  // already runs to almost nothing, and type 0 keeps the decoded bytes
  // directly comparable to what was painted.
  const stride = raster.width * 3;
  const raw = new Uint8Array(raster.height * (1 + stride));
  for (let y = 0; y < raster.height; y++) {
    raw[y * (1 + stride)] = 0;
    raw.set(raster.data.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
  }

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
