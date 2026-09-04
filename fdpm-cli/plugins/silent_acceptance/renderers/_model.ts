import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import { ERROR_CLASSES, R, T, type ErrorClass } from "../ids.js";

export const UNCHECKED_ASSURANCE_CLAIMS = [
  "The workbook records control-domain separation but cannot prove operating-system permissions, deployment topology, or that the producer lacks write access.",
  "The workbook identifies each oracle but cannot prove that external evidence or human adjudication is correct.",
  "The workbook records calibration and runtime verdict evidence but cannot prove that deployed traffic actually crossed the declared verifier path.",
] as const;

export interface CoverageView {
  instance: PrimitiveInstance;
  errorClass: string;
  disposition: string;
  objective: string;
  prevalence: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  sampleSize: number | null;
  failureAction: string;
  severityWeight: number | null;
  residualRisk: number;
  owner: string;
  calibratedOn: string;
  verifiers: PrimitiveInstance[];
  oracles: PrimitiveInstance[];
  acceptedRisks: PrimitiveInstance[];
  downstreamBoundaries: PrimitiveInstance[];
}

export interface BoundaryView {
  instance: PrimitiveInstance;
  consumer: PrimitiveInstance | null;
  configuration: PrimitiveInstance | null;
  authority: PrimitiveInstance | null;
  calibration: PrimitiveInstance | null;
  coverage: CoverageView[];
  missingClasses: ErrorClass[];
  duplicateClasses: string[];
  declaredClassCount: number;
  coveredCount: number;
  acceptedRiskCount: number;
  aggregateResidualRisk: number;
  toleratedFailureRate: number | null;
  independentControlDomains: boolean;
  calibrationMatchesPin: boolean;
  calibratedCoverageCount: number;
  structurallyComplete: boolean;
  silentAcceptance: boolean;
}

export function fieldOf(instance: PrimitiveInstance | null | undefined, name: string): string {
  const value = instance?.field_values[name];
  if (value === undefined || value === null) return "";
  return String(value);
}

