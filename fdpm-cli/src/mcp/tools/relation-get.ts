/**
 * `fdpm.relation.get` — Tier 1 (read-only).
 *
 * Returns a full RelationInstance by id within a workbook. Throws
 * `not_found` for unknown ids.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { RelationInstance } from "../../core/models/instance.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

const Output = z
  .object({
    relation: RelationInstance,
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.relation.get",
  tier: "read_only",
  description:
    "Fetch one relation by id within a workbook. Throws not_found if the id is absent.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    const slice = host.getProject(args.workbook_id);
    const rel = slice.relations[args.id];
    if (!rel) {
      throw new FDPMException(
        "not_found",
        `relation not found: ${args.id}`,
        { evidence: { workbook_id: args.workbook_id, id: args.id } },
      );
    }
    return { relation: rel };
  },
};
