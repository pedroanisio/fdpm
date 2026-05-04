import type { CategoryDef } from "../../src/core/models/meta.js";

/**
 * Categories — four buckets that map onto the Roadmap/Gantt/Board lenses
 * the renderers project. Each primitive sits in exactly one category; cross-
 * cutting properties (e.g., a task's deadline) live as fields on the
 * primitive itself, not as a fifth category.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:plan:work",
    name: "Work",
    description: "Work breakdown and task primitives — the unit of execution.",
  },
  {
    id: "cat:plan:scheduling",
    name: "Scheduling",
    description: "Iterations, milestones, dates — when work happens.",
  },
  {
    id: "cat:plan:execution",
    name: "Execution",
    description: "Assignment, claim/lease, blockers — who is doing what right now.",
  },
  {
    id: "cat:plan:assurance",
    name: "Assurance",
    description: "Acceptance criteria — how we know a task is done.",
  },
];
