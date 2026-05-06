/**
 * Plugin-scaffold writer — writes a SidecarBridgeResult to disk in
 * the shape an FDPM host can activate.
 *
 * Per howto-zod-to-fdpm-plugin §2 (`example:bridge-manifest-skeleton`,
 * `example:worked-generated-manifest`) and §4 (`example:bridge-entry-module`).
 *
 * Two emitters:
 *
 *   - writeArtefactsToDir(result, opts) — `<outputDir>/generated/*.json`
 *     (profile, view-page, product-page-bundle, audit, usl-ng-core).
 *     The CI drift gate that the `example:bridge-entry-module` shows
 *     reads these files; a mismatch with a fresh in-memory assembly
 *     means the schema changed without regenerating the snapshot.
 *
 *   - writePluginScaffold(result, opts) — `<outputDir>/fdpm-plugin.json`
 *     and `<outputDir>/index.ts`. The manifest is assembled from
 *     fdpm.* (id, version, host_compatibility, profileId) plus
 *     ruleIdsByType (closed-set rule_ids per entity).
 *
 * The §1.3 invariant from SPEC-FDPM-BRIDGE: no I/O outside outputDir.
 * Both writers resolve every output path relative to outputDir and
 * throw `bridge:write-violation` if any resolved path escapes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import type { SidecarBridgeResult } from "./sidecar-orchestrator.js";
import { stableStringify } from "./stable-stringify.js";

// ===========================================================================
// writeArtefactsToDir
// ===========================================================================

export interface WriteArtefactsOptions {
  outputDir: string;
  /** Default: "generated". */
  artefactSubdir?: string;
}

export function writeArtefactsToDir(
  result: SidecarBridgeResult,
  opts: WriteArtefactsOptions,
): { files: string[] } {
  const subdir = opts.artefactSubdir ?? "generated";
  const generated = safeResolveUnder(opts.outputDir, subdir);
  mkdirSync(generated, { recursive: true });

  const files: { name: string; data: unknown }[] = [
    { name: "profile.json", data: result.profile },
    { name: "view-page.json", data: result.viewPage },
    { name: "product-page-bundle.json", data: result.productPage },
    { name: "audit.json", data: result.audit },
    { name: "migration-hints.json", data: result.migrationHints },
    { name: "usl-ng-core.json", data: result.uslNgCompanion },
  ];

  const written: string[] = [];
  for (const f of files) {
    const path = safeResolveUnder(opts.outputDir, subdir, f.name);
    writeFileSync(path, stableStringify(f.data) + "\n", "utf8");
    written.push(path);
  }
  return { files: written };
}

// ===========================================================================
// writePluginScaffold
// ===========================================================================

export interface ScaffoldOptions {
  outputDir: string;
  /** Default: "fdpm-plugin.json". */
  manifestFilename?: string;
  /** Default: "index.ts". */
  entryFilename?: string;
  /**
   * Default: "1". Override only if your host pins a different
   * fdpm-plugin spec version.
   */
  specVersion?: string;
  /**
   * Optional human-friendly fields for the manifest. The bridge has
   * no opinion on these; they default to a derivation from fdpm.*.
   */
  pluginName?: string;
  pluginDescription?: string;
  authors?: ReadonlyArray<string>;
  license?: string;
}

export interface ScaffoldResult {
  files: string[];
  manifest: Record<string, unknown>;
}

export function writePluginScaffold(
  result: SidecarBridgeResult,
  opts: ScaffoldOptions,
): ScaffoldResult {
  const manifestName = opts.manifestFilename ?? "fdpm-plugin.json";
  const entryName = opts.entryFilename ?? "index.ts";
  const manifestPath = safeResolveUnder(opts.outputDir, manifestName);
  const entryPath = safeResolveUnder(opts.outputDir, entryName);

  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(dirname(entryPath), { recursive: true });

  const manifest = buildManifest(result, opts);
  writeFileSync(manifestPath, stableStringify(manifest) + "\n", "utf8");

  const indexSource = buildEntryModule(result);
  writeFileSync(entryPath, indexSource, "utf8");

  return {
    files: [manifestPath, entryPath],
    manifest,
  };
}

// ===========================================================================
// Manifest assembly
// ===========================================================================

interface CapabilityEntry {
  capability_id: string;
  local_name: string;
  entry: string;
  metadata?: Record<string, unknown>;
}

