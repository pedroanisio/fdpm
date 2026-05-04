import type {
  DomainProfile,
  FieldDefT,
  PrimitiveTypeDef,
  RelationTypeDef,
  CategoryDef,
  ScopeDef,
  ValidationRuleDef,
  RendererBinding,
  InlineStructDef,
} from "../models/meta.js";
import { FDPMException } from "../errors/fdpm-exception.js";

/**
 * compileProfile — normalise an "input" DomainProfile (which may use the
 * Python-source-style aliases and `legacy_type` field-type spec strings)
 * into the CLI runtime's canonical form. The output is still a valid
 * DomainProfile; downstream code (validation pipeline, replay, registry
 * resolution) only sees the structured representation.
 *
 * This is the only place that knows about the legacy spec language.
 * Adding a new spec form means extending this file, never the runtime.
 */
export function compileProfile(input: DomainProfile): DomainProfile {
  return {
    ...input,
    label: input.label ?? input.name ?? input.id,
    categories: (input.categories ?? []).map(compileCategory),
    scopes: (input.scopes ?? []).map(compileScope),
    primitive_types: (input.primitive_types ?? []).map(compilePrimitiveType),
    relation_types: (input.relation_types ?? []).map(compileRelationType),
    validation_rules: (input.validation_rules ?? []).map(compileValidationRule),
    renderer_bindings: (input.renderer_bindings ?? []).map(compileRendererBinding),
    renderers: (input.renderers ?? []).map(compileRendererBinding),
    inline_structs: (input.inline_structs ?? []).map(compileInlineStruct),
    templates: input.templates ?? [],
    scope_sets: input.scope_sets ?? {},
    default_scope_set: input.default_scope_set ?? "",
    extends: input.extends ?? [],
  };
}

function compileCategory(c: CategoryDef): CategoryDef {
  return { ...c, label: c.label ?? c.name ?? c.id };
}

function compileScope(s: ScopeDef): ScopeDef {
  return { ...s, label: s.label ?? s.name ?? s.id };
}

function compileInlineStruct(s: InlineStructDef): InlineStructDef {
  return {
    ...s,
    fields: s.fields.map((f) => compileField(f, s.id)),
  };
}

function compilePrimitiveType(t: PrimitiveTypeDef): PrimitiveTypeDef {
  const inline = (t.inline_structs ?? []).map(compileInlineStruct);
  const fields = t.fields.map((f) => compileField(f, t.id, inline));
  return {
    ...t,
    name: t.name ?? t.id,
    category_id: t.category_id ?? t.category,
    fields,
    inline_structs: inline,
  };
}

function compileRelationType(r: RelationTypeDef): RelationTypeDef {
  // Resolve source_type_id / target_type_id from list form when only the
  // list form is supplied. The list form may be a wildcard "*" — when it
  // is, we pick a synthetic placeholder type id "core:any" so the CLI
  // runtime's structured-pair check can run; the original list is kept
  // on the record for legacy renderers/exporters.
  const srcId = r.source_type_id ?? canonicalFromList(r.source_types, "source");
  const tgtId = r.target_type_id ?? canonicalFromList(r.target_types, "target");
  const fields = (r.metadata_schema ?? r.fields).map((f) => compileField(f, r.id));
  const cardinality = r.cardinality ?? cardinalityFromBounds(r.cardinality_bounds);
  return {
    ...r,
    name: r.name ?? r.id,
    source_type_id: srcId,
    target_type_id: tgtId,
    cardinality,
    fields,
  };
}

function canonicalFromList(
  list: RelationTypeDef["source_types"],
  endpoint: "source" | "target",
): string {
  if (list === "*") return "core:any";
  if (Array.isArray(list) && list.length > 0) return list[0]!;
  throw new FDPMException(
    "verification",
    `RelationTypeDef ${endpoint} list is empty`,
  );
}

function cardinalityFromBounds(
  b: RelationTypeDef["cardinality_bounds"],
): RelationTypeDef["cardinality"] {
  if (!b) return "many-to-many";
  const sOne = b.source_max === 1;
  const tOne = b.target_max === 1;
  if (sOne && tOne) return "one-to-one";
  if (sOne && !tOne) return "one-to-many";
  if (!sOne && tOne) return "many-to-one";
  return "many-to-many";
}

