import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  binShimInvocation,
  binShimPath,
  npmInvocation,
} from "../scripts/smoke-packed-install.mjs";

describe("packed-install smoke helpers", () => {
  it("locates the command shim npm generates for each platform", () => {
    expect(binShimPath("/tmp/consumer", "fdpm", "linux")).toBe(
      join("/tmp/consumer", "node_modules", ".bin", "fdpm"),
    );
    expect(binShimPath("C:\\consumer", "fdpm-mcp", "win32")).toBe(
      "C:\\consumer\\node_modules\\.bin\\fdpm-mcp.cmd",
    );
  });

  it("runs npm through its JavaScript entry point instead of a platform shim", () => {
    expect(npmInvocation(["pack", "--json"], "/opt/npm/npm-cli.js", "/opt/node")).toEqual({
      command: "/opt/node",
      args: ["/opt/npm/npm-cli.js", "pack", "--json"],
    });
    expect(() => npmInvocation([], "", "/opt/node")).toThrow(/npm_execpath/u);
  });

  it("uses cmd.exe only for Windows command shims", () => {
    expect(
      binShimInvocation("/tmp/consumer/node_modules/.bin/fdpm", ["version", "--json"], {
        platform: "linux",
      }),
    ).toEqual({
      command: "/tmp/consumer/node_modules/.bin/fdpm",
      args: ["version", "--json"],
    });

    expect(
      binShimInvocation("C:\\Consumer App\\node_modules\\.bin\\fdpm.cmd", ["version", "--json"], {
        platform: "win32",
        comspec: "C:\\Windows\\System32\\cmd.exe",
      }),
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '"C:\\Consumer App\\node_modules\\.bin\\fdpm.cmd" version --json',
      ],
    });
  });

  it("is part of every supported operating-system CI job", () => {
    const cliRoot = resolve(__dirname, "..");
    const pkg = JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const workflow = readFileSync(
      join(cliRoot, "..", ".github", "workflows", "ci.yml"),
      "utf8",
    );

    expect(pkg.scripts["smoke:pack"]).toBe("node scripts/smoke-packed-install.mjs");
    expect(workflow).toContain("npm run smoke:pack");
    expect(workflow).not.toContain("node dist/src/bin/fdpm.js version --json");
    expect(workflow).not.toContain("node dist/src/bin/fdpm-mcp.js");
  });
});
