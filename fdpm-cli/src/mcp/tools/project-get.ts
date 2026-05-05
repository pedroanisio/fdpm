/**
 * `fdpm.project.get` — Tier 1 (read-only).
 *
 * Returns the project's `Project` row plus a primitive/relation
 * count summary. The full slice (every primitive and relation) is
 * intentionally NOT included — that surface is reserved for paged
 * search/list tools (deferred). This response is small enough that
 * an LLM can use it for navigation without consuming the full
 * project state.
 */

import { z } from "zod";
import type { McpToolEntry } from "../types.js";
import { Project } from "../../core/models/instance.js";

const Input = z
  .object({
    project_id: z.string().min(1),
  })
  .strict();

const Output = z
  .object({
    project: Project,
    primitive_count: z.number().int().nonnegative(),
    relation_count: z.number().int().nonnegative(),
  })
  .strict();

export const tool: McpToolEntry<z.infer<typeof Input>, z.infer<typeof Output>> = {
  name: "fdpm.project.get",
  tier: "read_only",
  description:
    "Fetch a project's row and instance counts. Throws not_found if the project_id is unknown.",
  input: Input,
  output: Output,
  annotations: { readOnlyHint: true },
  handler: async (host, args) => {
    // Host.getProject throws FDPMException("not_found") on miss.
    const slice = host.getProject(args.project_id);
    return {
      project: slice.project,
      primitive_count: Object.keys(slice.primitives).length,
      relation_count: Object.keys(slice.relations).length,
    };
  },
};
