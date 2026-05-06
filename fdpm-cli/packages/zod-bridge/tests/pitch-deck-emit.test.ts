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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// /home/admin/github-mirror/_editors/fdpm-cli (repo root)
// __dirname = .../fdpm-cli/fdpm-cli/packages/zod-bridge/tests
// up 4 = .../fdpm-cli (the outer fdpm-cli that holds /static, /docs, etc.)
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
// Hermetic CI path (test isolation).
const TMP_OUT = "/tmp/pitch-deck-bridge-out";
// In-repo committed snapshot — the deterministic output is part of the
// repository so reviewers can diff schema changes against generated
// plugin shape without running the bridge.
const REPO_OUT = join(REPO_ROOT, "static", "generated", "acme-pitch-deck");

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

function emitTo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const sidecar = buildPitchDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  // Stage 1 — generated/* artefacts (six JSON files).
  writeArtefactsToDir(result, { outputDir: dir });

  // Stage 2 — fdpm-plugin.json + index.ts.
  writePluginScaffold(result, {
    outputDir: dir,
    pluginName: "Acme Pitch Deck",
    pluginDescription:
      "Strategic pitch-deck plugin auto-generated from static/schemas/pitch-deck.schema.v2.ts via @fdpm/zod-bridge. Models 8 entities (Audience, Source, DataPoint, StrategicClaim, Risk, Competitor, AntiPattern, Slide) and 8 cross-entity relations. Cross-deck invariants (audience coverage, time budget, source freshness, displayNumber contiguity) remain in the schema's superRefine and require author-supplied cap:validator closures to lift them to the host.",
    authors: ["acme"],
    license: "MIT",
  });

  // Stage 3 — per-entity capability descriptors. The bridge cannot
  // serialize closures, but it CAN emit the manifest-shape JSON for
  // each capability so the author can audit the wiring before
  // dropping in the import-the-schema runtime glue.
  const capDir = join(dir, "capabilities");
  mkdirSync(capDir, { recursive: true });

  const entityNames = Object.keys(sidecar.entities);
  for (const entityName of entityNames) {
    const primitiveTypeId = `acme:${entityName}`;
    const schema = sidecar.entities[entityName]!.schema;

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
}

function assertExpectedTree(root: string): void {
  const tree = listTree(root);
  const rels = tree.map((e) => e.path.replace(root + "/", ""));
  const entityNames = Object.keys(buildPitchDeckSidecar().entities);
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
}

describe("pitch-deck v2 — full emission", () => {
  it("writes every artefact + scaffold + per-entity capability emission to /tmp", () => {
    emitTo(TMP_OUT);
    const tree = listTree(TMP_OUT);

    // eslint-disable-next-line no-console
    console.log("\n=== Generated tree (root: " + TMP_OUT + ") ===");
    for (const e of tree) {
      // eslint-disable-next-line no-console
      console.log(`  ${e.path.replace(TMP_OUT, ".").padEnd(56)}  ${String(e.size).padStart(8)} bytes`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nTotal: ${tree.length} files`);

    assertExpectedTree(TMP_OUT);
  });

  it("writes the same tree to the in-repo committed snapshot", () => {
    // The repo path is the source of truth diffed by reviewers when
    // the schema or sidecar changes. The /tmp path is hermetic CI;
    // this path is what the operator commits.
    emitTo(REPO_OUT);
    assertExpectedTree(REPO_OUT);
  });
});
