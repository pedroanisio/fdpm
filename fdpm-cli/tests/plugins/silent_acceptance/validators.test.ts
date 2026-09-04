import { describe, expect, it } from "vitest";
import type { ValidationFinding } from "../../../src/core/models/instance.js";
import { PROFILE_ID, RULE, SCOPE_ID, T } from "../../../plugins/silent_acceptance/index.js";
import { freshHost, seedSilentAcceptance } from "./_fixture.js";

function findingsOf(report: {
  primitives: Array<{ findings: ValidationFinding[] }>;
  relations: Array<{ findings: ValidationFinding[] }>;
}): ValidationFinding[] {
  return [...report.primitives, ...report.relations].flatMap((entry) => entry.findings);
}

async function rejectedFindings(write: Promise<unknown>): Promise<ValidationFinding[]> {
  try {
    await write;
  } catch (error) {
    const findings = (error as { findings?: ValidationFinding[] }).findings;
    if (findings !== undefined) return findings;
    throw error;
  }
  throw new Error("expected validation rejection, but the write was accepted");
}

describe("silent-acceptance verification boundary validators", () => {
  it("accepts a complete active boundary and reports no profile findings", async () => {
    const host = await freshHost();
    await seedSilentAcceptance(host, "sa-clean");
    const report = host.validateProject("sa-clean", { minLevel: "warning" });
    expect(findingsOf(report).filter((finding) => finding.rule_id.startsWith("sa:"))).toEqual([]);
  });

  it("refuses active silent acceptance when no class is covered", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "sa-empty", name: "Empty", profile_id: PROFILE_ID });
    const findings = await rejectedFindings(host.createPrimitive("sa-empty", {
      id: "sa:boundary:empty",
      type_id: T.VerificationBoundary,
      scope_id: SCOPE_ID,
      field_values: {
        boundary_name: "Empty boundary",
        protocol_version: "2.1.0",
        status: "active",
        scope_statement: "No controls have been declared.",
        distribution_ref: "dataset://empty",
        verifier_location: "service://none",
        tolerated_failure_rate: 0.05,
        owner: "nobody",
        calibrated_on: "2026-09-04",
        next_review_on: "2026-10-04",
      },
    }));
    expect(findings.map((finding) => finding.rule_id)).toContain(RULE.boundaryComplete);
  });

  it("rejects a covered class without recall, specificity, sample size, and failure behaviour", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "sa-arm", name: "Arm", profile_id: PROFILE_ID });
    const findings = await rejectedFindings(host.createPrimitive("sa-arm", {
      id: "sa:coverage:bad",
      type_id: T.ErrorClassCoverage,
      scope_id: SCOPE_ID,
      field_values: {
        error_class: "ERR_SCHEMA",
        disposition: "covered",
        control_objective: "Validate the complete schema.",
        prevalence_rate: 0.1,
        severity_weight: 1,
        residual_risk: 0.1,
        owner: "assurance",
        calibrated_on: "2026-09-04",
      },
    }));
    expect(findings.map((finding) => finding.rule_id)).toContain(RULE.coverageArm);
  });

  it("refuses activation when acceptance authority shares the producer control domain", async () => {
    const host = await freshHost();
    const seeded = await seedSilentAcceptance(host, "sa-independence", {
      activate: false,
      authorityControlDomain: "agent-runtime",
      producerControlDomain: "agent-runtime",
    });
    const findings = await rejectedFindings(host.patchPrimitive("sa-independence", {
      id: seeded.boundaryId,
      field_values: { status: "active" },
      fullValidate: true,
    }));
    expect(findings.map((finding) => finding.rule_id)).toContain(RULE.controlIndependence);
  });

  it("refuses a submission produced by a configuration other than the boundary pin", async () => {
    const host = await freshHost();
    const seeded = await seedSilentAcceptance(host, "sa-config-change");
    const create = await host.createPrimitive("sa-config-change", {
      id: "sa:configuration:unreviewed-v2",
      type_id: T.SolverConfiguration,
      scope_id: SCOPE_ID,
      field_values: {
        solver_configuration_id: "research-assistant/unreviewed@2",
        model_id: "new-model",
        harness_id: "new-harness",
        context_policy_digest: "1".repeat(64),
        tool_set_digest: "2".repeat(64),
        prompt_set_digest: "3".repeat(64),
        producer_control_domain: "agent-runtime",
        configured_at: "2026-09-04T21:00:00Z",
        created_by: "research-platform",
      },
    });
    expect(create.report.accepted).toBe(true);
    await host.createPrimitive("sa-config-change", {
      id: "sa:submission:unreviewed",
      type_id: T.OutputSubmission,
      scope_id: SCOPE_ID,
      field_values: {
        submission_id: "unreviewed-output",
        content_digest: "4".repeat(64),
        output_ref: "artifact://research/unreviewed.md",
        produced_at: "2026-09-04T21:01:00Z",
        producer_run_id: "agent-run-2",
      },
    });
    await host.createRelation("sa-config-change", {
      id: "sa:edge:submission-config-unreviewed",
      type_id: "sa:SubmissionProducedByConfiguration",
      source_id: "sa:submission:unreviewed",
      target_id: "sa:configuration:unreviewed-v2",
      field_values: {},
    });
    const findings = await rejectedFindings(host.createRelation("sa-config-change", {
      id: "sa:edge:submission-boundary-unreviewed",
      type_id: "sa:SubmissionCrossesBoundary",
      source_id: "sa:submission:unreviewed",
      target_id: seeded.boundaryId,
      field_values: {},
    }));
    expect(findings.map((finding) => finding.rule_id)).toContain(RULE.configurationPin);
  });

  it("rejects an accepted-risk record for a different error class", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "sa-class", name: "Class consistency", profile_id: PROFILE_ID });
    await host.createPrimitive("sa-class", {
      id: "sa:coverage:semantic",
      type_id: T.ErrorClassCoverage,
      scope_id: SCOPE_ID,
      field_values: {
        error_class: "ERR_SEMANTIC",
        disposition: "accepted_risk",
        control_objective: "Explicitly accept the semantic-risk gap.",
        prevalence_rate: 0.01,
        severity_weight: 1,
        residual_risk: 0.01,
        owner: "assurance",
        calibrated_on: "2026-09-04",
      },
    });
    await host.createPrimitive("sa-class", {
      id: "sa:risk:reasoning",
      type_id: T.AcceptedRisk,
      scope_id: SCOPE_ID,
      field_values: {
        error_class: "ERR_REASONING",
        mitigation_note: "Human review.",
        expires_on: "2026-10-04",
        approved_by: "assurance",
        approval_control_domain: "governance",
      },
    });
    const findings = await rejectedFindings(host.createRelation("sa-class", {
      id: "sa:edge:mismatched-risk",
      type_id: "sa:CoverageAcceptsRisk",
      source_id: "sa:coverage:semantic",
      target_id: "sa:risk:reasoning",
      field_values: {},
    }));
    expect(findings.map((finding) => finding.rule_id)).toContain(RULE.classConsistency);
  });
});
