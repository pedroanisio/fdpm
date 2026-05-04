import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import type { DomainProfile } from "../../../src/core/models/meta.js";

/**
 * Pure projection of a project's primitives + relations through a
 * `sw:View` filter (gap-pass-2 #17 / ISO 42010 §3.6).
 *
 * The filter is the four optional list fields on `sw:View`:
 *
 *   - `included_categories`  — restrict to primitives whose category_id matches
 *   - `included_scope_ids`   — restrict to primitives whose scope_id matches
 *   - `included_type_ids`    — restrict to primitives whose type_id matches
 *
 * Each list is optional; when *all* are absent or empty, the projection is the
 * identity. When any list is non-empty, a primitive must satisfy *every*
 * non-empty constraint to pass (intersection semantics — predictable, but no
 * surprising blowup with disjunctive lists).
 *
 * Relations are filtered to those whose `source_id` AND `target_id` both
 * survive the primitive filter — guaranteeing every emitted relation has both
 * endpoints in the projected primitive set.
 *
 * `included_categories` lookup uses the resolved profile to translate
 * `type_id` → `category_id`. If the type isn't found in the profile (caller
 * loaded a stale projection), we conservatively drop the primitive — the
 * alternative is to emit a record whose category we don't know.
 */

export interface ViewFilter {
  included_categories?: readonly string[];
  included_scope_ids?: readonly string[];
  included_type_ids?: readonly string[];
}

export interface ProjectionInput {
  primitives: readonly PrimitiveInstance[];
  relations: readonly RelationInstance[];
  profile: DomainProfile;
}

export interface ProjectionResult {
  primitives: PrimitiveInstance[];
  relations: RelationInstance[];
  /** Ids of primitives in the original input that did NOT survive the filter. */
  excludedPrimitiveIds: string[];
}

function isNonEmpty(arr: readonly string[] | undefined): arr is readonly string[] {
  return Array.isArray(arr) && arr.length > 0;
}

export function isIdentityFilter(view: ViewFilter): boolean {
  return (
    !isNonEmpty(view.included_categories) &&
    !isNonEmpty(view.included_scope_ids) &&
    !isNonEmpty(view.included_type_ids)
  );
}

export function projectThroughView(
  input: ProjectionInput,
  view: ViewFilter,
): ProjectionResult {
  if (isIdentityFilter(view)) {
    return {
      primitives: [...input.primitives],
      relations: [...input.relations],
      excludedPrimitiveIds: [],
    };
  }

  const typeIdToCategoryId = new Map<string, string>();
  for (const t of input.profile.primitive_types) {
    typeIdToCategoryId.set(t.id, t.category_id ?? t.category ?? "");
  }

  const categories = new Set(view.included_categories ?? []);
  const scopes = new Set(view.included_scope_ids ?? []);
  const typeIds = new Set(view.included_type_ids ?? []);

  const survives = (p: PrimitiveInstance): boolean => {
    if (typeIds.size > 0 && !typeIds.has(p.type_id)) return false;
    if (categories.size > 0) {
      const cat = typeIdToCategoryId.get(p.type_id);
      if (!cat || !categories.has(cat)) return false;
    }
    if (scopes.size > 0) {
      const sc = p.scope_id;
      if (!sc || !scopes.has(sc)) return false;
    }
    return true;
  };

  const survivors = new Set<string>();
  const primitives: PrimitiveInstance[] = [];
  const excluded: string[] = [];
  for (const p of input.primitives) {
    if (survives(p)) {
      survivors.add(p.id);
      primitives.push(p);
    } else {
      excluded.push(p.id);
    }
  }

  const relations = input.relations.filter(
    (r) => survivors.has(r.source_id) && survivors.has(r.target_id),
  );

  return { primitives, relations, excludedPrimitiveIds: excluded };
}

/**
 * Convenience overload: pull the four filter arrays off a `sw:View` primitive
 * instance and call `projectThroughView`.
 */
export function projectThroughViewInstance(
  input: ProjectionInput,
  viewPrimitive: PrimitiveInstance,
): ProjectionResult {
  if (viewPrimitive.type_id !== "sw:View") {
    throw new Error(
      `projectThroughViewInstance: expected type_id sw:View, got ${viewPrimitive.type_id}`,
    );
  }
  const fv = viewPrimitive.field_values as Record<string, unknown>;
  const arr = (k: string): readonly string[] | undefined => {
    const v = fv[k];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return v as string[];
    }
    return undefined;
  };
  return projectThroughView(input, {
    included_categories: arr("included_categories"),
    included_scope_ids: arr("included_scope_ids"),
    included_type_ids: arr("included_type_ids"),
  });
}
