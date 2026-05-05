/**
 * `fdpm.project.create` — Tier 2 (validating-write).
 *
 * Creates a new project bound to a registered profile. Returns the
 * SPEC §8.2 envelope: `{ ok, operation, validation_report,
 * post_state_summary }`. `project.create` is not gated by the §7
 * validation pipeline (no instance to validate against the profile);
 * the Host returns a synthetic accepted ValidationReport so callers
 * see a uniform shape regardless of tool.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    project_id: z.string().min(1),
    name: z.string().min(1),
    profile_id: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

const PostStateSummary = z
  .object({
    project_id: z.string(),
    profile_id: z.string(),
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
  name: "fdpm.project.create",
  tier: "validating_write",
  description:
    "Create a new project bound to a registered profile. Returns the standard Tier-2 envelope including operation and validation_report.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const append = await host.createProject({
      project_id: args.project_id,
      name: args.name,
      profile_id: args.profile_id,
      ...(args.description !== undefined && { description: args.description }),
    });
    // project.create does not run the §7 instance pipeline. Synthesize
    // an accepted report so the envelope shape is uniform.
    const report = {
      target_id: args.project_id,
      findings: [],
      accepted: true,
    };
    return {
      ok: true,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        project_id: args.project_id,
        profile_id: args.profile_id,
      },
    };
  },
};
