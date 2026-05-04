import type { ScopeDef } from "../../src/core/models/meta.js";

/**
 * Scopes — one scope: every dnis:Document and dnis:Node lives in
 * `scope:dnis:document`. The DNIS Document acts as the partition for
 * Nodes via the `document_id` field; we do not need additional scope
 * separation at the SPEC-CORE layer.
 */
export const SCOPES: ScopeDef[] = [
  {
    id: "scope:dnis:document",
    name: "Document",
    rank: 1,
    description: "Document-grain scope; both dnis:Document and dnis:Node primitives live here.",
  },
];

export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";
