/**
 * MCP audit report — reader and aggregator for `mcp-audit.jsonl`
 * (SPEC-MCP-SERVER §9.5).
 *
 * The audit log already records every dispatched call with its
 * outcome. This module closes the flywheel: it turns those entries
 * into error classes per tool (`error_category/error_reason` for
 * protocol errors, `rule:<rule_id>` for §7 rejections), a success-rate
 * SLO with the shortfall in calls, and nearest-rank latency
 * percentiles — the evidence that decides which tool description,
 * instruction sentence, or eval case to change next.
 *
 * Verification posture: audit lines are program-written, but they are
 * still parsed through typed schemas; a line that does not parse is
 * counted in `source.skipped`, never silently coerced. Unknown extra
 * fields are tolerated (`passthrough`) so a newer log reads on an older
 * reader; the fields the report depends on are validated.
 *
 * One implementation behind three surfaces: `fdpm://audit/report` (MCP
 * resource), `fdpm mcp audit-report` (CLI), `auditReport` (SDK).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const AUDIT_WINDOWS = ["1h", "24h", "7d", "all"] as const;
export type AuditWindow = (typeof AUDIT_WINDOWS)[number];

export function windowToMs(window: AuditWindow): number | null {
  switch (window) {
    case "1h":
      return 3_600_000;
    case "24h":
      return 86_400_000;
    case "7d":
      return 7 * 86_400_000;
    case "all":
      return null;
  }
}

export function isAuditWindow(v: unknown): v is AuditWindow {
  return typeof v === "string" && (AUDIT_WINDOWS as readonly string[]).includes(v);
}

// ── Entry schemas (typed parse of the JSONL) ─────────────────────────

const CallBase = {
  ts: z.string(),
  call_id: z.string(),
  session: z.string(),
  tool: z.string(),
  args_hash: z.string(),
  args: z.unknown().optional(),
};

const StartEntry = z
  .object({
    ...CallBase,
    phase: z.literal("start"),
    tier: z.literal("destructive").optional(),
    idempotency_key: z.string().optional(),
    dry_run: z.boolean().optional(),
  })
  .passthrough();

const CompleteEntry = z
  .object({
    ...CallBase,
    phase: z.literal("complete"),
    ok: z.boolean(),
    duration_ms: z.number().nonnegative(),
    validation_status: z.enum(["pass", "fail", "n/a"]),
    error_category: z.string().optional(),
    error_reason: z.string().optional(),
    replayed: z.boolean().optional(),
    dry_run: z.boolean().optional(),
    rule_ids: z.array(z.string()).optional(),
  })
  .passthrough();

const ReloadEntry = z
  .object({
    ts: z.string(),
    phase: z.literal("reload"),
    reloaded_at: z.number(),
    project_count: z.number(),
    outcome: z.enum(["ok", "host_compat", "internal"]),
    error_message: z.string().optional(),
  })
  .passthrough();

/**
 * Resource-read entry (see `mcp-audit-log.ts`).
 *
 * Parsed here rather than left to fall through: `readEntries` counts an
 * unparseable line as `skipped`, and that counter means "this log is
 * corrupt". Without this arm a perfectly healthy log would report a large
 * skipped count purely because the server serves resources, which would read
 * as damage.
 */
const ResourceEntry = z
  .object({
    ts: z.string(),
    call_id: z.string(),
    phase: z.literal("resource_read"),
    session: z.string(),
    uri: z.string(),
    provider: z.string().optional(),
    ok: z.boolean(),
    duration_ms: z.number().nonnegative(),
    bytes: z.number().nonnegative().optional(),
    error_category: z.string().optional(),
    error_reason: z.string().optional(),
  })
  .passthrough();

export const AuditEntry = z.discriminatedUnion("phase", [
  StartEntry,
  CompleteEntry,
  ReloadEntry,
  ResourceEntry,
]);
export type AuditEntry = z.infer<typeof AuditEntry>;
export type AuditCompleteEntry = z.infer<typeof CompleteEntry>;

export interface ParsedAuditLines {
  entries: AuditEntry[];
  /** Non-empty lines seen. */
  lines: number;
  /** Lines that were not valid JSON or not a known entry shape. */
  skipped: number;
}

export function parseAuditLines(text: string): ParsedAuditLines {
  const entries: AuditEntry[] = [];
  let lines = 0;
  let skipped = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    lines += 1;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    const parsed = AuditEntry.safeParse(json);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    entries.push(parsed.data);
  }
  return { entries, lines, skipped };
}

// ── Report ───────────────────────────────────────────────────────────

