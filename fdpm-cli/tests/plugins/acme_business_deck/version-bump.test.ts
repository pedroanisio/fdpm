/**
 * §11 version-bump gate for acme.business-deck.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "acme_business_deck");

interface SchemaHashRecord {
  hash_algo: "sha256";
  hash: string;
  pinned_plugin_version: string;
  sources: ReadonlyArray<string>;
}

describe("acme.business-deck — §11 version-bump gate", () => {
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
    expect(hashRecord.hash).toBe(h.digest("hex"));
  });

  it("pinned_plugin_version matches manifest.version", () => {
    expect(hashRecord.pinned_plugin_version).toBe(manifest.version);
  });
});
