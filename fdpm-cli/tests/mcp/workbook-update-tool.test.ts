/**
 * `fdpm.workbook.update` over the MCP dispatcher.
 *
 * The Host-level contract lives in `tests/workbook-update.test.ts`;
 * this suite covers what only the MCP surface can break: the tool is
 * advertised in the non-destructive catalog, the §8.2 envelope shape,
 * and the failure paths reaching the caller as typed error envelopes
 * rather than exceptions.
 */

import { describe, it, expect } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import { advertisedTools } from "../../src/mcp/manifest.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

async function bootstrap() {
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
  await host.createProject({
    workbook_id: "p1",
    name: "Original",
    profile_id: TEST_PROFILE.id,
    description: "first description",
  });
  return { host, dispatcher: createDispatcher(host, ctx, null) };
}

function errorOf(result: { structuredContent: unknown }): { category: string } {
  return (result.structuredContent as { error: { category: string } }).error;
}

describe("fdpm.workbook.update", () => {
  it("is advertised without --enable-destructive (it is not a Tier-3 tool)", () => {
    const names = advertisedTools({ enableDestructive: false }).map((t) => t.name);
    expect(names).toContain("fdpm.workbook.update");
  });

  it("renames and returns the Tier-2 envelope", async () => {
    const { host, dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", {
      workbook_id: "p1",
      name: "Renamed",
    });
    expect(result.isError).toBe(false);
    const env = result.structuredContent as {
      ok: boolean;
      operation: { kind: string };
      validation_report: { accepted: boolean };
      post_state_summary: { workbook_id: string; name: string; fields_touched: string[] };
    };
    expect(env.ok).toBe(true);
    expect(env.operation.kind).toBe("workbook.update");
    expect(env.validation_report.accepted).toBe(true);
    expect(env.post_state_summary).toMatchObject({
      workbook_id: "p1",
      name: "Renamed",
      fields_touched: ["name"],
    });
    expect(host.getProject("p1").workbook.name).toBe("Renamed");
  });

  it("clears the description when passed null and reports the touched field", async () => {
    const { host, dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", {
      workbook_id: "p1",
      description: null,
    });
    expect(result.isError).toBe(false);
    const env = result.structuredContent as {
      post_state_summary: { fields_touched: string[] };
    };
    expect(env.post_state_summary.fields_touched).toEqual(["description"]);
    expect(host.getProject("p1").workbook.description).toBeUndefined();
  });

  // -- failure paths --------------------------------------------------

  it("returns a typed verification error when neither field is supplied", async () => {
    const { host, dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", { workbook_id: "p1" });
    expect(result.isError).toBe(true);
    expect(errorOf(result).category).toBe("verification");
    // Nothing was appended and the workbook is untouched.
    expect(host.getProject("p1").workbook.name).toBe("Original");
    expect(host.store.getOperationLog("p1").map((o) => o.kind)).toEqual(["workbook.create"]);
  });

  it("returns not_found for an unknown workbook", async () => {
    const { dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", {
      workbook_id: "absent",
      name: "X",
    });
    expect(result.isError).toBe(true);
    expect(errorOf(result).category).toBe("not_found");
  });

  it("rejects unknown args rather than silently ignoring them", async () => {
    const { host, dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", {
      workbook_id: "p1",
      profile_id: "test:other",
    });
    expect(result.isError).toBe(true);
    expect(errorOf(result).category).toBe("validation");
    expect(host.getProject("p1").workbook.profile_id).toBe(TEST_PROFILE.id);
  });

  it("rejects an empty name", async () => {
    const { dispatcher } = await bootstrap();
    const result = await dispatcher.call("fdpm.workbook.update", {
      workbook_id: "p1",
      name: "",
    });
    expect(result.isError).toBe(true);
    expect(errorOf(result).category).toBe("validation");
  });
});
