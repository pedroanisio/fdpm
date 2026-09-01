/**
 * MCP session lifecycle over Streamable HTTP.
 *
 * The SDK's `Server` is stateful per connection, so one MCP session owns
 * one `Server`, one `StreamableHTTPServerTransport` and one `McpSession`
 * (the existing token bucket / freshness map / idempotency cache). The
 * map from `Mcp-Session-Id` to that triple lives here.
 *
 * Two invariants this module is responsible for:
 *
 *   1. A session's tenant is fixed at creation from the verified token
 *      and is never re-read from a later request. A token swap mid-session
 *      cannot move a session to another tenant's Host.
 *   2. A session pins its tenant's Host for its whole life, so the pool
 *      sweeper cannot dispose a projection that is being dispatched
 *      against.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { Host } from "../core/host.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { createSession } from "../mcp/session.js";
import type { DispatchCtx } from "../mcp/types.js";
import { toPrincipal, type Principal, type PrincipalOptions } from "./principal.js";
import type { HostPool } from "./host-pool.js";

export interface SessionEntry {
  readonly id: string;
  readonly principal: Principal;
  readonly host: Host;
  readonly server: Server;
  readonly transport: StreamableHTTPServerTransport;
  lastSeen: number;
}

export interface SessionManagerOptions {
  readonly pool: HostPool<Host>;
  readonly principalOptions: PrincipalOptions;
  /** Builds the MCP server for a freshly created session. */
  readonly buildServer: (host: Host, ctx: DispatchCtx, principal: Principal) => Server;
  /** Per-session call budget. */
  readonly maxCallsPerMinute: number;
  /** Idle time after which a session is closed. */
  readonly idleMs: number;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
  /** Streamable HTTP SSE keep-alive. Defaults to 15 s. */
  readonly keepAliveMs?: number;
  readonly maxSessions?: number;
}

export interface SessionManager {
  handle(
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    body: unknown,
  ): Promise<void>;
  size(): number;
  /** Close sessions idle since before `now - idleMs`. Returns the count. */
  sweep(now: number): number;
  dispose(): Promise<void>;
}

/** JSON-RPC `initialize` is the only method allowed to create a session. */
function isInitialize(body: unknown): boolean {
  const one = (m: unknown): boolean =>
    typeof m === "object" && m !== null && (m as { method?: unknown }).method === "initialize";
  return Array.isArray(body) ? body.some(one) : one(body);
}

export function createSessionManager(opts: SessionManagerOptions): SessionManager {
  const sessions = new Map<string, SessionEntry>();
  const maxSessions = opts.maxSessions ?? 1_000;

  async function closeEntry(entry: SessionEntry): Promise<void> {
    sessions.delete(entry.id);
    opts.pool.unpin(entry.principal.tenant);
    try {
      await entry.transport.close();
    } catch {
      /* a transport that will not close must not block the sweep */
    }
    try {
      await entry.server.close();
    } catch {
      /* likewise */
    }
  }

  async function create(
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    if (sessions.size >= maxSessions) {
      throw new FDPMException("quota", "server is at its session capacity", {
        evidence: { reason: "session_capacity", max_sessions: maxSessions },
      });
    }

    // The principal — and therefore the tenant — is fixed here, once,
    // from the verified token.
    const principal = toPrincipal(req.auth!, opts.principalOptions);
    const host = await opts.pool.acquire(principal.tenant);
    opts.pool.pin(principal.tenant);

    const ctx: DispatchCtx = {
      session: createSession({ maxPerMinute: opts.maxCallsPerMinute }),
      // Destructive tools require the admin scope; the operator's
      // process-wide switch is no longer the only gate.
      enableDestructive: principal.scopes.includes("fdpm.admin"),
      enabledPlugins: new Set<string>(),
      auditFullArgs: false,
      hostOptions: { dataDir: host.persistence?.dataDir ?? null, noPlugins: false },
      principal,
    };

    const server = opts.buildServer(host, ctx, principal);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      ...(opts.allowedHosts !== undefined && { allowedHosts: [...opts.allowedHosts] }),
      ...(opts.allowedOrigins !== undefined && { allowedOrigins: [...opts.allowedOrigins] }),
      keepAliveMs: opts.keepAliveMs ?? 15_000,
      onsessioninitialized: (id: string) => {
        sessions.set(id, { id, principal, host, server, transport, lastSeen: Date.now() });
      },
      onsessionclosed: (id: string) => {
        const entry = sessions.get(id);
        if (entry) void closeEntry(entry);
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id === undefined) {
        // Never initialized: release the pin taken above so a failed
        // handshake cannot leak a pooled Host.
        opts.pool.unpin(principal.tenant);
        return;
      }
      const entry = sessions.get(id);
      if (entry) void closeEntry(entry);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  return {
    async handle(req, res, body): Promise<void> {
      const header = req.headers["mcp-session-id"];
      const sid = Array.isArray(header) ? header[0] : header;

      if (sid === undefined) {
        if (!isInitialize(body)) {
          throw new FDPMException(
            "validation",
            "a non-initialize request must carry an Mcp-Session-Id header",
            { evidence: { reason: "missing_session_id" } },
          );
        }
        return create(req, res, body);
      }

      const entry = sessions.get(sid);
      if (entry === undefined) {
        // 404 is what the Streamable HTTP spec prescribes for an unknown
        // or expired session; the client re-initializes.
        throw new FDPMException("not_found", "unknown or expired MCP session", {
          evidence: { reason: "unknown_session" },
        });
      }

      // A session belongs to the principal that created it. Re-deriving
      // the tenant from the current token and comparing closes the
      // session-fixation hole where a token for tenant B is presented
      // against a session opened for tenant A.
      const current = toPrincipal(req.auth!, opts.principalOptions);
      if (current.tenant !== entry.principal.tenant) {
        throw new FDPMException("permission", "token does not match this session's tenant", {
          evidence: { reason: "session_tenant_mismatch" },
        });
      }

      entry.lastSeen = Date.now();
      await entry.transport.handleRequest(req, res, body);
    },

    size(): number {
      return sessions.size;
    },

    sweep(now: number): number {
      let closed = 0;
      for (const entry of [...sessions.values()]) {
        if (now - entry.lastSeen <= opts.idleMs) continue;
        void closeEntry(entry);
        closed += 1;
      }
      return closed;
    },

    async dispose(): Promise<void> {
      await Promise.all([...sessions.values()].map((e) => closeEntry(e)));
      sessions.clear();
    },
  };
}
