import type { FieldDefT, PrimitiveTypeDef } from "../../src/core/models/meta.js";
import {
  boolField,
  dateField,
  dateTimeField,
  enumOf,
  intField,
  numberField,
  primitive,
  sha256Field,
  shortText,
  str,
} from "./_common.js";
import {
  BOUNDARY_STATUSES,
  CALIBRATION_STATUSES,
  CAT,
  COVERAGE_DISPOSITIONS,
  DECISIONS,
  ERROR_CLASSES,
  FAILURE_ACTIONS,
  ORACLE_KINDS,
  RUN_STATUSES,
  T,
  VERDICTS,
} from "./ids.js";

function ownerField(): FieldDefT {
  return shortText(
    "owner",
    "Accountable non-personal team or service identifier. Personal data is forbidden in this field.",
    128,
  );
}

export const SOLVER_CONFIGURATION: PrimitiveTypeDef = primitive({
  id: T.SolverConfiguration,
  idPattern: "sa:configuration:{slug}",
  name: "SolverConfiguration",
  category: CAT.declaration,
  description:
    "The complete unit indexed by M: model, harness, context policy, tool set, and prompt set. A boundary pins one immutable revision of this tuple.",
  fields: [
    shortText("solver_configuration_id", "Stable configuration identity recorded by the runtime and calibration evidence.", 256),
    shortText("model_id", "Provider-qualified model identifier, including any pinned revision.", 256),
    shortText("harness_id", "Versioned agent or invocation harness identifier.", 256),
    sha256Field("context_policy_digest", "SHA-256 of the context-window and context-selection policy."),
    sha256Field("tool_set_digest", "SHA-256 of the enabled tool catalogue and tool policy."),
    sha256Field("prompt_set_digest", "SHA-256 of the system, task, and workflow prompt bundle."),
    shortText("producer_control_domain", "Privilege or process domain that can modify the producer.", 256),
    dateTimeField("configured_at", "UTC instant at which this immutable configuration revision was recorded."),
    shortText("created_by", "Non-personal actor or service identifier that recorded this revision.", 128),
  ],
});

export const CONSUMER: PrimitiveTypeDef = primitive({
  id: T.Consumer,
  idPattern: "sa:consumer:{slug}",
  name: "Consumer",
  category: CAT.declaration,
  description: "The declared downstream consumer and consequence against which acceptability and tau are judged.",
  fields: [
    shortText("name", "Human-readable consumer or consumer-system name.", 160),
    str("intended_use", "The deployment use whose realistic input distribution is calibrated."),
    str("consequence_statement", "What happens when an erroneous output escapes the boundary."),
    str("acceptability_definition", "The external conditions under which an output is acceptable."),
    ownerField(),
  ],
});

export const VERIFICATION_BOUNDARY: PrimitiveTypeDef = primitive({
  id: T.VerificationBoundary,
  idPattern: "sa:boundary:{slug}",
  name: "VerificationBoundary",
  category: CAT.declaration,
  description:
    "The reviewable §9.1 artifact. An active boundary is valid only for its pinned solver configuration, declared consumer, complete nine-class scope, calibration, and independent acceptance authority.",
  fields: [
    shortText("boundary_name", "Human-readable boundary name.", 160),
    enumOf("protocol_version", "Silent Acceptance protocol revision this declaration implements.", ["2.1.0"]),
    enumOf("status", "Lifecycle state. Only active boundaries authorize acceptance.", BOUNDARY_STATUSES),
    str("scope_statement", "Scope of outputs and all intrinsic error classes governed by this boundary."),
    str("distribution_ref", "Versioned realistic deployment distribution used for calibration."),
    str("verifier_location", "Module, service, process, or privilege domain in which verification runs."),
    numberField("tolerated_failure_rate", "Dimensionless consumer tolerance tau in [0,1].", { min: 0, max: 1 }),
    ownerField(),
    dateField("calibrated_on", "UTC calendar date of the calibration that supports this declaration."),
    dateField("next_review_on", "UTC calendar date by which the boundary must be recalibrated or superseded."),
  ],
});

