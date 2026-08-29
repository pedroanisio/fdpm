/**
 * Graph-level invariants for profile:uixo:1.2.
 *
 * WHAT THE HOST ALREADY DOES. Field validation runs on every write via the
 * per-class Zod validators, and endpoint existence is enforced by the §7
 * pipeline for all 210 relation types — that is the whole point of
 * ../derive.ts. Neither is repeated here.
 *
 * WHAT IS LEFT. The source oracle's v1.1/v1.2 deltas that are properties
 * of the WHOLE graph, which a per-primitive `ValidatorFn` cannot see
 * (src/plugin/types.ts `ValidatorContext` carries the relations but never
 * the sibling primitives):
 *
 *   B. exactly one root, and it is an InteractionSystem subtype
 *   D. every entity reachable from that root
 *   containment is a TREE: one parent, reciprocal parent/child edges,
 *      no cycles, unique orderIndex among siblings
 *   A. label present and non-blank on every entity
 *
 * NOT PORTED, and declared as such in sidecar.ts under
 * `uixo.document-oracle-not-ported`: the semantic and policy tiers
 * (status families, state-machine reachability, the conditional rules,
 * catalog-template placement). Those need vocabulary the profile does not
 * carry, and inventing it here would be worse than leaving the source
 * oracle to do its job.
 */

import { rangeClosure, relationTypeId, entityName, type QName } from "./derive.js";

export interface PrimitiveLike {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}

export interface RelationLike {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

export interface Violation {
  rule_id: string;
  target_id: string | null;
  message: string;
}

export interface WorkbookValidationResult {
  ok: boolean;
  violations: Violation[];
}

const RULE = (slug: string): string => `uixo:inv.${slug}`;
const CHILD = relationTypeId("hasChildComponent");
const PARENT = relationTypeId("parentComponent");

/** Primitive type ids that are an InteractionSystem (the document root). */
const ROOT_TYPE_IDS: ReadonlySet<string> = new Set(
  rangeClosure("uixo:InteractionSystem").map((q: QName) => `uixo:${entityName(q)}`),
);

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/**
 * Every graph-level invariant, over a whole workbook.
 *
 * Run by `buildUixoWorkbook` before it writes anything; a workbook built
 * by direct primitive writes is field-valid and endpoint-valid but not
 * graph-valid until this is run against it.
 */
export function validateUixoWorkbook(
  primitives: readonly PrimitiveLike[],
  relations: readonly RelationLike[],
): WorkbookValidationResult {
  const v: Violation[] = [];
  if (primitives.length === 0) return { ok: true, violations: v };

  const byId = new Map(primitives.map((p) => [p.id, p]));

  // ── A. Every entity carries a non-blank label. ──
  for (const p of primitives) {
    const label = str(p.field_values["label"]);
    if (label === undefined || label.trim().length === 0) {
      v.push({
        rule_id: RULE("label.missing"),
        target_id: p.id,
        message: "every entity must carry a non-blank label — an unnamed entity is not reviewable",
      });
    }
  }

  // ── Containment edges, normalised to a single parent->child direction. ──
  const childrenOf = new Map<string, Set<string>>();
  const parentsOf = new Map<string, Set<string>>();
  const declaredChild = new Set<string>();
  const declaredParent = new Set<string>();

  const link = (parent: string, child: string): void => {
    const kids = childrenOf.get(parent) ?? new Set<string>();
    kids.add(child);
    childrenOf.set(parent, kids);
    const ps = parentsOf.get(child) ?? new Set<string>();
    ps.add(parent);
    parentsOf.set(child, ps);
  };

  for (const r of relations) {
    if (r.type_id === CHILD) {
      link(r.source_id, r.target_id);
      declaredChild.add(`${r.source_id}|${r.target_id}`);
    } else if (r.type_id === PARENT) {
      link(r.target_id, r.source_id);
      declaredParent.add(`${r.target_id}|${r.source_id}`);
    }
  }

  // ── Reciprocity: a containment edge declared one way must be declared
  // both ways, or the two properties disagree about the same fact. ──
  for (const pair of declaredChild) {
    if (!declaredParent.has(pair)) {
      const [parent, child] = pair.split("|");
      v.push({
        rule_id: RULE("containment.not-reciprocal"),
        target_id: child ?? null,
        message: `hasChildComponent ${parent} -> ${child} has no matching parentComponent edge back`,
      });
    }
  }
  for (const pair of declaredParent) {
    if (!declaredChild.has(pair)) {
      const [parent, child] = pair.split("|");
      v.push({
        rule_id: RULE("containment.not-reciprocal"),
        target_id: child ?? null,
        message: `parentComponent ${child} -> ${parent} has no matching hasChildComponent edge back`,
      });
    }
  }

  // ── Containment is a tree: at most one parent per node. ──
  for (const [child, parents] of parentsOf) {
    if (parents.size > 1) {
      v.push({
        rule_id: RULE("containment.multiple-parents"),
        target_id: child,
        message: `containment is a tree, but this entity has ${parents.size} parents (${[...parents].sort().join(", ")})`,
      });
    }
    if (parents.has(child)) {
      v.push({
        rule_id: RULE("containment.self-parent"),
        target_id: child,
        message: "an entity cannot contain itself",
      });
    }
  }

  // ── No containment cycles. ──
  const state = new Map<string, "visiting" | "done">();
  const walkCycle = (id: string, path: string[]): void => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      const at = path.indexOf(id);
      v.push({
        rule_id: RULE("containment.cycle"),
        target_id: id,
        message: `containment cycle: ${[...path.slice(at), id].join(" -> ")}`,
      });
      return;
    }
    state.set(id, "visiting");
    for (const kid of childrenOf.get(id) ?? []) {
      if (kid !== id) walkCycle(kid, [...path, id]);
    }
    state.set(id, "done");
  };
  for (const p of primitives) walkCycle(p.id, []);

  // ── orderIndex is unique among siblings. ──
  for (const [parent, kids] of childrenOf) {
    const seen = new Map<number, string>();
    for (const kid of [...kids].sort()) {
      const idx = num(byId.get(kid)?.field_values["orderIndex"]);
      if (idx === undefined) continue;
      const prior = seen.get(idx);
      if (prior !== undefined) {
        v.push({
          rule_id: RULE("containment.duplicate-order-index"),
          target_id: kid,
          message: `orderIndex ${idx} is already used by sibling ${prior} under ${parent}`,
        });
      } else {
        seen.set(idx, kid);
      }
    }
  }

  // ── B. Exactly one root, and it is an InteractionSystem subtype. ──
  const roots = primitives.filter((p) => (parentsOf.get(p.id)?.size ?? 0) === 0);
  const systemRoots = roots.filter((p) => ROOT_TYPE_IDS.has(p.type_id));

  if (systemRoots.length === 0) {
    v.push({
      rule_id: RULE("root.absent"),
      target_id: null,
      message: `no uncontained InteractionSystem subtype; a document declares exactly one root (one of ${ROOT_TYPE_IDS.size} classes)`,
    });
  } else if (systemRoots.length > 1) {
    v.push({
      rule_id: RULE("root.multiple"),
      target_id: null,
      message: `exactly one root is permitted; found ${systemRoots.length}: ${systemRoots.map((p) => p.id).sort().join(", ")}`,
    });
  }

  // ── D. Every entity reachable from the root. ──
  // Reachability follows every edge, not just containment: the ontology's
  // model is one connected graph, and a Policy attached by `policies` is
  // as much part of the document as a child component.
  if (systemRoots.length === 1) {
    const outgoing = new Map<string, string[]>();
    const link = (from: string, to: string): void => {
      outgoing.set(from, [...(outgoing.get(from) ?? []), to]);
    };
    for (const r of relations) {
      link(r.source_id, r.target_id);
      // Containment declared only as parentComponent still connects.
      if (r.type_id === PARENT) link(r.target_id, r.source_id);
    }
    // `extensions.spec` soft links connect too. The source oracle counts
    // them — E212's own remediation says "link each entity from the root
    // via reference fields OR extensions.spec" — and the ontology relies
    // on it: a root attaches its features and policies that way
    // (E301/E302 read extensions.spec.features / .policies).
    //
    // The profile stores `extensions` as an opaque JSON string
    // (declaredLoss uixo.extensions-opaque), so the links are present but
    // not indexed. Reading them back here is what stops this rule
    // reporting orphans the source considers attached: on a real
    // 346-entity document it produced 221 false positives.
    // Soft links name DOCUMENT ids (`app:policy`); the workbook addresses
    // primitives by projected id (`uixo:Uixo_Policy:app-policy`). The
    // document id survives on `field_values.id`, which is the join.
    const primitiveIdByDocId = new Map<string, string>();
    for (const p of primitives) {
      const docId = p.field_values["id"];
      if (typeof docId === "string") primitiveIdByDocId.set(docId, p.id);
    }
    for (const p of primitives) {
      for (const target of softLinkTargets(p, primitiveIdByDocId)) link(p.id, target);
    }
    const reached = new Set<string>();
    const stack = [systemRoots[0]!.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (reached.has(cur)) continue;
      reached.add(cur);
      for (const next of outgoing.get(cur) ?? []) stack.push(next);
    }
    for (const p of primitives) {
      if (!reached.has(p.id)) {
        v.push({
          rule_id: RULE("reachability.orphan"),
          target_id: p.id,
          message: `not reachable from the root ${systemRoots[0]!.id}; a document is one connected model`,
        });
      }
    }
  }

  return { ok: v.length === 0, violations: v };
}


