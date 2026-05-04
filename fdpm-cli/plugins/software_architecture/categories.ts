import type { CategoryDef } from "../../src/core/models/meta.js";

/**
 * Categories — mirrors the `categories=[...]` block of
 * src/fdpm/plugins/software_architecture.py:42-70.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:identity",
    name: "Identity",
    description: "What exists in the system.",
  },
  {
    id: "cat:semantics",
    name: "Semantics",
    description: "Meaning and constraints.",
  },
  {
    id: "cat:behavior",
    name: "Behavior",
    description: "What happens in the system.",
  },
  {
    id: "cat:interface",
    name: "Interface",
    description: "How systems interact.",
  },
  {
    id: "cat:evidence",
    name: "Evidence",
    description: "Why claims should be trusted.",
  },
];
