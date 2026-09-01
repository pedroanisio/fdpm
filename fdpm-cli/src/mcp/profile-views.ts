/**
 * Profile-view projection.
 *
 * Real-world signal: a composed `formal-specification:3.0` profile
 * weighs ~65 KB on the wire. The `fdpm.profile.get` tool already
 * supports top-level field projection via `applyFieldsProjection`,
 * but most callers want one of three well-known shapes:
 *
 *   - `full`     — the entire DomainProfile (default; backwards-compatible).
 *   - `summary`  — id, version, label/name, counts of types/rules. ~200 B.
 *   - `type_ids` — id, version, plus the bare id lists. The rung between
 *                  a count and a vocabulary.
 *   - `types`    — id, version, plus a stripped primitive_types[]
 *                  (id, id_pattern, label, fields[name,type,required])
 *                  and relation_types[] (id, source/target ids,
 *                  symmetric, transitive). ~5 KB for typical profiles.
 *
 * `summary` is the right view for catalogue/listing UIs. `types` is
 * the right view for an agent that asks "what fields does plan:Task
 * have?" — the most common LLM-side question. `full` keeps the door
 * open for callers that genuinely need everything (validation rules,
 * renderer bindings, descriptions, etc.).
 *
 * `type_ids` exists because `types` is not small for every profile. Measured
 * over the profiles this tree loads, `types` runs 117 B to 31,122 B — and
 * then `profile:uixo:1.2`, whose 712 primitive types and 210 relation types
 * put its stripped `types` view at 1,835,052 B and its `full` view at
 * 5,409,966 B. No tool-result ceiling admits either. `summary` says only how
 * many types there are, which does not let a caller ask for one; `type_ids`
 * names them, and `fdpm.profile.type_info` then answers for the single type
 * the caller wants. That is the whole path from "I know nothing about this
 * profile" to "I can construct one primitive" without a payload that no
 * client can hold.
 *
 * The view payload always carries a `_view` discriminator so callers
 * can distinguish full from projected responses without inspecting
 * the keys. This matches the `_projected: true` marker on
 * `applyFieldsProjection`.
 *
 * Compat note: when both `view` and `fields` are passed to
 * `fdpm.profile.get`, `view` is applied first, then `fields` projects
 * over the resulting object. That means `fields` can further trim a
 * summary or types view; the `_view` and `_projected` markers will
 * both appear in the response. This is the most predictable
 * composition; treating either as overriding the other surprises one
 * caller or the other.
 */

const VIEW_MARKER_KEY = "_view";

/**
 * The accepted view names. Keep this list closed — new shapes get
 * a name and a code path; freeform shape requests go through the
 * `fields` argument on the tool, not through `view`.
 */
export const PROFILE_VIEW_NAMES = ["full", "summary", "type_ids", "types"] as const;
export type ProfileViewName = (typeof PROFILE_VIEW_NAMES)[number];

export interface ProfileViewResult {
  readonly value: Record<string, unknown>;
  /** True when a non-`full` view was applied. */
  readonly applied: boolean;
}

/**
 * Apply a named view projection to a raw or resolved profile.
 *
 * The input `profile` is the JSON shape of a `DomainProfile`. We do
 * not type the argument with the schema'd type because callers pass
 * either the raw registry object or a `JSON.parse`d echo of it; the
 * projection is deliberately schema-agnostic so it works on either.
 */
export function applyProfileView(
  profile: Record<string, unknown>,
  view: ProfileViewName | undefined,
): ProfileViewResult {
  if (view === undefined || view === "full") {
    return { value: profile, applied: false };
  }

  if (view === "summary") {
    return { value: buildSummaryView(profile), applied: true };
  }

  if (view === "type_ids") {
    return { value: buildTypeIdsView(profile), applied: true };
  }

  if (view === "types") {
    return { value: buildTypesView(profile), applied: true };
  }

  // Exhaustiveness: PROFILE_VIEW_NAMES is closed; an unknown view
  // here is a programming error in the dispatch path. Treat it as a
  // pass-through rather than throwing — the caller-facing validator
  // already rejects unknown view names at argument-parse time.
  return { value: profile, applied: false };
}

