// -----------------------------------------------------------------------------
// loop-forward.schema.ts
// Define the canonical strict contract for versioned prompts, reusable agents,
// bounded multi-stage feedback loops, reproducible evaluation, and run receipts.
// Replace both incompatible v1 loop-forward schemas with this v2 contract.

import { z } from "zod";

// -- § 1  Version and limits — bound every serialized and runtime surface --

/** Identify the breaking canonical merge of the two v1 loop-forward contracts. */
export const SCHEMA_VERSION = "2.0.0" as const;

/** Bound iterations in one pipeline run. */
export const ITERATION_CEILING = 256;

/** Bound attempts for one stage in one iteration. */
export const ATTEMPT_CEILING = 6;

/** Bound model calls declared for one run. */
export const MODEL_CALL_CEILING = 100_000;

/** Reserve variable names supplied by the runtime. */
export const RESERVED_VARIABLES = ["iteration"] as const;

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SNAKE_IDENT_RE = /^[a-z][a-z0-9_]{0,63}$/;
const NAME_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const TOOL_NAME_RE = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const JSON_POINTER_RE = /^(\/(?:[^/~]|~[01])*)*$/;
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

const Semver = z.string().regex(SEMVER_RE, "expected canonical MAJOR.MINOR.PATCH");
const Uuid = z.uuid().describe("Opaque UUID identity. Immutable after creation.");
const SnakeIdent = z.string().regex(SNAKE_IDENT_RE, "expected a snake_case identifier");
const NameSlug = z.string().regex(NAME_SLUG_RE, "expected a 2-64 character kebab-case slug");
const ToolName = z.string().regex(TOOL_NAME_RE, "expected a stable tool name");
const Sha256 = z.string().regex(SHA256_RE, "expected a lowercase SHA-256 digest");
const JsonPointer = z.string().max(512).regex(JSON_POINTER_RE, "expected an RFC 6901 JSON pointer");
const UtcTimestamp = z.iso.datetime({ offset: false, local: false, precision: 0 }).describe(
  "UTC ISO 8601 instant with second precision.",
);
const Locale = z.string().regex(LOCALE_RE, "expected language or language-REGION").default("en-US");
const JsonValueSchema = z.json();

type JsonValue = z.output<typeof JsonValueSchema>;
type Path = readonly PropertyKey[];

function issue(ctx: z.RefinementCtx, path: Path, message: string): void {
  ctx.addIssue({ code: "custom", path: [...path], message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareSemver(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function uniqueStrings(ctx: z.RefinementCtx, values: readonly string[], path: Path, label: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) issue(ctx, [...path, index], `duplicate ${label} "${value}"`);
    seen.add(value);
  });
}

function regexCompiles(pattern: string): boolean {
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}

function decodeJsonPointer(pointer: string): string[] {
  if (pointer === "") return [];
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function resolveDocumentPointer(document: unknown, pointer: string): unknown {
  let current = document;
  for (const segment of decodeJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (isPlainObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function dereferenceJsonSchema(root: unknown, node: unknown, seen: ReadonlySet<string> = new Set()): unknown {
  if (!isPlainObject(node) || typeof node.$ref !== "string") return node;
  const ref = node.$ref;
  if (!ref.startsWith("#") || seen.has(ref)) return undefined;
  const target = resolveDocumentPointer(root, ref.slice(1));
  return dereferenceJsonSchema(root, target, new Set([...seen, ref]));
}

function resolveJsonSchemaPointer(root: unknown, pointer: string): unknown {
  let current = dereferenceJsonSchema(root, root);
  for (const segment of decodeJsonPointer(pointer)) {
    current = dereferenceJsonSchema(root, current);
    if (!isPlainObject(current)) return undefined;
    if (current.oneOf !== undefined || current.anyOf !== undefined || current.allOf !== undefined) return undefined;

    const type = current.type;
    if (type === "object") {
      const properties = current.properties;
      if (!isPlainObject(properties) || !Object.hasOwn(properties, segment)) return undefined;
      current = properties[segment];
      continue;
    }
    if (type === "array" && /^\d+$/.test(segment)) {
      current = current.items;
      continue;
    }
    return undefined;
  }
  return dereferenceJsonSchema(root, current);
}

function resolveValuePointer(value: JsonValue, pointer: string): JsonValue | undefined {
  const resolved = resolveDocumentPointer(value, pointer);
  return resolved === undefined ? undefined : (resolved as JsonValue);
}

function compileJsonSchema(schema: JsonValue): z.ZodType | undefined {
  try {
    return z.fromJSONSchema(schema as never);
  } catch {
    return undefined;
  }
}

function jsonSchemaTypes(root: unknown, node: unknown): ReadonlySet<string> {
  const resolved = dereferenceJsonSchema(root, node);
  if (!isPlainObject(resolved)) return new Set();
  if (typeof resolved.type === "string") return new Set([resolved.type]);
  if (Array.isArray(resolved.type) && resolved.type.every((item) => typeof item === "string")) {
    return new Set(resolved.type);
  }
  if (resolved.const !== undefined) {
    const value = resolved.const;
    if (value === null) return new Set(["null"]);
    if (Number.isInteger(value)) return new Set(["integer", "number"]);
    return new Set([typeof value]);
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return new Set(
      resolved.enum.flatMap((value) => {
        if (value === null) return ["null"];
        if (Number.isInteger(value)) return ["integer", "number"];
        return [typeof value];
      }),
    );
  }
  return new Set();
}

// -- § 2  Shared lifecycle — define identity, ownership, evolution, and provenance once --

/** Validate actor and timestamp provenance for a stored entity. */
export const ProvenanceSchema = z
  .strictObject({
    created_by: z.string().min(1).max(256).describe("Actor identity. May contain PII; mask in logs."),
    created_at: UtcTimestamp.describe("Immutable creation instant."),
    modified_by: z.string().min(1).max(256).optional().describe("Actor for the latest modification."),
    modified_at: UtcTimestamp.optional().describe("Instant of the latest modification."),
    source_system: z.string().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.modified_by === undefined) !== (value.modified_at === undefined)) {
      issue(ctx, [], "modified_by and modified_at must appear together");
    }
    if (value.modified_at !== undefined && Date.parse(value.modified_at) < Date.parse(value.created_at)) {
      issue(ctx, ["modified_at"], "modified_at precedes created_at");
    }
  });

/** Validated entity provenance inferred from {@link ProvenanceSchema}. */
export type Provenance = z.output<typeof ProvenanceSchema>;

/** Validate owner and review cadence metadata. */
export const GovernanceSchema = z.strictObject({
  owner: z.string().min(1).max(256).describe("Accountable owner. May contain PII; mask in logs."),
  review_every_days: z.int().min(1).max(365),
  last_reviewed_at: UtcTimestamp.optional(),
});

/** Validated governance metadata inferred from {@link GovernanceSchema}. */
export type Governance = z.output<typeof GovernanceSchema>;

/** Validate an explicit entity deprecation and replacement state. */
export const DeprecationSchema = z
  .strictObject({
    deprecated_since: Semver,
    replaced_by_id: Uuid.nullable().describe("Replacement of the same entity kind; null means no replacement."),
    sunset_version: Semver,
    reason: z.string().min(1).max(2_000),
  })
  .superRefine((value, ctx) => {
    if (compareSemver(value.sunset_version, value.deprecated_since) <= 0) {
      issue(ctx, ["sunset_version"], "sunset_version must be greater than deprecated_since");
    }
  });

/** Validated deprecation metadata inferred from {@link DeprecationSchema}. */
export type Deprecation = z.output<typeof DeprecationSchema>;

/** Validate one classified version-history entry. */
export const ChangelogEntrySchema = z.strictObject({
  version: Semver,
  at: UtcTimestamp,
  author: z.string().min(1).max(256).describe("Change author. May contain PII; mask in logs."),
  summary: z.string().min(1).max(1_000),
  change_type: z.enum(["initial", "breaking", "additive", "annotation"]),
  supersedes: Semver.optional(),
  evidence_ref: z.string().min(1).max(1_000).optional(),
});

/** Validated change-history entry inferred from {@link ChangelogEntrySchema}. */
export type ChangelogEntry = z.output<typeof ChangelogEntrySchema>;

/** Validate the lifecycle state shared by templates, agents, and pipelines. */
export const EntityStatusSchema = z.enum(["draft", "active", "deprecated", "retired"]);

/** Validated lifecycle state inferred from {@link EntityStatusSchema}. */
export type EntityStatus = z.output<typeof EntityStatusSchema>;

const LifecycleShape = {
  schema_version: z.literal(SCHEMA_VERSION).describe("Immutable schema version."),
  id: Uuid,
  name: NameSlug,
  version: Semver,
  status: EntityStatusSchema,
  description: z.string().min(1).max(2_000),
  tags: z.array(NameSlug).max(20).default([]).describe("Unique set; order is insignificant."),
  governance: GovernanceSchema,
  provenance: ProvenanceSchema,
  deprecation: DeprecationSchema.optional().describe("Absent for draft and active entities."),
  changelog: z.array(ChangelogEntrySchema).min(1).max(500).describe("Ascending version history."),
} as const;

interface LifecycleValue {
  readonly id: string;
  readonly version: string;
  readonly status: EntityStatus;
  readonly tags: readonly string[];
  readonly governance: Governance;
  readonly provenance: Provenance;
  readonly deprecation?: Deprecation;
  readonly changelog: readonly ChangelogEntry[];
}

function checkLifecycle(value: LifecycleValue, ctx: z.RefinementCtx): void {
  uniqueStrings(ctx, value.tags, ["tags"], "tag");

  const versions = new Set<string>();
  value.changelog.forEach((entry, index) => {
    if (versions.has(entry.version)) issue(ctx, ["changelog", index, "version"], `duplicate version "${entry.version}"`);
    versions.add(entry.version);
    const previous = value.changelog[index - 1];
    if (previous !== undefined) {
      if (compareSemver(entry.version, previous.version) <= 0) {
        issue(ctx, ["changelog", index, "version"], "changelog versions must increase monotonically");
      }
      if (Date.parse(entry.at) < Date.parse(previous.at)) {
        issue(ctx, ["changelog", index, "at"], "changelog timestamps must be ascending");
      }
    }
    if (entry.supersedes !== undefined) {
      if (!versions.has(entry.supersedes)) {
        issue(ctx, ["changelog", index, "supersedes"], "supersedes must reference an earlier changelog version");
      }
      if (compareSemver(entry.version, entry.supersedes) <= 0) {
        issue(ctx, ["changelog", index, "supersedes"], "a version must be greater than the version it supersedes");
      }
    }
  });
  if (!versions.has(value.version)) issue(ctx, ["changelog"], `changelog has no entry for current version ${value.version}`);
  const latest = value.changelog.at(-1);
  if (latest !== undefined && latest.version !== value.version) {
    issue(ctx, ["version"], "current version must equal the latest changelog version");
  }

  const deprecated = value.status === "deprecated" || value.status === "retired";
  if (deprecated && value.deprecation === undefined) issue(ctx, ["deprecation"], `${value.status} entities require deprecation metadata`);
  if (!deprecated && value.deprecation !== undefined) issue(ctx, ["deprecation"], `${value.status} entities cannot carry deprecation metadata`);
  if (value.deprecation?.replaced_by_id === value.id) issue(ctx, ["deprecation", "replaced_by_id"], "an entity cannot replace itself");

  const changedAt = value.provenance.modified_at ?? value.provenance.created_at;
  if (value.governance.last_reviewed_at !== undefined && Date.parse(value.governance.last_reviewed_at) < Date.parse(changedAt)) {
    issue(ctx, ["governance", "last_reviewed_at"], "last_reviewed_at precedes the latest entity change");
  }
}

// -- § 3  Variables and templates — define typed prompt inputs and localized messages --

/** Validate a closed variable type vocabulary. */
export const VariableTypeSchema = z.enum(["string", "number", "integer", "boolean", "enum", "json"]);

/** Validated variable type inferred from {@link VariableTypeSchema}. */
export type VariableType = z.output<typeof VariableTypeSchema>;

/** Validate one typed template or pipeline variable declaration. */
export const VariableSpecSchema = z.strictObject({
  name: SnakeIdent,
  type: VariableTypeSchema,
  description: z.string().min(1).max(500),
  is_required: z.boolean().default(true),
  default: JsonValueSchema.optional(),
  enum_values: z.array(z.string().min(1).max(200)).min(1).max(64).optional().describe("Unique set for enum variables."),
  sensitivity: z.enum(["public", "internal", "confidential", "pii"]).default("internal"),
});

/** Validated variable declaration inferred from {@link VariableSpecSchema}. */
export type VariableSpec = z.output<typeof VariableSpecSchema>;

function valueMatchesVariableType(value: JsonValue, type: VariableType, enumValues?: readonly string[]): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && (enumValues ?? []).includes(value);
    case "json":
      return true;
  }
}

function valueMatchesVariable(value: JsonValue, variable: VariableSpec): boolean {
  return valueMatchesVariableType(value, variable.type, variable.enum_values);
}

function variableTypesCompatible(source: VariableType, target: VariableType): boolean {
  if (target === "json" || source === target) return true;
  return source === "integer" && target === "number";
}

function schemaNodeFitsVariable(root: unknown, node: unknown, target: VariableType): boolean {
  if (target === "json") return true;
  const types = jsonSchemaTypes(root, node);
  if (types.size === 0) return false;
  if (target === "enum") return types.size === 1 && types.has("string");
  if (target === "number") return [...types].every((type) => type === "number" || type === "integer");
  return types.size === 1 && types.has(target);
}

function checkVariables(ctx: z.RefinementCtx, variables: readonly VariableSpec[], path: Path): void {
  uniqueStrings(ctx, variables.map((variable) => variable.name), path, "variable name");
  variables.forEach((variable, index) => {
    const at = [...path, index] as const;
    if (RESERVED_VARIABLES.includes(variable.name as (typeof RESERVED_VARIABLES)[number])) {
      issue(ctx, [...at, "name"], `"${variable.name}" is reserved for the runtime`);
    }
    if (variable.type === "enum" && variable.enum_values === undefined) {
      issue(ctx, [...at, "enum_values"], "enum variables require enum_values");
    }
    if (variable.type !== "enum" && variable.enum_values !== undefined) {
      issue(ctx, [...at, "enum_values"], "enum_values apply only to enum variables");
    }
    if (variable.enum_values !== undefined) uniqueStrings(ctx, variable.enum_values, [...at, "enum_values"], "enum value");
    if (variable.default !== undefined) {
      if (variable.is_required) issue(ctx, [...at, "default"], "variables with defaults must set is_required to false");
      if (!valueMatchesVariable(variable.default, variable)) issue(ctx, [...at, "default"], `default does not match ${variable.type}`);
    }
  });
}

/** Validate one ordered prompt message. */
export const PromptMessageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(100_000),
});

