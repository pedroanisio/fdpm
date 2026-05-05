/**
 * `fdpm.primitive.create_batch` — Tier 2 (validating-write).
 *
 * Atomic-or-nothing batch creation of N primitives in one call.
 * Routes through `Host.appendBatchWithCausation`, which interleaves
 * validation with synthesis: each entry validates against the
 * projection that already includes prior entries, so a batch
 * containing primitives that reference each other (e.g. via id-ref
 * fields) validates correctly without round-trips. On the first
 * entry that fails validation, the entire batch is rolled back —
 * no partial state, no half-written log.
 *
 * Why this exists: real-session evidence shows LLMs producing
 * coherent multi-primitive batches (one author, one moment, one
 * intent). Fragmenting that into N round-trips wastes audit-log
 * lines, validation-report bytes, and operator attention. A
 * single batch turns "9 rejected, 6 accepted, please fix and try
 * again" into "rejected as a batch; here are the findings; submit
 * one fixed batch."
 *
 * Envelope shape on success:
 *   { ok: true,
 *     operations: Operation[],
 *     validation_reports: ValidationReport[],
 *     post_state_summary: { count, primitive_ids[] } }
 *
 * Envelope shape on validation failure (entry N rejected):
 *   { ok: false,
 *     validation_report: { target_id: project_id, findings, accepted: false },
 *     post_state_summary: {} }
 *
 * The single-validation_report shape on rejection is the
 * dispatcher's existing Tier-2 catch path (SPEC-MCP-SERVER §12);
 * findings carry the rejected entry's `target_id` per finding so
 * the LLM can identify which entry failed.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";
import { ValidationReport } from "../../core/models/instance.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    primitives: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type_id: z.string().min(1),
            field_values: z.record(z.unknown()),
            scope_id: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .describe(
        "1..500 primitives to create atomically. The whole batch validates and persists, or the whole batch rolls back — no partial state.",
      ),
  })
  .strict();

const PostStateSummary = z
  .object({
    count: z.number().int().nonnegative(),
    primitive_ids: z.array(z.string()),
  })
  .strict();

const Output = z
  .object({
    ok: z.boolean(),
    operations: z.array(Operation).optional(),
    validation_reports: z.array(ValidationReport).optional(),
    validation_report: ValidationReport.optional(),
    post_state_summary: PostStateSummary.partial(),
  })
  .passthrough();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.primitive.create_batch",
  tier: "validating_write",
  description:
    "Atomically create 1..500 primitives in one call. ALL primitives validate and persist together, or the WHOLE batch rolls back — no partial writes. BEFORE calling: invoke fdpm.profile.type_info(profile_id, type_id) for each distinct type_id to discover id_patterns and required_field_names. Validates entries in array order; later entries see earlier ones in the projection (so id-ref fields can reference siblings within the batch). On success returns `ok: true` with `operations[]` and `validation_reports[]` arrays of length N. On rejection returns `isError: false`, `ok: false` with a single `validation_report` carrying the failing entry's findings; the entire batch is discarded — fix the findings and resubmit one corrected batch. Prefer this tool over a loop of fdpm.primitive.create when you have multiple primitives to author.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const intents = args.primitives.map((p) => ({
      kind: "primitive.create" as const,
      primitive: p,
    }));
    const { outputs, reports } = await host.appendBatchWithCausation(
      args.project_id,
      intents,
    );
    return {
      ok: true,
      operations: outputs.map((o) => o.op),
      validation_reports: reports,
      post_state_summary: {
        count: outputs.length,
        primitive_ids: args.primitives.map((p) => p.id),
      },
    };
  },
};
