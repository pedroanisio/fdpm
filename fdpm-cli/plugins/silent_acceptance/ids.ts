import type { CategoryDef, ScopeDef } from "../../src/core/models/meta.js";

export const VENDOR = "sa" as const;
export const PROFILE_ID = "profile:silent-acceptance:2.1" as const;
export const PROFILE_VERSION = "2.1.0" as const;
export const PLUGIN_ID = "fdpm.silent-acceptance" as const;
export const PLUGIN_VERSION = "0.1.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;

export const T = {
  SolverConfiguration: "sa:SolverConfiguration",
  Consumer: "sa:Consumer",
  VerificationBoundary: "sa:VerificationBoundary",
  ErrorClassCoverage: "sa:ErrorClassCoverage",
  Verifier: "sa:Verifier",
  Oracle: "sa:Oracle",
  CalibrationRun: "sa:CalibrationRun",
  AcceptanceAuthority: "sa:AcceptanceAuthority",
  OutputSubmission: "sa:OutputSubmission",
  VerificationRun: "sa:VerificationRun",
  ClassVerdict: "sa:ClassVerdict",
  AcceptanceDecision: "sa:AcceptanceDecision",
  AcceptedRisk: "sa:AcceptedRisk",
} as const;

export const R = {
  BoundaryProtectsConsumer: "sa:BoundaryProtectsConsumer",
  BoundaryPinsConfiguration: "sa:BoundaryPinsConfiguration",
  BoundaryDeclaresCoverage: "sa:BoundaryDeclaresCoverage",
  BoundaryDelegatesAuthority: "sa:BoundaryDelegatesAuthority",
  CoverageUsesVerifier: "sa:CoverageUsesVerifier",
  CoverageUsesOracle: "sa:CoverageUsesOracle",
  CoverageAcceptsRisk: "sa:CoverageAcceptsRisk",
  CoverageDeferredToBoundary: "sa:CoverageDeferredToBoundary",
  CalibrationEvaluatesBoundary: "sa:CalibrationEvaluatesBoundary",
  CalibrationUsesConfiguration: "sa:CalibrationUsesConfiguration",
  CalibrationMeasuresCoverage: "sa:CalibrationMeasuresCoverage",
  SubmissionProducedByConfiguration: "sa:SubmissionProducedByConfiguration",
  SubmissionCrossesBoundary: "sa:SubmissionCrossesBoundary",
  RunChecksSubmission: "sa:RunChecksSubmission",
  RunEvaluatesCoverage: "sa:RunEvaluatesCoverage",
  RunUsesVerifier: "sa:RunUsesVerifier",
  RunUsesOracle: "sa:RunUsesOracle",
  RunProducesVerdict: "sa:RunProducesVerdict",
  VerdictForCoverage: "sa:VerdictForCoverage",
  DecisionOnSubmission: "sa:DecisionOnSubmission",
  DecisionUnderBoundary: "sa:DecisionUnderBoundary",
  DecisionUsesVerdict: "sa:DecisionUsesVerdict",
  DecisionMadeByAuthority: "sa:DecisionMadeByAuthority",
} as const;

export const ERROR_CLASSES = [
  "ERR_HALLUCINATION",
  "ERR_OMISSION",
  "ERR_SCHEMA",
  "ERR_TRUNCATION",
  "ERR_SYCOPHANCY",
  "ERR_INSTRUCTION",
  "ERR_CALIBRATION",
  "ERR_SEMANTIC",
  "ERR_REASONING",
] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

export const COVERAGE_DISPOSITIONS = ["covered", "accepted_risk"] as const;
export const FAILURE_ACTIONS = ["retry", "abstain", "escalate", "fallback"] as const;
export const BOUNDARY_STATUSES = ["draft", "calibrating", "active", "superseded"] as const;
export const CALIBRATION_STATUSES = ["planned", "running", "passed", "failed", "invalidated"] as const;
export const ORACLE_KINDS = [
  "ground_truth_dataset",
  "external_source",
  "human_adjudication",
  "executable_specification",
  "hybrid",
] as const;
export const RUN_STATUSES = ["pending", "running", "passed", "failed", "error"] as const;
export const VERDICTS = ["pass", "fail", "inconclusive", "accepted_risk"] as const;
export const DECISIONS = ["pending", "accept", "reject", "abstain", "escalate"] as const;

export const BOUNDARY_DECLARATION_RENDERER_ID = "sa:BoundaryDeclarationRenderer" as const;
export const ASSURANCE_DASHBOARD_RENDERER_ID = "sa:AssuranceDashboardRenderer" as const;
export const CONTROL_DOMAIN_MAP_RENDERER_ID = "sa:ControlDomainMapRenderer" as const;
export const STATE_RENDERER_ID = "sa:StateRenderer" as const;
export const STATE_MEDIA_TYPE = "application/vnd.fdpm.silent-acceptance+json" as const;

export const CAT = {
  declaration: "cat:silent-acceptance:declaration",
  assurance: "cat:silent-acceptance:assurance",
  evidence: "cat:silent-acceptance:evidence",
  governance: "cat:silent-acceptance:governance",
} as const;

export const CATEGORIES: CategoryDef[] = [
  {
    id: CAT.declaration,
    name: "Boundary declaration",
    description: "The consumer, pinned solver configuration, boundary, and nine per-class dispositions.",
  },
  {
    id: CAT.assurance,
    name: "Assurance controls",
    description: "Verifiers, oracles, calibration, measured performance, and failure behaviour.",
  },
  {
    id: CAT.evidence,
    name: "Runtime evidence",
    description: "Submissions, verification runs, and per-class verdicts.",
  },
  {
    id: CAT.governance,
    name: "Acceptance governance",
    description: "Acceptance authority, decisions, and explicitly accepted residual risks.",
  },
];

export const SCOPE_ID = "scope:silent-acceptance:workbook" as const;
export const SCOPES: ScopeDef[] = [
  {
    id: SCOPE_ID,
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope for one or more versioned verification boundaries.",
  },
];
export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";
