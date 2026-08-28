/**
 * Tool-catalog measurement and byte budget (SPEC-MCP-SERVER §8.5).
 *
 * Every `tools/list` response ships the whole registry — one
 * `{ name, description, inputSchema, annotations }` entry per tool —
 * and MCP clients place that payload at the head of every agent
 * session. The registry's size is therefore a per-session token cost
 * paid before the agent does any work, and it grows silently: every
 * new tool, every longer description, every widened schema adds to it
 * with no reviewer seeing the total.
 *
 * This module makes the cost a first-class, measured, capped quantity:
 *
 *   - `buildToolsListEntries` produces the exact wire shape the server
 *     advertises, so the measurement and the advertisement cannot
 *     drift (the bin entry point advertises what this builds).
 *   - `measureCatalog` reports UTF-8 byte sizes per tool and in total.
 *   - `checkCatalogBudget` compares a measurement against a budget and
 *     returns typed violations (`total` / `per_tool`).
 *   - `advertisedCatalog` is the union of the Core manifest and any
 *     plugin-supplied tools, in stable order. Plugin tools count
 *     against the SAME budget — PURPOSE.md's "never bulk-advertised"
 *     rule is enforced here, not by convention.
 *
 * The default numbers are a ratchet, not a derived optimum. They
 * freeze the measured size of the Core manifest plus headroom so that
 * catalog growth becomes a reviewed decision: raising
 * `DEFAULT_CATALOG_BUDGET` requires a CHANGELOG line and a reason.
 * Operators can raise the total (never the per-tool limit) with
 * `FDPM_MCP_CATALOG_BUDGET_BYTES` for a deployment that knowingly
 * accepts the token cost.
 *
 * Evidence for the numbers, measured 2026-08-28 on manifest 0.1.0:
 * 30 tools advertised 33,929 bytes; `fdpm.profile.register` alone
 * carried an 8,809-byte inlined DomainProfile schema (26 %). After
 * moving that schema to `fdpm://schema/profile` the catalog measures
 * ~25 KB; the 28,000-byte default leaves ~10 % headroom.
 */

import type { McpToolEntry } from "./types.js";
import { advertisedTools } from "./manifest.js";
import { toJsonSchema } from "./schemas.js";

/** One entry exactly as advertised in the MCP `tools/list` response. */
export interface AdvertisedTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; [k: string]: unknown };
  annotations: McpToolEntry["annotations"];
}

export interface CatalogToolMeasurement {
  name: string;
  /** UTF-8 bytes of the whole advertised entry (JSON-serialised). */
  bytes: number;
  /** UTF-8 bytes of `description` alone. */
  description_bytes: number;
  /** UTF-8 bytes of `inputSchema` alone (JSON-serialised). */
  schema_bytes: number;
}

export interface CatalogMeasurement {
  tool_count: number;
  /** UTF-8 bytes of `JSON.stringify({ tools })` — the wire payload. */
  total_bytes: number;
  tools: CatalogToolMeasurement[];
}

export interface CatalogBudget {
  /** Cap on the whole `tools/list` payload. Operator-tunable. */
  total_bytes: number;
  /** Cap on any single advertised entry. Not operator-tunable. */
  per_tool_bytes: number;
}

export type BudgetViolation =
  | { kind: "total"; bytes: number; limit: number }
  | { kind: "per_tool"; tool: string; bytes: number; limit: number };

export interface BudgetVerdict {
  ok: boolean;
  violations: BudgetViolation[];
}

/** Measurement + budget + verdict, as computed once at server boot. */
export interface CatalogReport {
  measurement: CatalogMeasurement;
  budget: CatalogBudget;
  ok: boolean;
  violations: BudgetViolation[];
}

export const DEFAULT_CATALOG_BUDGET: CatalogBudget = Object.freeze({
  total_bytes: 28_000,
  per_tool_bytes: 2_000,
});

export const CATALOG_BUDGET_ENV = "FDPM_MCP_CATALOG_BUDGET_BYTES";

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * Shape manifest entries into the MCP `tools/list` wire form. The
 * JSON Schema is derived from each tool's Zod input (§11.1) and the
 * root is coerced to `type: "object"` as the MCP spec requires.
 */