function compileValidationRule(r: ValidationRuleDef): ValidationRuleDef {
  return {
    ...r,
    name: r.name ?? r.id,
    targets: r.targets ?? r.applies_to ?? [],
    expression: r.expression ?? r.predicate ?? "",
  };
}

function compileRendererBinding(b: RendererBinding): RendererBinding {
  return {
    ...b,
    target: b.target ?? b.output_format,
  };
}

/**
 * Translate FieldDefT into a fully-structured form. Operates on either a
 * native (kind-supplied) or a legacy (legacy_type-supplied) input.
 */
export function compileField(
  f: FieldDefT,
  ownerId: string,
  inlineStructs: InlineStructDef[] = [],
): FieldDefT {
  if (f.kind) return f;
  if (!f.legacy_type)
    throw new FDPMException(
      "verification",
      `field ${ownerId}.${f.name} has neither kind nor legacy_type`,
    );
  const parsed = parseLegacyType(f.legacy_type, ownerId, f.name, inlineStructs);
  return { ...f, ...parsed };
}

interface ParsedLegacy {
  kind: NonNullable<FieldDefT["kind"]>;
  enum_values?: string[];
  item_field?: FieldDefT;
  struct_id?: string;
}

/**
 * Translate a Python-source field-type spec string into structured form.
 *
 * Recognised:
 *  - "string"            → kind=string
 *  - "ConstrainedText"   → kind=text   (CLI runtime treats text as long-form string)
 *  - "boolean"           → kind=boolean
 *  - "integer"           → kind=integer
 *  - "float"             → kind=number
 *  - "ISO8601"           → kind=datetime
 *  - "StableID"          → kind=string
 *  - "SemVer"            → kind=string
 *  - 'Enum["a","b",...]' → kind=enum + enum_values
 *  - "T[]"               → kind=list  + item_field of inner T
 *  - "StructField[X][]"  → kind=list  + item_field { kind=struct, struct_id=X }
 *  - "StructField[X]"    → kind=struct + struct_id=X
 */
export function parseLegacyType(
  spec: string,
  ownerId: string,
  fieldName: string,
  _inlineStructs: InlineStructDef[],
): ParsedLegacy {
  const fail = (msg: string): never => {
    throw new FDPMException(
      "verification",
      `legacy_type at ${ownerId}.${fieldName}: ${msg} (got "${spec}")`,
    );
  };

  // Enum["a", "b"] (also tolerate single-quoted variants from Python)
  const enumMatch = /^Enum\[(.*)\]$/.exec(spec);
  if (enumMatch) {
    const inner = enumMatch[1]!;
    const values = inner
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);
    if (values.length === 0) fail("empty Enum[...]");
    return { kind: "enum", enum_values: values };
  }

  // T[]
  if (spec.endsWith("[]")) {
    const inner = spec.slice(0, -2);
    // StructField[X][]
    const structMatch = /^StructField\[(.+)\]$/.exec(inner);
    if (structMatch) {
      const structId = structMatch[1]!;
      return {
        kind: "list",
        item_field: {
          name: "_item",
          kind: "struct",
          required: true,
          struct_id: structId,
          validations: [],
        },
      };
    }
    const itemKind = simpleKindOf(inner);
    if (!itemKind) fail(`unsupported item type "${inner}" in T[]`);
    return {
      kind: "list",
      item_field: {
        name: "_item",
        kind: itemKind!,
        required: true,
        validations: [],
      },
    };
  }

  // StructField[X]
  const structOnly = /^StructField\[(.+)\]$/.exec(spec);
  if (structOnly) {
    return { kind: "struct", struct_id: structOnly[1]! };
  }

  const simple = simpleKindOf(spec);
  if (simple) return { kind: simple };

  return fail("unknown spec");
}

function simpleKindOf(spec: string): FieldDefT["kind"] | null {
  switch (spec) {
    case "string":
    case "StableID":
    case "SemVer":
      return "string";
    case "ConstrainedText":
      return "text";
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "float":
      return "number";
    case "ISO8601":
      return "datetime";
    default:
      return null;
  }
}
