/**
 * Predicate-evaluator helpers for the spec_authoring plugin.
 *
 * The plugin declares 24 ValidationRuleDef entries with predicate strings
 * (`non_trivial(field)`, `min_items(field, n)`, `field(x) != y`,
 * `has_incoming(rel_id)`, `has_outgoing(rel_id)`). The CLI v1.1 Core has
 * no built-in predicate-DSL evaluator, so absent these helpers each rule
 * surfaces as `info: predicate not evaluated` — the exact PALS-LAW failure
 * mode the SPEC-CEL-VALIDATOR proposal addresses. We register real
 * validators here so this plugin does not ship the bug it documents.
 *
 * Mirrors fdpm-cli/plugins/formal_specification/_validators.ts in shape;
 * intentionally duplicated rather than imported (SPEC-PLUGGABLE §6.1
 * plugin-isolation rule).
 *
 * Once the host CEL runtime described in SPEC-CEL-VALIDATOR lands, this
 * file shrinks to zero and the predicate strings in validation_rules.ts
 * become the executable spec.
 */
import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationFinding,
} from "../../src/core/models/instance.js";
import type { ValidationLevel } from "../../src/core/models/meta.js";

export interface FindingOpts {
  ruleId: string;
  level: ValidationLevel;
  targetId: string;
  fieldPath?: string | null;
  message: string;
}

function makeFinding(o: FindingOpts): ValidationFinding {
  return {
    rule_id: o.ruleId,
    level: o.level,
    target_id: o.targetId,
    field_path: o.fieldPath ?? null,
    message: o.message,
  };
}

/** A field is trivial when undefined / null / "" / [] / {} (booleans/0 are NOT trivial). */
export function isTrivial(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function checkNonTrivial(
  instance: PrimitiveInstance | RelationInstance,
  field: string,
  opts: { ruleId: string; level: ValidationLevel; message: string },
): ValidationFinding[] {
  if (!isTrivial(instance.field_values[field])) return [];
  return [
    makeFinding({
      ...opts,
      targetId: instance.id,
      fieldPath: `field_values.${field}`,
    }),
  ];
}

export function checkMinItems(
  instance: PrimitiveInstance | RelationInstance,
  field: string,
  n: number,
  opts: { ruleId: string; level: ValidationLevel; message: string },
): ValidationFinding[] {
  const v = instance.field_values[field];
  if (Array.isArray(v) && v.length >= n) return [];
  return [
    makeFinding({
      ...opts,
      targetId: instance.id,
      fieldPath: `field_values.${field}`,
    }),
  ];
}

/** field(name) === value — strict equality (string-coerced for enum cells). */
export function fieldEquals(
  instance: PrimitiveInstance | RelationInstance,
  field: string,
  value: unknown,
): boolean {
  return instance.field_values[field] === value;
}

/** has_incoming(rel_id) — at least one relation of rel_id targets this instance. */
export function hasIncoming(
  instance: PrimitiveInstance | RelationInstance,
  relations: readonly RelationInstance[],
  rel_id: string,
): boolean {
  return relations.some((r) => r.type_id === rel_id && r.target_id === instance.id);
}

/** has_outgoing(rel_id) — at least one relation of rel_id originates here. */
export function hasOutgoing(
  instance: PrimitiveInstance | RelationInstance,
  relations: readonly RelationInstance[],
  rel_id: string,
): boolean {
  return relations.some((r) => r.type_id === rel_id && r.source_id === instance.id);
}
