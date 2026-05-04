import { z } from "zod";
import { CORE_ID_PATTERN } from "../identity/id-rules.js";

/**
 * §4 Meta-model — the type system Core uses to describe domains.
 * Fixed by SPEC; a change here is a Core SPEC major bump.
 *
 * v1.1 extension (additive, non-breaking):
 *  - FieldDef.legacy_type — escape-hatch string spec compatible with the
 *    legacy Python plugin format (`"string"`, `"ConstrainedText"`,
 *    `"ISO8601"`, `'Enum["a","b"]'`, `"T[]"`, `"StructField[X][]"`).
 *    When present, a profile compiler materialises `kind` from it before
 *    validation runs. The compiler refuses inconsistent specs.
 *  - PrimitiveTypeDef.name / scoped / constraints — match the Python
 *    meta-model.
 *  - RelationTypeDef.source_types/target_types/cardinality_bounds/
 *    symmetric/transitive/metadata_schema — also from the Python
 *    meta-model. The CLI runtime treats source_types[0]/target_types[0]
 *    as canonical when source_type_id is not supplied.
 *  - DomainProfile.name/templates/scope_sets/default_scope_set/renderers
 *    — Python meta-model parity.
 *  - IDFormatRule.uniqueness — adds "per_scope" and "per_parent".
 *  - IDFormatRule.pattern_kind — distinguishes regex (default) from
 *    interpolation template ("section:{number}").
 *
 * The CLI runtime reads the structured form (`kind`, `cardinality`)
 * preferentially. Legacy-only declarations are compiled by
 * `compileProfile` (see ./compile.ts) before the registry sees them.
 */

export const ValidationLevel = z.enum(["error", "warning", "info"]);
export type ValidationLevel = z.infer<typeof ValidationLevel>;

export const Cardinality = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many",
]);
export type Cardinality = z.infer<typeof Cardinality>;

export const FieldKind = z.enum([
  "string",
  "text",
  "integer",
  "number",
  "boolean",
  "enum",
  "id-ref",
  "list",
  "struct",
  "json",
  "datetime",
]);
export type FieldKind = z.infer<typeof FieldKind>;

const NamespacedId = z.string().regex(CORE_ID_PATTERN, {
  message: "ID must match ^[a-z0-9-]+(:[a-z0-9-]+)+$",
});

/**
 * A loose name pattern used by InlineStructDef.id and a few other places
 * where the Python source writes simple PascalCase / kebab identifiers
 * rather than namespaced ones (e.g. "TensorSpec", "TypeField").
 */
const NameOrNamespacedId = z
  .string()
  .regex(/^([a-z0-9-]+(:[a-z0-9-]+)+|[A-Za-z][A-Za-z0-9_-]*)$/, {
    message: "ID must be namespaced (a:b) or a simple name",
  });

/**
 * FieldValidation.kind is an open string in the Python meta-model
 * (`max_length`, `min_length`, `min_items`, `max_items`, `pattern`,
 * `range`, `references`, `unique_within`, `must_answer`).
 * The CLI runtime evaluates only the rules it understands; unknown
 * rules are stored verbatim and ignored at validation time (warning at
 * profile registration if structured-strict mode is enabled).
 */
export const FieldValidation = z
  .object({
    kind: z.string().min(1),
    value: z.union([
      z.string(),
      z.number(),
      z.array(z.string()),
      z.array(z.number()),
      z.boolean(),
    ]),
    message: z.string().optional(),
    level: ValidationLevel.default("error"),
  })
  .strict();
export type FieldValidation = z.infer<typeof FieldValidation>;

export const FieldDef: z.ZodType<FieldDefT, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      name: z.string().regex(/^[a-z][a-z0-9_]*$/),
      // structured form (CLI native)
      kind: FieldKind.optional(),
      required: z.boolean().default(false),
      enum_values: z.array(z.string()).optional(),
      item_field: FieldDef.optional(),
      struct_id: z.string().optional(),
      ref_type_id: NamespacedId.optional(),
      validations: z.array(FieldValidation).default([]),
      description: z.string().optional(),
      default: z.unknown().optional(),
      // legacy form (Python plugin parity)
      legacy_type: z.string().optional(),
    })
    .strict()
    .superRefine((d, ctx) => {
      // A field MUST declare either kind or legacy_type. The compiler
      // converts legacy_type → kind+companion fields before runtime use.
      if (!d.kind && !d.legacy_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "field requires either kind or legacy_type",
        });
        return;
      }
      if (d.kind === "enum" && (!d.enum_values || d.enum_values.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "kind=enum requires non-empty enum_values",
        });
      }
      if (d.kind === "list" && !d.item_field) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "kind=list requires item_field",
        });
      }
      if (d.kind === "struct" && !d.struct_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "kind=struct requires struct_id",
        });
      }
      if (d.kind === "id-ref" && !d.ref_type_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "kind=id-ref requires ref_type_id",
        });
      }
    }),
);
export interface FieldDefT {
  name: string;
  kind?: FieldKind;
  required: boolean;
  enum_values?: string[];
  item_field?: FieldDefT;
  struct_id?: string;
  ref_type_id?: string;
  validations: FieldValidation[];
  description?: string;
  default?: unknown;
  legacy_type?: string;
}

