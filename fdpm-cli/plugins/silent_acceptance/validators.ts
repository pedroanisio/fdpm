import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationFinding,
} from "../../src/core/models/instance.js";
import type { ValidatorContext, ValidatorFn, ValidatorRegistration } from "../../src/plugin/types.js";
import { ERROR_CLASSES, R, T } from "./ids.js";

export const RULE = {
  boundaryComplete: "sa:val:boundary-complete",
  coverageArm: "sa:val:coverage-arm",
  residualRisk: "sa:val:residual-risk",
  controlIndependence: "sa:val:control-independence",
  calibrationCurrent: "sa:val:calibration-current",
  coverageUnique: "sa:val:coverage-unique",
  configurationPin: "sa:val:configuration-pin",
  decisionGate: "sa:val:decision-gate",
  classConsistency: "sa:val:class-consistency",
  terminalEvidence: "sa:val:terminal-evidence",
  temporalOrder: "sa:val:temporal-order",
} as const;

function finding(
  ruleId: string,
  targetId: string,
  message: string,
  options: { fieldPath?: string; evidence?: Record<string, unknown> } = {},
): ValidationFinding {
  return {
    level: "error",
    rule_id: ruleId,
    target_id: targetId,
    field_path: options.fieldPath ?? null,
    message,
    evidence: options.evidence ?? null,
  };
}

function isPrimitive(value: PrimitiveInstance | RelationInstance): value is PrimitiveInstance {
  return !("source_id" in value);
}

function primitive(context: ValidatorContext | undefined, id: string): PrimitiveInstance | undefined {
  return context?.workbook?.primitives[id];
}

function relations(context: ValidatorContext | undefined, typeId: string): readonly RelationInstance[] {
  return (context?.relations ?? []).filter((relation) => relation.type_id === typeId);
}

function outgoing(context: ValidatorContext | undefined, typeId: string, sourceId: string): readonly RelationInstance[] {
  return relations(context, typeId).filter((relation) => relation.source_id === sourceId);
}

function incoming(context: ValidatorContext | undefined, typeId: string, targetId: string): readonly RelationInstance[] {
  return relations(context, typeId).filter((relation) => relation.target_id === targetId);
}

function stringField(instance: PrimitiveInstance | undefined, name: string): string {
  return typeof instance?.field_values[name] === "string" ? String(instance.field_values[name]) : "";
}

