/**
 * `fdpm.relation.list` — Tier 1 (read-only).
 *
 * Lists relations in one workbook, optionally narrowed by type_id,
 * source_id, or target_id. AND-combined when multiple are given.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { RelationInstance } from "../../core/models/instance.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    type_id: z.string().optional(),
    source_id: z.string().optional(),
    target_id: z.string().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  })
  .strict();

const Output = z
  .object({
    relations: z.array(RelationInstance),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.relation.list",
  tier: "read_only",
  description:
    "List relations in a workbook. Optional type_id, source_id, target_id narrow the result; combinations are AND.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  narrowing: ["limit: <n>", "type_id / source_id / target_id to narrow the set"],
  handler: async (host, args) => {
    const filter: {
      typeId?: string;
      sourceId?: string;
      targetId?: string;
    } = {};
    if (args.type_id !== undefined) filter.typeId = args.type_id;
    if (args.source_id !== undefined) filter.sourceId = args.source_id;
    if (args.target_id !== undefined) filter.targetId = args.target_id;
    const found = host.searchRelations(args.workbook_id, filter);
    const limit = args.limit ?? 1000;
    return { relations: found.slice(0, limit) };
  },
};
