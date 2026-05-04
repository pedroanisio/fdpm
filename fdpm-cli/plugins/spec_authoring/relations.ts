import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { str } from "./_common.js";

/**
 * Relation types — connect SPEC primitives into the document graph.
 * Edges drive both validation (cardinality, endpoint type) and rendering
 * (the renderer walks edges to assemble tables and ADR bodies).
 */
export const RELATIONS: RelationTypeDef[] = [
  // ── Document tree ──────────────────────────────────────────────
  {
    id: "spec:HasSection",
    name: "HasSection",
    description: "Document or Section contains a child Section. Forms the §1/§2/… tree.",
    source_types: ["spec:Document", "spec:Section"],
    target_types: ["spec:Section"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 1, target_max: 1 },
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "spec:Defines",
    name: "Defines",
    description: "Document or Section defines a Term (drives the §3 Definitions table).",
    source_types: ["spec:Document", "spec:Section"],
    target_types: ["spec:Term"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // ── Framing ────────────────────────────────────────────────────
  {
    id: "spec:HoldsConcern",
    name: "HoldsConcern",
    description: "Stakeholder owns a concern.",
    source_types: ["spec:Stakeholder"],
    target_types: ["spec:Concern"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 1, target_max: null },
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Tensions",
    name: "Tensions",
    description: "Quality attribute is in tension with another quality attribute.",
    source_types: ["spec:QualityAttribute"],
    target_types: ["spec:QualityAttribute"],
    fields: [],
    symmetric: true,
    transitive: false,
  },

  // ── ADR / decision graph ───────────────────────────────────────
  {
    id: "spec:Considers",
    name: "Considers",
    description: "ADR considers an option.",
    source_types: ["spec:ADR"],
    target_types: ["spec:Option"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 2, target_max: null },
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Chose",
    name: "Chose",
    description: "ADR chose a single option (the decided alternative).",
    source_types: ["spec:ADR"],
    target_types: ["spec:Option"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 1, target_max: 1 },
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:HasTradeoff",
    name: "HasTradeoff",
    description: "ADR has trade-off axis (drives the §16 matrix).",
    source_types: ["spec:ADR"],
    target_types: ["spec:TradeoffAxis"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Targets",
    name: "Targets",
    description: "Quality-attribute scenario targets a quality attribute.",
    source_types: ["spec:QAScenario"],
    target_types: ["spec:QualityAttribute"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 1, target_max: 1 },
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Supersedes",
    name: "Supersedes",
    description: "Newer ADR / Document supersedes an older one.",
    source_types: ["spec:ADR", "spec:Document"],
    target_types: ["spec:ADR", "spec:Document"],
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "spec:Resolves",
    name: "Resolves",
    description: "ADR resolves an open question.",
    source_types: ["spec:ADR"],
    target_types: ["spec:OpenQuestion"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // ── Requirements / invariants ─────────────────────────────────
  {
    id: "spec:DependsOn",
    name: "DependsOn",
    description: "Requirement depends on another requirement.",
    source_types: ["spec:Requirement", "spec:AcceptanceCriterion", "spec:MigrationStep"],
    target_types: ["spec:Requirement", "spec:AcceptanceCriterion", "spec:MigrationStep"],
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "spec:Verifies",
    name: "Verifies",
    description: "Conformance item or test verifies a requirement.",
    source_types: ["spec:ConformanceItem", "spec:AcceptanceCriterion"],
    target_types: ["spec:Requirement", "spec:Invariant"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Constrains",
    name: "Constrains",
    description: "Invariant constrains a tool, endpoint, capability, or schema.",
    source_types: ["spec:Invariant"],
    target_types: [
      "spec:Tool",
      "spec:Endpoint",
      "spec:Capability",
      "spec:SchemaDefinition",
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // ── Risk graph ────────────────────────────────────────────────
  {
    id: "spec:Mitigates",
    name: "Mitigates",
    description: "Mitigation reduces a risk.",
    source_types: ["spec:Mitigation"],
    target_types: ["spec:Risk"],
    cardinality_bounds: { source_min: 0, source_max: null, target_min: 1, target_max: null },
    fields: [],
    symmetric: false,
    transitive: false,
  },

  // ── Provenance ────────────────────────────────────────────────
  {
    id: "spec:Cites",
    name: "Cites",
    description:
      "Any primitive cites a Reference. The renderer walks this edge to footnote citations and to assemble the §References list.",
    source_types: "*",
    target_types: ["spec:Reference"],
    metadata_schema: [
      str("locator", "Optional in-document locator (page, section).", { required: false }),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:RequiredRead",
    name: "RequiredRead",
    description: "Document marks another Document or Reference as a required read.",
    source_types: ["spec:Document"],
    target_types: ["spec:Document", "spec:Reference"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:Implements",
    name: "Implements",
    description:
      "Tool / Endpoint / Capability / Configuration entry implements a Requirement or Invariant.",
    source_types: ["spec:Tool", "spec:Endpoint", "spec:Capability", "spec:ConfigEntry"],
    target_types: ["spec:Requirement", "spec:Invariant"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "spec:RevisedIn",
    name: "RevisedIn",
    description:
      "Any primitive was revised in a particular Revision. Lets the renderer build a per-revision diff list.",
    source_types: "*",
    target_types: ["spec:Revision"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
