/** `auditReport(host, opts)` — the SDK face of the audit flywheel. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../src/core/host.js";
import { auditReport } from "../src/sdk.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-sdk-audit-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("auditReport", () => {
  it("reads the host's data dir and aggregates", async () => {
    writeFileSync(
      join(dataDir, "mcp-audit.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        call_id: "c",
        phase: "complete",
        session: "s",
        tool: "fdpm.relation.create",
        args_hash: "h",
        ok: false,
        duration_ms: 3,
        validation_status: "fail",
        rule_ids: ["core:cardinality"],
      }) + "\n",
    );
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    expect(host.dataDir).toBe(dataDir);
    const r = auditReport(host, { window: "24h", top: 3 });
    expect(r.totals.calls).toBe(1);
    expect(r.error_classes[0]!.class).toBe("fdpm.relation.create rule:core:cardinality");
  });

  it("an in-memory host reports no source and zero calls", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    expect(host.dataDir).toBeNull();
    expect(auditReport(host).totals.calls).toBe(0);
  });
});
