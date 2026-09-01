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
import type { ProjectStateSlice } from "../store/state.js";
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

/**
 * A record holding an `id-ref` pointer to the primitive under preview.
 *
 * Distinct from RelationRef: a relation CONNECTS the primitive and is
 * cascaded on delete, whereas these are pointers living in field values,
 * which nothing cascades. They are the reified-reference case — an n-ary
 * structure decomposed into a primitive plus binary pairs carrying a
 * back-reference — and deleting the referent silently strands them.
 */
export const FieldRef = z
  .object({
    kind: z.enum(["primitive", "relation"]),
    id: z.string(),
    type_id: z.string(),
    field_path: z.string(),
  })
  .strict();
export type FieldRef = z.infer<typeof FieldRef>;

export const PrimitiveDeletePreview = z
  .object({
    workbook_id: z.string(),
    id: z.string(),
    type_id: z.string(),
    /** Every relation whose source or target is this primitive. */
    referencing_relations: z.array(RelationRef),
    /**
     * Records whose `id-ref` field names this primitive. Relations that
     * merely CONNECT it are reported above; these are pointers held in
     * field values, which nothing cascades. Deleting the primitive leaves
     * every entry here dangling, so a preview that omitted them called a
     * destructive delete clean.
     */
    referencing_fields: z.array(FieldRef),
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

/**
 * Find every `id-ref` field value naming `id`.
 *
 * Driven by the profile rather than by scanning all strings: a field is
 * only a reference because its type says so, and matching raw strings
 * would report coincidental equality as a dependency.
 */
function collectReferencingFields(
  host: Host,
  workbook_id: string,
  id: string,
): FieldRef[] {
  const slice = host.getProject(workbook_id);
  const out: FieldRef[] = [];
  let profile;
  try {
    profile = host.profiles.getResolved(slice.workbook.profile_id);
  } catch {
    // No resolvable profile means no field is known to be a reference.
    // Report nothing rather than guessing from string equality.
    return out;
  }

  const scan = (
    kind: "primitive" | "relation",
    recordId: string,
    typeId: string,
    values: Record<string, unknown>,
    fields: ReadonlyArray<{ name: string; kind?: string; item_field?: { kind?: string } }>,
  ): void => {
    for (const f of fields) {
      const isRef = f.kind === "id-ref";
      const isRefList = f.kind === "list" && f.item_field?.kind === "id-ref";
      if (!isRef && !isRefList) continue;
      const v = values[f.name];
      if (v == null) continue;
      if (isRefList) {
        if (!Array.isArray(v)) continue;
        v.forEach((el, i) => {
          if (el === id) {
            out.push({ kind, id: recordId, type_id: typeId, field_path: `field_values.${f.name}[${i}]` });
          }
        });
      } else if (v === id) {
        out.push({ kind, id: recordId, type_id: typeId, field_path: `field_values.${f.name}` });
      }
    }
  };

  for (const p of Object.values(slice.primitives)) {
    const t = profile.primitive_types.find((x) => x.id === p.type_id);
    if (t) scan("primitive", p.id, p.type_id, p.field_values, t.fields);
  }
  for (const r of Object.values(slice.relations)) {
    const t = profile.relation_types.find((x) => x.id === r.type_id);
    if (t) scan("relation", r.id, r.type_id, r.field_values, t.fields ?? []);
  }
  return out;
}

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
  return {
    workbook_id,
    id,
    type_id: primitive.type_id,
    referencing_relations: findReferencingRelations(slice, id),
    referencing_fields: collectReferencingFields(host, workbook_id, id),
  };
}

/**
 * Every relation whose source or target is `id`.
 *
 * One definition, two consumers that must not disagree: the preview a
 * caller reads before deciding, and the check `Host.deletePrimitive`
 * runs before refusing. If they diverged, a preview could report a
 * clean delete that the delete then rejects, or worse, report nothing
 * while the delete quietly removed edges.
 */
export function findReferencingRelations(
  slice: Pick<ProjectStateSlice, "relations">,
  id: string,
): RelationRef[] {
  const out: RelationRef[] = [];
  for (const rel of Object.values(slice.relations)) {
    if (rel.source_id === id || rel.target_id === id) {
      out.push({
        id: rel.id,
        type_id: rel.type_id,
        source_id: rel.source_id,
        target_id: rel.target_id,
      });
    }
  }
  return out;
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
