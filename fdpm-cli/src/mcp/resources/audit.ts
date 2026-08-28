/**
 * `fdpm://audit/report[/{window}]` — the audit report as a resource
 * (SPEC-MCP-SERVER §9.5).
 *
 * Reads go through resources, not `get_*` tools (PURPOSE.md), and a
 * resource costs no catalog bytes. The body is the aggregated
 * `mcp-audit.jsonl` for the Host's data dir: per-tool outcomes, error
 * classes (`error_category/reason` for protocol errors, `rule:<id>`
 * for §7 rejections), a success-rate SLO, latency percentiles.
 *
 * `{window}` ∈ 1h | 24h | 7d | all; the bare URI is `all`. An in-memory
 * Host has no log and reads as an empty report — that is a valid
 * state, not an error. Unknown windows return `null` from `match` so
 * the registry raises `not_found` with the supported template.
 */
import type { Host } from "../../core/host.js";
import {
  AUDIT_WINDOWS,
  auditReportFromDataDir,
  isAuditWindow,
  type AuditWindow,
} from "../../persistence/mcp-audit-report.js";
import type {
  ResourceEntry,
  ResourceProvider,
  ResourceReadResult,
  ResourceTemplateEntry,
} from "./types.js";

export const AUDIT_REPORT_URI = "fdpm://audit/report";
export const AUDIT_REPORT_URI_TEMPLATE = "fdpm://audit/report/{window}";
export const AUDIT_REPORT_MIME = "application/json";

export interface AuditUriMatch {
  window: AuditWindow;
}

export function parseAuditUri(uri: string): AuditUriMatch | null {
  if (uri === AUDIT_REPORT_URI) return { window: "all" };
  const prefix = AUDIT_REPORT_URI + "/";
  if (!uri.startsWith(prefix)) return null;
  const rest = uri.slice(prefix.length);
  return isAuditWindow(rest) ? { window: rest } : null;
}

export const auditResourceProvider: ResourceProvider<AuditUriMatch> = {
  id: "fdpm.audit",

  templates(_host: Host): readonly ResourceTemplateEntry[] {
    return [
      {
        uriTemplate: AUDIT_REPORT_URI_TEMPLATE,
        name: "MCP audit report",
        description: `Aggregated mcp-audit.jsonl for this server's data dir: per-tool outcomes, error classes (rule:<rule_id> for rejections, category/reason for protocol errors), success-rate SLO, p50/p95 latency. window ∈ ${AUDIT_WINDOWS.join(" | ")}; the bare fdpm://audit/report is \`all\`.`,
        mimeType: AUDIT_REPORT_MIME,
      },
    ];
  },

  enumerate(_host: Host): readonly ResourceEntry[] {
    return [
      {
        uri: AUDIT_REPORT_URI,
        name: "MCP audit report (all)",
        description: "Tool-call outcomes and error classes from the audit log, whole history.",
        mimeType: AUDIT_REPORT_MIME,
      },
    ];
  },

  match(uri: string): AuditUriMatch | null {
    return parseAuditUri(uri);
  },

  async read(host: Host, matched: AuditUriMatch): Promise<ResourceReadResult> {
    const report = auditReportFromDataDir(host.dataDir, { window: matched.window });
    const uri = matched.window === "all" ? AUDIT_REPORT_URI : `${AUDIT_REPORT_URI}/${matched.window}`;
    return { uri, mimeType: AUDIT_REPORT_MIME, text: JSON.stringify(report, null, 2) };
  },
};
