/**
 * `fdpm.structure.reorder` — Tier 2 (validating-write).
 *
 * Reorders the children within one scope. The Host method does not
 * run the §7 instance pipeline (it operates on the structure
 * projection, not field-values); a synthetic accepted report is
 * returned for envelope uniformity.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    scope_id: z.string().min(1),
    ordering: z.array(z.string().min(1)),
  })
  .strict();

const PostStateSummary = z
  .object({
    scope_id: z.string(),
    length: z.number().int().nonnegative(),
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
  name: "fdpm.structure.reorder",
  tier: "validating_write",
  description:
    "Set the order of primitives within a scope. `ordering` is a permutation of the scope's current children — every child id MUST appear exactly once, no extras and no omissions (otherwise: `validation` rejection). Use this to reorder sections within a document, requirements within a section, etc. Does NOT add or remove members; use field-patch / replace on the parent for membership changes.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const append = await host.reorder(args.workbook_id, args.scope_id, args.ordering);
    const report = {
      target_id: args.scope_id,
      findings: [],
      accepted: true,
    };
    return {
      ok: true,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        scope_id: args.scope_id,
        length: args.ordering.length,
      },
    };
  },
};
