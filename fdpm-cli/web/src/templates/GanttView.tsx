/**
 * Interactive descriptive Gantt for plan:* workbooks.
 *
 * Mirrors the conventions of plugins/planning/renderers/gantt.ts (so
 * the web Gantt and the server-rendered SVG agree on what they show)
 * and adds: iteration bands, milestone markers, dependency arrows,
 * click-to-scroll into the Board view.
 *
 * "Descriptive" means: bars are drawn from `planned_start` to
 * `planned_finish`, both required. There is no scheduler, no
 * critical-path solver. Tasks missing either date land in the
 * "Unscheduled" footer block.
 *
 * No drag-to-reschedule in v1: planned_start / planned_finish are
 * not exposed through any planning SDK helper, so a write path here
 * would be a separate piece of work.
 *
 * No external chart library. Inline SVG, native Date math.
 */
import { useMemo } from "react";
import type { Primitive, Relation, WorkbookDetailResponse } from "../types";

interface Props {
  data: WorkbookDetailResponse;
}

const MS_PER_DAY = 86_400_000;

/** Status palette matches plugins/planning/renderers/gantt.ts:STATUS_COLOR. */
const STATUS_COLOR: Record<string, string> = {
  Backlog: "#94a3b8",
  Ready: "#3b82f6",
  In_progress: "#10b981",
  Blocked: "#ef4444",
  In_review: "#f59e0b",
  Done: "#6b7280",
  Cancelled: "#374151",
};

const ROW_HEIGHT = 26;
const LEFT_GUTTER = 220;
const TOP_AXIS = 56;
const ITERATION_BAND = 18;
const MILESTONE_BAND = 18;
const MIN_DAY_PX = 14;
const MAX_DAY_PX = 36;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function fv<T = unknown>(p: Primitive, key: string): T | undefined {
  return p.field_values?.[key] as T | undefined;
}
function relSrc(r: Relation): string | undefined {
  return r.source_id ?? r.src_id;
}
function relTgt(r: Relation): string | undefined {
  return r.target_id ?? r.dst_id;
}
function asRelations(rels: WorkbookDetailResponse["relations"]): Relation[] {
  if (Array.isArray(rels)) return rels;
  if (rels) return Object.values(rels);
  return [];
}

/** UTC-midnight day-truncation, matching the server renderer. */
function parseIsoDay(s: string | undefined): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / MS_PER_DAY) * MS_PER_DAY;
}

function formatShortDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "May 6" / "May 6 '26" depending on whether year disambiguation is needed. */
function formatTickLabel(ms: number, withYear: boolean): string {
  const d = new Date(ms);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  if (withYear) {
    const yr = String(d.getUTCFullYear()).slice(-2);
    return `${month} ${day} '${yr}`;
  }
  return `${month} ${day}`;
}

/**
 * Pick a tick interval based on the visible date span. Returns the
 * granularity in ms and a labelling function. Auto-rules:
 *   ≤14 days  → daily
 *   ≤90 days  → weekly (Mondays)
 *   else      → monthly (1st)
 */
function pickTicks(minMs: number, maxMs: number): {
  ticks: number[];
  granularity: "day" | "week" | "month";
  withYear: boolean;
} {
  const span = (maxMs - minMs) / MS_PER_DAY;
  let granularity: "day" | "week" | "month";
  if (span <= 14) granularity = "day";
  else if (span <= 90) granularity = "week";
  else granularity = "month";

  const ticks: number[] = [];
  if (granularity === "day") {
    for (let t = minMs; t <= maxMs; t += MS_PER_DAY) ticks.push(t);
  } else if (granularity === "week") {
    // Find first Monday on/after minMs.
    let t = minMs;
    while (new Date(t).getUTCDay() !== 1) t += MS_PER_DAY;
    for (; t <= maxMs; t += 7 * MS_PER_DAY) ticks.push(t);
  } else {
    // 1st of each month from minMs's month onward.
    const d = new Date(minMs);
    let cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (cur < minMs) cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    while (cur <= maxMs) {
      ticks.push(cur);
      const nd = new Date(cur);
      cur = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 1);
    }
  }

  // Labels need a year only if the visible range crosses a year boundary.
  const startYear = new Date(minMs).getUTCFullYear();
  const endYear = new Date(maxMs).getUTCFullYear();
  return { ticks, granularity, withYear: startYear !== endYear };
}

interface Layout {
  minMs: number;
  maxMs: number;
  dayPx: number;
  width: number;
  scheduledTasks: Array<{ p: Primitive; start: number; end: number }>;
  unscheduledTasks: Primitive[];
  iterations: Array<{ p: Primitive; start: number; end: number }>;
  milestones: Array<{ p: Primitive; ts: number }>;
  dependencies: Array<{ from: string; to: string }>;
}

