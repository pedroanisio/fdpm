import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, iso, primitive, str, text } from "../_common.js";

/**
 * Evidence category — why claims should be trusted.
 * Mirrors §"--- Evidence ---" of src/fdpm/plugins/software_architecture.py:
 *   sw:Evidence.
 */
export const EVIDENCE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "sw:Evidence",
    name: "Evidence",
    category: "cat:evidence",
    description:
      "A traceable justification — answers 'why should this be trusted?'",
    scoped: false,
    id_format: idTemplate("evidence:{kind}:{name}"),
    fields: [
      enumOf("kind", "Nature of the evidence.", [
        "Test",
        "Metric",
        "Review",
        "Proof",
        "Certification",
        "Reference",
      ]),
      str("source", "Where the evidence comes from."),
      iso("timestamp", "When the evidence was last verified.", { required: false }),
      text("description", "What this evidence demonstrates.", { maxLength: 2000 }),
    ],
  }),
];