export function buildToolsListEntries(
  tools: ReadonlyArray<McpToolEntry<unknown, unknown>>,
): AdvertisedTool[] {
  return tools.map((tool) => {
    const root: Record<string, unknown> = { ...toJsonSchema(tool.input) };
    if (root["type"] !== "object") root["type"] = "object";
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: root as { type: "object"; [k: string]: unknown },
      annotations: tool.annotations,
    };
  });
}

/**
 * The full advertised catalog: Core manifest (tier order, Tier-3
 * banner applied when destructive is off) followed by plugin tools.
 */
export function advertisedCatalog(opts: {
  enableDestructive: boolean;
  pluginTools?: ReadonlyArray<McpToolEntry<unknown, unknown>>;
}): AdvertisedTool[] {
  const core = advertisedTools({ enableDestructive: opts.enableDestructive });
  return buildToolsListEntries([...core, ...(opts.pluginTools ?? [])]);
}

export function measureCatalog(entries: ReadonlyArray<AdvertisedTool>): CatalogMeasurement {
  const tools = entries.map((entry) => ({
    name: entry.name,
    bytes: utf8Bytes(JSON.stringify(entry)),
    description_bytes: utf8Bytes(entry.description),
    schema_bytes: utf8Bytes(JSON.stringify(entry.inputSchema)),
  }));
  return {
    tool_count: entries.length,
    total_bytes: utf8Bytes(JSON.stringify({ tools: entries })),
    tools,
  };
}

export function checkCatalogBudget(
  measurement: CatalogMeasurement,
  budget: CatalogBudget = DEFAULT_CATALOG_BUDGET,
): BudgetVerdict {
  const violations: BudgetViolation[] = [];
  for (const row of measurement.tools) {
    if (row.bytes > budget.per_tool_bytes) {
      violations.push({
        kind: "per_tool",
        tool: row.name,
        bytes: row.bytes,
        limit: budget.per_tool_bytes,
      });
    }
  }
  if (measurement.total_bytes > budget.total_bytes) {
    violations.push({
      kind: "total",
      bytes: measurement.total_bytes,
      limit: budget.total_bytes,
    });
  }
  return { ok: violations.length === 0, violations };
}

export function buildCatalogReport(
  entries: ReadonlyArray<AdvertisedTool>,
  budget: CatalogBudget = DEFAULT_CATALOG_BUDGET,
): CatalogReport {
  const measurement = measureCatalog(entries);
  const verdict = checkCatalogBudget(measurement, budget);
  return { measurement, budget, ok: verdict.ok, violations: verdict.violations };
}

/**
 * Resolve the budget from the environment. Only `total_bytes` is
 * tunable (`FDPM_MCP_CATALOG_BUDGET_BYTES`); a tool that exceeds the
 * per-tool limit is a defect in that tool, not a deployment choice.
 * Throws on a malformed value so the bin entry point can refuse to
 * start with a clear message, mirroring `--max-calls-per-minute`.
 */
export function resolveCatalogBudget(env: Readonly<Record<string, string | undefined>>): CatalogBudget {
  const raw = env[CATALOG_BUDGET_ENV];
  if (raw === undefined) return { ...DEFAULT_CATALOG_BUDGET };
  if (!/^\d+$/.test(raw) || Number.parseInt(raw, 10) <= 0) {
    throw new Error(
      `${CATALOG_BUDGET_ENV} must be a positive integer (bytes), got ${JSON.stringify(raw)}`,
    );
  }
  return { ...DEFAULT_CATALOG_BUDGET, total_bytes: Number.parseInt(raw, 10) };
}

/** Human-readable violation lines for stderr / operator output. */
export function formatViolations(violations: ReadonlyArray<BudgetViolation>): string[] {
  return violations.map((v) =>
    v.kind === "total"
      ? `catalog total ${v.bytes} B exceeds budget ${v.limit} B`
      : `tool ${v.tool} is ${v.bytes} B, per-tool limit ${v.limit} B`,
  );
}
