import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const ROOT_README = read("../README.md");
const ROOT_PURPOSE = read("../PURPOSE.md");
const MANUAL = read("MANUAL.md");
const FORMAL_SPEC_README = read("plugins/formal_specification/README.md");
const PLANNING_README = read("plugins/planning/README.md");
const SOFTWARE_ARCH_README = read("plugins/software_architecture/README.md");

describe("documentation drift regressions", () => {
  it("top-level repo docs describe the real package boundary", () => {
    expect(ROOT_README).toContain("[@DISCLAIMER.md](./DISCLAIMER.md)");
    expect(ROOT_README).toContain("npm --prefix fdpm-cli install");
    expect(ROOT_README).toContain("docs/specs/SPEC-CORE.md");
    expect(ROOT_README).not.toContain("../docs/specs/");
    expect(ROOT_PURPOSE).toContain("[`fdpm-cli/`](./fdpm-cli/)");
    expect(ROOT_PURPOSE).not.toContain("REST API");
    expect(ROOT_PURPOSE).not.toContain("NLP-powered compilation");
  });

  it("manual quick-start matches the nested CLI package layout", () => {
    expect(MANUAL).toContain("npm --prefix fdpm-cli install");
    expect(MANUAL).toContain("FDPM_DATA_DIR=$HOME/.fdpm-cli");
    expect(MANUAL).toContain('"host": "fdpm-cli"');
    expect(MANUAL).not.toContain("npm --prefix cli");
    expect(MANUAL).not.toContain("/path/to/repo/cli");
    expect(MANUAL).not.toContain("$HOME/.fdpm/data");
  });

  it("plugin READMEs keep current CLI verbs", () => {
    for (const text of [FORMAL_SPEC_README, PLANNING_README, SOFTWARE_ARCH_README]) {
      expect(text).not.toContain("fdpm project init");
      expect(text).not.toContain("fdpm primitive add");
      expect(text).not.toContain("fdpm relation add");
    }
  });

  it("software architecture README documents the shipped renderers", () => {
    expect(SOFTWARE_ARCH_README).toContain("sw:OpenAPIRenderer");
    expect(SOFTWARE_ARCH_README).toContain("sw:ADRRenderer");
    expect(SOFTWARE_ARCH_README).not.toContain("ships no executable renderers");
  });

  it("formal specification README uses the current render command surface", () => {
    expect(FORMAL_SPEC_README).toContain(
      "fdpm render my-spec text/markdown --renderer-id fs:SpecRenderer -o spec.md",
    );
    expect(FORMAL_SPEC_README).not.toContain("fdpm render --target text/markdown");
  });
});
