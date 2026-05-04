import { z } from "zod";

/**
 * §5.5.1 The closed Operation kind set. Plugins MUST NOT introduce new
 * kinds; adding one is a Core SPEC minor bump.
 */
export const OPERATION_KINDS = [
  "project.create",
  "project.delete",
  "project.split",
  "project.clone",
  "primitive.create",
  "primitive.replace",
  "primitive.patch",
  "primitive.field-patch",
  "primitive.delete",
  "relation.create",
  "relation.replace",
  "relation.patch",
  "relation.field-patch",
  "relation.delete",
  "structure.reorder",
  "structure.reparent",
  "template.create",
  "template.delete",
  "template.apply",
  "test_suite.create",
  "test_suite.replace",
  "test_suite.delete",
  "transfer.import",
] as const;

export const OperationKind = z.enum(OPERATION_KINDS);
export type OperationKind = z.infer<typeof OperationKind>;
