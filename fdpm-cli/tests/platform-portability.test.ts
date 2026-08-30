import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { platformRegistryPath } from "../src/core/workspace/registry.js";
import { parsePluginPathList } from "../src/plugin/discovery.js";

const CLI_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");

function read(relativePath: string): string {
  return readFileSync(join(CLI_ROOT, relativePath), "utf8");
}

describe("platform-native configuration paths", () => {
  it("splits plugin search paths with the operating system delimiter", () => {
    expect(parsePluginPathList("/opt/fdpm:/srv/fdpm", ":")).toEqual([
      "/opt/fdpm",
      "/srv/fdpm",
    ]);
    expect(
      parsePluginPathList("C:\\fdpm\\plugins;D:\\shared\\fdpm", ";"),
    ).toEqual(["C:\\fdpm\\plugins", "D:\\shared\\fdpm"]);
  });

  it("uses native state locations on Linux, macOS, and Windows", () => {
    expect(
      platformRegistryPath({
        platform: "linux",
        home: "/home/ada",
        env: { XDG_STATE_HOME: "/state/ada" },
      }),
    ).toBe("/state/ada/fdpm/workspaces.json");
    expect(
      platformRegistryPath({
        platform: "darwin",
        home: "/Users/ada",
        env: {},
      }),
    ).toBe("/Users/ada/Library/Application Support/fdpm/workspaces.json");
    expect(
      platformRegistryPath({
        platform: "win32",
        home: "C:\\Users\\Ada",
        env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
      }),
    ).toBe("C:\\Users\\Ada\\AppData\\Local\\fdpm\\workspaces.json");
  });

  it("keeps the explicit registry override authoritative on every platform", () => {
    expect(
      platformRegistryPath({
        platform: "win32",
        home: "C:\\Users\\Ada",
        env: { FDPM_REGISTRY_PATH: "D:\\fdpm\\registry.json" },
      }),
    ).toBe("D:\\fdpm\\registry.json");
  });
});

describe("portable package and CI entry points", () => {
  it("builds the workspace dependency before root checks without POSIX utilities", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["prebuild"]).toBe("npm run build:zod-bridge");
    expect(pkg.scripts["pretypecheck"]).toBe("npm run build:zod-bridge");
    expect(pkg.scripts["build:zod-bridge"]).toContain(
      "--workspace @fdpm/zod-bridge",
    );
    expect(pkg.scripts["build"]).toContain("node scripts/ensure-bin-mode.mjs");
    expect(pkg.scripts["build"]).not.toMatch(/\b(?:chmod|cp|mv|rm)\b/u);
  });

  it("uses file URLs and temporary directories through Node APIs", () => {
    expect(read("scripts/copy-plugin-assets.mjs")).toContain(
      "pathToFileURL(process.argv[1]).href",
    );
    expect(read("scripts/ensure-bin-mode.mjs")).toContain(
      'process.platform !== "win32"',
    );
    for (const file of [
      "plugins/academic_paper_v0_4_1/scripts/run-bridge.ts",
      "plugins/acme_business_deck/scripts/run-bridge.ts",
      "plugins/acme_pitch_deck/scripts/run-bridge.ts",
      "packages/zod-bridge/tests/pitch-deck-emit.test.ts",
      "packages/zod-bridge/tests/sidecar-orchestrator.test.ts",
      "scripts/build-spec-fake-cats.ts",
    ]) {
      expect(read(file), file).not.toMatch(/["'`]\/tmp\//u);
    }
    expect(read("scripts/build-spec-fake-cats.ts")).toContain("tmpdir()");

    const latexTest = readFileSync(
      join(REPO_ROOT, "scripts", "test_fdpm_to_latex.py"),
      "utf8",
    );
    expect(latexTest).toContain("TemporaryDirectory");
    expect(latexTest).not.toMatch(/Path\(["']\/tmp\//u);
  });

  it("runs the supported Node release on Linux, macOS, and Windows", () => {
    const workflow = readFileSync(
      join(REPO_ROOT, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm run smoke:pack");
    expect(workflow).not.toContain("node dist/src/bin/fdpm.js version --json");
    expect(workflow).not.toContain("node dist/src/bin/fdpm-mcp.js");
    expect(workflow).toContain("python-renderer:");
    expect(workflow).toContain("actions/setup-python@v6");
    expect(workflow).toContain(
      "python -m pytest scripts/test_fdpm_to_latex.py -q",
    );
  });

  it("launches TypeScript subprocesses through Node instead of platform shims", () => {
    const subprocessTests = [
      "tests/generator-determinism.test.ts",
      "tests/profile-list-resolved.test.ts",
      "tests/_meta/doc-drift.test.ts",
      "tests/repl/repl-integration.test.ts",
      "tests/spec-builds-determinism.test.ts",
      "tests/cli-plugin-prompts.test.ts",
      "tests/cli-audit-report.test.ts",
      "tests/cli-delete-dry-run.test.ts",
      "tests/mcp/fdpm-mcp-stdio.test.ts",
      "tests/mcp/reload-notify.test.ts",
      "tests/plugins/loop_forward/prompts-surfaces.test.ts",
      "tests/plugins/document_plan/bridge-drift.test.ts",
      "tests/plugins/acme_business_deck/determinism.test.ts",
      "tests/plugins/acme_pitch_deck/determinism.test.ts",
      "tests/plugins/style/bridge-drift.test.ts",
      "tests/plugins/uml/bridge-drift.test.ts",
      "tests/plugins/uixo/derive.test.ts",
      "tests/plugins/uixo/ingest-and-render.test.ts",
      "tests/workspace-subcommands.test.ts",
    ];

    for (const file of subprocessTests) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /(?:spawnSync|execFileSync)\(\s*["']npx["']/u,
      );
      expect(source, file).not.toMatch(/execSync\(\s*`npx\s+tsx/u);
      expect(source, file).not.toMatch(
        /node_modules[\s\S]{0,80}["']\.bin["'][\s\S]{0,80}["']tsx["']/u,
      );
    }

    const helper = read("tests/_helpers/process.ts");
    expect(helper).toContain('require.resolve("tsx/cli")');
    expect(helper).toContain("process.execPath");
  });

  it("uses a reload signal Windows can receive without closing the console", () => {
    const reload = read("src/mcp/reload.ts");
    expect(reload).toContain('platform === "win32"');
    expect(reload).toContain('"SIGBREAK"');
    expect(reload).toContain('"SIGHUP"');

    const server = read("src/bin/fdpm-mcp.ts");
    expect(server).toContain("reloadSignalForPlatform(process.platform)");

    for (const file of [
      "plugins/loop_forward/prompts.ts",
      "plugins/planning/prompts.ts",
      "plugins/uml/prompts.ts",
    ]) {
      expect(read(file), file).toContain("SIGBREAK");
    }

    expect(read("scripts/build-spec-mcp-server.ts")).toContain("SIGBREAK");
    for (const file of [
      "docs/specs/SPEC-MCP-SERVER.md",
      "docs/architecture/FDPM-ARCHITECTURE.md",
    ]) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(source, file).toContain("SIGHUP");
      expect(source, file).toContain("SIGBREAK");
    }
  });
});
