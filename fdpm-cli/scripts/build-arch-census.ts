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
 * Counts are deliberately mechanical and reproducible from a clean
 * checkout: no network, no git history, no wall clock in the output.
 *
 * Line counts are rounded to the nearest thousand ON PURPOSE. An exact LOC
 * figure changes on every commit, so an exact-match gate would demand a
 * regeneration alongside every source edit and would be switched off within
 * a week. Rounded, the gate fires only when the repository has moved by an
 * amount an architecture document would actually want to restate.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { FDPM_ENV_VARS } from "../src/core/config/env.js";

const CLI_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");
const OUT_PATH = join(REPO_ROOT, "docs/architecture/CENSUS.md");

/** Directories whose contents never count toward source measurements. */
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git", "generated"]);

function walk(dir: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...walk(join(dir, entry.name), predicate));
    } else if (predicate(join(dir, entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const isTs = (p: string) => p.endsWith(".ts") || p.endsWith(".tsx");

function countLines(files: string[]): number {
  let total = 0;
  for (const f of files) total += readFileSync(f, "utf8").split("\n").length;
  return total;
}

/** Source areas measured independently so the parts sum to the whole. */
const AREAS: readonly { label: string; dir: string }[] = [
  { label: "`src/`", dir: join(CLI_ROOT, "src") },
  { label: "`plugins/`", dir: join(CLI_ROOT, "plugins") },
  { label: "`tests/`", dir: join(CLI_ROOT, "tests") },
  { label: "`scripts/`", dir: join(CLI_ROOT, "scripts") },
  { label: "`packages/zod-bridge/`", dir: join(CLI_ROOT, "packages/zod-bridge") },
];

function pluginDirs(): string[] {
  const root = join(CLI_ROOT, "plugins");
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function workflowFiles(): string[] {
  const dir = join(CLI_ROOT, ".github/workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
}

function specFiles(): string[] {
  const dir = join(REPO_ROOT, "docs/specs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith("SPEC-") && f.endsWith(".md")).sort();
}

/** Distinct `fdpm.<group>.<verb>` tool ids advertised by the MCP manifest. */
function mcpToolIds(): string[] {
  const files = walk(join(CLI_ROOT, "src/mcp"), isTs);
  const ids = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/["'`](fdpm\.[a-z_]+\.[a-z_]+)["'`]/g)) {
      ids.add(m[1]!);
    }
  }
  return [...ids].sort();
}

function render(): string {
  const areaRows = AREAS.map((a) => {
    const lines = countLines(walk(a.dir, isTs));
    return { label: a.label, lines };
  });
  const totalLines = areaRows.reduce((s, r) => s + r.lines, 0);
  const plugins = pluginDirs();
  const workflows = workflowFiles();
  const specs = specFiles();
  const tools = mcpToolIds();

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
| \`FDPM_*\` environment variables | ${FDPM_ENV_VARS.length} | \`FDPM_ENV_VARS\` in \`src/core/config/env.ts\` |
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

if (check) {
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
