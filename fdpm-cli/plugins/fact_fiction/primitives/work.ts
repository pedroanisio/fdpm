/**
 * ff:Work — the root primitive: one historical-fiction work.
 *
 * Carries the world boundary and the GLOBAL narrative style. The
 * spike's nested NarrativeStyle / DictionProfile / InteriorityPolicy
 * objects are flattened onto the work as typed enum/bool fields so the
 * core's field gates enforce every value (a nested struct would only
 * be shape-checked as "an object"). One deliberate tightening vs the
 * spike: `tone` was an enum array with min 1; the core cannot check
 * list-element enum membership, so the primary tone is a validated
 * enum field and additional tones are a free string list.
 *
 * Style overrides live as `style_override` JSON blobs on ff:Arc /
 * ff:Chapter / ff:Scene; the manuscript-outline renderer resolves the
 * cascade (work → arc → chapter → scene, most specific wins) exactly
 * as the spike's NarrativeStyleOverrideSchema documents.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idTemplate,
  primitive,
  shortText,
  str,
  strList,
} from "../_common.js";
import {
  ARCHAIC_LEVELS,
  IDIOMATIC_FREEDOMS,
  NARRATIVE_POVS,
  NARRATIVE_RELIABILITIES,
  NARRATOR_DISTANCES,
  TEMPORAL_MODES,
  TONES,
} from "../enums.js";

export const WORK: PrimitiveTypeDef = primitive({
  id: "ff:Work",
  name: "Work",
  category: "cat:ff:structure",
  description:
    "The historical fiction work itself: title, period, world boundary, and the global narrative style that arcs, chapters, and scenes may override.",
  scoped: true,
  id_format: idTemplate("wrk:{slug}"),
  fields: [
    shortText("title", "Title of the historical fiction work.", 200),
    shortText(
      "historical_period",
      'The historical period covered (e.g. "Late Bronze Age Levant").',
      200,
    ),
    str("world_start", "Earliest date in the story world (ISO 8601 or free text for ancient dates).", { required: false }),
    str("world_end", "Latest date in the story world (ISO 8601 or free text).", { required: false }),
    strList("regions", "Geographic regions the story world encompasses.", { required: false }),
    enumOf("pov", "Point-of-view mode for the narrative voice.", NARRATIVE_POVS),
    enumOf("temporal_mode", "How the narrative handles temporal ordering.", TEMPORAL_MODES),
    enumOf("tone_primary", "Dominant emotional register of the prose.", TONES),
    strList(
      "tones_additional",
      "Additional tonal registers beyond tone_primary (free-form; the canonical vocabulary is the tone enum).",
      { required: false },
    ),
    enumOf("narrator_distance", "Psychic distance between narrator and events.", NARRATOR_DISTANCES),
    enumOf("narrative_reliability", "Narrator reliability assessment.", NARRATIVE_RELIABILITIES),
    enumOf("archaic_level", "Degree of archaic diction in the prose.", ARCHAIC_LEVELS),
    bool("modern_intrusion_allowed", "Whether modern idioms may intrude into the prose."),
    enumOf("idiomatic_freedom", "How freely modern idioms may appear.", IDIOMATIC_FREEDOMS),
    bool(
      "real_figures_inner_thoughts_allowed",
      "Whether the narrative may depict inner thoughts of real historical figures.",
    ),
    bool(
      "invented_inner_thoughts_allowed",
      "Whether the narrative may depict inner thoughts of invented characters.",
    ),
  ],
});
