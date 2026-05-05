/**
 * `fdpm.structure.reparent` — Tier 2 (validating-write).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    primitive_id: z.string().min(1),
    from_scope_id: z.string().min(1),
    to_scope_id: z.string().min(1),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();

const PostStateSummary = z
  .object({
    project_id: z.string(),
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
  name: "fdpm.structure.reparent",
  tier: "validating_write",
  description:
    "Move a primitive between scopes within the same project. `from_scope_id` MUST currently contain `primitive_id`; `to_scope_id` MUST be a registered scope of a type that accepts the primitive's type (consult fdpm.profile.type_info on the parent scope's type to confirm). Optional `position` inserts at that index in the destination's ordering (default: append). Cross-project moves are NOT supported — re-create at the target instead. Rejection (membership / scope-type mismatch) surfaces as `isError: false`, `ok: false` with findings.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const payload: {
      primitive_id: string;
      from_scope_id: string;
      to_scope_id: string;
      position?: number;
    } = {
      primitive_id: args.primitive_id,
      from_scope_id: args.from_scope_id,
      to_scope_id: args.to_scope_id,
    };
    if (args.position !== undefined) payload.position = args.position;
    const append = await host.reparent(args.project_id, payload);
    const report = {
      target_id: args.primitive_id,
      findings: [],
      accepted: true,
    };
    return {
      ok: true,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        project_id: args.project_id,
      },
    };
  },
};
