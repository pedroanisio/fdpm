/**
 * DNIS primitive types per SPEC-CORE §5.6.1.
 *
 *   dnis:Document — a document container; immutable schema_version /
 *                   hash_algorithm / nid_format; opaque metadata as
 *                   JSON-serialized string.
 *   dnis:Node     — a paragraph-grain node with content, position,
 *                   parent linkage, lineage, and audit/revision fields.
 *
 * The id_format pattern uses {slug} as a free-form identifier section.
 * The DNIS NID is stored as the SPEC-CORE primitive `uid` (per SPEC-UID);
 * the slug-shaped `id` is a human-readable mirror that the adapter
 * derives from the NID at create time.
 */
import type { PrimitiveTypeDef } from "../../src/core/models/meta.js";
import { enumOf, idTemplate, intField, iso, jsonString, primitive, str, strList } from "./_common.js";

export const DNIS_DOCUMENT: PrimitiveTypeDef = primitive({
  id: "dnis:Document",
  name: "DNIS Document",
  category: "cat:dnis:document",
  description:
    "A document container per SPEC-DNIS §5.2. Carries the document-wide hash algorithm, NID format, and the SPEC-DNIS schema_version the document was created under (immutable per §5.2). Opaque metadata is held as a JSON-serialized string.",
  scoped: true,
  id_format: idTemplate("dnis:doc:{slug}", "global"),
  fields: [
    iso("created_at", "ISO-8601 timestamp at document creation."),
    str("created_by", "AgentId of the document creator."),
    str(
      "schema_version",
      "Immutable. The SPEC-DNIS revision the document was created under (e.g. '0.1.7').",
    ),
    enumOf("hash_algorithm", "Document-wide content-hash algorithm. SHA-256 REQUIRED, BLAKE3 OPTIONAL.", [
      "sha256",
      "blake3",
    ]),
    enumOf(
      "nid_format",
      "Node-identifier format. ULID/UUIDv7 are time-sortable; UUIDv4/NanoID are SPEC-DNIS §4.1 privacy carve-outs and forfeit time-sortability.",
      ["ulid", "uuidv7", "uuidv4", "nanoid"],
    ),
    jsonString("metadata", "Opaque metadata, JSON-serialized. Empty object {} when absent.", {
      required: false,
    }),
  ],
});

export const DNIS_NODE: PrimitiveTypeDef = primitive({
  id: "dnis:Node",
  name: "DNIS Node",
  category: "cat:dnis:document",
  description:
    "A paragraph-grain node per SPEC-DNIS §5.3. The SPEC-CORE primitive `uid` MUST equal the DNIS NID. Identity is independent of content, position, and lineage; revision is monotonic per node.",
  scoped: true,
  id_format: idTemplate("dnis:node:{slug}", "global"),
  fields: [
    str("document_id", "Stable DocumentId of the owning dnis:Document."),
    str("kind", "Application-defined node kind, e.g. 'paragraph', 'section'."),
    jsonString("content", "Node content, JSON-serialized. Shape determined by `kind`."),
    str(
      "content_hash",
      "algo:hex form per SPEC-DNIS §9.1; algo segment MUST match Document.hash_algorithm.",
    ),
    str("parent_node_id", "Parent node NID, or empty string for root-level nodes.", {
      required: false,
    }),
    str("position", "Fractional-index position string per SPEC-DNIS §6."),
    strList(
      "derived_from",
      "Lineage: ancestor NIDs from which this node was derived. Empty for fresh creates. Defense-in-depth mirror of the dnis:DerivedFrom relation graph (which is normative; see SPEC-CORE §5.6.4).",
      { required: false },
    ),
    str("created_by", "Immutable AgentId of the node creator."),
    iso("created_at", "Immutable ISO-8601 timestamp at node creation."),
    intField("revision", "Monotonic per-node integer; starts at 0; bumped on edit/move/split/retire."),
    str("last_edited_by", "AgentId of the most recent mutator."),
    iso("last_edited_at", "ISO-8601 timestamp of the most recent mutation."),
    str("last_operation_id", "OperationId of the most recent mutation."),
    iso("retired_at", "Set when the node is retired; absence means active.", { required: false }),
    str("retired_by", "AgentId who retired the node.", { required: false }),
  ],
});

export const ALL_PRIMITIVES: PrimitiveTypeDef[] = [DNIS_DOCUMENT, DNIS_NODE];
