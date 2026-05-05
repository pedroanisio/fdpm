/**
 * Local field-builder helpers for the starter plugin.
 *
 * EDUCATIONAL NOTE — why this is duplicated rather than imported:
 *   Plugins are isolation boundaries (SPEC-PLUGGABLE-ARCHITECTURE §6.1).
 *   Each plugin should be relocatable to its own repository without
 *   pulling in helpers from sibling plugins. Every shipped plugin in
 *   this codebase ships its own _common.ts; this is intentional, not a
 *   refactor opportunity. When you fork the starter, this file moves
 *   with you and stays self-contained.
 */
import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  PrimitiveTypeDef,
} from "../../src/core/models/meta.js";

/** Required string field (the most common shape). */
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

/** A short string with a max-length cap (for free-text labels, names). */
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

/** A list-of-strings field. */
export function strList(
  name: string,
  description: string,
  opts?: { required?: boolean; minItems?: number },
): FieldDefT {
  const validations: FieldValidation[] = [];
  if (opts?.minItems != null) {
    validations.push({ kind: "min_items", value: opts.minItems, level: "error" });
  }
  return {
    name,
    legacy_type: "string[]",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

/** Required floating-point number field (legacy_type "float"). */
export function numberField(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: "float",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** Required integer field. */
export function intField(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: "integer",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** Required closed-set string enum. */
export function enumOf(
  name: string,
  description: string,
  values: string[],
  opts?: { required?: boolean },
): FieldDefT {
  const literal = values.map((v) => `"${v}"`).join(", ");
  return {
    name,
    legacy_type: `Enum[${literal}]`,
    required: opts?.required ?? true,
    description,
    validations: [],
  };
}

/**
 * Construct an id_format rule from a slug template like `recipe:{slug}`.
 *
 * EDUCATIONAL NOTE — `idTemplate` vs raw regex:
 *   idTemplate produces a SPEC-CORE pattern_kind=template rule, which the
 *   host evaluates faster than a regex AND surfaces friendlier error
 *   messages ("expected recipe:{slug} got X"). Use it whenever your id
 *   shape is "namespace:placeholder". Drop down to `pattern_kind: "regex"`
 *   only when you genuinely need character-class control or alternation.
 */
export function idTemplate(
  pattern: string,
  uniqueness: IDFormatRule["uniqueness"] = "global",
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
