import type {
  DomainProfile,
  PrimitiveTypeDef,
  RelationTypeDef,
  FieldDefT,
  FieldValidation,
  IDFormatRule,
} from "../models/meta.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationFinding,
  ValidationReport,
} from "../models/instance.js";
import type { ProjectStateSlice } from "../store/state.js";
import { parseProfileRef } from "../profile/version.js";
import { CELParseError } from "../expr/errors.js";
import {
  defaultExpressionRuntime,
  type ExpressionRuntime,
} from "../expr/runtime.js";

/**
 * §7 Validation pipeline.
 *
 * Steps:
 *  1. Type resolution
 *  2. ID format check
 *  3. Required-field check
 *  4. Per-field validation
 *  5. Profile-level rule evaluation
 *  6. Custom validator dispatch (zero in CLI v1.1; structure preserved)
 *  7. Aggregation
 *
 * The step list, ordering, and report schema are Core; only step 6's
 * *content* is plugin-supplied. Plugins are not present in the CLI, so
 * step 6 is a no-op — but it stays in the loop so the §17.2 invariant
 * holds even when the runtime gains plugins later.
 */

/**
 * Optional context the host passes to a custom validator, carrying
 * data the validator may need beyond the instance under inspection.
 * Today the only entry is `relations` — needed for predicates like
 * `has_incoming(rel_id)`, `has_outgoing(rel_id)`, `acyclic(rel_id)`.
 *
 * The context is OPTIONAL on the function signature so existing
 * `(instance, type, profile)` validators keep working unchanged.
 */
export interface CustomValidatorContext {
  relations: readonly RelationInstance[];
  workbook?: ProjectStateSlice;
  projectFingerprint?: string;
  permissions?: ReadonlySet<string>;
  locale?: string;
  gitProbeDir?: string;
  git?: {
    sha: string | null;
    branch: string | null;
    dirty: boolean | null;
  };
  osInfo?: {
    os: string | null;
    cpuCount: number | null;
  };
}

export type CustomValidator = (
  instance: PrimitiveInstance | RelationInstance,
  type: PrimitiveTypeDef | RelationTypeDef,
  profile: DomainProfile,
  context?: CustomValidatorContext,
) => ValidationFinding[];

export interface ValidatorRegistration {
  type_id: string;
  rule_id: string;
  fn: CustomValidator;
  /**
   * Profile-ids contributed by the plugin that registered this validator.
   * When set, the validator fires only if the workbook's profile id is in
   * this list OR is reachable via the workbook profile's `extends` chain.
   *
   * Resolved lazily by callers (the plugin context registers a getter so
   * activate() ordering — registerValidator() before registerProfile() —
   * still works).
   *
   * Absent / empty array → unscoped (legacy behaviour, fires on every
   * matching type_id). Core-host registrations leave this unset; plugin
   * registrations set it via the plugin context.
   */
  originating_profile_ids?: () => readonly string[];
}

function findPrimitiveType(
  profile: DomainProfile,
  type_id: string,
): PrimitiveTypeDef | undefined {
  return profile.primitive_types.find((t) => t.id === type_id);
}

function findRelationType(
  profile: DomainProfile,
  type_id: string,
): RelationTypeDef | undefined {
  return profile.relation_types.find((t) => t.id === type_id);
}

/**
 * §4.2 / §7 — compute the set of acceptable endpoint types for a
 * relation. The Python source uses `source_types`/`target_types` (a
 * list, or `"*"` wildcard); the CLI native form is the singleton
 * `source_type_id`/`target_type_id`. The compiler keeps both forms on
 * the record so the validator must check the LIST when present and
 * fall back to the singleton otherwise — collapsing to the singleton
 * silently drops every type after `[0]` and rejects valid relations.
 *
 * Wildcard semantics:
 *  - `source_types: "*"` → accept any primitive type.
 *  - the compiler maps `"*"` to the synthetic singleton `core:any`;
 *    treat `core:any` as wildcard for backward-compat with profiles
 *    compiled before this fix landed.
 */
type EndpointAllowed = { wildcard: true } | { wildcard: false; types: string[] };

