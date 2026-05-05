/**
 * Metadata primitives — taxonomy / classification.
 *
 * EDUCATIONAL NOTE — when to split a primitive into its own type:
 *   We could have used `recipe:Recipe.tags: string[]` instead of a
 *   separate `recipe:Tag` primitive. Both work. The primitive form pays
 *   off when:
 *     - You want to attach metadata TO the tag (description, color, etc.).
 *     - You want renderers to enumerate "all tags in this workbook"
 *       cheaply via a primitive listing.
 *     - You want to relate the tag to other things later (e.g., "tag X
 *       deprecates tag Y") without re-modeling.
 *   The string-list form is right when none of the above applies.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { idTemplate, primitive, shortText } from "../_common.js";

export const TAG: PrimitiveTypeDef = primitive({
  id: "recipe:Tag",
  name: "Tag",
  category: "cat:starter:meta",
  description:
    "A classification tag (e.g. 'vegetarian', 'quick', 'dessert'). Attached to recipes via recipe:TaggedWith.",
  scoped: true,
  id_format: idTemplate("tag:{slug}"),
  fields: [
    shortText("name", "Display label for the tag.", 80),
    shortText("description", "What this tag means.", 280, { required: false }),
  ],
});
