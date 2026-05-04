/**
 * Local helpers for the dnis plugin. Mirrors plugins/spec_authoring/_common.ts.
 * Plugins are isolated; we duplicate rather than import across plugin
 * boundaries (SPEC-PLUGGABLE-ARCHITECTURE §6.1).
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

export function strList(
  name: string,
  description: string,
  opts?: { required?: boolean; minItems?: number; validations?: FieldValidation[] },
): FieldDefT {
  const validations: FieldValidation[] = [...(opts?.validations ?? [])];
  if (opts?.minItems != null)
    validations.push({ kind: "min_items", value: opts.minItems, level: "error" });
  return {
    name,
    legacy_type: "string[]",
    required: opts?.required ?? true,
    description,
    validations,
  };
}

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

/**
 * jsonString — for fields whose runtime shape is `unknown` per SPEC-DNIS
 * (Node.content, Document.metadata). The SPEC-CORE meta-model does not
 * have an open-record kind; we persist the canonicalized JSON as a
 * string and the adapter handles encode/decode. The hash (per SPEC-DNIS
 * §9.2) is computed over the canonicalized object before stringification,
 * so two equivalent contents still produce identical hashes.
 */
export function jsonString(
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
