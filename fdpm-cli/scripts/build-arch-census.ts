/**
 * Generates `docs/architecture/CENSUS.md` — the counted facts about this
 * repository that architecture documents would otherwise restate by hand.
 *
 * Why this exists: the 2026-08-28 architecture snapshot carried six
 * hand-typed figures (plugin directories, TypeScript LOC, `FDPM_*`
 * variables, CI workflows, SPEC files, MCP tools). A doc-hygiene audit run
 * one day after that snapshot was published found all six wrong. Numbers a
 * human types into prose are a scheduled lie; the repository already knows
 * every one of them.
 *
 * Follows the same shape as `build-spec-*.ts`: this script is the source of
 * truth, `CENSUS.md` is its rendered artifact, and
 * `tests/_meta/arch-census-drift.test.ts` fails the build when the two
 * disagree. Run with `npx tsx scripts/build-arch-census.ts`; pass `--check`
 * to verify without writing.
 *
 * Counts are mechanical and reproducible from a clean checkout: no network,
 * no wall clock in the output.
 *
 * They are read from git's INDEX, not from the filesystem, and that is the
 * load-bearing decision here. Counting the working tree made the census a
 * function of whoever's checkout it ran in: an untracked file or an unstaged
 * edit — another agent's work in progress, a scratch script, a half-finished
 * plugin — was counted into the artifact. Since `--check` asserts the
 * committed census equals a regeneration, that made the gate unsatisfiable
 * whenever any uncommitted work existed. Whoever committed first shipped a
 * census describing files their commit did not contain, and the next clean
 * checkout regenerated something different and failed. Reading the index
 * makes the census a function of the tree being committed, which is the only
 * definition under which the gate can hold.
 *
 * Line counts are rounded to the nearest thousand ON PURPOSE. An exact LOC
 * figure changes on every commit, so an exact-match gate would demand a
 * regeneration alongside every source edit and would be switched off within
 * a week. Rounded, the gate fires only when the repository has moved by an
 * amount an architecture document would actually want to restate.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";


const CLI_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");
const OUT_PATH = join(REPO_ROOT, "docs/architecture/CENSUS.md");

/** Directories whose contents never count toward source measurements. */
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git", "generated"]);

/** Repo-relative paths, as `git ls-files` reports them. */
const CLI_PREFIX = "fdpm-cli/";

interface IndexEntry {
  /** Repo-relative path. */
  path: string;
  /** Blob the index holds for it — staged content, not the working copy. */
  sha: string;
}

function git(args: string[]): Buffer {
  return execFileSync("git", args, { cwd: REPO_ROOT, maxBuffer: 1 << 28 });
}

/**
 * Every path in git's index, with the blob it points at.
 *
 * `-s` gives the staged blob rather than the working copy, which is what
 * makes an unstaged edit invisible here. Read once and reused: the census
 * asks six questions of the same tree.
 */
function readIndex(): IndexEntry[] {
  const out = git(["ls-files", "-s", "-z"]).toString("utf8");
  const entries: IndexEntry[] = [];
  for (const record of out.split("\0")) {
    if (record.length === 0) continue;
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const sha = record.slice(0, tab).split(/\s+/)[1];
    const path = record.slice(tab + 1);
    if (sha === undefined) continue;
    if (path.split("/").some((segment) => EXCLUDED_DIRS.has(segment))) continue;
    entries.push({ path, sha });
  }
  if (entries.length === 0) {
    throw new Error(
      "arch census: git ls-files returned nothing. This script reads the git index, " +
        "so it requires a git checkout — it cannot count an exported tarball.",
    );
  }
  return entries;
}

const INDEX = readIndex();

/**
 * Blob contents for the given entries, in one `git cat-file --batch` pass.
 *
 * The batch protocol answers each request as `<sha> blob <size>\n`, then
 * exactly `size` bytes, then a newline. Sizes are honoured rather than split
 * on delimiters, so content containing the header shape cannot desynchronise
 * the parse.
 */
