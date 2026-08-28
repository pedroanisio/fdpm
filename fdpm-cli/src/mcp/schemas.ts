/**
 * Zod → JSON Schema conversion for the MCP tool manifest.
 *
 * SPEC-MCP-SERVER §11.1 makes Zod the source of truth: every tool
 * declares a Zod input/output schema, and the JSON Schema advertised
 * to the MCP client at server-start time is *derived* from that Zod
 * schema. This module centralises that conversion so a future
 * change of converter is a one-line edit.
 *
 * The advertised manifest version is also exported here. Per §11.3 it
 * is part of the MCP `serverInfo` block. Bump policy:
 *  - Adding a tool or an optional argument → minor.
 *  - Renaming/removing a tool, removing an argument, tightening a
 *    type, or changing a response shape backward-incompatibly → major.
 */

import { z, type ZodType } from "zod";

/** Public manifest version advertised in MCP `serverInfo`. */
export const MCP_TOOL_MANIFEST_VERSION = "0.4.0";

/**
 * Convert a Zod schema to a JSON Schema object suitable for advertisement
 * via MCP `tools/list`.
 *
 * The `target: "jsonSchema7"` and `$refStrategy: "none"` settings keep
 * the output flat and compatible with the broadest set of MCP clients.
 */
export function toJsonSchema(zod: ZodType): Record<string, unknown> {
  // Zod v4 ships its own JSON Schema converter. The `target: "draft-7"`
  // option matches the previous behavior (zod-to-json-schema's
  // `target: "jsonSchema7"`); inlining replaces $ref usage so the
  // output stays flat for the broadest set of MCP clients.
  const schema = z.toJSONSchema(zod, {
    target: "draft-7",
    reused: "inline",
  });
  // The `$schema` key is harmless but not useful in the manifest payload.
  const out = { ...(schema as Record<string, unknown>) };
  delete out["$schema"];
  return out;
}
