/**
 * SPEC-MCP-SERVER §22 Acceptance #1 — Tier 1 tool happy-path + invalid-input.
 *
 * For each of the five Tier-1 tools shipped in slice B-prelim:
 *   - Construct an in-memory Host with a fixture profile.
 *   - Call the tool's handler directly (bypass MCP framing).
 *   - Assert the output validates against the declared output schema.
 *   - Assert garbage input fails the input schema.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { tool as healthTool } from "../../src/mcp/tools/health.js";
import { tool as profileListTool } from "../../src/mcp/tools/profile-list.js";
import { tool as profileGetTool } from "../../src/mcp/tools/profile-get.js";
import { tool as projectListTool } from "../../src/mcp/tools/workbook-list.js";
import { tool as projectGetTool } from "../../src/mcp/tools/workbook-get.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

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
  // null dataDir = in-memory only. No plugins for determinism.
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

describe("fdpm.health", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("happy path — returns ok=true with a populated summary", async () => {
    const ctx = makeCtx();
    const args = healthTool.input.parse({});
    const out = await healthTool.handler(host, args, ctx);
    expect(out.ok).toBe(true);
    expect(typeof out.version).toBe("string");
    expect(typeof out.manifest_version).toBe("string");
    // core:empty + test:demo
    expect(out.profiles_loaded).toBeGreaterThanOrEqual(2);
    expect(out.projects_loaded).toBe(0);
    expect(out.host_options.no_plugins).toBe(true);
    expect(healthTool.output.safeParse(out).success).toBe(true);
  });

  it("invalid input is rejected by the input schema (extra keys forbidden)", () => {
    expect(healthTool.input.safeParse({ unexpected: 1 }).success).toBe(false);
    expect(healthTool.input.safeParse(123).success).toBe(false);
  });
});

describe("fdpm.profile.list", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("happy path — lists registered profiles with id+version", async () => {
    const ctx = makeCtx();
    const args = profileListTool.input.parse({});
    const out = await profileListTool.handler(host, args, ctx);
    expect(Array.isArray(out.profiles)).toBe(true);
    expect(out.profiles.length).toBeGreaterThanOrEqual(2);
    expect(out.profiles.find((p) => p.id === "test:demo")).toBeTruthy();
    expect(profileListTool.output.safeParse(out).success).toBe(true);
  });

  it("invalid input is rejected (extra keys)", () => {
    expect(profileListTool.input.safeParse({ filter: "x" }).success).toBe(false);
  });
});

describe("fdpm.profile.get", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("happy path — fetches the test profile by id", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({ profile_id: "test:demo" });
    const out = await profileGetTool.handler(host, args, ctx);
    expect((out as { id: string }).id).toBe("test:demo");
    expect(profileGetTool.output.safeParse(out).success).toBe(true);
  });

  it("not_found is thrown for an unknown profile_id", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({ profile_id: "does:not:exist" });
    await expect(profileGetTool.handler(host, args, ctx)).rejects.toBeInstanceOf(
      FDPMException,
    );
  });

  it("invalid input is rejected (missing required field)", () => {
    expect(profileGetTool.input.safeParse({}).success).toBe(false);
    expect(profileGetTool.input.safeParse({ profile_id: 123 }).success).toBe(false);
  });

  // ── view argument (v0.1.2) — handler-level integration ──────────

  it("view='summary' returns id/version/counts and the _view marker", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({
      profile_id: "test:demo",
      view: "summary",
    });
    const out = (await profileGetTool.handler(host, args, ctx)) as Record<
      string,
      unknown
    >;
    expect(out._view).toBe("summary");
    expect(out.id).toBe("test:demo");
    expect(out.version).toBe("1.0.0");
    expect(out.primitive_type_count).toBe(2);
    expect(out.relation_type_count).toBe(1);
    // Summary view never includes the heavy arrays.
    expect("primitive_types" in out).toBe(false);
    expect("relation_types" in out).toBe(false);
  });

  it("view='types' returns the type vocabulary in stripped form", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({
      profile_id: "test:demo",
      view: "types",
    });
    const out = (await profileGetTool.handler(host, args, ctx)) as Record<
      string,
      unknown
    >;
    expect(out._view).toBe("types");
    const prims = out.primitive_types as Array<Record<string, unknown>>;
    const section = prims.find((p) => p.id === "test:section")!;
    expect(section).toBeTruthy();
    const fields = section.fields as Array<Record<string, unknown>>;
    // Field shape is the canonical `kind`/`required`/`enum_values` form.
    const status = fields.find((f) => f.name === "status")!;
    expect(status.kind).toBe("enum");
    expect(status.enum_values).toEqual(["draft", "stable", "deprecated"]);
  });

  it("view='full' is equivalent to omitting view (no markers, full payload)", async () => {
    const ctx = makeCtx();
    const fullArgs = profileGetTool.input.parse({
      profile_id: "test:demo",
      view: "full",
    });
    const baseArgs = profileGetTool.input.parse({ profile_id: "test:demo" });
    const fullOut = (await profileGetTool.handler(host, fullArgs, ctx)) as Record<
      string,
      unknown
    >;
    const baseOut = (await profileGetTool.handler(host, baseArgs, ctx)) as Record<
      string,
      unknown
    >;
    expect(fullOut._view).toBeUndefined();
    expect(baseOut._view).toBeUndefined();
    // Both return the full primitive_types[] array — same length.
    expect((fullOut.primitive_types as unknown[]).length).toBe(
      (baseOut.primitive_types as unknown[]).length,
    );
  });

  it("view + fields compose: view applied first, then fields", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({
      profile_id: "test:demo",
      view: "summary",
      fields: ["id", "primitive_type_count"],
    });
    const out = (await profileGetTool.handler(host, args, ctx)) as Record<
      string,
      unknown
    >;
    // Both markers present; only requested keys plus markers survive.
    expect(out._projected).toBe(true);
    // _view was set by the summary projection; fields kept it only
    // if "_view" was in the requested key set, which it is not — so
    // it should be absent here. This verifies the composition order
    // (view first, then fields).
    expect("_view" in out).toBe(false);
    expect(out.id).toBe("test:demo");
    expect(out.primitive_type_count).toBe(2);
    // The full primitive_types[] never appeared because the view
    // stripped it before the fields filter could pick it up.
    expect("primitive_types" in out).toBe(false);
    expect("version" in out).toBe(false);
  });

  it("view='summary' on an unknown profile_id still throws not_found", async () => {
    const ctx = makeCtx();
    const args = profileGetTool.input.parse({
      profile_id: "does:not:exist",
      view: "summary",
    });
    await expect(
      profileGetTool.handler(host, args, ctx),
    ).rejects.toBeInstanceOf(FDPMException);
  });
});

describe("fdpm.workbook.list", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
  });

  it("happy path — empty list when no workbooks, populated after createProject", async () => {
    const ctx = makeCtx();
    const args = projectListTool.input.parse({});
    let out = await projectListTool.handler(host, args, ctx);
    expect(out.workbooks).toEqual([]);

    await host.createProject({
      workbook_id: "p1",
      name: "Workbook One",
      profile_id: "test:demo",
    });
    out = await projectListTool.handler(host, args, ctx);
    expect(out.workbooks.length).toBe(1);
    expect(out.workbooks[0]?.id).toBe("p1");
    expect(projectListTool.output.safeParse(out).success).toBe(true);
  });

  it("invalid input is rejected (extra keys)", () => {
    expect(projectListTool.input.safeParse({ q: "x" }).success).toBe(false);
  });
});

describe("fdpm.workbook.get", () => {
  let host: Host;
  beforeEach(async () => {
    host = await makeHost();
    await host.createProject({
      workbook_id: "p1",
      name: "Workbook One",
      profile_id: "test:demo",
    });
  });

  it("happy path — returns the workbook row and counts", async () => {
    const ctx = makeCtx();
    const args = projectGetTool.input.parse({ workbook_id: "p1" });
    const out = await projectGetTool.handler(host, args, ctx);
    expect((out as { workbook: { id: string } }).workbook.id).toBe("p1");
    expect((out as { primitive_count: number }).primitive_count).toBe(0);
    expect((out as { relation_count: number }).relation_count).toBe(0);
    expect(projectGetTool.output.safeParse(out).success).toBe(true);
  });

  it("not_found is thrown for an unknown workbook_id", async () => {
    const ctx = makeCtx();
    const args = projectGetTool.input.parse({ workbook_id: "no-such" });
    await expect(projectGetTool.handler(host, args, ctx)).rejects.toBeInstanceOf(
      FDPMException,
    );
  });

  it("invalid input is rejected (missing required field, wrong type)", () => {
    expect(projectGetTool.input.safeParse({}).success).toBe(false);
    expect(projectGetTool.input.safeParse({ workbook_id: 5 }).success).toBe(false);
  });
});
