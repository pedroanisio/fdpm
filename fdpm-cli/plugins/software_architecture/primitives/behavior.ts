import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { bool, enumOf, idTemplate, primitive, stableId, str, text } from "../_common.js";

/**
 * Behavior category — what happens in the system.
 * Mirrors §"--- Behavior ---" of src/fdpm/plugins/software_architecture.py:
 *   sw:State, sw:Transition, sw:FailureMode.
 *
 * sw:Transition carries a Python TypeConstraint (`no_self_transition`)
 * stored verbatim — the v1.1 Core does not evaluate type constraints.
 */
export const BEHAVIOR_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "sw:State",
    name: "State",
    category: "cat:behavior",
    description: "A named, distinguishable condition of an entity.",
    scoped: false,
    id_format: idTemplate("state:{entity}:{name}"),
    fields: [
      stableId("entity_id", "The entity this state belongs to.", "sw:Entity"),
      str("name", "Human-readable state name."),
      text("entry_conditions", "What must be true to enter this state.", {
        required: false,
        maxLength: 280,
      }),
      bool("terminal", "Whether this is a final state."),
    ],
  }),

  primitive({
    id: "sw:Transition",
    name: "Transition",
    category: "cat:behavior",
    description: "A named change from one state to another.",
    scoped: false,
    id_format: idTemplate("transition:{from}:{to}"),
    fields: [
      stableId("from_state", "Source state.", "sw:State"),
      stableId("to_state", "Target state.", "sw:State"),
      text("trigger", "What causes this transition.", { maxLength: 280 }),
      text("guard", "Condition that must be true for the transition to fire.", {
        required: false,
        maxLength: 280,
      }),
      text("action", "Side effect of the transition.", {
        required: false,
        maxLength: 280,
      }),
    ],
    constraints: [
      {
        name: "no_self_transition",
        expression: "not_equal(from_state, to_state)",
        level: "error",
        message: "A transition cannot have the same source and target state.",
      },
    ],
  }),

  primitive({
    id: "sw:FailureMode",
    name: "FailureMode",
    category: "cat:behavior",
    description: "A known way the system can fail.",
    scoped: false,
    id_format: idTemplate("failure:{entity}:{name}"),
    fields: [
      stableId("entity_id", "The entity that fails.", "sw:Entity"),
      text("description", "How the failure manifests.", { maxLength: 500 }),
      text("detection", "How to detect this failure.", { maxLength: 280 }),
      text("mitigation", "How to recover from this failure.", { maxLength: 500 }),
      enumOf("severity", "Impact severity.", ["Critical", "High", "Medium", "Low"]),
    ],
  }),
];
