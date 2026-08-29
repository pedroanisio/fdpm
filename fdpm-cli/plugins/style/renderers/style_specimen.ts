/**
 * `image/svg+xml` — one specimen plate per style.
 *
 * A specimen is not an illustration of the style; it is the measurable
 * part of the style, laid out so the measurements sit next to the thing
 * they measure. The palette is drawn, and each chip carries its own hex.
 * Each WCAG pair is drawn as its two colours actually combine, with the
 * measured ratio and the required minimum printed on it — so a failing
 * pair is visible as a failure, not merely reported as one. The stroke
 * specimen is drawn at the declared weight. The rule census is a bar
 * whose segments are proportional to the counts.
 *
 * The layout is computed, never fixed: height accumulates from what the
 * registry actually holds, so the canvas fits the content instead of
 * clipping it. Nothing here reads a clock, a locale or an environment
 * variable, so two renders of one workbook are byte-identical — the
 * property the suite asserts and the reason this output can be committed
 * and diffed.
 *
 * Fonts are named as generic families only. An SVG that names an
 * installed font renders differently on the next machine, and a specimen
 * that changes shape between viewers is not a specimen.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { readRegistry, readableInkOn, type StyleView } from "./_model.js";

/** XML text escape. Every author-supplied string passes through it. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A hex safe to use as a paint value; anything else falls back. */
function paint(hex: string | undefined, fallback: string): string {
  return hex !== undefined && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)
    ? hex
    : fallback;
}

const SANS = "ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, monospace";

// Plate geometry. Every number here is a layout constant, not a guess:
// the accumulator below derives every y from them.
const W = 900;
const PAD = 28;
const SWATCH_W = 100;
const SWATCH_H = 76;
const SWATCH_GAP = 10;
const PER_ROW = Math.floor((W - 2 * PAD + SWATCH_GAP) / (SWATCH_W + SWATCH_GAP));
const PAIR_W = 168;
const PAIR_H = 72;
const PAIRS_PER_ROW = Math.floor((W - 2 * PAD + SWATCH_GAP) / (PAIR_W + SWATCH_GAP));

const INK = "#16181d";
const MUTED = "#6b7280";
const LINE = "#d8dbe2";
const GROUND = "#ffffff";
const PASS = "#1b7f4b";
const FAIL = "#b3261e";

/** Rows needed for `count` cells at `perRow` per row. */
const rows = (count: number, perRow: number): number =>
  count === 0 ? 0 : Math.ceil(count / Math.max(perRow, 1));

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
    `font-size="${opts.size ?? 12}"`,
    `fill="${opts.fill ?? INK}"`,
  ];
  if (opts.weight !== undefined) attrs.push(`font-weight="${opts.weight}"`);
  if (opts.anchor !== undefined) attrs.push(`text-anchor="${opts.anchor}"`);
  return `<text ${attrs.join(" ")}>${esc(content)}</text>`;
}

