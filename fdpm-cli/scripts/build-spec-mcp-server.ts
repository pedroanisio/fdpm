/**
 * Build the SPEC for "FDPM MCP Server" using the `fdpm.spec-authoring`
 * plugin profile.
 *
 * This authors SPEC-MCP-SERVER v0.1 as a typed graph: every structural
 * element (Document, Sections, Stakeholders, Quality Attributes, ADR
 * with Options + Trade-off Matrix, QA Scenarios, Requirements,
 * Acceptance Criteria, Conformance Items, Risks/Mitigations, Open
 * Questions, Future Work, References, Implementation Plan, Migration
 * Steps, Revision history, Definitions, Tools, Config entries, Error
 * categories) is materialised as typed primitives joined by typed
 * relations.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-mcp
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/scripts/build-spec-mcp-server.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-mcp-server text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-MCP-SERVER.md
 *
 * Validation runs on commit (§7 pipeline). Any rule violation surfaces
 * as a finding — including PALS-LAW rules. The script will fail loudly
 * if the SPEC is structurally incomplete; that's by design.
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";
import {
  SPEC_CORE_PATH,
  SPEC_PLUGGABLE_ARCHITECTURE_PATH,
  SPEC_REPL_PATH,
} from "./_spec-paths.js";

const PROJECT_ID = "spec-mcp-server";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:mcp-server",
  type: "spec:Document",
  fields: {
    title: "SPEC — FDPM MCP Server v0.1",
    subtitle:
      "A long-lived process holding one Host and exposing a curated, schema-typed tool surface to MCP clients over standard transports.",
    spec_id: "spec:fdpm:mcp-server:0.1",
    version: "0.1.0",
    status: "Proposal",
    audience:
      "FDPM core maintainers, agent integrators (Claude Desktop, Claude Code, Cursor, custom MCP clients), security reviewers.",
    required_reads: [
      SPEC_CORE_PATH,
      SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      SPEC_REPL_PATH,
      "PURPOSE.md",
      "CLAUDE.md",
    ],
    companion_code: "fdpm-cli/src/core/host.ts",
    peer_spec: SPEC_REPL_PATH,
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "The MCP server defined here is the authorization perimeter through which " +
      "LLM-driven tool calls reach the Core. Every tool exposed over MCP must " +
      "carry an explicit verification posture (read-only, validating-write, or " +
      "destructive) and every tool response must surface the Core's verification " +
      "result (validation report, schema-gate status) without the LLM having to " +
      "ask for it.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.10 — profile-revision amendment (§8, §11): the registry keys on (id, version), so a profile id can be revised; workbooks pin the revision they were created against; Tier-3 fdpm.profile.retire removes one revision when nothing references it. Manifest 0.6.0; catalog budget 27,000 -> 28,500 B.",
    source_script: "fdpm-cli/scripts/build-spec-mcp-server.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-mcp",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/scripts/build-spec-mcp-server.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-mcp npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-mcp-server text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-MCP-SERVER.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "MCP",
    "Model Context Protocol — Anthropic's protocol for typed tool calls between an LLM client and a server. The MCP server in this SPEC is one such server.",
    "Model Context Protocol",
  ],
  [
    "Tool tier",
    "One of three classes governing default exposure and verification posture: read-only (always exposed), validating-write (exposed by default; runs the §7 pipeline), destructive (advertised in both states; dispatch off by default, opt-in via FDPM_MCP_ENABLE_DESTRUCTIVE).",
  ],
  [
    "Authorization perimeter",
    "The boundary at which untrusted LLM-driven tool calls become host-trusted state mutations. For FDPM-over-MCP, that boundary is the MCP server's tool dispatch.",
  ],
  [
    "Validation report",
    "The §7 pipeline's structured result for a Tier 2 / Tier 3 operation: status (pass / fail / warn) and a list of findings. Required in every Tier 2 / Tier 3 success response.",
  ],
  [
    "Operation envelope",
    "The Core's record of a single state-mutating operation: id, kind, workbook_id, before/after fingerprints. Surfaced in MCP success responses so clients can correlate.",
  ],
  [
    "stdio transport",
    "MCP's standard local transport: server reads frames from stdin, writes frames to stdout. Trust boundary = OS process boundary. The only transport in v0.1.",
  ],
  [
    "Audit log",
    "An append-only JSONL file (`$FDPM_DATA_DIR/mcp-audit.jsonl`) recording one entry per tool call: timestamp, session, tool, args hash, ok/error, duration, validation status. Separate from the operation log.",
  ],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §2 Stakeholders & Concerns ─────────────────────────────────────────────

const stakeholders: Array<{
  id: string;
  role: string;
  primary_concern: string;
  category: string;
}> = [
  {
    id: "spec:stk:llm-agent",
    role: "LLM agent (the consumer)",
    primary_concern:
      "Discoverable, well-typed tools; structured errors; verification results returned with output.",
    category: "external_team",
  },
  {
    id: "spec:stk:integrator",
    role: "Agent integrator (human)",
    primary_concern:
      "Clear install/configure path; predictable tool surface across versions.",
    category: "external_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Knows exactly which tools are exposed; can disable destructive tools; can audit every call.",
    category: "human",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "Authorization perimeter is explicit; prompt-injection blast radius is bounded; auditable.",
    category: "internal_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "Zero new state-mutation paths; tool surface is generated, not hand-maintained where possible.",
    category: "internal_team",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Knows whether/how plugin commands appear over MCP; opt-in, not automatic.",
    category: "external_team",
  },
];
const stakeholderSpecs: PrimitiveSpec[] = stakeholders.map((s) => ({
  id: s.id,
  type: "spec:Stakeholder",
  fields: { role: s.role, primary_concern: s.primary_concern, category: s.category },
}));

// ── §3 Quality Attributes ──────────────────────────────────────────────────

const qas: Array<{
  id: string;
  attribute: string;
  pressure: string;
  priority: string;
}> = [
  {
    id: "spec:qa:security",
    attribute: "Security",
    pressure:
      "Tool surface is the LLM's blast radius. Every tool is a potential prompt-injection vector.",
    priority: "primary",
  },
  {
    id: "spec:qa:auditability",
    attribute: "Auditability",
    pressure:
      "Every tool call must be reconstructable from logs (caller, args, result, validation report).",
    priority: "primary",
  },
  {
    id: "spec:qa:modifiability",
    attribute: "Modifiability",
    pressure:
      "Adding a Host method should propagate to a tool with minimal hand-coding.",
    priority: "secondary",
  },
  {
    id: "spec:qa:latency",
    attribute: "Latency",
    pressure:
      "Tool calls must complete within MCP client expectations (typically ≤ 5 s for sync tools).",
    priority: "secondary",
  },
  {
    id: "spec:qa:consistency",
    attribute: "Consistency",
    pressure:
      "Concurrent MCP + CLI + REPL access to one dataDir must not silently diverge.",
    priority: "primary",
  },
  {
    id: "spec:qa:compatibility",
    attribute: "Compatibility",
    pressure:
      "Tool names and argument shapes are a public API; breaking changes need a major bump.",
    priority: "primary",
  },
];
const qaSpecs: PrimitiveSpec[] = qas.map((q) => ({
  id: q.id,
  type: "spec:QualityAttribute",
  fields: { attribute: q.attribute, pressure: q.pressure, priority: q.priority },
}));

// ── §4 Architectural Principles ────────────────────────────────────────────

const principles: Array<{
  id: string;
  ordinal: number;
  title: string;
  statement: string;
  strength: string;
}> = [
  {
    id: "spec:prin:tool-boundary",
    ordinal: 1,
    title: "The tool boundary is the authorization perimeter.",
    statement:
      "Every state mutation reachable over MCP must pass through a Host.* method, and every tool MUST carry an explicit tier classification. Tier classification is non-bypassable.",
    strength: "MUST",
  },
  {
    id: "spec:prin:verification-on-result",
    ordinal: 2,
    title: "Verification artifacts ride with the response.",
    statement:
      "Every Tier 2 / Tier 3 success response MUST include the §7 validation report. The LLM must not have to ask for it.",
    strength: "MUST",
  },
  {
    id: "spec:prin:plugin-opt-in",
    ordinal: 3,
    title: "Plugin contributions are opt-in.",
    statement:
      "The MCP server does NOT auto-expose plugin commands. Plugin tools require both a plugin-manifest declaration AND an operator opt-in.",
    strength: "MUST",
  },
  {
    id: "spec:prin:hand-curated",
    ordinal: 4,
    title: "Hand-curated, version-pinned tool manifest.",
    statement:
      "Tools are organized into three tiers with different default exposure policies. Adding a tool is a reviewed action, not a side-effect of adding a Host method.",
    strength: "MUST",
  },
  {
    id: "spec:prin:no-eval-no-shell",
    ordinal: 5,
    title: "No eval, no shell, no raw-op tools.",
    statement:
      "The server MUST NOT expose any tool that takes raw operations, raw JSONL, or executes arbitrary code. Writes go through Host.* methods only.",
    strength: "MUST",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: {
    ordinal: p.ordinal,
    title: p.title,
    statement: p.statement,
    strength: p.strength,
  },
}));

// ── §15 ADR + §16 Trade-off Matrix ─────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:dedicated-process",
  type: "spec:Option",
  fields: {
    label:
      "Option A — Dedicated process, hand-curated manifest, three-tier classification",
    description:
      "A separate `fdpm-mcp` binary holding one Host. Tool manifest declared explicitly, organized into read-only / validating-write / destructive tiers with different default exposure policies. Plugin tools opt-in.",
    pros: [
      "Tool surface is auditable.",
      "Authorization perimeter is explicit.",
      "Adding tools is mechanical but reviewed.",
      "Plugin policy is enforceable.",
      "Reuses Core's verification artifacts directly.",
    ],
    cons: [
      "Manifest must be hand-maintained (mitigated by a CI check that flags new Host.* methods that are not classified).",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:auto-generated",
  type: "spec:Option",
  fields: {
    label: "Option B — Mechanically generated tool surface from Host's TypeScript signatures",
    description:
      "A build step introspects Host's public methods and generates one MCP tool per method. Zod schemas derived from method signatures.",
    pros: [
      "Maximum modifiability — adding a Host method auto-exposes a tool.",
      "No manifest to maintain.",
    ],
    cons: [
      "Catastrophic by default. Auto-exposes anything the maintainer adds, including methods intended only for internal composition.",
      "Tier classification is invisible.",
      "A maintainer adding a `host.dropAll()` method silently exposes it to every connected LLM.",
      "Violates the 'tool boundary as authorization perimeter' principle.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Catastrophic-by-default exposure. Violates Principle 1 and CLAUDE.md PALS-LAW.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:fdpm-mcp-subcommand",
  type: "spec:Option",
  fields: {
    label: "Option C — Single binary with `fdpm mcp` subcommand",
    description:
      "Add `fdpm mcp` to the existing CLI, mirroring `fdpm repl`. No separate process.",
    pros: [
      "One binary; smaller install footprint.",
    ],
    cons: [
      "Conflates surfaces with sharply different threat models in one process.",
      "MCP clients spawn long-lived child processes and expect a stable command line; folding it under `fdpm` complicates the spawn model and the CLI's --help surface.",
      "The cost of a separate `fdpm-mcp` binary is small; the clarity benefit is large.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Architectural-clarity grounds. The MCP threat model is different enough from the CLI's that a peer surface is the right shape.",
  },
};

const optD: PrimitiveSpec = {
  id: "spec:opt:repl-wrap",
  type: "spec:Option",
  fields: {
    label: "Option D — Wrap the REPL: spawn `fdpm repl --json --script` and translate MCP calls",
    description:
      "A thin MCP shim that converts each tool call to a REPL invocation.",
    pros: [
      "Trivial implementation; reuses everything.",
    ],
    cons: [
      "REPL is line-shaped, not tool-shaped — argument schemas are inferred from CLI parsing, not declared.",
      "No structured tool manifest for clients.",
      "Tier classification is impossible without re-implementing it on top.",
      "The contract is the wrong shape.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Contract is the wrong shape; client surface is unstable; tier classification is unrepresentable.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:mcp-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-MCP-001",
    title:
      "Build the MCP server as a dedicated process with a hand-curated tool manifest.",
    status: "proposed",
    date: "2026-05-04",
    context:
      "FDPM needs an MCP surface so LLM-driven clients (Claude Desktop, Claude Code, Cursor, custom agents) can interact with FDPM workbooks. The decision space is bounded by these forces: (a) the tool boundary is the LLM's authorization perimeter (CLAUDE.md, PALS's law) — it must be designed, not generated by accident; (b) tool names and argument shapes are a public contract; clients depend on them; (c) plugin contributions need an explicit security policy (the CLI's auto-expose policy is unsafe under MCP); (d) concurrent access with the CLI and REPL must not silently diverge; (e) the Core's invariants (§7 pipeline, §8 schema gate, JSONL log semantics) must remain the only path to state mutation.",
    decision:
      "Build the MCP server as a separate process (`fdpm-mcp`) that holds one Host and exposes a hand-curated, version-pinned tool manifest derived from Host methods. Tools are organized into three tiers (read-only, validating-write, destructive) with different default exposure policies. Plugin-contributed operations are opt-in, never auto-exposed. Transport defaults to stdio (per the MCP convention for local agents); HTTP transport is a documented option for v0.2. Every tool response includes the Core's verification artifacts (validation report, operation envelope) so the LLM cannot consume a write without seeing the verification result.",
    consequences: [
      { polarity: "positive", text: "Auditable tool surface." },
      { polarity: "positive", text: "Explicit authorization perimeter (Principle 1)." },
      { polarity: "positive", text: "Plugin policy enforceable (per-plugin opt-in)." },
      {
        polarity: "positive",
        text: "Reuses Core verification directly — no re-implementation of the §7 pipeline.",
      },
      {
        polarity: "positive",
        text: "Two peer surfaces (REPL and MCP) with clear responsibilities.",
      },
      {
        polarity: "negative",
        text: "Manifest is hand-maintained (mitigated by CI check that flags unclassified Host methods).",
      },
      {
        polarity: "negative",
        text: "Two binaries to ship instead of one (`fdpm`, `fdpm-mcp`).",
      },
      {
        polarity: "neutral",
        text: "No taxonomy changes — reuses existing `permission` category with structured `evidence.reason`.",
      },
      {
        polarity: "neutral",
        text: "Adds an MCP-specific audit log file separate from the operation log.",
      },
      {
        polarity: "neutral",
        text: "Adds an opt-in dependency on a SPEC-PLUGGABLE-ARCHITECTURE amendment for plugin-tool support; v0.1 ships without it.",
      },
    ],
    compliance_checks: [
      "CI: every public Host.* method is either present in the MCP manifest with a declared tier OR explicitly listed in the 'intentionally not exposed' set. No silent omissions.",
      "CI: no MCP tool handler may import host.persistence directly; all writes must go through Host.* methods.",
      "CI: no tool module imports node:child_process, node:vm, eval, or Function.",
      "Test: every Tier 2 / Tier 3 success response includes a validation_report.",
      "Test: Tier 3 tools refuse with `permission` envelope when destructive mode is off.",
      "Test: schema-fuzz harness — advertised JSON Schema accepts every input the runtime Zod validator accepts.",
    ],
    revisit_signals: [
      "If plugin authors routinely complain about the opt-in model and the security review burden is well-understood, consider opt-out by tier (read-only auto-expose, others opt-in).",
      "If a streaming use case (long-running validate / render) becomes load-bearing, revisit the request/response-only constraint.",
      "FIRED 2026-08-31: a network-deployed MCP server was required for Claude Connectors and ChatGPT. `fdpm-mcp-http` ships the Streamable HTTP transport, an OAuth 2.1 resource-server posture (RFC 9728 metadata, RFC 7662 introspection, RFC 8707 audience binding), scope-based authorization, and per-tenant Host isolation. The stdio-only posture is retired.",
    ],
  },
};

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:effort",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Implementation effort",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "M" },
        { option_id: "spec:opt:auto-generated", value: "S" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "M" },
        { option_id: "spec:opt:repl-wrap", value: "XS" },
      ],
    },
  },
  {
    id: "spec:tx:perimeter",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Authorization perimeter clarity",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "Explicit (3 tiers)" },
        { option_id: "spec:opt:auto-generated", value: "None (mechanical)" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "Explicit" },
        { option_id: "spec:opt:repl-wrap", value: "Inherits REPL (none for MCP)" },
      ],
    },
  },
  {
    id: "spec:tx:plugin-policy",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Plugin policy enforceable",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "Yes" },
        { option_id: "spec:opt:auto-generated", value: "No" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "Yes" },
        { option_id: "spec:opt:repl-wrap", value: "No" },
      ],
    },
  },
  {
    id: "spec:tx:surface-stability",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Tool-surface stability across versions",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "High (hand-curated)" },
        { option_id: "spec:opt:auto-generated", value: "Low (drifts with Host)" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "High" },
        { option_id: "spec:opt:repl-wrap", value: "Inferred from CLI; brittle" },
      ],
    },
  },
  {
    id: "spec:tx:internal-leak",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Risk of accidentally exposing internals",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "Low" },
        { option_id: "spec:opt:auto-generated", value: "High" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "Low" },
        { option_id: "spec:opt:repl-wrap", value: "Medium" },
      ],
    },
  },
  {
    id: "spec:tx:pals-fit",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Fits CLAUDE.md / PALS's law",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "Yes" },
        { option_id: "spec:opt:auto-generated", value: "Violates ('tool boundary')" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "Yes" },
        { option_id: "spec:opt:repl-wrap", value: "Validation report inferred" },
      ],
    },
  },
  {
    id: "spec:tx:tco",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Total cost of ownership",
      cells: [
        { option_id: "spec:opt:dedicated-process", value: "Medium" },
        { option_id: "spec:opt:auto-generated", value: "Low to build, high to operate" },
        { option_id: "spec:opt:fdpm-mcp-subcommand", value: "Medium" },
        { option_id: "spec:opt:repl-wrap", value: "Low to build, low value" },
      ],
    },
  },
];

// ── §14 Quality-Attribute Scenarios ────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:destructive-gating",
    type: "spec:QAScenario",
    fields: {
      title: "Security — destructive tool gating",
      source:
        "An LLM-driven MCP client (any client; possibly compromised by indirect prompt injection).",
      stimulus: "Calls `fdpm.workbook.delete` with a valid workbook_id.",
      environment:
        "Server started with default config (destructive tools NOT enabled).",
      artifact: "MCP server's authorization gate.",
      response:
        "Server returns `isError: true` with `structuredContent.error.category = \"permission\"` and `evidence.reason = \"destructive_disabled\"`; no operation is appended to the log; no workbook state is mutated; the call is recorded in the audit log.",
      response_measure:
        "100 % of unauthorized destructive calls are refused. Zero state mutation. Audit-log entry present within one tool-call boundary.",
    },
  },
  {
    id: "spec:qas:auditability",
    type: "spec:QAScenario",
    fields: {
      title: "Auditability — reconstruction from logs",
      source: "Security reviewer, post-incident.",
      stimulus: "Question: 'Which MCP client created this primitive?'",
      environment: "Audit log retained; operation log retained.",
      artifact: "mcp-audit.jsonl + operation JSONL.",
      response:
        "Reviewer correlates by timestamp + args_hash + the operation envelope's id field.",
      response_measure:
        "100 % of MCP-originated mutations can be traced to: (a) which session, (b) which tool, (c) the validation result. Lookup time ≤ O(N) over the audit log.",
    },
  },
  {
    id: "spec:qas:modifiability",
    type: "spec:QAScenario",
    fields: {
      title: "Modifiability — adding a Host method",
      source: "Core maintainer.",
      stimulus:
        "Adds a new method `host.duplicatePrimitive(...)` and wants to expose it as `fdpm.primitive.duplicate`.",
      environment: "Server v0.1.",
      artifact: "MCP tool registry.",
      response:
        "Maintainer adds a new module under `fdpm-cli/src/mcp/tools/`, declares its Zod input/output, lists it in the manifest with a tier. No protocol change, no client change.",
      response_measure:
        "Adding a tool requires touching exactly one new file and one manifest entry. Zero changes to transport, error model, or authorization code.",
    },
  },
  {
    id: "spec:qas:latency",
    type: "spec:QAScenario",
    fields: {
      title: "Latency — Tier 1 read",
      source: "LLM agent.",
      stimulus:
        "Calls `fdpm.primitive.search` against a representative workbook on the standard fixture set.",
      environment: "Warm Host; local data dir; no concurrent writer.",
      artifact: "MCP server tool dispatch.",
      response: "Returns the full search result.",
      response_measure:
        "Same threshold as SPEC-REPL §14.1: dispatch p50 ≤ 25 % of one-shot CLI p50 for the same operation on the same data dir, measured by the test harness. Specific millisecond figures are not asserted in this SPEC; the ratio is the contract.",
    },
  },
];

// ── Tools (the curated MCP surface) ────────────────────────────────────────

const toolEntries: Array<{
  id: string;
  tool_name: string;
  tier: "read_only" | "validating_write" | "destructive";
  exposure: "always" | "default_on" | "opt_in" | "never";
  description: string;
  backed_by: string;
}> = [
  // ── Tier 1: read-only (always exposed) ─────────────────────────
  {
    id: "spec:tool:version",
    tool_name: "fdpm.version",
    tier: "read_only",
    exposure: "always",
    description: "Return build/spec version metadata for the running server.",
    backed_by: "buildVersionCommand",
  },
  {
    id: "spec:tool:health-liveness",
    tool_name: "fdpm.health.liveness",
    tier: "read_only",
    exposure: "always",
    description: "Liveness probe — is the server process up.",
    backed_by: "buildHealthCommand → liveness",
  },
  {
    id: "spec:tool:health-readiness",
    tool_name: "fdpm.health.readiness",
    tier: "read_only",
    exposure: "always",
    description: "Readiness probe — is the Host loaded and ready to serve.",
    backed_by: "buildHealthCommand → readiness",
  },
  {
    id: "spec:tool:profile-list",
    tool_name: "fdpm.profile.list",
    tier: "read_only",
    exposure: "always",
    description: "List registered domain profiles.",
    backed_by: "host.profiles.listRaw()",
  },
  {
    id: "spec:tool:profile-get",
    tool_name: "fdpm.profile.get",
    tier: "read_only",
    exposure: "always",
    description: "Look up a domain profile by id.",
    backed_by: "host.profiles (lookup by id)",
  },
  {
    id: "spec:tool:workbook-list",
    tool_name: "fdpm.workbook.list",
    tier: "read_only",
    exposure: "always",
    description: "List all workbooks in the current data dir.",
    backed_by: "host.listProjects()",
  },
  {
    id: "spec:tool:workbook-get",
    tool_name: "fdpm.workbook.get",
    tier: "read_only",
    exposure: "always",
    description: "Fetch a workbook's full slice (workbook + primitives + relations + templates).",
    backed_by: "host.getProject(id)",
  },
  {
    id: "spec:tool:workbook-diff",
    tool_name: "fdpm.workbook.diff",
    tier: "read_only",
    exposure: "always",
    description: "Diff a workbook against another revision/snapshot.",
    backed_by: "host.diffProject({...})",
  },
  {
    id: "spec:tool:primitive-search",
    tool_name: "fdpm.primitive.search",
    tier: "read_only",
    exposure: "always",
    description: "Search primitives by type, field, or text query.",
    backed_by: "host.searchPrimitives(...)",
  },
  {
    id: "spec:tool:relation-search",
    tool_name: "fdpm.relation.search",
    tier: "read_only",
    exposure: "always",
    description: "Search relations by type or endpoints.",
    backed_by: "host.searchRelations(...)",
  },
  {
    id: "spec:tool:structure-describe",
    tool_name: "fdpm.structure.describe",
    tier: "read_only",
    exposure: "always",
    description: "Describe the structural surface (types, relations, validations) of a profile.",
    backed_by: "fdpm-cli/src/commands/structure.ts handler",
  },
  {
    id: "spec:tool:validate-workbook",
    tool_name: "fdpm.validate.workbook",
    tier: "read_only",
    exposure: "always",
    description: "Run the §7 pipeline against a workbook without persisting any change.",
    backed_by: "host.validateProject(...) (no persistence)",
  },
  {
    id: "spec:tool:log-tail",
    tool_name: "fdpm.log.tail",
    tier: "read_only",
    exposure: "always",
    description: "Return the bounded tail of a workbook's operation log.",
    backed_by: "host.getLog(...) (bounded)",
  },
  {
    id: "spec:tool:plugin-list",
    tool_name: "fdpm.plugin.list",
    tier: "read_only",
    exposure: "always",
    description: "List loaded plugins (manifest projection).",
    backed_by: "host.plugins (manifest projection)",
  },
  {
    id: "spec:tool:render-preview",
    tool_name: "fdpm.render.preview",
    tier: "read_only",
    exposure: "always",
    description: "Render-preview without persisting; read-only renderer invocation.",
    backed_by: "fdpm-cli/src/commands/render.ts handler (read-only)",
  },

  // ── Tier 2: validating-write (exposed by default) ──────────────
  {
    id: "spec:tool:profile-register",
    tool_name: "fdpm.profile.register",
    tier: "validating_write",
    exposure: "default_on",
    description:
      "Register a domain profile with the Host. Input is an opaque `profile` object; the DomainProfile JSON Schema is served by `fdpm://schema/profile` and enforced server-side (§8.5). Malformed → Tier-2 rejection with `core:profile-schema` findings.",
    backed_by: "host.registerProfile(profile, opts)",
  },
  {
    id: "spec:tool:workbook-create",
    tool_name: "fdpm.workbook.create",
    tier: "validating_write",
    exposure: "default_on",
    description: "Create a new workbook.",
    backed_by: "host.createProject({...})",
  },
  {
    id: "spec:tool:primitive-create",
    tool_name: "fdpm.primitive.create",
    tier: "validating_write",
    exposure: "default_on",
    description: "Create a primitive in a workbook.",
    backed_by: "host.createPrimitive(workbook_id, primitive)",
  },
  {
    id: "spec:tool:primitive-replace",
    tool_name: "fdpm.primitive.replace",
    tier: "validating_write",
    exposure: "default_on",
    description: "Replace a primitive's full document.",
    backed_by: "host.replacePrimitive(workbook_id, primitive)",
  },
  {
    id: "spec:tool:primitive-patch",
    tool_name: "fdpm.primitive.patch",
    tier: "validating_write",
    exposure: "default_on",
    description: "Patch one or more fields on a primitive.",
    backed_by: "host.patchPrimitive(workbook_id, patch)",
  },
  {
    id: "spec:tool:primitive-field-patch",
    tool_name: "fdpm.primitive.field_patch",
    tier: "validating_write",
    exposure: "default_on",
    description: "Targeted field-level patch with structural addressing.",
    backed_by: "host.fieldPatchPrimitive(workbook_id, payload)",
  },
  {
    id: "spec:tool:relation-create",
    tool_name: "fdpm.relation.create",
    tier: "validating_write",
    exposure: "default_on",
    description: "Create a relation between two primitives.",
    backed_by: "host.createRelation(workbook_id, relation)",
  },
  {
    id: "spec:tool:relation-replace",
    tool_name: "fdpm.relation.replace",
    tier: "validating_write",
    exposure: "default_on",
    description: "Replace a relation's full document.",
    backed_by: "host.replaceRelation(workbook_id, relation)",
  },
  {
    id: "spec:tool:relation-patch",
    tool_name: "fdpm.relation.patch",
    tier: "validating_write",
    exposure: "default_on",
    description: "Patch one or more fields on a relation.",
    backed_by: "host.patchRelation(workbook_id, patch)",
  },
  {
    id: "spec:tool:scope-reorder",
    tool_name: "fdpm.scope.reorder",
    tier: "validating_write",
    exposure: "default_on",
    description: "Reorder children within a scope.",
    backed_by: "host.reorder(workbook_id, scope_id, ordering)",
  },
  {
    id: "spec:tool:scope-reparent",
    tool_name: "fdpm.scope.reparent",
    tier: "validating_write",
    exposure: "default_on",
    description: "Move a primitive to a new parent scope.",
    backed_by: "host.reparent(workbook_id, payload)",
  },
  {
    id: "spec:tool:template-apply",
    tool_name: "fdpm.template.apply",
    tier: "validating_write",
    exposure: "default_on",
    description: "Apply a template to materialize primitives/relations.",
    backed_by: "fdpm-cli/src/commands/template.ts handler",
  },
  {
    id: "spec:tool:transfer-import",
    tool_name: "fdpm.transfer.import",
    tier: "validating_write",
    exposure: "default_on",
    description: "Import a ProjectTransfer envelope (atomic, validated).",
    backed_by: "fdpm-cli/src/commands/transfer.ts handler",
  },
  {
    id: "spec:tool:host-migrate-normalize",
    tool_name: "fdpm.host.migrate_normalize",
    tier: "validating_write",
    exposure: "default_on",
    description: "Run the metadata-normalization migration (guarded write).",
    backed_by: "host.migrateNormalizeMetadata({...})",
  },

  // ── Tier 3: destructive (off by default; opt-in only) ──────────
  {
    id: "spec:tool:profile-retire",
    tool_name: "fdpm.profile.retire",
    tier: "destructive",
    exposure: "opt_in",
    description:
      "Retire one profile revision (registry entry + persisted file). Refused while a workbook binds it, a profile extends it, or a plugin owns it. Accepts dry_run (returns those blockers as `would_affect`) and requires idempotency_key otherwise (§8.7). No operation-log entry.",
    backed_by: "host.retireProfile(ref) / host.profileRetireBlockers(id, version)",
  },
  {
    id: "spec:tool:workbook-delete",
    tool_name: "fdpm.workbook.delete",
    tier: "destructive",
    exposure: "opt_in",
    description: "Delete a workbook. Accepts dry_run (preview) and requires idempotency_key otherwise (§8.7).",
    backed_by: "host.deleteProject(workbook_id)",
  },
  {
    id: "spec:tool:primitive-delete",
    tool_name: "fdpm.primitive.delete",
    tier: "destructive",
    exposure: "opt_in",
    description: "Delete a primitive. Accepts dry_run (preview) and requires idempotency_key otherwise (§8.7).",
    backed_by: "host.deletePrimitive(workbook_id, id)",
  },
  {
    id: "spec:tool:relation-delete",
    tool_name: "fdpm.relation.delete",
    tier: "destructive",
    exposure: "opt_in",
    description: "Delete a relation. Accepts dry_run (preview) and requires idempotency_key otherwise (§8.7).",
    backed_by: "host.deleteRelation(workbook_id, id)",
  },
  {
    id: "spec:tool:plugin-activate",
    tool_name: "fdpm.plugin.activate",
    tier: "destructive",
    exposure: "opt_in",
    description: "Activate a plugin (loads code, registers capabilities).",
    backed_by: "host.plugins.activate(...) (via plugin runtime)",
  },
  {
    id: "spec:tool:plugin-deactivate",
    tool_name: "fdpm.plugin.deactivate",
    tier: "destructive",
    exposure: "opt_in",
    description: "Deactivate a plugin.",
    backed_by: "host.plugins.deactivate(...) (via plugin runtime)",
  },

  // ── Intentionally NOT exposed (`exposure: "never"`) ────────────
  {
    id: "spec:tool:host-reload",
    tool_name: "fdpm.host.reload",
    tier: "destructive",
    exposure: "never",
    description:
      "Operator action only; not for LLMs. Reload Host state from disk (e.g., after out-of-band CLI write).",
    backed_by:
      "host.reload() — operator-only via SIGHUP on macOS/Linux, Ctrl+Break (SIGBREAK) on Windows, or process restart",
  },
  {
    id: "spec:tool:persistence-write-raw",
    tool_name: "fdpm.persistence.write_raw",
    tier: "destructive",
    exposure: "never",
    description:
      "Bypasses §7/§8 — explicitly forbidden. Listed to make the prohibition machine-checkable.",
    backed_by: "host.persistence (forbidden direct access)",
  },
];

const toolSpecs: PrimitiveSpec[] = toolEntries.map((t) => {
  const fields: Record<string, unknown> = {
    tool_name: t.tool_name,
    tier: t.tier,
    backed_by: t.backed_by,
    description: t.description,
    exposure: t.exposure,
  };
  // Tier 2 / Tier 3 tools must declare input/output schema refs
  // (spec:val:tool-has-schemas). Schemas live alongside the tool
  // module under fdpm-cli/src/mcp/tools/<slug>.ts.
  if (t.tier !== "read_only") {
    const baseSlug = t.tool_name.replace(/^fdpm\./, "").replace(/\./g, "-");
    fields.input_schema_ref = `fdpm-cli/src/mcp/tools/${baseSlug}.ts#InputSchema`;
    fields.output_schema_ref = `fdpm-cli/src/mcp/tools/${baseSlug}.ts#OutputSchema`;
  }
  return {
    id: t.id,
    type: "spec:Tool",
    fields,
  };
});

// ── Configuration entries (§6 / §12.1) ────────────────────────────────────

const configEntries: PrimitiveSpec[] = [
  {
    id: "spec:cfg:enable-destructive",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_ENABLE_DESTRUCTIVE",
      default: "0",
      purpose:
        "Enables Tier 3 (destructive) tool exposure. Default off — operator must make an affirmative choice.",
      scope: "mcp",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:enable-plugins",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_ENABLE_PLUGINS",
      default: "",
      purpose:
        "Comma-separated list of plugin ids whose declared MCP tools are exposed. Empty = no plugin tools.",
      scope: "mcp",
      kind: "csv",
    },
  },
  {
    id: "spec:cfg:max-calls",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_MAX_CALLS_PER_MINUTE",
      default: "120",
      purpose:
        "Per-session rate limit for tool calls. Server-side enforcement; client hints not trusted.",
      scope: "mcp",
      kind: "integer",
    },
  },
  {
    id: "spec:cfg:require-confirmation",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN",
      default: "0",
      purpose:
        "Opt-in mode requiring a per-server-session confirmation token on Tier 2 / Tier 3 calls. High-trust deployments.",
      scope: "mcp",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:audit-full-args",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_AUDIT_FULL_ARGS",
      default: "0",
      purpose:
        "When true, audit log records full args instead of args_hash. Debugging only; may capture sensitive payloads.",
      scope: "mcp",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:catalog-budget",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_CATALOG_BUDGET_BYTES",
      default: "27000",
      purpose:
        "Cap on the UTF-8 byte size of the advertised tools/list catalog (Core + plugin tools). Boot refuses with exit 2 when exceeded. Raises the total only; the 2,000-byte per-tool limit is not tunable (§8.5).",
      scope: "mcp",
      kind: "integer",
    },
  },
  {
    id: "spec:cfg:max-resource-bytes",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_MAX_RESOURCE_BYTES",
      default: "1048576",
      purpose:
        "Cap on the bytes one `resources/read` may serve, measured on the payload that crosses the wire (base64 length for a blob, UTF-8 bytes for text). Over-cap reads are refused with `quota` / `evidence.reason: \"resource_too_large\"`. A malformed value is a boot refusal, not a fallback to the default.",
      scope: "mcp",
      kind: "integer",
    },
  },
  {
    id: "spec:cfg:max-result-bytes",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_MCP_MAX_RESULT_BYTES",
      default: "32768",
      purpose:
        "Cap on the bytes one Tier-1 `tools/call` result may serve. Over-cap read results are refused with `quota` / `evidence.reason: \"result_too_large\"`, carrying the measured size, the cap, and the tool's declared narrowing arguments. Tier 2/3 results are measured into the audit log but never refused: the append has already happened, and a refusal there is indistinguishable from a rejected write. A malformed value is a boot refusal.",
      scope: "mcp",
      kind: "integer",
    },
  },
  {
    id: "spec:cfg:data-dir",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_DATA_DIR",
      default: "",
      purpose:
        "Inherited from Core: data directory the MCP server's Host operates against. Same semantics as one-shot CLI.",
      scope: "core",
      kind: "path",
    },
  },
];

// ── Error categories (§9) ─────────────────────────────────────────────────
// The MCP server reuses the existing FDPMException taxonomy; we only declare
// the categories MCP additionally documents an `evidence.reason` for.

const errorCategories: PrimitiveSpec[] = [
  {
    id: "spec:err:permission",
    type: "spec:ErrorCategory",
    fields: {
      category: "permission",
      when_used:
        "Tier-3 gating refusal (`evidence.reason: \"destructive_disabled\"`) and §7 staleness refusal (`evidence.reason: \"stale_state\"`). MCP introduces NO new categories — both reuse `permission`.",
      evidence_keys: ["reason"],
    },
  },
  {
    id: "spec:err:validation",
    type: "spec:ErrorCategory",
    fields: {
      category: "validation",
      when_used:
        "§7 pipeline rejected the operation. NB: in MCP shape, this is reported as `isError: false, ok: false` in the structuredContent payload — the protocol call succeeded, the operation was rejected.",
      evidence_keys: ["findings"],
    },
  },
  {
    id: "spec:err:quota",
    type: "spec:ErrorCategory",
    fields: {
      category: "quota",
      when_used:
        "A payload exceeded a served-byte ceiling and was refused rather than returned: `evidence.reason: \"resource_too_large\"` from `resources/read` (§9.6), `evidence.reason: \"result_too_large\"` from a Tier-1 `tools/call` (§8.8). Evidence carries `bytes`, `cap`, and the env var that raises the cap; the tool refusal also carries `narrowing`, the arguments that produce a smaller result.",
      evidence_keys: ["reason", "bytes", "cap", "env", "narrowing"],
    },
  },
  {
    id: "spec:err:internal",
    type: "spec:ErrorCategory",
    fields: {
      category: "internal",
      when_used:
        "Host or tool handler raised an unexpected exception. Surfaced as `isError: true` with category `internal`. Exception is logged in the audit trail.",
    },
  },
];

// ── §17 Invariants ────────────────────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:no-write-bypass",
    type: "spec:Invariant",
    fields: {
      label: "No write-path bypasses Host.*.",
      statement:
        "Every state-mutating MCP tool's handler MUST go through one of the Host.* methods listed in §5.2 / §5.3. Direct access to host.persistence or host.store from a tool module is a CI-failing offense.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/src/mcp/tools/",
    },
  },
  {
    id: "spec:inv:reload-notifies-list-changed",
    type: "spec:Invariant",
    fields: {
      label: "A successful reload tells the client its cached lists are stale.",
      statement:
        "Every successful `Host.reload()` MUST be followed by `notifications/resources/list_changed` and `notifications/prompts/list_changed`, and the corresponding `listChanged` capabilities MUST be declared at `initialize`. A reload that rejects MUST emit neither and MUST NOT clear the freshness map.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/tests/mcp/reload-notify.test.ts",
    },
  },
  {
    id: "spec:inv:validation-report-mandatory",
    type: "spec:Invariant",
    fields: {
      label: "Validation report rides every Tier 2 / Tier 3 success.",
      statement:
        "Every Tier 2 / Tier 3 successful tool call MUST place `validation_report` in `structuredContent`. A success without a validation report is a contract violation.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/tests/mcp/contract/",
    },
  },
  {
    id: "spec:inv:every-payload-measured",
    type: "spec:Invariant",
    fields: {
      label: "Every payload the server serves is measured against a ceiling.",
      statement:
        "Both content-bearing surfaces measure what they are about to serve and record it. `resources/read` refuses over `FDPM_MCP_MAX_RESOURCE_BYTES`; a Tier-1 `tools/call` refuses over `FDPM_MCP_MAX_RESULT_BYTES`; Tier 2/3 results are measured but served. Every completed handler run records `result_bytes` in the audit log, refused or served, so an oversize failure is visible in the server's own telemetry rather than only in the client's error message.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/tests/mcp/result-budget.test.ts",
    },
  },
  {
    id: "spec:inv:no-eval-no-shell",
    type: "spec:Invariant",
    fields: {
      label: "No eval, no shell, no vm.",
      statement:
        "No tool module may import node:child_process, node:vm, eval, or Function. CI scans tool-module source and fails the build on any match.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/src/mcp/tools/",
    },
  },
  {
    id: "spec:inv:tier-3-default-off",
    type: "spec:Invariant",
    fields: {
      label: "Tier 3 dispatch is off by default; advertisement is unconditional.",
      statement:
        "Tier 3 tools MUST appear in the advertised manifest in both states. Without an explicit operator opt-in (FDPM_MCP_ENABLE_DESTRUCTIVE=1 or --enable-destructive), every Tier 3 tool's advertised description MUST begin with the §8.3 disabled banner, and the server MUST refuse to dispatch them with permission/destructive_disabled. With opt-in, the banner MUST be absent and dispatch MUST execute.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/mcp/dispatch.ts",
    },
  },
  {
    id: "spec:inv:audit-every-call",
    type: "spec:Invariant",
    fields: {
      label: "Every tool invocation is audited.",
      statement:
        "Every dispatched tool call (success, validation-fail, or error) appends one JSONL entry to mcp-audit.jsonl. Missing audit entries are treated as a host defect.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/persistence/mcp-audit-log.ts",
    },
  },
];

// ── §17 Requirements ──────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:r-001",
    type: "spec:Requirement",
    fields: {
      label: "Dedicated MCP binary",
      statement:
        "The MCP surface MUST be a separate executable (`fdpm-mcp`) holding one Host. The CLI does NOT gain an `fdpm mcp` subcommand.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "fdpm-cli/src/bin/fdpm-mcp.ts",
    },
  },
  {
    id: "spec:req:r-002",
    type: "spec:Requirement",
    fields: {
      label: "Three-tier tool classification",
      statement:
        "Every tool MUST declare a tier in {read_only, validating_write, destructive}. Default-exposure policy is determined by tier.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "fdpm-cli/src/mcp/manifest.ts",
    },
  },
  {
    id: "spec:req:r-003",
    type: "spec:Requirement",
    fields: {
      label: "Validation report on Tier 2 / Tier 3 success",
      statement:
        "Every successful Tier 2 / Tier 3 response MUST include the §7 validation report in structuredContent.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/mcp/contract/validation-report.test.ts",
    },
  },
  {
    id: "spec:req:r-013",
    type: "spec:Requirement",
    fields: {
      label: "protocol revision targeting is explicit and reviewed",
      statement:
        "The server MUST advertise the protocol revision the installed SDK supports (2025-11-25 as of 2026-08-31) and MUST NOT claim conformance to a revision it does not implement. Revision 2026-07-28 makes the protocol stateless — removing the initialize handshake (SEP-2575) and the Mcp-Session-Id header (SEP-2567), carrying capabilities in _meta per request, mandating server/discover, requiring caching hints on six operations and the Mcp-Method / Mcp-Name headers, and withdrawing SSE resumption in favour of the Tasks extension. Migration is deferred until the v2 TypeScript SDK is stable and the target clients accept the revision; it MUST NOT be attempted against a pre-release SDK. When it happens, the per-session model and the ingress session affinity are both retired.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "node_modules/@modelcontextprotocol/sdk LATEST_PROTOCOL_VERSION; MANUAL.md §23",
    },
  },
  {
    id: "spec:req:r-014",
    type: "spec:Requirement",
    fields: {
      label: "advertise the minimum scope set, elevate on challenge",
      statement:
        "Protected resource metadata and the 401 challenge MUST advertise the minimum scope set that permits basic functionality, defaulting to the read scope alone, with the challenge carrying a `scope` parameter naming what to request. Advertisement is separate from enforcement: every tier is gated on its scope regardless of what is advertised.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/http/config.test.ts, fdpm-cli/tests/http/endpoints.test.ts",
    },
  },
  {
    id: "spec:req:r-015",
    type: "spec:Requirement",
    fields: {
      label: "bind loopback by default; validate both audience and issuer",
      statement:
        "The HTTP server MUST bind 127.0.0.1 unless an operator explicitly opts out, so a local run is not exposed by accident. A bearer token MUST be rejected unless both its audience matches this server's resource identifier (RFC 8707) and its issuer, when present, matches the configured authorization server. Audience alone is insufficient: anyone controlling any authorization server can mint a token naming this server as its audience.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/http/token-verifier.test.ts, fdpm-cli/tests/http/config.test.ts",
    },
  },
  {
    id: "spec:req:r-004",
    type: "spec:Requirement",
    fields: {
      label: "two transports: stdio locally, Streamable HTTP remotely",
      statement:
        "The server MUST support stdio (`fdpm-mcp`) and Streamable HTTP (`fdpm-mcp-http`). Both MUST build their MCP server from the same factory so the tool surface cannot diverge. `fdpm-mcp` MUST still refuse HTTP flags, pointing at `fdpm-mcp-http` rather than at a deferral. On the HTTP transport an unauthenticated call MUST be answered 401 with a `WWW-Authenticate: Bearer resource_metadata=\"...\"` pointer.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/http/e2e.test.ts, fdpm-cli/tests/http/endpoints.test.ts",
    },
  },
  {
    id: "spec:req:r-005",
    type: "spec:Requirement",
    fields: {
      label: "Plugin tools opt-in",
      statement:
        "The MCP server MUST NOT auto-expose plugin commands. Plugin tools require both a plugin manifest declaration (mcp_tool capability) AND an operator opt-in via FDPM_MCP_ENABLE_PLUGINS.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "fdpm-cli/src/mcp/plugin-tools.ts",
    },
  },
  {
    id: "spec:req:r-006",
    type: "spec:Requirement",
    fields: {
      label: "Schema-typed inputs",
      statement:
        "Every tool MUST declare a Zod input schema. The advertised JSON Schema MUST agree with the runtime Zod validator (CI fuzzer).",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "fdpm-cli/tests/mcp/schema-fuzz.test.ts",
    },
  },
  {
    id: "spec:req:r-007",
    type: "spec:Requirement",
    fields: {
      label: "Per-session rate limit",
      statement:
        "The server MUST enforce a per-session call rate limit (FDPM_MCP_MAX_CALLS_PER_MINUTE; default 120). Excess calls MUST return `permission` with `evidence.reason: \"rate_limited\"`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/mcp/rate-limit.test.ts",
    },
  },
  {
    id: "spec:req:r-008",
    type: "spec:Requirement",
    fields: {
      label: "Append-only audit log",
      statement:
        "Every tool invocation MUST append one JSONL entry to $FDPM_DATA_DIR/mcp-audit.jsonl with timestamp, session, tool, args_hash, ok, duration_ms, validation_status.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/mcp/audit.test.ts",
    },
  },
  {
    id: "spec:req:r-009",
    type: "spec:Requirement",
    fields: {
      label: "Freshness check before Tier 2 / Tier 3 dispatch",
      statement:
        "The server MUST perform a per-call freshness check (per SPEC-REPL §7.2 mechanism). On stale state, refuse with `permission` + `evidence.reason: \"stale_state\"`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/mcp/freshness.test.ts",
    },
  },
  {
    id: "spec:req:r-010",
    type: "spec:Requirement",
    fields: {
      label: "No new error categories",
      statement:
        "The MCP server MUST reuse the existing FDPMException taxonomy without extension. Tier-3 gating and staleness reuse `permission` with structured `evidence.reason`.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "fdpm-cli/src/core/errors/fdpm-exception.ts",
    },
  },
  {
    id: "spec:req:r-011",
    type: "spec:Requirement",
    fields: {
      label: "Bounded tool results",
      statement:
        "A Tier-1 tool result larger than `FDPM_MCP_MAX_RESULT_BYTES` MUST be refused with `quota` / `evidence.reason: \"result_too_large\"` and MUST NOT be truncated: a truncated result is a partial answer the caller cannot distinguish from a complete one. The refusal MUST carry the measured `bytes`, the `cap`, and — for every tool whose result size the caller can influence — the arguments that narrow it. Tier 2/3 results MUST NOT be refused on size, because the operation has already been appended.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "fdpm-cli/tests/mcp/result-budget.test.ts",
    },
  },
];

// ── §18 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion:
        "`fdpm-mcp` binary boots, advertises the Tier 1 manifest, and responds to `initialize` over stdio.",
      status: "open",
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion:
        "Every Tier 2 success response carries a populated validation_report; verified by integration test.",
      status: "open",
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "Tier 3 tools are advertised in both states. When `FDPM_MCP_ENABLE_DESTRUCTIVE` is unset, every Tier 3 tool's description begins with the disabled-banner string defined in §8.3 and dispatch refuses with `permission` + `evidence.reason: \"destructive_disabled\"`. When set, the banner is absent and dispatch executes normally.",
      status: "open",
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "CI scan of `fdpm-cli/src/mcp/tools/` rejects any import of host.persistence, host.store, node:child_process, node:vm, eval, Function.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "Schema-fuzz harness: 10⁴ inputs sampled from the advertised JSON Schema all pass the runtime Zod validator.",
      status: "open",
    },
  },
  {
    id: "spec:ac:6",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 6,
      criterion:
        "Audit log records 100 % of dispatched tool calls under a load of 10³ rapid Tier 1/2 calls.",
      status: "open",
    },
  },
  {
    id: "spec:ac:7",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 7,
      criterion:
        "Plugin-tools end-to-end: a test plugin declaring an `mcp_tool` capability is exposed only when its id is listed in `FDPM_MCP_ENABLE_PLUGINS`.",
      status: "open",
    },
  },
];

// ── §18 Conformance items ──────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "Tier 3 default-disabled enforced server-side (advertised, dispatch-gated)",
      procedure:
        "Start `fdpm-mcp` with default config. Call `tools/list` and confirm `fdpm.workbook.delete` is present with its description prefixed by the §8.3 disabled banner. Then send an `fdpm.workbook.delete` tool call with a valid workbook_id.",
      expected:
        "tools/list shows the tool with banner-prefixed description. Dispatch response: isError=true, structuredContent.error.category='permission', evidence.reason='destructive_disabled'. Operation log unchanged. Audit log records the refusal. Restart with `--enable-destructive`: tools/list now returns the tool with NO banner; dispatch executes normally.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Validation report on Tier 2 success",
      procedure:
        "Call `fdpm.primitive.create` with a well-formed primitive that passes validation.",
      expected:
        "structuredContent contains { ok: true, operation: {...}, validation_report: { status: 'pass', findings: [] }, post_state_summary: {...} }.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Validation rejection surfaces with isError=false",
      procedure:
        "Call `fdpm.primitive.create` with a primitive that violates a §7 rule (e.g., max_length).",
      expected:
        "isError=false, structuredContent.ok=false, validation_report.status='fail' with findings populated. The protocol call succeeded; the operation was rejected.",
    },
  },
  {
    id: "spec:conf:4",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 4,
      name: "Stale-state refusal on concurrent CLI write",
      procedure:
        "While the MCP server is running, run a `fdpm` CLI command that mutates the workbook. Then issue a Tier 2 MCP call against the same workbook.",
      expected:
        "Tier 2 call returns isError=true with category='permission' and evidence.reason='stale_state'. After the native reload signal — SIGHUP on macOS/Linux or Ctrl+Break (SIGBREAK) on Windows — triggers Host.reload(), the call succeeds.",
    },
  },
  {
    id: "spec:conf:5",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 5,
      name: "HTTP transport refusal in v0.1",
      procedure: "Start `fdpm-mcp --http-port 8080` (or any HTTP transport flag).",
      expected:
        "Process refuses to start with a clear message pointing to SPEC-MCP-SERVER §6.1 and v0.2 deferral.",
    },
  },
  {
    id: "spec:conf:6",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 6,
      name: "Tool-result ceiling refuses a read and names the smaller call",
      procedure:
        "Start `fdpm-mcp` with default config against a data dir holding a profile whose full form exceeds 32,768 B. Call `fdpm.profile.get` with only `profile_id`. Then repeat with `view: \"types\"`, and — for a profile with hundreds of types — with `view: \"type_ids\"`. Read `fdpm.health` and the audit report.",
      expected:
        "The first call returns isError=true, category `quota`, `evidence.reason: \"result_too_large\"`, and `evidence.narrowing` listing the views and `fdpm.profile.type_info`; nothing is returned in place of the profile. The narrowed calls succeed and carry the `_view` marker. `fdpm.health` reports `max_result_bytes`. The audit log's complete entry for the refused call carries `result_bytes` above the cap, and `fdpm://audit/report/all` shows that tool's `result_bytes` p50/p95/max.",
    },
  },
];

// ── §13 Implementation Plan ────────────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:fdpm-mcp-bin",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/bin/fdpm-mcp.ts",
      change:
        "New binary entry point. Mirrors fdpm.ts startup: parse flags, openHost(), build tool registry, open stdio MCP server.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:mcp-runtime",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/mcp/",
      change:
        "New directory: tool registry (manifest.ts), per-tool modules under tools/, schema generation (schemas.ts), dispatch with tier gating + freshness + rate-limit (dispatch.ts).",
      complexity: "L",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:audit-log",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/persistence/mcp-audit-log.ts",
      change:
        "New module: append-only JSONL writer, separate file from the operation log. Hash-by-default for args; full-args opt-in.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:host-no-change",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/host.ts",
      change:
        "No new methods required. Reuses Host.reload() and Host.reloadProjectTail() introduced by SPEC-REPL §13.",
      complexity: "XS",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:errors-no-change",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/errors/fdpm-exception.ts",
      change:
        "No taxonomy change. Tier-gating and staleness reuse `permission` with `evidence.reason`.",
      complexity: "XS",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/tests/mcp/",
      change:
        "New test suites: unit (per-tool input validation), integration (end-to-end via stdio), security (tier gating, rate limit, confirmation token), schema-fuzz (advertised JSON Schema vs. Zod runtime). Coverage ≥ 60 %.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:agents-md",
    type: "spec:ImplementationChange",
    fields: {
      area: "AGENTS.md",
      change:
        "New section: how to wire `fdpm-mcp` into MCP clients (Claude Desktop, Claude Code, Cursor, custom).",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:plugin-spec-amend",
    type: "spec:ImplementationChange",
    fields: {
      area: SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      change:
        "Amendment proposal: add `mcp_tool` capability kind (per §10.5). Required only when plugin-tool exposure ships; not required for v0.1 Core-only release.",
      complexity: "S",
      status: "not_started",
    },
  },
];

// ── §19 Migration Steps ────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 1,
      label: "Wait on SPEC-REPL §13 Host changes",
      action:
        "This SPEC depends on Host.reload(), Host.reloadProjectTail(), and the per-command-module projectIdsFromArgs metadata defined by SPEC-REPL §13. Land those first.",
      affected_paths: [SPEC_REPL_PATH, "fdpm-cli/src/core/host.ts"],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Land Tier 1 read-only surface",
      action:
        "Implement read-only tools first (lowest blast radius). Verify with the schema-fuzz harness and an integration test against Claude Desktop.",
      affected_paths: ["fdpm-cli/src/mcp/", "fdpm-cli/src/bin/fdpm-mcp.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Add Tier 2 validating-write surface + audit log",
      action:
        "Land Tier 2 tools with full validation_report wiring. Audit log writes for every dispatch. CI gate on contract test that validation_report is present.",
      affected_paths: [
        "fdpm-cli/src/mcp/tools/",
        "fdpm-cli/src/persistence/mcp-audit-log.ts",
      ],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Wire Tier 3 (default off) + tier-gating tests",
      action:
        "Implement Tier 3 tools behind FDPM_MCP_ENABLE_DESTRUCTIVE. Add tier-gating tests (Conformance §1, §3).",
      affected_paths: ["fdpm-cli/src/mcp/", "fdpm-cli/tests/mcp/"],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "(Optional) Plugin-tool exposure",
      action:
        "Amend SPEC-PLUGGABLE-ARCHITECTURE to add mcp_tool capability. Implement plugin-tool dispatch behind FDPM_MCP_ENABLE_PLUGINS. Decoupled from v0.1 — v0.1 ships with Core tools only.",
      affected_paths: [
        SPEC_PLUGGABLE_ARCHITECTURE_PATH,
        "fdpm-cli/src/mcp/plugin-tools.ts",
      ],
      depends_on: ["spec:mig:4"],
    },
  },
  {
    id: "spec:mig:6",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 6,
      label: "Catalog byte budget + schema-by-resource (0.1.3)",
      action:
        "Land src/mcp/catalog.ts, the boot-time gate in fdpm-mcp.ts, fdpm://schema/profile, and the opaque fdpm.profile.register input. Clients that branched on isError=true for a malformed profile must branch on structuredContent.ok=false and read validation_report.findings[]. Deployments over 28,000 B set FDPM_MCP_CATALOG_BUDGET_BYTES.",
      affected_paths: [
        "fdpm-cli/src/mcp/catalog.ts",
        "fdpm-cli/src/mcp/resources/schema.ts",
        "fdpm-cli/src/mcp/tools/profile-register.ts",
        "fdpm-cli/src/bin/fdpm-mcp.ts",
      ],
      depends_on: ["spec:mig:4"],
    },
  },
  {
    id: "spec:mig:7",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 7,
      label: "Server instructions + fdpm://guide (0.1.4)",
      action:
        "Land src/mcp/instructions.ts (SERVER_INSTRUCTIONS, INSTRUCTIONS_BUDGET_BYTES, checkInstructionsBudget), the initialize.instructions wiring and boot gate in fdpm-mcp.ts, the fdpm://guide provider, fdpm.health.instructions_bytes, and the description dedup. No client change required; description text changes under manifest 0.3.0.",
      affected_paths: [
        "fdpm-cli/src/mcp/instructions.ts",
        "fdpm-cli/src/mcp/resources/guide.ts",
        "fdpm-cli/src/bin/fdpm-mcp.ts",
        "fdpm-cli/src/mcp/tools/",
      ],
      depends_on: ["spec:mig:6"],
    },
  },
  {
    id: "spec:mig:8",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 8,
      label: "Tier-3 hardening (0.1.5)",
      action:
        "Land src/core/operations/delete-preview.ts, the dispatcher's dry_run gate bypass and idempotency cache (session.ts), audit intent fields, and dry_run/idempotency_key on the five Tier-3 tools. Clients issuing real Tier-3 calls must add idempotency_key; preview first with dry_run: true.",
      affected_paths: [
        "fdpm-cli/src/core/operations/delete-preview.ts",
        "fdpm-cli/src/mcp/dispatch.ts",
        "fdpm-cli/src/mcp/session.ts",
        "fdpm-cli/src/mcp/tools/",
      ],
      depends_on: ["spec:mig:7"],
    },
  },
  {
    id: "spec:mig:9",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 9,
      label: "Audit report (0.1.6)",
      action:
        "Land rule_ids on Tier-2 rejection audit entries, src/persistence/mcp-audit-report.ts, the fdpm://audit/report resource, the fdpm mcp audit-report command and the SDK auditReport. Additive: older audit lines read without rule_ids (classed rule:unknown).",
      affected_paths: [
        "fdpm-cli/src/persistence/mcp-audit-report.ts",
        "fdpm-cli/src/mcp/resources/audit.ts",
        "fdpm-cli/src/commands/mcp.ts",
        "fdpm-cli/src/mcp/dispatch.ts",
      ],
      depends_on: ["spec:mig:8"],
    },
  },
  {
    id: "spec:mig:10",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 10,
      label: "Plugin prompts (0.1.7)",
      action:
        "Land PromptRegistration + ctx.registerPrompt + the runtime prompt registry, src/mcp/prompts.ts (contract, arguments, body validation), prompts capability and handlers in fdpm-mcp, planning/triage_iteration, CLI plugin prompts|prompt, SDK listPrompts/renderPrompt. Additive for clients; plugin authors adopt the skill contract.",
      affected_paths: [
        "fdpm-cli/src/plugin/context.ts",
        "fdpm-cli/src/plugin/runtime.ts",
        "fdpm-cli/src/mcp/prompts.ts",
        "fdpm-cli/src/bin/fdpm-mcp.ts",
        "fdpm-cli/plugins/planning/prompts.ts",
      ],
      depends_on: ["spec:mig:9"],
    },
  },
];

// ── §17 / §20 Risks & Mitigations ──────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:prompt-injection",
    type: "spec:Risk",
    fields: {
      label: "Indirect prompt injection via stored content",
      description:
        "Text stored in primitives is retrieved by an LLM via fdpm.primitive.search and may carry instructions that hijack subsequent tool calls (Greshake et al., 2023).",
      likelihood: "high",
      impact: "high",
    },
  },
  {
    id: "spec:risk:tier-misclassification",
    type: "spec:Risk",
    fields: {
      label: "Tier misclassification at manifest time",
      description:
        "A new Host method is exposed as Tier 1 when it should be Tier 2/3, silently giving the LLM a write path through a 'read-only' tool.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:schema-drift",
    type: "spec:Risk",
    fields: {
      label: "Advertised JSON Schema drifts from runtime Zod",
      description:
        "Server advertises a permissive JSON Schema, runtime Zod is stricter (or vice-versa). LLM emits 'valid' inputs that the handler rejects, or invalid inputs reach the handler.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:concurrent-divergence",
    type: "spec:Risk",
    fields: {
      label: "Concurrent CLI/REPL/MCP divergence",
      description:
        "An out-of-band CLI write changes the operation log; MCP server's in-memory Host is stale; subsequent Tier 2 call writes from a stale base.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:audit-loss",
    type: "spec:Risk",
    fields: {
      label: "Audit log loss",
      description:
        "Process crash before fsync drops audit entries; post-incident reconstruction is incomplete.",
      likelihood: "low",
      impact: "medium",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:tier-3-default-off",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Tier 3 tools off by default; per-session rate limit; audit log; opt-in confirmation-token mode for high-trust deployments. Bounds the prompt-injection blast radius without claiming to eliminate it.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:ci-tier-classification",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "CI check enumerates Host.* public methods and asserts each is either present in the manifest with a declared tier OR explicitly listed as 'not exposed'. New unclassified methods fail the build.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:schema-fuzz",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "CI fuzzer samples 10⁴ inputs from the advertised JSON Schema and asserts the runtime Zod validator accepts them. Drift is caught at PR time.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:freshness-strict",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Per-call freshness check (per SPEC-REPL §7.2). Strict mode for Tier 2/3: refuse with `permission` + `evidence.reason: \"stale_state\"` rather than silently background-reload.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:audit-fsync",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Audit log is fsync'd on a configurable cadence; entry written before tool dispatch returns. On clean shutdown, drain in-flight writes before exit.",
      status: "planned",
    },
  },
];

// ── §22 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:plugin-opt-in-shape",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should plugin-contributed tools be exposed opt-in per plugin (this SPEC's current default) or opt-in per tool tier (e.g., read-only plugin tools auto-expose; write/destructive plugin tools require explicit enable)?",
      default_choice:
        "Per-plugin opt-in. Operator should make a conscious decision about each plugin's MCP exposure rather than be surprised by a plugin update that adds a new read-only tool.",
      is_blocking: "yes",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:confirmation-token-ux",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "If FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN is enabled, how does the client obtain the token? MCP does not natively define a confirmation flow.",
      default_choice:
        "Out of band: operator reads the token from server stdout at start, configures the client. Standardize in v0.2 if demand emerges.",
      is_blocking: "no",
    },
  },
];

// ── §17/§20 Future Work ────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:http-transport",
    type: "spec:FutureWork",
    fields: {
      label: "HTTP / SSE transport with authn",
      description:
        "Add a network-listener transport with a real authentication layer (OAuth, mTLS, or signed-token bearer). Out of scope for v0.1 because it introduces an authn problem this SPEC does not solve.",
      target_version: "0.2",
      deferred_reason: ["Authentication is unsolved at this layer."],
    },
  },
  {
    id: "spec:fw:streaming",
    type: "spec:FutureWork",
    fields: {
      label: "Streaming tool results",
      description:
        "Long-running validate / render with progressive output. v0.1 is request/response only.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:multi-tenant",
    type: "spec:FutureWork",
    fields: {
      label: "Multi-tenant isolation",
      description:
        "One server, many Hosts, with tenant identity carried in the call. v0.1 is single-Host, single-dataDir.",
      target_version: "0.3",
    },
  },
  {
    id: "spec:fw:resources-prompts",
    type: "spec:FutureWork",
    fields: {
      label: "MCP `resources` and `prompts` surfaces",
      description:
        "Delivered ahead of v0.2: resources in 0.1.2 (render, profile, schema, guide, audit families), prompts in 0.1.7 (§13.5, plugin-shipped skills), and list_changed notifications on reload in 0.1.8 (§10.1). Remaining: subscriptions (resources/subscribe + notifications/resources/updated).",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:capability-negotiation",
    type: "spec:FutureWork",
    fields: {
      label: "Per-tool, per-client capability negotiation",
      description:
        "Allow clients to request a subset of tools, or to declare their own destructive-ack capabilities.",
      target_version: "0.3",
    },
  },
];

// ── §23 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:mcp-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "Model Context Protocol specification, Anthropic, 2024–2026.",
      locator: "https://modelcontextprotocol.io",
      verification: "unverified",
      verification_note:
        "Reader must verify the current MCP version against the SDK chosen at implementation time; details such as readOnlyHint / destructiveHint annotation names may have evolved.",
    },
  },
  {
    id: "spec:ref:iso-42010",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation:
        "ISO/IEC/IEEE 42010:2011, Systems and software engineering — Architecture description.",
      locator: "https://www.iso.org/standard/50508.html",
      verification: "unverified",
      verification_note:
        "Used for the stakeholders / concerns / views vocabulary. Reader should verify standard revision currency.",
    },
  },
  {
    id: "spec:ref:sei-qas",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SEI Carnegie Mellon, Quality Attribute Scenarios template.",
      locator:
        "https://insights.sei.cmu.edu/library/quality-attribute-workshop-qaw/",
      verification: "unverified",
      verification_note: "Used for §14 scenario shape.",
    },
  },
  {
    id: "spec:ref:nygard-adr",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation: "Nygard, M., Documenting Architecture Decisions, 2011.",
      locator:
        "https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions",
      verification: "unverified",
      verification_note: "ADR format used in §15.",
    },
  },
  {
    id: "spec:ref:greshake",
    type: "spec:Reference",
    fields: {
      kind: "paper",
      citation:
        "Greshake, K. et al., 'Not what you've Signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection', arXiv:2302.12173, 2023.",
      locator: "https://arxiv.org/abs/2302.12173",
      verification: "unverified",
      verification_note:
        "Cited in §11.3 as the canonical reference for the indirect-prompt-injection threat class.",
    },
  },
  {
    id: "spec:ref:spec-core",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "SPEC-CORE — Core invariants the MCP server preserves.",
      locator: SPEC_CORE_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; §7 pipeline cited.",
    },
  },
  {
    id: "spec:ref:spec-pluggable",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "SPEC-PLUGGABLE-ARCHITECTURE — Plugin runtime + the mcp_tool manifest field amendment (§10.5).",
      locator: SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:spec-repl",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "SPEC-REPL — Peer surface; shares Host.reload(), Host.reloadProjectTail(), the projectIdsFromArgs command-module metadata, and the permission+stale_state staleness convention.",
      locator: SPEC_REPL_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:host-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "Host class — composition the MCP server holds.",
      locator: "fdpm-cli/src/core/host.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; method names cited.",
    },
  },
  {
    id: "spec:ref:fdpm-bin",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "Existing one-shot CLI entry point referenced by §12.1.",
      locator: "fdpm-cli/src/bin/fdpm.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPM workbook guidelines (PALS-LAW, formalization-means-research).",
      locator: "CLAUDE.md",
      verification: "self_evident",
    },
  },
];

// ── §24 Revision history ───────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial draft (proposed) — pass-1 authoring.",
      notes:
        "First authored revision. Three-tier tool model declared; ADR-MCP-001 status=proposed; transport stdio-only; plugin tools per-plugin opt-in; no taxonomy changes.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-1-1",
    type: "spec:Revision",
    fields: {
      version: "0.1.1",
      date: "2026-05-04",
      title: "Pass-2 refinement.",
      notes:
        "Corrected Host method names against fdpm-cli/src/core/host.ts; aligned error taxonomy with FDPMException; clarified MCP response shape (isError/ok split); grounded plugin-manifest amendment in SPEC-PLUGGABLE-ARCHITECTURE; removed unverifiable specifics. Re-authored as a typed graph via fdpm.spec-authoring.",
      affected_sections: ["5", "6", "9", "10", "13"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-2",
    type: "spec:Revision",
    fields: {
      version: "0.1.2",
      date: "2026-05-05",
      title: "Destructive-tool advertisement amendment.",
      notes:
        "Inverts the Tier-3 advertisement posture from 'absent when disabled' to 'advertised with disabled banner.' Real-session evidence showed operators concluding 'the capability is missing' when in fact it was merely gated; the new posture lets LLM clients self-recover from destructive_disabled refusals. Authorization perimeter is unchanged — the dispatch gate was always the cryptographic boundary; advertisement is discoverability, not authorization. §8.3 prose, §22.3 acceptance criterion, §23.1 conformance procedure, and the Tier-3 invariant updated. Threat-model trade-off documented for v0.2 reconsideration under network deployment.",
      affected_sections: ["5", "8", "22", "23"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-3",
    type: "spec:Revision",
    fields: {
      version: "0.1.3",
      date: "2026-08-28",
      title: "Catalog byte budget and schema-by-resource amendment.",
      notes:
        "Adds §8.5: the advertised tools/list catalog is built once, measured in UTF-8 bytes, and capped (28,000 B total / 2,000 B per tool) at boot (refuse with exit 2) and in CI; plugin tools share the budget; tools/list._meta and fdpm.health expose the measurement; FDPM_MCP_CATALOG_BUDGET_BYTES raises the total only. Introduces fdpm://schema/{schema_id} resources; fdpm.profile.register advertises an opaque profile object validated server-side with the same Zod schema (malformed → Tier-2 rejection with core:profile-schema findings; unregistered extends parent → not_found). Manifest 0.1.0 → 0.2.0. Evidence: 33,929 B → 25,699 B. Authored by Claude Fable 5 via Claude Code.",
      affected_sections: ["8", "11", "16", "17", "25"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-4",
    type: "spec:Revision",
    fields: {
      version: "0.1.4",
      date: "2026-08-28",
      title: "Server-instructions amendment.",
      notes:
        "Adds §8.6: the server MUST send a static, budget-capped (4,000 B) instructions text on initialize — cold-start workflow, response contract, evidence.reason meanings, every resource URI template — mirrored byte-for-byte at fdpm://guide; CI drift guards (templates named, no unknown tools). Tool descriptions MUST NOT repeat generic envelope/gating prose; catalog after dedup 23,567 B, DEFAULT_CATALOG_BUDGET ratcheted 28,000 → 26,000. fdpm.health gains instructions_bytes. Manifest 0.2.0 → 0.3.0. Authored by Claude Fable 5 via Claude Code, with a forked peer session contributing instructions.ts and its tests.",
      affected_sections: ["8", "11", "17", "25"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-5",
    type: "spec:Revision",
    fields: {
      version: "0.1.5",
      date: "2026-08-28",
      title: "Tier-3 hardening amendment.",
      notes:
        "Adds §8.7: every destructive tool accepts dry_run (would-affect preview through the core delete-preview module; passes the destructive and confirmation gates; appends nothing; no key needed) and otherwise requires idempotency_key — session cache (tool, key) → result, TTL 5 min, cap 1,000: same args replay with audit replayed:true, different args conflict/idempotency_key_reused, concurrent same-key calls coalesce, gate refusals never cached. The start audit entry is the intent record with tier/idempotency_key/dry_run. The roadmap's 100 ms debounce is deliberately not adopted (decision:0008). CLI --dry-run and SDK preview*Delete share the module. Manifest 0.3.0 → 0.4.0. Authored by Claude Fable 5 via Claude Code.",
      affected_sections: ["8", "11", "25"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-6",
    type: "spec:Revision",
    fields: {
      version: "0.1.6",
      date: "2026-08-28",
      title: "Audit-report amendment.",
      notes:
        "Adds §9.5: Tier-2 rejections record rule_ids on the audit complete entry; mcp-audit.jsonl is parsed through typed schemas and aggregated into per-tool outcomes, error classes (<tool> category/reason, <tool> rule:<rule_id>), a success-rate SLO with shortfall, and p50/p95 latency over absolute or relative windows; served as the fdpm://audit/report[/{window}] resource, the fdpm mcp audit-report CLI command, and the SDK auditReport. Host.dataDir getter (not exposed). No manifest bump (resource only). Authored by Claude Fable 5 via Claude Code.",
      affected_sections: ["9", "25"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-7",
    type: "spec:Revision",
    fields: {
      version: "0.1.7",
      date: "2026-08-28",
      title: "Prompts amendment.",
      notes:
        "Adds §13.5: plugins ship MCP prompts as skills via ctx.registerPrompt — promptId <plugin>/<slug> unique across plugins, description that says when to use (40..300 chars), arguments, render; listing entry ≤ 600 B (progressive disclosure), body ≤ 16 KB with the sections When to use / Call order / Failure modes; validated at install and on prompts/get, plugin output never passed through. fdpm-mcp declares prompts and serves prompts/list (metadata) and prompts/get. First prompt planning/triage_iteration with tests cross-checking tool names and plan:val rule ids. CLI plugin prompts / plugin prompt; SDK listPrompts / renderPrompt. Instructions budget ratcheted 4,000 → 4,500 (measured 4,219). §28 resources-and-prompts item marked delivered. Authored by Claude Fable 5 via Claude Code.",
      affected_sections: ["8", "13", "25", "28"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-8",
    type: "spec:Revision",
    fields: {
      version: "0.1.8",
      date: "2026-08-28",
      title: "Reload-notification amendment.",
      notes:
        "Adds §10.1 and §15.4: resources/list and prompts/list are computed from the live Host, so the server declares resources.listChanged and prompts.listChanged and sends notifications/resources/list_changed and notifications/prompts/list_changed after every successful Host.reload(); tools.listChanged stays undeclared because the advertised tool array is frozen at boot. A rejected reload notifies nothing and leaves the freshness map intact (the pre-reload Host is still what is served); a notification that cannot be delivered is reported on stderr and never fails the reload. §15.3 corrected: SIGHUP is the reload signal, not a shutdown signal — only stdin EOF, SIGTERM and SIGINT drain and exit. Handler extracted to src/mcp/reload.ts with invariant spec:inv:reload-notifies-list-changed covered by tests/mcp/reload-notify.test.ts. Found while verifying a workbook built after the client connected: readable by URI, missing from the client's resource list. Authored by Claude Fable 5 via Claude Code.",
      affected_sections: ["10", "15", "17"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-9",
    type: "spec:Revision",
    fields: {
      version: "0.1.9",
      date: "2026-08-30",
      title: "Cross-platform reload amendment.",
      notes:
        "Updates §10.1, §15.4, §17, and §23.4 for Windows compatibility: fdpm-mcp selects SIGHUP on macOS/Linux and Ctrl+Break (SIGBREAK) on Windows before installing its reload listener; successful reload behavior and list-changed notifications remain identical on both paths. Stale-state advice, server instructions, plugin prompts, and operator documentation name both platform signals. Restarting fdpm-mcp remains the fallback when no Windows console is attached. The historical v0.1.8 SIGHUP behavior remains the POSIX path.",
      affected_sections: ["10", "15", "17", "23"],
      kind: "patch",
    },
  },
  {
    id: "spec:rev:0-1-10",
    type: "spec:Revision",
    fields: {
      version: "0.1.10",
      date: "2026-09-02",
      title: "Profile-revision amendment.",
      notes:
        "A DomainProfile id now names a family of revisions: the registry keys on (id, version), so fdpm.profile.register accepts a second version of a known id and only an exact repeat of a registered revision is a conflict (the error names the registered versions). fdpm.workbook.create resolves the binding once and records profile_version on the workbook, so a later revision never re-validates an existing workbook against a schema its operations were not appended under; an unpinned (pre-amendment) workbook resolves to the OLDEST revision, never the newest. extends holds refs (id or id@version) and registration pins an unpinned parent whose current revision is operator-persisted — never a plugin's, whose revisions come and go with releases. Adds Tier-3 fdpm.profile.retire (registry entry + persisted file; refused while a workbook binds it, a profile extends it, or a plugin owns it; dry_run returns those blockers as would_affect) and the profile_version field on fdpm.workbook.list. A plugin registering a revision of an id that also has an operator-persisted revision emits a profile.shadowed host warning naming which revision a bare id resolves to. Manifest 0.5.0 → 0.6.0; DEFAULT_CATALOG_BUDGET.total_bytes ratcheted 27,000 → 28,500 (measured 27,560 B destructive off, 26,372 B on).",
      affected_sections: ["8", "11"],
      kind: "minor",
    },
  },
];

// ── §0..§N Sections (the document tree) ────────────────────────────────────

const sections: PrimitiveSpec[] = [
  {
    id: "spec:sec:1",
    type: "spec:Section",
    fields: {
      number: "1",
      title: "Purpose and Scope",
      kind: "prose",
      body_md: [
        "### 1.1 What this document defines",
        "",
        "This SPEC defines the **MCP (Model Context Protocol) server surface** of FDPM: a long-lived process that holds **one** `Host` instance and exposes a curated, schema-typed **tool surface** to MCP clients over the protocol's standard transports.",
        "",
        "The MCP server is a **third front-end** to the Core, peer to the one-shot CLI and to the REPL ([SPEC-REPL.md](./SPEC-REPL.md)). All three share the same `Host`, the same JSONL persistence model, the same §7 validation pipeline, and the same §8 schema gate.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- A new persistence model, a new validation model, or any change to Core invariants. Every state mutation goes through `Host.*`.",
        "- A new authentication framework. Authentication is delegated to the MCP transport layer (process boundary for stdio; transport-level auth for HTTP — see §6).",
        "- A natural-language interpretation layer. The MCP server exposes typed tools; the LLM is responsible for choosing tools and constructing valid arguments. The server validates and rejects invalid input — it does not guess.",
        "- A 'do anything' `bash` or `eval` tool. Each operation is a discrete tool with a JSON Schema (see §4 — this is non-negotiable).",
        "- A streaming tool-call channel. v0.1 is request/response only.",
        "- Multi-tenant isolation. v0.1 is single-`Host`, single-`dataDir`.",
        "",
        "### 1.3 Why MCP is a separate SPEC, not a section in SPEC-REPL",
        "",
        "The REPL and the MCP server share a `Host` but are architecturally different in three ways: (1) the trust boundary is different — REPL is a process the operator pipes to, while the MCP server is consumed by clients the operator does not control; (2) the contract is tool-shaped, not command-line-shaped — every MCP tool is a `(name, JSON Schema, handler, annotations)` quad, a versioned API contract; (3) plugin contributions need an explicit policy — the CLI/REPL automatically expose every plugin command, the MCP server does NOT (see §10).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:2",
    type: "spec:Section",
    fields: {
      number: "2",
      title: "Stakeholders and Concerns",
      kind: "stakeholders",
      body_md:
        "If a concern has no listed stakeholder, no one will defend it. Flag any gap before implementation.",
    },
  },
  {
    id: "spec:sec:3",
    type: "spec:Section",
    fields: {
      number: "3",
      title: "Quality Attributes in Tension",
      kind: "quality_attributes",
      body_md:
        "The recurring tension is **security vs. modifiability**: the mechanically-easiest way to expose `Host` is 'one tool per public method, regenerated on every build.' That maximizes modifiability and minimizes security review surface stability. The decision in §6 trades a small amount of automation for a stable, hand-curated tool manifest.",
    },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "Architectural Principles",
      kind: "principles",
      body_md:
        "Each principle is testable; the renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:5",
    type: "spec:Section",
    fields: {
      number: "5",
      title: "Definitions",
      kind: "definitions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:6",
    type: "spec:Section",
    fields: {
      number: "6",
      title: "Architectural Decision",
      kind: "adr",
      body_md:
        "The full decision (context, options, consequences, compliance) follows. Trade-off matrix appears in §7.",
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Trade-off Matrix",
      kind: "tradeoff_matrix",
      body_md: "Options scored across the axes that drove the decision.",
    },
  },
  {
    id: "spec:sec:8",
    type: "spec:Section",
    fields: {
      number: "8",
      title: "The Tool Surface (normative)",
      kind: "prose",
      body_md: [
        "Tools are namespaced as `fdpm.<noun>.<verb>`. Names are stable; removing or renaming a tool is a major-version change to this SPEC.",
        "",
        "### 8.1 Tier 1 — read-only (always exposed)",
        "",
        "These tools never mutate state. They are safe to invoke without client-side confirmation and SHOULD be marked with the MCP `readOnlyHint: true` annotation.",
        "",
        "### 8.2 Tier 2 — validating-write (exposed by default; per-tool client confirmation expected)",
        "",
        "These tools append to the operation log via `Host.*` and run the §7 pipeline. Each MUST be marked with `destructiveHint: false` and MUST NOT be marked `readOnlyHint`. Every Tier 2 success response MUST place an envelope `{ ok, operation, validation_report, post_state_summary }` in the MCP `structuredContent` field. The `validation_report` is **mandatory**, not optional.",
        "",
        "A `validation_report` with `status: \"fail\"` MUST be paired with `isError: false` and `ok: false` in the structured payload — the call succeeded as a protocol matter, but the operation was rejected by the §7 pipeline.",
        "",
        "### 8.3 Tier 3 — destructive (advertised but DISABLED by default; opt-in to enable dispatch)",
        "",
        "These tools have effects that cannot be undone by another tool call. Tier 3 tools MUST be marked with `destructiveHint: true`. Their **dispatch** is enabled only when `FDPM_MCP_ENABLE_DESTRUCTIVE=1` or `--enable-destructive` is set; their **advertisement** is unconditional in v0.1.2.",
        "",
        "**Why advertise when disabled.** Earlier drafts (0.1.0, 0.1.1) hid Tier 3 tools from the advertised manifest when destructive was off. That created a Catch-22: an LLM that couldn't see the tool also couldn't be told how to enable it, and an operator who hit \"can't delete a relation\" couldn't tell whether the capability was missing or merely gated. v0.1.2 inverts this: Tier 3 tools are always present in the manifest, but when destructive is off, the advertised `description` is prefixed with a banner naming the enable mechanism, and the dispatcher refuses calls with `permission` + `evidence.reason: \"destructive_disabled\"`. The authorization perimeter is unchanged — the gate moved from advertisement to dispatch, and dispatch was always the cryptographic boundary.",
        "",
        "**Banner shape.** When `enableDestructive` is false, every Tier 3 tool's advertised description MUST begin with the line `\"⚠ DISABLED. Set FDPM_MCP_ENABLE_DESTRUCTIVE=1 (or pass --enable-destructive) and restart fdpm-mcp to enable dispatch. Calling now refuses with category=permission, reason=destructive_disabled.\"`, followed by a blank line and the tool's real description. When destructive is enabled, the banner MUST be absent and the real description stands alone. Per-tool descriptions are not stripped — the LLM sees what the tool would do if enabled, so it can plan ahead and request the operator-side change.",
        "",
        "**Schema unchanged.** Tier 3 tools advertise their real input/output schemas in both states. Hiding the schema while showing the tool name would be discoverability theatre once the name leaks via the advertised manifest. The dispatch gate is what protects.",
        "",
        "**Threat-model trade-off.** This posture is appropriate for v0.1.2's stdio-only deployment, where the trust boundary is the OS process boundary. A future network-deployed server (v0.2 HTTP) MAY revert to absence-when-disabled if minimum-advertised-surface is preferred over discoverability.",
        "",
        "### 8.4 Tools intentionally NOT exposed",
        "",
        "`fdpm.host.reload`, `fdpm.persistence.write_raw`, anything taking 'raw operation' or 'raw JSONL' as input, anything calling `host.persistence`/`host.store` directly, and anything that executes shell or eval. A CI check MUST scan tool-module source under `fdpm-cli/src/mcp/tools/` and fail on imports of `host.persistence`, `host.store`, `node:child_process`, `node:vm`, `eval`, `Function`.",
        "",
        "### 8.5 Catalog byte budget and schema-by-resource (v0.1.3)",
        "",
        "Every `tools/list` response ships the whole registry — name, description, and derived JSON Schema per tool — and MCP clients place it at the head of every agent session. The registry's size is therefore a per-session token cost paid before the agent does any work, and it grows silently with every added tool, longer description, or widened schema. Registry cost is roughly `tools × schema size × result verbosity`; the threshold at which it degrades tool selection is an empirical question, not folklore, so this SPEC makes the quantity measured and capped rather than guessed.",
        "",
        "**Measurement.** The server MUST build the advertised `tools/list` entries once at boot — the Core manifest in tier order (Tier 3 banner-prefixed when destructive is off) followed by plugin-supplied tools — and MUST measure that exact array in UTF-8 bytes (`JSON.stringify({ tools })`). The array measured is the array advertised; there is no second construction.",
        "",
        "**Budget.** The measurement MUST NOT exceed the budget: by default 28,500 bytes total and 2,000 bytes per entry (`DEFAULT_CATALOG_BUDGET`, `fdpm-cli/src/mcp/catalog.ts`). Over budget, the server MUST refuse to start with exit code 2 and MUST print each violation on stderr, naming `FDPM_MCP_CATALOG_BUDGET_BYTES`. That variable MAY raise the total for a deployment that knowingly accepts the token cost; the per-tool limit is not operator-tunable — an oversized tool is a defect in the tool. Plugin tools count against the same budget: PURPOSE.md's rule that per-verb plugin tools are never bulk-advertised is enforced here, not by convention.",
        "",
        "**Observability.** `tools/list` MUST carry `_meta.catalog_bytes` and `_meta.catalog_budget_bytes`. `fdpm.health` MUST return `catalog: { tool_count, total_bytes, budget_total_bytes, budget_per_tool_bytes, within_budget }`.",
        "",
        "**CI.** The same budget MUST be enforced in CI for the Core manifest in both destructive modes (`fdpm-cli/tests/mcp/catalog-budget.test.ts`), so a description or schema that grows past the cap fails the build before it can cost every session. The budget numbers are a ratchet on the measured size plus headroom, not a derived optimum; raising them is a reviewed change recorded in the CHANGELOG.",
        "",
        "**Schema-by-resource.** A tool whose payload schema is large SHOULD advertise an opaque object and serve the schema as a resource under `fdpm://schema/{schema_id}` (`application/schema+json`), validating server-side with the same Zod schema the resource is derived from (§11.1) so the agent-visible contract and the enforced contract cannot drift. `fdpm.profile.register` is the first instance: its input is an opaque `profile` object; the DomainProfile schema is `fdpm://schema/profile`; a malformed profile is a Tier-2 rejection (`isError: false`, `ok: false`, one `core:profile-schema` finding per violated path with `field_path`), never a protocol error, and nothing is registered on rejection; parents named in `extends` MUST already be registered (else `not_found`).",
        "",
        "**Evidence.** Measured 2026-08-28 on manifest 0.1.0: 30 tools, 33,929 bytes, of which 8,809 bytes (26 %) were the DomainProfile schema inlined into `fdpm.profile.register`. After this amendment: 25,699 bytes with destructive off, 24,709 with it on. Manifest 0.6.0 (32 tools, adding Tier-3 `fdpm.profile.retire` and the `profile_version` field on `fdpm.workbook.list`) measured 27,560 B with destructive off — the worst case, since a sixth destructive tool carries a disabled banner longer than its own description — and 26,372 B with it on; the budget was ratcheted 27,000 → 28,500 B.",
        "",
        "### 8.6 Server instructions and schema of orientation (v0.1.4)",
        "",
        "Tool descriptions can say what a tool does; they cannot carry the layer a cold agent needs before its first call — in what order to call, what a response means, how to recover from a rejection, why a delete refuses. Until v0.1.3 that layer was pasted into thirteen Tier-2 and five Tier-3 descriptions and re-sent with every `tools/list`. MCP `initialize` carries an `instructions` field that clients place in the model context once per session; it is the correct home.",
        "",
        "**Content.** The server MUST send `instructions` on `initialize`. The text MUST state: the cold-start workflow (`fdpm.workbook.list` → `fdpm.profile.type_info` before any create/replace → write, preferring the batch tools → read through resources); the response contract (`isError: false` + `ok: true` written; `isError: false` + `ok: false` rejected with `validation_report.findings[]` and nothing written; `isError: true` protocol error with `category` and `evidence.reason`); the meaning of `destructive_disabled`, `stale_state`, `rate_limited` and `confirmation_required`; and every resource URI template the server advertises.",
        "",
        "**Static.** The text MUST be a pure function of manifest constants — no runtime state (destructive on/off, rate limit, catalog bytes). Runtime state is reported by `fdpm.health` and by the Tier-3 banner; the text says where to look. Consequently `initialize.instructions` and the `fdpm://guide` resource (`text/markdown`) MUST be byte-identical, and the content is testable without a running server.",
        "",
        "**Budget.** The text is a per-session cost like the catalog. It MUST NOT exceed `INSTRUCTIONS_BUDGET_BYTES` (4,000 bytes); the server MUST refuse to start (exit 2) when it does and CI MUST enforce the same limit. CI MUST also assert that the text names every resource URI template the registry advertises and never names a tool absent from the manifest (drift guards).",
        "",
        "**Dedup.** Tool descriptions MUST NOT repeat the generic envelope or gating prose; they keep only tool-specific facts — what `fdpm.profile.type_info` must be consulted for, what rejects, immutability rules, batch preference. CI enforces this (`fdpm-cli/tests/mcp/tool-descriptions.test.ts`). Catalog after dedup: 23,567 bytes (destructive off); `DEFAULT_CATALOG_BUDGET.total_bytes` ratcheted from 28,000 to 26,000.",
        "",
        "**Relation to prompts.** Plugin-shipped MCP prompts (§28, v0.2) carry the per-domain \"how to think\" layer; `instructions` carries the server-generic layer. They compose; neither replaces the other.",
        "",
        "### 8.7 Tier-3 hardening: dry-run previews, idempotency keys, pre-execution audit (v0.1.5)",
        "",
        "A delete is not retry-safe unless the server can recognise a duplicate, and an agent cannot show an operator what a delete will do without running it. Tier-3 tools therefore carry two extra arguments, enforced by the dispatcher, not by convention.",
        "",
        "**Preview.** Every Tier-3 tool MUST accept `dry_run: boolean`. When it is the strict boolean `true`, the tool MUST compute the would-affect set through the core delete-preview module (`fdpm-cli/src/core/operations/delete-preview.ts`: a primitive's type and every relation that references it; a relation's endpoints; a workbook's counts; batch variants with the first-missing-id `not_found` contract) and MUST NOT append an operation. The response is `{ ok: true, dry_run: true, would_affect, post_state_summary }` with no `operation`. Because a preview has no side effect it is a Tier-1-equivalent read: it MUST pass the destructive gate (§8.3) and the confirmation-token gate (§9.3) and MUST NOT require an idempotency key. The CLI (`fdpm … delete --dry-run`) and the SDK (`previewPrimitiveDelete`, `previewRelationDelete`, `previewWorkbookDelete`) MUST use the same module. A preview does not run the §7 pipeline on the projected post-state; `referencing_relations` is the signal the pipeline's cardinality rules act on and is therefore reported.",
        "",
        "**Idempotency.** Every real (non-dry-run) Tier-3 call MUST carry `idempotency_key` (1..200 characters); a call without one is refused with `validation` / `evidence.reason: \"idempotency_key_required\"`. The session keeps `(tool, key) → { args_hash, result }` for `IDEMPOTENCY_TTL_MS` (5 minutes) with a bounded capacity (1,000, oldest evicted). The same key with the same argument hash MUST replay the recorded result without running the handler (handler errors such as `not_found` are recorded and replayed too); the same key with a different argument hash MUST be refused with `conflict` / `evidence.reason: \"idempotency_key_reused\"`; concurrent calls with the same key MUST coalesce onto one execution. Gate refusals (§8.3, §9.3, §10, rate limit) are evaluated before the cache and MUST NOT be cached. Keys are scoped per tool.",
        "",
        "**Audit.** The `start` audit entry is the intent record: it MUST be written before the handler runs and, for Tier-3 calls, MUST carry `tier: \"destructive\"`, `dry_run`, and (for real calls) `idempotency_key`. A replayed result MUST produce a `complete` entry with `replayed: true`; a preview MUST produce one with `dry_run: true`.",
        "",
        "**Not adopted.** The roadmap's proposed 100 ms same-workbook debounce (refuse a re-issue without the same key) is deliberately not part of this contract: with keys mandatory it would only refuse legitimate distinct deletes and make conformance timing-dependent. ADR `decision:0008` records the reasoning.",
        "",
        "**Evidence.** Reference designs: session-scoped, TTL-bounded idempotency caches with atomic check-then-execute (OpenClaw gateway), key-reuse-with-different-parameters refusal (Stripe API semantics), and dry-run as a first-line precaution for destructive tools (corpus review 2026-08-28). Measured after the amendment: instructions 3,887 B of 4,000; catalog 25,312 B (destructive off) / 24,322 B (on) of 26,000.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Transport, Authentication, and Authorization",
      kind: "prose",
      body_md: [
        "### 9.1 Transport",
        "",
        "**stdio (default and only supported in v0.1).** The server reads MCP frames from stdin and writes to stdout, per the MCP specification. HTTP / SSE transport is OUT OF SCOPE for v0.1.",
        "",
        "### 9.2 Authentication",
        "",
        "Under stdio, authentication is **the OS process boundary**. The client that spawned the server has the same filesystem access as the server; there is no further authn layer. The server MUST refuse to start if any HTTP transport flag is provided.",
        "",
        "### 9.3 Authorization (server-side enforcement)",
        "",
        "The server does NOT trust the client to enforce tool tiers. Tier 3 tools refuse to execute if `enableDestructive` is false, regardless of any client-side hint. Every tool call is rate-limited per session (`FDPM_MCP_MAX_CALLS_PER_MINUTE`, default 120). Tier 2/3 tools may additionally be gated by `FDPM_MCP_REQUIRE_CONFIRMATION_TOKEN=1` — opt-in defense for high-trust deployments.",
        "",
        "### 9.4 Audit log",
        "",
        "Every tool invocation is appended to `$FDPM_DATA_DIR/mcp-audit.jsonl` with one JSON line per call: timestamp, session, tool, args_hash, ok, duration_ms, validation_status. `args_hash` (sha256) is used by default; `FDPM_MCP_AUDIT_FULL_ARGS=1` opts into full-args logging for debugging.",
        "",
        "### 9.5 Audit report — closing the flywheel (v0.1.6)",
        "",
        "The audit log is only useful if something reads it. The server MUST make its own failure classes observable so description, instruction and profile changes are driven by evidence: which tool, which `evidence.reason`, which `rule_id` fails most.",
        "",
        "**Record the class.** A Tier-2 rejection's `complete` entry MUST carry `rule_ids`: the sorted, distinct `rule_id`s among the `validation_report.findings[]` the §7 pipeline returned. Protocol errors keep `error_category` / `error_reason`.",
        "",
        "**Aggregate.** `fdpm-cli/src/persistence/mcp-audit-report.ts` parses the JSONL through typed schemas (a line that fails to parse is counted in `source.skipped`, never coerced) and computes, for an absolute (`since`/`until`) or relative (`1h` | `24h` | `7d` | `all`) window: totals (`calls`, `ok`, `failed`, `rejected`, `replayed`, `dry_run`, `success_rate`); per-tool rows with the same counts, `error_reasons`, `rule_ids`, nearest-rank `p50_ms`/`p95_ms`; ranked error classes named `<tool> category/reason` (protocol) or `<tool> rule:<rule_id>` (rejection) with `count` and `share`; and an SLO block (`target`, default 0.9; `met`; `shortfall` = successful calls the window still needed). Calls are `complete` entries; `start` and `reload` entries are ignored.",
        "",
        "**Serve it three ways, one implementation.** Resource `fdpm://audit/report[/{window}]` (`application/json`; reads go through resources, so no catalog bytes; an in-memory Host yields an empty report, not an error; an unknown window is `not_found`), CLI `fdpm mcp audit-report [--window|--since|--until|--top|--slo|--json]`, and SDK `auditReport(host, opts)`. `Host.dataDir` (read-only getter, not exposed as a tool) locates the log.",
        "",
        "**Use.** The top classes are the backlog for the teaching surfaces: a `rule:core:id-format` class means the id contract is not landing (fix `fdpm.profile.type_info` guidance or the instructions); a `validation/idempotency_key_required` class means the Tier-3 contract is not landing. The same classes are the seed set for the three-arm cold-agent eval PURPOSE.md gates v2 on.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Concurrency and Freshness",
      kind: "prose",
      body_md: [
        "The MCP server holds a `Host` in memory and faces the same concurrency problem the REPL does ([SPEC-REPL.md](./SPEC-REPL.md) §7). The freshness model is identical: per-workbook `stat` against `JsonlLogStore` log paths, profile-directory stat for tools that read `profile_id`, and the explicit `Host.reload()` and `Host.reloadProjectTail(workbook_id)` methods SPEC-REPL §13 requires.",
        "",
        "Strict mode for Tier 2 / Tier 3 tools: refuse with the `permission` error envelope carrying `evidence.reason: \"stale_state\"` if any addressed workbook's log has changed out-of-band. Lenient mode for Tier 1: incremental tail-replay then dispatch. Operators trigger `Host.reload()` via SIGHUP on macOS/Linux, Ctrl+Break (SIGBREAK) on Windows, or process restart when no console is attached.",
        "",
        "The server MUST NOT silently background-reload Tier 2/3 calls. Staleness is surfaced; the LLM and the client can react.",
        "",
        "### 10.1 Reload notifications (v0.1.8)",
        "",
        "`resources/list` and `prompts/list` are computed from the live `Host` on every request, so a workbook (or plugin prompt) that appeared on disk after a client connected becomes enumerable the instant `Host.reload()` returns. MCP clients cache both lists and re-fetch only on a `list_changed` notification, so the server MUST declare `resources.listChanged` and `prompts.listChanged` in its `initialize` capabilities and MUST send `notifications/resources/list_changed` and `notifications/prompts/list_changed` after every successful reload. Without them a workbook created after connect is readable by URI and invisible in the client's list.",
        "",
        "`tools.listChanged` is deliberately NOT declared: the advertised tool array is frozen at boot — it is the array the §8.5 byte budget was measured against — so a reload cannot change it.",
        "",
        "A reload that rejects MUST NOT notify and MUST NOT clear the freshness map: `Host.reload()` either swaps wholesale or leaves the previous `Host` serving, so the client's cached lists still describe what the server serves. Failure to deliver a notification (a transport closed mid-reload) MUST NOT fail the reload or terminate the server; it is reported on stderr, and the reload outcome (`ok` | `host_compat` | `internal`) is recorded in the audit log as a `reload` entry either way.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "Tool Schema Generation",
      kind: "prose",
      body_md: [
        "### 11.1 Source of truth",
        "",
        "Each tool's input schema MUST be a Zod schema, either reused from the Core's existing operation schemas or defined in the MCP tool module and structurally validated at build time against the Host method's argument type. The MCP advertised tool schema is derived from the Zod schema via a Zod→JSON Schema converter at server-start time.",
        "",
        "### 11.2 Output schemas",
        "",
        "Every tool's output is also schema-typed. The output schema is part of the tool manifest the server advertises to the client.",
        "",
        "### 11.3 Versioning",
        "",
        "Tool names and argument shapes are a public contract. Adding a tool or an optional argument is a minor bump. Renaming/removing a tool, removing/renaming an argument, tightening a type, or changing a response shape backward-incompatibly is a major bump. The server advertises its tool-manifest version in the MCP `serverInfo` block.",
        "",
        "### 11.4 Advertised size",
        "",
        "The derived JSON Schema is part of the measured catalog (§8.5), so widening an input schema is subject to the byte budget. When a payload schema is large, serve it as a resource under `fdpm://schema/{schema_id}` and advertise an opaque object. Manifest 0.2.0 records the `fdpm.profile.register` input change (loosened: minor) and the additive `fdpm.health.catalog` field; 0.3.0 records the additive `fdpm.health.instructions_bytes` field and the `fdpm://guide` resource family (§8.6).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: {
      number: "12",
      title: "Error Model",
      kind: "prose",
      body_md: [
        "The MCP server uses **exactly** the existing `FDPMException` taxonomy (no new categories): `validation | verification | not_found | conflict | permission | unauthenticated | quota | unsupported_media | host_compat | internal`.",
        "",
        "Tier 3 gating refusals and §7 staleness refusals are reported as `permission`, distinguished by `evidence.reason`:",
        "",
        "- Tier 3 disabled: `evidence.reason: \"destructive_disabled\"`",
        "- Stale state: `evidence.reason: \"stale_state\"`",
        "- Rate-limited: `evidence.reason: \"rate_limited\"`",
        "",
        "A `validation`-status response from the §7 pipeline is **not** an MCP error (`isError: false`); it is a Tier 2 success response with `ok: false` and a populated `validation_report`. This distinction matters: `isError: true` means the tool itself could not be executed; `ok: false` with `isError: false` means the tool ran and the operation was rejected by Core validation.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "Plugin Contributions",
      kind: "prose",
      body_md: [
        "This is the policy difference vs. the CLI/REPL. The CLI/REPL auto-discover and auto-expose every plugin command. The MCP server does NOT.",
        "",
        "### 13.1 Default policy: opt-in",
        "",
        "A plugin's commands are exposed over MCP only if BOTH: (a) the plugin's manifest declares an `mcp_tool` capability block (per the proposed amendment to SPEC-PLUGGABLE-ARCHITECTURE), AND (b) the operator explicitly enabled MCP exposure for that plugin via `FDPM_MCP_ENABLE_PLUGINS=plugin-id-1,plugin-id-2`.",
        "",
        "### 13.2 Why opt-in",
        "",
        "The CLI/REPL trust model assumes the operator typed the command. The MCP trust model assumes an LLM may invoke any advertised tool with constructed arguments. The operator must make that choice explicitly per plugin.",
        "",
        "### 13.3 Plugin-tool naming",
        "",
        "Plugin-contributed tools are namespaced `fdpm.plugin.<plugin-id>.<verb>` so they cannot collide with Core tool names.",
        "",
        "### 13.4 Plugin-tool tier classification",
        "",
        "The plugin manifest MUST declare a tier for each exposed operation (`read_only`, `validating_write`, or `destructive`). The server MUST enforce the same gating as for Core tools.",
        "",
        "### 13.5 Plugin-shipped prompts as skills (v0.1.7)",
        "",
        "`instructions` (§8.6) carries the server-generic orientation; the per-domain \"how to think\" layer is a plugin's to ship, as MCP prompts. A prompt is a skill — reusable procedural knowledge about when to use a set of tools, in what order, and how to handle failures — not a fill-in template. Two rules from the evidence base are enforced as code: \"context, not just templates\", and progressive disclosure (the agent sees only metadata until it selects a prompt).",
        "",
        "**Registration.** A plugin registers a prompt during `activate()` with `ctx.registerPrompt(reg)`. `reg` MUST carry `promptId` matching `<plugin>/<slug>` (`^[a-z][a-z0-9_-]*/[a-z][a-z0-9_]*$`), unique across all plugins (`conflict` otherwise); `title` ≤ 80 characters; `description` 40..300 characters that states when to use the prompt; `arguments` with unique names matching `^[a-z_][a-z0-9_]*$`, each with a description and an optional `required`; and `render({ args })` returning text messages. The listing entry (`name`, `title`, `description`, `arguments`) MUST NOT exceed 600 bytes. Violations are rejected at install (`validation` / `prompt_invalid`) so a malformed prompt never reaches `prompts/list`. Prompts are torn down with the plugin's other contributions on deactivate.",
        "",
        "**Serving.** The server MUST declare the `prompts` capability. `prompts/list` MUST return metadata only, sorted by `promptId`. `prompts/get` MUST resolve the caller's arguments against the declaration — a missing required argument, an unknown argument, or a non-string value is `validation` (`prompt_argument_missing` / `prompt_argument_unknown` / `prompt_argument_invalid`) — run the plugin's `render`, and validate the result before returning it: non-empty text messages whose text contains the sections \"When to use\", \"Call order\" and \"Failure modes\" (case-insensitive) and totals at most 16 KB; anything else is `verification` / `prompt_body_invalid`; a throwing `render` is `internal` / `prompt_render_failed`. Plugin output is untrusted (PALS's LAW). An unknown prompt is `not_found`. The CLI (`fdpm plugin prompts`, `fdpm plugin prompt <id> --arg k=v`) and the SDK (`listPrompts`, `renderPrompt`) MUST use the same pipeline.",
        "",
        "**First prompt.** `planning/triage_iteration` (fdpm.planning): when to use; a call order over real tools and resources (workbook.get → board via the render resource → task/blocker/iteration search → DependsOn/BlockedBy readiness → rank → status transitions with claims → acceptance criterion + plan:Verifies before Done → dry_run before deletes → log.tail verification); failure modes by `plan:val:*` id. Its test cross-checks every tool name against the manifest and every rule id against the plugin's sources, so the prompt cannot drift from what it teaches.",
        "",
        "**Budgets.** Prompts cost nothing until listed; the listing cap keeps `prompts/list` small. The §8.6 instructions gained a PROMPTS paragraph and their budget was ratcheted 4,000 → 4,500 bytes (measured 4,219).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Verification Contract (PALS's law)",
      kind: "prose",
      body_md: [
        "### 14.1 What the server enforces (always)",
        "",
        "- Every Tier 2 / Tier 3 tool response includes the §7 validation report. There is no 'fast path' that skips validation.",
        "- Every input is schema-validated before reaching the handler. A malformed argument never touches `Host`.",
        "- Every tool call is audited.",
        "",
        "### 14.2 What the LLM/client must do (advisory, not enforced)",
        "",
        "- A well-behaved client SHOULD surface the `validation_report` of every Tier 2 response to the user / to the LLM's reasoning context. An LLM that consumes only `ok: true` and ignores the report is the architectural defect PALS's law warns about.",
        "- A well-behaved client SHOULD require user confirmation before invoking Tier 2 / Tier 3 tools.",
        "",
        "### 14.3 Prompt injection posture",
        "",
        "The MCP server is the place in the FDPM system where prompt injection (Greshake et al., 2023) is most concretely a threat. The server cannot prevent it — that is a property of the LLM consuming the data. The server CAN and DOES bound the blast radius: Tier 3 off by default, per-session rate limits, audit log, confirmation-token mode. These are mitigations, not eliminations.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Lifecycle",
      kind: "prose",
      body_md: [
        "### 15.1 Startup",
        "",
        "Parse server flags → construct one `Host`, call `host.load()` → build the tool registry (Tier 1 + Tier 2 + Tier 3 if enabled + plugin tools per `--enable-plugins`) → generate JSON Schemas from Zod → initialize MCP audit log → open the MCP server on stdio → respond to `initialize` with the tool manifest and server metadata.",
        "",
        "### 15.2 Per tool call",
        "",
        "Freshness check → input schema validation → tier-based authorization gate → audit-log entry (call start) → dispatch to `Host.*` → wrap result with required envelope (Tier 2 / Tier 3) → audit-log entry (complete: ok / error, duration, validation status) → return MCP tool-call result.",
        "",
        "### 15.3 Shutdown",
        "",
        "On stdin EOF or SIGTERM: drain in-flight calls, flush persistence, flush audit log, exit 0. SIGINT is treated as SIGTERM. The MCP server is not interactive.",
        "",
        "### 15.4 Reload (SIGHUP on macOS/Linux; SIGBREAK on Windows) (v0.1.9)",
        "",
        "The operator's reload signal is SIGHUP on macOS/Linux and Ctrl+Break (SIGBREAK) on Windows. It is not a shutdown: `Host.reload()` → clear the session freshness map → append a `reload` audit entry → emit the §10.1 `list_changed` notifications. The process keeps serving throughout, on the post-reload state when the reload succeeded and on the pre-reload state when it did not. Restart `fdpm-mcp` when no console is attached to a Windows process.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Tools (catalog)",
      kind: "prose",
      body_md:
        "The full tool catalog by tier is rendered from the Tool primitives bound to this document. Tier 1 tools are exposed `always`; Tier 2 are `default_on`; Tier 3 are `opt_in` (off without `FDPM_MCP_ENABLE_DESTRUCTIVE=1`); a final `never` group documents tools intentionally not exposed.",
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "Configuration",
      kind: "prose",
      body_md:
        "Environment variables / flags governing server behaviour. Inherits `FDPM_DATA_DIR` from Core. MCP-specific keys (`FDPM_MCP_*`) default to safe values — destructive tools off, no plugin tools, audit-args hashed, catalog capped at 28,500 bytes. `FDPM_MCP_CATALOG_BUDGET_BYTES` is the only knob on the §8.5 budget and raises the total only.",
    },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: {
      number: "18",
      title: "Error Categories",
      kind: "prose",
      body_md:
        "The MCP server reuses the existing FDPMException taxonomy without extension. The categories below are the ones MCP additionally documents `evidence.reason` keys for.",
    },
  },
  {
    id: "spec:sec:19",
    type: "spec:Section",
    fields: {
      number: "19",
      title: "Quality-Attribute Scenarios (SEI template)",
      kind: "scenarios",
      body_md: "",
    },
  },
  {
    id: "spec:sec:20",
    type: "spec:Section",
    fields: {
      number: "20",
      title: "Invariants",
      kind: "prose",
      body_md: [
        "Invariants are the non-negotiable properties the implementation MUST preserve. CI and runtime checks each carry a `scope_ref` to the file that enforces them.",
        "",
        ...invariants.map((i) => {
          const f = i.fields as Record<string, string>;
          return `- **${f.label}** — ${f.statement} *(${f.enforcement}: \`${f.scope_ref}\`)*`;
        }),
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:21",
    type: "spec:Section",
    fields: {
      number: "21",
      title: "Requirements",
      kind: "prose",
      body_md: requirements
        .map((r) => {
          const f = r.fields as Record<string, string>;
          return `- **(${f.strength}) ${f.label}** — ${f.statement}`;
        })
        .join("\n"),
    },
  },
  {
    id: "spec:sec:22",
    type: "spec:Section",
    fields: {
      number: "22",
      title: "Acceptance Criteria",
      kind: "acceptance_criteria",
      body_md: "",
    },
  },
  {
    id: "spec:sec:23",
    type: "spec:Section",
    fields: {
      number: "23",
      title: "Conformance",
      kind: "conformance",
      body_md: "",
    },
  },
  {
    id: "spec:sec:24",
    type: "spec:Section",
    fields: {
      number: "24",
      title: "Implementation Plan — Required Changes",
      kind: "implementation_plan",
      body_md: "",
    },
  },
  {
    id: "spec:sec:25",
    type: "spec:Section",
    fields: {
      number: "25",
      title: "Migration",
      kind: "migration",
      body_md:
        "Order matters: SPEC-REPL §13 Host changes must land first; Tier 1 surface lands before Tier 2; plugin-tool exposure is decoupled from v0.1 and may ship independently.",
    },
  },
  {
    id: "spec:sec:26",
    type: "spec:Section",
    fields: {
      number: "26",
      title: "Risks and Mitigations",
      kind: "risks",
      body_md: "",
    },
  },
  {
    id: "spec:sec:27",
    type: "spec:Section",
    fields: {
      number: "27",
      title: "Open Questions",
      kind: "open_questions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:28",
    type: "spec:Section",
    fields: {
      number: "28",
      title: "Future Work",
      kind: "future_work",
      body_md: "",
    },
  },
  {
    id: "spec:sec:29",
    type: "spec:Section",
    fields: {
      number: "29",
      title: "References — verify independently",
      kind: "references",
      body_md: "",
    },
  },
  {
    id: "spec:sec:30",
    type: "spec:Section",
    fields: {
      number: "30",
      title: "Revision history",
      kind: "revision_history",
      body_md: "",
    },
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Sections under the document
  ...sections.map((s, i) => ({
    id: `rel:doc-has-sec-${i + 1}`,
    type: "spec:HasSection",
    from: documentSpec.id,
    to: s.id,
  })),

  // Document defines each Term
  ...termSpecs.map((t, i) => ({
    id: `rel:doc-defines-${i + 1}`,
    type: "spec:Defines",
    from: documentSpec.id,
    to: t.id,
  })),

  // ADR considers each option
  {
    id: "rel:adr-considers-dedicated",
    type: "spec:Considers",
    from: adr.id,
    to: optA.id,
  },
  {
    id: "rel:adr-considers-autogen",
    type: "spec:Considers",
    from: adr.id,
    to: optB.id,
  },
  {
    id: "rel:adr-considers-subcommand",
    type: "spec:Considers",
    from: adr.id,
    to: optC.id,
  },
  {
    id: "rel:adr-considers-replwrap",
    type: "spec:Considers",
    from: adr.id,
    to: optD.id,
  },

  // ADR chose Option A
  {
    id: "rel:adr-chose-dedicated",
    type: "spec:Chose",
    from: adr.id,
    to: optA.id,
  },

  // ADR has trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target quality attributes
  {
    id: "rel:qas-destructive-targets-security",
    type: "spec:Targets",
    from: "spec:qas:destructive-gating",
    to: "spec:qa:security",
  },
  {
    id: "rel:qas-audit-targets-auditability",
    type: "spec:Targets",
    from: "spec:qas:auditability",
    to: "spec:qa:auditability",
  },
  {
    id: "rel:qas-modify-targets-modifiability",
    type: "spec:Targets",
    from: "spec:qas:modifiability",
    to: "spec:qa:modifiability",
  },
  {
    id: "rel:qas-latency-targets-latency",
    type: "spec:Targets",
    from: "spec:qas:latency",
    to: "spec:qa:latency",
  },

  // Mitigations cover risks
  {
    id: "rel:mit-tier3-mitigates-injection",
    type: "spec:Mitigates",
    from: "spec:mit:tier-3-default-off",
    to: "spec:risk:prompt-injection",
  },
  {
    id: "rel:mit-ci-mitigates-misclass",
    type: "spec:Mitigates",
    from: "spec:mit:ci-tier-classification",
    to: "spec:risk:tier-misclassification",
  },
  {
    id: "rel:mit-fuzz-mitigates-drift",
    type: "spec:Mitigates",
    from: "spec:mit:schema-fuzz",
    to: "spec:risk:schema-drift",
  },
  {
    id: "rel:mit-fresh-mitigates-divergence",
    type: "spec:Mitigates",
    from: "spec:mit:freshness-strict",
    to: "spec:risk:concurrent-divergence",
  },
  {
    id: "rel:mit-fsync-mitigates-auditloss",
    type: "spec:Mitigates",
    from: "spec:mit:audit-fsync",
    to: "spec:risk:audit-loss",
  },

  // Migration step dependencies
  {
    id: "rel:mig-2-deps-1",
    type: "spec:DependsOn",
    from: "spec:mig:2",
    to: "spec:mig:1",
  },
  {
    id: "rel:mig-3-deps-2",
    type: "spec:DependsOn",
    from: "spec:mig:3",
    to: "spec:mig:2",
  },
  {
    id: "rel:mig-4-deps-3",
    type: "spec:DependsOn",
    from: "spec:mig:4",
    to: "spec:mig:3",
  },
  {
    id: "rel:mig-5-deps-4",
    type: "spec:DependsOn",
    from: "spec:mig:5",
    to: "spec:mig:4",
  },
  {
    id: "rel:mig-6-deps-4",
    type: "spec:DependsOn",
    from: "spec:mig:6",
    to: "spec:mig:4",
  },
  {
    id: "rel:mig-10-deps-9",
    type: "spec:DependsOn",
    from: "spec:mig:10",
    to: "spec:mig:9",
  },
  {
    id: "rel:mig-9-deps-8",
    type: "spec:DependsOn",
    from: "spec:mig:9",
    to: "spec:mig:8",
  },
  {
    id: "rel:mig-8-deps-7",
    type: "spec:DependsOn",
    from: "spec:mig:8",
    to: "spec:mig:7",
  },
  {
    id: "rel:mig-7-deps-6",
    type: "spec:DependsOn",
    from: "spec:mig:7",
    to: "spec:mig:6",
  },

  // Acceptance criteria verify requirements / invariants
  {
    id: "rel:ac1-verifies-r1",
    type: "spec:Verifies",
    from: "spec:ac:1",
    to: "spec:req:r-001",
  },
  {
    id: "rel:ac2-verifies-r3",
    type: "spec:Verifies",
    from: "spec:ac:2",
    to: "spec:req:r-003",
  },
  {
    id: "rel:ac3-verifies-tier3-inv",
    type: "spec:Verifies",
    from: "spec:ac:3",
    to: "spec:inv:tier-3-default-off",
  },
  {
    id: "rel:ac4-verifies-no-eval-inv",
    type: "spec:Verifies",
    from: "spec:ac:4",
    to: "spec:inv:no-eval-no-shell",
  },
  {
    id: "rel:ac5-verifies-r6",
    type: "spec:Verifies",
    from: "spec:ac:5",
    to: "spec:req:r-006",
  },
  {
    id: "rel:ac6-verifies-r8",
    type: "spec:Verifies",
    from: "spec:ac:6",
    to: "spec:req:r-008",
  },
  {
    id: "rel:ac7-verifies-r5",
    type: "spec:Verifies",
    from: "spec:ac:7",
    to: "spec:req:r-005",
  },

  // Conformance items verify invariants / requirements
  {
    id: "rel:conf1-verifies-tier3",
    type: "spec:Verifies",
    from: "spec:conf:1",
    to: "spec:inv:tier-3-default-off",
  },
  {
    id: "rel:conf2-verifies-vrep",
    type: "spec:Verifies",
    from: "spec:conf:2",
    to: "spec:inv:validation-report-mandatory",
  },
  {
    id: "rel:conf3-verifies-r3",
    type: "spec:Verifies",
    from: "spec:conf:3",
    to: "spec:req:r-003",
  },
  {
    id: "rel:conf4-verifies-r9",
    type: "spec:Verifies",
    from: "spec:conf:4",
    to: "spec:req:r-009",
  },
  {
    id: "rel:conf5-verifies-r4",
    type: "spec:Verifies",
    from: "spec:conf:5",
    to: "spec:req:r-004",
  },
  {
    id: "rel:conf6-verifies-r11",
    type: "spec:Verifies",
    from: "spec:conf:6",
    to: "spec:req:r-011",
  },
  {
    id: "rel:conf6-verifies-measured",
    type: "spec:Verifies",
    from: "spec:conf:6",
    to: "spec:inv:every-payload-measured",
  },

  // ADR resolves the blocking open question
  {
    id: "rel:adr-resolves-plugin-optin",
    type: "spec:Resolves",
    from: adr.id,
    to: "spec:q:plugin-opt-in-shape",
  },

  // Citations
  {
    id: "rel:adr-cites-mcp-spec",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:mcp-spec",
  },
  {
    id: "rel:adr-cites-host-ts",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:host-ts",
  },
  {
    id: "rel:adr-cites-spec-core",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:spec-core",
  },
  {
    id: "rel:adr-cites-spec-pluggable",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:spec-pluggable",
  },
  {
    id: "rel:adr-cites-spec-repl",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:spec-repl",
  },
  {
    id: "rel:doc-cites-claude",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:claude-md",
  },
  {
    id: "rel:doc-cites-greshake",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:greshake",
  },
  {
    id: "rel:doc-cites-iso42010",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:iso-42010",
  },
  {
    id: "rel:doc-cites-sei",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:sei-qas",
  },
  {
    id: "rel:doc-cites-nygard",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:nygard-adr",
  },
  {
    id: "rel:doc-cites-fdpm-bin",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:fdpm-bin",
  },

  // Required reads on the document
  {
    id: "rel:doc-req-claude",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:claude-md",
  },
  {
    id: "rel:doc-req-spec-core",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:spec-core",
  },
  {
    id: "rel:doc-req-spec-pluggable",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:spec-pluggable",
  },
  {
    id: "rel:doc-req-spec-repl",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:spec-repl",
  },

  // Document was introduced in revision 0.1.0, refined in 0.1.1
  {
    id: "rel:doc-revised-0-1-0",
    type: "spec:RevisedIn",
    from: documentSpec.id,
    to: "spec:rev:0-1-0",
  },
  {
    id: "rel:doc-revised-0-1-1",
    type: "spec:RevisedIn",
    from: documentSpec.id,
    to: "spec:rev:0-1-1",
  },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — FDPM MCP Server",
    profile: PROFILE_ID,
    description:
      "SPEC for the FDPM MCP Server — a long-lived process holding one Host and exposing a curated, schema-typed tool surface to MCP clients. Authored as a typed graph using the fdpm.spec-authoring profile.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...stakeholderSpecs,
      ...qaSpecs,
      ...principleSpecs,
      optA,
      optB,
      optC,
      optD,
      adr,
      ...tradeoffs,
      ...scenarios,
      ...toolSpecs,
      ...configEntries,
      ...errorCategories,
      ...invariants,
      ...requirements,
      ...acceptances,
      ...conformance,
      ...changes,
      ...migration,
      ...risks,
      ...mitigations,
      ...openQuestions,
      ...futureWork,
      ...references,
      ...revisions,
      ...sections,
    ])
    .relations(relations)
    .commit();

  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render to Markdown:");
  console.log(
    `  npx tsx fdpm-cli/src/bin/fdpm.ts render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer -o docs/specs/SPEC-MCP-SERVER.md`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error(
      "Findings:",
      JSON.stringify((e as { findings: unknown }).findings, null, 2),
    );
  }
  process.exit(1);
});
