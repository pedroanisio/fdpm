/**
 * The public HTTP surface: routing, origin validation, and the OAuth
 * discovery handshake. Everything MCP-shaped is delegated to `handleMcp`,
 * so this module stays testable without a live MCP session and the MCP
 * core stays unaware that it is being served over a network.
 *
 * The 401 handshake is the load-bearing detail. Claude will not honour a
 * `WWW-Authenticate` header on a 200 response, so an unauthenticated call
 * MUST be answered 401 with a `resource_metadata` pointer or the server
 * is undiscoverable — the connection fails with a message about not
 * reaching the server, which sends operators hunting in the wrong place.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { FDPMException, type ErrorEnvelope } from "../core/errors/fdpm-exception.js";
import type { TokenVerifier } from "./token-verifier.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/** Bytes accepted on a single request body before refusing with 413. */
export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

export const PRM_PATH = "/.well-known/oauth-protected-resource";

/**
 * Expand a Host allow-list so a bare hostname also matches the form a
 * client actually sends on a non-default port.
 *
 * The SDK's DNS-rebinding check compares the `Host` header verbatim, and
 * a client sends `host:port` whenever the port is not the scheme default.
 * Behind TLS on 443 the header is bare, so production configuration is
 * unaffected; locally, an operator who wrote `127.0.0.1` would otherwise
 * get a 403 with no indication that a port was the reason.
 */
export function expandAllowedHosts(
  hosts: readonly string[],
  port: number,
): string[] {
  const out: string[] = [];
  for (const host of hosts) {
    if (!out.includes(host)) out.push(host);
    if (host.includes(":")) continue;
    const withPort = `${host}:${port}`;
    if (!out.includes(withPort)) out.push(withPort);
  }
  return out;
}

export interface HttpHandlerOptions {
  /** The exact URL users type into the connector dialog, path included. */
  readonly publicUrl: string;
  /** Authorization server issuer. First entry of `authorization_servers`. */
  readonly issuer: string;
  readonly allowedOrigins: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly scopesSupported: readonly string[];
  readonly verifier: TokenVerifier;
  readonly ready: () => boolean;
  readonly handleMcp: (
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    body: unknown,
  ) => Promise<void>;
  readonly maxBodyBytes?: number;
  /** Path the MCP endpoint is served at. Defaults to the publicUrl's path. */
  readonly mcpPath?: string;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, envelope: ErrorEnvelope): void {
  sendJson(res, status, { error: envelope });
}

function statusForCategory(category: string): number {
  switch (category) {
    case "unauthenticated":
      return 401;
    case "permission":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "quota":
      return 429;
    case "validation":
    case "verification":
      return 400;
    default:
      return 500;
  }
}

