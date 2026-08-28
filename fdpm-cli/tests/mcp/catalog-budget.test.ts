/**
 * SPEC-MCP-SERVER §8.5 — tool-catalog byte budget.
 *
 * Every `tools/list` response ships the full registry (name +
 * description + JSON Schema per tool) at the head of every agent
 * session. The registry's byte size is therefore a per-session token
 * cost paid before the agent does any work. This suite makes that
 * cost measured and capped:
 *
 *   - the Core manifest MUST fit `DEFAULT_CATALOG_BUDGET.total_bytes`
 *     in both destructive modes (Tier-3 banners count);
 *   - no single tool MAY exceed `DEFAULT_CATALOG_BUDGET.per_tool_bytes`;
 *   - plugin-supplied tools are measured against the SAME budget, so
 *     the future `mcp_tool` capability cannot bulk-advertise its way
 *     past the cap (PURPOSE.md: "keep the catalog small enough that
 *     the agent can reason about it");
 *   - `fdpm.profile.register` no longer inlines the DomainProfile
 *     JSON Schema (8.8 KB — 26 % of the pre-budget catalog); the
 *     schema is served by `fdpm://schema/profile` instead.
 *
 * The budget numbers are a ratchet, not a derived optimum: they
 * freeze the measured size plus headroom so that growth is a
 * reviewed decision (bump the constant in `src/mcp/catalog.ts` with a
 * CHANGELOG line), never an accident.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  DEFAULT_CATALOG_BUDGET,
  advertisedCatalog,
  buildToolsListEntries,
  checkCatalogBudget,
  measureCatalog,
  resolveCatalogBudget,
  type CatalogBudget,
} from "../../src/mcp/catalog.js";
import { MANIFEST, advertisedTools } from "../../src/mcp/manifest.js";
import type { McpToolEntry } from "../../src/mcp/types.js";

function syntheticTool(
  name: string,
  descriptionLength: number,
): McpToolEntry<unknown, unknown> {
  return {
    name,
    tier: "read_only",
    description: "x".repeat(descriptionLength),
    input: z.object({}).strict(),
    output: z.object({}).strict(),
    annotations: { readOnlyHint: true },
    handler: async () => ({}),
  };
}

// ── Core manifest within budget ────────────────────────────────────

describe("catalog budget — Core manifest fits DEFAULT_CATALOG_BUDGET", () => {
  for (const enableDestructive of [false, true]) {
    it(`total_bytes within budget and tool_count matches advertisedTools (destructive=${enableDestructive})`, () => {
      const entries = advertisedCatalog({ enableDestructive });
      const m = measureCatalog(entries);
      const verdict = checkCatalogBudget(m, DEFAULT_CATALOG_BUDGET);
      expect(verdict.violations).toEqual([]);
      expect(verdict.ok).toBe(true);
      expect(m.tool_count).toBe(advertisedTools({ enableDestructive }).length);
      expect(m.total_bytes).toBeLessThanOrEqual(DEFAULT_CATALOG_BUDGET.total_bytes);
    });
  }

  it("no single Core tool exceeds per_tool_bytes (banner-prefixed Tier-3 included)", () => {
    const m = measureCatalog(advertisedCatalog({ enableDestructive: false }));
    for (const row of m.tools) {
      expect(
        row.bytes,
        `${row.name} is ${row.bytes} B, limit ${DEFAULT_CATALOG_BUDGET.per_tool_bytes} B`,
      ).toBeLessThanOrEqual(DEFAULT_CATALOG_BUDGET.per_tool_bytes);
    }
  });

  it("fdpm.profile.register no longer inlines the DomainProfile schema (regression: 8.8 KB inputSchema)", () => {
    const m = measureCatalog(advertisedCatalog({ enableDestructive: false }));
    const row = m.tools.find((t) => t.name === "fdpm.profile.register");
    expect(row).toBeDefined();
    expect(row!.schema_bytes).toBeLessThan(600);
    expect(row!.bytes).toBeLessThan(1400);
  });

  it("the budget constants are sane (per_tool < total, both positive)", () => {
    expect(DEFAULT_CATALOG_BUDGET.total_bytes).toBeGreaterThan(0);
    expect(DEFAULT_CATALOG_BUDGET.per_tool_bytes).toBeGreaterThan(0);
    expect(DEFAULT_CATALOG_BUDGET.per_tool_bytes).toBeLessThan(
      DEFAULT_CATALOG_BUDGET.total_bytes,
    );
  });
});

// ── measureCatalog ─────────────────────────────────────────────────

describe("measureCatalog", () => {
  it("total_bytes equals the UTF-8 byte length of the tools/list payload", () => {
    const entries = buildToolsListEntries(MANIFEST);
    const m = measureCatalog(entries);
    expect(m.total_bytes).toBe(
      Buffer.byteLength(JSON.stringify({ tools: entries }), "utf8"),
    );
  });

  it("per-tool rows: bytes = byteLength(JSON(entry)); description+schema ≤ bytes", () => {
    const entries = buildToolsListEntries(MANIFEST);
    const m = measureCatalog(entries);
    expect(m.tools.length).toBe(entries.length);
    for (const [i, row] of m.tools.entries()) {
      const entry = entries[i]!;
      expect(row.name).toBe(entry.name);
      expect(row.bytes).toBe(Buffer.byteLength(JSON.stringify(entry), "utf8"));
      expect(row.description_bytes).toBe(Buffer.byteLength(entry.description, "utf8"));
      expect(row.schema_bytes).toBe(
        Buffer.byteLength(JSON.stringify(entry.inputSchema), "utf8"),
      );
      expect(row.description_bytes + row.schema_bytes).toBeLessThanOrEqual(row.bytes);
    }
  });

  it("counts multibyte characters as bytes, not code units", () => {
    const t = syntheticTool("t.multibyte", 0);
    t.description = "⚠".repeat(10); // U+26A0 is 3 bytes in UTF-8
    const m = measureCatalog(buildToolsListEntries([t]));
    expect(m.tools[0]!.description_bytes).toBe(30);
  });

  it("every advertised inputSchema has type:object at the root (MCP requirement)", () => {
    for (const entry of advertisedCatalog({ enableDestructive: true })) {
      expect(entry.inputSchema["type"], entry.name).toBe("object");
    }
  });
});

// ── checkCatalogBudget ─────────────────────────────────────────────

describe("checkCatalogBudget", () => {
  const budget: CatalogBudget = { total_bytes: 5_000, per_tool_bytes: 1_000 };

  it("flags a tool over per_tool_bytes with kind=per_tool naming the tool", () => {
    const m = measureCatalog(
      buildToolsListEntries([syntheticTool("t.small", 10), syntheticTool("t.big", 1_500)]),
    );
    const v = checkCatalogBudget(m, budget);
    expect(v.ok).toBe(false);
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]).toMatchObject({
      kind: "per_tool",
      tool: "t.big",
      limit: 1_000,
    });
    expect(v.violations[0]!.bytes).toBeGreaterThan(1_000);
  });

  it("flags the total with kind=total when many in-limit tools add up", () => {
    const tools = Array.from({ length: 10 }, (_, i) => syntheticTool(`t.n${i}`, 500));
    const m = measureCatalog(buildToolsListEntries(tools));
    const v = checkCatalogBudget(m, budget);
    expect(v.ok).toBe(false);
    expect(v.violations.map((x) => x.kind)).toEqual(["total"]);
    expect(v.violations[0]).toMatchObject({ kind: "total", limit: 5_000 });
  });

  it("reports both kinds when both are violated", () => {
    const tools = [syntheticTool("t.huge", 6_000)];
    const v = checkCatalogBudget(measureCatalog(buildToolsListEntries(tools)), budget);
    expect(v.violations.map((x) => x.kind).sort()).toEqual(["per_tool", "total"]);
  });

  it("passes an empty catalog", () => {
    const v = checkCatalogBudget(measureCatalog([]), budget);
    expect(v).toEqual({ ok: true, violations: [] });
  });
});

// ── Plugin tools share the budget ──────────────────────────────────

describe("advertisedCatalog — plugin tools count against the same budget", () => {
  it("includes plugin tools in the entries and in the measurement", () => {
    const plugin = [syntheticTool("planning.task.complete", 120)];
    const entries = advertisedCatalog({ enableDestructive: false, pluginTools: plugin });
    expect(entries.map((e) => e.name)).toContain("planning.task.complete");
    expect(measureCatalog(entries).tool_count).toBe(
      advertisedTools({ enableDestructive: false }).length + 1,
    );
  });

  it("Core tools come first, plugin tools after (stable advertisement order)", () => {
    const plugin = [syntheticTool("zz.plugin.tool", 10)];
    const entries = advertisedCatalog({ enableDestructive: false, pluginTools: plugin });
    expect(entries[entries.length - 1]!.name).toBe("zz.plugin.tool");
  });

  it("a plugin catalog that pushes the total over budget fails the check", () => {
    const plugin = Array.from({ length: 40 }, (_, i) =>
      syntheticTool(`plugin.verb.${i}`, 300),
    );
    const entries = advertisedCatalog({ enableDestructive: false, pluginTools: plugin });
    const v = checkCatalogBudget(measureCatalog(entries), DEFAULT_CATALOG_BUDGET);
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.kind === "total")).toBe(true);
  });
});

// ── resolveCatalogBudget (FDPM_MCP_CATALOG_BUDGET_BYTES) ───────────

describe("resolveCatalogBudget — FDPM_MCP_CATALOG_BUDGET_BYTES", () => {
  it("returns the defaults when unset", () => {
    expect(resolveCatalogBudget({})).toEqual(DEFAULT_CATALOG_BUDGET);
  });

  it("overrides total_bytes only; per_tool_bytes is not operator-tunable", () => {
    expect(resolveCatalogBudget({ FDPM_MCP_CATALOG_BUDGET_BYTES: "50000" })).toEqual({
      ...DEFAULT_CATALOG_BUDGET,
      total_bytes: 50_000,
    });
  });

  it("rejects non-numeric, zero, negative, and fractional values", () => {
    for (const bad of ["abc", "0", "-1", "12.5", ""]) {
      expect(
        () => resolveCatalogBudget({ FDPM_MCP_CATALOG_BUDGET_BYTES: bad }),
        `value ${JSON.stringify(bad)} should be rejected`,
      ).toThrow(/FDPM_MCP_CATALOG_BUDGET_BYTES/);
    }
  });
});
