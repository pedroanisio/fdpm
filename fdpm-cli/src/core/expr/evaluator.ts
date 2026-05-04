import type {
  PrimitiveInstance,
  RelationInstance,
} from "../models/instance.js";
import type { PrimitiveTypeDef, DomainProfile } from "../models/meta.js";
import {
  defaultExpressionRuntime,
  type ValidationEvaluationOptions,
} from "./runtime.js";

export function evaluateCEL(
  expression: string,
  instance: PrimitiveInstance,
  type: PrimitiveTypeDef,
  profile: DomainProfile,
  relations: readonly RelationInstance[],
  rule_id?: string,
  options?: ValidationEvaluationOptions,
): boolean {
  return defaultExpressionRuntime.evaluateValidationCEL(
    expression,
    instance,
    type,
    profile,
    relations,
    rule_id,
    options,
  );
}
