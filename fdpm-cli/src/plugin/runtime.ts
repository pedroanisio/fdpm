import type { PromptRegistration } from "./types.js";
import type { Host } from "../core/host.js";
import type {
  LifecycleState,
  PluginEntryModule,
  PluginSource,
  TrustTier,
  RendererRegistration,
  ExprHelperRegistration,
  TransformerRegistration,
  ImporterRegistration,
  ImporterOptions,
  ExporterRegistration,
} from "./types.js";
import type { ProjectTransfer } from "../core/models/instance.js";
import type { RendererInput, RendererOutput } from "./types.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { emitHostWarning } from "../core/diagnostics/warnings.js";
import {
  CORE_RENDERER_ID,
  CORE_RENDERER_OWNER,
  CORE_RENDERER_TARGET,
  renderWorkbookMarkdown,
} from "../core/profile/core-renderer.js";
import type { PluginManifest } from "./manifest.js";
import { isHostCompatible, isSemverCompatible, parseManifest } from "./manifest.js";
import { discoverPlugins, loadEntryModule, type DiscoveredPlugin } from "./discovery.js";
import {
  makeContext,
  newContributions,
  type PluginContributions,
  type PluginRuntimeFacade,
} from "./context.js";
import { PluginError } from "./errors.js";
import { validatePromptRegistration } from "../mcp/prompts.js";
import { SPEC_CORE_VERSION } from "../core/version/spec.js";

/**
 * §6 PluginRegistry + lifecycle. The runtime wires discovery →
 * verification → registration → activation. Failures move plugins to
 * `rejected` (install time) or `quarantined` (runtime); the host stays
 * up.
 */
export interface PluginRecord {
  id: string;
  version: string;
  manifest: PluginManifest;
  source: PluginSource;
  state: LifecycleState;
  trust: TrustTier;
  contributions: PluginContributions;
  module?: PluginEntryModule;
  errorMessage?: string;
  errorCategory?: string;
}

const HOST_VERSION_MAJOR = parseInt(SPEC_CORE_VERSION.split(".")[0]!, 10);
const HOST_VERSION_MINOR = parseInt(SPEC_CORE_VERSION.split(".")[1]!, 10);

export class PluginRuntime implements PluginRuntimeFacade {
  private readonly records = new Map<string, PluginRecord>();
  private readonly renderers = new Map<string, RendererRegistration & { pluginId: string }>();
  private readonly prompts = new Map<string, PromptRegistration & { pluginId: string }>();
  private readonly transformers = new Map<string, TransformerRegistration & { pluginId: string }>();
  private readonly importers = new Map<string, ImporterRegistration & { pluginId: string }>();
  private readonly exporters = new Map<string, ExporterRegistration & { pluginId: string }>();
  private mutatingPluginId: string | null = null;

  constructor(private readonly host: Host) {
    // Core's profile-generic renderer is installed here rather than at any
    // of the Host's three PluginRuntime construction sites, so a fourth one
    // cannot forget it. It is not a plugin and is never discovered,
    // activated or torn down: it exists for as long as the runtime does,
    // including in the `noPlugins` state, which is exactly the state in
    // which a profile would otherwise have nothing at all to render with.
    this.renderers.set(`${CORE_RENDERER_OWNER}:${CORE_RENDERER_TARGET}:${CORE_RENDERER_ID}`, {
      target: CORE_RENDERER_TARGET,
      rendererId: CORE_RENDERER_ID,
      fn: renderWorkbookMarkdown,
      pluginId: CORE_RENDERER_OWNER,
    });
  }

  // -- Discovery + registration --------------------------------------

  async discoverAndRegister(opts?: {
    builtinDirs?: string[];
    pluginPaths?: string[];
    cwd?: string;
  }): Promise<void> {
    const found = await discoverPlugins(opts ?? {});
    for (const d of found) {
      await this.registerOne(d);
    }
  }

