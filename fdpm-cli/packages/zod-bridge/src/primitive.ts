import type { z } from "zod";
import { zodSchemaToCelConstraints } from "./cel.js";
import { mapField } from "./field-mapping.js";
import type {
  BridgeOptions,
  Constraint,
  EnumDef,
  FieldDef,
  PrimitiveTypeDef,
  RelationTypeDef,
  StructDef,
} from "./types.js";
import { BridgeError, getObjectShape } from "./walker.js";

export interface ZodSchemaToPrimitiveTypeResult {
  primitive: PrimitiveTypeDef;
  enums: EnumDef[];
  relations: RelationTypeDef[];
  constraints: Constraint[];
}

export function zodSchemaToPrimitiveType(
  name: string,
  schema: z.ZodType,
  opts: BridgeOptions,
): ZodSchemaToPrimitiveTypeResult {
  const shape = getObjectShape(schema);
  if (!shape) {
    throw new BridgeError(
      `zodSchemaToPrimitiveType requires a z.object schema; got type=${(schema as unknown as { _def?: { type?: string } })._def?.type ?? "unknown"} for ${name}`,
      "flag:internal",
      { name },
    );
  }

  const fields: FieldDef[] = [];
  const enums: EnumDef[] = [];
  const inlineStructs: StructDef[] = [];
  const relations: RelationTypeDef[] = [];
  const constraints: Constraint[] = [];
  const recursionDepth = opts.recursionDepth ?? 1;
  const primitiveTypeId = `${opts.vendor}:${name}`;

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const sub = mapField(fieldSchema, {
      vendor: opts.vendor,
      fieldName,
      typePath: [name],
      ...(opts.liftMarkers ? { liftMarkers: opts.liftMarkers } : {}),
      recursionDepth,
      lazyDepth: 0,
    });
    fields.push(sub.field);
    enums.push(...sub.enums);
    inlineStructs.push(...sub.inlineStructs);

    if (sub.field.kind === "relation" && sub.field.struct_id) {
      const targetTypeId = `${opts.vendor}:${sub.field.struct_id}`;
      relations.push({
        id: `${opts.vendor}:${name}Has${sub.field.struct_id}`,
        source_type_id: primitiveTypeId,
        target_type_id: targetTypeId,
        cardinality: "one-to-one",
        fields: [],
      });
      sub.field.relation_target_type_id = targetTypeId;
    }

    // Emit CEL constraints for this field, addressed via self.field_values.<name>.
    const namePrefix = `${opts.vendor}.${name.toLowerCase()}.${fieldName}`;
    const fieldConstraints = zodSchemaToCelConstraints(fieldSchema, {
      selfPath: `self.field_values.${fieldName}`,
      namePrefix,
      level: "error",
    });
    constraints.push(...fieldConstraints);
  }

  // Apply user-supplied CEL sidecar (flag:zod-cross-field-refine).
  if (opts.celConstraints) {
    for (const sc of opts.celConstraints) {
      if (sc.appliesToType && sc.appliesToType !== primitiveTypeId) continue;
      constraints.push({
        name: `${opts.vendor}.${name.toLowerCase()}.${sc.name}`,
        expression: sc.expression,
        level: sc.level ?? "error",
      });
    }
  }

  const primitive: PrimitiveTypeDef = {
    id: primitiveTypeId,
    fields,
    ...(inlineStructs.length ? { inline_structs: inlineStructs } : {}),
  };

  return { primitive, enums, relations, constraints };
}
