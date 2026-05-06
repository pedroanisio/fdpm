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
 *   1. `view` (v0.1.2): selects one of three well-known shapes
 *      (`full` | `summary` | `types`). `summary` returns id, version,
 *      and counts; `types` returns id, version, and a stripped
 *      primitive_types[]/relation_types[] (the most common LLM
 *      question — "what fields does X have?" — without 60 KB of
 *      descriptions and examples). Default `full` for backwards
 *      compatibility with v0.1.x callers.
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
    view: ViewSchema.optional().describe(
      "Optional named view: `full` (default; entire DomainProfile), `summary` (id/version/label + counts; ~200 B), or `types` (id/version + stripped primitive_types[]/relation_types[]; ~5 KB). Most agent questions about a profile are answered by `types` without needing the full ~65 KB payload.",
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
    "Fetch a DomainProfile by id. Returns the raw (un-resolved) profile as registered. Pass `view` to request a well-known projection (`summary` for catalogue use, `types` for primitive/relation vocabulary), or `fields` to project a subset of top-level keys; omit both for the full profile. Throws not_found if the id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
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
