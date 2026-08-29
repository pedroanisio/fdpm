/**
 * The verification layer that closes the flattening loss.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * WHY THIS FILE EXISTS. `primitives.ts` flattens the contract's six
 * discriminated unions onto a discriminator enum plus the union of the
 * arms' fields, every arm-specific field optional — because a union in
 * field position is otherwise an opaque blob nothing can address. The
 * flattening is lossy in exactly one direction: the PROFILE now permits
 * a record the CONTRACT would reject. A `lf:VariableBinding` with
 * `source_kind: "carried"` and a `source_path` set is structurally legal
 * against the profile and meaningless against the schema.
 *
 * So every arm rule the flattening dropped is re-asserted here, and the
 * host runs these on every write. Two kinds of check appear:
 *
 *   - Where the flattened shape is IDENTICAL to a contract schema
 *     (`lf:ToolGrant`), the contract's own Zod schema is run over the
 *     field values. No restatement, no drift.
 *   - Where the flattening renamed or serialized fields, the arm rules
 *     are restated in code, each one citing the contract rule it mirrors.
 *     A restatement can drift from its source, so each is covered by a
 *     test that feeds it the malformed record it exists to reject.
 *
 * What this layer does NOT do is re-check what the profile already
 * enforces — required fields, enum membership, ranges. The host's §7
 * pipeline does that from the PrimitiveTypeDefs. Duplicating it here
 * would produce two findings for one defect.
 */
import type { PrimitiveInstance, ValidationFinding } from "../../src/core/models/instance.js";
import type { ValidatorFn, ValidatorRegistration } from "../../src/plugin/types.js";
import { ToolGrantSchema } from "./schemas/loop-forward.js";
import { T } from "./ids.js";

const RULE = {
  bindingArm: "lf:val:binding-source-arm",
  contractArm: "lf:val:output-contract-arm",
  validatorArm: "lf:val:output-validator-arm",
  stopArm: "lf:val:stop-condition-arm",
  carryArm: "lf:val:carry-consistency",
  variableArm: "lf:val:variable-enum-consistency",
  grantZod: "lf:val:tool-grant-zod",
  exampleArm: "lf:val:example-reason",
} as const;

function finding(
  ruleId: string,
  instance: PrimitiveInstance,
  field: string | null,
  message: string,
): ValidationFinding {
  return {
    level: "error",
    rule_id: ruleId,
    target_id: instance.id,
    field_path: field === null ? null : `field_values.${field}`,
    message,
  };
}

const has = (instance: PrimitiveInstance, field: string): boolean =>
  Object.hasOwn(instance.field_values, field) && instance.field_values[field] !== undefined;

/**
 * Assert that exactly the fields belonging to the declared arm are
 * present, and no others.
 *
 * `discriminator` names the enum field; `arms` maps each value to the
 * fields that arm may carry. A field listed under no arm is unconstrained
 * (it belongs to every arm) and is not policed here.
 */
function checkArms(
  ruleId: string,
  instance: PrimitiveInstance,
  discriminator: string,
  arms: Readonly<Record<string, readonly string[]>>,
  required: Readonly<Record<string, readonly string[]>> = {},
): ValidationFinding[] {
  const value = instance.field_values[discriminator];
  if (typeof value !== "string") return [];
  const permitted = arms[value];
  if (permitted === undefined) return [];

  const findings: ValidationFinding[] = [];
  const owned = new Set(Object.values(arms).flat());

  for (const field of owned) {
    if (!has(instance, field)) continue;
    if (!permitted.includes(field)) {
      findings.push(
        finding(
          ruleId,
          instance,
          field,
          `"${field}" belongs to another ${discriminator} arm; ${discriminator} is "${value}", which carries ${permitted.length === 0 ? "no arm-specific field" : permitted.join(", ")}.`,
        ),
      );
    }
  }
  for (const field of required[value] ?? []) {
    if (!has(instance, field)) {
      findings.push(
        finding(
          ruleId,
          instance,
          field,
          `${discriminator} "${value}" requires "${field}".`,
        ),
      );
    }
  }
  return findings;
}

