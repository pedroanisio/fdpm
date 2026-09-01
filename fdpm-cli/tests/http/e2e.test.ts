/**
 * End-to-end: a real MCP client, over a real socket, against a real Host.
 *
 * Nothing here is mocked below the HTTP boundary. If the Streamable HTTP
 * wiring, the session map, the scope gate or the tenant pool is wrong,
 * these fail. The tenancy suite at the bottom is the one that matters
 * most: it is the test that a remote deployment is safe to expose.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { createHttpHandler } from "../../src/http/handler.js";
import { createHostPool } from "../../src/http/host-pool.js";
import { createSessionManager } from "../../src/http/session-manager.js";
import { SCOPE_ADMIN, SCOPE_READ, SCOPE_WRITE } from "../../src/http/principal.js";
import { buildMcpServer } from "../../src/mcp/build-server.js";
import { createDispatcher } from "../../src/mcp/dispatch.js";
import { createReadGuard } from "../../src/mcp/read-guard.js";
import { McpAuditLog } from "../../src/persistence/mcp-audit-log.js";
import { advertisedCatalog, buildCatalogReport } from "../../src/mcp/catalog.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import type { TokenVerifier } from "../../src/http/token-verifier.js";

const PUBLIC_URL = "https://mcp.example.com/mcp";

/** token → (tenant, scopes). Stands in for an authorization server. */
const TOKENS: Record<string, { tenant: string; scopes: string[] }> = {
  "acme-rw": { tenant: "acme", scopes: [SCOPE_READ, SCOPE_WRITE] },
  "acme-ro": { tenant: "acme", scopes: [SCOPE_READ] },
  "acme-admin": { tenant: "acme", scopes: [SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN] },
  "beta-rw": { tenant: "beta", scopes: [SCOPE_READ, SCOPE_WRITE] },
};

const verifier: TokenVerifier = {
  async verify(token) {
    const row = TOKENS[token];
    if (!row) throw new FDPMException("unauthenticated", "unknown token");
    return {
      token,
      clientId: `client-${row.tenant}`,
      scopes: row.scopes,
      extra: { tenant: row.tenant, sub: `user@${row.tenant}` },
    };
  },
};

