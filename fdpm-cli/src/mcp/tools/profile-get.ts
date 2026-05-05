/**
 * `fdpm.profile.get` — Tier 1 (read-only).
 *
 * Returns the *raw* registered DomainProfile by id. Raw (not
 * resolved) is the right read for catalog/inspection flows: the
 * `extends`-chain merge is a derivation that callers can request
 * separately if they need it. The Host already throws `not_found`
 * via `ProfileRegistry.getRaw`.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { DomainProfile } from "../../core/models/meta.js";

const Input = z
  .object({
    profile_id: z.string().min(1),
  })
  .strict();

// We re-export the existing DomainProfile schema as the output schema
// so the advertised JSON Schema mirrors the Core's own contract.
const Output = DomainProfile;

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.get",
  tier: "read_only",
  description:
    "Fetch a DomainProfile by id. Returns the raw (un-resolved) profile as registered. Throws not_found if the id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    // ProfileRegistry.getRaw throws FDPMException("not_found") on miss.
    return host.profiles.getRaw(args.profile_id);
  },
};
