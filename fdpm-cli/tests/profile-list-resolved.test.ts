/**
 * `fdpm profile list --resolved` — first-class "get all resolved profiles".
 *
 * Runs the CLI as a real `npx tsx` subprocess (matching the other subcommand
 * smoke tests) so the full Commander → emit → fd-1 write path is exercised.
 * A fresh --data-dir ships all in-tree plugin profiles, so we assert against
 * `profile:formal-specification:3.0` (32 primitive types, category cat:structure).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NODE_COMMAND, tsxArgs } from "./_helpers/process.js";

const FDPM_BIN = "src/bin/fdpm.ts";
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-plr-"));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runCli(args: string[]): RunResult {
  const res = spawnSync(NODE_COMMAND, tsxArgs([FDPM_BIN, "--data-dir", dataDir, ...args]), {
    env: { ...process.env, FDPM_LOG_LEVEL: "silent" },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    cwd: process.cwd(),
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status };
}

const FS_ID = "profile:formal-specification:3.0";

describe("profile list --resolved", () => {
  it("--json emits fully resolved profiles (types + relations), not summaries", () => {
    const { stdout, status } = runCli(["profile", "list", "--resolved", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.profiles)).toBe(true);

    const fs = parsed.profiles.find((p: { id: string }) => p.id === FS_ID);
    expect(fs).toBeDefined();
    // Resolved shape: the full type arrays are present, NOT just counts.
    expect(Array.isArray(fs.primitive_types)).toBe(true);
    expect(fs.primitive_types.length).toBe(32);
    expect(fs.primitive_types.map((t: { id: string }) => t.id)).toContain("fs:Section");
    expect(Array.isArray(fs.relation_types)).toBe(true);
    expect(fs.relation_types.length).toBeGreaterThan(0);

    // core:empty stays empty — proves we resolved every profile, not one.
    const empty = parsed.profiles.find((p: { id: string }) => p.id === "core:empty");
    expect(empty.primitive_types).toEqual([]);
  });

  it("text mode renders the category → type hierarchy", () => {
    const { stdout, status } = runCli(["profile", "list", "--resolved"]);
    expect(status).toBe(0);
    expect(stdout).toContain(FS_ID);
    expect(stdout).toContain("cat:structure");
    expect(stdout).toContain("fs:Section");
    expect(stdout).toContain("relations:");
  });

  it("--resolved --raw returns the unresolved profiles", () => {
    const { stdout, status } = runCli(["profile", "list", "--resolved", "--raw", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    const fs = parsed.profiles.find((p: { id: string }) => p.id === FS_ID);
    expect(fs).toBeDefined();
    expect(Array.isArray(fs.primitive_types)).toBe(true);
  });

  it("without --resolved the summary output is unchanged (regression)", () => {
    const { stdout, status } = runCli(["profile", "list", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    const fs = parsed.profiles.find((p: { id: string }) => p.id === FS_ID);
    expect(fs.primitive_type_count).toBe(32);
    // Summary must NOT carry the heavy resolved arrays.
    expect(fs.primitive_types).toBeUndefined();
  });
});
