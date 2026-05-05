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

import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Public manifest version advertised in MCP `serverInfo`. */
export const MCP_TOOL_MANIFEST_VERSION = "0.1.0";

/**
 * Convert a Zod schema to a JSON Schema object suitable for advertisement
 * via MCP `tools/list`.
 *
 * The `target: "jsonSchema7"` and `$refStrategy: "none"` settings keep
 * the output flat and compatible with the broadest set of MCP clients.
 */
export function toJsonSchema(zod: ZodType): Record<string, unknown> {
  const schema = zodToJsonSchema(zod, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });
  // zod-to-json-schema returns a typed object; we type-erase to the
  // generic shape MCP advertises. The `$schema` key is harmless but
  // not useful in the manifest payload.
  const out = { ...(schema as Record<string, unknown>) };
  delete out["$schema"];
  return out;
}
