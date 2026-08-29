/**
 * The derivation: turn 712 ontology classes and 1,653 graph-edge fields
 * into 712 primitive types and a set of typed relation types.
 *
 * WHY THIS FILE EXISTS. `schemas/uixo-native.ts` models every graph edge
 * as `z.array(UixoEntityIdSchema)` — an array of opaque id strings —
 * because "instance graphs may be cyclic" and referential integrity is
 * "enforced by UixoDocumentSchema", a document-level oracle someone has
 * to remember to run.
 *
 * Handed to @fdpm/zod-bridge unchanged, every one of those fields becomes
 * `kind: "list"` of plain strings and the host checks nothing: a Button
 * carrying `hasChildComponent: ["ex:does-not-exist"]` is accepted with
 * zero findings. That throws away the single thing the profile is for.
 *
 * So each edge field is LIFTED out of its entity schema (`.omit()`, which
 * also makes writing it as a field a rejection) and re-expressed as a
 * RelationTypeDef. The host's §7 pipeline then refuses any relation whose
 * endpoint does not exist (src/core/validation/pipeline.ts:682-690), and
 * the ontology's referential integrity becomes an invariant of every
 * write rather than a batch check.
 *
 * EVERYTHING THIS NEEDS IS MACHINE-READABLE IN THE SOURCE:
 *   - the edge's RDF range, from its `.describe()` — `range uixo:Component`
 *     is present on all 1,653 of them;
 *   - the concrete classes that satisfy that range, from `CLASS_PARENT`,
 *     the full 712-entry class hierarchy.
 * Nothing here is hand-maintained, so a regenerated uixo-native.ts flows
 * through without edits.
 */

import { z } from "zod";
import { CLASS_PARENT, UIXO_ENTITY_SCHEMAS } from "./schemas/uixo-native.js";

/** An ontology class name, e.g. `uixo:Button`. */
export type QName = string;

const SCHEMAS = UIXO_ENTITY_SCHEMAS as unknown as Record<QName, z.ZodObject<z.ZodRawShape>>;
const PARENT = CLASS_PARENT as unknown as Record<QName, QName | null>;

export const ENTITY_QNAMES: readonly QName[] = Object.keys(SCHEMAS).sort();

/**
 * `uixo:Button` -> `Uixo_Button`, so the bridge emits `uixo:Uixo_Button`.
 * The prefix is carried into the entity name because 31 namespaces share
 * one profile and local names collide across them. Reversible: split on
 * the first `_`, lowercase the head.
 */
export function entityName(qname: QName): string {
  const [prefix, local] = qname.split(":");
  if (prefix === undefined || local === undefined) {
    throw new Error(`not a QName: "${qname}"`);
  }
  return `${prefix[0]!.toUpperCase()}${prefix.slice(1)}_${local}`;
}

/** Inverse of `entityName`. */
export function qnameOf(entity: string): QName {
  const cut = entity.indexOf("_");
  if (cut < 0) throw new Error(`not a derived entity name: "${entity}"`);
  const prefix = entity.slice(0, cut);
  return `${prefix[0]!.toLowerCase()}${prefix.slice(1)}:${entity.slice(cut + 1)}`;
}

// ── The class hierarchy ────────────────────────────────────────────────

const CHILDREN = new Map<QName, QName[]>();
for (const c of ENTITY_QNAMES) {
  const p = PARENT[c];
  if (p) {
    const bucket = CHILDREN.get(p);
    if (bucket) bucket.push(c);
    else CHILDREN.set(p, [c]);
  }
}

/**
 * Every class in the registry that satisfies `range` — the range itself
 * when it is a registered class, plus its transitive subclasses.
 *
 * A range naming a class that has no registered schema (an abstract
 * superclass, or `owl:Thing`) contributes only its descendants; the
 * abstract class itself is not a storable type. This is the UML
 * abstract-metaclass lesson applied through the hierarchy rather than
 * through a hand-written classification.
 */
export function rangeClosure(range: QName): QName[] {
  const out: QName[] = [];
  const seen = new Set<QName>();
  const stack: QName[] = [range];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (SCHEMAS[cur]) out.push(cur);
    for (const kid of CHILDREN.get(cur) ?? []) stack.push(kid);
  }
  return out.sort();
}