function numberField(instance: PrimitiveInstance | undefined, name: string): number | null {
  const value = instance?.field_values[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(instance: PrimitiveInstance | undefined, name: string): boolean | null {
  const value = instance?.field_values[name];
  return typeof value === "boolean" ? value : null;
}

function targets(
  context: ValidatorContext | undefined,
  relationType: string,
  sourceId: string,
): PrimitiveInstance[] {
  return outgoing(context, relationType, sourceId)
    .map((relation) => primitive(context, relation.target_id))
    .filter((value): value is PrimitiveInstance => value !== undefined);
}

function validateCoverageArm(instance: PrimitiveInstance | RelationInstance): ValidationFinding[] {
  if (!isPrimitive(instance)) return [];
  const disposition = stringField(instance, "disposition");
  const findings: ValidationFinding[] = [];
  if (disposition === "covered") {
    for (const field of ["verifier_recall", "false_positive_rate", "calibration_sample_size", "failure_action"] as const) {
      if (instance.field_values[field] === undefined || instance.field_values[field] === null || instance.field_values[field] === "") {
        findings.push(
          finding(RULE.coverageArm, instance.id, `covered class requires ${field}`, {
            fieldPath: `field_values.${field}`,
          }),
        );
      }
    }
  }

  const prevalence = numberField(instance, "prevalence_rate");
  const severity = numberField(instance, "severity_weight");
  const residual = numberField(instance, "residual_risk");
  const recall = numberField(instance, "verifier_recall");
  if (prevalence !== null && severity !== null && residual !== null) {
    const expected = disposition === "covered" && recall !== null
      ? prevalence * (1 - recall) * severity
      : prevalence * severity;
    if (Math.abs(residual - expected) > 1e-9) {
      findings.push(
        finding(RULE.residualRisk, instance.id, "residual_risk does not equal the declared prevalence, recall, and severity terms", {
          fieldPath: "field_values.residual_risk",
          evidence: { expected, actual: residual },
        }),
      );
    }
  }
  return findings;
}

function validateBoundary(instance: PrimitiveInstance | RelationInstance, context?: ValidatorContext): ValidationFinding[] {
  if (!isPrimitive(instance) || stringField(instance, "status") !== "active") return [];
  const findings: ValidationFinding[] = [];
  if (context?.workbook === undefined) {
    return [finding(RULE.boundaryComplete, instance.id, "active boundary validation requires workbook graph context")];
  }

  const consumers = targets(context, R.BoundaryProtectsConsumer, instance.id);
  const configurations = targets(context, R.BoundaryPinsConfiguration, instance.id);
  const authorities = targets(context, R.BoundaryDelegatesAuthority, instance.id);
  const coverage = targets(context, R.BoundaryDeclaresCoverage, instance.id);
  const requireOne = (label: string, count: number) => {
    if (count !== 1) findings.push(finding(RULE.boundaryComplete, instance.id, `active boundary requires exactly one ${label}; found ${count}`));
  };
  requireOne("consumer", consumers.length);
  requireOne("pinned solver configuration", configurations.length);
  requireOne("acceptance authority", authorities.length);

  const byClass = new Map<string, PrimitiveInstance[]>();
  for (const row of coverage) {
    const errorClass = stringField(row, "error_class");
    byClass.set(errorClass, [...(byClass.get(errorClass) ?? []), row]);
  }
  for (const errorClass of ERROR_CLASSES) {
    const count = byClass.get(errorClass)?.length ?? 0;
    if (count !== 1) {
      findings.push(finding(RULE.boundaryComplete, instance.id, `active boundary requires exactly one ${errorClass} disposition; found ${count}`));
    }
  }
  for (const extra of [...byClass.keys()].filter((key) => !ERROR_CLASSES.includes(key as never))) {
    findings.push(finding(RULE.boundaryComplete, instance.id, `unknown error class in boundary: ${extra}`));
  }
  if (!coverage.some((row) => stringField(row, "disposition") === "covered")) {
    findings.push(finding(RULE.boundaryComplete, instance.id, "S must be non-empty: at least one error class must be covered"));
  }

  const producerDomain = stringField(configurations[0], "producer_control_domain");
  const authority = authorities[0];
  for (const row of coverage) {
    const disposition = stringField(row, "disposition");
    if (disposition === "covered") {
      const verifiers = targets(context, R.CoverageUsesVerifier, row.id);
      const oracles = targets(context, R.CoverageUsesOracle, row.id);
      if (verifiers.length === 0) findings.push(finding(RULE.boundaryComplete, instance.id, `${stringField(row, "error_class")} has no verifier mechanism`));
      if (oracles.length === 0) findings.push(finding(RULE.boundaryComplete, instance.id, `${stringField(row, "error_class")} has no oracle`));
      for (const verifier of verifiers) {
        const verifierDomain = stringField(verifier, "control_domain");
        if (booleanField(verifier, "is_producer_writable") !== false || verifierDomain === producerDomain) {
          findings.push(
            finding(RULE.controlIndependence, instance.id, `${stringField(row, "error_class")} verifier is writable from the producer control domain`, {
              evidence: { producer_control_domain: producerDomain, verifier_control_domain: verifierDomain },
            }),
          );
        }
      }
      const verifierDomains = new Set(verifiers.map((verifier) => stringField(verifier, "control_domain")));
      for (const oracle of oracles) {
        const oracleDomain = stringField(oracle, "control_domain");
        if (
          booleanField(oracle, "is_independent_from_verifier") !== true ||
          oracleDomain === producerDomain ||
          verifierDomains.has(oracleDomain)
        ) {
          findings.push(
            finding(RULE.controlIndependence, instance.id, `${stringField(row, "error_class")} oracle is not independent of producer and verifier`, {
              evidence: { producer_control_domain: producerDomain, oracle_control_domain: oracleDomain },
            }),
          );
        }
      }
    } else if (disposition === "accepted_risk") {
      const risks = targets(context, R.CoverageAcceptsRisk, row.id);
      const mitigations = risks.length;
      const downstream = outgoing(context, R.CoverageDeferredToBoundary, row.id).length;
      if (mitigations + downstream === 0) {
        findings.push(finding(RULE.boundaryComplete, instance.id, `${stringField(row, "error_class")} is accepted risk without a mitigation record or downstream boundary`));
      }
      for (const risk of risks) {
        if (stringField(risk, "error_class") !== stringField(row, "error_class")) {
          findings.push(finding(RULE.classConsistency, instance.id, `accepted-risk record ${risk.id} names a different error class`));
        }
        if (authority !== undefined && stringField(risk, "approval_control_domain") !== stringField(authority, "control_domain")) {
          findings.push(finding(RULE.controlIndependence, instance.id, `accepted-risk record ${risk.id} was not approved in the acceptance authority domain`));
        }
      }
    }
  }

  if (authority !== undefined) {
    const authorityDomain = stringField(authority, "control_domain");
    if (
      authorityDomain === producerDomain ||
      booleanField(authority, "is_append_only") !== true ||
      booleanField(authority, "is_outside_runtime_readable") !== true
    ) {
      findings.push(
        finding(RULE.controlIndependence, instance.id, "acceptance authority or verdict store is not independent of the producer", {
          evidence: { producer_control_domain: producerDomain, authority_control_domain: authorityDomain },
        }),
      );
    }
  }

  const calibrations = incoming(context, R.CalibrationEvaluatesBoundary, instance.id)
    .map((relation) => primitive(context, relation.source_id))
    .filter((value): value is PrimitiveInstance => value !== undefined && stringField(value, "status") === "passed");
  if (calibrations.length !== 1) {
    findings.push(finding(RULE.calibrationCurrent, instance.id, `active boundary requires exactly one passed calibration; found ${calibrations.length}`));
  } else {
    const calibration = calibrations[0]!;
    const calibrationConfigurations = targets(context, R.CalibrationUsesConfiguration, calibration.id);
    if (calibrationConfigurations.length !== 1 || calibrationConfigurations[0]?.id !== configurations[0]?.id) {
      findings.push(finding(RULE.calibrationCurrent, instance.id, "calibration solver configuration does not match the boundary pin"));
    }
    if (stringField(calibration, "dataset_ref") !== stringField(instance, "distribution_ref")) {
      findings.push(finding(RULE.calibrationCurrent, instance.id, "calibration dataset does not match the boundary distribution"));
    }
    if (stringField(calibration, "completed_at") === "") {
      findings.push(finding(RULE.calibrationCurrent, instance.id, "passed calibration has no completion instant"));
    }
    const measured = new Set(targets(context, R.CalibrationMeasuresCoverage, calibration.id).map((row) => row.id));
    for (const row of coverage) {
      if (!measured.has(row.id)) findings.push(finding(RULE.calibrationCurrent, instance.id, `calibration does not measure ${stringField(row, "error_class")}`));
    }
  }

  if (stringField(instance, "next_review_on") < stringField(instance, "calibrated_on")) {
    findings.push(finding(RULE.temporalOrder, instance.id, "next_review_on must be on or after calibrated_on"));
  }

  return findings;
}

function validateCoverageRelation(instance: PrimitiveInstance | RelationInstance, context?: ValidatorContext): ValidationFinding[] {
  if (isPrimitive(instance)) return [];
  const proposed = primitive(context, instance.target_id);
  const errorClass = stringField(proposed, "error_class");
  const duplicates = outgoing(context, R.BoundaryDeclaresCoverage, instance.source_id)
    .filter((relation) => relation.id !== instance.id)
    .map((relation) => primitive(context, relation.target_id))
    .filter((row) => stringField(row, "error_class") === errorClass);
  return duplicates.length > 0
    ? [finding(RULE.coverageUnique, instance.id, `${errorClass} is already declared on boundary ${instance.source_id}`)]
    : [];
}

function validateConfigurationPin(instance: PrimitiveInstance | RelationInstance, context?: ValidatorContext): ValidationFinding[] {
  if (isPrimitive(instance)) return [];
  const producedBy = outgoing(context, R.SubmissionProducedByConfiguration, instance.source_id);
  const pinned = outgoing(context, R.BoundaryPinsConfiguration, instance.target_id);
  if (producedBy.length !== 1 || pinned.length !== 1 || producedBy[0]?.target_id !== pinned[0]?.target_id) {
    return [
      finding(RULE.configurationPin, instance.id, "submission solver configuration does not match the boundary calibration pin", {
        evidence: {
          submission_configuration_ids: producedBy.map((edge) => edge.target_id),
          boundary_configuration_ids: pinned.map((edge) => edge.target_id),
        },
      }),
    ];
  }
  return [];
}

function validateCalibrationTime(instance: PrimitiveInstance | RelationInstance): ValidationFinding[] {
  if (!isPrimitive(instance)) return [];
  const started = Date.parse(stringField(instance, "started_at"));
  const completedRaw = stringField(instance, "completed_at");
  const findings: ValidationFinding[] = [];
  if (numberField(instance, "confidence_level") === 0) {
    findings.push(finding(RULE.calibrationCurrent, instance.id, "confidence_level must be greater than zero"));
  }
  if (completedRaw === "") {
    if (["passed", "failed", "invalidated"].includes(stringField(instance, "status"))) {
      findings.push(finding(RULE.terminalEvidence, instance.id, "terminal calibration requires completed_at"));
    }
    return findings;
  }
  const completed = Date.parse(completedRaw);
  if (!(Number.isFinite(started) && Number.isFinite(completed) && completed >= started)) {
    findings.push(finding(RULE.temporalOrder, instance.id, "completed_at must be a valid UTC instant at or after started_at"));
  }
  return findings;
}

function validateClassRelation(instance: PrimitiveInstance | RelationInstance, context?: ValidatorContext): ValidationFinding[] {
  if (isPrimitive(instance)) return [];
  const source = primitive(context, instance.source_id);
  const target = primitive(context, instance.target_id);
  return stringField(source, "error_class") === stringField(target, "error_class")
    ? []
    : [finding(RULE.classConsistency, instance.id, "linked records must name the same error_class")];
}

function validateVerificationRun(instance: PrimitiveInstance | RelationInstance): ValidationFinding[] {
  if (!isPrimitive(instance) || !["passed", "failed", "error"].includes(stringField(instance, "status"))) return [];
  const missing = ["completed_at", "evidence_digest", "evidence_ref"].filter((field) => stringField(instance, field) === "");
  return missing.length === 0
    ? []
    : [finding(RULE.terminalEvidence, instance.id, `terminal verification run requires ${missing.join(", ")}`)];
}

function validateDecision(instance: PrimitiveInstance | RelationInstance, context?: ValidatorContext): ValidationFinding[] {
  if (!isPrimitive(instance) || stringField(instance, "decision") === "pending") return [];
  const terminalMissing = ["decided_at", "decision_record_digest"].filter((field) => stringField(instance, field) === "");
  if (terminalMissing.length > 0) {
    return [finding(RULE.terminalEvidence, instance.id, `terminal decision requires ${terminalMissing.join(", ")}`)];
  }
  if (stringField(instance, "decision") !== "accept") return [];
  const boundaries = targets(context, R.DecisionUnderBoundary, instance.id);
  const submissions = targets(context, R.DecisionOnSubmission, instance.id);
  const authorities = targets(context, R.DecisionMadeByAuthority, instance.id);
  const findings: ValidationFinding[] = [];
  if (boundaries.length !== 1 || submissions.length !== 1 || authorities.length !== 1) {
    findings.push(finding(RULE.decisionGate, instance.id, "accept requires exactly one boundary, submission, and authority"));
    return findings;
  }
  const boundary = boundaries[0]!;
  if (stringField(boundary, "status") !== "active") findings.push(finding(RULE.decisionGate, instance.id, "accept requires an active boundary"));
  const delegated = targets(context, R.BoundaryDelegatesAuthority, boundary.id).map((authority) => authority.id);
  if (!delegated.includes(authorities[0]!.id)) findings.push(finding(RULE.decisionGate, instance.id, "decision authority is not delegated by the boundary"));

  const coverage = targets(context, R.BoundaryDeclaresCoverage, boundary.id);
  const verdicts = targets(context, R.DecisionUsesVerdict, instance.id);
  for (const row of coverage) {
    const rowVerdicts = verdicts.filter((verdict) =>
      outgoing(context, R.VerdictForCoverage, verdict.id).some((edge) => edge.target_id === row.id),
    );
    const required = stringField(row, "disposition") === "covered" ? "pass" : "accepted_risk";
    if (
      rowVerdicts.length !== 1 ||
      stringField(rowVerdicts[0], "verdict") !== required ||
      stringField(rowVerdicts[0], "error_class") !== stringField(row, "error_class")
    ) {
      findings.push(finding(RULE.decisionGate, instance.id, `${stringField(row, "error_class")} requires one ${required} verdict before acceptance`));
    }
  }
  return findings;
}

function registration(typeId: string, ruleId: string, fn: ValidatorFn): ValidatorRegistration {
  return { type_id: typeId, rule_id: ruleId, fn };
}

export const SA_VALIDATORS: ValidatorRegistration[] = [
  registration(T.ErrorClassCoverage, RULE.coverageArm, validateCoverageArm),
  registration(T.VerificationBoundary, RULE.boundaryComplete, (instance, _type, _profile, context) => validateBoundary(instance, context)),
  registration(R.BoundaryDeclaresCoverage, RULE.coverageUnique, (instance, _type, _profile, context) => validateCoverageRelation(instance, context)),
  registration(R.SubmissionCrossesBoundary, RULE.configurationPin, (instance, _type, _profile, context) => validateConfigurationPin(instance, context)),
  registration(T.CalibrationRun, RULE.temporalOrder, validateCalibrationTime),
  registration(T.VerificationRun, RULE.terminalEvidence, validateVerificationRun),
  registration(T.AcceptanceDecision, RULE.decisionGate, (instance, _type, _profile, context) => validateDecision(instance, context)),
  registration(R.CoverageAcceptsRisk, RULE.classConsistency, (instance, _type, _profile, context) => validateClassRelation(instance, context)),
  registration(R.VerdictForCoverage, RULE.classConsistency, (instance, _type, _profile, context) => validateClassRelation(instance, context)),
];