export const IDFormatRule = z
  .object({
    pattern: z.string().min(1),
    uniqueness: z
      .enum(["global", "project", "per_scope", "per_parent"])
      .default("project"),
    /** "regex" (CLI native) or "template" (Python source style). */
    pattern_kind: z.enum(["regex", "template"]).default("regex"),
    /** Optional template form (e.g. "section:{number}") used by some tools. */
    template: z.string().optional(),
  })
  .strict();
export type IDFormatRule = z.infer<typeof IDFormatRule>;

export const InlineStructDef = z
  .object({
    /** Either a namespaced id ("fs:TensorSpec") or a simple name ("TensorSpec"). */
    id: NameOrNamespacedId,
    /** Alias for id, retained for the Python-source spelling. */
    name: z.string().optional(),
    fields: z.array(FieldDef).min(1),
    description: z.string().optional(),
  })
  .strict();
export type InlineStructDef = z.infer<typeof InlineStructDef>;

export const TypeConstraint = z
  .object({
    name: z.string(),
    expression: z.string(),
    level: ValidationLevel.default("error"),
    message: z.string(),
  })
  .strict();
export type TypeConstraint = z.infer<typeof TypeConstraint>;

export const PrimitiveTypeDef = z
  .object({
    id: NamespacedId,
    /** Display name (Python parity); falls back to id when omitted. */
    name: z.string().optional(),
    /** Either category_id (CLI native) or category (Python source spelling). */
    category_id: NamespacedId.optional(),
    category: NamespacedId.optional(),
    fields: z.array(FieldDef),
    id_format: IDFormatRule,
    inline_structs: z.array(InlineStructDef).default([]),
    is_partition_unit: z.boolean().default(false),
    /** Python: scoped=True means instances must declare a scope_id. */
    scoped: z.boolean().default(false),
    /** Python: cross-field validation rules. Stored verbatim; not evaluated by Core in v1.1. */
    constraints: z.array(TypeConstraint).default([]),
    description: z.string().optional(),
  })
  .strict();
export type PrimitiveTypeDef = z.infer<typeof PrimitiveTypeDef>;

const TypeIdsOrWildcard = z.union([z.array(NamespacedId), z.literal("*")]);

export const CardinalityBounds = z
  .object({
    source_min: z.number().int().nonnegative().default(0),
    source_max: z.number().int().positive().nullable().default(null),
    target_min: z.number().int().nonnegative().default(0),
    target_max: z.number().int().positive().nullable().default(null),
  })
  .strict();
export type CardinalityBounds = z.infer<typeof CardinalityBounds>;

export const RelationTypeDef = z
  .object({
    id: NamespacedId,
    /** Display name (Python parity). */
    name: z.string().optional(),
    /**
     * CLI native: a single typed source/target. The Python source uses
     * `source_types`/`target_types` as a list (or "*"); when only the
     * list form is supplied, the runtime treats list[0] as canonical.
     */
    source_type_id: NamespacedId.optional(),
    target_type_id: NamespacedId.optional(),
    source_types: TypeIdsOrWildcard.optional(),
    target_types: TypeIdsOrWildcard.optional(),
    /** Enum form (CLI native). */
    cardinality: Cardinality.optional(),
    /** Bounds form (Python source). */
    cardinality_bounds: CardinalityBounds.optional(),
    fields: z.array(FieldDef).default([]),
    /** Python: metadata_schema is the Python field name. Alias for fields. */
    metadata_schema: z.array(FieldDef).optional(),
    symmetric: z.boolean().default(false),
    transitive: z.boolean().default(false),
    description: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const hasSrcId = !!d.source_type_id;
    const hasSrcList = !!d.source_types;
    if (!hasSrcId && !hasSrcList)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RelationTypeDef requires source_type_id or source_types",
      });
    const hasTgtId = !!d.target_type_id;
    const hasTgtList = !!d.target_types;
    if (!hasTgtId && !hasTgtList)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RelationTypeDef requires target_type_id or target_types",
      });
  });