/**
 * Primitive ids referenced from anywhere inside a primitive's
 * `extensions`, resolved through the document-id map. The value is whatever the source put
 * there — a string, an array of strings, or nested objects — so the walk
 * is defensive: anything that is not a known primitive id is ignored
 * rather than reported, because `extensions` is an open-world extension
 * point and a non-id string there is legitimate.
 */
function softLinkTargets(p: PrimitiveLike, byDocId: ReadonlyMap<string, string>): string[] {
  const raw = p.field_values["extensions"];
  let ext: unknown = raw;
  if (typeof raw === "string") {
    try {
      ext = JSON.parse(raw);
    } catch {
      return []; // not JSON: nothing addressable, and not this rule's business
    }
  }
  if (typeof ext !== "object" || ext === null) return [];
  const out: string[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 6) return; // deterministic bound; extensions are author data
    if (typeof v === "string") {
      const pid = byDocId.get(v);
      if (pid !== undefined) out.push(pid);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    if (typeof v === "object" && v !== null) {
      for (const x of Object.values(v)) walk(x, depth + 1);
    }
  };
  // The WHOLE extensions object, not just `spec`. This mirrors the source
  // oracle, which collects soft links with `collect(rec(e)["extensions"])`
  // over every nested value (uixo-native.ts, edge map construction). A
  // real document links `app:adapt-density-compact` through
  // `extensions.appliesVia` at the top level; walking only `spec` left it
  // reported as the single remaining orphan in a document the oracle
  // considers fully connected.
  walk(ext, 0);
  return out;
}

/** The InteractionSystem subtypes a document root may be. */
export function rootTypeIds(): readonly string[] {
  return [...ROOT_TYPE_IDS].sort();
}
