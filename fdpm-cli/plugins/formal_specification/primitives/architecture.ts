import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  primitive,
  str,
  strList,
  structList,
  text,
} from "../_common.js";

/**
 * Architecture category — components, modules, hyperparameters,
 * configurations.
 *
 * Mirrors §G (CR-001) of src/fdpm/plugins/formal_specification.py:
 *   fs:Component (with TensorSpec inline struct), fs:Hyperparameter,
 *   fs:Configuration (with ParamValue inline struct).
 */
export const ARCHITECTURE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Component",
    name: "Component",
    category: "cat:architecture",
    description: "An architectural component or module with typed I/O.",
    scoped: true,
    id_format: idTemplate("component:{name}"),
    fields: [
      str("name", "Component name."),
      text("description", "What this component does.", { maxLength: 1000 }),
      structList("inputs", "Input tensor specifications.", "TensorSpec", { minItems: 1 }),
      structList("outputs", "Output tensor specifications.", "TensorSpec", { minItems: 1 }),
      strList("parameters", "Hyperparameter IDs that configure this component.", {
        required: false,
      }),
      strList("sub_components", "IDs of child fs:Component instances.", { required: false }),
      str("repeat_count", "Expression for stacking count.", { required: false }),
      str("implements", "ID of the fs:Equation this component realises.", {
        required: false,
      }),
    ],
    inline_structs: [
      inlineStruct("TensorSpec", [
        str("name", "Tensor name."),
        str("shape", "Tensor shape."),
        str("dtype", "Data type."),
        str("description", "Tensor description."),
      ]),
    ],
  }),

  primitive({
    id: "fs:Hyperparameter",
    name: "Hyperparameter",
    category: "cat:architecture",
    description: "A named hyperparameter with type and default value.",
    id_format: idTemplate("hyperparam:{symbol}"),
    fields: [
      str("name", "Human-readable name."),
      str("symbol", "Mathematical symbol."),
      enumOf("dtype", "Value type.", ["integer", "float", "boolean", "string"]),
      str("default_value", "Default value as string."),
      text("valid_range", "Valid range or constraint.", { required: false, maxLength: 200 }),
      text("sensitivity", "Notes on effect of varying this parameter.", {
        required: false,
        maxLength: 800,
      }),
    ],
  }),

  primitive({
    id: "fs:Configuration",
    name: "Configuration",
    category: "cat:architecture",
    description: "A named configuration bundle assigning hyperparameter values.",
    id_format: idTemplate("config:{name}"),
    fields: [
      str("name", "Configuration name."),
      text("description", "What distinguishes this configuration.", {
        required: false,
        maxLength: 800,
      }),
      structList("values", "Concrete hyperparameter assignments.", "ParamValue", {
        minItems: 1,
      }),
      text("training_cost", "Estimated training cost.", { required: false, maxLength: 200 }),
    ],
    inline_structs: [
      inlineStruct("ParamValue", [
        str("hyperparameter", "Hyperparameter ID."),
        str("value", "Assigned value."),
      ]),
    ],
  }),
];
