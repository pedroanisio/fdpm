/**
 * SPEC-MCP-SERVER §8.7 — `dry_run` on Tier-3 (destructive) tools.
 *
 * `dry_run: true` computes the would-affect set through the core
 * delete-preview module and appends nothing. Because a preview has no
 * side effect it is a Tier-1-equivalent read: it passes the
 * destructive gate and the confirmation-token gate, and needs no
 * idempotency key. PURPOSE.md names this as the human approval point
 * ("sees the planned op set and approves").
 *
 * Covers all five Tier-3 tools, the gate bypass (and non-bypass for
 * real calls), not_found on missing targets, the audit record, and the
 * response shape: `{ ok: true, dry_run: true, would_affect, post_state_summary }`
 * with no `operation`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { TIER_3_TOOLS } from "../../src/mcp/manifest.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";

const WB = "wb-dry";

function makeCtx(over: Partial<DispatchCtx> = {}): DispatchCtx {
  return {
    session: createSession({ maxPerMinute: 6000 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
    ...over,
  };
}

async function makeHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await host.createProject({ workbook_id: WB, name: "Dry", profile_id: TEST_PROFILE.id });
  await host.createPrimitive(WB, { id: "section:s1", type_id: "test:section", field_values: { title: "S1", number: 1 } });
  await host.createPrimitive(WB, { id: "section:s2", type_id: "test:section", field_values: { title: "S2", number: 2 } });
  await host.createPrimitive(WB, { id: "para:p1", type_id: "test:para", field_values: { text: "t" } });
  await host.createRelation(WB, {
    id: "rel:s1-p1",
    type_id: "test:rel:contains",
    source_id: "section:s1",
    target_id: "para:p1",
    field_values: {},
  });
  return host;
}

interface DryOut {
  ok: boolean;
  dry_run?: boolean;
  operation?: unknown;
  operations?: unknown;
  would_affect: Record<string, unknown>;
  post_state_summary: Record<string, unknown>;
}
interface ErrOut {
  error: { category: string; evidence?: { reason?: string } };
}

describe("dry_run — passes the destructive gate, appends nothing", () => {
  it("fdpm.primitive.delete dry_run with destructive DISABLED returns would_affect and changes nothing", async () => {
    const host = await makeHost();
    const before = host.getLog(WB).length;
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", dry_run: true });
    expect(r.isError).toBe(false);
    const sc = r.structuredContent as DryOut;
    expect(sc.ok).toBe(true);
    expect(sc.dry_run).toBe(true);
    expect("operation" in sc).toBe(false);
    expect(sc.would_affect).toMatchObject({
      workbook_id: WB,
      id: "section:s1",
      type_id: "test:section",
    });
    expect((sc.would_affect["referencing_relations"] as unknown[]).length).toBe(1);
    expect(sc.post_state_summary).toEqual({ workbook_id: WB, id: "section:s1" });
    expect(host.getLog(WB).length).toBe(before);
    expect("section:s1" in host.getProject(WB).primitives).toBe(true);
  });

  it("a REAL delete with destructive disabled is still refused (the gate is unchanged for dry_run:false / absent)", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    for (const args of [
      { workbook_id: WB, id: "section:s1", idempotency_key: "k" },
      { workbook_id: WB, id: "section:s1", idempotency_key: "k", dry_run: false },
    ]) {
      const r = await d.call("fdpm.primitive.delete", args);
      expect(r.isError).toBe(true);
      expect((r.structuredContent as ErrOut).error.evidence?.reason).toBe("destructive_disabled");
    }
  });

  it("only a strict boolean true bypasses the gate (a truthy string does not)", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", dry_run: "yes" });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as ErrOut).error.evidence?.reason).toBe("destructive_disabled");
  });

  it("dry_run also bypasses the confirmation-token gate (no side effect to confirm)", async () => {
    const host = await makeHost();
    const d = createDispatcher(
      host,
      makeCtx({ enableDestructive: true, requireConfirmationToken: true, confirmationToken: "secret" }),
      null,
    );
    const preview = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", dry_run: true });
    expect(preview.isError).toBe(false);
    const real = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", idempotency_key: "k" });
    expect(real.isError).toBe(true);
    expect((real.structuredContent as ErrOut).error.evidence?.reason).toBe("confirmation_required");
  });

  it("dry_run needs no idempotency_key", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx({ enableDestructive: true }), null);
    const r = await d.call("fdpm.relation.delete", { workbook_id: WB, id: "rel:s1-p1", dry_run: true });
    expect(r.isError).toBe(false);
    expect((r.structuredContent as DryOut).would_affect).toEqual({
      workbook_id: WB,
      id: "rel:s1-p1",
      type_id: "test:rel:contains",
      source_id: "section:s1",
      target_id: "para:p1",
    });
  });
});

describe("dry_run — every Tier-3 tool", () => {
  it("all five Tier-3 tools accept dry_run in their input schema", () => {
    expect(TIER_3_TOOLS).toHaveLength(5);
    for (const t of TIER_3_TOOLS) {
      const shape = (t.input as unknown as { shape: Record<string, unknown> }).shape;
      expect(shape, `${t.name} missing dry_run`).toHaveProperty("dry_run");
      expect(shape, `${t.name} missing idempotency_key`).toHaveProperty("idempotency_key");
    }
  });

  it("fdpm.workbook.delete dry_run summarises counts", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.workbook.delete", { workbook_id: WB, dry_run: true });
    expect(r.isError).toBe(false);
    const sc = r.structuredContent as DryOut;
    expect(sc.dry_run).toBe(true);
    expect(sc.would_affect).toMatchObject({ workbook_id: WB, primitive_count: 3, relation_count: 1, profile_id: TEST_PROFILE.id });
    expect(host.listProjects().map((p) => p.id)).toContain(WB);
  });

  it("fdpm.primitive.delete_batch dry_run previews every id in order and deletes nothing", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.primitive.delete_batch", {
      workbook_id: WB,
      primitive_ids: ["section:s2", "section:s1"],
      dry_run: true,
    });
    expect(r.isError).toBe(false);
    const sc = r.structuredContent as DryOut;
    expect(sc.ok).toBe(true);
    expect(sc.dry_run).toBe(true);
    expect("operations" in sc).toBe(false);
    const items = sc.would_affect["items"] as Array<{ id: string }>;
    expect(items.map((i) => i.id)).toEqual(["section:s2", "section:s1"]);
    expect(sc.would_affect["count"]).toBe(2);
    expect(sc.post_state_summary).toEqual({ count: 0, deleted_ids: [] });
    expect(Object.keys(host.getProject(WB).primitives)).toHaveLength(3);
  });

  it("fdpm.relation.delete_batch dry_run previews relations", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.relation.delete_batch", { workbook_id: WB, relation_ids: ["rel:s1-p1"], dry_run: true });
    expect(r.isError).toBe(false);
    const sc = r.structuredContent as DryOut;
    expect((sc.would_affect["items"] as Array<{ id: string }>)[0]!.id).toBe("rel:s1-p1");
    expect(Object.keys(host.getProject(WB).relations)).toHaveLength(1);
  });

  it("a missing target is a not_found protocol error, same as the real delete", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const single = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:ghost", dry_run: true });
    expect(single.isError).toBe(true);
    expect((single.structuredContent as ErrOut).error.category).toBe("not_found");
    const batch = await d.call("fdpm.primitive.delete_batch", {
      workbook_id: WB,
      primitive_ids: ["section:s1", "section:ghost"],
      dry_run: true,
    });
    expect(batch.isError).toBe(true);
    expect((batch.structuredContent as ErrOut).error.category).toBe("not_found");
  });
});

describe("dry_run — audit trail", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "fdpm-dry-audit-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("records start and complete entries flagged dry_run:true with tier destructive", async () => {
    const host = await makeHost();
    const audit = new McpAuditLog(dataDir);
    const d = createDispatcher(host, makeCtx(), audit);
    await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", dry_run: true });
    const lines = readFileSync(join(dataDir, "mcp-audit.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((e) => e["phase"])).toEqual(["start", "complete"]);
    expect(lines[0]).toMatchObject({ tier: "destructive", dry_run: true });
    expect(lines[0]!["idempotency_key"]).toBeUndefined();
    expect(lines[1]).toMatchObject({ ok: true, dry_run: true });
  });
});
