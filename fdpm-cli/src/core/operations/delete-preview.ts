/**
 * Delete previews — the would-affect computation behind every dry-run
 * surface (MCP `dry_run`, CLI `--dry-run`, SDK `preview*Delete`).
 *
 * A preview answers "what would this delete remove, and what points at
 * it?" as a pure read over `Host.getProject`. It throws the same
 * `not_found` the real delete throws and never appends an operation,
 * so it is safe to expose without the destructive gate — PURPOSE.md
 * names this the human approval point ("sees the planned op set and
 * approves").
 *
 * What it deliberately does NOT do: run the §7 validation pipeline on
 * the projected post-state. The pipeline validates on append; a
 * preview that ran it would need a Host primitive that projects
 * without appending, which does not exist yet. `referencing_relations`
 * is the signal the pipeline's cardinality rules act on, so it is the
 * useful predictor of a rejection.
 */

import { z } from "zod";
import type { Host } from "../host.js";
import { FDPMException } from "../errors/fdpm-exception.js";

export const RelationRef = z
  .object({
    id: z.string(),
    type_id: z.string(),
    source_id: z.string(),
    target_id: z.string(),
  })
  .strict();
export type RelationRef = z.infer<typeof RelationRef>;

export const PrimitiveDeletePreview = z
  .object({
    workbook_id: z.string(),
    id: z.string(),
    type_id: z.string(),
    /** Every relation whose source or target is this primitive. */
    referencing_relations: z.array(RelationRef),
  })
  .strict();
export type PrimitiveDeletePreview = z.infer<typeof PrimitiveDeletePreview>;

export const RelationDeletePreview = z
  .object({
    workbook_id: z.string(),
    id: z.string(),
    type_id: z.string(),
    source_id: z.string(),
    target_id: z.string(),
  })
  .strict();
export type RelationDeletePreview = z.infer<typeof RelationDeletePreview>;

export const WorkbookDeletePreview = z
  .object({
    workbook_id: z.string(),
    name: z.string(),
    profile_id: z.string(),
    revision: z.number().int().nonnegative(),
    primitive_count: z.number().int().nonnegative(),
    relation_count: z.number().int().nonnegative(),
  })
  .strict();
export type WorkbookDeletePreview = z.infer<typeof WorkbookDeletePreview>;

export const PrimitiveDeleteBatchPreview = z
  .object({
    workbook_id: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(PrimitiveDeletePreview),
  })
  .strict();
export type PrimitiveDeleteBatchPreview = z.infer<typeof PrimitiveDeleteBatchPreview>;

export const RelationDeleteBatchPreview = z
  .object({
    workbook_id: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(RelationDeletePreview),
  })
  .strict();
export type RelationDeleteBatchPreview = z.infer<typeof RelationDeleteBatchPreview>;

export function previewPrimitiveDelete(
  host: Host,
  workbook_id: string,
  id: string,
): PrimitiveDeletePreview {
  const slice = host.getProject(workbook_id); // throws not_found for an unknown workbook
  const primitive = slice.primitives[id];
  if (primitive === undefined) {
    throw new FDPMException("not_found", `primitive not found: ${id}`, {
      evidence: { workbook_id, missing_id: id },
    });
  }
  const referencing_relations: RelationRef[] = [];
  for (const rel of Object.values(slice.relations)) {
    if (rel.source_id === id || rel.target_id === id) {
      referencing_relations.push({
        id: rel.id,
        type_id: rel.type_id,
        source_id: rel.source_id,
        target_id: rel.target_id,
      });
    }
  }
  return { workbook_id, id, type_id: primitive.type_id, referencing_relations };
}

export function previewRelationDelete(
  host: Host,
  workbook_id: string,
  id: string,
): RelationDeletePreview {
  const slice = host.getProject(workbook_id);
  const rel = slice.relations[id];
  if (rel === undefined) {
    throw new FDPMException("not_found", `relation not found: ${id}`, {
      evidence: { workbook_id, missing_id: id },
    });
  }
  return {
    workbook_id,
    id,
    type_id: rel.type_id,
    source_id: rel.source_id,
    target_id: rel.target_id,
  };
}

export function previewWorkbookDelete(host: Host, workbook_id: string): WorkbookDeletePreview {
  const slice = host.getProject(workbook_id);
  return {
    workbook_id,
    name: slice.workbook.name,
    profile_id: slice.workbook.profile_id,
    revision: host.getLog(workbook_id).length,
    primitive_count: Object.keys(slice.primitives).length,
    relation_count: Object.keys(slice.relations).length,
  };
}

/** Mirrors the batch contract: the first missing id rejects the whole preview. */
export function previewPrimitiveDeleteBatch(
  host: Host,
  workbook_id: string,
  ids: readonly string[],
): PrimitiveDeleteBatchPreview {
  const items = ids.map((id) => previewPrimitiveDelete(host, workbook_id, id));
  return { workbook_id, count: items.length, items };
}

export function previewRelationDeleteBatch(
  host: Host,
  workbook_id: string,
  ids: readonly string[],
): RelationDeleteBatchPreview {
  const items = ids.map((id) => previewRelationDelete(host, workbook_id, id));
  return { workbook_id, count: items.length, items };
}
