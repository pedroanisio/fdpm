/**
 * The two DAGs and their nodes (§1.2, §1.7).
 *
 * The ontology factors these under `recrt:AbstractNode` to capture the spec's
 * parametricity — "RE-CRT is parametric over R, so G-perp gets the machinery
 * for free". FDPM has no primitive-type inheritance (`extends` composes
 * PROFILES, not types), so the shared shape is flattened into both types and
 * the parametricity is recorded here rather than encoded. Nothing is lost that
 * the host checks: the ontology's `owl:disjointWith` between the two node
 * kinds is what separate primitive types already mean.
 */
import { bool, enumOf, primitive, str, text, unitInterval } from "../_common.js";
import { NODE_TYPES, OBSTRUCTION_TYPES, VERIFICATION_STATUSES } from "../enums.js";

export const PROOF_NODE = primitive(
  "recrt:ProofNode",
  "Proof node",
  "A node of a reason DAG G (§1.2).",
  [
    str("id", "Stable identifier.", { required: true }),
    enumOf("node_type", NODE_TYPES, "The node's type (pi_T, §1.2).", { required: true }),
    text("payload", "lambda — the statement this node carries.", { required: true }),
    text("open_payload", "Omega — what remains to be established, for open nodes."),
    enumOf("verification_status", VERIFICATION_STATUSES, "How this node was checked.", {
      required: true,
    }),
    unitInterval("resolution", "sigma. Its PROPAGATION is arithmetic and stays outside the profile."),
    bool(
      "is_opaque",
      "Psi(v): pi_R invokes an undecidable procedure (§5). A boundary, not a defect.",
    ),
  ],
);

export const OBSTRUCTION_NODE = primitive(
  "recrt:ObstructionNode",
  "Obstruction node",
  "A node of an obstruction DAG G-perp (§1.7).",
  [
    str("id", "Stable identifier.", { required: true }),
    enumOf("obstruction_type", OBSTRUCTION_TYPES, "The node's type (§1.7).", { required: true }),
    text("payload", "What this obstruction asserts.", { required: true }),
    /* Optional at the field level because open_bypass is unvalidated and the
       ontology declines to force a placeholder beta on it. The
       type-dependent requirement is a validation rule, not a field flag. */
    unitInterval("blocking_strength", "beta. Required except on open_bypass — see recrt:val.type-beta."),
  ],
);

export const REASON_DAG = primitive("recrt:ReasonDAG", "Reason DAG", "A proof DAG G (§1.2).", [
  str("id", "Stable identifier.", { required: true }),
  str("title", "What this DAG proves.", { required: true }),
]);

export const OBSTRUCTION_DAG = primitive(
  "recrt:ObstructionDAG",
  "Obstruction DAG",
  "An obstruction DAG G-perp (§1.7).",
  [
    str("id", "Stable identifier.", { required: true }),
    str("title", "What this DAG obstructs.", { required: true }),
  ],
);
