/**
 * Deployment-configuration resolvers.
 *
 * Both defaults here answer an invariant from the MCP knowledge
 * cartridge:
 *
 *   kc:invariant:scope-minimization — "Publish the minimum scope set and
 *   elevate on challenge; never the whole catalogue up front."
 *
 *   kc:invariant:origin-validation — "When running locally, servers
 *   SHOULD bind only to 127.0.0.1 rather than 0.0.0.0."
 *
 * Both are therefore secure-by-default with an explicit opt-out, rather
 * than permissive-by-default with an opt-in nobody exercises.
 */

import { describe, it, expect } from "vitest";
import { resolveAdvertisedScopes, resolveBindHost } from "../../src/http/config.js";
import { SCOPE_ADMIN, SCOPE_READ, SCOPE_WRITE } from "../../src/http/principal.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

describe("resolveAdvertisedScopes", () => {
  it("advertises only the read scope by default", () => {
    // The minimum that lets a client do anything useful. A client that
    // needs more learns which scope from the 401 challenge.
    expect(resolveAdvertisedScopes({})).toEqual([SCOPE_READ]);
    expect(resolveAdvertisedScopes({ FDPM_MCP_ADVERTISED_SCOPES: "" })).toEqual([SCOPE_READ]);
  });

  it("honours an explicit wider set", () => {
    expect(
      resolveAdvertisedScopes({ FDPM_MCP_ADVERTISED_SCOPES: "fdpm.read,fdpm.write" }),
    ).toEqual([SCOPE_READ, SCOPE_WRITE]);
  });

  it("tolerates whitespace and preserves the configured order", () => {
    expect(
      resolveAdvertisedScopes({ FDPM_MCP_ADVERTISED_SCOPES: " fdpm.admin , fdpm.read " }),
    ).toEqual([SCOPE_ADMIN, SCOPE_READ]);
  });

  it("refuses a scope this server does not define", () => {
    // A typo here silently advertises a scope no token will ever carry,
    // so every call fails with an insufficient_scope nobody can satisfy.
    expect(() =>
      resolveAdvertisedScopes({ FDPM_MCP_ADVERTISED_SCOPES: "fdpm.read,fdpm.wrte" }),
    ).toThrow(FDPMException);
  });

  it("refuses a set that omits the read scope", () => {
    // Every tier needs read as its floor in practice; advertising a set
    // without it produces a connector that can authenticate and do nothing.
    expect(() => resolveAdvertisedScopes({ FDPM_MCP_ADVERTISED_SCOPES: "fdpm.write" })).toThrow(
      FDPMException,
    );
  });
});

describe("resolveBindHost", () => {
  it("binds loopback by default", () => {
    expect(resolveBindHost({})).toBe("127.0.0.1");
    expect(resolveBindHost({ FDPM_MCP_HTTP_HOST: "" })).toBe("127.0.0.1");
  });

  it("honours an explicit bind address", () => {
    // Containers must opt in explicitly; the Dockerfile sets this.
    expect(resolveBindHost({ FDPM_MCP_HTTP_HOST: "0.0.0.0" })).toBe("0.0.0.0");
    expect(resolveBindHost({ FDPM_MCP_HTTP_HOST: "::1" })).toBe("::1");
  });
});
