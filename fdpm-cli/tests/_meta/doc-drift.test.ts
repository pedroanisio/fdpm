/**
 * CI gate: documentation that counts the repository must be generated, and
 * documentation that cites a file must cite one that exists.
 *
 * Motivation (doc-hygiene audit, 2026-08-29): the architecture snapshot
 * published on 2026-08-28 carried six hand-typed figures — plugin
 * directories, TypeScript LOC, `FDPM_*` variables, CI workflows, passing
 * tests, and the tracked/untracked status of a file. Every one was wrong
 * within twenty-four hours. Separately, `SPEC-DOCUMENT-PLAN.md` cited two
 * peer SPECs marked `verified` that have never existed in the tree.
 *
 * Six gates:
 *   1. `docs/architecture/CENSUS.md` matches `build-arch-census.ts` output.
 *   2. `README.md` + `.env.example` match `FDPM_ENV_VARS`.
 *   3. Every `docs/specs/SPEC-*.md` path referenced from a doc resolves.
 *   4. Every plugin directory ships a README.
 *   5. Every bridge-generated plugin README names the profile id its own
 *      `generated/product-page-bundle.json` declares.
 *   6. `docs/architecture/PROFILES.md` matches `build-profile-atlas.ts`
 *      output. Same reasoning as gate 1 applied to the profile inventory:
 *      twenty-one profiles' worth of type counts, rule ids and renderer
 *      targets is more hand-checkable facts than a reviewer will re-derive,
 *      so the artifact is asserted equal to a regeneration.
 *
 * These are cheap, deterministic (no network, no git, no clock) and fail
 * loudly, which is the whole point: a number nobody checks is a number that
 * rots.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NODE_COMMAND, tsxArgs } from "../_helpers/process.js";

const CLI_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");

describe("doc drift: repository census", () => {
  it("docs/architecture/CENSUS.md is not stale vs build-arch-census.ts", () => {
    // `--check` re-renders in memory and exits non-zero on any difference.
    expect(() =>
      execFileSync(NODE_COMMAND, tsxArgs(["scripts/build-arch-census.ts", "--check"]), {
        cwd: CLI_ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("docs/architecture/PROFILES.md is not stale vs build-profile-atlas.ts", () => {
    // Same `--check` contract as the census: re-render in memory, exit
    // non-zero on any difference.
    expect(() =>
      execFileSync(NODE_COMMAND, tsxArgs(["scripts/build-profile-atlas.ts", "--check"]), {
        cwd: CLI_ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("names every profile the host registers from this checkout's plugins", () => {
    // The generator could silently drop a profile — a filter that is too
    // narrow leaves `--check` passing against a document missing entries.
    // Assert the artifact against the plugin directories themselves, which
    // is a source the generator does not read.
    const atlas = readFileSync(join(REPO_ROOT, "docs/architecture/PROFILES.md"), "utf8");
    const pluginDirs = readdirSync(join(CLI_ROOT, "plugins")).filter((d) =>
      existsSync(join(CLI_ROOT, "plugins", d, "fdpm-plugin.json")),
    );
    expect(pluginDirs.length).toBeGreaterThan(0);
    for (const dir of pluginDirs) {
      expect(atlas, `PROFILES.md must account for plugins/${dir}/`).toContain(
        `\`plugins/${dir}/\``,
      );
    }
    // And the core-shipped profile, which belongs to no plugin.
    expect(atlas).toContain("`core:empty`");
  });

  it("counts the repository-root public workflows", () => {
    const census = readFileSync(
      join(REPO_ROOT, "docs/architecture/CENSUS.md"),
      "utf8",
    );
    for (const workflow of ["ci.yml", "codeql.yml", "release.yml"]) {
      expect(census).toContain(`- \`.github/workflows/${workflow}\``);
    }
  });
});

/**
 * The census must describe the *commit*, not the checkout.
 *
 * `build-arch-census.ts` counted the working tree, so every line another
 * agent had written but not committed was counted into `CENSUS.md`. The
 * consequence is not cosmetic: `--check` asserts the committed artifact
 * equals a regeneration, so while any uncommitted work exists the gate
 * cannot be satisfied by any commit at all. Whoever commits first ships a
 * census describing files their commit does not contain, and the next clean
 * checkout regenerates something different and fails.
 *
 * The fix is that the generator reads git's index rather than the
 * filesystem. These tests pin that: untracked files and unstaged edits are
 * invisible to the census, which is exactly what makes it a function of the
 * tree being committed.
 */
