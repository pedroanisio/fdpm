/**
 * The constraints a FieldDef cannot state.
 *
 * Upstream, the schema checks a document in two layers: each node's own
 * shape (Zod), and twelve whole-document passes over the assembled tree.
 * The split is kept, one layer down:
 *
 *  - `lkb:val:node-shape` parses every node's stored fields with the node's
 *    own arm of the vendored schema — every string pattern, numeric bound,
 *    enum and every formula, term, type and concept inside a JSON field —
 *    so the expression language is checked exactly as upstream checks it,
 *    at write time, for the single node being written. Lifted fields
 *    (references, provenance, containment) are edges and are excluded.
 *  - The relation validators re-state, per edge, what upstream states per
 *    reference instance: family agreement (`matchesTargetFamily`, ported),
 *    resolution/externalUri consistency (the `Reference` refinement), the
 *    rule-priority acyclicity check and the self-parent check.
 *  - `lkb:val:arity` is upstream's `collectSymbolAndArityIssues`, run over the
 *    one node being written against the declarations in the workbook.
 *  - `lkb:val:document`, on the header, reassembles the workbook and runs
 *    the root schema. It is the whole upstream verifier, not a port of it.
 *    Its findings are warnings on the write path — a document is assembled
 *    one node at a time and cannot be complete at every write — and
 *    conclusive on `fdpm validate`; the `lkb-json` exporter refuses until
 *    they clear.
 *
 * Every loop here is bounded by the workbook's size or an explicit depth cap.
 */
import { z } from "zod";
import type { PrimitiveInstance, RelationInstance, ValidationFinding } from "../../src/core/models/instance.js";
import type { PluginContext, ValidatorContext, ValidatorFn } from "../../src/plugin/types.js";
import {
  EXTERNAL_TARGET_TYPE_ID,
  HEADER_TYPE_ID,
  REF_RELATION_PREFIX,
  ROOT_COLLECTIONS,
  SOURCE_ID_FIELD,
  STEP_RELATION_ID,
  armByTypeId,
  derive,
  referenceRelationId,
  rootObject,
  typeIdFor,
  zdef,
} from "./derive.js";
import { groundedResults } from "./grounded.js";
import { formatPath, mentionEdges, sourceIdIndex, verifyWorkbook } from "./transfer.js";
import { MENTIONS_RELATION_ID } from "./derive.js";

export const VALIDATOR_RULE_IDS = {
  nodeShape: "lkb:val:node-shape",
  referenceFamily: "lkb:val:reference-family",
  referenceResolution: "lkb:val:reference-resolution",
  arity: "lkb:val:arity",
  ruleCycle: "lkb:val:rule-cycle",
  selfParent: "lkb:val:self-parent",
  stepSlot: "lkb:val:step-slot",
  singleHeader: "lkb:val:single-header",
  document: "lkb:val:document",
  mentionsCurrent: "lkb:val:mentions-current",
  frameworkGrounded: "lkb:val:framework-grounded",
} as const;

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const finding = (
  rule_id: string,
  level: "error" | "warning",
  target_id: string,
  message: string,
  field_path: string | null = null,
): ValidationFinding => ({ level, rule_id, target_id, field_path, message });

const MAX_ISSUES = 25;

// ── Node shape ──────────────────────────────────────────────────────────

const NODE_SCHEMAS = new Map<string, z.ZodTypeAny>();

/** The arm with `kind`, `id` and every lifted field removed; strict, like the arm. */
function nodeLocalSchema(typeId: string): z.ZodTypeAny | undefined {
  const cached = NODE_SCHEMAS.get(typeId);
  if (cached) return cached;
  let shape: Record<string, z.ZodTypeAny> | undefined;
  const drop = new Set<string>(["kind", "id"]);
  if (typeId === HEADER_TYPE_ID) {
    shape = zdef(rootObject()).shape;
    for (const c of ROOT_COLLECTIONS) drop.add(c);
  } else {
    const nt = derive().nodeTypes.find((n) => n.type.id === typeId);
    if (!nt) return undefined;
    shape = zdef(nt.arm.schema).shape;
    for (const l of nt.lifted) {
      if (l.lift === "reference") drop.add(l.field);
      else if (l.lift === "provenance") drop.add("provenance");
      else if (l.lift === "steps") drop.add(l.field);
      else drop.add("elements");
    }
  }
  if (!shape) return undefined;
  const picked: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(shape)) if (!drop.has(k)) picked[k] = v;
  const schema = z.strictObject(picked);
  NODE_SCHEMAS.set(typeId, schema);
  return schema;
}

