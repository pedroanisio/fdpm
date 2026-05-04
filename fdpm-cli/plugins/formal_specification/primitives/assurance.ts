import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, primitive, str, text } from "../_common.js";

/**
 * Assurance category — properties, contracts, failures, guidance.
 *
 * Mirrors §E of src/fdpm/plugins/formal_specification.py:
 *   fs:Contract, fs:FormalProperty, fs:FailureMode, fs:Limitation,
 *   fs:Guideline, fs:Invariant, fs:TestCase.
 *
 * v3.1: Invariant gains enforcement (CI/Review), origin_phase, and the
 * `extent` field renamed from `scope` (which shadowed the primitive
 * scope attr); FailureMode.severity values switched from "flags" to
 * "warns"; Limitation.kind values cleaned up.
 */
export const ASSURANCE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Contract",
    name: "Contract",
    category: "cat:assurance",
    description: "A pre/postcondition contract between phases.",
    id_format: idTemplate("contract:{transition}"),
    fields: [
      str("transition", "Phase transition (e.g. Phase 0 to 1)."),
      text("precondition", "What must hold before transition.", { maxLength: 800 }),
      text("postcondition", "What must hold after transition.", { maxLength: 800 }),
    ],
  }),

  primitive({
    id: "fs:FormalProperty",
    name: "FormalProperty",
    category: "cat:assurance",
    description: "A formal claim about the method with justification.",
    id_format: idTemplate("property:{name}"),
    fields: [
      str("name", "Property name."),
      text("claim", "The formal claim.", { maxLength: 1000 }),
      text("intuition", "Why this property holds.", { maxLength: 800 }),
      text("caveat", "Conditions under which it may fail.", {
        required: false,
        maxLength: 800,
      }),
    ],
  }),

  primitive({
    id: "fs:FailureMode",
    name: "FailureMode",
    category: "cat:assurance",
    description: "A failure mode with recovery strategy.",
    id_format: idTemplate("failure:{phase}:{slug}"),
    fields: [
      str("phase", "Which phase this affects."),
      str("slug", "Short kebab-case identifier.", {
        validations: [{ kind: "max_length", value: 40, level: "error" }],
      }),
      text("condition", "What triggers this failure.", { maxLength: 280 }),
      text("recovery", "How to recover from this failure.", { maxLength: 800 }),
      enumOf("severity", "Impact severity.", ["halts", "degrades", "warns"]),
    ],
  }),

  primitive({
    id: "fs:Limitation",
    name: "Limitation",
    category: "cat:assurance",
    description: "A known limitation or open question.",
    // Real authoring uses single-segment ids like
    // `limitation:methodology-bias`; the earlier two-segment template
    // was speculative. Accept both shapes.
    id_format: { pattern: "^limitation:[^\\s:]+(:[^\\s:]+)?$", uniqueness: "global", pattern_kind: "regex" },
    fields: [
      text("description", "What the limitation is.", { maxLength: 800 }),
      enumOf("kind", "Classification of this item.", [
        "limitation",
        "open-problem",
        "known-issue",
      ]),
    ],
  }),

  primitive({
    id: "fs:Guideline",
    name: "Guideline",
    category: "cat:assurance",
    description: "A practical usage guideline or recommendation.",
    scoped: true,
    id_format: idTemplate("guideline:{name}"),
    fields: [
      str("name", "Guideline name."),
      text("description", "What the guideline recommends.", { maxLength: 800 }),
      enumOf("kind", "Guideline category.", [
        "when_to_use",
        "when_not_to_use",
        "reporting",
      ]),
    ],
  }),

  primitive({
    id: "fs:Invariant",
    name: "Invariant",
    category: "cat:assurance",
    description:
      "A property that must hold across all phases or within a named scope. Supports both global spec invariants and per-phase roadmap invariants (I-NN.kk) with explicit enforcement classification.",
    id_format: idTemplate("invariant:{name}"),
    fields: [
      str("name", "Invariant name."),
      text("statement", "The invariant statement.", { maxLength: 1000 }),
      enumOf(
        "extent",
        "Whether this invariant holds globally across all phases or only within a specific phase.",
        ["global", "phase-local"],
      ),
      enumOf(
        "enforcement",
        "CI: machine-enforced (hard invariant, gates pipeline). Review: human-enforced (soft invariant, checked in retro-validation pass).",
        ["CI", "Review"],
      ),
      text("justification", "Why this invariant holds.", { required: false, maxLength: 800 }),
      str(
        "origin_phase",
        "ID of the phase that first establishes this invariant (e.g. 'phase:1'). Derivable from structured_id NN component.",
        { required: false },
      ),
    ],
  }),

  primitive({
    id: "fs:TestCase",
    name: "TestCase",
    category: "cat:assurance",
    description: "A verification case for a property or contract.",
    id_format: idTemplate("testcase:{name}"),
    fields: [
      str("name", "Test case name."),
      text("description", "What this test verifies.", { maxLength: 800 }),
      text("input", "Test input data.", { maxLength: 1000 }),
      text("expected_output", "Expected output or result.", { maxLength: 1000 }),
      enumOf("method", "Verification method.", ["manual", "automated", "proof"]),
    ],
  }),
];