export const ERROR_CLASS_COVERAGE: PrimitiveTypeDef = primitive({
  id: T.ErrorClassCoverage,
  idPattern: "sa:coverage:{slug}",
  name: "ErrorClassCoverage",
  category: CAT.declaration,
  description:
    "One and only one disposition for one §5 intrinsic error class. Covered classes declare calibrated verifier performance; uncovered classes are explicit accepted risks.",
  fields: [
    enumOf("error_class", "Closed v2.1.0 intrinsic error-class identifier.", ERROR_CLASSES),
    enumOf("disposition", "Whether a verifier covers this class or the class is an explicit accepted risk.", COVERAGE_DISPOSITIONS),
    str("control_objective", "What detection or risk-management outcome this class declaration must achieve."),
    numberField("prevalence_rate", "Measured class prevalence P(epsilon_c), dimensionless in [0,1].", { min: 0, max: 1 }),
    numberField("verifier_recall", "Measured verifier recall R_c, dimensionless in [0,1]; required when covered.", {
      required: false,
      min: 0,
      max: 1,
    }),
    numberField("false_positive_rate", "Measured false-positive rate, dimensionless in [0,1]; required when covered.", {
      required: false,
      min: 0,
      max: 1,
    }),
    intField("calibration_sample_size", "Number of independently labelled class examples; required when covered.", {
      required: false,
      min: 1,
    }),
    enumOf("failure_action", "Action after this class verifier rejects an output.", FAILURE_ACTIONS, { required: false }),
    numberField("severity_weight", "Declared non-negative consequence weight sev_c; dimensionless.", { min: 0 }),
    numberField(
      "residual_risk",
      "Stored severity-weighted escaped risk. Covered: prevalence*(1-recall)*severity; accepted risk: prevalence*severity.",
      { min: 0 },
    ),
    ownerField(),
    dateField("calibrated_on", "UTC date on which this per-class estimate was calibrated."),
  ],
});

export const VERIFIER: PrimitiveTypeDef = primitive({
  id: T.Verifier,
  idPattern: "sa:verifier:{slug}",
  name: "Verifier",
  category: CAT.assurance,
  description: "An executable, versioned predicate for one or more error classes, distinct from the producer.",
  fields: [
    shortText("name", "Verifier name.", 160),
    str("mechanism", "Executable detection mechanism stated precisely enough that recall can be measured."),
    str("implementation_ref", "Immutable source, image, binary, or policy reference."),
    shortText("version", "Semantic version of this verifier implementation.", 32),
    str("location", "Runtime module, process, service, or privilege-domain location."),
    shortText("control_domain", "Privilege domain that can modify the verifier.", 256),
    boolField("is_producer_writable", "Whether the producer can modify this verifier. Active boundaries require false."),
    ownerField(),
  ],
});

export const ORACLE: PrimitiveTypeDef = primitive({
  id: T.Oracle,
  idPattern: "sa:oracle:{slug}",
  name: "Oracle",
  category: CAT.assurance,
  description: "The evidence source against which a verifier is calibrated and its verdict can be checked.",
  fields: [
    shortText("name", "Oracle name.", 160),
    enumOf("kind", "Closed oracle mechanism class.", ORACLE_KINDS),
    str("evidence_source", "Versioned external evidence, dataset, specification, or adjudication protocol."),
    shortText("version", "Semantic version or immutable snapshot identifier.", 64),
    shortText("control_domain", "Privilege domain governing the oracle evidence.", 256),
    boolField("is_independent_from_verifier", "Whether oracle labels are produced independently of the verifier under test."),
    ownerField(),
  ],
});

export const CALIBRATION_RUN: PrimitiveTypeDef = primitive({
  id: T.CalibrationRun,
  idPattern: "sa:calibration:{slug}",
  name: "CalibrationRun",
  category: CAT.assurance,
  description: "A dated calibration of per-class prevalence, recall, specificity, and residual risk against one pinned configuration.",
  fields: [
    shortText("calibration_id", "Stable calibration run identity.", 160),
    str("dataset_ref", "Immutable reference to the realistic labelled evaluation distribution."),
    sha256Field("dataset_digest", "SHA-256 of the exact labelled dataset or manifest."),
    str("estimator", "Estimator, confidence procedure, and acceptance threshold fixed before evaluation."),
    numberField("confidence_level", "Dimensionless confidence level in (0,1].", { min: 0, max: 1 }),
    intField("sample_size_total", "Total labelled examples across error classes.", { min: 1 }),
    dateTimeField("started_at", "UTC start instant."),
    dateTimeField("completed_at", "UTC completion instant.", false),
    enumOf("status", "Calibration lifecycle and result.", CALIBRATION_STATUSES),
    ownerField(),
  ],
});

export const ACCEPTANCE_AUTHORITY: PrimitiveTypeDef = primitive({
  id: T.AcceptanceAuthority,
  idPattern: "sa:authority:{slug}",
  name: "AcceptanceAuthority",
  category: CAT.governance,
  description: "Authority and verdict store outside the producer's control domain. The profile records the claim; deployment controls must prove it.",
  fields: [
    shortText("name", "Acceptance authority name.", 160),
    shortText("control_domain", "Privilege domain that controls acceptance and verdict retention.", 256),
    str("authorization_ref", "Versioned policy or access-control reference granting acceptance authority."),
    str("verdict_store_location", "Append-only verdict record readable by a party outside the runtime."),
    boolField("is_append_only", "Whether producer-visible verdict records are append-only."),
    boolField("is_outside_runtime_readable", "Whether an external party can independently read and check verdicts."),
    ownerField(),
  ],
});

