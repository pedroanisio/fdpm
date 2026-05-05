/**
 * `fdpm.profile.register` — Tier 2 (validating-write).
 *
 * Registers a DomainProfile so subsequent `fdpm.project.create` calls
 * can reference it. Persists by default. No §7 instance pipeline runs
 * here (a profile is metadata, not an instance), so the envelope's
 * `validation_report` is synthesized as accepted; the operation field
 * is absent because no operation log entry is produced (profiles live
 * in their own on-disk directory).
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { DomainProfile } from "../../core/models/meta.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    profile: DomainProfile,
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

export const tool: McpToolEntry<
  z.infer<typeof Input>,
  Tier2Envelope<z.infer<typeof PostStateSummary>>
> = {
  name: "fdpm.profile.register",
  tier: "validating_write",
  description:
    "Register a DomainProfile (persisted by default). The profile object MUST follow the DomainProfile schema (id, version, primitive_types, relation_types, scopes, categories, optional `extends` chain). If `extends` lists parent profile ids, those parents MUST be registered first or registration rejects with `not_found`. The standard Tier-2 envelope is returned; profiles do not produce operation log entries, so `operation` is omitted on success.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    await host.registerProfile(args.profile, { persist: true });
    const report = {
      target_id: args.profile.id,
      findings: [],
      accepted: true,
    };
    return {
      ok: true,
      validation_report: report,
      post_state_summary: {
        profile_id: args.profile.id,
        version: args.profile.version,
      },
    };
  },
};