const nodeShape: ValidatorFn = (instance) => {
  const p = instance as PrimitiveInstance;
  if (p.type_id === EXTERNAL_TARGET_TYPE_ID) return [];
  const schema = nodeLocalSchema(p.type_id);
  if (!schema) return [];
  const values: Json = {};
  for (const [k, v] of Object.entries(p.field_values ?? {})) {
    if (k === SOURCE_ID_FIELD || v === undefined || v === null) continue;
    values[k] = v;
  }
  const result = schema.safeParse(values);
  if (result.success) return [];
  return result.error.issues.slice(0, MAX_ISSUES).map((issue) =>
    finding(
      VALIDATOR_RULE_IDS.nodeShape,
      "error",
      p.id,
      `${formatPath(issue.path)}: ${issue.message}`,
      issue.path.length > 0 ? `field_values.${String(issue.path[0])}` : null,
    ),
  );
};

// ── Families (ported from upstream matchesTargetFamily) ─────────────────

const SYMBOL_DECLARATION_KINDS = new Set([
  "constant_declaration", "function_declaration", "predicate_declaration", "proposition_declaration",
  "relation_declaration", "unit_declaration", "concept_declaration", "individual_declaration",
  "object_property_declaration", "data_property_declaration", "linguistic_variable_declaration",
  "truth_domain_declaration", "event_declaration", "action_declaration", "state_declaration",
  "accessibility_relation_declaration", "causal_variable_declaration",
]);

function kindsIn(collection: (typeof ROOT_COLLECTIONS)[number]): Set<string> {
  return new Set(derive().nodeTypes.filter((n) => n.arm.collection === collection && n.arm.placement === "root").map((n) => n.arm.kind));
}
let FAMILY_SETS:
  | { declaration: Set<string>; rule: Set<string>; constraint: Set<string>; query: Set<string>; proof: Set<string>; argument: Set<string>; process: Set<string> }
  | undefined;
function familySets() {
  return (FAMILY_SETS ??= {
    declaration: kindsIn("declarations"),
    rule: kindsIn("rules"),
    constraint: kindsIn("constraints"),
    query: kindsIn("queries"),
    proof: kindsIn("proofs"),
    argument: kindsIn("argumentation"),
    process: new Set([
      ...kindsIn("processes"),
      ...derive().nodeTypes.filter((n) => n.arm.placement === "element").map((n) => n.arm.kind),
    ]),
  });
}

export function matchesTargetFamily(kind: string, family: string): boolean {
  const s = familySets();
  switch (family) {
    case "node": return true;
    case "symbol": return SYMBOL_DECLARATION_KINDS.has(kind);
    case "type": return kind === "type_declaration" || kind === "concept_declaration";
    case "declaration": return s.declaration.has(kind) || kind === "namespace_declaration";
    case "statement": return kind.endsWith("_statement");
    case "rule": return s.rule.has(kind);
    case "constraint": return s.constraint.has(kind);
    case "query": return s.query.has(kind);
    case "proof": return s.proof.has(kind) || kind.endsWith("_step");
    case "context": return kind === "context_declaration" || kind === "namespace_declaration";
    case "world": return kind === "world_declaration";
    case "agent": return kind === "agent_declaration";
    case "jurisdiction": return kind === "jurisdiction_declaration";
    case "organization": return kind === "organization_declaration";
    case "environment": return kind === "environment_declaration";
    case "security_domain": return kind === "security_domain_declaration";
    case "assumption_set": return kind === "assumption_set_declaration";
    case "event": return kind === "event_declaration" || kind === "event_instance";
    case "action": return kind === "action_declaration" || kind === "action_instance";
    case "state": return kind === "state_declaration" || kind === "state_instance";
    case "argument": return s.argument.has(kind);
    case "process": return s.process.has(kind);
    case "provenance": return kind === "provenance_record";
    case "module": return kind === "module";
    case "extension": return kind === "extension";
    default: return false;
  }
}

