/**
 * `fdpm.health` — Tier 1 (read-only).
 *
 * Liveness probe with a small operational summary. No workbook state
 * is touched — safe to call without freshness checks.
 *
 * `catalog` (SPEC-MCP-SERVER §8.5) makes the tool-catalog byte budget
 * observable over MCP: how many tools are advertised, how many bytes
 * the `tools/list` payload costs, and the budget it was checked
 * against at boot. The bin entry point computes the report once and
 * passes it in `ctx.catalog`; when a caller builds a `DispatchCtx`
 * without it (tests, embedders) the handler measures the Core
 * manifest on demand. That fallback uses a dynamic import on purpose:
 * `catalog.ts` imports `manifest.ts`, which imports this file, and a
 * static import here would close an ESM cycle that hits the TDZ
 * whenever `health.ts` is the first module loaded.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { HOST_VERSION } from "../../core/version/spec.js";
import { MCP_TOOL_MANIFEST_VERSION } from "../schemas.js";
import { instructionsBytes } from "../instructions.js";

const Input = z.object({}).strict();

const Catalog = z
  .object({
    tool_count: z.number().int(),
    total_bytes: z.number().int(),
    budget_total_bytes: z.number().int(),
    budget_per_tool_bytes: z.number().int(),
    within_budget: z.boolean(),
  })
  .strict();

const Output = z
  .object({
    ok: z.literal(true),
    version: z.string(),
    manifest_version: z.string(),
    profiles_loaded: z.number().int(),
    projects_loaded: z.number().int(),
    host_options: z
      .object({
        data_dir: z.string().nullable(),
        no_plugins: z.boolean(),
      })
      .strict(),
    catalog: Catalog,
    /** SPEC-MCP-SERVER §8.6 — per-session size of initialize.instructions. */
    instructions_bytes: z.number().int(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.health",
  tier: "read_only",
  description:
    "Liveness probe. Returns server version, MCP tool manifest version, a summary of loaded profiles and workbooks, the tool-catalog byte measurement against its budget (tool_count, total_bytes, budget_total_bytes, within_budget), and instructions_bytes (the per-session size of the server instructions).",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, _args, ctx) => {
    const profiles = host.profiles.listRaw();
    const workbooks = host.listProjects();
    const report =
      ctx.catalog ??
      (await (async () => {
        const catalog = await import("../catalog.js");
        return catalog.buildCatalogReport(
          catalog.advertisedCatalog({ enableDestructive: ctx.enableDestructive }),
          catalog.DEFAULT_CATALOG_BUDGET,
        );
      })());
    return {
      ok: true as const,
      version: HOST_VERSION,
      manifest_version: MCP_TOOL_MANIFEST_VERSION,
      profiles_loaded: profiles.length,
      projects_loaded: workbooks.length,
      host_options: {
        data_dir: ctx.hostOptions.dataDir,
        no_plugins: ctx.hostOptions.noPlugins,
      },
      catalog: {
        tool_count: report.measurement.tool_count,
        total_bytes: report.measurement.total_bytes,
        budget_total_bytes: report.budget.total_bytes,
        budget_per_tool_bytes: report.budget.per_tool_bytes,
        within_budget: report.ok,
      },
      instructions_bytes: instructionsBytes(),
    };
  },
};
