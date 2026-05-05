/**
 * `fdpm.profile.list` — Tier 1 (read-only).
 *
 * Lists all DomainProfiles registered with the Host (built-ins,
 * plugin-contributed, and operator-installed). Read-only; no
 * workbook state involved.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";

const Input = z.object({}).strict();

const ProfileSummary = z
  .object({
    id: z.string(),
    version: z.string(),
    label: z.string().optional(),
    name: z.string().optional(),
  })
  .strict();

const Output = z
  .object({
    profiles: z.array(ProfileSummary),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.profile.list",
  tier: "read_only",
  description:
    "List the DomainProfiles registered with the Host. Returns id, version, and (when present) label/name.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host) => {
    const profiles = host.profiles.listRaw().map((p) => {
      const summary: { id: string; version: string; label?: string; name?: string } = {
        id: p.id,
        version: p.version,
      };
      if (p.label !== undefined) summary.label = p.label;
      if (p.name !== undefined) summary.name = p.name;
      return summary;
    });
    return { profiles };
  },
};
