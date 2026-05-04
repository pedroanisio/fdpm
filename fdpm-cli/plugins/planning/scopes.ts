import type { ScopeDef } from "../../src/core/models/meta.js";

/**
 * Scopes — three orthogonal lenses through which a primitive is read. Tasks
 * live in `scope:plan:project` by default; iteration-bound work moves to
 * `scope:plan:iteration`; in-flight work (claims, current blockers) moves
 * to `scope:plan:execution`. Renderers pick a scope as a filter when
 * producing partial views.
 */
export const SCOPES: ScopeDef[] = [
  {
    id: "scope:plan:project",
    name: "Project",
    rank: 1,
    description: "Project-wide work breakdown, persistent goals.",
  },
  {
    id: "scope:plan:iteration",
    name: "Iteration",
    rank: 2,
    description: "Sprint / cycle / iteration view — current and recent work.",
  },
  {
    id: "scope:plan:execution",
    name: "Execution",
    rank: 3,
    description: "In-flight execution — claims, active blockers, today's work.",
  },
];

// Parity with software_architecture: no scope sets in v0.1; the renderers
// drive their own filtering.
export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";
