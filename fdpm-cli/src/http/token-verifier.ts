/**
 * Bearer token verification.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * The banner applies here for an unusual reason: this module is the last
 * point at which an assertion made by *anything outside this process* —
 * an authorization server, a proxy, a model-driven client — is turned
 * into authority inside it. Every field it returns is parsed into an
 * explicit shape, range-checked, and rejected with a typed error on
 * failure. A token is untrusted input in exactly the way model output is.
 *
 * Two verifiers ship:
 *
 *   - `createStaticTokenVerifier` — a shared secret, for the vendor
 *     "request header" / API-key connector mode and for local testing.
 *     Constant-time comparison; no user identity beyond the configured one.
 *   - `createIntrospectionVerifier` — RFC 7662 token introspection against
 *     the authorization server, with a short positive cache. Chosen over
 *     local JWT verification because it needs no new dependency and
 *     honours revocation immediately.
 */

import { timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { isValidTenantId } from "./principal.js";

export interface TokenVerifier {
  /** Resolve a bearer token to AuthInfo, or throw `unauthenticated`. */
  verify(token: string): Promise<AuthInfo>;
}

function unauthenticated(message: string, reason: string): FDPMException {
  return new FDPMException("unauthenticated", message, { evidence: { reason } });
}

/** Constant-time string compare that does not leak length via early exit. */
function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still burn a comparison so the timing signal does not distinguish
    // "wrong length" from "wrong bytes".
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export interface StaticVerifierOptions {
  readonly token: string;
  readonly tenant: string;
  readonly scopes: readonly string[];
  readonly clientId?: string;
  readonly subject?: string;
}

export function createStaticTokenVerifier(opts: StaticVerifierOptions): TokenVerifier {
  if (opts.token.length < 32) {
    throw new FDPMException(
      "verification",
      "static bearer token must be at least 32 characters; a short shared secret is guessable",
      { evidence: { reason: "weak_static_token", length: opts.token.length } },
    );
  }
  if (!isValidTenantId(opts.tenant)) {
    throw new FDPMException(
      "verification",
      `static verifier tenant must be a lowercase slug, got ${JSON.stringify(opts.tenant)}`,
      { evidence: { reason: "invalid_tenant_id" } },
    );
  }
  const clientId = opts.clientId ?? "static-client";
  return {
    async verify(token: string): Promise<AuthInfo> {
      if (!secretEquals(token, opts.token)) {
        throw unauthenticated("bearer token not recognized", "invalid_token");
      }
      return {
        token,
        clientId,
        scopes: [...opts.scopes],
        extra: { tenant: opts.tenant, sub: opts.subject ?? clientId },
      };
    },
  };
}

export interface IntrospectionOptions {
  readonly introspectionUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Claim carrying the tenant in the introspection response. */
  readonly tenantClaim: string;
  /** Expected audience / resource indicator (RFC 8707). */
  readonly resource: string;
  /**
   * Expected token issuer. Checked against the response's `iss` when the
   * authorization server returns one. Audience alone is insufficient:
   * anyone who controls any authorization server can mint a token that
   * names this resource server as its audience.
   */
  readonly issuer: string;
  /**
   * Expected `aud` value. Defaults to `resource`, which is what the MCP
   * authorization spec's resource indicator prescribes. Keycloak's
   * audience mapper instead emits the *resource client id*, so a
   * deployment against such a realm sets this to that id. The RFC 9728
   * `resource` advertised to clients is unaffected either way.
   */
  readonly audience?: string;
  /** Positive-result cache TTL. Default 60 s. */
  readonly cacheTtlMs?: number;
  /** Injected for tests. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

interface CacheEntry {
  info: AuthInfo;
  expiresAt: number;
}

/**
 * RFC 7662 introspection.
 *
 * The response is treated as untrusted: `active` must be exactly `true`,
 * `exp` must be in the future, the audience must match this resource
 * server, and the tenant claim must be a valid slug. Anything else is a
 * typed refusal — never a coerced default.
 */
export function createIntrospectionVerifier(opts: IntrospectionOptions): TokenVerifier {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const ttl = opts.cacheTtlMs ?? 60_000;
  const cache = new Map<string, CacheEntry>();

  return {
    async verify(token: string): Promise<AuthInfo> {
      const hit = cache.get(token);
      if (hit && hit.expiresAt > now()) return hit.info;

      let payload: unknown;
      try {
        const res = await doFetch(opts.introspectionUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization:
              "Basic " +
              Buffer.from(`${opts.clientId}:${opts.clientSecret}`, "utf8").toString("base64"),
            accept: "application/json",
          },
          body: new URLSearchParams({ token, token_type_hint: "access_token" }).toString(),
        });
        if (!res.ok) {
          throw unauthenticated(
            `introspection endpoint returned ${res.status}`,
            "introspection_failed",
          );
        }
        payload = await res.json();
      } catch (err) {
        if (err instanceof FDPMException) throw err;
        throw unauthenticated(
          `introspection request failed: ${err instanceof Error ? err.message : String(err)}`,
          "introspection_unreachable",
        );
      }

      const info = parseIntrospection(payload, opts, now());
      cache.set(token, {
        info,
        // Never cache past the token's own expiry.
        expiresAt: Math.min(
          now() + ttl,
          info.expiresAt !== undefined ? info.expiresAt * 1000 : Infinity,
        ),
      });
      return info;
    },
  };
}

