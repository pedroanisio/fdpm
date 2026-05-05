/**
 * `fdpm.health` — Tier 1 (read-only).
 *
 * Liveness probe with a small operational summary. No project state
 * is touched — safe to call without freshness checks.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { HOST_VERSION } from "../../core/version/spec.js";
import { MCP_TOOL_MANIFEST_VERSION } from "../schemas.js";

const Input = z.object({}).strict();

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
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.health",
  tier: "read_only",
  description:
    "Liveness probe. Returns server version, MCP tool manifest version, and a summary of loaded profiles and projects.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, _args, ctx) => {
    const profiles = host.profiles.listRaw();
    const projects = host.listProjects();
    return {
      ok: true as const,
      version: HOST_VERSION,
      manifest_version: MCP_TOOL_MANIFEST_VERSION,
      profiles_loaded: profiles.length,
      projects_loaded: projects.length,
      host_options: {
        data_dir: ctx.hostOptions.dataDir,
        no_plugins: ctx.hostOptions.noPlugins,
      },
    };
  },
};
