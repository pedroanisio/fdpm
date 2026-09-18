/**
 * `fdpm.profile.get` — Tier 1 (read-only).
 *
 * `view: "full"` returns the *raw* registered DomainProfile by id: the
 * document as stored, with its `extends` chain unmerged. That is the
 * right read for catalog/inspection flows, where the question is what
 * this profile declares.
 *
 * The vocabulary views (`summary`, `type_ids`, `types`) read the
 * RESOLVED profile instead, because vocabulary is a resolved concept.
 * A composition profile — every `*-dnis` profile in this tree — declares
 * no types of its own and inherits them all. Projecting its raw document
 * answered "what types does this profile have?" with
 *
 *     { "primitive_types": [], "relation_types": [], "_view": "types" }
 *
 * in 206 B, `ok: true`: schema-valid, well-formed, and wrong. The caller
 * cannot tell that from a profile that genuinely has no types, which is
 * the failure the result ceiling exists to prevent one layer up — a
 * partial answer indistinguishable from a complete one.
 *
 * It was also internally inconsistent: `fdpm.profile.type_info` has
 * always read the resolved profile, so `type_ids` omitted ids that
 * `type_info` then answered for. One tool family, two vocabularies.
 *
 * Resolution can fail (a dangling `extends` parent). It then throws
 * `not_found` naming the missing parent rather than degrading to the raw
 * document — a profile whose chain does not resolve cannot be used to
 * construct anything, and saying so is the answer.
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
 *      refused. Measured over the 27 profiles this tree loads it runs
 *      from 448 B to 5,409,966 B, and the tool-result ceiling
 *      (`../result-budget.ts`) will refuse the large end. That refusal
 *      names the views below, which is why the default can stay put: a
 *      caller asking for more than it can hold is told what to ask for
 *      instead, rather than being handed a smaller answer it did not
 *      request and cannot tell apart from the full one.
 *
 *      `narrowingFor` makes that advice measured rather than quoted. The
 *      static ladder is this tool's levers in descending order of
 *      information; it is not the answer to "what should THIS caller ask
 *      for next". On `profile:uixo:1.2` the `types` view is 1,835,052 B
 *      against a 32,768 B ceiling, so a refusal opening with
 *      `view: "types"` spends a round trip to earn a second refusal.
 *      Each candidate view is projected and measured against the ceiling
 *      that just refused, and only the ones that fit are named.
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
import type { Host } from "../../core/host.js";
import type { McpToolEntry } from "../types.js";
import { applyFieldsProjection } from "../projection.js";
import {
  applyProfileView,
  PROFILE_VIEW_NAMES,
  type ProfileViewName,
} from "../profile-views.js";
import { measureResultBytes } from "../result-budget.js";

const ViewSchema = z.enum(PROFILE_VIEW_NAMES);

/**
 * The views whose subject is the profile's vocabulary rather than its
 * stored text. These read the resolved profile; `full` reads the raw one.
 */
const VOCABULARY_VIEWS: ReadonlySet<ProfileViewName> = new Set([
  "summary",
  "type_ids",
  "types",
]);

/**
 * The registry read behind a given view.
 *
 * `getRaw` and `getResolved` both throw `not_found` on an unknown id, and
 * `getResolved` additionally throws it for a dangling `extends` parent.
 * Neither is caught here: an unusable profile is reported, not softened.
 */
function readProfile(
  host: Host,
  profileId: string,
  view: ProfileViewName | undefined,
): Record<string, unknown> {
  const registry =
    view !== undefined && VOCABULARY_VIEWS.has(view)
      ? host.profiles.getResolved(profileId)
      : host.profiles.getRaw(profileId);
  return registry as unknown as Record<string, unknown>;
}

/** The response this tool would serve for `view`, with `fields` applied. */
function renderView(
  host: Host,
  args: { profile_id: string; view?: ProfileViewName; fields?: string[] },
  view: ProfileViewName | undefined,
): Record<string, unknown> {
  const viewed = applyProfileView(readProfile(host, args.profile_id, view), view);
  return applyFieldsProjection(viewed.value, args.fields).value;
}

/**
 * The candidate views a refused call can retreat to, largest (most
 * informative) first. `full` is absent: it is what was just refused.
 */
const NARROWING_LADDER: readonly ProfileViewName[] = ["types", "type_ids", "summary"];

/** The lever that always terminates the ladder — one type per call. */
const TYPE_INFO_LEVER = "or fdpm.profile.type_info(profile_id, type_id) for one type";

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
    "Fetch a DomainProfile by id. The default `view: \"full\"` is the raw, un-resolved profile as registered, and is refused over the result ceiling for a large one. `summary` (counts), `type_ids` (type-id lists) and `types` (primitive/relation vocabulary) report the RESOLVED profile, so a composition profile's inherited types are included and every id they return is one fdpm.profile.type_info accepts. `fields` projects top-level keys. Throws not_found if the id is unknown, or if a vocabulary view is asked of a profile whose `extends` chain does not resolve.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  narrowing: [
    'view: "types"',
    'view: "type_ids"',
    'view: "summary"',
    "fields: [...]",
    TYPE_INFO_LEVER,
  ],
  narrowingFor: ({ host, args, cap }) => {
    const typed = args as { profile_id: string; view?: ProfileViewName; fields?: string[] };
    const advice: string[] = [];
    for (const view of NARROWING_LADDER) {
      // Measured on what would be served, by the same function the
      // dispatcher measures the refused result with. A view that does not
      // fit is not named: advice a caller cannot follow costs a round trip
      // and reads as an instruction that works.
      if (measureResultBytes(renderView(host, typed, view)) <= cap) {
        advice.push(`view: "${view}"`);
      }
    }
    advice.push("fields: [...]");
    // `type_info` answers for one type at a time, so it fits any ceiling a
    // single type fits — and it is the only rung left when none of the
    // views do.
    advice.push(TYPE_INFO_LEVER);
    return advice;
  },
  handler: async (host, args) =>
    renderView(host, args as Parameters<typeof renderView>[1], args.view),
};
