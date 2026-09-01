/**
 * Local field-builder helpers for the fact-fiction plugin.
 *
 * Plugins are isolation boundaries (SPEC-PLUGGABLE-ARCHITECTURE §6.1):
 * each ships its own _common.ts so it stays relocatable. This one
 * mirrors the starter's helpers and adds `idRef` (the modern
 * kind: "id-ref" spelling the core resolves at write time — the
 * loop_forward / knowledge_cartridge pattern) and `jsonField` for the
 * narrative-style override blobs whose merge semantics are read-side.
 */
import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  PrimitiveTypeDef,
} from "../../src/core/models/meta.js";

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

export function bool(
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

export function numberField(
  name: string,
  description: string,
  opts?: { required?: boolean; min?: number; max?: number },
): FieldDefT {
  const validations: FieldValidation[] = [];
  if (opts?.min != null) validations.push({ kind: "min", value: opts.min, level: "error" });
  if (opts?.max != null) validations.push({ kind: "max", value: opts.max, level: "error" });
  return {
    name,
    legacy_type: "float",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

export function intField(
  name: string,
  description: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    legacy_type: "integer",
    required: opts?.required ?? true,
    description,
    validations: [],
  };
}

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
    validations: [],
  };
}

/** A reference to another primitive, resolved by the core at write time. */
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

/**
 * A free-shape JSON object field. Used only for narrative-style
 * overrides, whose deep-partial merge semantics are resolved by the
 * renderer (read side), not by the validator — see
 * renderers/manuscript_outline.ts.
 */
export function jsonField(
  name: string,
  description: string,
  opts?: { required?: boolean },
): FieldDefT {
  return {
    name,
    kind: "json",
    required: opts?.required ?? false,
    description,
    validations: [],
  };
}

export function idTemplate(
  pattern: string,
  uniqueness: IDFormatRule["uniqueness"] = "global",
): IDFormatRule {
  return { pattern, uniqueness, pattern_kind: "template" };
}

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
