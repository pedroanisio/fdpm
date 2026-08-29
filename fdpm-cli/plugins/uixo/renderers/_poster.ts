/**
 * One poster layout, two rasterisations.
 *
 * The first version of the visual pair drew the containment forest as
 * nested boxes and nothing else. On the reference document that produced
 * 118 identical grey pills stacked 15,000 pixels tall — a picture that
 * carried less than the markdown outline and took a hundred times the
 * space. The failure was not the drawing, it was the choice of subject:
 * a document whose payload is a colour system, a set of breakpoints and
 * an accessibility audit was rendered as an undifferentiated tree.
 *
 * So the poster has bands, and each band shows something that is actually
 * visual:
 *
 *  - **Palette** — the colours, drawn. This is the band that makes a
 *    design document worth looking at rather than reading.
 *  - **Breakpoints** — the declared widths as a scale, so the gaps and
 *    overlaps between them are visible instead of arithmetic.
 *  - **Findings** — severity chips, because an audit result is a status
 *    and a status is a colour.
 *  - **Structure** — the containment forest, but only the parts that
 *    *are* structure: roots with children nest as boxes; roots without
 *    are a flat list and are drawn as a compact class-grouped strip
 *    rather than 118 pills pretending to be a hierarchy.
 *  - **Census** — edge properties and classes as proportional bars.
 *
 * Geometry is computed once here as typed items; `component_tree.ts`
 * emits them as vectors and `component_sheet.ts` paints them as pixels.
 * Neither owns a coordinate, so the bitmap cannot disagree with its own
 * vector. Layout is measure-then-place: a painter that discovers its
 * extent as it goes is a painter that clips, and clipping is the defect
 * neither format reports.
 */

import type { DocumentView, NodeView } from "./_model.js";
import {
  byClass,
  colorTokens,
  findings,
  present,
  shortClass,
  type Tone,
} from "./_present.js";
import { boxCaption, wireframeLayout, type WireBox } from "./_wireframe.js";

export type PosterItem =
  | { kind: "title"; x: number; y: number; text: string; size: number }
  | { kind: "label"; x: number; y: number; text: string; size: number; tone: Tone | "fg" }
  | { kind: "rule"; x: number; y: number; w: number; weight: number }
  | {
      kind: "swatch";
      x: number;
      y: number;
      w: number;
      h: number;
      hex: string;
      name: string;
      css?: string;
    }
  | { kind: "box"; x: number; y: number; w: number; h: number; depth: number; caption: string }
  | { kind: "chip"; x: number; y: number; w: number; h: number; text: string; tone: Tone }
  | { kind: "bar"; x: number; y: number; w: number; h: number; label: string; value: string };

export interface Poster {
  width: number;
  height: number;
  items: PosterItem[];
}

const PAD = 28;
const BAND_GAP = 26;

