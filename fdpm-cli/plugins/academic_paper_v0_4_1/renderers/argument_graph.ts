/**
 * The paper's argument, drawn.
 *
 * `profile:academic-paper:0.4.1` encodes an argument, not just a document:
 * a claim may derive from another, read against another, or be superseded by
 * a later formulation; evidence supports claims; findings rest on evidence
 * and test hypotheses. Five relation types carry all of that, and no renderer
 * read any of them — the prose views list claims as bullets, which is exactly
 * the shape that hides whether a claim is load-bearing or orphaned.
 *
 * This draws it. Claims are ranked by how far they sit from an unsupported
 * premise, so the layout itself says which claims rest on which, and the edge
 * styles distinguish support from rebuttal. A reviewer looking for the weak
 * joint in an argument is looking for a claim with no inbound evidence and a
 * counter-reading, and that is visible here at a glance.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { buildPaperModel } from "./paper_document.js";

interface Prim {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

const PAD = 28;
const NODE_W = 210;
const NODE_H = 62;
const COL_GAP = 96;
const ROW_GAP = 22;
const HEADER = 64;
const LEGEND_H = 30;

/** XML text escaping. Attribute and text content share one rule here. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const str = (p: Prim | undefined, k: string): string => {
  const v = p?.field_values?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

/** The sentence a node shows: whichever field the type uses for its text. */
function label(p: Prim): string {
  return (
    str(p, "statement") ||
    str(p, "summary") ||
    str(p, "title") ||
    str(p, "name") ||
    str(p, "id") ||
    p.id
  );
}

/** Break a label into at most `lines` rows of roughly `cpl` characters. */
function wrap(text: string, cpl: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length === 0) line = w;
    else if (line.length + 1 + w.length <= cpl) line += ` ${w}`;
    else {
      out.push(line);
      line = w;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && line.length > 0) out.push(line);
  if (out.length === lines && (words.join(" ").length > out.join(" ").length)) {
    const last = out[lines - 1]!;
    out[lines - 1] = `${last.slice(0, Math.max(0, cpl - 1)).trimEnd()}…`;
  }
  return out.length > 0 ? out : [""];
}

interface Node {
  prim: Prim;
  kind: "claim" | "evidence" | "finding";
  col: number;
  row: number;
  x: number;
  y: number;
}

/**
 * Rank a claim by its depth in the derivation chain.
 *
 * A claim that derives from nothing is a premise and sits in column 0; a
 * claim that derives from another sits one column to its right. The walk is
 * depth-bounded by the node count, so a cycle in the data — which the profile
 * does not forbid — terminates instead of hanging the renderer.
 */
function depthOf(id: string, derivedFrom: Map<string, Prim[]>, budget: number): number {
  let depth = 0;
  let frontier = [id];
  const seen = new Set<string>([id]);
  while (depth < budget) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const parent of derivedFrom.get(cur) ?? []) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        next.push(parent.id);
      }
    }
    if (next.length === 0) return depth;
    frontier = next;
    depth += 1;
  }
  return depth;
}

