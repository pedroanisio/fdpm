import type { z } from "zod";
import { zodSchemaToPrimitiveType } from "./primitive.js";
import {
  buildProductPageBundle,
  DEFAULT_FEATURE_FLAG_STATES,
} from "./product-page.js";
import type {
  AssembleResult,
  BridgeOptions,
  Constraint,
  DomainProfile,
  EnumDef,
  MigrationHints,
  PrimitiveTypeDef,
  RelationTypeDef,
} from "./types.js";
import { zodSchemaToValidator } from "./validator.js";
import { buildViewPageDescriptor } from "./view-page.js";

export interface AssembleArgs {
  schemas: Record<string, z.ZodObject<z.ZodRawShape>>;
  options: BridgeOptions;
  schemaSources?: Record<string, string>;
  pluginId: string;
  /** Override the build-time clock (used by tests for deterministic output). */
  generatedAt?: string;
}

export function assembleDomainProfile(args: AssembleArgs): AssembleResult {
  const { schemas, options, pluginId } = args;
  const generatedAt = args.generatedAt ?? new Date(0).toISOString();

  const primitives: PrimitiveTypeDef[] = [];
  const relations: RelationTypeDef[] = [];
  const enums: EnumDef[] = [];
  const constraints: Constraint[] = [];
  const ruleIdsByType: Record<string, readonly string[]> = {};
  const allRuleIds = new Set<string>();

  // Iterate in declared key order for determinism.
  for (const [name, schema] of Object.entries(schemas)) {
    const result = zodSchemaToPrimitiveType(name, schema, options);
    primitives.push(result.primitive);
    relations.push(...result.relations);
    enums.push(...result.enums);
    constraints.push(...result.constraints);

    const validatorResult = zodSchemaToValidator(schema, {
      pluginId,
      typeName: name.toLowerCase(),
    });
    ruleIdsByType[result.primitive.id] = validatorResult.ruleIds;
    for (const id of validatorResult.ruleIds) allRuleIds.add(id);
  }

  const profile: DomainProfile = {
    id: options.profileId,
    primitive_types: primitives,
    relation_types: relations,
    ...(enums.length ? { enum_defs: enums } : {}),
    ...(constraints.length ? { constraints } : {}),
  };

  const viewPage = buildViewPageDescriptor(pluginId, primitives, options, generatedAt);

  const productPage = buildProductPageBundle({
    pluginId,
    pluginVersion: options.pluginVersion ?? "0.0.0",
    profileId: options.profileId,
    hostCompatibility: options.hostCompatibility ?? "*",
    primitives,
    relations,
    schemaSources: args.schemaSources ?? {},
    validatorRuleIds: Array.from(allRuleIds).sort(),
    featureFlagStates: DEFAULT_FEATURE_FLAG_STATES,
  });

  const migrationHints: MigrationHints = {
    profile_id: options.profileId,
    generated_at: generatedAt,
    steps: [],
  };

  return {
    profile,
    viewPage,
    productPage,
    migrationHints,
    ruleIdsByType,
  };
}
