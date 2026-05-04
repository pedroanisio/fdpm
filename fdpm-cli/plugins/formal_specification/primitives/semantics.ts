import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idTemplate,
  inlineStruct,
  primitive,
  str,
  structList,
  text,
} from "../_common.js";

/**
 * Semantics category — definitions, principles, and meaning.
 *
 * Mirrors §C of src/fdpm/plugins/formal_specification.py:
 *   fs:Definition, fs:Principle, fs:Example, fs:DesignDecision (with
 *   Alternative inline struct), fs:Assumption.
 *
 * v3.1: DesignDecision gains lifecycle (status/decision_authority/
 * structured_id); Assumption gains the Assumption Ledger fields
 * (status/risk_owner/superseded_by/last_reviewed_in_step/structured_id)
 * and the "hypothesis" kind value.
 */
export const SEMANTICS_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Definition",
    name: "Definition",
    category: "cat:semantics",
    description: "A formal definition of a concept or term.",
    id_format: idTemplate("def:{term}"),
    fields: [
      str("term", "The defined term."),
      text("formal", "Formal definition.", { maxLength: 1000 }),
      text("informal", "Plain-English gloss.", { required: false, maxLength: 800 }),
    ],
  }),

  primitive({
    id: "fs:Principle",
    name: "Principle",
    category: "cat:semantics",
    description: "A guiding design principle of the specification.",
    id_format: idTemplate("principle:{name}"),
    fields: [
      str("name", "Principle name."),
      text("statement", "What this principle requires.", { maxLength: 800 }),
    ],
  }),

  primitive({
    id: "fs:Example",
    name: "Example",
    category: "cat:semantics",
    description: "A concrete example or counterexample illustrating a primitive.",
    id_format: idTemplate("example:{name}"),
    fields: [
      str("name", "Example name."),
      text("content", "The example content.", { maxLength: 2000 }),
      bool("is_counter", "Whether this is a counterexample."),
    ],
  }),

  primitive({
    id: "fs:DesignDecision",
    name: "DesignDecision",
    category: "cat:semantics",
    description: "A recorded design decision with alternatives.",
    // Real authoring uses two-segment ids like `decision:d:01.01`
    // (kind:sequence). The earlier single-segment template was an
    // over-simplification; this regex accepts both single-segment
    // (`decision:foo`) and two-segment (`decision:d:01.01`) forms.
    id_format: { pattern: "^decision:[^\\s:]+(:[^\\s:]+)?$", uniqueness: "global", pattern_kind: "regex" },
    fields: [
      str("name", "Decision name."),
      text("context", "Context motivating this decision.", { maxLength: 800 }),
      text("decision", "The chosen approach.", { maxLength: 800 }),
      structList("alternatives", "Alternatives that were considered.", "Alternative", {
        minItems: 1,
      }),
      text("consequences", "Consequences of the decision.", { maxLength: 800 }),
      enumOf(
        "status",
        "Lifecycle status of this decision. Omit only for informal decisions.",
        ["Proposed", "Accepted", "Deprecated", "Superseded"],
        { required: false },
      ),
      str(
        "decision_authority",
        "Named person or role with final authority (DA). Compound DAs use 'Role A + Role B' convention.",
        { required: false },
      ),
      str(
        "structured_id",
        "Structured ledger identifier in D-NN.kk form (step + within-step index).",
        { required: false },
      ),
    ],
    inline_structs: [
      inlineStruct("Alternative", [
        str("option", "Alternative option name."),
        str("rejected_because", "Why this was rejected."),
      ]),
    ],
  }),

  primitive({
    id: "fs:Assumption",
    name: "Assumption",
    category: "cat:semantics",
    description:
      "An assumption, axiom, or tracked hypothesis with lifecycle status. Serves as both a static axiom record and a live Assumption Ledger entry (H-NN.kk) in execution roadmaps.",
    // Real authoring uses two-segment ids like `assumption:h:01.01`
    // (Assumption Ledger H-NN.kk form). Accept both single- and
    // two-segment shapes.
    id_format: { pattern: "^assumption:[^\\s:]+(:[^\\s:]+)?$", uniqueness: "global", pattern_kind: "regex" },
    fields: [
      str("name", "Assumption name."),
      text("statement", "Falsifiable claim or axiom statement.", { maxLength: 800 }),
      enumOf(
        "kind",
        "Classification: axiom (taken as given), assumption (believed true), hypothesis (to be tested), prerequisite (external dependency).",
        ["axiom", "assumption", "hypothesis", "prerequisite"],
      ),
      bool("falsifiable", "Whether this can be disproved."),
      enumOf(
        "status",
        "Ledger status. 'assumed' requires risk_owner. 'superseded' requires superseded_by.",
        ["verified", "unverified", "assumed", "invalidated", "superseded"],
        { required: false },
      ),
      str("risk_owner", "Named person responsible for an 'assumed' entry.", {
        required: false,
      }),
      str(
        "superseded_by",
        "ID of the assumption that replaced this one. Required when status is 'superseded'.",
        { required: false },
      ),
      str(
        "last_reviewed_in_step",
        "Step identifier of the last projection pass that examined this entry.",
        { required: false },
      ),
      str(
        "structured_id",
        "Ledger identifier in H-NN.kk form (step of origin + within-step index).",
        { required: false },
      ),
    ],
  }),
];
