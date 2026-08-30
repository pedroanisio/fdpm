/**
 * Local field-builder helpers for the agent-memory plugin.
 *
 * Duplicated per plugin on purpose: plugins are isolation boundaries
 * (SPEC-PLUGGABLE-ARCHITECTURE §6.1) and must be relocatable to their
 * own repository without importing from a sibling. Every shipped plugin
 * in this tree carries its own `_common.ts`.
 *
 * This set is smaller than the starter's. The agent-memory contract has
 * no list fields, no floats, no booleans and no open JSON
 * payloads — every field is a string, a closed enum or a non-negative
 * integer — so the
 * builders that would serve none of them are absent rather than carried
 * unused.
 */
import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  PrimitiveTypeDef,
} from "../../src/core/models/meta.js";

/** Required string field. */
export function str(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: "string",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** A short string with a max-length cap. */
export function shortText(
  name: string,
  description: string,
  maxLength: number,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    legacy_type: "string",
    required: opts?.required ?? true,
    description,
    validations: [{ kind: "max_length", value: maxLength, level: "error" }],
  };
}

/**
 * A step counter.
 *
 * Every temporal field in the contract is `z.number().int().nonnegative()` —
 * a monotone position within an episode, not a wall-clock instant. The
 * floor travels with the field so the host rejects a negative step from
 * the type definition, without a validator.
 */
export function stepField(
  name: string,
  description: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    legacy_type: "integer",
    required: opts?.required ?? true,
    description,
    validations: [{ kind: "min", value: 0, level: "error" }],
  };
}

/** Required closed-set string enum. */
export function enumOf(
  name: string,
  description: string,
  values: readonly string[],
  opts?: { required?: boolean },
): FieldDefT {
  const literal = values.map((v) => `"${v}"`).join(", ");
  return {
    name,
    legacy_type: `Enum[${literal}]`,
    required: opts?.required ?? true,
    description,
    enum_values: [...values],
    validations: [],
  };
}

/** Construct an id_format rule from a slug template. */
export function idTemplate(
  pattern: string,
  uniqueness: IDFormatRule["uniqueness"] = "workbook",
): IDFormatRule {
  return { pattern, uniqueness, pattern_kind: "template" };
}

/** Convenience constructor for PrimitiveTypeDef with sane defaults. */
export function primitive(args: {
  id: string;
  name: string;
  category: string;
  description: string;
  scoped?: boolean;
  id_format: IDFormatRule;
  fields: FieldDefT[];
}): PrimitiveTypeDef {
  return {
    id: args.id,
    name: args.name,
    category_id: args.category,
    category: args.category,
    description: args.description,
    scoped: args.scoped ?? false,
    id_format: args.id_format,
    fields: args.fields,
    inline_structs: [],
    constraints: [],
    is_partition_unit: false,
  };
}