/** `BindingSourceSchema` — one arm, one source field. */
export const validateBinding: ValidatorFn = (instance) =>
  checkArms(
    RULE.bindingArm,
    instance as PrimitiveInstance,
    "source_kind",
    {
      literal: ["literal_value"],
      pipeline_input: ["input_name"],
      stage_output: ["source_path"],
      carried: ["carry_name"],
    },
    {
      literal: ["literal_value"],
      pipeline_input: ["input_name"],
      stage_output: ["source_path"],
      carried: ["carry_name"],
    },
  );

/**
 * `OutputContractSchema` — `json_schema` exists only on the json arm, and
 * `max_attempts` only under a retry policy.
 */
export const validateOutputContract: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings = checkArms(
    RULE.contractArm,
    primitive,
    "format",
    { text: [], markdown: [], json: ["json_schema"] },
    { json: ["json_schema"] },
  );
  const onInvalid = primitive.field_values["on_invalid"];
  if (onInvalid === "fail") {
    for (const field of ["max_attempts", "retry_feedback"]) {
      if (has(primitive, field)) {
        findings.push(
          finding(
            RULE.contractArm,
            primitive,
            field,
            `"${field}" applies only to a retry policy; on_invalid is "fail".`,
          ),
        );
      }
    }
  }
  if (onInvalid === "retry" && !has(primitive, "max_attempts")) {
    findings.push(
      finding(RULE.contractArm, primitive, "max_attempts", "A retry policy must declare max_attempts."),
    );
  }
  // The contract's json arm additionally requires the schema root to be
  // an object that closes itself and declares at least one property.
  // That rule protects every downstream pointer, so it is re-checked.
  if (primitive.field_values["format"] === "json") {
    const raw = primitive.field_values["json_schema"];
    if (typeof raw === "string") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        findings.push(
          finding(RULE.contractArm, primitive, "json_schema", "json_schema is not parseable JSON."),
        );
        return findings;
      }
      const root = parsed as Record<string, unknown> | null;
      if (root === null || typeof root !== "object" || Array.isArray(root)) {
        findings.push(
          finding(RULE.contractArm, primitive, "json_schema", "json_schema must be an object schema."),
        );
      } else {
        if (root["type"] !== "object") {
          findings.push(
            finding(RULE.contractArm, primitive, "json_schema", "The JSON output root must have type object."),
          );
        }
        if (root["additionalProperties"] !== false) {
          findings.push(
            finding(
              RULE.contractArm,
              primitive,
              "json_schema",
              "The JSON output root must set additionalProperties to false, or a model may add fields no validator inspects.",
            ),
          );
        }
        const properties = root["properties"];
        if (
          properties === null ||
          typeof properties !== "object" ||
          Array.isArray(properties) ||
          Object.keys(properties as Record<string, unknown>).length === 0
        ) {
          findings.push(
            finding(
              RULE.contractArm,
              primitive,
              "json_schema",
              "The JSON output root must declare at least one property.",
            ),
          );
        }
      }
    }
  }
  return findings;
};

/** `OutputValidatorSchema` — regex, range and named carry disjoint fields. */
export const validateOutputValidator: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings = checkArms(
    RULE.validatorArm,
    primitive,
    "kind",
    {
      regex: ["path", "pattern"],
      range: ["path", "min", "max"],
      named: ["validator_name", "args"],
    },
    { regex: ["pattern"], range: ["path"], named: ["validator_name"] },
  );
  if (primitive.field_values["kind"] === "range") {
    const min = primitive.field_values["min"];
    const max = primitive.field_values["max"];
    if (min === undefined && max === undefined) {
      findings.push(finding(RULE.validatorArm, primitive, null, "A range validator requires min or max."));
    }
    if (typeof min === "number" && typeof max === "number" && min > max) {
      findings.push(finding(RULE.validatorArm, primitive, "min", "range min exceeds max."));
    }
  }
  if (primitive.field_values["kind"] === "regex") {
    const pattern = primitive.field_values["pattern"];
    if (typeof pattern === "string") {
      try {
        new RegExp(pattern, "u");
      } catch {
        findings.push(
          finding(
            RULE.validatorArm,
            primitive,
            "pattern",
            "pattern is not a valid ECMAScript regular expression, so this validator can never run.",
          ),
        );
      }
    }
  }
  return findings;
};