export function numberOf(instance: PrimitiveInstance | null | undefined, name: string): number | null {
  const value = instance?.field_values[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function booleanOf(instance: PrimitiveInstance | null | undefined, name: string): boolean | null {
  const value = instance?.field_values[name];
  return typeof value === "boolean" ? value : null;
}

function sortInstances(values: PrimitiveInstance[]): PrimitiveInstance[] {
  return values.sort((left, right) => left.id.localeCompare(right.id));
}

function targets(
  primitives: Map<string, PrimitiveInstance>,
  relations: readonly RelationInstance[],
  typeId: string,
  sourceId: string,
): PrimitiveInstance[] {
  return sortInstances(
    relations
      .filter((relation) => relation.type_id === typeId && relation.source_id === sourceId)
      .map((relation) => primitives.get(relation.target_id))
      .filter((value): value is PrimitiveInstance => value !== undefined),
  );
}

function sources(
  primitives: Map<string, PrimitiveInstance>,
  relations: readonly RelationInstance[],
  typeId: string,
  targetId: string,
): PrimitiveInstance[] {
  return sortInstances(
    relations
      .filter((relation) => relation.type_id === typeId && relation.target_id === targetId)
      .map((relation) => primitives.get(relation.source_id))
      .filter((value): value is PrimitiveInstance => value !== undefined),
  );
}

export function buildBoundaryViews(input: RendererInput): BoundaryView[] {
  const primitives = new Map(input.primitives.map((instance) => [instance.id, instance]));
  const boundaries = sortInstances(input.primitives.filter((instance) => instance.type_id === T.VerificationBoundary));

  return boundaries.map((boundary) => {
    const consumer = targets(primitives, input.relations, R.BoundaryProtectsConsumer, boundary.id)[0] ?? null;
    const configuration = targets(primitives, input.relations, R.BoundaryPinsConfiguration, boundary.id)[0] ?? null;
    const authority = targets(primitives, input.relations, R.BoundaryDelegatesAuthority, boundary.id)[0] ?? null;
    const calibration = sources(primitives, input.relations, R.CalibrationEvaluatesBoundary, boundary.id)
      .find((candidate) => fieldOf(candidate, "status") === "passed") ?? null;
    const coverage = targets(primitives, input.relations, R.BoundaryDeclaresCoverage, boundary.id).map(
      (row): CoverageView => ({
        instance: row,
        errorClass: fieldOf(row, "error_class"),
        disposition: fieldOf(row, "disposition"),
        objective: fieldOf(row, "control_objective"),
        prevalence: numberOf(row, "prevalence_rate"),
        recall: numberOf(row, "verifier_recall"),
        falsePositiveRate: numberOf(row, "false_positive_rate"),
        sampleSize: numberOf(row, "calibration_sample_size"),
        failureAction: fieldOf(row, "failure_action"),
        severityWeight: numberOf(row, "severity_weight"),
        residualRisk: numberOf(row, "residual_risk") ?? 0,
        owner: fieldOf(row, "owner"),
        calibratedOn: fieldOf(row, "calibrated_on"),
        verifiers: targets(primitives, input.relations, R.CoverageUsesVerifier, row.id),
        oracles: targets(primitives, input.relations, R.CoverageUsesOracle, row.id),
        acceptedRisks: targets(primitives, input.relations, R.CoverageAcceptsRisk, row.id),
        downstreamBoundaries: targets(primitives, input.relations, R.CoverageDeferredToBoundary, row.id),
      }),
    );
    coverage.sort(
      (left, right) =>
        ERROR_CLASSES.indexOf(left.errorClass as ErrorClass) - ERROR_CLASSES.indexOf(right.errorClass as ErrorClass),
    );
    const classCounts = new Map<string, number>();
    for (const row of coverage) classCounts.set(row.errorClass, (classCounts.get(row.errorClass) ?? 0) + 1);
    const missingClasses = ERROR_CLASSES.filter((errorClass) => !classCounts.has(errorClass));
    const duplicateClasses = [...classCounts.entries()].filter(([, count]) => count > 1).map(([errorClass]) => errorClass);
    const coveredCount = coverage.filter((row) => row.disposition === "covered").length;
    const acceptedRiskCount = coverage.filter((row) => row.disposition === "accepted_risk").length;
    const aggregateResidualRisk = coverage.reduce((sum, row) => sum + row.residualRisk, 0);
    const toleratedFailureRate = numberOf(boundary, "tolerated_failure_rate");
    const producerDomain = fieldOf(configuration, "producer_control_domain");
    const verifierDomains = coverage.flatMap((row) => row.verifiers.map((verifier) => fieldOf(verifier, "control_domain")));
    const independentControlDomains =
      producerDomain !== "" &&
      fieldOf(authority, "control_domain") !== "" &&
      fieldOf(authority, "control_domain") !== producerDomain &&
      booleanOf(authority, "is_append_only") === true &&
      booleanOf(authority, "is_outside_runtime_readable") === true &&
      coverage.every((row) =>
        row.disposition !== "covered" ||
        row.verifiers.every(
          (verifier) =>
            fieldOf(verifier, "control_domain") !== producerDomain &&
            booleanOf(verifier, "is_producer_writable") === false,
        ),
      );
    const calibrationConfigurationIds = calibration === null
      ? []
      : targets(primitives, input.relations, R.CalibrationUsesConfiguration, calibration.id).map((value) => value.id);
    const calibrationMatchesPin =
      calibration !== null && configuration !== null && calibrationConfigurationIds.length === 1 && calibrationConfigurationIds[0] === configuration.id;
    const calibratedCoverageCount = calibration === null
      ? 0
      : targets(primitives, input.relations, R.CalibrationMeasuresCoverage, calibration.id).length;
    const coverageMechanismsComplete = coverage.every((row) =>
      row.disposition === "covered"
        ? row.verifiers.length > 0 && row.oracles.length > 0 && row.recall !== null && row.falsePositiveRate !== null && row.failureAction !== ""
        : row.acceptedRisks.length + row.downstreamBoundaries.length > 0,
    );
    const structurallyComplete =
      fieldOf(boundary, "status") === "active" &&
      consumer !== null &&
      configuration !== null &&
      authority !== null &&
      missingClasses.length === 0 &&
      duplicateClasses.length === 0 &&
      coverage.length === ERROR_CLASSES.length &&
      coveredCount > 0 &&
      coverageMechanismsComplete &&
      independentControlDomains &&
      calibrationMatchesPin &&
      calibratedCoverageCount === ERROR_CLASSES.length &&
      toleratedFailureRate !== null;

    return {
      instance: boundary,
      consumer,
      configuration,
      authority,
      calibration,
      coverage,
      missingClasses,
      duplicateClasses,
      declaredClassCount: classCounts.size,
      coveredCount,
      acceptedRiskCount,
      aggregateResidualRisk,
      toleratedFailureRate,
      independentControlDomains,
      calibrationMatchesPin,
      calibratedCoverageCount,
      structurallyComplete,
      silentAcceptance: coveredCount === 0,
    };
  });
}

export function percentage(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}
