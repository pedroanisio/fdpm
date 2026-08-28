/**
 * `fdpm.relation.patch` — Tier 2 (validating-write).
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
        expected_revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    relation_id: z.string(),
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
  name: "fdpm.relation.patch",
  tier: "validating_write",
  description:
    "Partial-update a relation's field_values: only the keys present in `patch.field_values` are merged in. source_id, target_id and type_id are NOT mutable through this path — use fdpm.relation.replace for type-preserving rewrites. Validation covers the touched paths only; pre-existing violations on untouched fields do not block the edit, and a rejection lists findings for the touched paths only.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.patchRelation(
      args.workbook_id,
      args.patch,
    );
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        relation_id: args.patch.id,
        workbook_id: args.workbook_id,
      },
    };
  },
};