function buildManifest(
  result: SidecarBridgeResult,
  opts: ScaffoldOptions,
): Record<string, unknown> {
  // Read fdpm.* via the profile id and audit version stamps.
  // The orchestrator captures vendor + pluginId + pluginVersion + hostCompatibility
  // but only emits them into productPage/audit. Parse them back.
  const pluginId = result.productPage.plugin_id;
  const pluginVersion = result.productPage.version;
  const profileId = result.productPage.profile_id;
  const hostCompatibility = result.productPage.host_compatibility;
  // Rule_ids: union of every entity's closed set.
  const ruleIdsByType = result.ruleIdsByType;

  const capabilities: CapabilityEntry[] = [
    {
      capability_id: "cap:profile",
      // Plugin-slug derived from pluginId, kebab-case. Profile id
      // shape is `profile:<vendor>-<plugin>:<version>` so the tail
      // is the version string — wrong for local_name.
      local_name: pluginSlug(pluginId),
      entry: "profile",
    },
  ];

  // One cap:validator entry per emitted PrimitiveTypeDef that has a
  // closed-set rule_id list (every entity does, in the current
  // realization).
  for (const primitiveTypeId of Object.keys(ruleIdsByType).sort()) {
    const ruleIds = ruleIdsByType[primitiveTypeId]!;
    capabilities.push({
      capability_id: "cap:validator",
      local_name: `${tailOf(primitiveTypeId).toLowerCase()}-zod`,
      entry: `${camelCaseLast(primitiveTypeId)}Validator`,
      metadata: {
        target_type_id: primitiveTypeId,
        applies_to: "primitive",
        triggers: ["create", "patch", "replace"],
        rule_ids: [...ruleIds].sort(),
      },
    });
  }

  // Permissions are the closed set defined by the host's manifest
  // schema (fdpm-cli/src/plugin/manifest.ts). The workbook
  // example:bridge-manifest-skeleton uses `register:profile` /
  // `register:validator` names that are NOT in the host enum — the
  // workbook is stale relative to the running host. The bridge MUST
  // emit names the host accepts. Minimum set for a Zod-derived
  // plugin: read primitives/relations (so validators can introspect)
  // and read workbooks (so renderers can address by id). Optional
  // capabilities (render:server, import:workbook, export:workbook,
  // network:outbound, filesystem:*) are author-added by overriding
  // ScaffoldOptions.permissions when those caps are wired.
  const permissions = ["read:primitives", "read:relations", "read:workbooks"];

  return {
    id: pluginId,
    version: pluginVersion,
    // Host's PluginManifest schema requires ^1\.\d+\.\d+$. Default
    // to 1.0.0; consumers MAY override via opts.specVersion.
    spec_version: opts.specVersion ?? "1.0.0",
    kind: "server",
    name: opts.pluginName ?? defaultPluginName(pluginId),
    description:
      opts.pluginDescription ??
      `${defaultPluginName(pluginId)} — auto-generated by @fdpm/zod-bridge from a Zod v4 schema and a defineDomain() sidecar. Do not hand-edit fdpm-plugin.json or index.ts; regenerate via the bridge.`,
    authors: opts.authors ?? [tailOf(pluginId.split(".")[0] ?? "vendor")],
    license: opts.license ?? "UNLICENSED",
    host_compatibility: { fdpm: hostCompatibility },
    permissions,
    capabilities,
  };
}

// ===========================================================================
// Entry-module assembly
// ===========================================================================

