/**
 * Evidence primitives — the factual layer.
 *
 *   ff:Fact       — a historical fact with dispute tracking.
 *   ff:Source     — a FIRST-CLASS source. In the Zod spike sources were
 *                   embedded per fact with globally-unique ids, so one
 *                   real-world source could not be cited by two facts
 *                   without duplication. Here citation is an edge
 *                   (ff:Cites), so any number of facts share a source.
 *   ff:Assessment — a scholarly confidence position on a fact. Multiple
 *                   assessments per fact model scholarly disagreement.
 *                   fact_id / source_id are id-ref fields the core
 *                   resolves at write time (core:field:id-ref).
 *
 * Dates are free-text strings, as in the spike: ancient dates
 * ("-1274", "c. 600 BCE") do not fit ISO 8601, so no ordering rule is
 * imposed on them — lexicographic comparison of free-text dates would
 * reject correct BCE ranges.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idRef,
  idTemplate,
  numberField,
  primitive,
  shortText,
  str,
  strList,
} from "../_common.js";
import { CONFIDENCE_LEVELS, RELIABILITY_LEVELS, SOURCE_TYPES } from "../enums.js";

export const FACT: PrimitiveTypeDef = primitive({
  id: "ff:Fact",
  name: "Fact",
  category: "cat:ff:evidence",
  description:
    "A historical fact anchoring the factual layer. Cites sources via ff:Cites edges; ff:Assessment primitives reference it via fact_id. disputed=true requires dispute_note (ff:val:disputed-fact-has-note).",
  scoped: true,
  id_format: idTemplate("fact:{slug}"),
  fields: [
    shortText("label", "Short human-readable label for this fact.", 160),
    str("description", "Detailed description of the historical fact."),
    str("date_start", "Start of the fact's date range (ISO 8601 or free text for ancient dates).", { required: false }),
    str("date_end", "End of the fact's date range (ISO 8601 or free text).", { required: false }),
    str("place", "Geographic location associated with this fact.", { required: false }),
    strList("actors", "Named historical persons or groups involved.", { required: false }),
    bool("disputed", "Whether this fact is disputed among scholars.", { required: false }),
    str("dispute_note", "Summary of the scholarly disagreement when disputed is true.", { required: false }),
    strList("tags", "Free-form classification tags.", { required: false }),
  ],
});

export const SOURCE: PrimitiveTypeDef = primitive({
  id: "ff:Source",
  name: "Source",
  category: "cat:ff:evidence",
  description:
    "A historical source, shared by any number of facts through ff:Cites edges. reliability has no default: state \"unknown\" explicitly when unassessed.",
  scoped: true,
  id_format: idTemplate("src:{slug}"),
  fields: [
    str("citation", "Human-readable citation string."),
    enumOf("type", "Classification of the source material.", SOURCE_TYPES),
    enumOf("reliability", "Qualitative reliability assessment.", RELIABILITY_LEVELS),
    str("note", "Free-text annotation on this source.", { required: false }),
  ],
});

export const ASSESSMENT: PrimitiveTypeDef = primitive({
  id: "ff:Assessment",
  name: "Assessment",
  category: "cat:ff:evidence",
  description:
    "A scholarly confidence assessment on a fact — who claims what, with what confidence. At least one of confidence_level / confidence_score is required (ff:val:assessment-has-confidence).",
  scoped: true,
  id_format: idTemplate("assess:{slug}"),
  fields: [
    idRef("fact_id", "The ff:Fact this assessment is about.", "ff:Fact"),
    shortText(
      "assessor",
      'Who makes this assessment (e.g. "Braudel", "author", "scholarly consensus").',
      160,
    ),
    enumOf("confidence_level", "Qualitative confidence band.", CONFIDENCE_LEVELS, {
      required: false,
    }),
    numberField("confidence_score", "Numeric confidence in [0, 1].", {
      required: false,
      min: 0,
      max: 1,
    }),
    idRef("source_id", "The ff:Source backing this assessment.", "ff:Source", {
      required: false,
    }),
    str("note", "Free-text annotation on this assessment.", { required: false }),
  ],
});

export const EVIDENCE_PRIMITIVES: PrimitiveTypeDef[] = [FACT, SOURCE, ASSESSMENT];