function allowedEndpointTypes(
  type: RelationTypeDef,
  endpoint: "source" | "target",
): EndpointAllowed {
  const list =
    endpoint === "source" ? type.source_types : type.target_types;
  const id =
    endpoint === "source" ? type.source_type_id : type.target_type_id;
  if (list === "*") return { wildcard: true };
  if (Array.isArray(list) && list.length > 0) return { wildcard: false, types: list };
  if (id === "core:any") return { wildcard: true };
  if (id) return { wildcard: false, types: [id] };
  // No constraint declared — accept anything (consistent with §4.2 default).
  return { wildcard: true };
}

function endpointTypeMatches(actual: string, allowed: EndpointAllowed): boolean {
  if (allowed.wildcard) return true;
  return allowed.types.includes(actual);
}

function describeEndpointTypes(allowed: EndpointAllowed): string {
  if (allowed.wildcard) return "* (any type)";
  if (allowed.types.length === 1) return allowed.types[0]!;
  if (allowed.types.length <= 6) return `[${allowed.types.join(", ")}]`;
  return `[${allowed.types.slice(0, 6).join(", ")}, ... +${allowed.types.length - 6}]`;
}

function checkIdFormat(id: string, rule: IDFormatRule): ValidationFinding | null {
  // Template form: "section:{number}" → "^section:[^:]+$"
  // Each {placeholder} matches one segment; segment chars exclude ":".
  const regexSource =
    rule.pattern_kind === "template"
      ? "^" +
        rule.pattern
          .replace(/[\\.+*?^$()[\]|]/g, "\\$&")
          .replace(/\{[a-zA-Z_][a-zA-Z0-9_-]*\}/g, "[^:]+") +
        "$"
      : rule.pattern;
  try {
    const re = new RegExp(regexSource);
    if (!re.test(id)) {
      return {
        level: "error",
        rule_id: "core:id-format",
        target_id: id,
        field_path: null,
        message: `id ${id} does not match pattern ${rule.pattern}`,
      };
    }
  } catch {
    return {
      level: "error",
      rule_id: "core:id-format",
      target_id: id,
      field_path: null,
      message: `invalid id-format pattern: ${rule.pattern}`,
    };
  }
  return null;
}

function evaluateFieldValidation(
  fieldName: string,
  value: unknown,
  v: FieldValidation,
  targetId: string,
): ValidationFinding | null {
  const fail = (msg: string): ValidationFinding => ({
    level: v.level,
    rule_id: `core:field:${v.kind}`,
    target_id: targetId,
    field_path: `field_values.${fieldName}`,
    message: v.message ?? msg,
    evidence: { kind: v.kind, value: v.value },
  });

  if (value == null) return null; // required is checked separately
  // FieldValidation.kind is open (the Python source's vocabulary is
  // wider than the CLI's structured set). Unknown kinds are ignored at
  // validation time so that profiles authored under the legacy meta-model
  // load without warnings.
  if (v.kind === "max_length") {
    if (typeof value === "string" && value.length > Number(v.value))
      return fail(`length ${value.length} exceeds max ${v.value}`);
  } else if (v.kind === "min_length") {
    if (typeof value === "string" && value.length < Number(v.value))
      return fail(`length ${value.length} below min ${v.value}`);
  } else if (v.kind === "min_items") {
    if (Array.isArray(value) && value.length < Number(v.value))
      return fail(`array length ${value.length} below min ${v.value}`);
  } else if (v.kind === "max_items") {
    if (Array.isArray(value) && value.length > Number(v.value))
      return fail(`array length ${value.length} above max ${v.value}`);
  } else if (v.kind === "min") {
    if (typeof value === "number" && value < Number(v.value))
      return fail(`value ${value} below min ${v.value}`);
  } else if (v.kind === "max") {
    if (typeof value === "number" && value > Number(v.value))
      return fail(`value ${value} above max ${v.value}`);
  } else if (v.kind === "pattern") {
    if (typeof value === "string") {
      try {
        if (!new RegExp(String(v.value)).test(value))
          return fail(`value does not match pattern ${v.value}`);
      } catch {
        return fail(`invalid pattern ${v.value}`);
      }
    }
  } else if (v.kind === "enum_values") {
    const raw = v.value;
    const allowed: string[] = Array.isArray(raw)
      ? raw.map((x) => String(x))
      : [String(raw)];
    if (!allowed.includes(String(value)))
      return fail(`value not in enum: ${allowed.join(",")}`);
  }
  // required and any other kind: handled elsewhere or ignored.
  return null;
}

