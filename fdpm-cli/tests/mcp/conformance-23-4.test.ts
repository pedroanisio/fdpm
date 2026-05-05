/**
 * SPEC-MCP-SERVER §23.4 — Conformance: stale-state refusal on
 * concurrent CLI write.
 *
 * Verbatim:
 *   "While the MCP server is running, run a `fdpm` CLI command that
 *    mutates the project. Then issue a Tier 2 MCP call against the
 *    same project. expected: Tier 2 call returns isError=true with
 *    category='permission' and evidence.reason='stale_state'. After
 *    SIGHUP-triggered Host.reload(), the call succeeds."
 *
 * The test substitutes the CLI write with a direct on-disk JSONL
 * append (the same effect: a second writer changed `(mtime_ns, size)`
 * since the in-memory Host loaded the file). SIGHUP is emulated by
 * calling `host.reload()` and clearing the session's freshness map —
 * the same code path the production binary's SIGHUP handler invokes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { appendRawOp } from "../_helpers/oob-write.js";
import { mintUid } from "../../src/core/identity/uid.js";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-conf234-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("SPEC-MCP-SERVER §23.4 — stale-state refusal on concurrent CLI write", () => {
  it("refuses with permission/stale_state then succeeds after reload", async () => {
    // Boot the MCP server's Host equivalent.
    const host = new Host({ dataDir, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE, { persist: true });
    await host.createProject({
      project_id: "p1",
      name: "P1",
      profile_id: "test:demo",
    });

    const session = createSession({ maxPerMinute: 600 });
    const ctx: DispatchCtx = {
      session,
      enableDestructive: false,
      enabledPlugins: new Set(),
      auditFullArgs: false,
      hostOptions: { dataDir, noPlugins: true },
    };
    const dispatcher = createDispatcher(host, ctx, null);

    // Seed the freshness tuple with a successful Tier-2 call.
    const seeded = await dispatcher.call("fdpm.primitive.create", {
      project_id: "p1",
      primitive: {
        id: "section:seed",
        type_id: "test:section",
        field_values: { title: "Seed", number: 0 },
      },
    });
    expect(seeded.isError).toBe(false);

    // Simulated concurrent CLI write: append a primitive.create op
    // directly to the JSONL log, mirroring `fdpm primitive create`'s
    // on-disk effect.
    const currentRev = host.getLog("p1").length;
    appendRawOp(dataDir, "p1", {
      op_id: mintUid(),
      kind: "primitive.create",
      project_id: "p1",
      payload: {
        id: "section:cli-side",
        uid: mintUid(),
        type_id: "test:section",
        field_values: { title: "CLI-side", number: 7 },
      },
      actor: "cli",
      timestamp: new Date().toISOString(),
      revision: currentRev + 1,
      request_id: "00000000-0000-7000-8000-000000000000",
      schema_version: "1.1.0",
    });

    // Tier-2 MCP call against the same project — expected refusal.
    const refused = await dispatcher.call("fdpm.primitive.create", {
      project_id: "p1",
      primitive: {
        id: "section:after-cli",
        type_id: "test:section",
        field_values: { title: "after", number: 8 },
      },
    });
    expect(refused.isError).toBe(true);
    const env = (
      refused.structuredContent as {
        error: {
          category: string;
          evidence?: { reason?: string; advice?: string };
        };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("stale_state");
    expect(env.evidence?.advice).toMatch(/SIGHUP/);

    // SIGHUP-triggered reload (the production handler does
    // `host.reload()` then `session.clearFreshnessMap()`).
    await host.reload();
    session.clearFreshnessMap();

    const accepted = await dispatcher.call("fdpm.primitive.create", {
      project_id: "p1",
      primitive: {
        id: "section:after-reload",
        type_id: "test:section",
        field_values: { title: "after reload", number: 9 },
      },
    });
    expect(accepted.isError).toBe(false);
    expect((accepted.structuredContent as { ok: boolean }).ok).toBe(true);
  });
});
