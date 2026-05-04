import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  inlineStruct,
  int,
  json,
  primitive,
  str,
  strList,
  struct,
  text,
} from "../_common.js";

/**
 * Process category — sequential procedures and phases.
 *
 * Mirrors §D of src/fdpm/plugins/formal_specification.py:
 *   fs:Phase, fs:Actor.
 *
 * v3.1: Phase gains domain / state_component / objective for typed
 * roadmap execution.
 *
 * v3.2 (CLI port, post-v0.5.1 review): Phase gains the read/write
 * declarations that the v0.4 source carried but the schema didn't
 * formally declare. These are the foundation for Bernstein-condition
 * parallelism analysis (§3 of the projection model). The fields were
 * already passed through by the fs-v3 importer (Core's `field_values`
 * accepts arbitrary keys); declaring them in the schema brings them
 * into the §7 validation pipeline so a future regression in the
 * importer or content surfaces as a structured `validation` finding
 * rather than silently dropping the data.
 *
 *   - reads / writes:   StructField[StateComponents], single struct
 *                       carrying a string[] of state-component ids
 *                       (e.g. ["S.foundation", "S.product_def"]).
 *   - formality_level:  string ("structural" in the v0.4 source).
 *   - revisit_label:    free-form object — only 5 of 22 phases carry
 *                       it and the shape varies; declared as `json`
 *                       (kind level only, no schema enforcement).
 */
export const PROCESS_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Phase",
    name: "Phase",
    category: "cat:process",
    description: "A sequential processing phase of the method.",
    scoped: true,
    id_format: idTemplate("phase:{number}"),
    fields: [
      int("number", "Phase number."),
      str("name", "Phase name."),
      text("question", "The question this phase answers.", { maxLength: 280 }),
      text("inputs", "What this phase consumes.", { maxLength: 800 }),
      text("outputs", "What this phase produces.", { maxLength: 800 }),
      strList("procedure", "Ordered list of steps in this phase.", { minItems: 1 }),
      text("exit_condition", "When this phase is considered done.", { maxLength: 800 }),
      strList("parallel_with", "IDs of concurrent phases.", { required: false }),
      text("branch_condition", "Condition for conditional flow.", {
        required: false,
        maxLength: 800,
      }),
      str(
        "domain",
        "Functional domain responsible for this phase (e.g. Strategy, Engineering, Security).",
        { required: false },
      ),
      str(
        "state_component",
        "State component this phase owns under the single-writer discipline (e.g. S.problem_frame).",
        { required: false },
      ),
      text("objective", "Prose objective — what this phase must accomplish.", {
        required: false,
        maxLength: 800,
      }),
      // v3.2 read/write declarations for Bernstein-condition analysis.
      struct(
        "reads",
        "State components this phase reads (input dependencies). Source for RAW-edge derivation.",
        "StateComponents",
        { required: false },
      ),
      struct(
        "writes",
        "State components this phase writes (single-writer output). Source for WAW/WAR-edge derivation.",
        "StateComponents",
        { required: false },
      ),
      str(
        "formality_level",
        "Phase formality classification (e.g. 'structural').",
        { required: false },
      ),
      json(
        "revisit_label",
        "Optional revisit-trigger metadata — heterogeneous shape; see I-22.02 'loop_back_authority'.",
        { required: false },
      ),
    ],
    inline_structs: [
      inlineStruct("StateComponents", [
        strList("components", "Ordered list of state-component ids (e.g. 'S.foundation')."),
      ]),
    ],
  }),

  primitive({
    id: "fs:Actor",
    name: "Actor",
    category: "cat:process",
    description: "A role or agent that participates in a phase.",
    id_format: idTemplate("actor:{name}"),
    fields: [
      str("name", "Actor or role name."),
      enumOf("kind", "Type of actor.", ["human", "automated", "hybrid"]),
      text("responsibilities", "What this actor is responsible for.", { maxLength: 800 }),
    ],
  }),
];
