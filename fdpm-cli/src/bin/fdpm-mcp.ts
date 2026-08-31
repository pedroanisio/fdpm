#!/usr/bin/env node
/**
 * `fdpm-mcp` — the MCP server binary defined by SPEC-MCP-SERVER v0.1.
 *
 * Long-lived process holding one Host. Speaks the MCP protocol over
 * stdio (the only transport in v0.1; HTTP/SSE deferred to v0.2 per
 * §6.1). The advertised tool surface is a hand-curated, version-pinned
 * manifest (see `../mcp/manifest.ts`), measured against a byte budget
 * at boot (§8.5, `../mcp/catalog.ts`).
 *
 * Critical I/O contract: stdio is the MCP transport. The very first
 * byte written to stdout MUST be a valid MCP frame. ALL human-facing
 * output (banners, warnings, errors-during-startup) goes to
 * `process.stderr`. A stray `console.log` here would corrupt the
 * protocol stream and break every connected client.
 *
 * Lifecycle (SPEC-MCP-SERVER §15):
 *   startup → load Host → build + measure catalog → build dispatcher →
 *   wire stdio → respond to `initialize` → serve `tools/list` and
 *   `tools/call` until SIGTERM / SIGINT / EOF → drain → flush → exit 0.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { Host } from "../core/host.js";
import { defaultDataDir } from "../persistence/jsonl-log.js";
import { resolveWorkspaceDataDir } from "../core/workspace/resolve.js";
import { MANIFEST } from "../mcp/manifest.js";
import { MCP_TOOL_MANIFEST_VERSION } from "../mcp/schemas.js";
import {
  CATALOG_BUDGET_ENV,
  advertisedCatalog,
  buildCatalogReport,
  formatViolations,
  resolveCatalogBudget,
  type CatalogBudget,
} from "../mcp/catalog.js";
import { discoverPluginTools } from "../mcp/plugin-tools.js";
import { promptListEntry, renderPrompt } from "../mcp/prompts.js";
import {
  SERVER_INSTRUCTIONS,
  checkInstructionsBudget,
  instructionsBytes,
} from "../mcp/instructions.js";
import { createSession } from "../mcp/session.js";
import {
  resolveConfirmationTokenPolicy,
  type ConfirmationTokenPolicy,
} from "../mcp/confirmation-token.js";
import { createDispatcher } from "../mcp/dispatch.js";
import { createReadGuard, resolveMaxResourceBytes } from "../mcp/read-guard.js";
import type { DispatchCtx } from "../mcp/types.js";
import { handleReload, reloadSignalForPlatform } from "../mcp/reload.js";
import { McpAuditLog } from "../persistence/mcp-audit-log.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { listResources, listTemplates } from "../mcp/resources/registry.js";

interface ParsedFlags {
  /** Resolved synchronously from --data-dir; empty string when absent. */
  dataDir: string;
  cliDataDir?: string;
  enableDestructive: boolean;
  enabledPlugins: string[];
  maxCallsPerMinute: number;
  maxResourceBytes: number;
  auditFullArgs: boolean;
  catalogBudget: CatalogBudget;
  confirmationTokenPolicy: ConfirmationTokenPolicy;
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

  // SPEC-WORKSPACE §8.3 precedence resolved in main(); parseArgs only
  // captures the explicit --data-dir flag, leaving env / registry to
  // the async resolver.
  const cliDataDir = get("--data-dir");

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

  // Resolve the resource ceiling at boot, so a malformed value is a startup
  // refusal rather than a limit an operator believes is in force. Same shape
  // as the catalog budget: fail where the operator is watching.
  let maxResourceBytes: number;
  try {
    maxResourceBytes = resolveMaxResourceBytes(process.env);
  } catch (err) {
    process.stderr.write(
      `fdpm-mcp: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }

  const auditFullArgs =
    flag("--audit-full-args") || process.env["FDPM_MCP_AUDIT_FULL_ARGS"] === "1";

  // SPEC-MCP-SERVER §8.5: the catalog budget. Only the total is
  // operator-tunable; a malformed value is a startup refusal, like
  // --max-calls-per-minute.
  // SPEC-MCP-SERVER §9.3: opt-in Tier 2/3 confirmation-token gate. A
  // misconfiguration here is a startup refusal, not a silent downgrade to
  // "unprotected" — see confirmation-token.ts.
  let confirmationTokenPolicy: ConfirmationTokenPolicy;
  try {
    confirmationTokenPolicy = resolveConfirmationTokenPolicy(process.env);
  } catch (err) {
    process.stderr.write(`fdpm-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  let catalogBudget: CatalogBudget;
  try {
    catalogBudget = resolveCatalogBudget(process.env);
  } catch (err) {
    process.stderr.write(`fdpm-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  return {
    dataDir: cliDataDir ?? "",
    cliDataDir,
    enableDestructive,
    enabledPlugins,
    maxCallsPerMinute,
    maxResourceBytes,
    auditFullArgs,
    catalogBudget,
    confirmationTokenPolicy,
  };
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  // SPEC-WORKSPACE §8.3 precedence: --data-dir > FDPM_DATA_DIR
  // > FDPM_WORKSPACE > registry.current > defaultDataDir().
  const resolved = await resolveWorkspaceDataDir({ cliDataDir: flags.cliDataDir });
  flags.dataDir = resolved.dataDir ?? defaultDataDir();

  process.stderr.write(
    [
      `fdpm-mcp: starting`,
      `  data_dir=${flags.dataDir} (source=${resolved.source})`,
      `  manifest_version=${MCP_TOOL_MANIFEST_VERSION}`,
      `  destructive_enabled=${flags.enableDestructive}`,
      `  enabled_plugins=${flags.enabledPlugins.length === 0 ? "(none)" : flags.enabledPlugins.join(",")}`,
      `  max_calls_per_minute=${flags.maxCallsPerMinute}`,
      `  audit_full_args=${flags.auditFullArgs}`,
      `  require_confirmation_token=${flags.confirmationTokenPolicy.requireConfirmationToken}`,
      `  catalog_budget_bytes=${flags.catalogBudget.total_bytes} (per_tool=${flags.catalogBudget.per_tool_bytes})`,
      `  instructions_bytes=${instructionsBytes()}`,
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

  // -- Catalog: build once, measure once, enforce the budget (§8.5) --
  // The advertised list is the Core manifest (Tier 3 banner-prefixed
  // when destructive is off) followed by plugin-supplied tools. Plugin
  // tools count against the same budget: PURPOSE.md's "never
  // bulk-advertised" rule is enforced here, not by convention. The
  // stub `discoverPluginTools` returns [] today; when the `mcp_tool`
  // capability lands, this is the gate it must pass.
  const pluginTools = discoverPluginTools(host, flags.enabledPlugins);
  const advertised = advertisedCatalog({
    enableDestructive: flags.enableDestructive,
    pluginTools,
  });
  const catalog = buildCatalogReport(advertised, flags.catalogBudget);
  if (!catalog.ok) {
    process.stderr.write(
      [
        `fdpm-mcp: refusing to start — tool catalog exceeds its byte budget (SPEC-MCP-SERVER §8.5).`,
        ...formatViolations(catalog.violations).map((line) => `  ${line}`),
        `  measured: ${catalog.measurement.tool_count} tool(s), ${catalog.measurement.total_bytes} B`,
        `  Fix: trim the offending description/schema, disable plugins, or raise ${CATALOG_BUDGET_ENV} (total only) if the token cost is accepted.`,
        ``,
      ].join("\n"),
    );
    process.exit(2);
  }

  // -- Instructions: one per session, capped like the catalog (§8.6) --
  // The text is a compile-time constant, so this gate is unreachable
  // when tests/mcp/instructions.test.ts passes; it exists so a future
  // edit that outgrows the budget fails loudly at boot, never silently
  // in every agent session.
  const instructionsVerdict = checkInstructionsBudget();
  if (!instructionsVerdict.ok) {
    process.stderr.write(
      `fdpm-mcp: refusing to start — server instructions are ${instructionsVerdict.bytes} B, budget ${instructionsVerdict.budget_bytes} B (SPEC-MCP-SERVER §8.6). Trim src/mcp/instructions.ts.\n`,
    );
    process.exit(2);
  }

  const audit = new McpAuditLog(flags.dataDir);
  const session = createSession({ maxPerMinute: flags.maxCallsPerMinute });

  const ctx: DispatchCtx = {
    session,
    enableDestructive: flags.enableDestructive,
    enabledPlugins: new Set(flags.enabledPlugins),
    auditFullArgs: flags.auditFullArgs,
    ...flags.confirmationTokenPolicy,
    hostOptions: {
      dataDir: flags.dataDir,
      noPlugins,
    },
    catalog,
  };

  const dispatcher = createDispatcher(host, ctx, audit);

  // The read surface carries the three controls that apply to a read: the
  // shared rate limit, the audit trail, and the byte ceiling. See
  // `read-guard.ts` for why it is not the tool dispatcher.
  const readGuard = createReadGuard({
    host,
    session,
    audit,
    maxResourceBytes: flags.maxResourceBytes,
  });

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
        // The advertised tool array is frozen at boot (it is the array
        // the catalog budget was measured against), so no `listChanged`
        // here: a reload cannot change it.
        tools: {},
        // Resources surface (slice 1: render only). `subscribe: false`
        // is implicit via omission — slice 2 will add it once the
        // freshness-watcher polling loop is in place. `listChanged` is
        // declared because `resources/list` is computed from the live
        // Host: an operator reload can add or drop whole workbooks, and
        // a client that caches the list would never see them.
        resources: { listChanged: true },
        // Plugin-shipped prompts (§13.5): metadata on prompts/list, the
        // validated body on prompts/get. Also live-computed from the
        // Host's plugin runtime, hence `listChanged`.
        prompts: { listChanged: true },
      },
      // SPEC-MCP-SERVER §8.6: static cold-start orientation, also served
      // at fdpm://guide for clients that ignore this field.
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // `advertised` is already the wire shape (see catalog.ts); it is
    // the SAME array the budget was measured against, so what the
    // client sees is what was checked.
    return {
      tools: advertised,
      _meta: {
        manifest_version: MCP_TOOL_MANIFEST_VERSION,
        catalog_bytes: catalog.measurement.total_bytes,
        catalog_budget_bytes: catalog.budget.total_bytes,
      },
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments ?? {};
    const result = await dispatcher.call(name, rawArgs);
    // The MCP SDK's CallToolResult is a wider type than ours (it carries
    // optional `task`, `_meta`, etc.). Our shape is a strict subset, so
    // a cast at the boundary is safe.
    return result as unknown as Record<string, unknown>;
  });

  // -- Resources surface (slice 1: render only) -----------------------
  // Read-only addressable views of workbook state. `resources/list`
  // walks every (workbook, registered renderer target) pair so clients
  // can pin specific outputs without calling tools. `resources/read`
  // dispatches through the provider registry; the render provider
  // runs SPEC-REPL §10.2 lenient tail-replay before invoking the
  // renderer.
  //
  // Provider failures (FDPMException + others) propagate up to the
  // SDK which surfaces them as JSON-RPC errors per the MCP spec —
  // matches the dispatcher's existing error contract for tools.

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: listResources(host).map((entry) => ({
        uri: entry.uri,
        name: entry.name,
        ...(entry.description !== undefined && { description: entry.description }),
        ...(entry.mimeType !== undefined && { mimeType: entry.mimeType }),
        ...(entry.size !== undefined && { size: entry.size }),
      })),
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: listTemplates(host).map((tpl) => ({
        uriTemplate: tpl.uriTemplate,
        name: tpl.name,
        ...(tpl.description !== undefined && { description: tpl.description }),
        ...(tpl.mimeType !== undefined && { mimeType: tpl.mimeType }),
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const result = await readGuard.read(uri);
    // MCP's ReadResourceResult carries a `contents[]` array; each
    // entry is either a TextResourceContents or BlobResourceContents.
    // We always emit exactly one — the URI addresses one render.
    const content: Record<string, unknown> = {
      uri: result.uri,
      mimeType: result.mimeType,
    };
    if (result.text !== undefined) content["text"] = result.text;
    if (result.blob !== undefined) content["blob"] = result.blob;
    return { contents: [content] };
  });

  // -- Prompts surface (§13.5) -----------------------------------------
  // Progressive disclosure: `prompts/list` carries metadata only; the
  // body is rendered on `prompts/get`, argument-checked and validated
  // against the skill contract before it leaves the server. Errors
  // (not_found, validation, verification) propagate as JSON-RPC errors
  // with the reason in the message.

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: host.plugins.listPrompts().map(promptListEntry) };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const reg = host.plugins.findPrompt(name);
    if (reg === undefined) {
      throw new FDPMException("not_found", `prompt not found: ${name} (not_found)`, {
        evidence: { prompt: name, available: host.plugins.listPrompts().map((p) => p.promptId) },
      });
    }
    const rendered = await renderPrompt(reg, request.params.arguments);
    return { description: rendered.description, messages: rendered.messages };
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
  const reloadSignal = reloadSignalForPlatform(process.platform);
  process.on(reloadSignal, () => {
    void handleReload({
      host,
      audit,
      session,
      signal: reloadSignal,
      notifier: {
        sendResourceListChanged: () => server.sendResourceListChanged(),
        sendPromptListChanged: () => server.sendPromptListChanged(),
      },
    });
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const resourceCount = listResources(host).length;
  process.stderr.write(
    `fdpm-mcp: ready on stdio with ${advertised.length} tool(s) (${catalog.measurement.total_bytes} B of ${catalog.budget.total_bytes} B catalog budget), ${resourceCount} resource(s), ${host.plugins.listPrompts().length} prompt(s), instructions ${instructionsBytes()} B\n`,
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fdpm-mcp: fatal: ${msg}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + "\n");
  }
  process.exit(70);
});
