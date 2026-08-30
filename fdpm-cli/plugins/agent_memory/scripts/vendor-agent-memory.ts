/**
 * Re-vendor `schemas/agent-memory.ts` from the canonical contract, or
 * check the vendored copy against it.
 *
 *   tsx scripts/vendor-agent-memory.ts --source <path>          # re-vendor
 *   tsx scripts/vendor-agent-memory.ts --source <path> --check   # verify only
 *
 * The copy is verbatim but for ONE mechanical rewrite: the contract
 * imports its `Issue`/`ParseResult` types from a sibling module that
 * does not exist here, so that import is repointed at
 * `schemas/_contract-types.ts`, which reproduces the two types. Nothing
 * else is touched, and the rewrite is a single `String.replace` so a
 * reviewer can confirm it by reading this file.
 *
 * PROVENANCE IS NOT SELF-CHECKING. The source lives in another
 * repository, so `--check` can only run where that repository is
 * checked out; there is no CI gate in THIS repo that can prove the copy
 * is current. `generated/schema-hash.json` therefore records the source
 * digest as evidence of what was copied and when — not as a guarantee
 * that it is still the latest. Treat a drift finding as actionable and
 * the absence of one, on a machine without the source, as unknown.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(HERE, "..");
const VENDORED = join(PLUGIN_DIR, "schemas", "agent-memory.ts");
const HASH_FILE = join(PLUGIN_DIR, "generated", "schema-hash.json");

const IMPORT_FROM = 'from "./loop-forward.schema.js"';
const IMPORT_TO = 'from "./_contract-types.js"';

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The single mechanical rewrite the vendoring performs. */
export function vendorText(sourceText: string): string {
  return sourceText.replace(IMPORT_FROM, IMPORT_TO);
}

function main(argv: readonly string[]): number {
  const sourceIndex = argv.indexOf("--source");
  if (sourceIndex === -1 || argv[sourceIndex + 1] === undefined) {
    process.stderr.write("usage: vendor-agent-memory --source <path-to-agent-memory.schema.ts> [--check]\n");
    return 2;
  }
  const sourcePath = argv[sourceIndex + 1] as string;
  const check = argv.includes("--check");

  const sourceText = readFileSync(sourcePath, "utf8");
  const expected = vendorText(sourceText);
  const actual = readFileSync(VENDORED, "utf8");

  if (check) {
    if (expected === actual) {
      process.stdout.write(`vendored copy matches ${sourcePath}\n`);
      return 0;
    }
    process.stderr.write(
      `DRIFT: schemas/agent-memory.ts differs from ${sourcePath}\n` +
        `  source digest:   ${sha256(sourceText)}\n` +
        `  expected copy:   ${sha256(expected)}\n` +
        `  vendored copy:   ${sha256(actual)}\n` +
        `Re-run without --check to re-vendor, then re-read the profile for rules the contract changed.\n`,
    );
    return 1;
  }

  writeFileSync(VENDORED, expected, "utf8");
  const versionMatch = /export const SCHEMA_VERSION = "([^"]+)"/u.exec(expected);
  writeFileSync(
    HASH_FILE,
    `${JSON.stringify(
      {
        algorithm: "sha256",
        files: { "schemas/agent-memory.ts": sha256(expected) },
        vendored_from: sourcePath,
        vendored_from_digest: sha256(sourceText),
        vendored_at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
        schema_version: versionMatch?.[1] ?? null,
        rewrites: [{ from: IMPORT_FROM, to: IMPORT_TO }],
        note: "The source is external to this repository; --check runs only where it is checked out.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(`re-vendored from ${sourcePath}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
