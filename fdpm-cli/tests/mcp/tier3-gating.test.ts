/**
 * SPEC-MCP-SERVER §23.1 — Tier 3 default-off conformance.
 *
 * Verbatim conformance:
 *   - With destructive disabled, none of the three Tier-3 tools is
 *     advertised by `advertisedTools(...)`.
 *   - Calling `fdpm.project.delete` (or any Tier-3 tool) with valid
 *     args while destructive is disabled returns `isError: true` with
 *     `category: "permission"` and `evidence.reason:
 *     "destructive_disabled"`. The operation log MUST NOT have grown.
 *   - With destructive enabled, the three Tier-3 tools ARE advertised
 *     and successfully run.
 *   - The opt-in confirmation-token mode (SPEC §9.3) refuses Tier-2/3
 *     calls that omit the token and accepts those that supply it.
 *
 * The tests construct a real `Host` against `dataDir: null` (in-memory
 * persistence) so `getLog` returns a deterministic in-memory log. The
 * dispatcher is the real one — no mocks of the gate.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import {
  advertisedTools,
  TIER_3_TOOLS,
  MANIFEST,
} from "../../src/mcp/manifest.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

async function makeHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  await host.createProject({
    project_id: "p1",
    name: "Project One",
    profile_id: "test:demo",
  });
  return host;
}

function makeCtx(over: Partial<DispatchCtx> = {}): DispatchCtx {
  const base: DispatchCtx = {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
  return { ...base, ...over };
}

describe("Tier 3 — manifest filtering (SPEC §23.1)", () => {
  it("does NOT advertise the three Tier-3 tools when enableDestructive is false", () => {
    const advertised = advertisedTools({ enableDestructive: false });
    const names = advertised.map((t) => t.name);
    expect(names).not.toContain("fdpm.project.delete");
    expect(names).not.toContain("fdpm.primitive.delete");
    expect(names).not.toContain("fdpm.relation.delete");
    // No tier-3 tool leaks through.
    for (const t of TIER_3_TOOLS) {
      expect(names).not.toContain(t.name);
    }
  });

  it("advertises all three Tier-3 tools when enableDestructive is true", () => {
    const advertised = advertisedTools({ enableDestructive: true });
    const names = advertised.map((t) => t.name);
    expect(names).toContain("fdpm.project.delete");
    expect(names).toContain("fdpm.primitive.delete");
    expect(names).toContain("fdpm.relation.delete");
  });

  it("every Tier-3 tool carries destructiveHint=true and not readOnlyHint", () => {
    expect(TIER_3_TOOLS.length).toBeGreaterThanOrEqual(3);
    for (const t of TIER_3_TOOLS) {
      expect(t.tier).toBe("destructive");
      expect(t.annotations.destructiveHint).toBe(true);
      // SPEC §8.3: must NOT carry readOnlyHint.
      expect(t.annotations.readOnlyHint).not.toBe(true);
    }
    // Sanity: the canonical singleton deletes are present in MANIFEST.
    const all = MANIFEST.map((t) => t.name);
    expect(all).toContain("fdpm.project.delete");
    expect(all).toContain("fdpm.primitive.delete");
    expect(all).toContain("fdpm.relation.delete");
  });
});

describe("Tier 3 — dispatch refusal when destructive is off (SPEC §23.1)", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("fdpm.project.delete with valid args refuses; operation log unchanged", async () => {
    const ctx = makeCtx({ enableDestructive: false });
    const dispatcher = createDispatcher(host, ctx, null);
    const before = host.getLog("p1").length;

    const result = await dispatcher.call("fdpm.project.delete", {
      project_id: "p1",
    });

    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("destructive_disabled");

    const after = host.getLog("p1").length;
    expect(after).toBe(before);
  });

  it("fdpm.primitive.delete refuses with same envelope", async () => {
    const ctx = makeCtx({ enableDestructive: false });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.primitive.delete", {
      project_id: "p1",
      id: "section:does-not-matter",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("destructive_disabled");
  });

  it("fdpm.relation.delete refuses with same envelope", async () => {
    const ctx = makeCtx({ enableDestructive: false });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.relation.delete", {
      project_id: "p1",
      id: "rel:nope",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("destructive_disabled");
  });
});

describe("Tier 3 — dispatch success when destructive is enabled", () => {
  it("fdpm.project.delete runs; operation log grows by exactly one entry", async () => {
    const host = await makeHost();
    const ctx = makeCtx({ enableDestructive: true });
    const dispatcher = createDispatcher(host, ctx, null);
    const before = host.getLog("p1").length;

    const result = await dispatcher.call("fdpm.project.delete", {
      project_id: "p1",
    });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      ok: boolean;
      operation: { kind: string; project_id: string };
      post_state_summary: { project_id: string };
    };
    expect(sc.ok).toBe(true);
    expect(sc.operation.kind).toBe("project.delete");
    expect(sc.operation.project_id).toBe("p1");
    expect(sc.post_state_summary.project_id).toBe("p1");

    // The log grew by exactly one (the project.delete operation).
    const after = host.getLog("p1").length;
    expect(after).toBe(before + 1);
  });

  it("fdpm.primitive.delete on a missing primitive returns not_found, not destructive_disabled", async () => {
    const host = await makeHost();
    const ctx = makeCtx({ enableDestructive: true });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.primitive.delete", {
      project_id: "p1",
      id: "section:missing",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("not_found");
    // Specifically NOT a destructive_disabled refusal — the gate is open.
    expect(env.evidence?.reason).not.toBe("destructive_disabled");
  });
});

describe("Tier 3 — confirmation-token mode (SPEC §9.3)", () => {
  it("refuses without token when requireConfirmationToken is true", async () => {
    const host = await makeHost();
    const ctx = makeCtx({
      enableDestructive: true,
      requireConfirmationToken: true,
      confirmationToken: "secret-1",
    });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.project.delete", {
      project_id: "p1",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.reason).toBe("confirmation_required");
  });

  it("refuses with wrong token", async () => {
    const host = await makeHost();
    const ctx = makeCtx({
      enableDestructive: true,
      requireConfirmationToken: true,
      confirmationToken: "secret-1",
    });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.project.delete", {
      project_id: "p1",
      _confirmation_token: "wrong",
    });
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as {
        error: { category: string; evidence?: { reason?: string } };
      }
    ).error;
    expect(env.evidence?.reason).toBe("confirmation_required");
  });

  it("allows with matching token; the gate strips it before strict-schema validation", async () => {
    const host = await makeHost();
    const ctx = makeCtx({
      enableDestructive: true,
      requireConfirmationToken: true,
      confirmationToken: "secret-1",
    });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.project.delete", {
      project_id: "p1",
      _confirmation_token: "secret-1",
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      ok: boolean;
      operation: { kind: string };
    };
    expect(sc.ok).toBe(true);
    expect(sc.operation.kind).toBe("project.delete");
  });

  it("does NOT gate Tier-1 calls regardless of requireConfirmationToken", async () => {
    const host = await makeHost();
    const ctx = makeCtx({
      enableDestructive: false,
      requireConfirmationToken: true,
      confirmationToken: "secret-1",
    });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.health", {});
    expect(result.isError).toBe(false);
  });
});
