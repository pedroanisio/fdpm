/**
 * `fdpm.relation.delete_batch` — Tier 3 (destructive, opt-in).
 *
 * Atomic-or-nothing batch deletion of N relations. Mirrors
 * `fdpm.primitive.delete_batch`. Useful as a precursor to
 * `fdpm.primitive.delete_batch` when the primitives being deleted
 * are referenced by relations (delete the relations first, then
 * the primitives, both atomically).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    relation_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(500)
      .describe(
        "1..500 relation ids to delete atomically. ALL must exist; if any is absent, the WHOLE batch rolls back.",
      ),
  })
  .strict();

const PostStateSummary = z
  .object({
    count: z.number().int().nonnegative(),
    deleted_ids: z.array(z.string()),
  })
  .strict();

const Output = z
  .object({
    ok: z.boolean(),
    operations: z.array(Operation).optional(),
    post_state_summary: PostStateSummary.partial(),
  })
  .passthrough();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.relation.delete_batch",
  tier: "destructive",
  description:
    "Atomically delete 1..500 relations in one call. ALL deletes succeed together, or the WHOLE batch rolls back. CAUTION: Tier-3 destructive, OFF by default. Each id MUST currently exist; first missing id rejects the whole batch with `not_found`. Use this BEFORE fdpm.primitive.delete_batch when cleaning up primitives that are referenced by relations — the two batches together (relations then primitives) execute atomically only within each call, so reasoning about cross-batch atomicity is the operator's responsibility.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    const intents = args.relation_ids.map((id) => ({
      kind: "relation.delete" as const,
      payload: { id },
    }));
    const { outputs } = await host.appendBatchWithCausation(args.project_id, intents);
    return {
      ok: true,
      operations: outputs.map((o) => o.op),
      post_state_summary: {
        count: outputs.length,
        deleted_ids: args.relation_ids,
      },
    };
  },
};
