/**
 * Manifest ↔ runtime rule_id parity for acme.pitch-deck.
 *
 * The how-to (§5 cap:validator) requires manifest.capabilities[]
 * .metadata.rule_ids to be the closed set the runtime validator may
 * emit. The bridge's enumerateRuleIds() walks a Zod schema's _def at
 * build time to compute this set; the runtime validator emits members
 * of that set (rule_id derived from issue.code + issue.path).
 *
 * This test asserts:
 *   1. Every cap:validator entry's rule_ids are non-empty and unique.
 *   2. For each cap:validator targeting an entity present in the
 *      sidecar, runtime enumerateRuleIds(schema) ⊆ manifest's rule_ids.
 *      (Subset, not equality, because some Zod issues are runtime-only
 *      and the static enumerator captures the closed superset.)
 *   3. The manifest's plugin id and profile id match the sidecar's
 *      constants — the same drift assertion activate() makes at
 *      runtime, but caught at test time.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateRuleIds } from "@fdpm/zod-bridge";
import {
  buildPitchDeckSidecar,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  validatorSchemaFor,
  variantFieldsByEntity,
} from "../../../plugins/acme_pitch_deck/sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "acme_pitch_deck");

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

describe("acme.pitch-deck — manifest ↔ runtime parity", () => {
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
      expect(c.metadata?.rule_ids, `cap ${c.local_name}`).toBeDefined();
      expect((c.metadata!.rule_ids ?? []).length, `cap ${c.local_name}`).toBeGreaterThan(0);
    }
  });

  it("rule_ids within each cap:validator are unique", () => {
    for (const c of validatorCaps) {
      const ids = c.metadata!.rule_ids ?? [];
      expect(new Set(ids).size, `cap ${c.local_name}`).toBe(ids.length);
    }
  });

  it("for each entity, enumerateRuleIds ⊆ manifest's declared rule_ids", () => {
    const sidecar = buildPitchDeckSidecar();
    const variantFields = variantFieldsByEntity(sidecar);
    for (const [entityName, entity] of Object.entries(sidecar.entities)) {
      const typeId = `acme:${entityName}`;
      const lower = entityName.toLowerCase();
      // An entity may have multiple cap:validator entries
      // (per-entity Zod validator + cross-entity validators like
      // deck-coherence). Pick the schema-derived one by matching
      // rule_ids that start with <pluginId>:zod.<entityName>.
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
      // Use the SAME omit-stripped schema the runtime uses, so the
      // rule_id closed set the manifest declares for the parent
      // entity does not need to enumerate rules for variant-fanned-out
      // fields (those rules belong to the variant primitives' own
      // cap:validator entries).
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

  it("PROFILE_ID is consistent across sidecar.ts and the emitted profile", () => {
    const profile = JSON.parse(
      readFileSync(join(PLUGIN_DIR, "generated", "profile.json"), "utf8"),
    );
    expect(profile.id).toBe(PROFILE_ID);
  });
});