export function renderArgumentGraph(input: RendererInput): RendererOutput {
  const model = buildPaperModel(input.primitives as never, input.relations as never);
  const prims = input.primitives as unknown as Prim[];
  const claims = prims.filter((p) => p.type_id === "acad:Claim");
  const evidence = prims.filter((p) => p.type_id === "acad:Evidence");
  const findings = prims.filter((p) => p.type_id === "acad:Finding");

  const findings_out: { severity: "info" | "warning"; code: string; message: string }[] = [];
  if (claims.length === 0) {
    findings_out.push({
      severity: "warning",
      code: "acad.argument.empty",
      message:
        "No claims in this workbook, so there is no argument to draw. Add acad:Claim primitives and the edges between them.",
    });
  }

  /* Columns: evidence first, then claims by derivation depth, findings last.
     Evidence is the ground the argument stands on, so it reads left to right
     as premise → claim → what the paper concluded. */
  const budget = claims.length + 1;
  const claimDepth = new Map(claims.map((c) => [c.id, depthOf(c.id, model.derivedFrom, budget)]));
  const maxDepth = Math.max(0, ...claimDepth.values());

  const nodes: Node[] = [];
  const perColumn = new Map<number, number>();
  const place = (prim: Prim, kind: Node["kind"], col: number): void => {
    const row = perColumn.get(col) ?? 0;
    perColumn.set(col, row + 1);
    nodes.push({
      prim,
      kind,
      col,
      row,
      x: PAD + col * (NODE_W + COL_GAP),
      y: HEADER + row * (NODE_H + ROW_GAP),
    });
  };

  for (const e of evidence) place(e, "evidence", 0);
  for (const c of claims) place(c, "claim", 1 + (claimDepth.get(c.id) ?? 0));
  for (const f of findings) place(f, "finding", 2 + maxDepth);

  const byId = new Map(nodes.map((n) => [n.prim.id, n]));
  const columns = 2 + maxDepth + (findings.length > 0 ? 1 : 0);
  const rows = Math.max(1, ...perColumn.values());
  const width = PAD * 2 + columns * NODE_W + Math.max(0, columns - 1) * COL_GAP;
  const height = HEADER + rows * (NODE_H + ROW_GAP) + LEGEND_H + PAD;

  /* Edge styles carry the argument's semantics: a solid arrow is support, a
     dashed one derivation, and a rebuttal is drawn in the warning colour so
     that "something reads against this" is visible without following a line
     to its label. */
  const EDGE = {
    supports: { stroke: "#1D9E75", dash: "", label: "supports" },
    derives: { stroke: "#378ADD", dash: "6 4", label: "derives from" },
    counters: { stroke: "#D85A30", dash: "2 4", label: "counters" },
    supersedes: { stroke: "#8B5CF6", dash: "8 3", label: "supersedes" },
    tests: { stroke: "#BA7517", dash: "1 5", label: "tests" },
  } as const;

  const edges: string[] = [];
  const link = (fromId: string, toId: string, style: keyof typeof EDGE): void => {
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (a === undefined || b === undefined) return;
    const s = EDGE[style];
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    edges.push(
      `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} C${mid.toFixed(1)} ${y1.toFixed(1)}, ${mid.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${s.stroke}" stroke-width="1.6"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} marker-end="url(#a-${style})"><title>${esc(s.label)}</title></path>`,
    );
  };

  for (const e of evidence) {
    for (const c of model.evidenceFor.get("") ?? []) void c;
  }
  for (const [claimId, list] of model.evidenceFor) {
    for (const e of list) link(e.id, claimId, "supports");
  }
  for (const [claimId, parents] of model.derivedFrom) {
    for (const parent of parents) link(parent.id, claimId, "derives");
  }
  for (const [claimId, counters] of model.counteredBy) {
    for (const c of counters) link(claimId, c.id, "counters");
  }
  for (const [claimId, supersedors] of model.supersededBy) {
    for (const s of supersedors) link(claimId, s.id, "supersedes");
  }
  for (const [findingId, list] of model.findingEvidence) {
    for (const e of list) link(e.id, findingId, "supports");
  }
  for (const [findingId, list] of model.findingTests) {
    for (const c of list) link(c.id, findingId, "tests");
  }

  const FILL = {
    claim: { bg: "#EEF4FC", border: "#378ADD" },
    evidence: { bg: "#EAF6F1", border: "#1D9E75" },
    finding: { bg: "#FDF3E7", border: "#BA7517" },
  } as const;

  const boxes = nodes.map((n) => {
    const f = FILL[n.kind];
    const lines = wrap(label(n.prim), 30, 3);
    const text = lines
      .map(
        (l, i) =>
          `<tspan x="${(n.x + 12).toFixed(1)}" y="${(n.y + 24 + i * 14).toFixed(1)}">${esc(l)}</tspan>`,
      )
      .join("");
    return [
      `<g>`,
      `<title>${esc(`${n.kind}: ${label(n.prim)}`)}</title>`,
      `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="7" fill="${f.bg}" stroke="${f.border}" stroke-width="1.4"/>`,
      `<text font-size="11" fill="#1B2733">${text}</text>`,
      `</g>`,
    ].join("");
  });

  const legend = Object.entries(EDGE)
    .map(([key, s], i) => {
      const x = PAD + i * 132;
      const y = height - PAD + 4;
      return `<g><line x1="${x}" y1="${y - 4}" x2="${x + 22}" y2="${y - 4}" stroke="${s.stroke}" stroke-width="1.6"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/><text x="${x + 28}" y="${y}" font-size="10" fill="#4A5A6A">${esc(s.label)}</text></g>`;
    })
    .join("");

  const markers = Object.entries(EDGE)
    .map(
      ([key, s]) =>
        `<marker id="a-${key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="${s.stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
    )
    .join("");

  const title = str(model.paper, "title") || input.workbookId;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="sans-serif" role="img" aria-label="${esc(`Argument graph for ${title}`)}">
<title>${esc(`${title} — argument`)}</title>
<defs>${markers}</defs>
<rect width="${width}" height="${height}" fill="#FFFFFF"/>
<text x="${PAD}" y="30" font-size="16" fill="#1B2733">${esc(title)}</text>
<text x="${PAD}" y="48" font-size="11" fill="#4A5A6A">${esc(`${claims.length} claims · ${evidence.length} evidence · ${findings.length} findings`)}</text>
${edges.join("\n")}
${boxes.join("\n")}
${legend}
</svg>
`;

  return {
    bytes: new TextEncoder().encode(svg),
    contentType: "image/svg+xml",
    filename: `${input.workbookId}-argument.svg`,
    ...(findings_out.length > 0 ? { findings: findings_out as never } : {}),
  };
}
