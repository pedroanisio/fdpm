/**
 * Document-scope primitives: spec:Document, spec:Section, spec:Term.
 * These cover SPEC-CORE §0 (Document Status) + the section tree + the §3
 * Definitions table used by every SPEC.
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idTemplate,
  inlineStruct,
  intField,
  iso,
  primitive,
  str,
  strList,
  structField,
  text,
} from "../_common.js";

const DocumentStatusRow = inlineStruct("DocumentStatusRow", [
  str("field", "Field name (e.g., 'Spec ID', 'Audience', 'Required reads')."),
  text("value", "Value cell — may be plain text or Markdown.", { maxLength: 1000 }),
]);

export const DOCUMENT_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Document",
    name: "SPEC Document",
    category: "cat:spec:document",
    description:
      "The root SPEC artifact. Carries identity, frontmatter inputs, the §0 status table, the PALS-LAW banner toggle, and the disclaimer reference. Every other primitive is reachable from a Document via spec:HasSection / spec:Cites / spec:Defines.",
    id_format: idTemplate("spec:doc:{slug}", "global"),
    fields: [
      str("title", "Document title — used as the H1 heading."),
      str("subtitle", "Optional subtitle shown after the H1.", { required: false }),
      str("spec_id", "Stable spec identifier, e.g., 'spec:fdpm:core:1.1'."),
      str("version", "Semantic version string, e.g., '1.1.1'."),
      enumOf("status", "Document lifecycle status.", [
        "Draft",
        "Proposal",
        "Stable",
        "Deprecated",
        "Superseded",
      ]),
      text("audience", "Target readers (free text).", { maxLength: 500 }),
      strList("required_reads", "List of paths or spec ids the reader must read first.", {
        required: false,
      }),
      str("companion_code", "Path or URL to companion implementation, if any.", {
        required: false,
      }),
      str("peer_spec", "Path or URL to a peer SPEC (same Host, different surface).", {
        required: false,
      }),
      str("supersedes", "Spec id this document supersedes.", { required: false }),
      str("implements", "@PURPOSE.md or higher SPEC this implements.", { required: false }),
      structField(
        "status_rows",
        "Additional rows for the §0 Document Status table beyond the canonical fields.",
        "DocumentStatusRow",
        { list: true, required: false },
      ),
      text(
        "disclaimer_path",
        "Relative path to the workbook DISCLAIMER.md (e.g., '../../DISCLAIMER.md').",
        { maxLength: 200 },
      ),
      bool("pals_banner", "Emit the PALS-LAW banner blockquote at the top."),
      text("pals_extension", "Document-specific extension to the PALS banner.", {
        required: false,
        maxLength: 1500,
      }),
      iso("date", "Generation date (YYYY-MM-DD)."),
      str("generated_by", "Identifier of the model/tool that generated the document."),
      text("revision_note", "One-line revision summary for the latest version.", {
        required: false,
        maxLength: 300,
      }),
      str(
        "source_script",
        "Repo-relative path to the build script that authored this document. Surfaced in the GENERATED-DOCUMENT banner so readers see where the source of truth lives.",
        { required: false },
      ),
      text(
        "regeneration_command",
        "Verbatim shell command(s) that reproduce this document. Surfaced in the GENERATED-DOCUMENT banner. Multi-line is allowed; the renderer emits it inside a fenced bash block.",
        { required: false, maxLength: 600 },
      ),
    ],
    inline_structs: [DocumentStatusRow],
    is_partition_unit: true,
  }),

  primitive({
    id: "spec:Section",
    name: "Section",
    category: "cat:spec:document",
    description:
      "A numbered section in a SPEC. Sections form a tree via spec:HasSection. The renderer materialises the heading from `number` + `title` and the body from `body_md`. Mandatory sections (Document Status, Disclaimer) are emitted by the renderer regardless of presence here, so this primitive only models user-authored content.",
    id_format: idTemplate("spec:sec:{slug}", "global"),
    scoped: true,
    fields: [
      str("number", "Section number string, e.g., '1', '1.2', '5.5.1'. Determines order."),
      str("title", "Section title used as the heading."),
      intField("depth", "Heading depth (2 = ##, 3 = ###, 4 = ####). Computed if omitted.", {
        required: false,
      }),
      text(
        "body_md",
        "Section body as Markdown. Free-form prose, lists, tables, blockquotes, code blocks. The renderer pastes this verbatim.",
        { maxLength: 20000 },
      ),
      enumOf(
        "kind",
        "Section role hint. The renderer uses this to drive auto-includes (e.g., a 'definitions' section auto-includes spec:Term entries).",
        [
          "prose",
          "definitions",
          "stakeholders",
          "quality_attributes",
          "decision_summary",
          "principles",
          "capability_table",
          "tool_surface",
          "schema",
          "scenarios",
          "adr",
          "tradeoff_matrix",
          "future_work",
          "open_questions",
          "references",
          "acceptance_criteria",
          "risks",
          "implementation_plan",
          "revision_history",
          "error_taxonomy",
          "configuration",
          "conformance",
          "migration",
        ],
        { required: false },
      ),
      strList("tags", "Free-form tags (e.g., 'pals-law', 'normative').", { required: false }),
    ],
  }),

  primitive({
    id: "spec:Term",
    name: "Definition",
    category: "cat:spec:document",
    description:
      "A definition row. Auto-rendered into the §3 Definitions table when a section of kind='definitions' references it (or for the canonical Definitions section if present).",
    id_format: idTemplate("spec:term:{slug}", "global"),
    fields: [
      str("term", "Term being defined."),
      text("definition", "Definition body.", { maxLength: 1000 }),
      str("synonyms", "Comma-separated synonyms.", { required: false }),
    ],
  }),
];
