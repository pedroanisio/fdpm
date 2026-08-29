/**
 * Software Requirements plugin entry point.
 *
 * Registers the DomainProfile generated from
 * schemas/software-requirements.ts. This plugin is profile-only for now:
 * the generated profile carries the primitive types, relation types, and
 * validation rules; no custom runtime validators or renderers are registered.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DomainProfile,
  type DomainProfile as DomainProfileShape,
} from "../../src/core/models/meta.js";
import type { PluginContext, PluginEntryModule, RendererFn } from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import { renderSrsMarkdown, renderSrsHtml } from "./renderers/srs_document.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PLUGIN_ID = "fdpm.software-requirements" as const;
export const PROFILE_ID = "profile:software-requirements:0.2" as const;

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(manifestRaw) as PluginManifest;

export const SRS_MARKDOWN_RENDERER_ID = "srs:SrsDocumentRenderer" as const;
export const SRS_HTML_RENDERER_ID = "srs:SrsHtmlRenderer" as const;

const profileRaw = readFileSync(join(__dirname, "generated", "profile.json"), "utf8");
export const PROFILE: DomainProfileShape = DomainProfile.parse(JSON.parse(profileRaw));

export async function activate(ctx: PluginContext): Promise<void> {
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `software-requirements manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }
  if (PROFILE.id !== PROFILE_ID) {
    throw new Error(
      `software-requirements profile mismatch: generated/profile.json declares id="${PROFILE.id}" but PROFILE_ID="${PROFILE_ID}".`,
    );
  }

  ctx.registerProfile(PROFILE);

  // An SRS is a document people sign, and this profile shipped with no
  // way to read one. Two targets, one model: markdown for review in a
  // diff, HTML for circulation and print.
  ctx.registerRenderer({
    target: "text/markdown",
    rendererId: SRS_MARKDOWN_RENDERER_ID,
    fn: renderSrsMarkdown as RendererFn,
  });
  ctx.registerRenderer({
    target: "text/html",
    rendererId: SRS_HTML_RENDERER_ID,
    fn: renderSrsHtml as RendererFn,
  });

  ctx.logger.info(
    `software-requirements activated: ${PROFILE.primitive_types.length} primitive types, ${PROFILE.relation_types.length} relation types, 2 renderers (${SRS_MARKDOWN_RENDERER_ID}/md, ${SRS_HTML_RENDERER_ID}/html). Profile id: ${PROFILE_ID}.`,
  );
}

export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = {
  manifest,
  activate,
  deactivate,
};
export default entry;
