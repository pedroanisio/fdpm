/**
 * `fdpm.relation.create_batch` — Tier 2 (validating-write).
 *
 * Atomic-or-nothing batch creation of N relations in one call.
 * Mirrors `fdpm.primitive.create_batch` for relations.
 *
 * The interleaved-validation property matters here too: the second
 * relation in a batch sees the first relation's source/target
 * references as already-present, so cardinality bounds are checked
 * against the in-flight projection, not just the pre-batch state.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Operation } from "../../core/operations/operation.js";
import { ValidationReport } from "../../core/models/instance.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    relations: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type_id: z.string().min(1),
            source_id: z.string().min(1),
            target_id: z.string().min(1),
            field_values: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .describe(
        "1..500 relations to create atomically. The whole batch validates and persists, or the whole batch rolls back.",
      ),
  })
  .strict();

const PostStateSummary = z
  .object({
    count: z.number().int().nonnegative(),
    relation_ids: z.array(z.string()),
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
  name: "fdpm.relation.create_batch",
  tier: "validating_write",
  description:
    "Atomically create 1..500 relations: ALL validate and persist together or the WHOLE batch rolls back. BEFORE calling: fdpm.profile.type_info for each distinct type_id (source_type_id / target_type_id, id_pattern). Source and target primitives MUST already exist in the workbook — run fdpm.primitive.create_batch first when they are new. Entries validate in array order; cardinality bounds account for the in-flight projection. Success returns `operations[]` and `validation_reports[]` of length N; a rejection carries a single `validation_report` for the failing entry and discards the entire batch.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const intents = args.relations.map((r) => ({
      kind: "relation.create" as const,
      relation: r,
    }));
    const { outputs, reports } = await host.appendBatchWithCausation(
      args.workbook_id,
      intents,
    );
    return {
      ok: true,
      operations: outputs.map((o) => o.op),
      validation_reports: reports,
      post_state_summary: {
        count: outputs.length,
        relation_ids: args.relations.map((r) => r.id),
      },
    };
  },
};
