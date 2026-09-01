#!/usr/bin/env node
/**
 * `fdpm-mcp-http` — the remote MCP server.
 *
 * Same Host, same dispatcher, same tools as `fdpm-mcp`; the difference
 * is the transport (Streamable HTTP instead of stdio) and the fact that
 * callers are authenticated and tenant-scoped rather than implicitly
 * trusted.
 *
 * Unlike the stdio binary there is no protocol stream on stdout, so
 * logging goes to stdout as JSON lines — the shape a container log
 * collector expects.
 */

import { createServer } from "node:http";
import { Host } from "../core/host.js";
import { loadDotenv } from "../core/config/dotenv.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { MCP_TOOL_MANIFEST_VERSION } from "../mcp/schemas.js";
import { advertisedCatalog, buildCatalogReport, resolveCatalogBudget } from "../mcp/catalog.js";
import { buildMcpServer } from "../mcp/build-server.js";
import { createDispatcher } from "../mcp/dispatch.js";
import { createReadGuard, resolveMaxResourceBytes } from "../mcp/read-guard.js";
import { McpAuditLog } from "../persistence/mcp-audit-log.js";
import { createHostPool } from "../http/host-pool.js";
import { createHttpHandler, expandAllowedHosts } from "../http/handler.js";
import { createSessionManager } from "../http/session-manager.js";
import { ALL_SCOPES } from "../http/principal.js";
import { resolveAdvertisedScopes, resolveBindHost } from "../http/config.js";
import {
  createIntrospectionVerifier,
  createStaticTokenVerifier,
  type TokenVerifier,
} from "../http/token-verifier.js";

function log(level: string, msg: string, extra: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n",
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new FDPMException("verification", `${name} is required`, {
      evidence: { reason: "missing_env", env: name },
    });
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new FDPMException("verification", `${name} must be a positive integer, got ${raw}`, {
      evidence: { reason: "invalid_env", env: name },
    });
  }
  return n;
}

function listEnv(name: string): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function buildVerifier(): TokenVerifier {
  const mode = process.env["FDPM_MCP_AUTH_MODE"] ?? "introspection";
  if (mode === "static") {
    return createStaticTokenVerifier({
      token: required("FDPM_MCP_STATIC_TOKEN"),
      tenant: process.env["FDPM_MCP_SINGLE_TENANT"] ?? "default",
      scopes: listEnv("FDPM_MCP_STATIC_SCOPES").length
        ? listEnv("FDPM_MCP_STATIC_SCOPES")
        : [...ALL_SCOPES],
    });
  }
  if (mode === "introspection") {
    return createIntrospectionVerifier({
      introspectionUrl: required("FDPM_MCP_INTROSPECTION_URL"),
      clientId: required("FDPM_MCP_CLIENT_ID"),
      clientSecret: required("FDPM_MCP_CLIENT_SECRET"),
      tenantClaim: process.env["FDPM_MCP_TENANT_CLAIM"] ?? "tenant",
      resource: required("FDPM_MCP_PUBLIC_URL"),
      issuer: required("FDPM_MCP_OAUTH_ISSUER"),
      // Keycloak emits the resource CLIENT ID as `aud`, not a URL.
      ...(process.env["FDPM_MCP_EXPECTED_AUDIENCE"] !== undefined && {
        audience: process.env["FDPM_MCP_EXPECTED_AUDIENCE"],
      }),
    });
  }
  throw new FDPMException(
    "verification",
    `FDPM_MCP_AUTH_MODE must be "introspection" or "static", got ${JSON.stringify(mode)}`,
    { evidence: { reason: "invalid_env", env: "FDPM_MCP_AUTH_MODE" } },
  );
}

