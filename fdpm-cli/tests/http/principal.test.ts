/**
 * Principal projection and scope authorization.
 *
 * The remote transport's whole isolation story rests on one rule: the
 * tenant is derived from a VERIFIED token claim and never from a
 * caller-supplied argument. These tests pin that rule, the scope ladder
 * that maps onto the existing tier model, and the rejection of tenant
 * ids that could escape their data directory.
 */

import { describe, it, expect } from "vitest";
import {
  SCOPE_ADMIN,
  SCOPE_READ,
  SCOPE_WRITE,
  assertScope,
  isValidTenantId,
  scopeForTier,
  toPrincipal,
} from "../../src/http/principal.js";
import { expandAllowedHosts } from "../../src/http/handler.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

function auth(over: Partial<AuthInfo> = {}): AuthInfo {
  return {
    token: "opaque",
    clientId: "client-1",
    scopes: [SCOPE_READ],
    extra: { tenant: "acme" },
    ...over,
  };
}

describe("scopeForTier", () => {
  it("maps each tier onto exactly one scope", () => {
    expect(scopeForTier("read_only")).toBe(SCOPE_READ);
    expect(scopeForTier("validating_write")).toBe(SCOPE_WRITE);
    expect(scopeForTier("destructive")).toBe(SCOPE_ADMIN);
  });
});

describe("isValidTenantId", () => {
  it("accepts lowercase slugs", () => {
    expect(isValidTenantId("acme")).toBe(true);
    expect(isValidTenantId("acme-corp-2")).toBe(true);
  });

  it("rejects anything that could escape a data directory", () => {
    for (const bad of [
      "..",
      "../etc",
      "a/b",
      "a\\b",
      "/abs",
      "a\0b",
      "",
      "-leading",
      "UPPER",
      "a".repeat(65),
    ]) {
      expect(isValidTenantId(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });
});

describe("toPrincipal", () => {
  it("derives the tenant from the verified claim", () => {
    const p = toPrincipal(auth(), { tenantClaim: "tenant" });
    expect(p).toMatchObject({ sub: "client-1", tenant: "acme", clientId: "client-1" });
    expect(p.scopes).toEqual([SCOPE_READ]);
  });

  it("prefers an explicit subject claim over the client id", () => {
    const p = toPrincipal(auth({ extra: { tenant: "acme", sub: "user-9" } }), {
      tenantClaim: "tenant",
    });
    expect(p.sub).toBe("user-9");
  });

  it("reads the tenant from a configurable claim name", () => {
    const p = toPrincipal(auth({ extra: { org_id: "beta" } }), { tenantClaim: "org_id" });
    expect(p.tenant).toBe("beta");
  });

  it("pins every principal to the configured tenant in single-tenant mode", () => {
    // The claim says acme; the deployment is single-tenant. The
    // deployment wins — this is the degenerate case of the pool.
    const p = toPrincipal(auth(), { tenantClaim: "tenant", singleTenant: "default" });
    expect(p.tenant).toBe("default");
  });

  it("rejects a missing tenant claim rather than defaulting", () => {
    expect(() => toPrincipal(auth({ extra: {} }), { tenantClaim: "tenant" })).toThrow(
      FDPMException,
    );
  });

  it("rejects a traversal-shaped tenant claim", () => {
    expect(() =>
      toPrincipal(auth({ extra: { tenant: "../../etc" } }), { tenantClaim: "tenant" }),
    ).toThrowError(/tenant/i);
  });

  it("rejects a non-string tenant claim", () => {
    expect(() =>
      toPrincipal(auth({ extra: { tenant: { evil: true } } as never }), { tenantClaim: "tenant" }),
    ).toThrow(FDPMException);
  });

  it("never carries the bearer token onto the principal", () => {
    const p = toPrincipal(auth({ token: "super-secret" }), { tenantClaim: "tenant" });
    expect(JSON.stringify(p)).not.toContain("super-secret");
  });
});

describe("assertScope", () => {
  it("permits a tier the principal holds the scope for", () => {
    const p = toPrincipal(auth({ scopes: [SCOPE_READ, SCOPE_WRITE] }), { tenantClaim: "tenant" });
    expect(() => assertScope(p, "read_only")).not.toThrow();
    expect(() => assertScope(p, "validating_write")).not.toThrow();
  });

  it("refuses a tier the principal lacks, as permission/insufficient_scope", () => {
    const p = toPrincipal(auth({ scopes: [SCOPE_READ] }), { tenantClaim: "tenant" });
    try {
      assertScope(p, "destructive");
      throw new Error("expected assertScope to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const e = err as FDPMException;
      expect(e.category).toBe("permission");
      expect(e.evidence?.["reason"]).toBe("insufficient_scope");
      expect(e.evidence?.["required_scope"]).toBe(SCOPE_ADMIN);
    }
  });

  it("does not treat admin as implying write", () => {
    // Scopes are explicit, not hierarchical: a token that can delete but
    // was never granted write is a misconfiguration we surface, not one
    // we paper over.
    const p = toPrincipal(auth({ scopes: [SCOPE_ADMIN] }), { tenantClaim: "tenant" });
    expect(() => assertScope(p, "validating_write")).toThrow(FDPMException);
  });
});

describe("expandAllowedHosts", () => {
  it("keeps an explicit host:port entry as written", () => {
    expect(expandAllowedHosts(["mcp.example.com:8443"], 8080)).toEqual([
      "mcp.example.com:8443",
    ]);
  });

  it("also admits the listen-port form of a bare hostname", () => {
    // The SDK matches the Host header verbatim, and a browser or curl
    // sends `host:port` for any non-default port. An operator who wrote
    // `127.0.0.1` should not have to know that.
    expect(expandAllowedHosts(["127.0.0.1"], 8099)).toEqual(["127.0.0.1", "127.0.0.1:8099"]);
  });

  it("does not duplicate when both forms are configured", () => {
    expect(expandAllowedHosts(["a.example", "a.example:8080"], 8080)).toEqual([
      "a.example",
      "a.example:8080",
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(expandAllowedHosts([], 8080)).toEqual([]);
  });
});
