import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateCheckScript,
  evaluateCommitMessage,
  evaluateIdentityConsistency,
  evaluateImageListing,
  evaluatePackedFiles,
  evaluatePackageManifest,
  evaluateTextDiscipline,
  evaluateTrackedEntries,
  evaluateVersionAlignment,
  evaluateWorkingPaths,
  findSecretCandidates,
  parseAllowlist,
} from "../../scripts/check-public-readiness.mjs";

const publicMetadata = {
  name: "@fdpm/example",
  version: "1.0.0",
  description: "Example package",
  author: "Pedro Anisio Silva <pedroanisio@arc4d3.com>",
  keywords: ["fdpm", "cli", "mcp"],
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/pedroanisio/fdpm.git",
    directory: "fdpm-cli",
  },
  bugs: { url: "https://github.com/pedroanisio/fdpm/issues" },
  homepage: "https://github.com/pedroanisio/fdpm#readme",
  engines: { node: ">=20" },
  files: ["dist", "README.md", "LICENSE"],
  publishConfig: { access: "public", provenance: true },
};

describe("public package metadata", () => {
  it("accepts a scoped package with complete public metadata", () => {
    assert.deepEqual(
      evaluatePackageManifest("fdpm-cli/package.json", publicMetadata),
      [],
    );
  });

  it("rejects an unlicensed package and local-only dependencies", () => {
    const findings = evaluatePackageManifest("fdpm-cli/package.json", {
      ...publicMetadata,
      license: "UNLICENSED",
      dependencies: { "@fdpm/zod-bridge": "file:packages/zod-bridge" },
    });

    assert(findings.some((finding) => finding.includes("open-source SPDX license")));
    assert(findings.some((finding) => finding.includes("local-only dependency")));
  });
});

describe("release version identity", () => {
  it("requires the package and advertised host versions to agree", () => {
    assert.deepEqual(
      evaluateVersionAlignment(
        { version: "1.1.0" },
        'export const HOST_VERSION = "1.2.0" as const;',
      ),
      ["fdpm-cli/package.json version 1.1.0 does not match HOST_VERSION 1.2.0"],
    );
    assert.deepEqual(
      evaluateVersionAlignment(
        { version: "1.2.0" },
        'export const HOST_VERSION = "1.2.0" as const;',
      ),
      [],
    );
  });
});

describe("release check ordering", () => {
  it("requires a fresh distribution before tests that execute package bins", () => {
    assert.deepEqual(
      evaluateCheckScript({
        scripts: { check: "npm run typecheck && npm test && npm run build" },
      }),
      ["fdpm-cli/package.json scripts.check must build before npm test"],
    );
    assert.deepEqual(
      evaluateCheckScript({
        scripts: { check: "npm run typecheck && npm run build && npm test" },
      }),
      [],
    );
  });
});

describe("tracked repository entries", () => {
  it("rejects local artifacts, nested workflows, and absolute symlinks", () => {
    const findings = evaluateTrackedEntries([
      { mode: "100644", path: "fdpm-cli/node_modules/pkg/index.js" },
      { mode: "100644", path: "static/schemas/__pycache__/schema.cpython-312.pyc" },
      { mode: "100644", path: "fdpm-cli/.github/workflows/ci.yml" },
      {
        mode: "120000",
        path: "static/schemas/node_modules",
        symlinkTarget: "/home/example/project/node_modules",
      },
    ]);

    assert(findings.some((finding) => finding.includes("local artifact")));
    assert(findings.some((finding) => finding.includes("repository root")));
    assert(findings.some((finding) => finding.includes("absolute symlink")));
  });
});

