import type { RelationTypeDef } from "../../src/core/models/meta.js";
import { enumOf, str } from "./_common.js";

/**
 * Relations.
 *
 * Two distinct hierarchies — Subtask (Task → Task) and Contains (WorkBreakdown
 * → Task | WorkBreakdown). Subtask is the work-decomposition tree; Contains
 * is the bookkeeping aggregation under a labeled root. They're separate
 * because a Task might be a subtask of another Task while also being
 * Contained-by an unrelated breakdown — e.g. a "test" task that is a subtask
 * of an "implementation" task and also Contained by a "Q1 milestone" wbs.
 *
 * DependsOn is finish-to-start by default. Dependency-kind metadata captures
 * other lag patterns. The cross-profile plan:Implements relation uses the
 * helper-set v1.1.0 graph.target_exists check (in plan:val:implements-target-exists)
 * to catch dangling references the v1.0.0 host could not.
 */
export const RELATIONS: RelationTypeDef[] = [
  {
    id: "plan:Subtask",
    name: "Subtask",
    description: "Work-decomposition: source task is a subtask of target task.",
    source_types: ["plan:Task"],
    target_types: ["plan:Task"],
    fields: [],
    symmetric: false,
    transitive: true,
  },

  {
    id: "plan:Contains",
    name: "Contains",
    description: "Aggregation: a WorkBreakdown contains a task (or a sub-breakdown).",
    source_types: ["plan:WorkBreakdown"],
    target_types: ["plan:Task", "plan:WorkBreakdown"],
    fields: [],
    symmetric: false,
    transitive: true,
  },

  {
    id: "plan:DependsOn",
    name: "DependsOn",
    description: "Source task depends on target task. Default: finish-to-start (target must finish before source can start).",
    source_types: ["plan:Task"],
    target_types: ["plan:Task"],
    metadata_schema: [
      enumOf(
        "kind",
        "Dependency lag. Default finish-to-start.",
        ["finish-to-start", "start-to-start", "finish-to-finish", "start-to-finish"],
        { required: false },
      ),
    ],
    fields: [],
    symmetric: false,
    transitive: true,
  },

  {
    id: "plan:BlockedBy",
    name: "BlockedBy",
    description: "Source task is currently blocked by target blocker.",
    source_types: ["plan:Task"],
    target_types: ["plan:Blocker"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  {
    id: "plan:Verifies",
    name: "Verifies",
    description: "Source task is decided done by target acceptance criterion.",
    source_types: ["plan:Task"],
    target_types: ["plan:AcceptanceCriterion"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  {
    id: "plan:AssignedTo",
    name: "AssignedTo",
    description: "Convenience graph-edge view of plan:Task.assignee_id. The field is canonical; this relation makes the assignment queryable via graph.outgoing for renderers and CEL rules.",
    source_types: ["plan:Task"],
    target_types: ["sw:Actor"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  {
    id: "plan:InIteration",
    name: "InIteration",
    description: "Source task is bound to target iteration.",
    source_types: ["plan:Task"],
    target_types: ["plan:Iteration"],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  {
    id: "plan:Implements",
    name: "Implements",
    description: "Cross-profile work-tracking link: source task implements an arbitrary target primitive (a sw:Capability, spec:Requirement, fs:Section, etc.). The wildcard target_types is intentional; CEL rule plan:val:implements-target-exists uses graph.target_exists (helper-set v1.1.0) to ensure the link does not dangle.",
    source_types: ["plan:Task"],
    target_types: "*",
    metadata_schema: [
      str(
        "rationale",
        "Why this task implements that target. Optional but encouraged for cross-profile audit.",
        { required: false },
      ),
    ],
    fields: [],
    symmetric: false,
    transitive: false,
  },

  {
    id: "plan:HitsMilestone",
    name: "HitsMilestone",
    description: "Source task is required for target milestone to be hit.",
    source_types: ["plan:Task"],
    target_types: ["plan:Milestone"],
    fields: [],
    symmetric: false,
    transitive: false,
  },
];
