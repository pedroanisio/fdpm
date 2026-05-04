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
 * Empirical category — datasets, experiments, results, ablation studies.
 *
 * Mirrors §H (CR-001) of src/fdpm/plugins/formal_specification.py:
 *   fs:Dataset, fs:Experiment, fs:Result, fs:AblationStudy (with
 *   Variation inline struct).
 */
export const EMPIRICAL_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Dataset",
    name: "Dataset",
    category: "cat:empirical",
    description: "A dataset used for training or evaluation.",
    id_format: idTemplate("dataset:{name}"),
    fields: [
      str("name", "Dataset name."),
      text("description", "Content, domain, source.", { maxLength: 800 }),
      str("size", "Number of examples or relevant size metric."),
      text("preprocessing", "Tokenisation, cleaning, filtering.", {
        required: false,
        maxLength: 800,
      }),
      strList("splits", "Named splits.", { required: false }),
      text("vocabulary", "Vocabulary construction details.", {
        required: false,
        maxLength: 300,
      }),
    ],
  }),

  primitive({
    id: "fs:Experiment",
    name: "Experiment",
    category: "cat:empirical",
    description: "A training or evaluation experiment.",
    id_format: idTemplate("experiment:{name}"),
    fields: [
      str("name", "Experiment name."),
      str("configuration", "ID of the fs:Configuration used."),
      str("dataset", "ID of the fs:Dataset used."),
      text("hardware", "Hardware description.", { required: false, maxLength: 300 }),
      str("training_time", "Wall-clock training time.", { required: false }),
      text("optimiser", "Optimiser and schedule description.", {
        required: false,
        maxLength: 800,
      }),
      text("procedure", "Training procedure details.", { required: false, maxLength: 1000 }),
    ],
  }),

  primitive({
    id: "fs:Result",
    name: "Result",
    category: "cat:empirical",
    description: "A benchmark result from an experiment.",
    id_format: idTemplate("result:{experiment}:{metric}"),
    fields: [
      str("name", "Result identifier."),
      str("experiment", "ID of the fs:Experiment that produced this."),
      str("metric", "Metric name."),
      str("value", "Measured value."),
      bool(
        "is_external_baseline",
        "True if reported by an external paper rather than produced here.",
      ),
      bool("is_state_of_art", "Whether this set a new state-of-the-art.", {
        required: false,
      }),
    ],
  }),

  primitive({
    id: "fs:AblationStudy",
    name: "AblationStudy",
    category: "cat:empirical",
    description: "An ablation study comparing variations of a configuration.",
    id_format: idTemplate("ablation:{name}"),
    fields: [
      str("name", "Ablation study name."),
      str("base_configuration", "ID of the baseline configuration."),
      structList("variations", "Each row of the ablation table.", "Variation", {
        minItems: 2,
      }),
      text("conclusion", "Summary finding.", { required: false, maxLength: 800 }),
    ],
    inline_structs: [
      inlineStruct("Variation", [
        str("label", "Variation label."),
        str("changes", "What was changed."),
        str("result_metric", "Metric name."),
        str("result_value", "Metric value."),
      ]),
    ],
  }),
];
