#!/usr/bin/env node
/**
 * fdpm-loop-mcp — the loop-forward executor as an MCP server on stdio.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 *   fdpm-loop-mcp [--data-dir DIR] [--repo-root DIR]
 *
 * Register it next to the fdpm server so Claude Code is the orchestrator by
 * tool calls alone (no ANTHROPIC_API_KEY; Codex runs inside this server):
 *
 *   claude mcp add --scope user fdpm-loop -- node <checkout>/fdpm-cli/dist/src/bin/fdpm-loop-mcp.js
 *   # or, from the source tree:
 *   claude mcp add --scope user fdpm-loop -- <checkout>/fdpm-cli/node_modules/.bin/tsx <checkout>/fdpm-cli/src/bin/fdpm-loop-mcp.ts
 *
 * The data dir is the same one the fdpm server serves (FDPM_DATA_DIR or
 * ~/.fdpm-cli), so pipelines, receipts and the records an orchestrator writes
 * are one store. Run state is persisted under <data dir>/loop-runs/ and
 * unfinished runs are resumed on start.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_VERSION } from "../core/version/spec.js";
import { LOOP_SERVER_INSTRUCTIONS, LOOP_TOOLS, LoopService, callLoopTool } from "../loop/mcp.js";
import { defaultDataDir } from "../persistence/jsonl-log.js";
import { openHost } from "../sdk.js";

function packageRootFrom(entry: string): string {
  // <root>/src/bin/fdpm-loop-mcp.ts or <root>/dist/src/bin/fdpm-loop-mcp.js
  const dir = dirname(entry);
  return dir.includes(`${"dist"}`) ? resolve(dir, "..", "..", "..") : resolve(dir, "..", "..");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const dataDir = flag("--data-dir") ?? process.env["FDPM_DATA_DIR"] ?? defaultDataDir();
  const packageRoot = packageRootFrom(fileURLToPath(import.meta.url));
  // The repository the loop acts on: the checkout that contains this package
  // unless --repo-root says otherwise. Deliberately not an FDPM_* variable —
  // every one of those is contract-documented in three places, and a flag is
  // enough here.
  const repoRoot = resolve(flag("--repo-root") ?? resolve(packageRoot, ".."));

  const host = await openHost({ dataDir });
  const service = new LoopService({ host, dataDir, repoRoot, packageRoot, log: (line) => process.stderr.write(`fdpm-loop: ${line}\n`) });
  const resumed = await service.resumeAll();

  const server = new Server(
    { name: "fdpm-loop", version: HOST_VERSION },
    { capabilities: { tools: {} }, instructions: LOOP_SERVER_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: LOOP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await callLoopTool(service, request.params.name, request.params.arguments ?? {});
    // Our CallToolResult is a strict subset of the SDK's wider type.
    return result as unknown as Record<string, unknown>;
  });

  const shutdown = (signal: string): void => {
    process.stderr.write(`fdpm-loop: ${signal}, exiting\n`);
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await server.connect(new StdioServerTransport());
  process.stderr.write(`fdpm-loop: ready on stdio with ${LOOP_TOOLS.length} tools; data dir ${dataDir}; repo root ${repoRoot}; resumed ${resumed.length} run(s)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`fdpm-loop: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(70);
});
