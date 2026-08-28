/**
 * MCP audit report — the flywheel's reader (SPEC-MCP-SERVER §9.5).
 *
 * `mcp-audit.jsonl` records every dispatched call with its outcome
 * (`ok`, `error_category`/`error_reason`, `validation_status`, and —
 * new in this change — the `rule_ids` a Tier-2 rejection fired). This
 * module turns the log into error classes per tool, a success-rate SLO,
 * and latency percentiles, so description/instruction changes can be
 * driven by what actually fails. Pure functions over parsed entries;
 * the file reader is a thin wrapper.
 *
 * Reference: Honeycomb's MCP server flywheel — instrument "what tools
 * customers were using, but also where those tools were failing",
 * set a success SLO, turn the error classes into eval cases.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDIT_WINDOWS,
  auditReportFromDataDir,
  buildAuditReport,
  parseAuditLines,
  readAuditLog,
  windowToMs,
} from "../src/persistence/mcp-audit-report.js";

const T0 = Date.parse("2026-08-28T10:00:00.000Z");
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

function complete(over: Record<string, unknown>): Record<string, unknown> {
  return {
    ts: iso(0),
    call_id: `c-${Math.random().toString(36).slice(2, 8)}`,
    phase: "complete",
    session: "s1",
    tool: "fdpm.primitive.create",
    args_hash: "h",
    ok: true,
    duration_ms: 10,
    validation_status: "pass",
    ...over,
  };
}

/** 7 calls: A ok×3, A protocol error ×1, A rejection ×1 (2 rule ids), B ok replayed ×1, B ok dry_run ×1. */
function fixture(): Record<string, unknown>[] {
  return [
    complete({ tool: "A", duration_ms: 10 }),
    complete({ tool: "A", duration_ms: 20 }),
    complete({ tool: "A", duration_ms: 30 }),
    complete({ tool: "A", ok: false, validation_status: "n/a", error_category: "not_found", error_reason: "unknown_tool", duration_ms: 40 }),
    complete({ tool: "A", ok: false, validation_status: "fail", rule_ids: ["core:id-format", "core:required-field"], duration_ms: 100 }),
    complete({ tool: "B", replayed: true, duration_ms: 5 }),
    complete({ tool: "B", dry_run: true, duration_ms: 7 }),
  ];
}

describe("parseAuditLines", () => {
  it("parses valid entries, counts and skips malformed lines and unknown phases, keeps reload entries out of calls", () => {
    const text = [
      JSON.stringify(complete({})),
      "not json at all",
      JSON.stringify({ phase: "bogus" }),
      JSON.stringify({ ts: iso(0), call_id: "c1", phase: "start", session: "s1", tool: "A", args_hash: "h" }),
      JSON.stringify({ ts: iso(0), phase: "reload", reloaded_at: T0, project_count: 1, outcome: "ok" }),
      "",
    ].join("\n");
    const parsed = parseAuditLines(text);
    expect(parsed.lines).toBe(5);
    expect(parsed.skipped).toBe(2);
    expect(parsed.entries).toHaveLength(3);
    const report = buildAuditReport(parsed.entries);
    expect(report.totals.calls).toBe(1);
  });
});