/** `StopConditionSchema` — five arms with disjoint fields. */
export const validateStopCondition: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings = checkArms(
    RULE.stopArm,
    primitive,
    "kind",
    {
      output_match: ["pattern"],
      field_equals: ["path", "match_value"],
      field_truthy: ["path"],
      score_threshold: ["path", "comparator", "threshold"],
      unchanged: ["window", "observation_count"],
    },
    {
      output_match: ["pattern"],
      field_equals: ["path", "match_value"],
      field_truthy: ["path"],
      score_threshold: ["path", "comparator", "threshold"],
      unchanged: ["window"],
    },
  );
  // The contract pins `unchanged` to the stagnated state and forbids
  // stagnated anywhere else, so a run's terminal state identifies which
  // rule ended it.
  const kind = primitive.field_values["kind"];
  const terminal = primitive.field_values["terminal_state"];
  if (kind === "unchanged" && terminal !== "stagnated") {
    findings.push(
      finding(RULE.stopArm, primitive, "terminal_state", 'An "unchanged" condition must record terminal_state "stagnated".'),
    );
  }
  if (kind !== "unchanged" && terminal === "stagnated") {
    findings.push(
      finding(
        RULE.stopArm,
        primitive,
        "terminal_state",
        'Only an "unchanged" condition may record terminal_state "stagnated".',
      ),
    );
  }
  if (typeof terminal === "string" && ["exhausted", "failed"].includes(terminal)) {
    findings.push(
      finding(
        RULE.stopArm,
        primitive,
        "terminal_state",
        `"${terminal}" is a runtime outcome, not a declarable stop condition; the contract admits only success, clean_noop, blocked, approval_required and stagnated here.`,
      ),
    );
  }
  return findings;
};

/** `CarrySchema` — append implies string, enum implies enum_values. */
export const validateCarry: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings: ValidationFinding[] = [];
  const valueType = primitive.field_values["value_type"];
  const mode = primitive.field_values["carry_mode"];
  if (mode === "append" && valueType !== "string") {
    findings.push(
      finding(
        RULE.carryArm,
        primitive,
        "carry_mode",
        `An append carry concatenates its captures, so its value_type must be string; this one is "${String(valueType)}".`,
      ),
    );
  }
  if (valueType === "enum" && !has(primitive, "enum_values")) {
    findings.push(finding(RULE.carryArm, primitive, "enum_values", "An enum carry requires enum_values."));
  }
  if (valueType !== "enum" && has(primitive, "enum_values")) {
    findings.push(
      finding(RULE.carryArm, primitive, "enum_values", "enum_values applies only to an enum carry."),
    );
  }
  return findings;
};

/** `VariableSpecSchema` — enum_values and default track the declared type. */
export const validateVariableSpec: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings: ValidationFinding[] = [];
  const type = primitive.field_values["type"];
  if (type === "enum" && !has(primitive, "enum_values")) {
    findings.push(finding(RULE.variableArm, primitive, "enum_values", "An enum variable requires enum_values."));
  }
  if (type !== "enum" && has(primitive, "enum_values")) {
    findings.push(
      finding(RULE.variableArm, primitive, "enum_values", "enum_values applies only to an enum variable."),
    );
  }
  if (has(primitive, "default_value") && primitive.field_values["is_required"] === true) {
    findings.push(
      finding(
        RULE.variableArm,
        primitive,
        "default_value",
        "A variable with a default must set is_required to false; otherwise the default can never apply.",
      ),
    );
  }
  return findings;
};