function buildSummaryView(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: profile.id,
    version: profile.version,
  };
  if (typeof profile.label === "string") out.label = profile.label;
  if (typeof profile.name === "string") out.name = profile.name;
  if (typeof profile.description === "string") out.description = profile.description;
  out.primitive_type_count = arraySize(profile.primitive_types);
  out.relation_type_count = arraySize(profile.relation_types);
  out.validation_rule_count = arraySize(profile.validation_rules);
  out.category_count = arraySize(profile.categories);
  out.scope_count = arraySize(profile.scopes);
  out.template_count = arraySize(profile.templates);
  out[VIEW_MARKER_KEY] = "summary";
  return out;
}

function buildTypeIdsView(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: profile.id,
    version: profile.version,
  };
  if (typeof profile.label === "string") out.label = profile.label;
  if (typeof profile.name === "string") out.name = profile.name;
  out.primitive_type_ids = typeIds(profile.primitive_types);
  out.relation_type_ids = typeIds(profile.relation_types);
  out[VIEW_MARKER_KEY] = "type_ids";
  return out;
}

/**
 * The `id` of every entry that has a string one.
 *
 * A type without a string id is dropped rather than emitted as `undefined`:
 * the list is consumed as an argument to `fdpm.profile.type_info`, and a
 * caller that passes back what this returned must get `not_found` from a bad
 * id, never from a hole this view punched.
 */
function typeIds(value: unknown): string[] {
  return (asObjectArray(value) ?? [])
    .map((t) => t.id)
    .filter((id): id is string => typeof id === "string");
}

function buildTypesView(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: profile.id,
    version: profile.version,
  };
  if (typeof profile.label === "string") out.label = profile.label;
  if (typeof profile.name === "string") out.name = profile.name;
  out.primitive_types = (asObjectArray(profile.primitive_types) ?? []).map(
    summarisePrimitiveType,
  );
  out.relation_types = (asObjectArray(profile.relation_types) ?? []).map(
    summariseRelationType,
  );
  out[VIEW_MARKER_KEY] = "types";
  return out;
}

function summarisePrimitiveType(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: t.id };
  if (typeof t.name === "string") out.name = t.name;
  if (t.id_format !== undefined) out.id_format = t.id_format;
  if (typeof t.scoped === "boolean" && t.scoped) out.scoped = true;
  if (typeof t.is_partition_unit === "boolean" && t.is_partition_unit) {
    out.is_partition_unit = true;
  }
  out.fields = (asObjectArray(t.fields) ?? []).map(summariseField);
  return out;
}

function summariseRelationType(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: t.id };
  if (typeof t.name === "string") out.name = t.name;
  // Source/target may appear under either the singular `*_type_id` or
  // plural `*_types` key (CLI-native vs Python-source spelling). Carry
  // through whichever the registered profile uses; do not normalise
  // here — that's the responsibility of `compileProfile`, and the
  // types view should reflect what the registry actually holds.
  if (t.source_type_id !== undefined) out.source_type_id = t.source_type_id;
  if (t.target_type_id !== undefined) out.target_type_id = t.target_type_id;
  if (t.source_types !== undefined) out.source_types = t.source_types;
  if (t.target_types !== undefined) out.target_types = t.target_types;
  if (t.cardinality !== undefined) out.cardinality = t.cardinality;
  if (typeof t.symmetric === "boolean" && t.symmetric) out.symmetric = true;
  if (typeof t.transitive === "boolean" && t.transitive) out.transitive = true;
  return out;
}

function summariseField(f: Record<string, unknown>): Record<string, unknown> {
  // FieldDef carries the data type under `kind` (CLI-native) or
  // `legacy_type` (Python-source escape hatch). The types view
  // surfaces both verbatim — normalising would lose information
  // a caller may have asked for. See `compileProfile` for the
  // canonicalisation that runs before the registry stores the
  // profile; this view reflects whatever the stored shape is.
  const out: Record<string, unknown> = { name: f.name };
  if (typeof f.kind === "string") out.kind = f.kind;
  if (typeof f.legacy_type === "string") out.legacy_type = f.legacy_type;
  if (typeof f.required === "boolean") out.required = f.required;
  // Enum values, ref targets, struct ids, and the inner field of a
  // list are part of the field's type contract, so they belong in
  // the types view; long-form `description` / `default` are dropped
  // — those are what bloat the full payload.
  if (Array.isArray(f.enum_values)) out.enum_values = f.enum_values;
  if (typeof f.ref_type_id === "string") out.ref_type_id = f.ref_type_id;
  if (typeof f.struct_id === "string") out.struct_id = f.struct_id;
  if (f.item_field !== undefined) {
    out.item_field = summariseField(f.item_field as Record<string, unknown>);
  }
  return out;
}

function arraySize(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function asObjectArray(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
}
