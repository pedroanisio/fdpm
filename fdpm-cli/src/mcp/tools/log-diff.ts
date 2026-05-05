/**
 * `fdpm.log.diff` — Tier 1 (read-only).
 *
 * Returns the slice of a project's operation log between two
 * revisions. `to_revision` defaults to the project's current
 * revision (i.e. "everything from `from_revision` to now"). Helpful
 * for an LLM agent reconstructing what happened since the last time
 * it inspected the project.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    from_revision: z.number().int().nonnegative(),
    to_revision: z.number().int().nonnegative().optional(),
  })
  .strict();

const Output = z
  .object({
    ops: z.array(Operation),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.log.diff",
  tier: "read_only",
  description:
    "Return the operations of a project between two revisions (inclusive). to_revision defaults to current.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    const filter: { from_revision: number; to_revision?: number; limit: number } = {
      from_revision: args.from_revision,
      limit: parseInt(process.env["FDPM_LOG_PAGE_MAX"] ?? "10000", 10),
    };
    if (args.to_revision !== undefined) filter.to_revision = args.to_revision;
    const ops = host.getLog(args.project_id, filter);
    return { ops };
  },
};
