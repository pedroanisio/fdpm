/**
 * SPEC-MCP-SERVER §22.6 — audit-log completeness under load.
 *
 * 100 % of dispatched tool calls produce both `start` and `complete`
 * audit-log entries; the call_id is shared across the pair so a
 * post-incident reviewer can correlate. `validation_status` is
 * populated correctly for both Tier-1 (`n/a`) and Tier-2 (`pass` or
 * `fail`) outcomes.
 *
 * The reduced load (200 calls vs the SPEC's 1000) is for test runtime
 * only; the audit-log writer is synchronous and per-call cost is
 * dominated by Host work, not the audit append. The contract is
 * "every call produces both entries", which is invariant in load.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-audit-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("audit log — completeness and validation_status", () => {
  it("rapid calls produce paired start/complete entries with correct validation_status", async () => {
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE);
    await host.createProject({
      workbook_id: "p1",
      name: "P1",
      profile_id: "test:demo",
    });

    const audit = new McpAuditLog(dataDir);
    const session = createSession({ maxPerMinute: 100000 });
    const ctx: DispatchCtx = {
      session,
      enableDestructive: false,
      enabledPlugins: new Set(),
      auditFullArgs: false,
      hostOptions: { dataDir, noPlugins: true },
    };
    const dispatcher = createDispatcher(host, ctx, audit);

    // Mix Tier-1 + Tier-2 happy-path. 100 of each = 200 calls total.
    const N = 100;
    let primIndex = 0;
    for (let i = 0; i < N; i += 1) {
      const r1 = await dispatcher.call("fdpm.health", {});
      expect(r1.isError).toBe(false);
      const r2 = await dispatcher.call("fdpm.primitive.create", {
        workbook_id: "p1",
        primitive: {
          id: `section:${primIndex}`,
          type_id: "test:section",
          field_values: { title: `S${primIndex}`, number: primIndex },
        },
      });
      expect(r2.isError).toBe(false);
      primIndex += 1;
    }

    const text = readFileSync(join(dataDir, "mcp-audit.jsonl"), "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2 * N * 2); // 200 starts + 200 completes

    type Entry = {
      phase: "start" | "complete" | "reload";
      call_id?: string;
      tool?: string;
      validation_status?: "pass" | "fail" | "n/a";
    };
    const entries = lines.map((l) => JSON.parse(l) as Entry);

    // Every call_id appears exactly twice (start + complete).
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.call_id !== undefined) {
        counts.set(e.call_id, (counts.get(e.call_id) ?? 0) + 1);
      }
    }
    for (const [id, n] of counts) {
      expect(n, `call_id ${id} appeared ${n} times`).toBe(2);
    }
    expect(counts.size).toBe(2 * N);

    // Tier-1 completes carry validation_status='n/a'.
    const tier1Completes = entries.filter(
      (e) => e.phase === "complete" && e.tool === "fdpm.health",
    );
    expect(tier1Completes.length).toBe(N);
    for (const e of tier1Completes) {
      expect(e.validation_status).toBe("n/a");
    }

    // Tier-2 completes carry validation_status='pass' on success.
    const tier2Completes = entries.filter(
      (e) => e.phase === "complete" && e.tool === "fdpm.primitive.create",
    );
    expect(tier2Completes.length).toBe(N);
    for (const e of tier2Completes) {
      expect(e.validation_status).toBe("pass");
    }
  });

  it("a Tier-2 §7 rejection records validation_status='fail'", async () => {
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE);
    await host.createProject({
      workbook_id: "p1",
      name: "P1",
      profile_id: "test:demo",
    });

    const audit = new McpAuditLog(dataDir);
    const session = createSession({ maxPerMinute: 600 });
    const ctx: DispatchCtx = {
      session,
      enableDestructive: false,
      enabledPlugins: new Set(),
      auditFullArgs: false,
      hostOptions: { dataDir, noPlugins: true },
    };
    const dispatcher = createDispatcher(host, ctx, audit);

    const result = await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:big",
        type_id: "test:section",
        // Title exceeds TEST_PROFILE max_length of 200.
        field_values: { title: "x".repeat(250), number: 1 },
      },
    });
    expect(result.isError).toBe(false);
    expect(
      (result.structuredContent as { ok: boolean }).ok,
    ).toBe(false);

    const text = readFileSync(join(dataDir, "mcp-audit.jsonl"), "utf8");
    const lines = text.split("\n").filter((l) => l.length > 0);
    const completes = lines
      .map((l) => JSON.parse(l) as { phase: string; validation_status?: string; ok?: boolean })
      .filter((e) => e.phase === "complete");
    expect(completes).toHaveLength(1);
    expect(completes[0]!.validation_status).toBe("fail");
    expect(completes[0]!.ok).toBe(false);
  });
});

describe("SPEC-MCP-SERVER §8.7 — pre-execution audit for Tier-3 calls", () => {
  it("the start entry (intent) lands before the handler runs and carries tier, idempotency_key and dry_run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdpm-audit-t3-"));
    try {
      const host = new Host({ dataDir: null, noPlugins: true });
      await host.load();
      await host.registerProfile(TEST_PROFILE);
      await host.createProject({ workbook_id: "wb-a", name: "A", profile_id: TEST_PROFILE.id });
      await host.createPrimitive("wb-a", {
        id: "section:x",
        type_id: "test:section",
        field_values: { title: "X", number: 1 },
      });
      const audit = new McpAuditLog(dir);
      const ctx: DispatchCtx = {
        session: createSession({ maxPerMinute: 600 }),
        enableDestructive: true,
        enabledPlugins: new Set(),
        auditFullArgs: false,
        hostOptions: { dataDir: null, noPlugins: true },
      };
      const d = createDispatcher(host, ctx, audit);
      await d.call("fdpm.primitive.delete", { workbook_id: "wb-a", id: "section:x", idempotency_key: "audit-1" });
      const lines = readFileSync(join(dir, "mcp-audit.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(lines.map((e) => e["phase"])).toEqual(["start", "complete"]);
      expect(lines[0]).toMatchObject({
        tool: "fdpm.primitive.delete",
        tier: "destructive",
        idempotency_key: "audit-1",
        dry_run: false,
      });
      expect(lines[1]).toMatchObject({ ok: true, validation_status: "n/a" });
      expect(lines[1]!["replayed"]).toBeUndefined();
      // Tier-1/2 entries stay unchanged: no tier/key fields.
      await d.call("fdpm.health", {});
      const after = readFileSync(join(dir, "mcp-audit.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      const healthStart = after.find((e) => e["tool"] === "fdpm.health" && e["phase"] === "start")!;
      expect(healthStart["tier"]).toBeUndefined();
      expect(healthStart["idempotency_key"]).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
