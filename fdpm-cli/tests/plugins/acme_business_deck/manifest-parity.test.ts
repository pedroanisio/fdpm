/**
 * Manifest ↔ runtime rule_id parity for acme.business-deck.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateRuleIds } from "@fdpm/zod-bridge";
import {
  buildBusinessDeckSidecar,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  validatorSchemaFor,
  variantFieldsByEntity,
} from "../../../plugins/acme_business_deck/sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "acme_business_deck");

interface Cap {
  capability_id: string;
  local_name: string;
  entry?: string;
  metadata?: {
    target_type_id?: string;
    rule_ids?: ReadonlyArray<string>;
    [k: string]: unknown;
  };
}
interface Manifest {
  id: string;
  version: string;
  capabilities: ReadonlyArray<Cap>;
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(PLUGIN_DIR, "fdpm-plugin.json"), "utf8"),
);
const validatorCaps = manifest.capabilities.filter(
  (c) => c.capability_id === "cap:validator",
);

describe("acme.business-deck — manifest ↔ runtime parity", () => {
  it("manifest.id matches PLUGIN_ID", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
  });

  it("manifest.version matches sidecar PLUGIN_VERSION", () => {
    expect(manifest.version).toBe(PLUGIN_VERSION);
  });

  it("schema-hash record's pinned_plugin_version matches manifest.version", () => {
    const hashRecord = JSON.parse(
      readFileSync(join(PLUGIN_DIR, "generated", "schema-hash.json"), "utf8"),
    );
    expect(hashRecord.pinned_plugin_version).toBe(manifest.version);
  });

  it("every cap:validator declares a non-empty rule_ids closed set", () => {
    for (const c of validatorCaps) {
      expect(c.metadata?.rule_ids).toBeDefined();
      expect((c.metadata!.rule_ids ?? []).length).toBeGreaterThan(0);
    }
  });

  it("rule_ids within each cap:validator are unique", () => {
    for (const c of validatorCaps) {
      const ids = c.metadata!.rule_ids ?? [];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("for each entity, enumerateRuleIds ⊆ manifest's declared rule_ids", () => {
    const sidecar = buildBusinessDeckSidecar();
    const variantFields = variantFieldsByEntity(sidecar);
    for (const [entityName, entity] of Object.entries(sidecar.entities)) {
      const typeId = `acme:${entityName}`;
      const lower = entityName.toLowerCase();
      const expectedPrefix = `${PLUGIN_ID}:zod.${lower}.`;
      const cap = validatorCaps.find(
        (c) =>
          c.metadata?.target_type_id === typeId &&
          (c.metadata?.rule_ids ?? []).some((r) => r.startsWith(expectedPrefix)),
      );
      expect(
        cap,
        `manifest must declare a Zod cap:validator for ${typeId} with rule_ids prefixed "${expectedPrefix}"`,
      ).toBeDefined();
      const declared = new Set(cap!.metadata!.rule_ids ?? []);
      const schemaForRuntime = validatorSchemaFor(
        entityName,
        entity.schema,
        variantFields,
      );
      const runtimeIds = enumerateRuleIds(schemaForRuntime, {
        pluginId: PLUGIN_ID,
        typeName: lower,
      });
      const missing = runtimeIds.filter((id) => !declared.has(id));
      expect(
        missing,
        `runtime rule_ids missing from manifest for ${typeId}: ${missing.slice(0, 5).join(", ")}`,
      ).toEqual([]);
    }
  });

  it("PROFILE_ID is consistent across sidecar and emitted profile", () => {
    const profile = JSON.parse(
      readFileSync(join(PLUGIN_DIR, "generated", "profile.json"), "utf8"),
    );
    expect(profile.id).toBe(PROFILE_ID);
  });
});
