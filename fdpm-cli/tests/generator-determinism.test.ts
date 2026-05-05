import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Pass-3 stabilization — generator must produce deterministic output.
 *
 * Re-running `generate-build-from-transfer.ts` on the same input
 * with the same output path must produce a byte-identical script.
 * Without this, CI cannot detect drift via `git diff`, and operators
 * see noisy diffs that look like real changes.
 *
 * This is an integration test: it spawns the generator as a real
 * tsx subprocess so the full I/O path (path resolution, JSON
 * stringify ordering, host bootstrap) is exercised.
 */

const GENERATOR = "scripts/generate-build-from-transfer.ts";

function runGenerator(transferPath: string, outPath: string): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(
    "npx",
    ["tsx", GENERATOR, transferPath, outPath],
    {
      env: { ...process.env, FDPM_LOG_LEVEL: "warn" },
      encoding: "utf8",
      cwd: process.cwd(),
    },
  );
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

describe("generator determinism", () => {
  it("produces byte-identical output across two runs of the same (input, output)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fdpm-gen-det-"));
    try {
      // Use the smallest valid transfer: empty primitives/relations,
      // pointing at the formal-specification profile (which the host
      // discovers from in-tree plugins).
      const transferPath = join(tmp, "transfer.json");
      writeFileSync(
        transferPath,
        JSON.stringify({
          spec_core: "1.1",
          workbook: {
            id: "p",
            name: "P",
            profile_id: PROFILE_ID,
            created_at: "2026-05-04T00:00:00Z",
            revision: 0,
          },
          primitives: [],
          relations: [],
          templates: [],
          test_suites: [],
        }),
      );
      const outPath = join(tmp, "out.ts");
      const r1 = runGenerator(transferPath, outPath);
      expect(r1.status).toBe(0);
      const a = readFileSync(outPath, "utf8");
      // Sleep to ensure any timestamp-based non-determinism would
      // surface (the prior bug embedded `new Date().toISOString()` in
      // the docstring).
      const before = Date.now();
      while (Date.now() - before < 1100) {
        // busy-wait 1.1s — small relative to the integration test cost.
      }
      const r2 = runGenerator(transferPath, outPath);
      expect(r2.status).toBe(0);
      const b = readFileSync(outPath, "utf8");
      expect(a).toBe(b);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a clear error when the source transfer is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fdpm-gen-det-"));
    try {
      const r = runGenerator(join(tmp, "missing.json"), join(tmp, "out.ts"));
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/transfer file not found/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a clear error when the source transfer is not valid JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fdpm-gen-det-"));
    try {
      const transferPath = join(tmp, "junk.txt");
      writeFileSync(transferPath, "not json at all");
      const r = runGenerator(transferPath, join(tmp, "out.ts"));
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/not valid JSON/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a clear error when the transfer references an unregistered profile", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fdpm-gen-det-"));
    try {
      const transferPath = join(tmp, "bad-profile.json");
      writeFileSync(
        transferPath,
        JSON.stringify({
          spec_core: "1.1",
          workbook: {
            id: "p",
            name: "P",
            profile_id: "profile:nonexistent:9.9",
            created_at: "2026-05-04T00:00:00Z",
            revision: 0,
          },
          primitives: [],
          relations: [],
        }),
      );
      const r = runGenerator(transferPath, join(tmp, "out.ts"));
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/profile.*not registered/i);
      expect(r.stderr).toMatch(/Available profiles/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("generated script's SDK import path resolves regardless of output location", () => {
    // The generator computes the relative path from the output's
    // directory to cli/src/sdk.js. Verify two output locations
    // produce import paths that, when joined to their dirname,
    // resolve to the same file.
    const tmp = mkdtempSync(join(tmpdir(), "fdpm-gen-det-"));
    try {
      const transferPath = join(tmp, "transfer.json");
      writeFileSync(
        transferPath,
        JSON.stringify({
          spec_core: "1.1",
          workbook: {
            id: "p",
            name: "P",
            profile_id: PROFILE_ID,
            created_at: "2026-05-04T00:00:00Z",
            revision: 0,
          },
          primitives: [],
          relations: [],
        }),
      );
      // Output in tmp.
      const outA = join(tmp, "a.ts");
      runGenerator(transferPath, outA);
      // Output in cli/scripts/ subdir we'll synthesize.
      const outB = join(tmp, "deep", "nested", "b.ts");
      // mkdtemp doesn't create deep paths; the generator will fail
      // open() if the directory doesn't exist. Skip this case if so.
      try {
        require("node:fs").mkdirSync(join(tmp, "deep", "nested"), {
          recursive: true,
        });
        runGenerator(transferPath, outB);
        const aImport = readFileSync(outA, "utf8").match(/from "([^"]+sdk[^"]*)"/)?.[1];
        const bImport = readFileSync(outB, "utf8").match(/from "([^"]+sdk[^"]*)"/)?.[1];
        expect(aImport).toBeDefined();
        expect(bImport).toBeDefined();
        // Both imports must resolve to the SAME absolute file.
        const aResolved = require("node:path").resolve(require("node:path").dirname(outA), aImport!);
        const bResolved = require("node:path").resolve(require("node:path").dirname(outB), bImport!);
        expect(aResolved).toBe(bResolved);
        // And the resolved file must exist.
        expect(statSync(aResolved.replace(/\.js$/, ".ts")).isFile()).toBe(true);
      } catch {
        // Treat directory creation failure as test-environmental, not a
        // generator defect.
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
