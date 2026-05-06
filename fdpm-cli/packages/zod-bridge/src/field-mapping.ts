import type { z } from "zod";
import type {
  EnumDef,
  FieldDef,
  FieldKind,
  StructDef,
  ValidationRule,
} from "./types.js";
import {
  BridgeError,
  getArrayElement,
  getChecks,
  getEnumValues,
  getObjectShape,
  unwrap,
} from "./walker.js";

export interface MapFieldContext {
  vendor: string;
  /** Name of the Zod field key, e.g. "name". */
  fieldName: string;
  /** Path of ancestor type names for struct id generation, e.g. ["Customer", "Address"]. */
  typePath: readonly string[];
  /** Lift markers (decision:nesting-strategy). */
  liftMarkers?: WeakSet<z.ZodType>;
  /** Recursion depth bound (flag:zod-recursive-lazy). */
  recursionDepth: number;
  currentDepth: number;
}

export interface MappedField {
  field: FieldDef;
  enums: EnumDef[];
  inlineStructs: StructDef[];
}

export function mapField(
  schema: z.ZodType,
  ctx: MapFieldContext,
): MappedField {
  if (ctx.currentDepth > ctx.recursionDepth) {
    throw new BridgeError(
      `recursion depth bound ${ctx.recursionDepth} exceeded at ${ctx.typePath.join(".")}.${ctx.fieldName}`,
      "flag:zod-recursive-lazy",
      { depth_bound: ctx.recursionDepth, path: ctx.typePath, field: ctx.fieldName },
    );
  }
  const u = unwrap(schema);
  const enums: EnumDef[] = [];
  const inlineStructs: StructDef[] = [];

  if (u.brand) {
    // flag:zod-brand defaults to strip; we proceed with the underlying type.
  }

  // Reject z.discriminatedUnion / z.union / z.intersection variants the bridge
  // does not yet auto-translate (flag:zod-discriminated-union default is
  // variant-per-primitive but that requires multi-schema context, not field-
  // level). At field level we surface the limitation.
  if (u.type === "union" || u.type === "discriminated_union") {
    throw new BridgeError(
      `union/discriminated_union at field level is not yet supported at the field-mapping layer.`,
      "flag:zod-discriminated-union",
      { node_type: u.type, path: ctx.typePath, field: ctx.fieldName },
    );
  }
  if (u.type === "intersection") {
    throw new BridgeError(
      `intersection schemas must be merged at the schema layer before invoking the bridge; field-level intersection is rejected.`,
      "flag:zod-intersection",
      { path: ctx.typePath, field: ctx.fieldName },
    );
  }

  const required = !u.optional && !u.defaulted;
  const nullable = u.nullable || undefined;
  const validations: ValidationRule[] = [];
  let kind: FieldKind;
  let format: string | undefined;
  let item_field: FieldDef | undefined;
  let struct_id: string | undefined;
  let enum_values: readonly string[] | undefined;

  if (u.type === "string") {
    kind = "string";
    for (const c of getChecks(u.inner)) {
      if (c.check === "min_length") {
        validations.push({ kind: "min_length", value: c.minimum as number, level: "error" });
      } else if (c.check === "max_length") {
        validations.push({ kind: "max_length", value: c.maximum as number, level: "error" });
      } else if (c.check === "string_format" && c.format === "regex") {
        const pattern = c.pattern as RegExp;
        validations.push({ kind: "regex", value: pattern.source, level: "error" });
      } else if (c.check === "string_format" && (c.format === "datetime" || c.format === "iso_datetime")) {
        format = "iso-8601";
      }
    }
  } else if (u.type === "number" || u.type === "int") {
    kind = "number";
    for (const c of getChecks(u.inner)) {
      if (c.check === "greater_than") {
        if (c.inclusive) {
          validations.push({ kind: "min_value", value: c.value as number, level: "error" });
        }
      } else if (c.check === "less_than") {
        if (c.inclusive) {
          validations.push({ kind: "max_value", value: c.value as number, level: "error" });
        }
      }
    }
  } else if (u.type === "boolean") {
    kind = "boolean";
  } else if (u.type === "bigint") {
    kind = "string";
    format = "bigint-decimal";
  } else if (u.type === "enum") {
    const values = getEnumValues(u.inner);
    if (!values) throw new BridgeError("enum without entries", "flag:internal", { field: ctx.fieldName });
    kind = "enum";
    enum_values = values;
    const enumName = pascalCase(`${ctx.typePath.join("")}_${ctx.fieldName}`);
    enums.push({
      id: `enum:${enumName}`,
      name: enumName,
      values,
      description: `Enum derived from ${ctx.typePath.join(".")}.${ctx.fieldName}`,
    });
  } else if (u.type === "literal") {
    // Treat as a string-typed field with regex equality (handled by CEL rule 23).
    kind = "string";
  } else if (u.type === "array") {
    const element = getArrayElement(u.inner);
    if (!element) throw new BridgeError("array without element", "flag:internal");
    kind = "list";
    for (const c of getChecks(u.inner)) {
      if (c.check === "min_length") {
        validations.push({ kind: "min_items", value: c.minimum as number, level: "error" });
      } else if (c.check === "max_length") {
        validations.push({ kind: "max_items", value: c.maximum as number, level: "error" });
      }
    }
    const sub = mapField(element, {
      ...ctx,
      fieldName: "_item",
      currentDepth: ctx.currentDepth + 1,
    });
    item_field = sub.field;
    enums.push(...sub.enums);
    inlineStructs.push(...sub.inlineStructs);
  } else if (u.type === "object") {
    // Lifted? -> emit relation handled at the orchestrator layer.
    if (ctx.liftMarkers && ctx.liftMarkers.has(u.inner)) {
      kind = "relation";
      struct_id = pascalCase(`${ctx.typePath.join("")}_${ctx.fieldName}`);
    } else {
      kind = "struct";
      const structName = pascalCase(`${ctx.typePath.join("")}_${ctx.fieldName}`);
      struct_id = structName;
      const shape = getObjectShape(u.inner);
      if (shape) {
        const subFields: FieldDef[] = [];
        for (const [subName, subSchema] of Object.entries(shape)) {
          const sub = mapField(subSchema, {
            ...ctx,
            fieldName: subName,
            typePath: [...ctx.typePath, structName],
            currentDepth: ctx.currentDepth + 1,
          });
          subFields.push(sub.field);
          enums.push(...sub.enums);
          inlineStructs.push(...sub.inlineStructs);
        }
        inlineStructs.push({ id: structName, fields: subFields });
      }
    }
  } else if (u.type === "lazy") {
    throw new BridgeError(
      `z.lazy recursive schemas exceed the configured depth bound`,
      "flag:zod-recursive-lazy",
      { path: ctx.typePath, field: ctx.fieldName },
    );
  } else {
    throw new BridgeError(
      `unsupported Zod node type at ${ctx.typePath.join(".")}.${ctx.fieldName}: ${u.type}`,
      `flag:zod-unknown-${u.type}`,
      { node_type: u.type },
    );
  }

  const field: FieldDef = {
    name: ctx.fieldName,
    kind,
    required,
    ...(nullable !== undefined ? { nullable } : {}),
    ...(enum_values ? { enum_values } : {}),
    ...(item_field ? { item_field } : {}),
    ...(struct_id ? { struct_id } : {}),
    ...(format ? { format } : {}),
    ...(validations.length ? { validations } : {}),
    ...(u.defaulted ? { description: `default: ${JSON.stringify(u.defaultValue)}` } : {}),
  };

  return { field, enums, inlineStructs };
}

function pascalCase(input: string): string {
  return input
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
}
