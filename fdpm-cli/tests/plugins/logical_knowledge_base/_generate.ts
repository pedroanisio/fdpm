/**
 * A document with one node of EVERY kind, synthesised from the vendored
 * schema's arms. The round-trip test over it turns "the fixture round-trips"
 * into "every node kind round-trips": each of the 115 kinds is imported,
 * exported and canonically compared.
 *
 * Generation is mechanical: required fields only, values chosen from the
 * schema's own constraints (first enum value, the smallest number the bounds
 * allow, a string that matches the declared pattern, the first arm of a
 * union, the leaf of a recursive root). References point at one shared
 * declaration unless a kind needs a specific target family, listed in
 * `TARGETS`; those are the schema's semantic checks, not shape.
 */
import type { z } from "zod";
import * as L from "../../../plugins/logical_knowledge_base/schemas/lkb.js";
import {
  ROOT_COLLECTIONS,
  arms,
  kindOf,
  nodeArms,
  rootObject,
  unwrapOptional,
  zdef,
  type NodeArm,
} from "../../../plugins/logical_knowledge_base/derive.js";

type Json = Record<string, unknown>;

const SHARED_TARGET = "gen:type_declaration";

/** Fields that must point at a node of a particular kind for the semantic checks to pass. */
const TARGETS: Record<string, Record<string, string | string[]>> = {
  proof_tree: { rootStep: "step" },
  derivation_graph: {},
  explanation_trace: {},
  process_model: { entryPoints: ["element"] },
  sequence: { steps: ["element"] },
  trigger: { target: "element" },
  compensation_handler: { handles: ["element"] },
  transition: { fromState: "state_instance", toState: "state_instance" },
  argumentation_framework: { argumentRefs: ["gen:argument"], relationRefs: ["gen:attack_relation"] },
  // The profile declares these families as target types (a deliberate tightening; see derive.ts).
  constraint_group: { members: ["gen:hard_constraint"] },
  argument: { premiseRefs: ["gen:claim"], conclusionRef: "gen:claim" },
  support_relation: { supporter: "gen:argument", supported: "gen:claim" },
  attack_relation: { attacker: "gen:claim", attacked: "gen:argument" },
  rebuttal: { rebuttingClaim: "gen:claim", targetClaim: "gen:claim" },
  undercutter: { claim: "gen:claim", targetArgument: "gen:argument" },
  event_instance: { event: "gen:event_declaration" },
  action_instance: { action: "gen:action_declaration" },
  state_instance: { state: "gen:state_declaration" },
  world_declaration: {},
  definition_statement: { symbol: "gen:constant_declaration" },
  provenance_record: {},
};

const SAMPLE_STRINGS = [
  "gen:x", "name1", "ex:name", "https://example.org/x", "1.0.0", "2026-01-01T00:00:00Z", "2026-01-01", "12:00:00", "PT1H",
  "1", "0", "1.5", "abcd", "a", "x", "en", "A", "1.0", "-1", "0.5",
];

function sampleString(schema: z.ZodTypeAny): string {
  const checks = (zdef(schema).checks ?? []).map((c) => (c as { _zod: { def: { check: string; format?: string; pattern?: RegExp; minimum?: number; maximum?: number } } })._zod.def);
  const fmt = checks.find((c) => c.check === "string_format");
  const min = checks.find((c) => c.check === "min_length")?.minimum ?? 0;
  const max = checks.find((c) => c.check === "max_length")?.maximum ?? 4096;
  if (fmt?.format === "datetime") return "2026-01-01T00:00:00Z";
  if (fmt?.format === "date") return "2026-01-01";
  if (fmt?.format === "time") return "12:00:00";
  if (fmt?.format === "duration") return "PT1H";
  const re = fmt?.pattern;
  for (const s of SAMPLE_STRINGS) {
    if (s.length < min || s.length > max) continue;
    if (re && !re.test(s)) continue;
    return s;
  }
  throw new Error(`no sample string for ${re?.source ?? fmt?.format ?? "string"} (min ${min})`);
}

function sampleNumber(schema: z.ZodTypeAny): number {
  const checks = (zdef(schema).checks ?? []).map((c) => (c as { _zod: { def: { check: string; value?: number; inclusive?: boolean } } })._zod.def);
  const gt = checks.find((c) => c.check === "greater_than");
  const isInt = checks.some((c) => c.check === "number_format");
  let v = gt ? (gt.inclusive ? gt.value! : gt.value! + (isInt ? 1 : 0.5)) : 0;
  const lt = checks.find((c) => c.check === "less_than");
  if (lt && ((lt.inclusive && v > lt.value!) || (!lt.inclusive && v >= lt.value!))) v = lt.value! - (isInt ? 1 : 0.5);
  return v;
}