  private async registerOne(d: DiscoveredPlugin): Promise<void> {
    let manifest: PluginManifest;
    try {
      manifest = parseManifest(d.rawManifest, d.manifestPath);
    } catch (err) {
      // No record to add (we can't even key it); surface error as a host
      // warning. We have no plugin id to attach, so the manifest path is
      // the only stable handle.
      emitHostWarning({
        code: "plugin.manifest_rejected",
        message: `plugin manifest rejected at ${d.manifestPath}: ${(err as Error).message}`,
        evidence: { manifest_path: d.manifestPath, error: (err as Error).message },
      });
      return;
    }

    if (this.records.has(manifest.id)) {
      this.markRejected(manifest, d.source, "duplicate plugin id");
      return;
    }

    if (!isHostCompatible(manifest.host_compatibility.fdpm, HOST_VERSION_MAJOR, HOST_VERSION_MINOR)) {
      this.markRejected(
        manifest,
        d.source,
        `host_compatibility.fdpm "${manifest.host_compatibility.fdpm}" excludes host ${SPEC_CORE_VERSION}`,
      );
      return;
    }
    if (
      manifest.host_compatibility.expr_helper_set &&
      !isSemverCompatible(
        manifest.host_compatibility.expr_helper_set,
        this.host.expr.helperSetVersion,
      )
    ) {
      this.markRejected(
        manifest,
        d.source,
        `helper-set v${this.host.expr.helperSetVersion} does not satisfy plugin pin ${manifest.host_compatibility.expr_helper_set}`,
      );
      return;
    }

    const trust: TrustTier = inferTrust(manifest, d.source);
    const record: PluginRecord = {
      id: manifest.id,
      version: manifest.version,
      manifest,
      source: d.source,
      state: "registered",
      trust,
      contributions: newContributions(),
    };
    try {
      record.module = await loadEntryModule(d.manifestPath, manifest);
    } catch (err) {
      record.state = "rejected";
      record.errorMessage = (err as Error).message;
      record.errorCategory = "discovery";
      this.records.set(manifest.id, record);
      return;
    }
    this.records.set(manifest.id, record);
  }

  private markRejected(
    manifest: PluginManifest,
    source: PluginSource,
    message: string,
  ): void {
    this.records.set(manifest.id, {
      id: manifest.id,
      version: manifest.version,
      manifest,
      source,
      state: "rejected",
      trust: "unknown",
      contributions: newContributions(),
      errorMessage: message,
      errorCategory: "host_compat",
    });
  }

  // -- Activation ----------------------------------------------------

  /**
   * Activate every plugin whose trust tier is `core` or `verified`
   * (auto-activation per §10.1). Community/unknown plugins remain
   * `disabled` and require an explicit `enable`.
   */
  async activateAuto(): Promise<void> {
    const ordered = this.dependencyOrder();
    for (const r of ordered) {
      if (r.state !== "registered") continue;
      if (r.trust === "core" || r.trust === "verified") {
        try {
          await this.enable(r.id);
        } catch (err) {
          emitHostWarning({
            code: "plugin.auto_enable_failed",
            message: `plugin ${r.id} failed auto-enable: ${
              err instanceof Error ? err.message : String(err)
            }`,
            evidence: { plugin_id: r.id, error: err instanceof Error ? err.message : String(err) },
          });
        }
      } else {
        r.state = "disabled";
      }
    }
  }