export function createHttpHandler(opts: HttpHandlerOptions): Handler {
  const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const mcpPath = opts.mcpPath ?? new URL(opts.publicUrl).pathname;
  const prmUrl = `${new URL(opts.publicUrl).origin}${PRM_PATH}`;
  const allowedOrigins = new Set(opts.allowedOrigins);

  /** RFC 9728 document. Served unauthenticated, by definition. */
  const prmDocument = {
    resource: opts.publicUrl,
    authorization_servers: [opts.issuer],
    scopes_supported: [...opts.scopesSupported],
    bearer_methods_supported: ["header"],
  };

  // A space-delimited scope list, per RFC 6750. Claude reads this in
  // preference to the metadata's scopes_supported, which is what makes
  // "advertise the minimum, elevate on challenge" actually work.
  const challengeScope = opts.scopesSupported.join(" ");

  function challenge(res: ServerResponse, message: string, reason: string): void {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${prmUrl}", scope="${challengeScope}"`,
    );
    sendError(res, 401, { category: "unauthenticated", message, evidence: { reason } });
  }

  /**
   * Origin checking. A request with no `Origin` is a native client
   * (Claude Code, curl, a server-side agent) and is allowed through —
   * the header is a browser artifact, and its absence is not evidence of
   * anything. A request that DOES declare an origin must declare an
   * allowed one; that is what stops a hostile page in a user's browser
   * from driving this server with their cookies.
   */
  function originAllowed(origin: string | undefined): boolean {
    if (origin === undefined) return true;
    return allowedOrigins.has(origin);
  }

  function applyCors(res: ServerResponse, origin: string | undefined): void {
    if (origin === undefined || !allowedOrigins.has(origin)) return;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "false");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    // Browser clients cannot read the session id without this.
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, www-authenticate");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(declared) && declared > limit) {
      throw new FDPMException("quota", "request body exceeds the configured limit", {
        evidence: { reason: "body_too_large", limit_bytes: limit, declared_bytes: declared },
      });
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > limit) {
        throw new FDPMException("quota", "request body exceeds the configured limit", {
          evidence: { reason: "body_too_large", limit_bytes: limit },
        });
      }
      chunks.push(buf);
    }
    if (total === 0) return undefined;
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      throw new FDPMException("validation", "request body was not valid JSON", {
        evidence: { reason: "malformed_json" },
      });
    }
  }

  return function handler(req: IncomingMessage, res: ServerResponse): void {
    void (async () => {
      // Node sets no banner by default; this guards against a proxy or
      // framework adding one later.
      res.removeHeader?.("X-Powered-By");

      const origin = req.headers.origin;
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      // ---- probes: never authenticated, never CORS-gated ----------
      if (req.method === "GET" && path === "/healthz") {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "GET" && path === "/readyz") {
        const ok = opts.ready();
        return sendJson(res, ok ? 200 : 503, { ok });
      }

      // ---- OAuth protected resource metadata (RFC 9728) -----------
      // Both the bare path and the path-suffixed probe form Claude
      // falls back to when a 401 carries no pointer.
      if (req.method === "GET" && (path === PRM_PATH || path.startsWith(`${PRM_PATH}/`))) {
        applyCors(res, origin);
        return sendJson(res, 200, prmDocument);
      }

      // ---- CORS preflight -----------------------------------------
      if (req.method === "OPTIONS") {
        if (!originAllowed(origin)) {
          return sendError(res, 403, {
            category: "permission",
            message: "origin is not allowed",
            evidence: { reason: "origin_not_allowed" },
          });
        }
        applyCors(res, origin);
        res.writeHead(204);
        return res.end();
      }

      // ---- the MCP endpoint ---------------------------------------
      if (path === mcpPath) {
        if (!originAllowed(origin)) {
          return sendError(res, 403, {
            category: "permission",
            message: "origin is not allowed",
            evidence: { reason: "origin_not_allowed" },
          });
        }
        applyCors(res, origin);

        const authz = req.headers.authorization;
        if (typeof authz !== "string" || !/^Bearer\s+/i.test(authz)) {
          // Covers a missing header, a bare token without the scheme,
          // and a token smuggled into the query string — the query
          // string is never consulted, so it can never authenticate.
          return challenge(res, "authentication required", "missing_bearer_token");
        }
        const token = authz.replace(/^Bearer\s+/i, "").trim();

        let auth: AuthInfo;
        try {
          auth = await opts.verifier.verify(token);
        } catch (err) {
          const message = err instanceof Error ? err.message : "token verification failed";
          const reason =
            err instanceof FDPMException
              ? String(err.evidence?.["reason"] ?? "invalid_token")
              : "invalid_token";
          return challenge(res, message, reason);
        }

        let body: unknown;
        try {
          body = await readBody(req, maxBody);
        } catch (err) {
          if (err instanceof FDPMException) {
            const status = err.evidence?.["reason"] === "body_too_large" ? 413 : 400;
            return sendError(res, status, {
              category: err.category,
              message: err.message,
              ...(err.evidence !== undefined && { evidence: err.evidence }),
            });
          }
          throw err;
        }

        const withAuth = req as IncomingMessage & { auth?: AuthInfo };
        withAuth.auth = auth;
        return opts.handleMcp(withAuth, res, body);
      }

      sendError(res, 404, {
        category: "not_found",
        message: `no route for ${req.method ?? "GET"} ${path}`,
        evidence: { reason: "unknown_route" },
      });
    })().catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof FDPMException) {
        return sendError(res, statusForCategory(err.category), {
          category: err.category,
          message: err.message,
          ...(err.evidence !== undefined && { evidence: err.evidence }),
        });
      }
      // Never leak an internal message or stack to a network caller.
      sendError(res, 500, {
        category: "internal",
        message: "internal error",
        evidence: { reason: "unhandled" },
      });
    });
  };
}
