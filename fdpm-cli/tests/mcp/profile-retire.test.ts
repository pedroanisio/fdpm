/**
 * `fdpm.profile.retire` — Tier 3 (destructive).
 *
 * Registering a profile is Tier 2 and reversible only by retiring the
 * revision, so retire is the other half of `fdpm.profile.register`: without
 * it an agent that mis-authored a profile leaves a permanent, unusable
 * revision behind and has to invent a new id.
 *
 * It is Tier 3 rather than Tier 2 because a retire is not validated-and-
 * appended, it removes a registry entry and a file. It therefore inherits
 * the destructive gate (refused unless `--enable-destructive`), the
 * `dry_run` preview, and the `idempotency_key` requirement — the same
 * contract as every other delete on the surface.
 *
 * Covers, through the real dispatcher:
 *   - the destructive gate refuses while destructive mode is off
 *   - `dry_run` previews the blockers and removes nothing
 *   - a real retire removes the revision and leaves siblings addressable
 *   - a referenced revision is refused with the referencing workbooks
 *   - the advertised catalog carries the Tier-3 disabled banner
 */

import { describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { advertisedTools, TIER_3_DISABLED_BANNER } from "../../src/mcp/manifest.js";

function makeCtx(enableDestructive: boolean): DispatchCtx {
  return {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
}

async function makeHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile({ ...TEST_PROFILE, version: "1.0.0" });
  await host.registerProfile({ ...TEST_PROFILE, version: "2.0.0" });
  return host;
}

interface ErrOut {
  error: { category: string; message: string; evidence?: Record<string, unknown> };
}

interface RetireEnvelope {
  ok: boolean;
  dry_run?: true;
  would_affect?: { workbooks: string[]; dependents: string[] };
  post_state_summary: { profile_id: string; version: string; remaining_versions: string[] };
}

describe("fdpm.profile.retire — gating", () => {
  it("is refused while destructive mode is off", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(false), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:demo@2.0.0",
      idempotency_key: "k1",
    });
    expect(result.isError).toBe(true);
    const err = (result.structuredContent as ErrOut).error;
    expect(err.category).toBe("permission");
    expect(err.evidence?.["reason"]).toBe("destructive_disabled");
    expect(host.profiles.has("test:demo@2.0.0")).toBe(true);
  });

  it("carries the Tier-3 disabled banner in the advertised catalog", () => {
    const off = advertisedTools({ enableDestructive: false }).find(
      (t) => t.name === "fdpm.profile.retire",
    );
    expect(off?.description.startsWith(TIER_3_DISABLED_BANNER)).toBe(true);
    const on = advertisedTools({ enableDestructive: true }).find(
      (t) => t.name === "fdpm.profile.retire",
    );
    expect(on?.description.startsWith(TIER_3_DISABLED_BANNER)).toBe(false);
  });
});

describe("fdpm.profile.retire — unknown target", () => {
  it("reports not_found with the registered versions when a bare ref names nothing", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:never-registered",
      dry_run: true,
    });
    expect(result.isError).toBe(true);
    const err = (result.structuredContent as ErrOut).error;
    expect(err.category).toBe("not_found");
    expect(err.evidence?.["registered_versions"]).toEqual([]);
  });
});

describe("fdpm.profile.retire — dry run", () => {
  it("previews an unblocked retire without removing anything", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:demo@2.0.0",
      dry_run: true,
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as RetireEnvelope;
    expect(sc.ok).toBe(true);
    expect(sc.dry_run).toBe(true);
    expect(sc.would_affect).toEqual({ workbooks: [], dependents: [] });
    expect(host.profiles.has("test:demo@2.0.0")).toBe(true);
  });

  it("names the workbooks that would block the retire", async () => {
    const host = await makeHost();
    await host.createProject({ workbook_id: "wb-1", name: "One", profile_id: "test:demo" });
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:demo@2.0.0",
      dry_run: true,
    });
    const sc = result.structuredContent as RetireEnvelope;
    expect(sc.would_affect?.workbooks).toEqual(["wb-1"]);
    expect(host.profiles.has("test:demo@2.0.0")).toBe(true);
  });
});

describe("fdpm.workbook.create — the binding it reports is the one it made", () => {
  it("reports the resolved revision, not the ref the caller typed", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.workbook.create", {
      workbook_id: "wb-pinned",
      name: "Pinned",
      profile_id: "test:demo@1.0.0",
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      ok: boolean;
      post_state_summary: { workbook_id: string; profile_id: string; profile_version: string };
    };
    expect(sc.ok).toBe(true);
    // `profile_id` echoing the caller's `id@version` ref would misreport the
    // stored record, which keeps the id and the version in separate fields.
    expect(sc.post_state_summary).toEqual({
      workbook_id: "wb-pinned",
      profile_id: "test:demo",
      profile_version: "1.0.0",
    });
    expect(host.store.getProject("wb-pinned").workbook.profile_version).toBe("1.0.0");
  });

  it("binds the newest revision when the ref carries no version", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.workbook.create", {
      workbook_id: "wb-newest",
      name: "Newest",
      profile_id: "test:demo",
    });
    const sc = result.structuredContent as {
      post_state_summary: { profile_version: string };
    };
    expect(sc.post_state_summary.profile_version).toBe("2.0.0");
  });
});

describe("fdpm.profile.retire — real retire", () => {
  it("removes the revision and reports what remains", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:demo@2.0.0",
      idempotency_key: "retire-1",
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as RetireEnvelope;
    expect(sc.ok).toBe(true);
    expect(sc.post_state_summary).toEqual({
      profile_id: "test:demo",
      version: "2.0.0",
      remaining_versions: ["1.0.0"],
    });
    expect(host.profiles.has("test:demo@2.0.0")).toBe(false);
    expect(host.profiles.has("test:demo@1.0.0")).toBe(true);
  });

  it("refuses a referenced revision with the blockers as evidence", async () => {
    const host = await makeHost();
    await host.createProject({ workbook_id: "wb-1", name: "One", profile_id: "test:demo" });
    const dispatcher = createDispatcher(host, makeCtx(true), null);
    const result = await dispatcher.call("fdpm.profile.retire", {
      profile_ref: "test:demo@2.0.0",
      idempotency_key: "retire-2",
    });
    expect(result.isError).toBe(true);
    const err = (result.structuredContent as ErrOut).error;
    expect(err.category).toBe("conflict");
    expect(err.evidence?.["workbooks"]).toEqual(["wb-1"]);
    expect(host.profiles.has("test:demo@2.0.0")).toBe(true);
  });
});
