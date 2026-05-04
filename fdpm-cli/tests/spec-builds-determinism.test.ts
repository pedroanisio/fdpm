import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTIVATION_TIER_A_LIST,
  HELPER_SET_VERSION,
  STANDARD_HELPER_COUNT,
  STANDARD_HELPERS,
  TIER_A_BINDINGS,
  TIER_B_BINDINGS,
} from "../scripts/_spec-shared.js";

/**
 * Pass-3 stabilization regression test.
 *
 * Asserts the two SPEC build scripts (SPEC-EXPRESSION-RUNTIME, SPEC-
 * RENDER-DSL) are well-formed and reproducible:
 *
 *   1. Both build successfully (the host commits without throwing).
 *   2. Both pass `validate` with zero findings at any level.
 *   3. Both produce byte-identical Markdown across two fresh runs from
 *      independent data dirs (determinism).
 *   4. The rendered Markdown of EACH SPEC contains every name from the
 *      shared constants module — proves the SPECs are NOT carrying
 *      drift-prone duplicates.
 *
 * The test takes ~10s because each SPEC build does ~100 host calls.
 * This is acceptable for a reproducibility gate that runs in CI.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TSX = join(REPO_ROOT, "cli", "node_modules", ".bin", "tsx");

function runScript(scriptPath: string, dataDir: string): string {
  // Returns stdout. Throws on non-zero exit.
  const out = execFileSync(
    TSX,
    [scriptPath],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, FDPM_DATA_DIR: dataDir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return out;
}

function runCli(args: string[], dataDir: string): string {
  return execFileSync(
    TSX,
    ["cli/src/bin/fdpm.ts", ...args],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, FDPM_DATA_DIR: dataDir },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

interface ValidateSummary {
  errors: number;
  warnings: number;
  info: number;
}

function buildAndValidate(scriptPath: string, projectId: string): {
  dataDir: string;
  rendered: Buffer;
  summary: ValidateSummary;
} {
  const dataDir = mkdtempSync(join(tmpdir(), "fdpm-spec-test-"));
  try {
    runScript(scriptPath, dataDir);
    const validateJson = runCli(
      ["validate", projectId, "--json"],
      dataDir,
    );
    const summary = JSON.parse(validateJson).summary as ValidateSummary;
    const rendered = execFileSync(
      TSX,
      [
        "cli/src/bin/fdpm.ts",
        "render",
        projectId,
        "text/markdown",
        "--renderer-id",
        "spec:SpecMarkdownRenderer",
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, FDPM_DATA_DIR: dataDir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { dataDir, rendered, summary };
  } catch (err) {
    rmSync(dataDir, { recursive: true, force: true });
    throw err;
  }
}

const SPECS = [
  {
    name: "SPEC-EXPRESSION-RUNTIME",
    script: "cli/scripts/build-spec-expression-runtime.ts",
    projectId: "spec-expression-runtime",
  },
  {
    name: "SPEC-RENDER-DSL",
    script: "cli/scripts/build-spec-render-dsl.ts",
    projectId: "spec-render-dsl",
  },
];

describe.each(SPECS)("$name — build + validate + determinism", (spec) => {
  it("validates with zero findings at every level", () => {
    const { dataDir, summary } = buildAndValidate(spec.script, spec.projectId);
    try {
      expect(summary.errors).toBe(0);
      expect(summary.warnings).toBe(0);
      expect(summary.info).toBe(0);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("renders byte-identically across two fresh data dirs", () => {
    const r1 = buildAndValidate(spec.script, spec.projectId);
    const r2 = buildAndValidate(spec.script, spec.projectId);
    try {
      expect(r2.rendered.equals(r1.rendered)).toBe(true);
    } finally {
      rmSync(r1.dataDir, { recursive: true, force: true });
      rmSync(r2.dataDir, { recursive: true, force: true });
    }
  });
}, 60_000);

describe("Shared constants are reflected in rendered SPECs (no drift)", () => {
  it("EXPR-RT mentions every Tier-A binding path", () => {
    const r = buildAndValidate(SPECS[0]!.script, SPECS[0]!.projectId);
    try {
      const md = r.rendered.toString("utf8");
      const missing = TIER_A_BINDINGS.filter((b) => !md.includes(b.path));
      expect(missing.map((b) => b.path)).toEqual([]);
    } finally {
      rmSync(r.dataDir, { recursive: true, force: true });
    }
  });

  it("EXPR-RT mentions every Tier-B binding path", () => {
    const r = buildAndValidate(SPECS[0]!.script, SPECS[0]!.projectId);
    try {
      const md = r.rendered.toString("utf8");
      const missing = TIER_B_BINDINGS.filter((b) => !md.includes(b.path));
      expect(missing.map((b) => b.path)).toEqual([]);
    } finally {
      rmSync(r.dataDir, { recursive: true, force: true });
    }
  });

  it("BOTH SPECs mention every standard helper name", () => {
    for (const spec of SPECS) {
      const r = buildAndValidate(spec.script, spec.projectId);
      try {
        const md = r.rendered.toString("utf8");
        const missing = STANDARD_HELPERS.filter((h) => !md.includes(h.name));
        expect(
          missing.map((h) => `${spec.name}: missing helper ${h.name}`),
        ).toEqual([]);
      } finally {
        rmSync(r.dataDir, { recursive: true, force: true });
      }
    }
  });

  it("BOTH SPECs mention the helper-set version", () => {
    for (const spec of SPECS) {
      const r = buildAndValidate(spec.script, spec.projectId);
      try {
        const md = r.rendered.toString("utf8");
        expect(md).toContain(HELPER_SET_VERSION);
      } finally {
        rmSync(r.dataDir, { recursive: true, force: true });
      }
    }
  });

  it("RENDER-DSL mentions the canonical activation list (not a stale form)", () => {
    const r = buildAndValidate(SPECS[1]!.script, SPECS[1]!.projectId);
    try {
      const md = r.rendered.toString("utf8");
      // The pass-3-canonical form
      expect(md).toContain(ACTIVATION_TIER_A_LIST);
      // Stale forms from earlier drafts MUST NOT appear
      expect(md).not.toContain("{ doc, project, env, query, fn }");
      // No `${VERSION}` example survives — was a stale binding
      expect(md).not.toContain("${VERSION}");
      // No invented env.DATA_DIR binding survives
      expect(md).not.toContain("env.DATA_DIR");
      // No stale SQL-shaped query surface survives in the live v0.1 contract
      expect(md).not.toContain("Query LIMIT cap fires on adversarial input");
      expect(md).not.toContain("render-dsl-query.test.ts");
    } finally {
      rmSync(r.dataDir, { recursive: true, force: true });
    }
  });

  it("BOTH SPECs declare the standard helper count consistently", () => {
    for (const spec of SPECS) {
      const r = buildAndValidate(spec.script, spec.projectId);
      try {
        const md = r.rendered.toString("utf8");
        // The count appears in the inventory headings on both sides.
        const re = new RegExp(`\\b${STANDARD_HELPER_COUNT}\\b`);
        expect(md).toMatch(re);
      } finally {
        rmSync(r.dataDir, { recursive: true, force: true });
      }
    }
  });

  it("EXPR-RT does not regress on semver guidance or AC/migration consistency", () => {
    const r = buildAndValidate(SPECS[0]!.script, SPECS[0]!.projectId);
    try {
      const md = r.rendered.toString("utf8");
      expect(md).not.toContain('Major must be 1 for FDPM Core 1.x.');
      expect(md).toContain(
        "version-aware compatibility gate via manifest pinning without forcing unsafe template-time string comparison.",
      );
      expect(md).not.toContain("helper-set major bump");
      expect(md).toContain("helper-set minor bump");
      expect(md).not.toContain("Depends on AC4");
    } finally {
      rmSync(r.dataDir, { recursive: true, force: true });
    }
  });
}, 120_000);