// ── Edge extraction ────────────────────────────────────────────────────

/** One `(entity, field)` graph edge as the source schema declares it. */
export interface EdgeField {
  entity: QName;
  field: string;
  /** RDF range, parsed out of the field's `.describe()`. */
  range: QName;
}

const RANGE_RE = /range\s+([A-Za-z][A-Za-z0-9]*:[A-Za-z0-9_]+)/;

/** True when the Zod node is `z.array(<string>)` — the edge shape. */
function isIdArray(node: unknown): boolean {
  const def = (node as { _def?: { innerType?: unknown; type?: string; element?: unknown } })._def;
  if (!def) return false;
  const inner = (def.innerType ?? node) as { _def?: { type?: string; element?: unknown } };
  if (inner._def?.type !== "array") return false;
  const element = inner._def.element as { _def?: { type?: string } } | undefined;
  return element?._def?.type === "string";
}

/**
 * Every graph edge in the ontology. An `id`-array field whose describe()
 * carries no `range` is NOT treated as an edge — it stays a field, and
 * `assertEveryEdgeClassified` reports it rather than letting it pass
 * silently.
 */
export function collectEdgeFields(): EdgeField[] {
  const edges: EdgeField[] = [];
  for (const qname of ENTITY_QNAMES) {
    const shape = SCHEMAS[qname]!.shape;
    for (const field of Object.keys(shape).sort()) {
      const node = shape[field];
      if (!isIdArray(node)) continue;
      const described = (node as { description?: string }).description ?? "";
      const m = RANGE_RE.exec(described);
      if (!m) continue;
      edges.push({ entity: qname, field, range: m[1]! });
    }
  }
  return edges;
}

/**
 * Id-array fields that carry no parseable range, which would silently
 * remain unchecked string lists. Empty in v1.2.0; asserted by test so a
 * regenerated source cannot reintroduce one unnoticed.
 */
export function unclassifiedIdArrays(): { entity: QName; field: string }[] {
  const out: { entity: QName; field: string }[] = [];
  for (const qname of ENTITY_QNAMES) {
    const shape = SCHEMAS[qname]!.shape;
    for (const field of Object.keys(shape)) {
      const node = shape[field];
      if (!isIdArray(node)) continue;
      const described = (node as { description?: string }).description ?? "";
      if (!RANGE_RE.test(described)) out.push({ entity: qname, field });
    }
  }
  return out;
}

// ── Relation types ─────────────────────────────────────────────────────

export interface RelationTypeSpec {
  id: string;
  name: string;
  description: string;
  source_types: readonly string[];
  target_types: readonly string[];
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  fields: ReadonlyArray<Record<string, unknown>>;
}

export const VENDOR = "uixo" as const;

/** `uixo:<Entity>` — the PrimitiveTypeDef id the bridge emits. */
export function primitiveTypeId(qname: QName): string {
  return `${VENDOR}:${entityName(qname)}`;
}

/** `uixo:rel.<property>` — namespaced apart from the primitive types. */
export function relationTypeId(field: string): string {
  return `${VENDOR}:rel.${field}`;
}

/**
 * One relation type per distinct edge PROPERTY, not per (entity, field)
 * pair: `hasChildComponent` is one property of the ontology that many
 * classes carry, and 1,653 occurrences collapse to 210 properties.
 *
 * `source_types` is every class declaring the property; `target_types` is
 * the union of the closures of every range it is declared with. A
 * property declared with different ranges on different classes therefore
 * widens rather than splitting — recorded in `rangeConflicts()` so the
 * widening is visible instead of silent.
 */