describe("secret candidate scanning", () => {
  it("detects credential-shaped values without flagging documented placeholders", () => {
    assert.equal(
      findSecretCandidates(
        "config.ts",
        `const token = "${"ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890"}";`,
      ).length,
      1,
    );
    assert.deepEqual(findSecretCandidates(".env.example", "OPENAI_API_KEY=your-key-here"), []);
  });
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// SHA-256 of https://www.apache.org/licenses/LICENSE-2.0.txt as fetched on
// 2026-09-04. Pinning the digest makes "the canonical text" a checkable claim:
// a LICENSE that was retyped, reflowed, or had its appendix filled in fails
// here rather than shipping as a near-copy.
const APACHE_2_0_SHA256 =
  "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
const LICENSE_PATHS = [
  "LICENSE",
  "fdpm-cli/LICENSE",
  "fdpm-cli/packages/zod-bridge/LICENSE",
];
const MANIFEST_PATHS = [
  "fdpm-cli/package.json",
  "fdpm-cli/packages/zod-bridge/package.json",
];

describe("the selected license (Apache-2.0)", () => {
  it("ships the canonical Apache-2.0 text at the root and both package roots", () => {
    for (const path of LICENSE_PATHS) {
      assert(existsSync(join(REPO_ROOT, path)), `${path} is missing`);
    }
    const [root, ...copies] = LICENSE_PATHS.map((path) =>
      readFileSync(join(REPO_ROOT, path)),
    );
    assert.equal(
      createHash("sha256").update(root).digest("hex"),
      APACHE_2_0_SHA256,
      "LICENSE is not the canonical Apache-2.0 text",
    );
    copies.forEach((copy, index) => {
      assert(copy.equals(root), `${LICENSE_PATHS[index + 1]} differs from the root LICENSE`);
    });
  });

  it("declares the matching SPDX expression in both package manifests", () => {
    for (const path of MANIFEST_PATHS) {
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));
      assert.equal(manifest.license, "Apache-2.0", `${path} must declare license Apache-2.0`);
    }
  });
});

// ── Information discipline ───────────────────────────────────────────────────
//
// The release tree must not carry working material (plans, prompts, session
// records, run logs), local paths, coordination identifiers, or references to
// the private memory store. Each evaluator below is a pure function over text
// or listings so the cases are the specification.

const TODAY = "2026-09-18";
const rule = (findings, id) => findings.filter((finding) => finding.rule === id);

describe("information discipline: tracked working paths", () => {
  it("rejects a tracked file under a working-material directory", () => {
    const findings = evaluateWorkingPaths([
      { path: ".agent-tasks/registry.json" },
      { path: "docs/reviews/x.json" },
      { path: "static/refs/notes.md" },
      { path: "fdpm-cli/research/ecdlp/plan.json" },
      { path: "docs/specs/SPEC-CORE.md" },
      { path: "fdpm-cli/src/index.ts" },
    ]);
    assert.deepEqual(
      findings.map((finding) => finding.path),
      [".agent-tasks/registry.json", "docs/reviews/x.json", "static/refs/notes.md", "fdpm-cli/research/ecdlp/plan.json"],
    );
    assert(findings.every((finding) => finding.rule === "id.tracked-working-dir"));
  });
});

