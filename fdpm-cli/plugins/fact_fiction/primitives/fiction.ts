/**
 * Fiction-layer primitives.
 *
 *   ff:FictionElement — an invented narrative element, graded by
 *                       historicity. Grounding is edges, not fields:
 *                       ff:BasedOn → facts, ff:ConstrainedBy →
 *                       constraints, ff:CouplesTo → the typed linkage
 *                       layer.
 *   ff:Constraint     — a historical constraint bounding what fiction
 *                       may depict. The spike's nested applicableScope
 *                       object is flattened (regions / date_start /
 *                       date_end / social_groups).
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, primitive, shortText, str, strList } from "../_common.js";
import {
  CONSTRAINT_KINDS,
  CONSTRAINT_SEVERITIES,
  FICTION_MECHANISMS,
  HISTORICITY_LEVELS,
} from "../enums.js";

export const FICTION_ELEMENT: PrimitiveTypeDef = primitive({
  id: "ff:FictionElement",
  name: "FictionElement",
  category: "cat:ff:fiction",
  description:
    "An invented narrative element with a mechanism (what kind of invention) and a historicity grading. Elements not marked fully_invented should be grounded via ff:BasedOn or ff:CouplesTo (ff:val:fiction-grounded).",
  scoped: true,
  id_format: idTemplate("fic:{slug}"),
  fields: [
    shortText("label", "Short human-readable label for this fiction element.", 160),
    enumOf("mechanism", "The specific kind of literary invention applied.", FICTION_MECHANISMS),
    str("description", "Detailed description of the fictional invention."),
    enumOf(
      "historicity",
      "Epistemic grading of this element's relationship to the historical record.",
      HISTORICITY_LEVELS,
    ),
    str("rationale", "Why this fictional element was introduced.", { required: false }),
  ],
});

export const CONSTRAINT: PrimitiveTypeDef = primitive({
  id: "ff:Constraint",
  name: "Constraint",
  category: "cat:ff:fiction",
  description:
    "A historical constraint bounding what the fiction may plausibly depict. severity=hard means violation is an anachronism or impossibility; soft means an implausibility. Supported by facts via ff:SupportedBy.",
  scoped: true,
  id_format: idTemplate("cons:{slug}"),
  fields: [
    shortText("label", "Short human-readable label for this constraint.", 160),
    str("description", "Detailed description of the historical constraint."),
    enumOf("kind", "Domain this constraint applies to.", CONSTRAINT_KINDS),
    enumOf("severity", "hard (anachronism) or soft (implausibility).", CONSTRAINT_SEVERITIES),
    strList("regions", "Geographic regions where this constraint applies.", { required: false }),
    str("date_start", "Start of applicability (ISO 8601 or free text).", { required: false }),
    str("date_end", "End of applicability (ISO 8601 or free text).", { required: false }),
    strList("social_groups", "Social groups to which this constraint applies.", {
      required: false,
    }),
    str(
      "violation_consequence",
      "What goes wrong narratively or historically when this constraint is broken.",
      { required: false },
    ),
  ],
});

export const FICTION_PRIMITIVES: PrimitiveTypeDef[] = [FICTION_ELEMENT, CONSTRAINT];
