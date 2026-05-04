import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  idTemplate,
  inlineStruct,
  primitive,
  str,
  strList,
  structList,
  text,
} from "../_common.js";

/**
 * Type System category — formal type definitions and schemas.
 * Mirrors §B of src/fdpm/plugins/formal_specification.py:
 *   fs:TypeDefinition (with TypeField inline struct), fs:Notation, fs:EnumDef.
 */
export const TYPE_SYSTEM_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:TypeDefinition",
    name: "TypeDefinition",
    category: "cat:type-system",
    description: "A formal data structure or schema definition.",
    id_format: idTemplate("type:{name}"),
    fields: [
      str("name", "Type name (e.g. Token, ToolCall)."),
      text("description", "What this type represents.", { maxLength: 800 }),
      text("schema", "The type schema as structured text.", { maxLength: 2000 }),
      structList("fields", "Typed fields of this definition.", "TypeField", { minItems: 1 }),
    ],
    inline_structs: [
      inlineStruct("TypeField", [
        str("name", "Field name."),
        str("field_type", "Field type specification."),
        bool("required", "Whether the field is required."),
        str("description", "Field description."),
      ]),
    ],
  }),

  primitive({
    id: "fs:Notation",
    name: "Notation",
    category: "cat:type-system",
    description: "A formal notation or language used in the spec.",
    id_format: idTemplate("notation:{name}"),
    fields: [
      str("name", "Notation name."),
      text("description", "What this notation is used for.", { maxLength: 800 }),
      str("syntax_reference", "URL or section ID for syntax docs."),
      strList("used_in", "Primitive IDs using this notation."),
    ],
  }),

  primitive({
    id: "fs:EnumDef",
    name: "EnumDef",
    category: "cat:type-system",
    description: "A reusable enumeration definition.",
    id_format: idTemplate("enum:{name}"),
    fields: [
      str("name", "Enum name."),
      strList("values", "The enumeration values.", { minItems: 1 }),
      text("description", "What this enumeration represents.", { maxLength: 800 }),
    ],
  }),
];