/** The document kind of a primitive, or undefined for the external-target stub. */
function kindOfPrimitive(p: Pick<PrimitiveInstance, "type_id">): string | undefined {
  if (p.type_id === HEADER_TYPE_ID) return "logical_knowledge_base";
  if (p.type_id === EXTERNAL_TARGET_TYPE_ID) return undefined;
  return armByTypeId(p.type_id)?.kind;
}

const primitivesOf = (ctx: ValidatorContext | undefined): Record<string, PrimitiveInstance> | undefined =>
  ctx?.workbook?.primitives as Record<string, PrimitiveInstance> | undefined;
const relationsOf = (ctx: ValidatorContext | undefined): RelationInstance[] =>
  (ctx?.workbook ? Object.values(ctx.workbook.relations) : ctx?.relations ?? []) as RelationInstance[];

const noContext = (rule: string, target: string): ValidationFinding[] => [
  finding(rule, "warning", target, `${rule} needs the workbook context and was not given one; the check did not run`),
];

// ── Reference edges ─────────────────────────────────────────────────────

const referenceFamily: ValidatorFn = (instance, _t, _p, ctx) => {
  const r = instance as RelationInstance;
  const fv = r.field_values ?? {};
  const family = fv["target_family"];
  if (typeof family !== "string") return [];
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.referenceFamily, r.id);
  const target = prims[r.target_id];
  if (!target) return []; // the host's endpoint check reports the missing node
  const kind = kindOfPrimitive(target);
  if (kind === undefined) return []; // external target: family is the remote document's business
  if (matchesTargetFamily(kind, family)) return [];
  return [
    finding(
      VALIDATOR_RULE_IDS.referenceFamily,
      "error",
      r.id,
      `Reference expects family '${family}', but '${r.target_id}' is '${kind}'`,
      "field_values.target_family",
    ),
  ];
};

const referenceResolution: ValidatorFn = (instance, _t, _p, ctx) => {
  const r = instance as RelationInstance;
  const fv = r.field_values ?? {};
  const resolution = fv["resolution"];
  const out: ValidationFinding[] = [];
  const prims = primitivesOf(ctx);
  const target = prims?.[r.target_id];
  const targetIsExternal = target?.type_id === EXTERNAL_TARGET_TYPE_ID;
  const uri = fv["external_uri"] ?? (targetIsExternal ? target?.field_values?.["external_uri"] : undefined);
  if (resolution === "external" && typeof uri !== "string") {
    out.push(finding(VALIDATOR_RULE_IDS.referenceResolution, "error", r.id, "External references must declare external_uri", "field_values.external_uri"));
  }
  if (resolution !== "external" && typeof fv["external_uri"] === "string") {
    out.push(finding(VALIDATOR_RULE_IDS.referenceResolution, "error", r.id, "external_uri is only valid for external references", "field_values.external_uri"));
  }
  if (target) {
    if (resolution === "local" && targetIsExternal) {
      out.push(finding(VALIDATOR_RULE_IDS.referenceResolution, "error", r.id, `a local reference cannot target ${EXTERNAL_TARGET_TYPE_ID} ${r.target_id}`));
    }
    if (resolution !== "local" && !targetIsExternal) {
      out.push(finding(VALIDATOR_RULE_IDS.referenceResolution, "error", r.id, `a ${String(resolution)} reference must target an ${EXTERNAL_TARGET_TYPE_ID}, not the document node ${r.target_id}`));
    }
  }
  return out;
};

const selfParent: ValidatorFn = (instance) => {
  const r = instance as RelationInstance;
  if (r.source_id !== r.target_id) return [];
  return [finding(VALIDATOR_RULE_IDS.selfParent, "error", r.id, `${r.type_id}: a node cannot be its own parent (${r.source_id})`)];
};

const PRIORITY_EDGE_TYPES = new Set([referenceRelationId("priorityOver"), referenceRelationId("overrides")]);

