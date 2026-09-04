/**
 * A printer for the expression language: formulas, terms, expressions,
 * types and concepts as one line of conventional notation.
 *
 * The layouts below are the vendored schema's own field names (read from
 * the arms with `probe`-style introspection when this file was written and
 * checked by tests/plugins/logical_knowledge_base/renderers.test.ts against
 * schema-valid nodes). A kind the printer does not know prints as
 * `kind(field=…)` from its scalar fields — never a throw and never an
 * empty string, because the renderers run over malformed data too.
 */

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const MAX_DEPTH = 32;

const TRUTH: Record<string, string> = { true: "⊤", false: "⊥", both: "⊤∧⊥", neither: "∅", unknown: "?" };
const COMPARISON: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", equal_numeric: "=", not_equal_numeric: "≠" };
const TEMPORAL_UNARY: Record<string, string> = { past: "P", future: "F", always: "□", eventually: "◇", next: "X", previous: "Y" };
const TEMPORAL_BINARY: Record<string, string> = { until: "U", since: "S" };
const ARITH: Record<string, string> = {
  add: "+", subtract: "−", multiply: "×", divide: "÷", integer_divide: "div", modulo: "mod", power: "^",
  negate: "−", absolute: "abs", square_root: "√", minimum: "min", maximum: "max",
};
const SETOP: Record<string, string> = { union: "∪", intersection: "∩", difference: "∖", symmetric_difference: "△" };

/** A reference prints as the identifier it names. */
export function refName(v: unknown): string {
  if (isRecord(v) && typeof v["targetId"] === "string") {
    const suffix = v["resolution"] === "external" ? "↗" : v["resolution"] === "imported" ? "↑" : "";
    return `${v["targetId"]}${suffix}`;
  }
  if (typeof v === "string") return v;
  return printFormula(v);
}

const scalar = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : v === null || v === undefined ? "∅" : "…";

export function printFormula(value: unknown, depth = 0): string {
  try {
    return print(value, depth);
  } catch {
    return "⟨unprintable⟩";
  }
}

