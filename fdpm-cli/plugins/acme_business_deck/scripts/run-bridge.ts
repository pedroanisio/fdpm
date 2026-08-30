/**
 * Plugin build step — regenerates every bridge-owned artefact in
 * plugins/acme_business_deck/.
 *
 * Per howto-zod-to-fdpm-plugin §11 (`example:ci-snapshot-gate`,
 * `principle:schema-change-implies-version-bump`).
 *
 * Outputs (all under plugins/acme_business_deck/):
 *   generated/profile.json
 *   generated/view-page.json
 *   generated/product-page-bundle.json
 *   generated/audit.json
 *   generated/migration-hints.json
 *   generated/usl-ng-core.json
 *   generated/schema-hash.json     (sha256 schema+sidecar + pinned version)
 *   capabilities/<Entity>.capabilities.json   (one per Entity)
 *   fdpm-plugin.json               (extended with optional caps)
 *
 * Run with:    npm run bridge          (writes)
 * Run with:    npm run bridge:check    (drift check, exit 1 on diff)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleDomainProfileFromSidecar,
  stableStringify,
  writeArtefactsToDir,
  writePluginScaffold,
  zodSchemaToExporter,
  zodSchemaToExprHelper,
  zodSchemaToImporter,
  zodSchemaToMarkdownRenderer,
} from "@fdpm/zod-bridge";
import { buildBusinessDeckSidecar, PLUGIN_ID, PLUGIN_VERSION } from "../sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");

const CHECK_MODE = process.argv.includes("--check");

interface CapabilityEntry {
  capability_id: string;
  local_name: string;
  entry?: string;
  metadata?: Record<string, unknown>;
}

function camelCaseLast(typeId: string): string {
  const tail = typeId.split(":").pop() ?? typeId;
  return tail[0]!.toLowerCase() + tail.slice(1);
}

function lowerTail(typeId: string): string {
  // Kebab-case the tail so it satisfies the host's PluginManifest
  // local_name regex `^[a-z0-9-]+$`. Mirrors kebabTail() in
  // @fdpm/zod-bridge's scaffold.ts.
  const tail = typeId.split(":").pop() ?? typeId;
  return tail
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[A-Z]+(?=[A-Z][a-z])/g, (m) => m + "-")
    .replace(/_/g, "-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildPlanned(): { files: Map<string, string> } {
  const sidecar = buildBusinessDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  const files = new Map<string, string>();

  // Stage 1 — generated/* JSON files (six bridge artefacts).
  const generatedFiles: { name: string; data: unknown }[] = [
    { name: "profile.json", data: result.profile },
    { name: "view-page.json", data: result.viewPage },
    { name: "product-page-bundle.json", data: result.productPage },
    { name: "audit.json", data: result.audit },
    { name: "migration-hints.json", data: result.migrationHints },
    { name: "usl-ng-core.json", data: result.uslNgCompanion },
  ];
  for (const f of generatedFiles) {
    files.set(`generated/${f.name}`, stableStringify(f.data) + "\n");
  }

  // Stage 2 — manifest. Start from scaffold-default base, then extend
  // with the four optional caps the plugin actually registers.
  const baseManifest = buildBaseManifest(result);
  const extendedCaps: CapabilityEntry[] = [...(baseManifest.capabilities as CapabilityEntry[])];
  // Document renderers, declared explicitly. The per-entity field
  // tables this loop emitted were removed: they described records, not
  // the thing the records make.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "deck-running-order-md",
    entry: "renderDeckMarkdown",
    metadata: { renderer_id: "acme:DeckRunningOrderRenderer", target: "text/markdown" },
  });
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "deck-contact-sheet-svg",
    entry: "renderDeckContactSheet",
    metadata: { renderer_id: "acme:DeckContactSheetRenderer", target: "image/svg+xml" },
  });


  // Deck-coherence cross-deck validator entry.
  extendedCaps.push({
    capability_id: "cap:validator",
    local_name: "deck-coherence",
    entry: "deckCoherenceValidator",
    metadata: {
      target_type_id: "acme:Slide",
      applies_to: "primitive",
      triggers: ["create", "patch", "replace"],
      rule_ids: [
        "acme.business-deck:deck.claim-cycle",
        "acme.business-deck:deck.claim-parent-resolves",
        "acme.business-deck:deck.evidence-claims-resolve",
        "acme.business-deck:deck.objection-segment-resolves",
        "acme.business-deck:deck.option-claims-resolve",
        "acme.business-deck:deck.option-risks-resolve",
        "acme.business-deck:deck.painpoint-segments-resolve",
        "acme.business-deck:deck.presenter-claims-resolve",
        "acme.business-deck:deck.question-evidence-resolve",
        "acme.business-deck:deck.question-objection-resolves",
        "acme.business-deck:deck.slide-claims-resolve",
        "acme.business-deck:deck.slide-evidence-resolve",
        "acme.business-deck:deck.slide-numbers-contiguous",
        "acme.business-deck:deck.slide-numbers-unique",
        "acme.business-deck:deck.slide-objections-resolve",
        "acme.business-deck:deck.slug-uniqueness",
      ].sort(),
    },
  });

  const permissions = [
    "export:workbook",
    "import:workbook",
    "read:primitives",
    "read:relations",
    "read:workbooks",
    "render:server",
  ].sort();

  const extendedManifest = {
    ...baseManifest,
    capabilities: stableSortCaps(extendedCaps),
    permissions,
  };
  files.set("fdpm-plugin.json", stableStringify(extendedManifest) + "\n");

  // Stage 3 — per-entity capability descriptors.
  for (const entityName of Object.keys(sidecar.entities)) {
    const primitiveTypeId = `acme:${entityName}`;
    const schema = (sidecar.entities as Record<string, { schema: import("zod").ZodObject<import("zod").ZodRawShape> }>)[entityName]!.schema;

    const renderer = zodSchemaToMarkdownRenderer(schema, {
      primitive_type_id: primitiveTypeId,
      fieldOrder: "schema",
    });
    const importer = zodSchemaToImporter(schema, {
      primitive_type_id: primitiveTypeId,
      idFrom: (p) =>
        entityName === "Slide"
          ? `${primitiveTypeId}:${(p as { slide_number: number }).slide_number}`
          : `${primitiveTypeId}:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: entityName.toLowerCase(),
    });
    const exporter = zodSchemaToExporter(schema, {
      primitive_type_id: primitiveTypeId,
      filename: () => `${entityName.toLowerCase()}.json`,
      pluginId: PLUGIN_ID,
    });
    const exprHelper = zodSchemaToExprHelper(schema, {
      function_name: `acme.isValid${entityName}`,
      arity: 1,
      arg_types: ["object"],
      return_type: "boolean",
    });

    const payload = {
      renderer: renderer.capability,
      importer: importer.capability,
      exporter: exporter.capability,
      exprHelper: exprHelper.capability,
    };
    files.set(`capabilities/${entityName}.capabilities.json`, stableStringify(payload) + "\n");
  }

  // Schema-hash gate.
  const schemaSrc = readFileSync(join(PLUGIN_DIR, "schemas", "business-deck.ts"), "utf8");
  const sidecarSrc = readFileSync(join(PLUGIN_DIR, "sidecar.ts"), "utf8");
  const contentHash = createHash("sha256")
    .update("schema:")
    .update(schemaSrc)
    .update("\nsidecar:")
    .update(sidecarSrc)
    .digest("hex");
  const hashRecord = {
    hash_algo: "sha256",
    hash: contentHash,
    pinned_plugin_version: PLUGIN_VERSION,
    sources: ["schemas/business-deck.ts", "sidecar.ts"],
  };
  files.set("generated/schema-hash.json", stableStringify(hashRecord) + "\n");

  return { files };
}

function buildBaseManifest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): Record<string, unknown> {
  const tmp = mkdtempSync(join(tmpdir(), "acme-business-deck-base-"));
  try {
    writePluginScaffold(result, {
      outputDir: tmp,
      pluginName: "Acme Business Deck",
      pluginDescription:
        "Business presentation deck plugin auto-generated from schemas/business-deck.ts via @fdpm/zod-bridge. 13 entities, 12 cross-entity relations. Cross-deck invariants (referential integrity, slug uniqueness, slide-number contiguity, claim-parent acyclicity) lift to a deck-coherence cap:validator.",
      authors: ["acme"],
      license: "MIT",
    });
    const baseManifestRaw = readFileSync(join(tmp, "fdpm-plugin.json"), "utf8");
    return JSON.parse(baseManifestRaw) as Record<string, unknown>;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function stableSortCaps(caps: CapabilityEntry[]): CapabilityEntry[] {
  return [...caps].sort((a, b) => {
    if (a.capability_id !== b.capability_id) {
      return a.capability_id.localeCompare(b.capability_id);
    }
    return a.local_name.localeCompare(b.local_name);
  });
}

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

function main(): void {
  const planned = buildPlanned();

  if (CHECK_MODE) {
    const drift: { path: string; reason: "missing" | "differs" }[] = [];
    for (const [rel, expected] of planned.files) {
      const path = join(PLUGIN_DIR, rel);
      if (!existsSync(path)) {
        drift.push({ path: rel, reason: "missing" });
        continue;
      }
      const actual = readFileSync(path, "utf8");
      if (actual !== expected) drift.push({ path: rel, reason: "differs" });
    }
    if (drift.length > 0) {
      // eslint-disable-next-line no-console
      console.error("bridge drift detected — schema changed without regenerating.");
      for (const d of drift) {
        // eslint-disable-next-line no-console
        console.error(`  ${d.reason.padEnd(8)}  ${d.path}`);
      }
      // eslint-disable-next-line no-console
      console.error("Run `npm run bridge` and commit the updated files.");
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`bridge: ${planned.files.size} files match on disk; no drift.`);
    return;
  }

  let written = 0;
  for (const [rel, content] of planned.files) {
    const path = join(PLUGIN_DIR, rel);
    ensureDir(dirname(path));
    writeFileSync(path, content, "utf8");
    written++;
  }
  // eslint-disable-next-line no-console
  console.log(`bridge: wrote ${written} files under ${PLUGIN_DIR}`);
}

main();
