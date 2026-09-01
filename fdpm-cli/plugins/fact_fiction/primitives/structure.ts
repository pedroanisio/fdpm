/**
 * Structure primitives — the manuscript hierarchy.
 *
 * Ordering is NOT implicit: ff:HasArc / ff:HasChapter / ff:HasScene
 * edges carry a required integer `order`, and the renderer sorts by
 * it. (A Zod array is implicitly ordered; a graph is not — the order
 * slot is the explicit replacement.)
 *
 * `style_override` is a JSON blob holding a partial narrative style
 * (the ff:Work style field names, snake_cased). The core checks only
 * that it is an object; the merge — work → arc → chapter → scene,
 * most specific wins, per the spike's NarrativeStyleOverrideSchema —
 * is resolved by the manuscript-outline renderer.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { idTemplate, jsonField, primitive, shortText, str } from "../_common.js";

const STYLE_OVERRIDE_DOC =
  "Partial narrative-style override (JSON object of ff:Work style field names, e.g. {\"pov\": \"first_person\"}). Supplied keys replace; omitted keys inherit from the enclosing level.";

export const ARC: PrimitiveTypeDef = primitive({
  id: "ff:Arc",
  name: "Arc",
  category: "cat:ff:structure",
  description: "A narrative arc: the top structural unit under the work. Contains chapters via ff:HasChapter.",
  scoped: true,
  id_format: idTemplate("arc:{slug}"),
  fields: [
    shortText("title", "Arc title.", 200),
    jsonField("style_override", STYLE_OVERRIDE_DOC),
  ],
});

export const CHAPTER: PrimitiveTypeDef = primitive({
  id: "ff:Chapter",
  name: "Chapter",
  category: "cat:ff:structure",
  description: "A chapter within an arc. Contains scenes via ff:HasScene.",
  scoped: true,
  id_format: idTemplate("ch:{slug}"),
  fields: [
    shortText("title", "Chapter title.", 200),
    jsonField("style_override", STYLE_OVERRIDE_DOC),
  ],
});

export const SCENE: PrimitiveTypeDef = primitive({
  id: "ff:Scene",
  name: "Scene",
  category: "cat:ff:structure",
  description:
    "A scene: the unit that touches the record. Anchors to facts via ff:Depicts and uses fiction via ff:Features; a scene with neither warns (ff:val:scene-anchored).",
  scoped: true,
  id_format: idTemplate("scene:{slug}"),
  fields: [
    shortText("title", "Scene title.", 200),
    str("summary", "Brief summary of the scene."),
    str("date_hint", "Approximate date or period for this scene (free text).", { required: false }),
    str("place", "Location where this scene takes place.", { required: false }),
    str(
      "plausibility_note",
      "Reviewer's annotation on the plausibility of this scene.",
      { required: false },
    ),
    jsonField("style_override", STYLE_OVERRIDE_DOC),
  ],
});

export const STRUCTURE_PRIMITIVES: PrimitiveTypeDef[] = [ARC, CHAPTER, SCENE];