export interface AuditReportOptions {
  /** ISO string or Date; entries with ts < since are excluded. */
  since?: string | Date;
  /** ISO string or Date; entries with ts > until are excluded. */
  until?: string | Date;
  /** Relative window ending now; ignored when `since` is given. */
  window?: AuditWindow;
  /** Max error classes returned (default 10, ≥ 1). */
  top?: number;
  /** Success-rate target in (0, 1] (default 0.9). */
  sloTarget?: number;
  /** Clock for relative windows (tests). */
  now?: number;
}

export interface AuditReportSource {
  path: string | null;
  exists: boolean;
  lines: number;
  parsed: number;
  skipped: number;
}

/**
 * Resource-surface totals for the window.
 *
 * Reported separately from tool rows because the two surfaces answer
 * different questions: a tool row is about what an agent tried to change, a
 * resource row is about how much content left the server.
 */
export interface AuditResourceSummary {
  reads: number;
  ok: number;
  failed: number;
  bytes_served: number;
  /** Refusals by reason, e.g. `rate_limited`, `resource_too_large`. */
  refused: Record<string, number>;
}

export interface AuditToolRow {
  tool: string;
  calls: number;
  ok: number;
  failed: number;
  rejected: number;
  replayed: number;
  dry_run: number;
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  error_reasons: Record<string, number>;
  rule_ids: Record<string, number>;
}

export interface AuditErrorClass {
  /** `<tool> <label>` — stable key for tracking a class across reports. */
  class: string;
  tool: string;
  kind: "protocol" | "rejection";
  label: string;
  count: number;
  /** count / total calls in the window. */
  share: number;
}

export interface AuditReport {
  generated_at: string;
  source: AuditReportSource;
  window: { since: string | null; until: string | null; calls: number };
  totals: {
    calls: number;
    ok: number;
    failed: number;
    rejected: number;
    replayed: number;
    dry_run: number;
    success_rate: number | null;
  };
  slo: { target: number; success_rate: number | null; met: boolean | null; shortfall: number };
  per_tool: AuditToolRow[];
  error_classes: AuditErrorClass[];
  /** Resource-surface totals; zeroed when no read fell in the window. */
  resources: AuditResourceSummary;
}

const EMPTY_SOURCE: AuditReportSource = { path: null, exists: false, lines: 0, parsed: 0, skipped: 0 };

