/**
 * `image/svg+xml` — the document as a poster.
 *
 * Layout is `_poster.ts`, shared with the PNG so the vector and the
 * bitmap are the same drawing. This module only turns typed items into
 * elements: it owns no coordinate and makes no decision about what to
 * show.
 *
 * Fonts are named as generic families only. An SVG that names an
 * installed font renders differently on the next machine, and a diagram
 * that changes shape between viewers is not a diagram.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { readDocument } from "./_model.js";
import { posterLayout, type PosterItem } from "./_poster.js";
import { readableInkOn, type Tone } from "./_present.js";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SANS = "ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, monospace";
const GROUND = "#ffffff";
const INK = "#16181d";
const LINE = "#c9cdd6";
const BAR = "#8b93a1";

const TONE_FILL: Record<Tone | "fg", string> = {
  ok: "#1b7f4b",
  warn: "#8a5a00",
  error: "#b3261e",
  info: "#2f5fa8",
  muted: "#6b7280",
  fg: INK,
};

/** Depth ramp, shared with the raster view so nesting keys alike. */
const DEPTH_FILL = ["#f7f8fa", "#eef1f5", "#e5e9ef", "#dce1e9", "#d3dae3", "#cbd3de"];
export const depthFillHex = (depth: number): string => DEPTH_FILL[depth % DEPTH_FILL.length]!;

const safeHex = (hex: string): string | null =>
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? hex : null;

function text(
  x: number,
  y: number,
  content: string,
  opts: { size?: number; fill?: string; family?: string; weight?: number } = {},
): string {
  return (
    `<text x="${x}" y="${y}" font-family="${opts.family ?? SANS}" font-size="${opts.size ?? 11}"` +
    ` fill="${opts.fill ?? INK}"${opts.weight ? ` font-weight="${opts.weight}"` : ""}>` +
    `${esc(content)}</text>`
  );
}

function draw(item: PosterItem): string {
  switch (item.kind) {
    case "title":
      return text(item.x, item.y, item.text, { size: item.size, weight: 700 });
    case "label":
      return text(item.x, item.y, item.text, { size: item.size, fill: TONE_FILL[item.tone] });
    case "rule":
      return `<line x1="${item.x}" y1="${item.y}" x2="${item.x + item.w}" y2="${item.y}" stroke="${INK}" stroke-width="${item.weight}"/>`;
    case "swatch": {
      const fill = safeHex(item.hex);
      const ink = fill ? readableInkOn(fill) : INK;
      return [
        `<g data-swatch="${esc(item.name)}">`,
        `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="3" fill="${fill ?? "none"}" stroke="${LINE}"/>`,
        text(item.x + 7, item.y + item.h - 8, item.hex, { size: 10, family: MONO, fill: ink }),
        text(item.x, item.y + item.h + 13, item.name, { size: 10, weight: 600 }),
        item.css ? text(item.x, item.y + item.h + 24, item.css, { size: 9, fill: TONE_FILL.muted }) : "",
        `</g>`,
      ].join("");
    }
    case "box":
      return [
        `<g data-box="${esc(item.caption)}" data-depth="${item.depth}">`,
        `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="3" fill="${depthFillHex(item.depth)}" stroke="${LINE}"/>`,
        `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="26" rx="3" fill="${depthFillHex(item.depth + 1)}"/>`,
        text(item.x + 8, item.y + 17, item.caption, { size: 11, weight: item.depth === 0 ? 700 : 500 }),
        `</g>`,
      ].join("");
    case "chip":
      return [
        `<g data-chip="${esc(item.text)}">`,
        `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="${item.h / 2}" fill="none" stroke="${TONE_FILL[item.tone]}" stroke-width="0.9"/>`,
        text(item.x + 9, item.y + item.h - 6, item.text, { size: 10, fill: TONE_FILL[item.tone] }),
        `</g>`,
      ].join("");
    case "bar":
      return [
        `<rect data-bar="${esc(item.value)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="2" fill="${BAR}"/>`,
        text(item.x + item.w + 7, item.y + item.h - 1, item.value, {
          size: 9.5,
          fill: TONE_FILL.muted,
          family: MONO,
        }),
      ].join("");
    default:
      return "";
  }
}

export function renderComponentTree(input: RendererInput): RendererOutput {
  const doc = readDocument(input);
  const poster = posterLayout(doc);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${poster.width}" height="${poster.height}"` +
      ` viewBox="0 0 ${poster.width} ${poster.height}" role="img" aria-label="UIXO document poster">`,
    `<rect x="0" y="0" width="${poster.width}" height="${poster.height}" fill="${GROUND}"/>`,
    ...poster.items.map(draw),
  ];

  if (doc.cycleBroken.length > 0) {
    parts.push(
      text(28, poster.height - 10, `${doc.cycleBroken.length} entity(ies) reachable only by breaking a cycle`, {
        size: 10,
        fill: TONE_FILL.error,
      }),
    );
  }

  parts.push(`</svg>`, "");

  return {
    bytes: new TextEncoder().encode(parts.join("\n")),
    contentType: "image/svg+xml",
    filename: "uixo-component-tree.svg",
  };
}
