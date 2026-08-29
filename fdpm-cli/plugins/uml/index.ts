/**
 * fdpm.uml plugin entry point — UML 2.5.1 Foundation subset.
 *
 * Runtime glue between @fdpm/zod-bridge and the FDPM host. The data
 * model is derived from schemas/uml-foundation.ts through the sidecar;
 * this file binds the derived DomainProfile (plus the twelve
 * author-declared relation types finalizeProfile merges in), one Zod
 * validator per metaclass, one field-table renderer per metaclass, and
 * the model-outline renderer that prints the whole model in UML
 * notation.
 *
 * Hand-authored: the sidecar, the relation types, the outline renderer
 * and this registration sequence. Generated: PrimitiveTypeDefs,
 * validators' closed rule_id sets, the manifest
 * (scripts/run-bridge.ts, gated by `npm run bridge -- --check`).
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
  buildUmlSidecar,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  finalizeProfile,
  PLUGIN_ID,
  PROFILE_ID,
  VENDOR,
  primitiveTypeId,
} from "./sidecar.js";
import { renderModelOutline } from "./renderers/model_outline.js";
import { assertNoAbstractPrimitiveTypes } from "./abstract.js";
import { UML_PROMPTS } from "./prompts.js";

export { renderModelOutline } from "./renderers/model_outline.js";
export { UML_PROMPTS, MODEL_A_DOMAIN_PROMPT } from "./prompts.js";
export {
  METACLASS_ABSTRACTNESS,
  ABSTRACT_METACLASSES,
  CONCRETE_METACLASSES,
  isAbstractMetaclass,
  concreteAlternativesFor,
  assertNoAbstractPrimitiveTypes,
  type MetaclassRecord,
} from "./abstract.js";
export {
  buildUmlWorkbook,
  parseUmlModel,
  normalizeUpper,
  toValueSpecification,
  UmlModelInput,
  type IngestReport,
  type UmlModelInputType,
} from "./ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const MODEL_OUTLINE_RENDERER_ID = `${VENDOR}:ModelOutlineRenderer` as const;

export { PLUGIN_ID, PROFILE_ID, VENDOR };
export {
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  RELATION_TYPES,
  REL,
  CLASSIFIER_TYPES,
  PACKAGEABLE_TYPES,
  FEATURE_OWNER_TYPES,
  primitiveTypeId,
  primitiveId,
  type EntityName,
  type RelationName,
} from "./sidecar.js";
export {
  Schemas,
  Signal,
  Reception,
  UmlId,
  UML_VERSION,
  UNLIMITED,
  ValueSpecification,
  VisibilityKind,
  AggregationKind,
  ParameterDirectionKind,
  DependencyKind,
} from "./schemas/uml-foundation.js";

/** Pinned so activate() and run-bridge.ts derive byte-equal artefacts. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildUmlSidecar();
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
  // UML 2.5.1 defines 26 of the source library's 110 metaclasses as
  // abstract. Registering one as a primitive type would let the host
  // accept instances the specification forbids, so the profile is
  // checked before it is served — at load, not at first write.
  assertNoAbstractPrimitiveTypes(profile);
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
        field_values:
          (instance as { field_values?: Record<string, unknown> }).field_values ?? {},
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


  // The document view: containment tree with features inlined, in UML
  // notation. This is the renderer a reader wants; the per-entity ones
  // are field tables.
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: MODEL_OUTLINE_RENDERER_ID,
    fn: renderModelOutline as RendererFn,
  });

  // The how-to-think layer: which metaclass to reach for, how features
  // and ends are wired, and which metaclasses are abstract (§13.5).
  for (const prompt of UML_PROMPTS) ctx.registerPrompt(prompt);

  ctx.logger.info(
    `${PLUGIN_ID} activated: ${profile.primitive_types.length} primitive types, ${profile.relation_types?.length ?? 0} relation types, ${ENTITY_NAMES.length} validators, ${ENTITY_NAMES.length + 1} renderers, ${UML_PROMPTS.length} prompt. Profile id: ${PROFILE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = { manifest, activate, deactivate };
export default entry;
