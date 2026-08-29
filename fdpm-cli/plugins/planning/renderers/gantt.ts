import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";

/**
 * `image/svg+xml` Gantt renderer.
 *
 * This is a DESCRIPTIVE Gantt: tasks with both `planned_start` and
 * `planned_finish` get a bar; tasks without are listed in an
 * "Unscheduled" footer block. There is no scheduler, no critical-path
 * solver, no resource-leveler. Computed Gantt is Future Work.
 *
 * Output is pure SVG with a single style block; renders in any browser.
 * Color encodes `status`; bar-stroke encodes `executor_kind`. Today's
 * date is drawn as a vertical "now" line.
 *
 * Layout:
 *   row height: 24px
 *   left gutter: 240px (task labels)
 *   right margin: 16px
 *   top margin: 80px (title + axis labels)
 *   bottom margin: 32px + (24px × unscheduled count)
 *   day width: 24px
 *
 * The canvas is sized from the TEXT as well as the timeline. A viewBox
 * derived from the timeline alone is a silent data-loss bug: SVG clips at
 * the viewport, so the title, the axis labels, the gutter labels and the
 * whole unscheduled footer are drawn and then thrown away when they run
 * past `chartWidth`. `textWidth` below is what makes the width honest.
 */

interface ScheduledTask {
  primitive: PrimitiveInstance;
  start: number; // ms since epoch
  end: number;
}

const ROW_HEIGHT = 24;
const LEFT_GUTTER = 240;
const RIGHT_MARGIN = 16;
const TOP_MARGIN = 80;
const BOTTOM_MARGIN = 32;
const DAY_WIDTH = 24;
const MS_PER_DAY = 86_400_000;

/** Where gutter text starts, and how much room it has before the bars. */
const GUTTER_TEXT_X = 8;
const GUTTER_TEXT_WIDTH = LEFT_GUTTER - GUTTER_TEXT_X - 8;

/**
 * Where footer rows start, and the measure they are elided to.
 *
 * The footer is a one-line index of what is NOT on the chart, so a row is
 * bounded rather than allowed to set the width of the whole drawing. A task
 * summary runs to a paragraph; letting one dictate `chartWidth` produces a
 * canvas several thousand units wide that renders as an unreadable smear.
 * The full text is not lost — it rides on the row as a `<title>` tooltip.
 */
const FOOTER_TEXT_X = 16;
const FOOTER_TEXT_WIDTH = 620;

/** Clear space demanded between two adjacent date labels. */
const AXIS_LABEL_GAP = 6;

/** Padding around a label that knocks the grid out from behind itself. */
const KNOCKOUT_PAD = 4;

const STATUS_COLOR: Record<string, string> = {
  Backlog: "#94a3b8",
  Ready: "#3b82f6",
  In_progress: "#10b981",
  Blocked: "#ef4444",
  In_review: "#f59e0b",
  Done: "#6b7280",
  Cancelled: "#374151",
};

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  return (p.field_values as Record<string, unknown>)[key] as T | undefined;
}

function parseIsoDay(s: string | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  // Truncate to UTC midnight for consistent day math.
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/*
 * Text measurement.
 *
 * A renderer that emits SVG as a string never loads a font, so real glyph
 * metrics are not available to it. The layout does not need them — it needs a
 * width the drawing cannot exceed. Every character is therefore charged the
 * widest glyph in its class, and the classes are calibrated against DejaVu
 * Sans, which is what `font-family="sans-serif"` resolves to on Linux and is
 * the widest of the common fallbacks (Arial and Helvetica are narrower, so a
 * bound that holds for DejaVu holds for them too). Anything past Latin-1 —
 * em dashes, the ellipsis, CJK — is charged a full em.
 *
 * The result is an upper bound, so a box sized from it always contains the
 * text. The price of the approximation is some slack on the right, never a
 * clipped glyph, and that is the correct direction to be wrong in: slack is
 * visible and recoverable, clipping destroys content silently.
 */
const NARROW_CHARS = new Set([..."ijltfrI!.,:;'\"`|()[]{}/\\ -"]);
const WIDE_CHARS = new Set([..."ABCDEFGHJKLMNOPQRSTUVWXYZmw@%"]);
/** DejaVu Sans: widest narrow glyph is `"` at 0.47em. */
const ADVANCE_NARROW = 0.48;
/** DejaVu Sans: `W` is 0.99em, `@` 1.08em. */
const ADVANCE_WIDE = 1.05;
/** DejaVu Sans: lowercase and digits sit at 0.63em–0.64em. */
const ADVANCE_TYPICAL = 0.7;
/** DejaVu Sans Bold runs about 8 % wider than the regular face. */
const BOLD_FACTOR = 1.08;

function textWidth(s: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code > 0x00ff) em += 1;
    else if (NARROW_CHARS.has(ch)) em += ADVANCE_NARROW;
    else if (WIDE_CHARS.has(ch)) em += ADVANCE_WIDE;
    else em += ADVANCE_TYPICAL;
  }
  return em * fontSize * (bold ? BOLD_FACTOR : 1);
}

