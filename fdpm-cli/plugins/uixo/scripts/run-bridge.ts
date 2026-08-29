/**
 * Plugin build step — regenerates every bridge-owned artefact in
 * plugins/uixo/ (the acme.pitch-deck pattern; howto-zod-to-fdpm-plugin
 * §11 `example:ci-snapshot-gate`, `principle:schema-change-implies-version-bump`).
 *
 * Outputs (all under plugins/uixo/):
 *   generated/profile.json
 *   generated/view-page.json
 *   generated/product-page-bundle.json
 *   generated/audit.json
 *   generated/migration-hints.json
 *   generated/usl-ng-core.json
 *   generated/schema-hash.json
 *   fdpm-plugin.json                          (scaffold + two cap:renderer entries)
 *
 * index.ts, derive.ts, ingest.ts, invariants.ts and renderers/ are author-owned and
 * NOT regenerated.
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
} from "@fdpm/zod-bridge";
import {
  buildUixoSidecar,
  finalizeProfile,
  PLUGIN_ID,
  PLUGIN_VERSION,
  VENDOR,
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

function buildPlanned(): { files: Map<string, string> } {
  const sidecar = buildUixoSidecar();
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
  // per entity) extended with one cap:renderer per entity plus the
  // style-outline renderer.
  const baseManifest = buildBaseManifest(result);
  // ONE generic renderer, not 712. A per-class renderer would mean 712
  // capability descriptors and 712 registrations at activation for what is
  // the same field table each time; `uixo:ClassMarkdownRenderer` dispatches
  // on the primitive's own type_id instead.
  const extendedCaps: CapabilityEntry[] = [...(baseManifest.capabilities as CapabilityEntry[])];
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "class-md",
    entry: "renderClassTable",
    metadata: { target: "text/markdown", renderer_id: `${VENDOR}:ClassMarkdownRenderer` },
  });
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "document-outline-md",
    entry: "renderDocumentOutline",
    metadata: { target: "text/markdown", renderer_id: `${VENDOR}:DocumentOutlineRenderer` },
  });
  const permissions = ["read:primitives", "read:relations", "read:workbooks", "render:server"].sort();
  const extendedManifest = {
    ...baseManifest,
    capabilities: stableSortCaps(extendedCaps),
    permissions,
  };
  files.set("fdpm-plugin.json", stableStringify(extendedManifest) + "\n");

  // Schema-hash gate (principle:schema-change-implies-version-bump).
  const schemaSrc = readFileSync(join(PLUGIN_DIR, "schemas", "uixo-native.ts"), "utf8");
  const deriveSrc = readFileSync(join(PLUGIN_DIR, "derive.ts"), "utf8");
  const sidecarSrc = readFileSync(join(PLUGIN_DIR, "sidecar.ts"), "utf8");
  const contentHash = createHash("sha256")
    .update("schema:")
    .update(schemaSrc)
    .update("\nsidecar:")
    .update(sidecarSrc)
    .update("\nderive:")
    .update(deriveSrc)
    .digest("hex");
  files.set(
    "generated/schema-hash.json",
    stableStringify({
      hash_algo: "sha256",
      hash: contentHash,
      pinned_plugin_version: PLUGIN_VERSION,
      sources: ["schemas/uixo-native.ts", "sidecar.ts", "derive.ts"],
    }) + "\n",
  );

  return { files };
}

function buildBaseManifest(
  result: ReturnType<typeof assembleDomainProfileFromSidecar>,
): Record<string, unknown> {
  const tmp = join(tmpdir(), `fdpm-uixo-base-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writePluginScaffold(result, {
    outputDir: tmp,
    pluginName: "UIXO Interaction Ontology",
    pluginDescription:
      "UIXO v11 native 1.2.0, auto-generated from schemas/uixo-native.ts via @fdpm/zod-bridge. 712 ontology classes as primitives with field-level Zod validators, plus 210 relation types derived from the 1,653 graph-edge fields by derive.ts and merged by finalizeProfile.",
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
