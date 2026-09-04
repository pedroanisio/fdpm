import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { R, T } from "./ids.js";

function edge(args: {
  id: string;
  name: string;
  description: string;
  source: string | readonly string[];
  target: string | readonly string[];
  cardinality?: RelationTypeDef["cardinality"];
}): RelationTypeDef {
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    source_types: typeof args.source === "string" ? [args.source] : [...args.source],
    target_types: typeof args.target === "string" ? [args.target] : [...args.target],
    cardinality: args.cardinality ?? "many-to-one",
    fields: [],
    symmetric: false,
    transitive: false,
  };
}

export const RELATIONS: RelationTypeDef[] = [
  edge({
    id: R.BoundaryProtectsConsumer,
    name: "BoundaryProtectsConsumer",
    description: "The declared consumer and consequence whose tolerated failure rate governs the boundary.",
    source: T.VerificationBoundary,
    target: T.Consumer,
  }),
  edge({
    id: R.BoundaryPinsConfiguration,
    name: "BoundaryPinsConfiguration",
    description: "The exact solver configuration against which this boundary was calibrated. A configuration change requires reevaluation.",
    source: T.VerificationBoundary,
    target: T.SolverConfiguration,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.BoundaryDeclaresCoverage,
    name: "BoundaryDeclaresCoverage",
    description: "Composition: exactly one disposition per v2.1 intrinsic error class belongs to an active boundary.",
    source: T.VerificationBoundary,
    target: T.ErrorClassCoverage,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.BoundaryDelegatesAuthority,
    name: "BoundaryDelegatesAuthority",
    description: "The independent authority allowed to release or reject outputs and retain verdicts.",
    source: T.VerificationBoundary,
    target: T.AcceptanceAuthority,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.CoverageUsesVerifier,
    name: "CoverageUsesVerifier",
    description: "The executable verifier mechanism calibrated for this covered error class.",
    source: T.ErrorClassCoverage,
    target: T.Verifier,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.CoverageUsesOracle,
    name: "CoverageUsesOracle",
    description: "The independent evidence source against which verifier recall and false positives are measured.",
    source: T.ErrorClassCoverage,
    target: T.Oracle,
    cardinality: "many-to-many",
  }),
  edge({
    id: R.CoverageAcceptsRisk,
    name: "CoverageAcceptsRisk",
    description: "The approved mitigation record for a class explicitly accepted as risk at this boundary.",
    source: T.ErrorClassCoverage,
    target: T.AcceptedRisk,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.CoverageDeferredToBoundary,
    name: "CoverageDeferredToBoundary",
    description: "An accepted-risk class is covered by the named downstream boundary instead of by this one. This is an association; recursive traversal must track visited boundary ids.",
    source: T.ErrorClassCoverage,
    target: T.VerificationBoundary,
  }),
  edge({
    id: R.CalibrationEvaluatesBoundary,
    name: "CalibrationEvaluatesBoundary",
    description: "The reviewable boundary declaration supported by this calibration run.",
    source: T.CalibrationRun,
    target: T.VerificationBoundary,
  }),
  edge({
    id: R.CalibrationUsesConfiguration,
    name: "CalibrationUsesConfiguration",
    description: "The solver configuration actually exercised by the calibration run.",
    source: T.CalibrationRun,
    target: T.SolverConfiguration,
  }),
  edge({
    id: R.CalibrationMeasuresCoverage,
    name: "CalibrationMeasuresCoverage",
    description: "The per-class prevalence, recall, false-positive rate, and residual-risk row measured by this run.",
    source: T.CalibrationRun,
    target: T.ErrorClassCoverage,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.SubmissionProducedByConfiguration,
    name: "SubmissionProducedByConfiguration",
    description: "The immutable solver configuration that produced this untrusted output.",
    source: T.OutputSubmission,
    target: T.SolverConfiguration,
  }),
  edge({
    id: R.SubmissionCrossesBoundary,
    name: "SubmissionCrossesBoundary",
    description: "The active boundary an output must cross before it reaches a consumer; the submission configuration must equal the boundary pin.",
    source: T.OutputSubmission,
    target: T.VerificationBoundary,
  }),
  edge({
    id: R.RunChecksSubmission,
    name: "RunChecksSubmission",
    description: "The exact content-digested output checked by this verification run.",
    source: T.VerificationRun,
    target: T.OutputSubmission,
  }),
  edge({
    id: R.RunEvaluatesCoverage,
    name: "RunEvaluatesCoverage",
    description: "The class-specific declaration whose calibrated control this run applies.",
    source: T.VerificationRun,
    target: T.ErrorClassCoverage,
  }),
  edge({
    id: R.RunUsesVerifier,
    name: "RunUsesVerifier",
    description: "The immutable verifier implementation executed by this run.",
    source: T.VerificationRun,
    target: T.Verifier,
  }),
  edge({
    id: R.RunUsesOracle,
    name: "RunUsesOracle",
    description: "The oracle evidence version consulted by this run.",
    source: T.VerificationRun,
    target: T.Oracle,
  }),
  edge({
    id: R.RunProducesVerdict,
    name: "RunProducesVerdict",
    description: "Composition: append-only class verdict emitted by a verification run.",
    source: T.VerificationRun,
    target: T.ClassVerdict,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.VerdictForCoverage,
    name: "VerdictForCoverage",
    description: "The class declaration and calibrated threshold against which this verdict is interpreted.",
    source: T.ClassVerdict,
    target: T.ErrorClassCoverage,
  }),
  edge({
    id: R.DecisionOnSubmission,
    name: "DecisionOnSubmission",
    description: "The output released, rejected, or withheld by this authoritative decision.",
    source: T.AcceptanceDecision,
    target: T.OutputSubmission,
    cardinality: "one-to-one",
  }),
  edge({
    id: R.DecisionUnderBoundary,
    name: "DecisionUnderBoundary",
    description: "The active boundary declaration governing the decision.",
    source: T.AcceptanceDecision,
    target: T.VerificationBoundary,
  }),
  edge({
    id: R.DecisionUsesVerdict,
    name: "DecisionUsesVerdict",
    description: "One per-class verdict considered by the acceptance authority.",
    source: T.AcceptanceDecision,
    target: T.ClassVerdict,
    cardinality: "one-to-many",
  }),
  edge({
    id: R.DecisionMadeByAuthority,
    name: "DecisionMadeByAuthority",
    description: "The authority whose privilege domain appended this release decision.",
    source: T.AcceptanceDecision,
    target: T.AcceptanceAuthority,
  }),
];
