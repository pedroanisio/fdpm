/**
 * Plugin build step — regenerates every bridge-owned artefact in
 * plugins/acme_pitch_deck/.
 *
 * Per howto-zod-to-fdpm-plugin §11 (`example:ci-snapshot-gate`,
 * `principle:schema-change-implies-version-bump`).
 *
 * Outputs (all under plugins/acme_pitch_deck/):
 *   generated/profile.json
 *   generated/view-page.json
 *   generated/product-page-bundle.json
 *   generated/audit.json
 *   generated/migration-hints.json
 *   generated/usl-ng-core.json
 *   capabilities/<Entity>.capabilities.json   (eight, one per Entity)
 *   fdpm-plugin.json                          (extended with four optional caps)
 *
 * The handwritten file index.ts is NOT regenerated — the plugin's
 * runtime glue (deck-coherence validator, omit-stripped per-entity
 * validator wrapping, three optional-capability registrations) is
 * author-owned. The bridge's default scaffold emits a comment-only
 * skeleton that does not include these features.
 *
 * Run with:    npm run bridge   (writes)
 * Run with:    npm run bridge -- --check   (drift check, exit 1 on diff)
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
import { buildPitchDeckSidecar, PLUGIN_ID, PLUGIN_VERSION } from "../sidecar.js";

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

/**
 * Stage 1 — emit generated/* artefacts (six files) and the bridge's
 * default fdpm-plugin.json + index.ts scaffold.
 *
 * Stage 2 — overwrite the scaffold-emitted manifest with one that
 * declares the four optional capabilities (cap:renderer, cap:importer,
 * cap:exporter, cap:expr-helper) the plugin actually registers from
 * index.ts.
 *
 * Stage 3 — emit per-entity capability metadata to capabilities/.
 */
function buildPlanned(): {
  files: Map<string, string>;
} {
  const sidecar = buildPitchDeckSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  const files = new Map<string, string>();

  // Stage 1a — generated/* JSON files (six).
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

  // Stage 2 — manifest. Start from the scaffold-default base, then
  // extend capabilities[] with renderer/importer/exporter/expr-helper
  // entries per Entity, plus the deck-wide validator. The scaffold
  // covers only cap:profile + cap:validator (one per Entity); we add
  // the optional caps and one extra cap:validator for deck-coherence.
  const baseManifest = buildBaseManifest(result);
  const extendedCaps: CapabilityEntry[] = [...(baseManifest.capabilities as CapabilityEntry[])];
  // Document renderers, declared explicitly. The per-entity field
  // tables this loop emitted were removed: they described records, not
  // the thing the records make.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "pitch-running-order-md",
    entry: "renderPitchDeckMarkdown",
    metadata: { renderer_id: "acme.pitch-deck:RunningOrderRenderer", target: "text/markdown" },
  });
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "pitch-phase-map-svg",
    entry: "renderPitchDeckPhaseMap",
    metadata: { renderer_id: "acme.pitch-deck:PhaseMapRenderer", target: "image/svg+xml" },
  });


  // One extra cap:validator entry for the deck-coherence cross-deck
  // validator the plugin registers in addition to per-entity validators.
  extendedCaps.push({
    capability_id: "cap:validator",
    local_name: "deck-coherence",
    entry: "deckCoherenceValidator",
    metadata: {
      target_type_id: "acme:Slide",
      applies_to: "primitive",
      triggers: ["create", "patch", "replace"],
      rule_ids: [
        "acme.pitch-deck:deck.audience-coverage",
        "acme.pitch-deck:deck.claim-bidirectional",
        "acme.pitch-deck:deck.claim-cycle",
        "acme.pitch-deck:deck.evidence-bidirectional",
        "acme.pitch-deck:deck.slide-display-numbers",
        "acme.pitch-deck:deck.source-freshness-missing",
        "acme.pitch-deck:deck.time-budget-coverage",
      ].sort(),
    },
  });

  // Permissions for the optional capabilities. The scaffold emits
  // read:* only; importer/exporter/renderer require their own.
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

  // Stage 3 — per-entity capability descriptors. Each Entity gets one
  // JSON file under capabilities/ with the four optional cap shapes
  // the bridge derives.
  for (const entityName of Object.keys(sidecar.entities)) {
    const primitiveTypeId = `acme:${entityName}`;
    const schema = (sidecar.entities as Record<string, { schema: import("zod").ZodObject<import("zod").ZodRawShape> }>)[entityName]!.schema;

    const renderer = zodSchemaToMarkdownRenderer(schema, {
      primitive_type_id: primitiveTypeId,
      fieldOrder: "schema",
    });
    const importer = zodSchemaToImporter(schema, {
      primitive_type_id: primitiveTypeId,
      idFrom: (p) => `${entityName.toLowerCase()}:${(p as { id: string }).id}`,
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

  // Schema-hash gate (per howto-zod-to-fdpm-plugin §11
  // principle:schema-change-implies-version-bump). The hash is a
  // SHA-256 over (schema source + sidecar source) — any edit to either
  // changes the hash. The pinned version is captured alongside so the
  // drift test can prove the version was bumped on schema change: if
  // the schema content changes but the manifest version did NOT,
  // running `npm run bridge` rewrites the hash with the SAME version
  // and the manifest-parity test (which loads BOTH files) flags the
  // mismatch on the next test run.
  const schemaSrc = readFileSync(join(PLUGIN_DIR, "schemas", "pitch-deck.schema.v2.ts"), "utf8");
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
    sources: ["schemas/pitch-deck.schema.v2.ts", "sidecar.ts"],
  };
  files.set("generated/schema-hash.json", stableStringify(hashRecord) + "\n");

  return { files };
}

/**
 * Build the bridge's default manifest by invoking writePluginScaffold
 * into a temp dir and reading back the manifest. We don't keep the
 * tmp dir; we only need the manifest as a base to extend.
 */
function buildBaseManifest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): Record<string, unknown> {
  // The scaffold writes both fdpm-plugin.json and index.ts. We only
  // need the manifest, so write to a tmp dir, read the manifest back,
  // discard the dir.
  const tmp = mkdtempSync(join(tmpdir(), "acme-pitch-deck-base-"));
  try {
    writePluginScaffold(result, {
      outputDir: tmp,
      pluginName: "Acme Pitch Deck",
      pluginDescription:
        "Strategic pitch-deck plugin auto-generated from schemas/pitch-deck.schema.v2.ts via @fdpm/zod-bridge. Models 8 entities (Audience, Source, DataPoint, StrategicClaim, Risk, Competitor, AntiPattern, Slide) and 8 cross-entity relations. Cross-deck invariants (audience coverage, time budget, source freshness, displayNumber contiguity) lift to a deck-coherence cap:validator. The four optional capabilities (renderer / importer / exporter / expr-helper) are derived per Entity by the bridge.",
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
  // Sort by (capability_id, local_name) for deterministic output.
  return [...caps].sort((a, b) => {
    if (a.capability_id !== b.capability_id) {
      return a.capability_id.localeCompare(b.capability_id);
    }
    return a.local_name.localeCompare(b.local_name);
  });
}

// =============================================================================
// Driver
// =============================================================================

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

  // Write mode.
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
