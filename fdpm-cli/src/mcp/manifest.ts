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
 * validating-write tools. Tier-3 deletes (`workbook.delete`,
 * `primitive.delete`, `relation.delete`) are present in the registry
 * but only advertised when `--enable-destructive` is set. The freshness
 * check runs against every tool that addresses a workbook_id; the
 * mapping from tool name to workbook-id extractor lives in
 * `tool-metadata-map.ts`.
 */

import type { McpToolEntry } from "./types.js";
import { TOOL_TO_COMMAND_METADATA } from "./tool-metadata-map.js";

// Tier 1 — read-only.
import { tool as healthTool } from "./tools/health.js";
import { tool as profileListTool } from "./tools/profile-list.js";
import { tool as profileGetTool } from "./tools/profile-get.js";
import { tool as profileTypeInfoTool } from "./tools/profile-type-info.js";
import { tool as projectListTool } from "./tools/workbook-list.js";
import { tool as projectGetTool } from "./tools/workbook-get.js";
import { tool as primitiveSearchTool } from "./tools/primitive-search.js";
import { tool as primitiveGetTool } from "./tools/primitive-get.js";
import { tool as relationListTool } from "./tools/relation-list.js";
import { tool as relationGetTool } from "./tools/relation-get.js";
import { tool as logTailTool } from "./tools/log-tail.js";
import { tool as logDiffTool } from "./tools/log-diff.js";

// Tier 2 — validating-write.
import { tool as profileRegisterTool } from "./tools/profile-register.js";
import { tool as projectCreateTool } from "./tools/workbook-create.js";
import { tool as projectUpdateTool } from "./tools/workbook-update.js";
import { tool as primitiveCreateTool } from "./tools/primitive-create.js";
import { tool as primitiveCreateBatchTool } from "./tools/primitive-create-batch.js";
import { tool as primitiveReplaceTool } from "./tools/primitive-replace.js";
import { tool as primitivePatchTool } from "./tools/primitive-patch.js";
import { tool as primitiveFieldPatchTool } from "./tools/primitive-field-patch.js";
import { tool as relationCreateTool } from "./tools/relation-create.js";
import { tool as relationCreateBatchTool } from "./tools/relation-create-batch.js";
import { tool as relationReplaceTool } from "./tools/relation-replace.js";
import { tool as relationPatchTool } from "./tools/relation-patch.js";
import { tool as structureReorderTool } from "./tools/structure-reorder.js";
import { tool as structureReparentTool } from "./tools/structure-reparent.js";

// Tier 3 — destructive (off by default).
import { tool as projectDeleteTool } from "./tools/workbook-delete.js";
import { tool as primitiveDeleteTool } from "./tools/primitive-delete.js";
import { tool as primitiveDeleteBatchTool } from "./tools/primitive-delete-batch.js";
import { tool as relationDeleteTool } from "./tools/relation-delete.js";
import { tool as relationDeleteBatchTool } from "./tools/relation-delete-batch.js";

export type { Tier, McpToolEntry, DispatchCtx } from "./types.js";

export const TIER_1_TOOLS: ReadonlyArray<McpToolEntry<unknown, unknown>> = [
  healthTool,
  profileListTool,
  profileGetTool,
  profileTypeInfoTool,
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
  projectUpdateTool,
  primitiveCreateTool,
  primitiveCreateBatchTool,
  primitiveReplaceTool,
  primitivePatchTool,
  primitiveFieldPatchTool,
  relationCreateTool,
  relationCreateBatchTool,
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
  primitiveDeleteBatchTool,
  relationDeleteTool,
  relationDeleteBatchTool,
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
 * SPEC-MCP-SERVER §8.3 disabled-banner prefix. When destructive is
 * off, every Tier 3 tool's advertised description MUST begin with
 * this exact line followed by a blank line. Defined here as a
 * single source of truth so dispatcher refusal messages, tests,
 * and operator-facing docs all agree.
 */
export const TIER_3_DISABLED_BANNER =
  "⚠ DISABLED. Set FDPM_MCP_ENABLE_DESTRUCTIVE=1 (or pass --enable-destructive) and restart fdpm-mcp to enable dispatch. Calling now refuses with category=permission, reason=destructive_disabled.";

/**
 * Wrap a Tier-3 tool entry with the disabled-banner prefix on its
 * description (SPEC §8.3 / §22.3 v0.1.2). Returns a shallow copy —
 * `input`, `output`, `handler`, and `annotations` are unchanged. The
 * dispatcher's destructive gate still rejects the call; the wrapped
 * entry exists only so `tools/list` advertises the tool with a
 * description that names the enable mechanism.
 */
function withDisabledBanner(
  t: McpToolEntry<unknown, unknown>,
): McpToolEntry<unknown, unknown> {
  return {
    ...t,
    description: `${TIER_3_DISABLED_BANNER}\n\n${t.description}`,
  };
}

/**
 * SPEC-MCP-SERVER §22.3 (v0.1.2): Tier 3 tools are advertised in
 * BOTH states. When destructive is off, their description carries
 * the §8.3 banner; when on, the banner is absent. Authorization
 * happens at dispatch time, not advertisement time — see
 * `dispatch.ts` destructive-gate.
 *
 * The earlier (0.1.0/0.1.1) "hide when disabled" posture was
 * reversed because it created a Catch-22 for LLM clients hitting
 * destructive_disabled refusals: they couldn't see the tool that
 * just refused them, so they couldn't surface the enable hint to
 * the operator. The new posture lets the LLM read the banner,
 * relay it to the operator, and proceed once enabled.
 */
export function advertisedTools(opts: {
  enableDestructive: boolean;
}): ReadonlyArray<McpToolEntry<unknown, unknown>> {
  const out: McpToolEntry<unknown, unknown>[] = [...TIER_1_TOOLS, ...TIER_2_TOOLS];
  if (opts.enableDestructive) {
    out.push(...TIER_3_TOOLS);
  } else {
    out.push(...TIER_3_TOOLS.map(withDisabledBanner));
  }
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
  "updateProject",
  "createPrimitive",
  "replacePrimitive",
  "patchPrimitive",
  "fieldPatchPrimitive",
  "createRelation",
  "replaceRelation",
  "patchRelation",
  "reorder",
  "reparent",
  // Used by the batch-create tools (primitive.create_batch / relation.create_batch).
  "appendBatchWithCausation",
  // Tier 3 — destructive deletes (gated by --enable-destructive).
  "deleteProject",
  "deletePrimitive",
  "deleteRelation",
]);