describe("doc drift: the census describes the committed tree", () => {
  const census = (): string =>
    execFileSync(NODE_COMMAND, tsxArgs(["scripts/build-arch-census.ts", "--print"]), {
      cwd: CLI_ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });

  it("ignores an untracked source file", () => {
    const intruder = join(CLI_ROOT, "plugins/__census_probe__.ts");
    const before = census();
    // Big enough to move a figure rounded to the nearest thousand lines.
    writeFileSync(intruder, `// probe\n${"const x = 1;\n".repeat(4000)}`);
    try {
      expect(census()).toBe(before);
    } finally {
      rmSync(intruder, { force: true });
    }
    expect(census()).toBe(before);
  });

  it("ignores an unstaged edit to a tracked file", () => {
    const tracked = join(CLI_ROOT, "scripts/build-arch-census.ts");
    const original = readFileSync(tracked, "utf8");
    const before = census();
    writeFileSync(tracked, `${original}\n${"// padding\n".repeat(4000)}`);
    try {
      expect(census()).toBe(before);
    } finally {
      writeFileSync(tracked, original);
    }
  });
});

describe("doc drift: environment-variable documentation", () => {
  it("README.md and .env.example are not stale vs FDPM_ENV_VARS", () => {
    expect(() =>
      execFileSync(NODE_COMMAND, tsxArgs(["scripts/build-env-docs.ts", "--check"]), {
        cwd: CLI_ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

describe("doc drift: SPEC cross-references resolve", () => {
  const SPEC_DIR = join(REPO_ROOT, "docs/specs");

  /** Every markdown doc that could cite a SPEC path. */
  function docFiles(): string[] {
    const roots = ["docs/specs", "docs/architecture", "docs/planning"];
    const out: string[] = [];
    for (const r of roots) {
      const dir = join(REPO_ROOT, r);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".md")) out.push(join(dir, f));
      }
    }
    return out.sort();
  }

  const files = docFiles();
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    it(`${file.slice(REPO_ROOT.length + 1)} cites only SPEC files that exist`, () => {
      const text = readFileSync(file, "utf8");
      const cited = new Set<string>();
      for (const m of text.matchAll(/docs\/specs\/(SPEC-[A-Z0-9-]+)\.md/g)) {
        cited.add(m[1]!);
      }
      const missing = [...cited]
        .filter((s) => !existsSync(join(SPEC_DIR, `${s}.md`)))
        .sort();
      expect(missing, `cited but absent from docs/specs/: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

describe("doc drift: every plugin ships a README", () => {
  const PLUGINS_DIR = join(CLI_ROOT, "plugins");
  const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  it("finds plugin directories to check", () => {
    expect(plugins.length).toBeGreaterThan(0);
  });

  for (const plugin of plugins) {
    it(`plugins/${plugin}/README.md exists and is substantive`, () => {
      const readme = join(PLUGINS_DIR, plugin, "README.md");
      expect(existsSync(readme), `plugins/${plugin}/README.md is missing`).toBe(true);
      // A stub is not documentation. The smallest real plugin README in the
      // tree at the time of writing is ~120 lines; 40 is a floor, not a target.
      expect(statSync(readme).size, `plugins/${plugin}/README.md is a stub`).toBeGreaterThan(400);
    });
  }
});

describe("doc drift: bridge-generated READMEs match their product-page bundle", () => {
  // The bridge emits `generated/product-page-bundle.json` — described in the
  // zod-bridge README as "structured facts for the README" — and holds it
  // byte-stable through `run-bridge.ts --check`. Nothing compared the README
  // to it, so the generated facts and the prose could disagree indefinitely.
  //
  // Prose counts are not machine-checkable without pinning phrasing, so this
  // gate asserts the one fact that is both unambiguous and most costly to get
  // wrong: the profile id a reader would copy out of the README.
  const PLUGINS_DIR = join(CLI_ROOT, "plugins");
  const withBundle = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(join(PLUGINS_DIR, name, "generated/product-page-bundle.json")))
    .sort();

  it("finds bridge-generated plugins to check", () => {
    expect(withBundle.length).toBeGreaterThan(0);
  });

  for (const plugin of withBundle) {
    it(`plugins/${plugin}/README.md states its generated profile id`, () => {
      const bundle = JSON.parse(
        readFileSync(join(PLUGINS_DIR, plugin, "generated/product-page-bundle.json"), "utf8"),
      ) as { profile_id?: string };
      const readme = join(PLUGINS_DIR, plugin, "README.md");
      if (!existsSync(readme)) return; // covered by the README-presence gate
      const profileId = bundle.profile_id;
      expect(profileId, `${plugin} bundle has no profile_id`).toBeTruthy();
      expect(
        readFileSync(readme, "utf8").includes(profileId!),
        `plugins/${plugin}/README.md does not mention ${profileId} — the bundle and the prose have drifted`,
      ).toBe(true);
    });
  }
});
