/**
 * `fdpm mcp audit-report` — the CLI face of the audit flywheel. Runs the
 * real binary against a seeded audit log (emit() writes via a raw fd).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const BIN = join(process.cwd(), "src", "bin", "fdpm.ts");
const TIMEOUT_MS = 60_000;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-cli-audit-"));
  const now = Date.now();
  const row = (over: Record<string, unknown>) =>
    JSON.stringify({
      ts: new Date(now - 1000).toISOString(),
      call_id: "c",
      phase: "complete",
      session: "s",
      tool: "fdpm.primitive.create",
      args_hash: "h",
      ok: true,
      duration_ms: 12,
      validation_status: "pass",
      ...over,
    });
  writeFileSync(
    join(dataDir, "mcp-audit.jsonl"),
    [
      row({}),
      row({ ok: false, validation_status: "fail", rule_ids: ["core:id-format"] }),
      row({ tool: "fdpm.primitive.delete", ok: false, validation_status: "n/a", error_category: "validation", error_reason: "idempotency_key_required" }),
      row({ ts: new Date(now - 3 * 86_400_000).toISOString() }),
    ].join("\n") + "\n",
  );
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function fdpm(...argv: string[]): { status: number | null; stdout: string; stderr: string } {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  const r = spawnSync(TSX, [BIN, ...argv], {
    env: { ...env, FDPM_DATA_DIR: dataDir, FDPM_NO_PLUGINS: "1" },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("fdpm mcp audit-report", () => {
  it("--json prints the full report", () => {
    const r = fdpm("mcp", "audit-report", "--json");
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout) as { totals: { calls: number; rejected: number; failed: number }; error_classes: Array<{ class: string }> };
    expect(j.totals.calls).toBe(4);
    expect(j.totals.rejected).toBe(1);
    expect(j.totals.failed).toBe(1);
    expect(j.error_classes.map((c) => c.class)).toEqual(
      expect.arrayContaining(["fdpm.primitive.create rule:core:id-format", "fdpm.primitive.delete validation/idempotency_key_required"]),
    );
  }, TIMEOUT_MS);

  it("--window 24h excludes the 3-day-old call; --top bounds classes", () => {
    const r = fdpm("mcp", "audit-report", "--window", "24h", "--top", "1", "--json");
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout) as { totals: { calls: number }; error_classes: unknown[] };
    expect(j.totals.calls).toBe(3);
    expect(j.error_classes).toHaveLength(1);
  }, TIMEOUT_MS);

  it("human mode prints the success rate and the error classes", () => {
    const r = fdpm("mcp", "audit-report");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/success rate/i);
    expect(r.stdout).toMatch(/core:id-format/);
  }, TIMEOUT_MS);

  it("an invalid window is a usage error", () => {
    const r = fdpm("mcp", "audit-report", "--window", "2h", "--json");
    expect(r.status).not.toBe(0);
  }, TIMEOUT_MS);
});
