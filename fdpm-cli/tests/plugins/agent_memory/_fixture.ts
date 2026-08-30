/**
 * One coherent episode, as a graph.
 *
 * The shape is the shelf-audit run the contract's own tests use: two
 * readings of the same shelf where the second replaces the first, a
 * hypothesis confirmed against the live one, and the action that
 * produced it. It is small enough to reason about and rich enough that
 * every rule in `validators.ts` has something to bite on.
 */
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import { R, T } from "../../../plugins/agent_memory/ids.js";

export const EP = "am:episode:audit-01";
export const FACT_STALE = "am:fact:shelf12-a";
export const FACT_LIVE = "am:fact:shelf12-b";
export const HYP = "am:hypothesis:restocked";
export const ACTION = "am:action:count-shelf12";

let uidCounter = 0;
const uid = (): string => `01ARZ3NDEKTSV4RRFFQ69G5${String(uidCounter++).padStart(3, "0")}`;

export function primitive(id: string, typeId: string, fieldValues: Record<string, unknown>): PrimitiveInstance {
  return { id, uid: uid(), type_id: typeId, field_values: fieldValues, revision: 0 };
}

export function relation(id: string, typeId: string, source: string, target: string): RelationInstance {
  return { id, uid: uid(), type_id: typeId, source_id: source, target_id: target, field_values: {}, revision: 0 };
}

export function episode(status = "active"): PrimitiveInstance {
  return primitive(EP, T.Episode, {
    skill_id: "skill.audit",
    objective: "reconcile the shelf inventory",
    status,
    started_at: "2026-08-30T09:45:38Z",
    horizon_step: 20,
  });
}

export function fact(id: string, step: number, claim = `shelf 12 holds ${step} units`): PrimitiveInstance {
  return primitive(id, T.Fact, { claim, source: "observation", observed_at_step: step });
}

export function hypothesis(status: string, testedAtStep?: number): PrimitiveInstance {
  return primitive(HYP, T.Hypothesis, {
    statement: "shelf 12 was restocked",
    status,
    ...(testedAtStep === undefined ? {} : { tested_at_step: testedAtStep }),
  });
}

/** Episode, two facts, a confirmed hypothesis, an action — and every edge that places them. */
export function validGraph(): { primitives: PrimitiveInstance[]; relations: RelationInstance[] } {
  const primitives = [
    episode(),
    fact(FACT_STALE, 3),
    fact(FACT_LIVE, 9),
    hypothesis("confirmed", 9),
    primitive(ACTION, T.Action, {
      command: "count shelf 12",
      outcome: "success",
      step: 9,
      summary: "recounted",
    }),
  ];
  const relations = [
    relation("am:rel:holds-1", R.EpisodeHolds, EP, FACT_STALE),
    relation("am:rel:holds-2", R.EpisodeHolds, EP, FACT_LIVE),
    relation("am:rel:holds-3", R.EpisodeHolds, EP, HYP),
    relation("am:rel:holds-4", R.EpisodeHolds, EP, ACTION),
    relation("am:rel:superseded-1", R.SupersededBy, FACT_STALE, FACT_LIVE),
    relation("am:rel:supports-1", R.Supports, FACT_LIVE, HYP),
    relation("am:rel:produced-1", R.Produced, ACTION, FACT_LIVE),
  ];
  return { primitives, relations };
}

/** The context shape the host hands a validator, built from a graph. */
export function contextFrom(graph: {
  primitives: readonly PrimitiveInstance[];
  relations: readonly RelationInstance[];
}): { relations: readonly RelationInstance[]; workbook: { primitives: Record<string, PrimitiveInstance>; relations: Record<string, RelationInstance> } } {
  return {
    relations: graph.relations,
    workbook: {
      primitives: Object.fromEntries(graph.primitives.map((p) => [p.id, p])),
      relations: Object.fromEntries(graph.relations.map((r) => [r.id, r])),
    },
  };
}