/** `s` cut to `maxWidth` with an ellipsis, or `s` itself when it fits. */
function ellipsize(s: string, fontSize: number, maxWidth: number, bold = false): string {
  if (textWidth(s, fontSize, bold) <= maxWidth) return s;
  const budget = maxWidth - textWidth("…", fontSize, bold);
  if (budget <= 0) return "…";
  let used = 0;
  let kept = "";
  for (const ch of s) {
    const w = textWidth(ch, fontSize, bold);
    if (used + w > budget) break;
    used += w;
    kept += ch;
  }
  return `${kept.trimEnd()}…`;
}

export const renderGantt: RendererFn = (input): RendererOutput => {
  const { primitives, workbookId, profile } = input;
  const tasks = primitives.filter((p) => p.type_id === "plan:Task");

  // Bucket: scheduled vs. unscheduled.
  const scheduled: ScheduledTask[] = [];
  const unscheduled: PrimitiveInstance[] = [];
  for (const t of tasks) {
    const ps = parseIsoDay(fv<string>(t, "planned_start"));
    const pf = parseIsoDay(fv<string>(t, "planned_finish"));
    if (ps !== null && pf !== null && pf >= ps) {
      scheduled.push({ primitive: t, start: ps, end: pf });
    } else {
      unscheduled.push(t);
    }
  }

  // Sort scheduled tasks by start, then end, then id.
  scheduled.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      a.primitive.id.localeCompare(b.primitive.id),
  );

  // X-axis range. If no scheduled tasks, render a 7-day range starting today
  // so the SVG is non-degenerate (the renderer never throws on empty input).
  const todayMs = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;
  const minStart = scheduled.length > 0 ? scheduled[0]!.start : todayMs;
  const maxEnd =
    scheduled.length > 0
      ? Math.max(...scheduled.map((s) => s.end))
      : todayMs + 6 * MS_PER_DAY;
  const totalDays = Math.max(1, Math.round((maxEnd - minStart) / MS_PER_DAY) + 1);

  const barsHeight = Math.max(scheduled.length, 1) * ROW_HEIGHT;
  const timelineWidth = LEFT_GUTTER + DAY_WIDTH * totalDays + RIGHT_MARGIN;

  /* Every string that is drawn outside the gutter, decided before the header
     is written because the header carries the width they have to fit in. */
  const titleText = `${workbookId} — Gantt`;
  const subtitleText = `${scheduled.length} scheduled, ${unscheduled.length} unscheduled · profile ${profile.id} v${profile.version}`;
  const emptyNote = "No tasks have planned_start AND planned_finish set.";
  const footerHeader = `Unscheduled (${unscheduled.length}) — no planned dates`;
  const footerRows = unscheduled.map((t) => {
    const status = fv<string>(t, "status") ?? "?";
    const exec = fv<string>(t, "executor_kind") ?? "?";
    const summary = (fv<string>(t, "summary") ?? fv<string>(t, "name") ?? "").trim();
    const full = `${t.id} [${status}/${exec}] — ${summary}`;
    return { full, shown: ellipsize(full, 11, FOOTER_TEXT_WIDTH) };
  });

  /* Date labels are fixed-width (ISO 8601), so the spacing that keeps two of
     them apart is a constant the loop can be driven by. The old rule aimed at
     ~12 labels regardless of how wide one is, which on a short timeline drew a
     69px label every 24px and printed the axis as a single illegible smear. */
  const axisLabelWidth = textWidth(formatDate(minStart), 10);
  const labelStep = Math.max(
    1,
    Math.ceil((axisLabelWidth + AXIS_LABEL_GAP) / DAY_WIDTH),
    Math.round(totalDays / 12),
  );

  const contentRight = Math.max(
    LEFT_GUTTER + textWidth(titleText, 16, true),
    LEFT_GUTTER + textWidth(subtitleText, 11),
    LEFT_GUTTER + totalDays * DAY_WIDTH + 2 + axisLabelWidth,
    ...(scheduled.length === 0
      ? [LEFT_GUTTER + 8 + textWidth(emptyNote, 10) + KNOCKOUT_PAD]
      : []),
    ...(unscheduled.length > 0
      ? [
          GUTTER_TEXT_X + textWidth(footerHeader, 12, true),
          ...footerRows.map((r) => FOOTER_TEXT_X + textWidth(r.shown, 11)),
        ]
      : []),
  );

  const chartWidth = Math.ceil(Math.max(timelineWidth, contentRight + RIGHT_MARGIN));
  const chartHeight =
    TOP_MARGIN +
    barsHeight +
    BOTTOM_MARGIN +
    (unscheduled.length > 0 ? 24 + unscheduled.length * 18 : 0);

  const lines: string[] = [];
  lines.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartWidth} ${chartHeight}" width="${chartWidth}" height="${chartHeight}" font-family="sans-serif" font-size="12">`,
    `<title>${escapeXml(workbookId)} — Gantt</title>`,
    `<desc>Profile: ${escapeXml(profile.id)} v${escapeXml(profile.version)}. ${scheduled.length} scheduled, ${unscheduled.length} unscheduled.</desc>`,
    `<style><![CDATA[
  .grid { stroke: #e5e7eb; stroke-width: 1; }
  .axis-label { fill: #6b7280; font-size: 10px; }
  .row-label { fill: #111827; font-size: 12px; }
  .row-label-summary { fill: #6b7280; font-size: 10px; }
  .now-line { stroke: #dc2626; stroke-width: 1.5; stroke-dasharray: 4 2; }
  .now-label { fill: #dc2626; font-size: 10px; font-weight: bold; }
  .title { fill: #111827; font-size: 16px; font-weight: bold; }
  .subtitle { fill: #6b7280; font-size: 11px; }
  .bar-text { fill: #ffffff; font-size: 10px; pointer-events: none; }
  .bar-ai { stroke: #2563eb; stroke-width: 2; }
  .bar-human { stroke: #059669; stroke-width: 2; }
  .bar-either { stroke: #7c3aed; stroke-width: 2; }
  .unscheduled-header { fill: #111827; font-size: 12px; font-weight: bold; }
  .unscheduled-row { fill: #6b7280; font-size: 11px; }
]]></style>`,
    // Title.
    `<text class="title" x="${LEFT_GUTTER}" y="24">${escapeXml(titleText)}</text>`,
    `<text class="subtitle" x="${LEFT_GUTTER}" y="42">${escapeXml(subtitleText)}</text>`,
  );

  // Day grid + date labels.
  let lastLabelRight = -Infinity;
  for (let d = 0; d <= totalDays; d += 1) {
    const x = LEFT_GUTTER + d * DAY_WIDTH;
    lines.push(
      `<line class="grid" x1="${x}" y1="${TOP_MARGIN - 8}" x2="${x}" y2="${TOP_MARGIN + barsHeight}" />`,
    );
    /* The last day is always worth labelling, but "always" must not mean
       "on top of its neighbour" — the gap decides, for the forced label and
       the stepped ones alike. */
    if (d % labelStep === 0 || d === totalDays) {
      if (x + 2 >= lastLabelRight + AXIS_LABEL_GAP) {
        const ms = minStart + d * MS_PER_DAY;
        lines.push(
          `<text class="axis-label" x="${x + 2}" y="${TOP_MARGIN - 12}">${formatDate(ms)}</text>`,
        );
        lastLabelRight = x + 2 + axisLabelWidth;
      }
    }
  }

  // Now-line.
  if (todayMs >= minStart && todayMs <= maxEnd) {
    const xNow = LEFT_GUTTER + ((todayMs - minStart) / MS_PER_DAY) * DAY_WIDTH;
    lines.push(
      `<line class="now-line" x1="${xNow}" y1="${TOP_MARGIN - 8}" x2="${xNow}" y2="${TOP_MARGIN + barsHeight}" />`,
      `<text class="now-label" x="${xNow + 4}" y="${TOP_MARGIN + barsHeight + 14}">now</text>`,
    );
  }

  // Bars.
  for (let i = 0; i < scheduled.length; i += 1) {
    const s = scheduled[i]!;
    const t = s.primitive;
    const days = Math.max(1, Math.round((s.end - s.start) / MS_PER_DAY) + 1);
    const xBar = LEFT_GUTTER + ((s.start - minStart) / MS_PER_DAY) * DAY_WIDTH;
    const yBar = TOP_MARGIN + i * ROW_HEIGHT + 2;
    const wBar = days * DAY_WIDTH;
    const status = fv<string>(t, "status") ?? "Backlog";
    const fill = STATUS_COLOR[status] ?? STATUS_COLOR.Backlog!;
    const exec = fv<string>(t, "executor_kind") ?? "Either";
    const klass = exec === "AI" ? "bar-ai" : exec === "Human" ? "bar-human" : "bar-either";
    const name = fv<string>(t, "name") ?? t.id;
    const summary = (fv<string>(t, "summary") ?? "").trim();
    /* Gutter text is elided to the gutter, not to a character count: the
       gutter is 232 units wide whatever the glyphs are, and a label that
       outgrows it runs under the bars instead of being clipped. */
    lines.push(
      `<text class="row-label" x="${GUTTER_TEXT_X}" y="${yBar + 14}">${escapeXml(ellipsize(t.id, 12, GUTTER_TEXT_WIDTH))}</text>`,
    );
    if (summary && summary.length <= 38) {
      lines.push(
        `<text class="row-label-summary" x="${GUTTER_TEXT_X}" y="${yBar + 24}">${escapeXml(ellipsize(summary, 10, GUTTER_TEXT_WIDTH))}</text>`,
      );
    }
    // The bar itself.
    lines.push(
      `<rect class="${klass}" x="${xBar}" y="${yBar}" width="${wBar}" height="${ROW_HEIGHT - 4}" fill="${fill}" rx="2" ry="2"><title>${escapeXml(`${t.id} — ${name}\n${status} / ${exec}\n${formatDate(s.start)} → ${formatDate(s.end)}`)}</title></rect>`,
    );
    // In-bar label if it fits.
    if (wBar > 60) {
      lines.push(
        `<text class="bar-text" x="${xBar + 4}" y="${yBar + 14}">${escapeXml(ellipsize(name, 10, wBar - 8))}</text>`,
      );
    }
  }
  if (scheduled.length === 0) {
    /* The note sits inside the grid band, so the grid is knocked out from
       behind it. An annotation with day rules struck through it reads as a
       broken drawing, and the empty state is exactly when a reader has
       nothing else to go on. */
    const noteWidth = textWidth(emptyNote, 10);
    lines.push(
      `<rect x="${LEFT_GUTTER + 8 - KNOCKOUT_PAD}" y="${TOP_MARGIN + 5}" width="${Math.ceil(noteWidth + KNOCKOUT_PAD * 2)}" height="15" fill="#ffffff" />`,
      `<text class="row-label-summary" x="${LEFT_GUTTER + 8}" y="${TOP_MARGIN + 16}">${escapeXml(emptyNote)}</text>`,
    );
  }

  // Unscheduled footer.
  if (unscheduled.length > 0) {
    const yStart = TOP_MARGIN + barsHeight + 24;
    lines.push(
      `<text class="unscheduled-header" x="${GUTTER_TEXT_X}" y="${yStart}">${escapeXml(footerHeader)}</text>`,
    );
    for (let i = 0; i < footerRows.length; i += 1) {
      const row = footerRows[i]!;
      /* The elided row is what is drawn; the whole row is what is meant. A
         `<title>` keeps the second recoverable from the first. */
      const tooltip =
        row.shown === row.full ? "" : `<title>${escapeXml(row.full)}</title>`;
      lines.push(
        `<text class="unscheduled-row" x="${FOOTER_TEXT_X}" y="${yStart + 18 + i * 18}">${escapeXml(row.shown)}${tooltip}</text>`,
      );
    }
  }

  lines.push(`</svg>`);
  const text = lines.join("\n");
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "image/svg+xml",
    filename: "gantt.svg",
  };
};
