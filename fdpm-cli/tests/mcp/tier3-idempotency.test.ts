/**
 * SPEC-MCP-SERVER §8.7 — idempotency keys on Tier-3 (destructive) calls.
 *
 * A delete is not retry-safe unless the server can recognise a
 * duplicate. Every non-dry-run Tier-3 call MUST carry
 * `idempotency_key`; the session keeps `(tool, key) → result` for a
 * TTL and:
 *   - replays the cached result on the same key + same args (no second
 *     operation is appended; the audit entry says `replayed: true`);
 *   - refuses the same key with DIFFERENT args (`conflict` /
 *     `idempotency_key_reused`) — the agent reused a key by mistake;
 *   - coalesces concurrent same-key calls into one execution;
 *   - forgets keys after the TTL, after which the call executes again;
 *   - caches handler outcomes only (a not_found is replayed too), never
 *     gate refusals; dry-run calls never touch the cache.
 *
 * Reference design: OpenClaw gateway idempotency (session-scoped key,
 * TTL-bounded cache, atomic check-then-execute); Stripe semantics for
 * key reuse with different parameters.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";

const WB = "wb-idem";

function makeCtx(opts: { idempotencyTtlMs?: number } = {}): DispatchCtx {
  return {
    session: createSession({ maxPerMinute: 6000, ...opts }),
    enableDestructive: true,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
}

async function makeHost(n = 4): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await host.createProject({ workbook_id: WB, name: "Idem", profile_id: TEST_PROFILE.id });
  for (let i = 1; i <= n; i++) {
    await host.createPrimitive(WB, {
      id: `section:s${i}`,
      type_id: "test:section",
      field_values: { title: `S${i}`, number: i },
    });
  }
  return host;
}

function revision(host: Host): number {
  return host.getLog(WB).length;
}

interface ErrOut {
  error: { category: string; evidence?: { reason?: string } };
}

describe("Tier-3 idempotency — key is mandatory", () => {
  it("refuses a delete without idempotency_key: validation / idempotency_key_required, nothing deleted", async () => {
    const host = await makeHost();
    const before = revision(host);
    const d = createDispatcher(host, makeCtx(), null);
    const r = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1" });
    expect(r.isError).toBe(true);
    const env = (r.structuredContent as ErrOut).error;
    expect(env.category).toBe("validation");
    expect(env.evidence?.reason).toBe("idempotency_key_required");
    expect("section:s1" in host.getProject(WB).primitives).toBe(true);
    expect(revision(host)).toBe(before);
  });

  it("every Tier-3 tool refuses without a key (workbook, primitive, relation, both batches)", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const calls: Array<[string, Record<string, unknown>]> = [
      ["fdpm.workbook.delete", { workbook_id: WB }],
      ["fdpm.primitive.delete", { workbook_id: WB, id: "section:s1" }],
      ["fdpm.relation.delete", { workbook_id: WB, id: "rel:none" }],
      ["fdpm.primitive.delete_batch", { workbook_id: WB, primitive_ids: ["section:s1"] }],
      ["fdpm.relation.delete_batch", { workbook_id: WB, relation_ids: ["rel:none"] }],
    ];
    for (const [name, args] of calls) {
      const r = await d.call(name, args);
      expect(r.isError, name).toBe(true);
      expect((r.structuredContent as ErrOut).error.evidence?.reason, name).toBe(
        "idempotency_key_required",
      );
    }
    expect(Object.keys(host.getProject(WB).primitives)).toHaveLength(4);
  });

  it("rejects keys that are empty or longer than 200 characters via the input schema", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    for (const key of ["", "x".repeat(201)]) {
      const r = await d.call("fdpm.primitive.delete", {
        workbook_id: WB,
        id: "section:s1",
        idempotency_key: key,
      });
      expect(r.isError).toBe(true);
      expect((r.structuredContent as ErrOut).error.category).toBe("validation");
    }
  });
});

describe("Tier-3 idempotency — replay, conflict, scope", () => {
  it("first call executes; the same key + same args replays the cached result without a second operation", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const args = { workbook_id: WB, id: "section:s1", idempotency_key: "k-1" };
    const first = await d.call("fdpm.primitive.delete", args);
    expect(first.isError).toBe(false);
    const rev = revision(host);
    const again = await d.call("fdpm.primitive.delete", args);
    expect(again.isError).toBe(false);
    expect(again.structuredContent).toEqual(first.structuredContent);
    expect(revision(host)).toBe(rev);
    expect("section:s1" in host.getProject(WB).primitives).toBe(false);
  });

  it("the same key with different args is refused: conflict / idempotency_key_reused, nothing deleted", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", idempotency_key: "k-2" });
    const rev = revision(host);
    const r = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s2", idempotency_key: "k-2" });
    expect(r.isError).toBe(true);
    const env = (r.structuredContent as ErrOut).error;
    expect(env.category).toBe("conflict");
    expect(env.evidence?.reason).toBe("idempotency_key_reused");
    expect("section:s2" in host.getProject(WB).primitives).toBe(true);
    expect(revision(host)).toBe(rev);
  });

  it("keys are scoped per tool: the same key on another Tier-3 tool executes independently", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const a = await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:s1", idempotency_key: "shared" });
    expect(a.isError).toBe(false);
    const b = await d.call("fdpm.primitive.delete_batch", {
      workbook_id: WB,
      primitive_ids: ["section:s2"],
      idempotency_key: "shared",
    });
    expect(b.isError).toBe(false);
    expect("section:s2" in host.getProject(WB).primitives).toBe(false);
  });

  it("handler errors are cached too: a not_found is replayed on the same key + args", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const args = { workbook_id: WB, id: "section:nope", idempotency_key: "k-3" };
    const first = await d.call("fdpm.primitive.delete", args);
    expect(first.isError).toBe(true);
    expect((first.structuredContent as ErrOut).error.category).toBe("not_found");
    const again = await d.call("fdpm.primitive.delete", args);
    expect(again.structuredContent).toEqual(first.structuredContent);
  });

  it("gate refusals are never cached: after enabling destructive, the same key executes", async () => {
    const host = await makeHost();
    const session = createSession({ maxPerMinute: 6000 });
    const off: DispatchCtx = { ...makeCtx(), session, enableDestructive: false };
    const on: DispatchCtx = { ...makeCtx(), session, enableDestructive: true };
    const args = { workbook_id: WB, id: "section:s1", idempotency_key: "k-4" };
    const refused = await createDispatcher(host, off, null).call("fdpm.primitive.delete", args);
    expect((refused.structuredContent as ErrOut).error.evidence?.reason).toBe("destructive_disabled");
    const executed = await createDispatcher(host, on, null).call("fdpm.primitive.delete", args);
    expect(executed.isError).toBe(false);
    expect("section:s1" in host.getProject(WB).primitives).toBe(false);
  });

  it("dry-run calls neither need nor consume a key: a later real delete with that key executes", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const preview = await d.call("fdpm.primitive.delete", {
      workbook_id: WB,
      id: "section:s1",
      dry_run: true,
      idempotency_key: "k-5",
    });
    expect(preview.isError).toBe(false);
    expect((preview.structuredContent as { dry_run?: boolean }).dry_run).toBe(true);
    expect("section:s1" in host.getProject(WB).primitives).toBe(true);
    const real = await d.call("fdpm.primitive.delete", {
      workbook_id: WB,
      id: "section:s1",
      idempotency_key: "k-5",
    });
    expect(real.isError).toBe(false);
    expect((real.structuredContent as { dry_run?: boolean }).dry_run).toBeUndefined();
    expect("section:s1" in host.getProject(WB).primitives).toBe(false);
  });
});

describe("Tier-3 idempotency — concurrency and TTL", () => {
  it("concurrent calls with the same key coalesce into exactly one operation", async () => {
    const host = await makeHost();
    const d = createDispatcher(host, makeCtx(), null);
    const before = revision(host);
    const args = { workbook_id: WB, id: "section:s1", idempotency_key: "k-6" };
    const [a, b, c] = await Promise.all([
      d.call("fdpm.primitive.delete", args),
      d.call("fdpm.primitive.delete", args),
      d.call("fdpm.primitive.delete", args),
    ]);
    for (const r of [a, b, c]) expect(r.isError).toBe(false);
    expect(b.structuredContent).toEqual(a.structuredContent);
    expect(c.structuredContent).toEqual(a.structuredContent);
    expect(revision(host)).toBe(before + 1);
  });

  it("after the TTL the key is forgotten and the call executes again (here: not_found, since the target is gone)", async () => {
    const host = await makeHost();
    const ctx = makeCtx({ idempotencyTtlMs: 30 });
    const d = createDispatcher(host, ctx, null);
    const args = { workbook_id: WB, id: "section:s1", idempotency_key: "k-7" };
    const first = await d.call("fdpm.primitive.delete", args);
    expect(first.isError).toBe(false);
    expect(ctx.session.idempotency.size()).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    const second = await d.call("fdpm.primitive.delete", args);
    expect(second.isError).toBe(true);
    expect((second.structuredContent as ErrOut).error.category).toBe("not_found");
    // The expired entry was pruned; only the fresh one remains.
    expect(ctx.session.idempotency.size()).toBe(1);
  });

  it("the cache is bounded: entries beyond the cap evict the oldest", async () => {
    const host = await makeHost(2);
    const ctx = makeCtx();
    const d = createDispatcher(host, ctx, null);
    const cap = ctx.session.idempotency.capacity();
    expect(cap).toBeGreaterThan(100);
    for (let i = 0; i < cap + 5; i++) {
      // not_found outcomes are cached like any handler outcome.
      await d.call("fdpm.primitive.delete", { workbook_id: WB, id: "section:missing", idempotency_key: `cap-${i}` });
    }
    expect(ctx.session.idempotency.size()).toBe(cap);
  });
});

describe("Tier-3 idempotency — audit trail", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "fdpm-idem-audit-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("a replay writes a complete entry with replayed:true and a fresh call_id; the original start entry carries the key", async () => {
    const host = await makeHost();
    const audit = new McpAuditLog(dataDir);
    const d = createDispatcher(host, makeCtx(), audit);
    const args = { workbook_id: WB, id: "section:s1", idempotency_key: "k-8" };
    await d.call("fdpm.primitive.delete", args);
    await d.call("fdpm.primitive.delete", args);
    const lines = readFileSync(join(dataDir, "mcp-audit.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const starts = lines.filter((e) => e["phase"] === "start");
    const completes = lines.filter((e) => e["phase"] === "complete");
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(starts[0]!["tier"]).toBe("destructive");
    expect(starts[0]!["idempotency_key"]).toBe("k-8");
    expect(starts[0]!["dry_run"]).toBe(false);
    expect(completes).toHaveLength(2);
    expect(completes[0]!["replayed"]).toBeUndefined();
    expect(completes[1]!["replayed"]).toBe(true);
    expect(completes[1]!["call_id"]).not.toBe(completes[0]!["call_id"]);
  });
});
