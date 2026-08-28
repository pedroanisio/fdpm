/**
 * SPEC-MCP-SERVER §8.6 — server instructions (cold-start orientation).
 *
 * `instructions` is the one MCP field a client places in the agent's
 * system context once per session. It is the right home for the
 * "how to think" layer that PURPOSE.md says tool descriptions cannot
 * carry: call order, the Tier-2 envelope contract, resource-first
 * reads, the recovery loop on rejection. Before this change it was a
 * single sentence and every Tier-2 description repeated the envelope
 * boilerplate instead (sent with every tools/list).
 *
 * The text is STATIC and deterministic — a pure function of manifest
 * constants — so `initialize.instructions` and the `fdpm://guide`
 * resource are byte-identical and testable without a server. Runtime
 * state (destructive on/off, rate limit, catalog bytes) is reported by
 * `fdpm.health` and the Tier-3 banner, and the text says so.
 */

import { describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import {
  INSTRUCTIONS_BUDGET_BYTES,
  SERVER_INSTRUCTIONS,
  checkInstructionsBudget,
  instructionsBytes,
} from "../../src/mcp/instructions.js";
import { MCP_TOOL_MANIFEST_VERSION } from "../../src/mcp/schemas.js";
import { MANIFEST, TIER_3_DISABLED_BANNER } from "../../src/mcp/manifest.js";
import { listTemplates } from "../../src/mcp/resources/registry.js";

describe("SERVER_INSTRUCTIONS — content contract", () => {
  it("names the manifest version and the product in the first line", () => {
    const firstLine = SERVER_INSTRUCTIONS.split("\n")[0]!;
    expect(firstLine).toContain("FDPM");
    expect(firstLine).toContain(MCP_TOOL_MANIFEST_VERSION);
  });

  it("teaches the cold-start call order: list → type_info before create → resources for reads → batch → verify", () => {
    const order = [
      "fdpm.workbook.list",
      "fdpm.profile.type_info",
      "fdpm://",
      "create_batch",
      "fdpm.log.tail",
    ];
    let last = -1;
    for (const marker of order) {
      const idx = SERVER_INSTRUCTIONS.indexOf(marker);
      expect(idx, `${marker} missing`).toBeGreaterThan(last);
      last = idx;
    }
    expect(SERVER_INSTRUCTIONS).toMatch(/id_pattern/);
    expect(SERVER_INSTRUCTIONS).toMatch(/required_field_names/);
  });

  it("states the Tier-2 envelope contract and the recovery loop once", () => {
    for (const phrase of [
      "validation_report",
      "findings",
      "rule_id",
      "field_path",
      "isError",
      "ok: false",
      "post_state_summary",
      "operations[]",
      "expected_revision",
    ]) {
      expect(SERVER_INSTRUCTIONS, phrase).toContain(phrase);
    }
    expect(SERVER_INSTRUCTIONS).toMatch(/fix the input.{0,20}retry/i);
  });

  it("explains every evidence.reason the dispatcher can refuse with", () => {
    for (const reason of ["destructive_disabled", "stale_state", "rate_limited", "confirmation_required"]) {
      expect(SERVER_INSTRUCTIONS, reason).toContain(reason);
    }
    expect(SERVER_INSTRUCTIONS).toContain("SIGHUP");
    expect(SERVER_INSTRUCTIONS).toContain("_confirmation_token");
    expect(SERVER_INSTRUCTIONS).toContain("--enable-destructive");
  });

  it("lists every resource URI template the registry advertises, verbatim", async () => {
    const host = new Host({ dataDir: null, noPlugins: true });
    await host.load();
    await host.registerProfile(TEST_PROFILE);
    const templates = listTemplates(host).map((t) => t.uriTemplate);
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const tpl of templates) {
      expect(SERVER_INSTRUCTIONS, `template ${tpl} not mentioned`).toContain(tpl);
    }
  });

  it("points at fdpm.health for runtime state instead of embedding it", () => {
    expect(SERVER_INSTRUCTIONS).toContain("fdpm.health");
    // §13.5 — prompts are the domain layer; the guide says how to find them.
    expect(SERVER_INSTRUCTIONS).toContain("prompts/list");
    expect(SERVER_INSTRUCTIONS).toContain("planning/triage_iteration");
    expect(SERVER_INSTRUCTIONS).not.toMatch(/destructive_enabled=(true|false)/);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/\b\d{2},\d{3} B\b/); // no baked-in catalog bytes
  });

  it("does not paste the Tier-3 disabled banner (the banner lives on the tools)", () => {
    expect(SERVER_INSTRUCTIONS).not.toContain(TIER_3_DISABLED_BANNER);
  });

  it("mentions only tool names that exist in the manifest", () => {
    const known = new Set(MANIFEST.map((t) => t.name));
    const mentioned = SERVER_INSTRUCTIONS.match(/fdpm\.[a-z_]+(\.[a-z_]+)?/g) ?? [];
    const unknown = [...new Set(mentioned)].filter((n) => !known.has(n));
    expect(unknown).toEqual([]);
  });
});

describe("SERVER_INSTRUCTIONS — size and hygiene (per-session cost)", () => {
  it("fits INSTRUCTIONS_BUDGET_BYTES", () => {
    // Ratcheted 4,000 → 4,500 with the audit (§9.5) and prompts (§13.5) lines.
    expect(INSTRUCTIONS_BUDGET_BYTES).toBe(4_500);
    expect(instructionsBytes()).toBe(Buffer.byteLength(SERVER_INSTRUCTIONS, "utf8"));
    expect(instructionsBytes()).toBeLessThanOrEqual(INSTRUCTIONS_BUDGET_BYTES);
    expect(instructionsBytes()).toBeGreaterThan(1_000);
  });

  it("has no tabs, trailing whitespace, or trailing newline", () => {
    expect(SERVER_INSTRUCTIONS).not.toMatch(/\t/);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/ +\n/);
    expect(SERVER_INSTRUCTIONS.endsWith("\n")).toBe(false);
  });

  it("is a frozen constant (same bytes on every import)", async () => {
    const again = await import("../../src/mcp/instructions.js");
    expect(again.SERVER_INSTRUCTIONS).toBe(SERVER_INSTRUCTIONS);
  });
});

describe("checkInstructionsBudget — the §8.6 boot gate", () => {
  it("passes the constant text against the constant budget (defaults)", () => {
    expect(checkInstructionsBudget()).toEqual({
      ok: true,
      bytes: instructionsBytes(),
      budget_bytes: INSTRUCTIONS_BUDGET_BYTES,
    });
  });

  it("fails when bytes exceed the budget and reports both numbers", () => {
    expect(checkInstructionsBudget(4_001, 4_000)).toEqual({
      ok: false,
      bytes: 4_001,
      budget_bytes: 4_000,
    });
    expect(checkInstructionsBudget(4_000, 4_000).ok).toBe(true);
  });
});
