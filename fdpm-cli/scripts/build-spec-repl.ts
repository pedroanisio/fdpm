/**
 * Build the SPEC for "FDPM REPL" using the `fdpm.spec-authoring`
 * plugin profile.
 *
 * Authors SPEC-REPL v0.1 as a typed graph: Document, Sections,
 * Stakeholders, Quality Attributes, ADR with Options + Trade-off
 * Matrix, QA Scenarios, Requirements, Acceptance Criteria, Conformance
 * Items, Risks/Mitigations, Open Questions, Future Work, References,
 * Implementation Plan, Migration Steps, Revisions, Definitions,
 * ConfigEntries, ErrorCategories.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-repl
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-repl npx tsx fdpm-cli/scripts/build-spec-repl.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-repl npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-repl text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-REPL.md
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
  SPEC_MCP_SERVER_PATH,
} from "./_spec-paths.js";

const PROJECT_ID = "spec-repl";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:repl",
  type: "spec:Document",
  fields: {
    title: "SPEC — FDPM REPL v0.1",
    subtitle:
      "A long-lived, interactive process holding one Host that dispatches input lines as commands against the same Commander tree the one-shot CLI exposes.",
    spec_id: "spec:fdpm:repl:0.1",
    version: "0.1.0",
    status: "Proposal",
    audience:
      "FDPM core maintainers, CLI users, plugin authors, agent integrators.",
    required_reads: [
      SPEC_CORE_PATH,
      SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      "PURPOSE.md",
      "CLAUDE.md",
    ],
    companion_code: "fdpm-cli/src/bin/fdpm.ts",
    peer_spec: SPEC_MCP_SERVER_PATH,
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "All output produced via the REPL — by humans or by an LLM driving the REPL " +
      "through its scriptable surface — crosses the same Core boundaries as the " +
      "one-shot CLI and inherits identical validation, §8 schema-gate, and §7 " +
      "pipeline guarantees. The REPL adds NO new trust boundary that bypasses Core.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.1 — pass-2 refinement: per-workbook log freshness, error-taxonomy alignment, persistence-layer claim correction, removal of unverified latency numbers, removal of hazardous :cd.",
    source_script: "fdpm-cli/scripts/build-spec-repl.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-repl",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-repl npx tsx fdpm-cli/scripts/build-spec-repl.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-repl npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-repl text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-REPL.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "REPL",
    "Read-Eval-Print Loop. A long-lived interactive process that reads input lines, dispatches each as a command, and prints the result — peer to the one-shot CLI, sharing one Host.",
    "Read-Eval-Print Loop",
  ],
  [
    "Meta-command",
    "A REPL-only command prefixed with `:` (e.g., `:reload`, `:quit`). Never reaches the Commander tree, never persists to the JSONL log.",
  ],
  [
    "Freshness check",
    "A bounded per-command stat against the workbook log file(s) the command addresses. Detects out-of-band writes by another process before dispatching.",
  ],
  [
    "Strict mode",
    "Default freshness policy for write-capable commands. On detected out-of-band writes, refuse with a `permission` envelope carrying `evidence.reason: \"stale_state\"`.",
  ],
  [
    "Lenient mode",
    "Default freshness policy for read-only commands. On detected out-of-band writes, perform an incremental tail-replay of the changed workbook log(s) into the in-memory Store, then dispatch.",
  ],
  [
    "Scripted mode",
    "Non-interactive REPL invocation via `--script <file>` or stdin redirection. Banner suppressed, prompts suppressed, exit code derived from observed errors.",
  ],
  [
    "projectIdsFromArgs",
    "Per-command-module exported function that statically determines the set of project_ids the command will touch. Consumed by the freshness check; required on every command module.",
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
    id: "spec:stk:end-user",
    role: "End user (author)",
    primary_concern:
      "Fast, iterative authoring; recoverable errors; readable output.",
    category: "human",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Stable command surface to exercise a plugin; safe reload of plugin state.",
    category: "external_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Predictable persistence; no silent data loss; clean shutdown semantics.",
    category: "human",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "No new trust boundary that bypasses Core; no remote attach; no eval-of-strings.",
    category: "internal_team",
  },
  {
    id: "spec:stk:agent-integrator",
    role: "Agent integrator",
    primary_concern:
      "Deterministic output framing; structured error envelopes; explicit prompt cues.",
    category: "external_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "REPL adds zero new state-mutation paths; reuses Commander tree verbatim.",
    category: "internal_team",
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
    id: "spec:qa:latency",
    attribute: "Latency",
    pressure:
      "Per-command latency must be ≪ one-shot CLI (that is the entire point).",
    priority: "primary",
  },
  {
    id: "spec:qa:consistency",
    attribute: "Consistency",
    pressure:
      "Operations from a REPL session must be linearizable with operations from concurrent CLI runs.",
    priority: "primary",
  },
  {
    id: "spec:qa:modifiability",
    attribute: "Modifiability",
    pressure:
      "Adding a new top-level command must require zero REPL-specific work.",
    priority: "primary",
  },
  {
    id: "spec:qa:operability",
    attribute: "Operability",
    pressure:
      "A crashed or `kill -9`'d REPL must leave the JSONL log in a recoverable state.",
    priority: "primary",
  },
  {
    id: "spec:qa:security",
    attribute: "Security",
    pressure:
      "The REPL must not accept code-as-string for execution; only command-tree dispatch.",
    priority: "primary",
  },
  {
    id: "spec:qa:testability",
    attribute: "Testability",
    pressure: "Sessions must be scriptable end-to-end without a TTY.",
    priority: "secondary",
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
    id: "spec:prin:no-new-state-paths",
    ordinal: 1,
    title: "Zero new state-mutation paths.",
    statement:
      "Every state-mutating call in the REPL handler MUST go through `Host.*` methods — the same methods the one-shot CLI uses. The REPL adds no new persistence model, no new operation kind, no new validation gate.",
    strength: "MUST",
  },
  {
    id: "spec:prin:no-eval",
    ordinal: 2,
    title: "No eval, no shell, no code-as-string.",
    statement:
      "Input lines are tokenized and dispatched through the Commander tree. No `eval`, no `Function`, no `child_process.exec*`, no `vm.runInNewContext`, no `:!shell-cmd` in v0.1.",
    strength: "MUST",
  },
  {
    id: "spec:prin:command-tree-reuse",
    ordinal: 3,
    title: "Reuse the Commander tree verbatim.",
    statement:
      "The REPL parses each input line through the same Commander program the one-shot CLI uses. Adding a new top-level command must require zero REPL-specific work.",
    strength: "MUST",
  },
  {
    id: "spec:prin:explicit-staleness",
    ordinal: 4,
    title: "Staleness is surfaced, not hidden.",
    statement:
      "On detected out-of-band writes to a workbook's log, the REPL MUST refuse write-capable commands (strict mode) or perform an explicit incremental replay (lenient mode for read-only). The REPL MUST NOT silently background-reload.",
    strength: "MUST",
  },
  {
    id: "spec:prin:scriptable-without-tty",
    ordinal: 5,
    title: "Scriptable without a TTY.",
    statement:
      "The REPL must run end-to-end without a terminal allocated. `--script <file>` and stdin redirection are first-class; the test harness depends on this.",
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
  id: "spec:opt:in-process-dispatcher",
  type: "spec:Option",
  fields: {
    label: "Option A — In-process REPL reusing the Commander tree",
    description:
      "A new `fdpm repl` subcommand. One Host per session. Each input line is tokenized and re-parsed through the same Commander program the one-shot CLI uses. Freshness is enforced by `mtime`/`size` checks on the per-workbook JSONL log before each command.",
    pros: [
      "Zero new state paths.",
      "Adding a command requires no REPL change.",
      "Implementation is small and audit-friendly.",
      "Tests run as scripts without a TTY.",
      "No new IPC surface to secure.",
    ],
    cons: [
      "Cache invalidation is the operator's problem (mitigated by strict-mode default and explicit `:reload`).",
      "Tab completion is constrained.",
      "Single-process: cannot share warm state across operators.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:daemon",
  type: "spec:Option",
  fields: {
    label: "Option B — Daemon process + thin client",
    description:
      "Run a long-lived `fdpm-daemon` that holds the Host. CLI invocations become RPC calls. Multiple shells share warm state.",
    pros: [
      "Maximum latency win across all invocations, not just within one REPL session.",
      "Naturally serializes writes through one process.",
    ],
    cons: [
      "Introduces a new IPC surface (Unix socket or HTTP).",
      "New authentication problem (who can send commands to the daemon?).",
      "New lifecycle problem (when does the daemon start/stop?).",
      "New deployment artifact; large security review burden.",
      "Violates the 'smallest change that solves the four motivating problems' criterion.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Not the smallest change that solves the motivating problems. Authn and lifecycle are unsolved at this layer.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:node-repl-eval",
  type: "spec:Option",
  fields: {
    label:
      "Option C — Repurpose Node.js's built-in `repl` module with the Host exposed as a global",
    description:
      "A Node REPL with `host` bound in scope. Operators type JS expressions.",
    pros: ["Trivial to build.", "Maximum power."],
    cons: [
      "Catastrophic. Eval-of-input is exactly the security boundary CLAUDE.md and PALS's law forbid.",
      "Every Core invariant becomes optional ('just call host.store.appendDirect()').",
      "No structured output for agents.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Rejected on safety grounds; not a real option. Violates Principle 2 (no eval).",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:repl-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-REPL-001",
    title: "Build the REPL as an in-process command-tree dispatcher.",
    status: "proposed",
    date: "2026-05-04",
    context:
      "The `fdpm` CLI pays significant cold-start cost on every invocation (JSONL replay, plugin discovery, profile registration). Authoring, plugin development, and agent-driven workflows all need a faster iterative loop. A REPL is the smallest change that delivers this. Decision space bounded by: (a) latency must drop substantially per command; (b) consistency with concurrent CLI invocations must remain explicit — silent stale reads/writes are unacceptable; (c) the REPL must add zero new state-mutation paths (Core invariants must be preserved verbatim); (d) modifiability — adding a new top-level command must require zero REPL-specific work.",
    decision:
      "Build the REPL as a thin dispatcher inside the existing `fdpm` binary, reusing the Commander command tree by re-parsing each input line through the same root program with a long-lived `Host`. Maintain process-local cache invalidation by treating each per-workbook JSONL log file's `mtime`/`size` as a freshness signal and reloading affected state when staleness is detected on the next command. Provide an explicit `:reload` meta-command for forced reload. No daemon, no new IPC, no new persistence path.",
    consequences: [
      {
        polarity: "positive",
        text: "Fast iterative loop. Stable command surface for plugin authors and agents.",
      },
      { polarity: "positive", text: "Adding new commands costs nothing in REPL code." },
      { polarity: "positive", text: "Test surface is identical to the existing CLI." },
      {
        polarity: "negative",
        text: "Two REPLs against one data dir is still racy at the pipeline level (mitigated, not solved — see §7.4).",
      },
      {
        polarity: "negative",
        text: "Cache invalidation requires explicit operator action in some scenarios.",
      },
      { polarity: "negative", text: "No cross-process warm state." },
      {
        polarity: "neutral",
        text: "No new error category is introduced; staleness reuses `permission` with a structured `evidence.reason`.",
      },
      {
        polarity: "neutral",
        text: "A `readOnly` flag and a `projectIdsFromArgs` function are added to every command module (mechanical, CI-enforced).",
      },
    ],
    compliance_checks: [
      "Test: every state-mutation in REPL handlers must trace to a Host.* call. Verified by a grep-level CI check on the REPL source.",
      "Test: scripted-mode test suite covers §5, §6, §7, §8, §9.",
      "CI: every command module exports both `readOnly: boolean` and `projectIdsFromArgs(parsed) => string[]`. No defaults.",
      "CI: no REPL handler imports node:vm, eval, Function, or node:child_process.",
    ],
    revisit_signals: [
      "If more than one operator opens the same data dir regularly and `permission` / `stale_state` errors become the dominant failure mode, revisit Option B (daemon).",
      "If LLM-driven REPL sessions become the dominant use case and require streaming partial responses, revisit the request/response framing.",
    ],
  },
};

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:latency",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Per-command latency (warm)",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "Bounded by §14.1 ratio" },
        { option_id: "spec:opt:daemon", value: "Lower (cross-process warm)" },
        { option_id: "spec:opt:node-repl-eval", value: "Lowest (no checks; unsafe)" },
      ],
    },
  },
  {
    id: "spec:tx:effort",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Implementation effort",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "S" },
        { option_id: "spec:opt:daemon", value: "L" },
        { option_id: "spec:opt:node-repl-eval", value: "XS" },
      ],
    },
  },
  {
    id: "spec:tx:trust-boundary",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "New trust boundary",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "None" },
        { option_id: "spec:opt:daemon", value: "IPC + authn" },
        { option_id: "spec:opt:node-repl-eval", value: "Catastrophic (eval input)" },
      ],
    },
  },
  {
    id: "spec:tx:add-command",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Adding a new command",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "Zero REPL work" },
        { option_id: "spec:opt:daemon", value: "Schema + RPC binding" },
        { option_id: "spec:opt:node-repl-eval", value: "Zero work; also zero safety" },
      ],
    },
  },
  {
    id: "spec:tx:cross-process",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Cross-process warm state",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "No" },
        { option_id: "spec:opt:daemon", value: "Yes" },
        { option_id: "spec:opt:node-repl-eval", value: "No" },
      ],
    },
  },
  {
    id: "spec:tx:agent-contract",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Agent-drivable contract",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "JSON line framing" },
        { option_id: "spec:opt:daemon", value: "Native (RPC), but new surface" },
        { option_id: "spec:opt:node-repl-eval", value: "Free-form; unverifiable" },
      ],
    },
  },
  {
    id: "spec:tx:core-fit",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Fits SPEC-CORE invariants",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "Yes" },
        { option_id: "spec:opt:daemon", value: "Requires re-statement" },
        { option_id: "spec:opt:node-repl-eval", value: "Violates §7, §8 by design" },
      ],
    },
  },
  {
    id: "spec:tx:tco",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Total cost of ownership (build + operate)",
      cells: [
        { option_id: "spec:opt:in-process-dispatcher", value: "Low" },
        { option_id: "spec:opt:daemon", value: "High" },
        { option_id: "spec:opt:node-repl-eval", value: "'Low' but unsafe" },
      ],
    },
  },
];

// ── §14 Quality-Attribute Scenarios ────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:latency",
    type: "spec:QAScenario",
    fields: {
      title: "Latency — warm read",
      source: "Interactive operator.",
      stimulus:
        "Submits a read-only command (e.g. `primitive list`) for the second time in a session.",
      environment:
        "Default mode; data dir on local disk; no concurrent writer.",
      artifact: "REPL read loop + Host.",
      response: "Command returns successfully.",
      response_measure:
        "Wall-clock dispatch time on the second invocation must be a small constant fraction of the one-shot CLI's wall-clock for the same command on the same data dir. Threshold: REPL p50 ≤ 25 % of one-shot CLI p50, measured by the test harness on the workbook's standard fixture set. The exact ratio depends on fixture size; the SPEC asserts the threshold, not a specific millisecond figure.",
    },
  },
  {
    id: "spec:qas:consistency",
    type: "spec:QAScenario",
    fields: {
      title: "Consistency — out-of-band write detection",
      source:
        "A second writer (one-shot CLI invocation) running against the same data dir.",
      stimulus:
        "Appends an operation to the JSONL log between two REPL commands.",
      environment:
        "Default (strict) freshness mode; REPL has a write command queued.",
      artifact: "REPL freshness check.",
      response:
        "REPL refuses the write with a `permission` error envelope (`evidence.reason: \"stale_state\"`, per §9) and prompts the operator to `:reload`.",
      response_measure:
        "100 % detection of out-of-band writes within one command boundary (no silent stale-write).",
    },
  },
  {
    id: "spec:qas:operability",
    type: "spec:QAScenario",
    fields: {
      title: "Operability — torn-write recovery",
      source: "Operator.",
      stimulus:
        "`kill -9` of the REPL process during an in-flight write command.",
      environment: "Default mode, persistent.",
      artifact: "JSONL log on disk.",
      response:
        "Either the operation is fully on disk (and visible to a fresh process) or it is fully absent (no torn record).",
      response_measure:
        "100 % of recoveries from a fresh `Host.load()` succeed without manual repair.",
    },
  },
  {
    id: "spec:qas:testability",
    type: "spec:QAScenario",
    fields: {
      title: "Testability — runs without a TTY",
      source: "CI.",
      stimulus: "Runs the REPL test suite on a host without a TTY.",
      environment: "vitest; no terminal allocated.",
      artifact: "REPL `--script` mode.",
      response: "Every behavioral test passes.",
      response_measure:
        "Zero TTY dependencies. The SPEC asserts only 'must run without a TTY', which is the verifiable property.",
    },
  },
];

// ── Configuration entries (§5.1, §7.2, §10) ────────────────────────────────

const configEntries: PrimitiveSpec[] = [
  {
    id: "spec:cfg:data-dir",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_DATA_DIR",
      default: "",
      purpose:
        "Inherited from Core: data directory the REPL's Host operates against. Bound at REPL startup; immutable for the session lifetime.",
      scope: "core",
      kind: "path",
    },
  },
  {
    id: "spec:cfg:freshness",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_REPL_FRESHNESS",
      default: "on",
      purpose:
        "When `off`, disables the per-command freshness check. Operators on networked filesystems may set this for tight read loops where they accept the stale-read risk.",
      scope: "repl",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:history",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_REPL_HISTORY",
      default: "0",
      purpose:
        "When set, persists a per-session history file at `$FDPM_DATA_DIR/repl-history.txt`. Default off — REPL input is treated as sensitive by default.",
      scope: "repl",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:no-persist",
    type: "spec:ConfigEntry",
    fields: {
      key: "--no-persist",
      default: "",
      purpose:
        "Run the Host purely in-memory; no JSONL log writes. Useful for ephemeral exploration sessions and tests.",
      scope: "core",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:no-banner",
    type: "spec:ConfigEntry",
    fields: {
      key: "--no-banner",
      default: "",
      purpose:
        "Suppress the startup banner. Useful for agents and for `--script` mode.",
      scope: "repl",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:script",
    type: "spec:ConfigEntry",
    fields: {
      key: "--script",
      default: "",
      purpose:
        "Read commands from the given file (one per line; `#` starts a comment). Exits at EOF. Canonical test-harness path.",
      scope: "repl",
      kind: "path",
    },
  },
  {
    id: "spec:cfg:exit-on-error",
    type: "spec:ConfigEntry",
    fields: {
      key: "--exit-on-error",
      default: "",
      purpose:
        "In scripted mode, exit with a non-zero code on the first command that raises an FDPMException. Default: continue and report at session end.",
      scope: "repl",
      kind: "boolean",
    },
  },
  {
    id: "spec:cfg:json",
    type: "spec:ConfigEntry",
    fields: {
      key: "--json",
      default: "",
      purpose:
        "Session-wide default for JSON output framing. Identical semantics to the one-shot CLI flag. Per-command `--json` overrides remain available.",
      scope: "repl",
      kind: "boolean",
    },
  },
];

// ── Error categories (§9) ─────────────────────────────────────────────────

const errorCategories: PrimitiveSpec[] = [
  {
    id: "spec:err:permission",
    type: "spec:ErrorCategory",
    fields: {
      category: "permission",
      when_used:
        "§7.2 staleness refusal. The REPL reuses the existing FDPMException taxonomy without extension; staleness conflicts surface as `permission` with `evidence.reason: \"stale_state\"` and `evidence.advice: \"run :reload or restart the REPL\"`.",
      evidence_keys: ["reason", "advice"],
    },
  },
  {
    id: "spec:err:validation",
    type: "spec:ErrorCategory",
    fields: {
      category: "validation",
      when_used:
        "§7 pipeline rejected the operation. Surfaced via the existing JSON envelope; the REPL adds no new framing.",
      evidence_keys: ["findings"],
    },
  },
  {
    id: "spec:err:internal",
    type: "spec:ErrorCategory",
    fields: {
      category: "internal",
      when_used:
        "Unknown / non-FDPMException errors. In interactive mode, prints a one-line summary and a stack trace on stderr and returns to the prompt — does NOT trigger process exit. In batch mode with `--exit-on-error`, exits with `EXIT_CODE_FOR_CATEGORY.internal`.",
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
        "Every state-mutating call in the REPL handler MUST trace to a Host.* method. Direct access to `host.store` or `host.persistence` is a CI-failing offense.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/src/commands/repl.ts",
    },
  },
  {
    id: "spec:inv:no-eval",
    type: "spec:Invariant",
    fields: {
      label: "No eval, no shell, no vm.",
      statement:
        "The REPL handler MUST NOT import `node:vm`, `eval`, `Function`, or `node:child_process`. `:!shell-cmd` is reserved syntax that the REPL MUST reject with a clear error in v0.1.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/src/commands/repl.ts",
    },
  },
  {
    id: "spec:inv:no-write-batching",
    type: "spec:Invariant",
    fields: {
      label: "No write batching across the command boundary.",
      statement:
        "The REPL MUST NOT introduce write batching, deferred persistence, or any mechanism that holds an `appendAndPersist` result in memory beyond the single command boundary. Each successful command's persisted operation must be visible to a fresh process before the next prompt is displayed.",
      enforcement: "review",
      scope_ref: "fdpm-cli/src/commands/repl.ts",
    },
  },
  {
    id: "spec:inv:dataDir-immutable",
    type: "spec:Invariant",
    fields: {
      label: "dataDir is immutable for the session lifetime.",
      statement:
        "`dataDir` is bound at startup. To switch data dirs, exit the REPL and start a new one. There is no `:cd` or `:datadir` meta-command in v0.1.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/commands/repl.ts §5.5",
    },
  },
  {
    id: "spec:inv:freshness-required",
    type: "spec:Invariant",
    fields: {
      label: "Every command runs the freshness check before dispatch.",
      statement:
        "Before dispatching each command (except meta-commands), the REPL MUST run the per-workbook freshness check defined in §7.2. Disabling it requires the explicit `FDPM_REPL_FRESHNESS=off` opt-out.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/commands/repl.ts §7.2",
    },
  },
];

// ── §17 Requirements ──────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:r-001",
    type: "spec:Requirement",
    fields: {
      label: "fdpm repl subcommand",
      statement:
        "The CLI MUST expose a top-level `fdpm repl` subcommand accepting `--data-dir`, `--no-persist`, `--no-banner`, `--script`, `--exit-on-error`, `--json` flags.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/entry.test.ts",
    },
  },
  {
    id: "spec:req:r-002",
    type: "spec:Requirement",
    fields: {
      label: "Single Host per session",
      statement:
        "The REPL MUST construct exactly one Host at startup (with `host.load()` awaited) and reuse it across every dispatched command for the session's lifetime.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "fdpm-cli/src/commands/repl.ts",
    },
  },
  {
    id: "spec:req:r-003",
    type: "spec:Requirement",
    fields: {
      label: "POSIX shell-word tokenization",
      statement:
        "Input lines MUST be tokenized with POSIX shell-word splitting (single quotes, double quotes, backslash escape). NO variable expansion, NO command substitution, NO glob expansion.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/tokenize.test.ts",
    },
  },
  {
    id: "spec:req:r-004",
    type: "spec:Requirement",
    fields: {
      label: "Per-workbook freshness check",
      statement:
        "Before dispatching each command, the REPL MUST stat each addressed workbook's JSONL log file and the profiles directory. On detected change, refuse (strict) or replay tail (lenient) per §7.2.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/freshness.test.ts",
    },
  },
  {
    id: "spec:req:r-005",
    type: "spec:Requirement",
    fields: {
      label: "Per-command-module readOnly + projectIdsFromArgs",
      statement:
        "Every `fdpm-cli/src/commands/*.ts` module MUST export both `readOnly: boolean` and `projectIdsFromArgs(parsed) => string[]`. CI MUST fail the build if any module omits either export. No defaults.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "fdpm-cli/tests/repl/command-metadata.test.ts",
    },
  },
  {
    id: "spec:req:r-006",
    type: "spec:Requirement",
    fields: {
      label: "exitOverride on Commander program",
      statement:
        "The Commander program MUST be configured with `.exitOverride()` so a per-command parse error does NOT `process.exit` the whole REPL. Errors return to the prompt instead.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/error-recovery.test.ts",
    },
  },
  {
    id: "spec:req:r-007",
    type: "spec:Requirement",
    fields: {
      label: "JSON-mode framing",
      statement:
        "In `--json` mode, every command response MUST be a single JSON value on one line followed by `\\n` on stdout. Banners, prompts, and diagnostic messages MUST go to stderr only.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/json-framing.test.ts",
    },
  },
  {
    id: "spec:req:r-008",
    type: "spec:Requirement",
    fields: {
      label: "Scripted-mode end-of-session summary",
      statement:
        "In `--script` mode with `--json`, the REPL MUST emit a final `{\"summary\": {...}}` line on stdout containing counts of ok/error commands and a wall-clock duration.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/script-mode.test.ts",
    },
  },
  {
    id: "spec:req:r-009",
    type: "spec:Requirement",
    fields: {
      label: "Reload semantics",
      statement:
        "`:reload` MUST atomically swap the in-process Host references with a freshly-loaded set against the same dataDir. `:reload plugins` MUST re-run plugin discovery and activation only.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/reload.test.ts",
    },
  },
  {
    id: "spec:req:r-010",
    type: "spec:Requirement",
    fields: {
      label: "Signal handling — first SIGINT cancels input",
      statement:
        "The first SIGINT MUST cancel input editing and return to a fresh prompt. A second SIGINT within 2 seconds MUST trigger the abrupt-shutdown path. SIGTERM and SIGHUP MUST trigger clean shutdown.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/signals.test.ts",
    },
  },
  {
    id: "spec:req:r-011",
    type: "spec:Requirement",
    fields: {
      label: ":cd and :!shell-cmd are forbidden in v0.1",
      statement:
        "The REPL MUST reject `:cd` and `:!<shell-cmd>` with a clear error in v0.1. Rationale: `:cd` would silently change plugin discovery semantics; `:!` is eval-of-shell which Principle 2 forbids.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/repl/forbidden-meta.test.ts",
    },
  },
  {
    id: "spec:req:r-012",
    type: "spec:Requirement",
    fields: {
      label: "No new error categories",
      statement:
        "The REPL MUST reuse the existing FDPMException taxonomy without extension. Staleness reuses `permission` with structured `evidence.reason: \"stale_state\"`.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "fdpm-cli/src/core/errors/fdpm-exception.ts",
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
        "`fdpm repl` boots, prints a banner (or suppresses with `--no-banner`), enters the read loop, and exits cleanly on `:quit`.",
      status: "open",
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion:
        "Every `fdpm-cli/src/commands/*.ts` module exports `readOnly` and `projectIdsFromArgs`; CI rejects builds that omit either.",
      status: "open",
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "Strict-mode freshness test: after a concurrent CLI write to workbook P, a write-capable REPL command targeting P refuses with `permission` + `evidence.reason: \"stale_state\"`.",
      status: "open",
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "Lenient-mode freshness test: after a concurrent CLI write, a read-only REPL command incrementally replays the new tail and returns the post-write state.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "JSON-mode framing test: every command response is exactly one JSON line on stdout; banner and prompt are on stderr only; agents can parse without TTY.",
      status: "open",
    },
  },
  {
    id: "spec:ac:6",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 6,
      criterion:
        "Scripted-mode `--exit-on-error` test: first failing command exits with the matching `EXIT_CODE_FOR_CATEGORY` value; without the flag, exit code is the highest seen at session end.",
      status: "open",
    },
  },
  {
    id: "spec:ac:7",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 7,
      criterion:
        "Forbidden-meta test: `:cd /tmp` and `:!ls` both produce a clear error and do NOT execute their action.",
      status: "open",
    },
  },
  {
    id: "spec:ac:8",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 8,
      criterion:
        "REPL test suite runs end-to-end on a TTY-less host (CI runner) without timing out.",
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
      name: "Single Host across the session",
      procedure:
        "Start `fdpm repl --no-banner`. Run two read-only commands back-to-back. Inspect process memory / instrumentation to verify no second `Host.load()` was called.",
      expected:
        "Exactly one `Host.load()` invocation per session. Second-command latency is dominated by dispatch, not load.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Strict-mode staleness refusal",
      procedure:
        "Start REPL session A against workbook P. From a separate process, run `fdpm primitive create --workbook P ...`. Then in A, attempt a write-capable command against P.",
      expected:
        "A refuses with category=`permission`, evidence.reason=`stale_state`, evidence.advice mentioning `:reload`. After `:reload`, the same command succeeds.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Lenient-mode incremental replay",
      procedure:
        "Start REPL session A. From a separate process, append an op to workbook P's log. In A, run `primitive list --workbook P` (read-only).",
      expected:
        "A replays the new tail incrementally and returns the post-write state. No `permission` error.",
    },
  },
  {
    id: "spec:conf:4",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 4,
      name: "JSON framing for agents",
      procedure:
        "Pipe `--script` input through `fdpm repl --json --no-banner`. Assert stdout contains exactly one JSON object per command line plus one final `{\"summary\": ...}`.",
      expected:
        "stdout is a stream of JSON values, one per line. stderr carries banner/prompt diagnostics only.",
    },
  },
  {
    id: "spec:conf:5",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 5,
      name: "Forbidden meta-commands rejected",
      procedure: "In an interactive REPL, type `:cd /tmp` then `:!ls`.",
      expected:
        "Both produce a one-line error referencing this SPEC's §5.5/§5.5.1 and §12. Neither performs its action.",
    },
  },
  {
    id: "spec:conf:6",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 6,
      name: "Torn-write recovery after kill -9",
      procedure:
        "Start a write-capable command in REPL session A. Mid-flight, send SIGKILL. Restart `fdpm` and run `validate --workbook P`.",
      expected:
        "The operation is either fully on disk or fully absent; no torn record. Validate returns no findings caused by JSONL malformation.",
    },
  },
];

// ── §13 Implementation Plan ────────────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:bin-fdpm",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/bin/fdpm.ts",
      change:
        "Register a new `buildReplCommand(host, programFactory)` subcommand. Factor `handleError` so the REPL can reuse the framing without the `process.exit` call.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:repl-cmd",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/commands/repl.ts",
      change:
        "New file: read loop, meta-commands, freshness check, signal handling, JSON framing, scripted-mode driver.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:command-metadata",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/commands/*.ts",
      change:
        "Export `readOnly: boolean` and `projectIdsFromArgs(parsed) => string[]` alongside the existing `buildXCommand`. CI fails the build if any command module omits either.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:host-reload",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/host.ts",
      change:
        "Add `Host.reload()` (atomically swaps store/registry/runtime) and `Host.reloadProjectTail(workbook_id)` for §7.2 lenient-mode incremental replay.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:jsonl-stat",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/persistence/jsonl-log.ts",
      change:
        "Expose a public `statProjectLog(workbook_id) => {mtime, size} | null`. NO `flush()` is needed — `appendOp` already writes per call.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:errors-no-change",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/errors/fdpm-exception.ts",
      change:
        "NO taxonomy change required. Staleness reuses `permission` with `evidence.reason: \"stale_state\"`.",
      complexity: "XS",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/tests/repl/",
      change:
        "Scripted-mode tests covering §5, §6, §7, §8, §9. Tokenize, freshness, reload, JSON framing, scripted-mode summary, signals, forbidden-meta, error recovery, command-metadata. Coverage target ≥ 60 % (CLI rule).",
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
        "New section documenting `fdpm repl` for agent integrators (frame, JSON contract, exit codes).",
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
      label: "Land per-command-module metadata",
      action:
        "Add `readOnly` and `projectIdsFromArgs` exports to every fdpm-cli/src/commands/*.ts module. Add CI check that fails on missing exports. Mechanical and decoupled from REPL itself.",
      affected_paths: ["fdpm-cli/src/commands/"],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Add Host.reload() and Host.reloadProjectTail()",
      action:
        "Implement atomic swap of store/registry/runtime, and per-workbook tail replay. Cover with unit tests before the REPL lands.",
      affected_paths: ["fdpm-cli/src/core/host.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Expose statProjectLog on JsonlLogStore",
      action:
        "Public `statProjectLog(workbook_id) => {mtime, size} | null`. Used exclusively by the REPL freshness check.",
      affected_paths: ["fdpm-cli/src/persistence/jsonl-log.ts"],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Implement REPL command and entry",
      action:
        "Land fdpm-cli/src/commands/repl.ts with read loop, meta-commands, freshness, signals, JSON framing. Wire `buildReplCommand` in fdpm.ts. Factor handleError.",
      affected_paths: [
        "fdpm-cli/src/commands/repl.ts",
        "fdpm-cli/src/bin/fdpm.ts",
      ],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "Test suite + AGENTS.md",
      action:
        "Land fdpm-cli/tests/repl/ end-to-end script-mode tests. Document the agent contract in AGENTS.md.",
      affected_paths: ["fdpm-cli/tests/repl/", "AGENTS.md"],
      depends_on: ["spec:mig:4"],
    },
  },
];

// ── §17 / §20 Risks & Mitigations ──────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:concurrent-divergence",
    type: "spec:Risk",
    fields: {
      label: "Concurrent CLI/REPL divergence",
      description:
        "Two writers against one dataDir. JSONL append-only with OS file locking, but each process's post-command pipeline runs against an in-memory state that only sees its own writes. Each will see its own write succeed and detect the other's only on the next freshness check.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:plugin-staleness",
    type: "spec:Risk",
    fields: {
      label: "Plugin staleness during a session",
      description:
        "Operator installs/updates a plugin while a REPL session is open. The freshness check does NOT stat plugin directories per command (would defeat the latency goal); the in-memory plugin set goes stale.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:tokenizer-drift",
    type: "spec:Risk",
    fields: {
      label: "Hand-rolled tokenizer diverges from POSIX",
      description:
        "A hand-rolled tokenizer ships with subtle quoting bugs that diverge from the operator's shell expectations. Becomes an injection vector for plugin/LLM-supplied input.",
      likelihood: "low",
      impact: "high",
    },
  },
  {
    id: "spec:risk:cwd-mutation",
    type: "spec:Risk",
    fields: {
      label: "cwd mutation via :cd silently changes plugin discovery",
      description:
        "If `:cd` were allowed, mutating `process.cwd()` would change `HostOptions.cwd` for plugin discovery. A subsequent `:reload plugins` would discover a different set, silently changing the registered profile list mid-session.",
      likelihood: "low",
      impact: "high",
    },
  },
  {
    id: "spec:risk:write-batching",
    type: "spec:Risk",
    fields: {
      label: "Future REPL optimization introduces hidden write batching",
      description:
        "An optimization that holds an `appendAndPersist` result in memory beyond the command boundary would silently break the abrupt-shutdown recoverability invariant.",
      likelihood: "low",
      impact: "high",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:strict-default-write",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Strict mode is the default for write-capable commands. On detected out-of-band writes, refuse with `permission`+`stale_state` rather than silently writing from a stale base. Operators see the conflict immediately.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:explicit-reload-plugins",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Plugin staleness is addressed by the explicit `:reload plugins` meta-command or by process restart. The SPEC documents this as a known limitation rather than auto-detecting it (which would defeat latency).",
      status: "planned",
    },
  },
  {
    id: "spec:mit:vetted-tokenizer",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Tokenization MUST use a vetted library (e.g. `shell-quote`'s parser) rather than a hand-rolled splitter. Variable expansion / command substitution / glob expansion are forbidden.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cd-forbidden",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "`:cd` is forbidden in v0.1. The supported pattern is exit + change dir + restart. A future revision may introduce a per-command `--cwd` override that does not touch process-global cwd.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:no-batching-invariant",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Negative invariant: the REPL MUST NOT introduce write batching. Any future REPL optimization must verify this invariant explicitly. Documented in §8.4 and tested by the torn-write recovery scenario (§14.3).",
      status: "planned",
    },
  },
];

// ── §22 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:read-only-freshness-default",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should the default freshness mode for read-only commands be strict (refuse with `permission`+`stale_state` envelope) or lenient (incremental replay then dispatch)?",
      default_choice:
        "Strict for write-capable commands; LENIENT for read-only commands. Read-only staleness has no persistence consequences and the latency benefit is the entire point of the REPL.",
      is_blocking: "yes",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:tab-completion",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Ship tab completion in v0.1 (sourced from registry only, not filesystem) or omit entirely?",
      default_choice:
        "Optional in v0.1. If clean implementation within the registry-only constraint cannot be delivered, omit and add a `:reload` hint to the banner. Filesystem-sourced completion is explicitly forbidden.",
      is_blocking: "no",
    },
  },
];

// ── §17/§20 Future Work ────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:streaming",
    type: "spec:FutureWork",
    fields: {
      label: "Streaming partial responses for long-running commands",
      description:
        "v0.1 is request/response only. A streaming framing for long validate/render runs is deferred.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:cross-process",
    type: "spec:FutureWork",
    fields: {
      label: "Cross-process warm state",
      description:
        "Revisit Option B (daemon) if shared warm state across multiple shells becomes load-bearing.",
      target_version: "0.3",
      deferred_reason: ["Authn and lifecycle are unsolved at the daemon layer."],
    },
  },
  {
    id: "spec:fw:fs-completion",
    type: "spec:FutureWork",
    fields: {
      label: "Tab completion sourced from filesystem under a strict trust model",
      description:
        "v0.1 forbids filesystem-sourced completion to avoid accidental disclosure for agent-driven sessions. A future trust model may enable opt-in fs completion.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:multiline",
    type: "spec:FutureWork",
    fields: {
      label: "Multi-line command continuation with `\\`",
      description:
        "v0.1 is single-line per command. Multi-line continuation requires continuation-prompt UX that is not justified yet.",
      target_version: "0.2",
    },
  },
  {
    id: "spec:fw:write-leases",
    type: "spec:FutureWork",
    fields: {
      label: "Coordinated write leases between concurrent REPLs / CLI runs",
      description:
        "File-locked exclusive write leases would let multiple REPLs serialize writes safely against the same dataDir. Out of scope for v0.1.",
      target_version: "0.3",
    },
  },
  {
    id: "spec:fw:macro",
    type: "spec:FutureWork",
    fields: {
      label: "`:macro` system for replayable command sequences",
      description:
        "Today, use `--script <file>` instead. A `:macro` meta-command would let operators record and replay a sequence in-session.",
      target_version: "0.2",
    },
  },
];

// ── §23 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
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
        "Cited for the stakeholders / concerns / views vocabulary used in §2 and elsewhere.",
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
        "Cited as the canonical reference for the prompt-injection threat class invoked in §12.",
    },
  },
  {
    id: "spec:ref:spec-core",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "SPEC-CORE — Core invariants the REPL must preserve.",
      locator: SPEC_CORE_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:spec-pluggable",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "SPEC-PLUGGABLE-ARCHITECTURE — Plugin runtime contract.",
      locator: SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:spec-mcp",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "SPEC-MCP-SERVER — Peer surface; shares Host.reload(), Host.reloadProjectTail(), the projectIdsFromArgs metadata, and the permission+stale_state staleness convention.",
      locator: SPEC_MCP_SERVER_PATH,
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:fdpm-bin",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "Existing one-shot CLI entry point.",
      locator: "fdpm-cli/src/bin/fdpm.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:host-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "Host class — composition the REPL holds.",
      locator: "fdpm-cli/src/core/host.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:jsonl-log",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "JsonlLogStore — per-workbook append-only log targeted by the freshness stat check.",
      locator: "fdpm-cli/src/persistence/jsonl-log.ts",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time.",
    },
  },
  {
    id: "spec:ref:fdpm-exception",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "FDPMException taxonomy reused without extension.",
      locator: "fdpm-cli/src/core/errors/fdpm-exception.ts",
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
        "First authored revision. In-process dispatcher chosen; daemon and Node-REPL-eval rejected; freshness model declared.",
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
        "Per-workbook log freshness (replaces a single-global-log assumption); error-taxonomy alignment with FDPMException (no new categories); persistence-layer claim correction (no flush() needed); removal of unverified latency numbers in favor of a ratio threshold; removal of hazardous `:cd` meta-command. Re-authored as a typed graph via fdpm.spec-authoring.",
      affected_sections: ["5", "7", "8", "9", "13", "14"],
      kind: "patch",
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
        "This SPEC defines the **REPL surface** of the `fdpm` CLI: a long-lived, interactive process that holds **one** `Host` instance for its lifetime and dispatches lines of input as commands against the same command tree already exposed by [fdpm.ts](../../fdpm-cli/src/bin/fdpm.ts).",
        "",
        "The REPL is a **second front-end** to the Core, peer to the one-shot CLI. It does not replace the one-shot CLI, does not introduce a new capability, and does not weaken any Core invariant.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- A new wire protocol or daemon. The REPL is an in-process loop bound to a TTY (or a pair of pipes); it is not a server.",
        "- A new persistence model. Operations performed in a REPL session are appended to the same JSONL log as one-shot invocations.",
        "- A new authentication or authorization model. The REPL inherits the filesystem-trust posture of the underlying CLI process.",
        "- A scripting/macro language beyond what is necessary to script the REPL itself (see §6).",
        "- LLM-specific affordances. The REPL is shape-stable enough that an LLM agent may drive it, but no LLM-specific commands are added.",
        "",
        "### 1.3 Why a REPL (motivation)",
        "",
        "Four problems a REPL solves that the current one-shot CLI cannot: (1) cold-start cost is paid per command — every `fdpm <subcmd>` re-runs `Host.load()`, replaying the JSONL log, discovering plugins, registering profiles; (2) no iterative authoring loop — authoring a profile or primitive set is naturally exploratory: try, validate, inspect, refine; (3) no coherent session for batch authoring — between two `fdpm` invocations the world can change; (4) no interactive surface for plugin and profile experimentation.",
        "",
        "The REPL is not 'the CLI but interactive.' It is the CLI plus a **stable, addressable session**.",
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
        "The recurring tension is **latency vs. consistency**: keeping a Host hot across commands is the latency win; ensuring that two REPLs (or a REPL plus a one-shot CLI) running against the same data dir do not silently diverge is the consistency cost. §10 (Concurrency and Freshness) addresses this.",
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
      title: "Functional Surface",
      kind: "prose",
      body_md: [
        "### 8.1 Entry",
        "",
        "A new top-level subcommand: `fdpm repl [--data-dir <path>] [--no-persist] [--no-banner] [--script <file>] [--exit-on-error] [--json]`. `--data-dir`/`--no-persist` mirror the one-shot CLI; bound at startup, immutable mid-session. `--no-banner` suppresses the banner. `--script <file>` reads commands from a file and exits at EOF. `--exit-on-error` (in scripted mode) exits on the first FDPMException. `--json` is a session-wide default for the JSON output flag.",
        "",
        "### 8.2 Prompt and Output Framing",
        "",
        "Prompt: `fdpm> ` (single line). In `--json` mode, every command response is a single JSON value on one line followed by `\\n`; errors are framed as `{\"error\": <envelope>}`. **Banners and the prompt go to stderr; command results go to stdout.** This is the contract that makes the REPL agent-drivable.",
        "",
        "### 8.3 Read Loop",
        "",
        "Read line → trim → if empty, continue → if `:`-prefixed, dispatch as meta-command (§8.5) → else freshness-check → tokenize → `program.parseAsync(argv, { from: 'user' })` → on error, frame and return to prompt (no `process.exit`).",
        "",
        "### 8.4 Tokenization",
        "",
        "Input lines are tokenized into `argv` arrays using **POSIX shell-word splitting** (single quotes, double quotes, backslash escape). NO variable expansion, NO command substitution, NO glob expansion. Implementations MUST use a vetted library (e.g. `shell-quote`'s parser) rather than a hand-rolled splitter.",
        "",
        "### 8.5 Meta-commands (`:`-prefixed)",
        "",
        "REPL-only; never reach the Commander tree; never persist. `:help`, `:quit`/`:exit`, `:reload`, `:reload plugins`, `:pwd`, `:env`, `:json on|off`, `:time on|off`, `:history [N]`. `:!<shell-cmd>` is **forbidden in v0.1** — reserved syntax that the REPL must reject. `:cd` is **forbidden in v0.1** — would silently change plugin discovery semantics; the supported pattern is exit + change directory + restart.",
        "",
        "### 8.6 Tab completion (v0.1: optional)",
        "",
        "If implemented, completion sources its candidates exclusively from the Commander tree, registered profile IDs, and registered primitive types. Completion is **never** sourced from filesystem contents (avoids a class of accidental disclosure for agent-driven sessions).",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Batch / Non-interactive Mode",
      kind: "prose",
      body_md: [
        "The REPL must be runnable without a TTY for two scenarios: agent drivers and test harnesses.",
        "",
        "- `fdpm repl --script <file>`: read commands from `<file>` (one per line; comments start with `#`; blank lines ignored). Exit at EOF.",
        "- `fdpm repl < <file>`: equivalent when `process.stdin.isTTY === false`.",
        "- In batch mode, prompt and banner are suppressed unless explicitly re-enabled with `--banner`.",
        "- In batch mode with `--json`, every command emits exactly one JSON line; an end-of-session summary is emitted as a final `{\"summary\": {...}}` line containing counts of ok/error commands and a wall-clock duration.",
        "- In batch mode without `--exit-on-error`, the process exit code is `0` if every command succeeded and the most-severe `EXIT_CODE_FOR_CATEGORY[err.category]` encountered otherwise.",
        "",
        "This mode is the **canonical test harness** for the REPL: every behavioral test runs as a script.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Concurrency, Freshness, and Cache Invalidation",
      kind: "prose",
      body_md: [
        "This is the consistency cost of holding a Host hot. It must be addressed explicitly or the REPL will silently produce stale reads.",
        "",
        "### 10.1 The model",
        "",
        "A REPL session is a single in-process holder of one Store, one ProfileRegistry, one ValidationPipeline, one PluginRuntime with N activated plugins, and a JsonlLogStore bound to a fixed dataDir (or null if `--no-persist`). `dataDir` is bound at startup and is **immutable for the session's lifetime**.",
        "",
        "### 10.2 The freshness check",
        "",
        "Persistence in FDPM is **per-workbook**: `JsonlLogStore.appendOp` writes to `logPathFor(dataDir, op.workbook_id)`. There is no single global log file to stat. The freshness check must be workbook-scoped.",
        "",
        "Before dispatching each command: (1) statically determine the set of project_ids the command will touch via `projectIdsFromArgs`; (2) for each, stat its log file and track `(mtime, size)` per-workbook; (3) for commands that read `profile_id`, additionally stat the profiles directory; (4) on detected change, refuse with `permission`+`stale_state` (strict, default for write-capable) or replay tail (lenient, default for read-only).",
        "",
        "Read-only vs. write-capable classification is determined by each command module's exported `readOnly: boolean` flag.",
        "",
        "### 10.3 `:reload`",
        "",
        "`:reload` performs the equivalent of constructing a fresh Host and calling `host.load()` against the same dataDir, then atomically swapping the in-process references. `:reload plugins` re-runs plugin discovery and activation only. Both are explicit, operator-initiated. The REPL MUST NOT silently background-reload.",
        "",
        "### 10.4 What this does not solve",
        "",
        "Two writers against the same dataDir is still racy at the pipeline level. The JSONL log is append-only with OS file locking, but each process's post-command pipeline runs against an in-memory state that only sees its own writes. v0.1 makes the limitation **visible** rather than papering over it. A future SPEC may introduce coordinated write leases.",
        "",
        "### 10.5 Plugin freshness is out of scope for the per-command check",
        "",
        "Plugin discovery is the dominant cost of `Host.load()`. The freshness check does NOT stat plugin directories per command. Plugin staleness is addressed only by `:reload plugins` or process restart.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "Lifecycle and Shutdown",
      kind: "prose",
      body_md: [
        "### 11.1 Startup",
        "",
        "Pre-parse flags → construct Host → `host.load()` → build Commander program with every `buildXCommand(host)` → `program.exitOverride()` → install signal handlers → print banner unless suppressed → enter the loop.",
        "",
        "### 11.2 Clean shutdown",
        "",
        "Triggered by `:quit`, `:exit`, EOF on stdin, or SIGTERM/SIGINT (first occurrence). Drain any in-flight command, print a one-line summary on stderr, exit with code 0 (interactive) or the highest error-code seen (batch without `--exit-on-error`). No explicit flush step is required — `JsonlLogStore.appendOp` already writes per call; the REPL inherits this property and MUST NOT introduce batching that breaks it.",
        "",
        "### 11.3 Signal handling",
        "",
        "First SIGINT (Ctrl-C): cancel input editing, return to a fresh prompt. Second SIGINT within 2 s: trigger abrupt shutdown. SIGTERM and SIGHUP: clean shutdown.",
        "",
        "### 11.4 Abrupt shutdown",
        "",
        "If clean shutdown cannot complete (double Ctrl-C, kill -9, OOM), each per-workbook JSONL log MUST remain in a recoverable state. The store's append-per-operation model already guarantees this for one-shot CLI crashes; the REPL inherits it. The SPEC's invariant is therefore negative, not positive: the REPL **MUST NOT** introduce write batching, deferred persistence, or any other mechanism that holds an `appendAndPersist` result in memory beyond the single command boundary.",
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
        "The REPL uses **exactly** the existing `FDPMException` model and category enum: `validation | verification | not_found | conflict | permission | unauthenticated | quota | unsupported_media | host_compat | internal`. The REPL **does NOT introduce new error categories**.",
        "",
        "Staleness conflicts (§10.2) are reported as `permission` errors with `evidence.reason: \"stale_state\"` and `evidence.advice: \"run :reload or restart the REPL\"`. The `permission` semantics ('the host refused this operation in this state') are the closest fit.",
        "",
        "Errors during a single command MUST NOT exit the process (Commander's `exitOverride()` plus a wrapped `handleError` that prints + returns instead of `process.exit`). Unknown / non-FDPMException errors in interactive mode print a one-line summary and a stack trace on stderr; the REPL returns to the prompt.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "History and Persistence of Session Inputs",
      kind: "prose",
      body_md:
        "By default, the REPL keeps an **in-memory** history for `:history` and arrow-key recall. A persistent history file (`$FDPM_DATA_DIR/repl-history.txt`) may be written **only** when explicitly enabled via `--history-file` or `FDPM_REPL_HISTORY=1`. Default off — REPL input is structured CLI input that can include profile IDs, primitive content, and patch payloads; treat as sensitive by default.",
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Agent / LLM Integration Surface",
      kind: "prose",
      body_md: [
        "### 14.1 What agents get",
        "",
        "An agent driving the REPL via stdin/stdout pipes (no TTY) relies on: deterministic output framing (one JSON line per command response on stdout), structured error envelopes, no hidden state mutations (every state change goes through a Commander command), explicit freshness errors (in strict mode, agents see `permission`+`stale_state` rather than silently reading stale state).",
        "",
        "### 14.2 What agents do NOT get",
        "",
        "No streaming partial responses (a v0.2 concern). No multi-line command continuation parsing of free-form text. No 'natural language' command interpretation — the REPL accepts CLI syntax only.",
        "",
        "### 14.3 Verification contract (PALS's law)",
        "",
        "When an LLM drives the REPL, every response that produces a state change must be verified by the agent against the workbook state. The REPL provides the read-only commands (`primitive list`, `relation list`, `validate`, `health readiness`, etc.). The REPL itself does not perform agent-side verification — that is the agent's architectural responsibility per CLAUDE.md. The REPL **does** enforce the Core's own boundary verification for every operation it dispatches: the §8 schema gate, the §7 validation pipeline. There is no path through the REPL that bypasses these.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Security Posture",
      kind: "prose",
      body_md: [
        "| Concern | Posture |",
        "| --- | --- |",
        "| Code injection via input line | Tokenizer forbids expansion / substitution; no `eval` of input strings. |",
        "| Shell escape (`:!cmd`) | Forbidden in v0.1. |",
        "| Filesystem access via tab completion | Completion sourced from registry only, not filesystem. |",
        "| Persistent history disclosure | Off by default; opt-in only. |",
        "| Remote attach / network listener | Out of scope. The REPL is in-process, TTY/pipe only. |",
        "| Plugin isolation | Inherited from PluginRuntime; the REPL adds nothing and weakens nothing. |",
        "| Prompt injection via JSONL log content | The replay path is unchanged from the one-shot CLI; same guarantees apply. |",
        "",
        "The REPL adds **no new trust boundary that bypasses Core**. This is a testable invariant: every state-mutating call in the REPL handler goes through `Host.*` methods.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Configuration",
      kind: "prose",
      body_md:
        "Environment variables / flags governing REPL behaviour. Inherits `FDPM_DATA_DIR` from Core. REPL-specific keys default to safe values — history off, freshness on.",
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "Error Categories",
      kind: "prose",
      body_md:
        "The REPL reuses the existing FDPMException taxonomy without extension. Categories below are the ones the REPL additionally documents `evidence.reason` keys for.",
    },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: {
      number: "18",
      title: "Quality-Attribute Scenarios (SEI template)",
      kind: "scenarios",
      body_md: "",
    },
  },
  {
    id: "spec:sec:19",
    type: "spec:Section",
    fields: {
      number: "19",
      title: "Invariants",
      kind: "prose",
      body_md:
        "Invariants are the non-negotiable properties the implementation MUST preserve. CI and runtime checks each carry a `scope_ref` to the file that enforces them.",
    },
  },
  {
    id: "spec:sec:20",
    type: "spec:Section",
    fields: {
      number: "20",
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
    id: "spec:sec:21",
    type: "spec:Section",
    fields: {
      number: "21",
      title: "Acceptance Criteria",
      kind: "acceptance_criteria",
      body_md: "",
    },
  },
  {
    id: "spec:sec:22",
    type: "spec:Section",
    fields: {
      number: "22",
      title: "Conformance",
      kind: "conformance",
      body_md: "",
    },
  },
  {
    id: "spec:sec:23",
    type: "spec:Section",
    fields: {
      number: "23",
      title: "Implementation Plan — Required Changes",
      kind: "implementation_plan",
      body_md: "",
    },
  },
  {
    id: "spec:sec:24",
    type: "spec:Section",
    fields: {
      number: "24",
      title: "Migration",
      kind: "migration",
      body_md:
        "Order matters: per-command-module metadata lands first; Host.reload() and statProjectLog land before the REPL itself; the REPL command lands last; tests + AGENTS.md complete the rollout.",
    },
  },
  {
    id: "spec:sec:25",
    type: "spec:Section",
    fields: {
      number: "25",
      title: "Risks and Mitigations",
      kind: "risks",
      body_md: "",
    },
  },
  {
    id: "spec:sec:26",
    type: "spec:Section",
    fields: {
      number: "26",
      title: "Open Questions",
      kind: "open_questions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:27",
    type: "spec:Section",
    fields: {
      number: "27",
      title: "Future Work",
      kind: "future_work",
      body_md: "",
    },
  },
  {
    id: "spec:sec:28",
    type: "spec:Section",
    fields: {
      number: "28",
      title: "References — verify independently",
      kind: "references",
      body_md: "",
    },
  },
  {
    id: "spec:sec:29",
    type: "spec:Section",
    fields: {
      number: "29",
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
    id: "rel:adr-considers-in-process",
    type: "spec:Considers",
    from: adr.id,
    to: optA.id,
  },
  {
    id: "rel:adr-considers-daemon",
    type: "spec:Considers",
    from: adr.id,
    to: optB.id,
  },
  {
    id: "rel:adr-considers-node-eval",
    type: "spec:Considers",
    from: adr.id,
    to: optC.id,
  },

  // ADR chose Option A
  {
    id: "rel:adr-chose-in-process",
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
    id: "rel:qas-latency-targets-latency",
    type: "spec:Targets",
    from: "spec:qas:latency",
    to: "spec:qa:latency",
  },
  {
    id: "rel:qas-consistency-targets-consistency",
    type: "spec:Targets",
    from: "spec:qas:consistency",
    to: "spec:qa:consistency",
  },
  {
    id: "rel:qas-operability-targets-operability",
    type: "spec:Targets",
    from: "spec:qas:operability",
    to: "spec:qa:operability",
  },
  {
    id: "rel:qas-testability-targets-testability",
    type: "spec:Targets",
    from: "spec:qas:testability",
    to: "spec:qa:testability",
  },

  // Mitigations cover risks
  {
    id: "rel:mit-strict-mitigates-divergence",
    type: "spec:Mitigates",
    from: "spec:mit:strict-default-write",
    to: "spec:risk:concurrent-divergence",
  },
  {
    id: "rel:mit-reload-mitigates-plugin-stale",
    type: "spec:Mitigates",
    from: "spec:mit:explicit-reload-plugins",
    to: "spec:risk:plugin-staleness",
  },
  {
    id: "rel:mit-tokenizer-mitigates-drift",
    type: "spec:Mitigates",
    from: "spec:mit:vetted-tokenizer",
    to: "spec:risk:tokenizer-drift",
  },
  {
    id: "rel:mit-cd-mitigates-cwd",
    type: "spec:Mitigates",
    from: "spec:mit:cd-forbidden",
    to: "spec:risk:cwd-mutation",
  },
  {
    id: "rel:mit-no-batch-mitigates-batching",
    type: "spec:Mitigates",
    from: "spec:mit:no-batching-invariant",
    to: "spec:risk:write-batching",
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

  // Acceptance criteria verify requirements / invariants
  {
    id: "rel:ac1-verifies-r1",
    type: "spec:Verifies",
    from: "spec:ac:1",
    to: "spec:req:r-001",
  },
  {
    id: "rel:ac2-verifies-r5",
    type: "spec:Verifies",
    from: "spec:ac:2",
    to: "spec:req:r-005",
  },
  {
    id: "rel:ac3-verifies-r4",
    type: "spec:Verifies",
    from: "spec:ac:3",
    to: "spec:req:r-004",
  },
  {
    id: "rel:ac4-verifies-r4",
    type: "spec:Verifies",
    from: "spec:ac:4",
    to: "spec:req:r-004",
  },
  {
    id: "rel:ac5-verifies-r7",
    type: "spec:Verifies",
    from: "spec:ac:5",
    to: "spec:req:r-007",
  },
  {
    id: "rel:ac6-verifies-r8",
    type: "spec:Verifies",
    from: "spec:ac:6",
    to: "spec:req:r-008",
  },
  {
    id: "rel:ac7-verifies-r11",
    type: "spec:Verifies",
    from: "spec:ac:7",
    to: "spec:req:r-011",
  },
  {
    id: "rel:ac8-verifies-r8",
    type: "spec:Verifies",
    from: "spec:ac:8",
    to: "spec:req:r-008",
  },

  // Conformance items verify invariants / requirements
  {
    id: "rel:conf1-verifies-r2",
    type: "spec:Verifies",
    from: "spec:conf:1",
    to: "spec:req:r-002",
  },
  {
    id: "rel:conf2-verifies-r4",
    type: "spec:Verifies",
    from: "spec:conf:2",
    to: "spec:req:r-004",
  },
  {
    id: "rel:conf3-verifies-r4",
    type: "spec:Verifies",
    from: "spec:conf:3",
    to: "spec:req:r-004",
  },
  {
    id: "rel:conf4-verifies-r7",
    type: "spec:Verifies",
    from: "spec:conf:4",
    to: "spec:req:r-007",
  },
  {
    id: "rel:conf5-verifies-r11",
    type: "spec:Verifies",
    from: "spec:conf:5",
    to: "spec:req:r-011",
  },
  {
    id: "rel:conf6-verifies-no-batching",
    type: "spec:Verifies",
    from: "spec:conf:6",
    to: "spec:inv:no-write-batching",
  },

  // ADR resolves the blocking open question
  {
    id: "rel:adr-resolves-freshness-default",
    type: "spec:Resolves",
    from: adr.id,
    to: "spec:q:read-only-freshness-default",
  },

  // Citations
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
    id: "rel:adr-cites-host-ts",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:host-ts",
  },
  {
    id: "rel:adr-cites-jsonl",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:jsonl-log",
  },
  {
    id: "rel:adr-cites-fdpm-bin",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:fdpm-bin",
  },
  {
    id: "rel:adr-cites-fdpm-exception",
    type: "spec:Cites",
    from: adr.id,
    to: "spec:ref:fdpm-exception",
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
    id: "rel:doc-cites-spec-mcp",
    type: "spec:Cites",
    from: documentSpec.id,
    to: "spec:ref:spec-mcp",
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
    name: "SPEC — FDPM REPL",
    profile: PROFILE_ID,
    description:
      "SPEC for the FDPM REPL — a long-lived interactive process holding one Host that dispatches input lines as commands against the same Commander tree the one-shot CLI exposes. Authored as a typed graph using the fdpm.spec-authoring profile.",
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
      adr,
      ...tradeoffs,
      ...scenarios,
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
    `  npx tsx fdpm-cli/src/bin/fdpm.ts render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer -o docs/specs/SPEC-REPL.md`,
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
