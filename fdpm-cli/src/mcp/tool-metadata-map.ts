/**
 * Tool ↔ command-metadata mapping (SPEC-MCP-SERVER §10 / §15.2).
 *
 * The MCP tool name (`fdpm.<group>.<verb>`) does not have a
 * 1:1 syntactic mapping onto the central command-metadata key
 * (`"<group> <verb>"`, sometimes hyphenated). The freshness check
 * needs the per-tool `projectIdsFromJson` extractor; this table makes
 * the mapping explicit and verifiable.
 *
 * Entries are one of:
 *   - `string` — the key in `ALL_COMMAND_METADATA`. The dispatcher
 *     calls that entry's `projectIdsFromJson` against the raw tool
 *     args.
 *   - `null` — the tool touches no workbook log (e.g. `fdpm.health`,
 *     `fdpm.profile.list`). The freshness check is skipped.
 *   - `ProjectIdsFromJson` — an inline extractor. Used for tools that
 *     do not have a direct command-metadata equivalent (e.g.
 *     `fdpm.log.tail` / `fdpm.log.diff`, which derive their workbook
 *     scope from the JSON payload directly even though the closest
 *     CLI key is `"log show"`).
 *
 * `manifest.ts` asserts at server boot that every entry in MANIFEST
 * has a row here; missing tools fail boot rather than silently
 * skipping the freshness check.
 */

import {
  ALL_COMMAND_METADATA,
  type ProjectIdsFromJson,
} from "../commands/index.js";
import { projectFromJsonField } from "../commands/metadata.js";

export type ToolMetadataEntry = string | null | ProjectIdsFromJson;

/**
 * Inline extractor for log-shaped tool args. Both `fdpm.log.tail` and
 * `fdpm.log.diff` carry the workbook scope on `workbook_id`. The closest
 * CLI command (`log show`) uses the same `(workbook, workbook_id)` key
 * convention; we duplicate that here rather than alias to `log show`
 * because neither MCP tool maps to that command exactly (no shell
 * tokens, no `--from-revision` flag conventions to honour).
 */
const LOG_TOOL_PROJECT_JSON: ProjectIdsFromJson = projectFromJsonField(
  "workbook_id",
  "workbook",
);

export const TOOL_TO_COMMAND_METADATA: Record<string, ToolMetadataEntry> = {
  // Tier 1 — read-only tools.
  "fdpm.health": null,
  "fdpm.profile.list": "profile list",
  "fdpm.profile.get": "profile get",
  "fdpm.profile.type_info": null,
  "fdpm.workbook.list": "workbook list",
  "fdpm.workbook.get": "workbook get",
  "fdpm.primitive.search": "primitive search",
  "fdpm.primitive.get": "primitive get",
  "fdpm.relation.list": "relation list",
  "fdpm.relation.get": "relation get",
  "fdpm.log.tail": LOG_TOOL_PROJECT_JSON,
  "fdpm.log.diff": LOG_TOOL_PROJECT_JSON,

  // Tier 2 — validating-write tools.
  "fdpm.profile.register": "profile register",
  "fdpm.workbook.create": "workbook create",
  "fdpm.workbook.update": "workbook update",
  "fdpm.primitive.create": "primitive create",
  "fdpm.primitive.create_batch": "primitive create",
  "fdpm.primitive.replace": "primitive replace",
  "fdpm.primitive.patch": "primitive patch",
  "fdpm.primitive.field_patch": "primitive field-patch",
  "fdpm.relation.create": "relation create",
  "fdpm.relation.create_batch": "relation create",
  "fdpm.relation.replace": "relation replace",
  "fdpm.relation.patch": "relation patch",
  "fdpm.structure.reorder": "structure reorder",
  "fdpm.structure.reparent": "structure reparent",

  // Tier 3 — destructive deletes (gated by --enable-destructive).
  "fdpm.workbook.delete": "workbook delete",
  "fdpm.primitive.delete": "primitive delete",
  "fdpm.primitive.delete_batch": "primitive delete",
  "fdpm.relation.delete": "relation delete",
  "fdpm.relation.delete_batch": "relation delete",
};

/**
 * Resolve the `projectIdsFromJson` extractor for a given tool. Returns
 * a no-op `() => []` for `null` entries (no workbook state) AND for
 * unknown tools — synthetic tools injected via the dispatcher's test
 * `resolveTool` seam are not in this table, and the freshness check
 * MUST NOT crash on them. Drift in production-tool entries is caught
 * at boot by `manifest.ts`'s assertion.
 */
export function resolveProjectIdsExtractor(toolName: string): ProjectIdsFromJson {
  if (!(toolName in TOOL_TO_COMMAND_METADATA)) {
    // Unknown tool (e.g. test-injected synthetic): treat as no-workbook.
    return NO_PROJECT;
  }
  const entry = TOOL_TO_COMMAND_METADATA[toolName]!;
  if (entry === null) return NO_PROJECT;
  if (typeof entry === "function") return entry;
  const meta = ALL_COMMAND_METADATA[entry];
  if (!meta) {
    throw new Error(
      `tool-metadata-map: tool "${toolName}" maps to "${entry}" but ALL_COMMAND_METADATA has no such key`,
    );
  }
  return meta.projectIdsFromJson;
}

const NO_PROJECT: ProjectIdsFromJson = () => [];
