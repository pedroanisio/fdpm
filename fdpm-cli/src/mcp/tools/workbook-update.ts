/**
 * `fdpm.workbook.update` — Tier 2 (validating-write).
 *
 * Renames a workbook or rewrites its description. Returns the SPEC §8.2
 * envelope: `{ ok, operation, validation_report, post_state_summary }`.
 * Like `workbook.create`, this is not gated by the §7 validation
 * pipeline — there is no instance to validate against the profile — so
 * the Host returns a synthetic accepted ValidationReport and callers see
 * a uniform shape regardless of tool.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Tier2EnvelopeBase, type Tier2Envelope } from "../tier2-envelope.js";

const Input = z
  .object({
    workbook_id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
  })
  .strict();

const PostStateSummary = z
  .object({
    workbook_id: z.string(),
    name: z.string(),
    fields_touched: z.array(z.string()),
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
  name: "fdpm.workbook.update",
  tier: "validating_write",
  description:
    "Rename a workbook or rewrite its description. Pass `name`, `description` or both; `description: null` clears it, omitting a field leaves it unchanged. An update naming neither is rejected as `verification` rather than appended as a no-op, and an unknown workbook_id is rejected as `not_found`. `profile_id` is NOT updatable: every instance validates against that profile, so re-binding is a migration, not an edit.",
  input: Input,
  output: Output,
  annotations: { destructiveHint: false },
  handler: async (host, args) => {
    const append = await host.updateProject({
      workbook_id: args.workbook_id,
      ...(args.name !== undefined && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
    });
    const workbook = host.getProject(args.workbook_id).workbook;
    // workbook.update does not run the §7 instance pipeline. Synthesize
    // an accepted report so the envelope shape is uniform.
    const report = {
      target_id: args.workbook_id,
      findings: [],
      accepted: true,
    };
    return {
      ok: true,
      operation: append.op,
      validation_report: report,
      post_state_summary: {
        workbook_id: workbook.id,
        name: workbook.name,
        fields_touched: [
          ...(args.name !== undefined ? ["name"] : []),
          ...(args.description !== undefined ? ["description"] : []),
        ],
      },
    };
  },
};
