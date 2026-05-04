/**
 * Reusable helpers for the formal_specification plugin. Mirror the
 * patterns the Python source uses (every primitive type repeats the
 * same FieldDef shapes; this is where the repetition lives).
 *
 * The CLI Core meta-model accepts both the legacy Python-source spec
 * strings (via `legacy_type`) and the structured form (via `kind`).
 * These helpers emit the legacy form so the port reads as faithfully
 * as possible to the Python source.
 */
import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  PrimitiveTypeDef,
  InlineStructDef,
} from "../../src/core/models/meta.js";

/** A simple `string` field. */
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

/** A `ConstrainedText` field with optional `max_length` validation. */
export function text(
  name: string,
  description: string,
  opts?: {
    required?: boolean;
    maxLength?: number;
    validations?: FieldValidation[];
  },
): FieldDefT {
  const validations: FieldValidation[] = [...(opts?.validations ?? [])];
  if (opts?.maxLength != null) {
    validations.push({ kind: "max_length", value: opts.maxLength, level: "error" });
  }
  return {
    name,
    legacy_type: "ConstrainedText",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

/** An `integer` field. */
export function int(
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

/** A `boolean` field. */
export function bool(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: "boolean",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** An `ISO8601` date/time field. */
export function iso(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: "ISO8601",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** An `Enum["a", "b", ...]` field (closed value set). */
export function enumOf(
  name: string,
  description: string,
  values: string[],
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  const literal = values.map((v) => `"${v}"`).join(", ");
  return {
    name,
    legacy_type: `Enum[${literal}]`,
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** A `string[]` field. */
export function strList(
  name: string,
  description: string,
  opts?: {
    required?: boolean;
    minItems?: number;
    validations?: FieldValidation[];
  },
): FieldDefT {
  const validations: FieldValidation[] = [...(opts?.validations ?? [])];
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

/** A `StructField[X][]` field — list of inline-struct items. */
export function structList(
  name: string,
  description: string,
  structName: string,
  opts?: {
    required?: boolean;
    minItems?: number;
    validations?: FieldValidation[];
  },
): FieldDefT {
  const validations: FieldValidation[] = [...(opts?.validations ?? [])];
  if (opts?.minItems != null) {
    validations.push({ kind: "min_items", value: opts.minItems, level: "error" });
  }
  return {
    name,
    legacy_type: `StructField[${structName}][]`,
    required: opts?.required ?? true,
    description,
    validations,
  };
}

/**
 * A `StructField[X]` field — single inline-struct value (not a list).
 * Use when the field carries one struct, not a collection.
 */
export function struct(
  name: string,
  description: string,
  structName: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    legacy_type: `StructField[${structName}]`,
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/**
 * An untyped object field (`kind: "json"`). Use only when the value is
 * genuinely heterogeneous. Prefer `struct()` when a stable shape exists.
 */
export function json(
  name: string,
  description: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  return {
    name,
    kind: "json",
    required: opts?.required ?? true,
    description,
    validations: opts?.validations ?? [],
  };
}

/** ID-format helpers. */
export function idTemplate(
  pattern: string,
  uniqueness: IDFormatRule["uniqueness"] = "global",
): IDFormatRule {
  return {
    pattern,
    uniqueness,
    pattern_kind: "template",
  };
}

/**
 * Build a PrimitiveTypeDef with sensible defaults (matches the Python
 * source's spelling: `name`, `category`, `description`, `scoped`,
 * `id_format`, `fields`, `inline_structs`, `constraints`).
 */
export function primitive(args: {
  id: string;
  name: string;
  category: string;
  description: string;
  scoped?: boolean;
  id_format: IDFormatRule;
  fields: FieldDefT[];
  inline_structs?: InlineStructDef[];
  is_partition_unit?: boolean;
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
    inline_structs: args.inline_structs ?? [],
    constraints: [],
    is_partition_unit: args.is_partition_unit ?? false,
  };
}

/** Build an inline struct (the Python source uses `name`, not `id`). */
export function inlineStruct(name: string, fields: FieldDefT[]): InlineStructDef {
  return { id: name, name, fields };
}
