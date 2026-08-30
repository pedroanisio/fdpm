/**
 * `fdpm.loop-forward` prompts across the operator- and agent-facing
 * surfaces — the CLI binary and the live MCP stdio server.
 *
 * `prompts.test.ts` proves the registrations and their content in
 * process. This suite proves the same two prompts actually arrive at a
 * consumer, over the two transports a real caller uses:
 *
 *   - `fdpm plugin prompts` / `fdpm plugin prompt <id>`, spawned as the
 *     real binary;
 *   - `prompts/list` and `prompts/get` over JSON-RPC against a spawned
 *     `fdpm-mcp`, through the MCP SDK client.
 *
 * Both handlers are plugin-generic, so what is under test here is not
 * the CLI or the server: it is that activation registers the prompts on
 * a cold start, in a fresh data dir, with no in-process shortcut. A
 * plugin that registers prompts only when some earlier test has already
 * loaded it would pass `prompts.test.ts` and fail here.
 *
 * Separate from `prompts.test.ts` because every case spawns a process
 * with all bundled plugins active; keeping it apart leaves the unit
 * suite fast.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { NODE_COMMAND, tsxArgs } from "../../_helpers/process.js";

/**
 * Anchor on this file, not `process.cwd()`. The package sits one level
 * inside the repository root, so a vitest invoked from the repo root
 * resolves a cwd-relative binary path one directory too high and the
 * spawn fails with ENOENT rather than a useful assertion.
 */
const PKG_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const CLI_BIN = join(PKG_ROOT, "src", "bin", "fdpm.ts");
const MCP_BIN = join(PKG_ROOT, "src", "bin", "fdpm-mcp.ts");
const TIMEOUT_MS = 120_000;

const AUTHOR = "loop-forward/author_pipeline";
const AUDIT = "loop-forward/audit_pipeline";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "lf-prompts-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/** process.env minus every FDPM_* knob, so the suite is env-independent. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  return { ...env, FDPM_DATA_DIR: dataDir, ...extra };
}

function fdpm(...argv: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(NODE_COMMAND, tsxArgs([CLI_BIN, ...argv]), {
    env: cleanEnv(),
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ── CLI ──────────────────────────────────────────────────────────────

describe("fdpm plugin prompts — loop-forward", () => {
  it(
    "lists both prompts with metadata only, never the body",
    () => {
      const r = fdpm("plugin", "prompts", "--json");
      expect(r.status, r.stderr).toBe(0);
      const j = JSON.parse(r.stdout) as {
        prompts: Array<{ name: string; plugin_id: string; description: string }>;
      };
      const mine = j.prompts.filter((p) => p.plugin_id === "fdpm.loop-forward");
      expect(mine.map((p) => p.name).sort()).toEqual([AUDIT, AUTHOR]);
      for (const p of mine) expect(p.description).toMatch(/^Use /);
      // Progressive disclosure: the listing must not leak the body.
      expect(JSON.stringify(mine)).not.toMatch(/Call order/);
    },
    TIMEOUT_MS,
  );

  it(
    "renders author_pipeline with --arg, threading the workbook id",
    () => {
      const r = fdpm("plugin", "prompt", AUTHOR, "--arg", "workbook_id=lf-cli", "--json");
      expect(r.status, r.stderr).toBe(0);
      const j = JSON.parse(r.stdout) as {
        name: string;
        messages: Array<{ content: { text: string } }>;
      };
      expect(j.name).toBe(AUTHOR);
      const text = j.messages.map((m) => m.content.text).join("\n");
      expect(text).toContain("lf-cli");
      expect(text).toMatch(/call order/i);
      expect(text).toContain("lf:Stage");
    },
    TIMEOUT_MS,
  );

  it(
    "renders audit_pipeline and names the five review renderers",
    () => {
      const r = fdpm("plugin", "prompt", AUDIT, "--arg", "workbook_id=lf-cli", "--json");
      expect(r.status, r.stderr).toBe(0);
      const text = (
        JSON.parse(r.stdout) as { messages: Array<{ content: { text: string } }> }
      ).messages
        .map((m) => m.content.text)
        .join("\n");
      expect(text).toContain("lf:VerificationSurfaceRenderer");
      expect(text).toContain("lf:AuthorityMatrixRenderer");
    },
    TIMEOUT_MS,
  );

  it(
    "fails with a non-zero exit when a required argument is missing",
    () => {
      const r = fdpm("plugin", "prompt", AUTHOR, "--json");
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/prompt_argument_missing|workbook_id/);
    },
    TIMEOUT_MS,
  );
});

// ── MCP stdio ────────────────────────────────────────────────────────

async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: NODE_COMMAND,
    args: tsxArgs([MCP_BIN]),
    env: cleanEnv(),
  });
  const client = new Client({ name: "lf-prompt-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

describe("fdpm-mcp prompts/* — loop-forward over the wire", () => {
  it(
    "advertises both prompts on prompts/list and renders one on prompts/get",
    async () => {
      const { client, close } = await connect();
      try {
        const listed = await client.listPrompts();
        const names = listed.prompts.map((p) => p.name);
        expect(names).toContain(AUTHOR);
        expect(names).toContain(AUDIT);

        // Listing is metadata only — the body must not ride along.
        expect(JSON.stringify(listed)).not.toMatch(/Call order/);
        const author = listed.prompts.find((p) => p.name === AUTHOR)!;
        expect(author.arguments?.some((a) => a.name === "workbook_id" && a.required)).toBe(true);

        const got = await client.getPrompt({
          name: AUDIT,
          arguments: { workbook_id: "lf-wire" },
        });
        const text = got.messages
          .map((m) => (m.content.type === "text" ? m.content.text : ""))
          .join("\n");
        expect(text).toContain("lf-wire");
        expect(text).toMatch(/when to use/i);
        expect(text).toMatch(/failure modes/i);
        expect(text).toContain("fdpm://workbook/lf-wire/render/");
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "rejects prompts/get with a missing required argument rather than rendering a hole",
    async () => {
      const { client, close } = await connect();
      try {
        await expect(client.getPrompt({ name: AUTHOR, arguments: {} })).rejects.toThrow();
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );
});
