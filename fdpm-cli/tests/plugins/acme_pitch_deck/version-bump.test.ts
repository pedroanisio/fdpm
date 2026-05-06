/**
 * §11 version-bump gate for acme.pitch-deck.
 *
 * principle:schema-change-implies-version-bump — every change to a
 * Zod schema in `schemas/` MUST be accompanied by a plugin-version
 * bump in `fdpm-plugin.json`. The schema-hash file
 * (generated/schema-hash.json, written by run-bridge.ts) records:
 *
 *   - hash:                   SHA-256 over schema + sidecar source
 *   - pinned_plugin_version:  the manifest version at hash time
 *
 * If a developer edits the schema, the next `npm run bridge` rewrites
 * BOTH files. If they did NOT bump the version, the rewritten hash
 * pairs with the OLD version — and this test fails because the on-
 * disk pinned_plugin_version no longer matches a fresh hash.
 *
 * The complementary failure mode (schema-drift-no-bump) — schema
 * edited and the bridge NOT run — is caught by the determinism test
 * (which spawns `run-bridge.ts --check` in a fresh subprocess).
 *
 * Together: the two gates make principle:schema-change-implies-
 * version-bump auditable from the test suite alone.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "acme_pitch_deck");

interface SchemaHashRecord {
  hash_algo: "sha256";
  hash: string;
  pinned_plugin_version: string;
  sources: ReadonlyArray<string>;
}

describe("acme.pitch-deck — §11 version-bump gate", () => {
  const hashRecord: SchemaHashRecord = JSON.parse(
    readFileSync(join(PLUGIN_DIR, "generated", "schema-hash.json"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(join(PLUGIN_DIR, "fdpm-plugin.json"), "utf8"),
  );

  it("schema-hash file is well-formed", () => {
    expect(hashRecord.hash_algo).toBe("sha256");
    expect(hashRecord.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecord.pinned_plugin_version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(hashRecord.sources.length).toBeGreaterThan(0);
  });

  it("hash matches a fresh recomputation over the listed sources", () => {
    const h = createHash("sha256");
    h.update("schema:");
    h.update(readFileSync(join(PLUGIN_DIR, hashRecord.sources[0]!), "utf8"));
    h.update("\nsidecar:");
    h.update(readFileSync(join(PLUGIN_DIR, hashRecord.sources[1]!), "utf8"));
    const fresh = h.digest("hex");
    expect(
      hashRecord.hash,
      'schema or sidecar edited without running `npm run bridge`. Run it and commit the regenerated files.',
    ).toBe(fresh);
  });

  it("pinned_plugin_version matches manifest.version (bump on schema edit)", () => {
    expect(
      hashRecord.pinned_plugin_version,
      `version skew: hash was pinned at ${hashRecord.pinned_plugin_version} but manifest declares ${manifest.version}. Either re-run \`npm run bridge\` to repin, or bump manifest.version + sidecar.PLUGIN_VERSION on schema changes (principle:schema-change-implies-version-bump).`,
    ).toBe(manifest.version);
  });
});
