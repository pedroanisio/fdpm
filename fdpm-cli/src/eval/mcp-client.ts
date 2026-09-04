/**
 * A client session against a spawned `fdpm-mcp` — the same binary and the
 * same stdio transport an agent uses, so the eval measures the surface
 * that ships rather than an in-process approximation of it.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  META_TOOL_GET_PROMPT,
  META_TOOL_LIST_PROMPTS,
  META_TOOL_LIST_RESOURCES,
  META_TOOL_NAMES,
  META_TOOL_READ_RESOURCE,
  type ServerSurface,
  type ToolSurface,
} from "./arms.js";
import type { ToolExecutionResult, ToolExecutor } from "./driver.js";

const require = createRequire(import.meta.url);

/** Walk up from this module until the `@fdpm/cli` package.json is found. */
export function packageRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = require(candidate) as { name?: string };
        if (pkg.name === "@fdpm/cli") return dir;
      } catch {
        // not a readable manifest; keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate the @fdpm/cli package root above ${from}`);
}

export interface ServerLaunch {
  command: string;
  args: string[];
}

/**
 * Prefer the TypeScript entry through tsx when the source tree is present
 * (a checkout: always the current code), else the compiled binary (a
 * packaged install).
 */
export function resolveServerLaunch(root: string = packageRoot()): ServerLaunch {
  const srcEntry = join(root, "src", "bin", "fdpm-mcp.ts");
  if (existsSync(srcEntry)) {
    try {
      const tsx = require.resolve("tsx/cli");
      return { command: process.execPath, args: [tsx, srcEntry] };
    } catch {
      // tsx not installed; fall through to dist
    }
  }
  const distEntry = join(root, "dist", "src", "bin", "fdpm-mcp.js");
  if (existsSync(distEntry)) return { command: process.execPath, args: [distEntry] };
  throw new Error(`no fdpm-mcp entry found under ${root} (need src/bin/fdpm-mcp.ts with tsx, or dist/src/bin/fdpm-mcp.js)`);
}

/**
 * The server environment for one eval data directory. Every `FDPM_*`
 * variable of the parent is dropped so an operator's own configuration
 * cannot leak into a measurement; destructive tools are ON (refusal cases
 * need them reachable) and full audit args are recorded for the transcript.
 */
export function evalServerEnv(dataDir: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  return {
    ...env,
    FDPM_DATA_DIR: dataDir,
    FDPM_MCP_ENABLE_DESTRUCTIVE: "1",
    FDPM_MCP_AUDIT_FULL_ARGS: "1",
    // The per-session rate limit is an operator protection, not part of
    // the measured surface; a reference suite issues hundreds of calls.
    FDPM_MCP_MAX_CALLS_PER_MINUTE: "100000",
    ...extra,
  };
}

// ── Typed parse of what the server returns ───────────────────────────

const ToolCallResult = z
  .object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
  })
  .passthrough();

export interface ToolCallOutcome {
  /** Protocol succeeded AND (for write envelopes) the write was accepted. */
  ok: boolean;
  is_error: boolean;
  structured: unknown;
  /** What the model sees: the structured content, else the text content. */
  text: string;
}

export function outcomeFromResult(raw: unknown): ToolCallOutcome {
  const parsed = ToolCallResult.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, is_error: true, structured: raw, text: `unparseable tool result: ${parsed.error.message}` };
  }
  const r = parsed.data;
  const is_error = r.isError === true;
  const structured = r.structuredContent;
  const envelopeOk =
    typeof structured === "object" && structured !== null && "ok" in structured
      ? (structured as { ok: unknown }).ok !== false
      : true;
  const text =
    structured !== undefined
      ? JSON.stringify(structured)
      : (r.content ?? []).map((c) => c.text ?? "").join("\n");
  return { ok: !is_error && envelopeOk, is_error, structured, text };
}

// ── Session ──────────────────────────────────────────────────────────

export interface FdpmMcpSession {
  readonly dataDir: string;
  surface(): Promise<ServerSurface>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome>;
  listResources(): Promise<unknown>;
  readResource(uri: string): Promise<unknown>;
  listPrompts(): Promise<unknown>;
  getPrompt(name: string, args?: Record<string, string>): Promise<unknown>;
  close(): Promise<void>;
}

export interface SpawnOptions {
  dataDir: string;
  launch?: ServerLaunch;
  env?: Record<string, string>;
  clientName?: string;
}

export async function spawnFdpmMcp(opts: SpawnOptions): Promise<FdpmMcpSession> {
  const launch = opts.launch ?? resolveServerLaunch();
  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    env: evalServerEnv(opts.dataDir, opts.env),
    stderr: "pipe",
  });
  const client = new Client({ name: opts.clientName ?? "fdpm-cold-agent-eval", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  // Drain the server banner so a full pipe can never block the child.
  transport.stderr?.on("data", () => {});

  return {
    dataDir: opts.dataDir,
    async surface() {
      const listed = await client.listTools();
      return {
        tools: listed.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        instructions: client.getInstructions(),
      };
    },
    async callTool(name, args) {
      return outcomeFromResult(await client.callTool({ name, arguments: args }));
    },
    listResources: async () => {
      const [resources, templates] = await Promise.all([client.listResources(), client.listResourceTemplates()]);
      return { resources: resources.resources, resourceTemplates: templates.resourceTemplates };
    },
    readResource: async (uri) => client.readResource({ uri }),
    listPrompts: async () => client.listPrompts(),
    getPrompt: async (name, args) => client.getPrompt({ name, arguments: args }),
    close: () => client.close(),
  };
}

// ── The executor the driver calls ────────────────────────────────────

const ReadResourceInput = z.object({ uri: z.string().min(1) }).strict();
const GetPromptInput = z
  .object({ name: z.string().min(1), arguments: z.record(z.string(), z.string()).optional() })
  .strict();

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function okText(value: unknown): ToolExecutionResult {
  return { text: JSON.stringify(value), is_error: false };
}

/**
 * Route a tool call from the model to the session. Meta-tools reach the
 * resource and prompt surfaces; everything else is a server tool. A name
 * outside the surface never reaches the server (the driver already
 * refuses it; this is the second line).
 */
export function makeExecutor(session: FdpmMcpSession, surface: ToolSurface): ToolExecutor {
  const allowed = new Set(surface.tools.map((t) => t.name));
  return async (name, input) => {
    if (!allowed.has(name)) return { text: `tool ${name} is not available in this arm`, is_error: true };
    try {
      if (META_TOOL_NAMES.has(name)) {
        switch (name) {
          case META_TOOL_LIST_RESOURCES:
            return okText(await session.listResources());
          case META_TOOL_READ_RESOURCE: {
            const parsed = ReadResourceInput.safeParse(input);
            if (!parsed.success) return { text: `invalid input: ${parsed.error.message}`, is_error: true };
            return okText(await session.readResource(parsed.data.uri));
          }
          case META_TOOL_LIST_PROMPTS:
            return okText(await session.listPrompts());
          case META_TOOL_GET_PROMPT: {
            const parsed = GetPromptInput.safeParse(input);
            if (!parsed.success) return { text: `invalid input: ${parsed.error.message}`, is_error: true };
            return okText(await session.getPrompt(parsed.data.name, parsed.data.arguments));
          }
          default:
            return { text: `unhandled meta tool ${name}`, is_error: true };
        }
      }
      const outcome = await session.callTool(name, input);
      return { text: outcome.text, is_error: outcome.is_error };
    } catch (err) {
      return { text: `tool ${name} failed: ${errorText(err)}`, is_error: true };
    }
  };
}
