/**
 * `fdpm.primitive.delete` — Tier 3 (destructive).
 *
 * Deletes an existing primitive instance. NOT advertised when
 * `--enable-destructive` / `FDPM_MCP_ENABLE_DESTRUCTIVE=1` is unset
 * (SPEC-MCP-SERVER §8.3, §23.1). The tier gate inside the dispatcher
 * is the authoritative refusal point; the manifest filter is a
 * defense-in-depth surface (the LLM should not even see the tool).
 *
 * `host.deletePrimitive` returns an `AppendOutput`. The response
 * mirrors `fdpm.workbook.delete` for consistency — same envelope shape
 * across the three Tier-3 deletes.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";
import { PrimitiveDeletePreview, previewPrimitiveDelete } from "../../core/operations/delete-preview.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    id: z.string().min(1),
    dry_run: z
      .boolean()
      .optional()
      .describe("Preview: return would_affect, append nothing."),
    cascade: z
      .boolean()
      .optional()
      .describe(
        "Also delete relations that reference this primitive; without it a referenced primitive is refused.",
      ),
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Required unless dry_run; reuse to retry safely."),
  })
  .strict();

const Output = z
  .object({
    ok: z.literal(true),
    operation: Operation.optional(),
    dry_run: z.literal(true).optional(),
    would_affect: PrimitiveDeletePreview.optional(),
    post_state_summary: z
      .object({
        workbook_id: z.string(),
        id: z.string(),
      })
      .strict(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.primitive.delete",
  tier: "destructive",
  description:
    "Delete a primitive by id within a workbook. Cannot be undone by another tool call; returns the recorded operation. A referenced primitive is refused unless `cascade` is set. Supports `dry_run` (preview, no key, allowed while disabled); otherwise `idempotency_key` is required — see the server guide.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    if (args.dry_run === true) {
      return {
        ok: true as const,
        dry_run: true as const,
        would_affect: previewPrimitiveDelete(host, args.workbook_id, args.id),
        post_state_summary: { workbook_id: args.workbook_id, id: args.id },
      };
    }
    const append = await host.deletePrimitive(args.workbook_id, args.id, {
      cascade: args.cascade === true,
    });
    return {
      ok: true as const,
      operation: append.op,
      post_state_summary: { workbook_id: args.workbook_id, id: args.id },
    };
  },
};