function buildLayout(data: WorkbookDetailResponse): Layout | null {
  const prims = Object.values(data.primitives);
  const tasks = prims.filter((p) => p.type_id === "plan:Task");
  const its = prims.filter((p) => p.type_id === "plan:Iteration");
  const mils = prims.filter((p) => p.type_id === "plan:Milestone");

  const scheduledTasks: Layout["scheduledTasks"] = [];
  const unscheduledTasks: Primitive[] = [];
  for (const t of tasks) {
    const ps = parseIsoDay(asString(fv(t, "planned_start")));
    const pf = parseIsoDay(asString(fv(t, "planned_finish")));
    if (ps != null && pf != null && pf >= ps) {
      scheduledTasks.push({ p: t, start: ps, end: pf });
    } else {
      unscheduledTasks.push(t);
    }
  }
  scheduledTasks.sort(
    (a, b) => a.start - b.start || a.end - b.end || a.p.id.localeCompare(b.p.id),
  );

  const iterations: Layout["iterations"] = [];
  for (const it of its) {
    const ps = parseIsoDay(asString(fv(it, "start_date")));
    const pf = parseIsoDay(asString(fv(it, "end_date")));
    if (ps != null && pf != null && pf >= ps) {
      iterations.push({ p: it, start: ps, end: pf });
    }
  }
  iterations.sort((a, b) => a.start - b.start);

  const milestones: Layout["milestones"] = [];
  for (const m of mils) {
    const ts = parseIsoDay(asString(fv(m, "target_date")));
    if (ts != null) milestones.push({ p: m, ts });
  }
  milestones.sort((a, b) => a.ts - b.ts);

  // Pick the date range from the union of all date-bearing entities.
  // If nothing has dates, return null — caller renders the empty state.
  const allStarts: number[] = [];
  const allEnds: number[] = [];
  for (const s of scheduledTasks) {
    allStarts.push(s.start);
    allEnds.push(s.end);
  }
  for (const i of iterations) {
    allStarts.push(i.start);
    allEnds.push(i.end);
  }
  for (const m of milestones) {
    allStarts.push(m.ts);
    allEnds.push(m.ts);
  }
  if (allStarts.length === 0) {
    // Fully empty — caller decides what to draw.
    if (unscheduledTasks.length === 0) return null;
    // Fall back to a 14-day window starting today so the unscheduled
    // section still renders below an axis.
    const today = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;
    return {
      minMs: today,
      maxMs: today + 13 * MS_PER_DAY,
      dayPx: MAX_DAY_PX,
      width: LEFT_GUTTER + 14 * MAX_DAY_PX,
      scheduledTasks,
      unscheduledTasks,
      iterations,
      milestones,
      dependencies: [],
    };
  }
  let minMs = Math.min(...allStarts);
  let maxMs = Math.max(...allEnds);
  // Pad by 2 days each side so bars at the edges aren't clipped.
  minMs -= 2 * MS_PER_DAY;
  maxMs += 2 * MS_PER_DAY;
  const days = Math.max(1, Math.round((maxMs - minMs) / MS_PER_DAY) + 1);
  // Choose dayPx so the chart fits in a sensible width window.
  const targetMaxWidth = 1200;
  const dayPx = Math.max(
    MIN_DAY_PX,
    Math.min(MAX_DAY_PX, Math.floor((targetMaxWidth - LEFT_GUTTER) / days)),
  );

  // Dependencies (plan:DependsOn) where both endpoints are scheduled.
  const scheduledIds = new Set(scheduledTasks.map((s) => s.p.id));
  const dependencies: Layout["dependencies"] = [];
  for (const r of asRelations(data.relations)) {
    if (r.type_id !== "plan:DependsOn") continue;
    const from = relSrc(r);
    const to = relTgt(r);
    if (!from || !to) continue;
    if (!scheduledIds.has(from) || !scheduledIds.has(to)) continue;
    dependencies.push({ from, to });
  }

  return {
    minMs,
    maxMs,
    dayPx,
    width: LEFT_GUTTER + days * dayPx,
    scheduledTasks,
    unscheduledTasks,
    iterations,
    milestones,
    dependencies,
  };
}

