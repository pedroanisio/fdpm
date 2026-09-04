/**
 * `fdpm.profile.retire` — Tier 3 (destructive).
 *
 * Removes one profile revision from the registry and deletes its persisted
 * file. It is the other half of `fdpm.profile.register`: the registry keys
 * on `(id, version)`, so an agent can revise a profile by registering a new
 * version — and needs a way to take the mistaken revision back out rather
 * than leaving a permanent, unusable entry behind.
 *
 * Tier 3 rather than Tier 2 because nothing here is validated-and-appended:
 * a retire deletes state and writes no operation to any log. It therefore
 * inherits the whole destructive contract — the `--enable-destructive`
 * gate, `dry_run` (allowed while disabled, no key), and a required
 * `idempotency_key` on the real call — from the dispatcher.
 *
 * The refusals live in `Host.retireProfile` (referenced revision, plugin-
 * owned revision, Core-owned id) and surface as ordinary protocol errors
 * with the blockers in `evidence`; `dry_run` returns the same blocker set
 * as data so an agent can see what stands in the way before it tries.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { parseProfileRef } from "../../core/profile/version.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";

const Input = z
  .object({
    profile_ref: z.string().min(1).describe("`id@version`, or a bare `id` for the newest."),
    dry_run: z.boolean().optional().describe("Preview: return would_affect, retire nothing."),
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Required unless dry_run; reuse to retry safely."),
  })
  .strict();

const Blockers = z
  .object({
    workbooks: z.array(z.string()),
    dependents: z.array(z.string()),
  })
  .strict();

const Output = z
  .object({
    ok: z.literal(true),
    dry_run: z.literal(true).optional(),
    would_affect: Blockers.optional(),
    post_state_summary: z
      .object({
        profile_id: z.string(),
        version: z.string(),
        remaining_versions: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.retire",
  tier: "destructive",
  description:
    "Retire one profile revision (registry entry + persisted file). Refused while a workbook binds it, a profile extends it, or a plugin owns it; `dry_run` returns those blockers as `would_affect`, otherwise `idempotency_key` is required. No operation-log entry.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: true },
  handler: async (host, args) => {
    const parsed = parseProfileRef(args.profile_ref);
    const version = parsed.version ?? host.profiles.latestVersion(parsed.id);
    if (!version) {
      throw new FDPMException("not_found", `profile not found: ${args.profile_ref}`, {
        evidence: {
          profile_id: parsed.id,
          registered_versions: host.profiles.versionsOf(parsed.id),
        },
      });
    }
    if (args.dry_run === true) {
      return {
        ok: true as const,
        dry_run: true as const,
        would_affect: host.profileRetireBlockers(parsed.id, version),
        post_state_summary: {
          profile_id: parsed.id,
          version,
          remaining_versions: host.profiles.versionsOf(parsed.id).filter((v) => v !== version),
        },
      };
    }
    const retired = await host.retireProfile(args.profile_ref);
    return {
      ok: true as const,
      post_state_summary: {
        profile_id: retired.profile_id,
        version: retired.version,
        remaining_versions: host.profiles.versionsOf(retired.profile_id),
      },
    };
  },
};
