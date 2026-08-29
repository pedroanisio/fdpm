/**
 * One layout, two rasterisations.
 *
 * A UI component tree drawn as nested boxes *is* a wireframe — which is
 * why this is the view worth having for an interaction ontology, and why
 * the SVG and the PNG must be the same drawing rather than two drawings
 * that happen to resemble each other. Geometry is computed once here;
 * `component_tree.ts` emits it as vectors and `component_sheet.ts` paints
 * it as pixels, and neither owns a coordinate.
 *
 * Layout is measure-then-place, in that order. A painter that discovers
 * its own extent as it goes is a painter that clips, and clipping is the
 * defect a screenshot cannot show you — an SVG does not complain about
 * ink outside its viewBox and a raster silently drops it.
 *
 * Nothing here reads a clock, a locale or an environment, so the same
 * document lays out identically on every machine and every run.
 */

import type { DocumentView, NodeView } from "./_model.js";

export interface WireBox {
  id: string;
  className: string;
  /** Label, else the document's own entity id. */
  name: string;
  entityId: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Height of the caption strip at the top of the box. */
  headerHeight: number;
  /** Children drawn inside this box. */
  childCount: number;
  /** Children NOT drawn, because the box ran out of usable width. */
  elidedCount: number;
  /** Number of non-tree out-edges, shown as a tag on the header. */
  crossCount: number;
}

export interface WireframeLayout {
  width: number;
  height: number;
  boxes: WireBox[];
  /** Depth at which nesting stopped and descendants were counted instead. */
  maxDepthReached: number;
}

export interface WireframeOptions {
  /** Outer canvas width. Inner widths derive from it. */
  width?: number;
  /** Top offset for a caller that draws its own header band. */
  top?: number;
}

export const HEADER_H = 26;
export const PAD = 9;
export const GAP = 6;
export const MARGIN = 20;
/**
 * A box narrower than this cannot hold a legible caption, so nesting
 * stops and the remaining descendants are counted on the parent instead.
 * Eliding is reported per box and in `maxDepthReached`; a view that
 * quietly dropped them would misrepresent the document.
 */
export const MIN_BOX_W = 108;

interface Measured {
  node: NodeView;
  height: number;
  children: Measured[];
  elided: number;
}

function measure(doc: DocumentView, id: string, width: number, seen: Set<string>): Measured {
  const node = doc.nodes.get(id)!;
  seen.add(id);
  const innerWidth = width - 2 * PAD;
  const kids = node.children.filter((c) => !seen.has(c));

  if (innerWidth < MIN_BOX_W || kids.length === 0) {
    return {
      node,
      height: HEADER_H + (kids.length > 0 ? PAD : 0) + PAD,
      children: [],
      elided: kids.length,
    };
  }

  const children = kids.map((c) => measure(doc, c, innerWidth, seen));
  const stack = children.reduce((h, c) => h + c.height, 0) + GAP * (children.length - 1);
  return { node, height: HEADER_H + PAD + stack + PAD, children, elided: 0 };
}

function place(m: Measured, x: number, y: number, width: number, out: WireBox[]): void {
  out.push({
    id: m.node.id,
    className: m.node.className,
    name: m.node.label ?? m.node.entityId,
    entityId: m.node.entityId,
    depth: m.node.depth,
    x,
    y,
    width,
    height: m.height,
    headerHeight: HEADER_H,
    childCount: m.children.length,
    elidedCount: m.elided,
    crossCount: m.node.crossLinks.reduce((n, l) => n + l.targets.length, 0),
  });

  let cursor = y + HEADER_H + PAD;
  for (const child of m.children) {
    place(child, x + PAD, cursor, width - 2 * PAD, out);
    cursor += child.height + GAP;
  }
}

/**
 * Lay the document's forest out as nested boxes.
 *
 * The traversal carries its own visited set, so a cyclic document
 * produces a finite drawing instead of a hang — the same bound
 * `readDocument` applies to its pre-order walk, applied again here
 * because a caller may hand in a hand-built `DocumentView`.
 */
export function wireframeLayout(
  doc: DocumentView,
  opts: WireframeOptions = {},
): WireframeLayout {
  const width = opts.width ?? 1120;
  const top = opts.top ?? MARGIN;
  const boxWidth = width - 2 * MARGIN;

  const boxes: WireBox[] = [];
  const seen = new Set<string>();
  let y = top;

  for (const root of doc.roots) {
    if (seen.has(root)) continue;
    const measured = measure(doc, root, boxWidth, seen);
    place(measured, MARGIN, y, boxWidth, boxes);
    y += measured.height + GAP * 2;
  }

  const maxDepthReached = boxes.reduce((d, b) => Math.max(d, b.depth), 0);
  return { width, height: y - GAP * 2 + MARGIN, boxes, maxDepthReached };
}

/**
 * The header caption for a box: class, name, and the counts that would
 * otherwise be invisible — children the box could not nest, and edges
 * that leave the tree.
 */
export function boxCaption(box: WireBox): string {
  const parts = [box.className.replace(/^uixo(css|a11y|motion)?:/, ""), box.name];
  const tags: string[] = [];
  if (box.elidedCount > 0) tags.push(`+${box.elidedCount} nested`);
  if (box.crossCount > 0) tags.push(`${box.crossCount} links`);
  return tags.length > 0 ? `${parts.join(" · ")}  (${tags.join(", ")})` : parts.join(" · ");
}
