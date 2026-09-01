/**
 * Fact-fiction validation rules.
 *
 * Layering follows the starter's guidance: everything the field shape
 * can enforce (enums, max_length, min/max on confidence_score) stays
 * there; CEL carries the cross-field and cross-primitive invariants.
 *
 * Graph-walking rules are WARNINGS, not errors — the create-time graph
 * trap (a fact is created before its ff:Cites edge can exist) makes
 * min-edge errors reject every honest write. Warnings surface on
 * validateProject after authoring, which is exactly when "uncited",
 * "ungrounded", and "unanchored" are answerable questions. The
 * renderer surfaces the same three gaps in the review document.
 */
import type { ValidationRuleDef } from "../../src/core/models/meta.js";

type Rule = Omit<ValidationRuleDef, "level"> & {
  level: "error" | "warning" | "info";
};

const rule = (
  id: string,
  name: string,
  level: "error" | "warning" | "info",
  applies_to: string[],
  predicate: string,
  expression: string,
  description: string,
): Rule => ({
  id,
  name,
  level,
  applies_to,
  targets: applies_to,
  predicate,
  expression,
  description,
});

export const VALIDATION_RULES: ValidationRuleDef[] = [
  // (1) The spike's FactSchema pairing: disputed=true ⇒ disputeNote.
  rule(
    "ff:val:disputed-fact-has-note",
    "Disputed facts must summarize the dispute",
    "error",
    ["ff:Fact"],
    'when(field("disputed") == true, non_trivial(dispute_note))',
    '!has(instance.field_values.disputed) || instance.field_values.disputed != true || has(instance.field_values.dispute_note)',
    "A fact marked disputed must carry a dispute_note summarizing the scholarly disagreement. A bare disputed flag tells the reader nothing actionable.",
  ),

  // (2) The spike's EpistemicConfidence refine: at least one dimension.
  rule(
    "ff:val:assessment-has-confidence",
    "Assessments must state confidence",
    "error",
    ["ff:Assessment"],
    "non_trivial(confidence_level) or non_trivial(confidence_score)",
    "has(instance.field_values.confidence_level) || has(instance.field_values.confidence_score)",
    "An assessment must carry at least one of confidence_level (qualitative band) or confidence_score (numeric [0,1]). An assessment with neither asserts nothing.",
  ),

  // (3) Uncited facts. Warning: the ff:Cites edge cannot exist at
  // fact-create time (create-time graph trap, starter option C).
  rule(
    "ff:val:fact-cited",
    "Facts should cite at least one source",
    "warning",
    ["ff:Fact"],
    'has_outgoing(self, "ff:Cites")',
    'graph.outgoing("ff:Cites").size() >= 1',
    "Every fact should cite at least one ff:Source via ff:Cites. The spike required min-1 sources per fact; here the requirement is a validate-time warning so facts can be created before their citations.",
  ),

  // (4) Ungrounded fiction. fully_invented elements are exempt — "no
  // historical correlate whatsoever" is a legitimate grading.
  rule(
    "ff:val:fiction-grounded",
    "Non-fully-invented fiction should be grounded",
    "warning",
    ["ff:FictionElement"],
    'when(field("historicity") != "fully_invented", has_outgoing(self, "ff:BasedOn") or has_outgoing(self, "ff:CouplesTo"))',
    'instance.field_values.historicity == "fully_invented" || graph.outgoing("ff:BasedOn").size() >= 1 || graph.outgoing("ff:CouplesTo").size() >= 1',
    "A fiction element graded anything but fully_invented claims a relationship to the record; that claim should be an edge (ff:BasedOn or ff:CouplesTo), not prose.",
  ),

  // (5) Unanchored scenes.
  rule(
    "ff:val:scene-anchored",
    "Scenes should depict facts or feature fiction",
    "warning",
    ["ff:Scene"],
    'has_outgoing(self, "ff:Depicts") or has_outgoing(self, "ff:Features")',
    'graph.outgoing("ff:Depicts").size() >= 1 || graph.outgoing("ff:Features").size() >= 1',
    "A scene that neither depicts a fact nor features a fiction element is invisible to the coupling model; anchor it or fold it into a neighboring scene.",
  ),

  // (6) Unsupported constraints.
  rule(
    "ff:val:constraint-supported",
    "Constraints should be supported by facts",
    "warning",
    ["ff:Constraint"],
    'has_outgoing(self, "ff:SupportedBy")',
    'graph.outgoing("ff:SupportedBy").size() >= 1',
    "A historical constraint should point at the facts that establish it via ff:SupportedBy; an unsupported constraint is an author assumption wearing a scholarly costume.",
  ),
];
