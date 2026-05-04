/**
 * Architecture primitives: ADR, Option, TradeoffAxis, QAScenario, Principle.
 * Cover SPEC §4 (Decision Summary), §14 (Quality-Attribute Scenarios),
 * §15 (ADR), §16 (Trade-off Matrix). All four current SPECs use these.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  intField,
  iso,
  primitive,
  str,
  strList,
  structField,
  text,
} from "../_common.js";

const TradeoffCell = inlineStruct("TradeoffCell", [
  str("option_id", "Option id this cell scores."),
  text("value", "Cell value (e.g., 'High', 'M', 'Yes', a numeric score, or short prose).", {
    maxLength: 200,
  }),
]);

const ConsequenceItem = inlineStruct("ConsequenceItem", [
  enumOf("polarity", "Whether the consequence is positive, negative, or neutral.", [
    "positive",
    "negative",
    "neutral",
  ]),
  text("text", "Consequence body.", { maxLength: 600 }),
]);

export const ARCHITECTURE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Principle",
    name: "Architectural Principle",
    category: "cat:spec:architecture",
    description:
      "A guiding principle (SPEC-CORE §2 Architectural Principles, SPEC-PLUGGABLE §3 Design Principles). One principle per primitive so the renderer can produce a numbered list and so individual principles can be cross-cited.",
    id_format: idTemplate("spec:prin:{slug}", "global"),
    fields: [
      intField("ordinal", "Display order in the principles list."),
      str("title", "Principle title (one short clause)."),
      text("statement", "Principle body. Should be testable.", { maxLength: 1500 }),
      enumOf("strength", "Normative strength.", [
        "MUST",
        "SHOULD",
        "MAY",
      ], { required: false }),
    ],
  }),

  primitive({
    id: "spec:Option",
    name: "Decision Option",
    category: "cat:spec:architecture",
    description:
      "An option considered in an ADR. Connected to an spec:ADR via spec:Considers; the chosen one is also linked via spec:Chose. Trade-off rows reference these by id.",
    id_format: idTemplate("spec:opt:{slug}", "global"),
    fields: [
      str("label", "Short option label, e.g., 'Option A — Dedicated process'."),
      text("description", "What this option proposes.", { maxLength: 2000 }),
      strList("pros", "Pros / benefits.", { required: false }),
      strList("cons", "Cons / drawbacks.", { required: false }),
      enumOf("verdict", "Final verdict on this option.", [
        "chosen",
        "rejected",
        "deferred",
        "considered",
      ]),
      text(
        "rejection_reason",
        "Required when verdict='rejected'; populated for audit. Short clause.",
        { required: false, maxLength: 600 },
      ),
    ],
  }),

  primitive({
    id: "spec:ADR",
    name: "Architectural Decision Record",
    category: "cat:spec:architecture",
    description:
      "Inline ADR (Nygard 2011 format). Combines context, options, decision, consequences, and a compliance/verification clause. Quality-attribute scenarios may target the same decision via spec:Targets.",
    id_format: idTemplate("spec:adr:{slug}", "global"),
    fields: [
      str("adr_id", "ADR identifier shown in the heading (e.g., 'ADR-MCP-001')."),
      str("title", "ADR title."),
      enumOf("status", "ADR status.", [
        "proposed",
        "accepted",
        "rejected",
        "deprecated",
        "superseded",
      ]),
      iso("date", "Date the ADR was authored."),
      text("context", "Forces and constraints driving the decision.", { maxLength: 4000 }),
      text(
        "decision",
        "The chosen option in one paragraph. Cross-referenced by spec:Chose to a spec:Option.",
        { maxLength: 2000 },
      ),
      structField(
        "consequences",
        "List of consequence items (positive / negative / neutral).",
        "ConsequenceItem",
        { list: true, minItems: 1 },
      ),
      strList(
        "compliance_checks",
        "Compliance / verification clauses — bullet list of what proves the decision was upheld.",
        { required: false },
      ),
      strList(
        "revisit_signals",
        "Signals that should trigger revisiting this decision.",
        { required: false },
      ),
    ],
    inline_structs: [ConsequenceItem],
  }),

  primitive({
    id: "spec:TradeoffAxis",
    name: "Trade-off Axis",
    category: "cat:spec:architecture",
    description:
      "One row of the §16 Trade-off Matrix. Each axis carries a label and a list of cells, one per option. The renderer assembles the matrix by collecting all TradeoffAxis primitives that share an spec:HasTradeoff edge with the same ADR.",
    id_format: idTemplate("spec:tx:{slug}", "global"),
    fields: [
      str("axis", "Axis label (e.g., 'Implementation effort', 'Auditability')."),
      structField("cells", "Cells, one per option.", "TradeoffCell", { list: true, minItems: 1 }),
    ],
    inline_structs: [TradeoffCell],
  }),

  primitive({
    id: "spec:QAScenario",
    name: "Quality-Attribute Scenario",
    category: "cat:spec:architecture",
    description:
      "SEI Quality-Attribute Scenario (Bass et al.). Six fields are mandatory per the SEI template; missing any is an error finding. Targets a spec:QualityAttribute via spec:Targets.",
    id_format: idTemplate("spec:qas:{slug}", "global"),
    fields: [
      str("title", "Scenario title (used as ### sub-heading)."),
      text("source", "[Source] — what generates the stimulus.", { maxLength: 500 }),
      text("stimulus", "[Stimulus] — the event or action.", { maxLength: 500 }),
      text("environment", "[Environment] — system state when the stimulus arrives.", {
        maxLength: 500,
      }),
      text("artifact", "[Artifact] — the part of the system that responds.", { maxLength: 500 }),
      text("response", "[Response] — observable behaviour.", { maxLength: 1000 }),
      text("response_measure", "[Response measure] — quantifiable acceptance criterion.", {
        maxLength: 500,
      }),
    ],
  }),
];
