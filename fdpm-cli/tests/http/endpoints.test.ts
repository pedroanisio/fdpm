/**
 * The public HTTP surface, exercised over a real socket.
 *
 * These are the assertions a vendor's connector infrastructure makes on
 * first contact. The 401 handshake in particular is load-bearing: Claude
 * will not honour a `WWW-Authenticate` header on a 200, so a server that
 * answers an unauthenticated call with anything but 401 is undiscoverable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { createHttpHandler } from "../../src/http/handler.js";
import { SCOPE_READ, SCOPE_WRITE } from "../../src/http/principal.js";
import type { TokenVerifier } from "../../src/http/token-verifier.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";

const PUBLIC_URL = "https://mcp.example.com/mcp";
const ISSUER = "https://auth.example.com";

const verifier: TokenVerifier = {
  async verify(token: string) {
    if (token !== "good-token") {
      throw new FDPMException("unauthenticated", "invalid token");
    }
    return {
      token,
      clientId: "client-1",
      scopes: [SCOPE_READ, SCOPE_WRITE],
      extra: { tenant: "acme" },
    };
  },
};

let server: Server;
let base: string;
let poolReady = true;

beforeAll(async () => {
  const handler = createHttpHandler({
    publicUrl: PUBLIC_URL,
    issuer: ISSUER,
    allowedOrigins: ["https://claude.ai", "https://chatgpt.com"],
    allowedHosts: ["mcp.example.com"],
    scopesSupported: [SCOPE_READ, SCOPE_WRITE],
    verifier,
    ready: () => poolReady,
    // Small on purpose: `fetch` computes its own content-length, so the
    // only honest way to exercise the limit is to send a real body that
    // exceeds it.
    maxBodyBytes: 1024,
    // The MCP leg is exercised in transport.test.ts; here we only assert
    // that an authenticated request is admitted past the gate.
    handleMcp: async (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ admitted: true }));
    },
  });
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("probe endpoints", () => {
  it("serves /healthz without a token", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("serves /readyz as 200 when ready and 503 when not", async () => {
    poolReady = true;
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
    poolReady = false;
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false });
    poolReady = true;
  });

  it("never requires authentication for probes", async () => {
    // A probe that 401s takes the pod out of service permanently.
    for (const path of ["/healthz", "/readyz"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).not.toBe(401);
    }
  });
});

describe("protected resource metadata (RFC 9728)", () => {
  it("advertises the exact connector URL as `resource`", async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Claude compares this to the URL the user typed, path included.
    expect(body["resource"]).toBe(PUBLIC_URL);
    expect(body["authorization_servers"]).toEqual([ISSUER]);
    expect(body["scopes_supported"]).toEqual([SCOPE_READ, SCOPE_WRITE]);
    expect(body["bearer_methods_supported"]).toEqual(["header"]);
  });

  it("is served without a token", async () => {
    expect((await fetch(`${base}/.well-known/oauth-protected-resource`)).status).toBe(200);
  });

  it("also answers the path-suffixed probe form", async () => {
    // Claude falls back to /.well-known/oauth-protected-resource/<path>
    // when the 401 carries no pointer.
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>)["resource"]).toBe(PUBLIC_URL);
  });
});

describe("the 401 handshake", () => {
  it("answers an unauthenticated MCP call with 401 and a resource_metadata pointer", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    const hdr = res.headers.get("www-authenticate") ?? "";
    expect(hdr).toMatch(/^Bearer /);
    expect(hdr).toContain('resource_metadata="');
    expect(hdr).toContain("/.well-known/oauth-protected-resource");
  });

  it("rejects a bad token with 401, not 403", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer nope" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("ignores a token supplied in the query string", async () => {
    // The MCP authorization spec prohibits access tokens in the URI.
    const res = await fetch(`${base}/mcp?access_token=good-token`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("requires the Bearer scheme", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "good-token" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("admits a valid bearer token", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer good-token", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ admitted: true });
  });
});

describe("origin and host validation", () => {
  it("answers a CORS preflight from an allowed origin", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://claude.ai", "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    // Session id must be readable by the browser client and sendable back.
    expect((res.headers.get("access-control-expose-headers") ?? "").toLowerCase())
      .toContain("mcp-session-id");
    expect((res.headers.get("access-control-allow-headers") ?? "").toLowerCase())
      .toContain("mcp-session-id");
  });

  it("refuses a request from an origin that is not allow-listed", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { origin: "https://evil.example", authorization: "Bearer good-token" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { category: string; evidence?: Record<string, unknown> } };
    expect(body.error.category).toBe("permission");
    expect(body.error.evidence?.["reason"]).toBe("origin_not_allowed");
  });

  it("does not echo an arbitrary origin back", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });

  it("allows a same-origin request that sends no Origin header", async () => {
    // Native clients (Claude Code, curl) send no Origin.
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer good-token" },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });
});

describe("miscellaneous hardening", () => {
  it("returns a structured 404 for an unknown path", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { category: string } };
    expect(body.error.category).toBe("not_found");
  });

  it("does not leak a server banner", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("rejects an oversized body with 413", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer good-token", "content-type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(4096) }),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { evidence?: Record<string, unknown> } };
    expect(body.error.evidence?.["reason"]).toBe("body_too_large");
  });

  it("returns a structured 400 for a malformed JSON body", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer good-token", "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { category: string } };
    expect(body.error.category).toBe("validation");
  });
});

describe("the stdio binary points at the HTTP binary", () => {
  it("refuses an HTTP flag and names fdpm-mcp-http, not a deferral", async () => {
    const { execFileSync } = await import("node:child_process");
    let output = "";
    try {
      execFileSync(process.execPath, ["--import", "tsx", "src/bin/fdpm-mcp.ts", "--http-port", "8080"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { stderr?: string; status?: number };
      output = e.stderr ?? "";
      expect(e.status).toBe(2);
    }
    expect(output).toContain("stdio only");
    expect(output).toContain("fdpm-mcp-http");
    // The v0.2 deferral no longer exists; pointing at it would send an
    // operator looking for something that shipped.
    expect(output).not.toContain("v0.2");
  }, 30_000);
});

describe("the 401 challenge names the scopes to request", () => {
  it("carries a space-delimited scope parameter", async () => {
    // kc:invariant:scope-minimization — the advertised set is the floor,
    // and the challenge is how a client learns what to ask for. Claude
    // reads `scope` here in preference to scopes_supported.
    const res = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    const hdr = res.headers.get("www-authenticate") ?? "";
    expect(hdr).toContain('scope="fdpm.read fdpm.write"');
    expect(hdr).toContain('resource_metadata="');
  });
});
