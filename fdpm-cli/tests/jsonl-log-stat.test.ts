/**
 * JsonlLogStore.statProjectLog — SPEC-REPL §10.2 freshness check.
 *
 * Verifies the contract used by the REPL's pre-dispatch freshness
 * gate: returns (mtime_ms, size) when the workbook's log exists,
 * `null` when it does not, and reflects out-of-band appends without
 * caching.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonlLogStore } from "../src/persistence/jsonl-log.js";

let dataDir: string;
let store: JsonlLogStore;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fdpm-jsonl-stat-"));
  store = new JsonlLogStore(dataDir);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("JsonlLogStore.statProjectLog", () => {
  it("returns null for a workbook whose log file does not exist", () => {
    expect(store.statProjectLog("never-created")).toBeNull();
  });

  it("returns mtime_ns and size for an existing log", () => {
    const projectDir = join(dataDir, "workbooks", "p");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "log.jsonl"), '{"hello":"world"}\n', "utf8");

    const stat = store.statProjectLog("p");
    expect(stat).not.toBeNull();
    expect(stat!.size).toBe(BigInt('{"hello":"world"}\n'.length));
    expect(stat!.mtime_ns).toBeGreaterThan(0n);
  });

  it("reflects out-of-band appends — not cached across calls", async () => {
    const projectDir = join(dataDir, "workbooks", "p");
    mkdirSync(projectDir, { recursive: true });
    const path = join(projectDir, "log.jsonl");
    writeFileSync(path, '{"op":"a"}\n', "utf8");

    const before = store.statProjectLog("p")!;
    // Sleep ≥1 ms so mtime can advance on filesystems with ms resolution.
    await new Promise((r) => setTimeout(r, 5));
    appendFileSync(path, '{"op":"b"}\n', "utf8");
    const after = store.statProjectLog("p")!;

    expect(after.size).toBeGreaterThan(before.size);
    expect(after.mtime_ns).toBeGreaterThanOrEqual(before.mtime_ns);
  });
});
