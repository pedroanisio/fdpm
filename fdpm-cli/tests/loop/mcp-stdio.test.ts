/**
 * fdpm-loop-mcp over the real wire: spawn the server on a seeded data dir,
 * list its tools, start a run, get the first prompt, abort. No solver stage
 * is reached, so nothing here talks to Codex.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../src/core/host.js";
import { buildCodexDelegation } from "../../scripts/build-codex-delegation.js";
import { PIPELINE_ID, WORKBOOK_ID } from "../../scripts/codex-delegation/seed.js";
import { NODE_COMMAND, tsxArgs } from "../_helpers/process.js";

const BIN = join(process.cwd(), "src", "bin", "fdpm-loop-mcp.ts");
const REPO_ROOT = resolve(process.cwd(), "..");
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-loop-stdio-"));
  const host = new Host({ dataDir, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  await buildCodexDelegation(host);
}, 120_000);
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("fdpm-loop-mcp on stdio", () => {
  it("advertises the loop tools and drives a run to its first prompt", async () => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
    const transport = new StdioClientTransport({ command: NODE_COMMAND, args: tsxArgs([BIN, "--data-dir", dataDir, "--repo-root", REPO_ROOT]), env, stderr: "pipe" });
    const client = new Client({ name: "fdpm-loop-stdio-test", version: "0.0.0" });
    await client.connect(transport);
    transport.stderr?.on("data", () => {});
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(["fdpm_loop_abort", "fdpm_loop_list", "fdpm_loop_start", "fdpm_loop_status", "fdpm_loop_submit", "fdpm_loop_wait"]);
      expect(client.getInstructions()).toContain("fdpm_loop_start");

      const started = await client.callTool({
        name: "fdpm_loop_start",
        arguments: { workbook_id: WORKBOOK_ID, pipeline_id: PIPELINE_ID, inputs: { repo_path: REPO_ROOT, mode: "research", goal: "g", context_files: ["fdpm-cli/src/sdk.ts"], constraints: "c", proof_command: "true" }, receipt_slug: "stdio-run" },
      });
      const next = (started.structuredContent as { next: { kind: string; run_id: string; stage: string } }).next;
      expect(next.kind).toBe("prompt");
      expect(next.stage).toBe("order");

      const aborted = await client.callTool({ name: "fdpm_loop_abort", arguments: { run_id: next.run_id, reason: "stdio test" } });
      expect((aborted.structuredContent as { next: { kind: string } }).next.kind).toBe("terminal");
      const listed = await client.callTool({ name: "fdpm_loop_list", arguments: {} });
      expect((listed.structuredContent as { runs: Array<{ terminal?: string }> }).runs[0]?.terminal).toBe("failed");
    } finally {
      await client.close();
    }
  }, 120_000);
});
