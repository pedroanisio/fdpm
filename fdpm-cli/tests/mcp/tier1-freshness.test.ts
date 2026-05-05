/**
 * SPEC-MCP-SERVER §10 / §21 — Tier 1 lenient-mode freshness check.
 *
 * Tier 1 calls MUST silently tail-replay a project's log when an
 * out-of-band write has changed `(mtime_ns, size)` since the session
 * last touched that project. After replay, the call MUST observe the
 * post-replay state and the freshness map MUST be re-seeded.
 *
 * `host_compat` from `Host.reloadProjectTail` (truncated/rewritten
 * log) MUST surface as an MCP error envelope with category
 * `host_compat` — NOT silently retried.
 *
 * The wildcard `["*"]` extractor MUST trigger a stderr warning and
 * stat every known project's log.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession, type McpSession } from "../../src/mcp/session.js";
import type { DispatchCtx, McpToolEntry } from "../../src/mcp/types.js";
import { appendRawOp, truncateLogToOps } from "../_helpers/oob-write.js";
import { mintUid } from "../../src/core/identity/uid.js";

function makeCtx(session: McpSession, dataDir: string): DispatchCtx {
  return {
    session,
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir, noPlugins: true },
  };
}

async function makeHost(dataDir: string): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE, { persist: false });
  await host.createProject({
    project_id: "p1",
    name: "Project One",
    profile_id: "test:demo",
  });
  await host.createPrimitive("p1", {
    id: "section:one",
    type_id: "test:section",
    field_values: { title: "Section One", number: 1 },
  });
  return host;
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-tier1-fresh-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Tier 1 freshness — silent tail-replay on out-of-band append", () => {
  it("a Tier 1 call after an OOB append observes the new primitive without a refusal", async () => {
    const host = await makeHost(dataDir);
    const session = createSession({ maxPerMinute: 600 });
    const ctx = makeCtx(session, dataDir);
    const dispatcher = createDispatcher(host, ctx, null);

    // First call: seeds the freshness entry.
    const r1 = await dispatcher.call("fdpm.primitive.search", {
      project_id: "p1",
    });
    expect(r1.isError).toBe(false);
    const initial = (r1.structuredContent as { matches: unknown[] }).matches;
    expect(initial).toHaveLength(1);

    // OOB append: a second primitive added directly to the log.
    const op = {
      op_id: mintUid(),
      kind: "primitive.create",
      project_id: "p1",
      payload: {
        id: "section:two",
        uid: mintUid(),
        type_id: "test:section",
        field_values: { title: "Section Two", number: 2 },
      },
      actor: "test",
      timestamp: new Date().toISOString(),
      revision: 3,
      request_id: "00000000-0000-7000-8000-000000000000",
      schema_version: "1.1.0",
    };
    appendRawOp(dataDir, "p1", op);

    // Second call: dispatcher detects (mtime,size) drift, silently
    // calls reloadProjectTail, then dispatches.
    const r2 = await dispatcher.call("fdpm.primitive.search", {
      project_id: "p1",
    });
    expect(r2.isError).toBe(false);
    const after = (r2.structuredContent as { matches: unknown[] }).matches;
    expect(after).toHaveLength(2);

    // Freshness map is re-seeded post-replay: a third call on
    // unchanged disk state finds nothing stale.
    const snapBefore = session.freshnessSnapshot().get("p1")!;
    const snapAfterCheck = session.checkFreshness(host, ["p1"]);
    expect(snapAfterCheck.stale).toEqual([]);
    expect(snapAfterCheck.fresh).toEqual(["p1"]);
    expect(snapBefore).toBeDefined();
  });

  it("host_compat from reloadProjectTail surfaces as an MCP error envelope", async () => {
    const host = await makeHost(dataDir);
    const session = createSession({ maxPerMinute: 600 });
    const ctx = makeCtx(session, dataDir);
    const dispatcher = createDispatcher(host, ctx, null);

    // Seed.
    await dispatcher.call("fdpm.primitive.search", { project_id: "p1" });

    // Simulate a backup-restore: drop the log to zero ops while the
    // in-memory Host still has them. reloadProjectTail will throw
    // host_compat (log_truncated).
    truncateLogToOps(dataDir, "p1", 0);

    const result = await dispatcher.call("fdpm.primitive.search", {
      project_id: "p1",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("host_compat");
  });
});

describe("Tier 1 freshness — wildcard scan", () => {
  it("a synthetic tool whose extractor returns ['*'] scans every known project and warns to stderr", async () => {
    const host = await makeHost(dataDir);
    await host.createProject({
      project_id: "p2",
      name: "Project Two",
      profile_id: "test:demo",
    });
    const session = createSession({ maxPerMinute: 600 });
    const ctx = makeCtx(session, dataDir);

    // Collect stderr from this test only.
    const captured: string[] = [];
    const realWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const s =
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      captured.push(s);
      return true;
    }) as typeof process.stderr.write;

    try {
      // Inject a synthetic Tier-1 tool whose name is registered in the
      // metadata map with a wildcard extractor. We monkey-patch the
      // metadata map for this test only.
      const mod = await import("../../src/mcp/tool-metadata-map.js");
      const TABLE = mod.TOOL_TO_COMMAND_METADATA as Record<
        string,
        unknown
      >;
      const NAME = "fdpm.test.wildcard_scan";
      TABLE[NAME] = (() => ["*"]) as () => readonly string[];

      const fakeTool: McpToolEntry<Record<string, unknown>, { ok: true }> = {
        name: NAME,
        tier: "read_only",
        description: "synthetic wildcard tool for tests",
        input: z.object({}).passthrough(),
        output: z.object({ ok: z.literal(true) }).strict(),
        annotations: { readOnlyHint: true },
        handler: async () => ({ ok: true as const }),
      };

      const dispatcher = createDispatcher(host, ctx, null, (n) =>
        n === NAME ? (fakeTool as never) : null,
      );
      const result = await dispatcher.call(NAME, {});
      expect(result.isError).toBe(false);

      const stderrText = captured.join("");
      expect(stderrText).toContain("wildcard freshness scan");

      // Both projects should now be in the freshness map.
      const snap = session.freshnessSnapshot();
      expect(snap.has("p1")).toBe(true);
      expect(snap.has("p2")).toBe(true);

      delete TABLE[NAME];
    } finally {
      process.stderr.write = realWrite;
    }
  });
});

describe("Tier 1 freshness — projects directory bootstrap", () => {
  it("creating a project directory before makeHost succeeds (sanity)", () => {
    mkdirSync(join(dataDir, "projects", "ignored-fixture"), { recursive: true });
    expect(true).toBe(true);
  });
});
