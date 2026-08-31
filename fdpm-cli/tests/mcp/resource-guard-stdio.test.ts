/**
 * The resource guard over the real wire.
 *
 * `resource-guard.test.ts` exercises `createReadGuard` in process. That proves
 * the guard works; it does not prove the server uses it. The binary was the
 * whole defect — `ReadResourceRequestSchema` called `dispatchRead` directly
 * while `dispatcher.call` sat one handler away — so a unit test alone would
 * have passed against the bug it was written to catch.
 *
 * These cases spawn `fdpm-mcp`, speak MCP through the SDK client, and assert
 * the three controls on the path an actual agent takes. A regression that
 * re-detached the handler would pass every in-process test and fail here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GUIDE_URI } from "../../src/mcp/resources/guide.js";
import { MAX_RESOURCE_BYTES_ENV } from "../../src/mcp/read-guard.js";

/** Anchored on this file, not process.cwd(): vitest may run from either root. */
const PKG_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const TSX = join(PKG_ROOT, "node_modules", ".bin", "tsx");
const MCP_BIN = join(PKG_ROOT, "src", "bin", "fdpm-mcp.ts");
const CLI_BIN = join(PKG_ROOT, "src", "bin", "fdpm.ts");
const TIMEOUT_MS = 120_000;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-resguard-stdio-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function serverEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  return { ...env, FDPM_DATA_DIR: dataDir, FDPM_NO_PLUGINS: "1", ...extra };
}

async function connect(extra: Record<string, string> = {}): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const transport = new StdioClientTransport({
    command: TSX,
    args: [MCP_BIN],
    env: serverEnv(extra),
  });
  const client = new Client({ name: "resguard-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

function auditLines(): Array<Record<string, unknown>> {
  const p = join(dataDir, "mcp-audit.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("fdpm-mcp resources/read — guarded over stdio", () => {
  it(
    "writes a resource_read audit entry for a read that succeeds",
    async () => {
      const { client, close } = await connect();
      try {
        const out = await client.readResource({ uri: GUIDE_URI });
        expect(out.contents).toHaveLength(1);
      } finally {
        await close();
      }

      const reads = auditLines().filter((e) => e["phase"] === "resource_read");
      expect(reads, "the binary must route reads through the guard").toHaveLength(1);
      expect(reads[0]).toMatchObject({ uri: GUIDE_URI, ok: true, provider: "fdpm.guide" });
      expect(reads[0]!["bytes"]).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  it(
    "refuses an over-ceiling read with a quota error and records it",
    async () => {
      const { client, close } = await connect({ [MAX_RESOURCE_BYTES_ENV]: "32" });
      try {
        await expect(client.readResource({ uri: GUIDE_URI })).rejects.toThrow();
      } finally {
        await close();
      }

      const reads = auditLines().filter((e) => e["phase"] === "resource_read");
      expect(reads).toHaveLength(1);
      expect(reads[0]).toMatchObject({ ok: false, error_category: "quota" });
      // The refusal names both numbers so an operator can size the ceiling.
      expect(reads[0]!["bytes"]).toBeGreaterThan(32);
    },
    TIMEOUT_MS,
  );

  it(
    "shares one rate-limit budget with tool calls",
    async () => {
      // Two calls of budget: one tool call and one read exhaust it, so the
      // third is refused whichever surface it arrives on. Two buckets would
      // let each surface spend two and stay inside both.
      const { client, close } = await connect({ FDPM_MCP_MAX_CALLS_PER_MINUTE: "2" });
      try {
        await client.callTool({ name: "fdpm.workbook.list", arguments: {} });
        await client.readResource({ uri: GUIDE_URI });
        await expect(client.readResource({ uri: GUIDE_URI })).rejects.toThrow();
      } finally {
        await close();
      }

      const refused = auditLines().filter(
        (e) => e["phase"] === "resource_read" && e["error_reason"] === "rate_limited",
      );
      expect(refused).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  it(
    "refuses to boot on a malformed ceiling rather than serving unbounded",
    () => {
      const r = spawnSync(TSX, [MCP_BIN], {
        env: serverEnv({ [MAX_RESOURCE_BYTES_ENV]: "1MB" }),
        encoding: "utf8",
        timeout: TIMEOUT_MS,
        input: "",
      });
      expect(r.status).toBe(2);
      expect(`${r.stderr}`).toContain(MAX_RESOURCE_BYTES_ENV);
    },
    TIMEOUT_MS,
  );

  it(
    "serves a workbook render through the guard, refreshed and audited",
    async () => {
      // The one provider that declares readsWorkbookState. A read of it must
      // still work end to end — the guard refreshes before the provider runs.
      const mk = spawnSync(
        TSX,
        [CLI_BIN, "workbook", "create", "--id", "guarded-wb", "--name", "G", "--profile", "core:empty"],
        { env: serverEnv(), encoding: "utf8", timeout: TIMEOUT_MS },
      );
      expect(mk.status, mk.stderr).toBe(0);

      const { client, close } = await connect();
      try {
        const out = await client.readResource({
          uri: "fdpm://workbook/guarded-wb/render/text/markdown",
        });
        expect(out.contents).toHaveLength(1);
      } finally {
        await close();
      }

      const reads = auditLines().filter((e) => e["phase"] === "resource_read");
      expect(reads).toHaveLength(1);
      expect(reads[0]).toMatchObject({ ok: true, provider: "fdpm.render" });
    },
    TIMEOUT_MS,
  );
});
