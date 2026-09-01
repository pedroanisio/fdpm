/**
 * `fdpm.profile.get` — Tier 1 (read-only).
 *
 * Returns the *raw* registered DomainProfile by id. Raw (not
 * resolved) is the right read for catalog/inspection flows: the
 * `extends`-chain merge is a derivation that callers can request
 * separately if they need it. The Host already throws `not_found`
 * via `ProfileRegistry.getRaw`.
 *
 * Two projection levers, applied in this order:
 *
 *   1. `view`: selects one of four well-known shapes (`full` |
 *      `summary` | `type_ids` | `types`). `summary` returns id,
 *      version, and counts; `type_ids` adds the bare type-id lists;
 *      `types` returns a stripped primitive_types[]/relation_types[]
 *      (the most common LLM question — "what fields does X have?" —
 *      without 60 KB of descriptions and examples).
 *
 *      `full` remains the default and is the shape most likely to be
 *      refused. Measured over the profiles this tree loads it runs from
 *      448 B to 5,409,966 B, and the tool-result ceiling
 *      (`../result-budget.ts`) will refuse the large end. That refusal
 *      names the views below, which is why the default can stay put: a
 *      caller asking for more than it can hold is told what to ask for
 *      instead, rather than being handed a smaller answer it did not
 *      request and cannot tell apart from the full one.
 *
 *   2. `fields` (v0.1.1): top-level key projection. Applied AFTER
 *      `view`, so `fields` can further trim a summary or types
 *      response. Composed profiles can run to ~66 KB; projection
 *      lets LLM clients fetch just the slice they need without
 *      overflowing their context budget.
 *
 * The response carries a `_view` marker when a non-`full` view was
 * applied, and a `_projected: true` marker when `fields` was applied.
 * Callers can detect either kind of partial response by checking for
 * those keys.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { applyFieldsProjection } from "../projection.js";
import { applyProfileView, PROFILE_VIEW_NAMES } from "../profile-views.js";

const ViewSchema = z.enum(PROFILE_VIEW_NAMES);

const Input = z
  .object({
    profile_id: z.string().min(1),
    // Kept to the bare enumeration. The advertised catalog is re-sent on every
    // `tools/list`; the guidance on WHICH view to pick belongs in the session
    // instructions, which are sent once (SPEC-MCP-SERVER §8.5 / §8.6), and in
    // the refusal a caller gets if it overshoots.
    view: ViewSchema.optional().describe(
      "`full` (default, whole profile), `summary` (counts), `type_ids` (type-id lists), `types` (stripped vocabulary).",
    ),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Optional top-level key projection. When present, the response includes only the listed keys plus a `_projected: true` marker. Unknown keys are silently dropped. Applied AFTER `view`.",
      ),
  })
  .strict();

// Output schema: the response is either the full DomainProfile or a
// projected subset. Modelling both shapes precisely would couple the
// advertised JSON Schema to every key the profile exposes; we instead
// advertise an open object and document the projection contract.
const Output = z
  .object({})
  .passthrough()
  .describe(
    "The full DomainProfile, or — when `view` and/or `fields` were passed — a projection. Carries `_view: \"summary\"|\"types\"` when a named view was applied, and `_projected: true` when `fields` was applied. Both markers may appear together.",
  );

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.get",
  tier: "read_only",
  description:
    "Fetch a DomainProfile by id (raw, un-resolved). `view` selects a projection: `summary` (counts), `type_ids` (type-id lists), `types` (primitive/relation vocabulary); `fields` projects top-level keys. The default `full` is the whole profile and is refused over the result ceiling for a large one. Throws not_found if the id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  narrowing: [
    'view: "types"',
    'view: "type_ids"',
    'view: "summary"',
    "fields: [...]",
    "or fdpm.profile.type_info(profile_id, type_id) for one type",
  ],
  handler: async (host, args) => {
    // ProfileRegistry.getRaw throws FDPMException("not_found") on miss.
    const profile = host.profiles.getRaw(args.profile_id) as unknown as Record<
      string,
      unknown
    >;
    const viewed = applyProfileView(profile, args.view);
    return applyFieldsProjection(viewed.value, args.fields).value;
  },
};