/**
 * `ToolGrantSchema` for the shape, plus the two approval rules the LIFT
 * moved out of reach.
 *
 * The grant's field shape is identical to its contract schema, so the
 * contract's own parser runs over it verbatim — no restatement, no
 * drift. But the two rules that matter are not on `ToolGrantSchema` at
 * all: the contract states them in `AgentDefinitionSchema.superRefine`,
 * over `value.tool_policy`, because there a grant only ever exists
 * inside an agent.
 *
 * This profile lifts the grant to its own primitive so the authority
 * matrix can address it, and that lift takes the grant out of the scope
 * where its rules were written. Left there, a `financial` grant with
 * `per_run` approval would be accepted by this profile and rejected by
 * the contract. So both rules are restated here, against the grant
 * itself:
 *
 *   - write authority requires per_run or per_action approval;
 *   - any authority beyond read or write requires per_action.
 *
 * This is the clearest case in the plugin of a check that a lift can
 * silently drop, which is why both are covered by failing-input tests.
 */
export const validateToolGrant: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings: ValidationFinding[] = [];

  const result = ToolGrantSchema.safeParse(primitive.field_values);
  if (!result.success) {
    return result.error.issues.map((issue) =>
      finding(
        RULE.grantZod,
        primitive,
        issue.path.length > 0 ? issue.path.map(String).join(".") : null,
        issue.message,
      ),
    );
  }

  const grant = result.data;
  if (grant.authority === "write" && grant.approval === "none") {
    findings.push(
      finding(
        RULE.grantZod,
        primitive,
        "approval",
        "write authority requires per_run or per_action approval.",
      ),
    );
  }
  if (grant.authority !== "read" && grant.authority !== "write" && grant.approval !== "per_action") {
    findings.push(
      finding(
        RULE.grantZod,
        primitive,
        "approval",
        `${grant.authority} authority requires per_action approval; a single run-level approval cannot stand in for every individual action.`,
      ),
    );
  }
  return findings;
};

/** `ExampleExpectationSchema` — a reason belongs to an invalid example. */
export const validateExample: ValidatorFn = (instance) => {
  const primitive = instance as PrimitiveInstance;
  const findings: ValidationFinding[] = [];
  const outcome = primitive.field_values["outcome"];
  if (outcome === "invalid" && !has(primitive, "reason")) {
    findings.push(
      finding(RULE.exampleArm, primitive, "reason", "An example declared invalid must say why."),
    );
  }
  if (outcome === "valid" && has(primitive, "reason")) {
    findings.push(
      finding(RULE.exampleArm, primitive, "reason", "reason applies only to an example declared invalid."),
    );
  }
  return findings;
};

/**
 * Run every applicable validator over one instance.
 *
 * Exported so a caller can verify a record outside the host — the ingest
 * tests use it to prove the layer rejects what the flattening let
 * through.
 */
export function validateInstanceAgainstContract(
  instance: PrimitiveInstance,
): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  for (const registration of ENTITY_VALIDATORS) {
    if (registration.type_id !== instance.type_id) continue;
    const result = registration.fn(instance);
    if (Array.isArray(result)) out.push(...result);
  }
  return out;
}

export const ENTITY_VALIDATORS: ValidatorRegistration[] = [
  { type_id: T.VariableBinding, rule_id: RULE.bindingArm, fn: validateBinding },
  { type_id: T.OutputContract, rule_id: RULE.contractArm, fn: validateOutputContract },
  { type_id: T.OutputValidator, rule_id: RULE.validatorArm, fn: validateOutputValidator },
  { type_id: T.StopCondition, rule_id: RULE.stopArm, fn: validateStopCondition },
  { type_id: T.Carry, rule_id: RULE.carryArm, fn: validateCarry },
  { type_id: T.VariableSpec, rule_id: RULE.variableArm, fn: validateVariableSpec },
  { type_id: T.ToolGrant, rule_id: RULE.grantZod, fn: validateToolGrant },
  { type_id: T.PipelineExample, rule_id: RULE.exampleArm, fn: validateExample },
];
