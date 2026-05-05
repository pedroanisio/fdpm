import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  iso,
  primitive,
  str,
  strList,
  struct,
  text,
} from "../_common.js";

/**
 * Semantics category — meaning and constraints.
 * Mirrors §"--- Semantics ---" of src/fdpm/plugins/software_architecture.py:
 *   sw:Invariant, sw:Constraint, sw:Assumption, sw:Guarantee.
 */
export const SEMANTICS_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "sw:Invariant",
    name: "Invariant",
    category: "cat:semantics",
    description: "A property that must always hold within its scope.",
    scoped: true,
    id_format: idTemplate("invariant:{scope}:{name}"),
    fields: [
      text("statement", "The invariant as a falsifiable predicate.", {
        maxLength: 280,
      }),
      enumOf("enforcement", "How this invariant is enforced.", [
        "Compile",
        "Test",
        "Runtime",
        "Process",
        "Manual",
      ]),
    ],
  }),

  primitive({
    id: "sw:Constraint",
    name: "Constraint",
    category: "cat:semantics",
    description: "A quantitative or qualitative bound on system behavior.",
    scoped: true,
    id_format: idTemplate("constraint:{scope}:{name}"),
    fields: [
      text("statement", "The bound, expressed measurably where possible.", {
        maxLength: 280,
      }),
      // Legacy free-form metric expression. Retained for backwards compat with
      // pre-1.1 workbooks. New documents should prefer `slo` (struct, below).
      str("metric", "Machine-readable metric expression (legacy).", {
        required: false,
      }),
      // Structured SLO/SLI form (gap-pass-2 #4). Optional so legacy data
      // continues to load. When present, renderers prefer it over `metric`.
      struct(
        "slo",
        "Structured Service-Level Objective. When present, takes precedence over `metric`.",
        "Slo",
        { required: false },
      ),
      iso("last_reviewed_at", "When this constraint was last reviewed.", {
        required: false,
      }),
    ],
    inline_structs: [
      inlineStruct("Slo", [
        str("name", "SLI name (e.g. p99-latency, error-rate)."),
        str("expression", "Computable expression yielding the SLI value."),
        enumOf("comparator", "Comparison against target.", [
          "lt",
          "le",
          "eq",
          "ge",
          "gt",
        ]),
        str("target", "Target value (string to allow units, e.g. \"300ms\", \"99.9%\")."),
        str("unit", "Unit string (e.g. ms, %).", { required: false }),
        str("window", "Aggregation window (e.g. 7d, 30d).", { required: false }),
      ]),
    ],
  }),

  primitive({
    id: "sw:Assumption",
    name: "Assumption",
    category: "cat:semantics",
    description: "A condition taken as true but not guaranteed to hold.",
    scoped: true,
    id_format: idTemplate("assumption:{scope}:{name}"),
    fields: [
      text("statement", "What is assumed.", { maxLength: 280 }),
      text("invalidation", "What would make this assumption false.", {
        maxLength: 280,
      }),
      iso("last_reviewed_at", "When this assumption was last validated.", {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "sw:Guarantee",
    name: "Guarantee",
    category: "cat:semantics",
    description: "A commitment the system makes to its consumers.",
    scoped: true,
    id_format: idTemplate("guarantee:{scope}:{name}"),
    fields: [
      text("statement", "What is guaranteed.", { maxLength: 280 }),
      text("conditions", "Under what conditions the guarantee holds.", {
        maxLength: 280,
      }),
      iso("last_reviewed_at", "When this guarantee was last reviewed.", {
        required: false,
      }),
    ],
  }),

  // gap-pass-2 #6 — ATAM-style quality attribute scenario distinct from
  // sw:Constraint. Constraints are bounds; QualityAttributes are scenarios
  // that score the system on an axis.
  primitive({
    id: "sw:QualityAttribute",
    name: "QualityAttribute",
    category: "cat:semantics",
    description: "A quality-attribute scenario in ATAM / SEI form.",
    scoped: true,
    id_format: idTemplate("qa:{category}:{name}"),
    fields: [
      str("name", "Scenario identifier (kebab-case)."),
      enumOf("category", "Quality attribute axis.", [
        "Performance",
        "Security",
        "Availability",
        "Scalability",
        "Observability",
        "Modifiability",
        "Usability",
        "Portability",
        "Testability",
      ]),
      text("source", "Stimulus origin.", { maxLength: 280 }),
      text("stimulus", "Triggering event.", { maxLength: 280 }),
      text("environment", "Operating conditions during the stimulus.", {
        maxLength: 280,
      }),
      text("artifact", "Element under stimulus.", { maxLength: 280 }),
      text("response", "Required response.", { maxLength: 280 }),
      text("response_measure", "Measurable acceptance threshold.", {
        maxLength: 280,
      }),
    ],
  }),

  // gap-pass-2 #7 — first-class architectural risk register.
  primitive({
    id: "sw:Risk",
    name: "Risk",
    category: "cat:semantics",
    description: "A known architectural risk with likelihood, impact, and mitigation.",
    scoped: true,
    id_format: idTemplate("risk:{scope}:{name}"),
    fields: [
      str("name", "Risk identifier (kebab-case)."),
      text("title", "One-line risk statement.", { maxLength: 280 }),
      enumOf("likelihood", "Probability of materialization.", [
        "Low",
        "Medium",
        "High",
      ]),
      enumOf("impact", "Severity if materialized.", ["Low", "Medium", "High"]),
      text("mitigation", "Planned mitigation.", { maxLength: 500 }),
      str("owner", "Person or role accountable for the risk.", { required: false }),
      iso("review_by", "Date by which the risk should be re-evaluated.", {
        required: false,
      }),
      strList("tags", "Free-form tags (e.g. security, supply-chain).", {
        required: false,
      }),
    ],
  }),
];
