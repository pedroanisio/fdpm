/**
 * `fdpm.primitive.get` — Tier 1 (read-only).
 *
 * Returns the full PrimitiveInstance (id, uid, type_id, field_values,
 * optional scope_id, revision) for a single id within a project.
 * Throws `not_found` for unknown ids.
 *
 * Field projection (v0.1.1): pass `fields` to keep only top-level
 * keys of the wrapper shape (`["primitive"]` is the trivial identity;
 * useful when batching with siblings that omit it).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";
import { applyFieldsProjection } from "../projection.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Optional top-level key projection. When present, only listed keys are returned plus a `_projected: true` marker.",
      ),
  })
  .strict();

const Output = z
  .object({})
  .passthrough()
  .describe(
    "Either the full `{primitive}` envelope, or — when `fields` was passed — a projection containing only the requested keys plus `_projected: true`.",
  );

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.primitive.get",
  tier: "read_only",
  description:
    "Fetch one primitive by id within a project. Pass `fields` to project a subset of top-level response keys. Throws not_found if the id is absent.",
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
    const full: Record<string, unknown> = { primitive: prim };
    return applyFieldsProjection(full, args.fields).value;
  },
};
