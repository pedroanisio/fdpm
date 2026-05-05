/**
 * `fdpm.primitive.delete_batch` — Tier 3 (destructive, opt-in).
 *
 * Atomic-or-nothing batch deletion of N primitives. Routes through
 * `Host.appendBatchWithCausation`; if any id is absent, the entire
 * batch rolls back — no partial deletion, no half-written log.
 *
 * Why this exists: real-session evidence shows operators running
 * cleanup loops over 5+ redundant primitives created during
 * rejection-retry rounds. A loop of fdpm.primitive.delete is N
 * round-trips, N audit-log pairs, N opportunities for the loop to
 * partially fail and leave a half-cleaned project. A batch turns
 * that into one round-trip with an atomic outcome.
 *
 * Off by default per Tier-3 policy (FDPM_MCP_ENABLE_DESTRUCTIVE=1
 * to expose). The dispatcher's destructive gate enforces this; the
 * tool itself does no extra checking.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    primitive_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(500)
      .describe(
        "1..500 primitive ids to delete atomically. ALL must exist; if any is absent, the WHOLE batch rolls back.",
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
  name: "fdpm.primitive.delete_batch",
  tier: "destructive",
  description:
    "Atomically delete 1..500 primitives in one call. ALL deletes succeed together, or the WHOLE batch rolls back — no partial deletion. CAUTION: this is a Tier-3 destructive tool and is OFF by default; reachable only when fdpm-mcp was started with --enable-destructive (or FDPM_MCP_ENABLE_DESTRUCTIVE=1). Each id MUST currently exist in the project; the first missing id rejects the whole batch with `not_found`. Note: deleting a primitive referenced by an existing relation MAY be rejected by validation (depending on the profile's relation cardinality bounds — consult fdpm.profile.type_info on the relation type). Returns `ok: true` with the operation envelopes on success; on failure the call rejects (isError: true) with a structured envelope and the project is unchanged.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    const intents = args.primitive_ids.map((id) => ({
      kind: "primitive.delete" as const,
      payload: { id },
    }));
    const { outputs } = await host.appendBatchWithCausation(args.project_id, intents);
    return {
      ok: true,
      operations: outputs.map((o) => o.op),
      post_state_summary: {
        count: outputs.length,
        deleted_ids: args.primitive_ids,
      },
    };
  },
};