function readBlobs(entries: readonly IndexEntry[]): string[] {
  if (entries.length === 0) return [];
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: REPO_ROOT,
    input: entries.map((e) => e.sha).join("\n") + "\n",
    maxBuffer: 1 << 30,
  });
  const contents: string[] = [];
  let offset = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const newline = out.indexOf(0x0a, offset);
    if (newline === -1) break;
    const header = out.subarray(offset, newline).toString("utf8");
    const size = Number(header.split(" ")[2]);
    if (!Number.isFinite(size)) {
      throw new Error(`arch census: unreadable cat-file header ${JSON.stringify(header)}`);
    }
    const body = out.subarray(newline + 1, newline + 1 + size);
    contents.push(body.toString("utf8"));
    offset = newline + 1 + size + 1;
  }
  if (contents.length !== entries.length) {
    throw new Error(
      `arch census: git cat-file returned ${contents.length} blobs for ${entries.length} requests`,
    );
  }
  return contents;
}

const isTs = (p: string) => p.endsWith(".ts") || p.endsWith(".tsx");

/** Index entries under a repo-relative directory prefix. */
function under(prefix: string, predicate: (path: string) => boolean = () => true): IndexEntry[] {
  const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return INDEX.filter((e) => e.path.startsWith(dir) && predicate(e.path));
}

function countLines(entries: readonly IndexEntry[]): number {
  let total = 0;
  for (const content of readBlobs(entries)) total += content.split("\n").length;
  return total;
}

/** Source areas measured independently so the parts sum to the whole. */
const AREAS: readonly { label: string; dir: string }[] = [
  { label: "`src/`", dir: `${CLI_PREFIX}src` },
  { label: "`plugins/`", dir: `${CLI_PREFIX}plugins` },
  { label: "`tests/`", dir: `${CLI_PREFIX}tests` },
  { label: "`scripts/`", dir: `${CLI_PREFIX}scripts` },
  { label: "`packages/zod-bridge/`", dir: `${CLI_PREFIX}packages/zod-bridge` },
];

/** Directory names directly under `plugins/` that the index knows about. */
function pluginDirs(): string[] {
  const names = new Set<string>();
  for (const e of under(`${CLI_PREFIX}plugins`)) {
    const rest = e.path.slice(`${CLI_PREFIX}plugins/`.length);
    const slash = rest.indexOf("/");
    if (slash > 0) names.add(rest.slice(0, slash));
  }
  return [...names].sort();
}

function workflowFiles(): string[] {
  return under(`${CLI_PREFIX}.github/workflows`, (p) => p.endsWith(".yml") || p.endsWith(".yaml"))
    .map((e) => e.path.split("/").pop()!)
    .sort();
}

function specFiles(): string[] {
  return under("docs/specs", (p) => {
    const name = p.split("/").pop() ?? "";
    return name.startsWith("SPEC-") && name.endsWith(".md");
  })
    .map((e) => e.path.split("/").pop()!)
    .sort();
}

