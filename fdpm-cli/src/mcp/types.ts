/**
 * Shared types for the MCP tool surface.
 *
 * SPEC-MCP-SERVER §8 defines three tiers; the manifest carries one
 * `Tier` per tool entry and the dispatcher (`./dispatch.ts`) gates on
 * it. v0.1 only ships Tier 1; the other tiers have empty arrays in
 * `./manifest.ts`.
 */

import type { ZodTypeAny } from "zod";
import type { Host } from "../core/host.js";
import type { McpSession } from "./session.js";
import type { CatalogReport } from "./catalog.js";

export type Tier = "read_only" | "validating_write" | "destructive";

/**
 * Per-call dispatch context. Carries the runtime knobs that the
 * tier-gate, rate-limit, and audit-log middleware depend on. Created
 * once per server lifetime in `bin/fdpm-mcp.ts` and passed into every
 * call.
 */
export interface DispatchCtx {
  readonly session: McpSession;
  readonly enableDestructive: boolean;
  readonly enabledPlugins: ReadonlySet<string>;
  readonly auditFullArgs: boolean;
  /**
   * Snapshot of host construction options, captured at server boot.
   * Used by `fdpm.health` to surface what the operator configured;
   * Host itself does not expose these fields.
   */
  readonly hostOptions: {
    dataDir: string | null;
    noPlugins: boolean;
  };
  /**
   * Opt-in defense for high-trust deployments (SPEC-MCP-SERVER §9.3).
   * When `true`, Tier 2 and Tier 3 calls MUST carry an
   * `_confirmation_token` argument matching `confirmationToken` or
   * the dispatcher refuses with `permission` /
   * `evidence.reason: "confirmation_required"`. Tier 1 calls are
   * unaffected.
   *
   * Both fields are optional and additive. The bin entry resolves them
   * from `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN=1` plus
   * `FDPM_MCP_CONFIRMATION_TOKEN` via `resolveConfirmationTokenPolicy`
   * (`src/mcp/confirmation-token.ts`), and leaves both undefined
   * otherwise, preserving the v0.1 default behaviour. Enabling the gate
   * without a token is a startup refusal, not a lockout.
   */
  readonly requireConfirmationToken?: boolean;
  readonly confirmationToken?: string;
  /**
   * Tool-catalog measurement + budget verdict computed once at boot
   * (SPEC-MCP-SERVER §8.5). Surfaced by `fdpm.health`. Optional so
   * embedders and tests can build a ctx without measuring; the health
   * tool measures the Core manifest on demand when absent.
   */
  readonly catalog?: CatalogReport;
}

/**
 * One entry in the MCP tool manifest.
 *
 * - `name`: stable public identifier shaped as `fdpm.<noun>.<verb>`.
 * - `tier`: one of {read_only, validating_write, destructive}.
 * - `description`: shown in MCP `tools/list` output; used by LLMs to
 *   decide tool selection. Keep it factual; no marketing language.
 * - `input` / `output`: Zod schemas. The advertised JSON Schema is
 *   derived from these at server start (see `./schemas.ts`).
 * - `handler`: receives a fully-validated `args` object and the
 *   per-call context. MUST NOT touch `host.persistence` / `host.store`
 *   directly — only `Host.*` methods (CI gate enforces this).
 * - `annotations`: MCP tool annotations advertised to the client.
 *   Tier-1 tools set `readOnlyHint: true`; Tier-3 tools set
 *   `destructiveHint: true`.
 */
export interface McpToolEntry<I = unknown, O = unknown> {
  name: string;
  tier: Tier;
  description: string;
  input: ZodTypeAny;
  output: ZodTypeAny;
  handler: (host: Host, args: I, ctx: DispatchCtx) => Promise<O>;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean };
}
