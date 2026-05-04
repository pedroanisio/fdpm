/**
 * Local helpers for the software_architecture plugin. Mirrors the
 * patterns of the formal_specification plugin's _common.ts but adds
 * `stableId()` (Python `StableID` with a `references` validation kind)
 * and a `constraints` slot on `primitive()` (Python TypeConstraint).
 *
 * Plugins are isolated; we duplicate rather than import across plugin
 * boundaries.
 */
import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  InlineStructDef,
  PrimitiveTypeDef,
  TypeConstraint,
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

export function textList(
  name: string,
  description: string,
  opts?: {
    required?: boolean;
    minItems?: number;
    maxLength?: number;
    validations?: FieldValidation[];
  },
): FieldDefT {
  const validations: FieldValidation[] = [...(opts?.validations ?? [])];
  if (opts?.minItems != null) {
    validations.push({ kind: "min_items", value: opts.minItems, level: "error" });
  }
  if (opts?.maxLength != null) {
    validations.push({ kind: "max_length", value: opts.maxLength, level: "error" });
  }
  return {
    name,
    legacy_type: "ConstrainedText[]",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

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

/**
 * Single-valued `StructField[X]` field (no `[]` list suffix). The Python
 * source uses this spelling for `Decision.alternatives`,
 * `Schema.fields`, and `Contract.error_conditions`, sometimes paired
 * with `min_items` even though the legacy_type is technically a single
 * struct value. Mirrored verbatim for byte-faithful parity with
 * src/fdpm/plugins/software_architecture.py.
 */
export function struct(
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
    legacy_type: `StructField[${structName}]`,
    required: opts?.required ?? true,
    description,
    validations,
  };
}

/**
 * Python `StableID` field with a `references` FieldValidation pointing
 * at the referenced primitive type id (e.g. "sw:Entity"). The runtime
 * stores the `references` kind verbatim — it is not enforced by the
 * core validator in v1.1, but downstream tooling can read it.
 */
export function stableId(
  name: string,
  description: string,
  referencesTypeId: string,
  opts?: { required?: boolean; validations?: FieldValidation[] },
): FieldDefT {
  const validations: FieldValidation[] = [
    { kind: "references", value: referencesTypeId, level: "error" },
    ...(opts?.validations ?? []),
  ];
  return {
    name,
    legacy_type: "StableID",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

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

export function primitive(args: {
  id: string;
  name: string;
  category: string;
  description: string;
  scoped?: boolean;
  id_format: IDFormatRule;
  fields: FieldDefT[];
  inline_structs?: InlineStructDef[];
  constraints?: TypeConstraint[];
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
    constraints: args.constraints ?? [],
    is_partition_unit: args.is_partition_unit ?? false,
  };
}

export function inlineStruct(name: string, fields: FieldDefT[]): InlineStructDef {
  return { id: name, name, fields };
}
