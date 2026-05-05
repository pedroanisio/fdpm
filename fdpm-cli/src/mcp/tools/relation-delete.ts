/**
 * `fdpm.relation.delete` — Tier 3 (destructive).
 *
 * Deletes an existing relation instance. NOT advertised when
 * `--enable-destructive` / `FDPM_MCP_ENABLE_DESTRUCTIVE=1` is unset
 * (SPEC-MCP-SERVER §8.3, §23.1). Same envelope shape as
 * `fdpm.project.delete` and `fdpm.primitive.delete` for consistency.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

const Output = z
  .object({
    ok: z.literal(true),
    operation: Operation,
    post_state_summary: z
      .object({
        project_id: z.string(),
        id: z.string(),
      })
      .strict(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.relation.delete",
  tier: "destructive",
  description:
    "Delete a relation by id within a project. Destructive: the operation cannot be undone by another tool call. Refuses with category=permission, reason=destructive_disabled when destructive tools are not enabled.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    const append = await host.deleteRelation(args.project_id, args.id);
    return {
      ok: true as const,
      operation: append.op,
      post_state_summary: { project_id: args.project_id, id: args.id },
    };
  },
};