describe("buildAuditReport — totals, per tool, error classes, SLO", () => {
  it("aggregates the fixture", () => {
    const { entries } = parseAuditLines(fixture().map((e) => JSON.stringify(e)).join("\n"));
    const r = buildAuditReport(entries, { sloTarget: 0.9 });
    expect(r.totals).toEqual({
      calls: 7,
      ok: 5,
      failed: 1,
      rejected: 1,
      replayed: 1,
      dry_run: 1,
      success_rate: 5 / 7,
    });
    expect(r.slo.target).toBe(0.9);
    expect(r.slo.met).toBe(false);
    expect(r.slo.shortfall).toBe(2); // ceil(0.9 × 7) = 7 successes needed, 5 seen
    expect(r.per_tool.map((t) => t.tool)).toEqual(["A", "B"]);
    const a = r.per_tool[0]!;
    expect(a).toMatchObject({ calls: 5, ok: 3, failed: 1, rejected: 1, replayed: 0, dry_run: 0 });
    expect(a.success_rate).toBeCloseTo(0.6);
    expect(a.error_reasons).toEqual({ "not_found/unknown_tool": 1 });
    expect(a.rule_ids).toEqual({ "core:id-format": 1, "core:required-field": 1 });
    expect(a.p50_ms).toBe(30);
    expect(a.p95_ms).toBe(100);
    const b = r.per_tool[1]!;
    expect(b).toMatchObject({ calls: 2, ok: 2, replayed: 1, dry_run: 1, success_rate: 1 });
    expect(r.error_classes.map((c) => c.class)).toEqual([
      "A not_found/unknown_tool",
      "A rule:core:id-format",
      "A rule:core:required-field",
    ]);
    for (const c of r.error_classes) expect(c.share).toBeCloseTo(1 / 7);
    expect(r.error_classes[0]!.kind).toBe("protocol");
    expect(r.error_classes[1]!.kind).toBe("rejection");
  });

  it("`top` bounds the error-class list; classes sort by count desc then name asc", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => complete({ tool: "A", ok: false, validation_status: "fail", rule_ids: ["core:z"] })),
      ...Array.from({ length: 3 }, () => complete({ tool: "A", ok: false, validation_status: "fail", rule_ids: ["core:a"] })),
      complete({ tool: "A", ok: false, validation_status: "n/a", error_category: "permission", error_reason: "stale_state" }),
    ];
    const { entries } = parseAuditLines(rows.map((e) => JSON.stringify(e)).join("\n"));
    const r = buildAuditReport(entries, { top: 2 });
    expect(r.error_classes.map((c) => [c.class, c.count])).toEqual([
      ["A rule:core:a", 3],
      ["A rule:core:z", 3],
    ]);
  });

  it("a rejection without rule_ids is classed rule:unknown", () => {
    const { entries } = parseAuditLines(
      JSON.stringify(complete({ tool: "A", ok: false, validation_status: "fail" })),
    );
    expect(buildAuditReport(entries).error_classes[0]!.class).toBe("A rule:unknown");
  });

  it("an empty log yields zero calls, null rates, and an undecided SLO", () => {
    const r = buildAuditReport([]);
    expect(r.totals.calls).toBe(0);
    expect(r.totals.success_rate).toBeNull();
    expect(r.slo.met).toBeNull();
    expect(r.slo.shortfall).toBe(0);
    expect(r.per_tool).toEqual([]);
    expect(r.error_classes).toEqual([]);
  });

  it("filters by since/until on the entry timestamp and reports the window", () => {
    const rows = [
      complete({ tool: "A", ts: iso(-3 * 3600_000) }),
      complete({ tool: "A", ts: iso(-60_000) }),
      complete({ tool: "A", ts: iso(0) }),
    ];
    const { entries } = parseAuditLines(rows.map((e) => JSON.stringify(e)).join("\n"));
    const r = buildAuditReport(entries, { since: iso(-2 * 3600_000), until: iso(-1) });
    expect(r.totals.calls).toBe(1);
    expect(r.window.since).toBe(iso(-2 * 3600_000));
    expect(r.window.until).toBe(iso(-1));
    expect(r.window.calls).toBe(1);
    const all = buildAuditReport(entries);
    expect(all.window.since).toBeNull();
    expect(all.totals.calls).toBe(3);
  });

  it("percentiles use nearest-rank", () => {
    const rows = [10, 20, 30, 40, 100].map((d) => complete({ tool: "A", duration_ms: d }));
    const { entries } = parseAuditLines(rows.map((e) => JSON.stringify(e)).join("\n"));
    const t = buildAuditReport(entries).per_tool[0]!;
    expect(t.p50_ms).toBe(30);
    expect(t.p95_ms).toBe(100);
  });

  it("rejects an invalid SLO target or top", () => {
    expect(() => buildAuditReport([], { sloTarget: 1.5 })).toThrow(/sloTarget/);
    expect(() => buildAuditReport([], { top: 0 })).toThrow(/top/);
  });
});

describe("windows and files", () => {
  it("windowToMs maps the four windows; `all` is null", () => {
    expect(AUDIT_WINDOWS).toEqual(["1h", "24h", "7d", "all"]);
    expect(windowToMs("1h")).toBe(3_600_000);
    expect(windowToMs("24h")).toBe(86_400_000);
    expect(windowToMs("7d")).toBe(7 * 86_400_000);
    expect(windowToMs("all")).toBeNull();
  });

  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fdpm-audit-report-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("readAuditLog reports a missing file without throwing", () => {
    const r = readAuditLog(dir);
    expect(r.path).toBe(join(dir, "mcp-audit.jsonl"));
    expect(r.exists).toBe(false);
    expect(r.text).toBe("");
  });

  it("auditReportFromDataDir reads, parses, and reports the source", () => {
    writeFileSync(join(dir, "mcp-audit.jsonl"), fixture().map((e) => JSON.stringify(e)).join("\n") + "\nbroken\n");
    const r = auditReportFromDataDir(dir, { top: 5 });
    expect(r.source).toEqual({ path: join(dir, "mcp-audit.jsonl"), exists: true, lines: 8, parsed: 7, skipped: 1 });
    expect(r.totals.calls).toBe(7);
    expect(typeof r.generated_at).toBe("string");
  });

  it("auditReportFromDataDir(null) is the in-memory case: no source, zero calls", () => {
    const r = auditReportFromDataDir(null);
    expect(r.source).toEqual({ path: null, exists: false, lines: 0, parsed: 0, skipped: 0 });
    expect(r.totals.calls).toBe(0);
  });

  it("the `window` option is relative to now", () => {
    const now = Date.now();
    const rows = [
      complete({ tool: "A", ts: new Date(now - 2 * 3_600_000).toISOString() }),
      complete({ tool: "A", ts: new Date(now - 60_000).toISOString() }),
    ];
    writeFileSync(join(dir, "mcp-audit.jsonl"), rows.map((e) => JSON.stringify(e)).join("\n"));
    expect(auditReportFromDataDir(dir, { window: "1h" }).totals.calls).toBe(1);
    expect(auditReportFromDataDir(dir, { window: "all" }).totals.calls).toBe(2);
  });
});
