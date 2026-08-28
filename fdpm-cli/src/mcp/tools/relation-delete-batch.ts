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
import { RelationDeleteBatchPreview, previewRelationDeleteBatch } from "../../core/operations/delete-preview.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    relation_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(500)
      .describe(
        "1..500 relation ids to delete atomically. ALL must exist; if any is absent, the WHOLE batch rolls back.",
      ),
    dry_run: z
      .boolean()
      .optional()
      .describe("Preview: return would_affect, append nothing."),
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Required unless dry_run; reuse to retry safely."),
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
    dry_run: z.literal(true).optional(),
    would_affect: RelationDeleteBatchPreview.optional(),
    post_state_summary: PostStateSummary.partial(),
  })
  .passthrough();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.relation.delete_batch",
  tier: "destructive",
  description:
    "Destructive: atomically delete 1..500 relations. ALL deletes succeed together or the WHOLE batch rolls back. Each id MUST currently exist; the first missing id rejects the whole batch with `not_found`. Use this BEFORE fdpm.primitive.delete_batch when cleaning up primitives that are referenced by relations — atomicity holds within each call only, so cross-batch ordering is the caller's responsibility. Supports `dry_run` (preview, no key, allowed while disabled); otherwise `idempotency_key` is required — see the server guide.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    if (args.dry_run === true) {
      return {
        ok: true,
        dry_run: true as const,
        would_affect: previewRelationDeleteBatch(host, args.workbook_id, args.relation_ids),
        post_state_summary: { count: 0, deleted_ids: [] },
      };
    }
    const intents = args.relation_ids.map((id) => ({
      kind: "relation.delete" as const,
      payload: { id },
    }));
    const { outputs } = await host.appendBatchWithCausation(args.workbook_id, intents);
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
