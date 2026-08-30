import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateCheckScript,
  evaluatePackageManifest,
  evaluateTrackedEntries,
  evaluateVersionAlignment,
  findSecretCandidates,
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
    url: "git+https://github.com/pedroanisio/fdpm-cli.git",
    directory: "fdpm-cli",
  },
  bugs: { url: "https://github.com/pedroanisio/fdpm-cli/issues" },
  homepage: "https://github.com/pedroanisio/fdpm-cli#readme",
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