/**
 * Resolve `id-ref` fields against the workbook.
 *
 * `kind: "id-ref"` with a mandatory `ref_type_id` has been in the
 * meta-model since the beginning, and `meta.ts` rejects a profile that
 * declares one without the other — but nothing ever resolved the value.
 * A field could name a primitive that did not exist, or one of the wrong
 * type, and the write was accepted.
 *
 * This matters most where n-ary structure is reified. Relations here are
 * strictly binary, so an n-ary rule becomes a primitive plus binary pairs
 * carrying a back-reference, and that back-reference is an `id-ref`.
 * Without this check the reified form is expressible but not safe.
 *
 * Resolution needs the workbook, which is only present on some call
 * paths. When it is absent the check is SKIPPED rather than failed:
 * inventing a "dangling reference" finding because the validator could
 * not see the workbook would reject valid writes.
 */
function checkIdRefs(
  field: FieldDefT,
  value: unknown,
  targetId: string,
  workbook: ProjectStateSlice | undefined,
): ValidationFinding[] {
  if (workbook === undefined) return [];
  if (value == null) return [];

  const refType =
    field.kind === "id-ref"
      ? field.ref_type_id
      : field.kind === "list" && field.item_field?.kind === "id-ref"
        ? field.item_field.ref_type_id
        : undefined;
  if (refType === undefined) return [];

  const findings: ValidationFinding[] = [];
  const check = (raw: unknown, path: string): void => {
    if (raw == null) return;
    if (typeof raw !== "string") {
      findings.push({
        level: "error",
        rule_id: "core:field:id-ref",
        target_id: targetId,
        field_path: path,
        message: `${field.name} must reference a primitive id as a string, got ${typeof raw}`,
      });
      return;
    }
    const referent = workbook.primitives[raw];
    if (referent === undefined) {
      findings.push({
        level: "error",
        rule_id: "core:field:id-ref",
        target_id: targetId,
        field_path: path,
        message: `${field.name} references ${raw}, which names no primitive in this workbook`,
        evidence: { reference: raw, expected_type_id: refType },
      });
      return;
    }
    if (referent.type_id !== refType) {
      findings.push({
        level: "error",
        rule_id: "core:field:id-ref",
        target_id: targetId,
        field_path: path,
        message: `${field.name} must reference a ${refType}, but ${raw} is a ${referent.type_id}`,
        evidence: { reference: raw, expected_type_id: refType, actual_type_id: referent.type_id },
      });
    }
  };

  if (field.kind === "list") {
    if (!Array.isArray(value)) return [];
    // Index the path so a caller can find the offending element rather
    // than re-checking a list by hand.
    value.forEach((el, i) => check(el, `field_values.${field.name}[${i}]`));
  } else {
    check(value, `field_values.${field.name}`);
  }
  return findings;
}

function checkFieldShape(
  field: FieldDefT,
  value: unknown,
  targetId: string,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (value == null) return findings;
  const expectArray = field.kind === "list";
  const expectObject = field.kind === "struct" || field.kind === "json";
  const baseMismatch = (got: string): ValidationFinding => ({
    level: "error",
    rule_id: "core:field:type",
    target_id: targetId,
    field_path: `field_values.${field.name}`,
    message: `field ${field.name} expects ${field.kind}, got ${got}`,
  });
  if (expectArray && !Array.isArray(value)) findings.push(baseMismatch(typeof value));
  else if (expectObject && (typeof value !== "object" || Array.isArray(value)))
    findings.push(baseMismatch(Array.isArray(value) ? "array" : typeof value));
  else if (field.kind === "string" && typeof value !== "string")
    findings.push(baseMismatch(typeof value));
  else if (field.kind === "text" && typeof value !== "string")
    findings.push(baseMismatch(typeof value));
  else if (field.kind === "integer" && (typeof value !== "number" || !Number.isInteger(value)))
    findings.push(baseMismatch(typeof value));
  else if (field.kind === "number" && typeof value !== "number")
    findings.push(baseMismatch(typeof value));
  else if (field.kind === "boolean" && typeof value !== "boolean")
    findings.push(baseMismatch(typeof value));
  else if (field.kind === "enum" && !field.enum_values?.includes(String(value)))
    findings.push({
      level: "error",
      rule_id: "core:field:enum",
      target_id: targetId,
      field_path: `field_values.${field.name}`,
      message: `value not in enum: ${(field.enum_values ?? []).join(",")}`,
    });
  return findings;
}

