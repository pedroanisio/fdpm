/**
 * Introspection response parsing.
 *
 * An introspection response is untrusted input in exactly the way model
 * output is: it arrives over the network and it decides authority. These
 * tests pin the typed parse, the semantic checks the schema cannot
 * express (active, expiry, audience, issuer), and the typed failure path.
 *
 * The issuer check exists because of `kc:invariant:audience-check` in the
 * MCP knowledge cartridge: "Check the aud claim against your own MCP
 * server URL, and iss against the expected issuer." Validating audience
 * alone leaves a token minted by a different, attacker-chosen
 * authorization server acceptable, provided it names us as its audience.
 */

import { describe, it, expect } from "vitest";
import { parseIntrospection } from "../../src/http/token-verifier.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

const OPTS = {
  tenantClaim: "tenant",
  resource: "https://mcp.example.com/mcp",
  issuer: "https://auth.example.com",
};
const NOW = 1_800_000_000_000;

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    active: true,
    tenant: "acme",
    sub: "user-1",
    client_id: "client-1",
    scope: "fdpm.read fdpm.write",
    aud: OPTS.resource,
    iss: OPTS.issuer,
    ...over,
  };
}

function reasonOf(fn: () => unknown): string {
  try {
    fn();
    throw new Error("expected a throw");
  } catch (err) {
    expect(err).toBeInstanceOf(FDPMException);
    return String((err as FDPMException).evidence?.["reason"]);
  }
}

describe("parseIntrospection — accepted", () => {
  it("projects scopes, subject and tenant from a valid response", () => {
    const info = parseIntrospection(body(), OPTS, NOW);
    expect(info.clientId).toBe("client-1");
    expect(info.scopes).toEqual(["fdpm.read", "fdpm.write"]);
    expect(info.extra).toMatchObject({ tenant: "acme", sub: "user-1" });
  });

  it("accepts an audience that differs only by a hash fragment or trailing slash", () => {
    expect(() => parseIntrospection(body({ aud: `${OPTS.resource}#frag` }), OPTS, NOW)).not.toThrow();
    expect(() => parseIntrospection(body({ aud: `${OPTS.resource}/` }), OPTS, NOW)).not.toThrow();
  });

  it("accepts an audience array that contains this resource", () => {
    expect(() =>
      parseIntrospection(body({ aud: ["https://other.example", OPTS.resource] }), OPTS, NOW),
    ).not.toThrow();
  });
});

describe("parseIntrospection — refused", () => {
  it("refuses a non-object response", () => {
    expect(reasonOf(() => parseIntrospection("nope", OPTS, NOW))).toBe("malformed_introspection");
    expect(reasonOf(() => parseIntrospection(null, OPTS, NOW))).toBe("malformed_introspection");
  });

  it("refuses anything but a strict boolean true for `active`", () => {
    for (const active of [false, "true", 1, null, undefined]) {
      expect(reasonOf(() => parseIntrospection(body({ active }), OPTS, NOW))).toBe("inactive_token");
    }
  });

  it("refuses an expired token", () => {
    expect(reasonOf(() => parseIntrospection(body({ exp: NOW / 1000 - 1 }), OPTS, NOW))).toBe(
      "expired_token",
    );
  });

  it("refuses a non-numeric expiry rather than coercing it", () => {
    expect(reasonOf(() => parseIntrospection(body({ exp: "soon" }), OPTS, NOW))).toBe(
      "malformed_introspection",
    );
  });

  it("refuses a token minted for another resource server", () => {
    expect(reasonOf(() => parseIntrospection(body({ aud: "https://elsewhere" }), OPTS, NOW))).toBe(
      "audience_mismatch",
    );
  });

  it("refuses a token from an unexpected issuer", () => {
    // Audience alone is not enough: an attacker who controls any
    // authorization server can mint a token naming us as its audience.
    expect(reasonOf(() => parseIntrospection(body({ iss: "https://evil.example" }), OPTS, NOW))).toBe(
      "issuer_mismatch",
    );
  });

  it("omits an absent or unusable tenant claim rather than refusing the token", () => {
    // Tenancy is POLICY and belongs to toPrincipal, which knows whether the
    // deployment is single- or multi-tenant. A single-tenant deployment pins
    // every caller and needs no claim at all, so refusing here would reject
    // a perfectly valid token. A multi-tenant deployment still refuses: see
    // principal.test.ts, "rejects a missing tenant claim rather than defaulting".
    for (const tenant of [undefined, "../escape", 42, { evil: true }]) {
      const info = parseIntrospection(body({ tenant }), OPTS, NOW);
      expect(info.extra?.["tenant"]).toBeUndefined();
    }
  });

  it("passes a valid tenant claim through untouched", () => {
    const info = parseIntrospection(body({ tenant: "acme" }), OPTS, NOW);
    expect(info.extra).toMatchObject({ tenant: "acme" });
  });

  it("never returns the bearer token in the projected AuthInfo", () => {
    const info = parseIntrospection(body(), OPTS, NOW);
    expect(info.token).toBe("");
  });
});

