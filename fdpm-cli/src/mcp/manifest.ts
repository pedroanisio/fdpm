/**
 * MCP tool manifest — single source of truth for the surface advertised
 * by `fdpm-mcp` (SPEC-MCP-SERVER §8, §11).
 *
 * Adding a tool is a reviewed action. The CI gate
 * (tests/mcp-classification.test.ts) enforces that every public Host
 * method is either represented here OR explicitly listed in
 * `not-exposed.ts`; new unclassified methods break the build.
 *
 * Slice B-final + Phase C ship 11 Tier-1 read-only tools and 11 Tier-2
 * validating-write tools. Tier-3 deletes (`project.delete`,
 * `primitive.delete`, `relation.delete`) are present in the registry
 * but only advertised when `--enable-destructive` is set. The freshness
 * check runs against every tool that addresses a project_id; the
 * mapping from tool name to project-id extractor lives in
 * `tool-metadata-map.ts`.
 */

import type { McpToolEntry } from "./types.js";
import { TOOL_TO_COMMAND_METADATA } from "./tool-metadata-map.js";

// Tier 1 — read-only.
import { tool as healthTool } from "./tools/health.js";
import { tool as profileListTool } from "./tools/profile-list.js";
import { tool as profileGetTool } from "./tools/profile-get.js";
import { tool as projectListTool } from "./tools/project-list.js";
import { tool as projectGetTool } from "./tools/project-get.js";
import { tool as primitiveSearchTool } from "./tools/primitive-search.js";
import { tool as primitiveGetTool } from "./tools/primitive-get.js";
import { tool as relationListTool } from "./tools/relation-list.js";
import { tool as relationGetTool } from "./tools/relation-get.js";
import { tool as logTailTool } from "./tools/log-tail.js";
import { tool as logDiffTool } from "./tools/log-diff.js";

// Tier 2 — validating-write.
import { tool as profileRegisterTool } from "./tools/profile-register.js";
import { tool as projectCreateTool } from "./tools/project-create.js";
import { tool as primitiveCreateTool } from "./tools/primitive-create.js";
import { tool as primitiveReplaceTool } from "./tools/primitive-replace.js";
import { tool as primitivePatchTool } from "./tools/primitive-patch.js";
import { tool as primitiveFieldPatchTool } from "./tools/primitive-field-patch.js";
import { tool as relationCreateTool } from "./tools/relation-create.js";
import { tool as relationReplaceTool } from "./tools/relation-replace.js";
import { tool as relationPatchTool } from "./tools/relation-patch.js";
import { tool as structureReorderTool } from "./tools/structure-reorder.js";
import { tool as structureReparentTool } from "./tools/structure-reparent.js";

// Tier 3 — destructive (off by default).
import { tool as projectDeleteTool } from "./tools/project-delete.js";
import { tool as primitiveDeleteTool } from "./tools/primitive-delete.js";
import { tool as relationDeleteTool } from "./tools/relation-delete.js";

export type { Tier, McpToolEntry, DispatchCtx } from "./types.js";

export const TIER_1_TOOLS: ReadonlyArray<McpToolEntry<unknown, unknown>> = [
  healthTool,
  profileListTool,
  profileGetTool,
  projectListTool,
  projectGetTool,
  primitiveSearchTool,
  primitiveGetTool,
  relationListTool,
  relationGetTool,
  logTailTool,
  logDiffTool,
] as ReadonlyArray<McpToolEntry<unknown, unknown>>;

export const TIER_2_TOOLS: ReadonlyArray<McpToolEntry<unknown, unknown>> = [
  profileRegisterTool,
  projectCreateTool,
  primitiveCreateTool,
  primitiveReplaceTool,
  primitivePatchTool,
  primitiveFieldPatchTool,
  relationCreateTool,
  relationReplaceTool,
  relationPatchTool,
  structureReorderTool,
  structureReparentTool,
] as ReadonlyArray<McpToolEntry<unknown, unknown>>;

/**
 * Tier 3 — destructive tools (off by default).
 *
 * NOT advertised when `enableDestructive` is false (see
 * `advertisedTools`) and additionally refused at dispatch time by the
 * tier gate (defense-in-depth, per SPEC-MCP-SERVER §22.3 / §23.1).
 */
export const TIER_3_TOOLS: ReadonlyArray<McpToolEntry<unknown, unknown>> = [
  projectDeleteTool,
  primitiveDeleteTool,
  relationDeleteTool,
] as ReadonlyArray<McpToolEntry<unknown, unknown>>;

/**
 * Combined manifest. Order is significant for stable advertisement:
 * Tier 1 first, then Tier 2, then Tier 3 (when enabled).
 */
export const MANIFEST: ReadonlyArray<McpToolEntry<unknown, unknown>> = [
  ...TIER_1_TOOLS,
  ...TIER_2_TOOLS,
  ...TIER_3_TOOLS,
];

// Boot-time check: every advertised tool MUST have a row in
// TOOL_TO_COMMAND_METADATA. A missing row would make the freshness
// check silently no-op for that tool, defeating SPEC §10. Failing here
// at module load surfaces the drift before the server accepts any
// tool calls.
{
  const missing: string[] = [];
  for (const t of MANIFEST) {
    if (!(t.name in TOOL_TO_COMMAND_METADATA)) missing.push(t.name);
  }
  if (missing.length > 0) {
    throw new Error(
      `mcp/manifest.ts: tools missing from TOOL_TO_COMMAND_METADATA: ${missing.join(", ")}`,
    );
  }
}

/**
 * Resolve a tool entry by name, returning null if not advertised.
 * The dispatcher uses this for the per-call "is this tool known"
 * gate; advertising-time filtering uses the tier arrays directly.
 */
export function findTool(name: string): McpToolEntry<unknown, unknown> | null {
  return MANIFEST.find((t) => t.name === name) ?? null;
}

/**
 * Filter the manifest down to the surface the operator actually
 * wants advertised given the destructive flag.
 */
export function advertisedTools(opts: {
  enableDestructive: boolean;
}): ReadonlyArray<McpToolEntry<unknown, unknown>> {
  const out: McpToolEntry<unknown, unknown>[] = [...TIER_1_TOOLS, ...TIER_2_TOOLS];
  if (opts.enableDestructive) out.push(...TIER_3_TOOLS);
  return out;
}

/**
 * The set of public Host method names that the current manifest
 * actually exposes (directly or via a thin wrapper). The CI
 * classification gate (tests/mcp-classification.test.ts) asserts that
 * every public Host method is in this set OR in `not-exposed.NOT_EXPOSED`.
 */
export const EXPOSED_HOST_METHODS: ReadonlySet<string> = new Set<string>([
  // Tier 1 — reads.
  "listProjects",
  "getProject",
  "searchPrimitives",
  "searchRelations",
  "getLog",
  // Tier 2 — validating writes.
  "registerProfile",
  "createProject",
  "createPrimitive",
  "replacePrimitive",
  "patchPrimitive",
  "fieldPatchPrimitive",
  "createRelation",
  "replaceRelation",
  "patchRelation",
  "reorder",
  "reparent",
  // Tier 3 — destructive deletes (gated by --enable-destructive).
  "deleteProject",
  "deletePrimitive",
  "deleteRelation",
]);
