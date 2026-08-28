import type { DomainProfile } from "../core/models/meta.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  Workbook,
  ProjectTemplate,
  ProjectTransfer,
  ValidationFinding,
} from "../core/models/instance.js";
import type { RenderDslFacade, RenderFinding } from "../core/render/template.js";
import type { Permission, PluginManifest } from "./manifest.js";
export type { ExprHelperRegistration } from "../core/expr/runtime.js";
import type { ExprHelperRegistration } from "../core/expr/runtime.js";

/**
 * §6.2 PluginContext — the only object a plugin's activate() receives.
 * Read-only views are gated by the corresponding `read:*` permission.
 *
 * The CLI runtime does not provide `register_router` (no HTTP server).
 * It does not provide `cap:ui:*` register methods (no frontend).
 */
export interface PluginContext {
  pluginId: string;
  pluginVersion: string;
  permissions: ReadonlySet<Permission>;
  config: Readonly<Record<string, unknown>>;
  logger: PluginLogger;

  // Server-side registrations
  registerProfile(profile: DomainProfile): void;
  registerValidator(reg: ValidatorRegistration): void;
  registerRenderer(reg: RendererRegistration): void;
  /** Register an MCP prompt (SPEC-MCP-SERVER §13.5). Validated at install; unique across plugins. */
  registerPrompt(reg: PromptRegistration): void;
  registerExprHelper(reg: ExprHelperRegistration): void;
  registerTransformer(reg: TransformerRegistration): void;
  registerImporter(reg: ImporterRegistration): void;
  registerExporter(reg: ExporterRegistration): void;

  // Read-only views (each requires a permission)
  listProfiles(): readonly DomainProfile[];
  getProfile(id: string): DomainProfile | undefined;
  listProjects(): readonly { id: string; name: string; profile_id: string; revision: number }[];
  getProject(id: string): Workbook | undefined;
  listPrimitives(workbookId: string): readonly PrimitiveInstance[];
  getPrimitive(workbookId: string, id: string): PrimitiveInstance | undefined;
  listRelations(workbookId: string): readonly RelationInstance[];
  getRelation(workbookId: string, id: string): RelationInstance | undefined;
}

export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Optional 4th parameter handed to validators by the pipeline. Carries
 * data the validator may need beyond the instance — today only
 * `relations` (so graph predicates like `has_incoming` / `has_outgoing`
 * / `acyclic` can run). The argument is OPTIONAL on the signature so
 * an existing single-arg validator keeps working unchanged.
 */
export interface ValidatorContext {
  relations: readonly RelationInstance[];
}

export type ValidatorFn = (
  instance: PrimitiveInstance | RelationInstance,
  type?: unknown,
  profile?: unknown,
  context?: ValidatorContext,
) => ValidationFinding[] | Promise<ValidationFinding[]>;

export interface ValidatorRegistration {
  type_id: string;
  rule_id: string;
  fn: ValidatorFn;
}

export interface RendererInput {
  workbookId: string;
  workbook?: Workbook;
  primitives: readonly PrimitiveInstance[];
  relations: readonly RelationInstance[];
  templates?: readonly ProjectTemplate[];
  profile: DomainProfile;
  renderDsl?: RenderDslFacade;
}
export type RendererFn = (input: RendererInput) => Promise<RendererOutput> | RendererOutput;
export interface RendererOutput {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  findings?: RenderFinding[];
}
export interface RendererRegistration {
  target: string; // mime type or symbolic id
  rendererId: string;
  fn: RendererFn;
}

// -- Prompts (SPEC-MCP-SERVER §13.5) ------------------------------------
//
// A prompt is a skill: when to use a set of tools, in what order, and
// how to handle failures. `prompts/list` shows only the metadata below;
// `render` runs on `prompts/get` and its output is validated by the
// server (`src/mcp/prompts.ts`) before it reaches a client.

export interface PromptArgumentSpec {
  /** ^[a-z_][a-z0-9_]*$ */
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface PromptRenderInput {
  /** Declared arguments only; required ones are guaranteed present. */
  args: Readonly<Record<string, string>>;
}

export interface PromptRegistration {
  /** `<plugin-short-name>/<slug>`, e.g. `planning/triage_iteration`. Unique across plugins. */
  promptId: string;
  /** ≤ 80 characters. */
  title: string;
  /** 40..300 characters; MUST say when to use the prompt. */
  description: string;
  arguments: PromptArgumentSpec[];
  /** MUST return text messages containing "When to use", "Call order", "Failure modes". */
  render: (input: PromptRenderInput) => PromptMessage[] | Promise<PromptMessage[]>;
}

export interface TransformerInput {
  workbookId: string;
  source: PrimitiveInstance | RelationInstance;
  profile: DomainProfile;
}
export interface TransformerOpEmission {
  kind: string; // operation kind (must be in Core's closed set)
  payload: Record<string, unknown>;
}
export type TransformerFn = (
  input: TransformerInput,
) => Promise<TransformerOpEmission[]> | TransformerOpEmission[];
export interface TransformerRegistration {
  fromTypeId: string;
  toTypeId: string;
  name: string;
  fn: TransformerFn;
}

export interface ImporterOptions {
  /** Caller-supplied workbook id (importer formats without an embedded workbook envelope use this). */
  workbookId?: string;
  /** Caller-supplied workbook display name. */
  projectName?: string;
  /** Caller-supplied workbook description. */
  projectDescription?: string;
  /** Format-specific options forwarded by the CLI / API caller. */
  extra?: Record<string, unknown>;
}
export type ImporterFn = (
  raw: unknown,
  options?: ImporterOptions,
) => Promise<ProjectTransfer> | ProjectTransfer;
export interface ImporterRegistration {
  format: string;
  fn: ImporterFn;
}

export type ExporterFn = (
  transfer: ProjectTransfer,
) => Promise<Uint8Array> | Uint8Array;
export interface ExporterRegistration {
  format: string;
  fn: ExporterFn;
}

/**
 * §10.1 trust tiers — a plugin's tier governs default activation state.
 */
export type TrustTier = "core" | "verified" | "community" | "unknown";

/**
 * §6.4 lifecycle states.
 */
export type LifecycleState =
  | "discovered"
  | "rejected"
  | "registered"
  | "active"
  | "disabled"
  | "quarantined";

export interface PluginEntryModule {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): void | Promise<void>;
  /** Optional lifecycle hooks per §4.4. */
  onInstall?(ctx: PluginContext): void | Promise<void>;
  onEnable?(ctx: PluginContext): void | Promise<void>;
  onDisable?(ctx: PluginContext): void | Promise<void>;
  onUninstall?(ctx: PluginContext): void | Promise<void>;
}

/**
 * Source of a plugin (filesystem path or built-in symbolic id).
 */
export type PluginSource =
  | { kind: "filesystem"; root: string; manifestPath: string; builtin?: boolean }
  | { kind: "builtin"; id: string };
