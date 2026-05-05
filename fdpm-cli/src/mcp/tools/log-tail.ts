/**
 * `fdpm.log.tail` — Tier 1 (read-only).
 *
 * Returns the last N operations from a project's append-only log.
 * `limit` defaults to 50, capped at 1000 (the same cap that
 * `Host.getLog` enforces). Useful for an LLM agent reviewing recent
 * activity before deciding on a Tier 2 mutation.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    limit: z.number().int().positive().max(1000).optional(),
  })
  .strict();

const Output = z
  .object({
    ops: z.array(Operation),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.log.tail",
  tier: "read_only",
  description:
    "Return the most recent operations from a project's log (oldest-to-newest within the returned slice). Default limit 50, max 1000.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    const limit = args.limit ?? 50;
    // Host.getLog filters then slice(0, limit) from the head, but we
    // want the last N. Request the largest page (FDPM_LOG_PAGE_MAX, env
    // default 10000) and tail-slice client-side. For projects whose
    // log exceeds that ceiling, we lose access to ops older than
    // FDPM_LOG_PAGE_MAX from the head — acceptable for a tail surface.
    const ceiling = parseInt(process.env["FDPM_LOG_PAGE_MAX"] ?? "10000", 10);
    const all = host.getLog(args.project_id, { limit: ceiling });
    const tail = all.length <= limit ? all : all.slice(all.length - limit);
    return { ops: tail };
  },
};
