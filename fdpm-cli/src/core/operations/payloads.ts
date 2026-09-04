import { z } from "zod";
import {
  CORE_ID_PATTERN,
  isValidProjectId,
} from "../identity/id-rules.js";
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
const WorkbookId = z.string().refine(isValidProjectId, "invalid workbook id");
const Uid = z.string().length(UID_LENGTH).regex(ULID_PATTERN);

const FieldValuesPayload = z.record(z.string(), z.unknown());

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
    workbook_id: WorkbookId,
    name: z.string().min(1),
    profile_id: NamespacedId,
    /**
     * Profile revision resolved at create time. Optional so logs written
     * before revisions existed still replay; every new create records it.
     */
    profile_version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    description: z.string().optional(),
    cloned_from: WorkbookId.optional(),
  })
  .strict();

/**
 * Rename a workbook or re-describe it. Both fields are optional and at
 * least one MUST be present — an update that changes nothing is a
 * verification error rather than a silent no-op append.
 *
 * `description: null` clears the description; omitting it leaves the
 * stored value alone. The distinction matters because `undefined` and
 * `null` are different intents and JSON only preserves the latter.
 *
 * `profile_id` is deliberately NOT updatable: every primitive and
 * relation in the workbook validates against that profile, so swapping
 * it would invalidate the projection without revalidating a single
 * instance. Re-binding a workbook to another profile is a migration,
 * not an edit.
 */
export const ProjectUpdatePayload = z
  .object({
    workbook_id: WorkbookId,
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .strict()
  .refine((p) => p.name !== undefined || p.description !== undefined, {
    message: "workbook.update requires at least one of name or description",
  });

export const ProjectDeletePayload = z
  .object({
    workbook_id: WorkbookId,
  })
  .strict();

export const ProjectSplitPayload = z
  .object({
    partition: z
      .array(
        z.object({
          target_workbook_id: WorkbookId,
          target_workbook_name: z.string().min(1),
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
    target_workbook_id: WorkbookId,
    target_workbook_name: z.string().min(1),
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
  "workbook.create": ProjectCreatePayload,
  "workbook.update": ProjectUpdatePayload,
  "workbook.delete": ProjectDeletePayload,
  "workbook.split": ProjectSplitPayload,
  "workbook.clone": ProjectClonePayload,
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