export function deriveRelationTypes(edges: readonly EdgeField[] = collectEdgeFields()): RelationTypeSpec[] {
  const byField = new Map<string, EdgeField[]>();
  for (const e of edges) {
    const bucket = byField.get(e.field);
    if (bucket) bucket.push(e);
    else byField.set(e.field, [e]);
  }

  const specs: RelationTypeSpec[] = [];
  for (const [field, group] of [...byField.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ranges = [...new Set(group.map((g) => g.range))].sort();
    const targets = new Set<string>();
    for (const r of ranges) for (const t of rangeClosure(r)) targets.add(primitiveTypeId(t));
    const sources = [...new Set(group.map((g) => primitiveTypeId(g.entity)))].sort();

    // A range that resolves to no storable class (owl:Thing, or a purely
    // abstract superclass) means "any entity" — the ontology's own
    // open-world top. Narrowing it to the empty set would make the
    // relation unusable, so it opens to every class instead.
    const targetList =
      targets.size === 0 ? ENTITY_QNAMES.map(primitiveTypeId) : [...targets].sort();

    specs.push({
      id: relationTypeId(field),
      name: field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
      description:
        `${field} — RDF range ${ranges.join(" | ")}; ` +
        `${targetList.length} storable target class(es) via CLASS_PARENT. ` +
        (targets.size === 0
          ? "The declared range names no storable class (open-world top), so every class is a legal target."
          : "Lifted out of the entity schemas so the host enforces endpoint existence."),
      source_types: sources,
      target_types: targetList,
      // RDF multiset semantics: a property may repeat on one subject and
      // one object may be referenced by many subjects.
      cardinality: "many-to-many",
      fields: [],
    });
  }
  return specs;
}

/** Properties declared with more than one range across the ontology. */
export function rangeConflicts(edges: readonly EdgeField[] = collectEdgeFields()): {
  field: string;
  ranges: QName[];
}[] {
  const byField = new Map<string, Set<QName>>();
  for (const e of edges) {
    const bucket = byField.get(e.field);
    if (bucket) bucket.add(e.range);
    else byField.set(e.field, new Set([e.range]));
  }
  return [...byField.entries()]
    .filter(([, ranges]) => ranges.size > 1)
    .map(([field, ranges]) => ({ field, ranges: [...ranges].sort() }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

// ── Entity schemas with their edges lifted out ─────────────────────────

/**
 * The entity schemas the bridge actually sees: the source schemas with
 * every classified edge field omitted.
 *
 * `.omit()` on a strict object keeps it strict AND turns the omitted key
 * into an unrecognised one, so a caller that writes `hasChildComponent`
 * as a field is rejected rather than quietly storing a list the host
 * cannot check. That rejection is the point.
 */
export function buildEntitySchemas(
  edges: readonly EdgeField[] = collectEdgeFields(),
): Record<string, z.ZodObject<z.ZodRawShape>> {
  const omitByEntity = new Map<QName, Record<string, true>>();
  for (const e of edges) {
    const bucket = omitByEntity.get(e.entity) ?? {};
    bucket[e.field] = true;
    omitByEntity.set(e.entity, bucket);
  }

  const out: Record<string, z.ZodObject<z.ZodRawShape>> = {};
  for (const qname of ENTITY_QNAMES) {
    const source = SCHEMAS[qname]!;
    const omit = omitByEntity.get(qname);
    // Field names are kept EXACTLY as the ontology declares them.
    // `FieldDef.name` requires an identifier and nothing more — the host
    // treats a name as an opaque key into `field_values` and derives
    // nothing from its shape (src/core/models/meta.ts). For an RDF
    // vocabulary the camelCase property name IS the name; renaming it
    // would add a mapping layer that buys nothing and does not round-trip
    // cleanly (hasPlanCTA).
    out[entityName(qname)] = (
      omit ? (source.omit(omit as never) as z.ZodObject<z.ZodRawShape>) : source
    );
  }
  return out;
}

/** Counts a reviewer (or a test) can assert the derivation against. */
export function derivationSummary(): {
  entities: number;
  edgeFields: number;
  relationTypes: number;
  unclassified: number;
  rangeConflicts: number;
  widestTarget: { id: string; targets: number };
} {
  const edges = collectEdgeFields();
  const rels = deriveRelationTypes(edges);
  const widest = rels.reduce(
    (best, r) => (r.target_types.length > best.targets ? { id: r.id, targets: r.target_types.length } : best),
    { id: "", targets: 0 },
  );
  return {
    entities: ENTITY_QNAMES.length,
    edgeFields: edges.length,
    relationTypes: rels.length,
    unclassified: unclassifiedIdArrays().length,
    rangeConflicts: rangeConflicts(edges).length,
    widestTarget: widest,
  };
}