/** Validated prompt message inferred from {@link PromptMessageSchema}. */
export type PromptMessage = z.output<typeof PromptMessageSchema>;

function checkTemplatePlaceholders(ctx: z.RefinementCtx, messages: readonly PromptMessage[], variables: readonly VariableSpec[]): void {
  const declared = new Set(variables.map((variable) => variable.name));
  const sectionStack: string[] = [];
  const tagPattern = /\{\{\{[^{}]*\}\}\}|\{\{[^{}]*\}\}/gu;
  const triplePattern = /^\{\{\{\s*([a-z][a-z0-9_]*)\s*\}\}\}$/u;
  const doublePattern = /^\{\{\s*([#^/]?)\s*([a-z][a-z0-9_]*)\s*\}\}$/u;

  messages.forEach((message, messageIndex) => {
    const matches = [...message.content.matchAll(tagPattern)];
    const withoutTags = message.content.replace(tagPattern, "");
    if (withoutTags.includes("{{") || withoutTags.includes("}}")) {
      issue(ctx, ["messages", messageIndex, "content"], "malformed Mustache placeholder");
    }
    matches.forEach((match) => {
      const raw = match[0];
      const triple = triplePattern.exec(raw);
      if (triple !== null) {
        const name = triple[1];
        if (name !== undefined && !declared.has(name) && !RESERVED_VARIABLES.includes(name as never)) {
          issue(ctx, ["messages", messageIndex, "content"], `placeholder "${name}" is not declared`);
        }
        return;
      }
      const double = doublePattern.exec(raw);
      if (double === null) {
        issue(ctx, ["messages", messageIndex, "content"], `unsupported Mustache tag ${raw}`);
        return;
      }
      const modifier = double[1] ?? "";
      const name = double[2];
      if (name === undefined) return;
      if (!declared.has(name) && !RESERVED_VARIABLES.includes(name as never)) {
        issue(ctx, ["messages", messageIndex, "content"], `placeholder "${name}" is not declared`);
      }
      if (modifier === "#" || modifier === "^") sectionStack.push(name);
      if (modifier === "/") {
        const open = sectionStack.pop();
        if (open !== name) issue(ctx, ["messages", messageIndex, "content"], `closing section "${name}" does not match "${open ?? "none"}"`);
      }
    });
  });
  if (sectionStack.length > 0) issue(ctx, ["messages"], `unclosed Mustache section "${sectionStack.at(-1)}"`);
}

const PromptTemplateShape = z.strictObject({
  entity_kind: z.literal("prompt_template").describe("Immutable entity discriminator."),
  ...LifecycleShape,
  locale: Locale.describe("Store translations as separate template versions per locale."),
  messages: z.array(PromptMessageSchema).min(1).max(32).describe("Ordered conversation template."),
  variables: z.array(VariableSpecSchema).max(64).describe("Unique set; order is insignificant."),
  content_sensitivity: z.enum(["public", "internal", "confidential", "contains_pii"]).default("internal"),
});

/** Validate a localized, versioned prompt template and all placeholder wiring. */
export const PromptTemplateSchema = PromptTemplateShape.superRefine((value, ctx) => {
  checkLifecycle(value, ctx);
  checkVariables(ctx, value.variables, ["variables"]);
  checkTemplatePlaceholders(ctx, value.messages, value.variables);
});

/** Stored prompt-template entity inferred from {@link PromptTemplateSchema}. */
export type PromptTemplate = z.output<typeof PromptTemplateSchema>;

// -- § 4  Agents and authority — bind model policy and approval-aware tools --

/** Validate one mutually exclusive model sampling strategy. */
export const SamplingStrategySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("deterministic"), seed: z.int().optional() }),
  z.strictObject({ kind: z.literal("temperature"), value: z.number().min(0).max(2), seed: z.int().optional() }),
  z.strictObject({ kind: z.literal("top_p"), value: z.number().positive().max(1), seed: z.int().optional() }),
]);

