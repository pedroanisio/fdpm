/**
 * Generates the `FDPM_*` documentation from `FDPM_ENV_VARS`.
 *
 * `src/core/config/env.ts` is the source of truth: a typed registry of
 * `{ name, defaultValue, exampleValue, summary }` with a renderer for `--help`
 * output. Three further copies were maintained by hand — the "Environment
 * variables" tables in `README.md` and `fdpm-cli/MANUAL.md`, and
 * `fdpm-cli/.env.example`.
 *
 * Three hand-synchronised copies of one list is a drift generator. A
 * doc-hygiene audit on 2026-08-29 found all three agreeing *by coincidence*,
 * which is the most dangerous state to leave them in: adding the twenty-third
 * variable would have silently broken both mirrors. Wiring the confirmation-
 * token gate (SPEC-MCP-SERVER §9.3) added the twenty-third and twenty-fourth
 * in the same session, and did exactly that.
 *
 * This script rewrites the marker-delimited spans in both files.
 *   write:  npx tsx scripts/build-env-docs.ts
 *   verify: npx tsx scripts/build-env-docs.ts --check   (used by CI + tests)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { FDPM_ENV_VARS } from "../src/core/config/env.js";

const CLI_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");

const README = join(REPO_ROOT, "README.md");
const MANUAL = join(CLI_ROOT, "MANUAL.md");
const DOTENV = join(CLI_ROOT, ".env.example");

const BEGIN = "<!-- BEGIN GENERATED: env-vars (scripts/build-env-docs.ts) -->";
const END = "<!-- END GENERATED: env-vars -->";
const SH_BEGIN = "# BEGIN GENERATED: env-vars (scripts/build-env-docs.ts)";
const SH_END = "# END GENERATED: env-vars";

/** Markdown table cell: `unset` reads better unfenced than as empty code. */
function defaultCell(value: string): string {
  return value === "unset" ? "unset" : `\`${value}\``;
}

/**
 * Registry summaries are lower-case sentence fragments ("persistence directory
 * for ...") because `--help` renders them after an aligned label. Prose
 * surfaces want a sentence.
 */
function sentence(summary: string): string {
  const s = summary.trim();
  const capitalised = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * A bare `|` inside a Markdown table cell ends the cell. Several summaries
 * list alternatives that way ("debug | info | warn"), which silently shredded
 * the generated table until this escape was added.
 */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function renderReadmeTable(): string {
  const rows = FDPM_ENV_VARS.map(
    (v) => `| \`${v.name}\` | ${cell(defaultCell(v.defaultValue))} | ${cell(sentence(v.summary))} |`,
  );
  return [
    BEGIN,
    "",
    "| Variable | Default | Purpose |",
    "| --- | --- | --- |",
    ...rows,
    "",
    END,
  ].join("\n");
}

function renderDotEnv(): string {
  const blocks = FDPM_ENV_VARS.map(
    (v) => `# ${sentence(v.summary)}\n${v.name}=${v.defaultValue === "unset" ? "" : v.exampleValue}`,
  );
  return [SH_BEGIN, "", ...blocks.join("\n\n").split("\n"), "", SH_END].join("\n");
}

function replaceSpan(path: string, begin: string, end: string, body: string): string {
  const text = readFileSync(path, "utf8");
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(
      `${path}: generated-span markers not found.\n` +
        `Expected a ${JSON.stringify(begin)} … ${JSON.stringify(end)} pair.`,
    );
  }
  return text.slice(0, i) + body + text.slice(j + end.length);
}

const targets = [
  { path: README, next: replaceSpan(README, BEGIN, END, renderReadmeTable()) },
  { path: MANUAL, next: replaceSpan(MANUAL, BEGIN, END, renderReadmeTable()) },
  { path: DOTENV, next: replaceSpan(DOTENV, SH_BEGIN, SH_END, renderDotEnv()) },
];

if (process.argv.includes("--check")) {
  const stale = targets.filter((t) => readFileSync(t.path, "utf8") !== t.next);
  if (stale.length > 0) {
    console.error(
      "env docs drift: these files no longer match FDPM_ENV_VARS:\n" +
        stale.map((t) => `  ${t.path}`).join("\n") +
        "\nRun: npx tsx scripts/build-env-docs.ts",
    );
    process.exit(1);
  }
  console.log(`env docs: up to date (${FDPM_ENV_VARS.length} variables)`);
} else {
  for (const t of targets) writeFileSync(t.path, t.next, "utf8");
  console.log(`wrote env docs for ${FDPM_ENV_VARS.length} variables`);
}
