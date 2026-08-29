/**
 * fdpm.uixo plugin entry point — UIXO v11 interaction ontology.
 *
 * Runtime glue between @fdpm/zod-bridge and the FDPM host. The data model
 * is derived from schemas/uixo-native.ts through ../derive.ts and the
 * sidecar; this file binds the derived DomainProfile (plus the 210
 * relation types finalizeProfile merges in), one Zod validator per
 * ontology class, and two renderers.
 *
 * Hand-authored: derive.ts, the sidecar, the invariants, the ingest, the
 * renderers and this registration sequence. Generated: PrimitiveTypeDefs,
 * validators' rule_id sets, the manifest (scripts/run-bridge.ts, gated by
 * `npm run bridge -- --check`). schemas/uixo-native.ts is VENDORED — it is
 * generated in its own repository by generate-native.ts and must be
 * re-vendored, never edited here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { assembleDomainProfileFromSidecar, zodSchemaToValidator } from "@fdpm/zod-bridge";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  PluginContext,
  PluginEntryModule,
  RendererFn,
  ValidatorFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import {
  buildUixoSidecar,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  finalizeProfile,
  PLUGIN_ID,
  PROFILE_ID,
  RELATION_TYPES,
  VENDOR,
} from "./sidecar.js";
import { renderClassTable, renderDocumentOutline } from "./renderers/document_outline.js";
import { renderDocumentHtml } from "./renderers/document_html.js";
import { renderComponentTree } from "./renderers/component_tree.js";
import { renderComponentSheet } from "./renderers/component_sheet.js";
import { renderDocumentPdf } from "./renderers/document_pdf.js";

export { renderClassTable, renderDocumentOutline } from "./renderers/document_outline.js";
export { renderDocumentHtml } from "./renderers/document_html.js";
export { renderComponentTree } from "./renderers/component_tree.js";
export {
  renderComponentSheet,
  componentSheetLayout,
  itemCentre,
  depthFill,
} from "./renderers/component_sheet.js";
export { renderDocumentPdf } from "./renderers/document_pdf.js";
export {
  readDocument,
  className,
  displayName,
  flattenValue,
  propertyOf,
  type DocumentView,
  type NodeView,
  type CrossLink,
} from "./renderers/_model.js";
export {
  wireframeLayout,
  boxCaption,
  MIN_BOX_W,
  type WireBox,
  type WireframeLayout,
} from "./renderers/_wireframe.js";
export { posterLayout, type Poster, type PosterItem } from "./renderers/_poster.js";
export {
  present,
  colorTokens,
  findings,
  byClass,
  shortClass,
  hexToRgb,
  readableInkOn,
  type Presented,
  type ColorToken,
  type FindingRow,
  type Value,
  type Fact,
  type Tone,
} from "./renderers/_present.js";
export {
  buildUixoWorkbook,
  parseUixoDocument,
  projectUixoDocument,
  UixoDocumentInput,
  type IngestOptions,
  type IngestReport,
} from "./ingest.js";
export {
  validateUixoWorkbook,
  type PrimitiveLike,
  type RelationLike,
  type Violation,
} from "./invariants.js";
export {
  collectEdgeFields,
  deriveRelationTypes,
  derivationSummary,
  entityName,
  qnameOf,
  primitiveTypeId,
  rangeClosure,
  rangeConflicts,
  unclassifiedIdArrays,
  ENTITY_QNAMES,
  type EdgeField,
  type QName,
} from "./derive.js";
export {
  PLUGIN_ID,
  PROFILE_ID,
  VENDOR,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  RELATION_TYPES,
  primitiveId,
  relationTypeId,
  UIXO_NATIVE_VERSION,
  UIXO_SOURCE_SHA256,
} from "./sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const DOCUMENT_RENDERER_ID = `${VENDOR}:DocumentOutlineRenderer` as const;
export const DOCUMENT_HTML_RENDERER_ID = `${VENDOR}:DocumentHtmlRenderer` as const;
export const DOCUMENT_PDF_RENDERER_ID = `${VENDOR}:DocumentPdfRenderer` as const;
export const COMPONENT_TREE_RENDERER_ID = `${VENDOR}:ComponentTreeRenderer` as const;
export const COMPONENT_SHEET_RENDERER_ID = `${VENDOR}:ComponentSheetRenderer` as const;

/** Pinned so activate() and run-bridge.ts derive byte-equal artefacts. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildUixoSidecar();
  const result = assembleDomainProfileFromSidecar({ domain: sidecar, generatedAt: GENERATED_AT });

  if (result.profile.id !== PROFILE_ID) {
    throw new Error(
      `${PLUGIN_ID} activation drift: bridge emitted profile id "${result.profile.id}" but PROFILE_ID="${PROFILE_ID}". Run \`npm run bridge\` and bump the version.`,
    );
  }
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `${PLUGIN_ID} manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }

  const profile = finalizeProfile(result.profile) as unknown as DomainProfile;
  ctx.registerProfile(profile);

  // One validator per ontology class. 712 of them, so the adapter is
  // hoisted out of the loop rather than closed over per entity.
  for (const entityName of ENTITY_NAMES) {
    const typeId = `${VENDOR}:${entityName}`;
    const schema = ENTITY_SCHEMAS[entityName] as unknown as z.ZodObject<z.ZodRawShape>;
    const { validator } = zodSchemaToValidator(schema, {
      pluginId: PLUGIN_ID,
      typeName: entityName.toLowerCase(),
    });
    const adapted: ValidatorFn = (instance) => {
      const findings = validator({
        id: instance.id,
        type_id: instance.type_id,
        field_values: (instance as { field_values?: Record<string, unknown> }).field_values ?? {},
      });
      return findings.map((f) => ({
        rule_id: f.rule_id,
        level: f.level === "warning" ? ("warning" as const) : ("error" as const),
        target_id: instance.id,
        field_path: f.path && f.path.length > 0 ? f.path.join(".") : null,
        message: f.message,
      }));
    };
    ctx.registerValidator({
      type_id: typeId,
      rule_id: `${VENDOR}:val:${entityName.toLowerCase()}-zod`,
      fn: adapted,
    });
  }

  // Five views of one document. The markdown outline walks
  // `hasChildComponent` alone — the literal reading of containment. The
  // other four share ./renderers/_model.ts, whose spanning forest reaches
  // every entity, and ./renderers/_present.ts, which classifies each value
  // so a colour renders as a swatch and a status as a badge rather than
  // as text. The two visual views additionally share one geometry in
  // ./renderers/_poster.ts, so the bitmap cannot disagree with its vector.
  //
  //   text/markdown    the outline — the containment list
  //   text/html        the reviewable page: palette, findings, structure
  //   application/pdf  the paginated artefact, with contents and folios
  //   image/svg+xml    the poster: palette, breakpoints, findings, trees
  //   image/png        the same poster as pixels, for a ticket or a diff
  const views: [string, string, RendererFn][] = [
    ["text/markdown", DOCUMENT_RENDERER_ID, renderDocumentOutline as RendererFn],
    ["text/html", DOCUMENT_HTML_RENDERER_ID, renderDocumentHtml as RendererFn],
    ["application/pdf", DOCUMENT_PDF_RENDERER_ID, renderDocumentPdf as RendererFn],
    ["image/svg+xml", COMPONENT_TREE_RENDERER_ID, renderComponentTree as RendererFn],
    ["image/png", COMPONENT_SHEET_RENDERER_ID, renderComponentSheet as RendererFn],
  ];
  for (const [target, rendererId, fn] of views) {
    ctx.registerRenderer({ target, rendererId, fn });
  }

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${profile.primitive_types.length} primitive types, ${profile.relation_types?.length ?? 0} relation types, ${ENTITY_NAMES.length} validators, ${views.length} renderers (${views.map(([t]) => t).join(", ")}). Profile id: ${PROFILE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = { manifest, activate, deactivate };
export default entry;
