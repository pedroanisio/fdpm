/**
 * Categories — the coupled layers of the fact-fiction model.
 *
 * The spike's DOMAIN.md names five layers: fact, inference, fiction,
 * narrative style, and linkage. Style lives as fields on ff:Work and
 * as overrides on structure nodes, and linkage is pure relations, so
 * three primitive categories remain: the evidentiary layer, the
 * fictional layer, and the manuscript structure.
 */
import type { CategoryDef } from "../../src/core/models/meta.js";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:ff:evidence",
    name: "Evidence",
    description:
      "The factual layer: historical facts, the sources that attest them, and scholarly confidence assessments.",
  },
  {
    id: "cat:ff:fiction",
    name: "Fiction",
    description:
      "The invented layer: fiction elements graded by historicity, and the historical constraints that bound them.",
  },
  {
    id: "cat:ff:structure",
    name: "Structure",
    description:
      "The manuscript: the work itself and its arc → chapter → scene hierarchy, with narrative-style overrides.",
  },
];