  /**
   * Activate a plugin whose state is `registered` or `disabled`.
   */
  async enable(pluginId: string): Promise<void> {
    const r = this.requireRecord(pluginId);
    if (r.state === "active") return;
    if (r.state === "rejected" || r.state === "quarantined") {
      throw new PluginError(
        "lifecycle",
        `cannot enable ${pluginId} in state ${r.state}; requires quarantine-clear/reload first`,
        { pluginId },
      );
    }
    if (!r.module) {
      r.state = "rejected";
      r.errorMessage = "no entry module";
      throw new PluginError("lifecycle", `${pluginId} has no entry module`, { pluginId });
    }
    const missingHelpers = (r.manifest.requires_helpers ?? []).filter(
      (helperId) => !this.host.expr.hasHelper(helperId),
    );
    if (missingHelpers.length > 0) {
      throw new PluginError(
        "host_compat",
        `required helpers not available: ${missingHelpers.join(", ")}`,
        { pluginId },
      );
    }
    // Run on_install on first activation transition (we approximate
    // "first time" as: contributions empty AND no on_install ran yet on
    // this record). The CLI doesn't persist plugin install state, so
    // every fresh process treats this as first-time. The hook is
    // read-only by §4.4; we run it inside an exception barrier and
    // the contributions stay empty.
    const installCtx = makeContext({
      host: this.host,
      manifest: r.manifest,
      config: {},
      contributions: r.contributions,
      allowMutations: false,
      pluginRuntime: this,
    });
    if (typeof r.module.onInstall === "function") {
      try {
        await Promise.resolve(r.module.onInstall(installCtx));
      } catch (err) {
        return this.quarantine(r, "onInstall raised", err);
      }
    }

    // activate() is the contributions-installing phase (§4.4).
    const enableCtx = makeContext({
      host: this.host,
      manifest: r.manifest,
      config: {},
      contributions: r.contributions,
      allowMutations: true,
      pluginRuntime: this,
    });
    try {
      await Promise.resolve(r.module.activate(enableCtx));
      if (typeof r.module.onEnable === "function") {
        await Promise.resolve(r.module.onEnable(enableCtx));
      }
    } catch (err) {
      return this.quarantine(r, "activate raised", err);
    }
    r.state = "active";
  }

  /**
   * Disable a plugin. Tears down its contributions.
   */
  async disable(pluginId: string): Promise<void> {
    const r = this.requireRecord(pluginId);
    if (r.state !== "active") return;
    const teardownCtx = makeContext({
      host: this.host,
      manifest: r.manifest,
      config: {},
      contributions: r.contributions,
      allowMutations: false,
      pluginRuntime: this,
    });
    if (r.module && typeof r.module.onDisable === "function") {
      try {
        await Promise.resolve(r.module.onDisable(teardownCtx));
      } catch (err) {
        // §4.4: on_disable failures are logged but do not block.
        emitHostWarning({
          code: "plugin.on_disable_raised",
          message: `plugin ${pluginId} onDisable raised (logged, transition continues): ${
            (err as Error).message
          }`,
          evidence: { plugin_id: pluginId, error: (err as Error).message },
        });
      }
    }
    if (r.module && typeof r.module.deactivate === "function") {
      try {
        await Promise.resolve(r.module.deactivate(teardownCtx));
      } catch {
        // ditto
      }
    }
    this.tearDownContributions(r);
    r.state = "disabled";
  }

  /**
   * §6.4 + §6.6 quarantine-clear → disabled.
   */
  quarantineClear(pluginId: string): void {
    const r = this.requireRecord(pluginId);
    if (r.state !== "quarantined") {
      throw new PluginError(
        "lifecycle",
        `cannot clear quarantine for ${pluginId}: state is ${r.state}`,
        { pluginId },
      );
    }
    r.state = "disabled";
    r.errorMessage = undefined;
    r.errorCategory = undefined;
  }

  async reload(pluginId: string): Promise<void> {
    const r = this.requireRecord(pluginId);
    if (r.state === "active") await this.disable(pluginId);
    this.records.delete(pluginId);
    // Rediscover this single plugin from its source.
    if (r.source.kind === "filesystem") {
      const fsSource = r.source;
      const found = await discoverPlugins({
        builtinDirs: [],
        pluginPaths: [fsSource.root.replace(/[\\/][^\\/]+$/, "")],
      });
      const match = found.find((d) => d.manifestPath === fsSource.manifestPath);
      if (match) await this.registerOne(match);
    }
  }

  // -- Quarantine + teardown -----------------------------------------

