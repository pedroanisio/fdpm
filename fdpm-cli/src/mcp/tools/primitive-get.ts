/**
 * `fdpm.primitive.get` — Tier 1 (read-only).
 *
 * Returns the full PrimitiveInstance (id, uid, type_id, field_values,
 * optional scope_id, revision) for a single id within a project.
 * Throws `not_found` for unknown ids.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { PrimitiveInstance } from "../../core/models/instance.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

const Output = z
  .object({
    primitive: PrimitiveInstance,
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.primitive.get",
  tier: "read_only",
  description:
    "Fetch one primitive by id within a project. Throws not_found if the id is absent.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    const slice = host.getProject(args.project_id);
    const prim = slice.primitives[args.id];
    if (!prim) {
      throw new FDPMException(
        "not_found",
        `primitive not found: ${args.id}`,
        { evidence: { project_id: args.project_id, id: args.id } },
      );
    }
    return { primitive: prim };
  },
};
