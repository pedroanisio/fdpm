import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import {
  bool,
  enumOf,
  idTemplate,
  intEnumOf,
  iso,
  primitive,
  stableId,
  str,
  text,
} from "../_common.js";

/**
 * Work primitives — the unit of execution.
 *
 *   plan:WorkBreakdown — root container ("workbook", "epic"). Used to group
 *                        unrelated task subtrees under one banner.
 *   plan:Task          — leaf or branch work item. Carries duration, status,
 *                        priority, planned dates, optional assignee, and a
 *                        claim/lease pair for concurrent multi-agent
 *                        execution.
 *
 * Hard constraint baked into the schema: when `executor_kind == "AI"`, the
 * task MUST declare an `ai_minutes` value drawn from the closed enum
 * `{5, 10, 15, …, 60}` (12 values). Tasks longer than 60 minutes must be
 * split. The enum is enforced at the Core's enum-value check; an
 * additional CEL rule (plan:val:ai-task-duration-bounded) cross-checks that
 * AI tasks have actually populated the field.
 */

const AI_MINUTES_VALUES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

export const WORK_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "plan:WorkBreakdown",
    name: "WorkBreakdown",
    category: "cat:plan:work",
    description: "A root or branch container for a tree of tasks. Used to group an epic, workbook, or top-level effort under one banner.",
    scoped: true,
    id_format: idTemplate("wbs:{name}"),
    fields: [
      str("name", "Identifier slug (kebab-case)."),
      text("summary", "One-line description of the work this breakdown captures.", {
        maxLength: 280,
      }),
      enumOf("status", "Lifecycle of the breakdown itself.", [
        "Active",
        "Onhold",
        "Cancelled",
        "Done",
      ]),
    ],
  }),

  primitive({
    id: "plan:Task",
    name: "Task",
    category: "cat:plan:work",
    description: "A unit of executable work. Carries duration, status, priority, planned dates, optional assignee, and an optional claim/lease for concurrent multi-agent execution.",
    scoped: true,
    id_format: idTemplate("task:{slug}"),
    fields: [
      str("name", "Task identifier slug."),
      text("summary", "What this task accomplishes.", { maxLength: 280 }),
      enumOf("kind", "Type of work.", [
        "Implementation",
        "Test",
        "Documentation",
        "Investigation",
        "Review",
        "Refactor",
      ]),
      // Drives the AI-task rules. Three values, deliberately not synonyms:
      //   AI     — only an AI agent will execute. Triggers the
      //            duration-bounded rule (ai_minutes required, ∈ {5..60})
      //            AND the machine-checkable-AC rule (must have a
      //            plan:Verifies edge to a plan:AcceptanceCriterion).
      //   Human  — only a human will execute. Neither AI rule applies;
      //            human_estimate is the canonical duration field but
      //            optional.
      //   Either — both pathways are valid. The AI rules do NOT apply at
      //            create time, but if the task is later claimed by an AI
      //            and the operator wants the AI rules to fire, replace
      //            executor_kind to "AI" before the claim. Use `Either`
      //            when the task is genuinely ambiguous, not as an escape
      //            hatch for the AI rules.
      enumOf("executor_kind", "Who executes the task.", ["AI", "Human", "Either"]),
      enumOf("status", "Current execution status.", [
        "Backlog",
        "Ready",
        "In_progress",
        "Blocked",
        "In_review",
        "Done",
        "Cancelled",
      ]),
      enumOf("priority", "Triage priority.", ["P0", "P1", "P2", "P3"]),
      // AI-task duration: closed enum {5,10,…,60} minutes. CEL rule
      // plan:val:ai-task-duration-bounded fires when executor_kind=AI and
      // this field is missing, completing the cross-check the schema
      // alone cannot do.
      intEnumOf(
        "ai_minutes",
        "Estimated duration in minutes for an AI executor. Required when executor_kind=AI; closed enum {5,10,15,...,60}. Tasks > 60 minutes MUST be split.",
        AI_MINUTES_VALUES,
        { required: false },
      ),
      str(
        "human_estimate",
        "Free-form duration estimate for a human executor (e.g. \"2d\", \"half day\", \"1h\"). Free-form because human work units are not as bounded as AI ones.",
        { required: false },
      ),
      iso("planned_start", "ISO-8601 planned start time.", { required: false }),
      iso("planned_finish", "ISO-8601 planned finish time.", { required: false }),
      // The canonical assignee (a sw:Actor id). The plan:AssignedTo
      // relation is a redundant graph-edge form for renderer convenience.
      stableId(
        "assignee_id",
        "Actor (Person/System/Bot) responsible for the task. References a sw:Actor primitive defined elsewhere in the workbook.",
        "sw:Actor",
        { required: false },
      ),
      // Concurrent-execution claim. claim_holder_id is who currently holds
      // the task; claim_until is when their lease expires. CEL rule
      // plan:val:claim-has-expiry rejects a holder without an expiry.
      stableId(
        "claim_holder_id",
        "Actor currently holding an exclusive claim on this task. Distinct from assignee_id: claim is short-term lease, assignee is the durable owner.",
        "sw:Actor",
        { required: false },
      ),
      iso(
        "claim_until",
        "ISO-8601 wall-clock at which the claim auto-expires. Renderers may surface stale claims past this point.",
        { required: false },
      ),
      bool(
        "is_root",
        "Positive assertion: this task is a self-contained root. Roots may have zero parent/dependency edges. Also serves as the create-time exemption for plan:val:non-root-task-has-deps; see the README §Authoring AI tasks for the recommended pattern.",
        { required: false },
      ),
    ],
  }),
];
