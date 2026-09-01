/**
 * Relations — where the spike's superRefine went.
 *
 * Every hand-written referential check in the Zod spike (fiction →
 * fact, constraint → fact, scene → fact/fiction, link → both ends,
 * assessment → source) is a typed edge here: the core's relation gate
 * enforces endpoint existence and type at write time, so dangling
 * references are impossible rather than detected.
 *
 * ff:CouplesTo is the spike's FactFictionLink: the typed linkage layer
 * it calls "the load-bearing structure of the schema". The link's
 * `relation` and `explanation` ride as edge metadata — the
 * recipe:Uses quantity-on-an-edge pattern.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { enumOf, intField, str } from "./_common.js";
import { LINK_RELATIONS } from "./enums.js";

export const RELATIONS: RelationTypeDef[] = [
  {
    id: "ff:Cites",
    name: "Cites",
    description:
      "Fact cites source. Sources are shared: any number of facts may cite the same ff:Source. Optional locator pinpoints the passage.",
    source_types: ["ff:Fact"],
    target_types: ["ff:Source"],
    metadata_schema: [
      str("locator", 'Where in the source (e.g. "Poem, ll. 1-25", "p. 214").', {
        required: false,
      }),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:BasedOn",
    name: "BasedOn",
    description: "Fiction element draws upon the target fact.",
    source_types: ["ff:FictionElement"],
    target_types: ["ff:Fact"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:ConstrainedBy",
    name: "ConstrainedBy",
    description: "Fiction element is bounded by the target historical constraint.",
    source_types: ["ff:FictionElement"],
    target_types: ["ff:Constraint"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:SupportedBy",
    name: "SupportedBy",
    description: "Historical constraint is supported by the target fact.",
    source_types: ["ff:Constraint"],
    target_types: ["ff:Fact"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:CouplesTo",
    name: "CouplesTo",
    description:
      "The typed linkage layer: fiction element couples to a factual anchor. `relation` says how (dramatizes, fills_gap_in, contradicts, ...); `explanation` says why.",
    source_types: ["ff:FictionElement"],
    target_types: ["ff:Fact"],
    metadata_schema: [
      enumOf("relation", "How the fiction relates to the fact.", LINK_RELATIONS),
      str("explanation", "How and why this fiction element relates to this fact."),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:HasArc",
    name: "HasArc",
    description: "Work contains arc at the given position.",
    source_types: ["ff:Work"],
    target_types: ["ff:Arc"],
    metadata_schema: [intField("order", "1-based position of the arc within the work.")],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:HasChapter",
    name: "HasChapter",
    description: "Arc contains chapter at the given position.",
    source_types: ["ff:Arc"],
    target_types: ["ff:Chapter"],
    metadata_schema: [intField("order", "1-based position of the chapter within the arc.")],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:HasScene",
    name: "HasScene",
    description: "Chapter contains scene at the given position.",
    source_types: ["ff:Chapter"],
    target_types: ["ff:Scene"],
    metadata_schema: [intField("order", "1-based position of the scene within the chapter.")],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:Depicts",
    name: "Depicts",
    description: "Scene depicts (is anchored by) the target fact.",
    source_types: ["ff:Scene"],
    target_types: ["ff:Fact"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
  {
    id: "ff:Features",
    name: "Features",
    description: "Scene uses the target fiction element.",
    source_types: ["ff:Scene"],
    target_types: ["ff:FictionElement"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
