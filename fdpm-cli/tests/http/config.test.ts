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
import {
  assertRequiredPluginsActive,
  resolveAdvertisedScopes,
  resolveBindHost,
  resolveRequiredPlugins,
} from "../../src/http/config.js";
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

/**
 * Required-plugin preflight.
 *
 * Observed 2026-09-01: the doks-tor1 overlay installs `fdpm-media` from its
 * own image and authorises it with `FDPM_TRUSTED_KEYS`. Those are two strings
 * in two repositories that must match exactly, and when they did not the
 * plugin was discovered, silently disabled, and the gateway still answered
 * /healthz 200 and /readyz {"ok":true} with a startup log byte-identical to a
 * healthy boot. Nothing Kubernetes can observe distinguished the two.
 *
 * `pool.ready()` is the wrong place to fix that — it is per-pod storage
 * reachability, and a config error will never self-heal, so a pod that flaps
 * Ready is worse than one that refuses to start. This mirrors the existing
 * FDPM_MCP_ALLOWED_HOSTS decision: refusing to boot is clearer than a server
 * that fails every call for a reason the operator cannot see.
 */
describe("resolveRequiredPlugins", () => {
  it("is empty when unset, so existing deployments are unaffected", () => {
    expect(resolveRequiredPlugins({})).toEqual([]);
    expect(resolveRequiredPlugins({ FDPM_MCP_REQUIRED_PLUGINS: "" })).toEqual([]);
  });

  it("parses a comma-separated list and trims blanks", () => {
    expect(
      resolveRequiredPlugins({ FDPM_MCP_REQUIRED_PLUGINS: " fdpm.media , acme.deck ,, " }),
    ).toEqual(["fdpm.media", "acme.deck"]);
  });
});

describe("assertRequiredPluginsActive", () => {
  const active = { id: "fdpm.media", state: "active", trust: "verified" } as const;
  const disabled = { id: "fdpm.media", state: "disabled", trust: "community" } as const;

  it("passes when every required plugin is active", () => {
    expect(() => assertRequiredPluginsActive(["fdpm.media"], [active])).not.toThrow();
  });

  it("passes when nothing is required", () => {
    expect(() => assertRequiredPluginsActive([], [disabled])).not.toThrow();
  });

  it("refuses a required plugin that was discovered but left disabled", () => {
    let caught: unknown;
    try {
      assertRequiredPluginsActive(["fdpm.media"], [disabled]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FDPMException);
    const ex = caught as FDPMException;
    // The message must name the trust tier, because a mismatched
    // FDPM_TRUSTED_KEYS is the failure this exists to catch.
    expect(String(ex.message)).toContain("fdpm.media");
    expect(JSON.stringify(ex)).toContain("community");
  });

  it("refuses a required plugin that was never discovered at all", () => {
    expect(() => assertRequiredPluginsActive(["fdpm.media"], [])).toThrow(FDPMException);
  });
});
