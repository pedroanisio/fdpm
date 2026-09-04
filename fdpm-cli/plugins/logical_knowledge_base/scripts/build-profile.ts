/**
 * Plugin build step — regenerates the derivation-owned artefacts:
 *
 *   generated/profile.json      the DomainProfile `deriveProfile()` emits
 *   generated/schema-hash.json  sha256 over the inputs the profile is a
 *                               function of (schemas/lkb.ts, derive.ts)
 *
 * index.ts, validators.ts, transfer.ts, renderers/ and prompts.ts are
 * author-owned and NOT regenerated.
 *
 *   npx tsx plugins/logical_knowledge_base/scripts/build-profile.ts           (writes)
 *   npx tsx plugins/logical_knowledge_base/scripts/build-profile.ts --check   (exit 1 on drift)
 *
 * The check is what makes the vendored schema safe to re-vendor: a schema
 * change that moves the profile fails here (and in tests/plugins/
 * logical_knowledge_base/derive.test.ts) until the profile and the plugin
 * version move with it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveProfile, PROFILE_VERSION, stableStringify } from "../derive.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");
const CHECK_MODE = process.argv.includes("--check");

export const HASH_SOURCES = ["schemas/lkb.ts", "derive.ts"] as const;

export function schemaHash(): string {
  const h = createHash("sha256");
  for (const rel of HASH_SOURCES) h.update(readFileSync(join(PLUGIN_DIR, rel)));
  return h.digest("hex");
}

export function plannedFiles(): Map<string, string> {
  const files = new Map<string, string>();
  files.set("generated/profile.json", stableStringify(deriveProfile()) + "\n");
  files.set(
    "generated/schema-hash.json",
    stableStringify({
      hash: schemaHash(),
      hash_algo: "sha256",
      pinned_plugin_version: PROFILE_VERSION,
      sources: [...HASH_SOURCES],
    }) + "\n",
  );
  return files;
}

function main(): void {
  const planned = plannedFiles();
  const drift: string[] = [];
  for (const [rel, content] of planned) {
    const abs = join(PLUGIN_DIR, rel);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
    if (current === content) continue;
    if (CHECK_MODE) {
      drift.push(current === undefined ? `${rel}: missing` : `${rel}: differs`);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    process.stdout.write(`wrote ${rel}\n`);
  }
  if (CHECK_MODE) {
    if (drift.length > 0) {
      process.stderr.write(`logical_knowledge_base generated artefacts drifted:\n  ${drift.join("\n  ")}\n`);
      process.exit(1);
    }
    process.stdout.write("logical_knowledge_base generated artefacts are current\n");
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