  private quarantine(r: PluginRecord, reason: string, err: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err);
    emitHostWarning({
      code: "plugin.quarantined",
      message: `plugin ${r.id} QUARANTINED: ${reason}: ${errMsg}`,
      evidence: { plugin_id: r.id, reason, error: errMsg },
    });
    this.tearDownContributions(r);
    r.state = "quarantined";
    r.errorMessage = err instanceof Error ? err.message : String(err);
    r.errorCategory = "capability";
  }

  private tearDownContributions(r: PluginRecord): void {
    // Profile contributions: the registry doesn't currently support
    // unregister; we leave profiles in place and rely on next process
    // restart to drop them. This is a known v1.1 limitation, called
    // out in the README.
    for (const reg of r.contributions.renderers) {
      this.renderers.delete(`${r.id}:${reg.target}:${reg.rendererId}`);
    }
    for (const reg of r.contributions.prompts) {
      this.prompts.delete(`${r.id}:${reg.promptId}`);
    }
    this.host.expr.unregisterPluginHelpers(r.id);
    for (const reg of r.contributions.transformers) {
      this.transformers.delete(`${r.id}:${reg.fromTypeId}->${reg.toTypeId}:${reg.name}`);
    }
    for (const reg of r.contributions.importers) {
      this.importers.delete(`${r.id}:${reg.format}`);
    }
    for (const reg of r.contributions.exporters) {
      this.exporters.delete(`${r.id}:${reg.format}`);
    }
    r.contributions = newContributions();
  }

  // -- Dependency ordering -------------------------------------------

  private dependencyOrder(): PluginRecord[] {
    // Topological sort over manifest.dependencies.plugins.
    const records = [...this.records.values()].filter((r) => r.state === "registered");
    const order: PluginRecord[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (r: PluginRecord) => {
      if (visited.has(r.id)) return;
      if (visiting.has(r.id))
        throw new PluginError("lifecycle", `circular dependency at ${r.id}`, {
          pluginId: r.id,
        });
      visiting.add(r.id);
      const deps = r.manifest.dependencies?.plugins ?? [];
      for (const dep of deps) {
        const depRec = this.records.get(dep.id);
        if (depRec) visit(depRec);
      }
      visiting.delete(r.id);
      visited.add(r.id);
      order.push(r);
    };
    for (const r of records) visit(r);
    return order;
  }

  // -- PluginRuntimeFacade -------------------------------------------

  runMutation(pluginId: string, fn: () => void): void {
    const previous = this.mutatingPluginId;
    this.mutatingPluginId = pluginId;
    try {
      fn();
    } finally {
      this.mutatingPluginId = previous;
    }
  }

  installRenderer(pluginId: string, reg: RendererRegistration): void {
    // Cross-plugin uniqueness: per SPEC-PLUGGABLE §7.4 / §6.6, two plugins
    // MUST NOT register the same (capability_id, slot_key) pair. The slot
    // key for renderers is (target, rendererId).
    for (const existing of this.renderers.values()) {
      if (existing.target === reg.target && existing.rendererId === reg.rendererId)
        throw new PluginError(
          "conflict",
          `renderer (target=${reg.target}, rendererId=${reg.rendererId}) already registered by ${existing.pluginId}`,
          { pluginId },
        );
    }
    const key = `${pluginId}:${reg.target}:${reg.rendererId}`;
    this.renderers.set(key, { ...reg, pluginId });
  }
  installPrompt(pluginId: string, reg: PromptRegistration): void {
    // Skill contract (shape, description, arguments, listing budget) —
    // rejected here so a malformed prompt never reaches prompts/list.
    validatePromptRegistration(reg);
    for (const existing of this.prompts.values()) {
      if (existing.promptId === reg.promptId)
        throw new PluginError(
          "conflict",
          `prompt ${reg.promptId} already registered by ${existing.pluginId}`,
          { pluginId },
        );
    }
    this.prompts.set(`${pluginId}:${reg.promptId}`, { ...reg, pluginId });
  }
  installExprHelper(pluginId: string, reg: ExprHelperRegistration): void {
    try {
      this.host.expr.registerHelper(pluginId, reg);
    } catch (err) {
      throw new PluginError(
        "conflict",
        err instanceof Error ? err.message : String(err),
        { pluginId },
      );
    }
  }
  installTransformer(pluginId: string, reg: TransformerRegistration): void {
    for (const existing of this.transformers.values()) {
      if (
        existing.fromTypeId === reg.fromTypeId &&
        existing.toTypeId === reg.toTypeId &&
        existing.name === reg.name
      )
        throw new PluginError(
          "conflict",
          `transformer (${reg.fromTypeId}->${reg.toTypeId} name=${reg.name}) already registered by ${existing.pluginId}`,
          { pluginId },
        );
    }
    const key = `${pluginId}:${reg.fromTypeId}->${reg.toTypeId}:${reg.name}`;
    this.transformers.set(key, { ...reg, pluginId });
  }
  installImporter(pluginId: string, reg: ImporterRegistration): void {
    for (const existing of this.importers.values()) {
      if (existing.format === reg.format)
        throw new PluginError(
          "conflict",
          `importer format "${reg.format}" already registered by ${existing.pluginId}`,
          { pluginId },
        );
    }
    const key = `${pluginId}:${reg.format}`;
    this.importers.set(key, { ...reg, pluginId });
  }
  installExporter(pluginId: string, reg: ExporterRegistration): void {
    for (const existing of this.exporters.values()) {
      if (existing.format === reg.format)
        throw new PluginError(
          "conflict",
          `exporter format "${reg.format}" already registered by ${existing.pluginId}`,
          { pluginId },
        );
    }
    const key = `${pluginId}:${reg.format}`;
    this.exporters.set(key, { ...reg, pluginId });
  }

  // -- Read API for the admin commands -------------------------------

  list(): PluginRecord[] {
    return [...this.records.values()];
  }
  get(id: string): PluginRecord | undefined {
    return this.records.get(id);
  }
  listRenderers() {
    return [...this.renderers.values()];
  }
  /** Prompts from every active plugin, sorted by promptId (SPEC-MCP-SERVER §13.5). */
  listPrompts(): Array<PromptRegistration & { pluginId: string }> {
    return [...this.prompts.values()].sort((a, b) => a.promptId.localeCompare(b.promptId));
  }
  findPrompt(promptId: string): (PromptRegistration & { pluginId: string }) | undefined {
    for (const p of this.prompts.values()) if (p.promptId === promptId) return p;
    return undefined;
  }
  listTransformers() {
    return [...this.transformers.values()];
  }
  listImporters() {
    return [...this.importers.values()];
  }
  listExporters() {
    return [...this.exporters.values()];
  }

  /**
   * Locate the (single) importer registered for a format. Importers are
   * keyed by `{pluginId}:{format}`; a format collision across plugins is
   * rejected at registration time, so at most one match is possible.
   */
  findImporter(format: string): (ImporterRegistration & { pluginId: string }) | undefined {
    for (const reg of this.importers.values()) {
      if (reg.format === format) return reg;
    }
    return undefined;
  }

  /**
   * Run a registered importer for `format`. Wrapped in the per-plugin
   * exception barrier (§6.4): any raise quarantines the owning plugin
   * and surfaces a PluginError to the caller — the host is unaffected.
   */
  async runImporter(
    format: string,
    raw: unknown,
    options?: ImporterOptions,
  ): Promise<ProjectTransfer> {
    const reg = this.findImporter(format);
    if (!reg)
      throw new PluginError("lifecycle", `no importer registered for format: ${format}`);
    const owner = this.requireRecord(reg.pluginId);
    if (owner.state !== "active")
      throw new PluginError(
        "lifecycle",
        `importer ${format} owner ${reg.pluginId} is not active (state=${owner.state})`,
        { pluginId: reg.pluginId },
      );
    try {
      return await Promise.resolve(reg.fn(raw, options));
    } catch (err) {
      // §6.4 distinguishes input-rejection from plugin defect.
      // A plugin that throws `FDPMException(verification)` is signalling
      // "the input the host gave me was malformed" — the plugin worked
      // correctly. Pass that through to the operator without
      // quarantining the plugin. Any other throw is treated as a plugin
      // defect and triggers the standard quarantine path.
      if (err instanceof FDPMException && err.category === "verification") {
        throw err;
      }
      this.quarantine(owner, `importer ${format} raised`, err);
      throw new PluginError(
        "capability",
        `importer ${format} (${reg.pluginId}) raised: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { pluginId: reg.pluginId },
      );
    }
  }

  /**
   * Locate a registered renderer by `target` (the MIME type or symbolic
   * id the renderer was registered under).
   *
   * Disambiguation order when more than one renderer is registered
   * against the same `target` (e.g. several profiles ship a
   * text/markdown renderer):
   *
   *   1. If `rendererId` is given, take the exact match. Caller-
   *      asserted; never overridden by profile bindings.
   *   2. If `profile` is given, take the first renderer whose
   *      `rendererId` appears in the profile's `renderer_bindings`
   *      (or the `renderers` alias — Python parity). Profiles that
   *      declare `text/markdown → fs:SpecRenderer` get
   *      `fs:SpecRenderer` even when other plugins also registered
   *      `text/markdown`. This is the safety net that keeps a
   *      formal-specification workbook from rendering through a
   *      recipe-themed plugin merely because the recipe plugin
   *      loaded first.
   *   3. Otherwise, return the first renderer matching `target` by
   *      insertion order. Backwards-compatible with pre-profile
   *      callers (no behaviour change for single-binding targets).
   *   4. If nothing at all matches, Core's own profile-generic renderer,
   *      for its own target only. Every profile the registry resolves
   *      declares a renderer (see `ProfileRegistry.getResolved`), so step 4
   *      is reached only by a caller that assembled a profile by hand.
   */
  findRenderer(
    target: string,
    rendererId?: string,
    profile?: { renderer_bindings?: readonly { renderer_id?: string }[]; renderers?: readonly { renderer_id?: string }[] },
  ): (RendererRegistration & { pluginId: string }) | undefined {
    let firstMatch: (RendererRegistration & { pluginId: string }) | undefined;
    for (const reg of this.renderers.values()) {
      if (reg.target !== target) continue;
      if (rendererId != null && reg.rendererId !== rendererId) continue;
      // Caller-supplied id wins outright, no profile fallback search.
      if (rendererId != null) return reg;
      // Core's generic renderer is registered before any plugin, and it is
      // a last resort, not a first match. It is reachable only by being
      // named — by the caller, or by the profile — or when nothing else
      // answers at all.
      if (reg.rendererId === CORE_RENDERER_ID) continue;
      if (firstMatch === undefined) firstMatch = reg;
    }
    if (rendererId != null) return undefined;

    // Profile-aware disambiguation. The bindings list is small (one
    // per output format per profile), so the linear scan is cheap.
    //
    // Iterated in the order the PROFILE declares, not the order the
    // registry happens to hold. A profile that lists two renderers for one
    // target is stating a preference, and resolving it by plugin load order
    // instead would make the answer depend on which plugin directory was
    // walked first. It also lets Core append its own profile-generic
    // renderer to every profile as a last resort without ever displacing a
    // domain renderer the profile named ahead of it.
    if (profile !== undefined) {
      for (const rendererId of collectDeclaredRendererIds(profile)) {
        for (const reg of this.renderers.values()) {
          if (reg.target !== target) continue;
          if (reg.rendererId === rendererId) return reg;
        }
      }
    }

    if (firstMatch !== undefined) return firstMatch;

    // Nothing else answers. Core's generic renderer is reached only here,
    // and only for its own target — a caller asking for a PDF still gets
    // `undefined` rather than Markdown pretending to be one.
    const core = this.renderers.get(
      `${CORE_RENDERER_OWNER}:${CORE_RENDERER_TARGET}:${CORE_RENDERER_ID}`,
    );
    return core !== undefined && core.target === target ? core : undefined;
  }

  /**
   * Run a registered renderer for `target`. Wrapped in the per-plugin
   * exception barrier (§6.4) and the §6.5 verification gate:
   *  - The renderer's declared `contentType` MUST equal the registered
   *    `target` (a renderer cannot lie about what it produced).
   *  - The output MUST NOT exceed `FDPM_MAX_RENDER_BYTES` (default 50 MiB).
   *  - For `text/*` targets the bytes MUST be valid UTF-8.
   * Any of these checks failing yields `PluginError(verification)` and
   * does NOT quarantine the plugin (the renderer ran fine; the host
   * rejected its output). A raise from the renderer DOES quarantine.
   */
  async runRenderer(
    target: string,
    input: RendererInput,
    options?: { rendererId?: string },
  ): Promise<RendererOutput & { pluginId: string; rendererId: string }> {
    // Pass the workbook's profile to findRenderer so a target shared
    // by multiple plugins (e.g. text/markdown registered by both
    // formal_specification and _starter) is disambiguated by the
    // profile's renderer_bindings instead of falling through to
    // insertion order. See findRenderer for the full disambiguation
    // contract.
    const reg = this.findRenderer(target, options?.rendererId, input.profile);
    if (!reg)
      throw new PluginError(
        "lifecycle",
        options?.rendererId
          ? `no renderer registered for target=${target} rendererId=${options.rendererId}`
          : `no renderer registered for target: ${target}`,
      );
    // Core's own renderer has no plugin record and no lifecycle to check:
    // it is part of the host, so it is active exactly when the host is, and
    // there is nothing to quarantine if it misbehaves — a defect there is a
    // host defect and belongs in the host's own test suite.
    const owner = reg.pluginId === CORE_RENDERER_OWNER ? null : this.requireRecord(reg.pluginId);
    if (owner !== null && owner.state !== "active")
      throw new PluginError(
        "lifecycle",
        `renderer ${reg.rendererId} (target=${target}) owner ${reg.pluginId} is not active (state=${owner.state})`,
        { pluginId: reg.pluginId },
      );

    let output: RendererOutput;
    let enrichedInput: RendererInput = input;
    try {
      const slice = this.host.getProject(input.workbookId);
      const docCandidates = Object.values(slice.primitives)
        .filter((primitive) => primitive.type_id === "spec:Document")
        .sort((left, right) => left.id.localeCompare(right.id));
      const defaultDoc = docCandidates[0];
      enrichedInput = {
        ...input,
        workbook: slice.workbook,
        templates: Object.values(slice.templates),
        renderDsl: this.host.renderDsl.createFacade({
          slice,
          profile: input.profile,
          defaultDoc,
        }),
      };
    } catch (err) {
      if (!(err instanceof FDPMException) || err.category !== "not_found") {
        throw err;
      }
    }
    try {
      output = await Promise.resolve(reg.fn(enrichedInput));
    } catch (err) {
      // Same input-rejection-vs-plugin-defect distinction as runImporter.
      // A renderer that throws FDPMException(verification) is signalling
      // "the input I was handed is unrenderable" — pass through, do not
      // quarantine. Any other throw is treated as a plugin defect.
      if (err instanceof FDPMException && err.category === "verification") {
        throw err;
      }
      if (owner !== null) this.quarantine(owner, `renderer ${reg.rendererId} raised`, err);
      throw new PluginError(
        "capability",
        `renderer ${reg.rendererId} (${reg.pluginId}) raised: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { pluginId: reg.pluginId },
      );
    }

    // §6.5 / §8.1 output verification gate. The host MUST validate
    // every byte the renderer produced before returning it.
    verifyRendererOutput(output, target, reg.rendererId, reg.pluginId);

    return { ...output, pluginId: reg.pluginId, rendererId: reg.rendererId };
  }

  private requireRecord(id: string): PluginRecord {
    const r = this.records.get(id);
    if (!r) throw new PluginError("lifecycle", `plugin not found: ${id}`, { pluginId: id });
    return r;
  }
}

/**
 * Collect the renderer ids declared by a profile. A profile's
 * `renderer_bindings` is the CLI-native list; `renderers` is the
 * Python-source alias (`compileProfile` keeps both populated). Either
 * may carry an entry shaped `{ renderer_id: "...", ... }`. We accept
 * both because the registry stores raw profiles in whichever shape
 * was registered, and `findRenderer` is called from paths that can
 * see either form (resolved profiles are merges of both).
 */
function collectDeclaredRendererIds(
  profile: {
    renderer_bindings?: readonly { renderer_id?: string }[];
    renderers?: readonly { renderer_id?: string }[];
  },
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const binding of [...(profile.renderer_bindings ?? []), ...(profile.renderers ?? [])]) {
    if (typeof binding.renderer_id !== "string" || binding.renderer_id.length === 0) continue;
    if (seen.has(binding.renderer_id)) continue;
    seen.add(binding.renderer_id);
    out.push(binding.renderer_id);
  }
  return out;
}

/**
 * §10.1 trust inference.
 *
 * The CLI cannot reliably tell `verified` from `unknown` without a key
 * registry; we infer:
 *   - `core` if the source is a filesystem path under an in-tree bundled
 *     plugins directory: either the source tree (`cli/plugins/<id>/`) or
 *     the built/shipped tree (`dist/plugins/<id>/`). Both ship with the
 *     CLI binary and are equally trusted.
 *   - `community` for everything else with a valid manifest.
 *   - `verified` is reserved for plugins whose manifest declares a
 *     `trust.signed_by` matching `$FDPM_TRUSTED_KEYS` (parsed
 *     conservatively here as a comma-separated list).
 */
function inferTrust(manifest: PluginManifest, source: PluginSource): TrustTier {
  if (source.kind === "filesystem") {
    if (source.builtin) return "core";
    const root = source.root;
    const coreSegments = [
      `${PATH_SEP}cli${PATH_SEP}plugins${PATH_SEP}`,
      `${PATH_SEP}dist${PATH_SEP}plugins${PATH_SEP}`,
    ];
    const coreSuffixes = [
      `${PATH_SEP}cli${PATH_SEP}plugins`,
      `${PATH_SEP}dist${PATH_SEP}plugins`,
    ];
    if (
      coreSegments.some((s) => root.includes(s)) ||
      coreSuffixes.some((s) => root.endsWith(s))
    ) {
      return "core";
    }
  }
  const trustedKeys = (process.env["FDPM_TRUSTED_KEYS"] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const signedBy = manifest.trust?.signed_by;
  if (signedBy && trustedKeys.includes(signedBy)) return "verified";
  return "community";
}

const PATH_SEP = process.platform === "win32" ? "\\" : "/";

/**
 * §6.5 renderer-output verification.
 *
 * Three independent checks. Each failure raises a PluginError with
 * `category=verification`. The plugin is NOT quarantined — its
 * function returned normally; only the output was unacceptable.
 */
function verifyRendererOutput(
  output: RendererOutput,
  declaredTarget: string,
  rendererId: string,
  pluginId: string,
): void {
  // 1. Content-type match.
  if (output.contentType !== declaredTarget) {
    throw new PluginError(
      "verification",
      `renderer ${rendererId} produced contentType=${output.contentType}, expected ${declaredTarget}`,
      { pluginId },
    );
  }

  // 2. Size cap.
  const cap = parseInt(
    process.env["FDPM_MAX_RENDER_BYTES"] ?? `${50 * 1024 * 1024}`,
    10,
  );
  if (output.bytes.byteLength > cap) {
    throw new PluginError(
      "verification",
      `renderer ${rendererId} output ${output.bytes.byteLength} bytes exceeds cap ${cap}`,
      { pluginId },
    );
  }

  // 3. UTF-8 check for text/* targets.
  if (declaredTarget.startsWith("text/")) {
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      decoder.decode(output.bytes);
    } catch {
      throw new PluginError(
        "verification",
        `renderer ${rendererId} produced invalid UTF-8 for ${declaredTarget}`,
        { pluginId },
      );
    }
  }
}
