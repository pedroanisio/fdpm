import type { CategoryDef } from "../../src/core/models/meta.js";

/**
 * Categories — DNIS has one conceptual cluster (paragraph-grain
 * document identity). Documents and Nodes both sit in `cat:dnis:document`.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:dnis:document",
    name: "Document",
    description:
      "Document-grain identity primitives — Documents and the typed Nodes whose stable identities survive content rewrites and structural reorganisation per SPEC-DNIS.",
  },
];
