/**
 * The constraints that need the whole graph.
 *
 * These are the FDPM analogue of the ontology's PART 2. The split is the same
 * one the .ttl makes and for the same reason — a declarative type layer cannot
 * state acyclicity — only the boundary moves: there it is "OWL 2 DL cannot,
 * so SHACL"; here it is "a field constraint cannot, so a validator".
 * `ValidatorContext.workbook` carries every primitive and relation, which is
 * what makes closed-world questions ("no bypass defeats this barrier")
 * decidable at all.
 */
import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationFinding,
} from "../../../src/core/models/instance.js";
import type { ValidatorContext } from "../../../src/plugin/types.js";
import { EVIDENCE_REQUIRING_STATUSES } from "../enums.js";

type Rel = Pick<RelationInstance, "type_id" | "source_id" | "target_id">;

const err = (rule_id: string, target_id: string, message: string): ValidationFinding =>
  ({ level: "error", rule_id, target_id, message }) as ValidationFinding;

/**
 * A workbook-completeness finding.
 *
 * SHACL validates a FINISHED graph; FDPM validates every write. Three of the
 * ontology's constraints are about the graph being complete — exactly-one DAG
 * membership, V5 premise closure, and the v6.2 evidence gate — and none of
 * them can hold at the instant a node is created, because the relation that
 * would satisfy them cannot exist before the node it points at. Raising them
 * as errors makes the profile unusable: no node could ever be written.
 *
 * They are therefore warnings on the write path and conclusive on the finished
 * workbook, where `fdpm validate` surfaces them. The constraint is not weaker;
 * the moment it can be decided is later.
 */
const incomplete = (rule_id: string, target_id: string, message: string): ValidationFinding =>
  ({ level: "warning", rule_id, target_id, message }) as ValidationFinding;

const relationsOf = (ctx: ValidatorContext | undefined): Rel[] => {
  const fromWorkbook = ctx?.workbook ? Object.values(ctx.workbook.relations) : undefined;
  return (fromWorkbook ?? ctx?.relations ?? []) as unknown as Rel[];
};
const primitivesOf = (ctx: ValidatorContext | undefined): PrimitiveInstance[] =>
  ctx?.workbook ? Object.values(ctx.workbook.primitives) : [];

