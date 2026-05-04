import { z } from "zod";
import { CORE_ID_PATTERN } from "../identity/id-rules.js";
import { ULID_PATTERN, UID_LENGTH } from "../identity/uid.js";
import { OPERATION_KINDS } from "./kinds.js";

/**
 * §5.5.2 Per-kind payload schemas. The verification gate (§8) validates
 * each operation's payload against its kind's schema before append.
 *
 * Payload schemas are versioned via Operation.schema_version so future
 * SPEC bumps can ship upcasters without rewriting the log.
 */

const NamespacedId = z.string().regex(CORE_ID_PATTERN);
const InstanceId = z.string().min(1).max(256);
const ProjectId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const Uid = z.string().length(UID_LENGTH).regex(ULID_PATTERN);

const FieldValuesPayload = z.record(z.unknown());

const JsonPatchOp = z
  .object({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string(),
    value: z.unknown().optional(),
    from: z.string().optional(),
  })
  .strict();

export const ProjectCreatePayload = z
  .object({
    project_id: ProjectId,
    name: z.string().min(1),
    profile_id: NamespacedId,
    description: z.string().optional(),
    cloned_from: ProjectId.optional(),
  })
  .strict();

export const ProjectDeletePayload = z
  .object({
    project_id: ProjectId,
  })
  .strict();

export const ProjectSplitPayload = z
  .object({
    partition: z
      .array(
        z.object({
          target_project_id: ProjectId,
          target_project_name: z.string().min(1),
          sections: z.array(InstanceId).min(1),
        }),
      )
      .min(2),
    cross_partition_relations: z.literal("drop"),
    include_unassigned: z.enum(["first", "last", "none"]).default("first"),
  })
  .strict();

export const ProjectClonePayload = z
  .object({
    target_project_id: ProjectId,
    target_project_name: z.string().min(1),
  })
  .strict();

export const PrimitiveCreatePayload = z
  .object({
    id: InstanceId,
    uid: Uid,
    type_id: NamespacedId,
    field_values: FieldValuesPayload,
    scope_id: NamespacedId.optional(),
  })
  .strict();

export const PrimitiveReplacePayload = z
  .object({
    id: InstanceId,
    type_id: NamespacedId,
    field_values: FieldValuesPayload,
    scope_id: NamespacedId.optional(),
  })
  .strict();

export const PrimitivePatchPayload = z
  .object({
    id: InstanceId,
    field_values: FieldValuesPayload,
    scope_id: NamespacedId.optional(),
  })
  .strict();

export const PrimitiveFieldPatchPayload = z
  .object({
    id: InstanceId,
    operations: z.array(JsonPatchOp).min(1),
  })
  .strict();

export const PrimitiveDeletePayload = z
  .object({
    id: InstanceId,
  })
  .strict();

export const RelationCreatePayload = z
  .object({
    id: InstanceId,
    uid: Uid,
    type_id: NamespacedId,
    source_id: InstanceId,
    target_id: InstanceId,
    field_values: FieldValuesPayload.default({}),
  })
  .strict();

export const RelationReplacePayload = z
  .object({
    id: InstanceId,
    type_id: NamespacedId,
    field_values: FieldValuesPayload,
  })
  .strict();

export const RelationPatchPayload = z
  .object({
    id: InstanceId,
    field_values: FieldValuesPayload,
  })
  .strict();

export const RelationFieldPatchPayload = z
  .object({
    id: InstanceId,
    operations: z.array(JsonPatchOp).min(1),
  })
  .strict();

export const RelationDeletePayload = z
  .object({
    id: InstanceId,
  })
  .strict();

export const StructureReorderPayload = z
  .object({
    scope_id: NamespacedId,
    ordering: z.array(InstanceId).min(0),
  })
  .strict();

export const StructureReparentPayload = z
  .object({
    primitive_id: InstanceId,
    from_scope_id: NamespacedId,
    to_scope_id: NamespacedId,
    position: z.number().int().nonnegative().optional(),
  })
  .strict();

export const TemplateCreatePayload = z
  .object({
    template: z
      .object({
        id: z.string().min(1),
        label: z.string(),
        primitives: z.array(z.unknown()),
        relations: z.array(z.unknown()),
        description: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const TemplateDeletePayload = z.object({ template_id: z.string() }).strict();

export const TemplateApplyPayload = z
  .object({
    template_id: z.string(),
    id_prefix: z.string().optional(),
  })
  .strict();

export const TestSuiteCreatePayload = z
  .object({
    suite: z.unknown(),
  })
  .strict();

export const TestSuiteReplacePayload = z
  .object({
    suite_id: z.string(),
    suite: z.unknown(),
  })
  .strict();

export const TestSuiteDeletePayload = z
  .object({ suite_id: z.string() })
  .strict();

export const TransferImportPayload = z
  .object({
    transfer: z.unknown(),
  })
  .strict();

export const PAYLOAD_SCHEMAS: Record<(typeof OPERATION_KINDS)[number], z.ZodTypeAny> = {
  "project.create": ProjectCreatePayload,
  "project.delete": ProjectDeletePayload,
  "project.split": ProjectSplitPayload,
  "project.clone": ProjectClonePayload,
  "primitive.create": PrimitiveCreatePayload,
  "primitive.replace": PrimitiveReplacePayload,
  "primitive.patch": PrimitivePatchPayload,
  "primitive.field-patch": PrimitiveFieldPatchPayload,
  "primitive.delete": PrimitiveDeletePayload,
  "relation.create": RelationCreatePayload,
  "relation.replace": RelationReplacePayload,
  "relation.patch": RelationPatchPayload,
  "relation.field-patch": RelationFieldPatchPayload,
  "relation.delete": RelationDeletePayload,
  "structure.reorder": StructureReorderPayload,
  "structure.reparent": StructureReparentPayload,
  "template.create": TemplateCreatePayload,
  "template.delete": TemplateDeletePayload,
  "template.apply": TemplateApplyPayload,
  "test_suite.create": TestSuiteCreatePayload,
  "test_suite.replace": TestSuiteReplacePayload,
  "test_suite.delete": TestSuiteDeletePayload,
  "transfer.import": TransferImportPayload,
};

export const CURRENT_PAYLOAD_SCHEMA_VERSION = "1.2.0";
