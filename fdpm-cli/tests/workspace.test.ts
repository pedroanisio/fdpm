/**
 * SPEC-WORKSPACE §10/§11/§12/§15 — LocalWorkspace, registry, auto-mint,
 * data-dir resolution.
 *
 * These tests cover the migration step 1 surface: identity round-trip,
 * registry CRUD, auto-mint on first touch, FDPM_DATA_DIR precedence,
 * plugin call invariance after the Host refactor. Backup/restore
 * (migration steps 3-4) are covered by their own future suite.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { LocalWorkspace, _resetAutoMintWarnings } from "../src/core/workspace/local.js";
import {
  defaultRegistryPath,
  findById,
  findByName,
  readRegistry,
  uniqueName,
  upsertEntry,
  writeRegistry,
} from "../src/core/workspace/registry.js";
import { resolveWorkspaceDataDir } from "../src/core/workspace/resolve.js";
import {
  SPEC_WORKSPACE_REGISTRY_VERSION,
  SPEC_WORKSPACE_VERSION,
  WorkspaceIdentity,
} from "../src/core/workspace/types.js";
import { ULID_PATTERN } from "../src/core/identity/uid.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

const PLUGINS_DIR = resolve(process.cwd(), "plugins");

let dataDir: string;
let registryPath: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-ws-data-"));
  registryPath = join(mkdtempSync(join(tmpdir(), "fdpm-ws-reg-")), "workspaces.json");
  process.env["FDPM_REGISTRY_PATH"] = registryPath;
  delete process.env["FDPM_WORKSPACE"];
  delete process.env["FDPM_DATA_DIR"];
  _resetAutoMintWarnings();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(join(registryPath, ".."), { recursive: true, force: true });
  delete process.env["FDPM_REGISTRY_PATH"];
  delete process.env["FDPM_WORKSPACE"];
  delete process.env["FDPM_DATA_DIR"];
});

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir, builtinDirs: [PLUGINS_DIR] });
  await host.load();
  return host;
}

describe("registry — atomic file CRUD", () => {
  it("readRegistry returns empty registry for missing file", async () => {
    const reg = await readRegistry(registryPath);
    expect(reg.spec_workspace_registry).toBe(SPEC_WORKSPACE_REGISTRY_VERSION);
    expect(reg.workspaces).toEqual([]);
    expect(reg.current).toBeUndefined();
  });

  it("writeRegistry round-trips via atomic temp+rename", async () => {
    const reg = upsertEntry(await readRegistry(registryPath), {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "alpha",
      path: "/tmp/alpha",
    });
    await writeRegistry(reg, registryPath);
    expect(existsSync(registryPath)).toBe(true);
    const round = await readRegistry(registryPath);
    expect(round.workspaces.length).toBe(1);
    expect(round.workspaces[0]!.name).toBe("alpha");
  });

  it("upsertEntry merges by id, preserving last_used unless overridden", async () => {
    let reg = await readRegistry(registryPath);
    reg = upsertEntry(reg, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "alpha", path: "/p1" });
    reg = upsertEntry(reg, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "alpha", path: "/p2" });
    expect(reg.workspaces.length).toBe(1);
    expect(reg.workspaces[0]!.path).toBe("/p2");
  });

  it("findById / findByName lookups", async () => {
    let reg = await readRegistry(registryPath);
    reg = upsertEntry(reg, { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "alpha", path: "/p" });
    expect(findById(reg, "01ARZ3NDEKTSV4RRFFQ69G5FAV")?.name).toBe("alpha");
    expect(findByName(reg, "alpha")?.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(findById(reg, "missing")).toBeNull();
    expect(findByName(reg, "missing")).toBeNull();
  });

  it("uniqueName suffixes -2 / -3 on collision", async () => {
    let reg = await readRegistry(registryPath);
    reg = upsertEntry(reg, { id: "01AAAA00000000000000000000", name: "shared", path: "/p1" });
    reg = upsertEntry(reg, { id: "01BBBB00000000000000000000", name: "shared-2", path: "/p2" });
    expect(uniqueName(reg, "fresh")).toBe("fresh");
    expect(uniqueName(reg, "shared")).toBe("shared-3");
  });

  it("readRegistry rejects malformed JSON with a verification error", async () => {
    writeFileSync(registryPath, "{ this is not json", "utf8");
    await expect(readRegistry(registryPath)).rejects.toThrow(FDPMException);
  });

  it("defaultRegistryPath honours FDPM_REGISTRY_PATH", () => {
    process.env["FDPM_REGISTRY_PATH"] = "/tmp/custom-reg.json";
    expect(defaultRegistryPath()).toBe("/tmp/custom-reg.json");
  });
});

describe("LocalWorkspace — auto-mint and identity round-trip", () => {
  it("auto-mints workspace.json on first touch with a basename-derived name", async () => {
    expect(existsSync(join(dataDir, "workspace.json"))).toBe(false);
    const host = await freshHost();
    expect(existsSync(join(dataDir, "workspace.json"))).toBe(true);
    expect(host.workspace).not.toBeNull();
    const id = host.workspace!.getIdentity();
    expect(id.spec_workspace).toBe(SPEC_WORKSPACE_VERSION);
    expect(id.id).toMatch(ULID_PATTERN);
    expect(id._minted).toBe(true);
    expect(id.name.startsWith("fdpm-ws-data-")).toBe(true);
  });

  it("does NOT re-mint on subsequent loads (id stable)", async () => {
    const host1 = await freshHost();
    const id1 = host1.workspace!.id;
    const host2 = await freshHost();
    const id2 = host2.workspace!.id;
    expect(id2).toBe(id1);
  });

  it("upserts the workspace into the registry on first load", async () => {
    const host = await freshHost();
    const reg = await readRegistry(registryPath);
    const entry = findById(reg, host.workspace!.id);
    expect(entry).not.toBeNull();
    expect(entry!.path).toBe(dataDir);
    expect(entry!.name).toBe(host.workspace!.name);
  });

  it("rejects a corrupt workspace.json with a verification error", async () => {
    writeFileSync(join(dataDir, "workspace.json"), "{ broken", "utf8");
    const host = new Host({ dataDir, builtinDirs: [PLUGINS_DIR] });
    await expect(host.load()).rejects.toThrow(FDPMException);
  });

  it("rejects a workspace.json that fails schema validation", async () => {
    writeFileSync(
      join(dataDir, "workspace.json"),
      JSON.stringify({ spec_workspace: "1.0", id: "not-a-ulid" }),
      "utf8",
    );
    const host = new Host({ dataDir, builtinDirs: [PLUGINS_DIR] });
    await expect(host.load()).rejects.toThrow(/schema validation/i);
  });

  it("WorkspaceIdentity zod schema rejects unknown fields", () => {
    const bad = {
      spec_workspace: "1.0",
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "x",
      created_at: "2026-05-05T12:00:00.000Z",
      created_by_host_version: "1.2.0",
      spec_core_version: "1.2",
      bogus_field: "should be rejected",
    };
    expect(WorkspaceIdentity.safeParse(bad).success).toBe(false);
  });

  it("collision-suffixes the auto-minted name when basename already exists", async () => {
    // Pre-populate the registry with an entry whose name matches the
    // dataDir basename so auto-mint must pick a -2 suffix.
    const existing = upsertEntry(await readRegistry(registryPath), {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: dataDir.split("/").pop()!,
      path: "/elsewhere",
    });
    await writeRegistry(existing, registryPath);

    const host = await freshHost();
    expect(host.workspace!.name).toMatch(/-2$/);
  });
});

describe("Host integration — workspace surface preserves plugin call sites", () => {
  it("host.workspace exposes the same Store / ProfileRegistry / PluginRuntime as host", async () => {
    const host = await freshHost();
    expect(host.workspace!.getStore()).toBe(host.store);
    expect(host.workspace!.getProfileRegistry()).toBe(host.profiles);
    expect(host.workspace!.getPluginRuntime()).toBe(host.plugins);
  });

  it("host.persistence remains the JsonlLogStore (Principle 7: call sites unchanged)", async () => {
    const host = await freshHost();
    expect(host.persistence).not.toBeNull();
    expect(host.persistence!.dataDir).toBe(dataDir);
  });

  it("workspace.appendOp / getOperationLog round-trip through persistence", async () => {
    const host = await freshHost();
    const result = await host.createProject({
      project_id: "proj-x",
      name: "X",
      profile_id: "profile:formal-specification:3.0",
    });
    const log = await host.workspace!.getOperationLog("proj-x");
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.op_id).toBe(result.op.op_id);
  });

  it("Host.reload() rebuilds the workspace against the same identity", async () => {
    const host = await freshHost();
    const before = host.workspace!.id;
    await host.reload();
    expect(host.workspace).not.toBeNull();
    expect(host.workspace!.id).toBe(before);
  });
});

describe("data-dir resolution — SPEC-WORKSPACE §8.3 precedence", () => {
  it("--data-dir overrides FDPM_DATA_DIR and FDPM_WORKSPACE", async () => {
    const env = { FDPM_DATA_DIR: "/from/env", FDPM_WORKSPACE: "named" };
    const r = await resolveWorkspaceDataDir({
      cliDataDir: "/from/cli",
      env,
      registryPath,
    });
    expect(r).toEqual({ dataDir: "/from/cli", source: "cli" });
  });

  it("FDPM_DATA_DIR overrides FDPM_WORKSPACE", async () => {
    const env = { FDPM_DATA_DIR: "/from/env", FDPM_WORKSPACE: "named" };
    const r = await resolveWorkspaceDataDir({ env, registryPath });
    expect(r).toEqual({ dataDir: "/from/env", source: "env_data_dir" });
  });

  it("FDPM_WORKSPACE resolves by name via the registry", async () => {
    const reg = upsertEntry(await readRegistry(registryPath), {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "prod",
      path: "/p/prod",
    });
    await writeRegistry(reg, registryPath);
    const r = await resolveWorkspaceDataDir({
      env: { FDPM_WORKSPACE: "prod" },
      registryPath,
    });
    expect(r).toEqual({ dataDir: "/p/prod", source: "env_workspace" });
  });

  it("FDPM_WORKSPACE resolves by id via the registry", async () => {
    const reg = upsertEntry(await readRegistry(registryPath), {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "prod",
      path: "/p/prod",
    });
    await writeRegistry(reg, registryPath);
    const r = await resolveWorkspaceDataDir({
      env: { FDPM_WORKSPACE: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      registryPath,
    });
    expect(r.source).toBe("env_workspace");
    expect(r.dataDir).toBe("/p/prod");
  });

  it("FDPM_WORKSPACE pointing at an unknown name throws not_found", async () => {
    await expect(
      resolveWorkspaceDataDir({ env: { FDPM_WORKSPACE: "nope" }, registryPath }),
    ).rejects.toThrow(/workspace not found in registry: nope/);
  });

  it("registry.current is used when no other input matches", async () => {
    let reg = upsertEntry(await readRegistry(registryPath), {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "default-ws",
      path: "/p/default",
    });
    reg = { ...reg, current: "01ARZ3NDEKTSV4RRFFQ69G5FAV" };
    await writeRegistry(reg, registryPath);
    const r = await resolveWorkspaceDataDir({ env: {}, registryPath });
    expect(r).toEqual({ dataDir: "/p/default", source: "registry_current" });
  });

  it("registry.current pointing at a missing entry throws not_found", async () => {
    const reg = {
      spec_workspace_registry: SPEC_WORKSPACE_REGISTRY_VERSION as const,
      current: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaces: [],
    };
    await writeRegistry(reg, registryPath);
    await expect(
      resolveWorkspaceDataDir({ env: {}, registryPath }),
    ).rejects.toThrow(/workspace not found in registry/);
  });

  it("returns dataDir=null when nothing matches (caller falls back to default)", async () => {
    const r = await resolveWorkspaceDataDir({ env: {}, registryPath });
    expect(r).toEqual({ dataDir: null, source: "default" });
  });
});

describe("LocalWorkspace.open — direct invocation honours the Workspace interface", () => {
  it("constructs against pre-existing workspace.json without re-minting", async () => {
    const host = await freshHost();
    const idBefore = host.workspace!.id;
    // Open a fresh LocalWorkspace via static against the same dataDir;
    // it should pick up the persisted workspace.json.
    const ws = await LocalWorkspace.open(
      dataDir,
      { store: host.store, profiles: host.profiles, plugins: host.plugins },
      { registryPath, emitWarnings: false },
    );
    expect(ws.id).toBe(idBefore);
    expect(ws.path).toBe(dataDir);
    expect(ws.getIdentity()._minted).toBe(true);
  });

  it("identity persisted to workspace.json matches the schema", async () => {
    await freshHost();
    const onDisk = JSON.parse(readFileSync(join(dataDir, "workspace.json"), "utf8"));
    const parsed = WorkspaceIdentity.safeParse(onDisk);
    expect(parsed.success).toBe(true);
  });
});
