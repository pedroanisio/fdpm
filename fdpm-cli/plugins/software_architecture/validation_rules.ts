import type { ValidationRuleDef } from "../../src/core/models/meta.js";

/**
 * Validation rules — mirrors src/fdpm/plugins/software_architecture.py
 * lines 1375-1495.
 *
 * MIGRATION (2026-05-04): Predicates migrated from legacy DSL to CEL
 * canonical form (§4.3 SPEC-CEL-VALIDATOR).
 */
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
  rule(
    "sw:val:decision-has-alternatives",
    "Decision must have alternatives",
    "error",
    ["sw:Decision"],
    "min_items(alternatives, 1)",
    "instance.field_values.alternatives.size() >= 1",
    "Every Decision must list at least one rejected alternative.",
  ),
  rule(
    "sw:val:decision-has-rationale",
    "Decision rationale must be substantive",
    "error",
    ["sw:Decision"],
    "non_trivial(rationale)",
    "instance.field_values.rationale.trim().size() > 0",
    "Decision rationale cannot be placeholder text.",
  ),
  rule(
    "sw:val:assumption-has-invalidation",
    "Assumption must have invalidation condition",
    "error",
    ["sw:Assumption"],
    "non_trivial(invalidation)",
    "instance.field_values.invalidation.trim().size() > 0",
    "Every Assumption must describe what would make it false.",
  ),
  rule(
    "sw:val:invariant-not-manual",
    "Invariants should not rely on manual enforcement",
    "warning",
    ["sw:Invariant"],
    'field("enforcement") != "Manual"',
    'instance.field_values.enforcement != "Manual"',
    "Invariants with Manual enforcement are a code smell.",
  ),
  rule(
    "sw:val:contract-has-conditions",
    "Contract must have pre and postconditions",
    "error",
    ["sw:Contract"],
    "min_items(preconditions, 1) and min_items(postconditions, 1)",
    "instance.field_values.preconditions.size() >= 1 && instance.field_values.postconditions.size() >= 1",
    "Every Contract must define at least one pre and one postcondition.",
  ),
  rule(
    "sw:comp:active-entity-constrained",
    "Active entities should be constrained",
    "warning",
    ["sw:Entity"],
    'when(field("lifecycle") == "Active", has_relation(self, "sw:Constrains", 1, direction: inbound))',
    'instance.field_values.lifecycle == "Active" ? graph.incoming("sw:Constrains").size() >= 1 : true',
    "Active entities should have at least one Constraint/Invariant.",
  ),
  // The legacy DSL form used `has_relation(self, "sw:Transition", 1, field:
  // from_state)` — i.e. "find sw:Transition PRIMITIVES whose from_state
  // field equals self.id". CEL's activation contract (SPEC-CEL-VALIDATOR §9)
  // exposes only `instance / instance_type / profile / graph`, where graph
  // queries RELATIONS, not field-back-references against primitives. There
  // is no relation type that links a State to its outbound Transitions
  // (the link is field-based via sw:Transition.from_state). Until SPEC-CEL-
  // VALIDATOR adds a primitive-by-field helper, this rule cannot be
  // expressed in CEL — `expression: "true"` makes the rule a no-op rather
  // than a false-positive generator. The legacy `predicate` is preserved
  // verbatim for documentation and as the source for any future helper.
  rule(
    "sw:val:non-terminal-state-has-transition",
    "Non-terminal state should have outbound transition",
    "warning",
    ["sw:State"],
    'when(field("terminal") == false, has_relation(self, "sw:Transition", 1, field: from_state))',
    "true",
    "Non-terminal states should have at least one outbound transition. Currently a no-op: sw:Transition is a primitive (not a relation), and CEL activation lacks a primitive-by-field helper — see plugin README §rule-evaluation.",
  ),

  // -------------------------------------------------------------------------
  // Pass-2 rules. These could not exist before SPEC-CEL-VALIDATOR shipped:
  // they reference fields/relations introduced by gap-pass-2 (Decision.status
  // chain integrity, Risk impact-mitigation correlation, Capability realiz-
  // ation, Entity deployment-binding, Endpoint deprecation chain) and depend
  // on the host actually evaluating CEL — which is exactly what the §7
  // pipeline now does.
  // -------------------------------------------------------------------------

  // gap #1 — Superseded decisions must be the target of a sw:Supersedes
  // edge from their replacement (the relation is directed source=new →
  // target=old per relations.ts; the old decision sees it as INCOMING).
  rule(
    "sw:val:decision-superseded-has-successor",
    "Superseded decision must name its successor",
    "error",
    ["sw:Decision"],
    'when(field("status") == "Superseded", has_incoming("sw:Supersedes"))',
    'instance.field_values.status == "Superseded" ? graph.incoming("sw:Supersedes").size() >= 1 : true',
    "A Decision with status=Superseded must have at least one incoming sw:Supersedes relation from the decision that replaced it.",
  ),

  // gap #7 — High-impact risks must carry a non-trivial mitigation. (The
  // field is already required by schema, but enforcing non-empty trims at
  // the rule layer makes the policy explicit.)
  rule(
    "sw:val:risk-high-impact-has-mitigation",
    "High-impact risks must have a non-trivial mitigation",
    "error",
    ["sw:Risk"],
    'when(field("impact") == "High", non_trivial(mitigation))',
    'instance.field_values.impact == "High" ? instance.field_values.mitigation.trim().size() > 0 : true',
    "Risks with impact=High cannot ship with placeholder mitigation text.",
  ),

  // gap #8 — A Capability that is not realized by any Endpoint or Event is
  // a documentation orphan. Warn so authors notice (not error: a Capability
  // whose realizations aren't yet wired up is a legitimate intermediate
  // state during design).
  rule(
    "sw:comp:capability-realized",
    "Capability should be realized by at least one Endpoint or Event",
    "warning",
    ["sw:Capability"],
    'has_outgoing("sw:RealizedBy")',
    'graph.outgoing("sw:RealizedBy").size() >= 1',
    "Capabilities should connect to a concrete realization (sw:RealizedBy → sw:Endpoint | sw:Event).",
  ),

  // gap #10 — Active entities should declare where they run. Warning, not
  // error: this is a documentation completeness check, not a correctness
  // invariant. Fires only on lifecycle=Active to avoid noise on
  // Proposed/Deprecated entities.
  rule(
    "sw:comp:active-entity-deployed",
    "Active entity should declare a deployment node",
    "warning",
    ["sw:Entity"],
    'when(field("lifecycle") == "Active", has_outgoing("sw:DeployedTo"))',
    'instance.field_values.lifecycle == "Active" ? graph.outgoing("sw:DeployedTo").size() >= 1 : true',
    "Active entities should have at least one sw:DeployedTo relation pointing at a sw:Node.",
  ),

  // gap #12 — A deprecated Endpoint without a successor is a dead end for
  // callers. Warn so authors point readers at the replacement.
  // The `has()` macro guards the optional `deprecated` field — Endpoints
  // without it return false on the predicate, skipping the chain check.
  rule(
    "sw:val:deprecated-endpoint-has-successor",
    "Deprecated endpoint should name its successor",
    "warning",
    ["sw:Endpoint"],
    'when(field("deprecated") == true, has_outgoing("sw:DeprecatedBy"))',
    'has(instance.field_values.deprecated) && instance.field_values.deprecated == true ? graph.outgoing("sw:DeprecatedBy").size() >= 1 : true',
    "Endpoints with deprecated=true should have at least one outgoing sw:DeprecatedBy relation pointing at the replacement.",
  ),

  // -------------------------------------------------------------------------
  // v1.1 rules — pair with the v1.1 relation additions so every new edge
  // is enforceable.
  // -------------------------------------------------------------------------

  // v1.1 #1 — Every FailureMode should name what it threatens. Without the
  // edge a FailureMode is floating prose: the maintainer cannot answer
  // 'which guarantee fails when this failure fires?' from the graph.
  // Warning, not error: legitimate intermediate states exist where a
  // FailureMode is recorded before its target guarantee is modelled.
  rule(
    "sw:comp:failure-threatens-something",
    "FailureMode should declare what it threatens",
    "warning",
    ["sw:FailureMode"],
    'has_outgoing("sw:Threatens")',
    'graph.outgoing("sw:Threatens").size() >= 1',
    "Every FailureMode should have at least one sw:Threatens edge to the guarantee, invariant, or constraint it endangers — otherwise the failure is documented but ungrounded in the rest of the model.",
  ),

  // v1.1 #4 — Schemas with format=Custom must carry a non-empty version
  // string so downstream consumers have something to pin against. Custom
  // schemas without a version are unusable as a contract surface; raising
  // this to error matches sw:val:contract-has-conditions in spirit.
  rule(
    "sw:val:custom-schema-has-version",
    "Custom-format schema must declare a version",
    "error",
    ["sw:Schema"],
    'when(field("format") == "Custom", non_trivial(version))',
    'instance.field_values.format == "Custom" ? (has(instance.field_values.version) && instance.field_values.version.trim().size() > 0) : true',
    "A sw:Schema with format=\"Custom\" must declare a non-empty version field; without it the schema is unpinnable and cannot serve as a contract surface.",
  ),
];
