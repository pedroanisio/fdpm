/**
 * Capability primitives: Tool, Endpoint, Capability, ConfigEntry,
 * SchemaDefinition, ErrorCategory. Cover SPEC-MCP §5 (Tool Surface),
 * SPEC-CORE §9 (Endpoints) / §15 (Configuration) / §16 (Errors),
 * SPEC-PLUGGABLE §4 (Capability Catalogue) / §5 (Manifest Schema).
 */
import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  intField,
  primitive,
  str,
  strList,
  structField,
  text,
} from "../_common.js";

const SchemaField = inlineStruct("SchemaField", [
  str("name", "Field name."),
  str("type", "Field type (string, integer, ref, ...)."),
  text("description", "Field description.", { maxLength: 300 }),
  str("required", "true|false."),
]);

export const CAPABILITY_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "spec:Tool",
    name: "Tool",
    category: "cat:spec:capability",
    description:
      "An MCP tool entry (SPEC-MCP §5). Tier governs default exposure; readOnlyHint / destructiveHint annotations are derived from tier.",
    id_format: idTemplate("spec:tool:{slug}", "global"),
    fields: [
      str("tool_name", "Tool name (e.g., 'fdpm.primitive.create')."),
      enumOf("tier", "Tool tier — drives default exposure.", [
        "read_only",
        "validating_write",
        "destructive",
      ]),
      text("backed_by", "What backs this tool — Host method or command handler.", {
        maxLength: 400,
      }),
      text("description", "Human-readable description shown to MCP clients.", { maxLength: 800 }),
      str("input_schema_ref", "Pointer to the Zod / JSON Schema for input.", { required: false }),
      str("output_schema_ref", "Pointer to the Zod / JSON Schema for output.", { required: false }),
      enumOf("exposure", "Default exposure policy.", [
        "always",
        "default_on",
        "opt_in",
        "never",
      ]),
    ],
  }),

  primitive({
    id: "spec:Endpoint",
    name: "Endpoint",
    category: "cat:spec:capability",
    description:
      "A platform endpoint (SPEC-CORE §9). HTTP method + path + namespace. Used to populate the reserved-endpoints table.",
    id_format: idTemplate("spec:ep:{slug}", "global"),
    fields: [
      enumOf("method", "HTTP verb.", ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
      str("path", "URL path with placeholders, e.g., '/workbooks/{id}'."),
      enumOf("namespace", "Reservation namespace.", [
        "core",
        "plugin",
        "admin",
        "ui",
        "audit",
      ]),
      text("description", "What the endpoint does.", { maxLength: 600 }),
      strList("permissions", "Required permissions.", { required: false }),
    ],
  }),

  primitive({
    id: "spec:Capability",
    name: "Plugin Capability",
    category: "cat:spec:capability",
    description:
      "A pluggable capability slot (SPEC-PLUGGABLE §4). Each entry describes a kind plugins may contribute, multiplicity, and permission requirements.",
    id_format: idTemplate("spec:cap:{slug}", "global"),
    fields: [
      str("capability_id", "Capability id (e.g., 'cap:profile', 'cap:renderer')."),
      text("description", "What plugins contribute via this capability.", { maxLength: 800 }),
      str("multiplicity", "Multiplicity per plugin (e.g., '0..1', '0..N').", { required: false }),
      strList("required_permissions", "Permissions required to register.", { required: false }),
    ],
  }),

  primitive({
    id: "spec:ConfigEntry",
    name: "Configuration Entry",
    category: "cat:spec:capability",
    description:
      "An environment variable or configuration key (SPEC-CORE §15.1). Used to build the configuration table.",
    id_format: idTemplate("spec:cfg:{slug}", "global"),
    fields: [
      str("key", "Variable / key name (e.g., 'FDPM_DATA_DIR')."),
      str("default", "Default value as a string. Empty string for no default.", { required: false }),
      text("purpose", "What it controls.", { maxLength: 600 }),
      enumOf("scope", "Scope of the configuration entry.", [
        "core",
        "plugin",
        "mcp",
        "repl",
        "frontend",
      ]),
      enumOf("kind", "Value kind for parsing.", [
        "string",
        "integer",
        "boolean",
        "path",
        "csv",
        "duration",
      ]),
    ],
  }),

  primitive({
    id: "spec:SchemaDefinition",
    name: "Schema Definition",
    category: "cat:spec:capability",
    description:
      "A schema block embedded in a SPEC (SPEC-PLUGGABLE §5.1 manifest schema). Renders as a fenced code block. The renderer can also workbook a field table.",
    id_format: idTemplate("spec:schema:{slug}", "global"),
    fields: [
      str("name", "Schema name."),
      enumOf("dialect", "Schema dialect.", [
        "json_schema_2020_12",
        "zod",
        "protobuf",
        "openapi_3",
        "typescript",
        "ad_hoc",
      ]),
      text("body", "Verbatim schema body (printed inside a fenced code block).", {
        maxLength: 20000,
      }),
      structField("fields", "Optional structured field list for tabular projection.", "SchemaField", {
        list: true,
        required: false,
      }),
    ],
    inline_structs: [SchemaField],
  }),

  primitive({
    id: "spec:ErrorCategory",
    name: "Error Category",
    category: "cat:spec:capability",
    description:
      "An error taxonomy entry (SPEC-CORE §16). Categories are closed; SPEC-MCP-SERVER §9 refers to the same taxonomy without extending it.",
    id_format: idTemplate("spec:err:{slug}", "global"),
    fields: [
      str("category", "Category name (e.g., 'validation', 'permission')."),
      text("when_used", "When this category fires.", { maxLength: 800 }),
      str("http_status", "HTTP status code mapping.", { required: false }),
      strList("evidence_keys", "Documented evidence.* keys for this category.", {
        required: false,
      }),
    ],
  }),
];
