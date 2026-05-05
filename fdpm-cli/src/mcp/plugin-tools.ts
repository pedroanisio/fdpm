/**
 * Plugin-tool exposure for the MCP server (SPEC-MCP-SERVER §13).
 *
 * v0.1 ships with this as a STUB. The full implementation requires
 * an amendment to SPEC-PLUGGABLE-ARCHITECTURE adding an `mcp_tool`
 * capability kind to plugin manifests. Until that amendment lands
 * (deferred to v0.1.1 per SPEC-MCP-SERVER §24 last row), the stub
 * MUST NOT expose any plugin commands as MCP tools — even when an
 * operator opts in via `FDPM_MCP_ENABLE_PLUGINS`.
 *
 * This stub exists to make the security posture testable today: if
 * the amendment ever leaks plugin tools into the manifest by accident,
 * the conformance test in `tests/mcp/plugin-tools-stub.test.ts` will
 * catch it.
 *
 * ARCHITECTURAL REQUIREMENT (PALS's LAW): plugin-supplied tool inputs
 * are untrusted by definition. When the real implementation lands it
 * MUST validate plugin-tool inputs through a Zod schema declared by
 * the plugin AND additionally inspect the runtime payload before
 * touching Host state — same posture as Core tools.
 */

import type { Host } from "../core/host.js";
import type { McpToolEntry } from "./types.js";
import { emitHostWarning } from "../core/diagnostics/warnings.js";

/**
 * Discover plugin-supplied MCP tools, given the operator's opt-in
 * list. v0.1 returns `[]` unconditionally.
 *
 * The signature accepts a `Host` even though the stub does not use
 * it: the real implementation will walk `host` for plugin manifests
 * declaring an `mcp_tool` capability. Keeping the parameter in the
 * stub means call-sites do not change when the amendment lands.
 *
 * The opt-in warning is routed through `emitHostWarning` so JSON-
 * mode consumers see a structured `{warning:{...}}` line instead of
 * a raw text bypass (Issue-E corpus invariant).
 */
export function discoverPluginTools(
  _host: Host,
  enabledPluginIds: ReadonlyArray<string>,
): ReadonlyArray<McpToolEntry<unknown, unknown>> {
  if (enabledPluginIds.length === 0) return [];
  // Even with opt-in, the stub never exposes anything. When the
  // SPEC-PLUGGABLE-ARCHITECTURE amendment lands, replace this body
  // with a real walk over plugin manifests looking for
  // `capability.kind === "mcp_tool"` entries.
  emitHostWarning({
    code: "mcp.plugin_tools.unimplemented",
    message: `MCP plugin-tool exposure requested for ${enabledPluginIds.join(",")} but mcp_tool capability is unimplemented (v0.1 stub)`,
    evidence: { enabled_plugin_ids: [...enabledPluginIds] },
  });
  return [];
}