const LEAVES = new Map<z.ZodTypeAny, Json>([
  [L.FormulaSchema, { kind: "truth_constant_formula", value: "true" }],
  [L.TermSchema, { kind: "integer_literal", value: "1" }],
  [L.ValueExpressionSchema, { kind: "integer_literal", value: "1" }],
  [L.ExpressionSchema, { kind: "cardinality_expression", collection: { kind: "integer_literal", value: "1" } }],
  [L.TypeExpressionSchema, { kind: "primitive_type", name: "string" }],
  [L.ConceptExpressionSchema, { kind: "top_concept" }],
  [L.VariableBindingSchema, { kind: "variable_binding", name: "v" }],
  [L.JsonValueSchema, 1 as unknown as Json],
]);

export class Generator {
  private counter = 0;
  readonly steps: string[] = [];
  readonly elements: string[] = [];
  readonly stateInstances: string[] = [];

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}:${this.counter}`;
  }

  /** A value for `schema`; `hint` is the field name, for ids and references. */
  value(schema: z.ZodTypeAny, hint: string, kind: string, depth: number): unknown {
    const s = unwrapOptional(schema);
    // Semantic checks the shape cannot express: a `norm` is a deontic formula.
    if (hint === "norm" && s === L.FormulaSchema) {
      return { kind: "obligation_formula", content: { kind: "truth_constant_formula", value: "true" } };
    }
    const leaf = LEAVES.get(s);
    if (leaf !== undefined) return JSON.parse(JSON.stringify(leaf));
    if (s === L.ReferenceSchema) return this.reference(kind, hint);
    const d = zdef(s);
    switch (d.type) {
      case "string":
        // Ids must be unique document-wide; declaration names must be unique too.
        if (hint === "id") return this.nextId("gen:id");
        if (hint === "name") return `n${++this.counter}`;
        return sampleString(s);
      case "number": return sampleNumber(s);
      case "boolean": return true;
      case "enum": return Object.keys(d.entries ?? {})[0];
      case "literal": return d.values?.[0];
      case "array": {
        const checks = (d.checks ?? []).map((c) => (c as { _zod: { def: { check: string; minimum?: number } } })._zod.def);
        const min = checks.find((c) => c.check === "min_length")?.minimum ?? 0;
        const n = Math.max(min, 0);
        const element = d.element!;
        if (element === L.InferenceStepSchema) return Array.from({ length: n }, () => this.nestedNode(element, "step"));
        const out: unknown[] = [];
        for (let i = 0; i < n; i += 1) out.push(this.value(element, hint, kind, depth + 1));
        return out;
      }
      case "object": return this.object(s as z.ZodObject<z.ZodRawShape>, kind, depth + 1);
      case "union": {
        if (depth > 6) throw new Error(`union too deep at ${kind}.${hint}`);
        const first = d.options?.[0];
        if (!first) return null;
        return this.value(first, hint, kind, depth + 1);
      }
      case "lazy": return this.value(d.getter!(), hint, kind, depth + 1);
      case "record": return {};
      case "tuple": return (d as unknown as { items: z.ZodTypeAny[] }).items.map((t) => this.value(t, hint, kind, depth + 1));
      case "nullable": return null;
      default: throw new Error(`no generator for ${d.type} at ${kind}.${hint}`);
    }
  }

  private reference(kind: string, field: string): Json {
    const spec = TARGETS[kind]?.[field];
    const target = this.resolveTarget(spec, kind, field);
    return { kind: "reference", targetId: target, resolution: "local" };
  }

  private resolveTarget(spec: string | string[] | undefined, kind: string, field: string): string {
    const one = Array.isArray(spec) ? spec[0]! : spec;
    if (one === undefined) return SHARED_TARGET;
    if (one === "step") return this.steps[0] ?? SHARED_TARGET;
    if (one === "element") return this.elements[0] ?? SHARED_TARGET;
    if (one === "state_instance") return this.stateInstances[0] ?? SHARED_TARGET;
    void kind;
    void field;
    return one;
  }

  object(schema: z.ZodObject<z.ZodRawShape>, kind: string, depth: number): Json {
    const out: Json = {};
    for (const [k, v] of Object.entries(zdef(schema).shape ?? {})) {
      if (zdef(v as z.ZodTypeAny).type === "optional") continue;
      out[k] = this.value(v as z.ZodTypeAny, k, kind, depth);
    }
    return out;
  }

  /** A nested id-bearing node (a step or a process element) from the first arm of its union. */
  nestedNode(union: z.ZodTypeAny, placement: "step" | "element"): Json {
    const [arm] = arms(union);
    return this.node(arm!, placement);
  }

  node(arm: z.ZodObject<z.ZodRawShape>, placement: "root" | "step" | "element"): Json {
    const kind = kindOf(arm);
    const out: Json = { kind };
    const shape = zdef(arm).shape ?? {};
    // Ids first, so references generated later can find them.
    const id = placement === "root" ? `gen:${kind}` : this.nextId(`gen:${kind}`);
    if (placement === "step") this.steps.push(id);
    if (placement === "element") {
      this.elements.push(id);
      if (kind === "state_instance") this.stateInstances.push(id);
    }
    for (const [k, v] of Object.entries(shape)) {
      if (k === "kind") continue;
      if (k === "id") {
        out[k] = id;
        continue;
      }
      if (k === "appliedRules" && placement === "step") {
        // Four step kinds require at least one applied rule; harmless on the rest.
        out[k] = [{ kind: "reference", targetId: "gen:strict_rule", resolution: "local" }];
        continue;
      }
      if (zdef(v as z.ZodTypeAny).type === "optional") continue;
      if (k === "elements") {
        const element = zdef(unwrapOptional(v as z.ZodTypeAny)).element!;
        out[k] = arms(element).map((a) => this.node(a, "element"));
        continue;
      }
      out[k] = this.value(v as z.ZodTypeAny, k, kind, 0);
    }
    POST_FIXUPS[kind]?.(out);
    return out;
  }
}

const positiveAtom = (): Json => ({
  kind: "predicate_application_formula",
  predicate: { kind: "reference", targetId: "gen:predicate_declaration", resolution: "local" },
  arguments: [],
});

/**
 * Upstream's domain-specific checks (`collectDomainSpecificIssues`) that the
 * arm shapes cannot express. Each entry is one rule the generator would
 * otherwise trip, named by the message it produces.
 */
const POST_FIXUPS: Record<string, (node: Json) => void> = {
  // "A Datalog head must be a positive atom" (a single formula, not a list)
  datalog_rule: (n) => {
    n["head"] = positiveAtom();
  },
  // "Projected variable '…' is not declared by the query"
  variable_bindings_query: (n) => {
    const variables = Array.isArray(n["variables"]) && (n["variables"] as Json[]).length > 0
      ? (n["variables"] as Json[])
      : [{ kind: "variable_binding", name: "v" }];
    n["variables"] = variables;
    n["projection"] = variables.map((v) => v["name"]);
  },
  // "Designated truth value '…' is not declared"
  truth_domain_declaration: (n) => {
    const values = Array.isArray(n["values"]) ? (n["values"] as Json[]) : [];
    if (values[0] && typeof values[0]["name"] === "string") n["designatedValues"] = [values[0]["name"]];
  },
  // "Decision row has 0 input entries; expected 1"
  decision_table_rule: (n) => {
    const inputs = Array.isArray(n["inputs"]) ? n["inputs"] : [];
    const outputs = Array.isArray(n["outputs"]) ? n["outputs"] : [];
    for (const row of Array.isArray(n["rows"]) ? (n["rows"] as Json[]) : []) {
      row["inputEntries"] = inputs.map(() => ({ kind: "wildcard_cell" }));
      row["outputEntries"] = outputs.map(() => ({ kind: "output_value_cell", value: { kind: "integer_literal", value: "1" } }));
    }
  },
  // "A probabilistic rule requires probability or distribution"
  probabilistic_rule: (n) => {
    n["probability"] = 0.5;
  },
  // "Proof-tree rootStep must reference a step in this proof"
  proof_tree: (n) => {
    const steps = Array.isArray(n["steps"]) ? (n["steps"] as Json[]) : [];
    if (steps[0]) n["rootStep"] = { kind: "reference", targetId: steps[0]["id"], resolution: "local" };
  },
};

/** One node per root kind (plus one step per step kind and one element per element kind), assembled into a document. */
export function generateAllKindsDocument(): { document: Json; kinds: string[] } {
  const gen = new Generator();
  const byCollection = new Map<string, Json[]>();
  const kinds: string[] = [];
  const rootArms: NodeArm[] = nodeArms().filter((a) => a.placement === "root");
  // Declarations first so the shared target exists for every reference.
  const ordered = [...rootArms].sort((a, b) => ROOT_COLLECTIONS.indexOf(a.collection) - ROOT_COLLECTIONS.indexOf(b.collection));
  for (const arm of ordered) {
    const node = gen.node(arm.schema, "root");
    kinds.push(arm.kind);
    byCollection.set(arm.collection, [...(byCollection.get(arm.collection) ?? []), node]);
  }
  // Every step kind, hung on the derivation graph (any proof accepts steps).
  const stepArms = nodeArms().filter((a) => a.placement === "step");
  const graph = byCollection.get("proofs")!.find((p) => p["kind"] === "derivation_graph")!;
  graph["steps"] = stepArms.map((a) => gen.node(a.schema, "step"));
  kinds.push(...stepArms.map((a) => a.kind));
  kinds.push(...nodeArms().filter((a) => a.placement === "element").map((a) => a.kind));
  const header = gen.object(rootObject(), "logical_knowledge_base", 0);
  for (const c of ROOT_COLLECTIONS) delete header[c];
  const document: Json = { ...header, kind: "logical_knowledge_base", id: "gen:document" };
  for (const c of ROOT_COLLECTIONS) {
    const members = byCollection.get(c);
    if (members) document[c] = members;
  }
  return { document, kinds };
}