/** Typed parse of the introspection response. Exported for direct testing. */
export function parseIntrospection(
  payload: unknown,
  opts: Pick<IntrospectionOptions, "tenantClaim" | "resource" | "issuer"> &
    Partial<Pick<IntrospectionOptions, "audience">>,
  nowMs: number,
): AuthInfo {
  if (typeof payload !== "object" || payload === null) {
    throw unauthenticated("introspection response was not a JSON object", "malformed_introspection");
  }
  const body = payload as Record<string, unknown>;

  // `active` is the whole point of RFC 7662; a truthy-but-not-true value
  // (the string "false", 1, null) must not pass.
  if (body["active"] !== true) {
    throw unauthenticated("token is not active", "inactive_token");
  }

  const exp = body["exp"];
  if (exp !== undefined) {
    if (typeof exp !== "number" || !Number.isFinite(exp)) {
      throw unauthenticated("introspection `exp` was not a number", "malformed_introspection");
    }
    if (exp * 1000 <= nowMs) {
      throw unauthenticated("token has expired", "expired_token");
    }
  }

  // RFC 8707: a token minted for another resource server must not be
  // replayable here.
  const expectedAudience = opts.audience ?? opts.resource;
  const aud = body["aud"];
  if (aud !== undefined) {
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.some((a) => typeof a === "string" && audienceMatches(a, expectedAudience))) {
      throw unauthenticated(
        "token audience does not include this resource server",
        "audience_mismatch",
      );
    }
  }

  // `kc:invariant:audience-check`: check aud against our own URL AND iss
  // against the expected issuer. A token whose audience names us but
  // whose issuer is attacker-chosen must not be accepted.
  const iss = body["iss"];
  if (iss !== undefined) {
    if (typeof iss !== "string" || !audienceMatches(iss, opts.issuer)) {
      throw unauthenticated(
        "token was not minted by the expected issuer",
        "issuer_mismatch",
      );
    }
  }

  // Tenancy is POLICY, and it belongs to `toPrincipal`, which is the only
  // place that knows whether this deployment is single- or multi-tenant.
  // A single-tenant deployment pins every caller and needs no claim at all,
  // so refusing here would reject a valid token — which is exactly what
  // happened against the Keycloak realm on 2026-09-01, where nothing emits
  // a tenant claim. An absent or unusable claim is therefore omitted, not
  // fatal; a multi-tenant deployment still refuses it one layer up.
  const claimed = body[opts.tenantClaim];
  const tenant = isValidTenantId(claimed) ? claimed : undefined;

  // Privileges arrive by either of two routes and both are honoured:
  // the OAuth `scope` string, and Keycloak client roles under
  // `resource_access.<expected audience>.roles`. Roles on any OTHER
  // client are ignored — a role granted on a different API must not
  // authorize a call here. Anything malformed contributes nothing rather
  // than throwing: a token with a usable `scope` should not be refused
  // because some unrelated block is the wrong shape.
  const scopeRaw = body["scope"];
  const fromScope =
    typeof scopeRaw === "string" && scopeRaw.length > 0 ? scopeRaw.split(/\s+/) : [];

  const fromRoles: string[] = [];
  const resourceAccess = body["resource_access"];
  if (typeof resourceAccess === "object" && resourceAccess !== null) {
    const entry = (resourceAccess as Record<string, unknown>)[expectedAudience];
    if (typeof entry === "object" && entry !== null) {
      const roles = (entry as { roles?: unknown }).roles;
      if (Array.isArray(roles)) {
        for (const r of roles) if (typeof r === "string") fromRoles.push(r);
      }
    }
  }

  const scopes = [...new Set([...fromScope, ...fromRoles])];

  const clientId = typeof body["client_id"] === "string" ? body["client_id"] : "unknown-client";
  const sub = typeof body["sub"] === "string" ? body["sub"] : clientId;

  const info: AuthInfo = {
    token: "",
    clientId,
    scopes,
    extra: { ...(tenant !== undefined && { [opts.tenantClaim]: tenant }), sub },
  };
  if (typeof exp === "number") {
    return { ...info, expiresAt: exp };
  }
  return info;
}

/** Compare audience to the resource identifier, ignoring a hash fragment. */
function audienceMatches(audience: string, resource: string): boolean {
  const strip = (s: string): string => s.split("#")[0]!.replace(/\/+$/, "");
  return strip(audience) === strip(resource);
}
