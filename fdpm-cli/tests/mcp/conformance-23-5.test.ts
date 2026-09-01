/**
 * SPEC-MCP-SERVER §23.5 — HTTP transport refusal in v0.1.
 *
 * Spawns the built `fdpm-mcp` binary with an HTTP transport flag and
 * asserts:
 *   - exit code is non-zero (the process refuses to start),
 *   - stderr carries the SPEC §6.1 / v0.2 deferral pointer.
 *
 * Requires `dist/src/bin/fdpm-mcp.js` to exist. If the build artefact
 * is missing, the test is skipped with a pointer to `npm run build`
 * instead of failing — this preserves CI signal for the rest of the
 * suite while keeping the conformance gate explicit.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "..", "..", "dist", "src", "bin", "fdpm-mcp.js");

describe("SPEC §23.5 — HTTP transport refusal", () => {
  it.skipIf(!existsSync(BIN))(
    "refuses to start with --http-port 8080; exit code != 0; stderr names fdpm-mcp-http",
    () => {
      const result = spawnSync(process.execPath, [BIN, "--http-port", "8080"], {
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.status).not.toBe(0);
      expect(result.status).not.toBeNull();
      const stderr = String(result.stderr ?? "");
      // The refusal must be actionable. Until 2026-08-31 it pointed at a
      // v0.2 deferral; the remote transport now exists, so it must name
      // the binary that provides it. Both conditions are asserted, which
      // is strictly stronger than the "either §6.1 or v0.2" it replaced.
      expect(stderr, `refusal did not name the alternative binary; got:\n${stderr}`).toContain(
        "fdpm-mcp-http",
      );
      expect(stderr).toContain("stdio only");
      expect(stderr, "refusal still cites the retired v0.2 deferral").not.toContain("v0.2");
    },
  );

  it.skipIf(!existsSync(BIN))(
    "refuses --http-host as well",
    () => {
      const result = spawnSync(
        process.execPath,
        [BIN, "--http-host", "127.0.0.1"],
        { encoding: "utf8", timeout: 5_000 },
      );
      expect(result.status).not.toBe(0);
      expect(String(result.stderr ?? "")).toContain("fdpm-mcp-http");
    },
  );

  it.skipIf(!existsSync(BIN))(
    "refuses --sse",
    () => {
      const result = spawnSync(process.execPath, [BIN, "--sse"], {
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.status).not.toBe(0);
      expect(String(result.stderr ?? "")).toContain("fdpm-mcp-http");
    },
  );
});
