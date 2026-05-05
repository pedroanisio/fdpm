/**
 * `fdpm.primitive.search` — Tier 1 (read-only).
 *
 * Substring search across primitives in a single workbook. Backs the
 * "find me the primitive whose name approximately matches X" workflow.
 * The result is a list of small summaries (id, type_id, optional
 * scope_id, and a short field-values excerpt) — enough for an LLM to
 * decide which primitive to drill into via `fdpm.primitive.get` without
 * pulling the entire field record.
 *
 * Filter semantics mirror `Host.searchPrimitives`:
 *   - `query` is treated as a case-insensitive substring needle against
 *     each primitive's serialized `field_values`. Omitted → no field
 *     match (every primitive in `type_id` scope is returned).
 *   - `type_id` narrows by primitive type. Omitted → all types.
 *   - `limit` caps the result count (default 100; max 1000).
 *
 * NOT a query language — this is the deliberate v0.1 contract. A
 * structured query surface is deferred.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    query: z.string().optional(),
    type_id: z.string().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  })
  .strict();

const PrimitiveSummary = z
  .object({
    id: z.string(),
    type_id: z.string(),
    scope_id: z.string().optional(),
    fields_excerpt: z.string(),
  })
  .strict();

const Output = z
  .object({
    matches: z.array(PrimitiveSummary),
  })
  .strict();

const EXCERPT_MAX = 200;

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.primitive.search",
  tier: "read_only",
  description:
    "Search primitives in one workbook by case-insensitive substring on field_values. Optional type_id narrows by primitive type. Returns id, type_id, scope_id, and a short fields_excerpt.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    const filter: {
      typeId?: string;
      fieldMatch?: ReadonlyArray<{ needle: string }>;
    } = {};
    if (args.type_id !== undefined) filter.typeId = args.type_id;
    if (args.query !== undefined && args.query.length > 0) {
      filter.fieldMatch = [{ needle: args.query }];
    }
    const found = host.searchPrimitives(args.workbook_id, filter);
    const limit = args.limit ?? 100;
    const matches = found.slice(0, limit).map((p) => {
      const summary: {
        id: string;
        type_id: string;
        scope_id?: string;
        fields_excerpt: string;
      } = {
        id: p.id,
        type_id: p.type_id,
        fields_excerpt: excerpt(p.field_values),
      };
      if (p.scope_id !== undefined) summary.scope_id = p.scope_id;
      return summary;
    });
    return { matches };
  },
};

function excerpt(field_values: Record<string, unknown>): string {
  const json = JSON.stringify(field_values);
  if (json.length <= EXCERPT_MAX) return json;
  return json.slice(0, EXCERPT_MAX - 1) + "…";
}
