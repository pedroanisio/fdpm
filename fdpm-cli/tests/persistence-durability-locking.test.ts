/**
 * Operation-log durability and cross-process write safety.
 *
 * Two defects this pins, both measured before the fix
 * (`docs/architecture/PERFORMANCE-IO-ANALYSIS.md` §2.7, §2.8):
 *
 *   - concurrent writers computed the next revision from their own
 *     in-memory log and both wrote it. Two, four and eight writers
 *     produced 187, 201 and 490 duplicate revisions; at four writers the
 *     log held two `workbook.create` operations and could no longer be
 *     replayed at all.
 *   - `fs.appendFile` with no fsync acknowledged operations that lived
 *     only in the page cache.
 *
 * The lock is exercised here in-process (re-entrancy, mutual exclusion,
 * abandoned-lock recovery); the cross-process case is covered by the
 * benchmark harness, which spawns real writers.
 */
import { mkdtempSync, rmSync, existsSync, utimesSync, writeFileSync, readFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlLogStore } from "../src/persistence/jsonl-log.js";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { TEST_PROFILE } from "./fixtures.js";
import type { Operation } from "../src/core/operations/operation.js";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "fdpm-dur-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function op(workbook_id: string, revision: number, id: string): Operation {
  return {
    op_id: `01J${String(revision).padStart(23, "0")}`,
    kind: "primitive.create",
    workbook_id,
    payload: { id, uid: `01U${String(revision).padStart(23, "0")}`, type_id: "test:section", field_values: {} },
    actor: "test",
    plugin_id: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    revision,
    request_id: `0199${String(revision).padStart(28, "0")}`,
    parent_op_id: null,
    causation_op_id: null,
    schema_version: "1.1.0",
  } as Operation;
}

async function seededHost(dataDir: string): Promise<Host> {
  const host = new Host({ dataDir, noPlugins: true });
  await host.load();
  try {
    await host.registerProfile(TEST_PROFILE);
  } catch {
    /* already persisted by a previous host over the same dir */
  }
  return host;
}

describe("grouped appends", () => {
  it("writes a batch as one run of lines in order", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    await store.appendOps([op("wb", 1, "a"), op("wb", 2, "b"), op("wb", 3, "c")]);
    await store.close();

    const lines = readFileSync(join(dir, "workbooks", "wb", "log.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => (JSON.parse(l) as Operation).revision)).toEqual([1, 2, 3]);
  });

  it("refuses a batch spanning workbooks rather than splitting it", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    await expect(store.appendOps([op("wb-a", 1, "a"), op("wb-b", 2, "b")])).rejects.toThrow(
      FDPMException,
    );
  });

  it("keeps appending to the end across separate calls on one handle", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    await store.appendOps([op("wb", 1, "a")]);
    await store.appendOp(op("wb", 2, "b"));
    await store.appendOps([op("wb", 3, "c")]);
    const round = await store.readLog("wb");
    await store.close();
    expect(round.map((o) => o.revision)).toEqual([1, 2, 3]);
  });

  it("survives a workbook being deleted and recreated under a live store", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    await store.appendOps([op("wb", 1, "a")]);
    await store.deleteProject("wb");
    await store.appendOps([op("wb", 1, "a")]);
    const round = await store.readLog("wb");
    await store.close();
    expect(round).toHaveLength(1);
  });
});

describe("open handle budget", () => {
  it("caps open log handles regardless of how many workbooks are written", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    for (let i = 0; i < 200; i += 1) {
      await store.appendOps([op(`wb-${i}`, 1, `p-${i}`)]);
    }
    // Reusing handles is what makes appends cheap; keeping one per
    // workbook forever is what exhausts a long-lived process's fds.
    expect(store.openHandleCount()).toBeLessThanOrEqual(64);
    await store.close();
    expect(store.openHandleCount()).toBe(0);
  });

  it("keeps appending correctly after a handle has been evicted", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    await store.appendOps([op("wb-first", 1, "a")]);
    for (let i = 0; i < 100; i += 1) {
      await store.appendOps([op(`wb-filler-${i}`, 1, `p-${i}`)]);
    }
    // wb-first's handle is long gone; the append must reopen and land at
    // the end of the existing file rather than truncating it.
    await store.appendOps([op("wb-first", 2, "b")]);
    const round = await store.readLog("wb-first");
    await store.close();
    expect(round.map((o) => o.revision)).toEqual([1, 2]);
  });
});