/** ~6.1px per character at 11px in a system sans; the raster face is exact. */
const approxWidth = (text: string, size: number): number => text.length * size * 0.55;
const clip = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(max - 1, 0))}…`;

export function posterLayout(doc: DocumentView, width = 1200): Poster {
  const items: PosterItem[] = [];
  const inner = width - 2 * PAD;
  let y = PAD;

  const band = (label: string): void => {
    y += BAND_GAP;
    items.push({ kind: "label", x: PAD, y, text: label.toUpperCase(), size: 10, tone: "muted" });
    y += 6;
    items.push({ kind: "rule", x: PAD, y, w: inner, weight: 1.5 });
    y += 14;
  };

  // ── Header ──
  items.push({ kind: "title", x: PAD, y: y + 22, text: "UIXO document", size: 26 });
  y += 30;
  items.push({
    kind: "label",
    x: PAD,
    y: y + 12,
    text: `${doc.workbookId} · ${doc.profileId}`,
    size: 11,
    tone: "muted",
  });
  y += 20;
  const metrics: [string, number][] = [
    ["entities", doc.nodeCount],
    ["edges", doc.edgeCount],
    ["roots", doc.roots.length],
    ["classes", doc.classCensus.length],
    ["properties", doc.relationCensus.length],
  ];
  metrics.forEach(([label, value], i) => {
    const x = PAD + i * 132;
    items.push({ kind: "label", x, y: y + 10, text: label.toUpperCase(), size: 8, tone: "muted" });
    items.push({ kind: "title", x, y: y + 32, text: String(value), size: 22 });
  });
  y += 40;

  // ── Palette ──
  const tokens = colorTokens(doc);
  if (tokens.length > 0) {
    band(`palette — ${tokens.length} colours`);
    const cellW = 132;
    const cellH = 58;
    const gap = 10;
    const perRow = Math.max(Math.floor((inner + gap) / (cellW + gap)), 1);
    tokens.forEach((t, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const swatch: PosterItem = {
        kind: "swatch",
        x: PAD + col * (cellW + gap),
        y: y + row * (cellH + 30),
        w: cellW,
        h: cellH,
        hex: t.hex,
        name: clip(t.cssName ?? t.name, 20),
      };
      if (t.set !== undefined) swatch.css = t.set;
      items.push(swatch);
    });
    y += Math.ceil(tokens.length / perRow) * (cellH + 30);
  }

  // ── Breakpoints ──
  const breakpoints = [...doc.nodes.values()]
    .filter((n) => /Breakpoint$/.test(n.className))
    .map((n) => {
      const p = present(doc, n);
      const spec = p.facts.find((f) => f.key === "spec");
      const nums = new Map<string, number>();
      if (spec?.value.kind === "group") {
        for (const e of spec.value.entries) {
          if (e.value.kind === "measure") nums.set(e.key, Number(e.value.text));
        }
      }
      // `maxWidthPx` bounds the range. `contentMaxWidthPx` caps the
      // content column INSIDE the range and is often smaller than the
      // minimum — reading it as an upper bound drew the topmost
      // breakpoint backwards, which looked like a layout bug and was
      // actually a wrong question asked of the data.
      return {
        name: n.label ?? n.entityId,
        min: nums.get("minWidthPx") ?? 0,
        max: nums.get("maxWidthPx") ?? 0,
      };
    })
    .filter((b) => b.min > 0 || b.max > 0)
    .sort((a, b) => a.min - b.min);

  if (breakpoints.length > 0) {
    band(`breakpoints — ${breakpoints.length}`);
    const ceiling = Math.max(...breakpoints.map((b) => Math.max(b.min, b.max)), 1) * 1.12;
    const trackX = PAD + 150;
    const trackW = inner - 150 - 70;
    for (const bp of breakpoints) {
      const x0 = trackX + (bp.min / ceiling) * trackW;
      // An open-ended band runs to the end of the track; a closed one
      // stops at its maximum. Both are drawn, so a gap between two
      // breakpoints is visible rather than arithmetic.
      const x1 = bp.max > 0 ? trackX + (bp.max / ceiling) * trackW : trackX + trackW;
      items.push({ kind: "label", x: PAD, y: y + 11, text: clip(bp.name, 22), size: 10, tone: "fg" });
      items.push({
        kind: "bar",
        x: x0,
        y,
        w: Math.max(x1 - x0, 3),
        h: 14,
        label: "",
        value: bp.max > 0 ? `${bp.min}-${bp.max}` : `${bp.min}+`,
      });
      y += 22;
    }
  }

  // ── Findings ──
  const flagged = findings(doc);
  if (flagged.length > 0) {
    band(`findings — ${flagged.length}`);
    let x = PAD;
    const h = 22;
    for (const f of flagged) {
      const text = clip(`${f.severity ?? f.tone}: ${f.name}`, 42);
      const w = approxWidth(text, 10) + 18;
      if (x + w > PAD + inner) {
        x = PAD;
        y += h + 6;
      }
      items.push({ kind: "chip", x, y, w, h, text, tone: f.tone });
      x += w + 6;
    }
    y += h + 4;
  }

  // ── Structure ──
  // Only roots that actually nest. A root with no children is a record,
  // not a hierarchy, and drawing 100 of them as boxes was what made the
  // first version a wall of pills.
  const nesting = doc.roots.filter((r) => (doc.nodes.get(r)?.children.length ?? 0) > 0);
  const flat = doc.roots.filter((r) => (doc.nodes.get(r)?.children.length ?? 0) === 0);

  if (nesting.length > 0) {
    band(`structure — ${nesting.length} tree(s), depth ${maxDepth(doc)}`);
    const sub: DocumentView = { ...doc, roots: nesting };
    const wire = wireframeLayout(sub, { width, top: y });
    for (const b of wire.boxes) items.push(boxItem(b));
    y = wire.height;
  }

  if (flat.length > 0) {
    band(`standalone entities — ${flat.length}`);
    const groups = new Map<string, NodeView[]>();
    for (const id of flat) {
      const n = doc.nodes.get(id)!;
      groups.set(n.className, [...(groups.get(n.className) ?? []), n]);
    }
    const ordered = [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    for (const [className, nodes] of ordered) {
      items.push({
        kind: "label",
        x: PAD,
        y: y + 11,
        text: `${shortClass(className)} (${nodes.length})`,
        size: 10,
        tone: "muted",
      });
      let x = PAD + 190;
      for (const n of nodes) {
        const text = clip(n.label ?? n.entityId, 26);
        const w = approxWidth(text, 10) + 16;
        if (x + w > PAD + inner) {
          x = PAD + 190;
          y += 22;
        }
        items.push({ kind: "chip", x, y, w, h: 18, text, tone: "muted" });
        x += w + 5;
      }
      y += 26;
    }
  }

  // ── Census ──
  band("census");
  const census = (title: string, rows: { label: string; count: number }[]): void => {
    if (rows.length === 0) return;
    items.push({ kind: "label", x: PAD, y: y + 10, text: title.toUpperCase(), size: 10, tone: "muted" });
    y += 16;
    const shown = rows.slice(0, 18);
    const max = Math.max(...shown.map((r) => r.count), 1);
    const barX = PAD + 230;
    const barMax = inner - 230 - 40;
    for (const row of shown) {
      items.push({ kind: "label", x: PAD, y: y + 9, text: clip(row.label, 36), size: 9.5, tone: "fg" });
      items.push({
        kind: "bar",
        x: barX,
        y: y + 1,
        w: Math.max((row.count / max) * barMax, 1),
        h: 8,
        label: "",
        value: String(row.count),
      });
      y += 14;
    }
    if (rows.length > shown.length) {
      items.push({
        kind: "label",
        x: PAD,
        y: y + 9,
        text: `+ ${rows.length - shown.length} more`,
        size: 9,
        tone: "muted",
      });
      y += 14;
    }
    y += 8;
  };
  census(
    "edges by property",
    doc.relationCensus.map((r) => ({ label: r.property, count: r.count })),
  );
  census(
    "classes in use",
    doc.classCensus.map((c) => ({ label: c.className, count: c.count })),
  );

  if (doc.nodeCount === 0) {
    items.push({
      kind: "label",
      x: PAD,
      y: y + 14,
      text: "no uixo primitives in this workbook",
      size: 12,
      tone: "muted",
    });
    y += 24;
  }

  return { width, height: y + PAD, items };
}

function boxItem(b: WireBox): PosterItem {
  return {
    kind: "box",
    x: b.x,
    y: b.y,
    w: b.width,
    h: b.height,
    depth: b.depth,
    caption: boxCaption(b),
  };
}

const maxDepth = (doc: DocumentView): number =>
  Math.max(...[...doc.nodes.values()].map((n) => n.depth), 0);

/** Classes present, for a caller that wants the poster's own cut. */
export const posterClassCensus = byClass;
