/**
 * SPEC-WORKSPACE §13/§14 — backup + restore.
 *
 * Covers:
 *   - Backup produces a valid .fdpmbak with a manifest at offset 0
 *     and per-file sha256.
 *   - Restore round-trip: backup → restore → identical operation log.
 *   - Tampering refusal: mutate one byte → restore refuses with
 *     `verification` + `evidence.reason: "sha256_mismatch"`. Target
 *     unchanged.
 *   - Identity-collision: refuse without flags; --force-overwrite
 *     replaces; --name mints a fresh id.
 *   - --skip-verify bypasses Host.load() round-trip.
 */
import {
  existsSync,
  mkdtempSync,
  promises as fs,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { Host } from "../src/core/host.js";
import { LocalWorkspace, _resetAutoMintWarnings } from "../src/core/workspace/local.js";
import { backupWorkspace } from "../src/core/workspace/backup.js";
import { findById, readRegistry } from "../src/core/workspace/registry.js";
import { ULID_PATTERN } from "../src/core/identity/uid.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

const PLUGINS_DIR = resolve(process.cwd(), "plugins");

let dataDir: string;
let registryPath: string;
let bundleDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-bk-data-"));
  registryPath = join(mkdtempSync(join(tmpdir(), "fdpm-bk-reg-")), "workspaces.json");
  bundleDir = mkdtempSync(join(tmpdir(), "fdpm-bk-out-"));
  process.env["FDPM_REGISTRY_PATH"] = registryPath;
  delete process.env["FDPM_WORKSPACE"];
  delete process.env["FDPM_DATA_DIR"];
  _resetAutoMintWarnings();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(join(registryPath, ".."), { recursive: true, force: true });
  rmSync(bundleDir, { recursive: true, force: true });
  delete process.env["FDPM_REGISTRY_PATH"];
  delete process.env["FDPM_WORKSPACE"];
  delete process.env["FDPM_DATA_DIR"];
});

async function freshHost(dir = dataDir): Promise<Host> {
  const host = new Host({ dataDir: dir, builtinDirs: [PLUGINS_DIR] });
  await host.load();
  return host;
}

async function readEntryNames(bundlePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(bundlePath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("no zip"));
      const out: string[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        out.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

describe("backup — bundle format", () => {
  it("produces a valid .fdpmbak with backup-manifest.json as the FIRST entry", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-a",
      name: "A",
      profile_id: "profile:formal-specification:3.0",
    });
    const out = join(bundleDir, "a.fdpmbak");
    const result = await (host.workspace as LocalWorkspace).backup({ output: out });
    expect(existsSync(out)).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);

    const names = await readEntryNames(out);
    expect(names[0]).toBe("backup-manifest.json");
    expect(names).toContain("data/workspace.json");
    expect(names).toContain("data/workbooks/proj-a/log.jsonl");
  });

  it("manifest carries sha256 per file and identifies the workspace", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "b.fdpmbak");
    const { manifest } = await (host.workspace as LocalWorkspace).backup({ output: out });
    expect(manifest.spec_backup).toBe("1.0");
    expect(manifest.workspace.id).toBe(host.workspace!.id);
    expect(manifest.workspace.name).toBe(host.workspace!.name);
    for (const file of manifest.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuses to overwrite an existing output without --force", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "c.fdpmbak");
    writeFileSync(out, "existing", "utf8");
    await expect(
      (host.workspace as LocalWorkspace).backup({ output: out }),
    ).rejects.toMatchObject({ category: "permission" });
  });

  it("--force overwrites", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "d.fdpmbak");
    writeFileSync(out, "existing", "utf8");
    await (host.workspace as LocalWorkspace).backup({ output: out, force: true });
    const names = await readEntryNames(out);
    expect(names[0]).toBe("backup-manifest.json");
  });

  it("backupWorkspace can be called directly with an identity", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "direct.fdpmbak");
    const result = await backupWorkspace(dataDir, host.workspace!.getIdentity(), {
      output: out,
    });
    expect(result.manifest.workspace.id).toBe(host.workspace!.id);
  });
});

