import type {
  PrimitiveTypeDef,
  ProductPageBundle,
  ProductSchemaSummary,
  RelationTypeDef,
} from "./types.js";

export interface BuildProductPageBundleArgs {
  pluginId: string;
  pluginVersion: string;
  profileId: string;
  hostCompatibility: string;
  primitives: readonly PrimitiveTypeDef[];
  relations: readonly RelationTypeDef[];
  schemaSources: Record<string, string>;
  validatorRuleIds: readonly string[];
  /** All known feature flags from the workbook (state snapshot at build time). */
  featureFlagStates: ProductPageBundle["feature_flag_states"];
  /** Any cap:expr-helpers shipped by the plugin (optional, empty for v0.1.0). */
  exprHelpers?: ProductPageBundle["expr_helpers"];
}

export function buildProductPageBundle(
  args: BuildProductPageBundleArgs,
): ProductPageBundle {
  const schemas: ProductSchemaSummary[] = args.primitives.map((p) => {
    const lastSegment = p.id.split(":").pop() ?? p.id;
    return {
      name: lastSegment,
      source_path: args.schemaSources[lastSegment] ?? `<unknown>`,
      primitive_type_id: p.id,
      field_summary: p.fields.map((f) => ({
        name: f.name,
        kind: f.kind,
        required: f.required,
      })),
    };
  });

  return {
    plugin_id: args.pluginId,
    version: args.pluginVersion,
    profile_id: args.profileId,
    host_compatibility: args.hostCompatibility,
    schemas,
    relation_types: args.relations.map((r) => ({
      id: r.id,
      source: r.source_type_id,
      target: r.target_type_id,
      cardinality: r.cardinality,
    })),
    expr_helpers: args.exprHelpers ?? [],
    validator_rule_ids: args.validatorRuleIds,
    feature_flag_states: args.featureFlagStates,
  };
}

/**
 * Default flag-state snapshot, reflecting the workbook howto-zod-to-fdpm-plugin
 * at revision 179. Bridge consumers may override this if they ship a different
 * bridge release with different flag defaults.
 */
export const DEFAULT_FEATURE_FLAG_STATES: ProductPageBundle["feature_flag_states"] = [
  { flag: "flag:scope-server-only", state: "disabled" },
  { flag: "flag:zod-v3-support", state: "disabled" },
  { flag: "flag:auto-migration", state: "disabled" },
  { flag: "flag:zod-cross-field-refine", state: "behind-flag" },
  { flag: "flag:zod-async-refine", state: "disabled" },
  { flag: "flag:zod-discriminated-union", state: "behind-flag" },
  { flag: "flag:zod-intersection", state: "enabled" },
  { flag: "flag:zod-recursive-lazy", state: "behind-flag" },
  { flag: "flag:zod-function-promise", state: "disabled" },
  { flag: "flag:zod-brand", state: "behind-flag" },
  { flag: "flag:zod-regex-flags", state: "behind-flag" },
  { flag: "flag:zod-pipe-transform", state: "behind-flag" },
  { flag: "flag:zod-default", state: "behind-flag" },
];
