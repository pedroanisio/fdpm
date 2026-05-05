/**
 * Host.reload() — SPEC-REPL §10.3 atomic reload contract.
 *
 * Covers:
 *   - reload() returns {reloadedAt, workbooks}
 *   - reload() picks up out-of-band log appends (the canonical case
 *     for the REPL/MCP staleness gate)
 *   - reload() picks up out-of-band workbook creations (a separate
 *     process created workbook P; the loaded Host now sees it)
 *   - reload() is idempotent against an unchanged data dir
 *   - reload() preserves Host identity (the same `host` reference;
 *     consumers that captured `host` keep working)
 *
 * Also exercises Host.statProjectLog passthrough (SPEC-REPL §10.2).
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-host-reload-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

describe("Host.reload", () => {
  it("returns {reloadedAt, workbooks} with the post-reload workbook list", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-a",
      name: "Workbook A",
      profile_id: "profile:formal-specification:3.0",
    });

    const before = Date.now();
    const result = await host.reload();
    const after = Date.now();

    expect(result.reloadedAt).toBeGreaterThanOrEqual(before);
    expect(result.reloadedAt).toBeLessThanOrEqual(after);
    expect(result.workbooks).toContain("proj-a");
  });

  it("picks up out-of-band log appends written by another process", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-oob",
      name: "OOB",
      profile_id: "profile:formal-specification:3.0",
    });
    const beforeRev = host.getProject("proj-oob").workbook.revision;

    // Read the log, then craft a hand-rolled extra op that mimics what
    // a second process would write. The simplest realistic injection
    // is a primitive.create — copy the workbook.create's request_id
    // pattern but bump op_id.
    const logPath = join(dataDir, "workbooks", "proj-oob", "log.jsonl");
    const extraOp = JSON.stringify({
      op_id: "01JZZZOOB0000000000000000A",
      kind: "primitive.create",
      workbook_id: "proj-oob",
      payload: {
        id: "section:oob",
        type_id: "fs:Section",
        field_values: {
          number: 1,
          title: "Out of band",
          status: "draft",
          version: "0.1",
          description: "Injected by hand for the OOB freshness test.",
        },
        uid: "01JZZZOOB000000000000000UID",
      },
      actor: "test:oob",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:00.000Z",
      revision: beforeRev + 1,
      request_id: "00000000-0000-7000-8000-000000000oob",
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0",
    });
    appendFileSync(logPath, extraOp + "\n", "utf8");

    // Pre-reload, the live Host doesn't know about the new primitive.
    const sliceBefore = host.getProject("proj-oob");
    expect(sliceBefore.primitives["section:oob"]).toBeUndefined();

    await host.reload();

    const sliceAfter = host.getProject("proj-oob");
    expect(sliceAfter.primitives["section:oob"]).toBeDefined();
    expect(sliceAfter.workbook.revision).toBe(beforeRev + 1);
  });

  it("picks up an entirely new workbook written out-of-band", async () => {
    const host = await freshHost();
    expect(host.listProjects().map((p) => p.id)).not.toContain("proj-new");

    // Write the JSONL log for a brand-new workbook, mimicking what a
    // second `fdpm workbook create` invocation would produce.
    const projectDir = join(dataDir, "workbooks", "proj-new");
    mkdirSync(projectDir, { recursive: true });
    const op = JSON.stringify({
      op_id: "01JZZZNEW0000000000000000A",
      kind: "workbook.create",
      workbook_id: "proj-new",
      payload: {
        workbook_id: "proj-new",
        name: "New OOB Workbook",
        profile_id: "profile:formal-specification:3.0",
      },
      actor: "test:oob",
      plugin_id: null,
      timestamp: "2026-05-05T00:00:01.000Z",
      revision: 1,
      request_id: "00000000-0000-7000-8000-000000000new",
      parent_op_id: null,
      causation_op_id: null,
      schema_version: "1.2.0",
    });
    writeFileSync(join(projectDir, "log.jsonl"), op + "\n", "utf8");

    const result = await host.reload();
    expect(result.workbooks).toContain("proj-new");
    expect(host.listProjects().map((p) => p.id)).toContain("proj-new");
  });

  it("is idempotent against an unchanged data dir", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-idem",
      name: "Idempotent",
      profile_id: "profile:formal-specification:3.0",
    });

    const result1 = await host.reload();
    const result2 = await host.reload();

    expect(result1.workbooks).toEqual(result2.workbooks);
    // Same workbook visible after both reloads.
    expect(host.getProject("proj-idem").workbook.id).toBe("proj-idem");
  });

  it("preserves the Host reference identity across reload", async () => {
    const host = await freshHost();
    const before = host;
    await host.reload();
    // Same object — callers (CLI / REPL / MCP) that captured `host`
    // by closure keep working.
    expect(host).toBe(before);
  });
});

describe("Host.statProjectLog", () => {
  it("returns null when no persistence layer is configured", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
    });
    await host.load();
    expect(host.statProjectLog("anything")).toBeNull();
  });

  it("returns null for a workbook whose log does not exist", async () => {
    const host = await freshHost();
    expect(host.statProjectLog("never-created")).toBeNull();
  });

  it("returns (mtime_ns, size) after a workbook is created", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "proj-stat",
      name: "Stat",
      profile_id: "profile:formal-specification:3.0",
    });
    const stat = host.statProjectLog("proj-stat");
    expect(stat).not.toBeNull();
    expect(typeof stat!.mtime_ns).toBe("bigint");
    expect(typeof stat!.size).toBe("bigint");
    expect(stat!.size).toBeGreaterThan(0n);
  });
});
