/**
 * The ontology's five enumerations.
 *
 * In OWL each of these costs three constructs — an `owl:Class`, an
 * `owl:oneOf` equivalence, and an `owl:AllDifferent` axiom to stop a reasoner
 * inferring that two members might be the same individual. A closed enum
 * field says the same thing once, and says it to a validator rather than to a
 * reasoner nobody runs.
 *
 * Values are the ontology's `rdfs:label`s, lowercased and snake_cased to match
 * FDPM's enum convention. The mapping back to the source IRIs is recorded here
 * so the correspondence stays auditable.
 */

/** recrt:NodeType — T_assumption, T_derived, T_goal, T_condition, T_open (§1.2). */
export const NODE_TYPES = ["assumption", "derived", "goal", "condition", "open"] as const;

/** recrt:ObstructionNodeType — OT_barrier, OT_conditional_barrier, OT_bypass, OT_open_bypass (§1.7). */
export const OBSTRUCTION_TYPES = [
  "barrier",
  "conditional_barrier",
  "bypass",
  "open_bypass",
] as const;

/** recrt:VerificationStatus — V_unverified, V_CASchecked, V_proofWitnessed, V_axiom. */
export const VERIFICATION_STATUSES = [
  "unverified",
  "cas_checked",
  "proof_witnessed",
  "axiom",
] as const;

/**
 * Statuses that assert a computation happened, and so require an evidence
 * bundle (the v6.2 gate). `axiom` needs no computation and `unverified`
 * claims none, so both are exempt.
 */
export const EVIDENCE_REQUIRING_STATUSES = ["cas_checked", "proof_witnessed"] as const;

/** recrt:ClaimStatus — the §9 falsifiability table. */
export const CLAIM_STATUSES = [
  "verified",
  "established",
  "partial",
  "stated",
  "not_formalized",
  "not_established",
  "not_verified",
] as const;

/** Statuses that leave a claim open. Mirrors recrt:OpenClaim. */
export const OPEN_CLAIM_STATUSES = ["not_formalized", "not_established", "not_verified"] as const;

/** recrt:Confidence. */
export const CONFIDENCES = ["high", "medium", "low"] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type ObstructionType = (typeof OBSTRUCTION_TYPES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
