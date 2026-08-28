/**
 * `fdpm.primitive.replace` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    primitive: z
      .object({
        id: z.string().min(1),
        type_id: z.string().min(1),
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
    replaced_at_revision: z.number().int().positive(),
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
  name: "fdpm.primitive.replace",
  tier: "validating_write",
  description:
    "Replace a primitive's field_values wholesale. type_id is immutable — a different type_id is rejected with `conflict`. BEFORE calling: fdpm.profile.type_info(profile_id, type_id) to confirm required_field_names; every required name MUST appear in the new field_values. Optional expected_revision enforces If-Match optimistic concurrency (`conflict` on revision drift). not_found and conflict are protocol errors (isError: true).",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.replacePrimitive(
      args.workbook_id,
      args.primitive,
    );
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        primitive_id: args.primitive.id,
        workbook_id: args.workbook_id,
        replaced_at_revision: append.op.revision,
      },
    };
  },
};
