import type { Host } from "../core/host.js";
import type { DomainProfile } from "../core/models/meta.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  Workbook,
} from "../core/models/instance.js";
import type {
  PluginContext,
  PluginLogger,
  ValidatorRegistration,
  RendererRegistration,
  ExprHelperRegistration,
  TransformerRegistration,
  ImporterRegistration,
  ExporterRegistration,
} from "./types.js";
import type { Permission, PluginManifest } from "./manifest.js";
import { PluginError } from "./errors.js";

/**
 * Aggregates a plugin's contributions so they can be torn down on
 * disable/uninstall (Principle 4 — failure isolation).
 */
export interface PluginContributions {
  profileIds: string[];
  validators: ValidatorRegistration[];
  renderers: RendererRegistration[];
  exprHelpers: ExprHelperRegistration[];
  transformers: TransformerRegistration[];
  importers: ImporterRegistration[];
  exporters: ExporterRegistration[];
}

export function newContributions(): PluginContributions {
  return {
    profileIds: [],
    validators: [],
    renderers: [],
    exprHelpers: [],
    transformers: [],
    importers: [],
    exporters: [],
  };
}

/**
 * Make a PluginContext bound to (host, manifest, contributions).
 *
 * Each register_* method:
 *  - records the contribution on `contributions` so lifecycle teardown
 *    can revoke it,
 *  - calls the host to install the contribution,
 *  - permission-gates where applicable (per §5.2 / §5.3).
 *
 * Read methods enforce permissions per §5.2.
 *
 * `allowMutations` switches off `register_*` (used by `on_install` and
 * `on_disable` hooks per §4.4).
 */
