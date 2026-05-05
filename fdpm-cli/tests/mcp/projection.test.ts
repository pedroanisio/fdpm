/**
 * Field projection on Tier-1 read tools (v0.1.1).
 *
 * Real-world signal: composed profiles (~66 KB) overflow LLM-client
 * token budgets. Projection lets clients fetch a slice without the
 * server learning anything about their context window.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { tool as profileGetTool } from "../../src/mcp/tools/profile-get.js";
import { tool as projectGetTool } from "../../src/mcp/tools/project-get.js";
import { tool as primitiveGetTool } from "../../src/mcp/tools/primitive-get.js";
import { applyFieldsProjection } from "../../src/mcp/projection.js";

function makeDispatchCtx() {
  return {
    enableDestructive: false,
    auditFullArgs: false,
    hostOptions: { dataDir: "(test)", noPlugins: true },
    enabledPluginIds: [] as readonly string[],
  };
}

describe("applyFieldsProjection (unit)", () => {
  it("returns full object when fields is undefined", () => {
    const r = applyFieldsProjection({ a: 1, b: 2 }, undefined);
    expect(r.applied).toBe(false);
    expect(r.value).toEqual({ a: 1, b: 2 });
  });

  it("returns full object when fields is empty", () => {
    const r = applyFieldsProjection({ a: 1, b: 2 }, []);
    expect(r.applied).toBe(false);
    expect(r.value).toEqual({ a: 1, b: 2 });
  });

  it("keeps only listed keys plus _projected marker", () => {
    const r = applyFieldsProjection({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(r.applied).toBe(true);
    expect(r.value).toEqual({ a: 1, c: 3, _projected: true });
  });

  it("silently drops unknown keys", () => {
    const r = applyFieldsProjection({ a: 1, b: 2 }, ["a", "z"]);
    expect(r.applied).toBe(true);
    expect(r.value).toEqual({ a: 1, _projected: true });
  });
});

describe("Tier-1 tools accept fields argument", () => {
  let host: Host;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "mcp-proj-"));
    host = new Host({ dataDir, noPlugins: true });
    await host.load();
  });

  it("fdpm.profile.get accepts fields and respects projection contract", () => {
    expect(profileGetTool.input.safeParse({ profile_id: "x", fields: ["id"] }).success).toBe(true);
    expect(profileGetTool.input.safeParse({ profile_id: "x" }).success).toBe(true);
    expect(
      profileGetTool.input.safeParse({ profile_id: "x", fields: [] }).success,
    ).toBe(true);
    expect(
      profileGetTool.input.safeParse({ profile_id: "x", fields: [123] }).success,
    ).toBe(false);
  });

  it("fdpm.project.get accepts fields", () => {
    expect(
      projectGetTool.input.safeParse({ project_id: "p", fields: ["primitive_count"] }).success,
    ).toBe(true);
    expect(projectGetTool.input.safeParse({ project_id: "p" }).success).toBe(true);
  });

  it("fdpm.primitive.get accepts fields", () => {
    expect(
      primitiveGetTool.input.safeParse({ project_id: "p", id: "x", fields: ["primitive"] })
        .success,
    ).toBe(true);
    expect(
      primitiveGetTool.input.safeParse({ project_id: "p", id: "x" }).success,
    ).toBe(true);
  });

  it("output schema accepts both full and projected shapes", () => {
    expect(profileGetTool.output.safeParse({ id: "x", version: "1.0" }).success).toBe(true);
    expect(
      profileGetTool.output.safeParse({ id: "x", _projected: true }).success,
    ).toBe(true);
  });
});
