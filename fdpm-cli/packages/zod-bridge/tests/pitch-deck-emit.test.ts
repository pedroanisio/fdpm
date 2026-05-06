/**
 * End-to-end emission probe: run @fdpm/zod-bridge@0.4.0 against
 * static/schemas/pitch-deck.schema.v2.ts and write every generated
 * file under a stable on-disk root so the operator can list and
 * inspect the output.
 *
 * The output directory is /tmp/pitch-deck-bridge-out — emptied each
 * run (no pollution across CI runs because /tmp is process-local
 * here, and the run is deterministic so two invocations produce
 * byte-equal trees).
 *
 * This test covers:
 *
 *   - the full sidecar pipeline (already exercised by pitch-deck-trial)
 *   - writeArtefactsToDir → generated/*.json
 *   - writePluginScaffold → fdpm-plugin.json + index.ts
 *   - the four cap:* derivations (renderer / importer / exporter /
 *     expr-helper) materialised per Entity
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Schemas } from "../../../../static/schemas/pitch-deck.schema.v2.js";
import {
  assembleDomainProfileFromSidecar,
  defineDomain,
  writeArtefactsToDir,
  writePluginScaffold,
  zodSchemaToMarkdownRenderer,
  zodSchemaToImporter,
  zodSchemaToExporter,
  zodSchemaToExprHelper,
} from "../src/index.js";

const OUT_ROOT = "/tmp/pitch-deck-bridge-out";

function buildPitchDeckSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Audience: { schema: Schemas.Audience, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Source: { schema: Schemas.Source as unknown as z.ZodObject<z.ZodRawShape>, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      DataPoint: { schema: Schemas.DataPoint, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      StrategicClaim: { schema: Schemas.Claim, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Risk: { schema: Schemas.Risk, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Competitor: { schema: Schemas.Competitor, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      AntiPattern: { schema: Schemas.AntiPattern, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
      Slide: { schema: Schemas.Slide, identityKind: "id-field", idField: "id", idSchema: Schemas.SlugId },
    },
    references: [
      { from: "DataPoint", field: "sourceIds", to: "Source", cardinality: "many-to-many" },
      { from: "Slide", field: "evidenceUsed", to: "DataPoint", cardinality: "many-to-many",
        inverse: { on: "DataPoint", field: "usedOnSlides" } },
      { from: "StrategicClaim", field: "supportedByDataPoints", to: "DataPoint", cardinality: "many-to-many" },
      { from: "StrategicClaim", field: "supportedByClaims", to: "StrategicClaim", cardinality: "many-to-many", acyclic: true },
      { from: "Slide", field: "claimsAdvanced", to: "StrategicClaim", cardinality: "many-to-many",
        inverse: { on: "StrategicClaim", field: "appearsOnSlides" } },
      { from: "Slide", field: "risksAddressed", to: "Risk", cardinality: "many-to-many",
        inverse: { on: "Risk", field: "addressedOnSlides" } },
      { from: "Slide", field: "competitorsCited", to: "Competitor", cardinality: "many-to-many" },
      { from: "Slide", field: "antiPatternsAvoided", to: "AntiPattern", cardinality: "many-to-many" },
    ],
    fdpm: {
      pluginId: "acme.pitch-deck",
      vendor: "acme",
      profileId: "profile:acme-pitch-deck:0.1",
      pluginVersion: "0.1.0",
      hostCompatibility: ">=0.5.0 <0.6.0",
    },
  });
}

interface TreeEntry {
  path: string;
  size: number;
}

function listTree(root: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  function walk(p: string): void {
    const stat = statSync(p);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(p).sort()) walk(join(p, entry));
      return;
    }
    out.push({ path: p, size: stat.size });
  }
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

describe("pitch-deck v2 — full emission to /tmp/pitch-deck-bridge-out", () => {
  it("writes every artefact + scaffold + per-entity capability emission", () => {
    rmSync(OUT_ROOT, { recursive: true, force: true });
    mkdirSync(OUT_ROOT, { recursive: true });

    const result = assembleDomainProfileFromSidecar({
      domain: buildPitchDeckSidecar(),
      generatedAt: "1970-01-01T00:00:00.000Z",
    });

    // Stage 1 — generated/* artefacts (six JSON files).
    writeArtefactsToDir(result, { outputDir: OUT_ROOT });

    // Stage 2 — fdpm-plugin.json + index.ts.
    writePluginScaffold(result, { outputDir: OUT_ROOT });

    // Stage 3 — per-entity capability descriptors. The bridge cannot
    // serialize closures, but it CAN emit the manifest-shape JSON for
    // each capability so the author can audit the wiring before
    // dropping in the import-the-schema runtime glue.
    const capDir = join(OUT_ROOT, "capabilities");
    mkdirSync(capDir, { recursive: true });

    const entityNames = Object.keys(buildPitchDeckSidecar().entities);
    for (const entityName of entityNames) {
      const primitiveTypeId = `acme:${entityName}`;
      const schema = buildPitchDeckSidecar().entities[entityName]!.schema;

      const renderer = zodSchemaToMarkdownRenderer(schema, {
        primitive_type_id: primitiveTypeId,
        fieldOrder: "schema",
      });
      const importer = zodSchemaToImporter(schema, {
        primitive_type_id: primitiveTypeId,
        idFrom: (p) => `${entityName.toLowerCase()}:${(p as { id: string }).id}`,
        pluginId: "acme.pitch-deck",
        typeName: entityName.toLowerCase(),
      });
      const exporter = zodSchemaToExporter(schema, {
        primitive_type_id: primitiveTypeId,
        filename: () => `${entityName.toLowerCase()}.json`,
        pluginId: "acme.pitch-deck",
      });
      const exprHelper = zodSchemaToExprHelper(schema, {
        function_name: `acme.isValid${entityName}`,
        arity: 1,
        arg_types: ["object"],
        return_type: "boolean",
      });

      writeFileSync(
        join(capDir, `${entityName}.capabilities.json`),
        JSON.stringify(
          {
            renderer: renderer.capability,
            importer: importer.capability,
            exporter: exporter.capability,
            exprHelper: exprHelper.capability,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    }

    const tree = listTree(OUT_ROOT);

    // eslint-disable-next-line no-console
    console.log("\n=== Generated tree (root: " + OUT_ROOT + ") ===");
    for (const e of tree) {
      // eslint-disable-next-line no-console
      console.log(`  ${e.path.replace(OUT_ROOT, ".").padEnd(56)}  ${String(e.size).padStart(8)} bytes`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nTotal: ${tree.length} files`);

    // Hard expectations so the test fails loudly if any file goes missing.
    const rels = tree.map((e) => e.path.replace(OUT_ROOT + "/", ""));
    expect(rels).toContain("fdpm-plugin.json");
    expect(rels).toContain("index.ts");
    expect(rels).toContain("generated/profile.json");
    expect(rels).toContain("generated/view-page.json");
    expect(rels).toContain("generated/product-page-bundle.json");
    expect(rels).toContain("generated/audit.json");
    expect(rels).toContain("generated/migration-hints.json");
    expect(rels).toContain("generated/usl-ng-core.json");
    for (const entityName of entityNames) {
      expect(rels).toContain(`capabilities/${entityName}.capabilities.json`);
    }
  });
});
