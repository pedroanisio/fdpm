/**
 * Framing primitives: Stakeholder, Concern, QualityAttribute.
 * Cover SPEC §2 (Stakeholders and Concerns) and §3 (Quality Attributes
 * in Tension) — used by SPEC-REPL and SPEC-MCP-SERVER.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, primitive, str, text } from "../_common.js";

export const FRAMING_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Stakeholder",
    name: "Stakeholder",
    category: "cat:spec:framing",
    description:
      "A stakeholder of the system the SPEC governs. Renders as one row in the §2 Stakeholders table; their concerns are spec:Concern primitives joined by spec:HoldsConcern.",
    id_format: idTemplate("spec:stk:{slug}", "global"),
    fields: [
      str("role", "Stakeholder role (e.g., 'Operator', 'Plugin author', 'Security reviewer')."),
      text("primary_concern", "One-line summary used as the table cell.", { maxLength: 300 }),
      enumOf("category", "Stakeholder category.", [
        "human",
        "agent",
        "automated",
        "regulatory",
        "internal_team",
        "external_team",
      ], { required: false }),
    ],
  }),

  primitive({
    id: "spec:Concern",
    name: "Concern",
    category: "cat:spec:framing",
    description:
      "A discrete concern owned by one or more stakeholders. Used to validate that no orphan concerns exist in §2 (every concern needs a defender — see CLAUDE.md rule on stakeholder coverage).",
    id_format: idTemplate("spec:concern:{slug}", "global"),
    fields: [
      str("label", "Short concern label."),
      text("description", "Concern detail.", { maxLength: 1000 }),
    ],
  }),

  primitive({
    id: "spec:QualityAttribute",
    name: "Quality Attribute",
    category: "cat:spec:framing",
    description:
      "A non-functional attribute under tension. Renders as one row of the §3 Quality Attributes in Tension table. ISO/IEC 25010 vocabulary is recommended but not enforced.",
    id_format: idTemplate("spec:qa:{slug}", "global"),
    fields: [
      str("attribute", "Attribute name (Security, Auditability, Latency, Modifiability, ...)."),
      text("pressure", "The tension or pressure on this attribute.", { maxLength: 600 }),
      enumOf("priority", "Relative priority within the SPEC.", [
        "primary",
        "secondary",
        "constraint",
      ], { required: false }),
    ],
  }),
];