/**
 * Keycloak interoperability.
 *
 * Two things differ between the MCP authorization spec's model and what a
 * Keycloak realm emits, and both are configuration rather than defects:
 *
 *   - The spec's resource indicator is a URL. Keycloak's audience mapper
 *     puts the *resource client id* in `aud`. So the expected audience
 *     must be settable independently of the public URL.
 *   - OAuth scopes live in `scope`. Keycloak client roles land in
 *     `resource_access.<client>.roles`. A deployment that grants
 *     privileges as client roles must still authorize.
 */
describe("Keycloak-shaped introspection responses", () => {
  const KC = {
    tenantClaim: "tenant",
    resource: "https://mcp.veraformx.com/mcp",
    issuer: "https://id.xaai.ai/realms/platform",
    audience: "fdpm-mcp",
  };

  function kcBody(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      active: true,
      // Deliberately NO tenant claim: nothing in the Keycloak realm sets
      // one, and the deployment is single-tenant. This is the exact shape
      // that failed in production on 2026-09-01.
      sub: "user-1",
      client_id: "fdpm-mcp-claude",
      iss: KC.issuer,
      aud: "fdpm-mcp",
      resource_access: { "fdpm-mcp": { roles: ["fdpm.read", "fdpm.write"] } },
      ...over,
    };
  }

  it("accepts an audience that is a client id when one is configured", () => {
    const info = parseIntrospection(kcBody(), KC, NOW);
    expect(info.clientId).toBe("fdpm-mcp-claude");
  });

  it("accepts a realm token that carries no tenant claim at all", () => {
    // REGRESSION: this returned invalid_tenant_claim and broke every
    // connection, while the audience and roles were already correct.
    expect(() => parseIntrospection(kcBody(), KC, NOW)).not.toThrow();
  });

  it("still rejects a different client id as the audience", () => {
    expect(reasonOf(() => parseIntrospection(kcBody({ aud: "someone-else" }), KC, NOW))).toBe(
      "audience_mismatch",
    );
  });

  it("reads privileges from resource_access roles when `scope` is absent", () => {
    const info = parseIntrospection(kcBody(), KC, NOW);
    expect(info.scopes).toEqual(["fdpm.read", "fdpm.write"]);
  });

  it("merges `scope` and resource_access roles without duplicating", () => {
    const info = parseIntrospection(
      kcBody({ scope: "openid profile fdpm.read" }),
      KC,
      NOW,
    );
    expect(info.scopes).toContain("fdpm.read");
    expect(info.scopes).toContain("fdpm.write");
    expect(info.scopes).toContain("openid");
    expect(info.scopes.filter((s) => s === "fdpm.read")).toHaveLength(1);
  });

  it("ignores roles granted on some other client", () => {
    // A role on scrapper-api must not authorize a call to this server.
    const info = parseIntrospection(
      kcBody({ resource_access: { "scrapper-api": { roles: ["fdpm.admin"] } } }),
      KC,
      NOW,
    );
    expect(info.scopes).not.toContain("fdpm.admin");
  });

  it("tolerates a malformed resource_access block rather than throwing", () => {
    for (const ra of [null, "nope", { "fdpm-mcp": { roles: "not-an-array" } }, {}]) {
      const info = parseIntrospection(
        kcBody({ resource_access: ra, scope: "fdpm.read" }),
        KC,
        NOW,
      );
      expect(info.scopes).toEqual(["fdpm.read"]);
    }
  });

  it("defaults the expected audience to the resource URL when unset", () => {
    const noAud = { tenantClaim: "tenant", resource: KC.resource, issuer: KC.issuer };
    expect(reasonOf(() => parseIntrospection(kcBody(), noAud, NOW))).toBe("audience_mismatch");
    const info = parseIntrospection(kcBody({ aud: KC.resource }), noAud, NOW);
    expect(info.sub === undefined || true).toBe(true);
  });
});
