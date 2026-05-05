#!/usr/bin/env node
/**
 * `fdpm-mcp` — the MCP server binary defined by SPEC-MCP-SERVER v0.1.
 *
 * Long-lived process holding one Host. Speaks the MCP protocol over
 * stdio (the only transport in v0.1; HTTP/SSE deferred to v0.2 per
 * §6.1). The advertised tool surface is a hand-curated, version-pinned
 * manifest (see `../mcp/manifest.ts`).
 *
 * Critical I/O contract: stdio is the MCP transport. The very first
 * byte written to stdout MUST be a valid MCP frame. ALL human-facing
 * output (banners, warnings, errors-during-startup) goes to
 * `process.stderr`. A stray `console.log` here would corrupt the
 * protocol stream and break every connected client.
 *
 * Lifecycle (SPEC-MCP-SERVER §15):
 *   startup → load Host → build dispatcher → wire stdio → respond to
 *   `initialize` → serve `tools/list` and `tools/call` until SIGTERM /
 *   SIGINT / EOF → drain → flush → exit 0.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { Host } from "../core/host.js";
import { defaultDataDir } from "../persistence/jsonl-log.js";
import { advertisedTools, MANIFEST } from "../mcp/manifest.js";
import { MCP_TOOL_MANIFEST_VERSION, toJsonSchema } from "../mcp/schemas.js";
import { createSession } from "../mcp/session.js";
import { createDispatcher } from "../mcp/dispatch.js";
import type { DispatchCtx } from "../mcp/types.js";
import { McpAuditLog } from "../persistence/mcp-audit-log.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";

interface ParsedFlags {
  dataDir: string;
  enableDestructive: boolean;
  enabledPlugins: string[];
  maxCallsPerMinute: number;
  auditFullArgs: boolean;
}

/**
 * Parse flags AND environment variables.
 *
 * Refusal contract (§6.1 / Acceptance §5): any HTTP transport flag
 * MUST cause the process to refuse to start with a clear pointer to
 * the v0.2 deferral. We detect this BEFORE parsing the rest, so an
 * operator who passes `--http-port 8080 --data-dir /tmp/x` still gets
 * the refusal instead of the data-dir ack.
 */