function print(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) return "…";
  if (value === null || value === undefined) return "∅";
  if (typeof value !== "object") return scalar(value);
  if (Array.isArray(value)) return `[${value.map((v) => print(v, depth + 1)).join(", ")}]`;
  const node = value as Json;
  const kind = typeof node["kind"] === "string" ? node["kind"] : undefined;
  const p = (k: string): string => print(node[k], depth + 1);
  const list = (k: string, sep = ", "): string => (Array.isArray(node[k]) ? (node[k] as unknown[]).map((v) => print(v, depth + 1)).join(sep) : "");
  const nary = (sym: string): string => `(${list("operands", ` ${sym} `)})`;
  const vars = (k: string): string =>
    Array.isArray(node[k])
      ? (node[k] as unknown[])
          .map((b) => (isRecord(b) ? `${scalar(b["name"])}${b["type"] !== undefined ? `:${print(b["type"], depth + 1)}` : ""}` : print(b, depth + 1)))
          .join(", ")
      : "";
  const opt = (k: string, fmt: (s: string) => string): string => (node[k] === undefined ? "" : fmt(print(node[k], depth + 1)));

  switch (kind) {
    case undefined:
      if (typeof node["targetId"] === "string") return refName(node);
      return generic("object", node, depth);
    // ── formulas
    case "truth_constant_formula": return TRUTH[String(node["value"])] ?? String(node["value"]);
    case "proposition_reference_formula": return refName(node["proposition"]);
    case "predicate_application_formula": return `${refName(node["predicate"])}(${list("arguments")})`;
    case "higher_order_predicate_application_formula": return `${p("predicate")}(${list("arguments")})`;
    case "not_formula": return `¬${p("operand")}`;
    case "and_formula": return nary("∧");
    case "or_formula": return nary("∨");
    case "xor_formula": return nary("⊕");
    case "logical_implication_formula": return `(${p("antecedent")} ⇒ ${p("consequent")})`;
    case "material_implication_formula": return `(${p("antecedent")} → ${p("consequent")})`;
    case "biconditional_formula": return `(${p("left")} ↔ ${p("right")})`;
    case "forall_formula": return `∀${vars("variables")}. ${p("body")}`;
    case "exists_formula": return `∃${vars("variables")}. ${p("body")}`;
    case "equality_formula": return `${p("left")} = ${p("right")}`;
    case "inequality_formula": return `${p("left")} ≠ ${p("right")}`;
    case "membership_formula": return `${p("element")} ∈ ${p("set")}`;
    case "subset_formula": return `${p("subset")} ⊆ ${p("superset")}`;
    case "proper_subset_formula": return `${p("subset")} ⊂ ${p("superset")}`;
    case "comparison_formula": return `${p("left")} ${COMPARISON[String(node["operator"])] ?? String(node["operator"])} ${p("right")}`;
    case "in_range_formula": return `${p("value")} ∈ ${p("range")}`;
    case "temporal_unary_formula": return `${TEMPORAL_UNARY[String(node["operator"])] ?? String(node["operator"])}(${p("operand")})`;
    case "temporal_binary_formula": return `(${p("left")} ${TEMPORAL_BINARY[String(node["operator"])] ?? String(node["operator"])} ${p("right")})`;
    case "modal_necessity_formula": return `□${opt("agent", (a) => `[${a}]`)}${p("operand")}`;
    case "modal_possibility_formula": return `◇${opt("agent", (a) => `[${a}]`)}${p("operand")}`;
    case "knows_formula": return `K[${refName(node["agent"])}](${p("proposition")})`;
    case "believes_formula": return `B[${refName(node["agent"])}](${p("proposition")})`;
    case "common_knowledge_formula": return `C(${p("proposition")})`;
    case "distributed_knowledge_formula": return `D(${p("proposition")})`;
    case "obligation_formula": return `O(${p("content")})`;
    case "permission_formula": return `P(${p("content")})`;
    case "prohibition_formula": return `F(${p("content")})`;
    case "recommendation_formula": return `Rec(${p("content")})`;
    case "entitlement_formula": return `Ent(${p("content")})`;
    case "violation_formula": return `Viol(${refName(node["norm"])}: ${p("condition")})`;
    case "normative_exception_formula": return `Exc(${p("content")})`;
    case "negation_as_failure_formula": return `not ${p("operand")}`;
    case "fuzzy_truth_formula": return `${p("formula")} ≈ ${scalar(node["degree"])}`;
    case "fuzzy_membership_formula": return `μ(${p("value")})`;
    case "fuzzy_threshold_formula": return `${p("formula")} ≥ ${scalar(node["threshold"])}`;
    case "fuzzy_connective_formula": return nary(String(node["connective"] ?? "⊗"));
    case "probability_assertion_formula": return `P(${p("event")}) = ${scalar(node["probability"])}`;
    case "probability_threshold_formula": return `P(${p("event")}) ${COMPARISON[String(node["comparison"])] ?? "≥"} ${scalar(node["threshold"])}`;
    case "conditional_probability_formula": return `P(${p("event")} | ${p("condition")})`;
    case "causal_relation_formula": return `${p("cause")} ⟶[${scalar(node["relation"])}] ${p("effect")}`;
    case "counterfactual_formula": return `(${list("antecedentInterventions")}) □→ ${p("consequent")}`;
    case "intervention_formula": return `do(${list("interventions")})`;
    case "necessary_cause_formula": return `${p("cause")} ⟵necessary ${p("effect")}`;
    case "sufficient_cause_formula": return `${p("cause")} ⟶sufficient ${p("effect")}`;
    case "concept_assertion_formula": return `${p("individual")} : ${p("concept")}`;
    case "role_assertion_formula": return `${refName(node["property"])}(${p("subject")}, ${p("object")})`;
    case "subsumption_formula": return `${p("subConcept")} ⊑ ${p("superConcept")}`;
    case "concept_equivalence_formula": return `${p("left")} ≡ ${p("right")}`;
    case "concept_disjointness_formula": return `disjoint(${list("concepts")})`;
    case "property_characteristic_formula": return `${scalar(node["characteristic"])}(${refName(node["property"])})`;
    case "event_occurs_formula": return `occurs(${refName(node["event"])})`;
    case "state_holds_formula": return `holds(${refName(node["state"])})`;
    case "action_enabled_formula": return `enabled(${refName(node["action"])})`;
    case "smt_formula": return `${scalar(node["operator"])}(${list("operands")})`;
    // ── terms
    case "variable_term": return scalar(node["name"]);
    case "constant_term":
    case "symbol_reference_term": return refName(node["symbol"]);
    case "qualified_name_term": return scalar(node["name"]);
    case "function_application_term": return `${refName(node["function"])}(${list("arguments")})`;
    case "higher_order_application_term": return `${p("function")}(${list("arguments")})`;
    case "higher_order_reference_term": return refName(node["symbol"]);
    case "list_term": return `[${list("items")}]`;
    case "tuple_term": return `(${list("items")})`;
    case "set_term": return `{${list("items")}}`;
    case "record_term": return `{${list("fields")}}`;
    case "map_term": return `{${list("entries")}}`;
    case "property_access_term": return `${p("object")}.${scalar(isRecord(node["property"]) ? refName(node["property"]) : node["property"])}`;
    case "indexed_access_term": return `${p("object")}[${p("index")}]`;
    case "conditional_term": return `(if ${p("condition")} then ${p("whenTrue")} else ${p("whenFalse")})`;
    case "quantified_term": return `${scalar(node["quantifier"])}{${vars("variables")} | ${p("body")}}`;
    case "lambda_term": return `λ${vars("parameters")}. ${p("body")}`;
    // ── literals
    case "string_literal": return JSON.stringify(scalar(node["value"]));
    case "boolean_literal":
    case "integer_literal":
    case "decimal_literal":
    case "float_literal":
    case "date_literal":
    case "time_literal":
    case "datetime_literal":
    case "duration_literal":
    case "iri_literal":
    case "binary_literal": return scalar(node["value"]);
    case "rational_literal": return `${scalar(node["numerator"])}/${scalar(node["denominator"])}`;
    case "null_literal": return "null";
    case "custom_typed_literal": return `${JSON.stringify(scalar(node["lexicalForm"]))}^^${scalar(node["datatype"])}`;
    // ── expressions
    case "arithmetic_expression": {
      const op = ARITH[String(node["operator"])] ?? String(node["operator"]);
      const ops = Array.isArray(node["operands"]) ? (node["operands"] as unknown[]) : [];
      if (ops.length === 1) return `${op}(${print(ops[0], depth + 1)})`;
      return `(${ops.map((o) => print(o, depth + 1)).join(` ${op} `)})`;
    }
    case "aggregate_expression": return `${scalar(node["operator"])}(${p("source")})`;
    case "range_expression": return `${node["startInclusive"] === false ? "(" : "["}${opt("start", (s) => s)}..${opt("end", (s) => s)}${node["endInclusive"] === false ? ")" : "]"}`;
    case "set_operation_expression": return nary(SETOP[String(node["operator"])] ?? String(node["operator"]));
    case "set_complement_expression": return `∁${p("operand")}`;
    case "set_comprehension_expression": return `{${vars("variables")} | ${p("condition")}}`;
    case "cardinality_expression": return `|${p("collection")}|`;
    case "quantity_expression": return `${p("magnitude")} ${refName(node["unit"])}`;
    case "relation_composition_expression": return `(${list("relations", " ∘ ")})`;
    case "temporal_instant_expression": return `t(${p("instant")})`;
    case "temporal_interval_expression": return `[${p("start")}, ${p("end")}]`;
    case "temporal_duration_expression": return `Δ${p("duration")}`;
    case "recurrence_expression": return `every(${p("recurrence")})`;
    case "smt_value_expression": return `${scalar(node["operator"])}(${list("operands")})`;
    // ── types
    case "primitive_type": return scalar(node["name"]);
    case "named_type": return isRecord(node["name"]) ? refName(node["name"]) : scalar(node["name"]);
    case "truth_type": return `truth<${scalar(node["domain"])}>`;
    case "collection_type": return `${scalar(node["collectionKind"])}<${opt("elementType", (s) => s)}${node["keyType"] !== undefined ? `${p("keyType")}, ${p("valueType")}` : ""}>`;
    case "union_type": return `(${list("members", " | ")})`;
    case "intersection_type": return `(${list("members", " & ")})`;
    case "tuple_type": return `(${list("members")})`;
    case "record_type": return `{${list("fields")}}`;
    case "function_type": return `(${list("parameters")}) → ${p("returnType")}`;
    case "predicate_type": return `pred(${list("parameters")})`;
    case "refined_type": return `{${scalar(node["binder"])}: ${p("baseType")} | ${p("predicate")}}`;
    case "generic_application_type": return `${p("base")}<${list("arguments")}>`;
    case "numeric_type": return scalar(node["numericKind"] ?? "number");
    case "temporal_type": return scalar(node["temporalKind"] ?? "temporal");
    case "ontology_class_type": return refName(node["concept"]);
    // ── concepts
    case "concept_reference": return refName(node["concept"]);
    case "top_concept": return "⊤";
    case "bottom_concept": return "⊥";
    case "concept_intersection": return nary("⊓");
    case "concept_union": return nary("⊔");
    case "concept_complement": return `¬${p("operand")}`;
    case "object_some_values_from_concept": return `∃${refName(node["property"])}.${p("filler")}`;
    case "object_all_values_from_concept": return `∀${refName(node["property"])}.${p("filler")}`;
    case "object_has_value_concept": return `∃${refName(node["property"])}.{${p("value")}}`;
    case "object_has_self_concept": return `∃${refName(node["property"])}.Self`;
    case "object_cardinality_concept": return `${scalar(node["comparison"] ?? "=")}${scalar(node["cardinality"])} ${refName(node["property"])}`;
    case "data_some_values_from_concept": return `∃${refName(node["property"])}.${p("range")}`;
    case "data_all_values_from_concept": return `∀${refName(node["property"])}.${p("range")}`;
    case "data_has_value_concept": return `∃${refName(node["property"])}.{${p("value")}}`;
    case "nominal_concept": return `{${list("individuals")}}`;
    // ── bindings and references
    case "variable_binding": return `${scalar(node["name"])}${node["type"] !== undefined ? `:${p("type")}` : ""}`;
    case "reference": return refName(node);
    default:
      return generic(kind, node, depth);
  }
}

/** `kind(field=value, …)` over scalar fields; nested nodes print recursively, at most four fields. */
function generic(kind: string, node: Json, depth: number): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(node)) {
    if (k === "kind" || k === "id" || v === undefined || v === null) continue;
    if (parts.length >= 4) {
      parts.push("…");
      break;
    }
    if (typeof v === "object") parts.push(`${k}=${print(v, depth + 1)}`);
    else parts.push(`${k}=${scalar(v)}`);
  }
  return `${kind}(${parts.join(", ")})`;
}

/** One line, capped, for tables and node labels. */
export function printShort(value: unknown, max = 160): string {
  const s = printFormula(value).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
