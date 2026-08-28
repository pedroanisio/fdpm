/**
 * Server instructions — the cold-start orientation layer
 * (SPEC-MCP-SERVER §8.6).
 *
 * `instructions` is the one field of the MCP `initialize` result that
 * clients place in the agent's system context once per session. It is
 * the right home for the "how to think" layer PURPOSE.md says tool
 * descriptions cannot carry: call order, the Tier-2 envelope contract,
 * resource-first reads, the recovery loop on rejection. Per-tool
 * descriptions keep only tool-specific facts; the generic paragraph
 * that every Tier-2 description used to repeat (sent with every
 * `tools/list`) lives here, sent once.
 *
 * The text is STATIC — a pure function of manifest constants — so
 * `initialize.instructions` and the `fdpm://guide` resource are
 * byte-identical and the content is testable without a server.
 * Runtime state (destructive on/off, rate limit, catalog bytes) is
 * reported by `fdpm.health` and by the Tier-3 banner; the text says
 * where to look instead of embedding values that go stale.
 *
 * Size is a per-session cost like the catalog: `INSTRUCTIONS_BUDGET_BYTES`
 * is enforced by `tests/mcp/instructions.test.ts`.
 *
 * Resource URI templates below MUST match the registry verbatim; the
 * same test cross-checks them against `listTemplates()`.
 */

import { MCP_TOOL_MANIFEST_VERSION } from "./schemas.js";

export const INSTRUCTIONS_BUDGET_BYTES = 4_000;

export const SERVER_INSTRUCTIONS: string = [
  `FDPM MCP server (manifest ${MCP_TOOL_MANIFEST_VERSION}). A workbook is a typed, event-sourced graph: primitives and relations validated against a DomainProfile, every write appended to an operation log. Reads are cheap; writes are validated and rejected with structured findings rather than failing.`,
  ``,
  `WORKFLOW`,
  `1. Orient: fdpm.workbook.list gives workbook_id + profile_id; fdpm.profile.get(view: "types") lists the profile's primitive and relation types.`,
  `2. Before ANY create/replace: fdpm.profile.type_info(profile_id, type_id). It returns id_pattern (your \`id\` MUST match it), required_field_names (all MUST be present in field_values) and, for relation types, source_type_id/target_type_id. Skipping this step is the most common cause of rejections.`,
  `3. Read documents through resources (resources/read), not by chaining get tools:`,
  `   - fdpm://workbook/{workbook_id}/render/{target} — rendered view (target is a MIME type such as text/markdown); the human-review artifact`,
  `   - fdpm://profile/{profile_id} (append #summary | #types | #resolved) and fdpm://profiles — profile vocabulary`,
  `   - fdpm://schema/{schema_id} — JSON Schema for a tool payload; fdpm://schema/profile is the input of fdpm.profile.register`,
  `   - fdpm://guide — this text`,
  `4. Authoring several items: use fdpm.primitive.create_batch / fdpm.relation.create_batch (1..500, all-or-nothing; later entries may reference earlier ones; create primitives before the relations that point at them).`,
  `5. Verify: fdpm.primitive.get / fdpm.relation.get show the stored record; fdpm.log.tail shows the operations the log recorded.`,
  ``,
  `RESPONSE CONTRACT`,
  `- Read-only tools: structuredContent is the result.`,
  `- Write tools return { ok, operation, validation_report, post_state_summary }. \`ok: false\` together with \`isError: false\` means the call succeeded but validation REJECTED the write and nothing was written: read validation_report.findings[] (rule_id, field_path, message), fix the input, retry. Batch tools return operations[] and validation_reports[] on success, and one validation_report (the failing entry) on rejection — the whole batch is discarded.`,
  `- \`isError: true\` is a protocol/host error: structuredContent.error.category is not_found, conflict, validation (malformed arguments — check the tool's inputSchema), permission, or host_compat, with evidence.reason when applicable:`,
  `  - permission/destructive_disabled — Tier-3 delete tools are gated; the operator restarts fdpm-mcp with --enable-destructive.`,
  `  - permission/stale_state — another process changed the workbook log; the operator sends SIGHUP to fdpm-mcp, then retry.`,
  `  - permission/rate_limited — per-session limit; wait and retry.`,
  `  - permission/confirmation_required — confirmation mode is on; write calls must carry the operator-provided \`_confirmation_token\`.`,
  `- replace tools accept expected_revision (If-Match): conflict on drift. patch tools validate only the touched paths.`,
  ``,
  `DESTRUCTIVE TOOLS`,
  `Deletes cannot be undone by another tool call. When disabled they carry a ⚠ DISABLED banner in their description. Delete relations before the primitives they reference.`,
  ``,
  `RUNTIME STATE`,
  `fdpm.health reports the manifest version, whether destructive tools are enabled, the catalog byte measurement against its budget, and this text's size. Profiles are metadata: fdpm.profile.register writes no operation-log entry.`,
].join("\n");

/** UTF-8 byte length of `SERVER_INSTRUCTIONS` — the per-session cost. */
export function instructionsBytes(): number {
  return Buffer.byteLength(SERVER_INSTRUCTIONS, "utf8");
}

export interface InstructionsBudgetVerdict {
  ok: boolean;
  bytes: number;
  budget_bytes: number;
}

/**
 * Budget check for the instructions text, mirroring the §8.5 catalog
 * gate: the bin entry point refuses to start when this returns
 * `ok: false`. Parameters exist for tests; production callers use the
 * defaults (the constant text against the constant budget).
 */
export function checkInstructionsBudget(
  bytes: number = instructionsBytes(),
  budgetBytes: number = INSTRUCTIONS_BUDGET_BYTES,
): InstructionsBudgetVerdict {
  return { ok: bytes <= budgetBytes, bytes, budget_bytes: budgetBytes };
}
