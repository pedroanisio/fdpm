/**
 * `fdpm mcp …` — MCP server introspection from the CLI.
 *
 * `audit-report` is the CLI face of SPEC-MCP-SERVER §9.5: it aggregates
 * `<data-dir>/mcp-audit.jsonl` into per-tool outcomes, error classes,
 * a success-rate SLO and latency percentiles — the same report the
 * `fdpm://audit/report` resource and the SDK `auditReport` return.
 * Read-only: touches no workbook log.
 */
import { Command } from "commander";
import type { Host } from "../core/host.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import {
  AUDIT_WINDOWS,
  auditReportFromDataDir,
  isAuditWindow,
  type AuditReport,
} from "../persistence/mcp-audit-report.js";
import { emit, type OutputContext } from "./util.js";
import { type CommandMetadataMap, NO_PROJECT_ARGV, NO_PROJECT_JSON } from "./metadata.js";

function pct(v: number | null): string {
  return v === null ? "n/a" : `${(v * 100).toFixed(1)}%`;
}

export function formatAuditReport(r: AuditReport): string {
  const lines: string[] = [];
  const window = r.window.since === null ? "all" : `since ${r.window.since}`;
  const src = r.source.path === null ? "(in-memory host, no audit log)" : r.source.path;
  lines.push(`audit report — ${src}`);
  lines.push(
    `window: ${window} — ${r.totals.calls} call(s): ${r.totals.ok} ok, ${r.totals.failed} failed, ${r.totals.rejected} rejected, ${r.totals.replayed} replayed, ${r.totals.dry_run} dry-run`,
  );
  const sloState = r.slo.met === null ? "undecided" : r.slo.met ? "MET" : `NOT MET (shortfall ${r.slo.shortfall} call(s))`;
  lines.push(`success rate: ${pct(r.totals.success_rate)} — SLO ${pct(r.slo.target)}: ${sloState}`);
  if (r.source.skipped > 0) lines.push(`warning: ${r.source.skipped} unparseable line(s) skipped`);
  if (r.per_tool.length > 0) {
    lines.push("");
    lines.push("per tool (calls ok failed rejected p50ms p95ms):");
    for (const t of r.per_tool) {
      lines.push(
        `  ${t.tool}  ${t.calls} ${t.ok} ${t.failed} ${t.rejected}  ${t.p50_ms ?? "-"} ${t.p95_ms ?? "-"}`,
      );
    }
  }
  if (r.error_classes.length > 0) {
    lines.push("");
    lines.push("error classes (count share class):");
    for (const c of r.error_classes) {
      lines.push(`  ${c.count}  ${pct(c.share)}  ${c.class}`);
    }
  }
  // The resource surface, reported apart from the tool totals above: a tool
  // row is about what an agent tried to change, a resource row about how much
  // content left the server. Printed even at zero, because "no reads" and
  // "reads not counted" look identical when the section is omitted.
  lines.push("");
  lines.push(
    `resources: ${r.resources.reads} read(s): ${r.resources.ok} ok, ` +
      `${r.resources.failed} refused, ${r.resources.bytes_served} B served`,
  );
  const refusals = Object.entries(r.resources.refused).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of refusals) {
    lines.push(`  ${count}  ${reason}`);
  }
  return lines.join("\n");
}

export function buildMcpCommand(host: Host): Command {
  const cmd = new Command("mcp");
  cmd.description("MCP server introspection (SPEC-MCP-SERVER)");

  cmd
    .command("audit-report")
    .description(
      "Aggregate <data-dir>/mcp-audit.jsonl into per-tool outcomes, error classes and a success-rate SLO (§9.5)",
    )
    .option("--window <window>", `relative window: ${AUDIT_WINDOWS.join(" | ")}`, "all")
    .option("--since <iso>", "absolute lower bound (overrides --window)")
    .option("--until <iso>", "absolute upper bound")
    .option("--top <n>", "max error classes to list", "10")
    .option("--slo <rate>", "success-rate target in (0, 1]", "0.9")
    .option("--json", "emit JSON")
    .action((opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      if (!isAuditWindow(opts.window)) {
        throw new FDPMException("validation", `--window must be one of ${AUDIT_WINDOWS.join(", ")}`, {
          evidence: { window: opts.window },
        });
      }
      const top = Number.parseInt(String(opts.top), 10);
      const slo = Number.parseFloat(String(opts.slo));
      let report: AuditReport;
      try {
        report = auditReportFromDataDir(host.dataDir, {
          window: opts.window,
          since: opts.since,
          until: opts.until,
          top,
          sloTarget: slo,
        });
      } catch (err) {
        throw new FDPMException("validation", err instanceof Error ? err.message : String(err));
      }
      emit(ctx, report, () => formatAuditReport(report));
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "mcp audit-report": {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};
