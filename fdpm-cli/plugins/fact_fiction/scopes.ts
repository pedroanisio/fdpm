/**
 * Scopes — one workbook-level scope, the starter-plugin pattern.
 *
 * A historical-fiction work has no notion of "containers within a
 * workbook" that would justify per-container id reuse; every primitive
 * lives in the single workbook scope. Adding scopes later is an
 * additive change (property:profile-id-stability).
 */
import type { ScopeDef } from "../../src/core/models/meta.js";
import { WORKBOOK_SCOPE_ID } from "./ids.js";

export const SCOPES: ScopeDef[] = [
  {
    id: WORKBOOK_SCOPE_ID,
    name: "Workbook",
    rank: 1,
    description: "Workbook-level scope; every fact-fiction primitive lives here.",
  },
];

export const SCOPE_SETS: Record<string, string[]> = {};
export const DEFAULT_SCOPE_SET = "";