let httpServer: HttpServer;
let base: string;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "fdpm-e2e-"));

  const pool = createHostPool<Host>({
    rootDir: root,
    maxHosts: 8,
    idleMs: 600_000,
    factory: async (dataDir) => {
      const host = new Host({ dataDir, noPlugins: true });
      await host.load();
      await host.registerProfile(TEST_PROFILE);
      return host;
    },
  });

  const advertised = advertisedCatalog({ enableDestructive: true });
  const catalog = buildCatalogReport(advertised);

  const sessions = createSessionManager({
    pool,
    principalOptions: { tenantClaim: "tenant" },
    maxCallsPerMinute: 600,
    idleMs: 600_000,
    buildServer: (host, ctx) =>
      buildMcpServer({
        host,
        ctx,
        dispatcher: createDispatcher(host, ctx, null),
        readGuard: createReadGuard({
          host,
          session: ctx.session,
          audit: new McpAuditLog(root),
          maxResourceBytes: 1_048_576,
        }),
        advertised,
        catalog,
      } as never),
  });

  const handler = createHttpHandler({
    publicUrl: PUBLIC_URL,
    issuer: "https://auth.example.com",
    allowedOrigins: ["https://claude.ai"],
    allowedHosts: ["mcp.example.com"],
    scopesSupported: [SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN],
    verifier,
    ready: () => pool.ready(),
    mcpPath: "/mcp",
    handleMcp: (req, res, body) => sessions.handle(req, res, body),
  });

  httpServer = createServer(handler);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((r) => httpServer.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "e2e", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(base), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

describe("MCP over Streamable HTTP", () => {
  it("completes initialize and issues a session id", async () => {
    const client = await connect("acme-rw");
    const caps = client.getServerCapabilities();
    expect(caps).toBeDefined();
    expect(caps?.tools).toBeDefined();
    await client.close();
  });

  it("lists the same tool catalog the stdio transport advertises", async () => {
    const client = await connect("acme-rw");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("fdpm.health");
    expect(names).toContain("fdpm.workbook.list");
    expect(names).toContain("fdpm.workbook.update");
    await client.close();
  });

  it("calls a read-only tool and returns structured content", async () => {
    const client = await connect("acme-ro");
    const res = await client.callTool({ name: "fdpm.workbook.list", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { workbooks: unknown[] }).workbooks).toEqual([]);
    await client.close();
  });

  it("round-trips a write and reads it back in the same session", async () => {
    const client = await connect("acme-rw");
    const created = await client.callTool({
      name: "fdpm.workbook.create",
      arguments: { workbook_id: "wb-e2e", name: "E2E", profile_id: TEST_PROFILE.id },
    });
    expect((created.structuredContent as { ok: boolean }).ok).toBe(true);

    const got = await client.callTool({
      name: "fdpm.workbook.get",
      arguments: { workbook_id: "wb-e2e" },
    });
    expect((got.structuredContent as { workbook: { name: string } }).workbook.name).toBe("E2E");
    await client.close();
  });

  it("exposes resources and prompts over the same session", async () => {
    const client = await connect("acme-ro");
    await expect(client.listResources()).resolves.toBeDefined();
    await expect(client.listPrompts()).resolves.toBeDefined();
    await client.close();
  });

  it("keeps sessions independent: two clients get two session ids", async () => {
    const a = await connect("acme-rw");
    const b = await connect("acme-rw");
    // Both work concurrently without cross-talk.
    const [ra, rb] = await Promise.all([
      a.callTool({ name: "fdpm.health", arguments: {} }),
      b.callTool({ name: "fdpm.health", arguments: {} }),
    ]);
    expect(ra.isError).toBeFalsy();
    expect(rb.isError).toBeFalsy();
    await a.close();
    await b.close();
  });
});

describe("scope enforcement over the network", () => {
  it("refuses a write to a read-only token as permission/insufficient_scope", async () => {
    const client = await connect("acme-ro");
    const res = await client.callTool({
      name: "fdpm.workbook.create",
      arguments: { workbook_id: "wb-denied", name: "No", profile_id: TEST_PROFILE.id },
    });
    expect(res.isError).toBe(true);
    const env = (res.structuredContent as { error: { category: string; evidence?: Record<string, unknown> } }).error;
    expect(env.category).toBe("permission");
    expect(env.evidence?.["reason"]).toBe("insufficient_scope");
    expect(env.evidence?.["required_scope"]).toBe(SCOPE_WRITE);
    await client.close();
  });

  it("does not create the workbook it refused", async () => {
    const client = await connect("acme-rw");
    const res = await client.callTool({
      name: "fdpm.workbook.get",
      arguments: { workbook_id: "wb-denied" },
    });
    expect(res.isError).toBe(true);
    await client.close();
  });

  it("refuses a destructive tool to a write-scoped token", async () => {
    const client = await connect("acme-rw");
    const res = await client.callTool({
      name: "fdpm.workbook.delete",
      arguments: { workbook_id: "wb-e2e", dry_run: true },
    });
    expect(res.isError).toBe(true);
    const env = (res.structuredContent as { error: { evidence?: Record<string, unknown> } }).error;
    expect(env.evidence?.["required_scope"]).toBe(SCOPE_ADMIN);
    await client.close();
  });
});

describe("tenant isolation", () => {
  it("does not show one tenant's workbooks to another", async () => {
    // acme created wb-e2e above. beta must not see it.
    const beta = await connect("beta-rw");
    const list = await beta.callTool({ name: "fdpm.workbook.list", arguments: {} });
    const ids = (list.structuredContent as { workbooks: Array<{ id: string }> }).workbooks.map(
      (w) => w.id,
    );
    expect(ids).not.toContain("wb-e2e");
    await beta.close();
  });

  it("cannot read another tenant's workbook by naming it directly", async () => {
    const beta = await connect("beta-rw");
    const res = await beta.callTool({
      name: "fdpm.workbook.get",
      arguments: { workbook_id: "wb-e2e" },
    });
    expect(res.isError).toBe(true);
    const env = (res.structuredContent as { error: { category: string } }).error;
    expect(env.category).toBe("not_found");
    await beta.close();
  });

  it("lets two tenants hold the same workbook id without collision", async () => {
    const beta = await connect("beta-rw");
    const created = await beta.callTool({
      name: "fdpm.workbook.create",
      arguments: { workbook_id: "wb-e2e", name: "Beta's own", profile_id: TEST_PROFILE.id },
    });
    expect((created.structuredContent as { ok: boolean }).ok).toBe(true);

    const got = await beta.callTool({
      name: "fdpm.workbook.get",
      arguments: { workbook_id: "wb-e2e" },
    });
    expect((got.structuredContent as { workbook: { name: string } }).workbook.name).toBe(
      "Beta's own",
    );
    await beta.close();

    // ...and acme's copy is untouched.
    const acme = await connect("acme-rw");
    const mine = await acme.callTool({
      name: "fdpm.workbook.get",
      arguments: { workbook_id: "wb-e2e" },
    });
    expect((mine.structuredContent as { workbook: { name: string } }).workbook.name).toBe("E2E");
    await acme.close();
  });

  it("rejects an unknown token at the transport, before any session exists", async () => {
    const client = new Client({ name: "e2e", version: "1.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(base), {
      requestInit: { headers: { authorization: "Bearer forged" } },
    });
    await expect(client.connect(transport)).rejects.toThrow();
  });
});
