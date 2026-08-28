/**
 * `fdpm.workbook.delete` — Tier 3 (destructive).
 *
 * Deletes an existing workbook. NOT advertised when
 * `--enable-destructive` / `FDPM_MCP_ENABLE_DESTRUCTIVE=1` is unset
 * (SPEC-MCP-SERVER §8.3, §22.3, §23.1). Even when advertised, the
 * dispatcher's tier gate still refuses the call when destructive mode
 * is off — the tool list is one defense, the gate is the other.
 *
 * `host.deleteProject` returns an `AppendOutput` (no validation
 * report), so the response shape mirrors that: a thin envelope with
 * the operation and a small post-state summary that reflects what
 * would otherwise be silently inferred by the caller.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";
import { WorkbookDeletePreview, previewWorkbookDelete } from "../../core/operations/delete-preview.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
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

const Output = z
  .object({
    ok: z.literal(true),
    operation: Operation.optional(),
    dry_run: z.literal(true).optional(),
    would_affect: WorkbookDeletePreview.optional(),
    post_state_summary: z
      .object({
        workbook_id: z.string(),
      })
      .strict(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.workbook.delete",
  tier: "destructive",
  description:
    "Delete an existing workbook. Cannot be undone by another tool call; returns the recorded operation. The workbook's log file is kept for audit. Supports `dry_run` (preview, no key, allowed while disabled); otherwise `idempotency_key` is required — see the server guide.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    if (args.dry_run === true) {
      return {
        ok: true as const,
        dry_run: true as const,
        would_affect: previewWorkbookDelete(host, args.workbook_id),
        post_state_summary: { workbook_id: args.workbook_id },
      };
    }
    const append = await host.deleteProject(args.workbook_id);
    return {
      ok: true as const,
      operation: append.op,
      post_state_summary: { workbook_id: args.workbook_id },
    };
  },
};
