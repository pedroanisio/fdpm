/**
 * `fdpm.primitive.replace` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    primitive: z
      .object({
        id: z.string().min(1),
        type_id: z.string().min(1),
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
    "Replace a primitive's field_values. type_id is immutable. Optional expected_revision enforces If-Match optimistic concurrency.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.replacePrimitive(
      args.project_id,
      args.primitive,
    );
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        primitive_id: args.primitive.id,
        project_id: args.project_id,
        replaced_at_revision: append.op.revision,
      },
    };
  },
};