function anchorFor(id: string): string {
  return `plan-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function scrollToTask(taskId: string): void {
  const el = document.getElementById(anchorFor(taskId));
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("plan-flash");
    window.setTimeout(() => el.classList.remove("plan-flash"), 1400);
  }
}

export function GanttView({ data }: Props) {
  const layout = useMemo(() => buildLayout(data), [data]);

  if (!layout) {
    return (
      <div className="gantt-empty">
        <p>This workbook has no tasks, iterations, or milestones with dates.</p>
        <p className="hint">
          A task lands on the Gantt when both <code>planned_start</code> and
          <code>planned_finish</code> are set.
        </p>
      </div>
    );
  }

  const {
    minMs,
    maxMs,
    dayPx,
    width,
    scheduledTasks,
    unscheduledTasks,
    iterations,
    milestones,
    dependencies,
  } = layout;
  const days = Math.round((maxMs - minMs) / MS_PER_DAY) + 1;
  const todayMs = Math.floor(Date.now() / MS_PER_DAY) * MS_PER_DAY;
  const ticks = pickTicks(minMs, maxMs);

  const taskIndex = new Map<string, number>();
  scheduledTasks.forEach((s, i) => taskIndex.set(s.p.id, i));

  const taskAreaTop = TOP_AXIS + ITERATION_BAND + MILESTONE_BAND;
  const chartHeight = taskAreaTop + scheduledTasks.length * ROW_HEIGHT + 20;

  const xForMs = (ms: number) =>
    LEFT_GUTTER + ((ms - minMs) / MS_PER_DAY) * dayPx;

  return (
    <div className="gantt-container">
      <header className="gantt-header">
        <div className="gantt-header-counts">
          <span><strong>{scheduledTasks.length}</strong> scheduled</span>
          <span className="sep">·</span>
          <span><strong>{unscheduledTasks.length}</strong> unscheduled</span>
          <span className="sep">·</span>
          <span><strong>{iterations.length}</strong> iteration{iterations.length === 1 ? "" : "s"}</span>
          {milestones.length > 0 && (
            <>
              <span className="sep">·</span>
              <span><strong>{milestones.length}</strong> milestone{milestones.length === 1 ? "" : "s"}</span>
            </>
          )}
          <span className="sep">·</span>
          <span>
            {formatShortDate(minMs)} → {formatShortDate(maxMs)} ({days} days)
          </span>
        </div>
      </header>

      <div className="gantt-scroll">
        <svg
          className="gantt-svg"
          width={width}
          height={chartHeight}
          role="img"
          aria-label="Gantt chart"
        >
          {/* Date axis ticks + gridlines */}
          {ticks.ticks.map((t) => {
            const x = xForMs(t);
            return (
              <g key={t} className="gantt-tick">
                <line
                  x1={x}
                  y1={TOP_AXIS}
                  x2={x}
                  y2={chartHeight - 16}
                  className="gantt-gridline"
                />
                <text x={x} y={TOP_AXIS - 6} className="gantt-tick-label">
                  {formatTickLabel(t, ticks.withYear)}
                </text>
              </g>
            );
          })}

          {/* Iteration bands */}
          {iterations.map((it) => {
            const x1 = xForMs(it.start);
            const x2 = xForMs(it.end + MS_PER_DAY);
            const w = Math.max(1, x2 - x1);
            const name = asString(fv(it.p, "name")) || it.p.id;
            return (
              <g key={it.p.id} className="gantt-iteration">
                <rect
                  x={x1}
                  y={TOP_AXIS}
                  width={w}
                  height={ITERATION_BAND - 2}
                  className="gantt-iteration-band"
                >
                  <title>
                    {name}: {formatShortDate(it.start)} → {formatShortDate(it.end)}
                  </title>
                </rect>
                {w > 60 && (
                  <text
                    x={x1 + 6}
                    y={TOP_AXIS + ITERATION_BAND - 6}
                    className="gantt-iteration-label"
                  >
                    {name}
                  </text>
                )}
              </g>
            );
          })}

          {/* Milestone markers */}
          {milestones.map((m) => {
            const x = xForMs(m.ts);
            const y = TOP_AXIS + ITERATION_BAND + 4;
            const name = asString(fv(m.p, "name")) || m.p.id;
            const status = asString(fv(m.p, "status"));
            return (
              <g
                key={m.p.id}
                className={`gantt-milestone gantt-ms-status-${status}`}
              >
                <polygon
                  points={`${x},${y} ${x - 6},${y + 10} ${x + 6},${y + 10}`}
                  className="gantt-milestone-mark"
                >
                  <title>
                    ★ {name} ({status}) — {formatShortDate(m.ts)}
                  </title>
                </polygon>
              </g>
            );
          })}

          {/* Today line */}
          {todayMs >= minMs && todayMs <= maxMs && (
            <g className="gantt-today">
              <line
                x1={xForMs(todayMs)}
                y1={TOP_AXIS}
                x2={xForMs(todayMs)}
                y2={chartHeight - 16}
                className="gantt-today-line"
              />
              <text
                x={xForMs(todayMs) + 4}
                y={TOP_AXIS - 22}
                className="gantt-today-label"
              >
                today
              </text>
            </g>
          )}

          {/* Task rows */}
          {scheduledTasks.map((s, i) => {
            const y = taskAreaTop + i * ROW_HEIGHT;
            const xBar = xForMs(s.start);
            const xEnd = xForMs(s.end + MS_PER_DAY);
            const wBar = Math.max(2, xEnd - xBar);
            const status = asString(fv(s.p, "status")) || "Backlog";
            const fill = STATUS_COLOR[status] ?? STATUS_COLOR.Backlog!;
            const exec = asString(fv(s.p, "executor_kind"));
            const name = asString(fv(s.p, "name")) || s.p.id;
            const summary = asString(fv(s.p, "summary"));
            const tipLines = [
              `${s.p.id} — ${name}`,
              `${status}${exec ? ` / ${exec}` : ""}`,
              `${formatShortDate(s.start)} → ${formatShortDate(s.end)}`,
            ];
            if (summary) tipLines.push("", summary);
            return (
              <g
                key={s.p.id}
                className={`gantt-row gantt-row-${status}${exec ? ` gantt-row-exec-${exec}` : ""}`}
              >
                {i % 2 === 1 && (
                  <rect
                    x={LEFT_GUTTER}
                    y={y}
                    width={width - LEFT_GUTTER}
                    height={ROW_HEIGHT}
                    className="gantt-row-zebra"
                  />
                )}
                <text
                  x={LEFT_GUTTER - 8}
                  y={y + ROW_HEIGHT / 2 + 4}
                  className="gantt-row-label"
                  onClick={() => scrollToTask(s.p.id)}
                >
                  <title>{s.p.id}</title>
                  {name.length > 30 ? name.slice(0, 28) + "…" : name}
                </text>
                <rect
                  x={xBar}
                  y={y + 4}
                  width={wBar}
                  height={ROW_HEIGHT - 8}
                  rx={3}
                  ry={3}
                  fill={fill}
                  className={`gantt-bar gantt-bar-exec-${exec || "Either"}`}
                  onClick={() => scrollToTask(s.p.id)}
                >
                  <title>{tipLines.join("\n")}</title>
                </rect>
              </g>
            );
          })}

          {/* Dependency arrows (drawn last, on top) */}
          {dependencies.length <= 50 &&
            dependencies.map((d, idx) => {
              const fromIdx = taskIndex.get(d.from);
              const toIdx = taskIndex.get(d.to);
              if (fromIdx == null || toIdx == null) return null;
              const fromTask = scheduledTasks[fromIdx]!;
              const toTask = scheduledTasks[toIdx]!;
              const x1 = xForMs(fromTask.start);
              const y1 = taskAreaTop + fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
              const x2 = xForMs(toTask.end + MS_PER_DAY);
              const y2 = taskAreaTop + toIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
              return (
                <path
                  key={`${d.from}->${d.to}-${idx}`}
                  d={`M ${x2} ${y2} L ${x2 + 6} ${y2} L ${x2 + 6} ${y1} L ${x1} ${y1}`}
                  className="gantt-dep-arrow"
                  fill="none"
                />
              );
            })}
        </svg>
      </div>

      {unscheduledTasks.length > 0 && (
        <section className="gantt-unscheduled">
          <h4>
            Unscheduled <span className="count">({unscheduledTasks.length})</span>
          </h4>
          <p className="gantt-unscheduled-lede">
            Tasks without both <code>planned_start</code> and{" "}
            <code>planned_finish</code> set. Add dates to surface them on the
            timeline.
          </p>
          <ul>
            {unscheduledTasks.map((t) => {
              const status = asString(fv(t, "status"));
              const exec = asString(fv(t, "executor_kind"));
              const summary = asString(fv(t, "summary"));
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className="gantt-unscheduled-link"
                    onClick={() => scrollToTask(t.id)}
                  >
                    <code>{t.id}</code>
                  </button>
                  <span className="gantt-unscheduled-meta">
                    {status && (
                      <span
                        className="gantt-unscheduled-badge"
                        style={{ background: STATUS_COLOR[status] ?? "transparent" }}
                      >
                        {status}
                      </span>
                    )}
                    {exec && <span className="gantt-unscheduled-badge">{exec}</span>}
                    {summary && <span className="gantt-unscheduled-summary">— {summary}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