async function main(): Promise<void> {
  loadDotenv();

  const publicUrl = required("FDPM_MCP_PUBLIC_URL");
  const issuer = required("FDPM_MCP_OAUTH_ISSUER");
  const rootDir = process.env["FDPM_DATA_DIR"] ?? "/data";
  const port = intEnv("FDPM_MCP_HTTP_PORT", 8080);
  // Loopback unless the operator opts out; the Dockerfile sets 0.0.0.0.
  const bindHost = resolveBindHost(process.env);
  const advertisedScopes = resolveAdvertisedScopes(process.env);
  const singleTenant = process.env["FDPM_MCP_SINGLE_TENANT"];

  const allowedOrigins = listEnv("FDPM_MCP_ALLOWED_ORIGINS");
  const allowedHosts = listEnv("FDPM_MCP_ALLOWED_HOSTS");
  if (allowedHosts.length === 0) {
    // DNS-rebinding protection with an empty allow-list would refuse
    // everything; refusing to start is clearer than a server that 403s
    // every call for reasons the operator cannot see.
    throw new FDPMException("verification", "FDPM_MCP_ALLOWED_HOSTS must list at least one host", {
      evidence: { reason: "missing_env", env: "FDPM_MCP_ALLOWED_HOSTS" },
    });
  }

  // The SDK matches the Host header verbatim; admit the listen-port form
  // too so a bare hostname works on a non-default port.
  const effectiveAllowedHosts = expandAllowedHosts(allowedHosts, port);

  const verifier = buildVerifier();
  const enableDestructive = process.env["FDPM_MCP_ENABLE_DESTRUCTIVE"] === "1";
  const advertised = advertisedCatalog({ enableDestructive });
  const catalog = buildCatalogReport(advertised, resolveCatalogBudget(process.env));
  if (!catalog.ok) {
    throw new FDPMException("verification", "tool catalog exceeds its byte budget", {
      evidence: { reason: "catalog_over_budget", violations: catalog.violations },
    });
  }

  const maxResourceBytes = resolveMaxResourceBytes(process.env);
  const auditLog = new McpAuditLog(rootDir);

  const pool = createHostPool<Host>({
    rootDir,
    maxHosts: intEnv("FDPM_MCP_MAX_TENANT_HOSTS", 32),
    idleMs: intEnv("FDPM_MCP_HOST_IDLE_SECONDS", 900) * 1000,
    factory: async (dataDir, tenant) => {
      const started = Date.now();
      const host = new Host({ dataDir });
      await host.load();
      // Report what the Host actually came up with. A plugin whose manifest
      // cannot be read is turned into a non-fatal warning several layers
      // down, so without this the server announces a healthy boot while
      // holding no domain vocabulary at all — the failure that cost a
      // debugging session on 2026-09-01.
      const profiles = host.profiles.listRaw().map((p) => p.id);
      const level = profiles.length <= 1 ? "warn" : "info";
      log(level, "tenant host loaded", {
        tenant,
        ms: Date.now() - started,
        profiles: profiles.length,
        profile_ids: profiles,
        ...(profiles.length <= 1 && {
          hint: "only the built-in empty profile is registered; plugin discovery probably failed (check read permissions under dist/plugins)",
        }),
      });
      return host;
    },
  });

  const sessions = createSessionManager({
    pool,
    principalOptions: {
      tenantClaim: process.env["FDPM_MCP_TENANT_CLAIM"] ?? "tenant",
      ...(singleTenant !== undefined && { singleTenant }),
    },
    maxCallsPerMinute: intEnv("FDPM_MCP_MAX_CALLS_PER_MINUTE", 120),
    idleMs: intEnv("FDPM_MCP_SESSION_IDLE_SECONDS", 1800) * 1000,
    maxSessions: intEnv("FDPM_MCP_MAX_SESSIONS", 1000),
    allowedHosts: effectiveAllowedHosts,
    allowedOrigins,
    keepAliveMs: intEnv("FDPM_MCP_KEEPALIVE_SECONDS", 15) * 1000,
    buildServer: (host, ctx) =>
      buildMcpServer({
        host,
        dispatcher: createDispatcher(host, ctx, auditLog),
        readGuard: createReadGuard({
          host,
          session: ctx.session,
          audit: auditLog,
          maxResourceBytes,
        }),
        advertised,
        catalog,
      } as never),
  });

  const handler = createHttpHandler({
    publicUrl,
    issuer,
    allowedOrigins,
    allowedHosts: effectiveAllowedHosts,
    scopesSupported: advertisedScopes,
    verifier,
    ready: () => pool.ready(),
    handleMcp: (req, res, body) => sessions.handle(req, res, body),
  });

  const server = createServer(handler);

  // Idle sweep for both sessions and pooled Hosts.
  const sweepMs = intEnv("FDPM_MCP_SWEEP_SECONDS", 60) * 1000;
  const sweeper = setInterval(() => {
    const now = Date.now();
    const closed = sessions.sweep(now);
    const evicted = pool.sweep(now);
    if (closed > 0 || evicted > 0) {
      log("info", "idle sweep", { sessions_closed: closed, hosts_evicted: evicted });
    }
  }, sweepMs);
  sweeper.unref();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", "draining", { signal });
    clearInterval(sweeper);
    server.close(() => {
      void (async () => {
        await sessions.dispose();
        await pool.dispose();
        process.exit(0);
      })();
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await new Promise<void>((resolve) => server.listen(port, bindHost, resolve));
  log("info", "fdpm-mcp-http ready", {
    port,
    host: bindHost,
    public_url: publicUrl,
    version: HOST_VERSION,
    manifest_version: MCP_TOOL_MANIFEST_VERSION,
    tools: advertised.length,
    catalog_bytes: catalog.measurement.total_bytes,
    destructive_enabled: enableDestructive,
    tenancy: singleTenant !== undefined ? `single:${singleTenant}` : "multi",
    advertised_scopes: advertisedScopes,
  });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log("fatal", msg);
  process.exit(70);
});
