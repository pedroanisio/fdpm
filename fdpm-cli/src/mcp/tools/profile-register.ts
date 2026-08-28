/**
 * `fdpm.profile.register` — Tier 2 (validating-write).
 *
 * Registers a DomainProfile so subsequent `fdpm.workbook.create` calls
 * can reference it. Persists by default.
 *
 * Schema-by-resource (SPEC-MCP-SERVER §8.5): the advertised input is
 * an OPAQUE `profile` object. The DomainProfile JSON Schema is served
 * by `fdpm://schema/profile` instead of being inlined into every
 * `tools/list` response (it was 8.8 KB — 26 % of the whole catalog).
 * The handler validates with the same Zod schema the resource is
 * derived from, so the agent-visible contract and the enforced
 * contract are one object.
 *
 * A malformed profile is a Tier-2 REJECTION, not a protocol error:
 * `isError: false`, `ok: false`, one `core:profile-schema` finding per
 * Zod issue with `field_path` set. That is the same envelope every
 * other Tier-2 tool returns on §7 rejection, so an agent has one
 * recovery loop to learn. Nothing is registered on rejection.
 *
 * No §7 instance pipeline runs (a profile is metadata, not an
 * instance), so an accepted registration synthesises an accepted
 * report; `operation` is absent because profiles live in their own
 * on-disk directory, not the operation log.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { DomainProfile } from "../../core/models/meta.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";
import type { ValidationFinding } from "../../core/models/instance.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";
import { PROFILE_SCHEMA_URI } from "../resources/schema.js";

const Input = z
  .object({
    profile: z.record(z.string(), z.unknown()),
  })
  .strict();

const PostStateSummary = z
  .object({
    profile_id: z.string(),
    version: z.string(),
  })
  .strict();

const Output = z
  .object({
    ...Tier2EnvelopeBase,
    post_state_summary: PostStateSummary,
  })
  .strict();

export const PROFILE_SCHEMA_RULE_ID = "core:profile-schema";
const UNPARSED_TARGET = "<unparsed-profile>";

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export const tool: McpToolEntry<
  z.infer<typeof Input>,
  Tier2Envelope<z.infer<typeof PostStateSummary>>
> = {
  name: "fdpm.profile.register",
  tier: "validating_write",
  description:
    "Register a DomainProfile (persisted). BEFORE composing `profile`, read fdpm://schema/profile via resources/read — it is the exact JSON Schema (id, version, label|name, primitive_types, relation_types, scopes, categories, optional `extends`) and the server validates against the same schema. A malformed profile is rejected with one `core:profile-schema` finding per violated path (`field_path` set); nothing is registered. Parents listed in `extends` MUST already be registered (else `not_found`). Profiles produce no operation-log entry, so `operation` is omitted on success.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const parsed = DomainProfile.safeParse(args.profile);
    if (!parsed.success) {
      const target = stringField(args.profile, "id") ?? UNPARSED_TARGET;
      const version = stringField(args.profile, "version") ?? "";
      const findings: ValidationFinding[] = parsed.error.issues.map((issue) => ({
        level: "error",
        rule_id: PROFILE_SCHEMA_RULE_ID,
        target_id: target,
        field_path: issue.path.length > 0 ? issue.path.map(String).join(".") : null,
        message: issue.message,
        evidence: { code: issue.code },
      }));
      return {
        ok: false,
        validation_report: { target_id: target, findings, accepted: false },
        post_state_summary: { profile_id: target, version },
      };
    }
    const profile = parsed.data;
    // The documented contract: parents named in `extends` MUST already be
    // registered. The registry itself resolves the chain lazily (at
    // `getResolved` time), which would let a dangling parent surface only
    // when the agent later calls `fdpm.workbook.create` — a confusing,
    // delayed failure. Reject up front, naming every missing parent.
    const missingParents = profile.extends.filter((pid) => !host.profiles.has(pid));
    if (missingParents.length > 0) {
      throw new FDPMException(
        "not_found",
        `profile  extends unregistered parent(s): `,
        { evidence: { profile_id: profile.id, missing_parents: missingParents } },
      );
    }
    await host.registerProfile(profile, { persist: true });
    return {
      ok: true,
      validation_report: { target_id: profile.id, findings: [], accepted: true },
      post_state_summary: { profile_id: profile.id, version: profile.version },
    };
  },
};
