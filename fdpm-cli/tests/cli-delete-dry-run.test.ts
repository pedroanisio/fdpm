/**
 * CLI `--dry-run` on the three delete commands (SPEC-MCP-SERVER §8.7,
 * CLI surface). Same core delete-preview module as the MCP tools'
 * `dry_run` and the SDK `preview*Delete` helpers: the CLI prints the
 * would-affect set and appends nothing.
 *
 * Runs the real binary (`src/bin/fdpm.ts` via tsx) against a seeded
 * data dir: `emit()` writes with a raw `fs.writeSync(1, …)`, so this is
 * also the only faithful way to observe CLI stdout.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";
import { NODE_COMMAND, tsxArgs } from "./_helpers/process.js";

const BIN = join(process.cwd(), "src", "bin", "fdpm.ts");
const WB = "wb-cli-dry";
const TIMEOUT_MS = 60_000;

let dataDir: string;
beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-cli-dry-"));
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE, { persist: true });
  await host.createProject({ workbook_id: WB, name: "CLI", profile_id: TEST_PROFILE.id });
  await host.createPrimitive(WB, { id: "section:s1", type_id: "test:section", field_values: { title: "S1", number: 1 } });
  await host.createPrimitive(WB, { id: "para:p1", type_id: "test:para", field_values: { text: "t" } });
  await host.createRelation(WB, {
    id: "rel:s1-p1",
    type_id: "test:rel:contains",
    source_id: "section:s1",
    target_id: "para:p1",
    field_values: {},
  });
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function fdpm(...argv: string[]): { status: number | null; stdout: string; stderr: string } {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("FDPM_")) env[k] = v;
  }
  const r = spawnSync(NODE_COMMAND, tsxArgs([BIN, ...argv]), {
    env: { ...env, FDPM_DATA_DIR: dataDir, FDPM_NO_PLUGINS: "1" },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

async function reload(): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  return host;
}

function json(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("fdpm primitive delete --dry-run", () => {
  it(
    "prints the would-affect set as JSON, exits 0, and deletes nothing",
    async () => {
      const r = fdpm("primitive", "delete", WB, "section:s1", "--dry-run", "--json");
      expect(r.status, r.stderr).toBe(0);
      const j = json(r.stdout);
      expect(j["dry_run"]).toBe(true);
      const wa = j["would_affect"] as { id: string; type_id: string; referencing_relations: Array<{ id: string }> };
      expect(wa.id).toBe("section:s1");
      expect(wa.type_id).toBe("test:section");
      expect(wa.referencing_relations.map((x) => x.id)).toEqual(["rel:s1-p1"]);
      const host = await reload();
      expect("section:s1" in host.getProject(WB).primitives).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    "human mode says dry-run and names the referencing relation count",
    () => {
      const r = fdpm("primitive", "delete", WB, "section:s1", "--dry-run");
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/dry-run: would delete section:s1/);
      expect(r.stdout).toMatch(/1 referencing relation/);
    },
    TIMEOUT_MS,
  );

  it(
    "without --dry-run the delete still happens (relation first, then primitive)",
    async () => {
      expect(fdpm("relation", "delete", WB, "rel:s1-p1", "--json").status).toBe(0);
      expect(fdpm("primitive", "delete", WB, "section:s1", "--json").status).toBe(0);
      const host = await reload();
      expect("section:s1" in host.getProject(WB).primitives).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("fdpm relation delete --dry-run / fdpm workbook delete --dry-run", () => {
  it(
    "relation preview names the endpoints and keeps the relation",
    async () => {
      const r = fdpm("relation", "delete", WB, "rel:s1-p1", "--dry-run", "--json");
      expect(r.status, r.stderr).toBe(0);
      const j = json(r.stdout);
      expect(j["dry_run"]).toBe(true);
      expect(j["would_affect"]).toMatchObject({ source_id: "section:s1", target_id: "para:p1", type_id: "test:rel:contains" });
      const host = await reload();
      expect("rel:s1-p1" in host.getProject(WB).relations).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    "workbook preview reports counts and keeps the workbook",
    async () => {
      const r = fdpm("workbook", "delete", WB, "--dry-run", "--json");
      expect(r.status, r.stderr).toBe(0);
      const j = json(r.stdout);
      expect(j["dry_run"]).toBe(true);
      expect(j["would_affect"]).toMatchObject({ workbook_id: WB, primitive_count: 2, relation_count: 1 });
      const host = await reload();
      expect(host.listProjects().map((p) => p.id)).toContain(WB);
    },
    TIMEOUT_MS,
  );

  it(
    "a missing target fails with not_found even in dry-run (non-zero exit)",
    () => {
      const r = fdpm("primitive", "delete", WB, "section:ghost", "--dry-run", "--json");
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/not_found/);
    },
    TIMEOUT_MS,
  );
});
