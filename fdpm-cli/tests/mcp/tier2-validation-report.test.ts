/**
 * SPEC-MCP-SERVER §22.2 / §23.2 / §23.3 — Tier 2 validation_report
 * envelope.
 *
 * Every Tier-2 success returns the SPEC §8.2 envelope:
 *   `{ ok, operation, validation_report, post_state_summary }`
 * with `validation_report.accepted: true` and `isError: false`.
 *
 * §7-pipeline rejections (validation_report.accepted = false) MUST
 * surface with `isError: false` and `ok: false` — the protocol call
 * succeeded; the operation was rejected. This is the line in §12 the
 * tests defend.
 *
 * For at least three Tier-2 tools we exercise both happy and reject
 * paths.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";

function makeCtx(): DispatchCtx {
  return {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
}

async function makeHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

interface T2Envelope {
  ok: boolean;
  operation?: { kind: string; project_id: string };
  validation_report: {
    accepted: boolean;
    findings: unknown[];
    target_id: string;
  };
  post_state_summary: Record<string, unknown>;
}

describe("Tier 2 — happy paths return populated validation_report", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("fdpm.project.create envelope includes operation, accepted report, and summary", async () => {
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.project.create", {
      project_id: "p1",
      name: "Project One",
      profile_id: "test:demo",
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as T2Envelope;
    expect(sc.ok).toBe(true);
    expect(sc.validation_report.accepted).toBe(true);
    expect(Array.isArray(sc.validation_report.findings)).toBe(true);
    expect(sc.operation?.kind).toBe("project.create");
    expect(sc.post_state_summary["project_id"]).toBe("p1");
    expect(sc.post_state_summary["profile_id"]).toBe("test:demo");
  });

  it("fdpm.primitive.create envelope on a valid primitive", async () => {
    await host.createProject({
      project_id: "p1",
      name: "Project One",
      profile_id: "test:demo",
    });
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.primitive.create", {
      project_id: "p1",
      primitive: {
        id: "section:one",
        type_id: "test:section",
        field_values: { title: "Hello", number: 1 },
      },
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as T2Envelope;
    expect(sc.ok).toBe(true);
    expect(sc.validation_report.accepted).toBe(true);
    expect(sc.operation?.kind).toBe("primitive.create");
  });

  it("fdpm.relation.create envelope on a valid relation", async () => {
    await host.createProject({
      project_id: "p1",
      name: "Project One",
      profile_id: "test:demo",
    });
    await host.createPrimitive("p1", {
      id: "section:one",
      type_id: "test:section",
      field_values: { title: "S", number: 1 },
    });
    await host.createPrimitive("p1", {
      id: "para:one",
      type_id: "test:para",
      field_values: { text: "p" },
    });
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.relation.create", {
      project_id: "p1",
      relation: {
        id: "rel:contains:one",
        type_id: "test:rel:contains",
        source_id: "section:one",
        target_id: "para:one",
      },
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as T2Envelope;
    expect(sc.ok).toBe(true);
    expect(sc.validation_report.accepted).toBe(true);
    expect(sc.operation?.kind).toBe("relation.create");
  });
});

describe("Tier 2 — §7 rejections surface with isError:false and ok:false", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
    await host.createProject({
      project_id: "p1",
      name: "Project One",
      profile_id: "test:demo",
    });
  });

  it("fdpm.primitive.create with title exceeding max_length rejects via validation_report", async () => {
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    // TEST_PROFILE limits title to max 200 chars; 250 is over.
    const result = await dispatcher.call("fdpm.primitive.create", {
      project_id: "p1",
      primitive: {
        id: "section:big",
        type_id: "test:section",
        field_values: { title: "x".repeat(250), number: 1 },
      },
    });
    // Per SPEC §8.2 / §12: protocol call succeeded; operation rejected.
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as T2Envelope;
    expect(sc.ok).toBe(false);
    expect(sc.validation_report.accepted).toBe(false);
    expect(sc.validation_report.findings.length).toBeGreaterThan(0);
  });

  it("fdpm.relation.create on missing endpoints rejects via validation_report", async () => {
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.relation.create", {
      project_id: "p1",
      relation: {
        id: "rel:bad",
        type_id: "test:rel:contains",
        source_id: "section:missing",
        target_id: "para:missing",
      },
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as T2Envelope;
    expect(sc.ok).toBe(false);
    expect(sc.validation_report.accepted).toBe(false);
    expect(sc.validation_report.findings.length).toBeGreaterThan(0);
  });

  it("fdpm.project.create with unknown profile rejects with not_found (genuine protocol error)", async () => {
    const ctx = makeCtx();
    const dispatcher = createDispatcher(host, ctx, null);
    const result = await dispatcher.call("fdpm.project.create", {
      project_id: "px",
      name: "Px",
      profile_id: "missing:profile",
    });
    // not_found is a real protocol error — isError true.
    expect(result.isError).toBe(true);
    const env = (
      result.structuredContent as { error: { category: string } }
    ).error;
    expect(env.category).toBe("not_found");
  });
});