/** Truncate to `max` characters so a long label cannot run out of its box. */
const clip = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(max - 1, 0))}…`;

/**
 * The height a plate will occupy. Called before emitting anything, so the
 * root `viewBox` is correct on the first pass rather than patched after.
 */
function plateHeight(style: StyleView): number {
  let h = 0;
  h += 62; // title block
  h += 22 + rows(style.palette.length, PER_ROW) * (SWATCH_H + SWATCH_GAP + 26);
  if (style.forbiddenColors.length > 0) {
    h += 22 + rows(style.forbiddenColors.length, PER_ROW) * (SWATCH_H + SWATCH_GAP + 26);
  }
  if (style.tokens.contrastPairs.length > 0) {
    h += 22 + rows(style.tokens.contrastPairs.length, PAIRS_PER_ROW) * (PAIR_H + SWATCH_GAP);
  }
  h += 22 + 46; // stroke specimen
  h += 22 + 34; // rule census bar
  h += 22 + rows(style.grammar.length, 5) * 30; // grammar badges
  return h + 24;
}

function plate(style: StyleView, top: number): string {
  const g: string[] = [];
  let y = top;
  g.push(`<g data-plate="${esc(style.styleId)}">`);

  // ── Title ──
  g.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${INK}" stroke-width="2"/>`);
  y += 26;
  g.push(text(PAD, y, `${style.name}  ${style.code}`, { size: 19, weight: 700 }));
  g.push(
    text(W - PAD, y, `${style.period.label}`, { size: 12, fill: MUTED, anchor: "end" }),
  );
  y += 18;
  g.push(
    text(
      PAD,
      y,
      `ornament ${style.ornamentStance} · machine ${style.machineAttitude} · ${style.formFunctionRelation} · ${style.humanRelation}`,
      { size: 11, fill: MUTED },
    ),
  );
  y += 18;

  // ── Palette ──
  const heading = (label: string): void => {
    y += 22;
    g.push(text(PAD, y - 6, label, { size: 10, fill: MUTED, weight: 600 }));
  };
  const chips = (
    entries: { key: string; hex: string; label: string; caption: string }[],
    attr: string,
  ): void => {
    entries.forEach((entry, i) => {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const x = PAD + col * (SWATCH_W + SWATCH_GAP);
      const cy = y + row * (SWATCH_H + SWATCH_GAP + 26);
      const fill = paint(entry.hex, "none");
      const ink = fill === "none" ? MUTED : readableInkOn(fill);
      g.push(
        `<rect ${attr}="${esc(entry.key)}" x="${x}" y="${cy}" width="${SWATCH_W}" height="${SWATCH_H}" rx="4" fill="${fill}" stroke="${LINE}"/>`,
      );
      if (fill !== "none") {
        g.push(text(x + 8, cy + SWATCH_H - 10, entry.hex, { size: 10, family: MONO, fill: ink }));
      } else {
        g.push(text(x + 8, cy + SWATCH_H - 10, "categorical", { size: 10, family: MONO, fill: MUTED }));
      }
      g.push(text(x, cy + SWATCH_H + 14, clip(entry.label, 16), { size: 11, weight: 600 }));
      g.push(text(x, cy + SWATCH_H + 26, clip(entry.caption, 20), { size: 10, fill: MUTED }));
    });
    y += rows(entries.length, PER_ROW) * (SWATCH_H + SWATCH_GAP + 26);
  };

  heading("PALETTE");
  chips(
    style.palette.map((p) => ({ key: p.name, hex: p.hex, label: p.name, caption: p.role })),
    "data-swatch",
  );

  if (style.forbiddenColors.length > 0) {
    heading("FORBIDDEN");
    chips(
      style.forbiddenColors.map((c) => ({
        key: c.name,
        hex: c.hex ?? "",
        label: c.name,
        caption: c.prohibitedBy,
      })),
      "data-forbidden",
    );
  }

  // ── Contrast pairs, drawn as they actually combine ──
  if (style.tokens.contrastPairs.length > 0) {
    heading(
      `CONTRAST — WCAG ${style.tokens.wcagVersion ?? "?"} ${(style.tokens.wcagLevel ?? "").toUpperCase()}`,
    );
    style.tokens.contrastPairs.forEach((p, i) => {
      const col = i % PAIRS_PER_ROW;
      const row = Math.floor(i / PAIRS_PER_ROW);
      const x = PAD + col * (PAIR_W + SWATCH_GAP);
      const cy = y + row * (PAIR_H + SWATCH_GAP);
      const bg = paint(p.backgroundHex, GROUND);
      const fg = paint(p.foregroundHex, MUTED);
      const verdict = p.pass === undefined ? "unresolved" : p.pass ? "pass" : "fail";
      const verdictFill = p.pass === undefined ? MUTED : p.pass ? PASS : FAIL;
      g.push(
        `<rect data-pair="${esc(p.foreground)}-on-${esc(p.background)}" x="${x}" y="${cy}" width="${PAIR_W}" height="${PAIR_H}" rx="4" fill="${bg}" stroke="${LINE}"/>`,
      );
      g.push(text(x + 10, cy + 24, clip(`${p.foreground} on ${p.background}`, 24), { size: 12, fill: fg, weight: 600 }));
      g.push(text(x + 10, cy + 40, clip(p.usage, 24), { size: 10, fill: fg }));
      g.push(
        text(
          x + 10,
          cy + 60,
          p.ratio === undefined
            ? "unresolved"
            : `${p.ratio.toFixed(2)}:1 / ${(p.required ?? 0).toFixed(1)} min`,
          { size: 10, family: MONO, fill: fg },
        ),
      );
      g.push(
        `<rect x="${x + PAIR_W - 46}" y="${cy + 8}" width="38" height="14" rx="7" fill="${verdictFill}"/>`,
      );
      g.push(
        text(x + PAIR_W - 27, cy + 19, verdict === "unresolved" ? "n/a" : verdict, {
          size: 9,
          fill: "#ffffff",
          anchor: "middle",
          weight: 700,
        }),
      );
    });
    y += rows(style.tokens.contrastPairs.length, PAIRS_PER_ROW) * (PAIR_H + SWATCH_GAP);
  }

  // ── Stroke specimen, at the declared weight ──
  heading("STROKE");
  {
    const weight = style.tokens.strokeWeight ?? 1;
    const ink = paint(style.palette.find((p) => p.role === "primary")?.hex, INK);
    for (let i = 0; i < 4; i++) {
      const w = Math.max(weight * (i + 1), 0.25);
      const ly = y + 10 + i * 10;
      g.push(
        `<line x1="${PAD}" y1="${ly}" x2="${PAD + 260}" y2="${ly}" stroke="${ink}" stroke-width="${w}"/>`,
      );
      g.push(text(PAD + 272, ly + 3, `${w}px`, { size: 9, family: MONO, fill: MUTED }));
    }
    g.push(
      text(
        PAD + 340,
        y + 24,
        `base unit ${style.tokens.baseUnit ?? "—"}px · stroke ${style.tokens.strokeWeight ?? "—"}px`,
        { size: 11, fill: MUTED },
      ),
    );
    y += 46;
  }

  // ── Rule census ──
  heading("RULES");
  {
    const { defining, strong, advisory } = style.ruleWeights;
    const total = Math.max(defining + strong + advisory, 1);
    const barW = W - 2 * PAD;
    const segs: [number, string, string][] = [
      [defining, FAIL, "defining"],
      [strong, "#8a5a00", "strong"],
      [advisory, MUTED, "advisory"],
    ];
    let x = PAD;
    for (const [count, fill, label] of segs) {
      const w = (count / total) * barW;
      if (w > 0) {
        g.push(`<rect data-weight="${label}" x="${x}" y="${y}" width="${w}" height="12" fill="${fill}"/>`);
      }
      x += w;
    }
    g.push(
      text(PAD, y + 28, `${defining} defining · ${strong} strong · ${advisory} advisory`, {
        size: 11,
        fill: MUTED,
      }),
    );
    y += 34;
  }

  // ── Grammar badges ──
  heading("GRAMMAR");
  {
    const badgeW = Math.floor((W - 2 * PAD - 4 * 8) / 5);
    style.grammar.forEach((section, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = PAD + col * (badgeW + 8);
      const cy = y + row * 30;
      g.push(
        `<rect data-grammar="${esc(section.section)}" x="${x}" y="${cy}" width="${badgeW}" height="22" rx="11" fill="${section.present ? "#f1f3f6" : "none"}" stroke="${LINE}"/>`,
      );
      g.push(
        text(x + badgeW / 2, cy + 15, `${section.section} · ${section.rules.length}`, {
          size: 10,
          anchor: "middle",
          fill: section.present ? INK : MUTED,
        }),
      );
    });
    y += rows(style.grammar.length, 5) * 30;
  }

  g.push(`</g>`);
  return g.join("\n");
}

