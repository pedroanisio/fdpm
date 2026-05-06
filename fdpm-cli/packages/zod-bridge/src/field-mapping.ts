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
  /** Lazy-recursion bound (flag:zod-recursive-lazy). Counts only z.lazy unwrapping. */
  recursionDepth: number;
  /** How many z.lazy nodes have been entered on the current path. */
  lazyDepth: number;
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
  // Recursion bound applies ONLY to z.lazy unwrapping, not to plain object
  // nesting. Bumped when we enter a lazy node below.
  if (ctx.lazyDepth > ctx.recursionDepth) {
    throw new BridgeError(
      `z.lazy recursion depth bound ${ctx.recursionDepth} exceeded at ${ctx.typePath.join(".")}.${ctx.fieldName}`,
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

  // flag:zod-discriminated-union — at the field level we cannot emit a
  // variant-per-primitive split (that requires schema-set context). Emit a
  // payload-blob field instead: kind=string, format=json-union. The validator
  // (safeParse) still enforces the union's per-variant rules end-to-end.
  // Authors who need split storage hoist the union to the schemas map and the
  // bridge generates one PrimitiveTypeDef per variant at the orchestrator
  // layer (future v0.2.0).
  if (u.type === "union" || u.type === "discriminated_union") {
    const field: FieldDef = {
      name: ctx.fieldName,
      kind: "string",
      required: !u.optional && !u.defaulted,
      format: "json-union",
      validations: [],
      ...(u.nullable ? { nullable: true } : {}),
    };
    return { field, enums: [], inlineStructs: [] };
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
    // Disambiguate item structs by absorbing the array's own field name into
    // the typePath. `tags: z.array(z.object(...))` → struct id ends in "Tags",
    // not collides with every other array's "Item".
    const sub = mapField(element, {
      ...ctx,
      fieldName: `${ctx.fieldName}Item`,
      typePath: ctx.typePath,
      lazyDepth: ctx.lazyDepth,
    });
    item_field = sub.field;
    enums.push(...sub.enums);
    inlineStructs.push(...sub.inlineStructs);
  } else if (u.type === "object") {
    // Lifted? -> emit relation handled at the orchestrator layer.
    // Struct id is the typePath plus the current fieldName, NOT typePath
    // joined with itself. Compounding here was a bug.
    const fieldPath = [...ctx.typePath, pascalCase(ctx.fieldName)];
    const structName = fieldPath.join("");
    if (ctx.liftMarkers && ctx.liftMarkers.has(u.inner)) {
      kind = "relation";
      struct_id = structName;
    } else {
      kind = "struct";
      struct_id = structName;
      const shape = getObjectShape(u.inner);
      if (shape) {
        const subFields: FieldDef[] = [];
        for (const [subName, subSchema] of Object.entries(shape)) {
          const sub = mapField(subSchema, {
            ...ctx,
            fieldName: subName,
            typePath: fieldPath,
            lazyDepth: ctx.lazyDepth,
          });
          subFields.push(sub.field);
          enums.push(...sub.enums);
          inlineStructs.push(...sub.inlineStructs);
        }
        inlineStructs.push({ id: structName, fields: subFields });
      }
    }
  } else if (u.type === "record") {
    // flag:zod-pipe-transform-adjacent: z.record(K, V) has no clean primitive
    // representation. Emit as opaque JSON-encoded string and let the validator
    // (safeParse) enforce key/value rules. Documented as a partial mapping.
    kind = "string";
    format = "json-record";
  } else if (u.type === "lazy") {
    // Unwrap one level of z.lazy and recurse with bumped lazyDepth.
    const lazyInner = (u.inner as unknown as { _def?: { getter?: () => z.ZodType } })._def?.getter?.();
    if (!lazyInner) {
      throw new BridgeError(
        `z.lazy without resolvable getter at ${ctx.typePath.join(".")}.${ctx.fieldName}`,
        "flag:zod-recursive-lazy",
        { path: ctx.typePath, field: ctx.fieldName },
      );
    }
    return mapField(lazyInner, { ...ctx, lazyDepth: ctx.lazyDepth + 1 });
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
    // SPEC-CORE FieldDef requires `validations: FieldValidation[]`
    // (defaults to []); always emitting the array — even when empty —
    // matches the host's compileField expectation and prevents
    // "f.validations is not iterable" at validation time.
    validations,
    ...(nullable !== undefined ? { nullable } : {}),
    ...(enum_values ? { enum_values } : {}),
    ...(item_field ? { item_field } : {}),
    ...(struct_id ? { struct_id } : {}),
    ...(format ? { format } : {}),
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
