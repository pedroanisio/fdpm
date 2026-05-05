/**
 * `fdpm.relation.create` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    relation: z
      .object({
        id: z.string().min(1),
        type_id: z.string().min(1),
        source_id: z.string().min(1),
        target_id: z.string().min(1),
        field_values: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    relation_id: z.string(),
    type_id: z.string(),
    source_id: z.string(),
    target_id: z.string(),
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
  name: "fdpm.relation.create",
  tier: "validating_write",
  description:
    "Create a typed relation between two existing primitives. BEFORE calling: invoke fdpm.profile.type_info(profile_id, type_id) to discover the relation's source_type_id / target_type_id (the source and target primitives MUST be of those types — mismatches reject) and the id_pattern for the relation's `id`. Both source_id and target_id MUST refer to primitives that already exist in the same project (otherwise: rejected with `not_found`). Cardinality bounds (max source/target degree) are enforced at validation time. Rejection surfaces as `isError: false`, `ok: false` with findings; use fdpm.relation.create_batch for multi-relation atomic batches.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.createRelation(
      args.project_id,
      args.relation,
    );
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        relation_id: args.relation.id,
        type_id: args.relation.type_id,
        source_id: args.relation.source_id,
        target_id: args.relation.target_id,
      },
    };
  },
};