/** Would this edge close a cycle of priorityOver/overrides edges? Iterative DFS, bounded by the edge count. */
const ruleCycle: ValidatorFn = (instance, _t, _p, ctx) => {
  const r = instance as RelationInstance;
  const next = new Map<string, string[]>();
  const add = (from: string, to: string) => next.set(from, [...(next.get(from) ?? []), to]);
  for (const e of relationsOf(ctx)) if (PRIORITY_EDGE_TYPES.has(e.type_id) && e.id !== r.id) add(e.source_id, e.target_id);
  add(r.source_id, r.target_id);
  // Is r.source_id reachable from r.target_id?
  const seen = new Set<string>();
  const stack = [r.target_id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === r.source_id) {
      return [finding(VALIDATOR_RULE_IDS.ruleCycle, "error", r.id, `${r.type_id} ${r.source_id} → ${r.target_id} closes a priority cycle among rules`)];
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of next.get(cur) ?? []) stack.push(n);
  }
  return [];
};

const TRACE_SOURCE = typeIdFor("counterexample");

const stepSlot: ValidatorFn = (instance, _t, _p, ctx) => {
  const r = instance as RelationInstance;
  const slot = r.field_values?.["slot"];
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.stepSlot, r.id);
  const source = prims[r.source_id];
  if (!source) return [];
  const isTrace = source.type_id === TRACE_SOURCE;
  if (slot === "trace" && !isTrace) {
    return [finding(VALIDATOR_RULE_IDS.stepSlot, "error", r.id, `slot 'trace' belongs to a counterexample; ${r.source_id} is ${source.type_id}`, "field_values.slot")];
  }
  if (slot === "steps" && isTrace) {
    return [finding(VALIDATOR_RULE_IDS.stepSlot, "error", r.id, "a counterexample nests its steps under 'trace', not 'steps'", "field_values.slot")];
  }
  return [];
};

// ── Arity (ported from upstream collectSymbolAndArityIssues) ────────────

const MAX_WALK_DEPTH = 64;
const MAX_WALK_NODES = 50_000;

interface Application {
  path: string;
  kind: "function_application_term" | "predicate_application_formula";
  targetId: string;
  argumentCount: number;
}

function collectApplications(values: Json): Application[] {
  const out: Application[] = [];
  let visited = 0;
  const walk = (value: unknown, path: (string | number)[], depth: number): void => {
    if (depth > MAX_WALK_DEPTH || visited++ > MAX_WALK_NODES) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, [...path, i], depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    const kind = value["kind"];
    if (kind === "function_application_term" || kind === "predicate_application_formula") {
      const ref = value[kind === "function_application_term" ? "function" : "predicate"];
      if (isRecord(ref) && ref["resolution"] === "local" && typeof ref["targetId"] === "string") {
        out.push({
          path: formatPath(path),
          kind,
          targetId: ref["targetId"],
          argumentCount: Array.isArray(value["arguments"]) ? value["arguments"].length : 0,
        });
      }
    }
    for (const [k, v] of Object.entries(value)) walk(v, [...path, k], depth + 1);
  };
  for (const [k, v] of Object.entries(values)) if (k !== SOURCE_ID_FIELD) walk(v, [k], 0);
  return out;
}

const DECLARATION_TYPE_IDS = new Set<string>();
function declarationTypeIds(): Set<string> {
  if (DECLARATION_TYPE_IDS.size === 0) {
    for (const nt of derive().nodeTypes) if (nt.arm.collection === "declarations") DECLARATION_TYPE_IDS.add(nt.type.id);
  }
  return DECLARATION_TYPE_IDS;
}

/**
 * Declarations by source id, memoised per workbook snapshot. The pipeline
 * hands every validator of one write the same `workbook.primitives` object,
 * so the index is built once per write rather than once per validator; a
 * new snapshot (the next write) gets a new index. Keyed weakly so nothing
 * outlives the snapshot.
 */
const DECLARATION_INDEX = new WeakMap<object, Map<string, PrimitiveInstance>>();
function declarationIndex(prims: Record<string, PrimitiveInstance>): Map<string, PrimitiveInstance> {
  const cached = DECLARATION_INDEX.get(prims);
  if (cached) return cached;
  const declarations = new Map<string, PrimitiveInstance>();
  const declTypes = declarationTypeIds();
  for (const d of Object.values(prims)) {
    if (!declTypes.has(d.type_id)) continue;
    const sid = d.field_values?.[SOURCE_ID_FIELD];
    if (typeof sid === "string") declarations.set(sid, d);
  }
  DECLARATION_INDEX.set(prims, declarations);
  return declarations;
}