export function makeContext(args: {
  host: Host;
  manifest: PluginManifest;
  config: Record<string, unknown>;
  contributions: PluginContributions;
  allowMutations: boolean;
  pluginRuntime: PluginRuntimeFacade;
}): PluginContext {
  const { host, manifest, config, contributions, allowMutations, pluginRuntime } = args;
  const permissions = new Set<Permission>(manifest.permissions ?? []);
  const logger = makeLogger(manifest.id);

  const requirePerm = (perm: Permission): void => {
    if (!permissions.has(perm)) {
      throw new PluginError(
        "permission",
        `${manifest.id} attempted operation requiring ${perm} but does not declare it`,
        { pluginId: manifest.id },
      );
    }
  };

  const requireMutable = (op: string): void => {
    if (!allowMutations) {
      throw new PluginError(
        "lifecycle",
        `${manifest.id}: ${op} not allowed in this lifecycle phase`,
        { pluginId: manifest.id },
      );
    }
  };

  return {
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    permissions,
    config,
    logger,

    registerProfile(profile: DomainProfile): void {
      requireMutable("registerProfile");
      // §11.3 reserved namespaces enforced by the registry itself; we
      // also check here so the plugin name is in the error.
      // Plugin-contributed profiles are never persisted to disk —
      // every startup re-runs activate() which re-registers them.
      // (Persistence is for operator-registered profiles only.)
      pluginRuntime.runMutation(manifest.id, () => {
        void host.registerProfile(profile, { persist: false });
      });
      contributions.profileIds.push(profile.id);
    },

    registerValidator(reg: ValidatorRegistration): void {
      requireMutable("registerValidator");
      // cap:validator is unprivileged (§5.3); no permission check.
      // Wrap in exception barrier per §7.1 step 6 / §6.4.
      const wrapped: ValidatorRegistration = {
        type_id: reg.type_id,
        rule_id: reg.rule_id,
        fn: reg.fn,
      };
      host.pipeline.registerValidator({
        type_id: wrapped.type_id,
        rule_id: wrapped.rule_id,
        // Lazy getter: resolves at dispatch time, so registerValidator()
        // before registerProfile() during activate() still works — by
        // the time a write occurs, the plugin's profileIds are populated.
        // Scopes this validator to writes against profiles contributed
        // by THIS plugin, preventing cross-plugin leakage when two
        // plugins share a primitive-type-id namespace (e.g. `acme:Risk`
        // declared by both acme.pitch-deck and acme.business-deck with
        // incompatible field schemas).
        originating_profile_ids: () => contributions.profileIds,
        fn: (instance, type, profile, context) => {
          // Synchronous adapter — Core's pipeline is sync. Forward all
          // four args; plugin validators that took only `(instance)`
          // still type-check because the extra args are optional in
          // the plugin-side ValidatorFn signature.
          const result = wrapped.fn(instance, type, profile, context);
          if (result instanceof Promise) {
            // Async validators: the CLI v1.1 Core pipeline runs sync.
            // We surface the async result as a deferred-error finding
            // rather than block. Plugins should keep validators sync.
            return [
              {
                level: "error" as const,
                rule_id: `plugin:${manifest.id}:${wrapped.rule_id}:async-not-supported`,
                target_id: instance.id,
                field_path: null,
                message: "async validators are not supported by Core v1.1",
              },
            ];
          }
          return result;
        },
      });
      contributions.validators.push(wrapped);
    },

    registerRenderer(reg: RendererRegistration): void {
      requireMutable("registerRenderer");
      requirePerm("render:server");
      pluginRuntime.installRenderer(manifest.id, reg);
      contributions.renderers.push(reg);
    },

    registerExprHelper(reg: ExprHelperRegistration): void {
      requireMutable("registerExprHelper");
      const hasCapability = manifest.capabilities.some(
        (cap) => cap.capability_id === "cap:expr-helper",
      );
      if (!hasCapability) {
        throw new PluginError(
          "capability",
          `${manifest.id} attempted to register an expr helper without cap:expr-helper`,
          { pluginId: manifest.id },
        );
      }
      pluginRuntime.installExprHelper(manifest.id, reg);
      contributions.exprHelpers.push(reg);
    },

    registerTransformer(reg: TransformerRegistration): void {
      requireMutable("registerTransformer");
      // cap:transformer requires `write:primitives` and/or `write:relations`
      // depending on what it emits. We enforce at emission time, not at
      // registration; the registration itself records intent.
      pluginRuntime.installTransformer(manifest.id, reg);
      contributions.transformers.push(reg);
    },

    registerImporter(reg: ImporterRegistration): void {
      requireMutable("registerImporter");
      requirePerm("import:workbook");
      pluginRuntime.installImporter(manifest.id, reg);
      contributions.importers.push(reg);
    },

    registerExporter(reg: ExporterRegistration): void {
      requireMutable("registerExporter");
      requirePerm("export:workbook");
      pluginRuntime.installExporter(manifest.id, reg);
      contributions.exporters.push(reg);
    },

    listProfiles(): readonly DomainProfile[] {
      return host.profiles.listRaw();
    },
    getProfile(id: string): DomainProfile | undefined {
      return host.profiles.has(id) ? host.profiles.getRaw(id) : undefined;
    },

    listProjects() {
      requirePerm("read:workbooks");
      return host.listProjects();
    },
    getProject(id: string): Workbook | undefined {
      requirePerm("read:workbooks");
      try {
        return host.getProject(id).workbook;
      } catch {
        return undefined;
      }
    },
    listPrimitives(workbookId: string): readonly PrimitiveInstance[] {
      requirePerm("read:primitives");
      try {
        return Object.values(host.getProject(workbookId).primitives);
      } catch {
        return [];
      }
    },
    getPrimitive(workbookId: string, id: string): PrimitiveInstance | undefined {
      requirePerm("read:primitives");
      try {
        return host.getProject(workbookId).primitives[id];
      } catch {
        return undefined;
      }
    },
    listRelations(workbookId: string): readonly RelationInstance[] {
      requirePerm("read:relations");
      try {
        return Object.values(host.getProject(workbookId).relations);
      } catch {
        return [];
      }
    },
    getRelation(workbookId: string, id: string): RelationInstance | undefined {
      requirePerm("read:relations");
      try {
        return host.getProject(workbookId).relations[id];
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Log levels in ascending order of severity. `FDPM_LOG_LEVEL` selects the
 * minimum level emitted; anything below is dropped silently. Default is
 * `info`. Setting it to `warn`/`error`/`silent` is the official way to
 * suppress activation banners on `--json` and other structured output.
 */
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type LogLevelName = keyof typeof LOG_LEVELS;

function currentLogThreshold(): number {
  const raw = (process.env["FDPM_LOG_LEVEL"] ?? "info").toLowerCase();
  if (raw in LOG_LEVELS) return LOG_LEVELS[raw as LogLevelName];
  return LOG_LEVELS.info;
}

function makeLogger(pluginId: string): PluginLogger {
  const fmt = (level: string, msg: string, meta?: Record<string, unknown>): string => {
    const m = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[plugin:${pluginId}] [${level}] ${msg}${m}`;
  };
  const emit = (level: LogLevelName, msg: string, meta?: Record<string, unknown>) => {
    if (LOG_LEVELS[level] < currentLogThreshold()) return;
    process.stderr.write(fmt(level, msg, meta) + "\n");
  };
  return {
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta),
    debug: (m, meta) => {
      if (process.env["FDPM_DEBUG"]) emit("debug", m, meta);
    },
  };
}

/**
 * The PluginRuntimeFacade is the slice of PluginRuntime visible to a
 * PluginContext. Defined in plugin/runtime.ts; re-typed here as an
 * interface to avoid circular imports.
 */
export interface PluginRuntimeFacade {
  runMutation(pluginId: string, fn: () => void): void;
  installRenderer(pluginId: string, reg: RendererRegistration): void;
  installExprHelper(pluginId: string, reg: ExprHelperRegistration): void;
  installTransformer(pluginId: string, reg: TransformerRegistration): void;
  installImporter(pluginId: string, reg: ImporterRegistration): void;
  installExporter(pluginId: string, reg: ExporterRegistration): void;
}
