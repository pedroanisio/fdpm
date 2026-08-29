/**
 * Plugin build step — regenerates every bridge-owned artefact in
 * plugins/document_plan/ (the acme.pitch-deck pattern; howto-zod-to-fdpm-plugin
 * §11 `example:ci-snapshot-gate`, `principle:schema-change-implies-version-bump`).
 *
 * Outputs (all under plugins/document_plan/):
 *   generated/profile.json
 *   generated/view-page.json
 *   generated/product-page-bundle.json
 *   generated/audit.json
 *   generated/migration-hints.json
 *   generated/usl-ng-core.json
 *   generated/schema-hash.json
 *   capabilities/<Entity>.capabilities.json   (six, one per Entity)
 *   fdpm-plugin.json                          (scaffold + one cap:renderer per Entity)
 *
 * index.ts is author-owned and NOT regenerated.
 *
 * Run with:    npm run bridge              (writes)
 * Run with:    npm run bridge -- --check   (drift check, exit 1 on diff)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleDomainProfileFromSidecar,
  stableStringify,
  writePluginScaffold,
  zodSchemaToMarkdownRenderer,
} from "@fdpm/zod-bridge";
import {
  buildDocumentPlanSidecar,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  finalizeProfile,
  PLUGIN_ID,
  PLUGIN_VERSION,
  primitiveTypeId,
} from "../sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");
const CHECK_MODE = process.argv.includes("--check");
/** Pinned so two runs are byte-equal regardless of wall clock. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

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

/** Kebab-case the tail so it satisfies the manifest `local_name` regex. */
function lowerTail(typeId: string): string {
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
  const sidecar = buildDocumentPlanSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: GENERATED_AT,
  });

  const files = new Map<string, string>();

  // Stage 1 — generated/* JSON files (six).
  const generatedFiles: { name: string; data: unknown }[] = [
    { name: "profile.json", data: finalizeProfile(result.profile) },
    { name: "view-page.json", data: result.viewPage },
    { name: "product-page-bundle.json", data: result.productPage },
    { name: "audit.json", data: result.audit },
    { name: "migration-hints.json", data: result.migrationHints },
    { name: "usl-ng-core.json", data: result.uslNgCompanion },
  ];
  for (const f of generatedFiles) {
    files.set(`generated/${f.name}`, stableStringify(f.data) + "\n");
  }

  // Stage 2 — manifest: scaffold default (cap:profile + one cap:validator
  // per Entity) extended with one cap:renderer per Entity.
  const baseManifest = buildBaseManifest(result);
  const extendedCaps: CapabilityEntry[] = [...(baseManifest.capabilities as CapabilityEntry[])];
  // Document renderers, declared explicitly. The per-entity field
  // tables this loop used to emit were removed: they described records,
  // not the thing the records make.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "plan-brief-md",
    entry: "renderPlanBrief",
    metadata: { renderer_id: "docplan:PlanBriefRenderer", target: "text/markdown" },
  });

  const permissions = ["read:primitives", "read:relations", "read:workbooks", "render:server"].sort();
  const extendedManifest = {
    ...baseManifest,
    capabilities: stableSortCaps(extendedCaps),
    permissions,
  };
  files.set("fdpm-plugin.json", stableStringify(extendedManifest) + "\n");

  // Stage 3 — per-entity capability descriptors (renderer only; this
  // plugin registers no importer/exporter/expr-helper — ingestion goes
  // through plugins/document_plan_dnis/build.ts).
  for (const entityName of ENTITY_NAMES) {
    const typeId = primitiveTypeId(entityName);
    const renderer = zodSchemaToMarkdownRenderer(ENTITY_SCHEMAS[entityName] as never, {
      primitive_type_id: typeId,
      fieldOrder: "schema",
    });
    files.set(
      `capabilities/${entityName}.capabilities.json`,
      stableStringify({ renderer: renderer.capability }) + "\n",
    );
  }

  // Schema-hash gate (principle:schema-change-implies-version-bump).
  const schemaSrc = readFileSync(join(PLUGIN_DIR, "schemas", "document-plan.ts"), "utf8");
  const sidecarSrc = readFileSync(join(PLUGIN_DIR, "sidecar.ts"), "utf8");
  const contentHash = createHash("sha256")
    .update("schema:")
    .update(schemaSrc)
    .update("\nsidecar:")
    .update(sidecarSrc)
    .digest("hex");
  files.set(
    "generated/schema-hash.json",
    stableStringify({
      hash_algo: "sha256",
      hash: contentHash,
      pinned_plugin_version: PLUGIN_VERSION,
      sources: ["schemas/document-plan.ts", "sidecar.ts"],
    }) + "\n",
  );

  return { files };
}

function buildBaseManifest(
  result: ReturnType<typeof assembleDomainProfileFromSidecar>,
): Record<string, unknown> {
  const tmp = join(tmpdir(), `fdpm-document-plan-base-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writePluginScaffold(result, {
    outputDir: tmp,
    pluginName: "Document Plan",
    pluginDescription:
      "Document-plan plugin auto-generated from schemas/document-plan.ts (DocumentPlan v3.1.0) via @fdpm/zod-bridge. Models the plan header and its five registries (ContentSource, Concept, Asset, Thread, Person) with field-level Zod validators. The section tree is materialised as dnis:Node primitives by the companion plugin fdpm.document-plan-dnis, which also declares the node↔registry relations and the plan-outline renderer.",
    authors: ["FDPM Maintainers"],
    license: "MIT",
  });
  const raw = readFileSync(join(tmp, "fdpm-plugin.json"), "utf8");
  rmSync(tmp, { recursive: true, force: true });
  return JSON.parse(raw) as Record<string, unknown>;
}

function stableSortCaps(caps: CapabilityEntry[]): CapabilityEntry[] {
  return [...caps].sort((a, b) => {
    if (a.capability_id !== b.capability_id) return a.capability_id.localeCompare(b.capability_id);
    return a.local_name.localeCompare(b.local_name);
  });
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
      if (readFileSync(path, "utf8") !== expected) drift.push({ path: rel, reason: "differs" });
    }
    if (drift.length > 0) {
      console.error("bridge drift detected — schema or sidecar changed without regenerating.");
      for (const d of drift) console.error(`  ${d.reason.padEnd(8)}  ${d.path}`);
      console.error("Run `npm run bridge` and commit the updated files.");
      process.exit(1);
    }
    console.log(`bridge: ${planned.files.size} files match on disk; no drift.`);
    return;
  }

  let written = 0;
  for (const [rel, content] of planned.files) {
    const path = join(PLUGIN_DIR, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    written += 1;
  }
  console.log(`bridge: wrote ${written} files under ${PLUGIN_DIR}`);
}

main();
