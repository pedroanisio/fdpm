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

describe("profile list — composition profiles", () => {
  /**
   * `profile:formal-specification-dnis:0.1` declares no types of its own; it
   * composes `formal-specification:3.0` + `dnis:0.1` through `extends`. The
   * summary table counted the RAW arrays, so the row read
   *
   *     profile:formal-specification-dnis:0.1  0.1.0  0  0  Formal-Specification + DNIS
   *
   * next to rows whose counts were real. Zero is not a smaller number here,
   * it is a wrong one: the profile carries 34 primitive and 32 relation types
   * and a workbook bound to it can use every one. The listing exists to answer
   * "which profile do I pick", and it answered by hiding the candidate.
   */
  const DNIS_ID = "profile:formal-specification-dnis:0.1";

  it("counts the inherited vocabulary, not the empty local declaration", () => {
    const listed = runCli(["profile", "list", "--json"]);
    expect(listed.status).toBe(0);
    const row = JSON.parse(listed.stdout).profiles.find(
      (p: { id: string }) => p.id === DNIS_ID,
    );
    expect(row).toBeDefined();

    const resolved = runCli(["profile", "get", DNIS_ID, "--json"]);
    expect(resolved.status).toBe(0);
    const full = JSON.parse(resolved.stdout);

    expect(full.primitive_types.length).toBeGreaterThan(0);
    expect(row.primitive_type_count).toBe(full.primitive_types.length);
    expect(row.relation_type_count).toBe(full.relation_types.length);
  });

  it("renders those counts in the text table", () => {
    const { stdout, status } = runCli(["profile", "list"]);
    expect(status).toBe(0);
    const line = stdout.split("\n").find((l) => l.includes(DNIS_ID));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/\s0\s+0\s/);
  });

  it("leaves a non-composition profile's counts untouched (regression)", () => {
    const { stdout, status } = runCli(["profile", "list", "--json"]);
    expect(status).toBe(0);
    const row = JSON.parse(stdout).profiles.find((p: { id: string }) => p.id === FS_ID);
    expect(row.primitive_type_count).toBe(32);
  });
});