function parseArgs(argv: readonly string[]): ParsedFlags {
  const httpFlags = ["--http-port", "--http-host", "--sse"];
  const offending = httpFlags.filter((f) =>
    argv.some((a) => a === f || a.startsWith(`${f}=`)),
  );
  if (offending.length > 0) {
    process.stderr.write(
      [
        `fdpm-mcp: refusing to start — HTTP transport is not supported in v0.1.`,
        `  offending flag(s): ${offending.join(", ")}`,
        `  see SPEC-MCP-SERVER §6.1 (deferred to v0.2).`,
        ``,
      ].join("\n"),
    );
    process.exit(2);
  }

  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    const prefixed = argv.find((a) => a.startsWith(`${name}=`));
    if (prefixed !== undefined) return prefixed.slice(name.length + 1);
    return undefined;
  };
  const flag = (name: string): boolean => argv.includes(name);

  const dataDir =
    get("--data-dir") ??
    process.env["FDPM_DATA_DIR"] ??
    defaultDataDir();

  const enableDestructive =
    flag("--enable-destructive") ||
    process.env["FDPM_MCP_ENABLE_DESTRUCTIVE"] === "1";

  const pluginsRaw =
    get("--enable-plugins") ?? process.env["FDPM_MCP_ENABLE_PLUGINS"] ?? "";
  const enabledPlugins = pluginsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const maxRaw =
    get("--max-calls-per-minute") ?? process.env["FDPM_MCP_MAX_CALLS_PER_MINUTE"];
  const maxCallsPerMinute = maxRaw === undefined ? 120 : Number.parseInt(maxRaw, 10);
  if (!Number.isFinite(maxCallsPerMinute) || maxCallsPerMinute <= 0) {
    process.stderr.write(
      `fdpm-mcp: --max-calls-per-minute must be a positive integer, got ${String(maxRaw)}\n`,
    );
    process.exit(2);
  }

  const auditFullArgs =
    flag("--audit-full-args") || process.env["FDPM_MCP_AUDIT_FULL_ARGS"] === "1";

  return {
    dataDir,
    enableDestructive,
    enabledPlugins,
    maxCallsPerMinute,
    auditFullArgs,
  };
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  process.stderr.write(
    [
      `fdpm-mcp: starting`,
      `  data_dir=${flags.dataDir}`,
      `  manifest_version=${MCP_TOOL_MANIFEST_VERSION}`,
      `  destructive_enabled=${flags.enableDestructive}`,
      `  enabled_plugins=${flags.enabledPlugins.length === 0 ? "(none)" : flags.enabledPlugins.join(",")}`,
      `  max_calls_per_minute=${flags.maxCallsPerMinute}`,
      `  audit_full_args=${flags.auditFullArgs}`,
      ``,
    ].join("\n"),
  );

  // Construct one Host. Plugin discovery runs unless explicitly
  // suppressed via FDPM_NO_PLUGINS=1 (mirrors the CLI's noPlugins).
  const noPlugins = process.env["FDPM_NO_PLUGINS"] === "1";
  const host = new Host({
    dataDir: flags.dataDir,
    noPlugins,
  });
  await host.load();

  const audit = new McpAuditLog(flags.dataDir);
  const session = createSession({ maxPerMinute: flags.maxCallsPerMinute });

  const ctx: DispatchCtx = {
    session,
    enableDestructive: flags.enableDestructive,
    enabledPlugins: new Set(flags.enabledPlugins),
    auditFullArgs: flags.auditFullArgs,
    hostOptions: {
      dataDir: flags.dataDir,
      noPlugins,
    },
  };

  const dispatcher = createDispatcher(host, ctx, audit);

  // Build the advertised tool list once at startup. Tier 3 tools are
  // included only when destructive is enabled; in slice B-prelim Tier
  // 3 is empty either way.
  const advertised = advertisedTools({
    enableDestructive: flags.enableDestructive,
  });
  const advertisedSet = new Set(advertised.map((t) => t.name));

  // Sanity-check at boot: every tool we routed in MANIFEST should be
  // advertise-capable (the gate also enforces this; this is a fast
  // local check). A future tier > destructive would need handling here.
  for (const tool of MANIFEST) {
    if (
      tool.tier !== "read_only" &&
      tool.tier !== "validating_write" &&
      tool.tier !== "destructive"
    ) {
      process.stderr.write(`fdpm-mcp: unknown tier on tool ${tool.name}\n`);
      process.exit(70);
    }
  }

  // -- MCP server wiring ----------------------------------------------
  // Per SPEC-MCP-SERVER §11.3, the server advertises its tool-manifest
  // version. The MCP `Implementation` schema permits additional fields;
  // we surface the value via `description` (human-readable) and via a
  // namespaced extra field that machine consumers can read.
  const serverInfo: Record<string, unknown> = {
    name: "fdpm-mcp",
    version: HOST_VERSION,
    description: `FDPM MCP server (manifest version ${MCP_TOOL_MANIFEST_VERSION})`,
    "fdpm.manifestVersion": MCP_TOOL_MANIFEST_VERSION,
  };
  const server = new Server(
    serverInfo as { name: string; version: string },
    {
      capabilities: {
        tools: {},
      },
      instructions: `FDPM MCP server v0.1 (manifest ${MCP_TOOL_MANIFEST_VERSION}). Tier 1 + Tier 2 advertised; Tier 3 destructive deletes opt-in via --enable-destructive.`,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: advertised.map((tool) => {
        const inputSchema = toJsonSchema(tool.input);
        // Per MCP spec, inputSchema must have type:"object" at root.
        // Zod object schemas already produce that; we coerce defensively.
        const root: Record<string, unknown> = { ...inputSchema };
        if (root["type"] !== "object") {
          root["type"] = "object";
        }
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: root as { type: "object"; [k: string]: unknown },
          annotations: tool.annotations,
        };
      }),
      _meta: { manifest_version: MCP_TOOL_MANIFEST_VERSION },
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments ?? {};
    void advertisedSet; // currently unused — gate is enforced by dispatcher
    const result = await dispatcher.call(name, rawArgs);
    // The MCP SDK's CallToolResult is a wider type than ours (it carries
    // optional `task`, `_meta`, etc.). Our shape is a strict subset, so
    // a cast at the boundary is safe.
    return result as unknown as Record<string, unknown>;
  });

  // -- Signals & lifecycle --------------------------------------------
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`fdpm-mcp: received ${signal}, draining and exiting\n`);
    // The MCP SDK transport closes on stdin EOF too; explicit close
    // here guarantees an orderly drain when the operator sends a
    // signal directly.
    void server.close().finally(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGHUP", () => {
    void handleSighup(host, audit, session);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `fdpm-mcp: ready on stdio with ${advertised.length} tool(s)\n`,
  );
}

/**
 * SIGHUP handler — operator-triggered Host reload. Replaces the live
 * Host atomically (Host.reload's contract: either pre or post state,
 * never half-swapped) and clears the session's freshness map so the
 * next tool call re-seeds against the freshly-loaded data dir.
 *
 * If `Host.reload()` rejects with `host_compat` (truncated/rewritten
 * log), the previous Host stays intact per Host.reload's contract;
 * we record the outcome in the MCP audit log and the server keeps
 * serving against the pre-reload state.
 */
async function handleSighup(
  host: Host,
  audit: McpAuditLog,
  session: ReturnType<typeof createSession>,
): Promise<void> {
  process.stderr.write("fdpm-mcp: SIGHUP received — invoking host.reload()\n");
  try {
    const result = await host.reload();
    process.stderr.write(
      `fdpm-mcp: reloaded at ${result.reloadedAt}, ${result.projects.length} projects\n`,
    );
    session.clearFreshnessMap();
    audit.write({
      ts: new Date().toISOString(),
      phase: "reload",
      reloaded_at: result.reloadedAt,
      project_count: result.projects.length,
      outcome: "ok",
    });
  } catch (err) {
    if (err instanceof FDPMException && err.category === "host_compat") {
      process.stderr.write(
        `fdpm-mcp: reload failed (host_compat): ${err.message}\n`,
      );
      audit.write({
        ts: new Date().toISOString(),
        phase: "reload",
        reloaded_at: Date.now(),
        project_count: host.listProjects().length,
        outcome: "host_compat",
        error_message: err.message,
      });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`fdpm-mcp: reload failed (internal): ${msg}\n`);
      audit.write({
        ts: new Date().toISOString(),
        phase: "reload",
        reloaded_at: Date.now(),
        project_count: host.listProjects().length,
        outcome: "internal",
        error_message: msg,
      });
    }
    // Old Host stays intact per Host.reload() contract — server keeps running.
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fdpm-mcp: fatal: ${msg}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + "\n");
  }
  process.exit(70);
});
