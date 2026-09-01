/**
 * Builds a configured MCP `Server` from a Host, a dispatcher and a read
 * guard. Shared by both transports.
 *
 * This module exists so the remote HTTP transport cannot drift from the
 * local stdio one. The stdio binary builds one server at boot; the HTTP
 * session manager builds one per session. Both get the same tools, the
 * same resources, the same prompts and the same instructions, because
 * both call this function. There is no second implementation to keep in
 * step, which is the point.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { Host } from "../core/host.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { HOST_VERSION } from "../core/version/spec.js";
import { MCP_TOOL_MANIFEST_VERSION } from "./schemas.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { listResources, listTemplates } from "./resources/registry.js";
import { promptListEntry, renderPrompt } from "./prompts.js";
import type { AdvertisedTool, CatalogReport } from "./catalog.js";
import type { ReadGuard } from "./read-guard.js";

export interface Dispatcherish {
  call(name: string, args: unknown): Promise<unknown>;
}

export interface BuildMcpServerDeps {
  readonly host: Host;
  readonly dispatcher: Dispatcherish;
  readonly readGuard: ReadGuard;
  /** Already in wire shape, and the same array the budget was measured against. */
  readonly advertised: ReadonlyArray<AdvertisedTool>;
  readonly catalog: CatalogReport;
}

export function buildMcpServer(deps: BuildMcpServerDeps): Server {
  const { host, dispatcher, readGuard, advertised, catalog } = deps;

  // SPEC-MCP-SERVER §11.3: advertise the tool-manifest version. The MCP
  // `Implementation` schema permits extra fields; the value is surfaced
  // both human-readably and under a namespaced key.
  const serverInfo: Record<string, unknown> = {
    name: "fdpm-mcp",
    version: HOST_VERSION,
    description: `FDPM MCP server (manifest version ${MCP_TOOL_MANIFEST_VERSION})`,
    "fdpm.manifestVersion": MCP_TOOL_MANIFEST_VERSION,
  };

  const server = new Server(serverInfo as { name: string; version: string }, {
    capabilities: {
      tools: {},
      resources: { listChanged: true },
      prompts: { listChanged: true },
    },
    instructions: SERVER_INSTRUCTIONS,
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: advertised,
    _meta: {
      manifest_version: MCP_TOOL_MANIFEST_VERSION,
      catalog_bytes: catalog.measurement.total_bytes,
      catalog_budget_bytes: catalog.budget.total_bytes,
    },
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await dispatcher.call(request.params.name, request.params.arguments ?? {});
    // Our CallToolResult is a strict subset of the SDK's wider type.
    return result as Record<string, unknown>;
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(host).map((entry) => ({
      uri: entry.uri,
      name: entry.name,
      ...(entry.description !== undefined && { description: entry.description }),
      ...(entry.mimeType !== undefined && { mimeType: entry.mimeType }),
      ...(entry.size !== undefined && { size: entry.size }),
    })),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: listTemplates(host).map((tpl) => ({
      uriTemplate: tpl.uriTemplate,
      name: tpl.name,
      ...(tpl.description !== undefined && { description: tpl.description }),
      ...(tpl.mimeType !== undefined && { mimeType: tpl.mimeType }),
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const result = await readGuard.read(request.params.uri);
    const content: Record<string, unknown> = { uri: result.uri, mimeType: result.mimeType };
    if (result.text !== undefined) content["text"] = result.text;
    if (result.blob !== undefined) content["blob"] = result.blob;
    return { contents: [content] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: host.plugins.listPrompts().map(promptListEntry),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const name = request.params.name;
    const reg = host.plugins.findPrompt(name);
    if (reg === undefined) {
      throw new FDPMException("not_found", `prompt not found: ${name} (not_found)`, {
        evidence: {
          prompt: name,
          available: host.plugins.listPrompts().map((p) => p.promptId),
        },
      });
    }
    const rendered = await renderPrompt(reg, request.params.arguments);
    return { description: rendered.description, messages: rendered.messages };
  });

  return server;
}
