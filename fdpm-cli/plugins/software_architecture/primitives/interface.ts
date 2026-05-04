import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idTemplate,
  inlineStruct,
  primitive,
  stableId,
  str,
  strList,
  struct,
  text,
  textList,
} from "../_common.js";

/**
 * Interface category — how systems interact.
 * Mirrors §"--- Interface ---" of src/fdpm/plugins/software_architecture.py:
 *   sw:Endpoint, sw:Schema, sw:Contract, sw:Event.
 */
export const INTERFACE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "sw:Endpoint",
    name: "Endpoint",
    category: "cat:interface",
    description: "A single addressable interaction point.",
    scoped: false,
    id_format: idTemplate("endpoint:{method}:{path}"),
    fields: [
      str("name", "Human-readable endpoint name."),
      enumOf("protocol", "Interaction protocol.", [
        "HTTP",
        "gRPC",
        "GraphQL",
        "Event",
        "CLI",
      ]),
      str("method", "HTTP method, gRPC method, etc.", { required: false }),
      str("path", "Route, topic, or command string.", { required: false }),
      // gap-pass-2 #3 — request parameters (path / query / header / cookie).
      // Single-valued StructField[Parameter] for parity with the
      // Decision.alternatives quirk; renderers asArray() it.
      struct(
        "parameters",
        "Request parameters. Used by the OpenAPI renderer to emit a parameters: block on the operation.",
        "Parameter",
        { required: false },
      ),
      // gap-pass-2 #12 — versioning + deprecation flags.
      bool("deprecated", "Whether this endpoint is deprecated.", { required: false }),
      str(
        "deprecated_since",
        "Version or date the endpoint was deprecated.",
        { required: false },
      ),
    ],
    inline_structs: [
      inlineStruct("Parameter", [
        str("name", "Parameter name."),
        enumOf("in", "Where the parameter is carried.", [
          "path",
          "query",
          "header",
          "cookie",
        ]),
        bool("required", "Whether the caller must supply this parameter."),
        text("description", "Human-readable purpose.", {
          required: false,
          maxLength: 280,
        }),
        str("type", "Primitive type (string, integer, boolean, ...).", {
          required: false,
        }),
        str(
          "schema_id",
          "Optional sw:Schema id for non-primitive parameter shapes.",
          { required: false },
        ),
      ]),
    ],
  }),

  primitive({
    id: "sw:Schema",
    name: "Schema",
    category: "cat:interface",
    description: "A named data shape for API inputs, outputs, or events.",
    scoped: false,
    id_format: idTemplate("schema:{name}"),
    fields: [
      str("name", "Schema name."),
      struct("fields", "Ordered list of data fields.", "SchemaField", {
        minItems: 1,
      }),
      enumOf("format", "Serialization format.", [
        "JSONSchema",
        "Protobuf",
        "Avro",
        "TypeScript",
        "Custom",
      ]),
      // gap-pass-2 #12 — versioning + deprecation.
      str("version", "Semver / revision label for this schema.", { required: false }),
      bool("deprecated", "Whether this schema is deprecated.", { required: false }),
    ],
    inline_structs: [
      inlineStruct("SchemaField", [
        str("name", "Field name."),
        str("type", "Field data type."),
        bool("required", "Whether mandatory."),
        text("description", "Field purpose.", { maxLength: 140 }),
        strList("constraints", "Validation constraints.", { required: false }),
      ]),
    ],
  }),

  primitive({
    id: "sw:Contract",
    name: "Contract",
    category: "cat:interface",
    description: "A binding agreement between a provider and consumer.",
    scoped: false,
    id_format: idTemplate("contract:{provider}:{consumer}"),
    fields: [
      stableId("provider", "The entity that fulfills the contract.", "sw:Entity"),
      stableId("consumer", "The entity that depends on the contract.", "sw:Entity"),
      textList("preconditions", "What must be true before invocation.", { minItems: 1 }),
      textList("postconditions", "What will be true after successful invocation.", {
        minItems: 1,
      }),
      struct("error_conditions", "Named failure responses.", "ErrorCondition"),
    ],
    inline_structs: [
      inlineStruct("ErrorCondition", [
        str("name", "Error name."),
        text("condition", "When this error occurs.", { maxLength: 280 }),
        text("response", "What is returned to the consumer.", { maxLength: 280 }),
        // gap-pass-2 #2 — typed error mapping for the OpenAPI renderer.
        str(
          "status_code",
          "Protocol-specific status code (HTTP \"404\", gRPC \"NOT_FOUND\", ...). When absent, OpenAPI renderer infers from name.",
          { required: false },
        ),
        str(
          "schema_id",
          "Optional sw:Schema id describing the error response body.",
          { required: false },
        ),
        str(
          "media_type",
          "MIME type of the error response (default \"application/json\").",
          { required: false },
        ),
      ]),
    ],
  }),

  primitive({
    id: "sw:Event",
    name: "Event",
    category: "cat:interface",
    description: "An observable occurrence emitted by the system.",
    scoped: false,
    id_format: idTemplate("event:{source}:{name}"),
    fields: [
      str("name", "Event name."),
      stableId("source", "The entity that emits this event.", "sw:Entity"),
      stableId("schema_id", "Reference to the event's payload schema.", "sw:Schema"),
      enumOf("ordering", "Event ordering guarantee.", [
        "Unordered",
        "PartiallyOrdered",
        "TotallyOrdered",
        "PartitionOrdered",
      ]),
    ],
  }),
];