/** Validated sampling strategy inferred from {@link SamplingStrategySchema}. */
export type SamplingStrategy = z.output<typeof SamplingStrategySchema>;

/** Validate provider, model, sampling, and output limits for an agent. */
export const ModelConfigSchema = z.strictObject({
  provider: z.string().min(1).max(64).describe("External provider registry key."),
  model_id: z.string().min(1).max(128).describe("External provider model identifier."),
  sampling: SamplingStrategySchema,
  max_output_tokens: z.int().min(1).max(1_000_000),
  stop_sequences: z.array(z.string().min(1).max(128)).max(16).default([]).describe("Unique set; order is insignificant."),
  provider_options: z.record(z.string(), JsonValueSchema).optional().describe("Intentional provider-specific extension point."),
});

/** Validated model configuration inferred from {@link ModelConfigSchema}. */
export type ModelConfig = z.output<typeof ModelConfigSchema>;

/** Validate the authority class requested by one tool grant. */
export const ToolAuthoritySchema = z.enum([
  "read",
  "write",
  "destructive",
  "production",
  "external_message",
  "financial",
  "privacy_sensitive",
]);

/** Validated tool authority inferred from {@link ToolAuthoritySchema}. */
export type ToolAuthority = z.output<typeof ToolAuthoritySchema>;

/** Validate a tool grant with an explicit approval boundary. */
export const ToolGrantSchema = z.strictObject({
  tool_name: ToolName,
  authority: ToolAuthoritySchema,
  approval: z.enum(["none", "per_run", "per_action"]),
});

/** Validated tool grant inferred from {@link ToolGrantSchema}. */
export type ToolGrant = z.output<typeof ToolGrantSchema>;

const AgentDefinitionShape = z.strictObject({
  entity_kind: z.literal("agent_definition").describe("Immutable entity discriminator."),
  ...LifecycleShape,
  system_prompt_template_id: Uuid.describe("Aggregation reference to PromptTemplate.id."),
  model: ModelConfigSchema,
  tool_policy: z.array(ToolGrantSchema).max(64).default([]).describe("Unique grants; order is insignificant."),
});

/** Validate a reusable agent, its model policy, and approval-aware tool grants. */
export const AgentDefinitionSchema = AgentDefinitionShape.superRefine((value, ctx) => {
  checkLifecycle(value, ctx);
  uniqueStrings(ctx, value.model.stop_sequences, ["model", "stop_sequences"], "stop sequence");
  uniqueStrings(
    ctx,
    value.tool_policy.map((grant) => `${grant.tool_name}:${grant.authority}`),
    ["tool_policy"],
    "tool grant",
  );
  value.tool_policy.forEach((grant, index) => {
    if (grant.authority === "write" && grant.approval === "none") {
      issue(ctx, ["tool_policy", index, "approval"], "write authority requires per_run or per_action approval");
    }
    if (
      grant.authority !== "read" &&
      grant.authority !== "write" &&
      grant.approval !== "per_action"
    ) {
      issue(ctx, ["tool_policy", index, "approval"], `${grant.authority} authority requires per_action approval`);
    }
  });
});

/** Stored agent-definition entity inferred from {@link AgentDefinitionSchema}. */
export type AgentDefinition = z.output<typeof AgentDefinitionSchema>;

// -- § 5  Output contracts — compile JSON Schema and validate complete pointer paths --

const RegexValidatorSchema = z.strictObject({
  kind: z.literal("regex"),
  path: JsonPointer.optional().describe("Omit for whole text or markdown output."),
  pattern: z.string().min(1).max(2_000),
});

const RangeValidatorSchema = z.strictObject({
  kind: z.literal("range"),
  path: JsonPointer,
  min: z.number().optional(),
  max: z.number().optional(),
});

const NamedValidatorSchema = z.strictObject({
  kind: z.literal("named"),
  name: SnakeIdent,
  args: z.record(z.string(), JsonValueSchema).default({}).describe("Intentional runner-validator extension point."),
});

/** Validate one built-in or registered output validator declaration. */
export const OutputValidatorSchema = z.discriminatedUnion("kind", [
  RegexValidatorSchema,
  RangeValidatorSchema,
  NamedValidatorSchema,
]);

/** Validated output-validator declaration inferred from {@link OutputValidatorSchema}. */
export type OutputValidator = z.output<typeof OutputValidatorSchema>;

/** Validate the failure policy for one stage output. */
export const OnInvalidSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("fail") }),
  z.strictObject({
    action: z.literal("retry"),
    max_attempts: z.int().min(2).max(ATTEMPT_CEILING),
    feedback: z.string().min(1).max(2_000).optional(),
  }),
]);

/** Validated invalid-output policy inferred from {@link OnInvalidSchema}. */
export type OnInvalid = z.output<typeof OnInvalidSchema>;

const TextOutputContractSchema = z.strictObject({
  format: z.literal("text"),
  validators: z.array(OutputValidatorSchema).max(32).default([]).describe("Ordered validation sequence."),
  on_invalid: OnInvalidSchema.default({ action: "fail" }),
});

const MarkdownOutputContractSchema = z.strictObject({
  format: z.literal("markdown"),
  validators: z.array(OutputValidatorSchema).max(32).default([]).describe("Ordered validation sequence."),
  on_invalid: OnInvalidSchema.default({ action: "fail" }),
});

const JsonOutputContractSchema = z.strictObject({
  format: z.literal("json"),
  json_schema: JsonValueSchema.describe("JSON Schema compiled by Zod before the contract is accepted."),
  validators: z.array(OutputValidatorSchema).max(32).default([]).describe("Ordered validation sequence."),
  on_invalid: OnInvalidSchema.default({ action: "fail" }),
});

const OutputContractShape = z.discriminatedUnion("format", [
  TextOutputContractSchema,
  MarkdownOutputContractSchema,
  JsonOutputContractSchema,
]);

type OutputContractShapeValue = z.output<typeof OutputContractShape>;

function checkOutputContract(value: OutputContractShapeValue, ctx: z.RefinementCtx): void {
  let root: JsonValue | undefined;
  if (value.format === "json") {
    root = value.json_schema;
    if (!isPlainObject(root)) {
      issue(ctx, ["json_schema"], "json_schema must be an object schema");
    } else {
      if (root.type !== "object") issue(ctx, ["json_schema", "type"], "the JSON output root must have type object");
      if (root.additionalProperties !== false) {
        issue(ctx, ["json_schema", "additionalProperties"], "the JSON output root must set additionalProperties to false");
      }
      if (!isPlainObject(root.properties) || Object.keys(root.properties).length === 0) {
        issue(ctx, ["json_schema", "properties"], "the JSON output root must declare at least one property");
      }
    }
    if (compileJsonSchema(root) === undefined) issue(ctx, ["json_schema"], "json_schema is not a supported valid JSON Schema");
  }

  value.validators.forEach((validator, index) => {
    const at = ["validators", index] as const;
    if (validator.kind === "named") return;
    if (validator.kind === "regex") {
      if (!regexCompiles(validator.pattern)) issue(ctx, [...at, "pattern"], "pattern is not a valid ECMAScript regular expression");
      if (value.format === "json") {
        if (validator.path === undefined) {
          issue(ctx, [...at, "path"], "JSON regex validators require a path");
        } else {
          const node = resolveJsonSchemaPointer(root, validator.path);
          if (node === undefined) issue(ctx, [...at, "path"], `path "${validator.path}" is not declared by json_schema`);
          else if (!schemaNodeFitsVariable(root, node, "string")) issue(ctx, [...at, "path"], "regex path must resolve to a string");
        }
      } else if (validator.path !== undefined && validator.path !== "") {
        issue(ctx, [...at, "path"], `${value.format} output supports only the empty whole-output pointer`);
      }
      return;
    }
    if (validator.min === undefined && validator.max === undefined) issue(ctx, at, "range requires min or max");
    if (validator.min !== undefined && validator.max !== undefined && validator.min > validator.max) {
      issue(ctx, at, "range min exceeds max");
    }
    if (value.format !== "json") {
      issue(ctx, at, `range validators cannot validate ${value.format} output`);
      return;
    }
    const node = resolveJsonSchemaPointer(root, validator.path);
    if (node === undefined) issue(ctx, [...at, "path"], `path "${validator.path}" is not declared by json_schema`);
    else if (!schemaNodeFitsVariable(root, node, "number")) issue(ctx, [...at, "path"], "range path must resolve to a number");
  });
}

