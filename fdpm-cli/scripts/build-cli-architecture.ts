/**
 * Build a software-architecture workbook that documents the FDPM CLI itself,
 * using the `fdpm.software-architecture` plugin profile.
 *
 * Pass-1 of this script wrote ~120 individual Host calls. This rewrite
 * uses the @fdpm/cli SDK (`openHost` + `defineProject`) so the
 * authoring code is mostly data: a few arrays of primitive specs and
 * relation specs, then one `commit()`. The resulting workbook is
 * byte-identical to the prior version (same ids, same field shapes,
 * same relation graph).
 *
 * Run with:
 *   FDPM_DATA_DIR=/tmp/fdpm-cli-arch npx tsx scripts/build-cli-architecture.ts
 *
 * Then export to JSON:
 *   FDPM_DATA_DIR=/tmp/fdpm-cli-arch npx tsx src/bin/fdpm.ts workbook get fdpm-cli-arch --json > arch.json
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import {
  PROFILE_ID,
  SCOPE_IDS,
} from "../plugins/software_architecture/index.js";

const PROJECT_ID = "fdpm-cli-arch";

// ── Concepts (cat:identity) ────────────────────────────────────────────────
const concepts: Array<[string, string]> = [
  ["Workbook", "A versioned container of primitives and relations bound to a single DomainProfile."],
  ["Primitive", "A typed, scoped, field-bearing record defined by the active profile."],
  ["Relation", "A typed directed edge between primitives, also defined by the active profile."],
  ["DomainProfile", "A registered vocabulary: categories, scopes, primitive types, relation types, validators, renderers, templates."],
  ["Operation", "An atomic state-changing record appended to the JSONL log; the only way Store mutates."],
  ["Plugin", "A discoverable bundle that contributes profiles, validators, renderers, and lifecycle hooks via a manifest."],
  ["VerificationGate", "The §8 trust-tier gate that evaluates each operation before Store.append."],
  ["ValidationPipeline", "The §7 evaluator that runs profile rules over the proposed post-state."],
];
const conceptSpecs: PrimitiveSpec[] = concepts.map(([name, definition]) => ({
  id: `concept:${name}`,
  type: "sw:Concept",
  scope: SCOPE_IDS.domain,
  fields: { name, definition },
}));

// ── Entities (cat:identity) ────────────────────────────────────────────────
type EntitySpec = {
  id: string;
  scope: keyof typeof SCOPE_IDS;
  kind: "DomainAggregate" | "DomainValue" | "Service" | "Component" | "Module" | "Infrastructure" | "ExternalSystem";
  name: string;
  description: string;
  lifecycle?: "Proposed" | "Active" | "Deprecated" | "Retired";
};
const entities: EntitySpec[] = [
  // Top-level façade
  { id: "domain:Component:Host", scope: "domain", kind: "Component", name: "Host",
    description: "Composition root that owns Store, ProfileRegistry, ValidationPipeline, persistence, and PluginRuntime." },
  { id: "domain:Component:Store", scope: "domain", kind: "Component", name: "Store",
    description: "In-memory event-sourced projection of primitives and relations; mutates only via append." },
  { id: "domain:Component:ProfileRegistry", scope: "domain", kind: "Component", name: "ProfileRegistry",
    description: "Holds registered DomainProfiles and resolves the active profile per workbook." },
  { id: "domain:Component:ValidationPipeline", scope: "domain", kind: "Component", name: "ValidationPipeline",
    description: "Runs profile-defined validation rules over a proposed primitive or relation." },
  { id: "domain:Component:VerificationGate", scope: "domain", kind: "Component", name: "VerificationGate",
    description: "§8 trust-tier gate evaluated by Store before append." },
  { id: "domain:Component:PluginRuntime", scope: "domain", kind: "Component", name: "PluginRuntime",
    description: "Discovers, loads, activates, and tracks plugins; mediates capability registration." },
  { id: "deployment:Infrastructure:JsonlLogStore", scope: "deployment", kind: "Infrastructure", name: "JsonlLogStore",
    description: "Append-only JSONL operation log persisted under FDPM_DATA_DIR." },

  // CLI surface
  { id: "domain:Service:CliBin", scope: "domain", kind: "Service", name: "CliBin",
    description: "The fdpm executable: src/bin/fdpm.ts. Wires Commander, instantiates Host, dispatches commands." },
  { id: "domain:Module:CommandsModule", scope: "domain", kind: "Module", name: "CommandsModule",
    description: "src/commands/* — one Commander subcommand group per CLI noun (workbook, primitive, relation, etc.)." },

  // Plugins (modules contributed by built-in plugin discovery)
  { id: "domain:Module:PluginSoftwareArchitecture", scope: "domain", kind: "Module", name: "PluginSoftwareArchitecture",
    description: "fdpm.software-architecture — vocabulary plugin: 15 primitive types, 15 relation types, 7 declarative validators, no executable renderers." },
  { id: "domain:Module:PluginFormalSpecification", scope: "domain", kind: "Module", name: "PluginFormalSpecification",
    description: "fdpm.formal-specification — full plugin: 32 primitive types, 30 relation types, 23 validators, 3 renderers (md/html/pdf)." },
  { id: "domain:Module:PluginFsV3Importer", scope: "domain", kind: "Module", name: "PluginFsV3Importer",
    description: "fdpm.fs-v3-importer — importer for legacy fs v3 documents." },

  // External
  { id: "deployment:ExternalSystem:Commander", scope: "deployment", kind: "ExternalSystem", name: "Commander",
    description: "commander@^12 — argv parsing and subcommand routing." },
  { id: "deployment:ExternalSystem:Zod", scope: "deployment", kind: "ExternalSystem", name: "Zod",
    description: "zod@^3 — runtime schema validation for inbound JSON payloads." },
  { id: "deployment:ExternalSystem:NodeRuntime", scope: "deployment", kind: "ExternalSystem", name: "NodeRuntime",
    description: "Node.js >=20 runtime; ESM module loader; filesystem and process APIs." },
];
const entitySpecs: PrimitiveSpec[] = entities.map((e) => ({
  id: e.id,
  type: "sw:Entity",
  scope: SCOPE_IDS[e.scope],
  fields: {
    kind: e.kind,
    name: e.name,
    lifecycle: e.lifecycle ?? "Active",
    description: e.description,
  },
}));

// ── Decisions (ADRs) ───────────────────────────────────────────────────────
const decisions = [
  {
    id: "decision:0001",
    title: "Event-sourced Store with JSONL persistence",
    context: "The CLI must support deterministic replay, undo, time-travel diff, and audit (SPEC-CORE §5.5).",
    rationale: "Persisting an append-only stream of typed Operations and projecting them into Store gives replayability and audit for free; rebuild-from-log is a single primitive.",
    consequences: "Every state change must go through Operation. Snapshots are derived, never authoritative. Disk format is text-grep-friendly but unbounded; rotation is a future concern.",
    altName: "Direct mutation with periodic snapshots",
    altReason: "Loses replay/undo and forces ad-hoc audit; conflicts with SPEC-CORE §5.5 / §13.3.",
  },
  {
    id: "decision:0002",
    title: "Plugin contributions are pure data",
    context: "Profiles, validators, and renderers must be loadable from third-party packages without trusting their code paths beyond the activation hook.",
    rationale: "Plugins register PROFILE objects (data) plus capabilities (named functions); the Host treats the contributed schema as the source of truth and never invokes plugin code on hot validation paths unless a cap:validator is registered.",
    consequences: "Vocabulary plugins (e.g. software-architecture) can ship without any executable code. Plugins that want enforcement must opt in via cap:validator. Predicate DSL on declarative-only rules is not evaluated by the Core.",
    altName: "Mandatory executable validators per plugin",
    altReason: "Forces every vocabulary contributor to ship runtime code; raises trust surface unnecessarily.",
  },
  {
    id: "decision:0003",
    title: "Validation runs on the proposed post-state, before append",
    context: "An invalid primitive must never reach the Store projection or the JSONL log.",
    rationale: "Host.runWithValidation builds the proposed instance, runs ValidationPipeline, and only then calls Store.append. Failures produce a structured ValidationReport and abort the operation.",
    consequences: "Each write costs one full validation pass. Touched-paths optimization on patch operations limits the cost. Trust-tier gating composes cleanly with this order.",
    altName: "Validate after append, then revert on failure",
    altReason: "Pollutes the log with rejected operations and weakens the §8 gate's invariant.",
  },
  {
    id: "decision:0004",
    title: "TypeScript port preserves Python source idioms byte-faithfully",
    context: "The CLI is a port of a prior Python implementation that used a legacy DSL (StructField[X], min_items, has_relation, etc.).",
    rationale: "Port at parity first, evolve later. Quirks like single-valued StructField with min_items are preserved verbatim so existing exports validate identically.",
    consequences: "Some field shapes look counterintuitive in TS (single-object struct fields). Documented as known idiosyncrasies in plugin READMEs.",
    altName: "Idiomatic TypeScript redesign",
    altReason: "Breaks compatibility with existing workbook transfers; expands scope beyond the port.",
  },
  {
    id: "decision:0005",
    title: "Commander as the CLI dispatcher",
    context: "The CLI exposes a noun/verb surface aligned with SPEC-CORE §9 HTTP routes.",
    rationale: "Commander is mature, ESM-native, and matches the noun→verb tree without custom routing.",
    consequences: "Help text, --json flags, and subcommand discovery come for free. Ties argv parsing to Commander's conventions.",
    altName: "Hand-rolled argv parser",
    altReason: "Reinvents flags/help/error handling with no benefit.",
  },
];
const decisionSpecs: PrimitiveSpec[] = decisions.map((d) => ({
  id: d.id,
  type: "sw:Decision",
  scope: SCOPE_IDS.domain,
  fields: {
    status: "Accepted",
    title: d.title,
    context: d.context,
    rationale: d.rationale,
    alternatives: { name: d.altName, reason_rejected: d.altReason },
    consequences: d.consequences,
  },
}));

// ── Semantic primitives ────────────────────────────────────────────────────
const invariants: Array<{ id: string; statement: string; enforcement: "Compile" | "Test" | "Runtime" | "Process" | "Manual" }> = [
  { id: "invariant:domain:append-only-log",
    statement: "The JSONL operation log is append-only; the Store never rewrites prior entries.",
    enforcement: "Runtime" },
  { id: "invariant:domain:validate-before-append",
    statement: "No Operation is appended unless ValidationPipeline accepts the proposed post-state.",
    enforcement: "Runtime" },
  { id: "invariant:domain:profile-immutable-per-workbook",
    statement: "A Workbook's bound DomainProfile id is immutable for the workbook's lifetime.",
    enforcement: "Runtime" },
  { id: "invariant:domain:type-id-immutable",
    statement: "type_id is immutable on Primitive and Relation replace/patch operations.",
    enforcement: "Runtime" },
];
const invariantSpecs: PrimitiveSpec[] = invariants.map((i) => ({
  id: i.id,
  type: "sw:Invariant",
  scope: SCOPE_IDS.domain,
  fields: { statement: i.statement, enforcement: i.enforcement },
}));

const constraintSpecs: PrimitiveSpec[] = [
  { id: "constraint:runtime:max-batch-ops", type: "sw:Constraint", scope: SCOPE_IDS.runtime,
    fields: { statement: "FDPM_MAX_BATCH_OPS caps operations per `edit` batch (default 500).", metric: "env.FDPM_MAX_BATCH_OPS" } },
  { id: "constraint:runtime:max-request-bytes", type: "sw:Constraint", scope: SCOPE_IDS.runtime,
    fields: { statement: "FDPM_MAX_REQUEST_BYTES caps -f/stdin input size (default 5 MiB).", metric: "env.FDPM_MAX_REQUEST_BYTES" } },
];

const assumptionSpecs: PrimitiveSpec[] = [
  { id: "assumption:deployment:node-20-plus", type: "sw:Assumption", scope: SCOPE_IDS.deployment,
    fields: {
      statement: "Node.js >= 20 with ESM support is available on the target host.",
      invalidation: "Older Node or CommonJS-only runtime fails on dynamic import() of plugin modules.",
    } },
  { id: "assumption:deployment:writable-data-dir", type: "sw:Assumption", scope: SCOPE_IDS.deployment,
    fields: {
      statement: "FDPM_DATA_DIR (default ~/.fdpm-cli) is writable by the CLI process.",
      invalidation: "Read-only filesystem causes JsonlLogStore.append to throw; --no-persist is the documented escape.",
    } },
];

const guaranteeSpecs: PrimitiveSpec[] = [
  { id: "guarantee:runtime:atomic-edits", type: "sw:Guarantee", scope: SCOPE_IDS.runtime,
    fields: {
      statement: "An `edit` batch is atomic: either every operation in the envelope is applied and persisted, or none is.",
      conditions: "Validation passes for every operation in the batch and the JSONL append succeeds.",
    } },
  { id: "guarantee:domain:replay-determinism", type: "sw:Guarantee", scope: SCOPE_IDS.domain,
    fields: {
      statement: "Replaying the JSONL log on an empty Store reconstructs an identical Workbook state.",
      conditions: "No external mutation of the log file; profile registry is restored to the same versions.",
    } },
];

// ── Endpoints (CLI command surface, treated as Endpoints with protocol=CLI)
const endpoints: Array<{ id: string; name: string; method?: string; path?: string }> = [
  { id: "endpoint:POST:workbook-create", name: "workbook create", method: "POST", path: "/workbooks" },
  { id: "endpoint:GET:workbook-get", name: "workbook get", method: "GET", path: "/workbooks/{id}" },
  { id: "endpoint:GET:workbook-list", name: "workbook list", method: "GET", path: "/workbooks" },
  { id: "endpoint:POST:primitive-create", name: "primitive create", method: "POST", path: "/workbooks/{id}/primitives" },
  { id: "endpoint:PATCH:primitive-patch", name: "primitive patch", method: "PATCH", path: "/workbooks/{id}/primitives/{pid}" },
  { id: "endpoint:POST:relation-create", name: "relation create", method: "POST", path: "/workbooks/{id}/relations" },
  { id: "endpoint:POST:edit", name: "edit", method: "POST", path: "/workbooks/{id}/edits" },
  { id: "endpoint:GET:validate", name: "validate", method: "GET", path: "/workbooks/{id}/validate" },
  { id: "endpoint:POST:render", name: "render", method: "POST", path: "/workbooks/{id}/render/{target}" },
  { id: "endpoint:GET:transfer-export", name: "transfer export", method: "GET", path: "/transfer/export" },
  { id: "endpoint:POST:transfer-import", name: "transfer import", method: "POST", path: "/transfer/import" },
  { id: "endpoint:GET:plugin-list", name: "plugin list", method: "GET", path: "/plugins" },
  { id: "endpoint:GET:log-tail", name: "log tail", method: "GET", path: "/workbooks/{id}/log" },
  { id: "endpoint:POST:log-undo", name: "log undo", method: "POST", path: "/workbooks/{id}/log/undo" },
];
const endpointSpecs: PrimitiveSpec[] = endpoints.map((e) => ({
  id: e.id,
  type: "sw:Endpoint",
  fields: {
    name: e.name,
    protocol: "CLI",
    ...(e.method ? { method: e.method } : {}),
    ...(e.path ? { path: e.path } : {}),
  },
}));

// ── States and Transitions ─────────────────────────────────────────────────
const stateSpecs: PrimitiveSpec[] = [
  { id: "state:store:Empty", type: "sw:State",
    fields: { entity_id: "domain:Component:Store", name: "Empty", terminal: false } },
  { id: "state:store:Populated", type: "sw:State",
    fields: { entity_id: "domain:Component:Store", name: "Populated", terminal: false } },
  { id: "state:store:Deleted", type: "sw:State",
    fields: { entity_id: "domain:Component:Store", name: "Deleted", terminal: true } },
];

const transitionSpecs: PrimitiveSpec[] = [
  { id: "transition:Empty:Populated", type: "sw:Transition",
    fields: { from_state: "state:store:Empty", to_state: "state:store:Populated", trigger: "primitive.create / relation.create accepted" } },
  { id: "transition:Populated:Empty", type: "sw:Transition",
    fields: { from_state: "state:store:Populated", to_state: "state:store:Empty", trigger: "all primitives deleted" } },
  { id: "transition:Empty:Deleted", type: "sw:Transition",
    fields: { from_state: "state:store:Empty", to_state: "state:store:Deleted", trigger: "workbook.delete accepted" } },
  { id: "transition:Populated:Deleted", type: "sw:Transition",
    fields: { from_state: "state:store:Populated", to_state: "state:store:Deleted", trigger: "workbook.delete accepted" } },
];

// ── Failure modes ──────────────────────────────────────────────────────────
const failureSpecs: PrimitiveSpec[] = [
  { id: "failure:Store:validation-reject", type: "sw:FailureMode",
    fields: {
      entity_id: "domain:Component:Store",
      description: "ValidationPipeline rejects the proposed post-state; Operation is not appended.",
      detection: "Host throws FDPMException with the structured ValidationReport.",
      mitigation: "Caller fixes the field values per the report.findings and retries; no state change to undo.",
      severity: "Medium",
    } },
  { id: "failure:JsonlLogStore:disk-full", type: "sw:FailureMode",
    fields: {
      entity_id: "deployment:Infrastructure:JsonlLogStore",
      description: "Append to the JSONL log fails (disk full, ENOSPC, EACCES).",
      detection: "fs.appendFile throws; the error propagates out of Host.runWithValidation.",
      mitigation: "In-memory Store remains consistent because append is the last step; operator must free disk and replay or run with --no-persist.",
      severity: "High",
    } },
  { id: "failure:PluginRuntime:activation-throws", type: "sw:FailureMode",
    fields: {
      entity_id: "domain:Component:PluginRuntime",
      description: "A plugin's activate() throws during discovery.",
      detection: "PluginRuntime catches and logs at error level; the plugin is marked failed.",
      mitigation: "Other plugins continue to load; the failed plugin's vocabulary is unavailable until the operator fixes it.",
      severity: "Medium",
    } },
  { id: "failure:VerificationGate:trust-tier-deny", type: "sw:FailureMode",
    fields: {
      entity_id: "domain:Component:VerificationGate",
      description: "A proposed operation does not satisfy the §8 trust tier required for its impact.",
      detection: "Store.append refuses with a gate-denied FDPMException before ValidationPipeline runs.",
      mitigation: "Operator escalates trust (FDPM_TRUSTED_KEYS, signed payload) or downscopes the operation.",
      severity: "High",
    } },
];

// ── Evidence ───────────────────────────────────────────────────────────────
const evidenceSpecs: PrimitiveSpec[] = [
  { id: "evidence:test:sw-arch-e2e", type: "sw:Evidence",
    fields: { kind: "Test", source: "fdpm-cli/tests/software-architecture-e2e.test.ts",
      description: "End-to-end test that exercises every sw: primitive shape through Host.createPrimitive + ValidationPipeline." } },
  { id: "evidence:ref:host-source", type: "sw:Evidence",
    fields: { kind: "Reference", source: "fdpm-cli/src/core/host.ts",
      description: "Host class — composes Store, ProfileRegistry, ValidationPipeline, persistence, and PluginRuntime." } },
  { id: "evidence:ref:plugin-runtime", type: "sw:Evidence",
    fields: { kind: "Reference", source: "fdpm-cli/src/plugin/runtime.ts",
      description: "PluginRuntime — discovery, activation, capability registration, lifecycle hooks." } },
  { id: "evidence:ref:cli-bin", type: "sw:Evidence",
    fields: { kind: "Reference", source: "fdpm-cli/src/bin/fdpm.ts",
      description: "CLI entry point — Commander wiring and command dispatch." } },
  { id: "evidence:ref:manual", type: "sw:Evidence",
    fields: { kind: "Reference", source: "fdpm-cli/MANUAL.md",
      description: "User-facing CLI manual; authoritative for flag and subcommand reference." } },
];

// ── Relations ──────────────────────────────────────────────────────────────
const relations: RelationSpec[] = [
  // Composition / dependency
  { id: "rel:host-deps-store", type: "sw:DependsOn", from: "domain:Component:Host", to: "domain:Component:Store", fields: { kind: "compile" } },
  { id: "rel:host-deps-registry", type: "sw:DependsOn", from: "domain:Component:Host", to: "domain:Component:ProfileRegistry", fields: { kind: "compile" } },
  { id: "rel:host-deps-pipeline", type: "sw:DependsOn", from: "domain:Component:Host", to: "domain:Component:ValidationPipeline", fields: { kind: "compile" } },
  { id: "rel:host-deps-plugins", type: "sw:DependsOn", from: "domain:Component:Host", to: "domain:Component:PluginRuntime", fields: { kind: "compile" } },
  { id: "rel:host-deps-jsonl", type: "sw:DependsOn", from: "domain:Component:Host", to: "deployment:Infrastructure:JsonlLogStore", fields: { kind: "runtime" } },
  { id: "rel:store-deps-gate", type: "sw:DependsOn", from: "domain:Component:Store", to: "domain:Component:VerificationGate", fields: { kind: "runtime" } },
  { id: "rel:pipeline-deps-registry", type: "sw:DependsOn", from: "domain:Component:ValidationPipeline", to: "domain:Component:ProfileRegistry", fields: { kind: "runtime" } },
  { id: "rel:cli-deps-host", type: "sw:DependsOn", from: "domain:Service:CliBin", to: "domain:Component:Host", fields: { kind: "compile" } },
  { id: "rel:cli-deps-commands", type: "sw:DependsOn", from: "domain:Service:CliBin", to: "domain:Module:CommandsModule", fields: { kind: "compile" } },
  { id: "rel:cli-deps-commander", type: "sw:DependsOn", from: "domain:Service:CliBin", to: "deployment:ExternalSystem:Commander", fields: { kind: "compile" } },
  { id: "rel:commands-deps-host", type: "sw:DependsOn", from: "domain:Module:CommandsModule", to: "domain:Component:Host", fields: { kind: "compile" } },
  { id: "rel:commands-deps-zod", type: "sw:DependsOn", from: "domain:Module:CommandsModule", to: "deployment:ExternalSystem:Zod", fields: { kind: "compile" } },
  { id: "rel:plugins-deps-runtime", type: "sw:DependsOn", from: "domain:Module:PluginSoftwareArchitecture", to: "domain:Component:PluginRuntime", fields: { kind: "runtime" } },
  { id: "rel:plugins-fs-deps-runtime", type: "sw:DependsOn", from: "domain:Module:PluginFormalSpecification", to: "domain:Component:PluginRuntime", fields: { kind: "runtime" } },
  { id: "rel:plugins-importer-deps-runtime", type: "sw:DependsOn", from: "domain:Module:PluginFsV3Importer", to: "domain:Component:PluginRuntime", fields: { kind: "runtime" } },
  { id: "rel:cli-deps-node", type: "sw:DependsOn", from: "domain:Service:CliBin", to: "deployment:ExternalSystem:NodeRuntime", fields: { kind: "runtime" } },

  // Exposure of CLI endpoints
  { id: "rel:cli-exposes-workbook-create", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:workbook-create" },
  { id: "rel:cli-exposes-workbook-get", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:workbook-get" },
  { id: "rel:cli-exposes-workbook-list", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:workbook-list" },
  { id: "rel:cli-exposes-prim-create", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:primitive-create" },
  { id: "rel:cli-exposes-prim-patch", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:PATCH:primitive-patch" },
  { id: "rel:cli-exposes-rel-create", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:relation-create" },
  { id: "rel:cli-exposes-edit", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:edit" },
  { id: "rel:cli-exposes-validate", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:validate" },
  { id: "rel:cli-exposes-render", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:render" },
  { id: "rel:cli-exposes-export", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:transfer-export" },
  { id: "rel:cli-exposes-import", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:transfer-import" },
  { id: "rel:cli-exposes-plugin-list", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:plugin-list" },
  { id: "rel:cli-exposes-log-tail", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:GET:log-tail" },
  { id: "rel:cli-exposes-log-undo", type: "sw:Exposes", from: "domain:Service:CliBin", to: "endpoint:POST:log-undo" },

  // Constraints
  { id: "rel:max-batch-constrains-edit", type: "sw:Constrains", from: "constraint:runtime:max-batch-ops", to: "endpoint:POST:edit" },
  { id: "rel:max-bytes-constrains-edit", type: "sw:Constrains", from: "constraint:runtime:max-request-bytes", to: "endpoint:POST:edit" },
  { id: "rel:append-only-constrains-store", type: "sw:Constrains", from: "invariant:domain:append-only-log", to: "domain:Component:Store" },
  { id: "rel:validate-first-constrains-store", type: "sw:Constrains", from: "invariant:domain:validate-before-append", to: "domain:Component:Store" },
  { id: "rel:profile-immutable-constrains-store", type: "sw:Constrains", from: "invariant:domain:profile-immutable-per-workbook", to: "domain:Component:Store" },
  { id: "rel:type-id-immutable-constrains-store", type: "sw:Constrains", from: "invariant:domain:type-id-immutable", to: "domain:Component:Store" },

  // Failure / guarantee
  { id: "rel:store-owns-validation-reject", type: "sw:BelongsTo", from: "failure:Store:validation-reject", to: "domain:Component:Store" },
  { id: "rel:jsonl-owns-disk-full", type: "sw:BelongsTo", from: "failure:JsonlLogStore:disk-full", to: "deployment:Infrastructure:JsonlLogStore" },
  { id: "rel:plugins-owns-activation", type: "sw:BelongsTo", from: "failure:PluginRuntime:activation-throws", to: "domain:Component:PluginRuntime" },
  { id: "rel:gate-owns-deny", type: "sw:BelongsTo", from: "failure:VerificationGate:trust-tier-deny", to: "domain:Component:VerificationGate" },
  { id: "rel:disk-mitigates-atomic", type: "sw:Mitigates", from: "failure:JsonlLogStore:disk-full", to: "guarantee:runtime:atomic-edits" },
  { id: "rel:reject-mitigates-replay", type: "sw:Mitigates", from: "failure:Store:validation-reject", to: "guarantee:domain:replay-determinism" },

  // State ownership
  { id: "rel:empty-belongs-store", type: "sw:BelongsTo", from: "state:store:Empty", to: "domain:Component:Store" },
  { id: "rel:populated-belongs-store", type: "sw:BelongsTo", from: "state:store:Populated", to: "domain:Component:Store" },
  { id: "rel:deleted-belongs-store", type: "sw:BelongsTo", from: "state:store:Deleted", to: "domain:Component:Store" },

  // Assumptions
  { id: "rel:cli-assumes-node", type: "sw:Assumes", from: "domain:Service:CliBin", to: "assumption:deployment:node-20-plus" },
  { id: "rel:jsonl-assumes-writable", type: "sw:Assumes", from: "deployment:Infrastructure:JsonlLogStore", to: "assumption:deployment:writable-data-dir" },

  // Evidence justifies
  { id: "rel:e2e-justifies-validate", type: "sw:Justifies", from: "evidence:test:sw-arch-e2e", to: "invariant:domain:validate-before-append" },
  { id: "rel:host-src-justifies-d3", type: "sw:Justifies", from: "evidence:ref:host-source", to: "decision:0003" },
  { id: "rel:plugin-rt-justifies-d2", type: "sw:Justifies", from: "evidence:ref:plugin-runtime", to: "decision:0002" },
  { id: "rel:cli-bin-justifies-d5", type: "sw:Justifies", from: "evidence:ref:cli-bin", to: "decision:0005" },
  { id: "rel:manual-justifies-atomic", type: "sw:Justifies", from: "evidence:ref:manual", to: "guarantee:runtime:atomic-edits" },

  // Concept references
  { id: "rel:host-refers-workbook", type: "sw:RefersTo", from: "domain:Component:Host", to: "concept:Workbook" },
  { id: "rel:store-refers-operation", type: "sw:RefersTo", from: "domain:Component:Store", to: "concept:Operation" },
  { id: "rel:registry-refers-profile", type: "sw:RefersTo", from: "domain:Component:ProfileRegistry", to: "concept:DomainProfile" },
  { id: "rel:pipeline-refers-validation", type: "sw:RefersTo", from: "domain:Component:ValidationPipeline", to: "concept:ValidationPipeline" },
  { id: "rel:gate-refers-gate", type: "sw:RefersTo", from: "domain:Component:VerificationGate", to: "concept:VerificationGate" },
  { id: "rel:plugins-refers-plugin", type: "sw:RefersTo", from: "domain:Component:PluginRuntime", to: "concept:Plugin" },
];

async function main() {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "FDPM CLI — Software Architecture",
    profile: PROFILE_ID,
    description:
      "Architecture description of the FDPM Core SPEC v1.1 CLI (the @fdpm/cli package), captured using the fdpm.software-architecture profile.",
  })
    .primitives([
      ...conceptSpecs,
      ...entitySpecs,
      ...decisionSpecs,
      ...invariantSpecs,
      ...constraintSpecs,
      ...assumptionSpecs,
      ...guaranteeSpecs,
      ...endpointSpecs,
      ...stateSpecs,
      ...transitionSpecs,
      ...failureSpecs,
      ...evidenceSpecs,
    ])
    .relations(relations)
    .commit();

  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
