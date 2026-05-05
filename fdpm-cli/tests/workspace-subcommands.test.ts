/**
 * `fdpm workspace` subcommand smoke tests.
 *
 * Runs the CLI as a real `npx tsx` subprocess so the full I/O path
 * (Commander → emit → fd-1 sync write) is exercised. The in-process
 * approach is unreliable because emit() writes via writeSync(fd=1, …),
 * which sidesteps any process.stdout.write monkey-patch.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findById, readRegistry } from "../src/core/workspace/registry.js";

const FDPM_BIN = "src/bin/fdpm.ts";

let dataDir: string;
let registryPath: string;
let bundleDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-wscmd-data-"));
  registryPath = join(mkdtempSync(join(tmpdir(), "fdpm-wscmd-reg-")), "workspaces.json");
  bundleDir = mkdtempSync(join(tmpdir(), "fdpm-wscmd-out-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(join(registryPath, ".."), { recursive: true, force: true });
  rmSync(bundleDir, { recursive: true, force: true });
});

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  const res = spawnSync(
    "npx",
    ["tsx", FDPM_BIN, "--data-dir", dataDir, ...args],
    {
      env: {
        ...process.env,
        FDPM_LOG_LEVEL: "silent",
        FDPM_REGISTRY_PATH: registryPath,
        ...extraEnv,
      },
      encoding: "utf8",
      cwd: process.cwd(),
    },
  );
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status };
}

function lastJsonValue(stdout: string): unknown {
  // emit() pretty-prints JSON across multiple lines. The CLI commands
  // we're driving emit exactly one JSON value, so just parse the
  // entire trimmed stdout. (REPL transcripts that interleave many
  // values would need brace-counting; not the case here.)
  return JSON.parse(stdout.trim());
}

describe("fdpm workspace info / list (subprocess)", () => {
  it("info --json emits the active workspace identity", () => {
    const r = runCli(["workspace", "info", "--json"]);
    expect(r.status).toBe(0);
    const parsed = lastJsonValue(r.stdout) as { id: string; path: string };
    expect(parsed.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(parsed.path).toBe(dataDir);
  });

  it("list --json contains the active workspace", () => {
    const create = runCli(["workspace", "info", "--json"]);
    const id = (lastJsonValue(create.stdout) as { id: string }).id;
    const r = runCli(["workspace", "list", "--json"]);
    expect(r.status).toBe(0);
    const parsed = lastJsonValue(r.stdout) as { workspaces: { id: string }[] };
    expect(parsed.workspaces.some((w) => w.id === id)).toBe(true);
  });
});

describe("fdpm workspace switch / forget (subprocess)", () => {
  it("switch sets registry.current to the chosen workspace", async () => {
    const create = runCli(["workspace", "info", "--json"]);
    const id = (lastJsonValue(create.stdout) as { id: string }).id;
    runCli(["workspace", "switch", id, "--json"]);
    const reg = await readRegistry(registryPath);
    expect(reg.current).toBe(id);
  });

  it("forget removes the registry entry; data dir untouched", async () => {
    const create = runCli(["workspace", "info", "--json"]);
    const id = (lastJsonValue(create.stdout) as { id: string }).id;
    runCli(["workspace", "forget", id, "--json"]);
    const reg = await readRegistry(registryPath);
    expect(findById(reg, id)).toBeNull();
    expect(existsSync(join(dataDir, "workspace.json"))).toBe(true);
  });

  it("switch against an unknown name exits non-zero", () => {
    const r = runCli(["workspace", "switch", "definitely-not-here", "--json"]);
    expect(r.status).not.toBe(0);
  });
});

describe("fdpm workspace rename (subprocess)", () => {
  it("rename updates workspace.json + registry; clears _minted", async () => {
    const create = runCli(["workspace", "info", "--json"]);
    const id = (lastJsonValue(create.stdout) as { id: string }).id;
    const r = runCli(["workspace", "rename", id, "production", "--json"]);
    expect(r.status).toBe(0);
    const onDisk = JSON.parse(readFileSync(join(dataDir, "workspace.json"), "utf8"));
    expect(onDisk.name).toBe("production");
    expect(onDisk._minted).toBeUndefined();
    const reg = await readRegistry(registryPath);
    expect(findById(reg, id)?.name).toBe("production");
  });
});

describe("fdpm workspace backup / restore / verify (subprocess)", () => {
  it("backup writes a bundle and restore --name recreates it elsewhere", () => {
    const created = runCli([
      "workbook",
      "create",
      "--id",
      "proj-r",
      "--name",
      "R",
      "--profile",
      "profile:formal-specification:3.0",
    ]);
    expect(created.status, `workbook create failed: ${created.stderr}`).toBe(0);

    const out = join(bundleDir, "round.fdpmbak");
    const bk = runCli(["workspace", "backup", "-o", out, "--json"]);
    expect(bk.status).toBe(0);
    const bkParsed = lastJsonValue(bk.stdout) as { ok: boolean; files: number };
    expect(bkParsed.ok).toBe(true);
    expect(bkParsed.files).toBeGreaterThan(0);

    const target = mkdtempSync(join(tmpdir(), "fdpm-wscmd-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      const rs = runCli([
        "workspace",
        "restore",
        out,
        "--data-dir",
        target,
        "--name",
        "round-restored",
        "--json",
      ]);
      expect(rs.status).toBe(0);
      const rsParsed = lastJsonValue(rs.stdout) as {
        ok: boolean;
        reidentified: boolean;
        name: string;
      };
      expect(rsParsed.ok).toBe(true);
      expect(rsParsed.reidentified).toBe(true);
      expect(rsParsed.name).toBe("round-restored");
      expect(existsSync(join(target, "workbooks", "proj-r", "log.jsonl"))).toBe(true);

      const vf = runCli(["workspace", "verify", "round-restored", "--json"]);
      expect(vf.status).toBe(0);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  }, 60_000);

  it("backup refuses to overwrite without --force", () => {
    const out = join(bundleDir, "exists.fdpmbak");
    writeFileSync(out, "existing", "utf8");
    const r = runCli(["workspace", "backup", "-o", out, "--json"]);
    expect(r.status).not.toBe(0);
  });
});

describe("fdpm workspace init (subprocess)", () => {
  it("init at a fresh path mints a workspace there", () => {
    const fresh = mkdtempSync(join(tmpdir(), "fdpm-wscmd-fresh-"));
    rmSync(fresh, { recursive: true, force: true });
    try {
      const r = runCli([
        "workspace",
        "init",
        "--path",
        fresh,
        "--name",
        "freshly-named",
        "--json",
      ]);
      expect(r.status).toBe(0);
      const parsed = lastJsonValue(r.stdout) as {
        ok: boolean;
        path: string;
        name: string;
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.path).toBe(resolve(fresh));
      expect(parsed.name).toBe("freshly-named");
      expect(existsSync(join(fresh, "workspace.json"))).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
