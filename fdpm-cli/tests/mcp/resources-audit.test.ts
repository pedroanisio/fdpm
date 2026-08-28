/**
 * `fdpm://audit/report[/{window}]` — the audit report as a resource.
 *
 * Reads go through resources (PURPOSE.md), so the flywheel's report is
 * a resource, not a Tier-1 tool: no catalog bytes, readable by any
 * client and by a human through `resources/read`. `{window}` ∈
 * 1h | 24h | 7d | all; the bare URI means `all`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";
import {
  AUDIT_REPORT_MIME,
  AUDIT_REPORT_URI,
  AUDIT_REPORT_URI_TEMPLATE,
  auditResourceProvider,
  parseAuditUri,
} from "../../src/mcp/resources/audit.js";
import { profileResourceProvider } from "../../src/mcp/resources/profile.js";
import { renderResourceProvider } from "../../src/mcp/resources/render.js";
import { schemaResourceProvider } from "../../src/mcp/resources/schema.js";
import { guideResourceProvider } from "../../src/mcp/resources/guide.js";
import { dispatchRead, listResources, listTemplates } from "../../src/mcp/resources/registry.js";

describe("parseAuditUri", () => {
  it("bare URI is the `all` window; explicit windows parse; anything else is null", () => {
    expect(AUDIT_REPORT_URI).toBe("fdpm://audit/report");
    expect(AUDIT_REPORT_URI_TEMPLATE).toBe("fdpm://audit/report/{window}");
    expect(parseAuditUri("fdpm://audit/report")).toEqual({ window: "all" });
    expect(parseAuditUri("fdpm://audit/report/24h")).toEqual({ window: "24h" });
    expect(parseAuditUri("fdpm://audit/report/all")).toEqual({ window: "all" });
    for (const bad of [
      "fdpm://audit/report/2h",
      "fdpm://audit/report/",
      "fdpm://audit",
      "fdpm://audit/report/24h#x",
      "fdpm://guide",
      "fdpm://schema/profile",
      "https://audit/report",
    ]) {
      expect(parseAuditUri(bad), bad).toBeNull();
    }
  });

  it("does not overlap other providers", () => {
    for (const p of [profileResourceProvider, renderResourceProvider, schemaResourceProvider, guideResourceProvider]) {
      expect(p.match(AUDIT_REPORT_URI)).toBeNull();
    }
    expect(auditResourceProvider.match("fdpm://profiles")).toBeNull();
  });
});

describe("auditResourceProvider — registry and read", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "fdpm-audit-res-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("advertises one template and one concrete resource, application/json", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    expect(auditResourceProvider.templates(host)).toHaveLength(1);
    expect(auditResourceProvider.templates(host)[0]!.uriTemplate).toBe(AUDIT_REPORT_URI_TEMPLATE);
    expect(auditResourceProvider.enumerate(host)[0]).toMatchObject({ uri: AUDIT_REPORT_URI, mimeType: AUDIT_REPORT_MIME });
    expect(AUDIT_REPORT_MIME).toBe("application/json");
    expect(listResources(host).map((r) => r.uri)).toContain(AUDIT_REPORT_URI);
    expect(listTemplates(host).map((t) => t.uriTemplate)).toContain(AUDIT_REPORT_URI_TEMPLATE);
  });

  it("an in-memory host (no data dir) reads as an empty report, not an error", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    const r = await dispatchRead(host, AUDIT_REPORT_URI);
    expect(r.mimeType).toBe(AUDIT_REPORT_MIME);
    const report = JSON.parse(r.text!) as { source: { path: null }; totals: { calls: number } };
    expect(report.source.path).toBeNull();
    expect(report.totals.calls).toBe(0);
  });

  it("reflects the dispatcher's audit log: a Tier-2 rejection shows up as a rule class", async () => {
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE, { persist: true });
    await host.createProject({ workbook_id: "wb-a", name: "A", profile_id: TEST_PROFILE.id });
    const ctx: DispatchCtx = {
      session: createSession({ maxPerMinute: 600 }),
      enableDestructive: false,
      enabledPlugins: new Set(),
      auditFullArgs: false,
      hostOptions: { dataDir, noPlugins: true },
    };
    const d = createDispatcher(host, ctx, new McpAuditLog(dataDir));
    await d.call("fdpm.health", {});
    const rejected = await d.call("fdpm.primitive.create", {
      workbook_id: "wb-a",
      primitive: { id: "not a valid id", type_id: "test:section", field_values: { title: "x", number: 1 } },
    });
    expect(rejected.isError).toBe(false);
    expect((rejected.structuredContent as { ok: boolean }).ok).toBe(false);

    const r = await dispatchRead(host, "fdpm://audit/report/1h");
    expect(r.uri).toBe("fdpm://audit/report/1h");
    const report = JSON.parse(r.text!) as {
      window: { since: string | null };
      totals: { calls: number; rejected: number };
      error_classes: Array<{ class: string }>;
    };
    expect(report.window.since).not.toBeNull();
    expect(report.totals.calls).toBe(2);
    expect(report.totals.rejected).toBe(1);
    expect(report.error_classes.map((c) => c.class)).toContain("fdpm.primitive.create rule:core:id-format");
  });

  it("an unknown window is not_found from the registry", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await expect(dispatchRead(host, "fdpm://audit/report/2h")).rejects.toMatchObject({ category: "not_found" });
  });
});
