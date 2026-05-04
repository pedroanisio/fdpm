/**
 * Requirements primitives: Requirement, AcceptanceCriterion, ConformanceItem,
 * Invariant. Cover SPEC-CORE §18 (Acceptance Criteria), §17 (Extensibility
 * Boundary invariants) and SPEC-PLUGGABLE §13 (Acceptance) / §18 (Conformance).
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, intField, primitive, str, strList, text } from "../_common.js";

export const REQUIREMENTS_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Requirement",
    name: "Requirement",
    category: "cat:spec:requirements",
    description:
      "A normative requirement clause. RFC 2119 strength is captured explicitly so a downstream verifier can isolate MUST clauses for compliance testing.",
    id_format: idTemplate("spec:req:{number}", "global"),
    fields: [
      str("label", "Short requirement label."),
      text("statement", "Full requirement text.", { maxLength: 2000 }),
      enumOf("strength", "RFC 2119 strength.", [
        "MUST",
        "MUST_NOT",
        "SHOULD",
        "SHOULD_NOT",
        "MAY",
      ]),
      enumOf("verifiability", "How this is verified.", [
        "test",
        "review",
        "ci_check",
        "runtime_assertion",
        "manual_audit",
        "unverifiable",
      ]),
      str("verifier_ref", "Reference to the test, file, or process that verifies it.", {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "spec:AcceptanceCriterion",
    name: "Acceptance Criterion",
    category: "cat:spec:requirements",
    description:
      "An acceptance criterion for the SPEC's release (SPEC-CORE §18, SPEC-PLUGGABLE §13). Numbered and binary (met / not met).",
    id_format: idTemplate("spec:ac:{number}", "global"),
    fields: [
      intField("ordinal", "Display order."),
      text("criterion", "Acceptance criterion body.", { maxLength: 1500 }),
      enumOf("status", "Current status.", [
        "open",
        "in_progress",
        "met",
        "blocked",
        "waived",
      ]),
      strList("evidence_refs", "Pointers to evidence (test ids, files, PRs).", {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "spec:ConformanceItem",
    name: "Conformance Item",
    category: "cat:spec:requirements",
    description:
      "A conformance test outline entry (SPEC-PLUGGABLE §18). Distinct from AcceptanceCriterion: AC = release gate; ConformanceItem = ongoing compatibility test.",
    id_format: idTemplate("spec:conf:{number}", "global"),
    fields: [
      intField("ordinal", "Display order."),
      str("name", "Test name."),
      text("procedure", "How the test is run.", { maxLength: 1500 }),
      text("expected", "Expected observable outcome.", { maxLength: 800 }),
    ],
  }),

  primitive({
    id: "spec:Invariant",
    name: "Invariant",
    category: "cat:spec:requirements",
    description:
      "A system invariant the SPEC declares (SPEC-CORE §17.2 / §4.2). Distinct from Requirement: an invariant is a property that holds *across* states; a requirement is a clause the implementation must satisfy.",
    id_format: idTemplate("spec:inv:{slug}", "global"),
    fields: [
      str("label", "Short invariant label."),
      text("statement", "What must always hold.", { maxLength: 1500 }),
      enumOf("enforcement", "How the invariant is enforced.", [
        "ci_check",
        "runtime_check",
        "type_system",
        "review",
        "manual",
        "unenforced",
      ]),
      str("scope_ref", "Reference to the scope or layer this invariant binds.", {
        required: false,
      }),
    ],
  }),
];
