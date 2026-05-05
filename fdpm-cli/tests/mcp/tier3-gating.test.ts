/**
 * SPEC-MCP-SERVER §23.1 — Tier 3 default-disabled conformance (v0.1.2).
 *
 * Updated for the v0.1.2 advertisement amendment (§8.3, AC §22.3):
 *   - Tier 3 tools are advertised in BOTH states.
 *   - When destructive is OFF, every Tier-3 tool's advertised
 *     description begins with the §8.3 disabled banner; dispatch
 *     refuses with `permission` + `evidence.reason: "destructive_disabled"`.
 *   - When destructive is ON, the banner is absent from advertised
 *     descriptions and dispatch executes normally.
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
  TIER_3_DISABLED_BANNER,
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
    workbook_id: "p1",
    name: "Workbook One",
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

describe("Tier 3 — manifest advertisement (SPEC §22.3, §8.3 v0.1.2)", () => {
  it("advertises every Tier-3 tool when enableDestructive is false, with banner-prefixed description", () => {
    const advertised = advertisedTools({ enableDestructive: false });
    const names = advertised.map((t) => t.name);
    // Per v0.1.2: Tier 3 tools are present in BOTH states.
    expect(names).toContain("fdpm.workbook.delete");
    expect(names).toContain("fdpm.primitive.delete");
    expect(names).toContain("fdpm.relation.delete");
    // Every Tier-3 tool MUST be present and MUST carry the banner.
    for (const t of TIER_3_TOOLS) {
      const adv = advertised.find((a) => a.name === t.name);
      expect(adv, `${t.name} must be advertised when destructive is off`).toBeDefined();
      expect(
        adv!.description.startsWith(TIER_3_DISABLED_BANNER),
        `${t.name} description must begin with the §8.3 disabled banner`,
      ).toBe(true);
      // The original description content must remain — banner is a prefix, not a replacement.
      expect(
        adv!.description.endsWith(t.description),
        `${t.name} banner-prefixed description must contain the original description verbatim at the tail`,
      ).toBe(true);
    }
  });

  it("advertises all Tier-3 tools without banner when enableDestructive is true", () => {
    const advertised = advertisedTools({ enableDestructive: true });
    const names = advertised.map((t) => t.name);
    expect(names).toContain("fdpm.workbook.delete");
    expect(names).toContain("fdpm.primitive.delete");
    expect(names).toContain("fdpm.relation.delete");
    // No banner when enabled.
    for (const t of TIER_3_TOOLS) {
      const adv = advertised.find((a) => a.name === t.name);
      expect(adv).toBeDefined();
      expect(
        adv!.description.startsWith(TIER_3_DISABLED_BANNER),
        `${t.name} must NOT carry the disabled banner when destructive is enabled`,
      ).toBe(false);
      expect(adv!.description).toBe(t.description);
    }
  });

  it("Tier-1 and Tier-2 tools never carry the disabled banner regardless of state", () => {
    for (const enableDestructive of [true, false]) {
      const advertised = advertisedTools({ enableDestructive });
      for (const t of advertised) {
        if (t.tier !== "destructive") {
          expect(
            t.description.startsWith(TIER_3_DISABLED_BANNER),
            `${t.name} (${t.tier}) must never carry the §8.3 banner`,
          ).toBe(false);
        }
      }
    }
  });

  it("banner-wrapped Tier-3 entries preserve input/output schemas and handler/annotations", () => {
    const advertised = advertisedTools({ enableDestructive: false });
    for (const original of TIER_3_TOOLS) {
      const wrapped = advertised.find((a) => a.name === original.name)!;
      expect(wrapped.input).toBe(original.input);
      expect(wrapped.output).toBe(original.output);
      expect(wrapped.handler).toBe(original.handler);
      expect(wrapped.annotations).toEqual(original.annotations);
      expect(wrapped.tier).toBe("destructive");
    }
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
    expect(all).toContain("fdpm.workbook.delete");
    expect(all).toContain("fdpm.primitive.delete");
    expect(all).toContain("fdpm.relation.delete");
  });
});

describe("Tier 3 — dispatch refusal when destructive is off (SPEC §23.1)", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("fdpm.workbook.delete with valid args refuses; operation log unchanged", async () => {
    const ctx = makeCtx({ enableDestructive: false });
    const dispatcher = createDispatcher(host, ctx, null);
    const before = host.getLog("p1").length;

    const result = await dispatcher.call("fdpm.workbook.delete", {
      workbook_id: "p1",
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
      workbook_id: "p1",
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
      workbook_id: "p1",
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
  it("fdpm.workbook.delete runs; operation log grows by exactly one entry", async () => {
    const host = await makeHost();
    const ctx = makeCtx({ enableDestructive: true });
    const dispatcher = createDispatcher(host, ctx, null);
    const before = host.getLog("p1").length;

    const result = await dispatcher.call("fdpm.workbook.delete", {
      workbook_id: "p1",
    });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      ok: boolean;
      operation: { kind: string; workbook_id: string };
      post_state_summary: { workbook_id: string };
    };
    expect(sc.ok).toBe(true);
    expect(sc.operation.kind).toBe("workbook.delete");
    expect(sc.operation.workbook_id).toBe("p1");
    expect(sc.post_state_summary.workbook_id).toBe("p1");

    // The log grew by exactly one (the workbook.delete operation).
    const after = host.getLog("p1").length;
    expect(after).toBe(before + 1);
  });

  it("fdpm.primitive.delete on a missing primitive returns not_found, not destructive_disabled", async () => {
    const host = await makeHost();
    const ctx = makeCtx({ enableDestructive: true });
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.primitive.delete", {
      workbook_id: "p1",
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
    const result = await dispatcher.call("fdpm.workbook.delete", {
      workbook_id: "p1",
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
    const result = await dispatcher.call("fdpm.workbook.delete", {
      workbook_id: "p1",
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
    const result = await dispatcher.call("fdpm.workbook.delete", {
      workbook_id: "p1",
      _confirmation_token: "secret-1",
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      ok: boolean;
      operation: { kind: string };
    };
    expect(sc.ok).toBe(true);
    expect(sc.operation.kind).toBe("workbook.delete");
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
