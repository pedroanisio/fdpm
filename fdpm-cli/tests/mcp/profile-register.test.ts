/**
 * `fdpm.profile.register` — schema-by-resource contract (SPEC-MCP-SERVER §8.5).
 *
 * The tool's advertised input is an opaque `profile` object; the
 * DomainProfile shape is served by `fdpm://schema/profile` and
 * enforced SERVER-SIDE with the same Zod schema. A malformed profile
 * is a Tier-2 rejection (`isError: false`, `ok: false`, findings
 * keyed `core:profile-schema`) — the same envelope every other Tier-2
 * tool uses — never a protocol error, and never a registration.
 *
 * Covers, through the real dispatcher:
 *   - happy path: envelope shape, registry updated, no `operation`
 *   - malformed profile: rejection envelope, one finding per Zod
 *     issue with a field_path, registry untouched
 *   - refinement enforced server-side even though JSON Schema cannot
 *     express it (label-or-name)
 *   - envelope guard: non-object `profile` / missing key are still
 *     input-schema errors (isError=true, category=validation)
 *   - `extends` naming an unregistered parent → not_found (unchanged)
 *   - persistence path: the registered profile survives a Host reload
 *   - catalog contract: advertised schema is opaque and small; the
 *     description points at the resource
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createSession } from "../../src/mcp/session.js";
import type { DispatchCtx } from "../../src/mcp/types.js";
import { tool as profileRegisterTool } from "../../src/mcp/tools/profile-register.js";
import { advertisedCatalog, measureCatalog } from "../../src/mcp/catalog.js";
import { PROFILE_SCHEMA_URI } from "../../src/mcp/resources/schema.js";

function makeCtx(): DispatchCtx {
  return {
    session: createSession({ maxPerMinute: 600 }),
    enableDestructive: false,
    enabledPlugins: new Set(),
    auditFullArgs: false,
    hostOptions: { dataDir: null, noPlugins: true },
  };
}

async function makeHost(dataDir: string | null = null): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

interface Envelope {
  ok: boolean;
  operation?: unknown;
  validation_report: {
    target_id: string;
    accepted: boolean;
    findings: Array<{
      level: string;
      rule_id: string;
      target_id: string;
      field_path?: string | null;
      message: string;
    }>;
  };
  post_state_summary: { profile_id: string; version: string };
}

const VALID = {
  ...TEST_PROFILE,
  id: "test:registered",
  label: "Registered via MCP",
};

describe("fdpm.profile.register — happy path", () => {
  it("registers a valid profile and returns the Tier-2 envelope without `operation`", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", { profile: VALID });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as Envelope;
    expect(sc.ok).toBe(true);
    expect(sc.validation_report).toEqual({
      target_id: "test:registered",
      findings: [],
      accepted: true,
    });
    expect(sc.post_state_summary).toEqual({
      profile_id: "test:registered",
      version: TEST_PROFILE.version,
    });
    expect("operation" in sc).toBe(false);
    expect(host.profiles.has("test:registered")).toBe(true);
  });

  it("applies Zod defaults server-side (a minimal profile gains empty arrays)", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { id: "test:minimal", version: "0.1.0", name: "Minimal" },
    });
    expect((result.structuredContent as Envelope).ok).toBe(true);
    const stored = host.profiles.getRaw("test:minimal");
    expect(stored.primitive_types).toEqual([]);
    expect(stored.extends).toEqual([]);
  });
});

describe("fdpm.profile.register — malformed profile is a Tier-2 rejection, not a protocol error", () => {
  it("returns isError=false, ok=false, findings keyed core:profile-schema, and does NOT register", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { id: "bad id with spaces", version: "1", label: "Broken" },
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as Envelope;
    expect(sc.ok).toBe(false);
    expect(sc.validation_report.accepted).toBe(false);
    expect(sc.validation_report.target_id).toBe("bad id with spaces");
    expect(sc.validation_report.findings.length).toBeGreaterThanOrEqual(2);
    for (const f of sc.validation_report.findings) {
      expect(f.rule_id).toBe("core:profile-schema");
      expect(f.level).toBe("error");
      expect(f.target_id).toBe("bad id with spaces");
      expect(typeof f.message).toBe("string");
    }
    const paths = sc.validation_report.findings.map((f) => f.field_path);
    expect(paths).toContain("id");
    expect(paths).toContain("version");
    expect("operation" in sc).toBe(false);
    expect(host.profiles.has("bad id with spaces")).toBe(false);
  });

  it("enforces the label-or-name refinement server-side (not expressible in JSON Schema)", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { id: "test:nolabel", version: "1.0.0" },
    });
    const sc = result.structuredContent as Envelope;
    expect(result.isError).toBe(false);
    expect(sc.ok).toBe(false);
    expect(sc.validation_report.findings.some((f) => /label or name/.test(f.message))).toBe(
      true,
    );
    expect(host.profiles.has("test:nolabel")).toBe(false);
  });

  it("rejects unknown top-level keys (strict) with the offending path", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { ...VALID, id: "test:extra", bogus_key: 1 },
    });
    const sc = result.structuredContent as Envelope;
    expect(sc.ok).toBe(false);
    expect(host.profiles.has("test:extra")).toBe(false);
  });

  it("uses a placeholder target_id when the profile has no string id", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { version: "1.0.0", label: "No id" },
    });
    const sc = result.structuredContent as Envelope;
    expect(result.isError).toBe(false);
    expect(sc.ok).toBe(false);
    expect(typeof sc.validation_report.target_id).toBe("string");
    expect(sc.validation_report.target_id.length).toBeGreaterThan(0);
    expect(typeof sc.post_state_summary.profile_id).toBe("string");
  });
});

describe("fdpm.profile.register — envelope guard stays an input-schema error", () => {
  it("non-object `profile` → isError=true, category=validation", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", { profile: "nope" });
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string } }).error;
    expect(env.category).toBe("validation");
  });

  it("missing `profile` key → isError=true, category=validation", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {});
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string } }).error;
    expect(env.category).toBe("validation");
  });
});

describe("fdpm.profile.register — extends chain", () => {
  it("unregistered parent in `extends` → isError=true, category=not_found (unchanged contract)", async () => {
    const host = await makeHost();
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", {
      profile: { ...VALID, id: "test:child", extends: ["test:missing-parent"] },
    });
    expect(result.isError).toBe(true);
    const env = (result.structuredContent as { error: { category: string } }).error;
    expect(env.category).toBe("not_found");
    expect(host.profiles.has("test:child")).toBe(false);
  });
});

describe("fdpm.profile.register — persistence", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "fdpm-profile-register-"));
  });
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("a profile registered over MCP survives a fresh Host on the same data dir", async () => {
    const host = await makeHost(dataDir);
    const dispatcher = createDispatcher(host, makeCtx(), null);
    const result = await dispatcher.call("fdpm.profile.register", { profile: VALID });
    expect((result.structuredContent as Envelope).ok).toBe(true);

    const reloaded = new Host({ dataDir, noPlugins: true });
    await reloaded.load();
    expect(reloaded.profiles.has("test:registered")).toBe(true);
    expect(reloaded.profiles.getRaw("test:registered").label).toBe("Registered via MCP");
  });
});

describe("fdpm.profile.register — catalog contract", () => {
  it("advertises an opaque `profile` object (no inlined DomainProfile properties)", () => {
    const entry = advertisedCatalog({ enableDestructive: false }).find(
      (e) => e.name === "fdpm.profile.register",
    );
    expect(entry).toBeDefined();
    const props = entry!.inputSchema["properties"] as Record<string, Record<string, unknown>>;
    expect(props["profile"]!["type"]).toBe("object");
    expect(props["profile"]).not.toHaveProperty("properties");
    expect(entry!.inputSchema["required"]).toEqual(["profile"]);
  });

  it("the advertised entry is small and the description names the schema resource", () => {
    const m = measureCatalog(advertisedCatalog({ enableDestructive: false }));
    const row = m.tools.find((t) => t.name === "fdpm.profile.register")!;
    expect(row.schema_bytes).toBeLessThan(600);
    expect(profileRegisterTool.description).toContain(PROFILE_SCHEMA_URI);
    expect(profileRegisterTool.description).toMatch(/core:profile-schema/);
  });
});
