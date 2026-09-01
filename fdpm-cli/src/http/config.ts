/**
 * Deployment configuration resolvers for the remote transport.
 *
 * Both defaults here are deliberately the safe end of a trade-off, with
 * an explicit opt-out, because the unsafe end is the one nobody revisits.
 *
 *   - The advertised scope set defaults to read only. A connector that
 *     needs to write learns which scope from the 401 challenge rather
 *     than being handed the whole catalogue at discovery time
 *     (`kc:invariant:scope-minimization`).
 *   - The bind address defaults to loopback. A container opts in to
 *     0.0.0.0 explicitly — the Dockerfile does
 *     (`kc:invariant:origin-validation`).
 */

import { FDPMException } from "../core/errors/fdpm-exception.js";
import { ALL_SCOPES, SCOPE_READ } from "./principal.js";

export const ADVERTISED_SCOPES_ENV = "FDPM_MCP_ADVERTISED_SCOPES";
export const BIND_HOST_ENV = "FDPM_MCP_HTTP_HOST";

/** Loopback, so a local server is not reachable from the network by accident. */
export const DEFAULT_BIND_HOST = "127.0.0.1";

/**
 * Scopes published in protected resource metadata. Not the same thing as
 * the scopes this server *enforces*: every tier is always gated, whatever
 * is advertised here. This is only what a client is told to ask for first.
 */
export function resolveAdvertisedScopes(env: NodeJS.ProcessEnv): string[] {
  const raw = env[ADVERTISED_SCOPES_ENV];
  if (raw === undefined || raw.trim() === "") return [SCOPE_READ];

  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const unknown = requested.filter((s) => !(ALL_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    // Advertising a scope no token will ever carry produces a connector
    // that authenticates and then fails every call with an
    // insufficient_scope the operator cannot satisfy.
    throw new FDPMException(
      "verification",
      `${ADVERTISED_SCOPES_ENV} names ${unknown.length} scope(s) this server does not define: ${unknown.join(", ")}`,
      { evidence: { reason: "unknown_scope", unknown, known: [...ALL_SCOPES] } },
    );
  }

  if (!requested.includes(SCOPE_READ)) {
    throw new FDPMException(
      "verification",
      `${ADVERTISED_SCOPES_ENV} must include ${SCOPE_READ}; without it a client can authenticate and do nothing`,
      { evidence: { reason: "missing_read_scope", requested } },
    );
  }

  return requested;
}

export function resolveBindHost(env: NodeJS.ProcessEnv): string {
  const raw = env[BIND_HOST_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_BIND_HOST;
  return raw.trim();
}