/**
 * Detect top-level keys present on the instance but not declared on the
 * type schema (#10 — schema-drift surfaces). Emits warning-level
 * findings — informational, do not gate writes. Validation gate behaviour
 * is unchanged because gates only reject on `error`-level findings.
 *
 * `_metadata` is exempted: it is the legacy nested envelope used by the
 * pre-1.1 importer for relations. Surfacing it would create noise on
 * every imported relation; the operator-facing path for cleaning it up
 * is `fdpm migrate normalize-metadata`.
 */
function detectExtraFields(
  targetId: string,
  fieldValues: Record<string, unknown>,
  declaredFields: ReadonlyArray<{ name: string }>,
): ValidationFinding[] {
  const declared = new Set(declaredFields.map((f) => f.name));
  const findings: ValidationFinding[] = [];
  for (const key of Object.keys(fieldValues)) {
    if (declared.has(key)) continue;
    if (key === "_metadata") continue;
    findings.push({
      level: "warning",
      rule_id: "core:field:undeclared",
      target_id: targetId,
      field_path: `field_values.${key}`,
      message: `undeclared field "${key}" — not in type schema; tolerated but not validated`,
      evidence: { kind: "schema_drift" },
    });
  }
  return findings;
}

/**
 * Decide whether a validator registered by some plugin should fire on a
 * write whose target profile is `profile`.
 *
 * Rule: a validator fires iff
 *   (a) it has no originating_profile_ids (legacy/unscoped — typically a
 *       core-host registration), OR
 *   (b) the workbook profile's id is in the originating set, OR
 *   (c) the workbook profile's `extends` chain reaches a profile that is
 *       in the originating set.
 *
 * This stops cross-plugin leakage where two plugins contribute different
 * profiles that share a `cap:profile` namespace prefix (e.g. `acme:`)
 * and therefore declare the same primitive type ids with conflicting
 * Zod-bridge schemas. Without this scoping, every plugin's validators
 * fire on every primitive whose type_id happens to match — producing
 * mutually-incompatible findings on a single write.
 *
 * Note: "extends chain" is read off the resolved DomainProfile that the
 * caller passes in. ProfileRegistry.getResolved() flattens parents into
 * the same object but keeps `extends: [parentIds]` on the resolved
 * profile, so we can walk the chain shallowly. Deeper transitive checks
 * are unnecessary because the resolved profile already carries the full
 * flattened type set; the validator only needs to confirm SOMEONE in
 * the chain owns the type — which is true exactly when an originating
 * profile-id appears in `[profile.id, ...profile.extends]`.
 */
function validatorAppliesToProfile(
  reg: ValidatorRegistration,
  profile: DomainProfile,
): boolean {
  const owners = reg.originating_profile_ids?.();
  if (!owners || owners.length === 0) return true;
  if (owners.includes(profile.id)) return true;
  for (const parent of profile.extends) {
    // `extends` holds profile REFS: `id` or `id@version`. Validator
    // ownership is registered per profile id (a plugin's `activate()`
    // knows its ids, not which revision a composing profile pinned), so
    // the version is stripped before the comparison. Comparing the raw
    // ref silently unscopes every validator from a pinned composition
    // profile, which turns its plugin-evaluated rules back into
    // "predicate not evaluated" info findings.
    if (owners.includes(parseProfileRef(parent).id)) return true;
  }
  return false;
}

export class ValidationPipeline {
  private validators: ValidatorRegistration[] = [];

  constructor(private readonly expr: ExpressionRuntime = defaultExpressionRuntime) {}

  registerValidator(reg: ValidatorRegistration): void {
    this.validators.push(reg);
  }

