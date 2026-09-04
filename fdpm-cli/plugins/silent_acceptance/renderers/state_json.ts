import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { ERROR_CLASSES, PROFILE_VERSION, STATE_MEDIA_TYPE } from "../ids.js";
import { UNCHECKED_ASSURANCE_CLAIMS, buildBoundaryViews, fieldOf } from "./_model.js";

export const STATE_BUDGET_BYTES = 256 * 1024;

function projection(input: RendererInput) {
  const views = buildBoundaryViews(input);
  const boundaries = views.map((view) => ({
    id: view.instance.id,
    name: fieldOf(view.instance, "boundary_name"),
    status: fieldOf(view.instance, "status"),
    protocol_version: fieldOf(view.instance, "protocol_version"),
    solver_configuration_id: fieldOf(view.configuration, "solver_configuration_id") || null,
    consumer: fieldOf(view.consumer, "name") || null,
    tolerated_failure_rate: view.toleratedFailureRate,
    aggregate_residual_risk: view.aggregateResidualRisk,
    independent_control_domains: view.independentControlDomains,
    calibration_matches_pin: view.calibrationMatchesPin,
    structurally_complete: view.structurallyComplete,
    missing_error_classes: view.missingClasses,
    duplicate_error_classes: view.duplicateClasses,
    coverage: view.coverage.map((row) => ({
      error_class: row.errorClass,
      disposition: row.disposition,
      mechanism_refs: row.verifiers.map((verifier) => fieldOf(verifier, "implementation_ref")),
      oracle_refs: row.oracles.map((oracle) => fieldOf(oracle, "evidence_source")),
      mitigation_notes: row.acceptedRisks.map((risk) => fieldOf(risk, "mitigation_note")),
      downstream_boundary_ids: row.downstreamBoundaries.map((boundary) => boundary.id),
      prevalence_rate: row.prevalence,
      verifier_recall: row.recall,
      false_positive_rate: row.falsePositiveRate,
      calibration_sample_size: row.sampleSize,
      failure_action: row.failureAction || null,
      severity_weight: row.severityWeight,
      residual_risk: row.residualRisk,
      owner: row.owner,
      calibrated_on: row.calibratedOn,
    })),
  }));
  const primary = views[0];
  return {
    schema_version: PROFILE_VERSION,
    workbook_id: input.workbookId,
    rendered_at: input.renderedAt ?? null,
    intrinsic_error_classes: ERROR_CLASSES,
    boundary_count: boundaries.length,
    complete_error_class_count: primary?.declaredClassCount ?? 0,
    silent_acceptance: views.length === 0 || views.some((view) => view.silentAcceptance),
    boundaries,
    unchecked_assurance_claims: UNCHECKED_ASSURANCE_CLAIMS,
    truncation: { applied: false, budget_bytes: STATE_BUDGET_BYTES },
  };
}

export function renderStateJson(input: RendererInput): RendererOutput {
  const full = projection(input);
  let text = JSON.stringify(full, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > STATE_BUDGET_BYTES) {
    const reduced = {
      ...full,
      boundaries: full.boundaries.map((boundary) => ({
        id: boundary.id,
        name: boundary.name,
        status: boundary.status,
        structurally_complete: boundary.structurally_complete,
        missing_error_classes: boundary.missing_error_classes,
        coverage: boundary.coverage.map((row) => ({
          error_class: row.error_class,
          disposition: row.disposition,
          residual_risk: row.residual_risk,
        })),
      })),
      truncation: { applied: true, budget_bytes: STATE_BUDGET_BYTES, omitted: "verbose mechanism, oracle, mitigation, and calibration fields" },
    };
    text = JSON.stringify(reduced, null, 2) + "\n";
  }
  if (new TextEncoder().encode(text).byteLength > STATE_BUDGET_BYTES) {
    text = JSON.stringify({
      schema_version: PROFILE_VERSION,
      workbook_id: input.workbookId,
      boundary_count: full.boundary_count,
      complete_error_class_count: full.complete_error_class_count,
      silent_acceptance: full.silent_acceptance,
      truncation: { applied: true, budget_bytes: STATE_BUDGET_BYTES, omitted: "all boundary details" },
    }, null, 2) + "\n";
  }
  return {
    bytes: new TextEncoder().encode(text),
    contentType: STATE_MEDIA_TYPE,
    filename: "silent-acceptance-state.json",
  };
}
