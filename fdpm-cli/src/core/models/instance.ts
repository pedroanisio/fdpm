import { z } from "zod";
import { CORE_ID_PATTERN } from "../identity/id-rules.js";
import { ValidationLevel } from "./meta.js";
import { UID_LENGTH, ULID_PATTERN } from "../identity/uid.js";

/** §5 Instance model — what a populated project looks like. */

const NamespacedId = z.string().regex(CORE_ID_PATTERN);
const InstanceId = z.string().min(1).max(256);

export const PrimitiveInstance = z
  .object({
    id: InstanceId,
    uid: z.string().length(UID_LENGTH).regex(ULID_PATTERN),
    type_id: NamespacedId,
    field_values: z.record(z.unknown()),
    scope_id: NamespacedId.optional(),
    revision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type PrimitiveInstance = z.infer<typeof PrimitiveInstance>;

export const RelationInstance = z
  .object({
    id: InstanceId,
    uid: z.string().length(UID_LENGTH).regex(ULID_PATTERN),
    type_id: NamespacedId,
    source_id: InstanceId,
    target_id: InstanceId,
    field_values: z.record(z.unknown()).default({}),
    revision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type RelationInstance = z.infer<typeof RelationInstance>;

export const Project = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    profile_id: NamespacedId,
    created_at: z.string().datetime(),
    revision: z.number().int().nonnegative().default(0),
    description: z.string().optional(),
  })
  .strict();
export type Project = z.infer<typeof Project>;

export const ProjectTemplate = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    primitives: z.array(PrimitiveInstance).default([]),
    relations: z.array(RelationInstance).default([]),
    description: z.string().optional(),
  })
  .strict();
export type ProjectTemplate = z.infer<typeof ProjectTemplate>;

export const TestSuiteCheck = z
  .object({
    id: z.string(),
    target_type_id: NamespacedId.optional(),
    expression: z.string(),
    level: ValidationLevel.default("error"),
    message: z.string().optional(),
  })
  .strict();
export type TestSuiteCheck = z.infer<typeof TestSuiteCheck>;

export const TestSuite = z
  .object({
    id: z.string(),
    label: z.string(),
    checks: z.array(TestSuiteCheck).default([]),
    description: z.string().optional(),
  })
  .strict();
export type TestSuite = z.infer<typeof TestSuite>;

export const SuiteRunReport = z
  .object({
    suite_id: z.string(),
    project_id: z.string(),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime(),
    findings: z.array(
      z.object({
        check_id: z.string(),
        level: ValidationLevel,
        target_id: z.string().optional(),
        message: z.string(),
      }),
    ),
    accepted: z.boolean(),
  })
  .strict();
export type SuiteRunReport = z.infer<typeof SuiteRunReport>;

export const ProjectTransfer = z
  .object({
    spec_core: z.string(),
    project: Project,
    primitives: z.array(PrimitiveInstance),
    relations: z.array(RelationInstance),
    templates: z.array(ProjectTemplate).default([]),
    test_suites: z.array(TestSuite).default([]),
  })
  .strict();
export type ProjectTransfer = z.infer<typeof ProjectTransfer>;

export const ValidationFinding = z
  .object({
    level: ValidationLevel,
    rule_id: z.string(),
    target_id: z.string(),
    field_path: z.string().nullable().optional(),
    message: z.string(),
    evidence: z.record(z.unknown()).nullable().optional(),
  })
  .strict();
export type ValidationFinding = z.infer<typeof ValidationFinding>;

export const ValidationReport = z
  .object({
    target_id: z.string(),
    findings: z.array(ValidationFinding),
    accepted: z.boolean(),
  })
  .strict();
export type ValidationReport = z.infer<typeof ValidationReport>;