const field = (p: PrimitiveInstance | undefined, name: string): string => {
  const v = p?.field_values?.[name];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

/**
 * Nodes that lie on a cycle of `typeId` edges.
 *
 * Iterative DFS with a colour map: the graph is workbook data, so recursion
 * depth is not ours to bound. Computed per call rather than cached, because a
 * validator sees a snapshot and caching across writes would be a correctness
 * bug dressed as an optimisation.
 */
function cycleNodes(rels: readonly Rel[], typeId: string): Set<string> {
  const next = new Map<string, string[]>();
  for (const r of rels) {
    if (r.type_id !== typeId) continue;
    next.set(r.source_id, [...(next.get(r.source_id) ?? []), r.target_id]);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const onCycle = new Set<string>();
  for (const root of next.keys()) {
    if (state.get(root) === 2) continue;
    const stack: { node: string; i: number }[] = [{ node: root, i: 0 }];
    state.set(root, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const kids = next.get(frame.node) ?? [];
      if (frame.i >= kids.length) {
        state.set(frame.node, 2);
        stack.pop();
        continue;
      }
      const child = kids[frame.i]!;
      frame.i += 1;
      if (state.get(child) === 1) {
        const from = stack.findIndex((f) => f.node === child);
        for (let i = from; i < stack.length; i += 1) onCycle.add(stack[i]!.node);
      } else if (state.get(child) === undefined) {
        state.set(child, 1);
        stack.push({ node: child, i: 0 });
      }
    }
  }
  return onCycle;
}

/** §1.2 D4: a node may never transitively support itself. */
export const supportAcyclic =
  (relationType: string) =>
  (instance: PrimitiveInstance, _t?: unknown, _p?: unknown, ctx?: ValidatorContext) =>
    cycleNodes(relationsOf(ctx), relationType).has(instance.id)
      ? [
          err(
            "recrt:val.support-acyclic",
            instance.id,
            `Cycle detected on ${relationType} (§1.2, D4): a node cannot transitively support itself.`,
          ),
        ]
      : [];

/**
 * Defeat is bipartite (v6.1): only a bypass or open_bypass attacks, and only a
 * barrier or conditional_barrier is attacked.
 *
 * Endpoint typing cannot express this — both ends are `recrt:ObstructionNode`
 * and the distinction is a field value. Without it, an acyclic
 * bypass-defeats-bypass chain leaves a barrier counted as defeated although its
 * only defeater is itself defeated, and the §4.9 triage silently diverges from
 * the grounded labelling it claims to compute.
 */
export function defeatBipartite(
  instance: PrimitiveInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const byId = new Map(primitivesOf(ctx).map((p) => [p.id, p]));
  const out: ValidationFinding[] = [];
  for (const r of relationsOf(ctx)) {
    if (r.type_id !== "recrt:BypassDefeatsBarrier") continue;
    if (r.source_id !== instance.id) continue;
    const attacker = field(instance, "obstruction_type");
    const target = field(byId.get(r.target_id), "obstruction_type");
    if (attacker !== "bypass" && attacker !== "open_bypass") {
      out.push(
        err(
          "recrt:val.defeat-bipartite",
          instance.id,
          `Only bypass / open_bypass may hold outgoing defeat edges; this node is '${attacker}'.`,
        ),
      );
    }
    if (target !== "barrier" && target !== "conditional_barrier") {
      out.push(
        err(
          "recrt:val.defeat-bipartite",
          instance.id,
          `A defeat edge must target barrier / conditional_barrier; ${r.target_id} is '${target}'.`,
        ),
      );
    }
  }
  return out;
}

/** §1.7: barrier => beta 1, bypass => beta 0, conditional_barrier => beta in (0,1). */
export function typeBetaInvariant(instance: PrimitiveInstance): ValidationFinding[] {
  const type = field(instance, "obstruction_type");
  const raw = instance.field_values?.["blocking_strength"];
  const beta = typeof raw === "number" ? raw : raw === undefined ? undefined : Number(raw);

  if (beta === undefined) {
    return type === "open_bypass"
      ? [] // Unvalidated: the ontology declines to force a placeholder.
      : [
          err(
            "recrt:val.type-beta",
            instance.id,
            `A '${type}' must carry blocking_strength (beta); only open_bypass may omit it.`,
          ),
        ];
  }
  const bad =
    (type === "barrier" && beta !== 1) ||
    (type === "bypass" && beta !== 0) ||
    (type === "conditional_barrier" && (beta <= 0 || beta >= 1));
  return bad
    ? [
        err(
          "recrt:val.type-beta",
          instance.id,
          `beta ${beta} contradicts type '${type}' (barrier => 1, bypass => 0, conditional_barrier => strictly between).`,
        ),
      ]
    : [];
}

/** V5: a derived node has at least one premise and a rule. */
export function derivedPremiseClosure(
  instance: PrimitiveInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  if (field(instance, "node_type") !== "derived") return [];
  const rels = relationsOf(ctx);
  const out: ValidationFinding[] = [];
  if (!rels.some((r) => r.type_id === "recrt:ProofSupports" && r.target_id === instance.id)) {
    out.push(
      incomplete(
        "recrt:val.derived-premise",
        instance.id,
        "V5: a derived node must have at least one supporting predecessor (§1.2).",
      ),
    );
  }
  if (!rels.some((r) => r.type_id === "recrt:HasRule" && r.source_id === instance.id)) {
    out.push(
      incomplete(
        "recrt:val.derived-premise",
        instance.id,
        "V5: a derived node must carry an inference rule (pi_R, §1.2).",
      ),
    );
  }
  return out;
}

/** V7 and the assumption rule: open and assumption nodes are leaves. */
export function leafRules(
  instance: PrimitiveInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const type = field(instance, "node_type");
  if (type !== "open" && type !== "assumption") return [];
  const rels = relationsOf(ctx);
  const out: ValidationFinding[] = [];
  if (rels.some((r) => r.type_id === "recrt:ProofSupports" && r.target_id === instance.id)) {
    out.push(err("recrt:val.leaf", instance.id, `A '${type}' node is a leaf: nothing may support it (V7).`));
  }
  if (type === "assumption" && rels.some((r) => r.type_id === "recrt:HasRule" && r.source_id === instance.id)) {
    out.push(err("recrt:val.leaf", instance.id, "An assumption carries no rule (pi_R = bottom)."));
  }
  return out;
}

/**
 * The v6.2 evidence gate.
 *
 * A node asserting a verified status must cite the artifact that produced it,
 * directly or through its pi_S provenance anchor when several nodes share one
 * verification episode. Verification that names no artifact cannot be
 * rechecked: the claim outlives the script.
 */
export function evidenceGate(
  instance: PrimitiveInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const status = field(instance, "verification_status");
  if (!(EVIDENCE_REQUIRING_STATUSES as readonly string[]).includes(status)) return [];
  const rels = relationsOf(ctx);
  const cites = (id: string) => rels.some((r) => r.type_id === "recrt:EvidencedBy" && r.source_id === id);
  if (cites(instance.id)) return [];
  const anchors = rels
    .filter((r) => r.type_id === "recrt:HasProvenanceSource" && r.source_id === instance.id)
    .map((r) => r.target_id);
  if (anchors.some(cites)) return [];
  return [
    incomplete(
      "recrt:val.evidence-gate",
      instance.id,
      `A node asserting '${status}' must cite an EvidenceBundle, directly or through its provenance anchor (v6.2).`,
    ),
  ];
}

/** Exactly one DAG membership. FDPM carries `cardinality` but does not enforce it. */
export const dagMembership =
  (relationType: string, label: string) =>
  (instance: PrimitiveInstance, _t?: unknown, _p?: unknown, ctx?: ValidatorContext) => {
    const n = relationsOf(ctx).filter(
      (r) => r.type_id === relationType && r.source_id === instance.id,
    ).length;
    return n === 1
      ? []
      : [
          incomplete(
            "recrt:val.dag-membership",
            instance.id,
            `Every node belongs to exactly one ${label}; found ${n}.`,
          ),
        ];
  };

// ---------------------------------------------------------------------------
// Relation-scoped validators.
//
// A validator registered on a primitive type does not run when a RELATION is
// written, and these three constraints are properties of an edge: the leaf
// rules are violated by the support edge, not by the leaf; bipartite defeat is
// violated by the defeat edge. Registering them on the relation type makes the
// finding arrive at the moment the offending edge is created, and name the
// edge rather than a node that is itself fine.
// ---------------------------------------------------------------------------

/**
 * Narrow the validator's union argument to a relation.
 *
 * `ValidatorFn` receives `PrimitiveInstance | RelationInstance`, so an
 * edge-scoped rule guards rather than casts: a primitive reaching a relation
 * validator is a registration mistake, and returning no findings is the honest
 * response to one.
 */
function asRelation(x: PrimitiveInstance | RelationInstance): RelationInstance | undefined {
  return "source_id" in x && "target_id" in x ? (x as RelationInstance) : undefined;
}

const endpointType = (
  ctx: ValidatorContext | undefined,
  id: string,
  fieldName: string,
): string => field(primitivesOf(ctx).find((p) => p.id === id), fieldName);

/** V7: nothing may support an open or assumption node. */
export function supportTargetIsNotLeaf(
  raw: PrimitiveInstance | RelationInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const instance = asRelation(raw);
  if (instance === undefined) return [];
  const target = endpointType(ctx, instance.target_id, "node_type");
  return target === "open" || target === "assumption"
    ? [
        err(
          "recrt:val.leaf",
          instance.id,
          `A '${target}' node is a leaf: nothing may support it (V7). Offending edge targets ${instance.target_id}.`,
        ),
      ]
    : [];
}

/** An assumption carries no rule (pi_R = bottom). */
export function ruleSourceIsNotAssumption(
  raw: PrimitiveInstance | RelationInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const instance = asRelation(raw);
  if (instance === undefined) return [];
  return endpointType(ctx, instance.source_id, "node_type") === "assumption"
    ? [
        err(
          "recrt:val.leaf",
          instance.id,
          `An assumption carries no rule (pi_R = bottom); ${instance.source_id} is an assumption.`,
        ),
      ]
    : [];
}

/**
 * Bipartite defeat (v6.1), checked on the edge.
 *
 * Only bypass / open_bypass attack, and only barrier / conditional_barrier are
 * attacked. Relation endpoint typing cannot express this — both ends are
 * `recrt:ObstructionNode` and the distinction is a field value.
 */
export function defeatEdgeBipartite(
  raw: PrimitiveInstance | RelationInstance,
  _t?: unknown,
  _p?: unknown,
  ctx?: ValidatorContext,
): ValidationFinding[] {
  const instance = asRelation(raw);
  if (instance === undefined) return [];
  const attacker = endpointType(ctx, instance.source_id, "obstruction_type");
  const target = endpointType(ctx, instance.target_id, "obstruction_type");
  const out: ValidationFinding[] = [];
  if (attacker !== "bypass" && attacker !== "open_bypass") {
    out.push(
      err(
        "recrt:val.defeat-bipartite",
        instance.id,
        `Only bypass / open_bypass may hold outgoing defeat edges; ${instance.source_id} is '${attacker}'.`,
      ),
    );
  }
  if (target !== "barrier" && target !== "conditional_barrier") {
    out.push(
      err(
        "recrt:val.defeat-bipartite",
        instance.id,
        `A defeat edge must target barrier / conditional_barrier; ${instance.target_id} is '${target}'.`,
      ),
    );
  }
  return out;
}

/** §1.2 D4, checked when the edge that would close a cycle is written. */
export const supportEdgeAcyclic =
  (relationType: string) =>
  (raw: PrimitiveInstance | RelationInstance, _t?: unknown, _p?: unknown, ctx?: ValidatorContext) => {
    const instance = asRelation(raw);
    if (instance === undefined) return [];
    const rels = [...relationsOf(ctx)];
    if (!rels.some((r) => r.type_id === instance.type_id && r.source_id === instance.source_id && r.target_id === instance.target_id)) {
      rels.push(instance as unknown as Rel);
    }
    return cycleNodes(rels, relationType).has(instance.source_id)
      ? [
          err(
            "recrt:val.support-acyclic",
            instance.id,
            `Cycle detected on ${relationType} (§1.2, D4): a node cannot transitively support itself.`,
          ),
        ]
      : [];
  };
