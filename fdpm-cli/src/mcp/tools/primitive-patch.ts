/**
 * `fdpm.primitive.patch` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    patch: z
      .object({
        id: z.string().min(1),
        field_values: z.record(z.string(), z.unknown()),
        scope_id: z.string().optional(),
        expected_revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    primitive_id: z.string(),
    workbook_id: z.string(),
    fields_touched: z.array(z.string()),
  })
  .strict();

const Output = z
  .object({
    ...Tier2EnvelopeBase,
    post_state_summary: PostStateSummary,
  })
  .strict();

export const tool: McpToolEntry<
  z.infer<typeof Input>,
  Tier2Envelope<z.infer<typeof PostStateSummary>>
> = {
  name: "fdpm.primitive.patch",
  tier: "validating_write",
  description:
    "Partial-update a primitive's field_values: only the keys present in `patch.field_values` are merged in. Validation covers the touched paths only — pre-existing violations on untouched fields do NOT block the edit (use this to evolve a partially-invalid primitive incrementally), and a rejection lists findings for the touched paths only. Use fdpm.primitive.replace to rewrite the whole field_values; fdpm.primitive.field_patch for JSON-Patch-style path edits.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.patchPrimitive(
      args.workbook_id,
      args.patch,
    );
    const touched = Object.keys(args.patch.field_values);
    if (args.patch.scope_id !== undefined) touched.push("scope_id");
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        primitive_id: args.patch.id,
        workbook_id: args.workbook_id,
        fields_touched: touched,
      },
    };
  },
};