describe("workbook write lock", () => {
  it("serialises concurrent critical sections", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    let active = 0;
    let maxActive = 0;
    const body = async (): Promise<void> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    };
    await Promise.all(
      Array.from({ length: 6 }, () => store.withWorkbookLock("wb", body)),
    );
    expect(maxActive).toBe(1);
  });

  it("is re-entrant within one store instance", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    const seen = await store.withWorkbookLock("wb", async () =>
      store.withWorkbookLock("wb", async () => "inner"),
    );
    expect(seen).toBe("inner");
  });

  it("releases the lock when the critical section throws", async () => {
    const store = new JsonlLogStore(tmp());
    store.init();
    await expect(
      store.withWorkbookLock("wb", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // A wedged lock would make this hang until the timeout and then throw.
    await expect(store.withWorkbookLock("wb", async () => "ok")).resolves.toBe("ok");
    expect(existsSync(join(store.dataDir, "workbooks", "wb", "log.lock"))).toBe(false);
  });

  it("breaks a lock left behind by a process that no longer exists", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    const lock = join(dir, "workbooks", "wb", "log.lock");
    await store.withWorkbookLock("wb", async () => undefined); // create the dir
    writeFileSync(
      lock,
      JSON.stringify({ pid: 2 ** 30, host: hostname(), acquired_at: new Date().toISOString() }),
    );
    await expect(store.withWorkbookLock("wb", async () => "recovered")).resolves.toBe(
      "recovered",
    );
  });

  it("does not steal a lock merely because it cannot be read", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    const lock = join(dir, "workbooks", "wb", "log.lock");
    await store.withWorkbookLock("wb", async () => undefined);
    writeFileSync(lock, "not json at all");

    // An unreadable lock is not a proven-abandoned one. Treating it as
    // abandoned is how a waiter walked into an occupied critical section
    // and two writers minted the same revision, so a fresh one is
    // respected and the caller waits.
    const settled = await Promise.race([
      store.withWorkbookLock("wb", async () => "stolen"),
      new Promise((r) => setTimeout(() => r("waited"), 300)),
    ]);
    expect(settled).toBe("waited");
  });

  it("breaks an unreadable lock once it is older than any live critical section", async () => {
    const dir = tmp();
    const store = new JsonlLogStore(dir);
    store.init();
    const lock = join(dir, "workbooks", "wb", "log.lock");
    await store.withWorkbookLock("wb", async () => undefined);
    writeFileSync(lock, "not json at all");
    // Age it past the staleness horizon: now it is provably abandoned.
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
    await expect(store.withWorkbookLock("wb", async () => "recovered")).resolves.toBe(
      "recovered",
    );
  });
});

describe("out-of-band writes", () => {
  it("reconciles a log that grew after this Host read it", async () => {
    const dir = tmp();
    const a = await seededHost(dir);
    await a.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
    await a.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });

    // `b` loads here, so its in-memory log stops at section:a...
    const b = await seededHost(dir);
    // ...and the file grows immediately afterwards.
    await a.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });

    // The trap this pins: if `b` stamped its log with the file's identity
    // *after* reading rather than before, a later growth can leave the
    // stamp matching while the in-memory log is short, and `b` mints a
    // revision that is already taken. `b` must reconcile instead.
    await b.createPrimitive("p", {
      id: "section:c",
      type_id: "test:section",
      field_values: { title: "C", number: 3 },
    });

    const log = await b.persistence!.readLog("p");
    const revisions = log.map((o) => o.revision);
    expect(new Set(revisions).size).toBe(revisions.length);

    const fresh = await seededHost(dir);
    expect(Object.keys(fresh.getProject("p").primitives).sort()).toEqual([
      "section:a",
      "section:b",
      "section:c",
    ]);
  });

  it("picks up another writer's operations before minting a revision", async () => {
    const dir = tmp();
    const a = await seededHost(dir);
    await a.createProject({ workbook_id: "p", name: "P", profile_id: TEST_PROFILE.id });
    await a.createPrimitive("p", {
      id: "section:a",
      type_id: "test:section",
      field_values: { title: "A", number: 1 },
    });

    // A second Host over the same directory — the second process.
    const b = await seededHost(dir);
    await b.createPrimitive("p", {
      id: "section:b",
      type_id: "test:section",
      field_values: { title: "B", number: 2 },
    });

    // `a` is now stale. Its next write must reconcile first rather than
    // reuse a revision `b` already took.
    await a.createPrimitive("p", {
      id: "section:c",
      type_id: "test:section",
      field_values: { title: "C", number: 3 },
    });

    const log = await a.persistence!.readLog("p");
    const revisions = log.map((o) => o.revision);
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(revisions).toEqual([...revisions].sort((x, y) => x - y));

    // And the log still replays into every primitive that was acked.
    const fresh = await seededHost(dir);
    expect(Object.keys(fresh.getProject("p").primitives).sort()).toEqual([
      "section:a",
      "section:b",
      "section:c",
    ]);
  });
});
