import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  iso,
  primitive,
  str,
  text,
} from "../_common.js";

/**
 * Scheduling primitives.
 *
 *   plan:Iteration — sprint / cycle / iteration window. Tasks bound to an
 *                    iteration via plan:InIteration appear under that
 *                    window in the Roadmap renderer.
 *   plan:Milestone — a target date with a binary hit/miss outcome. Tasks
 *                    can declare plan:HitsMilestone to mark themselves
 *                    as required for a milestone.
 */
export const SCHEDULING_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "plan:Iteration",
    name: "Iteration",
    category: "cat:plan:scheduling",
    description: "A bounded execution window — sprint, cycle, iteration, or release train.",
    scoped: true,
    id_format: idTemplate("iteration:{slug}"),
    fields: [
      str("name", "Iteration name (e.g. 'sprint-42', 'q1-mvp')."),
      iso("start_date", "ISO-8601 start (inclusive)."),
      iso("end_date", "ISO-8601 end (inclusive)."),
      text("goal", "Goal for the iteration in one line.", {
        required: false,
        maxLength: 280,
      }),
    ],
  }),

  primitive({
    id: "plan:Milestone",
    name: "Milestone",
    category: "cat:plan:scheduling",
    description: "A target-date checkpoint with a binary hit/miss outcome.",
    id_format: idTemplate("milestone:{slug}"),
    fields: [
      str("name", "Milestone name."),
      iso("target_date", "ISO-8601 target date."),
      text("summary", "Why this milestone matters.", {
        required: false,
        maxLength: 280,
      }),
      enumOf("status", "Whether the milestone has been reached.", [
        "Upcoming",
        "Hit",
        "Missed",
        "Cancelled",
      ]),
    ],
  }),
];
