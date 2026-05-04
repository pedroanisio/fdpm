/**
 * Risk primitives: Risk, Mitigation, OpenQuestion, FutureWork.
 * Cover SPEC-CORE §20-22, SPEC-PLUGGABLE §14-§17, SPEC-MCP §17-§18,
 * SPEC-REPL §17-§18.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, intField, primitive, str, strList, text } from "../_common.js";

export const RISK_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Risk",
    name: "Risk",
    category: "cat:spec:risk",
    description:
      "A risk row (SPEC-PLUGGABLE §15, SPEC-CORE §21). Mitigations are linked via spec:Mitigates so a single mitigation can cover several risks.",
    id_format: idTemplate("spec:risk:{slug}", "global"),
    fields: [
      str("label", "Short risk label."),
      text("description", "Risk detail.", { maxLength: 1000 }),
      enumOf("likelihood", "Estimated likelihood.", ["low", "medium", "high", "unknown"], {
        required: false,
      }),
      enumOf("impact", "Estimated impact.", ["low", "medium", "high", "critical"], {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "spec:Mitigation",
    name: "Mitigation",
    category: "cat:spec:risk",
    description:
      "A mitigation strategy. Linked to one or more spec:Risk via spec:Mitigates. Renders as the right-hand column of the risks table.",
    id_format: idTemplate("spec:mit:{slug}", "global"),
    fields: [
      text("strategy", "Mitigation strategy.", { maxLength: 1500 }),
      enumOf("status", "Implementation status.", [
        "planned",
        "in_progress",
        "implemented",
        "verified",
      ]),
    ],
  }),

  primitive({
    id: "spec:OpenQuestion",
    name: "Open Question",
    category: "cat:spec:risk",
    description:
      "An unresolved question. SPEC-MCP-SERVER §18 enforces a 'one-targeted-question' discipline; this primitive supports both that mode (one MUST be marked is_blocking=true) and SPEC-CORE §22's multi-question style.",
    id_format: idTemplate("spec:q:{slug}", "global"),
    fields: [
      intField("ordinal", "Display order."),
      text("question", "The question, phrased so a yes/no or one-of-N answer resolves it.", {
        maxLength: 1000,
      }),
      text("default_choice", "The choice the SPEC currently makes, if the question is unresolved.", {
        required: false,
        maxLength: 800,
      }),
      enumOf("is_blocking", "Is this the single blocking ambiguity?", [
        "yes",
        "no",
      ]),
      str("owner", "Who must resolve this.", { required: false }),
    ],
  }),

  primitive({
    id: "spec:FutureWork",
    name: "Future Work",
    category: "cat:spec:risk",
    description:
      "A future-work item explicitly out of scope for this version (SPEC-CORE §20, SPEC-MCP §17, SPEC-PLUGGABLE §14). Listed in the Future Work section verbatim.",
    id_format: idTemplate("spec:fw:{slug}", "global"),
    fields: [
      str("label", "Short label."),
      text("description", "Item detail.", { maxLength: 1000 }),
      str("target_version", "Version this is tentatively planned for.", { required: false }),
      strList(
        "deferred_reason",
        "Reasons this is deferred (e.g., 'requires authn layer not in scope for v0.1').",
        { required: false },
      ),
    ],
  }),
];
