/**
 * fdpm.document-plan plugin entry point.
 *
 * Runtime glue between @fdpm/zod-bridge and the FDPM host for the
 * DocumentPlan v3.1.0 schema (schemas/document-plan.ts). The data model
 * is derived from the schema via the hand-authored sidecar; this file
 * binds the derived DomainProfile, one Zod validator per Entity, and one
 * markdown renderer per Entity into the host's PluginContext.
 *
 * Hand-authored: the sidecar (entities, aggregate, declared losses) and
 * this registration sequence. Generated: PrimitiveTypeDefs, validators
 * and their closed rule_id sets, the manifest (scripts/run-bridge.ts).
 *
 * The section tree, the node↔registry relations and the plan-outline
 * renderer live in the companion plugin fdpm.document-plan-dnis.
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
  buildDocumentPlanSidecar,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  finalizeProfile,
  PLUGIN_ID,
  PROFILE_ID,
  VENDOR,
  primitiveTypeId,
} from "./sidecar.js";
import { renderPlanBrief } from "./renderers/plan_brief.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export { PLUGIN_ID, PROFILE_ID, VENDOR };
export {
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  DocumentPlanHeader,
  ContentSourceEntity,
  SourceIdentifierFlat,
  primitiveTypeId,
  primitiveId,
  type EntityName,
} from "./sidecar.js";
export {
  DocumentPlanObject,
  DocumentPlanSchema,
  Schemas,
  effectiveEvidence,
  effectiveTargetWords,
  flattenStructure,
  type DocumentPlan,
  type SectionNode,
} from "./schemas/document-plan.js";

/** Pinned so activate() and run-bridge.ts derive byte-equal artefacts. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

export const PLAN_BRIEF_RENDERER_ID = "docplan:PlanBriefRenderer" as const;

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildDocumentPlanSidecar();
  const result = assembleDomainProfileFromSidecar({ domain: sidecar, generatedAt: GENERATED_AT });

  // Runtime drift assertions (howto-zod-to-fdpm-plugin §4).
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

  // finalizeProfile: JSON round-trip (strips bridge-internal extras) +
  // version / name / label / description so `fdpm profile list` and the
  // MCP profile list show a named, versioned profile.
  const profile = finalizeProfile(result.profile) as unknown as DomainProfile;
  ctx.registerProfile(profile);

  // One Zod validator per Entity. The host's pipeline runs it on every
  // create/replace/patch of that primitive type; findings carry the
  // bridge's closed rule_id set (manifest.capabilities[].metadata.rule_ids).
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

  // One field-table markdown renderer per Entity (bridge-derived).
  // Namespaced by PLUGIN_ID so (target, rendererId) cannot collide with
  // another plugin's Entity of the same name (SPEC-PLUGGABLE §7.4).

  // The header as a brief — the commitment made before writing. The
  // section tree is rendered by docplan:PlanOutlineRenderer on the DNIS
  // composition; this profile alone had nothing.
  ctx.registerRenderer({ target: "text/markdown", rendererId: PLAN_BRIEF_RENDERER_ID, fn: renderPlanBrief as RendererFn });
  ctx.logger.info(
    `${PLUGIN_ID} activated: ${profile.primitive_types.length} primitive types, ${ENTITY_NAMES.length} validators, ${ENTITY_NAMES.length} renderers. Profile id: ${PROFILE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = { manifest, activate, deactivate };
export default entry;
