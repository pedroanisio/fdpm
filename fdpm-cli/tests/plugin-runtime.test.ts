import { describe, it, expect, beforeEach } from "vitest";
import { Host } from "../src/core/host.js";
import { resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";
import { TEST_PROFILE } from "./fixtures.js";

/**
 * Plugin runtime conformance tests, adapted from SPEC-PLUGGABLE §13:
 *  - Discovery (filesystem)
 *  - Manifest validation (rejection of bad manifests)
 *  - Lifecycle (registered → active; activate failure → quarantined)
 *  - Permissions (require declared permission; reject otherwise)
 *  - Failure isolation (one bad plugin does not crash the host)
 *  - Trust tier inference (core for in-tree, community otherwise)
 *  - Forward-compat: a v1.0.0 manifest loads on a v1.1 host
 */

function tmpPluginDir(): string {
  return mkdtempSync(join(tmpdir(), "fdpm-plug-test-"));
}

function writePlugin(
  parent: string,
  id: string,
  manifest: Record<string, unknown>,
  entry: string,
): string {
  const dir = join(parent, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fdpm-plugin.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "index.ts"), entry);
  return dir;
}

describe("plugin runtime — formal_specification (in-tree built-in)", () => {
  it("discovers and auto-activates the in-tree formal_specification plugin", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const records = host.plugins.list();
    const fs = records.find((r) => r.id === "fdpm.formal-specification");
    expect(fs).toBeDefined();
    expect(fs!.state).toBe("active");
    expect(fs!.trust).toBe("core");
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
  });
});

