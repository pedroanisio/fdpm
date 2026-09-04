/**
 * Updating a workbook from a new version of its document.
 *
 * The importer builds a fresh workbook. A document that evolves — the
 * normal case for a knowledge base — should not be re-imported beside its
 * previous self; it should become the operations that take the existing
 * graph to the new state, so the operation log records the evolution and
 * every unchanged node keeps its uid, revision history and inbound edges.
 *
 * The plan is the difference between `splitDocument(newDocument)` and the
 * current slice, keyed by host id (which is a function of kind + source id,
 * so an unchanged node maps to the same primitive) and by edge id (a function
 * of source, field, position and target, so a moved or retargeted reference
 * is a delete + create, a re-described one a replace). Application order is
 * the only order the host's endpoint checks accept: new nodes before the
 * edges that need them, stale edges before the nodes they hang on.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 * (The incoming document is parsed by the vendored root schema before a
 * plan is computed; an invalid document changes nothing.)
 */
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import type { PrimitiveInstance, RelationInstance } from "../../src/core/models/instance.js";
import { VENDOR } from "./derive.js";
import {
  parseDocument,
  splitDocument,
  type MentionsHost,
  type SplitPrimitive,
  type SplitRelation,
} from "./transfer.js";

type Json = Record<string, unknown>;

export interface UpdatePlan {
  create_primitives: SplitPrimitive[];
  replace_primitives: SplitPrimitive[];
  delete_primitives: string[];
  create_relations: SplitRelation[];
  replace_relations: SplitRelation[];
  delete_relations: string[];
  unchanged: { primitives: number; relations: number };
}

function canonical(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, norm((v as Json)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

const ownedBy = (typeId: string) => typeId.startsWith(`${VENDOR}:`);

/** The operations that take `current` to the graph `document` splits into. Pure. */
export function planDocumentUpdate(
  current: {
    primitives: ReadonlyArray<Pick<PrimitiveInstance, "id" | "type_id" | "field_values">>;
    relations: ReadonlyArray<Pick<RelationInstance, "id" | "type_id" | "source_id" | "target_id" | "field_values">>;
  },
  document: Parameters<typeof splitDocument>[0],
): UpdatePlan {
  const target = splitDocument(document);
  const curP = new Map(current.primitives.map((p) => [p.id, p] as const));
  const curR = new Map(current.relations.map((r) => [r.id, r] as const));
  const tgtP = new Map(target.primitives.map((p) => [p.id, p] as const));
  const tgtR = new Map(target.relations.map((r) => [r.id, r] as const));

  const plan: UpdatePlan = {
    create_primitives: [],
    replace_primitives: [],
    delete_primitives: [],
    create_relations: [],
    replace_relations: [],
    delete_relations: [],
    unchanged: { primitives: 0, relations: 0 },
  };
  for (const p of target.primitives) {
    const cur = curP.get(p.id);
    if (!cur) plan.create_primitives.push(p);
    else if (cur.type_id !== p.type_id) {
      throw new FDPMException("conflict", `primitive ${p.id} is ${cur.type_id} in the workbook and ${p.type_id} in the document`);
    } else if (canonical(cur.field_values) !== canonical(p.field_values)) plan.replace_primitives.push(p);
    else plan.unchanged.primitives += 1;
  }
  for (const p of current.primitives) if (!tgtP.has(p.id) && ownedBy(p.type_id)) plan.delete_primitives.push(p.id);

  for (const r of target.relations) {
    const cur = curR.get(r.id);
    if (!cur) plan.create_relations.push(r);
    else if (cur.source_id !== r.source_id || cur.target_id !== r.target_id || cur.type_id !== r.type_id) {
      // Edge ids are content-derived, so this cannot happen for the plugin's
      // own edges; a foreign relation reusing the id is a conflict, not a merge.
      throw new FDPMException("conflict", `relation ${r.id} exists with different endpoints`);
    } else if (canonical(cur.field_values ?? {}) !== canonical(r.field_values)) plan.replace_relations.push(r);
    else plan.unchanged.relations += 1;
  }
  for (const r of current.relations) if (!tgtR.has(r.id) && ownedBy(r.type_id)) plan.delete_relations.push(r.id);

  plan.delete_primitives.sort();
  plan.delete_relations.sort();
  return plan;
}

export interface UpdateHost extends MentionsHost {
  createPrimitive(workbookId: string, primitive: SplitPrimitive): Promise<unknown>;
  replacePrimitive(workbookId: string, primitive: SplitPrimitive): Promise<unknown>;
  deletePrimitive(workbookId: string, id: string, opts?: { cascade?: boolean }): Promise<unknown>;
}

export interface UpdateSummary {
  plan: UpdatePlan;
  applied: boolean;
  counts: { created: number; replaced: number; deleted: number };
}

/**
 * Parses `input`, plans against the workbook, and applies the plan unless
 * `dryRun`. Nothing is written for an invalid document.
 */
export async function applyDocumentUpdate(
  host: UpdateHost,
  workbookId: string,
  input: unknown,
  opts: { dryRun?: boolean } = {},
): Promise<UpdateSummary> {
  const parsed = parseDocument(input);
  if (!parsed.ok) {
    throw new FDPMException("validation", `document update refused: not a valid LogicalKnowledgeBase document (${parsed.issues.length} issue(s))`, {
      evidence: { issues: parsed.issues.slice(0, 50) },
    });
  }
  const slice = host.getProject(workbookId);
  const plan = planDocumentUpdate(
    { primitives: Object.values(slice.primitives), relations: Object.values(slice.relations) },
    parsed.document,
  );
  const counts = {
    created: plan.create_primitives.length + plan.create_relations.length,
    replaced: plan.replace_primitives.length + plan.replace_relations.length,
    deleted: plan.delete_primitives.length + plan.delete_relations.length,
  };
  if (opts.dryRun) return { plan, applied: false, counts };

  for (const p of plan.create_primitives) await host.createPrimitive(workbookId, p);
  for (const p of plan.replace_primitives) await host.replacePrimitive(workbookId, p);
  for (const id of plan.delete_relations) await host.deleteRelation(workbookId, id);
  for (const r of plan.create_relations) await host.createRelation(workbookId, r);
  for (const r of plan.replace_relations) {
    await host.replaceRelation(workbookId, { id: r.id, type_id: r.type_id, field_values: r.field_values });
  }
  for (const id of plan.delete_primitives) await host.deletePrimitive(workbookId, id);
  return { plan, applied: true, counts };
}
