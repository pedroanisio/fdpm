/**
 * `fdpm.workbook.list` — Tier 1 (read-only).
 *
 * Enumerates every project loaded into the Host's projection. The
 * underlying `Host.listProjects()` returns an array of summaries
 * (id, name, profile_id, revision); we re-shape into the
 * MCP-advertised schema.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";

const Input = z.object({}).strict();

const ProjectSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    profile_id: z.string(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const Output = z
  .object({
    workbooks: z.array(ProjectSummary),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.workbook.list",
  tier: "read_only",
  description:
    "List loaded projects. Returns id, name, profile_id, and current revision for every project in the projection.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host) => {
    return { workbooks: host.listProjects() };
  },
};
