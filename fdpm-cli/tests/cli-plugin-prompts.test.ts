/**
 * `fdpm plugin prompts` / `fdpm plugin prompt <id>` — the CLI face of
 * plugin-shipped prompts. Runs the real binary with bundled plugins on
 * (no FDPM_NO_PLUGINS) so the planning prompt is registered.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NODE_COMMAND, tsxArgs } from "./_helpers/process.js";

const BIN = join(process.cwd(), "src", "bin", "fdpm.ts");
const TIMEOUT_MS = 90_000;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-cli-prompts-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function fdpm(...argv: string[]): { status: number | null; stdout: string; stderr: string } {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  const r = spawnSync(NODE_COMMAND, tsxArgs([BIN, ...argv]), {
    env: { ...env, FDPM_DATA_DIR: dataDir },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("fdpm plugin prompts", () => {
  it("lists prompts as JSON with metadata only", () => {
    const r = fdpm("plugin", "prompts", "--json");
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout) as { prompts: Array<{ name: string; plugin_id: string; description: string; arguments: unknown[] }> };
    const triage = j.prompts.find((p) => p.name === "planning/triage_iteration");
    expect(triage).toBeDefined();
    expect(triage!.plugin_id).toBe("fdpm.planning");
    expect(triage!.description).toMatch(/^Use /);
    expect(JSON.stringify(triage)).not.toMatch(/Call order/);
  }, TIMEOUT_MS);

  it("human mode prints a table with the prompt id", () => {
    const r = fdpm("plugin", "prompts");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/planning\/triage_iteration/);
  }, TIMEOUT_MS);
});

describe("fdpm plugin prompt <id>", () => {
  it("renders the prompt with --arg k=v as JSON", () => {
    const r = fdpm("plugin", "prompt", "planning/triage_iteration", "--arg", "workbook_id=plan-cli", "--arg", "focus=auth", "--json");
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout) as { name: string; messages: Array<{ role: string; content: { text: string } }> };
    expect(j.name).toBe("planning/triage_iteration");
    const text = j.messages.map((m) => m.content.text).join("\n");
    expect(text).toContain("plan-cli");
    expect(text).toContain("auth");
    expect(text).toMatch(/call order/i);
  }, TIMEOUT_MS);

  it("human mode prints the body", () => {
    const r = fdpm("plugin", "prompt", "planning/triage_iteration", "--arg", "workbook_id=plan-cli");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/when to use/i);
  }, TIMEOUT_MS);

  it("a missing required argument fails with a validation error", () => {
    const r = fdpm("plugin", "prompt", "planning/triage_iteration", "--json");
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/prompt_argument_missing/);
  }, TIMEOUT_MS);

  it("an unknown prompt id is not_found", () => {
    const r = fdpm("plugin", "prompt", "planning/nope", "--json");
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/not_found/);
  }, TIMEOUT_MS);
});
