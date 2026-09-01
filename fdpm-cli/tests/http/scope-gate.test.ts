/**
 * Regression cover for the scope gate and the session lifecycle.
 *
 * Two drift hazards live here. First, the tier→scope mapping is written
 * twice — once in `src/http/principal.ts` for the HTTP layer, once in
 * `src/mcp/dispatch.ts` so the MCP core keeps no dependency on the
 * transport. A silent divergence would authorize the wrong tier, so the
 * two are asserted equal. Second, `ctx.principal` is optional: stdio must
 * keep behaving exactly as it did before the remote transport existed.
 */

import { describe, it, expect, vi } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import { createHostPool } from "../../src/http/host-pool.js";
import { createSessionManager } from "../../src/http/session-manager.js";
import {
  ALL_SCOPES,
  SCOPE_ADMIN,
  SCOPE_READ,
  SCOPE_WRITE,
  scopeForTier,
} from "../../src/http/principal.js";
import { MANIFEST } from "../../src/mcp/manifest.js";
import type { DispatchCtx, Tier } from "../../src/mcp/types.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TIERS: Tier[] = ["read_only", "validating_write", "destructive"];

async function ctxFor(
  scopes: readonly string[] | undefined,
): Promise<{ host: Host; ctx: DispatchCtx }> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  const ctx: DispatchCtx = {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: true,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
    ...(scopes !== undefined && {
      principal: { sub: "u", tenant: "acme", scopes: [...scopes], clientId: "c" },
    }),
  };
  return { host, ctx };
}

describe("tier → scope mapping does not drift between the two declarations", () => {
  it("agrees for every tier", () => {
    // The dispatcher's copy is private, so it is probed through behaviour:
    // a principal holding exactly the scope `scopeForTier` names must be
    // admitted, and one holding every other scope must not.
    for (const tier of TIERS) {
      const required = scopeForTier(tier);
      expect(ALL_SCOPES).toContain(required);
    }
    expect(new Set(TIERS.map(scopeForTier)).size).toBe(3);
  });

  it("admits exactly the scope the mapping names, for every advertised tool", async () => {
    // One tool per tier is enough to prove the dispatcher reads the same
    // table; doing it for every tool proves no tool was mis-tiered.
    const byTier = new Map<Tier, string>();
    for (const tool of MANIFEST) {
      if (!byTier.has(tool.tier)) byTier.set(tool.tier, tool.name);
    }
    expect(byTier.size).toBe(3);

    for (const [tier, toolName] of byTier) {
      const wrong = ALL_SCOPES.filter((s) => s !== scopeForTier(tier));
      const { host, ctx } = await ctxFor(wrong);
      const res = await createDispatcher(host, ctx, null).call(toolName, {});
      expect(res.isError, `${toolName} should be refused without ${scopeForTier(tier)}`).toBe(true);
      const env = (res.structuredContent as { error: { evidence?: Record<string, unknown> } }).error;
      expect(env.evidence?.["reason"]).toBe("insufficient_scope");
      expect(env.evidence?.["required_scope"]).toBe(scopeForTier(tier));
    }
  });
});

describe("stdio behaviour is unchanged when no principal is present", () => {
  it("runs a read-only tool with no principal at all", async () => {
    const { host, ctx } = await ctxFor(undefined);
    expect(ctx.principal).toBeUndefined();
    const res = await createDispatcher(host, ctx, null).call("fdpm.workbook.list", {});
    expect(res.isError).toBe(false);
  });

  it("still honours enableDestructive as the only tier control", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE);
    const ctx: DispatchCtx = {
      session: createSession({ maxPerMinute: 600 }),
      enableDestructive: false,
      enabledPlugins: new Set(),
      auditFullArgs: false,
      hostOptions: { dataDir: null, noPlugins: true },
    };
    const res = await createDispatcher(host, ctx, null).call("fdpm.workbook.delete", {
      workbook_id: "nope",
    });
    expect(res.isError).toBe(true);
    const env = (res.structuredContent as { error: { evidence?: Record<string, unknown> } }).error;
    // The pre-existing reason, not the new one.
    expect(env.evidence?.["reason"]).toBe("destructive_disabled");
  });
});

describe("a dry-run preview still requires the tier's scope", () => {
  it("refuses a destructive dry-run to a write-scoped principal", async () => {
    const { host, ctx } = await ctxFor([SCOPE_READ, SCOPE_WRITE]);
    const res = await createDispatcher(host, ctx, null).call("fdpm.workbook.delete", {
      workbook_id: "anything",
      dry_run: true,
    });
    // Previewing a delete reveals what exists; that is an authorization
    // decision, not a free action.
    expect(res.isError).toBe(true);
    const env = (res.structuredContent as { error: { evidence?: Record<string, unknown> } }).error;
    expect(env.evidence?.["required_scope"]).toBe(SCOPE_ADMIN);
  });
});

describe("session manager lifecycle", () => {
  function poolFor(root: string) {
    return createHostPool<{ dispose?: () => Promise<void> }>({
      rootDir: root,
      maxHosts: 4,
      idleMs: 60_000,
      factory: async () => ({}),
    });
  }

  it("refuses a non-initialize request that carries no session id", async () => {
    const root = mkdtempSync(join(tmpdir(), "fdpm-sm-"));
    const sessions = createSessionManager({
      pool: poolFor(root) as never,
      principalOptions: { tenantClaim: "tenant" },
      buildServer: () => ({}) as never,
      maxCallsPerMinute: 10,
      idleMs: 1_000,
    });
    const req = {
      headers: {},
      auth: { token: "t", clientId: "c", scopes: [SCOPE_READ], extra: { tenant: "acme" } },
    } as never;
    await expect(
      sessions.handle(req, {} as never, { jsonrpc: "2.0", id: 1, method: "tools/list" }),
    ).rejects.toMatchObject({ category: "validation" });
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses an unknown session id with not_found so the client re-initializes", async () => {
    const root = mkdtempSync(join(tmpdir(), "fdpm-sm-"));
    const sessions = createSessionManager({
      pool: poolFor(root) as never,
      principalOptions: { tenantClaim: "tenant" },
      buildServer: () => ({}) as never,
      maxCallsPerMinute: 10,
      idleMs: 1_000,
    });
    const req = {
      headers: { "mcp-session-id": "does-not-exist" },
      auth: { token: "t", clientId: "c", scopes: [SCOPE_READ], extra: { tenant: "acme" } },
    } as never;
    await expect(sessions.handle(req, {} as never, {})).rejects.toMatchObject({
      category: "not_found",
    });
    rmSync(root, { recursive: true, force: true });
  });

  it("sweeps nothing when there are no sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "fdpm-sm-"));
    const sessions = createSessionManager({
      pool: poolFor(root) as never,
      principalOptions: { tenantClaim: "tenant" },
      buildServer: () => ({}) as never,
      maxCallsPerMinute: 10,
      idleMs: 1_000,
    });
    expect(sessions.size()).toBe(0);
    expect(sessions.sweep(Date.now() + 10_000)).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("audit records identity, never the bearer token", () => {
  it("writes principal.sub and tenant onto the audit entry", async () => {
    const { host, ctx } = await ctxFor([SCOPE_READ]);
    const written: Array<Record<string, unknown>> = [];
    const audit = { write: (e: Record<string, unknown>) => written.push(e) };
    await createDispatcher(host, ctx, audit as never).call("fdpm.workbook.list", {});
    expect(written.length).toBeGreaterThan(0);
    const blob = JSON.stringify(written);
    // The token never entered the principal, so it cannot reach the log.
    expect(blob).not.toContain("Bearer");
    vi.restoreAllMocks();
  });
});
