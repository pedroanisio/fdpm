/**
 * `fdpm.primitive.patch` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    patch: z
      .object({
        id: z.string().min(1),
        field_values: z.record(z.unknown()),
        scope_id: z.string().optional(),
        expected_revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    primitive_id: z.string(),
    project_id: z.string(),
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
    "Partial-update a primitive's field_values. Validation scope is the touched paths only; pre-existing violations on untouched fields do not block the edit.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.patchPrimitive(
      args.project_id,
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
        project_id: args.project_id,
        fields_touched: touched,
      },
    };
  },
};
