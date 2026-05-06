import type { z } from "zod";
import type { Finding, ValidatorFn } from "./types.js";
import { BridgeError, getArrayElement, getChecks, getObjectShape, isRecursive, unwrap } from "./walker.js";

export interface ZodSchemaToValidatorOptions {
  pluginId: string;
  typeName: string;
}

export interface ZodSchemaToValidatorResult {
  validator: ValidatorFn;
  ruleIds: string[];
}

export function zodSchemaToValidator(
  schema: z.ZodObject<z.ZodRawShape>,
  opts: ZodSchemaToValidatorOptions,
): ZodSchemaToValidatorResult {
  const ruleIds = enumerateRuleIds(schema, opts);
  const validator: ValidatorFn = (target) => {
    const result = schema.safeParse(target.field_values);
    if (result.success) return [];
    const findings: Finding[] = [];
    for (const issue of result.error.issues) {
      const pathSegment = issue.path.length > 0 ? `.${issue.path.map(String).join(".")}` : "";
      const ruleId = `${opts.pluginId}:zod.${opts.typeName}.${issue.code}${pathSegment}`;
      const evidence: Record<string, unknown> = { zod_code: issue.code };
      const issueAsRec = issue as unknown as Record<string, unknown>;
      if ("expected" in issueAsRec) evidence.expected = issueAsRec.expected;
      if ("received" in issueAsRec) evidence.received = issueAsRec.received;
      if ("minimum" in issueAsRec) evidence.minimum = issueAsRec.minimum;
      if ("maximum" in issueAsRec) evidence.maximum = issueAsRec.maximum;
      if ("values" in issueAsRec) evidence.values = issueAsRec.values;
      findings.push({
        rule_id: ruleId,
        level: "error",
        path: ["field_values", ...issue.path.map(String)],
        message: issue.message,
        evidence,
      });
    }
    return findings;
  };
  return { validator, ruleIds };
}

/**
 * Enumerate the closed set of rule_ids the derived validator may emit.
 * The set is computed by walking the schema's _def at build time:
 *   <plugin-id>:zod.<type>.<code>[.<path>]
 * Always includes the universal codes (`invalid_type`, `unrecognized_keys`)
 * plus per-check codes derived from the schema's structure.
 */
export function enumerateRuleIds(
  schema: z.ZodType,
  opts: ZodSchemaToValidatorOptions,
): string[] {
  const codes = new Set<string>();
  // Universal issues that any safeParse can emit.
  codes.add("invalid_type");
  codes.add("unrecognized_keys");

  walkForCodes(schema, [], (code, pathParts) => {
    const path = pathParts.length > 0 ? `.${pathParts.join(".")}` : "";
    codes.add(`${code}${path}`);
  });

  return Array.from(codes)
    .sort()
    .map((c) => `${opts.pluginId}:zod.${opts.typeName}.${c}`);
}

function walkForCodes(
  schema: z.ZodType,
  pathParts: string[],
  emit: (code: string, pathParts: string[]) => void,
  depth = 0,
): void {
  if (depth > 16) return;
  const u = unwrap(schema);
  const inner = u.inner;

  if (u.optional || u.nullable) {
    // optional/nullable does not itself introduce codes.
  }

  if (isRecursive(inner)) {
    return;
  }

  if (u.type === "string") {
    emit("invalid_type", pathParts);
    for (const c of getChecks(inner)) {
      if (c.check === "min_length") emit("too_small", pathParts);
      else if (c.check === "max_length") emit("too_big", pathParts);
      else if (c.check === "length_equals") emit("invalid_length", pathParts);
      else if (c.check === "string_format") emit("invalid_format", pathParts);
    }
  } else if (u.type === "number" || u.type === "int") {
    emit("invalid_type", pathParts);
    for (const c of getChecks(inner)) {
      if (c.check === "greater_than") emit("too_small", pathParts);
      else if (c.check === "less_than") emit("too_big", pathParts);
      else if (c.check === "multiple_of") emit("not_multiple_of", pathParts);
      else if (c.check === "number_format") emit("invalid_format", pathParts);
    }
  } else if (u.type === "boolean") {
    emit("invalid_type", pathParts);
  } else if (u.type === "enum") {
    emit("invalid_value", pathParts);
  } else if (u.type === "literal") {
    emit("invalid_value", pathParts);
  } else if (u.type === "array") {
    emit("invalid_type", pathParts);
    for (const c of getChecks(inner)) {
      if (c.check === "min_length") emit("too_small", pathParts);
      else if (c.check === "max_length") emit("too_big", pathParts);
    }
    const element = getArrayElement(inner);
    if (element) walkForCodes(element, pathParts, emit, depth + 1);
  } else if (u.type === "object") {
    const shape = getObjectShape(inner);
    if (shape) {
      for (const [k, v] of Object.entries(shape)) {
        walkForCodes(v, [...pathParts, k], emit, depth + 1);
      }
    }
  }

  // .refine emits 'custom' at the path it was attached to.
  // Without parsing the refinement function we conservatively add 'custom' for
  // any object-level schema that has refinements via its checks list.
  const refinementChecks = getChecks(inner).filter((c) => c.check === "custom" || c.check === "refine");
  if (refinementChecks.length > 0) {
    emit("custom", pathParts);
  }
}

export { BridgeError };
