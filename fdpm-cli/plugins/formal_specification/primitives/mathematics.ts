import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  int,
  primitive,
  str,
  strList,
  structList,
  text,
} from "../_common.js";

/**
 * Mathematics category — equations, complexity analyses, formal
 * mathematical objects.
 *
 * Mirrors §F (CR-001) of src/fdpm/plugins/formal_specification.py:
 *   fs:Equation (with Variable inline struct), fs:ComplexityAnalysis
 *   (with ComplexityEntry inline struct).
 */
export const MATHEMATICS_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Equation",
    name: "Equation",
    category: "cat:mathematics",
    description: "A named mathematical expression with declared variables.",
    id_format: idTemplate("equation:{name}"),
    fields: [
      str("name", "Equation name or label."),
      int("number", "Display number as it appears in the paper.", { required: false }),
      text("expression", "The mathematical expression in a declared notation.", {
        maxLength: 2000,
      }),
      enumOf("notation", "Notation format used in expression.", [
        "latex",
        "mathml",
        "pseudocode",
        "ascii",
      ]),
      structList("variables", "Variables used in equation.", "Variable", { minItems: 1 }),
      text("domain_constraints", "Domain restrictions on inputs.", {
        required: false,
        maxLength: 1000,
      }),
      text("derivation", "Informal justification or derivation sketch.", {
        required: false,
        maxLength: 2000,
      }),
    ],
    inline_structs: [
      inlineStruct("Variable", [
        str("name", "Variable name."),
        str("shape", "Type or shape."),
        str("description", "Variable description."),
      ]),
    ],
  }),

  primitive({
    id: "fs:ComplexityAnalysis",
    name: "ComplexityAnalysis",
    category: "cat:mathematics",
    description: "A comparative complexity analysis of multiple mechanisms.",
    id_format: idTemplate("complexity:{name}"),
    fields: [
      str("name", "Analysis name."),
      structList("entries", "One entry per mechanism compared.", "ComplexityEntry", {
        minItems: 1,
      }),
      strList("dimensions", "Complexity dimensions measured.", { minItems: 1 }),
      text("conclusion", "Summary finding.", { required: false, maxLength: 800 }),
    ],
    inline_structs: [
      inlineStruct("ComplexityEntry", [
        str("mechanism", "Mechanism name."),
        strList("values", "Complexity values per dimension."),
        str("notes", "Additional notes."),
      ]),
    ],
  }),
];