export const OUTPUT_SUBMISSION: PrimitiveTypeDef = primitive({
  id: T.OutputSubmission,
  idPattern: "sa:submission:{slug}",
  name: "OutputSubmission",
  category: CAT.evidence,
  description: "One immutable producer output presented to a declared boundary before any consumer receives it.",
  fields: [
    shortText("submission_id", "Stable producer-side submission identity.", 160),
    sha256Field("content_digest", "SHA-256 of the exact untrusted output bytes."),
    str("output_ref", "Immutable artifact or object-store reference to the output."),
    dateTimeField("produced_at", "UTC instant at which the producer emitted the output."),
    shortText("producer_run_id", "Runtime run or trace identifier.", 256),
  ],
});

export const VERIFICATION_RUN: PrimitiveTypeDef = primitive({
  id: T.VerificationRun,
  idPattern: "sa:verification-run:{slug}",
  name: "VerificationRun",
  category: CAT.evidence,
  description: "One execution of a verifier against a submission and class declaration.",
  fields: [
    shortText("verification_run_id", "Stable verifier-side run identity.", 160),
    enumOf("status", "Execution lifecycle and aggregate outcome.", RUN_STATUSES),
    dateTimeField("started_at", "UTC start instant."),
    dateTimeField("completed_at", "UTC completion instant.", false),
    sha256Field("evidence_digest", "SHA-256 of the complete verifier evidence bundle; required when terminal.", false),
    str("evidence_ref", "Immutable reference to the verifier evidence bundle; required when terminal.", { required: false }),
  ],
});

export const CLASS_VERDICT: PrimitiveTypeDef = primitive({
  id: T.ClassVerdict,
  idPattern: "sa:verdict:{slug}",
  name: "ClassVerdict",
  category: CAT.evidence,
  description: "The append-only verdict for one error class in one verification run.",
  fields: [
    enumOf("error_class", "Error class judged by this verdict.", ERROR_CLASSES),
    enumOf("verdict", "Per-class result.", VERDICTS),
    str("rationale", "Evidence-backed reason for the verdict."),
    dateTimeField("recorded_at", "UTC instant at which the authority-visible verdict was appended."),
    sha256Field("evidence_digest", "SHA-256 of the evidence underlying this verdict."),
  ],
});

export const ACCEPTANCE_DECISION: PrimitiveTypeDef = primitive({
  id: T.AcceptanceDecision,
  idPattern: "sa:decision:{slug}",
  name: "AcceptanceDecision",
  category: CAT.governance,
  description: "The authoritative disposition of one submission after its declared boundary and per-class verdicts have been checked.",
  fields: [
    enumOf("decision", "Pending or terminal consumer-release decision.", DECISIONS),
    str("rationale", "Why the authority made this disposition."),
    dateTimeField("decided_at", "UTC decision instant.", false),
    sha256Field("decision_record_digest", "SHA-256 of the append-only decision record; required for a terminal decision.", false),
  ],
});

export const ACCEPTED_RISK: PrimitiveTypeDef = primitive({
  id: T.AcceptedRisk,
  idPattern: "sa:risk:{slug}",
  name: "AcceptedRisk",
  category: CAT.governance,
  description: "A time-bounded, independently approved mitigation for an error class not covered at this boundary.",
  fields: [
    enumOf("error_class", "Uncovered error class this record accepts.", ERROR_CLASSES),
    str("mitigation_note", "Concrete compensating control or reason the consumer accepts this residual risk."),
    dateField("expires_on", "UTC date after which this acceptance is invalid without review."),
    shortText("approved_by", "Non-personal authority or team identifier.", 128),
    shortText("approval_control_domain", "Privilege domain in which the acceptance was approved.", 256),
  ],
});

export const ALL_PRIMITIVES: PrimitiveTypeDef[] = [
  SOLVER_CONFIGURATION,
  CONSUMER,
  VERIFICATION_BOUNDARY,
  ERROR_CLASS_COVERAGE,
  VERIFIER,
  ORACLE,
  CALIBRATION_RUN,
  ACCEPTANCE_AUTHORITY,
  OUTPUT_SUBMISSION,
  VERIFICATION_RUN,
  CLASS_VERDICT,
  ACCEPTANCE_DECISION,
  ACCEPTED_RISK,
];
