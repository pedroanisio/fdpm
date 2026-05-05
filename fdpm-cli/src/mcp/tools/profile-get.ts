/**
 * `fdpm.profile.get` — Tier 1 (read-only).
 *
 * Returns the *raw* registered DomainProfile by id. Raw (not
 * resolved) is the right read for catalog/inspection flows: the
 * `extends`-chain merge is a derivation that callers can request
 * separately if they need it. The Host already throws `not_found`
 * via `ProfileRegistry.getRaw`.
 *
 * Field projection (v0.1.1): the optional `fields` argument selects
 * top-level keys from the response (`["id","version","primitive_types"]`
 * keeps only those keys plus a `_projected: true` marker). Composed
 * profiles can run to ~66 KB; projection lets LLM clients fetch
 * just the slice they need without overflowing their context budget.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { applyFieldsProjection } from "../projection.js";

const Input = z
  .object({
    profile_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Optional top-level key projection. When present, the response includes only the listed keys plus a `_projected: true` marker. Unknown keys are silently dropped.",
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
    "The full DomainProfile, or — when `fields` was passed — a projection containing only the requested top-level keys plus `_projected: true`.",
  );

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.get",
  tier: "read_only",
  description:
    "Fetch a DomainProfile by id. Returns the raw (un-resolved) profile as registered. Pass `fields` to workbook a subset of top-level keys; omit for the full profile. Throws not_found if the id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    // ProfileRegistry.getRaw throws FDPMException("not_found") on miss.
    const profile = host.profiles.getRaw(args.profile_id) as unknown as Record<
      string,
      unknown
    >;
    return applyFieldsProjection(profile, args.fields).value;
  },
};