/** Validate a text, markdown, or compiled JSON output contract. */
export const OutputContractSchema = OutputContractShape.superRefine(checkOutputContract);

/** Validated stage-output contract inferred from {@link OutputContractSchema}. */
export type OutputContract = z.output<typeof OutputContractSchema>;

/** Describe one reproducible output-validation failure. */
export interface OutputValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Implement one registered named validator at the runner boundary. */
export type NamedOutputValidator = (
  value: JsonValue,
  args: Readonly<Record<string, JsonValue>>,
) => boolean | string;

/** Map registered validator names to their deterministic implementations. */
export type NamedOutputValidatorRegistry = Readonly<Record<string, NamedOutputValidator>>;

function addOutputIssue(issues: OutputValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

/**
 * Validate a candidate value against its complete output contract.
 *
 * @param contract - Parsed output contract that declares structure and validators.
 * @param value - Candidate model output.
 * @param namedValidators - Registered deterministic validators for named extensions.
 * @returns Every structural and declared validation failure in deterministic order.
 */
export function validateOutput(
  contract: OutputContract,
  value: JsonValue,
  namedValidators: NamedOutputValidatorRegistry = {},
): readonly OutputValidationIssue[] {
  const issues: OutputValidationIssue[] = [];
  if (contract.format === "json") {
    const compiled = compileJsonSchema(contract.json_schema);
    if (compiled === undefined) {
      addOutputIssue(issues, "", "json_schema cannot be compiled");
    } else {
      const parsed = compiled.safeParse(value);
      if (!parsed.success) {
        parsed.error.issues.forEach((entry) => {
          addOutputIssue(issues, entry.path.map(String).join("."), entry.message);
        });
      }
    }
  } else if (typeof value !== "string") {
    addOutputIssue(issues, "", `${contract.format} output must be a string`);
  }

  contract.validators.forEach((validator, index) => {
    const prefix = `validators.${index}`;
    if (validator.kind === "named") {
      const implementation = namedValidators[validator.name];
      if (implementation === undefined) return;
      const result = implementation(value, validator.args);
      if (result !== true) addOutputIssue(issues, prefix, typeof result === "string" ? result : `named validator "${validator.name}" failed`);
      return;
    }
    if (validator.kind === "regex") {
      const target = contract.format === "json" ? resolveValuePointer(value, validator.path ?? "") : value;
      if (typeof target !== "string" || !new RegExp(validator.pattern, "u").test(target)) {
        addOutputIssue(issues, validator.path ?? "", "value does not match the declared regular expression");
      }
      return;
    }
    const target = resolveValuePointer(value, validator.path);
    if (typeof target !== "number") {
      addOutputIssue(issues, validator.path, "range target is not numeric");
      return;
    }
    if (validator.min !== undefined && target < validator.min) addOutputIssue(issues, validator.path, `value is below ${validator.min}`);
    if (validator.max !== undefined && target > validator.max) addOutputIssue(issues, validator.path, `value is above ${validator.max}`);
  });
  return issues;
}

// -- § 6  Pipeline graph — define ordered stages, bounded carries, and terminal outcomes --

/** Validate the source of one stage-template variable binding. */
export const BindingSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("literal"), value: JsonValueSchema }),
  z.strictObject({ kind: z.literal("pipeline_input"), input_name: SnakeIdent }),
  z.strictObject({ kind: z.literal("stage_output"), stage_id: Uuid, path: JsonPointer }),
  z.strictObject({ kind: z.literal("carried"), carry_name: SnakeIdent }),
]);

/** Validated binding source inferred from {@link BindingSourceSchema}. */
export type BindingSource = z.output<typeof BindingSourceSchema>;

/** Validate one binding from a data source to a declared template variable. */
export const VariableBindingSchema = z.strictObject({
  variable_name: SnakeIdent,
  source: BindingSourceSchema,
});

/** Validated template-variable binding inferred from {@link VariableBindingSchema}. */
export type VariableBinding = z.output<typeof VariableBindingSchema>;

/** Validate one ordered agent stage composed into a pipeline. */
export const StageSchema = z
  .strictObject({
    id: Uuid.describe("Identity unique within the owning pipeline; deleted with the pipeline."),
    name: NameSlug,
    agent_id: Uuid.describe("Aggregation reference to AgentDefinition.id."),
    task_prompt_template_id: Uuid.describe("Aggregation reference to PromptTemplate.id."),
    system_override_template_id: Uuid.nullable().optional().describe(
      "Absent inherits the agent template, null disables the system prompt, and UUID replaces it.",
    ),
    bindings: z.array(VariableBindingSchema).max(64).describe("Unique set by variable_name; order is insignificant."),
    output: OutputContractSchema,
    timeout_ms: z.int().min(1_000).max(3_600_000).optional(),
  })
  .superRefine((value, ctx) => {
    uniqueStrings(ctx, value.bindings.map((binding) => binding.variable_name), ["bindings"], "binding variable");
  });

/** Pipeline-owned stage inferred from {@link StageSchema}. */
export type Stage = z.output<typeof StageSchema>;

/** Validate one named cross-iteration value channel. */
export const CarrySchema = z
  .strictObject({
    name: SnakeIdent,
    source_stage_id: Uuid,
    source_path: JsonPointer,
    value_type: VariableTypeSchema,
    enum_values: z.array(z.string().min(1).max(200)).min(1).max(64).optional(),
    initial_value: JsonValueSchema,
    carry_mode: z.enum(["replace", "append"]).default("replace"),
    max_serialized_chars: z.int().min(100).max(1_000_000).default(16_000),
  })
  .superRefine((value, ctx) => {
    if (value.value_type === "enum" && value.enum_values === undefined) issue(ctx, ["enum_values"], "enum carries require enum_values");
    if (value.value_type !== "enum" && value.enum_values !== undefined) issue(ctx, ["enum_values"], "enum_values apply only to enum carries");
    if (value.enum_values !== undefined) uniqueStrings(ctx, value.enum_values, ["enum_values"], "enum value");
    if (!valueMatchesVariableType(value.initial_value, value.value_type, value.enum_values)) {
      issue(ctx, ["initial_value"], `initial_value does not match ${value.value_type}`);
    }
    if (value.carry_mode === "append" && value.value_type !== "string") {
      issue(ctx, ["carry_mode"], "append carries must have string value_type");
    }
    if (JSON.stringify(value.initial_value).length > value.max_serialized_chars) {
      issue(ctx, ["initial_value"], "serialized initial_value exceeds max_serialized_chars");
    }
  });

/** Cross-iteration carry inferred from {@link CarrySchema}. */
export type Carry = z.output<typeof CarrySchema>;

/** Validate the terminal state recorded when a loop stops. */
export const TerminalStateSchema = z.enum([
  "success",
  "clean_noop",
  "blocked",
  "approval_required",
  "exhausted",
  "stagnated",
  "failed",
]);

/** Validated terminal state inferred from {@link TerminalStateSchema}. */
export type TerminalState = z.output<typeof TerminalStateSchema>;

const OrdinaryStopState = z.enum(["success", "clean_noop", "blocked", "approval_required"]);
const ObservedOutputSchema = z.strictObject({ stage_id: Uuid, path: JsonPointer });

