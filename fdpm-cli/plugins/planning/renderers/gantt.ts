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

export const renderGantt: RendererFn = (input): RendererOutput => {
  const { primitives, projectId, profile } = input;
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

  const chartWidth = LEFT_GUTTER + DAY_WIDTH * totalDays + RIGHT_MARGIN;
  const chartHeight =
    TOP_MARGIN +
    Math.max(scheduled.length, 1) * ROW_HEIGHT +
    BOTTOM_MARGIN +
    (unscheduled.length > 0 ? 24 + unscheduled.length * 18 : 0);

  const lines: string[] = [];
  lines.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartWidth} ${chartHeight}" width="${chartWidth}" height="${chartHeight}" font-family="sans-serif" font-size="12">`,
    `<title>${escapeXml(projectId)} — Gantt</title>`,
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
    `<text class="title" x="${LEFT_GUTTER}" y="24">${escapeXml(projectId)} — Gantt</text>`,
    `<text class="subtitle" x="${LEFT_GUTTER}" y="42">${scheduled.length} scheduled, ${unscheduled.length} unscheduled · profile ${escapeXml(profile.id)} v${escapeXml(profile.version)}</text>`,
  );

  // Day grid + date labels.
  for (let d = 0; d <= totalDays; d += 1) {
    const x = LEFT_GUTTER + d * DAY_WIDTH;
    lines.push(
      `<line class="grid" x1="${x}" y1="${TOP_MARGIN - 8}" x2="${x}" y2="${TOP_MARGIN + Math.max(scheduled.length, 1) * ROW_HEIGHT}" />`,
    );
    if (d % Math.max(1, Math.round(totalDays / 12)) === 0 || d === totalDays) {
      const ms = minStart + d * MS_PER_DAY;
      lines.push(
        `<text class="axis-label" x="${x + 2}" y="${TOP_MARGIN - 12}">${formatDate(ms)}</text>`,
      );
    }
  }

  // Now-line.
  if (todayMs >= minStart && todayMs <= maxEnd) {
    const xNow = LEFT_GUTTER + ((todayMs - minStart) / MS_PER_DAY) * DAY_WIDTH;
    lines.push(
      `<line class="now-line" x1="${xNow}" y1="${TOP_MARGIN - 8}" x2="${xNow}" y2="${TOP_MARGIN + Math.max(scheduled.length, 1) * ROW_HEIGHT}" />`,
      `<text class="now-label" x="${xNow + 4}" y="${TOP_MARGIN + Math.max(scheduled.length, 1) * ROW_HEIGHT + 14}">now</text>`,
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
    // Row label (left gutter).
    lines.push(
      `<text class="row-label" x="8" y="${yBar + 14}">${escapeXml(t.id)}</text>`,
    );
    if (summary && summary.length <= 38) {
      lines.push(
        `<text class="row-label-summary" x="8" y="${yBar + 24}">${escapeXml(summary)}</text>`,
      );
    }
    // The bar itself.
    lines.push(
      `<rect class="${klass}" x="${xBar}" y="${yBar}" width="${wBar}" height="${ROW_HEIGHT - 4}" fill="${fill}" rx="2" ry="2"><title>${escapeXml(`${t.id} — ${name}\n${status} / ${exec}\n${formatDate(s.start)} → ${formatDate(s.end)}`)}</title></rect>`,
    );
    // In-bar label if it fits.
    if (wBar > 60) {
      lines.push(
        `<text class="bar-text" x="${xBar + 4}" y="${yBar + 14}">${escapeXml(name)}</text>`,
      );
    }
  }
  if (scheduled.length === 0) {
    lines.push(
      `<text class="row-label-summary" x="${LEFT_GUTTER + 8}" y="${TOP_MARGIN + 16}">No tasks have planned_start AND planned_finish set.</text>`,
    );
  }

  // Unscheduled footer.
  if (unscheduled.length > 0) {
    const yStart = TOP_MARGIN + Math.max(scheduled.length, 1) * ROW_HEIGHT + 24;
    lines.push(
      `<text class="unscheduled-header" x="8" y="${yStart}">Unscheduled (${unscheduled.length}) — no planned dates</text>`,
    );
    for (let i = 0; i < unscheduled.length; i += 1) {
      const t = unscheduled[i]!;
      const status = fv<string>(t, "status") ?? "?";
      const exec = fv<string>(t, "executor_kind") ?? "?";
      lines.push(
        `<text class="unscheduled-row" x="16" y="${yStart + 18 + i * 18}">${escapeXml(t.id)} [${status}/${exec}] — ${escapeXml((fv<string>(t, "summary") ?? fv<string>(t, "name") ?? "").trim())}</text>`,
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