/** Distinct `fdpm.<group>.<verb>` tool ids advertised by the MCP manifest. */
function mcpToolIds(): string[] {
  const ids = new Set<string>();
  for (const content of readBlobs(under(`${CLI_PREFIX}src/mcp`, isTs))) {
    for (const m of content.matchAll(/["'`](fdpm\.[a-z_]+\.[a-z_]+)["'`]/g)) ids.add(m[1]!);
  }
  return [...ids].sort();
}

/**
 * `FDPM_*` names as the committed `env.ts` declares them.
 *
 * The module export is the source of truth for the code, but importing it
 * here would read the working copy and reintroduce exactly the dependence on
 * the checkout that the rest of this script removes. The committed blob is
 * scanned instead, and a parse that finds nothing fails loudly rather than
 * silently reporting zero.
 */
function envVarNames(): string[] {
  const entry = INDEX.find((e) => e.path === `${CLI_PREFIX}src/core/config/env.ts`);
  if (entry === undefined) throw new Error("arch census: src/core/config/env.ts is not tracked");
  const names = new Set<string>();
  for (const m of readBlobs([entry])[0]!.matchAll(/["'`](FDPM_[A-Z0-9_]+)["'`]/g)) names.add(m[1]!);
  if (names.size === 0) {
    throw new Error("arch census: found no FDPM_* names in the committed env.ts");
  }
  return [...names].sort();
}

function render(): string {
  const areaRows = AREAS.map((a) => {
    const lines = countLines(under(a.dir, isTs));
    return { label: a.label, lines };
  });
  const totalLines = areaRows.reduce((s, r) => s + r.lines, 0);
  const plugins = pluginDirs();
  const workflows = workflowFiles();
  const specs = specFiles();
  const tools = mcpToolIds();
  const envVars = envVarNames();

  // Rounded to the nearest 1,000 — see the header note on gate stability.
  const roundK = (n: number) => Math.round(n / 1000);
  const fmt = (n: number) => `≈${roundK(n)}K`;

  return `---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "fdpm-cli/scripts/build-arch-census.ts"
  date: "generated artifact — see git history for the commit that produced it"
---

<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Source: fdpm-cli/scripts/build-arch-census.ts
     Regenerate: npx tsx scripts/build-arch-census.ts
     Verified by: fdpm-cli/tests/_meta/arch-census-drift.test.ts -->

# Repository census

Counted facts about this repository. **Architecture documents link here
rather than restating these numbers**, because a hand-typed count is a
scheduled lie — the six figures in the 2026-08-28 snapshot were all wrong
within a day of publication.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

## Source volume

TypeScript only (\`.ts\`/\`.tsx\`), excluding \`node_modules/\`, \`dist/\`
and plugin \`generated/\` trees.

| Area | Lines (nearest 1,000) |
|---|---:|
${areaRows.map((r) => `| ${r.label} | ${fmt(r.lines)} |`).join("\n")}
| **Total** | **${fmt(totalLines)}** |

## Counts

| Fact | Value | Derivation |
|---|---:|---|
| Plugin directories | ${plugins.length} | \`plugins/*/\` |
| \`FDPM_*\` environment variables | ${envVars.length} | \`FDPM_ENV_VARS\` in \`src/core/config/env.ts\` |
| CI workflows | ${workflows.length} | \`.github/workflows/*.yml\` |
| \`SPEC-*.md\` documents | ${specs.length} | \`docs/specs/SPEC-*.md\` |
| Distinct MCP tool ids | ${tools.length} | \`fdpm.<group>.<verb>\` literals under \`src/mcp/\` |

## Plugin directories (${plugins.length})

${plugins.map((p) => `- \`${p}\``).join("\n")}

## CI workflows (${workflows.length})

${workflows.map((w) => `- \`.github/workflows/${w}\``).join("\n")}

## SPEC documents (${specs.length})

${specs.map((s) => `- \`docs/specs/${s}\``).join("\n")}
`;
}

const rendered = render();
const check = process.argv.includes("--check");
/* Render to stdout without touching the artifact. `--check` reports only a
   verdict, which is not enough to assert that two runs agree; a test that
   needs the census itself would otherwise have to write the file to read it. */
const print = process.argv.includes("--print");

if (print) {
  process.stdout.write(rendered);
} else if (check) {
  const existing = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
  if (existing !== rendered) {
    console.error(
      "arch census drift: docs/architecture/CENSUS.md is stale.\n" +
        "Run: npx tsx scripts/build-arch-census.ts",
    );
    process.exit(1);
  }
  console.log("arch census: up to date");
} else {
  writeFileSync(OUT_PATH, rendered, "utf8");
  console.log(`wrote ${OUT_PATH}`);
}
