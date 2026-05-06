/**
 * `fdpm.primitive.create` — Tier 2 (validating-write).
 *
 * Creates a primitive in a workbook. The Host runs the §7 pipeline;
 * if the report is rejected, `Host.createPrimitive` throws
 * `FDPMException("validation", ...)` with structured findings.
 * The dispatcher catches that and constructs a Tier-2 envelope with
 * `ok: false` and the findings hoisted into `validation_report`.
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
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    primitive_id: z.string(),
    type_id: z.string(),
    workbook_id: z.string(),
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
  name: "fdpm.primitive.create",
  tier: "validating_write",
  description:
    "Create a primitive in a workbook. BEFORE calling: invoke fdpm.profile.type_info(profile_id, type_id) to discover the type's id_pattern (the `id` you submit MUST match it; mismatches are rejected with rule_id `core:id-format`) and required_field_names (every name listed MUST appear in field_values). Validation runs the §7 pipeline; on rejection the response is `isError: false`, `ok: false`, with structured findings in `validation_report.findings[]` keyed by rule_id — read those, fix the input, retry. On success: `ok: true` with the operation envelope and validation_report. For multi-primitive batches, prefer fdpm.primitive.create_batch for atomic-or-nothing semantics.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.createPrimitive(args.workbook_id, args.primitive);
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        primitive_id: args.primitive.id,
        type_id: args.primitive.type_id,
        workbook_id: args.workbook_id,
      },
    };
  },
};
