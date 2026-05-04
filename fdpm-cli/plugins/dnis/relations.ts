/**
 * DNIS relations per SPEC-CORE §5.6.1.
 *
 *   dnis:DerivedFrom — descendant → ancestor lineage edge. Created
 *                      atomically with the descendant during `split`
 *                      and `merge` operations. Normative source for
 *                      SPEC-DNIS §11.3 lineage walks.
 *
 *   dnis:MigratedFrom — new dnis:Document → old dnis:Document, recorded
 *                       under SPEC-CORE §5.6.5 schema-version migration.
 *                       Created by the upcaster path; not emitted by
 *                       routine DNIS Operations.
 */
import type { RelationTypeDef } from "../../src/core/models/meta.js";

export const RELATIONS: RelationTypeDef[] = [
  {
    id: "dnis:DerivedFrom",
    name: "DerivedFrom",
    description:
      "Lineage edge: source node was derived from target node via split or merge. The relation graph is the normative source for SPEC-DNIS §11.3 lineage walks; the on-primitive `derived_from` array on dnis:Node is a denormalized read-path mirror.",
    source_types: ["dnis:Node"],
    target_types: ["dnis:Node"],
    fields: [],
    symmetric: false,
    transitive: true,
  },
  {
    id: "dnis:MigratedFrom",
    name: "MigratedFrom",
    description:
      "Document migration edge per SPEC-CORE §5.6.5: source dnis:Document is the post-migration version, target is the pre-migration version. Created by the upcaster path during a schema_version bump.",
    source_types: ["dnis:Document"],
    target_types: ["dnis:Document"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
