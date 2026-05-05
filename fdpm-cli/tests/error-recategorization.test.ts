import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FDPMException,
  EXIT_CODE_FOR_CATEGORY,
  HTTP_STATUS_FOR_CATEGORY,
} from "../src/core/errors/fdpm-exception.js";
import { JsonlLogStore } from "../src/persistence/jsonl-log.js";
import { upcastPayload } from "../src/core/operations/upcast.js";
import type { Operation } from "../src/core/operations/operation.js";

/** Test stub: only the fields upcasters read (op_id) need to be valid. */
const stubOp = (kind: Operation["kind"] = "primitive.create"): Operation => ({
  op_id: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
  kind,
  workbook_id: "p",
  schema_version: "1.1.0",
  revision: 0,
  timestamp: "2026-05-04T00:00:00.000Z",
  request_id: "00000000-0000-7000-8000-000000000000",
  payload: {},
});

/**
 * Issue-B regression tests.
 *
 * Three throws used to be miscategorized as `internal` (HTTP 500, exit 70).
 * After the fix:
 *
 *   site                                       | category     | exit | http
 *   -------------------------------------------|--------------|------|----
 *   jsonl-log.ts JSON.parse failure            | verification |  3   | 400
 *   upcast.ts no-upcaster-chain                | host_compat  | 10   | 409
 *   upcast.ts depth-exceeded (registered cycle)| internal     | 70   | 500
 *
 * The third deliberately stays `internal` — it is a host bug (the upcaster
 * map contains a cycle), not a recoverable input/compat condition.
 *
 * These tests pin the categories AND the matching exit codes, because the
 * exit code is the actual operator-visible contract (CI scripts grep on it).
 */

