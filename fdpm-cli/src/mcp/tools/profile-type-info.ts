/**
 * `fdpm.profile.type_info` — Tier 1 (read-only).
 *
 * Returns the *minimum sufficient* knowledge an LLM needs to construct
 * a valid primitive or relation of a given type within a profile:
 * the id_pattern, the field list (name, kind, required, enum_values),
 * the constraints, and the basic flags (scoped, partition_unit, etc).
 *
 * Why this exists: composed DomainProfiles can run to ~66 KB. Calling
 * `fdpm.profile.get` to discover that `spec:Requirement` IDs must
 * match `^spec:req:\d+$` is a heavy round-trip. This tool returns
 * ~1-2 KB of structured contract data scoped to one type — small
 * enough to fit comfortably in any LLM context budget.
 *
 * Resolved (not raw) profile is the right read here: a composed
 * profile inherits types from its parents, and the LLM cares about
 * the type as it will actually be applied at validation time.
 *
 * Lookup is by `type_id` against both `primitive_types` and
 * `relation_types` (LLM may not know which kind a type is). The
 * response carries `kind: "primitive" | "relation"` so callers can
 * branch.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";

const Input = z
  .object({
    profile_id: z.string().min(1),
    type_id: z
      .string()
      .min(1)
      .describe(
        "Namespaced type id, e.g. `spec:Requirement` or `spec:HasSection`. Searched against both primitive_types and relation_types.",
      ),
  })
  .strict();

const PrimitiveTypeInfo = z
  .object({
    kind: z.literal("primitive"),
    type_id: z.string(),
    name: z.string().optional(),
    category_id: z.string().optional(),
    description: z.string().optional(),
    id_pattern: z.string().describe("Regex (or template) the instance id MUST match."),
    id_uniqueness: z.enum(["global", "workbook", "per_scope", "per_parent"]),
    scoped: z.boolean(),
    is_partition_unit: z.boolean(),
    fields: z
      .array(z.unknown())
      .describe(
        "FieldDef[]. Each entry: { name, kind?, required, enum_values?, item_field?, struct_id?, ref_type_id?, validations[], description?, default?, legacy_type? }.",
      ),
    required_field_names: z.array(z.string()),
    constraints: z.array(z.unknown()),
  })
  .strict();

const RelationTypeInfo = z
  .object({
    kind: z.literal("relation"),
    type_id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    source_type_id: z.string().optional(),
    target_type_id: z.string().optional(),
    source_types: z.union([z.array(z.string()), z.literal("*")]).optional(),
    target_types: z.union([z.array(z.string()), z.literal("*")]).optional(),
    cardinality: z.string().optional(),
    symmetric: z.boolean(),
    transitive: z.boolean(),
    fields: z
      .array(z.unknown())
      .describe("FieldDef[] for relation metadata fields."),
    required_field_names: z.array(z.string()),
  })
  .strict();

const Output = z.union([PrimitiveTypeInfo, RelationTypeInfo]);

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.type_info",
  tier: "read_only",
  description:
    "Fetch the minimum-sufficient construction contract for a single type within a profile: id_pattern, fields, required_field_names, constraints. Use this BEFORE calling fdpm.primitive.create / fdpm.relation.create to discover the exact id format and required fields. Resolves the profile's extends chain. Throws not_found if the profile or type id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    // Resolved profile: inherits types from parents via the extends chain.
    const profile = host.profiles.getResolved(args.profile_id);

    const primitive = profile.primitive_types.find((t) => t.id === args.type_id);
    if (primitive) {
      const requiredFieldNames = primitive.fields
        .filter((f) => f.required)
        .map((f) => f.name);
      return {
        kind: "primitive" as const,
        type_id: primitive.id,
        ...(primitive.name !== undefined ? { name: primitive.name } : {}),
        ...(primitive.category_id !== undefined
          ? { category_id: primitive.category_id }
          : primitive.category !== undefined
            ? { category_id: primitive.category }
            : {}),
        ...(primitive.description !== undefined
          ? { description: primitive.description }
          : {}),
        id_pattern: primitive.id_format.pattern,
        id_uniqueness: primitive.id_format.uniqueness,
        scoped: primitive.scoped,
        is_partition_unit: primitive.is_partition_unit,
        fields: primitive.fields,
        required_field_names: requiredFieldNames,
        constraints: primitive.constraints,
      };
    }

    const relation = profile.relation_types.find((t) => t.id === args.type_id);
    if (relation) {
      const fields = relation.fields ?? relation.metadata_schema ?? [];
      const requiredFieldNames = fields
        .filter((f) => f.required)
        .map((f) => f.name);
      return {
        kind: "relation" as const,
        type_id: relation.id,
        ...(relation.name !== undefined ? { name: relation.name } : {}),
        ...(relation.description !== undefined
          ? { description: relation.description }
          : {}),
        ...(relation.source_type_id !== undefined
          ? { source_type_id: relation.source_type_id }
          : {}),
        ...(relation.target_type_id !== undefined
          ? { target_type_id: relation.target_type_id }
          : {}),
        ...(relation.source_types !== undefined
          ? { source_types: relation.source_types }
          : {}),
        ...(relation.target_types !== undefined
          ? { target_types: relation.target_types }
          : {}),
        ...(relation.cardinality !== undefined
          ? { cardinality: relation.cardinality }
          : {}),
        symmetric: relation.symmetric,
        transitive: relation.transitive,
        fields,
        required_field_names: requiredFieldNames,
      };
    }

    throw new FDPMException(
      "not_found",
      `type not found in profile: ${args.type_id}`,
      {
        evidence: {
          profile_id: args.profile_id,
          type_id: args.type_id,
          searched: ["primitive_types", "relation_types"],
        },
      },
    );
  },
};