const arity: ValidatorFn = (instance, _t, _p, ctx) => {
  const p = instance as PrimitiveInstance;
  const apps = collectApplications(p.field_values ?? {});
  if (apps.length === 0) return [];
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.arity, p.id);
  const declarations = declarationIndex(prims);
  const out: ValidationFinding[] = [];
  for (const app of apps) {
    const decl = declarations.get(app.targetId);
    if (!decl) continue; // unresolved references are the host's / document check's finding
    const kind = kindOfPrimitive(decl) ?? decl.type_id;
    const name = String(decl.field_values?.["name"] ?? app.targetId);
    const declared = decl.field_values?.["arity"];
    const arityValue = typeof declared === "number" ? declared : 0;
    if (app.kind === "function_application_term") {
      if (kind !== "function_declaration") {
        out.push(finding(VALIDATOR_RULE_IDS.arity, "error", p.id, `${app.path}: Function application references '${kind}', not function_declaration`));
        continue;
      }
      const variadic = decl.field_values?.["variadic"] === true;
      const valid = variadic ? app.argumentCount >= arityValue : app.argumentCount === arityValue;
      if (!valid) {
        out.push(finding(VALIDATOR_RULE_IDS.arity, "error", p.id,
          `${app.path}: Function '${name}' requires ${variadic ? "at least" : "exactly"} ${arityValue} argument(s); received ${app.argumentCount}`));
      }
    } else {
      if (kind !== "predicate_declaration" && kind !== "relation_declaration") {
        out.push(finding(VALIDATOR_RULE_IDS.arity, "error", p.id, `${app.path}: Predicate application references '${kind}', not a predicate or relation declaration`));
        continue;
      }
      const variadic = kind === "predicate_declaration" && decl.field_values?.["variadic"] === true;
      const valid = variadic ? app.argumentCount >= arityValue : app.argumentCount === arityValue;
      if (!valid) {
        out.push(finding(VALIDATOR_RULE_IDS.arity, "error", p.id,
          `${app.path}: Predicate '${name}' requires ${variadic ? "at least" : "exactly"} ${arityValue} argument(s); received ${app.argumentCount}`));
      }
    }
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
};

// ── Header: single, and the whole document ──────────────────────────────

const singleHeader: ValidatorFn = (instance, _t, _p, ctx) => {
  const p = instance as PrimitiveInstance;
  const prims = primitivesOf(ctx);
  if (!prims) return [];
  const others = Object.values(prims).filter((x) => x.type_id === HEADER_TYPE_ID && x.id !== p.id);
  if (others.length === 0) return [];
  return [finding(VALIDATOR_RULE_IDS.singleHeader, "error", p.id, `a workbook holds one LogicalKnowledgeBase document; header(s) already present: ${others.map((o) => o.id).join(", ")}`)];
};

const wholeDocument: ValidatorFn = (instance, _t, _p, ctx) => {
  const p = instance as PrimitiveInstance;
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.document, p.id);
  const primitives = Object.values(prims);
  if (!primitives.some((x) => x.id === p.id)) primitives.push(p); // the header being created
  const verified = verifyWorkbook(primitives, relationsOf(ctx));
  if (verified.ok) return [];
  return verified.issues.slice(0, MAX_ISSUES).map((i) =>
    finding(VALIDATOR_RULE_IDS.document, "warning", p.id, `${i.path}: ${i.message}`),
  );
};

// ── Derived edges and computed semantics ────────────────────────────────

/**
 * The node's `lkb:mentions` edges agree with its formulas. A warning, not an
 * error: the edges are derived (the importer writes them; `reconcileMentions`
 * repairs them) and a node is created before its edges can exist. The
 * message names the exact edges to add or drop.
 */
const mentionsCurrent: ValidatorFn = (instance, _t, _p, ctx) => {
  const p = instance as PrimitiveInstance;
  if (p.type_id === HEADER_TYPE_ID || p.type_id === EXTERNAL_TARGET_TYPE_ID) return [];
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.mentionsCurrent, p.id);
  const expected = new Map(mentionEdges(p.id, p.field_values ?? {}, sourceIdIndex(Object.values(prims))).map((e) => [e.id, e] as const));
  const existing = new Map(
    relationsOf(ctx)
      .filter((r) => r.type_id === MENTIONS_RELATION_ID && r.source_id === p.id)
      .map((r) => [r.id, r] as const),
  );
  const missing = [...expected.values()].filter((e) => !existing.has(e.id));
  const stale = [...existing.values()].filter((r) => !expected.has(r.id));
  if (missing.length === 0 && stale.length === 0) return [];
  const show = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? `, … ${ids.length - 5} more` : "");
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${missing.length} (→ ${show(missing.map((e) => e.target_id))})`);
  if (stale.length > 0) parts.push(`stale ${stale.length} (${show(stale.map((r) => r.id))})`);
  return [
    finding(
      VALIDATOR_RULE_IDS.mentionsCurrent,
      "warning",
      p.id,
      `${MENTIONS_RELATION_ID} edges do not match the node's formulas: ${parts.join("; ")}. Run reconcileMentions() or re-import.`,
    ),
  ];
};

