/**
 * SPEC-MCP-SERVER §13 + §22.7 — plugin-tool exposure stub.
 *
 * v0.1 ships `discoverPluginTools` as a deliberate stub: even when
 * an operator opts in via `FDPM_MCP_ENABLE_PLUGINS`, no plugin-
 * supplied MCP tools are exposed because the SPEC-PLUGGABLE-
 * ARCHITECTURE amendment introducing the `mcp_tool` capability has
 * not landed yet.
 *
 * These tests guard the security posture: a future refactor that
 * accidentally lets plugin tools leak into the manifest will break
 * this suite.
 *
 * §22.7 acceptance is partially satisfied here — the full pass
 * requires the amendment + a real test plugin declaring an
 * `mcp_tool` capability. Until then, this suite asserts the
 * weaker but still-useful invariant: zero plugin tools leak through
 * regardless of opt-in.
 */

import { describe, it, expect } from "vitest";
import { Host } from "../../src/core/host.js";
import { TEST_PROFILE } from "../fixtures.js";
import { discoverPluginTools } from "../../src/mcp/plugin-tools.js";
import { advertisedTools } from "../../src/mcp/manifest.js";

async function makeHost(): Promise<Host> {
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}

describe("plugin-tools stub — discoverPluginTools()", () => {
  it("returns [] silently when the enabled-plugins list is empty", async () => {
    const host = await makeHost();
    const original = process.stderr.write.bind(process.stderr);
    let captured = "";
    // Capture stderr to assert silence.
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (
      s: string,
    ): boolean => {
      captured += s;
      return true;
    };
    try {
      const out = discoverPluginTools(host, []);
      expect(out).toEqual([]);
      expect(captured).toBe("");
    } finally {
      (process.stderr as unknown as { write: typeof original }).write = original;
    }
  });

  it("returns [] AND emits a stderr warning when plugins are listed (opt-in is no-op in v0.1)", async () => {
    const host = await makeHost();
    const original = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (
      s: string,
    ): boolean => {
      captured += s;
      return true;
    };
    try {
      const out = discoverPluginTools(host, ["fdpm.dnis", "test-plugin"]);
      expect(out).toEqual([]);
      // emitHostWarning emits human-format `warning: <message>` by default
      // (no --json flag in test argv), or a JSONL `{"warning":...}` line.
      expect(captured.toLowerCase()).toContain("plugin-tool");
      expect(captured).toContain("fdpm.dnis,test-plugin");
      expect(captured).toContain("mcp_tool capability is unimplemented");
    } finally {
      (process.stderr as unknown as { write: typeof original }).write = original;
    }
  });
});

describe("plugin-tools stub — advertised tool list never grows from plugins (SPEC §22.7)", () => {
  it("baseline: tool list with no plugins enabled", async () => {
    const host = await makeHost();
    const baseline = advertisedTools({ enableDestructive: false });
    const baselinePlusStub = [
      ...baseline,
      ...discoverPluginTools(host, []),
    ];
    expect(baselinePlusStub.length).toBe(baseline.length);
  });

  it("opting plugins in does NOT add any tools to the advertised surface (v0.1 stub)", async () => {
    const host = await makeHost();
    const baseline = advertisedTools({ enableDestructive: false });
    const withOptIn = [
      ...baseline,
      ...discoverPluginTools(host, ["any-plugin", "fdpm.dnis"]),
    ];
    // Same length: no plugin tool leaked in.
    expect(withOptIn.length).toBe(baseline.length);
    // Same names: surface unchanged.
    expect(withOptIn.map((t) => t.name).sort()).toEqual(
      baseline.map((t) => t.name).sort(),
    );
  });

  it("the opt-in stub is also a no-op when destructive is enabled", async () => {
    const host = await makeHost();
    const baseline = advertisedTools({ enableDestructive: true });
    const withOptIn = [
      ...baseline,
      ...discoverPluginTools(host, ["plugin-a", "plugin-b"]),
    ];
    expect(withOptIn.length).toBe(baseline.length);
  });
});