export type RelationTypeDef = z.infer<typeof RelationTypeDef>;

export const CategoryDef = z
  .object({
    id: NamespacedId,
    /** Either label (CLI native) or name (Python source spelling). */
    label: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.label && !d.name)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CategoryDef requires label or name",
      });
  });
export type CategoryDef = z.infer<typeof CategoryDef>;

export const ScopeDef = z
  .object({
    id: NamespacedId,
    label: z.string().optional(),
    name: z.string().optional(),
    rank: z.number().int(),
    description: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.label && !d.name)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ScopeDef requires label or name",
      });
  });
export type ScopeDef = z.infer<typeof ScopeDef>;

export const ValidationRuleDef = z
  .object({
    id: NamespacedId,
    name: z.string().optional(),
    /** Either targets (CLI native) or applies_to (Python source spelling). */
    targets: z.array(NamespacedId).optional(),
    applies_to: z.array(NamespacedId).optional(),
    level: ValidationLevel,
    /** Either expression (CLI native) or predicate (Python source spelling). */
    expression: z.string().optional(),
    predicate: z.string().optional(),
    message: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.targets && !d.applies_to)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ValidationRuleDef requires targets or applies_to",
      });
    if (!d.expression && !d.predicate)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ValidationRuleDef requires expression or predicate",
      });
  });
export type ValidationRuleDef = z.infer<typeof ValidationRuleDef>;

/**
 * RendererBinding has two compatible shapes:
 *   - CLI native: { primitive_type_id, target, template? }
 *   - Python source: { renderer_id, name, output_format, output_path, description? }
 * Both are accepted; both kept verbatim. The CLI itself uses the native
 * form; renderers shipped via `cap:renderer` use the Python form.
 */
export const RendererBinding = z
  .object({
    primitive_type_id: NamespacedId.optional(),
    target: z.string().optional(),
    template: z.string().optional(),
    renderer_id: z.string().optional(),
    name: z.string().optional(),
    output_format: z.string().optional(),
    output_path: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const hasNative = !!d.primitive_type_id && !!d.target;
    const hasPython = !!d.renderer_id;
    if (!hasNative && !hasPython)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RendererBinding requires (primitive_type_id+target) or renderer_id",
      });
  });
export type RendererBinding = z.infer<typeof RendererBinding>;

export const RenderingRules = z
  .object({
    voice: z.enum(["active", "passive"]).default("active"),
    tense: z.enum(["present", "past"]).default("present"),
    person: z.enum(["second", "third"]).default("third"),
    max_section_depth: z.number().int().positive().default(3),
    include_metadata: z.boolean().default(false),
    language: z.string().default("en"),
  })
  .strict();
export type RenderingRules = z.infer<typeof RenderingRules>;

export const TemplateDef = z
  .object({
    id: NamespacedId,
    name: z.string().optional(),
    description: z.string().optional(),
    rendering_rules: RenderingRules.default({}),
    target_renderer: z.string().default("markdown"),
  })
  .strict();
export type TemplateDef = z.infer<typeof TemplateDef>;

export const DomainProfile = z
  .object({
    id: NamespacedId,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    label: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    extends: z.array(NamespacedId).default([]),
    categories: z.array(CategoryDef).default([]),
    scopes: z.array(ScopeDef).default([]),
    primitive_types: z.array(PrimitiveTypeDef).default([]),
    relation_types: z.array(RelationTypeDef).default([]),
    validation_rules: z.array(ValidationRuleDef).default([]),
    /** CLI native renderer bindings (per-primitive-type). */
    renderer_bindings: z.array(RendererBinding).default([]),
    /** Python parity: alias for renderer_bindings using the renderer_id form. */
    renderers: z.array(RendererBinding).default([]),
    inline_structs: z.array(InlineStructDef).default([]),
    templates: z.array(TemplateDef).default([]),
    scope_sets: z.record(z.array(NamespacedId)).default({}),
    default_scope_set: z.string().default(""),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.label && !d.name)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DomainProfile requires label or name",
      });
  });
export type DomainProfile = z.infer<typeof DomainProfile>;