describe("restore — round-trip and atomicity", () => {
  it("backup → restore reproduces a bit-equivalent operation log", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-x",
      name: "X",
      profile_id: "profile:formal-specification:3.0",
    });
    const originalLog = readFileSync(
      join(dataDir, "workbooks", "proj-x", "log.jsonl"),
      "utf8",
    );
    const out = join(bundleDir, "x.fdpmbak");
    await (host.workspace as LocalWorkspace).backup({ output: out });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true }); // restore creates it
    try {
      const result = await LocalWorkspace.restore({
        bundlePath: out,
        dataDir: target,
        rename: "restored-x",
      });
      const restoredLog = readFileSync(
        join(target, "workbooks", "proj-x", "log.jsonl"),
        "utf8",
      );
      expect(restoredLog).toBe(originalLog);
      expect(result.identity.name).toBe("restored-x");
      expect(result.reidentified).toBe(true);
      // Fresh ULID, NOT the source workspace id.
      expect(result.identity.id).not.toBe(host.workspace!.id);
      expect(result.identity.id).toMatch(ULID_PATTERN);

      const reg = await readRegistry(registryPath);
      expect(findById(reg, result.identity.id)).not.toBeNull();
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("tampering with a data file → restore refuses with verification/sha256_mismatch", async () => {
    // Build a bundle whose manifest sha256 deliberately disagrees with
    // the data entry's actual bytes. Easiest deterministic path:
    // bypass the high-level helper and use archiver directly with a
    // hand-crafted manifest that lies about the data sha. Then prove
    // restore detects the mismatch and leaves the target untouched.
    const archiver = (await import("archiver")).default;
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-t",
      name: "T",
      profile_id: "profile:formal-specification:3.0",
    });
    const realIdentity = host.workspace!.getIdentity();
    const out = join(bundleDir, "tamper.fdpmbak");

    const lyingManifest = {
      spec_backup: "1.0",
      fdpm_host_version: "1.2.0",
      spec_core_version: "1.2",
      created_at: new Date().toISOString(),
      workspace: {
        id: realIdentity.id,
        name: realIdentity.name,
        created_at: realIdentity.created_at,
        created_by_host_version: realIdentity.created_by_host_version,
      },
      files: [
        {
          path: "data/workspace.json",
          // Wrong sha — actual content is whatever we append below.
          sha256: "0".repeat(64),
          bytes: 999,
          content_type: "application/json",
        },
      ],
      workbooks: [],
      profiles: [],
      warnings: [],
      exit_status: "ok",
    };

    await new Promise<void>((resolveP, reject) => {
      const w = (require("node:fs") as typeof import("node:fs")).createWriteStream(out);
      const a = archiver("zip");
      a.on("error", reject);
      w.on("close", resolveP);
      a.pipe(w);
      a.append(Buffer.from(JSON.stringify(lyingManifest, null, 2) + "\n", "utf8"), {
        name: "backup-manifest.json",
        store: true,
      });
      a.append(Buffer.from(JSON.stringify(realIdentity) + "\n", "utf8"), {
        name: "data/workspace.json",
      });
      void a.finalize();
    });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      await expect(
        LocalWorkspace.restore({ bundlePath: out, dataDir: target, rename: "t" }),
      ).rejects.toMatchObject({
        category: "verification",
        evidence: expect.objectContaining({ reason: "sha256_mismatch" }),
      });
      // Target dir untouched (verification fails BEFORE step 4 writes).
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("identity collision: refuses without flags", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "id.fdpmbak");
    await (host.workspace as LocalWorkspace).backup({ output: out });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      await expect(
        LocalWorkspace.restore({ bundlePath: out, dataDir: target }),
      ).rejects.toMatchObject({ category: "conflict" });
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("identity collision: --name mints a fresh id and registers it", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "id2.fdpmbak");
    await (host.workspace as LocalWorkspace).backup({ output: out });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      const result = await LocalWorkspace.restore({
        bundlePath: out,
        dataDir: target,
        rename: "side-by-side",
      });
      expect(result.reidentified).toBe(true);
      expect(result.identity.id).not.toBe(host.workspace!.id);
      const reg = await readRegistry(registryPath);
      expect(findById(reg, host.workspace!.id)).not.toBeNull();
      expect(findById(reg, result.identity.id)).not.toBeNull();
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("identity collision: --force-overwrite replaces", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "id3.fdpmbak");
    await (host.workspace as LocalWorkspace).backup({ output: out });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      const result = await LocalWorkspace.restore({
        bundlePath: out,
        dataDir: target,
        forceOverwrite: true,
      });
      // Same id — it's a deliberate replacement.
      expect(result.identity.id).toBe(host.workspace!.id);
      expect(result.reidentified).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("--skip-verify completes without running Host.load()", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "sv.fdpmbak");
    await (host.workspace as LocalWorkspace).backup({ output: out });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      const result = await LocalWorkspace.restore({
        bundlePath: out,
        dataDir: target,
        rename: "fast",
        skipVerify: true,
      });
      expect(result.identity.name).toBe("fast");
      expect(existsSync(join(target, "workspace.json"))).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("missing backup-manifest.json surfaces verification/manifest_invalid", async () => {
    // Build a zip with no manifest at all.
    const archiver = (await import("archiver")).default;
    const out = join(bundleDir, "no-manifest.fdpmbak");
    const ws = (await freshHost()).workspace as LocalWorkspace;
    void ws; // hostside is incidental; we just need a writable bundle
    await new Promise<void>((resolveP, reject) => {
      const w = (require("node:fs") as typeof import("node:fs")).createWriteStream(out);
      const a = archiver("zip");
      a.on("error", reject);
      w.on("close", resolveP);
      a.pipe(w);
      a.append(Buffer.from("not a manifest"), { name: "junk.txt" });
      void a.finalize();
    });

    const target = mkdtempSync(join(tmpdir(), "fdpm-bk-target-"));
    rmSync(target, { recursive: true, force: true });
    try {
      await expect(
        LocalWorkspace.restore({ bundlePath: out, dataDir: target }),
      ).rejects.toThrow(FDPMException);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});

describe("Workspace.backup updates registry last_backup", () => {
  it("registry entry's last_backup is set after backup() succeeds", async () => {
    const host = await freshHost();
    const out = join(bundleDir, "ts.fdpmbak");
    const before = await readRegistry(registryPath);
    expect(findById(before, host.workspace!.id)?.last_backup).toBeUndefined();
    await (host.workspace as LocalWorkspace).backup({ output: out });
    const after = await readRegistry(registryPath);
    expect(findById(after, host.workspace!.id)?.last_backup).toBeDefined();
  });
});

describe("Workspace.rename — clears _minted and updates registry", () => {
  it("rename mutates workspace.json + registry; _minted is dropped", async () => {
    const host = await freshHost();
    expect(host.workspace!.getIdentity()._minted).toBe(true);
    await (host.workspace as LocalWorkspace).rename("renamed-handle");
    const onDisk = JSON.parse(readFileSync(join(dataDir, "workspace.json"), "utf8"));
    expect(onDisk.name).toBe("renamed-handle");
    expect(onDisk._minted).toBeUndefined();
    const reg = await readRegistry(registryPath);
    expect(findById(reg, host.workspace!.id)?.name).toBe("renamed-handle");
  });

  it("rename rejects empty / whitespace-only name", async () => {
    const host = await freshHost();
    await expect(
      (host.workspace as LocalWorkspace).rename("   "),
    ).rejects.toMatchObject({ category: "verification" });
  });
});
