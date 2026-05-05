/**
 * `fdpm.workbook.get` — Tier 1 (read-only).
 *
 * Returns the workbook's `Workbook` row plus a primitive/relation
 * count summary. The full slice (every primitive and relation) is
 * intentionally NOT included — that surface is reserved for paged
 * search/list tools (deferred). This response is small enough that
 * an LLM can use it for navigation without consuming the full
 * workbook state.
 *
 * Field projection (v0.1.1): pass `fields` to keep only top-level
 * keys from the response (`["primitive_count","relation_count"]`
 * skips the row when only counts are needed).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { applyFieldsProjection } from "../projection.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Optional top-level key projection over the response shape (`project`, `primitive_count`, `relation_count`). When present, only listed keys are returned plus a `_projected: true` marker.",
      ),
  })
  .strict();

const Output = z
  .object({})
  .passthrough()
  .describe(
    "Either the full `{project, primitive_count, relation_count}` envelope, or — when `fields` was passed — a projection containing only the requested keys plus `_projected: true`.",
  );

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.workbook.get",
  tier: "read_only",
  description:
    "Fetch a workbook's row and instance counts. Pass `fields` to workbook a subset. Throws not_found if the workbook_id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    // Host.getProject throws FDPMException("not_found") on miss.
    const slice = host.getProject(args.workbook_id);
    const full: Record<string, unknown> = {
      workbook: slice.workbook,
      primitive_count: Object.keys(slice.primitives).length,
      relation_count: Object.keys(slice.relations).length,
    };
    return applyFieldsProjection(full, args.fields).value;
  },
};
