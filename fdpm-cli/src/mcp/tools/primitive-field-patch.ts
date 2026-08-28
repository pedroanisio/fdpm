/**
 * `fdpm.primitive.field_patch` — Tier 2 (validating-write).
 *
 * RFC 6902-style JSON Patch on a primitive's field_values. The Host
 * caps `operations.length` against `FDPM_MAX_FIELD_PATCH_OPS`
 * (default 100); over-cap calls surface as `quota`.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    payload: z
      .object({
        id: z.string().min(1),
        operations: z.array(z.unknown()),
        expected_revision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

const PostStateSummary = z
  .object({
    primitive_id: z.string(),
    ops_applied: z.number().int().nonnegative(),
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
  name: "fdpm.primitive.field_patch",
  tier: "validating_write",
  description:
    "Apply a JSON-Patch-shaped operation list to a primitive's field_values (`add`, `replace`, `remove`, `move`, `copy`, `test`, `merge`) for precise path-level edits (e.g. one element of a nested list) when fdpm.primitive.patch's whole-field merge is too coarse. Each operation's `path` is a JSON Pointer (`/categories/0/id`). Validation covers the touched paths only. Operations are atomic — a single failing operation rejects the whole patch.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const { append, report } = await host.fieldPatchPrimitive(
      args.workbook_id,
      args.payload,
    );
    return {
      ok: report.accepted,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        primitive_id: args.payload.id,
        ops_applied: args.payload.operations.length,
      },
    };
  },
};
