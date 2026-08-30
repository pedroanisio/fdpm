/**
 * SPEC-MCP-SERVER §10 / §21 / §23.4 — Tier 2 strict-mode staleness.
 *
 * After a Tier-2 call records the freshness tuple for workbook P, any
 * out-of-band write to P MUST cause the next Tier-2 call against P
 * to refuse with an MCP error envelope:
 *   - `isError: true`
 *   - `structuredContent.error.category: "permission"`
 *   - `evidence.reason: "stale_state"`
 *   - `evidence.advice` mentions SIGHUP
 *
 * No new operation MUST be appended.
 *
 * After `Host.reload()` (the in-test analogue of SIGHUP) the same call
 * MUST succeed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession, type McpSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { appendRawOp } from "../_helpers/oob-write.js";
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

async function makeHostAndProject(dataDir: string): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE, { persist: true });
  await host.createProject({
    workbook_id: "p1",
    name: "Workbook One",
    profile_id: "test:demo",
  });
  return host;
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-mcp-tier2-stale-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Tier 2 stale-state — strict refusal", () => {
  it("an OOB write between two Tier 2 calls causes the second to refuse with stale_state", async () => {
    const host = await makeHostAndProject(dataDir);
    const session = createSession({ maxPerMinute: 600 });
    const ctx = makeCtx(session, dataDir);
    const dispatcher = createDispatcher(host, ctx, null);

    // First Tier-2 call seeds the freshness map.
    const r1 = await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:one",
        type_id: "test:section",
        field_values: { title: "One", number: 1 },
      },
    });
    expect(r1.isError).toBe(false);

    const before = host.getLog("p1").length;

    // OOB append: another writer adds an op directly to the log.
    const op = {
      op_id: mintUid(),
      kind: "primitive.create",
      workbook_id: "p1",
      payload: {
        id: "section:two",
        uid: mintUid(),
        type_id: "test:section",
        field_values: { title: "Two", number: 2 },
      },
      actor: "ext",
      timestamp: new Date().toISOString(),
      revision: before + 1,
      request_id: "00000000-0000-7000-8000-000000000000",
      schema_version: "1.1.0",
    };
    appendRawOp(dataDir, "p1", op);

    // Second Tier-2 call MUST refuse with stale_state.
    const r2 = await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:three",
        type_id: "test:section",
        field_values: { title: "Three", number: 3 },
      },
    });
    expect(r2.isError).toBe(true);
    const env = (
      r2.structuredContent as {
        error: {
          category: string;
          evidence?: { reason?: string; advice?: string };
        };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("stale_state");
    expect(env.evidence?.advice).toMatch(/SIGHUP/);
    expect(env.evidence?.advice).toMatch(/SIGBREAK/);

    // No new in-memory write happened (the OOB op is on disk only).
    expect(host.getLog("p1").length).toBe(before);
  });

  it("after host.reload() (SIGHUP analogue) the same Tier 2 call succeeds", async () => {
    const host = await makeHostAndProject(dataDir);
    const session = createSession({ maxPerMinute: 600 });
    const ctx = makeCtx(session, dataDir);
    const dispatcher = createDispatcher(host, ctx, null);

    // Seed freshness.
    await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:one",
        type_id: "test:section",
        field_values: { title: "One", number: 1 },
      },
    });

    // OOB append.
    const beforeOob = host.getLog("p1").length;
    const op = {
      op_id: mintUid(),
      kind: "primitive.create",
      workbook_id: "p1",
      payload: {
        id: "section:two",
        uid: mintUid(),
        type_id: "test:section",
        field_values: { title: "Two", number: 2 },
      },
      actor: "ext",
      timestamp: new Date().toISOString(),
      revision: beforeOob + 1,
      request_id: "00000000-0000-7000-8000-000000000000",
      schema_version: "1.1.0",
    };
    appendRawOp(dataDir, "p1", op);

    // Verify the refusal first.
    const refused = await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:three",
        type_id: "test:section",
        field_values: { title: "Three", number: 3 },
      },
    });
    expect(refused.isError).toBe(true);

    // SIGHUP analogue: reload Host + clear the session's freshness map.
    await host.reload();
    session.clearFreshnessMap();

    // The same call now succeeds.
    const r3 = await dispatcher.call("fdpm.primitive.create", {
      workbook_id: "p1",
      primitive: {
        id: "section:three",
        type_id: "test:section",
        field_values: { title: "Three", number: 3 },
      },
    });
    expect(r3.isError).toBe(false);
    const sc = r3.structuredContent as { ok: boolean };
    expect(sc.ok).toBe(true);
  });
});
