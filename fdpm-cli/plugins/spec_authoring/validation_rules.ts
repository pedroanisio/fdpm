import type { ValidationRuleDef } from "../../src/core/models/meta.js";

/**
 * Validation rules for SPEC authoring.
 *
 * Predicates use the legacy DSL (`non_trivial`, `min_items`, `field`,
 * `has_incoming`, `has_outgoing`) — the same vocabulary the formal_specification
 * and software_architecture plugins use. The CLI v1.1 Core does not evaluate
 * these by default; they surface as info findings unless plugin-supplied
 * evaluators are registered (see SPEC-CORE §7.1 step-6 exception barrier).
 *
 * Several rules are direct translations of CLAUDE.md mandates, including:
 *  - PALS-LAW: every Reference must declare a verification posture.
 *  - "Formalization means research": every cited claim points to a verifiable Reference.
 *  - Disclaimer required: every Document must carry a non-empty disclaimer_path.
 */
type Rule = Omit<ValidationRuleDef, "level"> & { level: "error" | "warning" | "info" };

const rule = (
  id: string,
  name: string,
  level: "error" | "warning" | "info",
  applies_to: string[],
  predicate: string,
  description: string,
): Rule => ({
  id,
  name,
  level,
  applies_to,
  targets: applies_to,
  predicate,
  expression: predicate,
  description,
});