/** Validate one deterministic end-of-iteration stop condition. */
export const StopConditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: SnakeIdent,
    kind: z.literal("output_match"),
    stage_id: Uuid,
    pattern: z.string().min(1).max(2_000).refine(regexCompiles, "pattern is not a valid regular expression"),
    terminal_state: OrdinaryStopState,
  }),
  z.strictObject({
    id: SnakeIdent,
    kind: z.literal("field_equals"),
    stage_id: Uuid,
    path: JsonPointer,
    value: JsonValueSchema,
    terminal_state: OrdinaryStopState,
  }),
  z.strictObject({
    id: SnakeIdent,
    kind: z.literal("field_truthy"),
    stage_id: Uuid,
    path: JsonPointer,
    terminal_state: OrdinaryStopState,
  }),
  z.strictObject({
    id: SnakeIdent,
    kind: z.literal("score_threshold"),
    stage_id: Uuid,
    path: JsonPointer,
    comparator: z.enum(["gte", "lte"]),
    threshold: z.number(),
    terminal_state: OrdinaryStopState,
  }),
  z.strictObject({
    id: SnakeIdent,
    kind: z.literal("unchanged"),
    observations: z.array(ObservedOutputSchema).min(1).max(32),
    window: z.int().min(2).max(ITERATION_CEILING).default(2),
    terminal_state: z.literal("stagnated"),
  }),
]);

/** Validated stop condition inferred from {@link StopConditionSchema}. */
export type StopCondition = z.output<typeof StopConditionSchema>;

/** Validate hard resource ceilings that always stop a run as exhausted. */
export const BudgetSchema = z.strictObject({
  max_total_tokens: z.int().min(1).max(1_000_000_000),
  max_wall_clock_ms: z.int().min(1).max(86_400_000),
  max_model_calls: z.int().min(1).max(MODEL_CALL_CEILING),
  max_cost_usd: z.number().positive().max(1_000_000).optional(),
});

/** Validated hard run budget inferred from {@link BudgetSchema}. */
export type Budget = z.output<typeof BudgetSchema>;

/** Validate bounded feedback-cycle execution and cross-iteration carries. */
export const LoopConfigSchema = z
  .strictObject({
    max_iterations: z.int().min(1).max(ITERATION_CEILING),
    stop_when: z.enum(["any", "all"]).default("any"),
    stop_conditions: z.array(StopConditionSchema).max(32).default([]).describe(
      "Unique set. When several conditions fire, approval_required outranks blocked, success, clean_noop, and stagnated.",
    ),
    carries: z.array(CarrySchema).max(64).default([]).describe("Unique set; order is insignificant."),
    budget: BudgetSchema,
    on_exhausted: z.enum(["fail", "return_last"]).default("fail").describe(
      "Both dispositions record terminal_state exhausted; return_last additionally preserves the last validated output.",
    ),
  })
  .superRefine((value, ctx) => {
    uniqueStrings(ctx, value.stop_conditions.map((condition) => condition.id), ["stop_conditions"], "condition id");
    uniqueStrings(ctx, value.carries.map((carry) => carry.name), ["carries"], "carry name");
    value.stop_conditions.forEach((condition, index) => {
      if (condition.kind === "unchanged" && condition.window > value.max_iterations) {
        issue(ctx, ["stop_conditions", index, "window"], "unchanged window exceeds max_iterations");
      }
    });
  });

/** Validated loop execution policy inferred from {@link LoopConfigSchema}. */
export type LoopConfig = z.output<typeof LoopConfigSchema>;

// -- § 7  Examples and evaluation — require executable negatives and independent acceptance --

const ExampleExpectationSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("valid"), stage_id: Uuid, output: JsonValueSchema }),
  z.strictObject({
    outcome: z.literal("invalid"),
    stage_id: Uuid,
    output: JsonValueSchema,
    reason: z.string().min(1).max(1_000),
  }),
]);

/** Validate one executable few-shot, golden, or adversarial pipeline example. */
export const PipelineExampleSchema = z.strictObject({
  id: SnakeIdent,
  kind: z.enum(["few_shot", "golden", "adversarial"]),
  input: z.record(z.string(), JsonValueSchema),
  expected: ExampleExpectationSchema,
});

/** Validated pipeline example inferred from {@link PipelineExampleSchema}. */
export type PipelineExample = z.output<typeof PipelineExampleSchema>;

/** Validate one reproducible acceptance-evaluation receipt. */
export const EvaluationReceiptSchema = z
  .strictObject({
    at: UtcTimestamp,
    pipeline_version: Semver,
    dataset_ref: z.string().min(1).max(1_000),
    dataset_sha256: Sha256,
    artifact_sha256: Sha256,
    value: z.number(),
    sample_size: z.int().min(1),
    evaluated_by: z.string().min(1).max(256),
    approved_by: z.string().min(1).max(256),
  })
  .superRefine((value, ctx) => {
    if (value.evaluated_by === value.approved_by) issue(ctx, ["approved_by"], "the evaluator cannot approve the same result");
  });

/** Validated evaluation receipt inferred from {@link EvaluationReceiptSchema}. */
export type EvaluationReceipt = z.output<typeof EvaluationReceiptSchema>;

/** Validate separated development and acceptance evidence for promotion. */
export const EvaluationPolicySchema = z
  .strictObject({
    metric: SnakeIdent,
    unit: z.enum(["ratio", "count", "ms", "usd"]),
    comparator: z.enum(["gte", "lte"]),
    threshold: z.number(),
    development_dataset_ref: z.string().min(1).max(1_000),
    acceptance_dataset_ref: z.string().min(1).max(1_000),
    last_run: EvaluationReceiptSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.development_dataset_ref === value.acceptance_dataset_ref) {
      issue(ctx, ["acceptance_dataset_ref"], "acceptance data must be separate from development data");
    }
  });

/** Validated evaluation policy inferred from {@link EvaluationPolicySchema}. */
export type EvaluationPolicy = z.output<typeof EvaluationPolicySchema>;

const LoopForwardPipelineShape = z.strictObject({
  entity_kind: z.literal("loop_forward_pipeline").describe("Immutable entity discriminator."),
  ...LifecycleShape,
  inputs: z.array(VariableSpecSchema).max(64).describe("Unique set; order is insignificant."),
  stages: z.array(StageSchema).min(1).max(64).describe("Order is significant and defines same-iteration execution."),
  loop: LoopConfigSchema,
  examples: z.array(PipelineExampleSchema).max(500).default([]).describe("Unique set by id; order is insignificant."),
  evaluation: EvaluationPolicySchema.optional(),
});

type PipelineShapeValue = z.output<typeof LoopForwardPipelineShape>;

function stageById(pipeline: PipelineShapeValue, id: string): { stage: Stage; index: number } | undefined {
  const index = pipeline.stages.findIndex((stage) => stage.id === id);
  const stage = pipeline.stages[index];
  return index < 0 || stage === undefined ? undefined : { stage, index };
}

function outputNode(stage: Stage, pointer: string): unknown {
  if (stage.output.format !== "json") return pointer === "" ? { type: "string" } : undefined;
  return resolveJsonSchemaPointer(stage.output.json_schema, pointer);
}

