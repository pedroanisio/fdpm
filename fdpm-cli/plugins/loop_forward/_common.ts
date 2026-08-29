/**
 * Local field-builder helpers for the loop-forward plugin.
 *
 * Duplicated per plugin on purpose: plugins are isolation boundaries
 * (SPEC-PLUGGABLE-ARCHITECTURE §6.1) and must be relocatable to their
 * own repository without importing from a sibling. Every shipped plugin
 * in this tree carries its own `_common.ts`.
 *
 * The one addition over the starter's set is `jsonField`: the
 * loop-forward contract stores three genuinely open payloads — a stage's
 * JSON Schema, a literal binding value, a carry's initial value — whose
 * shape is decided by the authored document, not by this profile. They
 * are stored as serialized JSON strings with `format: "json"` so a
 * renderer can tell "an opaque payload" from "a string the domain
 * happens to spell".
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

/** Required floating-point number field. */
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

/** Boolean field. */
export function boolField(
  name: string,
  description: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    legacy_type: "boolean",
    required: opts?.required ?? true,
    description,
    validations: [],
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

/**
 * An opaque JSON payload, stored as a serialized string.
 *
 * `format: "json"` is generator metadata the host does not interpret
 * (see FieldDef in src/core/models/meta.ts); it exists so a renderer can
 * distinguish a payload it must `JSON.parse` from ordinary prose. The
 * three users are OutputContract.json_schema, VariableBinding.literal_value
 * and Carry.initial_value — each open by contract, not by omission.
 */
export function jsonField(
  name: string,
  description: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    legacy_type: "string",
    format: "json",
    required: opts?.required ?? true,
    description,
    validations: [],
  };
}

/** A reference to another primitive, stored as its instance id. */
export function idRef(
  name: string,
  description: string,
  refTypeId: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    kind: "id-ref",
    ref_type_id: refTypeId,
    required: opts?.required ?? true,
    description,
    validations: [],
  };
}

/** Construct an id_format rule from a slug template. */
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
