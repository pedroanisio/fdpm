import type { z } from "zod";

export interface BridgeOptions {
  profileId: string;
  vendor: string;
  recursionDepth?: number;
  unionStrategy?: "variant-per-primitive" | "payload-blob";
  liftMarkers?: WeakSet<z.ZodType>;
  celConstraints?: ReadonlyArray<CelSidecar>;
  viewPageOverrides?: Record<string, Partial<ViewPagePanel>>;
  hostCompatibility?: string;
  pluginVersion?: string;
  /**
   * Schemas in the `schemas` map to force-classify as Entity, beyond
   * those auto-detected via the `{Name}Id` companion convention.
   * Empty/omitted = pure convention detection.
   *
   * Hybrid lift detection landed in v0.2.0 (workbook
   * howto-zod-to-fdpm-plugin §4, Position 3).
   */
  entities?: ReadonlyArray<string>;
}

export interface CelSidecar {
  name: string;
  expression: string;
  level?: "error" | "warning";
  appliesToType?: string;
}

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "list"
  | "struct"
  | "relation";

export interface FieldDef {
  name: string;
  kind: FieldKind;
  required: boolean;
  nullable?: boolean;
  enum_values?: readonly string[];
  item_field?: FieldDef;
  struct_id?: string;
  relation_target_type_id?: string;
  format?: string;
  validations?: readonly ValidationRule[];
  description?: string;
}

export type ValidationRule =
  | { kind: "min_length"; value: number; level?: "error" | "warning" }
  | { kind: "max_length"; value: number; level?: "error" | "warning" }
  | { kind: "regex"; value: string; level?: "error" | "warning" }
  | { kind: "min_value"; value: number; level?: "error" | "warning" }
  | { kind: "max_value"; value: number; level?: "error" | "warning" }
  | { kind: "min_items"; value: number; level?: "error" | "warning" }
  | { kind: "max_items"; value: number; level?: "error" | "warning" };

export interface PrimitiveTypeDef {
  id: string;
  fields: readonly FieldDef[];
  inline_structs?: readonly StructDef[];
  constraints?: readonly Constraint[];
}

export interface StructDef {
  id: string;
  fields: readonly FieldDef[];
}

export interface EnumDef {
  id: string;
  name: string;
  values: readonly string[];
  description: string;
}

export interface RelationTypeDef {
  id: string;
  source_type_id: string;
  target_type_id: string;
  /**
   * One of the four cardinality values per SPEC-FDPM-BRIDGE §8.2.
   * v0.2.0 only emitted "one-to-one"; sidecar emission (v0.3.0+) may
   * emit "many-to-one" for foreign-key references where each source
   * has exactly one target.
   */
  cardinality:
    | "one-to-one"
    | "one-to-many"
    | "many-to-one"
    | "many-to-many";
  /**
   * Per-edge metadata fields (alias for the host's `metadata_schema`).
   * v0.4.0+ emits an empty array on every relation so the host's
   * profile compiler does not crash on `.map()` of undefined. Host
   * runtime accepts either shape; we choose `fields` because it is
   * the CLI-native spelling per SPEC-CORE.
   */
  fields: ReadonlyArray<FieldDef>;
}

export interface Constraint {
  name: string;
  expression: string;
  level: "error" | "warning";
  message?: string;
}

export interface DomainProfile {
  id: string;
  primitive_types: readonly PrimitiveTypeDef[];
  relation_types: readonly RelationTypeDef[];
  enum_defs?: readonly EnumDef[];
  constraints?: readonly Constraint[];
}

export interface Finding {
  rule_id: string;
  level: "error" | "warning" | "info";
  path?: readonly string[];
  message: string;
  evidence?: Record<string, unknown>;
}

export type ValidatorFn = (
  target: { id: string; type_id: string; field_values: Record<string, unknown> },
  ctx?: unknown,
) => Finding[];

export interface ViewPagePanel {
  primitive_type_id: string;
  title: string;
  fields: ViewPageFieldRender[];
}

export interface ViewPageFieldRender {
  name: string;
  kind: FieldKind;
  required: boolean;
  enum_values?: readonly string[];
  list_item_kind?: FieldKind;
  relation_target_type_id?: string;
  visual_hint?: "optional-dim" | "enum-dropdown" | "link";
}

export interface ViewPageDescriptor {
  plugin_id: string;
  generated_at: string;
  panels: ViewPagePanel[];
}

export interface ProductPageBundle {
  plugin_id: string;
  version: string;
  profile_id: string;
  host_compatibility: string;
  schemas: ProductSchemaSummary[];
  relation_types: ReadonlyArray<{
    id: string;
    source: string;
    target: string;
    cardinality: string;
  }>;
  expr_helpers: ReadonlyArray<{
    function_name: string;
    arity: number;
    arg_types: readonly string[];
    return_type: string;
  }>;
  validator_rule_ids: readonly string[];
  feature_flag_states: ReadonlyArray<{
    flag: string;
    state: "disabled" | "behind-flag" | "enabled";
    reason?: string;
  }>;
}

export interface ProductSchemaSummary {
  name: string;
  source_path: string;
  primitive_type_id: string;
  field_summary: ReadonlyArray<{ name: string; kind: FieldKind; required: boolean }>;
}

export interface MigrationHints {
  profile_id: string;
  generated_at: string;
  steps: readonly string[];
}

export interface AssembleResult {
  profile: DomainProfile;
  viewPage: ViewPageDescriptor;
  productPage: ProductPageBundle;
  migrationHints: MigrationHints;
  ruleIdsByType: Record<string, readonly string[]>;
  /**
   * Per-schema classification (Entity vs ValueObject) and
   * advisory candidate-promotion signals. Surfaced to authors so
   * lift decisions are visible without being silent. v0.2.0+.
   */
  audit: import("./classifier.js").AuditLog;
}
