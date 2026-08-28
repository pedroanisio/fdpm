/**
 * SPEC-MCP-SERVER §15.2 — dispatcher middleware unit tests.
 *
 * Covers:
 *   - tier gate refuses Tier-3 calls when destructive is off
 *     (`permission` + `evidence.reason: "destructive_disabled"`).
 *   - per-session rate limit refuses excess calls
 *     (`permission` + `evidence.reason: "rate_limited"`).
 *   - unknown tool name returns `not_found`.
 *
 * Slice B-prelim ships no Tier-3 tools, so the tier-gate test inserts
 * a fake destructive tool into the manifest module via a controlled
 * test harness — but `findTool` reads MANIFEST directly, so we instead
 * exercise the dispatcher by injecting a tool entry into a *local*
 * dispatcher built around the same primitives. To keep this test
 * within the public surface, we re-implement the gate path with the
 * dispatcher's exported helpers and a tool registry seam.
 *
 * To avoid duplicating production logic we instead reach in and call
 * the dispatcher with carefully chosen inputs against the real
 * manifest: rate-limit and not_found are testable directly.
 */

import { describe, it, expect } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

async function bootstrap(opts?: { maxPerMinute?: number }): Promise<{
  host: Host;
  ctx: DispatchCtx;
}> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  const ctx: DispatchCtx = {
    session: createSession({ maxPerMinute: opts?.maxPerMinute ?? 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
  return { host, ctx };
}

describe("dispatcher — unknown tool", () => {
  it("returns isError=true with category=not_found for an unknown tool name", async () => {
    const { host, ctx } = await bootstrap();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.does.not.exist", {});
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string; evidence?: { reason?: string } } }).error;
    expect(env.category).toBe("not_found");
    expect(env.evidence?.reason).toBe("unknown_tool");
  });
});

describe("dispatcher — input validation", () => {
  it("rejects malformed args with category=validation; isError=true; never reaches Host", async () => {
    const { host, ctx } = await bootstrap();
    const dispatcher = createDispatcher(host, ctx, null);
    // fdpm.profile.get requires { profile_id: string }
    const result = await dispatcher.call("fdpm.profile.get", { wrong: "shape" });
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string } }).error;
    expect(env.category).toBe("validation");
  });
});

describe("dispatcher — happy path returns success shape", () => {
  it("fdpm.health succeeds and returns isError=false with structuredContent.ok=true", async () => {
    const { host, ctx } = await bootstrap();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.health", {});
    expect(result.isError).toBe(false);
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    const sc = result.structuredContent as { ok: boolean; manifest_version: string };
    expect(sc.ok).toBe(true);
    expect(typeof sc.manifest_version).toBe("string");
    // SPEC-MCP-SERVER §8.5 — the catalog budget is observable over MCP.
    const withCatalog = result.structuredContent as {
      catalog: {
        tool_count: number;
        total_bytes: number;
        budget_total_bytes: number;
        budget_per_tool_bytes: number;
        within_budget: boolean;
      };
    };
    expect(withCatalog.catalog.within_budget).toBe(true);
    expect(withCatalog.catalog.tool_count).toBeGreaterThan(0);
    expect(withCatalog.catalog.total_bytes).toBeGreaterThan(0);
    expect(withCatalog.catalog.total_bytes).toBeLessThanOrEqual(
      withCatalog.catalog.budget_total_bytes,
    );
    expect(withCatalog.catalog.budget_per_tool_bytes).toBeGreaterThan(0);
  });
});

describe("dispatcher — rate limit", () => {
  it("the (n+1)th call refuses with category=permission and evidence.reason=rate_limited", async () => {
    // maxPerMinute=2 → bucket starts at 2 tokens; third consume() returns false.
    // (Drip rate is 2/60 per second; within a single test tick the bucket
    //  refill is < 1 token, so we deterministically hit the gate.)
    const { host, ctx } = await bootstrap({ maxPerMinute: 2 });
    const dispatcher = createDispatcher(host, ctx, null);

    const r1 = await dispatcher.call("fdpm.health", {});
    expect(r1.isError).toBe(false);
    const r2 = await dispatcher.call("fdpm.health", {});
    expect(r2.isError).toBe(false);
    const r3 = await dispatcher.call("fdpm.health", {});
    expect(r3.isError).toBe(true);
    const env = (r3.structuredContent as { error: { category: string; evidence?: { reason?: string } } }).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("rate_limited");
  });
});

describe("dispatcher — tier gate (destructive)", () => {
  it("a Tier-3 tool refuses with permission/destructive_disabled when --enable-destructive is off", async () => {
    const { z } = await import("zod");
    const { host, ctx } = await bootstrap();
    // Synthetic Tier-3 tool — slice B-prelim ships none, but the gate
    // logic must still be testable. We inject via the dispatcher's
    // `resolveTool` seam. The handler MUST NOT run; if it does, the
    // gate is broken.
    let handlerRan = false;
    const fakeTool = {
      name: "fdpm.test.destruct",
      tier: "destructive" as const,
      description: "synthetic tier-3 for tests",
      input: z.object({}).strict(),
      output: z.object({}).strict(),
      annotations: { destructiveHint: true },
      handler: async () => {
        handlerRan = true;
        return {};
      },
    };
    const dispatcher = createDispatcher(host, ctx, null, (name) =>
      name === fakeTool.name ? (fakeTool as never) : null,
    );

    const result = await dispatcher.call("fdpm.test.destruct", {});
    expect(handlerRan).toBe(false);
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string; evidence?: { reason?: string } } }).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("destructive_disabled");
  });

  it("a Tier-3 tool runs when --enable-destructive is on", async () => {
    const { z } = await import("zod");
    const { host, ctx } = await bootstrap();
    const ctxOn: DispatchCtx = { ...ctx, enableDestructive: true };
    let handlerRan = false;
    const fakeTool = {
      name: "fdpm.test.destruct",
      tier: "destructive" as const,
      description: "synthetic tier-3 for tests",
      input: z.object({}).strict(),
      output: z.object({ ok: z.literal(true) }).strict(),
      annotations: { destructiveHint: true },
      handler: async () => {
        handlerRan = true;
        return { ok: true as const };
      },
    };
    const dispatcher = createDispatcher(host, ctxOn, null, (name) =>
      name === fakeTool.name ? (fakeTool as never) : null,
    );

    const result = await dispatcher.call("fdpm.test.destruct", {});
    expect(handlerRan).toBe(true);
    expect(result.isError).toBe(false);
  });
});
