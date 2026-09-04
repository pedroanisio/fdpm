import { resolve } from "node:path";
import { Host } from "../../../src/core/host.js";
import {
  ERROR_CLASSES,
  PROFILE_ID,
  R,
  SCOPE_ID,
  T,
  type ErrorClass,
} from "../../../plugins/silent_acceptance/ids.js";

export interface SeedOptions {
  activate?: boolean;
  authorityControlDomain?: string;
  producerControlDomain?: string;
  acceptedRiskClass?: ErrorClass;
}

export async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

export async function seedSilentAcceptance(
  host: Host,
  workbookId: string,
  opts: SeedOptions = {},
): Promise<{ workbookId: string; boundaryId: string; configurationId: string }> {
  const producerControlDomain = opts.producerControlDomain ?? "agent-runtime";
  const authorityControlDomain = opts.authorityControlDomain ?? "assurance-governance";
  const acceptedRiskClass = opts.acceptedRiskClass ?? "ERR_SYCOPHANCY";
  const boundaryId = "sa:boundary:research-assistant";
  const configurationId = "sa:configuration:research-assistant-v1";

  await host.createProject({
    workbook_id: workbookId,
    name: "Research assistant verification boundary",
    profile_id: PROFILE_ID,
  });

  const create = async (id: string, typeId: string, fields: Record<string, unknown>) => {
    const result = await host.createPrimitive(workbookId, {
      id,
      type_id: typeId,
      scope_id: SCOPE_ID,
      field_values: fields,
    });
    if (!result.report.accepted) {
      throw new Error(`fixture rejected ${id}: ${JSON.stringify(result.report.findings)}`);
    }
  };

  const link = async (id: string, typeId: string, sourceId: string, targetId: string) => {
    const result = await host.createRelation(workbookId, {
      id,
      type_id: typeId,
      source_id: sourceId,
      target_id: targetId,
      field_values: {},
    });
    if (!result.report.accepted) {
      throw new Error(`fixture rejected ${id}: ${JSON.stringify(result.report.findings)}`);
    }
  };

  await create(configurationId, T.SolverConfiguration, {
    solver_configuration_id: "research-assistant/model+harness+context+tools+prompts@1",
    model_id: "frontier-research-model",
    harness_id: "fdpm-mcp-multi-task@1",
    context_policy_digest: "a".repeat(64),
    tool_set_digest: "b".repeat(64),
    prompt_set_digest: "c".repeat(64),
    producer_control_domain: producerControlDomain,
    configured_at: "2026-09-04T18:00:00Z",
    created_by: "research-platform",
  });
  await create("sa:consumer:research-team", T.Consumer, {
    name: "Research team",
    intended_use: "Multi-agent research and evidence-backed engineering decisions.",
    consequence_statement: "Escaped errors can corrupt research conclusions and implementation choices.",
    acceptability_definition: "The declared nine-class boundary passes within its calibrated tolerance.",
    owner: "research-lead",
  });
  await create("sa:authority:assurance-governance", T.AcceptanceAuthority, {
    name: "Assurance governance",
    control_domain: authorityControlDomain,
    authorization_ref: "policy://assurance/acceptance-authority/v1",
    verdict_store_location: "audit://sealed/silent-acceptance/verdicts",
    is_append_only: true,
    is_outside_runtime_readable: true,
    owner: "assurance-lead",
  });
  await create(boundaryId, T.VerificationBoundary, {
    boundary_name: "Research assistant boundary",
    protocol_version: "2.1.0",
    status: "draft",
    scope_statement: "All intrinsic text-output errors in Silent Acceptance v2.1.0 §5.",
    distribution_ref: "dataset://research-assistant/realistic-v1",
    verifier_location: "service://sealed-verification/research-assistant",
    tolerated_failure_rate: 0.05,
    owner: "assurance-lead",
    calibrated_on: "2026-09-04",
    next_review_on: "2026-10-04",
  });
  await link("sa:edge:boundary-consumer", R.BoundaryProtectsConsumer, boundaryId, "sa:consumer:research-team");
  await link("sa:edge:boundary-configuration", R.BoundaryPinsConfiguration, boundaryId, configurationId);
  await link(
    "sa:edge:boundary-authority",
    R.BoundaryDelegatesAuthority,
    boundaryId,
    "sa:authority:assurance-governance",
  );

  const coverageIds: string[] = [];
  for (const [index, errorClass] of ERROR_CLASSES.entries()) {
    const slug = errorClass.slice(4).toLowerCase().replaceAll("_", "-");
    const coverageId = `sa:coverage:${slug}`;
    coverageIds.push(coverageId);
    const acceptedRisk = errorClass === acceptedRiskClass;
    await create(coverageId, T.ErrorClassCoverage, {
      error_class: errorClass,
      disposition: acceptedRisk ? "accepted_risk" : "covered",
      control_objective: acceptedRisk
        ? "Risk is explicitly accepted until an independent preference oracle is deployed."
        : `Detect ${errorClass} before output reaches the research team.`,
      prevalence_rate: 0.01,
      severity_weight: 1,
      residual_risk: acceptedRisk ? 0.01 : 0.001,
      ...(acceptedRisk
        ? {}
        : {
            verifier_recall: 0.9,
            false_positive_rate: 0.02,
            calibration_sample_size: 100 + index,
            failure_action: "escalate",
          }),
      owner: "assurance-lead",
      calibrated_on: "2026-09-04",
    });
    await link(`sa:edge:boundary-coverage-${index}`, R.BoundaryDeclaresCoverage, boundaryId, coverageId);

    if (acceptedRisk) {
      const riskId = `sa:risk:${slug}`;
      await create(riskId, T.AcceptedRisk, {
        error_class: errorClass,
        mitigation_note: "A second human reviewer checks preference-sensitive conclusions.",
        expires_on: "2026-10-04",
        approved_by: "assurance-lead",
        approval_control_domain: authorityControlDomain,
      });
      await link(`sa:edge:coverage-risk-${index}`, R.CoverageAcceptsRisk, coverageId, riskId);
      continue;
    }

    const verifierId = `sa:verifier:${slug}`;
    const oracleId = `sa:oracle:${slug}`;
    await create(verifierId, T.Verifier, {
      name: `${errorClass} verifier`,
      mechanism: `Independent executable check for ${errorClass}.`,
      implementation_ref: `git://sealed-verifiers/${slug}@v1`,
      version: "1.0.0",
      location: `service://sealed-verification/${slug}`,
      control_domain: "sealed-verification",
      is_producer_writable: false,
      owner: "verification-team",
    });
    await create(oracleId, T.Oracle, {
      name: `${errorClass} oracle`,
      kind: "external_source",
      evidence_source: `dataset://oracles/${slug}/v1`,
      version: "1.0.0",
      control_domain: "evidence-governance",
      is_independent_from_verifier: true,
      owner: "evidence-team",
    });
    await link(`sa:edge:coverage-verifier-${index}`, R.CoverageUsesVerifier, coverageId, verifierId);
    await link(`sa:edge:coverage-oracle-${index}`, R.CoverageUsesOracle, coverageId, oracleId);
  }

  await create("sa:calibration:research-assistant-v1", T.CalibrationRun, {
    calibration_id: "research-assistant-calibration-v1",
    dataset_ref: "dataset://research-assistant/realistic-v1",
    dataset_digest: "d".repeat(64),
    estimator: "Per-class prevalence, recall, false-positive rate, and escaped-risk estimate.",
    confidence_level: 0.95,
    sample_size_total: 900,
    started_at: "2026-09-04T18:00:00Z",
    completed_at: "2026-09-04T20:00:00Z",
    status: "passed",
    owner: "assurance-lead",
  });
  await link(
    "sa:edge:calibration-boundary",
    R.CalibrationEvaluatesBoundary,
    "sa:calibration:research-assistant-v1",
    boundaryId,
  );
  await link(
    "sa:edge:calibration-configuration",
    R.CalibrationUsesConfiguration,
    "sa:calibration:research-assistant-v1",
    configurationId,
  );
  for (const [index, coverageId] of coverageIds.entries()) {
    await link(
      `sa:edge:calibration-coverage-${index}`,
      R.CalibrationMeasuresCoverage,
      "sa:calibration:research-assistant-v1",
      coverageId,
    );
  }

  if (opts.activate !== false) {
    const activated = await host.patchPrimitive(workbookId, {
      id: boundaryId,
      field_values: { status: "active" },
      fullValidate: true,
    });
    if (!activated.report.accepted) {
      throw new Error(`fixture rejected active boundary: ${JSON.stringify(activated.report.findings)}`);
    }
  }

  return { workbookId, boundaryId, configurationId };
}