export function renderStyleSpecimen(input: RendererInput): RendererOutput {
  const registry = readRegistry(input);

  const HEADER = 64;
  const heights = registry.styles.map(plateHeight);
  const total =
    HEADER + heights.reduce((a, b) => a + b, 0) + (registry.styles.length === 0 ? 40 : 0) + PAD;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}" role="img" aria-label="Style registry specimen">`,
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${total}" fill="${GROUND}"/>`);
  parts.push(text(PAD, 34, "Style registry", { size: 22, weight: 700 }));
  parts.push(
    text(
      PAD,
      52,
      `${registry.styles.length} style(s), ${registry.movements.length} movement(s) — ${registry.workbookId} on ${registry.profileId}`,
      { size: 11, fill: MUTED },
    ),
  );

  let y = HEADER;
  registry.styles.forEach((style, i) => {
    parts.push(plate(style, y));
    y += heights[i]!;
  });

  if (registry.styles.length === 0) {
    parts.push(text(PAD, HEADER + 20, "no style:Style primitives in this workbook", {
      size: 13,
      fill: MUTED,
    }));
  }

  parts.push(`</svg>`);
  parts.push("");

  return {
    bytes: new TextEncoder().encode(parts.join("\n")),
    contentType: "image/svg+xml",
    filename: "style-specimen.svg",
  };
}