const FRAMEWORK_TYPE = typeIdFor("argumentation_framework");

/** A grounded framework's declared `acceptedArguments` equals the computed grounded extension. */
const frameworkGrounded: ValidatorFn = (instance, _t, _p, ctx) => {
  const p = instance as PrimitiveInstance;
  const prims = primitivesOf(ctx);
  if (!prims) return noContext(VALIDATOR_RULE_IDS.frameworkGrounded, p.id);
  const primitives = Object.values(prims);
  if (!primitives.some((x) => x.id === p.id)) primitives.push(p);
  const result = groundedResults(primitives, relationsOf(ctx)).find((r) => r.framework.id === p.id);
  if (!result || !result.disagreement) return [];
  const { missing, extra } = result.disagreement;
  return [
    finding(
      VALIDATOR_RULE_IDS.frameworkGrounded,
      "warning",
      p.id,
      `grounded extension is {${result.accepted.join(", ")}}` +
        (missing.length > 0 ? `; acceptedArguments omits ${missing.join(", ")}` : "") +
        (extra.length > 0 ? `; acceptedArguments names ${extra.join(", ")}, which the attacks defeat or leave undecided` : ""),
    ),
  ];
};

// ── Registration ────────────────────────────────────────────────────────

const PARENT_FIELDS = ["parentModule", "parentWorld", "parentJurisdiction", "parentOrganization", "parentDomain"] as const;

export function registerLkbValidators(ctx: PluginContext): { registrations: number; ruleIds: string[] } {
  let n = 0;
  const v = (type_id: string, rule_id: string, fn: ValidatorFn) => {
    ctx.registerValidator({ type_id, rule_id, fn });
    n += 1;
  };
  const d = derive();
  for (const nt of d.nodeTypes) {
    v(nt.type.id, VALIDATOR_RULE_IDS.nodeShape, nodeShape);
    v(nt.type.id, VALIDATOR_RULE_IDS.arity, arity);
    v(nt.type.id, VALIDATOR_RULE_IDS.mentionsCurrent, mentionsCurrent);
  }
  v(FRAMEWORK_TYPE, VALIDATOR_RULE_IDS.frameworkGrounded, frameworkGrounded);
  v(HEADER_TYPE_ID, VALIDATOR_RULE_IDS.nodeShape, nodeShape);
  v(HEADER_TYPE_ID, VALIDATOR_RULE_IDS.singleHeader, singleHeader);
  v(HEADER_TYPE_ID, VALIDATOR_RULE_IDS.document, wholeDocument);
  for (const rt of d.relationTypes) {
    if (!rt.id.startsWith(REF_RELATION_PREFIX)) continue;
    v(rt.id, VALIDATOR_RULE_IDS.referenceFamily, referenceFamily);
    v(rt.id, VALIDATOR_RULE_IDS.referenceResolution, referenceResolution);
  }
  for (const t of PRIORITY_EDGE_TYPES) v(t, VALIDATOR_RULE_IDS.ruleCycle, ruleCycle);
  for (const f of PARENT_FIELDS) v(referenceRelationId(f), VALIDATOR_RULE_IDS.selfParent, selfParent);
  v(STEP_RELATION_ID, VALIDATOR_RULE_IDS.stepSlot, stepSlot);
  return { registrations: n, ruleIds: Object.values(VALIDATOR_RULE_IDS) };
}

export const __validators = { nodeShape, referenceFamily, referenceResolution, selfParent, ruleCycle, stepSlot, arity, singleHeader, wholeDocument, nodeLocalSchema, mentionsCurrent, frameworkGrounded };
