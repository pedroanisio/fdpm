import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  int,
  iso,
  primitive,
  str,
  strList,
  text,
} from "../_common.js";

/**
 * Structure category — document organization and composition.
 * Mirrors §A of src/fdpm/plugins/formal_specification.py:
 *   fs:Section, fs:ChangeRecord, fs:Requirement, fs:Audience, fs:Figure.
 *
 * fs:Section is the partition unit (Core SPEC §5.4.3): projects on this
 * profile may be split along Section boundaries.
 *
 * @deprecated fs:Section is deprecated in favour of dnis:Node sections
 * via profile:formal-specification-dnis:0.1. The DNIS path derives
 * §N.M.K numbering from the dnis:Node graph (DFS sorted by SPEC-DNIS
 * Position) and removes the "author hand-types `number`" failure mode
 * that fs:Section requires. Existing projects on
 * profile:formal-specification:3.0 continue to work; new build scripts
 * SHOULD target profile:formal-specification-dnis:0.1 and create
 * dnis:Node primitives instead.
 */
export const STRUCTURE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Section",
    name: "Section",
    category: "cat:structure",
    description:
      "DEPRECATED in favour of dnis:Node sections via profile:formal-specification-dnis:0.1. A numbered top-level section of the specification; sibling order is determined by the author-supplied `number` field, which the DNIS path replaces with graph-derived dotted numbering.",
    scoped: true,
    is_partition_unit: true,
    id_format: idTemplate("section:{number}"),
    fields: [
      int("number", "Section number."),
      str("title", "Section heading."),
      enumOf("status", "Current section status.", ["stable", "draft", "deprecated"]),
      str("version", "Spec version for this section."),
      text("description", "Summary of what this section covers.", { maxLength: 800 }),
    ],
  }),

  primitive({
    id: "fs:ChangeRecord",
    name: "ChangeRecord",
    category: "cat:structure",
    description: "A version change entry tracking spec modifications.",
    id_format: idTemplate("change:{version}:{sequence}"),
    fields: [
      str("version", "Version this change belongs to."),
      iso("date", "Date of the change."),
      str("author", "Who made the change."),
      text("summary", "Summary of what changed.", { maxLength: 800 }),
      strList("affected_primitives", "IDs of primitives affected."),
    ],
  }),

  primitive({
    id: "fs:Requirement",
    name: "Requirement",
    category: "cat:structure",
    description: "An external requirement this spec satisfies.",
    id_format: idTemplate("requirement:{source}:{sequence}"),
    fields: [
      str("source", "Origin (e.g. RFC number, backlog ID)."),
      text("statement", "The requirement statement.", { maxLength: 800 }),
      enumOf("priority", "Priority per RFC 2119.", ["must", "should", "may"]),
    ],
  }),

  primitive({
    id: "fs:Audience",
    name: "Audience",
    category: "cat:structure",
    description: "An audience or visibility tag for filtering.",
    id_format: idTemplate("audience:{name}"),
    fields: [
      str("name", "Audience name."),
      enumOf("visibility", "Visibility level.", ["public", "internal", "restricted"]),
      text("description", "Who this audience represents.", { maxLength: 280 }),
    ],
  }),

  primitive({
    id: "fs:Figure",
    name: "Figure",
    category: "cat:structure",
    description: "A figure or diagram in the document.",
    id_format: idTemplate("figure:{number}"),
    fields: [
      int("number", "Figure number."),
      text("caption", "Figure caption.", { maxLength: 800 }),
      enumOf("kind", "Figure type.", [
        "architecture_diagram",
        "data_flow",
        "attention_map",
        "chart",
        "table",
        "other",
      ]),
      strList("depicts", "IDs of primitives depicted.", { minItems: 1 }),
      str("asset_path", "Path to image asset if available.", { required: false }),
    ],
  }),
];
