import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  enumOf,
  idTemplate,
  iso,
  primitive,
  str,
  strList,
  text,
} from "../_common.js";

/**
 * Assurance + Execution primitives.
 *
 *   plan:AcceptanceCriterion — how we know a task is done. Carries free-text
 *                              `criterion` (for human-readable AC) AND an
 *                              optional CEL `expression` field for machine-
 *                              checkable AC. AI tasks MUST have at least one
 *                              AC with a non-empty expression — enforced by
 *                              CEL rule plan:val:ai-task-has-machine-checkable-ac.
 *
 *   plan:Blocker             — concrete in-flight blocker. Distinct from
 *                              sw:Risk (forward-looking, probabilistic).
 *                              A blocker is something that IS happening NOW.
 */
export const ASSURANCE_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "plan:AcceptanceCriterion",
    name: "AcceptanceCriterion",
    category: "cat:plan:assurance",
    description: "A check that decides whether a task is done. Free-text by default; optionally also a CEL expression evaluable against the project graph (recommended for AI-executable tasks).",
    scoped: true,
    id_format: idTemplate("ac:{slug}"),
    fields: [
      text("criterion", "Human-readable acceptance check.", { maxLength: 500 }),
      str(
        "expression",
        "Optional CEL expression evaluating to bool against the project graph. When non-empty AND `met` is set, host pipelines can corroborate the human-set status against the predicate. The full helper-set v1.1.0 is available, including graph.exists / graph.target_exists for cross-primitive id resolution.",
        { required: false },
      ),
      enumOf("status", "Current AC status.", [
        "open",
        "in_progress",
        "met",
        "blocked",
        "waived",
      ]),
      strList(
        "evidence_refs",
        "Pointers to evidence: commit SHAs, test ids, file paths, dashboard URLs, screenshot paths.",
        { required: false },
      ),
    ],
  }),

  primitive({
    id: "plan:Blocker",
    name: "Blocker",
    category: "cat:plan:execution",
    description: "A concrete in-flight blocker preventing task progress. Distinct from sw:Risk (which is forward-looking).",
    id_format: idTemplate("blocker:{slug}"),
    fields: [
      text("description", "What is blocking progress.", { maxLength: 500 }),
      enumOf("severity", "Impact on the affected work.", [
        "Critical",
        "High",
        "Medium",
        "Low",
      ]),
      iso("discovered_at", "ISO-8601 when the blocker was first observed."),
      iso(
        "resolved_at",
        "ISO-8601 when the blocker was cleared. Absence means still active.",
        { required: false },
      ),
      str(
        "external_ref",
        "Optional pointer to an external tracking artifact (issue URL, ticket id, etc.).",
        { required: false },
      ),
    ],
  }),
];