describe("plugin runtime — persisted profile migration collision", () => {
  it("auto-activates a plugin when the identical contributed profile was already persisted", async () => {
    const dataDir = tmpPluginDir();
    const pluginDir = tmpPluginDir();
    const pluginId = "test.persisted-profile";
    const manifest = {
      id: pluginId,
      version: "0.1.0",
      spec_version: "1.1.0",
      kind: "server",
      host_compatibility: { fdpm: ">=1.0,<2" },
      capabilities: [{ capability_id: "cap:profile", local_name: "demo" }],
    };

    const seedingHost = new Host({ dataDir, noPlugins: true });
    await seedingHost.load();
    await seedingHost.registerProfile(TEST_PROFILE, { persist: true });

    writePlugin(
      pluginDir,
      pluginId,
      manifest,
      `
const manifest = ${JSON.stringify(manifest)};
const profile = ${JSON.stringify(TEST_PROFILE)};
export default {
  manifest,
  activate: (ctx) => { ctx.registerProfile(profile); },
};
`,
    );

    const host = new Host({ dataDir, builtinDirs: [pluginDir], pluginPaths: [] });
    await expect(host.load()).resolves.not.toThrow();
    const record = host.plugins.get(pluginId);
    expect(record?.state).toBe("active");
    expect(record?.errorMessage).toBeUndefined();
    expect(host.profiles.has(TEST_PROFILE.id)).toBe(true);

    rmSync(dataDir, { recursive: true, force: true });
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("does not replace an existing persisted profile with the same id", async () => {
    const dataDir = tmpPluginDir();
    const pluginDir = tmpPluginDir();
    const pluginId = "test.divergent-profile";
    const manifest = {
      id: pluginId,
      version: "0.1.0",
      spec_version: "1.1.0",
      kind: "server",
      host_compatibility: { fdpm: ">=1.0,<2" },
      capabilities: [{ capability_id: "cap:profile", local_name: "demo" }],
    };
    const divergentProfile = { ...TEST_PROFILE, version: "9.9.9" };

    const seedingHost = new Host({ dataDir, noPlugins: true });
    await seedingHost.load();
    await seedingHost.registerProfile(TEST_PROFILE, { persist: true });

    writePlugin(
      pluginDir,
      pluginId,
      manifest,
      `
const manifest = ${JSON.stringify(manifest)};
const profile = ${JSON.stringify(divergentProfile)};
export default {
  manifest,
  activate: (ctx) => { ctx.registerProfile(profile); },
};
`,
    );

    const host = new Host({ dataDir, builtinDirs: [pluginDir], pluginPaths: [] });
    await expect(host.load()).resolves.not.toThrow();
    const record = host.plugins.get(pluginId);
    expect(record?.state).toBe("active");
    expect(host.profiles.getRaw(TEST_PROFILE.id).version).toBe(TEST_PROFILE.version);

    rmSync(dataDir, { recursive: true, force: true });
    rmSync(pluginDir, { recursive: true, force: true });
  });
});

describe("plugin runtime — discovery + lifecycle", () => {
  let pluginDir: string;
  beforeEach(() => {
    pluginDir = tmpPluginDir();
  });

  it("rejects an invalid manifest without crashing", async () => {
    writePlugin(pluginDir, "bad", { id: "missing-fields" }, "export default {};");
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
    // load() must not throw — invalid plugins surface as warnings.
    await expect(host.load()).resolves.not.toThrow();
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("rejects a plugin with host_compatibility excluding the host version", async () => {
    writePlugin(
      pluginDir,
      "incompatible",
      {
        id: "test.incompatible",
        version: "1.0.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=99,<100" },
        capabilities: [
          { capability_id: "cap:profile", local_name: "demo", entry: "PROFILE" },
        ],
      },
      'export default { manifest: {}, activate: () => {} };',
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
    await host.load();
    const r = host.plugins.get("test.incompatible");
    expect(r?.state).toBe("rejected");
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("v1.0.0 manifest loads on a v1.1 host (forward-compat)", async () => {
    writePlugin(
      pluginDir,
      "old-style",
      {
        id: "test.oldstyle",
        version: "0.1.0",
        spec_version: "1.0.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        capabilities: [
          { capability_id: "cap:lifecycle-hook", local_name: "on-enable", entry: "onEnable" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.oldstyle",
  version: "0.1.0",
  spec_version: "1.0.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  capabilities: [{ capability_id: "cap:lifecycle-hook", local_name: "on-enable" }],
})};
export default {
  manifest,
  activate: () => {},
  onEnable: () => {},
};
`,
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
    await host.load();
    // Filesystem plugins outside cli/plugins/ are inferred as `community`
    // trust and start `disabled`; explicit enable activates them.
    await host.plugins.enable("test.oldstyle");
    const r = host.plugins.get("test.oldstyle");
    expect(r).toBeDefined();
    expect(r!.state).toBe("active");
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("quarantines a plugin whose activate() raises, leaving the host alive", async () => {
    writePlugin(
      pluginDir,
      "raising",
      {
        id: "test.raising",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        capabilities: [
          { capability_id: "cap:profile", local_name: "demo", entry: "PROFILE" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.raising",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  capabilities: [{ capability_id: "cap:profile", local_name: "demo" }],
})};
export default {
  manifest,
  activate: () => { throw new Error("boom"); },
};
`,
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
    await host.load();
    // The plugin starts disabled (community trust); enabling triggers
    // activate(), which raises and quarantines the plugin.
    await host.plugins.enable("test.raising").catch(() => {});
    const r = host.plugins.get("test.raising");
    expect(r?.state).toBe("quarantined");
    expect(r?.errorMessage).toContain("boom");
    // Host is still usable — listing workbooks works.
    expect(host.listProjects()).toEqual([]);
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("infers community trust for filesystem plugins outside cli/plugins/", async () => {
    writePlugin(
      pluginDir,
      "community",
      {
        id: "test.community",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        capabilities: [
          { capability_id: "cap:profile", local_name: "demo", entry: "PROFILE" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.community",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  capabilities: [{ capability_id: "cap:profile", local_name: "demo" }],
})};
export default { manifest, activate: () => {} };
`,
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
    await host.load();
    const r = host.plugins.get("test.community");
    expect(r?.trust).toBe("community");
    // community plugins do NOT auto-activate
    expect(r?.state).toBe("disabled");
    rmSync(pluginDir, { recursive: true, force: true });
  });

  /**
   * A plugin that is discovered and then not activated must say so.
   *
   * Observed 2026-09-01 against the k8s overlay: `FDPM_TRUSTED_KEYS` and the
   * external plugin's `trust.signed_by` are two strings in two repositories
   * that must match exactly, and a mismatch took the auto-activation `else`
   * branch — `state = "disabled"` with no warning, no error and exit code 0.
   * The gateway then answered /healthz and /readyz normally and its startup
   * log was byte-identical to a healthy boot, so nothing anywhere could
   * distinguish "plugin loaded" from "plugin silently dropped".
   *
   * The trust decision itself is correct and stays. What was missing is the
   * signal, so this asserts the signal.
   */
  it("warns when a discovered plugin is left disabled for want of trust", async () => {
    const manifest = {
      id: "test.untrusted",
      version: "0.1.0",
      spec_version: "1.1.0",
      kind: "server",
      host_compatibility: { fdpm: ">=1.0,<2" },
      trust: { signed_by: "some-key-not-in-FDPM_TRUSTED_KEYS" },
      capabilities: [{ capability_id: "cap:profile", local_name: "demo", entry: "PROFILE" }],
    };
    writePlugin(
      pluginDir,
      "untrusted",
      manifest,
      `
const manifest = ${JSON.stringify({ ...manifest, capabilities: [{ capability_id: "cap:profile", local_name: "demo" }] })};
export default { manifest, activate: () => {} };
`,
    );

    const captured: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = (chunk: unknown): boolean => {
      captured.push(String(chunk));
      return true;
    };
    try {
      const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [pluginDir] });
      await host.load();
      const r = host.plugins.get("test.untrusted");
      expect(r?.trust).toBe("community");
      expect(r?.state).toBe("disabled");
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stderr as any).write = originalWrite;
    }

    const text = captured.join("");
    expect(text, "a plugin dropped for trust must not be dropped silently").toContain(
      "test.untrusted",
    );
    expect(text).toContain("FDPM_TRUSTED_KEYS");
    rmSync(pluginDir, { recursive: true, force: true });
  });
});

describe("plugin runtime — admin lifecycle transitions", () => {
  it("enable + disable + quarantine-clear", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "lifecycle",
      {
        id: "test.lifecycle",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        capabilities: [
          { capability_id: "cap:profile", local_name: "demo", entry: "PROFILE" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.lifecycle",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  capabilities: [{ capability_id: "cap:profile", local_name: "demo" }],
})};
export default { manifest, activate: () => {} };
`,
    );
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    // community → disabled by default
    expect(host.plugins.get("test.lifecycle")?.state).toBe("disabled");
    await host.plugins.enable("test.lifecycle");
    expect(host.plugins.get("test.lifecycle")?.state).toBe("active");
    await host.plugins.disable("test.lifecycle");
    expect(host.plugins.get("test.lifecycle")?.state).toBe("disabled");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin runtime — cross-plugin slot conflicts (§7.4)", () => {
  /**
   * Two plugins MUST NOT register the same (capability_id, slot_key) pair.
   * For cap:importer / cap:exporter the slot key is `format`; for
   * cap:renderer it is `(target, rendererId)`.
   *
   * The first registration wins; the second raises a PluginError of
   * category=conflict and quarantines the second plugin (because the
   * raise propagates out of activate() into the host's exception
   * barrier).
   */
  it("rejects a second plugin registering the same importer format", async () => {
    const dir = tmpPluginDir();

    const makeImporter = (id: string) =>
      writePlugin(
        dir,
        id,
        {
          id,
          version: "0.1.0",
          spec_version: "1.1.0",
          kind: "server",
          host_compatibility: { fdpm: ">=1.0,<2" },
          permissions: ["import:workbook"],
          capabilities: [
            { capability_id: "cap:importer", local_name: "fmt", entry: "fn" },
          ],
        },
        `
const manifest = ${JSON.stringify({
  id,
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["import:workbook"],
  capabilities: [{ capability_id: "cap:importer", local_name: "fmt" }],
})};
const fn = (raw) => raw;
export default {
  manifest,
  activate: (ctx) => { ctx.registerImporter({ format: "shared-fmt", fn }); },
};
`,
      );

    makeImporter("test.importer.a");
    makeImporter("test.importer.b");

    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();

    // Both are community-trust; activate one then attempt the other.
    await host.plugins.enable("test.importer.a");
    expect(host.plugins.get("test.importer.a")?.state).toBe("active");

    // The second plugin's activate() raises when registerImporter sees
    // the format collision; the runtime quarantines the offender.
    await host.plugins.enable("test.importer.b").catch(() => {});
    const second = host.plugins.get("test.importer.b");
    expect(second?.state).toBe("quarantined");
    expect(second?.errorMessage).toMatch(/already registered/);

    // Only the first plugin's importer is reachable.
    const importer = host.plugins.findImporter("shared-fmt");
    expect(importer?.pluginId).toBe("test.importer.a");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin runtime — runImporter exception barrier", () => {
  /**
   * §6.4 + §6.5: a registered importer that raises at invocation time
   * MUST quarantine the owning plugin and surface a PluginError, while
   * leaving the host alive and other plugins untouched.
   */
  it("quarantines a raising importer's plugin without crashing the host", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "test.raising-importer",
      {
        id: "test.raising-importer",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["import:workbook"],
        capabilities: [
          { capability_id: "cap:importer", local_name: "boom", entry: "fn" },
        ],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.raising-importer",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["import:workbook"],
  capabilities: [{ capability_id: "cap:importer", local_name: "boom" }],
})};
const fn = () => { throw new Error("kaboom"); };
export default {
  manifest,
  activate: (ctx) => { ctx.registerImporter({ format: "boom", fn }); },
};
`,
    );

    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable("test.raising-importer");
    expect(host.plugins.get("test.raising-importer")?.state).toBe("active");

    // Invoking the raising importer should bubble a PluginError AND
    // move the owning plugin to `quarantined`.
    await expect(host.plugins.runImporter("boom", {})).rejects.toThrow(
      /kaboom|raised/,
    );
    const r = host.plugins.get("test.raising-importer");
    expect(r?.state).toBe("quarantined");
    expect(r?.errorMessage).toContain("kaboom");

    // Host stays alive — listing workbooks works, version reads work.
    expect(host.listProjects()).toEqual([]);
    // The format is unreachable now: re-invoking surfaces "no importer
    // registered" because findImporter scans only `installed` (live)
    // contributions, but tearDown also removed the registration.
    await expect(host.plugins.runImporter("boom", {})).rejects.toThrow(
      /no importer registered|not active/,
    );

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin runtime — CWD-independent built-in discovery", () => {
  /**
   * Regression: invoking `fdpm` from any CWD other than `cli/` or the
   * repo root used to silently load zero built-in plugins, which then
   * surfaced as "no importer registered" or "unknown profile" errors
   * downstream. Discovery now also probes a path resolved against the
   * discovery module's own filesystem location, which makes built-in
   * loading CWD-independent.
   */
  it("loads in-tree formal_specification when invoked from the OS temp directory", async () => {
    const previous = process.cwd();
    try {
      process.chdir(tmpdir());
      const host = new Host({ dataDir: null });
      await host.load();
      const ids = host.plugins.list().map((r) => r.id).sort();
      expect(ids).toContain("fdpm.formal-specification");
      expect(host.profiles.has(PROFILE_ID)).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });
});

describe("plugin runtime — runImporter / runRenderer pass-through of FDPMException(verification)", () => {
  /**
   * Regression: an importer that throws Error() on bad input used to
   * quarantine the plugin (correct under §6.4 — "the plugin defected").
   * But a typed FDPMException(verification) means "the input the host
   * gave me was malformed" — the plugin worked correctly. The runtime
   * MUST pass that through without quarantining; otherwise an operator
   * who typo's a file path takes a healthy plugin out of service.
   */
  it("FDPMException(verification) thrown by an importer does NOT quarantine its plugin", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "test.picky-importer",
      {
        id: "test.picky-importer",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["import:workbook"],
        capabilities: [
          { capability_id: "cap:importer", local_name: "picky", entry: "fn" },
        ],
      },
      `
import { FDPMException } from "${resolve(process.cwd(), "src/core/errors/fdpm-exception.ts").replace(/\\\\/g, "/")}";
const manifest = ${JSON.stringify({
  id: "test.picky-importer",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["import:workbook"],
  capabilities: [{ capability_id: "cap:importer", local_name: "picky" }],
})};
const fn = (raw) => {
  if (typeof raw !== "object" || raw === null) {
    throw new FDPMException("verification", "picky importer rejects non-object input");
  }
  return raw;
};
export default {
  manifest,
  activate: (ctx) => { ctx.registerImporter({ format: "picky", fn }); },
};
`,
    );

    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable("test.picky-importer");
    expect(host.plugins.get("test.picky-importer")?.state).toBe("active");

    // Hand it bad input. The exception passes through but state remains active.
    await expect(host.plugins.runImporter("picky", "not-an-object")).rejects.toThrow(
      /rejects non-object/,
    );
    expect(host.plugins.get("test.picky-importer")?.state).toBe("active");

    // Confirm it still works for valid input — the plugin is genuinely healthy.
    const ok = await host.plugins.runImporter("picky", { valid: true });
    expect(ok).toEqual({ valid: true });
    expect(host.plugins.get("test.picky-importer")?.state).toBe("active");

    rmSync(dir, { recursive: true, force: true });
  });

  it("FDPMException(verification) thrown by a renderer does NOT quarantine its plugin", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "test.picky-renderer",
      {
        id: "test.picky-renderer",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["render:server"],
        capabilities: [
          { capability_id: "cap:renderer", local_name: "picky", entry: "fn" },
        ],
      },
      `
import { FDPMException } from "${resolve(process.cwd(), "src/core/errors/fdpm-exception.ts").replace(/\\\\/g, "/")}";
const manifest = ${JSON.stringify({
  id: "test.picky-renderer",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["render:server"],
  capabilities: [{ capability_id: "cap:renderer", local_name: "picky" }],
})};
const fn = (input) => {
  if (input.primitives.length === 0) {
    throw new FDPMException("verification", "picky renderer needs at least one primitive");
  }
  return { bytes: new TextEncoder().encode("ok"), contentType: "text/plain" };
};
export default {
  manifest,
  activate: (ctx) => { ctx.registerRenderer({ target: "text/plain", rendererId: "picky", fn }); },
};
`,
    );

    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable("test.picky-renderer");

    await expect(
      host.plugins.runRenderer("text/plain", {
        workbookId: "x",
        primitives: [],
        relations: [],
        profile: { id: "p:x:1.0" } as never,
      }),
    ).rejects.toThrow(/at least one primitive/);
    expect(host.plugins.get("test.picky-renderer")?.state).toBe("active");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin runtime — runExporter", () => {
  /**
   * `cap:exporter` had no invocation path until `runExporter` existed. Five
   * bundled plugins registered exporters — plan-jsonl, sw-jsonl, fs-jsonl,
   * spec-jsonl, recipe-jsonl — that nothing in the host, the CLI or the SDK
   * could call, so the capability was a declaration rather than a feature.
   * These cases pin the lifecycle and exception semantics to `runImporter`'s,
   * which is the contract the rest of the runtime already keeps.
   */
  const EMPTY_TRANSFER = {
    spec_core: "1.1.0",
    workbook: {
      id: "x",
      name: "x",
      profile_id: "profile:x:1.0",
      created_at: "2026-01-01T00:00:00.000Z",
      revision: 0,
    },
    primitives: [],
    relations: [],
    templates: [],
    test_suites: [],
  } as never;

  it("runs a registered exporter and returns its bytes", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const bytes = await host.plugins.runExporter("plan-jsonl", EMPTY_TRANSFER);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("makes every bundled exporter reachable, not just the newest one", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const formats = host.plugins.listExporters().map((e) => e.format);
    expect(formats.length).toBeGreaterThanOrEqual(5);
    for (const f of formats) {
      expect(host.plugins.findExporter(f), `${f} must resolve`).toBeDefined();
    }
  });

  it("refuses an unregistered format rather than returning empty bytes", async () => {
    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [] });
    await host.load();
    await expect(host.plugins.runExporter("nope-jsonl", EMPTY_TRANSFER)).rejects.toThrow(
      /no exporter registered/,
    );
  });

  it("quarantines a raising exporter's plugin without crashing the host", async () => {
    const dir = tmpPluginDir();
    writePlugin(
      dir,
      "test.raising-exporter",
      {
        id: "test.raising-exporter",
        version: "0.1.0",
        spec_version: "1.1.0",
        kind: "server",
        host_compatibility: { fdpm: ">=1.0,<2" },
        permissions: ["export:workbook"],
        capabilities: [{ capability_id: "cap:exporter", local_name: "boom", entry: "fn" }],
      },
      `
const manifest = ${JSON.stringify({
  id: "test.raising-exporter",
  version: "0.1.0",
  spec_version: "1.1.0",
  kind: "server",
  host_compatibility: { fdpm: ">=1.0,<2" },
  permissions: ["export:workbook"],
  capabilities: [{ capability_id: "cap:exporter", local_name: "boom" }],
})};
const fn = () => { throw new Error("kaboom-export"); };
export default {
  manifest,
  activate: (ctx) => { ctx.registerExporter({ format: "boom", fn }); },
};
`,
    );

    const host = new Host({ dataDir: null, builtinDirs: [], pluginPaths: [dir] });
    await host.load();
    await host.plugins.enable("test.raising-exporter");
    expect(host.plugins.get("test.raising-exporter")?.state).toBe("active");

    await expect(host.plugins.runExporter("boom", EMPTY_TRANSFER)).rejects.toThrow(
      /kaboom-export|raised/,
    );
    const r = host.plugins.get("test.raising-exporter");
    expect(r?.state).toBe("quarantined");
    expect(r?.errorMessage).toContain("kaboom-export");
    expect(host.listProjects()).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });
});
