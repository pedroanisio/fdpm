/**
 * The rule apparatus (§1.3): rules, the basis they belong to, and side
 * conditions.
 *
 * `Req(rho)` — the required predecessor types — is modelled as a relation to
 * the node-type vocabulary in the ontology. Here the vocabulary is an enum
 * rather than a set of individuals, so the requirement is a list field on the
 * rule. The multiset and semantic-obligation detail is beyond both mappings.
 */
import { bool, enumOf, primitive, str, text } from "../_common.js";
import { NODE_TYPES } from "../enums.js";

export const RULE = primitive("recrt:Rule", "Rule", "An inference or decomposition rule rho in R (§1.3).", [
  str("id", "Stable identifier.", { required: true }),
  str("name", "Rule name.", { required: true }),
  text("statement", "What the rule licenses."),
  {
    name: "requires_predecessor_types",
    kind: "list",
    required: false,
    description: "Req(rho), approximated as the required predecessor types.",
    validations: [],
    item_field: enumOf("item", NODE_TYPES, "A required predecessor type."),
  },
]);

export const RULE_BASIS = primitive("recrt:RuleBasis", "Rule basis", "A rule basis R.", [
  str("id", "Stable identifier.", { required: true }),
  str("name", "Basis name, e.g. first-order logic.", { required: true }),
  bool(
    "is_complete",
    "Whether R is a sound and complete calculus. Bounds Theorem 7 (§6.7): limit completeness fails for an incomplete basis (Goedel 1931).",
    { required: true },
  ),
]);

export const SIDE_CONDITION = primitive(
  "recrt:SideCondition",
  "Side condition",
  "A side condition, an element of C.",
  [
    str("id", "Stable identifier.", { required: true }),
    text("statement", "The condition that must hold.", { required: true }),
  ],
);
