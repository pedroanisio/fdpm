/**
 * `kc:LayerMapRenderer` — layer depth and corpus coverage, as one SVG.
 *
 * The question this answers and the other two cannot: *is this cartridge
 * shaped like a practitioner or like a textbook?* GENERATOR.md's claim is that
 * the six layers are the shape of what deliberate practice deposits, so a
 * cartridge heavy in L1/L2 and empty in L4/L5 has harvested facts and no
 * expertise. A bar per layer against its floor shows that in one glance; the
 * same information as a table reads as six unrelated numbers.
 *
 * Floors drawn as a rule rather than implied by colour: L4 has an explicit
 * minimum of 8 in Pass 6, L5 an implicit minimum of 1. Bars under their floor
 * are marked, and the mark is a hatch as well as a hue so the chart survives
 * being printed or read by someone who cannot separate the two colours.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { buildModel } from "./_model.js";

const W = 720;
const ROW_H = 34;
const PAD = 24;
const LABEL_W = 132;
const BAR_MAX = W - LABEL_W - PAD * 2 - 60;

/** Pass-6 floors. L0–L3 have none stated; L4 is 8, L5 is 1. */
const FLOORS: Record<string, number> = { "L4 · Diagnostics": 8, "L5 · Judgement": 1 };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderLayerMap(input: RendererInput): RendererOutput {
  const m = buildModel(input.primitives, input.relations);
  const rows = m.layers.map((l) => ({
    label: l.label,
    count: l.items.length,
    floor: FLOORS[l.label] ?? 0,
    cited: l.items.filter((i) => i.citations.length > 0).length,
  }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.count, r.floor)));
  const height = PAD * 2 + 44 + rows.length * ROW_H + 56;

  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">`,
    "<defs>",
    '<pattern id="under" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">',
    '<rect width="6" height="6" fill="#b45309"/><rect width="3" height="6" fill="#f59e0b"/>',
    "</pattern>",
    "</defs>",
    `<rect width="${W}" height="${height}" fill="#ffffff"/>`,
    `<text x="${PAD}" y="${PAD + 14}" font-size="15" font-weight="600">Layer depth — ${esc(
      m.cartridge ? String(m.cartridge.field_values["cartridge_id"] ?? "") : "cartridge",
    )}</text>`,
    `<text x="${PAD}" y="${PAD + 32}" fill="#6b7280">Bars show rows per layer; the vertical rule is the Pass-6 floor. Hatched bars are under it.</text>`,
  ];

  rows.forEach((r, i) => {
    const y = PAD + 48 + i * ROW_H;
    const barW = Math.round((r.count / max) * BAR_MAX);
    const under = r.floor > 0 && r.count < r.floor;
    const fill = under ? "url(#under)" : r.count === 0 ? "#e5e7eb" : "#2c5ca8";
    svg.push(
      `<text x="${PAD}" y="${y + 14}" fill="#111827">${esc(r.label)}</text>`,
      `<rect x="${PAD + LABEL_W}" y="${y + 3}" width="${Math.max(barW, 1)}" height="16" fill="${fill}" rx="2"/>`,
      `<text x="${PAD + LABEL_W + Math.max(barW, 1) + 8}" y="${y + 16}" fill="#374151">${r.count}` +
        `${r.cited < r.count ? ` (${r.count - r.cited} uncited)` : ""}</text>`,
    );
    if (r.floor > 0) {
      const fx = PAD + LABEL_W + Math.round((r.floor / max) * BAR_MAX);
      svg.push(
        `<line x1="${fx}" y1="${y}" x2="${fx}" y2="${y + 22}" stroke="#b45309" stroke-width="1.5" stroke-dasharray="3 2"/>`,
      );
    }
  });

  const h = m.harvest;
  const footY = PAD + 48 + rows.length * ROW_H + 22;
  svg.push(
    `<text x="${PAD}" y="${footY}" fill="#6b7280">` +
      `Harvest ${h.total} · retained ${h.retained} · discarded ${h.discarded} · ` +
      `discard rate ${h.discardRate === null ? "n/a" : `${(h.discardRate * 100).toFixed(0)}%`}` +
      `${h.discardRate !== null && h.discardRate < 0.5 ? " (below the 50% floor)" : ""}</text>`,
    `<text x="${PAD}" y="${footY + 18}" fill="#6b7280">` +
      `Sources ${m.sources.length} · declared gaps ${m.gaps.length} · unreconciled conflicts ${m.conflicts.length}` +
      `${m.uncited.length > 0 ? ` · ${m.uncited.length} UNCITED claims` : ""}</text>`,
    "</svg>",
  );

  return {
    bytes: new TextEncoder().encode(svg.join("\n")),
    contentType: "image/svg+xml",
    filename: "layer-map.svg",
  };
}
