/**
 * Principal projection — the identity seam for the remote transport.
 *
 * One rule governs this module: the tenant is derived from a VERIFIED
 * token claim and never from a caller-supplied argument. A tool argument
 * naming a tenant is data; a token claim naming a tenant is authority.
 * Collapsing the two is the whole vulnerability class the remote
 * deployment exists to avoid.
 *
 * Scopes are explicit and non-hierarchical. `fdpm.admin` does not imply
 * `fdpm.write`: a token granted deletion but not modification is a
 * misconfiguration worth surfacing, not one to paper over with an
 * implication rule nobody wrote down.
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import type { Tier } from "../mcp/types.js";

export const SCOPE_READ = "fdpm.read";
export const SCOPE_WRITE = "fdpm.write";
export const SCOPE_ADMIN = "fdpm.admin";

export const ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN] as const;

/**
 * A tenant id becomes a path segment under the data root, so it is
 * constrained to the same shape as a workbook id: lowercase slug, no
 * separators, no traversal, bounded length.
 */
const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface Principal {
  /** Stable subject identifier for audit. Never the bearer token. */
  readonly sub: string;
  /** Isolation boundary. Always from a verified claim. */
  readonly tenant: string;
  readonly scopes: readonly string[];
  readonly clientId: string;
}

export interface PrincipalOptions {
  /** Claim name carrying the tenant, e.g. `tenant` or `org_id`. */
  readonly tenantClaim: string;
  /**
   * Single-tenant deployments pin every principal to one tenant,
   * ignoring the claim. This is the degenerate case of the pool, not a
   * separate code path.
   */
  readonly singleTenant?: string;
}

export function isValidTenantId(value: unknown): value is string {
  return typeof value === "string" && TENANT_PATTERN.test(value);
}

/** Each tier requires exactly one scope. */
export function scopeForTier(tier: Tier): string {
  switch (tier) {
    case "read_only":
      return SCOPE_READ;
    case "validating_write":
      return SCOPE_WRITE;
    case "destructive":
      return SCOPE_ADMIN;
  }
}

export function toPrincipal(auth: AuthInfo, opts: PrincipalOptions): Principal {
  const extra = (auth.extra ?? {}) as Record<string, unknown>;

  let tenant: string;
  if (opts.singleTenant !== undefined) {
    if (!isValidTenantId(opts.singleTenant)) {
      throw new FDPMException(
        "internal",
        `configured single tenant is not a valid tenant id: ${JSON.stringify(opts.singleTenant)}`,
        { evidence: { reason: "invalid_single_tenant" } },
      );
    }
    tenant = opts.singleTenant;
  } else {
    const claimed = extra[opts.tenantClaim];
    if (!isValidTenantId(claimed)) {
      throw new FDPMException(
        "permission",
        `token carries no usable tenant: claim ${JSON.stringify(opts.tenantClaim)} must be a lowercase slug`,
        {
          evidence: {
            reason: "invalid_tenant_claim",
            claim: opts.tenantClaim,
            // The value's TYPE is useful for diagnosis; the value is not
            // echoed, because a malicious claim is attacker-controlled text.
            claim_type: claimed === undefined ? "missing" : typeof claimed,
          },
        },
      );
    }
    tenant = claimed;
  }

  const sub = typeof extra["sub"] === "string" && extra["sub"].length > 0
    ? extra["sub"]
    : auth.clientId;

  // `token` is deliberately not projected: the principal is logged, the
  // bearer is not.
  return Object.freeze({
    sub,
    tenant,
    scopes: Object.freeze([...auth.scopes]),
    clientId: auth.clientId,
  });
}

export function hasScope(principal: Principal, scope: string): boolean {
  return principal.scopes.includes(scope);
}

/**
 * Throw `permission` / `insufficient_scope` when the principal may not
 * invoke a tool of this tier. The category and evidence shape match the
 * dispatcher's existing `destructive_disabled` refusal so an agent sees
 * one vocabulary for "you may not do that".
 */
export function assertScope(principal: Principal, tier: Tier): void {
  const required = scopeForTier(tier);
  if (hasScope(principal, required)) return;
  throw new FDPMException(
    "permission",
    `this token is not authorized for ${tier} tools; required scope ${required}`,
    {
      evidence: {
        reason: "insufficient_scope",
        required_scope: required,
        tier,
        granted_scopes: [...principal.scopes],
      },
    },
  );
}
