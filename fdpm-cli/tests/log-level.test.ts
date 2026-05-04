import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Host } from "../src/core/host.js";

/**
 * §6.6 plugin-logger threshold (#9 — quiet plugin banners on --json).
 *
 * The plugin logger honours `FDPM_LOG_LEVEL`. The CLI wrapper sets it to
 * `warn` automatically when --json is in argv (so machine-readable output
 * is not preceded by activation banners). These tests verify the logger
 * threshold itself; the CLI-level wrapping is verified by reading
 * src/bin/fdpm.ts (covered by the earlier edit-and-batch suite via
 * exit-code assertions, not stderr capture).
 */
describe("§6.6 plugin logger — FDPM_LOG_LEVEL threshold", () => {
  let originalLevel: string | undefined;
  let captured: string[] = [];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalLevel = process.env["FDPM_LOG_LEVEL"];
    captured = [];
    originalWrite = process.stderr.write.bind(process.stderr);
    // Capture stderr writes for assertion. Cast through unknown — vitest
    // and Node's stream typing for write() is heavy; we just need to
    // record strings.
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as unknown as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    if (originalLevel === undefined) delete process.env["FDPM_LOG_LEVEL"];
    else process.env["FDPM_LOG_LEVEL"] = originalLevel;
  });

  it("emits info banners by default", async () => {
    delete process.env["FDPM_LOG_LEVEL"];
    const host = new Host({ dataDir: null });
    await host.load();
    expect(captured.some((s) => s.includes("[info]"))).toBe(true);
  });

  it("suppresses info banners when FDPM_LOG_LEVEL=warn", async () => {
    process.env["FDPM_LOG_LEVEL"] = "warn";
    const host = new Host({ dataDir: null });
    await host.load();
    expect(captured.some((s) => s.includes("[info]"))).toBe(false);
  });

  it("suppresses everything when FDPM_LOG_LEVEL=silent", async () => {
    process.env["FDPM_LOG_LEVEL"] = "silent";
    const host = new Host({ dataDir: null });
    await host.load();
    // Plugin info banners are the only stderr output during clean load.
    expect(captured.filter((s) => s.includes("[plugin:")).length).toBe(0);
  });

  it("falls back to info on unknown level value", async () => {
    process.env["FDPM_LOG_LEVEL"] = "nonsense";
    const host = new Host({ dataDir: null });
    await host.load();
    expect(captured.some((s) => s.includes("[info]"))).toBe(true);
  });
});
