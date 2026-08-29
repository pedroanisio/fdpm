/**
 * `image/svg+xml` — the document as a wireframe, with its two censuses.
 *
 * Three bands, in the order a reviewer needs them:
 *
 *  1. **Structure.** The containment forest as nested boxes. Depth is
 *     colour-keyed, so how deeply a component sits is legible without
 *     counting rules, and each box carries its class, its name, and the
 *     counts that nesting hides — children too deep to draw, and edges
 *     that leave the tree.
 *  2. **Relations.** One row per edge property with a proportional bar.
 *     The edges are the model; a structure drawing alone shows the
 *     skeleton and none of the wiring.
 *  3. **Classes.** The same for the ontology classes actually used, which
 *     is the fastest way to see what a 712-class profile was used *for*.
 *
 * Fonts are named as generic families only. An SVG that names an
 * installed font renders differently on the next machine, and a diagram
 * that changes shape between viewers is not a diagram.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { readDocument, type DocumentView } from "./_model.js";
import { boxCaption, wireframeLayout, MARGIN, type WireBox } from "./_wireframe.js";

/** XML text escape. Every author-supplied string passes through it. */
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
const W = 1120;
const INK = "#16181d";
const MUTED = "#6b7280";
const LINE = "#c9cdd6";
const GROUND = "#ffffff";
const BAR = "#4b5563";

/**
 * Fill per nesting depth. Six steps then a repeat: past six levels the
 * absolute depth matters less than the local contrast between a box and
 * the one it sits in, and that alternation is what the cycle preserves.
 */
const DEPTH_FILL = ["#f7f8fa", "#eef1f5", "#e5e9ef", "#dce1e9", "#d3dae3", "#cbd3de"];
const fillFor = (depth: number): string => DEPTH_FILL[depth % DEPTH_FILL.length]!;

/** Truncate to `max` characters so a caption cannot run out of its box. */
const clip = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(max - 1, 0))}…`;

function text(
  x: number,
  y: number,
  content: string,
  opts: { size?: number; fill?: string; family?: string; weight?: number; anchor?: string } = {},
): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${opts.family ?? SANS}"`,
    `font-size="${opts.size ?? 11}"`,
    `fill="${opts.fill ?? INK}"`,
  ];
  if (opts.weight !== undefined) attrs.push(`font-weight="${opts.weight}"`);
  if (opts.anchor !== undefined) attrs.push(`text-anchor="${opts.anchor}"`);
  return `<text ${attrs.join(" ")}>${esc(content)}</text>`;
}

function box(b: WireBox): string {
  // ~6.2px per character at 11px in a system sans; the clip is deliberately
  // conservative because an overrunning caption is the one defect the
  // bounds test cannot catch (SVG text has no declared width).
  const caption = clip(boxCaption(b), Math.max(Math.floor((b.width - 16) / 6.2), 4));
  return [
    `<g data-box="${esc(b.entityId)}" data-depth="${b.depth}">`,
    `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="3" fill="${fillFor(b.depth)}" stroke="${LINE}"/>`,
    `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.headerHeight}" rx="3" fill="${fillFor(b.depth + 1)}"/>`,
    text(b.x + 8, b.y + 17, caption, { size: 11, weight: b.depth === 0 ? 700 : 500 }),
    `</g>`,
  ].join("\n");
}

/** A census band: one labelled row per entry, bars proportional to the max. */
function census(
  title: string,
  rows: { label: string; count: number }[],
  top: number,
  limit: number,
): { svg: string; height: number } {
  const shown = rows.slice(0, limit);
  const max = Math.max(...shown.map((r) => r.count), 1);
  const rowH = 16;
  const labelW = 260;
  const barW = W - 2 * MARGIN - labelW - 60;

  const parts = [text(MARGIN, top + 12, title, { size: 10, fill: MUTED, weight: 700 })];
  shown.forEach((row, i) => {
    const y = top + 26 + i * rowH;
    parts.push(
      text(MARGIN, y + 9, clip(row.label, 42), { size: 10, family: MONO }),
      `<rect data-bar="${esc(row.label)}" x="${MARGIN + labelW}" y="${y + 2}" width="${(row.count / max) * barW}" height="9" fill="${BAR}"/>`,
      text(MARGIN + labelW + barW + 8, y + 9, String(row.count), { size: 10, fill: MUTED }),
    );
  });
  let height = 26 + shown.length * rowH;
  if (rows.length > shown.length) {
    parts.push(
      text(MARGIN, top + height + 10, `+ ${rows.length - shown.length} more`, {
        size: 10,
        fill: MUTED,
      }),
    );
    height += 16;
  }
  return { svg: parts.join("\n"), height: height + 12 };
}

export function renderComponentTree(input: RendererInput): RendererOutput {
  const doc: DocumentView = readDocument(input);
  const HEADER = 62;
  const wire = wireframeLayout(doc, { width: W, top: HEADER });

  const relations = census(
    "EDGES BY PROPERTY",
    doc.relationCensus.map((r) => ({ label: r.property, count: r.count })),
    wire.height + 8,
    20,
  );
  const classes = census(
    "CLASSES IN USE",
    doc.classCensus.map((c) => ({ label: c.className, count: c.count })),
    wire.height + 8 + relations.height,
    20,
  );

  const total = wire.height + 8 + relations.height + classes.height + MARGIN;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}" role="img" aria-label="UIXO component tree">`,
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${total}" fill="${GROUND}"/>`);
  parts.push(text(MARGIN, 30, "UIXO document", { size: 20, weight: 700 }));
  parts.push(
    text(
      MARGIN,
      48,
      `${doc.nodeCount} entities · ${doc.edgeCount} edges · ${doc.roots.length} root(s) · depth ${wire.maxDepthReached} — ${doc.workbookId} on ${doc.profileId}`,
      { size: 10, fill: MUTED },
    ),
  );

  if (doc.nodeCount === 0) {
    parts.push(text(MARGIN, HEADER + 16, "no uixo primitives in this workbook", { size: 12, fill: MUTED }));
  }
  for (const b of wire.boxes) parts.push(box(b));

  parts.push(relations.svg);
  parts.push(classes.svg);

  if (doc.cycleBroken.length > 0) {
    parts.push(
      text(MARGIN, total - 8, `${doc.cycleBroken.length} entity(ies) reachable only by breaking a cycle`, {
        size: 10,
        fill: "#b3261e",
      }),
    );
  }

  parts.push(`</svg>`);
  parts.push("");

  return {
    bytes: new TextEncoder().encode(parts.join("\n")),
    contentType: "image/svg+xml",
    filename: "uixo-component-tree.svg",
  };
}