function buildEntryModule(result: SidecarBridgeResult): string {
  const profileId = result.productPage.profile_id;
  const lines: string[] = [];
  lines.push(
    "// Auto-generated by @fdpm/zod-bridge writePluginScaffold(). DO NOT EDIT BY HAND.",
  );
  lines.push("// Re-run the bridge to regenerate. Hand edits will be overwritten.");
  lines.push("");
  lines.push("import { readFileSync } from 'node:fs';");
  lines.push("import { fileURLToPath } from 'node:url';");
  lines.push("import { dirname, join } from 'node:path';");
  lines.push("import type { PluginContext, PluginManifest } from 'fdpm/plugin';");
  lines.push("");
  lines.push("const __dirname = dirname(fileURLToPath(import.meta.url));");
  lines.push("");
  lines.push(
    "// Manifest: read from fdpm-plugin.json (the file system is the source of truth).",
  );
  lines.push(
    "export const manifest: PluginManifest = JSON.parse(readFileSync(join(__dirname, 'fdpm-plugin.json'), 'utf8'));",
  );
  lines.push("");
  lines.push(
    "// Profile: read from generated/profile.json (the bridge writes this).",
  );
  lines.push(
    "const profileSnapshot = JSON.parse(readFileSync(join(__dirname, 'generated', 'profile.json'), 'utf8'));",
  );
  lines.push("");
  lines.push("export const profile = profileSnapshot;");
  lines.push("");
  // Per-entity validators are registered against their target_type_id.
  // Authors are expected to provide a sibling validators.ts module
  // that re-exports the per-entity validator closures from the
  // bridge's runtime. The scaffold lays out the wiring; the author
  // provides the bridge-call file.
  for (const primitiveTypeId of Object.keys(result.ruleIdsByType).sort()) {
    const entryName = `${camelCaseLast(primitiveTypeId)}Validator`;
    lines.push(`// Validator for ${primitiveTypeId} (cap:validator entry='${entryName}').`);
    lines.push(`// Provide the closure by importing your bridge-call output, e.g.:`);
    lines.push(
      `//   import { ${entryName} } from './validators.js';`,
    );
    lines.push("");
  }
  lines.push("export function activate(ctx: PluginContext): void {");
  lines.push("  ctx.registerProfile(profile);");
  for (const primitiveTypeId of Object.keys(result.ruleIdsByType).sort()) {
    const entryName = `${camelCaseLast(primitiveTypeId)}Validator`;
    lines.push("  // ctx.registerValidator({");
    lines.push(`  //   target_type_id: '${primitiveTypeId}',`);
    lines.push("  //   applies_to: 'primitive',");
    lines.push("  //   triggers: ['create', 'patch', 'replace'],");
    lines.push(`  //   fn: ${entryName},`);
    lines.push("  // });");
  }
  lines.push("}");
  lines.push("");
  lines.push("// CI drift gate — assert the in-tree snapshot matches a fresh assembly.");
  lines.push(
    "// (Failure here means: bump the plugin version + regenerate before commit.)",
  );
  lines.push(
    "// The freshly-assembled comparison is the host's job; this file only",
  );
  lines.push("// fails when the JSON itself is missing or malformed.");
  lines.push(`if (!profile || profile.id !== '${profileId}') {`);
  lines.push(
    "  throw new Error('profile drift: generated/profile.json missing or wrong id');",
  );
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

// ===========================================================================
// Path safety + naming helpers
// ===========================================================================

/**
 * Resolve `parts...` under `root`. Throws `bridge:write-violation` if
 * any component escapes `root` (absolute path, .. traversal, or
 * post-normalize result outside root).
 */
function safeResolveUnder(root: string, ...parts: string[]): string {
  const rootResolved = resolve(root);
  for (const p of parts) {
    if (p.length === 0) {
      throw new Error("bridge:write-violation: empty path component");
    }
    if (isAbsolute(p)) {
      throw new Error(`bridge:write-violation: absolute path component "${p}"`);
    }
    // Normalize and reject any segment that would escape via "..".
    const normalized = normalize(p);
    if (
      normalized.startsWith("..") ||
      normalized.split(sep).some((seg) => seg === "..")
    ) {
      throw new Error(
        `bridge:write-violation: path component "${p}" escapes outputDir`,
      );
    }
  }
  const joined = resolve(rootResolved, ...parts);
  if (joined !== rootResolved && !joined.startsWith(rootResolved + sep)) {
    throw new Error(
      `bridge:write-violation: resolved path "${joined}" escapes outputDir "${rootResolved}"`,
    );
  }
  return joined;
}

function tailOf(s: string): string {
  return s.split(":").pop() ?? s;
}

function camelCaseLast(s: string): string {
  const tail = tailOf(s);
  return tail[0]!.toLowerCase() + tail.slice(1);
}

function defaultPluginName(pluginId: string): string {
  // "acme.customers" -> "Acme Customers"
  return pluginId
    .split(/[.\-_]/)
    .filter((p) => p.length > 0)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function pluginSlug(pluginId: string): string {
  // "acme.customers" -> "acme-customers"
  // "acme.pitch-deck" -> "acme-pitch-deck"
  return pluginId
    .split(/[.\-_]/)
    .filter((p) => p.length > 0)
    .join("-")
    .toLowerCase();
}