describe("information discipline: text rules", () => {
  it("flags an absolute home path in a Markdown table", () => {
    const findings = evaluateTextDiscipline(
      "docs/x.md",
      "| documentation | 10/10 | readme=/home/admin/github-mirror/x/README.md |\n",
    );
    assert.equal(rule(findings, "id.absolute-local-path").length, 1);
    assert.equal(findings[0].line, 1);
  });

  it("flags an absolute path inside JSON, which is text too", () => {
    const findings = evaluateTextDiscipline(
      "fdpm-cli/plugins/agent_memory/generated/schema-hash.json",
      '{\n  "vendored_from": "/home/admin/new-age/x/schema.ts"\n}\n',
    );
    assert.equal(rule(findings, "id.absolute-local-path").length, 1);
    assert.equal(findings[0].line, 2);
  });

  it("accepts synthetic identities used by fixtures and examples", () => {
    const text = 'home: "/Users/ada"\nconst p = "C:\\\\Users\\\\Ada\\\\AppData";\n"path": "/home/alice/.fdpm-cli"\n';
    assert.deepEqual(rule(evaluateTextDiscipline("fdpm-cli/tests/platform-portability.test.ts", text), "id.absolute-local-path"), []);
  });

  it("flags a scratch-directory citation in prose and in a source comment, not in code", () => {
    const md = evaluateTextDiscipline("docs/how-to.md", "Prompts and answers are files under `_tmp/loop-forward/exchange/`.\n");
    assert.equal(rule(md, "id.scratch-citation").length, 1);
    const comment = evaluateTextDiscipline("fdpm-cli/src/loop/drivers.ts", "  /** Directory the order files are written to (the repository's _tmp/). */\n");
    assert.equal(rule(comment, "id.scratch-citation").length, 1);
    const code = evaluateTextDiscipline("fdpm-cli/playwright.config.ts", '  outputDir: resolve(process.cwd(), "../_tmp/renderer-playwright-results"),\n');
    assert.deepEqual(rule(code, "id.scratch-citation"), []);
    const research = evaluateTextDiscipline("fdpm-cli/scripts/x.ts", "// evidence bundles live under fdpm-cli/research/frontier-proof-loop\n");
    assert.equal(rule(research, "id.scratch-citation").length, 1);
    const write = evaluateTextDiscipline("fdpm-cli/scripts/build-x.ts", " *   FDPM_DATA_DIR=_tmp/x npx tsx fdpm-cli/src/bin/fdpm.ts render x text/markdown -o _tmp/x/out.md\n");
    assert.deepEqual(rule(write, "id.scratch-citation"), []);
  });

  it("exempts the files that define the scratch policy", () => {
    const text = "Use the repository-root `_tmp/` directory for disposable local work.\n";
    assert.deepEqual(evaluateTextDiscipline("CONTRIBUTING.md", text), []);
    assert.deepEqual(evaluateTextDiscipline("CLAUDE.md", text), []);
    assert.deepEqual(evaluateTextDiscipline(".gitignore", "_tmp/\n"), []);
  });

  it("flags session narrative in a Markdown body but not in its frontmatter", () => {
    const body = "---\ndisclaimer:\n  generated_by: \"x via this session's tool\"\n---\n# T\n\nFlows traced from this session's prior work.\n";
    const findings = rule(evaluateTextDiscipline("docs/architecture/X.md", body), "id.session-narrative");
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 7);
    for (const phrase of ["in this conversation", "See the handoff summary", "the previous agent chose", "Lessons learned:", "/mnt/transcripts/a.txt"]) {
      assert.equal(rule(evaluateTextDiscipline("docs/x.md", `# T\n\n${phrase}\n`), "id.session-narrative").length, 1, phrase);
    }
  });

  it("does not read MCP or HTTP sessions in code as narrative", () => {
    const code = 'throw new FDPMException("permission", "token does not match this session\'s tenant");\n// from this session sees its own write as fresh\n';
    assert.deepEqual(rule(evaluateTextDiscipline("fdpm-cli/src/mcp/dispatch.ts", code), "id.session-narrative"), []);
  });

  it("flags coordination-protocol identifiers anywhere", () => {
    const findings = evaluateTextDiscipline("fdpm-cli/src/x.ts", "// task-1788557121343-1776 left this lock; agent-codex-ecdlp-deep owns .agent-tasks/locks\n");
    assert.equal(rule(findings, "id.coordination-identifier").length, 1);
  });

  it("flags references to the private memory store and private infrastructure", () => {
    const findings = evaluateTextDiscipline("docs/x.md", "See https://wiki.192-168-199-240.sslip.io/x and ~/.local/state/repo-work/notes.md and registry.digitalocean.com/acme/img:1\n");
    assert.equal(rule(findings, "id.private-endpoint").length, 1);
    assert.deepEqual(rule(evaluateTextDiscipline("docs/x.md", "registry at ${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json\n"), "id.private-endpoint"), []);
  });

  it("honours an allowlist entry until it expires", () => {
    const text = "readme=/home/admin/x/README.md\n";
    const live = parseAllowlist("id.absolute-local-path docs/x.md 2099-01-01 fixture that must carry a path\n", TODAY);
    assert.deepEqual(live.errors, []);
    assert.deepEqual(evaluateTextDiscipline("docs/x.md", text, live.entries), []);
    const expired = parseAllowlist("id.absolute-local-path docs/x.md 2026-01-01 fixture\n", TODAY);
    assert.equal(expired.errors.length, 1);
    assert.match(expired.errors[0], /expired/);
    const standing = parseAllowlist("id.scratch-citation fdpm-cli/plugins/x/README.md never provenance header names the ignored input drop\n", TODAY);
    assert.deepEqual(standing.errors, []);
    assert.deepEqual(evaluateTextDiscipline("fdpm-cli/plugins/x/README.md", "vendored from `_tmp/x.ts`\n", standing.entries), []);
    const malformed = parseAllowlist("id.absolute-local-path docs/x.md\n", TODAY);
    assert.equal(malformed.errors.length, 1);
  });
});