  runPrimitive(
    instance: PrimitiveInstance,
    profile: DomainProfile,
    context?: CustomValidatorContext,
  ): ValidationReport {
    const findings: ValidationFinding[] = [];
    // Step 1: type resolution
    const type = findPrimitiveType(profile, instance.type_id);
    if (!type) {
      return {
        target_id: instance.id,
        accepted: false,
        findings: [
          {
            level: "error",
            rule_id: "core:type-resolution",
            target_id: instance.id,
            field_path: null,
            message: `unknown primitive type: ${instance.type_id}`,
          },
        ],
      };
    }
    // Step 2: ID format
    const idFinding = checkIdFormat(instance.id, type.id_format);
    if (idFinding) findings.push(idFinding);
    // Step 3: required fields
    for (const f of type.fields) {
      if (f.required && instance.field_values[f.name] === undefined) {
        findings.push({
          level: "error",
          rule_id: "core:field:required",
          target_id: instance.id,
          field_path: `field_values.${f.name}`,
          message: `required field missing: ${f.name}`,
        });
      }
    }
    // Step 4: per-field validation (shape + declared validations)
    for (const f of type.fields) {
      const v = instance.field_values[f.name];
      findings.push(...checkFieldShape(f, v, instance.id));
      findings.push(...checkIdRefs(f, v, instance.id, context?.workbook));
      for (const fv of f.validations) {
        const finding = evaluateFieldValidation(f.name, v, fv, instance.id);
        if (finding) findings.push(finding);
      }
    }
    // Step 4b: schema-drift surfaces (#10). Top-level keys present on the
    // instance but not declared on the type schema are emitted as
    // `warning`-level findings — informational, do not gate writes. The
    // `_metadata` envelope is exempted because it is the legacy import
    // shape for relations (see `migrate normalize-metadata` for cleanup).
    findings.push(...detectExtraFields(instance.id, instance.field_values, type.fields));
    // Step 5: profile-level rules — tag-match only (the CLI v1.1 has no
    // built-in predicate-DSL evaluator). Rules attach as `info` findings
    // to surface the rule's existence without blocking the operation;
    // the rule's *declared* level is preserved on `evidence.declared_level`.
    //
    // EXCEPTION: when a custom validator is registered for the same
    // (type_id, rule_id), step 5 suppresses the info emission for that
    // rule and step 6's validator authoritatively emits the finding at
    // the rule's declared level. This is how plugins replace
    // predicate-only rules with real evaluators without producing
    // duplicate findings (an info + an error for the same logical
    // check).
    const ruleIdsCoveredByValidators = new Set(
      this.validators
        .filter((r) => r.type_id === type.id && validatorAppliesToProfile(r, profile))
        .map((r) => r.rule_id),
    );
    for (const rule of profile.validation_rules) {
      const targets = rule.targets ?? rule.applies_to ?? [];
      if (!targets.includes(type.id)) continue;
      if (ruleIdsCoveredByValidators.has(rule.id)) continue;

      const expr = rule.expression ?? rule.predicate;
      if (!expr) continue;

      try {
        const satisfied = this.expr.evaluateValidationCEL(
          expr,
          instance,
          type,
          profile,
          context?.relations ?? [],
          rule.id,
          {
            workbook: context?.workbook,
            projectFingerprint: context?.projectFingerprint,
            permissions: context?.permissions,
            locale: context?.locale,
            gitProbeDir: context?.gitProbeDir,
            git: context?.git,
            osInfo: context?.osInfo,
          },
        );
        if (!satisfied) {
          findings.push({
            level: rule.level,
            rule_id: rule.id,
            target_id: instance.id,
            field_path: null, // TODO: §9 SHOULD attribution
            message: rule.message ?? `rule ${rule.id} violated`,
            evidence: { predicate: expr },
          });
        }
      } catch (err) {
        if (err instanceof CELParseError) {
          // Step 5 fallback: legacy DSL or unparseable CEL (§4.3)
          findings.push({
            level: "info",
            rule_id: rule.id,
            target_id: instance.id,
            field_path: null,
            message: rule.message ?? `rule ${rule.id} applies (predicate not evaluated)`,
            evidence: {
              declared_level: rule.level,
              predicate: expr,
              parse_error: err.message,
            },
          });
        } else {
          // Step 6-style exception barrier for runtime errors (§7.1).
          //
          // Preserve the rule's own ID so consumers can filter findings
          // by rule. The fact that this finding came from a runtime
          // failure (rather than a satisfied/violated predicate) belongs
          // in `evidence.failure_kind` — synthesizing a fake rule_id
          // (e.g. `plugin-validator-raised:${rule.id}`) confuses the
          // namespace and pretends the rule came from a plugin
          // validator when it actually came from a profile-declared
          // predicate.
          findings.push({
            level: "error",
            rule_id: rule.id,
            target_id: instance.id,
            field_path: null,
            message: "validator raised; see evidence",
            evidence: {
              failure_kind: "predicate-runtime-error",
              error: err instanceof Error ? err.message : String(err),
              predicate: expr,
            },
          });
        }
      }
    }
    // Step 6: custom validators (exception barrier).
    // Profile-scoped: validators registered by plugin P only fire on
    // primitives belonging to a profile P contributes (or one that
    // extends such a profile). See validatorAppliesToProfile().
    for (const v of this.validators.filter(
      (r) => r.type_id === type.id && validatorAppliesToProfile(r, profile),
    )) {
      try {
        findings.push(...v.fn(instance, type, profile, context));
      } catch (err) {
        findings.push({
          level: "error",
          rule_id: `plugin-validator-raised:${v.rule_id}`,
          target_id: instance.id,
          field_path: null,
          message: "validator raised; see evidence",
          evidence: {
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
    // Step 7: aggregate
    const accepted = !findings.some((f) => f.level === "error");
    return { target_id: instance.id, accepted, findings };
  }

  /**
   * Field-patch-scoped variant of runPrimitive (§9.7.4 semantic).
   *
   * Identical to runPrimitive EXCEPT step 4 (per-field validation +
   * shape checks) only iterates `touchedPaths`. Untouched fields are
   * not re-validated, so a `:field-patch` on field B succeeds even if
   * field A has a pre-existing violation — which it must, otherwise
   * editing imported third-party data is impractical.
   *
   * Step 3 (required) still runs in full because a patch can remove
   * a required field via `op: remove` on its path; the touched-set
   * tells us *which* paths changed, not what the change was, so
   * required-field absences post-patch must surface.
   *
   * Step 5 (profile-level rules) is skipped: those rules emit
   * predicate-not-evaluated info findings and don't gate anything.
   *
   * Step 6 (custom validators) still runs in full — a custom validator
   * for the type may legitimately depend on cross-field invariants
   * that the field-patch perturbed. It is the validator's responsibility
   * to be defensive; the host runs it under the §7.1 step-6 exception
   * barrier in either pathway.
   *
   * If `touchedPaths` contains the empty-string sentinel (root-level
   * patch — rare; emitted by patches that target the document root),
   * fall back to full runPrimitive semantics.
   */
  runPrimitiveFieldPatch(
    instance: PrimitiveInstance,
    profile: DomainProfile,
    touchedPaths: ReadonlySet<string>,
    context?: CustomValidatorContext,
  ): ValidationReport {
    if (touchedPaths.has("")) return this.runPrimitive(instance, profile, context);

    const findings: ValidationFinding[] = [];
    const type = findPrimitiveType(profile, instance.type_id);
    if (!type) {
      return {
        target_id: instance.id,
        accepted: false,
        findings: [
          {
            level: "error",
            rule_id: "core:type-resolution",
            target_id: instance.id,
            field_path: null,
            message: `unknown primitive type: ${instance.type_id}`,
          },
        ],
      };
    }
    // Step 2: ID format (always cheap, always relevant — the ID isn't
    // touchable through field-patch since /id is a forbidden path, but
    // re-checking guards against future regression).
    const idFinding = checkIdFormat(instance.id, type.id_format);
    if (idFinding) findings.push(idFinding);
    // Step 3: required fields. A patch may have removed a required
    // field via `op: remove`. Run the full check.
    for (const f of type.fields) {
      if (f.required && instance.field_values[f.name] === undefined) {
        findings.push({
          level: "error",
          rule_id: "core:field:required",
          target_id: instance.id,
          field_path: `field_values.${f.name}`,
          message: `required field missing: ${f.name}`,
        });
      }
    }
    // Step 4: per-field validation, scoped to touched fields.
    for (const f of type.fields) {
      if (!touchedPaths.has(f.name)) continue;
      const v = instance.field_values[f.name];
      findings.push(...checkFieldShape(f, v, instance.id));
      findings.push(...checkIdRefs(f, v, instance.id, context?.workbook));
      for (const fv of f.validations) {
        const finding = evaluateFieldValidation(f.name, v, fv, instance.id);
        if (finding) findings.push(finding);
      }
    }
    // Step 5: profile-level rules — skipped for field-patch (they would
    // emit predicate-not-evaluated info findings on every patch with no
    // gating effect; skipping keeps the report focused on what the
    // patch actually changed).
    // Step 6: custom validators (exception barrier).
    // Profile-scoped (see validatorAppliesToProfile). The field-patch
    // pathway uses the same scope rule as runPrimitive: a validator
    // contributed by another plugin's profile must not see this write.
    for (const v of this.validators.filter(
      (r) => r.type_id === type.id && validatorAppliesToProfile(r, profile),
    )) {
      try {
        findings.push(...v.fn(instance, type, profile, context));
      } catch (err) {
        findings.push({
          level: "error",
          rule_id: `plugin-validator-raised:${v.rule_id}`,
          target_id: instance.id,
          field_path: null,
          message: "validator raised; see evidence",
          evidence: {
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
    const accepted = !findings.some((f) => f.level === "error");
    return { target_id: instance.id, accepted, findings };
  }

  /**
   * Validate one relation instance.
   *
   * `context` is optional for the same reason it is on `runPrimitive`:
   * a caller outside a workbook has none to give. A custom validator
   * that needs it must fail explicitly rather than stand down.
   */
  runRelation(
    instance: RelationInstance,
    profile: DomainProfile,
    primitives: Map<string, PrimitiveInstance>,
    context?: CustomValidatorContext,
  ): ValidationReport {
    const findings: ValidationFinding[] = [];
    const type = findRelationType(profile, instance.type_id);
    if (!type) {
      return {
        target_id: instance.id,
        accepted: false,
        findings: [
          {
            level: "error",
            rule_id: "core:type-resolution",
            target_id: instance.id,
            field_path: null,
            message: `unknown relation type: ${instance.type_id}`,
          },
        ],
      };
    }
    const src = primitives.get(instance.source_id);
    const tgt = primitives.get(instance.target_id);
    if (!src)
      findings.push({
        level: "error",
        rule_id: "core:relation:source-missing",
        target_id: instance.id,
        field_path: "source_id",
        message: `source primitive ${instance.source_id} not found`,
      });
    if (!tgt)
      findings.push({
        level: "error",
        rule_id: "core:relation:target-missing",
        target_id: instance.id,
        field_path: "target_id",
        message: `target primitive ${instance.target_id} not found`,
      });
    if (src) {
      const allowed = allowedEndpointTypes(type, "source");
      if (!endpointTypeMatches(src.type_id, allowed))
        findings.push({
          level: "error",
          rule_id: "core:relation:source-type",
          target_id: instance.id,
          field_path: "source_id",
          message: `source type ${src.type_id} not in ${describeEndpointTypes(
            allowed,
          )}`,
        });
    }
    if (tgt) {
      const allowed = allowedEndpointTypes(type, "target");
      if (!endpointTypeMatches(tgt.type_id, allowed))
        findings.push({
          level: "error",
          rule_id: "core:relation:target-type",
          target_id: instance.id,
          field_path: "target_id",
          message: `target type ${tgt.type_id} not in ${describeEndpointTypes(
            allowed,
          )}`,
        });
    }
    for (const f of type.fields) {
      if (f.required && instance.field_values[f.name] === undefined) {
        findings.push({
          level: "error",
          rule_id: "core:field:required",
          target_id: instance.id,
          field_path: `field_values.${f.name}`,
          message: `required field missing: ${f.name}`,
        });
      }
    }
    for (const f of type.fields) {
      const v = instance.field_values[f.name];
      findings.push(...checkFieldShape(f, v, instance.id));
      findings.push(...checkIdRefs(f, v, instance.id, context?.workbook));
      for (const fv of f.validations) {
        const finding = evaluateFieldValidation(f.name, v, fv, instance.id);
        if (finding) findings.push(finding);
      }
    }
    findings.push(...detectExtraFields(instance.id, instance.field_values, type.fields));
    findings.push(...this.runCustomValidators(instance, type, profile, context));
    const accepted = !findings.some((f) => f.level === "error");
    return { target_id: instance.id, accepted, findings };
  }

  /**
   * Step 6 for relations: custom validators, behind the same exception
   * barrier and the same profile scoping the primitive path uses.
   *
   * Relations had no such step at all. `cap:validator` accepted a
   * relation type id, the plugin context registered it, and the
   * registration was then never dispatched — a capability that could be
   * declared but not exercised. Nothing in-tree had registered one, so
   * no test failed; the gap was silent by construction rather than by
   * accident.
   */
  private runCustomValidators(
    instance: RelationInstance,
    type: RelationTypeDef,
    profile: DomainProfile,
    context?: CustomValidatorContext,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    for (const v of this.validators.filter(
      (r) => r.type_id === type.id && validatorAppliesToProfile(r, profile),
    )) {
      try {
        findings.push(...v.fn(instance, type, profile, context));
      } catch (err) {
        findings.push({
          level: "error",
          rule_id: `plugin-validator-raised:${v.rule_id}`,
          target_id: instance.id,
          field_path: null,
          message: "validator raised; see evidence",
          evidence: {
            failure_kind: "validator-runtime-error",
            error: err instanceof Error ? err.message : String(err),
            rule_id: v.rule_id,
          },
        });
      }
    }
    return findings;
  }

  /**
   * Field-patch-scoped variant of runRelation (§9.7.4 semantic).
   *
   * Mirrors runPrimitiveFieldPatch: type-resolution, endpoint-existence,
   * endpoint-type, and required-field checks always run. Per-field
   * shape and declared-validation checks (Step 4) only iterate fields
   * whose names are in `touchedPaths`. Empty-string sentinel signals
   * fall-back to full runRelation.
   */
  runRelationFieldPatch(
    instance: RelationInstance,
    profile: DomainProfile,
    primitives: Map<string, PrimitiveInstance>,
    touchedPaths: ReadonlySet<string>,
    context?: CustomValidatorContext,
  ): ValidationReport {
    if (touchedPaths.has("")) return this.runRelation(instance, profile, primitives, context);

    const findings: ValidationFinding[] = [];
    const type = findRelationType(profile, instance.type_id);
    if (!type) {
      return {
        target_id: instance.id,
        accepted: false,
        findings: [
          {
            level: "error",
            rule_id: "core:type-resolution",
            target_id: instance.id,
            field_path: null,
            message: `unknown relation type: ${instance.type_id}`,
          },
        ],
      };
    }
    // Endpoint-existence and endpoint-type checks (always — they're
    // structural invariants, not field validations).
    const src = primitives.get(instance.source_id);
    const tgt = primitives.get(instance.target_id);
    if (!src)
      findings.push({
        level: "error",
        rule_id: "core:relation:source-missing",
        target_id: instance.id,
        field_path: "source_id",
        message: `source primitive ${instance.source_id} not found`,
      });
    if (!tgt)
      findings.push({
        level: "error",
        rule_id: "core:relation:target-missing",
        target_id: instance.id,
        field_path: "target_id",
        message: `target primitive ${instance.target_id} not found`,
      });
    if (src) {
      const allowed = allowedEndpointTypes(type, "source");
      if (!endpointTypeMatches(src.type_id, allowed))
        findings.push({
          level: "error",
          rule_id: "core:relation:source-type",
          target_id: instance.id,
          field_path: "source_id",
          message: `source type ${src.type_id} not in ${describeEndpointTypes(allowed)}`,
        });
    }
    if (tgt) {
      const allowed = allowedEndpointTypes(type, "target");
      if (!endpointTypeMatches(tgt.type_id, allowed))
        findings.push({
          level: "error",
          rule_id: "core:relation:target-type",
          target_id: instance.id,
          field_path: "target_id",
          message: `target type ${tgt.type_id} not in ${describeEndpointTypes(allowed)}`,
        });
    }
    // Step 3: required fields — full check (a remove can drop a required field).
    for (const f of type.fields) {
      if (f.required && instance.field_values[f.name] === undefined) {
        findings.push({
          level: "error",
          rule_id: "core:field:required",
          target_id: instance.id,
          field_path: `field_values.${f.name}`,
          message: `required field missing: ${f.name}`,
        });
      }
    }
    // Step 4: per-field validation, scoped to touched fields only.
    for (const f of type.fields) {
      if (!touchedPaths.has(f.name)) continue;
      const v = instance.field_values[f.name];
      findings.push(...checkFieldShape(f, v, instance.id));
      findings.push(...checkIdRefs(f, v, instance.id, context?.workbook));
      for (const fv of f.validations) {
        const finding = evaluateFieldValidation(f.name, v, fv, instance.id);
        if (finding) findings.push(finding);
      }
    }
    const accepted = !findings.some((f) => f.level === "error");
    return { target_id: instance.id, accepted, findings };
  }
}
