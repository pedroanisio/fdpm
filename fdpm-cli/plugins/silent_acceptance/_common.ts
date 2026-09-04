import type {
  FieldDefT,
  FieldValidation,
  IDFormatRule,
  PrimitiveTypeDef,
} from "../../src/core/models/meta.js";

export function str(
  name: string,
  description: string,
  opts: { required?: boolean; validations?: FieldValidation[]; format?: string } = {},
): FieldDefT {
  return {
    name,
    legacy_type: "string",
    required: opts.required ?? true,
    description,
    validations: opts.validations ?? [],
    ...(opts.format ? { format: opts.format } : {}),
  };
}

export function shortText(
  name: string,
  description: string,
  maxLength: number,
  opts: { required?: boolean } = {},
): FieldDefT {
  return str(name, description, {
    required: opts.required,
    validations: [{ kind: "max_length", value: maxLength, level: "error" }],
  });
}

export function enumOf(
  name: string,
  description: string,
  values: readonly string[],
  opts: { required?: boolean } = {},
): FieldDefT {
  return {
    name,
    legacy_type: `Enum[${values.map((value) => `"${value}"`).join(", ")}]`,
    required: opts.required ?? true,
    enum_values: [...values],
    description,
    validations: [],
  };
}

export function numberField(
  name: string,
  description: string,
  opts: { required?: boolean; min?: number; max?: number } = {},
): FieldDefT {
  const validations: FieldValidation[] = [];
  if (opts.min !== undefined) validations.push({ kind: "min", value: opts.min, level: "error" });
  if (opts.max !== undefined) validations.push({ kind: "max", value: opts.max, level: "error" });
  return {
    name,
    legacy_type: "float",
    required: opts.required ?? true,
    description,
    validations,
  };
}

export function intField(
  name: string,
  description: string,
  opts: { required?: boolean; min?: number; max?: number } = {},
): FieldDefT {
  const validations: FieldValidation[] = [];
  if (opts.min !== undefined) validations.push({ kind: "min", value: opts.min, level: "error" });
  if (opts.max !== undefined) validations.push({ kind: "max", value: opts.max, level: "error" });
  return {
    name,
    legacy_type: "integer",
    required: opts.required ?? true,
    description,
    validations,
  };
}

export function boolField(name: string, description: string): FieldDefT {
  return { name, legacy_type: "boolean", required: true, description, validations: [] };
}

export function dateField(name: string, description: string, required = true): FieldDefT {
  return str(name, description, {
    required,
    format: "iso-8601-date",
    validations: [
      { kind: "pattern", value: "^\\d{4}-\\d{2}-\\d{2}$", level: "error" },
    ],
  });
}

export function dateTimeField(name: string, description: string, required = true): FieldDefT {
  return str(name, description, {
    required,
    format: "iso-8601-date-time-utc",
    validations: [
      {
        kind: "pattern",
        value: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
        level: "error",
      },
    ],
  });
}

export function sha256Field(name: string, description: string, required = true): FieldDefT {
  return str(name, description, {
    required,
    format: "sha256-hex",
    validations: [{ kind: "pattern", value: "^[a-f0-9]{64}$", level: "error" }],
  });
}

export function idTemplate(pattern: string): IDFormatRule {
  return { pattern, uniqueness: "global", pattern_kind: "template" };
}

export function primitive(args: {
  id: string;
  idPattern: string;
  name: string;
  category: string;
  description: string;
  fields: FieldDefT[];
}): PrimitiveTypeDef {
  return {
    id: args.id,
    name: args.name,
    category_id: args.category,
    category: args.category,
    description: args.description,
    scoped: true,
    id_format: idTemplate(args.idPattern),
    fields: args.fields,
    inline_structs: [],
    constraints: [],
    is_partition_unit: false,
  };
}
