/**
 * Build SPEC-WORKSPACE v0.1 — "Workspace as a first-class primitive
 * with stable identity, registry, and backup/restore" — using the
 * `fdpm.spec-authoring` plugin profile.
 *
 * Locks the Workspace interface contract that Phase 1 of the R2
 * remote-server roadmap depends on. The interface boundary defined
 * here is what Phase 3+ will swap a remote implementation behind;
 * getting the shape right now matters more than getting the local
 * implementation perfect.
 *
 * Authors the SPEC as a typed graph: Document, Sections,
 * Stakeholders, Quality Attributes, six ADRs with Options and
 * Trade-off Matrices, QA Scenarios, Requirements, Acceptance
 * Criteria, Conformance Items, Risks/Mitigations, Open Questions,
 * Future Work, References, Implementation Plan, Migration Steps,
 * Revisions, Definitions, ConfigEntries, ErrorCategories.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-workspace
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-workspace npx tsx fdpm-cli/scripts/build-spec-workspace.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-workspace npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-workspace text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-WORKSPACE.md
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
  SPEC_REPL_PATH,
  SPEC_UID_PATH,
} from "./_spec-paths.js";

const PROJECT_ID = "spec-workspace";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:workspace",
  type: "spec:Document",
  fields: {
    title: "SPEC — FDPM Workspace v0.1",
    subtitle:
      "Lift the FDPM data directory to a first-class primitive — named, identified, registered, backup-able, and addressable behind an interface that future remote implementations slot into without rewriting consumers.",
    spec_id: "spec:fdpm:workspace:0.1",
    version: "0.1.0",
    status: "Proposal",
    audience:
      "FDPM core maintainers, REPL/MCP-server team, plugin authors, agent integrators, operators running FDPM in production.",
    required_reads: [
      SPEC_CORE_PATH,
      SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      SPEC_REPL_PATH,
      SPEC_MCP_SERVER_PATH,
      SPEC_UID_PATH,
      "PURPOSE.md",
      "CLAUDE.md",
    ],
    companion_code: "fdpm-cli/src/core/host.ts",
    peer_spec: SPEC_REPL_PATH,
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Workspace identity is a *claim* a host makes about a directory. The claim is verifiable (sha256 of every file in the workspace.json's manifest, plus a Host.load() round-trip on restore) but it is NOT cryptographically signed in v0.1. Operators MUST treat workspace.json as untrusted input from the operator's filesystem; an attacker with filesystem write access can forge identity. The verification surface defined here protects against accidents and bit-rot, not adversarial substitution. PGP/cosign signing is explicitly deferred to v0.2.",
    date: "2026-05-05",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.0 — initial proposal. Locks the Workspace interface for Phase 1 of the R2 remote-server roadmap. The interface boundary is the load-bearing decision; the local implementation is a deliberate refactor of today's host/JsonlLogStore relationship rather than new behavior.",
    source_script: "fdpm-cli/scripts/build-spec-workspace.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-workspace",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-workspace npx tsx fdpm-cli/scripts/build-spec-workspace.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-workspace npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-workspace text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-WORKSPACE.md",
    ].join("\n"),
  },
};

// ── §5 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "Workspace",
    "A named, identified container for FDPM project state. The unit of backup, restore, and (in Phase 3+) addressing. Today implemented as `LocalWorkspace` over a filesystem path; future implementations may include `RemoteWorkspace` over an HTTP/gRPC protocol.",
    "data dir, workspace",
  ],
  [
    "Workspace identity",
    "The (`workspace_id`, `name`, `created_at`, `created_by_host_version`, `spec_core_version`) tuple stamped at workspace `init` and persisted as `workspace.json` inside the data directory. The `workspace_id` is a ULID, stable across path moves and restores.",
  ],
  [
    "Registry",
    "A per-operator JSON file (default `${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json`) that maps friendly workspace names to their `(workspace_id, path, last_used)` tuples and tracks the `current` workspace.",
  ],
  [
    "Local workspace",
    "A workspace whose state lives on the local filesystem. The only implementation in v0.1. Concrete class `LocalWorkspace` implements the `Workspace` interface against `JsonlLogStore`.",
  ],
  [
    "Remote workspace",
    "A workspace whose state lives on a remote `fdpm-server`. NOT implemented in v0.1; reserved as a future interface implementation. The interface defined by this SPEC MUST be sufficient for a future `RemoteWorkspace` without breaking the local one.",
  ],
  [
    "Backup bundle",
    "A self-describing zip archive (`.fdpmbak`) containing the verbatim workspace data directory plus a `backup-manifest.json` with sha256 per file and the workspace identity.",
  ],
  [
    "Restore",
    "The inverse of backup: read a `.fdpmbak`, verify the manifest's sha256s and the in-zip CRC32s, atomically write the data directory, run `Host.load()` against the restored state to prove replayability.",
    "restore operation",
  ],
  [
    "Workspace switch",
    "An operator action that changes the `current` workspace in the registry. Per-process the switch is invisible (each `fdpm` invocation reads the registry at startup); concurrent processes only see the change after their next startup.",
  ],
  [
    "Auto-mint",
    "First-touch behavior: when an existing data directory has no `workspace.json`, the host mints one with `name = basename(path)` and a fresh ULID, registers it in the registry, and surfaces a one-time warning. No flag day; no operator action required.",
  ],
  [
    "Identity collision",
    "On restore, the case where the bundle's `workspace_id` matches a workspace already known to the registry. Default policy: refuse unless `--force-overwrite` (overwrites that workspace) or `--name <new>` (clones to a fresh ULID under a new name).",
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
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Reliable backup/restore with verifiable round-trip. Friendly names for workspaces; no surprise data loss on restore; ability to clone a workspace for testing.",
    category: "human",
  },
  {
    id: "spec:stk:agent-integrator",
    role: "Agent integrator",
    primary_concern:
      "Stable workspace identity that travels with the data. An agent told 'work on workspace X' should be able to verify it's working on the right one even after a path move or restore.",
    category: "external_team",
  },
  {
    id: "spec:stk:repl-team",
    role: "REPL maintainer",
    primary_concern:
      "Workspace switching mid-process is out of scope (REPL binds dataDir at startup); the workspace surface MUST NOT introduce a runtime data-dir switch path that conflicts with SPEC-REPL §10.5's plugin-staleness invariants.",
    category: "internal_team",
  },
  {
    id: "spec:stk:mcp-team",
    role: "MCP server maintainer",
    primary_concern:
      "Workspace becomes an MCP resource (the natural shape — see SPEC-MCP-SERVER's resources surface). Workspace identity MUST be readable through the MCP protocol so clients know which workspace they're operating against.",
    category: "internal_team",
  },
  {
    id: "spec:stk:remote-future",
    role: "Future remote-server team",
    primary_concern:
      "The `Workspace` interface defined here is the load-bearing seam. Phase 3+ will implement `RemoteWorkspace` against the same interface; if the interface bakes in local-filesystem assumptions, Phase 3+ becomes a redesign rather than an extension.",
    category: "internal_team",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Plugins call `host.store.X`, `host.profiles.X`, etc. The workspace refactor MUST keep those call sites working (either by leaving them on Host or by transparent indirection). Breaking every plugin's surface for an internal architectural change is unacceptable.",
    category: "external_team",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "workspace.json is operator-writable; it claims identity but doesn't prove it cryptographically. The verification surface (sha256 manifest, Host.load round-trip) MUST be sufficient to detect accidents but MUST NOT pretend to be sufficient against adversarial substitution.",
    category: "internal_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "Workspace adds zero new state-mutation paths. The Store, ProfileRegistry, ValidationPipeline, and PluginRuntime all keep their existing semantics. The workspace is a boundary on top of these, not a replacement for them.",
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
    id: "spec:qa:identity-stability",
    attribute: "Identity stability",
    pressure:
      "A workspace's identity (workspace_id) MUST survive path moves, host upgrades within the same major version, and round-trips through backup/restore. Without identity stability, agents and operators cannot reliably refer to 'the same workspace' across time.",
    priority: "primary",
  },
  {
    id: "spec:qa:verifiable-restore",
    attribute: "Verifiable restore",
    pressure:
      "Restore MUST be able to prove its output is bit-equivalent to the bundle's source AND replayable by Host.load(). 'I have a backup' without 'I can prove it works' is operationally useless.",
    priority: "primary",
  },
  {
    id: "spec:qa:remote-readiness",
    attribute: "Remote-readiness",
    pressure:
      "The Workspace interface MUST be implementable by a future `RemoteWorkspace` (HTTP/gRPC client speaking to fdpm-server) without forcing a redesign. Local-filesystem details MUST be confined to the LocalWorkspace implementation.",
    priority: "primary",
  },
  {
    id: "spec:qa:backward-compat",
    attribute: "Backward compatibility",
    pressure:
      "Existing FDPM_DATA_DIR-based usage MUST continue to work without operator action. Auto-mint of workspace.json on first touch; no flag day; no breaking changes to environment-variable contracts.",
    priority: "primary",
  },
  {
    id: "spec:qa:operator-clarity",
    attribute: "Operator clarity",
    pressure:
      "`fdpm workspace info` MUST surface enough information that an operator can answer 'which workspace am I on, where does it live, when was it last backed up' without consulting the registry by hand.",
    priority: "secondary",
  },
  {
    id: "spec:qa:bundle-introspectability",
    attribute: "Bundle introspectability",
    pressure:
      "The .fdpmbak format MUST be openable by standard tooling (`unzip -l`, file managers, IDEs). Operators audit bundles before trusting them; opacity hurts adoption.",
    priority: "secondary",
  },
  {
    id: "spec:qa:atomic-restore",
    attribute: "Atomic restore",
    pressure:
      "Restore MUST be atomic — either the target data directory is fully replaced or it is unchanged. A half-restored data directory is worse than no restore at all.",
    priority: "primary",
  },
  {
    id: "spec:qa:no-new-trust-boundary",
    attribute: "No new trust boundary",
    pressure:
      "Workspace adds no new authentication, authorization, or eval surface. workspace.json is filesystem-trust; the registry is operator-local; backup/restore are local file operations. Any auth concerns belong to Phase 4 of the R2 roadmap.",
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
  ordinal: number;
  title: string;
  statement: string;
  strength: string;
}> = [
  {
    ordinal: 1,
    title: "Workspace is an interface, not a class.",
    statement:
      "The `Workspace` type defined by this SPEC is a TypeScript `interface` (or equivalent). `LocalWorkspace` is the only v0.1 implementation. Every consumer (Host, REPL, MCP-server, CLI commands, tests) MUST hold the interface, never the concrete class. This is the load-bearing decision that keeps Phase 3+ a swap rather than a rewrite.",
    strength: "MUST",
  },
  {
    ordinal: 2,
    title: "Identity is stable across path moves and restores.",
    statement:
      "A `workspace_id` is minted once at `workspace init` and never changes. Moving the data directory, restoring from backup, and switching machines all preserve the ULID. Operators may rename a workspace freely; they cannot rename its id.",
    strength: "MUST",
  },
  {
    ordinal: 3,
    title: "Backup is verifiable; restore is atomic.",
    statement:
      "Every file in a backup bundle carries a sha256 in `backup-manifest.json` plus the zip's per-entry CRC32. Restore verifies all hashes before writing anything; writes to a temp directory; renames atomically; runs `Host.load()` against the restored data to prove replayability. A failed verification leaves the target data directory unchanged.",
    strength: "MUST",
  },
  {
    ordinal: 4,
    title: "No flag day for existing data directories.",
    statement:
      "An existing `FDPM_DATA_DIR` without `workspace.json` continues to work. The first operation that touches it auto-mints a `workspace.json` with `name = basename(path)`, registers it, and surfaces a one-time warning. Operators may rename later; no migration command is required.",
    strength: "MUST",
  },
  {
    ordinal: 5,
    title: "Workspace adds no new trust boundary.",
    statement:
      "workspace.json is operator-writable; the registry is operator-local; backup/restore are local file operations. The `LocalWorkspace` implementation does not authenticate, authorize, encrypt, or sign anything. Cryptographic claims about a workspace's identity, contents, or origin are explicitly out of scope for v0.1; reserved for Phase 4 of the R2 roadmap.",
    strength: "MUST",
  },
  {
    ordinal: 6,
    title: "DataDir is immutable for a Host's lifetime.",
    statement:
      "A `Host` is constructed against exactly one `Workspace`. Switching workspaces requires constructing a new Host. There is no `host.switchWorkspace()` API in v0.1 — that path is what `fdpm workspace switch` provides at the binary level (between processes), and what SPEC-REPL §10.5's plugin-staleness invariant explicitly rules out within a long-lived process.",
    strength: "MUST",
  },
  {
    ordinal: 7,
    title: "Plugin call sites stay unchanged.",
    statement:
      "Plugins today call `host.store.X`, `host.profiles.X`, `host.plugins.X`. These surfaces continue to work after the workspace refactor. The Host either delegates to its workspace transparently OR forwards the call sites by composition; the implementation may choose, but plugin authors MUST NOT be forced to update their code for the workspace work alone.",
    strength: "MUST",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: `spec:prin:${slug(p.title)}`,
  type: "spec:Principle",
  fields: {
    ordinal: p.ordinal,
    title: p.title,
    statement: p.statement,
    strength: p.strength,
  },
}));

// ── §6 ADRs (six decisions) + their Options ────────────────────────────────

// ─────────── ADR-WS-001: Workspace as interface ───────────────────────────

const optWS001A: PrimitiveSpec = {
  id: "spec:opt:ws001-interface",
  type: "spec:Option",
  fields: {
    label: "Option A — Workspace is an interface; LocalWorkspace is the only v0.1 impl",
    description:
      "Define `Workspace` as a TypeScript interface (or equivalent abstract class). Implement `LocalWorkspace` against today's `JsonlLogStore`. Refactor `Host` to hold `Workspace` (the interface), not `JsonlLogStore` (the concrete). Every existing call site that touches persistence routes through the interface.",
    pros: [
      "Phase 3+ (remote workspace) is a new implementation against the same interface — not a rewrite.",
      "The interface is the smallest commitment: we lock the contract, not the wire protocol or the storage backend.",
      "Existing call sites that say `host.store.X` keep working (Host delegates to `workspace.store` transparently).",
      "Test surface naturally extends — same test suite runs against any future implementation.",
    ],
    cons: [
      "Refactor cost is real: ~150 lines of Host changes plus an audit of every consumer of `host.persistence` to route through the workspace.",
      "Slight indirection cost (one method call) on every persistence operation; negligible in practice but visible in profiles.",
      "Risk of getting the interface wrong: if Phase 3+ discovers the interface is too local-shaped, we pay the redesign cost later.",
    ],
    verdict: "chosen",
  },
};

const optWS001B: PrimitiveSpec = {
  id: "spec:opt:ws001-enriched-data-dir",
  type: "spec:Option",
  fields: {
    label: "Option B — Workspace is a metadata wrapper; Host owns persistence directly",
    description:
      "Add a `Workspace` class that holds identity (`workspace.json`) and registry metadata, but Host continues to own `JsonlLogStore` directly. The workspace is a thin sidecar; persistence flows through Host as today.",
    pros: [
      "Smallest possible diff. Host's surface is unchanged.",
      "No risk of interface-design mistakes — we don't define an interface.",
      "Operator-visible features (identity, registry, backup) ship faster.",
    ],
    cons: [
      "Phase 3+ (remote workspace) becomes a much bigger change: persistence ownership has to move out of Host *and* a remote backend has to be designed *and* every call site has to be audited — all in the same commit.",
      "The `Workspace` concept is half-real: it has identity but it doesn't own the data. Operators will be confused that 'the workspace' is metadata while 'the data' lives somewhere else.",
      "Backup/restore semantics are awkward: backup snapshots the data dir directly; restore writes the data dir directly; the workspace is only along for the ride.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Loses the load-bearing benefit. The whole point of doing this work now is to install the abstraction seam that future-remote will plug into. Option B installs a sidecar instead.",
  },
};

const optWS001C: PrimitiveSpec = {
  id: "spec:opt:ws001-full-inversion",
  type: "spec:Option",
  fields: {
    label:
      "Option C — Workspace is the primary domain object; Host shrinks to a session wrapper",
    description:
      "Invert the ownership: `Workspace` owns Store, ProfileRegistry, PluginRuntime, ValidationPipeline. `Host` becomes a per-process Session that holds a Workspace reference. Every existing `host.store.X` call site gets rewritten to `host.workspace.store.X` (or `session.workspace.store.X`).",
    pros: [
      "The architecturally honest shape — the data is the thing; the process operating on it is transient.",
      "Multi-session-per-workspace becomes explicit and modelable.",
      "Future remote workspaces drop in cleanly; the Workspace owns the protocol stack.",
    ],
    cons: [
      "Massive refactor. Every plugin, every command, every test, every doc has to change. Hundreds of files.",
      "Risk of bugs across the migration; correctness criteria are subtle.",
      "Months of work; pushes Phase 1 out and blocks the operator-visible backup/restore feature.",
      "Designing the inversion *before* shipping any workspace work means designing in the dark — we don't yet know what the workspace concept needs.",
    ],
    verdict: "deferred",
    rejection_reason:
      "Right architectural answer, wrong time. Defer to a future SPEC-WORKSPACE-AS-PRIMARY informed by experience with v0.1. Option A's interface boundary is the seam that lets us upgrade to C later as a refactor (not a redesign).",
  },
};

const adrWS001: PrimitiveSpec = {
  id: "spec:adr:ws-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-001",
    title: "Workspace is an interface; LocalWorkspace is the v0.1 implementation.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "FDPM today binds the data directory to Host via FDPM_DATA_DIR (a path). Host owns Store, ProfileRegistry, PluginRuntime, JsonlLogStore directly. The Phase 1 work in this SPEC adds workspace identity, a registry, backup, and restore. The R2 roadmap's later phases require the data layer to be addressable behind an abstraction (so Phase 3+ can implement a RemoteWorkspace). The decision is which abstraction shape to commit to now.",
    decision:
      "Define `Workspace` as a TypeScript interface (or abstract class) in `fdpm-cli/src/core/workspace/types.ts`. Implement `LocalWorkspace` against today's `JsonlLogStore`. Refactor `Host` to hold `Workspace` (interface), not `JsonlLogStore` (concrete). Plugin call sites that touch `host.store.X` continue to work via Host-level delegation. Future `RemoteWorkspace` becomes a new implementation against the same interface; no consumer changes required.",
    consequences: [
      {
        polarity: "positive",
        text: "Phase 3+ is a swap, not a rewrite. The interface boundary defined here is the load-bearing decision.",
      },
      {
        polarity: "positive",
        text: "Test surface is portable: the same tests that exercise LocalWorkspace will exercise RemoteWorkspace later.",
      },
      {
        polarity: "positive",
        text: "Operator-visible features (identity, registry, backup, restore) ship in the same commit as the seam — value delivered alongside the architectural investment.",
      },
      {
        polarity: "negative",
        text: "Refactor cost: ~150 lines of Host changes plus an audit of consumers. Risk of regressions during the audit.",
      },
      {
        polarity: "negative",
        text: "Risk of locking in the wrong interface shape. Mitigated by keeping the v0.1 interface narrow (just what LocalWorkspace needs) and explicitly deferring the broader question to a future SPEC.",
      },
      {
        polarity: "neutral",
        text: "Plugin authors see no API change. The interface is internal to Host; plugins continue to call `host.store.X` etc.",
      },
    ],
    compliance_checks: [
      "CI: every consumer of `host.persistence` has been audited and routes through `host.workspace` (or stays on Host with explicit delegation). Verified by a grep-level check.",
      "CI: no test file imports `JsonlLogStore` directly; all persistence tests go through the Workspace interface.",
      "Test: a stub `MockWorkspace` can be substituted for `LocalWorkspace` in tests without changing call sites.",
    ],
    revisit_signals: [
      "If Phase 3+ discovers the v0.1 interface lacks affordances RemoteWorkspace needs (e.g., explicit transaction boundaries, batch reads with continuation tokens), revisit and extend the interface — but the *existence* of the interface stays correct.",
      "If three or more independent Workspace implementations land, consider promoting to a separate SPEC-WORKSPACE-INTERFACE document.",
    ],
  },
};

// ─────────── ADR-WS-002: workspace.json shape ────────────────────────────

const optWS002A: PrimitiveSpec = {
  id: "spec:opt:ws002-rich-json",
  type: "spec:Option",
  fields: {
    label:
      "Option A — workspace.json carries identity + provenance + tags; project list derived from filesystem",
    description:
      "workspace.json fields: spec_workspace, id (ULID), name, created_at, created_by_host_version, spec_core_version, description, tags. Project list is NOT in workspace.json; computed from `${path}/projects/*/log.jsonl` on demand.",
    pros: [
      "Identity is fully self-contained: a workspace's id, name, and provenance travel with the file.",
      "Project list never goes stale (it's the filesystem itself).",
      "Operator-meaningful fields (description, tags) enable later querying without schema changes.",
    ],
    cons: [
      "workspace.json is hand-editable — operators can break it. Mitigated by validation on load.",
      "tags add a small future-extension surface that may not be used.",
    ],
    verdict: "chosen",
  },
};

const optWS002B: PrimitiveSpec = {
  id: "spec:opt:ws002-minimal-json",
  type: "spec:Option",
  fields: {
    label: "Option B — workspace.json carries only id + name",
    description:
      "Strip workspace.json to the absolute minimum: spec_workspace, id, name. Everything else (timestamps, host version) is derivable or recoverable.",
    pros: [
      "Smallest possible schema; least to get wrong.",
      "Easiest to hand-author for testing.",
    ],
    cons: [
      "Loses provenance (when was this workspace minted, by what version of FDPM). Critical for diagnosing 'this backup won't restore' errors across version skew.",
      "Loses operator metadata (description, tags). Operators end up storing this somewhere else (README in the data dir, external sheet) — guaranteed to drift.",
    ],
    verdict: "rejected",
    rejection_reason:
      "The minimum is too minimal. Provenance is load-bearing for restore-across-versions; tags/description are cheap to add now and expensive to add later (every existing workspace.json would need migration).",
  },
};

const optWS002C: PrimitiveSpec = {
  id: "spec:opt:ws002-denormalized-projects",
  type: "spec:Option",
  fields: {
    label: "Option C — workspace.json includes a denormalized project list",
    description:
      "In addition to identity/provenance, workspace.json carries a `projects` array with each project's id, name, profile_id, last_modified.",
    pros: [
      "`fdpm workspace info` doesn't need a filesystem walk.",
      "Backup/restore can trivially diff project sets between bundle and target.",
    ],
    cons: [
      "Denormalization invites drift: every project create/delete/rename would need to update workspace.json. Forget once and the workspace's project list lies.",
      "Filesystem is already authoritative; duplicating the list adds a sync bug.",
      "The `projects` list would also have to be migrated if/when the workbook rename lands.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Filesystem is the source of truth; denormalizing creates a sync bug. The workspace info command can do a filesystem walk in milliseconds; that's not a bottleneck worth introducing a consistency hazard for.",
  },
};

const adrWS002: PrimitiveSpec = {
  id: "spec:adr:ws-002",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-002",
    title: "workspace.json shape — identity + provenance, no project list.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "Every workspace needs a self-describing identity file. The file has to: (a) survive path moves, (b) document its own provenance for cross-version restore, (c) remain human-readable, (d) NOT introduce sync bugs with the filesystem authoritatively-held data.",
    decision:
      "workspace.json is a JSON file at `${data_dir}/workspace.json` with fields: `spec_workspace` (this SPEC's version), `id` (ULID, immutable), `name` (operator-chosen, mutable via `fdpm workspace rename`), `created_at` (ISO-8601), `created_by_host_version` (semver), `spec_core_version`, optional `description` (free text), optional `tags` (string array). The list of projects in the workspace is NOT stored in workspace.json; it is computed from `${data_dir}/projects/*/` on demand.",
    consequences: [
      {
        polarity: "positive",
        text: "Identity travels with the data; no external registry is required to know what workspace a directory is.",
      },
      {
        polarity: "positive",
        text: "Provenance enables version-aware restore: bundles can refuse to restore onto an incompatible host with a clear error.",
      },
      {
        polarity: "positive",
        text: "No denormalization, no sync bugs.",
      },
      {
        polarity: "negative",
        text: "workspace.json is operator-writable. A typo can corrupt identity. Mitigation: schema validation on every load; a corrupt workspace.json triggers a one-time recovery prompt (`fdpm workspace info` shows the parse error and offers to re-init).",
      },
      {
        polarity: "neutral",
        text: "tags is a small future-extension surface (filtering, grouping). Costs nothing if unused.",
      },
    ],
    compliance_checks: [
      "Schema test: workspace.json has a Zod schema; every field is validated; unknown fields are rejected (catches typos).",
      "Test: round-trip — write a workspace.json, read it back, the deserialized form equals the input.",
      "Test: corrupt workspace.json (bad JSON, missing required fields, wrong spec_workspace) triggers the clear error path.",
    ],
    revisit_signals: [
      "If operators routinely add metadata that doesn't fit `description` or `tags`, consider adding a typed `metadata: Record<string, unknown>` escape hatch.",
      "If the workbook rename lands and changes how projects are named, workspace.json may grow a `vocab_version` field at that time.",
    ],
  },
};

// ─────────── ADR-WS-003: registry location ────────────────────────────────

const optWS003A: PrimitiveSpec = {
  id: "spec:opt:ws003-xdg",
  type: "spec:Option",
  fields: {
    label:
      "Option A — XDG-compliant: `${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json`",
    description:
      "Registry lives at the XDG-standard state-data location. Operators using dotfile managers, OS-level cleanup tools, and modern shells get the registry in the expected place.",
    pros: [
      "Plays well with modern dotfile management (yadm, chezmoi, nix-home-manager).",
      "Doesn't pollute `~`.",
      "Operator can override with `FDPM_REGISTRY_PATH` env var if XDG isn't a fit.",
    ],
    cons: [
      "On macOS, XDG isn't standard; the path lands at `~/.local/state/fdpm/workspaces.json` which isn't where mac operators look first. Mitigation: `fdpm workspace info` prints the registry path.",
      "First-time operators don't know where the file is. Mitigation: the path is printed on every `fdpm workspace list` and in `--help`.",
    ],
    verdict: "chosen",
  },
};

const optWS003B: PrimitiveSpec = {
  id: "spec:opt:ws003-home-dotfile",
  type: "spec:Option",
  fields: {
    label: "Option B — Plain `~/.fdpm-cli-workspaces.json`",
    description:
      "Registry lives directly in the operator's home directory as a dotfile.",
    pros: [
      "Universally findable; no XDG awareness required.",
      "Matches a lot of older Unix tooling conventions.",
    ],
    cons: [
      "Pollutes `~` (operators with many tools accumulate dozens of these).",
      "Doesn't play with dotfile managers as cleanly as XDG paths.",
      "Hard to clean up (operator may not realize the file exists).",
    ],
    verdict: "rejected",
    rejection_reason:
      "Modern conventions favor XDG. The cost of a less-findable default is mitigated by the explicit path printout in workspace commands.",
  },
};

const optWS003C: PrimitiveSpec = {
  id: "spec:opt:ws003-in-data-dir",
  type: "spec:Option",
  fields: {
    label: "Option C — Embed registry in each workspace's data directory",
    description:
      "Each workspace has its own registry pointing at known sibling workspaces. No operator-level registry.",
    pros: [
      "No new file outside data directories.",
      "A workspace can be self-contained including its 'sibling pointers'.",
    ],
    cons: [
      "Multiple workspaces drift: each has its own view of the registry. 'Switching to workspace X from workspace Y' is undefined when they don't agree.",
      "Backup/restore semantics get weird: does the backup carry the sibling list?",
      "An operator with two workspaces ends up with two registries that must be kept in sync — which is exactly the consistency problem we're trying to avoid.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Per-workspace registries multiply the consistency problem. Operator-local registry is the only shape that keeps 'the list of workspaces' single-source-of-truth.",
  },
};

const adrWS003: PrimitiveSpec = {
  id: "spec:adr:ws-003",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-003",
    title: "Operator-local registry at the XDG state-data path.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "Multiple workspaces need a single source of truth that maps friendly names to paths and tracks which is current. The registry has to be operator-local (not workspace-local), discoverable, and overridable for non-XDG environments.",
    decision:
      "Registry lives at `${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json`. Operator override via `FDPM_REGISTRY_PATH` env var. `fdpm workspace list` and `fdpm workspace info` print the registry path. The file's schema is fixed at the same v1 SPEC as workspace.json's `spec_workspace_registry` discriminator.",
    consequences: [
      {
        polarity: "positive",
        text: "Single source of truth for the operator's workspace inventory.",
      },
      {
        polarity: "positive",
        text: "Plays with modern dotfile management; respects OS conventions.",
      },
      {
        polarity: "negative",
        text: "macOS operators don't expect XDG paths. Mitigated by the printed path in workspace commands.",
      },
      {
        polarity: "neutral",
        text: "FDPM_REGISTRY_PATH override exists for operators with strong preferences or non-Unix environments.",
      },
    ],
    compliance_checks: [
      "Test: registry path resolves correctly under XDG_STATE_HOME=set, XDG_STATE_HOME=unset (both Linux and macOS conventions), FDPM_REGISTRY_PATH=set.",
      "Test: missing registry on first invocation auto-creates with empty `workspaces: []`, no error.",
      "Test: `fdpm workspace list` prints the registry path in both human and JSON modes.",
    ],
    revisit_signals: [
      "If an OS-specific better-default emerges (e.g., a future macOS XDG-equivalent standard), revisit the default path.",
      "If centralized multi-operator workspaces become a use case, consider a registry in the workspace data dir as a *secondary* per-machine cache.",
    ],
  },
};

// ─────────── ADR-WS-004: backup format ────────────────────────────────────

const optWS004A: PrimitiveSpec = {
  id: "spec:opt:ws004-zip",
  type: "spec:Option",
  fields: {
    label: "Option A — `.fdpmbak` is a zip with backup-manifest.json + verbatim data tree",
    description:
      "Backup writes a zip file with `backup-manifest.json` at the root and the workspace's data directory under `data/`. Each entry's sha256 lives in the manifest; zip's CRC32 provides a redundant integrity check. Compression: `deflate` for text/json, `store` for already-compressed types.",
    pros: [
      "Universally openable: every OS, every IDE, `unzip -l` for inspection.",
      "Random access — `unzip -p bundle.fdpmbak backup-manifest.json` reads just the manifest.",
      "Mature Node story (`archiver`); no native build step.",
      "Operators can audit a bundle by inspection before trusting it.",
    ],
    cons: [
      "Adds `archiver` dep (~3 MB transitive, MIT). Acceptable tradeoff.",
      "Non-streaming write: the central directory is written at the end after all entry CRCs are known. For multi-MB bundles this means buffering.",
    ],
    verdict: "chosen",
  },
};

const optWS004B: PrimitiveSpec = {
  id: "spec:opt:ws004-tar-gz",
  type: "spec:Option",
  fields: {
    label: "Option B — `.fdpmbak.tar.gz` (tar + gzip)",
    description: "Standard tar archive, gzip-compressed.",
    pros: [
      "Streamable write.",
      "Slightly better compression on text-heavy bundles.",
      "No new dependency (Node has tar/gzip).",
    ],
    cons: [
      "No random access — extracting the manifest requires streaming the whole archive. Hostile to operators who want to inspect a bundle without committing to a full extract.",
      "Less friendly than zip in IDEs / file managers.",
      "tar's filesystem-metadata semantics (mtime, perms, ownership) introduce variability we don't want to commit to as part of the bundle contract.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Random access for the manifest is the deciding factor. Operators audit bundles before trusting them; opacity hurts adoption.",
  },
};

const optWS004C: PrimitiveSpec = {
  id: "spec:opt:ws004-custom",
  type: "spec:Option",
  fields: {
    label: "Option C — Custom binary `.fdpmbundle` framing",
    description:
      "Length-prefixed framing with per-file `(path, sha256, size, content)` records, optional zstd compression. Schema-controlled.",
    pros: [
      "Schema-correct integrity verification in one pass.",
      "Matches FDPM's typed-graph aesthetic.",
    ],
    cons: [
      "Custom — not openable without `fdpm` or a one-off extractor. Bus factor 1.",
      "All the inspection/IDE benefits of zip are lost.",
      "Not noticeably better at integrity than zip+sha256-in-manifest.",
    ],
    verdict: "rejected",
    rejection_reason:
      "The only thing this buys is a tiny edge in integrity ergonomics. Zip already provides per-entry CRC32, and the manifest provides sha256. Bus factor is the deciding cost.",
  },
};

const adrWS004: PrimitiveSpec = {
  id: "spec:adr:ws-004",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-004",
    title: "Backup format is `.fdpmbak`, a zip with backup-manifest.json.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "The backup format determines how operators inspect, verify, and restore workspaces. The format must be: openable by standard tooling, inspectable without full extraction, integrity-verifiable, and not couple us to a format we'll regret.",
    decision:
      "`.fdpmbak` is a zip archive. Root entry: `backup-manifest.json` (lives at offset 0 by exporter convention so `head -c 64K` can recover it). Data tree: `data/manifest.json`, `data/profiles/`, `data/projects/`. `backup-manifest.json` carries: spec_backup version, fdpm_host_version, spec_core_version, created_at, the workspace's identity (id, name, created_at, created_by_host_version), per-file sha256, exit_status. Compression: `deflate` for text/json, `store` for already-compressed.",
    consequences: [
      {
        polarity: "positive",
        text: "Operators can `unzip -p bundle.fdpmbak backup-manifest.json` to audit before trusting.",
      },
      {
        polarity: "positive",
        text: "Two integrity checks (sha256 in manifest + zip CRC32) — defense in depth.",
      },
      {
        polarity: "positive",
        text: "IDE/file-manager friendliness — operators see the bundle's structure at a glance.",
      },
      {
        polarity: "negative",
        text: "Non-streaming write: needs a temp file for atomicity (write, rename).",
      },
      {
        polarity: "neutral",
        text: "Adds `archiver` dependency. Mature, MIT-licensed, broadly trusted.",
      },
    ],
    compliance_checks: [
      "Test: a freshly-written bundle decompresses and the manifest matches the actual file contents (sha256 round-trip).",
      "Test: corrupting one file's content (without updating sha256) is detected on restore.",
      "Test: `unzip -p bundle.fdpmbak backup-manifest.json` returns valid JSON without a full extract.",
      "Test: bundle round-trips: backup → restore → backup produces a byte-equivalent second bundle (modulo created_at).",
    ],
    revisit_signals: [
      "If `archiver` becomes unmaintained or has a security incident, revisit (alternatives: hand-rolled zip via node:zlib, or yauzl/yazl).",
      "If bundles routinely exceed 1 GiB, revisit: streaming format may become necessary.",
    ],
  },
};

// ─────────── ADR-WS-005: restore semantics ────────────────────────────────

const optWS005A: PrimitiveSpec = {
  id: "spec:opt:ws005-verify-write-load",
  type: "spec:Option",
  fields: {
    label:
      "Option A — Verify all hashes → write to temp dir → atomic rename → Host.load() round-trip",
    description:
      "Restore is a four-step pipeline: (1) read backup-manifest.json, verify every entry's sha256 against the bundle's bytes WITHOUT writing to the target dir; (2) write all files to `<target>.tmp/`; (3) atomic `rename(<target>.tmp, <target>)`; (4) construct a Host against the restored dir, call `Host.load()`, surface findings. Failure at any step leaves the target dir unchanged.",
    pros: [
      "Atomic from the operator's perspective: either the target is fully replaced or unchanged.",
      "Replayability is proven (Host.load fails fast on corrupt data).",
      "Clear error envelopes per step (verify fails → category=verification, load fails → category=host_compat).",
    ],
    cons: [
      "Disk-space cost: temporarily holds two copies (the existing target + the temp dir) until the rename.",
      "Atomicity depends on filesystem support for atomic rename across same-fs paths. Cross-fs renames silently degrade — must be detected and refused with a clear error.",
    ],
    verdict: "chosen",
  },
};

const optWS005B: PrimitiveSpec = {
  id: "spec:opt:ws005-in-place",
  type: "spec:Option",
  fields: {
    label: "Option B — Write to target dir directly; verify after",
    description:
      "Stream files from the bundle directly into the target dir; verify hashes after the write completes.",
    pros: [
      "Half the disk space (no temp copy).",
      "Marginally faster.",
    ],
    cons: [
      "Not atomic: a crash mid-write leaves a half-restored data dir that's worse than no restore.",
      "Verification-after-write is too late: corrupt bundle has already trashed the target.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Atomicity is non-negotiable. A half-restored data dir is the worst outcome of this command; we will not introduce that failure mode.",
  },
};

const adrWS005: PrimitiveSpec = {
  id: "spec:adr:ws-005",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-005",
    title: "Restore is verify-first, atomic, replay-checked.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "Restore writes to disk what the bundle says is correct. Three failure modes must be impossible to silently land in: (a) bundle integrity corruption that goes undetected, (b) half-restored data dir from a mid-write crash, (c) bytes-on-disk that the host can't actually load.",
    decision:
      "Restore pipeline: (1) read backup-manifest.json from the bundle; (2) for every entry, decompress and compute sha256, compare to manifest — refuse the entire restore on any mismatch; (3) write all files to `<target>.tmp/`; (4) atomic rename `<target>.tmp → <target>`; (5) construct a Host against the restored dir, call `Host.load()`, fail with `host_compat` if load throws. The target dir is touched only between steps 3 and 4. Identity-collision policy (ADR-WS-006) gates step 4.",
    consequences: [
      {
        polarity: "positive",
        text: "Atomic from the operator's perspective.",
      },
      {
        polarity: "positive",
        text: "Replayability proven, not assumed.",
      },
      {
        polarity: "positive",
        text: "Clear category-per-failure-mode error envelopes.",
      },
      {
        polarity: "negative",
        text: "Temp-dir disk cost (briefly 2x the workspace size).",
      },
      {
        polarity: "negative",
        text: "Cross-filesystem rename is non-atomic; restore must detect and refuse with a clear error pointing at the workaround (--data-dir <same-fs-path>).",
      },
    ],
    compliance_checks: [
      "Test: corrupt one byte of one entry's content; restore fails with `verification` + `evidence.reason: \"sha256_mismatch\"`; target dir unchanged.",
      "Test: simulated crash between steps 3 and 4; running restore again succeeds; target dir was unchanged.",
      "Test: cross-filesystem rename (where atomic isn't possible) refuses with a clear error.",
      "Test: a bundle with valid bytes but version skew that causes Host.load() to throw produces `host_compat`; the restored data dir is left in place (operator can downgrade and retry).",
    ],
    revisit_signals: [
      "If filesystem-atomicity assumptions don't hold for some operator's environment (e.g., FUSE, network mounts), introduce an `--unsafe-non-atomic` opt-in with a screaming warning.",
    ],
  },
};

// ─────────── ADR-WS-006: backward compat / auto-mint ──────────────────────

const optWS006A: PrimitiveSpec = {
  id: "spec:opt:ws006-auto-mint",
  type: "spec:Option",
  fields: {
    label: "Option A — Auto-mint workspace.json on first touch; one-time warning",
    description:
      "When a Host loads a data dir without `workspace.json`, it auto-mints one with `id = ulid()`, `name = basename(path)`, `created_at = now`, `created_by_host_version = HOST_VERSION`. Registers in the registry. Surfaces a one-time warning on stderr.",
    pros: [
      "Zero operator action required for migration.",
      "No flag day; existing scripts continue to work.",
      "Operator can rename later via `fdpm workspace rename`.",
    ],
    cons: [
      "Operators with multiple data dirs that share `basename(path)` get name collisions on auto-mint. Mitigation: registry detects collisions and appends a numeric suffix (`scratch-2`).",
      "The first-time warning may be missed in scripted environments. Mitigation: also emit a `_mintedAt` field in `workspace.json` so subsequent inspections show the auto-mint origin.",
    ],
    verdict: "chosen",
  },
};

const optWS006B: PrimitiveSpec = {
  id: "spec:opt:ws006-migration-cmd",
  type: "spec:Option",
  fields: {
    label: "Option B — Require `fdpm workspace init` on existing data dirs",
    description: "Refuse to load a data dir without `workspace.json`. Operator must run `fdpm workspace init` to mint identity.",
    pros: ["Explicit operator consent for the migration."],
    cons: [
      "Breaking change. Every existing operator's first invocation after upgrade fails.",
      "Every CI/CD pipeline that runs `fdpm` against a pre-existing data dir breaks.",
      "Documentation explosion: every tutorial, every script, every README has to add the init step.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Breaking change for zero benefit. Auto-mint is silent and correct; the ceremony of explicit init buys nothing operationally.",
  },
};

const adrWS006: PrimitiveSpec = {
  id: "spec:adr:ws-006",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-WS-006",
    title:
      "Auto-mint workspace.json on first touch; no flag day for existing data dirs.",
    status: "proposed",
    date: "2026-05-05",
    context:
      "Existing FDPM installations have data dirs without workspace.json. Forcing operators to run an explicit init command is a breaking change with no upside.",
    decision:
      "On `Host.load()`, if `${dataDir}/workspace.json` is absent, the host auto-mints one: `id = ulid()`, `name = basename(dataDir) || \"unnamed-workspace\"`, `created_at = now`, `created_by_host_version = HOST_VERSION`, `description = \"Auto-minted from pre-workspace data dir.\"`, `_minted: true` (boolean marker). Registers in the registry. Emits a single-line warning on stderr: `note: auto-minted workspace identity for <path>; use 'fdpm workspace rename' to set a friendly name`. The `_minted: true` field allows downstream tools to surface the origin in `info` until the operator renames.",
    consequences: [
      {
        polarity: "positive",
        text: "Zero operator action required for migration.",
      },
      {
        polarity: "positive",
        text: "Existing scripts and CI pipelines continue to work unchanged.",
      },
      {
        polarity: "negative",
        text: "Auto-minted names may collide if the operator has multiple data dirs with the same basename. Mitigation: registry appends a numeric suffix on collision.",
      },
      {
        polarity: "neutral",
        text: "The `_minted: true` marker disappears on the first `fdpm workspace rename` (operator has now claimed identity ownership).",
      },
    ],
    compliance_checks: [
      "Test: load an empty data dir; workspace.json is auto-minted with a valid ULID and basename-derived name.",
      "Test: load a data dir whose basename matches an already-registered auto-minted workspace; the new name gets a `-2` suffix.",
      "Test: the auto-mint warning is printed exactly once on first load, not on subsequent loads.",
      "Test: `fdpm workspace rename` clears the `_minted: true` marker.",
    ],
    revisit_signals: [
      "If auto-mint causes operator confusion in practice (e.g., 'why is my workspace named after a tmp directory'), strengthen the warning or require a follow-up rename within N invocations.",
    ],
  },
};

// All ADRs + Options collected for export
const allAdrSpecs: PrimitiveSpec[] = [adrWS001, adrWS002, adrWS003, adrWS004, adrWS005, adrWS006];
const allOptionSpecs: PrimitiveSpec[] = [
  optWS001A, optWS001B, optWS001C,
  optWS002A, optWS002B, optWS002C,
  optWS003A, optWS003B, optWS003C,
  optWS004A, optWS004B, optWS004C,
  optWS005A, optWS005B,
  optWS006A, optWS006B,
];

// ── §7 Trade-off Matrices ──────────────────────────────────────────────────

const tradeoffs: PrimitiveSpec[] = [
  // ADR-WS-001
  {
    id: "spec:tx:ws001-future-remote",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Future remote-server effort",
      cells: [
        { option_id: "spec:opt:ws001-interface", value: "Swap (new impl)" },
        { option_id: "spec:opt:ws001-enriched-data-dir", value: "Redesign (move ownership)" },
        { option_id: "spec:opt:ws001-full-inversion", value: "Already there (months done)" },
      ],
    },
  },
  {
    id: "spec:tx:ws001-refactor-now",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Refactor cost now",
      cells: [
        { option_id: "spec:opt:ws001-interface", value: "M (~150 lines)" },
        { option_id: "spec:opt:ws001-enriched-data-dir", value: "S (sidecar only)" },
        { option_id: "spec:opt:ws001-full-inversion", value: "XL (months)" },
      ],
    },
  },
  {
    id: "spec:tx:ws001-plugin-impact",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Plugin author impact",
      cells: [
        { option_id: "spec:opt:ws001-interface", value: "None (Host delegates)" },
        { option_id: "spec:opt:ws001-enriched-data-dir", value: "None" },
        { option_id: "spec:opt:ws001-full-inversion", value: "Every plugin call site changes" },
      ],
    },
  },
  // ADR-WS-002
  {
    id: "spec:tx:ws002-restore-version-skew",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Cross-version restore detectability",
      cells: [
        { option_id: "spec:opt:ws002-rich-json", value: "Yes (provenance present)" },
        { option_id: "spec:opt:ws002-minimal-json", value: "No (no provenance)" },
        { option_id: "spec:opt:ws002-denormalized-projects", value: "Yes" },
      ],
    },
  },
  {
    id: "spec:tx:ws002-sync-bug-risk",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Sync-bug risk (workspace.json vs filesystem)",
      cells: [
        { option_id: "spec:opt:ws002-rich-json", value: "None" },
        { option_id: "spec:opt:ws002-minimal-json", value: "None" },
        { option_id: "spec:opt:ws002-denormalized-projects", value: "Real (project list drifts)" },
      ],
    },
  },
  // ADR-WS-003
  {
    id: "spec:tx:ws003-discoverability",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Discoverability",
      cells: [
        { option_id: "spec:opt:ws003-xdg", value: "Medium (printed in commands)" },
        { option_id: "spec:opt:ws003-home-dotfile", value: "High (well-known location)" },
        { option_id: "spec:opt:ws003-in-data-dir", value: "Low (per-workspace)" },
      ],
    },
  },
  {
    id: "spec:tx:ws003-multi-workspace",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Multi-workspace consistency",
      cells: [
        { option_id: "spec:opt:ws003-xdg", value: "Single source of truth" },
        { option_id: "spec:opt:ws003-home-dotfile", value: "Single source of truth" },
        { option_id: "spec:opt:ws003-in-data-dir", value: "Per-workspace drift" },
      ],
    },
  },
  // ADR-WS-004
  {
    id: "spec:tx:ws004-random-access",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Random access (read manifest without full extract)",
      cells: [
        { option_id: "spec:opt:ws004-zip", value: "Yes" },
        { option_id: "spec:opt:ws004-tar-gz", value: "No" },
        { option_id: "spec:opt:ws004-custom", value: "Yes (custom)" },
      ],
    },
  },
  {
    id: "spec:tx:ws004-tooling",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Standard-tooling support",
      cells: [
        { option_id: "spec:opt:ws004-zip", value: "Universal" },
        { option_id: "spec:opt:ws004-tar-gz", value: "Universal on Unix; Win10+" },
        { option_id: "spec:opt:ws004-custom", value: "None (bus factor 1)" },
      ],
    },
  },
  {
    id: "spec:tx:ws004-streaming",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Streamable write",
      cells: [
        { option_id: "spec:opt:ws004-zip", value: "No (central directory at end)" },
        { option_id: "spec:opt:ws004-tar-gz", value: "Yes" },
        { option_id: "spec:opt:ws004-custom", value: "Yes" },
      ],
    },
  },
  // ADR-WS-005
  {
    id: "spec:tx:ws005-atomicity",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Atomicity",
      cells: [
        { option_id: "spec:opt:ws005-verify-write-load", value: "Yes (rename-based)" },
        { option_id: "spec:opt:ws005-in-place", value: "No (mid-write crash = half-restore)" },
      ],
    },
  },
  {
    id: "spec:tx:ws005-disk-space",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Peak disk space",
      cells: [
        { option_id: "spec:opt:ws005-verify-write-load", value: "2x workspace size briefly" },
        { option_id: "spec:opt:ws005-in-place", value: "1x" },
      ],
    },
  },
  // ADR-WS-006
  {
    id: "spec:tx:ws006-breaking",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Breaking change",
      cells: [
        { option_id: "spec:opt:ws006-auto-mint", value: "No" },
        { option_id: "spec:opt:ws006-migration-cmd", value: "Yes (every existing data dir)" },
      ],
    },
  },
  {
    id: "spec:tx:ws006-operator-action",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Operator action required",
      cells: [
        { option_id: "spec:opt:ws006-auto-mint", value: "None" },
        { option_id: "spec:opt:ws006-migration-cmd", value: "Run init on every data dir" },
      ],
    },
  },
];

// ── §17 QA Scenarios (SEI format) ──────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:backup-restore-roundtrip",
    type: "spec:QAScenario",
    fields: {
      title: "Verifiable restore — backup-restore round-trip",
      source: "Operator running `fdpm workspace backup` then `fdpm workspace restore`.",
      stimulus:
        "Operator backs up a non-empty workspace, deletes the data dir, restores from the bundle.",
      environment:
        "Local filesystem with atomic-rename support; same fs for source and target.",
      artifact: "LocalWorkspace, BackupBundle, RestorePipeline.",
      response:
        "After restore, the data dir is bit-equivalent to its pre-deletion state (modulo workspace.json's _restoredAt marker if the operator opts into recording it). `Host.load()` succeeds. `fdpm validate` on every project produces the same findings as before the backup.",
      response_measure:
        "100% file-by-file sha256 equality between pre-backup data dir and post-restore data dir; zero new validation findings post-restore that weren't present pre-backup.",
    },
  },
  {
    id: "spec:qas:identity-stability-path-move",
    type: "spec:QAScenario",
    fields: {
      title: "Identity stability — path move",
      source: "Operator moving the data dir on disk (`mv ~/.fdpm-cli /mnt/external/`).",
      stimulus:
        "Operator runs `mv` then `fdpm workspace switch <name>` (or sets FDPM_DATA_DIR to the new path).",
      environment: "LocalWorkspace; registry has the workspace's previous path entry.",
      artifact: "Workspace registry, workspace.json identity.",
      response:
        "On next `fdpm` invocation against the moved path, `Host.load()` reads workspace.json, sees the same `id`, updates the registry's `path` for that id (last-wins). The workspace is identifiable by id; commands targeting the workspace by name continue to work.",
      response_measure:
        "Workspace `id` is invariant across the move. Registry's `path` field is updated within one invocation. No operator action required beyond pointing FDPM_DATA_DIR (or FDPM_WORKSPACE) at the new location.",
    },
  },
  {
    id: "spec:qas:identity-collision-on-restore",
    type: "spec:QAScenario",
    fields: {
      title: "Identity collision detection on restore",
      source:
        "Operator restoring a backup whose workspace_id matches an existing workspace in the registry.",
      stimulus:
        "`fdpm workspace restore bundle.fdpmbak --data-dir /tmp/test-restore` — the bundle's workspace_id matches a workspace already registered.",
      environment:
        "Default flags (no --force-overwrite, no --name).",
      artifact: "RestorePipeline, registry collision check.",
      response:
        "Restore refuses with `category=conflict`, `evidence.reason=\"workspace_id_collision\"`, `evidence.existing_workspace=<name+path>`, `evidence.advice=\"pass --force-overwrite to replace, or --name <new> to clone with a fresh id\"`. Target dir unchanged.",
      response_measure:
        "100% detection of workspace_id collisions. Operator-facing error message includes the existing workspace's name and path so the operator can verify before re-running.",
    },
  },
  {
    id: "spec:qas:version-skew-restore",
    type: "spec:QAScenario",
    fields: {
      title: "Version-skew restore — clear error, target unchanged",
      source: "Operator restoring a v1.2 bundle on a v2.0 host.",
      stimulus:
        "`fdpm workspace restore bundle.fdpmbak` where the bundle's `created_by_host_version` is older than the host's version by more than the supported window.",
      environment:
        "Restore reaches step 5 (Host.load() round-trip) and load throws because the JSONL log uses an obsolete operation kind.",
      artifact: "RestorePipeline step 5, version compat check.",
      response:
        "Restore fails with `category=host_compat`, `evidence.reason=\"version_skew\"`, `evidence.bundle_version=\"1.2.0\"`, `evidence.host_version=\"2.0.0\"`, `evidence.advice=\"downgrade fdpm to ~1.2.0 to load this bundle, or use a host with a forward-migration codemod\"`. The restored data dir is left in place (the operator can downgrade and retry without re-extracting).",
      response_measure:
        "Version skew is detected after extraction (not before — verification of bytes is independent of version compat). Error envelope carries actionable info.",
    },
  },
  {
    id: "spec:qas:auto-mint-existing-data-dir",
    type: "spec:QAScenario",
    fields: {
      title: "Auto-mint on first touch of pre-workspace data dir",
      source: "Operator upgrading FDPM to the workspace-aware version.",
      stimulus:
        "First `fdpm` invocation after upgrade against a data dir that has no `workspace.json`.",
      environment: "Existing data dir from a pre-workspace FDPM version.",
      artifact: "Host.load() auto-mint path.",
      response:
        "`Host.load()` mints `workspace.json` with `id = ulid()`, `name = basename(path)`, `_minted: true`. Registers in the registry. Emits a single warning on stderr. The operator's command runs normally with no further interruption.",
      response_measure:
        "Zero failures from upgrades. Warning is emitted once per data dir. Subsequent invocations see the existing workspace.json and proceed silently.",
    },
  },
  {
    id: "spec:qas:bundle-introspectability",
    type: "spec:QAScenario",
    fields: {
      title: "Bundle introspectability — read manifest without extracting",
      source: "Operator auditing a bundle before trusting it.",
      stimulus: "`unzip -p bundle.fdpmbak backup-manifest.json | jq .`",
      environment: "Standard Unix tooling; no `fdpm` available.",
      artifact: "Bundle format (.fdpmbak as zip with manifest at root).",
      response: "Valid JSON manifest is printed without extracting any other file.",
      response_measure:
        "Manifest is readable in O(manifest size) bytes from the bundle, not O(bundle size). Verified by reading just the central directory + the manifest entry.",
    },
  },
];

// ── §16 ConfigEntries ──────────────────────────────────────────────────────

const configEntries: PrimitiveSpec[] = [
  {
    id: "spec:cfg:fdpm-data-dir",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_DATA_DIR",
      default: "~/.fdpm-cli",
      purpose:
        "The path to a workspace's data dir. Continues to work exactly as today; the workspace concept is layered on top, not in place of. When set, takes precedence over FDPM_WORKSPACE.",
      scope: "core",
      kind: "path",
    },
  },
  {
    id: "spec:cfg:fdpm-workspace",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_WORKSPACE",
      default: "",
      purpose:
        "Friendly name (or id) of a workspace registered in the registry. Resolved to a path at startup. Ignored when FDPM_DATA_DIR is set. Operators who prefer named-addressing set this and ignore FDPM_DATA_DIR.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:fdpm-registry-path",
    type: "spec:ConfigEntry",
    fields: {
      key: "FDPM_REGISTRY_PATH",
      default: "${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json",
      purpose:
        "Override the registry file location. Useful for non-XDG environments or CI.",
      scope: "core",
      kind: "path",
    },
  },
  {
    id: "spec:cfg:workspace-init",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace init [--name N] [--path P] [--description D]",
      default: "",
      purpose:
        "Mint a fresh workspace at --path (default: cwd or FDPM_DATA_DIR). Creates workspace.json, registers in the registry, prints the new workspace_id.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-list",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace list [--json]",
      default: "",
      purpose:
        "Print every workspace in the registry. Marks the current one. Shows id, name, path, last_used.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-info",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace info [<name|id>] [--json]",
      default: "",
      purpose:
        "Show a workspace's identity, path, project count, last backup timestamp, health status. Defaults to the current workspace.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-switch",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace switch <name|id>",
      default: "",
      purpose:
        "Change the registry's `current` to point at the named workspace. Persistent across processes (no env var needed). Subsequent fdpm invocations operate on the switched-to workspace.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-rename",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace rename <old> <new>",
      default: "",
      purpose:
        "Change a workspace's friendly name. Updates workspace.json AND the registry. Clears the `_minted: true` marker if present.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-forget",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace forget <name|id>",
      default: "",
      purpose:
        "Remove a workspace from the registry without deleting the data dir. Symmetric counterpart to `init` for cleaning up the registry. The data dir remains; running fdpm against it would auto-mint a new identity.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-backup",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace backup [-o <file.fdpmbak>] [--include-mcp-audit] [--exclude-project <id>...] [--compression-level N] [--force]",
      default: "",
      purpose:
        "Write the current workspace as a `.fdpmbak` zip. Default output: `./fdpm-backup-<workspace-name>-<timestamp>.fdpmbak`. Inclusion defaults: every project, every profile, the manifest, the MCP audit log if it exists.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-restore",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace restore <file.fdpmbak> [--data-dir <dir>] [--name <new>] [--force-overwrite] [--dry-run] [--skip-verify]",
      default: "",
      purpose:
        "Restore a bundle to a target data dir (default: current workspace's path). Refuses on identity collision unless --force-overwrite or --name <new>. Atomic; verifies all sha256s before writing; runs Host.load() to prove replayability unless --skip-verify.",
      scope: "core",
      kind: "string",
    },
  },
  {
    id: "spec:cfg:workspace-verify",
    type: "spec:ConfigEntry",
    fields: {
      key: "fdpm workspace verify [<name|id>]",
      default: "",
      purpose:
        "Run Host.load() against a workspace's data dir without dispatching any commands. Health-checks replayability. Useful after a restore or a suspected disk corruption event.",
      scope: "core",
      kind: "string",
    },
  },
];

// ── §16 ErrorCategories ────────────────────────────────────────────────────

const errorCategories: PrimitiveSpec[] = [
  {
    id: "spec:err:conflict",
    type: "spec:ErrorCategory",
    fields: {
      category: "conflict",
      when_used:
        "Identity collision on restore (the bundle's workspace_id matches an existing registry entry). Workspace adds no new error categories; reuses `conflict` with a structured `evidence.reason: \"workspace_id_collision\"`.",
      evidence_keys: ["reason", "existing_workspace", "advice"],
    },
  },
  {
    id: "spec:err:verification",
    type: "spec:ErrorCategory",
    fields: {
      category: "verification",
      when_used:
        "sha256 mismatch on restore (a bundle entry's bytes don't match its manifest hash) OR malformed workspace.json (parse error, missing required fields). Surfaces with `evidence.reason: \"sha256_mismatch\" | \"workspace_json_invalid\"`.",
      evidence_keys: ["reason", "path", "expected", "actual"],
    },
  },
  {
    id: "spec:err:host-compat",
    type: "spec:ErrorCategory",
    fields: {
      category: "host_compat",
      when_used:
        "Restore's Host.load() round-trip fails — typically because the bundle was created by a host version that emitted operations the current host can't replay. Surfaces with `evidence.reason: \"version_skew\"`, `evidence.bundle_version`, `evidence.host_version`.",
      evidence_keys: ["reason", "bundle_version", "host_version", "advice"],
    },
  },
  {
    id: "spec:err:not-found",
    type: "spec:ErrorCategory",
    fields: {
      category: "not_found",
      when_used:
        "`fdpm workspace switch <name>` against an unknown name or id. Registry lookup miss.",
      evidence_keys: ["name_or_id", "available"],
    },
  },
  {
    id: "spec:err:permission",
    type: "spec:ErrorCategory",
    fields: {
      category: "permission",
      when_used:
        "Restore target dir is non-empty without `--force-overwrite`. Backup output file exists without `--force`. Refusal-to-overwrite is permission-shaped (the host refuses to do this in this state).",
      evidence_keys: ["path", "advice"],
    },
  },
];

// ── §18 Invariants ─────────────────────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:interface-only",
    type: "spec:Invariant",
    fields: {
      label: "Host holds Workspace, never JsonlLogStore directly.",
      statement:
        "After this SPEC's implementation, `Host` MUST NOT hold a direct reference to `JsonlLogStore`. All persistence goes through the `Workspace` interface. CI grep verifies no `import.*JsonlLogStore` outside `src/core/workspace/local.ts` and the JsonlLogStore module itself.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/src/core/host.ts",
    },
  },
  {
    id: "spec:inv:identity-immutable",
    type: "spec:Invariant",
    fields: {
      label: "workspace_id is immutable after init.",
      statement:
        "Once minted, a workspace's `id` field is never rewritten. Operators may rename (`name` field) freely. Any code path that writes to `id` after the initial `init` is a bug. Enforced at the workspace.json schema level: load checks the `id` against the registry's record and refuses on mismatch.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/core/workspace/local.ts",
    },
  },
  {
    id: "spec:inv:atomic-restore",
    type: "spec:Invariant",
    fields: {
      label: "Restore is atomic from the operator's perspective.",
      statement:
        "Restore writes to `<target>.tmp` then renames atomically to `<target>`. A crash mid-restore leaves `<target>` unchanged and `<target>.tmp` available for cleanup or resume. The host MUST detect cross-filesystem rename (where atomic isn't possible) and refuse.",
      enforcement: "runtime_check",
      scope_ref: "fdpm-cli/src/core/workspace/restore.ts",
    },
  },
  {
    id: "spec:inv:verify-before-write",
    type: "spec:Invariant",
    fields: {
      label: "Restore verifies all sha256s before writing any bytes.",
      statement:
        "The restore pipeline MUST complete the verification step (every entry's sha256 matches the manifest) before opening any file for write in the temp dir. A failed verification leaves zero state on disk.",
      enforcement: "review",
      scope_ref: "fdpm-cli/src/core/workspace/restore.ts",
    },
  },
  {
    id: "spec:inv:no-new-trust-boundary",
    type: "spec:Invariant",
    fields: {
      label: "Workspace adds no auth, no encryption, no signature.",
      statement:
        "The v0.1 Workspace surface MUST NOT introduce authentication, authorization, encryption, signing, or any other security boundary beyond the filesystem trust the operator already has. Crypto-related concerns belong to Phase 4 of the R2 roadmap.",
      enforcement: "review",
      scope_ref: "fdpm-cli/src/core/workspace/",
    },
  },
  {
    id: "spec:inv:plugin-call-sites-unchanged",
    type: "spec:Invariant",
    fields: {
      label: "Plugin call sites continue to work without changes.",
      statement:
        "Plugins call `host.store.X`, `host.profiles.X`, `host.plugins.X`. The Workspace refactor MUST keep these working — either by Host delegation (`host.store` returns `host.workspace.store`) or by composition. CI verifies a representative sample of plugin operations execute without modification.",
      enforcement: "ci_check",
      scope_ref: "fdpm-cli/plugins/",
    },
  },
];

// ── §19 Requirements ───────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:workspace-interface",
    type: "spec:Requirement",
    fields: {
      label: "Workspace interface defined and implemented",
      statement:
        "The codebase MUST define a `Workspace` interface (or abstract class) in `src/core/workspace/types.ts`. `LocalWorkspace` MUST implement it. `Host` MUST hold the interface, never the concrete class.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:1",
    },
  },
  {
    id: "spec:req:workspace-json",
    type: "spec:Requirement",
    fields: {
      label: "workspace.json identity file",
      statement:
        "Every workspace MUST have a `workspace.json` at the root of its data dir, conforming to the schema in §11 (id, name, created_at, created_by_host_version, spec_core_version, optional description, optional tags).",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:2",
    },
  },
  {
    id: "spec:req:registry",
    type: "spec:Requirement",
    fields: {
      label: "Registry at XDG state-data path",
      statement:
        "The registry MUST live at `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`. Missing registry on first invocation MUST auto-create with empty workspaces array.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:3",
    },
  },
  {
    id: "spec:req:auto-mint",
    type: "spec:Requirement",
    fields: {
      label: "Auto-mint on first touch",
      statement:
        "An existing data dir without `workspace.json` MUST trigger auto-mint on first `Host.load()`: a fresh workspace.json is written, the registry is updated, a one-time warning prints to stderr.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:4",
    },
  },
  {
    id: "spec:req:fdpm-data-dir-precedence",
    type: "spec:Requirement",
    fields: {
      label: "FDPM_DATA_DIR continues to work (highest precedence)",
      statement:
        "When FDPM_DATA_DIR is set, it MUST take precedence over FDPM_WORKSPACE and over the registry's `current` entry. This preserves backward compatibility with every existing script.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:5",
    },
  },
  {
    id: "spec:req:backup-bundle-format",
    type: "spec:Requirement",
    fields: {
      label: "Backup bundle format",
      statement:
        "`fdpm workspace backup` MUST produce a `.fdpmbak` zip archive containing `backup-manifest.json` and the data tree under `data/`. The manifest MUST carry sha256 per file, the workspace identity, host version, spec_core version, and created_at.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:6",
    },
  },
  {
    id: "spec:req:atomic-restore",
    type: "spec:Requirement",
    fields: {
      label: "Atomic restore",
      statement:
        "`fdpm workspace restore` MUST verify all sha256s before writing any bytes; write to a temp dir; atomic-rename to the target; run Host.load() to prove replayability. Cross-filesystem rename MUST be detected and refused.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:7",
    },
  },
  {
    id: "spec:req:identity-collision",
    type: "spec:Requirement",
    fields: {
      label: "Identity-collision detection on restore",
      statement:
        "When the bundle's workspace_id matches an existing registry entry, restore MUST refuse with `category=conflict`, `evidence.reason=\"workspace_id_collision\"`, unless `--force-overwrite` (replaces) or `--name <new>` (clones with fresh id) is supplied.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:8",
    },
  },
  {
    id: "spec:req:verify-command",
    type: "spec:Requirement",
    fields: {
      label: "fdpm workspace verify",
      statement:
        "`fdpm workspace verify [<name|id>]` MUST construct a Host against the named (or current) workspace's data dir, run `Host.load()`, and report success/failure. Used to confirm a workspace's data is replayable independently of running any command.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "spec:ac:9",
    },
  },
  {
    id: "spec:req:no-runtime-switch",
    type: "spec:Requirement",
    fields: {
      label: "No runtime workspace-switching API",
      statement:
        "There MUST NOT be a `host.switchWorkspace()` API in v0.1. Workspace switching happens between processes (via `fdpm workspace switch` updating the registry); within a process, the workspace is bound at construction.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "spec:conf:1",
    },
  },
  {
    id: "spec:req:no-new-error-categories",
    type: "spec:Requirement",
    fields: {
      label: "No new error categories",
      statement:
        "Workspace MUST reuse the existing FDPMException taxonomy. New scenarios (workspace_id collision, sha256 mismatch, version skew) surface as `conflict`, `verification`, and `host_compat` respectively, with structured `evidence.reason` keys.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "spec:conf:4",
    },
  },
];

// ── §20 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion:
        "`Workspace` interface exists in `src/core/workspace/types.ts`. `LocalWorkspace` implements it. `Host` holds `Workspace`, not `JsonlLogStore`. CI grep verifies no consumer outside `src/core/workspace/` imports JsonlLogStore directly.",
      status: "open",
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion:
        "An existing data dir without workspace.json triggers auto-mint on next `fdpm` invocation. workspace.json is created with a valid ULID and a basename-derived name; registry is updated; one-time warning is emitted on stderr; the operator's command runs normally.",
      status: "open",
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "`fdpm workspace backup` produces a valid .fdpmbak zip. `unzip -l` lists `backup-manifest.json` and the data tree. `unzip -p bundle.fdpmbak backup-manifest.json` returns valid JSON without extracting other files.",
      status: "open",
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "`fdpm workspace restore <bundle>` to an empty target dir succeeds. Post-restore, `fdpm validate` against every project produces the same findings as the pre-backup state.",
      status: "open",
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "Restore detects integrity tampering: corrupting one byte of one entry's content (without updating the manifest sha256) causes restore to refuse with `category=verification` and leaves the target dir unchanged.",
      status: "open",
    },
  },
  {
    id: "spec:ac:6",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 6,
      criterion:
        "Identity-collision test: restore a bundle whose workspace_id matches an existing registry entry, with no flags. Refuse with `category=conflict`, `evidence.reason=\"workspace_id_collision\"`. With `--force-overwrite`, succeed and replace. With `--name <new>`, succeed and mint a new id.",
      status: "open",
    },
  },
  {
    id: "spec:ac:7",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 7,
      criterion:
        "FDPM_DATA_DIR continues to take precedence over FDPM_WORKSPACE and the registry's `current`. Setting both produces a host that operates on the FDPM_DATA_DIR path.",
      status: "open",
    },
  },
  {
    id: "spec:ac:8",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 8,
      criterion:
        "Plugin operations execute unchanged: a sample of `host.store.X`, `host.profiles.X`, `host.plugins.X` calls from existing plugins execute without code changes after the workspace refactor.",
      status: "open",
    },
  },
  {
    id: "spec:ac:9",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 9,
      criterion:
        "`fdpm workspace verify <name>` constructs a Host, runs `Host.load()`, and exits 0 on success. Corruption in the workspace's JSONL log is detected and surfaced as `host_compat` with structured evidence.",
      status: "open",
    },
  },
  {
    id: "spec:ac:10",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 10,
      criterion:
        "Round-trip test: backup → delete data dir → restore → backup. The second bundle's manifest sha256s match the first bundle's (modulo `created_at`). Proves the format is stable and operations are idempotent.",
      status: "open",
    },
  },
];

// ── §21 Conformance Items ──────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "Interface boundary holds",
      procedure:
        "Run `grep -r 'JsonlLogStore' src/ tests/ plugins/ | grep -v 'src/core/workspace/' | grep -v 'src/persistence/jsonl-log.ts'`. Inspect output.",
      expected:
        "Empty result. The only consumers of JsonlLogStore are LocalWorkspace and the JsonlLogStore module itself.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Auto-mint on first touch",
      procedure:
        "Create a fresh data dir with a project log but no workspace.json. Run `fdpm health readiness` against it.",
      expected:
        "workspace.json is created with a valid ULID, the registry gains an entry, a single warning is printed on stderr, and the readiness command succeeds.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Backup-restore round-trip on identical data",
      procedure:
        "Pick a workspace with at least one project. Run `fdpm workspace backup -o /tmp/a.fdpmbak`. Run `fdpm workspace restore /tmp/a.fdpmbak --name restored --data-dir /tmp/restored`. Compare project-by-project: `fdpm validate` against the original and the restored.",
      expected:
        "Identical findings, identical primitive counts, identical relation counts. The restored workspace has a different `name` and `id` (because of `--name`), same data.",
    },
  },
  {
    id: "spec:conf:4",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 4,
      name: "Tampering detection",
      procedure:
        "Take a valid bundle; unzip, modify one byte of any data entry, re-zip without updating backup-manifest.json. Run restore.",
      expected:
        "Restore fails with `FDPMException(category=verification, evidence.reason=\"sha256_mismatch\", evidence.path=<modified file>)`. Target dir unchanged.",
    },
  },
  {
    id: "spec:conf:5",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 5,
      name: "Identity-collision refusal and resolution",
      procedure:
        "Initialize workspace A in /tmp/a. Backup it to /tmp/a.fdpmbak. Run `fdpm workspace restore /tmp/a.fdpmbak --data-dir /tmp/b` (no --force-overwrite, no --name).",
      expected:
        "Refuse with `category=conflict`, evidence.existing_workspace points at /tmp/a. Re-run with `--name a-clone` succeeds and creates a fresh workspace_id.",
    },
  },
  {
    id: "spec:conf:6",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 6,
      name: "FDPM_DATA_DIR backward compatibility",
      procedure:
        "Set FDPM_DATA_DIR=/tmp/a (with workspace A's data) AND FDPM_WORKSPACE=workspace-b. Run `fdpm workspace info`.",
      expected:
        "Output shows workspace A's identity. FDPM_DATA_DIR took precedence; FDPM_WORKSPACE was ignored.",
    },
  },
  {
    id: "spec:conf:7",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 7,
      name: "Atomicity under simulated crash",
      procedure:
        "Start `fdpm workspace restore` against a target dir; SIGKILL the process during the temp-dir write phase. Inspect the target dir.",
      expected:
        "Target dir unchanged. The temp dir `<target>.tmp` may exist; running restore again succeeds (overwrites the stale temp).",
    },
  },
  {
    id: "spec:conf:8",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 8,
      name: "Cross-filesystem rename refusal",
      procedure:
        "Run restore with a target dir on a different filesystem from the temp dir (e.g., target on a tmpfs, temp on ext4).",
      expected:
        "Refuse with a clear error pointing at the workaround (--data-dir <same-fs-path>). No partial write to the cross-fs target.",
    },
  },
];

// ── §23 Implementation Plan ────────────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:workspace-types",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/workspace/types.ts",
      change:
        "New file. Define `Workspace` interface with: `id`, `name`, `path` (optional — local-only), `getStore()`, `getProfileRegistry()`, `getPluginRuntime()`, `appendOp()`, `getOperationLog()`, `statProjectLog()`, `listProjects()`, `backup()`, `restore()` (where appropriate). Plus `WorkspaceIdentity` and `WorkspaceManifest` types.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:workspace-local",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/workspace/local.ts",
      change:
        "New file. `LocalWorkspace` class implementing `Workspace`. Wraps today's `JsonlLogStore`, owns `workspace.json` read/write, integrates with registry. Includes auto-mint logic on first touch.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:workspace-registry",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/workspace/registry.ts",
      change:
        "New file. Read/write the registry at `${FDPM_REGISTRY_PATH:-XDG path}`. Lookup-by-id, lookup-by-name (collision-suffixed), update `current`, list, forget, rename. Atomic write via temp file + rename.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:workspace-backup",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/workspace/backup.ts",
      change:
        "New file. Bundle writer: walks the workspace data dir, computes sha256s, writes a `.fdpmbak` zip via `archiver`. Outputs `backup-manifest.json` first (manifest-at-offset-0 contract).",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:workspace-restore",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/workspace/restore.ts",
      change:
        "New file. Restore pipeline: read manifest, verify all sha256s in memory, write to temp dir, atomic rename, Host.load() round-trip. Identity-collision check (consults registry).",
      complexity: "L",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:host-refactor",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/host.ts",
      change:
        "Refactor: Host holds a `Workspace` instead of constructing `JsonlLogStore` directly. `host.store`, `host.profiles`, `host.plugins` keep working via delegation (`host.store === host.workspace.store`). `Host.load()` triggers workspace's auto-mint if needed.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:cli-workspace-cmd",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/commands/workspace.ts",
      change:
        "New file. `fdpm workspace` subcommand suite: init, list, info, switch, rename, forget, backup, restore, verify. Implements all SPEC §15 commands.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:bin-workspace-resolution",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/bin/fdpm.ts",
      change:
        "Add workspace resolution at startup: precedence FDPM_DATA_DIR > FDPM_WORKSPACE > registry.current > error. Pass resolved path to Host as today; Host then auto-mints if needed.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:tests-workspace",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/tests/workspace/",
      change:
        "Test suite: identity round-trip, registry CRUD, auto-mint, backup format, restore atomicity, identity-collision, version-skew, cross-fs rename refusal, FDPM_DATA_DIR precedence, plugin call site invariance.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:archiver-dep",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/package.json",
      change:
        "Add `archiver` (~3 MB transitive, MIT) and `@types/archiver` (devDep). No native build step required.",
      complexity: "XS",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:agents-md",
    type: "spec:ImplementationChange",
    fields: {
      area: "AGENTS.md",
      change:
        "New section documenting workspace identity, registry, backup/restore for agent integrators. Worked example of bundle inspection via `unzip -p`.",
      complexity: "S",
      status: "not_started",
    },
  },
];

// ── §24 Migration Steps ────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 1,
      label: "Land Workspace interface + LocalWorkspace + registry + auto-mint",
      action:
        "Implement spec:chg:workspace-types, spec:chg:workspace-local, spec:chg:workspace-registry. Refactor Host (spec:chg:host-refactor) and bin/fdpm.ts (spec:chg:bin-workspace-resolution). Add unit tests for each. After this step: existing data dirs continue to work, auto-minted on first touch; FDPM_WORKSPACE env var resolves; `fdpm workspace list/info` work.",
      affected_paths: [
        "fdpm-cli/src/core/workspace/",
        "fdpm-cli/src/core/host.ts",
        "fdpm-cli/src/bin/fdpm.ts",
      ],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Land lifecycle commands (init/list/info/switch/rename/forget)",
      action:
        "Implement spec:chg:cli-workspace-cmd. Wire into bin/fdpm.ts. After this step: operators can mint, list, switch between, rename, and forget workspaces. Backup/restore are NOT yet available.",
      affected_paths: ["fdpm-cli/src/commands/workspace.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Land backup",
      action:
        "Add archiver dep (spec:chg:archiver-dep). Implement spec:chg:workspace-backup. Add `fdpm workspace backup` to the workspace subcommand suite. Tests: backup format, manifest contents, sha256 correctness, unzip-readable.",
      affected_paths: [
        "fdpm-cli/package.json",
        "fdpm-cli/src/core/workspace/backup.ts",
        "fdpm-cli/src/commands/workspace.ts",
      ],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Land restore",
      action:
        "Implement spec:chg:workspace-restore. Add `fdpm workspace restore` and `fdpm workspace verify`. Tests: round-trip equality, tampering detection, atomicity under crash, cross-fs rename refusal, identity-collision behavior.",
      affected_paths: [
        "fdpm-cli/src/core/workspace/restore.ts",
        "fdpm-cli/src/commands/workspace.ts",
      ],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "Documentation + AGENTS.md",
      action:
        "Add the workspace section to AGENTS.md. Update README.md and MANUAL.md with `fdpm workspace ...` commands. Document FDPM_WORKSPACE, FDPM_REGISTRY_PATH in the env contract.",
      affected_paths: ["AGENTS.md", "README.md", "fdpm-cli/MANUAL.md", "fdpm-cli/src/core/config/env.ts"],
      depends_on: ["spec:mig:4"],
    },
  },
];

// ── §25 Risks and Mitigations ──────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:wrong-interface",
    type: "spec:Risk",
    fields: {
      label: "Interface design wrong for future RemoteWorkspace",
      description:
        "The Workspace interface defined here may bake in local-filesystem assumptions that bite when Phase 3+ tries to implement RemoteWorkspace. Examples: synchronous methods, file-path-as-identity, atomic-rename assumption.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:auto-mint-confusion",
    type: "spec:Risk",
    fields: {
      label: "Auto-mint surprises operators",
      description:
        "Operators upgrading FDPM see workspace.json appear in their data dir without explicit action. Some may mistake the warning for an error.",
      likelihood: "medium",
      impact: "low",
    },
  },
  {
    id: "spec:risk:cross-fs-rename",
    type: "spec:Risk",
    fields: {
      label: "Cross-filesystem rename undetected",
      description:
        "If the implementation doesn't detect cross-fs rename, the rename silently degrades to copy-then-delete which is not atomic.",
      likelihood: "low",
      impact: "high",
    },
  },
  {
    id: "spec:risk:plugin-regression",
    type: "spec:Risk",
    fields: {
      label: "Host refactor breaks plugin call sites",
      description:
        "The audit of `host.store.X` consumers misses a call site; a plugin that worked yesterday breaks after the workspace refactor.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:registry-corruption",
    type: "spec:Risk",
    fields: {
      label: "Concurrent fdpm processes corrupt the registry",
      description:
        "Two concurrent `fdpm workspace switch` calls race; the second's write overwrites the first; one switch is lost. Registry has no file lock today.",
      likelihood: "low",
      impact: "low",
    },
  },
  {
    id: "spec:risk:bundle-size-explosion",
    type: "spec:Risk",
    fields: {
      label: "Multi-GiB workspaces produce backups too large to handle",
      description:
        "A workspace with years of operation logs or a project carrying large binary assets produces a >1 GiB backup. archiver buffers the central directory in memory; very large bundles may OOM.",
      likelihood: "low",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:identity-trust",
    type: "spec:Risk",
    fields: {
      label: "Operator over-trusts workspace.json identity",
      description:
        "An operator assumes workspace.json proves identity and uses it as a security primitive (e.g., 'this is definitely the prod workspace, I can run destructive commands'). workspace.json is filesystem-trust only; an attacker with write access can forge identity.",
      likelihood: "low",
      impact: "high",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:narrow-interface",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Keep the v0.1 Workspace interface narrow — only what LocalWorkspace needs. Avoid speculative methods (e.g., no `subscribe`, no `transaction`, no `query` until Phase 3+ proves the need).",
      status: "planned",
    },
  },
  {
    id: "spec:mit:auto-mint-warning-clarity",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Auto-mint warning includes the path, the new workspace_id, and the explicit next-step (`fdpm workspace rename`). The `_minted: true` marker lets `fdpm workspace info` surface 'this was auto-minted; rename to claim ownership' until renamed.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:cross-fs-detection",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Restore uses `fs.statSync` to compare device numbers between temp dir parent and target dir. On mismatch, refuse with a clear error pointing at the workaround (--data-dir <same-fs-path>) before any write happens.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:plugin-audit-ci",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "CI grep for `host.store`, `host.profiles`, `host.plugins`, `host.persistence` across plugins/. Every call site enumerated; failing to delegate correctly fails the test suite. Extra: a sample plugin operation (createPrimitive on a fixture) runs in tests as the canary.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:registry-lock",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Registry writes use the same write-temp + atomic-rename pattern as restore. Concurrent writes lose one update but never corrupt the file. Acceptable for v0.1 (operator-local, low contention).",
      status: "planned",
    },
  },
  {
    id: "spec:mit:bundle-size-guard",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Backup surfaces a warning when source data dir exceeds 500 MiB. `--exclude-project` and `--compression-level 9` are documented escapes. Streaming backup format reserved for v0.2 if this becomes a real bottleneck.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:identity-trust-docs",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Documentation explicitly states workspace.json is NOT cryptographically signed. PALS-banner extension on this SPEC notes the trust posture. Operators wanting cryptographic identity can layer their own GPG/cosign on the .fdpmbak; in-band signing is reserved for Phase 4 of the R2 roadmap.",
      status: "planned",
    },
  },
];

// ── §26 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:workbook-rename-interaction",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "When the workbook rename ships (project → workbook), should workspace.json grow a vocab_version field to discriminate between vocabulary generations?",
      default_choice:
        "No — until the workbook rename is designed, adding the field guesses at the answer. workspace.json stays free of project/workbook vocabulary in v0.1; the workbook rename's SPEC will decide whether vocab_version is needed.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:workspace-deletion",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Should there be a `fdpm workspace delete <name>` that removes both the registry entry AND the data dir (vs. `forget` which removes only the registry entry)?",
      default_choice:
        "Not in v0.1. Deletion of an entire data dir is destructive enough to warrant a separate operator-confirmed step. Operators can `rm -rf` after `forget` if they really want both. Revisit if the missing command becomes a recurring complaint.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:incremental-backup",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "Should backup support `--since <timestamp|revision>` to ship only operations after a baseline?",
      default_choice:
        "Not in v0.1. The operation log is already append-only — incremental backup is just `tail -c +<offset>` on each project log. Add when the use case is concrete; speculatively designing incremental backup risks the wrong format.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:bundle-encryption",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 4,
      question:
        "Should `fdpm workspace backup --encrypt` integrate with age/GPG/cosign?",
      default_choice:
        "Not in v0.1. Operators can pipe through their crypto tool of choice (`fdpm workspace backup -o - | age -r ... > bundle.fdpmbak.age`). In-band encryption introduces key-management questions that don't belong in v0.1's scope.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:auto-mint-default-name",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 5,
      question:
        "When auto-minting, should the default name be `basename(path)` or something more obviously-temporary (e.g., `auto-<short-ulid>`)?",
      default_choice:
        "basename(path), with the `_minted: true` marker doing the work of signaling 'this needs a real name'. basename is operator-meaningful; auto-* is opaque.",
      is_blocking: "no",
    },
  },
];

// ── §27 Future Work ────────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:remote-workspace",
    type: "spec:FutureWork",
    fields: {
      label: "RemoteWorkspace implementation against fdpm-server",
      description:
        "Phase 3 of the R2 roadmap. New `RemoteWorkspace` class implementing the v0.1 interface against the fdpm-server protocol. Same Host can switch between LocalWorkspace and RemoteWorkspace transparently.",
    },
  },
  {
    id: "spec:fw:cryptographic-identity",
    type: "spec:FutureWork",
    fields: {
      label: "Cryptographic identity (GPG/cosign signed workspace.json + manifest)",
      description:
        "Phase 4 of the R2 roadmap. workspace.json grows an `signature` field; backup-manifest.json grows an `signature` field. Restore can verify against a known public key. Out of scope for v0.1.",
    },
  },
  {
    id: "spec:fw:incremental-backup",
    type: "spec:FutureWork",
    fields: {
      label: "Incremental backup",
      description:
        "`--since <revision>` to ship only operations after a baseline. Restore would compose: full bundle + zero-or-more incrementals. Worth designing when there's a real use case (large workspaces with frequent backup cadence).",
    },
  },
  {
    id: "spec:fw:multi-workspace-cli",
    type: "spec:FutureWork",
    fields: {
      label: "Cross-workspace queries",
      description:
        "`fdpm workspace exec --all <subcommand>` to run a command across every registered workspace. Useful for fleet-wide reads (`fdpm workspace exec --all project list`). Designed in v0.2 once workspace usage patterns are clearer.",
    },
  },
  {
    id: "spec:fw:workspace-as-mcp-resource",
    type: "spec:FutureWork",
    fields: {
      label: "Workspace as MCP resource family",
      description:
        "Add `fdpm://workspace/<name>` resource family to fdpm-mcp's resources surface (slice 2). resources/list shows registered workspaces; resources/read returns workspace info as JSON. Subscriptions notify when the registry changes.",
    },
  },
  {
    id: "spec:fw:workbook-rename-coordination",
    type: "spec:FutureWork",
    fields: {
      label: "Coordinate with the workbook rename",
      description:
        "When SPEC-WORKBOOK-RENAME ships, decide whether workspace.json grows a vocab_version field or whether the rename is purely surface-level. Tracked in spec:q:workbook-rename-interaction.",
    },
  },
];

// ── §28 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:spec-core",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-CORE — operation-log invariants the workspace surface preserves.",
      locator: SPEC_CORE_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. §5.5 (replay determinism) and §6 (Store contract) are the invariants the workspace MUST preserve through the LocalWorkspace implementation.",
    },
  },
  {
    id: "spec:ref:spec-pluggable",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-PLUGGABLE-ARCHITECTURE — plugin call-site contract.",
      locator: SPEC_PLUGGABLE_ARCHITECTURE_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. The plugin runtime contract this SPEC's Principle 7 preserves.",
    },
  },
  {
    id: "spec:ref:spec-repl",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-REPL — freshness gate, cross-process concurrency, dataDir immutability.",
      locator: SPEC_REPL_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. §10 (concurrency and freshness) and §10.5 (plugin staleness) inform Principle 6 (dataDir immutable for Host's lifetime).",
    },
  },
  {
    id: "spec:ref:spec-mcp",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-MCP-SERVER — workspace as future MCP resource family.",
      locator: SPEC_MCP_SERVER_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. The resources surface defined there is the obvious home for `fdpm://workspace/<name>` (future work).",
    },
  },
  {
    id: "spec:ref:spec-uid",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-UID — ULID minting and the time-sortable identifier contract.",
      locator: SPEC_UID_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. workspace_id uses the same ULID minting machinery (mintUid) for consistency with primitive uids.",
    },
  },
  {
    id: "spec:ref:host-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "Host class — refactor target for the workspace abstraction seam.",
      locator: "fdpm-cli/src/core/host.ts",
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. `host.store`, `host.profiles`, `host.plugins`, `host.persistence` are the surface that gets re-routed through Workspace.",
    },
  },
  {
    id: "spec:ref:jsonl-log",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "JsonlLogStore — wrapped by LocalWorkspace.",
      locator: "fdpm-cli/src/persistence/jsonl-log.ts",
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. The local persistence layer LocalWorkspace owns. After this SPEC, only LocalWorkspace and the JsonlLogStore module itself import this class.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "CLAUDE.md — process and standards (PALS-LAW).",
      locator: "CLAUDE.md",
      verification: "self_evident",
      verification_note:
        "Project guidelines that govern this SPEC's PALS-banner extension. Workspace identity is a *claim* (operator-writable filesystem state), not a *proof* — exactly the kind of unverified-by-default surface PALS-LAW addresses.",
    },
  },
  {
    id: "spec:ref:archiver",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation: "archiver — Node zip writer for the .fdpmbak format. https://github.com/archiverjs/node-archiver",
      locator: "https://github.com/archiverjs/node-archiver",
      verification: "unverified",
      verification_note:
        "Cited as the chosen zip writer in ADR-WS-004. MIT licensed; ~3 MB transitive deps; no native build step. Mature (10+ year history).",
    },
  },
  {
    id: "spec:ref:xdg-base-dir",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation: "XDG Base Directory Specification. freedesktop.org.",
      locator: "https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html",
      verification: "unverified",
      verification_note:
        "Cited in ADR-WS-003 for the registry default location. XDG_STATE_HOME is the standard path for state-data files.",
    },
  },
  {
    id: "spec:ref:spec-mcp-resources",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-MCP-SERVER §resources — pattern for `fdpm://workspace/<name>` future work.",
      locator: SPEC_MCP_SERVER_PATH,
      verification: "verified",
      verification_note:
        "Read at SPEC-authoring time. The resources surface contract Workspace will eventually plug into.",
    },
  },
];

// ── §29 Revision History ───────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0.1.0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-05",
      title: "Initial proposal — Workspace as first-class primitive.",
      kind: "minor",
      notes: [
        "Locks the Workspace interface for Phase 1 of the R2 remote-server roadmap.",
        "Six ADRs: interface vs concrete, workspace.json shape, registry location, backup format, restore semantics, backward-compat (auto-mint).",
        "Identity model: ULID workspace_id; XDG-compliant operator-local registry; auto-mint on first touch of pre-workspace data dirs.",
        "Backup format: .fdpmbak as zip + backup-manifest.json with sha256 per file.",
        "Restore contract: verify-first → atomic rename → Host.load() round-trip.",
        "No new error categories; reuses conflict / verification / host_compat with structured evidence.reason keys.",
        "Plugin call sites unchanged.",
        "Cryptographic identity, incremental backup, encryption, cross-workspace queries, MCP resource family — all explicitly deferred to v0.2 / Phase 4 of the R2 roadmap.",
      ].join("\n"),
    },
  },
];

// ── Sections ───────────────────────────────────────────────────────────────

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
        "This SPEC defines **Workspace** — a first-class primitive that represents the named, identified container for FDPM project state. The unit of backup, restore, and (in Phase 3+ of the R2 remote-server roadmap) addressing.",
        "",
        "Today, FDPM binds the data directory to `Host` via `FDPM_DATA_DIR` (a path with no identity). This SPEC lifts the data directory to a typed primitive: it has a stable id (ULID), a friendly name, provenance metadata, and an interface boundary that future implementations (`RemoteWorkspace` against `fdpm-server`) will plug into without breaking existing consumers.",
        "",
        "Three concrete things the operator gets in v0.1:",
        "- **Identity**: every data directory has a `workspace.json` that survives path moves and round-trips through backup/restore.",
        "- **Registry**: a per-operator registry tracks every known workspace and the current one; `fdpm workspace switch <name>` flips contexts.",
        "- **Backup/restore**: `fdpm workspace backup` produces a verifiable `.fdpmbak` zip; `fdpm workspace restore` verifies and atomically restores it.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- **A wire protocol or remote-server implementation.** The interface defined here MUST be implementable by a future `RemoteWorkspace`, but Phase 3+ of the R2 roadmap is where that implementation lands.",
        "- **An architectural inversion.** `Host` continues to own the in-memory `Store`, `ProfileRegistry`, `PluginRuntime`. A future SPEC-WORKSPACE-AS-PRIMARY may invert that ownership; this SPEC explicitly defers the question (ADR-WS-001 Option C).",
        "- **Cryptographic identity.** workspace.json is operator-writable; sha256 in the backup manifest catches accidents and bit-rot. Adversarial substitution requires Phase 4 of the R2 roadmap.",
        "- **The workbook rename.** When `project → workbook` ships, workspace.json may grow a `vocab_version` field; this SPEC does NOT pre-decide that question.",
        "- **Incremental backup, encryption, cross-workspace queries.** All explicitly deferred to v0.2 or later (see §27).",
        "",
        "### 1.3 Why now",
        "",
        "Three converging signals:",
        "",
        "1. **No verifiable backup story.** Operators have `fdpm transfer export` (per-project, JSON-only) and `cp -r` (no manifest, no verification). Neither answers 'I have a verified backup of this workspace.'",
        "2. **Remote workspaces are on the roadmap.** R2 (server protocol) is the chosen direction. The interface boundary defined here is what Phase 3 plugs into.",
        "3. **Identity for agents.** When an LLM agent is told 'work on workspace X,' there is currently no way for the agent to verify it's working on the right one. workspace.json + the registry give that answer.",
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
        "The recurring tension is **identity stability vs. portability**: a workspace with a strong identity (ULID stamped at init) is harder to clone naively (`cp -r` produces two workspaces with the same id, both claiming legitimacy). The registry detects collisions; the `--name <new>` flag on restore mints a fresh id when cloning is the operator's intent. Adjacent: **verifiability vs. backup size** — every additional integrity check (sha256, CRC32, Host.load round-trip) increases bundle size and restore time, traded for confidence that a restored workspace actually works.",
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
        "Each principle is testable; the renderer enumerates them in declared order. Principle 1 (interface, not class) and Principle 5 (no new trust boundary) are the load-bearing decisions for the R2 roadmap and the security review respectively.",
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
      title: "Architectural Decisions",
      kind: "adr",
      body_md:
        "Six ADRs. ADR-WS-001 is the load-bearing one (interface vs concrete vs full-inversion). The remaining five fill in the implementation details that follow from ADR-WS-001's choice.",
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Trade-off Matrix",
      kind: "tradeoff_matrix",
      body_md: "Options scored across the axes that drove each ADR.",
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
        "### 8.1 Lifecycle commands",
        "",
        "```",
        "fdpm workspace init [--name <n>] [--path <dir>] [--description <text>]",
        "fdpm workspace list",
        "fdpm workspace info [<name|id>]",
        "fdpm workspace switch <name|id>",
        "fdpm workspace rename <old> <new>",
        "fdpm workspace forget <name|id>",
        "```",
        "",
        "**`init`** mints a fresh workspace at `--path` (default: `cwd` or `FDPM_DATA_DIR`). Writes `workspace.json` with `id = ulid()`, `name = <given>` (or basename), `created_at = now`, `created_by_host_version = HOST_VERSION`, `spec_core_version`. Registers in the registry. Sets it as `current`.",
        "",
        "**`list`** prints every workspace in the registry. Marks the current one. Shows id, name, path, last_used. Output respects `--json`.",
        "",
        "**`info`** shows a workspace's identity, path, project count (filesystem walk), last backup timestamp (registry-tracked), health (`Host.load()` succeeded recently?). Defaults to current.",
        "",
        "**`switch`** updates the registry's `current` to point at the named workspace. Persistent across processes. Subsequent `fdpm` invocations operate on the switched-to workspace.",
        "",
        "**`rename`** changes a workspace's friendly `name` field. Updates BOTH workspace.json AND the registry. Clears `_minted: true` if present.",
        "",
        "**`forget`** removes a workspace from the registry without deleting the data dir. Symmetric counterpart to `init` for cleaning up the registry. The data dir remains intact; the next `fdpm` invocation pointing at it would auto-mint a new identity (or the operator can `fdpm workspace init --path <that dir>` to claim it explicitly).",
        "",
        "### 8.2 Backup and restore",
        "",
        "```",
        "fdpm workspace backup [-o <file>] [--include-mcp-audit]",
        "                      [--exclude-project <id>...] [--compression-level <0-9>]",
        "                      [--force] [--json]",
        "",
        "fdpm workspace restore <file> [--data-dir <dir>] [--name <new>]",
        "                              [--force-overwrite] [--dry-run]",
        "                              [--skip-verify] [--json]",
        "",
        "fdpm workspace verify [<name|id>]",
        "```",
        "",
        "**`backup`** writes a `.fdpmbak` zip. Default output: `./fdpm-backup-<workspace-name>-<timestamp>.fdpmbak`. By default includes every project, every profile, the workspace manifest, and (if it exists) the MCP audit log. `--exclude-project <id>` skips listed projects. `--compression-level` controls deflate; `0` = store-only.",
        "",
        "**`restore`** is the inverse. `--data-dir <dir>` selects the target (default: current workspace's path). On identity collision: refuses unless `--force-overwrite` (replaces the existing workspace) or `--name <new>` (clones with a fresh id). `--dry-run` reports what would happen without writing. `--skip-verify` skips the post-restore Host.load() round-trip (use only when you've already verified externally).",
        "",
        "**`verify`** runs `Host.load()` against the workspace's data dir without dispatching any commands. Useful after a restore or to health-check a workspace.",
        "",
        "### 8.3 Workspace resolution at startup",
        "",
        "`fdpm` resolves which workspace a process operates on, in this precedence order:",
        "",
        "1. `--data-dir <path>` flag (highest precedence, single-call override)",
        "2. `--workspace <name|id>` flag (resolves through registry)",
        "3. `FDPM_DATA_DIR` env var (backward compatibility)",
        "4. `FDPM_WORKSPACE` env var (resolves through registry)",
        "5. The registry's `current` entry",
        "6. Error: 'no workspace selected; run `fdpm workspace init`'",
        "",
        "Once resolved, the path is bound to Host for the process lifetime. There is no runtime workspace switch (Principle 6).",
        "",
        "### 8.4 Backward compatibility",
        "",
        "An existing data dir with no `workspace.json` triggers **auto-mint** on `Host.load()`: a fresh workspace.json is written, the registry is updated, a single warning is printed on stderr. Operators who were happily using `FDPM_DATA_DIR=...` continue to work without changes; the workspace concept becomes visible only when they care to look.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Concurrency and Freshness",
      kind: "prose",
      body_md: [
        "Workspace inherits SPEC-REPL §10's freshness model wholesale. The workspace surface adds no new concurrency primitives:",
        "",
        "- **Single Host per workspace per process.** A long-lived process (REPL, MCP server) is bound to one workspace. Switching requires a new process or `Host.reload()` against the same workspace.",
        "- **Cross-process concurrency** on the same workspace is governed by SPEC-REPL §10's per-project freshness gate. Two processes writing to the same project's log race at the JSONL append level (covered by OS file locking) and detect each other on the next freshness check.",
        "- **Registry concurrency**: two `fdpm workspace switch` calls racing on the same operator can clobber each other's writes. Acceptable for v0.1; the registry uses the same temp-write + atomic-rename pattern as restore so corruption is impossible, but one switch may be lost.",
        "",
        "What's explicitly not designed:",
        "- No workspace-level lock. Two processes operating on the same workspace are subject only to per-project freshness, not to a workspace-wide mutex.",
        "- No cross-workspace transactions. Each `fdpm` invocation operates on exactly one workspace; multi-workspace operations (future work) would need their own design.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "The Workspace interface",
      kind: "prose",
      body_md: [
        "The interface defined here is the load-bearing decision (Principle 1, ADR-WS-001). It MUST be implementable by a future `RemoteWorkspace` without breaking the local one.",
        "",
        "```typescript",
        "interface Workspace {",
        "  /** Stable ULID minted at init, immutable. */",
        "  readonly id: string;",
        "",
        "  /** Operator-chosen friendly name. Mutable via fdpm workspace rename. */",
        "  name: string;",
        "",
        "  /** Local-only: filesystem path. RemoteWorkspace returns null. */",
        "  readonly path: string | null;",
        "",
        "  /** Identity record (workspace.json contents) for inspection. */",
        "  getIdentity(): WorkspaceIdentity;",
        "",
        "  /** In-memory Store the Host operates on. */",
        "  getStore(): Store;",
        "",
        "  /** ProfileRegistry the Host operates on. */",
        "  getProfileRegistry(): ProfileRegistry;",
        "",
        "  /** PluginRuntime the Host operates on. */",
        "  getPluginRuntime(): PluginRuntime;",
        "",
        "  /** Append an operation to a project's log. Persists. */",
        "  appendOp(project_id: string, op: Operation): Promise<void>;",
        "",
        "  /** Read a project's full operation log. */",
        "  getOperationLog(project_id: string): Promise<Operation[]>;",
        "",
        "  /** SPEC-REPL §10.2 freshness check. Cheap; per-call. */",
        "  statProjectLog(project_id: string): { mtime_ns: bigint; size: bigint } | null;",
        "",
        "  /** Project ids known to this workspace. */",
        "  listProjects(): string[];",
        "",
        "  /** Backup the workspace to a destination. Implementation-defined format. */",
        "  backup(opts: BackupOptions): Promise<BackupResult>;",
        "",
        "  /** Restore the workspace from a source. STATIC-equivalent (constructor-companion). */",
        "  // restore is a class-level static, not a method on an instance.",
        "}",
        "",
        "interface WorkspaceIdentity {",
        "  readonly spec_workspace: string; // \"1.0\"",
        "  readonly id: string;             // ULID",
        "  readonly name: string;",
        "  readonly created_at: string;     // ISO-8601",
        "  readonly created_by_host_version: string;",
        "  readonly spec_core_version: string;",
        "  readonly description?: string;",
        "  readonly tags?: string[];",
        "  readonly _minted?: boolean;      // true if auto-minted; cleared on rename",
        "}",
        "```",
        "",
        "**Notes**:",
        "- `path: string | null` is the only local-flavored field. `RemoteWorkspace.path` returns `null`; consumers that need a local path MUST handle null explicitly.",
        "- `getStore() / getProfileRegistry() / getPluginRuntime()` return the same instances Host holds today. Forward-delegation from Host (`host.store === host.workspace.getStore()`).",
        "- `appendOp()` is async because RemoteWorkspace will network-roundtrip; LocalWorkspace's implementation is a thin wrap of today's synchronous-then-flushed behavior.",
        "- `backup()` is a method on the instance; `restore()` is a static-equivalent (you can't restore through an instance you don't have yet). The CLI's `fdpm workspace restore` calls `LocalWorkspace.restore(bundle, opts)`.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "workspace.json identity file",
      kind: "prose",
      body_md: [
        "Located at `${data_dir}/workspace.json`. JSON, UTF-8, newline-terminated.",
        "",
        "```json",
        "{",
        "  \"spec_workspace\": \"1.0\",",
        "  \"id\": \"01K9XYZABCDEF1234567890ABC\",",
        "  \"name\": \"prod-laptop\",",
        "  \"created_at\": \"2026-05-05T12:34:56.789Z\",",
        "  \"created_by_host_version\": \"1.2.0\",",
        "  \"spec_core_version\": \"1.2\",",
        "  \"description\": \"Pedro's primary FDPM workspace; backed up nightly to NAS.\",",
        "  \"tags\": [\"primary\", \"backed-up\"]",
        "}",
        "```",
        "",
        "Field semantics:",
        "- **`spec_workspace`** — version of THIS SPEC. Changes when the schema changes.",
        "- **`id`** — ULID, immutable. Survives path moves, restores, machine migrations.",
        "- **`name`** — operator-chosen, mutable. Friendly handle for `fdpm workspace switch`.",
        "- **`created_at`** — ISO-8601 timestamp at workspace init.",
        "- **`created_by_host_version`** — fdpm host version that minted this workspace. Used for backup version-skew detection (ADR-WS-005).",
        "- **`spec_core_version`** — SPEC-CORE version at mint time. Used by restore to gate on protocol compat.",
        "- **`description`** — optional free-text. For operator notes.",
        "- **`tags`** — optional string array. Reserved for future filtering/grouping.",
        "- **`_minted`** — present only if auto-minted. Removed on first `fdpm workspace rename`.",
        "",
        "Validation: a Zod schema. Unknown fields rejected (catches typos). Missing required fields surface as `verification` errors with a clear `evidence.field_path`.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: {
      number: "12",
      title: "Registry file",
      kind: "prose",
      body_md: [
        "Located at `${FDPM_REGISTRY_PATH:-${XDG_STATE_HOME:-~/.local/state}/fdpm/workspaces.json}`.",
        "",
        "```json",
        "{",
        "  \"spec_workspace_registry\": \"1.0\",",
        "  \"current\": \"01K9XYZABCDEF1234567890ABC\",",
        "  \"workspaces\": [",
        "    {",
        "      \"id\": \"01K9XYZABCDEF1234567890ABC\",",
        "      \"name\": \"prod-laptop\",",
        "      \"path\": \"/home/admin/.fdpm-cli\",",
        "      \"last_used\": \"2026-05-05T12:00:00.000Z\",",
        "      \"last_backup\": \"2026-05-04T02:30:00.000Z\"",
        "    },",
        "    {",
        "      \"id\": \"01K9PQRABCDEF1234567890XYZ\",",
        "      \"name\": \"scratch\",",
        "      \"path\": \"/tmp/fdpm-scratch\",",
        "      \"last_used\": \"2026-05-04T18:00:00.000Z\"",
        "    }",
        "  ]",
        "}",
        "```",
        "",
        "Writes use the same temp-file + atomic-rename pattern as restore; concurrent writers may lose updates but never corrupt the file.",
        "",
        "**Path drift recovery**: if the registry's `path` for an `id` no longer exists on disk, `fdpm workspace list` surfaces the discrepancy. `fdpm workspace info <name>` against a missing-path workspace prints a clear error and suggests `fdpm workspace forget <name>` or `fdpm workspace init --path <new-path>` to re-register.",
        "",
        "**Cross-machine portability**: the registry is per-operator-per-machine. A workspace synced via Dropbox/git/etc. across machines will get a different registry entry on each machine but the SAME workspace_id. `fdpm workspace info` against the same workspace on different machines confirms the id matches.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "Backup bundle format (.fdpmbak)",
      kind: "prose",
      body_md: [
        "A zip archive with the following layout:",
        "",
        "```",
        "bundle.fdpmbak (zip)",
        "├── backup-manifest.json     (always at offset 0 by exporter convention)",
        "└── data/",
        "    ├── workspace.json",
        "    ├── manifest.json        (legacy spec_core data-dir manifest)",
        "    ├── profiles/",
        "    │   └── *.json",
        "    └── projects/",
        "        └── <project-id>/",
        "            └── log.jsonl",
        "```",
        "",
        "**`backup-manifest.json` shape**:",
        "",
        "```json",
        "{",
        "  \"spec_backup\": \"1.0\",",
        "  \"fdpm_host_version\": \"1.2.0\",",
        "  \"spec_core_version\": \"1.2\",",
        "  \"created_at\": \"2026-05-05T12:34:56.789Z\",",
        "  \"workspace\": {",
        "    \"id\": \"01K9XYZABCDEF1234567890ABC\",",
        "    \"name\": \"prod-laptop\",",
        "    \"created_at\": \"2026-05-05T12:34:56.789Z\",",
        "    \"created_by_host_version\": \"1.2.0\"",
        "  },",
        "  \"files\": [",
        "    {",
        "      \"path\": \"data/workspace.json\",",
        "      \"sha256\": \"abc123...\",",
        "      \"bytes\": 247,",
        "      \"content_type\": \"application/json\"",
        "    },",
        "    {",
        "      \"path\": \"data/projects/spec-core/log.jsonl\",",
        "      \"sha256\": \"def456...\",",
        "      \"bytes\": 248910,",
        "      \"content_type\": \"application/jsonl\"",
        "    }",
        "  ],",
        "  \"projects\": [",
        "    { \"id\": \"spec-core\", \"log_size\": 248910, \"log_sha256\": \"def456...\" }",
        "  ],",
        "  \"profiles\": [",
        "    { \"id\": \"profile:custom:0.1\", \"sha256\": \"...\" }",
        "  ],",
        "  \"warnings\": [],",
        "  \"exit_status\": \"ok\"",
        "}",
        "```",
        "",
        "**Compression policy**:",
        "- `text/*`, `application/json`, `application/jsonl`, `application/x-yaml`, `image/svg+xml`: `deflate` at the configured level (default 6).",
        "- `application/pdf`, `image/png`, `image/jpeg`, etc. (already-compressed types): `store` (no recompression).",
        "- The exporter inspects each entry's content_type to choose.",
        "",
        "**Integrity**: SHA-256 in `backup-manifest.json.files[i].sha256` AND zip's per-entry CRC32. Two independent checks; the SHA-256 is the citable audit value.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Restore contract",
      kind: "prose",
      body_md: [
        "Restore is a five-step pipeline. Each step has an explicit failure mode and a documented error category.",
        "",
        "**Step 1 — Read backup-manifest.json.** Decompresses just the manifest entry (random access via zip's central directory). Validates the schema. Failure: `verification` + `evidence.reason: \"manifest_invalid\"`. Target dir untouched.",
        "",
        "**Step 2 — Identity-collision check.** Compares the bundle's `workspace.id` against the registry. On collision, refuses unless `--force-overwrite` (replaces) or `--name <new>` (mints fresh id). Failure: `conflict` + `evidence.reason: \"workspace_id_collision\"`. Target dir untouched.",
        "",
        "**Step 3 — Verify all sha256s.** For every entry in `manifest.files`, decompress the zip entry, compute SHA-256, compare. Failure: `verification` + `evidence.reason: \"sha256_mismatch\"` + `evidence.path` of the first failing entry. Target dir untouched.",
        "",
        "**Step 4 — Write to temp dir + atomic rename.** Creates `${target}.tmp/` (must be on the same filesystem as `${target}`; cross-fs rename detected and refused with `verification` + `evidence.reason: \"cross_fs_rename\"`). Writes all files. Atomic `rename(${target}.tmp, ${target})`. If `${target}` exists and `--force-overwrite` is set, the existing dir is renamed to `${target}.replaced-<timestamp>` first; on success the operator can `rm -rf` it.",
        "",
        "**Step 5 — Host.load() round-trip.** Constructs a `Host` against `${target}`, calls `Host.load()`. If load throws, the data was decoded successfully but isn't replayable on this host (typical: version skew). Failure: `host_compat` + `evidence.bundle_version` + `evidence.host_version`. The restored data dir is left in place — the operator can downgrade `fdpm` and retry without re-extracting. `--skip-verify` opts out of step 5 (use only when external verification is in place).",
        "",
        "Every step's failure mode is testable; AC §20 enumerates the conformance checks.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Migration path for existing data dirs (auto-mint)",
      kind: "prose",
      body_md: [
        "An existing FDPM_DATA_DIR without workspace.json is auto-minted on first `Host.load()` after the upgrade.",
        "",
        "**Auto-mint sequence**:",
        "1. `Host.load()` checks for `${data_dir}/workspace.json`. Absent? Continue.",
        "2. Mint identity: `id = ulid()`, `name = basename(${data_dir}) || \"unnamed-workspace\"`, `created_at = now`, `created_by_host_version = HOST_VERSION`, `spec_core_version`, `description = \"Auto-minted from pre-workspace data dir.\"`, `_minted: true`.",
        "3. Atomic write to `${data_dir}/workspace.json` (temp + rename).",
        "4. Update the registry: append entry with the minted id, name, path. If a registry entry already exists for the path (from a prior auto-mint that didn't get a workspace.json — shouldn't happen but defensive), merge by id and update `last_used`.",
        "5. On naming collision (another workspace already has the auto-minted name), append `-2`, `-3`, etc. until unique. The workspace.json's `name` field reflects the actual chosen name.",
        "6. Emit a single warning on stderr: `note: auto-minted workspace identity for <path>; use 'fdpm workspace rename' to set a friendly name`. Print exactly once per data dir per process.",
        "",
        "**Operator experience**: an upgrading operator runs `fdpm health readiness` (or any other command). It works. They see one extra line of stderr noting the auto-mint. No further action required. They can rename later.",
        "",
        "**Idempotency**: subsequent loads see the existing workspace.json and skip the auto-mint path. `_minted: true` stays in workspace.json until the operator runs `fdpm workspace rename`.",
        "",
        "**Rollback safety**: if a downgrade to a pre-workspace fdpm is needed, the auto-minted workspace.json is harmless to the old binary (it ignores files it doesn't recognize). The operator can `rm workspace.json` if they want a clean state.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Lifecycle",
      kind: "prose",
      body_md: [
        "A workspace's full lifecycle:",
        "",
        "1. **Init** — `fdpm workspace init [--name <n>] [--path <dir>]` mints workspace.json and registers in the registry. Or: auto-mint on first `Host.load()` of an existing data dir.",
        "2. **Use** — every `fdpm` invocation against the workspace's path (resolved via the precedence order in §8.3) uses it.",
        "3. **Rename** — `fdpm workspace rename <old> <new>` updates workspace.json's `name` field and the registry. Workspace_id unchanged. Clears `_minted: true` if present.",
        "4. **Backup** — `fdpm workspace backup` writes a `.fdpmbak`. Updates `last_backup` in the registry. The data dir is unchanged.",
        "5. **Switch** — `fdpm workspace switch <other>` updates the registry's `current`. The original workspace remains in the registry.",
        "6. **Restore** — `fdpm workspace restore <bundle>` recreates a workspace from a `.fdpmbak`. Identity-collision policy gates the operation.",
        "7. **Forget** — `fdpm workspace forget <name>` removes the registry entry. The data dir on disk is unchanged. Future `fdpm` against that path would auto-mint a new identity.",
        "8. **Delete** — out of scope for v0.1. Operators can `rm -rf <path>` after `forget`.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "Quality-Attribute Scenarios (SEI template)",
      kind: "scenarios",
      body_md: "",
    },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: {
      number: "18",
      title: "Invariants",
      kind: "prose",
      body_md:
        "Invariants are the non-negotiable properties the implementation MUST preserve. CI and runtime checks each carry a `scope_ref` to the file that enforces them.",
    },
  },
  {
    id: "spec:sec:19",
    type: "spec:Section",
    fields: {
      number: "19",
      title: "Requirements",
      kind: "prose",
      body_md: "",
    },
  },
  {
    id: "spec:sec:20",
    type: "spec:Section",
    fields: {
      number: "20",
      title: "Acceptance Criteria",
      kind: "acceptance_criteria",
      body_md: "",
    },
  },
  {
    id: "spec:sec:21",
    type: "spec:Section",
    fields: {
      number: "21",
      title: "Conformance",
      kind: "conformance",
      body_md: "",
    },
  },
  {
    id: "spec:sec:22",
    type: "spec:Section",
    fields: {
      number: "22",
      title: "Error Model",
      kind: "error_taxonomy",
      body_md:
        "Workspace reuses the existing FDPMException taxonomy. New scenarios surface with structured `evidence.reason` keys.",
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
      title: "Migration Plan",
      kind: "migration",
      body_md: "Order matters: interface first, then lifecycle commands, then backup, then restore, then docs.",
    },
  },
  {
    id: "spec:sec:25",
    type: "spec:Section",
    fields: {
      number: "25",
      title: "Risks and Mitigations",
      kind: "risks",
      body_md: "Seven risks identified. The most consequential (RSK-WRONG-INTERFACE) is mitigated by keeping the interface narrow.",
    },
  },
  {
    id: "spec:sec:26",
    type: "spec:Section",
    fields: {
      number: "26",
      title: "Open Questions",
      kind: "open_questions",
      body_md:
        "Five open questions, all with default resolutions. None blocking.",
    },
  },
  {
    id: "spec:sec:27",
    type: "spec:Section",
    fields: {
      number: "27",
      title: "Future Work",
      kind: "future_work",
      body_md:
        "Six items deferred. RemoteWorkspace (R2 Phase 3+) is the load-bearing future commitment; everything else is operator-quality-of-life.",
    },
  },
  {
    id: "spec:sec:28",
    type: "spec:Section",
    fields: {
      number: "28",
      title: "Configuration",
      kind: "configuration",
      body_md:
        "Environment variables / flags governing the workspace surface. Inherits FDPM_DATA_DIR from Core; adds FDPM_WORKSPACE and FDPM_REGISTRY_PATH.",
    },
  },
  {
    id: "spec:sec:29",
    type: "spec:Section",
    fields: {
      number: "29",
      title: "Error Categories",
      kind: "error_taxonomy",
      body_md: "Workspace surfaces issues using the existing FDPMException taxonomy.",
    },
  },
  {
    id: "spec:sec:30",
    type: "spec:Section",
    fields: {
      number: "30",
      title: "References",
      kind: "references",
      body_md: "",
    },
  },
  {
    id: "spec:sec:31",
    type: "spec:Section",
    fields: {
      number: "31",
      title: "Revision history",
      kind: "revision_history",
      body_md: "",
    },
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Document → Section ordering
  ...sections.map((s, i) => ({
    id: `rel:doc-has-sec-${i + 1}`,
    type: "spec:HasSection" as const,
    from: documentSpec.id,
    to: s.id,
  })),

  // Defines (terms)
  ...termSpecs.map((t, i) => ({
    id: `rel:defines-${i}`,
    type: "spec:Defines" as const,
    from: documentSpec.id,
    to: t.id,
  })),

  // ADRs each consider their options + chose one
  // ADR-WS-001
  { id: "rel:adr1-considers-a", type: "spec:Considers" as const, from: adrWS001.id, to: optWS001A.id },
  { id: "rel:adr1-considers-b", type: "spec:Considers" as const, from: adrWS001.id, to: optWS001B.id },
  { id: "rel:adr1-considers-c", type: "spec:Considers" as const, from: adrWS001.id, to: optWS001C.id },
  { id: "rel:adr1-chose-a", type: "spec:Chose" as const, from: adrWS001.id, to: optWS001A.id },
  // ADR-WS-002
  { id: "rel:adr2-considers-a", type: "spec:Considers" as const, from: adrWS002.id, to: optWS002A.id },
  { id: "rel:adr2-considers-b", type: "spec:Considers" as const, from: adrWS002.id, to: optWS002B.id },
  { id: "rel:adr2-considers-c", type: "spec:Considers" as const, from: adrWS002.id, to: optWS002C.id },
  { id: "rel:adr2-chose-a", type: "spec:Chose" as const, from: adrWS002.id, to: optWS002A.id },
  // ADR-WS-003
  { id: "rel:adr3-considers-a", type: "spec:Considers" as const, from: adrWS003.id, to: optWS003A.id },
  { id: "rel:adr3-considers-b", type: "spec:Considers" as const, from: adrWS003.id, to: optWS003B.id },
  { id: "rel:adr3-considers-c", type: "spec:Considers" as const, from: adrWS003.id, to: optWS003C.id },
  { id: "rel:adr3-chose-a", type: "spec:Chose" as const, from: adrWS003.id, to: optWS003A.id },
  // ADR-WS-004
  { id: "rel:adr4-considers-a", type: "spec:Considers" as const, from: adrWS004.id, to: optWS004A.id },
  { id: "rel:adr4-considers-b", type: "spec:Considers" as const, from: adrWS004.id, to: optWS004B.id },
  { id: "rel:adr4-considers-c", type: "spec:Considers" as const, from: adrWS004.id, to: optWS004C.id },
  { id: "rel:adr4-chose-a", type: "spec:Chose" as const, from: adrWS004.id, to: optWS004A.id },
  // ADR-WS-005
  { id: "rel:adr5-considers-a", type: "spec:Considers" as const, from: adrWS005.id, to: optWS005A.id },
  { id: "rel:adr5-considers-b", type: "spec:Considers" as const, from: adrWS005.id, to: optWS005B.id },
  { id: "rel:adr5-chose-a", type: "spec:Chose" as const, from: adrWS005.id, to: optWS005A.id },
  // ADR-WS-006
  { id: "rel:adr6-considers-a", type: "spec:Considers" as const, from: adrWS006.id, to: optWS006A.id },
  { id: "rel:adr6-considers-b", type: "spec:Considers" as const, from: adrWS006.id, to: optWS006B.id },
  { id: "rel:adr6-chose-a", type: "spec:Chose" as const, from: adrWS006.id, to: optWS006A.id },

  // Tradeoffs hang off their respective ADRs
  { id: "rel:tx-001-future", type: "spec:HasTradeoff" as const, from: adrWS001.id, to: "spec:tx:ws001-future-remote" },
  { id: "rel:tx-001-effort", type: "spec:HasTradeoff" as const, from: adrWS001.id, to: "spec:tx:ws001-refactor-now" },
  { id: "rel:tx-001-plugin", type: "spec:HasTradeoff" as const, from: adrWS001.id, to: "spec:tx:ws001-plugin-impact" },
  { id: "rel:tx-002-skew", type: "spec:HasTradeoff" as const, from: adrWS002.id, to: "spec:tx:ws002-restore-version-skew" },
  { id: "rel:tx-002-sync", type: "spec:HasTradeoff" as const, from: adrWS002.id, to: "spec:tx:ws002-sync-bug-risk" },
  { id: "rel:tx-003-disc", type: "spec:HasTradeoff" as const, from: adrWS003.id, to: "spec:tx:ws003-discoverability" },
  { id: "rel:tx-003-multi", type: "spec:HasTradeoff" as const, from: adrWS003.id, to: "spec:tx:ws003-multi-workspace" },
  { id: "rel:tx-004-random", type: "spec:HasTradeoff" as const, from: adrWS004.id, to: "spec:tx:ws004-random-access" },
  { id: "rel:tx-004-tooling", type: "spec:HasTradeoff" as const, from: adrWS004.id, to: "spec:tx:ws004-tooling" },
  { id: "rel:tx-004-stream", type: "spec:HasTradeoff" as const, from: adrWS004.id, to: "spec:tx:ws004-streaming" },
  { id: "rel:tx-005-atomic", type: "spec:HasTradeoff" as const, from: adrWS005.id, to: "spec:tx:ws005-atomicity" },
  { id: "rel:tx-005-disk", type: "spec:HasTradeoff" as const, from: adrWS005.id, to: "spec:tx:ws005-disk-space" },
  { id: "rel:tx-006-break", type: "spec:HasTradeoff" as const, from: adrWS006.id, to: "spec:tx:ws006-breaking" },
  { id: "rel:tx-006-action", type: "spec:HasTradeoff" as const, from: adrWS006.id, to: "spec:tx:ws006-operator-action" },

  // QAScenarios target a QualityAttribute (each scenario verifies one attribute)
  { id: "rel:qas-1-targets", type: "spec:Targets" as const, from: "spec:qas:backup-restore-roundtrip", to: "spec:qa:verifiable-restore" },
  { id: "rel:qas-2-targets", type: "spec:Targets" as const, from: "spec:qas:identity-stability-path-move", to: "spec:qa:identity-stability" },
  { id: "rel:qas-3-targets", type: "spec:Targets" as const, from: "spec:qas:identity-collision-on-restore", to: "spec:qa:verifiable-restore" },
  { id: "rel:qas-4-targets", type: "spec:Targets" as const, from: "spec:qas:version-skew-restore", to: "spec:qa:verifiable-restore" },
  { id: "rel:qas-5-targets", type: "spec:Targets" as const, from: "spec:qas:auto-mint-existing-data-dir", to: "spec:qa:backward-compat" },
  { id: "rel:qas-6-targets", type: "spec:Targets" as const, from: "spec:qas:bundle-introspectability", to: "spec:qa:bundle-introspectability" },

  // Mitigations target their risks
  { id: "rel:mit-1-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:narrow-interface", to: "spec:risk:wrong-interface" },
  { id: "rel:mit-2-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:auto-mint-warning-clarity", to: "spec:risk:auto-mint-confusion" },
  { id: "rel:mit-3-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:cross-fs-detection", to: "spec:risk:cross-fs-rename" },
  { id: "rel:mit-4-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:plugin-audit-ci", to: "spec:risk:plugin-regression" },
  { id: "rel:mit-5-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:registry-lock", to: "spec:risk:registry-corruption" },
  { id: "rel:mit-6-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:bundle-size-guard", to: "spec:risk:bundle-size-explosion" },
  { id: "rel:mit-7-mitigates", type: "spec:Mitigates" as const, from: "spec:mit:identity-trust-docs", to: "spec:risk:identity-trust" },

  // Migration depends-on chain
  { id: "rel:mig2-on-1", type: "spec:DependsOn" as const, from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig3-on-2", type: "spec:DependsOn" as const, from: "spec:mig:3", to: "spec:mig:2" },
  { id: "rel:mig4-on-3", type: "spec:DependsOn" as const, from: "spec:mig:4", to: "spec:mig:3" },
  { id: "rel:mig5-on-4", type: "spec:DependsOn" as const, from: "spec:mig:5", to: "spec:mig:4" },

  // Verifies edges (AC ↔ Requirement)
  { id: "rel:ver-ac1-req1", type: "spec:Verifies" as const, from: "spec:ac:1", to: "spec:req:workspace-interface" },
  { id: "rel:ver-ac2-req4", type: "spec:Verifies" as const, from: "spec:ac:2", to: "spec:req:auto-mint" },
  { id: "rel:ver-ac3-req6", type: "spec:Verifies" as const, from: "spec:ac:3", to: "spec:req:backup-bundle-format" },
  { id: "rel:ver-ac4-req6", type: "spec:Verifies" as const, from: "spec:ac:4", to: "spec:req:backup-bundle-format" },
  { id: "rel:ver-ac5-req7", type: "spec:Verifies" as const, from: "spec:ac:5", to: "spec:req:atomic-restore" },
  { id: "rel:ver-ac6-req8", type: "spec:Verifies" as const, from: "spec:ac:6", to: "spec:req:identity-collision" },
  { id: "rel:ver-ac7-req5", type: "spec:Verifies" as const, from: "spec:ac:7", to: "spec:req:fdpm-data-dir-precedence" },
  { id: "rel:ver-ac9-req9", type: "spec:Verifies" as const, from: "spec:ac:9", to: "spec:req:verify-command" },

  // Citations
  { id: "rel:adr-cites-spec-core", type: "spec:Cites" as const, from: adrWS001.id, to: "spec:ref:spec-core" },
  { id: "rel:adr-cites-spec-pluggable", type: "spec:Cites" as const, from: adrWS001.id, to: "spec:ref:spec-pluggable" },
  { id: "rel:adr-cites-spec-repl", type: "spec:Cites" as const, from: adrWS001.id, to: "spec:ref:spec-repl" },
  { id: "rel:adr-cites-host-ts", type: "spec:Cites" as const, from: adrWS001.id, to: "spec:ref:host-ts" },
  { id: "rel:adr-cites-jsonl", type: "spec:Cites" as const, from: adrWS001.id, to: "spec:ref:jsonl-log" },
  { id: "rel:adr4-cites-archiver", type: "spec:Cites" as const, from: adrWS004.id, to: "spec:ref:archiver" },
  { id: "rel:adr3-cites-xdg", type: "spec:Cites" as const, from: adrWS003.id, to: "spec:ref:xdg-base-dir" },
  { id: "rel:doc-cites-claude", type: "spec:Cites" as const, from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-cites-spec-mcp", type: "spec:Cites" as const, from: documentSpec.id, to: "spec:ref:spec-mcp" },
  { id: "rel:doc-cites-spec-uid", type: "spec:Cites" as const, from: documentSpec.id, to: "spec:ref:spec-uid" },
  { id: "rel:doc-cites-spec-mcp-resources", type: "spec:Cites" as const, from: documentSpec.id, to: "spec:ref:spec-mcp-resources" },

  // Required reads on the document
  { id: "rel:doc-req-claude", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-spec-core", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:spec-core" },
  { id: "rel:doc-req-spec-pluggable", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:spec-pluggable" },
  { id: "rel:doc-req-spec-repl", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:spec-repl" },
  { id: "rel:doc-req-spec-mcp", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:spec-mcp" },
  { id: "rel:doc-req-spec-uid", type: "spec:RequiredRead" as const, from: documentSpec.id, to: "spec:ref:spec-uid" },

  // Document was introduced in revision 0.1.0
  { id: "rel:doc-revised-0-1-0", type: "spec:RevisedIn" as const, from: documentSpec.id, to: "spec:rev:0.1.0" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — FDPM Workspace",
    profile: PROFILE_ID,
    description:
      "SPEC for the FDPM Workspace primitive — the named, identified container for FDPM project state. Locks the Workspace interface boundary that Phase 1 of the R2 remote-server roadmap depends on, plus identity, registry, backup, and restore mechanics. Authored as a typed graph using the fdpm.spec-authoring profile.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...stakeholderSpecs,
      ...qaSpecs,
      ...principleSpecs,
      ...allOptionSpecs,
      ...allAdrSpecs,
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

  console.log("Built project:", result.project_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render to Markdown:");
  console.log(
    `  npx tsx fdpm-cli/src/bin/fdpm.ts render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer -o docs/specs/SPEC-WORKSPACE.md`,
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