export const VALIDATION_RULES: ValidationRuleDef[] = [
  // ── Document-level ──────────────────────────────────────────────
  rule(
    "spec:val:document-has-status",
    "Document must declare a status",
    "error",
    ["spec:Document"],
    "non_trivial(status) and non_trivial(spec_id) and non_trivial(version)",
    "Every SPEC Document must populate the §0 Document Status table fields (spec_id, version, status).",
  ),
  rule(
    "spec:val:document-has-disclaimer",
    "Document must reference DISCLAIMER.md",
    "error",
    ["spec:Document"],
    "non_trivial(disclaimer_path)",
    "Every SPEC Document must carry a non-empty disclaimer_path. CLAUDE.md mandates the DISCLAIMER reference in every README/SPEC.",
  ),
  rule(
    "spec:val:document-has-required-reads",
    "Document should declare required reads",
    "warning",
    ["spec:Document"],
    "min_items(required_reads, 1)",
    "SPECs should list at least one required read (e.g., CLAUDE.md, PURPOSE.md).",
  ),
  rule(
    "spec:val:document-has-revision",
    "Document should have at least one revision entry",
    "warning",
    ["spec:Document"],
    "has_outgoing(spec:HasSection) and has_outgoing(spec:RevisedIn)",
    "Every SPEC should declare at least one spec:RevisedIn edge to a §24 Revision entry.",
  ),

  // ── Section tree ────────────────────────────────────────────────
  rule(
    "spec:val:section-has-body",
    "Section must have body or auto-include kind",
    "error",
    ["spec:Section"],
    "non_trivial(body_md) or non_trivial(kind)",
    "A Section must either provide body_md or declare a kind that drives auto-inclusion (e.g., 'definitions', 'references').",
  ),

  // ── ADR / decision graph ────────────────────────────────────────
  // Graph-predicate rules below are WARNINGS not ERRORS by design:
  // an ADR cannot satisfy a "≥ 2 outgoing Considers" check at the moment
  // it is created (the relations don't exist yet). These are project-
  // coherence checks that fire in `fdpm validate <project>` after the
  // graph is fully assembled. Promoting them to errors would prevent
  // ADRs from ever being created. SPEC-MCP §15 / Nygard 2011 still
  // require ≥ 2 options; this plugin surfaces the violation rather than
  // blocks creation.
  rule(
    "spec:val:adr-has-options",
    "ADR must consider at least 2 options",
    "warning",
    ["spec:ADR"],
    "has_outgoing(spec:Considers)",
    "Per Nygard 2011 ADR format and SPEC-MCP §15, every ADR considers ≥ 2 options. Single-option ADRs are post-hoc rationalisations.",
  ),
  rule(
    "spec:val:adr-has-chosen",
    "ADR must mark exactly one chosen option",
    "warning",
    ["spec:ADR"],
    "has_outgoing(spec:Chose)",
    "Every ADR must point to a single chosen option via spec:Chose.",
  ),
  rule(
    "spec:val:adr-has-context",
    "ADR must have non-empty context",
    "error",
    ["spec:ADR"],
    "non_trivial(context)",
    "ADR Context section is mandatory.",
  ),
  rule(
    "spec:val:adr-has-consequences",
    "ADR must list consequences",
    "error",
    ["spec:ADR"],
    "min_items(consequences, 1)",
    "ADR must list at least one consequence (positive, negative, or neutral).",
  ),
  rule(
    "spec:val:option-rejection-reason",
    "Rejected options must give a rejection reason",
    "error",
    ["spec:Option"],
    'field(verdict) != "rejected" or non_trivial(rejection_reason)',
    "An option marked rejected without a reason is an unaccountable decision (CLAUDE.md rule 1: unbiased over flattering).",
  ),

  // ── Quality-attribute scenarios (SEI 6-field discipline) ───────
  rule(
    "spec:val:qas-six-fields",
    "QAScenario must have all six SEI fields",
    "error",
    ["spec:QAScenario"],
    "non_trivial(source) and non_trivial(stimulus) and non_trivial(environment) and non_trivial(artifact) and non_trivial(response) and non_trivial(response_measure)",
    "SEI QA Scenario template requires all six fields; missing any breaks the auditability promise.",
  ),
  rule(
    "spec:val:qas-targets-attribute",
    "QAScenario should target a Quality Attribute",
    "warning",
    ["spec:QAScenario"],
    "has_outgoing(spec:Targets)",
    "A QA scenario without a target attribute is a floating test case, not a quality argument.",
  ),

  // ── Requirements / verifiability ───────────────────────────────
  rule(
    "spec:val:requirement-has-verifier",
    "Requirement should reference its verifier",
    "warning",
    ["spec:Requirement"],
    'field(verifiability) == "unverifiable" or non_trivial(verifier_ref)',
    "A verifiable requirement should point to its test, CI check, or audit procedure. Unverifiable is allowed but must be explicit.",
  ),
  rule(
    "spec:val:must-not-unverifiable",
    "MUST clauses cannot be unverifiable",
    "error",
    ["spec:Requirement"],
    'field(strength) != "MUST" or field(verifiability) != "unverifiable"',
    "A MUST that is unverifiable is unenforceable. Either downgrade to SHOULD or make it verifiable.",
  ),
  rule(
    "spec:val:acceptance-criterion-has-evidence",
    "Met acceptance criteria must cite evidence",
    "error",
    ["spec:AcceptanceCriterion"],
    'field(status) != "met" or min_items(evidence_refs, 1)',
    "An acceptance criterion marked 'met' without evidence is an unaudited claim.",
  ),

  // ── Risks ──────────────────────────────────────────────────────
  rule(
    "spec:val:risk-has-mitigation",
    "Every Risk should have at least one mitigation",
    "warning",
    ["spec:Risk"],
    "has_incoming(spec:Mitigates)",
    "An unmitigated risk should be promoted to an open question or accepted explicitly.",
  ),

  // ── Open questions / one-blocking discipline ───────────────────
  rule(
    "spec:val:open-question-has-default",
    "Open question should declare a default",
    "warning",
    ["spec:OpenQuestion"],
    "non_trivial(default_choice)",
    "Per SPEC-MCP §18, every ambiguity in a SPEC has a default chosen and a rationale stated.",
  ),

  // ── PALS-LAW: references and citations ─────────────────────────
  rule(
    "spec:val:reference-has-verification",
    "Reference must declare verification posture",
    "error",
    ["spec:Reference"],
    "non_trivial(verification)",
    "PALS-LAW: every reference must state whether it has been verified, is unverified, is self-evident, or cannot be verified.",
  ),
  rule(
    "spec:val:reference-unverified-needs-note",
    "Unverified or cannot-verify references must include a note",
    "error",
    ["spec:Reference"],
    'field(verification) == "verified" or field(verification) == "self_evident" or non_trivial(verification_note)',
    "If a reference is unverified or cannot be verified, the SPEC must surface that fact in a verification_note (CLAUDE.md rule 2: never hallucinate references).",
  ),

  // ── Trade-off matrix coherence ─────────────────────────────────
  rule(
    "spec:val:tradeoff-has-cells",
    "Trade-off axis must have at least one cell",
    "error",
    ["spec:TradeoffAxis"],
    "min_items(cells, 1)",
    "An empty trade-off row is meaningless.",
  ),

  // ── Capability / tool surface ──────────────────────────────────
  rule(
    "spec:val:tool-has-schemas",
    "Validating-write or destructive tools must declare input/output schemas",
    "error",
    ["spec:Tool"],
    'field(tier) == "read_only" or (non_trivial(input_schema_ref) and non_trivial(output_schema_ref))',
    "SPEC-MCP §8.1 requires schema-typed inputs/outputs; only read-only tools may omit them.",
  ),
  rule(
    "spec:val:destructive-default-off",
    "Destructive tools should not be exposed by default",
    "warning",
    ["spec:Tool"],
    'field(tier) != "destructive" or field(exposure) != "always"',
    "SPEC-MCP §5.3: destructive tools are opt-in; defaulting them on is a security regression.",
  ),

  // ── Configuration entries ──────────────────────────────────────
  rule(
    "spec:val:config-has-purpose",
    "Configuration entry must explain its purpose",
    "error",
    ["spec:ConfigEntry"],
    "non_trivial(purpose)",
    "An unexplained env var leaks operator surface area; SPEC-CORE §15 requires every entry be documented.",
  ),

  // ── Migration / implementation plan ────────────────────────────
  rule(
    "spec:val:migration-has-action",
    "Migration step must have a non-trivial action",
    "error",
    ["spec:MigrationStep"],
    "non_trivial(action)",
    "An empty migration step provides no auditable trace.",
  ),
];
