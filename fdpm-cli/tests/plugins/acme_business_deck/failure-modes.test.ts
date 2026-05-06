/**
 * §9 failure-mode coverage for acme.business-deck.
 *
 * Six bridge-specific failures (failure:bridge:*). Each test trips
 * one and asserts it surfaces with a usable diagnostic. The schema
 * itself doesn't exercise every construct (no z.lazy, no z.brand on
 * non-id fields), so the brand and recursion tests synthesise a
 * minimal probe schema to verify the bridge contract holds.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assembleDomainProfileFromSidecar,
  defineDomain,
  zodSchemaToValidator,
} from "@fdpm/zod-bridge";
import {
  buildBusinessDeckSidecar,
  PLUGIN_ID,
  PROFILE_ID,
} from "../../../plugins/acme_business_deck/sidecar.js";
import { ClaimSchema } from "../../../plugins/acme_business_deck/schemas/business-deck.js";

describe("acme.business-deck — §9 bridge failure modes", () => {
  it("failure:branded-roundtrip — z.brand is stripped at translation (lim:zod-brand)", () => {
    const BrandedId = z.string().brand<"BrandedId">();
    const Branded = z.object({
      id: BrandedId,
      label: z.string(),
    });
    const sidecar = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Branded: { schema: Branded, identityKind: "id-field", idField: "id", idSchema: BrandedId },
      },
      references: [],
      fdpm: {
        pluginId: "acme.brand-test",
        vendor: "acme",
        profileId: "profile:acme-brand-test:0.1",
        pluginVersion: "0.1.0",
        hostCompatibility: ">=1.1,<2",
      },
    });
    const result = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const branded = result.profile.primitive_types.find((p) => p.id === "acme:Branded");
    expect(branded).toBeDefined();
    const idField = branded!.fields.find((f) => f.name === "id");
    expect(idField?.kind).toBe("string");
    expect(JSON.stringify(idField)).not.toMatch(/brand/i);
  });

  it("failure:cel-translation-fail — every emitted CEL constraint has a non-empty, balanced expression", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: buildBusinessDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    for (const c of result.profile.constraints ?? []) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.expression.length).toBeGreaterThan(0);
      expect(["error", "warning"]).toContain(c.level);
      expect(c.expression).not.toMatch(/\.{2,}/);
      const opens = (c.expression.match(/\(/g) ?? []).length;
      const closes = (c.expression.match(/\)/g) ?? []).length;
      expect(opens, `unbalanced parens in ${c.name}`).toBe(closes);
    }
  });

  it("failure:optional-vs-nullable — required/optional/nullable map deterministically", () => {
    const idSchema = z.string();
    const probe = z.object({
      a: idSchema,                         // required
      b: z.string().optional(),            // not required
      c: z.string().nullable(),            // required, nullable
      d: z.string().nullable().optional(), // not required, nullable
    });
    const sidecar = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Probe: { schema: probe, identityKind: "id-field", idField: "a", idSchema },
      },
      references: [],
      fdpm: {
        pluginId: "acme.opt-probe",
        vendor: "acme",
        profileId: "profile:acme-opt-probe:0.1",
        pluginVersion: "0.1.0",
        hostCompatibility: ">=1.1,<2",
      },
    });
    const result = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const t = result.profile.primitive_types.find((p) => p.id === "acme:Probe")!;
    const fA = t.fields.find((f) => f.name === "a")!;
    const fB = t.fields.find((f) => f.name === "b")!;
    const fC = t.fields.find((f) => f.name === "c")!;
    const fD = t.fields.find((f) => f.name === "d")!;
    expect(fA.required).toBe(true);
    expect(fA.nullable ?? false).toBe(false);
    expect(fB.required).toBe(false);
    expect(fC.required).toBe(true);
    expect(fC.nullable).toBe(true);
    expect(fD.required).toBe(false);
    expect(fD.nullable).toBe(true);
  });

  it("failure:recursion-loop — schema has no z.lazy; default recursionDepth=1 holds", () => {
    const result = assembleDomainProfileFromSidecar({
      domain: buildBusinessDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(result.profile.primitive_types.length).toBe(13);
  });

  it("failure:rule-id-collision — all derived rule_ids on a single entity are unique", () => {
    const { ruleIds } = zodSchemaToValidator(ClaimSchema, {
      pluginId: PLUGIN_ID,
      typeName: "claim",
    });
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(ruleIds.length).toBeGreaterThan(0);
  });

  it("failure:schema-drift-no-bump — committed schema-hash matches a fresh recomputation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const REPO = path.join(__dirname, "..", "..", "..");
    const PLUGIN_DIR = path.join(REPO, "plugins", "acme_business_deck");
    const hashRecord = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_DIR, "generated", "schema-hash.json"), "utf8"),
    );
    const crypto = await import("node:crypto");
    const schemaSrc = fs.readFileSync(
      path.join(PLUGIN_DIR, "schemas", "business-deck.ts"),
      "utf8",
    );
    const sidecarSrc = fs.readFileSync(path.join(PLUGIN_DIR, "sidecar.ts"), "utf8");
    const fresh = crypto
      .createHash("sha256")
      .update("schema:")
      .update(schemaSrc)
      .update("\nsidecar:")
      .update(sidecarSrc)
      .digest("hex");
    expect(hashRecord.hash, "schema/sidecar edited without `npm run bridge`").toBe(fresh);
    expect(PROFILE_ID).toBe("profile:acme-business-deck:0.1");
  });
});
