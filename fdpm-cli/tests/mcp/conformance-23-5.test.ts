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
    "refuses to start with --http-port 8080; exit code != 0; stderr cites §6.1 / v0.2",
    () => {
      const result = spawnSync(process.execPath, [BIN, "--http-port", "8080"], {
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.status).not.toBe(0);
      expect(result.status).not.toBeNull();
      const stderr = String(result.stderr ?? "");
      // The bin entry writes a clear refusal banner. Either §6.1 or
      // v0.2 must appear (current message includes both).
      const matchesSection = stderr.includes("§6.1") || stderr.includes("6.1");
      const matchesVersion = stderr.includes("v0.2");
      expect(
        matchesSection || matchesVersion,
        `stderr did not cite §6.1 or v0.2 deferral; got:\n${stderr}`,
      ).toBe(true);
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
      expect(String(result.stderr ?? "")).toContain("HTTP transport");
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
      expect(String(result.stderr ?? "")).toContain("HTTP transport");
    },
  );
});
