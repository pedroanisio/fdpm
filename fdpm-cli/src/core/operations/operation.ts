import { z } from "zod";
import { OperationKind } from "./kinds.js";

/**
 * §5.5.1 Operation — typed, immutable record describing one logical
 * mutation.
 */
export const Operation = z
  .object({
    op_id: z.string().length(26), // ulid
    parent_op_id: z.string().length(26).nullable().optional(),
    kind: OperationKind,
    project_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    payload: z.record(z.unknown()),
    actor: z.string(),
    plugin_id: z.string().nullable().optional(),
    timestamp: z.string().datetime(),
    revision: z.number().int().positive(),
    request_id: z.string(), // uuid v7
    causation_op_id: z.string().length(26).nullable().optional(),
    schema_version: z.string(),
  })
  .strict();
export type Operation = z.infer<typeof Operation>;
