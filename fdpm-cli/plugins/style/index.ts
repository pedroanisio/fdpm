/**
 * fdpm.style plugin entry point — StyleDefinition 3.1.0.
 *
 * Runtime glue between @fdpm/zod-bridge and the FDPM host. The data model
 * is derived from schemas/style.ts through the sidecar; this file binds
 * the derived DomainProfile (plus the ten author-declared relation types
 * finalizeProfile merges in), one Zod validator per entity, one field-table
 * renderer per entity, and the registry-outline renderer that prints every
 * style as the source schema reads it.
 *
 * Hand-authored: the sidecar, the relation types, the cross-entity
 * invariants, the ingest, the outline renderer and this registration
 * sequence. Generated: PrimitiveTypeDefs, validators' closed rule_id sets,
 * the manifest (scripts/run-bridge.ts, gated by `npm run bridge -- --check`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { z } from "zod";
import {
  assembleDomainProfileFromSidecar,
  zodSchemaToMarkdownRenderer,
  zodSchemaToValidator,
} from "@fdpm/zod-bridge";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  PluginContext,
  PluginEntryModule,
  RendererFn,
  RendererInput,
  RendererOutput,
  ValidatorFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import {
  buildStyleSidecar,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  finalizeProfile,
  PLUGIN_ID,
  PROFILE_ID,
  VENDOR,
  primitiveTypeId,
} from "./sidecar.js";
import { renderStyleOutline } from "./renderers/style_outline.js";
import { renderStyleHtml } from "./renderers/style_html.js";
import { renderStyleSpecimen } from "./renderers/style_specimen.js";
import { renderPaletteSheet } from "./renderers/style_palette.js";

export { renderStyleOutline } from "./renderers/style_outline.js";
export { renderStyleHtml } from "./renderers/style_html.js";
export { renderStyleSpecimen } from "./renderers/style_specimen.js";
export {
  renderPaletteSheet,
  paletteSheetLayout,
  cellCentre,
  type SheetCell,
  type SheetLayout,
} from "./renderers/style_palette.js";
export {
  readRegistry,
  hexToRgb,
  readableInkOn,
  type RegistryView,
  type StyleView,
  type MovementView,
  type GrammarSectionView,
  type RuleView,
  type CheckView,
  type ReferenceView,
  type ContrastPairView,
  type TokensView,
} from "./renderers/_model.js";
export {
  buildStyleWorkbook,
  parseStyleRegistry,
  projectStyleRegistry,
  assertProjectionInvariants,
  StyleRegistryInput,
  type IngestOptions,
  type IngestReport,
  type StyleRegistryInputType,
} from "./ingest.js";
export {
  validateStyleWorkbook,
  contrastRatio,
  relativeLuminance,
  wcagMinimumContrast,
  isHistoricalYear,
  type PrimitiveLike,
  type RelationLike,
  type Violation,
  type WorkbookValidationResult,
} from "./invariants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const STYLE_OUTLINE_RENDERER_ID = `${VENDOR}:StyleOutlineRenderer` as const;
export const STYLE_HTML_RENDERER_ID = `${VENDOR}:StyleHtmlRenderer` as const;
export const STYLE_SPECIMEN_RENDERER_ID = `${VENDOR}:StyleSpecimenRenderer` as const;
export const PALETTE_SHEET_RENDERER_ID = `${VENDOR}:PaletteSheetRenderer` as const;

export { PLUGIN_ID, PROFILE_ID, VENDOR };
export {
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  GRAMMAR_ENTITIES,
  GRAMMAR_TYPE_IDS,
  RELATION_TYPES,
  REL,
  primitiveTypeId,
  primitiveId,
  type EntityName,
  type RelationName,
} from "./sidecar.js";
export {
  Schemas,
  CONSTRAINTS,
  GRAMMAR_SECTIONS,
  RULE_SECTION_CODES,
  SECTION_ENTITY,
  STYLE_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_MAJOR,
  isOpaqueHexColor,
  isCanonicalCssTimingFunction,
  type GrammarSection,
} from "./schemas/style.js";

/** Pinned so activate() and run-bridge.ts derive byte-equal artefacts. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildStyleSidecar();
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

  for (const entityName of ENTITY_NAMES) {
    const typeId = primitiveTypeId(entityName);
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


  // Four views of one registry, each reassembled from the graph the
  // ingest took apart. The per-entity renderers the bridge generates are
  // field tables; these are documents.
  //
  //   text/markdown   the outline — the registry as the source schema reads
  //   text/html       the specification page, with the colours painted
  //   image/svg+xml   the specimen plate: palette, contrast, stroke, census
  //   image/png       the palette as pixels, for a picker or a diff
  //
  // The three specialized views share ./renderers/_model.ts, so they
  // cannot disagree with each other about what the registry contains.
  const views: [string, string, RendererFn][] = [
    ["text/markdown", STYLE_OUTLINE_RENDERER_ID, renderStyleOutline as RendererFn],
    ["text/html", STYLE_HTML_RENDERER_ID, renderStyleHtml as RendererFn],
    ["image/svg+xml", STYLE_SPECIMEN_RENDERER_ID, renderStyleSpecimen as RendererFn],
    ["image/png", PALETTE_SHEET_RENDERER_ID, renderPaletteSheet as RendererFn],
  ];
  for (const [target, rendererId, fn] of views) {
    ctx.registerRenderer({ target, rendererId, fn });
  }

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${profile.primitive_types.length} primitive types, ${profile.relation_types?.length ?? 0} relation types, ${ENTITY_NAMES.length} validators, ${ENTITY_NAMES.length + views.length} renderers (${views.map(([t]) => t).join(", ")}). Profile id: ${PROFILE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = { manifest, activate, deactivate };
export default entry;