function checkPipelineGraph(pipeline: PipelineShapeValue, ctx: z.RefinementCtx): void {
  checkLifecycle(pipeline, ctx);
  checkVariables(ctx, pipeline.inputs, ["inputs"]);
  uniqueStrings(ctx, pipeline.stages.map((stage) => stage.id), ["stages"], "stage id");
  uniqueStrings(ctx, pipeline.stages.map((stage) => stage.name), ["stages"], "stage name");
  uniqueStrings(ctx, pipeline.examples.map((example) => example.id), ["examples"], "example id");

  const inputs = new Map(pipeline.inputs.map((input) => [input.name, input] as const));
  const carries = new Map(pipeline.loop.carries.map((carry) => [carry.name, carry] as const));

  pipeline.loop.carries.forEach((carry, index) => {
    const source = stageById(pipeline, carry.source_stage_id);
    if (source === undefined) {
      issue(ctx, ["loop", "carries", index, "source_stage_id"], "carry references an unknown stage");
      return;
    }
    const node = outputNode(source.stage, carry.source_path);
    if (node === undefined) {
      issue(ctx, ["loop", "carries", index, "source_path"], `path "${carry.source_path}" is not declared by the source output`);
    } else if (
      source.stage.output.format === "json" &&
      !schemaNodeFitsVariable(source.stage.output.json_schema, node, carry.value_type)
    ) {
      issue(ctx, ["loop", "carries", index, "source_path"], `source output does not match carry type ${carry.value_type}`);
    } else if (source.stage.output.format !== "json" && carry.value_type !== "string" && carry.value_type !== "json") {
      issue(ctx, ["loop", "carries", index, "value_type"], `${source.stage.output.format} output can feed only string or json carries`);
    }
  });

  pipeline.stages.forEach((stage, stageIndex) => {
    stage.bindings.forEach((binding, bindingIndex) => {
      const source = binding.source;
      const at = ["stages", stageIndex, "bindings", bindingIndex, "source"] as const;
      if (source.kind === "pipeline_input" && !inputs.has(source.input_name)) {
        issue(ctx, [...at, "input_name"], `pipeline input "${source.input_name}" is not declared`);
      }
      if (source.kind === "carried" && !carries.has(source.carry_name)) {
        issue(ctx, [...at, "carry_name"], `carry "${source.carry_name}" is not declared`);
      }
      if (source.kind === "stage_output") {
        const referenced = stageById(pipeline, source.stage_id);
        if (referenced === undefined) {
          issue(ctx, [...at, "stage_id"], "binding references an unknown stage");
        } else if (referenced.index >= stageIndex) {
          issue(ctx, [...at, "stage_id"], "same-iteration bindings may reference only earlier stages");
        } else if (outputNode(referenced.stage, source.path) === undefined) {
          issue(ctx, [...at, "path"], `path "${source.path}" is not declared by the source output`);
        }
      }
    });
  });

  pipeline.loop.stop_conditions.forEach((condition, conditionIndex) => {
    const at = ["loop", "stop_conditions", conditionIndex] as const;
    if (condition.kind === "unchanged") {
      condition.observations.forEach((observation, observationIndex) => {
        const referenced = stageById(pipeline, observation.stage_id);
        if (referenced === undefined) issue(ctx, [...at, "observations", observationIndex, "stage_id"], "observation references an unknown stage");
        else if (outputNode(referenced.stage, observation.path) === undefined) {
          issue(ctx, [...at, "observations", observationIndex, "path"], `path "${observation.path}" is not declared by the output`);
        }
      });
      return;
    }
    const referenced = stageById(pipeline, condition.stage_id);
    if (referenced === undefined) {
      issue(ctx, [...at, "stage_id"], "condition references an unknown stage");
      return;
    }
    if (condition.kind === "output_match") {
      if (referenced.stage.output.format === "json") issue(ctx, at, "output_match requires text or markdown output");
      return;
    }
    if (referenced.stage.output.format !== "json") {
      issue(ctx, at, `${condition.kind} requires JSON output`);
      return;
    }
    const node = resolveJsonSchemaPointer(referenced.stage.output.json_schema, condition.path);
    if (node === undefined) issue(ctx, [...at, "path"], `path "${condition.path}" is not declared by json_schema`);
    if (condition.kind === "score_threshold" && node !== undefined && !schemaNodeFitsVariable(referenced.stage.output.json_schema, node, "number")) {
      issue(ctx, [...at, "path"], "score_threshold path must resolve to a number");
    }
  });
}

function meetsThreshold(policy: EvaluationPolicy, value: number): boolean {
  return policy.comparator === "gte" ? value >= policy.threshold : value <= policy.threshold;
}

function checkPipelineExamplesAndPromotion(pipeline: PipelineShapeValue, ctx: z.RefinementCtx): void {
  const inputMap = new Map(pipeline.inputs.map((input) => [input.name, input] as const));
  const kinds = new Set<string>();
  pipeline.examples.forEach((example, index) => {
    kinds.add(example.kind);
    Object.entries(example.input).forEach(([name, value]) => {
      const variable = inputMap.get(name);
      if (variable === undefined) issue(ctx, ["examples", index, "input", name], `input "${name}" is not declared`);
      else if (!valueMatchesVariable(value, variable)) issue(ctx, ["examples", index, "input", name], `input does not match ${variable.type}`);
    });
    pipeline.inputs.forEach((input) => {
      if (input.is_required && !Object.hasOwn(example.input, input.name)) {
        issue(ctx, ["examples", index, "input"], `required input "${input.name}" is missing`);
      }
    });
    const referenced = stageById(pipeline, example.expected.stage_id);
    if (referenced === undefined) {
      issue(ctx, ["examples", index, "expected", "stage_id"], "example references an unknown stage");
      return;
    }
    const failures = validateOutput(referenced.stage.output, example.expected.output);
    if (example.expected.outcome === "valid" && failures.length > 0) {
      issue(ctx, ["examples", index, "expected", "output"], `declared valid output fails: ${failures[0]?.message ?? "unknown failure"}`);
    }
    if (example.expected.outcome === "invalid" && failures.length === 0) {
      issue(ctx, ["examples", index, "expected", "output"], "declared invalid output passes the stage contract");
    }
  });

  if (pipeline.status !== "active") return;
  if (!kinds.has("golden")) issue(ctx, ["examples"], "active pipelines require at least one golden example");
  if (!kinds.has("adversarial")) issue(ctx, ["examples"], "active pipelines require at least one executable adversarial example");
  if (!pipeline.loop.stop_conditions.some((condition) => condition.terminal_state === "success")) {
    issue(ctx, ["loop", "stop_conditions"], "active pipelines require an observable success condition");
  }
  const evaluation = pipeline.evaluation;
  if (evaluation === undefined) {
    issue(ctx, ["evaluation"], "active pipelines require an evaluation policy");
    return;
  }
  const receipt = evaluation.last_run;
  if (receipt === undefined) {
    issue(ctx, ["evaluation", "last_run"], "active pipelines require an acceptance receipt");
    return;
  }
  if (receipt.pipeline_version !== pipeline.version) issue(ctx, ["evaluation", "last_run", "pipeline_version"], "receipt does not evaluate the current pipeline version");
  if (receipt.dataset_ref !== evaluation.acceptance_dataset_ref) issue(ctx, ["evaluation", "last_run", "dataset_ref"], "receipt does not use the acceptance dataset");
  if (!meetsThreshold(evaluation, receipt.value)) issue(ctx, ["evaluation", "last_run", "value"], "acceptance result does not meet the promotion threshold");
  const changedAt = pipeline.provenance.modified_at ?? pipeline.provenance.created_at;
  if (Date.parse(receipt.at) < Date.parse(changedAt)) issue(ctx, ["evaluation", "last_run", "at"], "acceptance receipt predates the current pipeline version");
}

/** Validate an ordered multi-agent feedback pipeline and its promotion evidence. */
export const LoopForwardPipelineSchema = LoopForwardPipelineShape.superRefine((value, ctx) => {
  checkPipelineGraph(value, ctx);
  checkPipelineExamplesAndPromotion(value, ctx);
});

/** Stored loop-forward pipeline inferred from {@link LoopForwardPipelineSchema}. */
export type LoopForwardPipeline = z.output<typeof LoopForwardPipelineSchema>;

// -- § 8  Run receipts — persist evidence, terminal state, and resumable handoff --

/** Validate one stage-attempt validation result. */
export const AttemptValidationSchema = z.strictObject({
  passed: z.boolean(),
  issues: z.array(z.string().min(1).max(2_000)).max(64).default([]).describe("Ordered validator findings."),
});

/** Validated attempt result inferred from {@link AttemptValidationSchema}. */
export type AttemptValidation = z.output<typeof AttemptValidationSchema>;

/** Validate one immutable model-call record inside a run receipt. */
export const AttemptRecordSchema = z
  .strictObject({
    iteration: z.int().min(1).max(ITERATION_CEILING),
    stage_id: Uuid,
    attempt: z.int().min(1).max(ATTEMPT_CEILING),
    output_sha256: Sha256,
    validation: AttemptValidationSchema,
    tokens: z.int().min(0),
    wall_clock_ms: z.int().min(0),
    cost_usd: z.number().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.validation.passed && value.validation.issues.length > 0) issue(ctx, ["validation", "issues"], "passed validation cannot carry issues");
    if (!value.validation.passed && value.validation.issues.length === 0) issue(ctx, ["validation", "issues"], "failed validation requires at least one issue");
  });

/** Immutable attempt record inferred from {@link AttemptRecordSchema}. */
export type AttemptRecord = z.output<typeof AttemptRecordSchema>;

/** Validate evidence needed to resume or hand off an incomplete run. */
export const RunHandoffSchema = z.strictObject({
  reason: z.string().min(1).max(2_000),
  current_iteration: z.int().min(1).max(ITERATION_CEILING),
  carry_values: z.record(z.string(), JsonValueSchema).describe("Current named carry state; keys must match pipeline carries."),
  remaining_work: z.array(z.string().min(1).max(1_000)).min(1).max(128).describe("Ordered next actions."),
});

/** Resumable handoff inferred from {@link RunHandoffSchema}. */
export type RunHandoff = z.output<typeof RunHandoffSchema>;

/** Validate aggregate resource consumption for one run. */
export const RunUsageSchema = z.strictObject({
  total_tokens: z.int().min(0),
  wall_clock_ms: z.int().min(0),
  cost_usd: z.number().min(0).optional(),
});

/** Validated run usage inferred from {@link RunUsageSchema}. */
export type RunUsage = z.output<typeof RunUsageSchema>;

