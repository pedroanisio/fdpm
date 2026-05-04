import type { ScopeDef } from "../../src/core/models/meta.js";

/**
 * Scopes for SPEC authoring — each scope corresponds to a major
 * concern axis. Sections and primitives may be scoped to one of these
 * to give the renderer a partial-export filter (e.g., produce only the
 * security-relevant parts of a SPEC).
 */
export const SCOPES: ScopeDef[] = [
  {
    id: "scope:spec:normative",
    name: "Normative",
    rank: 1,
    description: "Mandatory contract surface — invariants, MUST/SHALL clauses.",
  },
  {
    id: "scope:spec:informative",
    name: "Informative",
    rank: 2,
    description: "Motivation, background, rationale — non-binding context.",
  },
  {
    id: "scope:spec:operational",
    name: "Operational",
    rank: 3,
    description: "Configuration, lifecycle, audit, environment.",
  },
  {
    id: "scope:spec:security",
    name: "Security",
    rank: 4,
    description: "Trust boundary, threat surface, authorization, PALS-LAW posture.",
  },
];

export const SCOPE_SETS: Record<string, string[]> = {
  default: [
    "scope:spec:normative",
    "scope:spec:informative",
    "scope:spec:operational",
    "scope:spec:security",
  ],
};

export const DEFAULT_SCOPE_SET = "default";
