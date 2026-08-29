/**
 * Confirmation-token policy resolution (SPEC-MCP-SERVER §9.3).
 *
 * §9.3 states that Tier 2/3 tools "may additionally be gated by
 * `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN=1` — opt-in defense for high-trust
 * deployments", and §9.5's threat model lists confirmation-token mode among
 * the four controls that bound the blast radius of indirect prompt injection
 * (Greshake et al., 2023).
 *
 * `dispatch.ts` has always enforced the gate from `ctx.requireConfirmationToken`
 * and `ctx.confirmationToken`. This module is the missing half: it turns the
 * operator's environment into that pair. Without it the control was
 * unreachable from the shipped binary — documented, implemented, and
 * impossible to switch on.
 *
 * Two deliberate strictnesses:
 *
 *   1. **Exactly `"1"` enables the gate.** A security control must not be
 *      switched on by `"true"` in one deployment and off by `"yes"` in
 *      another. This mirrors `FDPM_MCP_ENABLE_DESTRUCTIVE`.
 *   2. **Enabling without a token is a startup refusal.** `dispatch.ts`
 *      compares the caller's `_confirmation_token` against
 *      `ctx.confirmationToken`; if that is `undefined`, every Tier 2/3 call
 *      is refused with `confirmation_required` and no token can ever satisfy
 *      it. Failing loudly at boot beats an operator discovering at runtime
 *      that they have locked themselves out of their own workbook.
 *
 * The token is never logged: callers put it in the context, and the audit log
 * strips `_confirmation_token` from recorded arguments (`dispatch.ts`).
 */

/** Env var that opts a deployment into the gate. SPEC-MCP-SERVER §9.3. */
export const REQUIRE_CONFIRMATION_TOKEN_ENV = "FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN";

/**
 * Env var carrying the expected token value. Not named by §9.3 — the SPEC
 * describes the gate and leaves token delivery as its open question Q2 — so
 * the name is chosen here to match the `FDPM_MCP_*` family.
 */
export const CONFIRMATION_TOKEN_ENV = "FDPM_MCP_CONFIRMATION_TOKEN";

/** The pair `McpContext` consumes. `confirmationToken` is present iff enabled. */
export interface ConfirmationTokenPolicy {
  readonly requireConfirmationToken: boolean;
  readonly confirmationToken?: string;
}

/**
 * Resolve the policy from an environment.
 *
 * @throws Error when the gate is enabled without a usable token. The bin
 * entry point turns this into a startup refusal with exit code 2, the same
 * treatment `--max-calls-per-minute` and the catalog budget already receive.
 */
export function resolveConfirmationTokenPolicy(
  env: Readonly<Record<string, string | undefined>>,
): ConfirmationTokenPolicy {
  if (env[REQUIRE_CONFIRMATION_TOKEN_ENV] !== "1") {
    return { requireConfirmationToken: false };
  }

  const token = env[CONFIRMATION_TOKEN_ENV];
  if (token === undefined || token.trim().length === 0) {
    throw new Error(
      `${REQUIRE_CONFIRMATION_TOKEN_ENV}=1 requires ${CONFIRMATION_TOKEN_ENV} to be set to a ` +
        `non-empty value. Without it every Tier 2 and Tier 3 call would be refused with ` +
        `evidence.reason="confirmation_required" and no token could satisfy the gate.`,
    );
  }

  return { requireConfirmationToken: true, confirmationToken: token };
}
