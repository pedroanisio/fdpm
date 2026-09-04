import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