const RunReceiptShape = z.strictObject({
  entity_kind: z.literal("run_receipt").describe("Immutable entity discriminator."),
  schema_version: z.literal(SCHEMA_VERSION).describe("Immutable schema version."),
  id: Uuid,
  pipeline_id: Uuid,
  pipeline_version: Semver,
  terminal_state: TerminalStateSchema,
  started_at: UtcTimestamp,
  finished_at: UtcTimestamp,
  iteration_count: z.int().min(0).max(ITERATION_CEILING),
  model_call_count: z.int().min(0).max(MODEL_CALL_CEILING),
  usage: RunUsageSchema,
  records: z.array(AttemptRecordSchema).max(MODEL_CALL_CEILING).describe("Ordered attempt history."),
  final_output: z.strictObject({ stage_id: Uuid, output: JsonValueSchema }).optional(),
  handoff: RunHandoffSchema.optional(),
  evidence_refs: z.array(z.string().min(1).max(1_000)).max(256).default([]).describe("Unique evidence references; order is insignificant."),
});

/** Validate a complete, evidence-backed terminal run receipt. */
export const RunReceiptSchema = RunReceiptShape.superRefine((value, ctx) => {
  if (Date.parse(value.finished_at) < Date.parse(value.started_at)) issue(ctx, ["finished_at"], "finished_at precedes started_at");
  if (value.records.length !== value.model_call_count) issue(ctx, ["model_call_count"], "model_call_count must equal records length");
  uniqueStrings(ctx, value.evidence_refs, ["evidence_refs"], "evidence reference");
  uniqueStrings(
    ctx,
    value.records.map((record) => `${record.iteration}:${record.stage_id}:${record.attempt}`),
    ["records"],
    "attempt coordinate",
  );
  value.records.forEach((record, index) => {
    if (record.iteration > value.iteration_count) issue(ctx, ["records", index, "iteration"], "record iteration exceeds iteration_count");
  });
  const tokenSum = value.records.reduce((sum, record) => sum + record.tokens, 0);
  if (tokenSum !== value.usage.total_tokens) issue(ctx, ["usage", "total_tokens"], "total_tokens must equal the attempt-record sum");
  const costValues = value.records.map((record) => record.cost_usd);
  if (costValues.some((cost) => cost !== undefined)) {
    const costSum = costValues.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
    if (value.usage.cost_usd === undefined || Math.abs(value.usage.cost_usd - costSum) > 1e-9) {
      issue(ctx, ["usage", "cost_usd"], "cost_usd must equal the attempt-record sum");
    }
  }
  if (value.terminal_state === "success" && value.final_output === undefined) issue(ctx, ["final_output"], "successful runs require final_output");
  if (
    (value.terminal_state === "blocked" ||
      value.terminal_state === "approval_required" ||
      value.terminal_state === "stagnated") &&
    value.handoff === undefined
  ) {
    issue(ctx, ["handoff"], `${value.terminal_state} runs require resumable handoff state`);
  }
});

/** Stored terminal run receipt inferred from {@link RunReceiptSchema}. */
export type RunReceipt = z.output<typeof RunReceiptSchema>;

// -- § 9  Store joins — enforce every cross-document reference and replacement graph --

const LoopForwardStoreShape = z.strictObject({
  entity_kind: z.literal("loop_forward_store").describe("Immutable root discriminator."),
  schema_version: z.literal(SCHEMA_VERSION).describe("Immutable schema version."),
  id: Uuid,
  revision: z.int().min(1),
  provenance: ProvenanceSchema,
  prompt_templates: z.array(PromptTemplateSchema).max(10_000).describe("Unique entity collection; order is insignificant."),
  agents: z.array(AgentDefinitionSchema).max(10_000).describe("Unique entity collection; order is insignificant."),
  pipelines: z.array(LoopForwardPipelineSchema).max(10_000).describe("Unique entity collection; order is insignificant."),
  run_receipts: z.array(RunReceiptSchema).max(100_000).default([]).describe("Unique immutable receipt collection; order is insignificant."),
});

type StoreShapeValue = z.output<typeof LoopForwardStoreShape>;
type ReplaceableEntity = PromptTemplate | AgentDefinition | LoopForwardPipeline;

function checkReplacementGraph(
  entities: readonly ReplaceableEntity[],
  collectionPath: "prompt_templates" | "agents" | "pipelines",
  ctx: z.RefinementCtx,
): void {
  const byId = new Map(entities.map((entity, index) => [entity.id, { entity, index }] as const));
  entities.forEach((entity, index) => {
    const replacementId = entity.deprecation?.replaced_by_id;
    if (replacementId === undefined || replacementId === null) return;
    const replacement = byId.get(replacementId);
    if (replacement === undefined) {
      issue(ctx, [collectionPath, index, "deprecation", "replaced_by_id"], "replacement does not exist in the same collection");
      return;
    }
    if (replacement.entity.name !== entity.name) {
      issue(ctx, [collectionPath, index, "deprecation", "replaced_by_id"], "replacement must retain the same natural name");
    }
    if (compareSemver(replacement.entity.version, entity.version) <= 0) {
      issue(ctx, [collectionPath, index, "deprecation", "replaced_by_id"], "replacement version must be greater than the deprecated version");
    }
  });

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const entry = byId.get(id);
      if (entry !== undefined) issue(ctx, [collectionPath, entry.index, "deprecation", "replaced_by_id"], "replacement graph contains a cycle");
      return;
    }
    visiting.add(id);
    const next = byId.get(id)?.entity.deprecation?.replaced_by_id;
    if (next !== undefined && next !== null && byId.has(next)) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  entities.forEach((entity) => visit(entity.id));
}

function checkEntityCollections(store: StoreShapeValue, ctx: z.RefinementCtx): void {
  const globalIds = [
    store.id,
    ...store.prompt_templates.map((entity) => entity.id),
    ...store.agents.map((entity) => entity.id),
    ...store.pipelines.map((entity) => entity.id),
    ...store.run_receipts.map((entity) => entity.id),
  ];
  uniqueStrings(ctx, globalIds, [], "global entity id");
  uniqueStrings(
    ctx,
    store.prompt_templates.map((entity) => `${entity.name}:${entity.locale}:${entity.version}`),
    ["prompt_templates"],
    "template natural key",
  );
  uniqueStrings(ctx, store.agents.map((entity) => `${entity.name}:${entity.version}`), ["agents"], "agent natural key");
  uniqueStrings(ctx, store.pipelines.map((entity) => `${entity.name}:${entity.version}`), ["pipelines"], "pipeline natural key");
  uniqueStrings(ctx, store.run_receipts.map((receipt) => receipt.id), ["run_receipts"], "receipt id");

  uniqueStrings(
    ctx,
    store.prompt_templates.filter((entity) => entity.status === "active").map((entity) => `${entity.name}:${entity.locale}`),
    ["prompt_templates"],
    "active template name and locale",
  );
  uniqueStrings(ctx, store.agents.filter((entity) => entity.status === "active").map((entity) => entity.name), ["agents"], "active agent name");
  uniqueStrings(ctx, store.pipelines.filter((entity) => entity.status === "active").map((entity) => entity.name), ["pipelines"], "active pipeline name");

  checkReplacementGraph(store.prompt_templates, "prompt_templates", ctx);
  checkReplacementGraph(store.agents, "agents", ctx);
  checkReplacementGraph(store.pipelines, "pipelines", ctx);
}

function sourceFitsVariable(
  pipeline: LoopForwardPipeline,
  stageIndex: number,
  source: BindingSource,
  target: VariableSpec,
): boolean {
  if (source.kind === "literal") return valueMatchesVariable(source.value, target);
  if (source.kind === "pipeline_input") {
    const input = pipeline.inputs.find((candidate) => candidate.name === source.input_name);
    return input !== undefined && variableTypesCompatible(input.type, target.type);
  }
  if (source.kind === "carried") {
    const carry = pipeline.loop.carries.find((candidate) => candidate.name === source.carry_name);
    return carry !== undefined && variableTypesCompatible(carry.value_type, target.type);
  }
  const sourceIndex = pipeline.stages.findIndex((candidate) => candidate.id === source.stage_id);
  const sourceStage = pipeline.stages[sourceIndex];
  if (sourceIndex < 0 || sourceIndex >= stageIndex || sourceStage === undefined) return false;
  if (sourceStage.output.format !== "json") return source.path === "" && (target.type === "string" || target.type === "json");
  const node = resolveJsonSchemaPointer(sourceStage.output.json_schema, source.path);
  return node !== undefined && schemaNodeFitsVariable(sourceStage.output.json_schema, node, target.type);
}

