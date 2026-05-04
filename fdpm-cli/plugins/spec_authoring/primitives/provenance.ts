/**
 * Provenance primitives: Reference, Revision, MigrationStep,
 * ImplementationChange. Cover SPEC §19/§23 References, §24 Revision history,
 * §13 Required Changes, and SPEC-CORE §19 Migration plan.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  intField,
  iso,
  primitive,
  str,
  strList,
  text,
} from "../_common.js";

export const PROVENANCE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Reference",
    name: "Reference",
    category: "cat:spec:provenance",
    description:
      "An external reference cited by the SPEC (paper, RFC, ISO standard, in-repo file, web URL). PALS-LAW requires every reference to carry verification posture so the reader knows whether it has been independently checked.",
    id_format: idTemplate("spec:ref:{slug}", "global"),
    fields: [
      enumOf("kind", "Reference kind.", [
        "paper",
        "rfc",
        "iso_standard",
        "ieee_standard",
        "book",
        "spec",
        "repo_file",
        "url",
        "doi",
        "first_principles",
      ]),
      str("citation", "Full citation text (authors, title, venue, year, DOI/URL)."),
      str("locator", "DOI, URL, or in-repo path.", { required: false }),
      enumOf("verification", "Has the citation been independently verified?", [
        "verified",
        "unverified",
        "self_evident",
        "cannot_verify",
      ]),
      text(
        "verification_note",
        "How it was verified, or why it is unverified. Required when verification != 'self_evident'.",
        { required: false, maxLength: 600 },
      ),
    ],
  }),

  primitive({
    id: "spec:Revision",
    name: "Revision",
    category: "cat:spec:provenance",
    description:
      "An entry in the §24 Revision history. Ordered by version (semver). Notes summarise the per-paragraph diff.",
    id_format: idTemplate("spec:rev:{version}", "global"),
    fields: [
      str("version", "Semantic version, e.g., '1.1.1'."),
      iso("date", "Revision date (YYYY-MM-DD)."),
      str("title", "One-line headline."),
      text("notes", "Body of the revision note. Markdown allowed.", { maxLength: 5000 }),
      strList("affected_sections", "Sections touched (numbers like '5.5', '14.2').", {
        required: false,
      }),
      enumOf("kind", "Semantic-versioning bump kind.", [
        "major",
        "minor",
        "patch",
        "editorial",
      ]),
    ],
  }),

  primitive({
    id: "spec:MigrationStep",
    name: "Migration Step",
    category: "cat:spec:provenance",
    description:
      "A migration step (SPEC-CORE §19 Migration from Current Codebase, SPEC-PLUGGABLE §9.3). Ordered.",
    id_format: idTemplate("spec:mig:{number}", "global"),
    fields: [
      intField("ordinal", "Step order."),
      str("label", "Short step label."),
      text("action", "What is done in this step.", { maxLength: 1500 }),
      strList("affected_paths", "Files / directories touched.", { required: false }),
      strList("depends_on", "Step ids that must precede this step.", { required: false }),
    ],
  }),

  primitive({
    id: "spec:ImplementationChange",
    name: "Implementation Change",
    category: "cat:spec:provenance",
    description:
      "A row of the §13 Required Changes to Existing Code table (SPEC-MCP §13, SPEC-REPL §13, SPEC-PLUGGABLE §16).",
    id_format: idTemplate("spec:chg:{slug}", "global"),
    fields: [
      str("area", "Area / file / module touched."),
      text("change", "What is changed.", { maxLength: 1500 }),
      enumOf("complexity", "T-shirt complexity.", ["XS", "S", "M", "L", "XL"]),
      enumOf("status", "Implementation status.", [
        "not_started",
        "in_progress",
        "complete",
        "blocked",
      ]),
    ],
  }),
];
