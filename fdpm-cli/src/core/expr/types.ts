import type {
  PrimitiveInstance,
  RelationInstance,
} from "../models/instance.js";
import type { ProjectStateSlice } from "../store/state.js";

export interface ExprPrimitiveValue {
  id: string;
  type_id: string;
  fields: Record<string, unknown>;
  revision: number;
  scope_id?: string;
}

export interface ExprRelationValue {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  fields: Record<string, unknown>;
  revision: number;
}

export interface ExprProjectValue {
  id: string;
  profile_id: string;
  revision: number;
  fingerprint: string;
  primitives: ExprPrimitiveValue[];
  relations: ExprRelationValue[];
}

export function mapValueToCEL(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => mapValueToCEL(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = mapValueToCEL(item);
    }
    return out;
  }
  return value;
}

export function mapPrimitiveToCEL(instance: PrimitiveInstance): ExprPrimitiveValue {
  return {
    id: instance.id,
    type_id: instance.type_id,
    fields: mapValueToCEL(instance.field_values) as Record<string, unknown>,
    revision: instance.revision,
    ...(instance.scope_id !== undefined && { scope_id: instance.scope_id }),
  };
}

export function mapRelationToCEL(relation: RelationInstance): ExprRelationValue {
  return {
    id: relation.id,
    type_id: relation.type_id,
    source_id: relation.source_id,
    target_id: relation.target_id,
    fields: mapValueToCEL(relation.field_values) as Record<string, unknown>,
    revision: relation.revision,
  };
}

export function makeProjectValue(
  slice: ProjectStateSlice,
  fingerprint: string,
): ExprProjectValue {
  return {
    id: slice.workbook.id,
    profile_id: slice.workbook.profile_id,
    revision: slice.workbook.revision,
    fingerprint,
    primitives: Object.values(slice.primitives).map(mapPrimitiveToCEL),
    relations: Object.values(slice.relations).map(mapRelationToCEL),
  };
}
