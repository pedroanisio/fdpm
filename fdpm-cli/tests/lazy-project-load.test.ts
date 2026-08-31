/**
 * Lazy per-workbook materialisation.
 *
 * `Host.load()` used to call `readAllLogs()`: opening any workbook read,
 * Zod-parsed and replayed every workbook in the data directory, so a CLI
 * invocation that touched one document paid for the whole corpus — 1.5 s
 * at 50 MB, 59 s at 1.8 GB. A workbook's log is now read the first time
 * something asks for that workbook.
 *
 * The risk that buys is staleness and partial views, so these tests pin
 * the boundary: what stays unloaded, what forces a full load because its
 * answer cannot be known otherwise, and that a lazily-loaded workbook
 * behaves identically to an eagerly-loaded one on the write path.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { TEST_PROFILE } from "./fixtures.js";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "fdpm-lazy-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function open(dataDir: string): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  try {
    await host.registerProfile(TEST_PROFILE);
  } catch {
    /* persisted by an earlier host over the same directory */
  }
  return host;
}

/** Three workbooks, one primitive each. */
async function seed(dataDir: string): Promise<void> {
  const host = await open(dataDir);
  for (const id of ["alpha", "beta", "gamma"]) {
    await host.createProject({ workbook_id: id, name: id, profile_id: TEST_PROFILE.id });
    await host.createPrimitive(id, {
      id: `section:${id}`,
      type_id: "test:section",
      field_values: { title: id, number: 1 },
    });
  }
  await host.close();
}

describe("lazy materialisation", () => {
  it("loads nothing until a workbook is asked for", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);
    expect(host.store.materialisedProjectIds()).toEqual([]);
  });

  it("loads only the workbook that was asked for", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);

    const slice = host.getProject("beta");
    expect(Object.keys(slice.primitives)).toEqual(["section:beta"]);
    expect(host.store.materialisedProjectIds()).toEqual(["beta"]);
  });

  it("materialises everything for listProjects, whose answer spans workbooks", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);
    expect(host.listProjects().map((p) => p.id).sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("materialises everything for a uid lookup, which names no workbook", async () => {
    const dir = tmp();
    await seed(dir);

    const finder = await open(dir);
    const uid = finder.getProject("gamma").primitives["section:gamma"]!.uid;

    const fresh = await open(dir);
    expect(fresh.store.materialisedProjectIds()).toEqual([]);
    const hit = fresh.store.lookupUid(uid);
    expect(hit).toEqual({ workbook_id: "gamma", kind: "primitive", id: "section:gamma" });
  });

  it("writes to a lazily-loaded workbook continue its revision sequence", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);

    // `alpha` has never been read in this process; the append must load
    // it first or it will mint revision 1 over an existing log.
    const { append } = await host.createPrimitive("alpha", {
      id: "section:added",
      type_id: "test:section",
      field_values: { title: "added", number: 2 },
    });
    expect(append.op.revision).toBe(3);

    const log = await host.persistence!.readLog("alpha");
    const revisions = log.map((o) => o.revision);
    expect(revisions).toEqual([1, 2, 3]);
    await host.close();

    const reopened = await open(dir);
    expect(Object.keys(reopened.getProject("alpha").primitives).sort()).toEqual([
      "section:added",
      "section:alpha",
    ]);
  });

  it("sees a workbook another process created after this host loaded", async () => {
    const dir = tmp();
    await seed(dir);
    const reader = await open(dir);

    const writer = await open(dir);
    await writer.createProject({ workbook_id: "delta", name: "delta", profile_id: TEST_PROFILE.id });
    await writer.createPrimitive("delta", {
      id: "section:delta",
      type_id: "test:section",
      field_values: { title: "d", number: 1 },
    });
    await writer.close();

    // `reader` loaded before `delta` existed; discovery is by directory
    // listing at access time, not a snapshot taken at startup.
    expect(Object.keys(reader.getProject("delta").primitives)).toEqual(["section:delta"]);
    expect(reader.listProjects().map((p) => p.id).sort()).toEqual([
      "alpha",
      "beta",
      "delta",
      "gamma",
    ]);
  });

  it("reports a genuinely unknown workbook as not_found", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);
    expect(() => host.getProject("nope")).toThrow(/not found/);
  });

  it("keeps the operation log complete for a lazily-loaded workbook", async () => {
    const dir = tmp();
    await seed(dir);
    const host = await open(dir);
    // getLog, getProjectAt and rollback all read this; a partial log
    // would corrupt every one of them.
    expect(host.store.getOperationLog("beta").map((o) => o.revision)).toEqual([1, 2]);
    expect(Object.keys(host.store.getProjectAt("beta", 1).primitives)).toEqual([]);
  });
});
