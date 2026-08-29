/**
 * Plugin build step — regenerates every bridge-owned artefact in
 * plugins/academic_paper/.
 *
 * Per howto-zod-to-fdpm-plugin §11 (`example:ci-snapshot-gate`,
 * `principle:schema-change-implies-version-bump`).
 *
 * Outputs (all under plugins/academic_paper/):
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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleDomainProfileFromSidecar,
  stableStringify,
  writePluginScaffold,
  zodSchemaToExporter,
  zodSchemaToExprHelper,
  zodSchemaToImporter,
  zodSchemaToMarkdownRenderer,
} from "@fdpm/zod-bridge";
import {
  buildAcademicPaperSidecar,
  PLUGIN_ID,
  PLUGIN_VERSION,
  VENDOR,
} from "../sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");

const CHECK_MODE = process.argv.includes("--check");

// Single source of truth for the primitive_type_id prefix —
// always identical to VENDOR (the bridge derives the prefix from
// sidecar.fdpm.vendor). Read from the sidecar export so the two
// stay in lock-step.
const TYPE_PREFIX = VENDOR;

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
  const sidecar = buildAcademicPaperSidecar();
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
  // with the four optional caps the plugin registers per entity, plus
  // the workbook-level paper-coherence validator.
  const baseManifest = buildBaseManifest(result);
  const extendedCaps: CapabilityEntry[] = [
    ...(baseManifest.capabilities as CapabilityEntry[]),
  ];
  // Document renderers, declared explicitly. The per-entity field
  // tables this loop emitted were removed: they described records, not
  // the thing the records make.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-document-md",
    entry: "renderPaperMarkdown",
    metadata: { renderer_id: "acad:PaperDocumentRenderer", target: "text/markdown" },
  });
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-document-html",
    entry: "renderPaperHtml",
    metadata: { renderer_id: "acad:PaperHtmlRenderer", target: "text/html" },
  });
  // The argument the prose views cannot show: claims ranked by derivation
  // depth, with support, rebuttal and supersession drawn as distinct edges.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-argument-svg",
    entry: "renderArgumentGraph",
    metadata: { renderer_id: "acad:ArgumentGraphRenderer", target: "image/svg+xml" },
  });
  // The one output that leaves the toolchain intact: BibTeX goes straight
  // into LaTeX or a reference manager.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-bibliography-bibtex",
    entry: "renderBibliography",
    metadata: { renderer_id: "acad:BibliographyRenderer", target: "application/x-bibtex" },
  });
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-document-pdf",
    entry: "renderPaperPdf",
    metadata: { renderer_id: "acad:PaperPdfRenderer", target: "application/pdf" },
  });
  // The submittable form. The pdf-lib PDF cannot typeset mathematics; LaTeX
  // hands that to a real engine and is the only renderer that uses
  // `acad:Equation.tex` as TeX rather than printing it as a string. Pairs
  // with the BibTeX renderer, which supplies the keys it cites.
  extendedCaps.push({
    capability_id: "cap:renderer",
    local_name: "paper-document-latex",
    entry: "renderPaperLatex",
    metadata: { renderer_id: "acad:LatexRenderer", target: "application/x-tex" },
  });


  // Paper-coherence cross-workbook validator entry. Targets acad:Paper
  // because Paper is the entity whose existence frames the workbook —
  // every other primitive references back to Paper, and the
  // kind-conditional CEL rules depend on paper.epistemicMethod.
  //
  // v0.2 rule taxonomy: `paper.method.*` (was `paper.kind.*` in v0.1)
  // tracks the schema rename. `paper.method.empirical-needs-hypothesis`
  // separates the hypothesis check from the data-evidence check.
  // `descriptive` has no rule — descriptive papers impose no
  // required-ness, on purpose.
  //
  // v0.3 additions:
  //   - paper.author-position-unique-first / -unique-last (workbook
  //     invariant: ≤1 first, ≤1 last per paper)
  //   - paper.cycle.<relation> for transitive cycle detection over 7
  //     relations (section-parent, concept-extends, claim-derives-from,
  //     equation-derives-from, theory-extends-theory,
  //     work-translation-of, work-edition-of)
  //   - paper.funder-registry-id-missing (level=warning, not error;
  //     declares the gap when a Funder lacks ROR/Crossref Funder
  //     Registry id — PALS's LAW posture)
  //   - paper.funding-funder-resolves (Funding.funder → Funder FK)
  //   - paper.paper-relation-references-resolve
  //   - paper.table-references-resolve
  //   - paper.publication-date-year-agrees (cross-check
  //     Paper.publicationDate.year == Paper.year)
  extendedCaps.push({
    capability_id: "cap:validator",
    local_name: "paper-coherence",
    entry: "paperCoherenceValidator",
    metadata: {
      target_type_id: `${TYPE_PREFIX}:Paper`,
      applies_to: "primitive",
      triggers: ["create", "patch", "replace"],
      rule_ids: [
        `${PLUGIN_ID}:paper.author-affiliations-resolve`,
        `${PLUGIN_ID}:paper.author-position-unique-first`,
        `${PLUGIN_ID}:paper.author-position-unique-last`,
        `${PLUGIN_ID}:paper.authors-required`,
        `${PLUGIN_ID}:paper.citation-references-resolve`,
        `${PLUGIN_ID}:paper.concept-defined-or-borrowed`,
        `${PLUGIN_ID}:paper.cycle.claim-derives-from`,
        `${PLUGIN_ID}:paper.cycle.concept-extends`,
        `${PLUGIN_ID}:paper.cycle.equation-derives-from`,
        `${PLUGIN_ID}:paper.cycle.section-parent`,
        `${PLUGIN_ID}:paper.cycle.theory-extends-theory`,
        `${PLUGIN_ID}:paper.cycle.work-edition-of`,
        `${PLUGIN_ID}:paper.cycle.work-translation-of`,
        `${PLUGIN_ID}:paper.evidence-supports-resolve`,
        `${PLUGIN_ID}:paper.funder-registry-id-missing`,
        `${PLUGIN_ID}:paper.funding-funder-resolves`,
        `${PLUGIN_ID}:paper.funding-recipients-resolve`,
        `${PLUGIN_ID}:paper.method.empirical-needs-data`,
        `${PLUGIN_ID}:paper.method.empirical-needs-hypothesis`,
        `${PLUGIN_ID}:paper.method.historical-needs-observation-or-data`,
        `${PLUGIN_ID}:paper.method.literary-critical-needs-quotations`,
        `${PLUGIN_ID}:paper.method.review-needs-citations`,
        `${PLUGIN_ID}:paper.method.theoretical-needs-equations`,
        `${PLUGIN_ID}:paper.paper-relation-references-resolve`,
        `${PLUGIN_ID}:paper.publication-date-year-agrees`,
        `${PLUGIN_ID}:paper.quotation-quotesfrom-resolves`,
        `${PLUGIN_ID}:paper.section-parent-resolves`,
        `${PLUGIN_ID}:paper.table-references-resolve`,
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
    const primitiveTypeId = `${TYPE_PREFIX}:${entityName}`;
    const schema = (
      sidecar.entities as Record<
        string,
        { schema: import("zod").ZodObject<import("zod").ZodRawShape> }
      >
    )[entityName]!.schema;

    const renderer = zodSchemaToMarkdownRenderer(schema, {
      primitive_type_id: primitiveTypeId,
      fieldOrder: "schema",
    });
    const importer = zodSchemaToImporter(schema, {
      primitive_type_id: primitiveTypeId,
      idFrom: (p) => `${primitiveTypeId}:${(p as { id: string }).id}`,
      pluginId: PLUGIN_ID,
      typeName: entityName.toLowerCase(),
    });
    const exporter = zodSchemaToExporter(schema, {
      primitive_type_id: primitiveTypeId,
      filename: () => `${entityName.toLowerCase()}.json`,
      pluginId: PLUGIN_ID,
    });
    const exprHelper = zodSchemaToExprHelper(schema, {
      function_name: `${VENDOR}.isValid${entityName}`,
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
    files.set(
      `capabilities/${entityName}.capabilities.json`,
      stableStringify(payload) + "\n",
    );
  }

  // Schema-hash gate.
  const schemaSrc = readFileSync(
    join(PLUGIN_DIR, "schemas", "academic-paper.ts"),
    "utf8",
  );
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
    sources: ["schemas/academic-paper.ts", "sidecar.ts"],
  };
  files.set("generated/schema-hash.json", stableStringify(hashRecord) + "\n");

  return { files };
}

function buildBaseManifest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): Record<string, unknown> {
  const tmp = `/tmp/fdpm-academic-paper-base-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writePluginScaffold(result, {
    outputDir: tmp,
    pluginName: "FDPM Academic Paper",
    pluginDescription:
      "Academic paper plugin auto-generated from schemas/academic-paper.ts via @fdpm/zod-bridge. 18 entities covering empirical, theoretical, methodological, literary-critical, review, historical, essay, and monograph genres. Paper-coherence cap:validator enforces referential integrity and kind-conditional required-ness rules.",
    authors: ["fdpm"],
    license: "MIT",
  });
  const baseManifestRaw = readFileSync(
    join(tmp, "fdpm-plugin.json"),
    "utf8",
  );
  rmSync(tmp, { recursive: true, force: true });
  return JSON.parse(baseManifestRaw) as Record<string, unknown>;
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
      console.error(
        "bridge drift detected — schema changed without regenerating.",
      );
      for (const d of drift) {
        console.error(`  ${d.reason.padEnd(8)}  ${d.path}`);
      }
      console.error("Run `npm run bridge` and commit the updated files.");
      process.exit(1);
    }
    console.log(
      `bridge: ${planned.files.size} files match on disk; no drift.`,
    );
    return;
  }

  let written = 0;
  for (const [rel, content] of planned.files) {
    const path = join(PLUGIN_DIR, rel);
    ensureDir(dirname(path));
    writeFileSync(path, content, "utf8");
    written++;
  }
  console.log(`bridge: wrote ${written} files under ${PLUGIN_DIR}`);
}

main();