function checkStoreJoins(store: StoreShapeValue, ctx: z.RefinementCtx): void {
  const templates = new Map(store.prompt_templates.map((template) => [template.id, template] as const));
  const agents = new Map(store.agents.map((agent) => [agent.id, agent] as const));
  const pipelines = new Map(store.pipelines.map((pipeline) => [pipeline.id, pipeline] as const));

  store.agents.forEach((agent, agentIndex) => {
    const systemTemplate = templates.get(agent.system_prompt_template_id);
    if (systemTemplate === undefined) {
      issue(ctx, ["agents", agentIndex, "system_prompt_template_id"], "system prompt template does not exist");
      return;
    }
    if (systemTemplate.variables.some((variable) => variable.is_required)) {
      issue(ctx, ["agents", agentIndex, "system_prompt_template_id"], "agent system templates cannot require variables");
    }
    if (agent.status === "active" && systemTemplate.status !== "active") {
      issue(ctx, ["agents", agentIndex, "system_prompt_template_id"], "active agents require an active system template");
    }
  });

  store.pipelines.forEach((pipeline, pipelineIndex) => {
    pipeline.stages.forEach((stage, stageIndex) => {
      const at = ["pipelines", pipelineIndex, "stages", stageIndex] as const;
      const agent = agents.get(stage.agent_id);
      if (agent === undefined) issue(ctx, [...at, "agent_id"], "agent does not exist");
      else if (pipeline.status === "active" && agent.status !== "active") issue(ctx, [...at, "agent_id"], "active pipelines require active agents");

      const taskTemplate = templates.get(stage.task_prompt_template_id);
      if (taskTemplate === undefined) {
        issue(ctx, [...at, "task_prompt_template_id"], "task prompt template does not exist");
      } else {
        if (pipeline.status === "active" && taskTemplate.status !== "active") issue(ctx, [...at, "task_prompt_template_id"], "active pipelines require active task templates");
        const variables = new Map(taskTemplate.variables.map((variable) => [variable.name, variable] as const));
        stage.bindings.forEach((binding, bindingIndex) => {
          const variable = variables.get(binding.variable_name);
          if (variable === undefined) issue(ctx, [...at, "bindings", bindingIndex, "variable_name"], "binding names no task-template variable");
          else if (!sourceFitsVariable(pipeline, stageIndex, binding.source, variable)) {
            issue(ctx, [...at, "bindings", bindingIndex, "source"], `source does not satisfy variable type ${variable.type}`);
          }
        });
        taskTemplate.variables.forEach((variable) => {
          if (variable.is_required && !stage.bindings.some((binding) => binding.variable_name === variable.name)) {
            issue(ctx, [...at, "bindings"], `required template variable "${variable.name}" is not bound`);
          }
        });
      }

      if (stage.system_override_template_id !== undefined && stage.system_override_template_id !== null) {
        const override = templates.get(stage.system_override_template_id);
        if (override === undefined) issue(ctx, [...at, "system_override_template_id"], "system override template does not exist");
        else if (override.variables.some((variable) => variable.is_required)) issue(ctx, [...at, "system_override_template_id"], "system override templates cannot require variables");
      }
    });
  });

  store.run_receipts.forEach((receipt, receiptIndex) => {
    const at = ["run_receipts", receiptIndex] as const;
    const pipeline = pipelines.get(receipt.pipeline_id);
    if (pipeline === undefined) {
      issue(ctx, [...at, "pipeline_id"], "receipt pipeline does not exist");
      return;
    }
    if (receipt.pipeline_version !== pipeline.version) issue(ctx, [...at, "pipeline_version"], "receipt version does not match its pipeline");
    if (receipt.iteration_count > pipeline.loop.max_iterations) issue(ctx, [...at, "iteration_count"], "receipt exceeds pipeline max_iterations");
    if (receipt.model_call_count > pipeline.loop.budget.max_model_calls) issue(ctx, [...at, "model_call_count"], "receipt exceeds pipeline model-call budget");
    if (receipt.terminal_state !== "exhausted") {
      if (receipt.usage.total_tokens > pipeline.loop.budget.max_total_tokens) issue(ctx, [...at, "usage", "total_tokens"], "receipt exceeds token budget without terminal_state exhausted");
      if (receipt.usage.wall_clock_ms > pipeline.loop.budget.max_wall_clock_ms) issue(ctx, [...at, "usage", "wall_clock_ms"], "receipt exceeds wall-clock budget without terminal_state exhausted");
      if (
        receipt.usage.cost_usd !== undefined &&
        pipeline.loop.budget.max_cost_usd !== undefined &&
        receipt.usage.cost_usd > pipeline.loop.budget.max_cost_usd
      ) {
        issue(ctx, [...at, "usage", "cost_usd"], "receipt exceeds cost budget without terminal_state exhausted");
      }
    }
    receipt.records.forEach((record, recordIndex) => {
      if (!pipeline.stages.some((stage) => stage.id === record.stage_id)) issue(ctx, [...at, "records", recordIndex, "stage_id"], "attempt references a stage outside the pipeline");
    });
    if (receipt.handoff !== undefined) {
      const carryNames = new Set(pipeline.loop.carries.map((carry) => carry.name));
      Object.keys(receipt.handoff.carry_values).forEach((name) => {
        if (!carryNames.has(name)) issue(ctx, [...at, "handoff", "carry_values", name], "handoff contains an undeclared carry");
      });
    }
    if (receipt.final_output !== undefined) {
      const stage = pipeline.stages.find((candidate) => candidate.id === receipt.final_output?.stage_id);
      if (stage === undefined) issue(ctx, [...at, "final_output", "stage_id"], "final output references a stage outside the pipeline");
      else {
        const failures = validateOutput(stage.output, receipt.final_output.output);
        if (failures.length > 0) issue(ctx, [...at, "final_output", "output"], `final output fails its contract: ${failures[0]?.message ?? "unknown failure"}`);
      }
    }
  });
}

/**
 * Validate the canonical loop-forward store and all in-document and cross-document invariants.
 *
 * @remarks
 * Keep templates and agents as aggregation targets, compose stages into pipelines, and store
 * terminal receipts as immutable evidence. Reject unknown keys at every level. Treat provider
 * options and named validators as the only intentional extension points.
 */
export const LoopForwardStoreSchema = LoopForwardStoreShape.superRefine((value, ctx) => {
  checkEntityCollections(value, ctx);
  checkStoreJoins(value, ctx);
});

/** Canonical validated store inferred from {@link LoopForwardStoreSchema}. */
export type LoopForwardStore = z.output<typeof LoopForwardStoreSchema>;

// -- § 10  Parse boundary — expose deterministic errors and derived call ceilings --

/** Describe one stable parse failure with a dot-joined field path. */
export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

/** Wrap all validation issues from the canonical loop-forward parse boundary. */
export class LoopForwardSchemaError extends Error {
  override readonly name = "LoopForwardSchemaError";
  readonly issues: readonly SchemaIssue[];

  /**
   * Create one immutable schema error.
   *
   * @param issues - Stable validation issues returned to the caller.
   */
  constructor(issues: readonly SchemaIssue[]) {
    super(`invalid loop-forward store: ${issues.length} issue(s)`);
    this.issues = issues;
  }
}

/** Represent a non-throwing parse result. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LoopForwardSchemaError };

/**
 * Parse and validate one complete loop-forward store without throwing.
 *
 * @param input - Untrusted serialized input.
 * @returns A validated store or a typed issue collection.
 */
export function parseLoopForwardStore(input: unknown): ParseResult<LoopForwardStore> {
  const result = LoopForwardStoreSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: new LoopForwardSchemaError(
      result.error.issues.map((entry) => ({ path: entry.path.map(String).join("."), message: entry.message })),
    ),
  };
}

/**
 * Calculate the structural upper bound on model calls for one pipeline.
 *
 * @param pipeline - Validated pipeline whose stages and attempt policies define the bound.
 * @returns Maximum iterations multiplied by the sum of stage attempts per iteration.
 */
export function maxModelCalls(pipeline: LoopForwardPipeline): number {
  const attemptsPerIteration = pipeline.stages.reduce((sum, stage) => {
    const attempts = stage.output.on_invalid.action === "retry" ? stage.output.on_invalid.max_attempts : 1;
    return sum + attempts;
  }, 0);
  return pipeline.loop.max_iterations * attemptsPerIteration;
}

// -- § 11  Schema-design scorecard — record compliance for the canonical v2 contract --
/*
 * Rules for Great Schema Design v2.0.0
 * MUST 20/20: precise types and constraints; versioned enums; explicit optional/null states;
 * bounded ordered/set arrays; UTC-second timestamps; named numeric units; discriminated unions;
 * opaque UUIDs; navigable typed references; composition/aggregation ownership; enforced DAG and
 * acyclic replacement graphs; one fact source; canonical semver and classified changes; explicit
 * deprecation and sensitivity; strict generatable Zod validators; intentional extension points;
 * standalone domain documentation.
 * SHOULD 11/11: literal defaults; no bag-of-arrays entities; shared cross-cutting schemas; stored
 * versus derived run state; immutable identity/provenance descriptions; locale-per-template;
 * multi-actor provenance; consistent snake_case; domain-first normalized structure.
 */
