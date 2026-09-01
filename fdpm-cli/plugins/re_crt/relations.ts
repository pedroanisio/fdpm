/**
 * Edges.
 *
 * Two of the ontology's SHACL shapes disappear here, because the host checks
 * relation endpoints at error level (`core:relation:source-type` /
 * `core:relation:target-type`):
 *
 *  - `SupportHomogeneityShape` forbids a support edge that crosses node kinds.
 *    Splitting `supports` into ProofSupports and ObstructionSupports makes a
 *    cross-kind edge unrepresentable rather than merely invalid.
 *  - The duality maps δ and δ⊥ have NO endpoint typing in the .ttl. `rdfs:range`
 *    is an entailment obligation, and the ontology's validation protocol runs
 *    without inference, so `leaf explainedByBarrier <a bypass>` — even
 *    `explainedByBarrier <a proof node>` — validates there. Declared endpoints
 *    close that.
 *
 * What endpoint typing CANNOT settle is the barrier/bypass distinction: both
 * are `recrt:ObstructionNode` and the difference is a field value. That is why
 * `recrt:val.defeat-bipartite` exists as a validator.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";

const rel = (
  id: string,
  name: string,
  source: string,
  target: string,
  description: string,
  extra: Partial<RelationTypeDef> = {},
): RelationTypeDef =>
  ({
    id,
    name,
    description,
    source_types: [source],
    target_types: [target],
    fields: [],
    symmetric: false,
    transitive: false,
    ...extra,
  }) as RelationTypeDef;

export const RELATIONS: RelationTypeDef[] = [
  // --- Support (§1.2). Acyclicity is recrt:val.support-acyclic; OWL 2 DL
  //     cannot state it at all (transitive + irreflexive is forbidden).
  rel(
    "recrt:ProofSupports",
    "Proof supports",
    "recrt:ProofNode",
    "recrt:ProofNode",
    "(u,v): u supports v within a reason DAG.",
    { transitive: true },
  ),
  rel(
    "recrt:ObstructionSupports",
    "Obstruction supports",
    "recrt:ObstructionNode",
    "recrt:ObstructionNode",
    "(u,v): u supports v within an obstruction DAG.",
    { transitive: true },
  ),

  // --- DAG membership and roots. The ontology enforces exactly-one membership
  //     with a SHACL cardinality; FDPM carries `cardinality` as metadata but
  //     does not validate it, so recrt:val.dag-membership does the work.
  rel("recrt:ProofInDAG", "Proof node in DAG", "recrt:ProofNode", "recrt:ReasonDAG", "Membership."),
  rel(
    "recrt:ObstructionInDAG",
    "Obstruction node in DAG",
    "recrt:ObstructionNode",
    "recrt:ObstructionDAG",
    "Membership.",
  ),
  rel("recrt:ProofRootOf", "Root of reason DAG", "recrt:ProofNode", "recrt:ReasonDAG", "The DAG's root."),
  rel(
    "recrt:ObstructionRootOf",
    "Root of obstruction DAG",
    "recrt:ObstructionNode",
    "recrt:ObstructionDAG",
    "The DAG's root.",
  ),

  // --- Rule apparatus.
  rel("recrt:HasRule", "Has rule", "recrt:ProofNode", "recrt:Rule", "pi_R: the rule that justifies this node."),
  rel(
    "recrt:HasSideCondition",
    "Has side condition",
    "recrt:ProofNode",
    "recrt:SideCondition",
    "A side condition attached to this node.",
  ),
  rel(
    "recrt:RuleRequiresSideCondition",
    "Rule requires side condition",
    "recrt:Rule",
    "recrt:SideCondition",
    "Cond(rho).",
  ),
  rel("recrt:BasisHasRule", "Basis has rule", "recrt:RuleBasis", "recrt:Rule", "Membership of R."),
  rel(
    "recrt:HasProvenanceSource",
    "Has provenance source",
    "recrt:ProofNode",
    "recrt:ProofNode",
    "pi_S, node-level (the 2D Pi simplification of §3.2). Also the anchor an evidence bundle may hang from.",
  ),

  // --- Duality maps (§1.8).
  rel(
    "recrt:ExplainedByBarrier",
    "Explained by barrier",
    "recrt:ProofNode",
    "recrt:ObstructionNode",
    "delta: an open leaf and the barriers explaining why it is open.",
  ),
  rel(
    "recrt:BypassTargets",
    "Bypass targets",
    "recrt:ObstructionNode",
    "recrt:ProofNode",
    "delta-perp: a bypass and the proof nodes it could exploit.",
  ),
  rel(
    "recrt:BypassDefeatsBarrier",
    "Bypass defeats barrier",
    "recrt:ObstructionNode",
    "recrt:ObstructionNode",
    "The attack relation: bypass y defeats barrier b. Bipartite typing is recrt:val.defeat-bipartite; both ends are ObstructionNode, so endpoints alone cannot express it.",
  ),

  // --- Evidence (v6.2).
  rel(
    "recrt:EvidencedBy",
    "Evidenced by",
    "recrt:ProofNode",
    "recrt:EvidenceBundle",
    "The bundle whose contents produced this node's verification status.",
  ),
];