function makeTempDir(): string {
  const dir = join(tmpdir(), `fdpm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Issue-B — JSONL corrupt log surfaces as `verification`", () => {
  it("throws FDPMException with category=verification on bad JSON", async () => {
    const dir = makeTempDir();
    try {
      const projectDir = join(dir, "workbooks", "demo");
      mkdirSync(projectDir, { recursive: true });
      const logPath = join(projectDir, "log.jsonl");
      // Corrupt JSON on line 1 — `JSON.parse` fails before the schema
      // validator runs, exercising the corrupt-log branch (not the
      // schema-violation branch tested separately below).
      await fs.writeFile(logPath, "{this is not json\n", "utf8");

      const store = new JsonlLogStore(dir);
      let caught: unknown;
      try {
        await store.readLog("demo");
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(FDPMException);
      const fdpm = caught as FDPMException;
      expect(fdpm.category).toBe("verification");
      // Same exit code as the adjacent `invalid operation` throw (line 99
      // of jsonl-log.ts). Adjacent throws should not have different exit
      // codes — that was the original bug.
      expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(3);
      expect(HTTP_STATUS_FOR_CATEGORY[fdpm.category]).toBe(400);
      expect(fdpm.message).toMatch(/corrupt log at /);
      expect(fdpm.message).toMatch(/:1:/); // line 1 surfaced
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("attaches structured evidence (path, line, parse_error)", async () => {
    const dir = makeTempDir();
    try {
      const projectDir = join(dir, "workbooks", "demo");
      mkdirSync(projectDir, { recursive: true });
      const logPath = join(projectDir, "log.jsonl");
      await fs.writeFile(logPath, "{not-json\n", "utf8");

      const store = new JsonlLogStore(dir);
      let caught: unknown;
      try {
        await store.readLog("demo");
      } catch (err) {
        caught = err;
      }

      const fdpm = caught as FDPMException;
      expect(fdpm.evidence).toBeDefined();
      expect(fdpm.evidence?.["path"]).toBe(logPath);
      expect(fdpm.evidence?.["line"]).toBe(1);
      expect(typeof fdpm.evidence?.["parse_error"]).toBe("string");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema-violation throw on a different line still uses category=verification", async () => {
    // Existing behaviour — kept here so the two adjacent throws stay in
    // sync. If a future change splits them again, this test fails first.
    const dir = makeTempDir();
    try {
      const projectDir = join(dir, "workbooks", "demo");
      mkdirSync(projectDir, { recursive: true });
      const logPath = join(projectDir, "log.jsonl");
      // Valid JSON, but does not match Operation schema.
      await fs.writeFile(logPath, '{"not_an_operation": true}\n', "utf8");

      const store = new JsonlLogStore(dir);
      let caught: unknown;
      try {
        await store.readLog("demo");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(FDPMException);
      expect((caught as FDPMException).category).toBe("verification");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Issue-B — upcast no-chain surfaces as `host_compat`", () => {
  it("throws FDPMException with category=host_compat when no upcaster is registered", () => {
    let caught: unknown;
    try {
      // primitive.create exists as a kind, but no upcaster has been
      // registered to walk from `0.9.0` up to the current version.
      upcastPayload("primitive.create", "0.9.0", { id: "section:x" }, stubOp());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    expect(fdpm.category).toBe("host_compat");
    expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(10);
    expect(HTTP_STATUS_FOR_CATEGORY[fdpm.category]).toBe(409);
    expect(fdpm.message).toMatch(/no upcaster chain/);
  });

  it("attaches structured evidence (kind, from_version, target_version, stuck_at)", () => {
    let caught: unknown;
    try {
      upcastPayload("primitive.create", "0.9.0", {}, stubOp());
    } catch (err) {
      caught = err;
    }
    const fdpm = caught as FDPMException;
    expect(fdpm.evidence).toEqual({
      kind: "primitive.create",
      from_version: "0.9.0",
      target_version: "1.2.0",
      stuck_at: "0.9.0",
    });
  });

  it("returns the payload unchanged when versions already match (no throw)", () => {
    const payload = { id: "section:x", type_id: "test:section" };
    const out = upcastPayload("primitive.create", "1.2.0", payload, stubOp());
    expect(out).toBe(payload);
  });
});

describe("Issue-B — upcast depth-exceeded stays `internal` (host bug)", () => {
  // We use the public `registerUpcaster` to install a deliberate cycle.
  // This is not user-reachable but proves the third throw still classifies
  // a misconfigured host as `internal` — operator cannot fix it.
  it("a registered cycle hits the depth limit and surfaces as internal", async () => {
    const { registerUpcaster } = await import("../src/core/operations/upcast.js");
    // Cycle: a -> b -> a -> b -> ... will loop hop=32 times then throw.
    registerUpcaster("primitive.create", "0.0.1-cycle-a", "0.0.1-cycle-b", (p) => p);
    registerUpcaster("primitive.create", "0.0.1-cycle-b", "0.0.1-cycle-a", (p) => p);

    let caught: unknown;
    try {
      upcastPayload("primitive.create", "0.0.1-cycle-a", {}, stubOp());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(FDPMException);
    const fdpm = caught as FDPMException;
    expect(fdpm.category).toBe("internal");
    expect(EXIT_CODE_FOR_CATEGORY[fdpm.category]).toBe(70);
    expect(fdpm.message).toBe("upcaster chain depth exceeded");
    // Evidence should still be attached so a host bug report has the
    // kind+last-version pinned.
    expect(fdpm.evidence?.["kind"]).toBe("primitive.create");
    expect(fdpm.evidence?.["from_version"]).toBe("0.0.1-cycle-a");
    expect(typeof fdpm.evidence?.["last_version"]).toBe("string");
  });
});

describe("Issue-B — exit-code contract", () => {
  // The whole point of the recategorization is that a CI script grepping
  // on `$?` after a `fdpm` invocation gets a meaningful number. Pin those.
  it("exit code map matches operator expectations", () => {
    expect(EXIT_CODE_FOR_CATEGORY.verification).toBe(3); // bad input / contract
    expect(EXIT_CODE_FOR_CATEGORY.validation).toBe(2); // profile-rule failure
    expect(EXIT_CODE_FOR_CATEGORY.host_compat).toBe(10); // wrong host version
    expect(EXIT_CODE_FOR_CATEGORY.internal).toBe(70); // host bug
  });
});