function toMs(v: string | Date | undefined): number | null {
  if (v === undefined) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(ms)) throw new Error(`invalid timestamp: ${String(v)}`);
  return ms;
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1]!;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function buildAuditReport(
  entries: ReadonlyArray<AuditEntry>,
  opts: AuditReportOptions = {},
  source: AuditReportSource = EMPTY_SOURCE,
): AuditReport {
  const top = opts.top ?? 10;
  if (!Number.isInteger(top) || top < 1) throw new Error(`top must be an integer >= 1, got ${String(opts.top)}`);
  const target = opts.sloTarget ?? 0.9;
  if (!(target > 0 && target <= 1)) throw new Error(`sloTarget must be in (0, 1], got ${String(opts.sloTarget)}`);
  const now = opts.now ?? Date.now();

  let sinceMs = toMs(opts.since);
  if (sinceMs === null && opts.window !== undefined) {
    const span = windowToMs(opts.window);
    if (span !== null) sinceMs = now - span;
  }
  const untilMs = toMs(opts.until);

  const calls: AuditCompleteEntry[] = [];
  for (const e of entries) {
    if (e.phase !== "complete") continue;
    const ts = Date.parse(e.ts);
    if (sinceMs !== null && ts < sinceMs) continue;
    if (untilMs !== null && ts > untilMs) continue;
    calls.push(e);
  }

  const totals = { calls: 0, ok: 0, failed: 0, rejected: 0, replayed: 0, dry_run: 0 };
  const tools = new Map<string, { row: AuditToolRow; durations: number[] }>();
  const classes = new Map<string, AuditErrorClass>();

  for (const c of calls) {
    totals.calls += 1;
    let t = tools.get(c.tool);
    if (t === undefined) {
      t = {
        row: {
          tool: c.tool,
          calls: 0,
          ok: 0,
          failed: 0,
          rejected: 0,
          replayed: 0,
          dry_run: 0,
          success_rate: null,
          p50_ms: null,
          p95_ms: null,
          error_reasons: {},
          rule_ids: {},
        },
        durations: [],
      };
      tools.set(c.tool, t);
    }
    t.row.calls += 1;
    t.durations.push(c.duration_ms);
    if (c.replayed === true) {
      totals.replayed += 1;
      t.row.replayed += 1;
    }
    if (c.dry_run === true) {
      totals.dry_run += 1;
      t.row.dry_run += 1;
    }
    if (c.ok) {
      totals.ok += 1;
      t.row.ok += 1;
      continue;
    }
    if (c.error_category !== undefined) {
      totals.failed += 1;
      t.row.failed += 1;
      const label = `${c.error_category}/${c.error_reason ?? "-"}`;
      bump(t.row.error_reasons, label);
      addClass(classes, c.tool, "protocol", label);
    } else {
      totals.rejected += 1;
      t.row.rejected += 1;
      const ids = c.rule_ids !== undefined && c.rule_ids.length > 0 ? c.rule_ids : ["unknown"];
      for (const id of ids) {
        bump(t.row.rule_ids, id);
        addClass(classes, c.tool, "rejection", `rule:${id}`);
      }
    }
  }

  const per_tool: AuditToolRow[] = [...tools.values()]
    .map(({ row, durations }) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        ...row,
        success_rate: row.calls > 0 ? row.ok / row.calls : null,
        p50_ms: percentile(sorted, 0.5),
        p95_ms: percentile(sorted, 0.95),
      };
    })
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));

  // Resource-surface totals. Kept separate from `totals`, which counts tool
  // calls: mixing them would make the SLO success rate depend on how much
  // content was served, which is a different question from whether writes
  // succeeded.
  const resources: AuditResourceSummary = {
    reads: 0,
    ok: 0,
    failed: 0,
    bytes_served: 0,
    refused: {},
  };
  for (const e of entries) {
    if (e.phase !== "resource_read") continue;
    const ts = Date.parse(e.ts);
    if (sinceMs !== null && ts < sinceMs) continue;
    if (untilMs !== null && ts > untilMs) continue;
    resources.reads += 1;
    if (e.ok) {
      resources.ok += 1;
      resources.bytes_served += typeof e.bytes === "number" ? e.bytes : 0;
    } else {
      resources.failed += 1;
      const reason = typeof e.error_reason === "string" ? e.error_reason : "unknown";
      resources.refused[reason] = (resources.refused[reason] ?? 0) + 1;
    }
  }

  const error_classes = [...classes.values()]
    .map((c) => ({ ...c, share: totals.calls > 0 ? c.count / totals.calls : 0 }))
    .sort((a, b) => b.count - a.count || a.class.localeCompare(b.class))
    .slice(0, top);

  const success_rate = totals.calls > 0 ? totals.ok / totals.calls : null;
  const needed = Math.ceil(target * totals.calls);
  return {
    generated_at: new Date(now).toISOString(),
    source,
    window: {
      since: sinceMs === null ? null : new Date(sinceMs).toISOString(),
      until: untilMs === null ? null : new Date(untilMs).toISOString(),
      calls: totals.calls,
    },
    totals: { ...totals, success_rate },
    slo: {
      target,
      success_rate,
      met: success_rate === null ? null : success_rate >= target,
      shortfall: Math.max(0, needed - totals.ok),
    },
    per_tool,
    error_classes,
    resources,
  };
}

function addClass(
  classes: Map<string, AuditErrorClass>,
  tool: string,
  kind: "protocol" | "rejection",
  label: string,
): void {
  const key = `${tool} ${label}`;
  const existing = classes.get(key);
  if (existing !== undefined) {
    existing.count += 1;
    return;
  }
  classes.set(key, { class: key, tool, kind, label, count: 1, share: 0 });
}

// ── File access ──────────────────────────────────────────────────────

export const AUDIT_LOG_FILENAME = "mcp-audit.jsonl";

export function readAuditLog(dataDir: string): { path: string; exists: boolean; text: string } {
  const path = join(dataDir, AUDIT_LOG_FILENAME);
  if (!existsSync(path)) return { path, exists: false, text: "" };
  return { path, exists: true, text: readFileSync(path, "utf8") };
}

/** `dataDir === null` is the in-memory Host: no log, empty report. */
export function auditReportFromDataDir(
  dataDir: string | null,
  opts: AuditReportOptions = {},
): AuditReport {
  if (dataDir === null) return buildAuditReport([], opts, EMPTY_SOURCE);
  const { path, exists, text } = readAuditLog(dataDir);
  const parsed = parseAuditLines(text);
  return buildAuditReport(parsed.entries, opts, {
    path,
    exists,
    lines: parsed.lines,
    parsed: parsed.entries.length,
    skipped: parsed.skipped,
  });
}