describe("information discipline: package and image contents", () => {
  it("rejects dead eval modules and working material in the tarball, keeps plugin product pages", () => {
    const findings = evaluatePackedFiles([
      "package.json",
      "README.md",
      "LICENSE",
      "dist/src/index.js",
      "dist/src/eval/runner.js",
      "dist/plugins/silent_acceptance/SCHEMA-SCORECARD.md",
      "dist/plugins/uixo/README.md",
      "dist/plugins/knowledge_cartridge/GENERATOR.md",
      "dist/plugins/_starter/EDUCATION.md",
      "dist/plugins/style/generated/profile.json",
      "dist/plugins/style/fdpm-plugin.json",
      "dist/plugins/uml/tests/x.test.js",
    ]);
    assert.deepEqual(
      findings.map((finding) => finding.path),
      ["dist/src/eval/runner.js", "dist/plugins/silent_acceptance/SCHEMA-SCORECARD.md", "dist/plugins/uml/tests/x.test.js"],
    );
    assert(findings.every((finding) => finding.rule === "id.package-file-allowlist"));
  });

  it("rejects working material and secrets in an exported image listing", () => {
    const findings = evaluateImageListing([
      "app/dist/src/index.js",
      "app/plugins/uixo/README.md",
      "app/research/ecdlp/challenge.json",
      "app/plugins/silent_acceptance/SCHEMA-SCORECARD.md",
      "app/.env",
      "app/coverage/lcov.info",
      "app/_tmp/x",
      "app/.git/HEAD",
      "app/dist/src/eval/runner.js",
    ]);
    assert.deepEqual(
      findings.map((finding) => finding.path),
      ["app/research/ecdlp/challenge.json", "app/plugins/silent_acceptance/SCHEMA-SCORECARD.md", "app/.env", "app/coverage/lcov.info", "app/_tmp/x", "app/.git/HEAD", "app/dist/src/eval/runner.js"],
    );
  });
});

describe("information discipline: identity and commit messages", () => {
  it("requires README and both manifests to name the canonical repository", () => {
    const good = evaluateIdentityConsistency({
      readme: "The source is public at [github.com/pedroanisio/fdpm](https://github.com/pedroanisio/fdpm).",
      manifests: {
        "fdpm-cli/package.json": { repository: { url: "git+https://github.com/pedroanisio/fdpm.git" }, bugs: { url: "https://github.com/pedroanisio/fdpm/issues" } },
      },
    });
    assert.deepEqual(good, []);
    const bad = evaluateIdentityConsistency({
      readme: "The source is public at github.com/pedroanisio/fdpm.",
      manifests: {
        "fdpm-cli/package.json": { repository: { url: "git+https://github.com/pedroanisio/fdpm-cli.git" }, bugs: { url: "https://github.com/pedroanisio/fdpm-cli/issues" } },
      },
    });
    assert.equal(bad.length, 2);
    assert(bad.every((finding) => finding.rule === "id.identity-consistent"));
  });

  it("rejects a commit message that cites local or private locations", () => {
    assert.equal(evaluateCommitMessage("docs: relocate working material (see /home/admin/.local/state/repo-work)").length, 1);
    assert.equal(evaluateCommitMessage("fix: closes task-1788557121343-1776 in .agent-tasks").length, 1);
    assert.deepEqual(evaluateCommitMessage("docs: relocate working material out of the release tree\n\nCo-Authored-By: x <x@example.com>"), []);
  });
});
