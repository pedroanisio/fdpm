/**
 * Build SPEC-CORE v1.2 using the `fdpm.spec-authoring-dnis` composition
 * profile (commit fe998f7 onward — SPEC-SECTIONS-TREE v0.2 codemod).
 *
 * 1:1 migration of docs/specs/SPEC-CORE.md to a typed graph. The cross-
 * cutting primitives (Term, Stakeholder, ADR-ish decision, requirement,
 * acceptance criterion, risk/mitigation, open question, reference,
 * revision) are committed as typed spec-authoring primitives. The
 * **section tree** is committed as `dnis:Document` + `dnis:Node`
 * primitives via DnisHostAdapter (per SPEC-CORE 1.2 §5.6 / SPEC-
 * SECTIONS-TREE v0.2): no `spec:Section`/`spec:HasSection` is emitted.
 *
 * §5.6 ("Document Node Identity — SPEC-DNIS adoption") is the one
 * mid-chain-insert section; it becomes a CHILD of §5 in the DNIS tree
 * and carries `content.number_override = "5.6"` so the rendered label
 * stays "5.6" instead of the DFS-derived "5.1". §1..§24 are top-level
 * peers (no override needed; their DFS labels match the legacy spec).
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-core
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-core npx tsx fdpm-cli/scripts/build-spec-core.ts
 *
 * Render with:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-core npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-core text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-CORE.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring_dnis/index.js";
import { DnisHostAdapter } from "../src/core/dnis/adapter.js";
import {
  positionBetween,
  type AgentId,
  type NodeId,
  type OperationId,
} from "../src/core/dnis/index.js";
import { mintUid } from "../src/core/identity/uid.js";

const SPEC_CORE_BUILD_AGENT = "agent:build-spec-core" as AgentId;

const PROJECT_ID = "spec-core";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:core",
  type: "spec:Document",
  fields: {
    title: "SPEC — FDPM Core v1.3",
    subtitle:
      "The invariant Core: contracts, models, services, and policies that exist regardless of which plugins are installed, including zero plugins.",
    spec_id: "spec:fdpm:core:1.3",
    version: "1.3.0",
    status: "Draft",
    audience: "FDPM core maintainers, plugin authors (as a contract).",
    required_reads: ["CLAUDE.md", "PURPOSE.md", "DISCLAIMER.md"],
    peer_spec: "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "The Core defined below is the host of that verification: every plugin-contributed artefact crosses a Core boundary, and every boundary enforces this contract.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "1.3.0 — adds the `workbook.update` operation kind (§5.5.1, §9.1, §9.8.3): workbook name and description become event-sourced edits. 1.2.0 adopted SPEC-DNIS as a normative extension of §5 (§5.6); hosts MUST register profile:dnis:0.1. See §24.",
    source_script: "fdpm-cli/scripts/build-spec-core.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-core",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-core npx tsx fdpm-cli/scripts/build-spec-core.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-core npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-core text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-CORE.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  ["Core", "Everything specified in this document."],
  [
    "Host",
    "The running FDPM process: Core + plugin runtime + activated plugins.",
  ],
  [
    "Profile",
    "A populated `DomainProfile` value. Profiles are content even when shipped as built-ins.",
  ],
  [
    "Meta-model",
    "The Pydantic types that constrain what a Profile can contain (§4).",
  ],
  [
    "Instance",
    "A populated `PrimitiveInstance` or `RelationInstance` belonging to a Workbook (§5).",
  ],
  [
    "Verification gate",
    "The Core-enforced check applied to any artefact entering Core from outside.",
  ],
  [
    "Plugin boundary",
    "The `PluginContext` interface plus the `/plugins/{id}/...` URL namespace. The only contact surface plugins have with Core.",
  ],
  [
    "Reserved namespace",
    "A URL path or symbol Core owns and refuses to delegate.",
  ],
  ["core:empty", "The single Core-shipped profile; see §1.5."],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §2 Architectural Principles ────────────────────────────────────────────

const principles: Array<{
  id: string;
  ordinal: number;
  title: string;
  statement: string;
  strength: string;
}> = [
  {
    id: "spec:prin:domain-neutrality",
    ordinal: 1,
    title: "Domain neutrality.",
    statement:
      "Core knows nothing about formal specifications, narratives, software, law, or any other domain. Domain knowledge is a plugin concern.",
    strength: "MUST",
  },
  {
    id: "spec:prin:schema-of-schemas",
    ordinal: 2,
    title: "Schema-of-schemas.",
    statement:
      "Core defines the *shape* of profiles; plugins fill it. The meta-model is invariant; the model populated from it is not.",
    strength: "MUST",
  },
  {
    id: "spec:prin:verification-at-every-boundary",
    ordinal: 3,
    title: "Verification at every boundary.",
    statement:
      "Every artefact crossing into Core from outside (HTTP request, plugin contribution, file import) is validated against a Core-owned schema before acceptance. PALS's LAW is structural.",
    strength: "MUST",
  },
  {
    id: "spec:prin:plugin-failure-is-data",
    ordinal: 4,
    title: "Plugin failure is data, not catastrophe.",
    statement:
      "A faulty or absent plugin reduces capability; it never compromises Core integrity.",
    strength: "MUST",
  },
  {
    id: "spec:prin:single-writer-per-concept",
    ordinal: 5,
    title: "Single writer per concept.",
    statement:
      "Each piece of Core state has exactly one component authorised to mutate it. Plugins observe through read APIs, mutate through `PluginContext`.",
    strength: "MUST",
  },
  {
    id: "spec:prin:stable-contracts-evolving-content",
    ordinal: 6,
    title: "Stable contracts, evolving content.",
    statement:
      "Core types and endpoints are versioned and stable across SPEC minor versions. The *content* served through them changes freely as plugins come and go.",
    strength: "MUST",
  },
  {
    id: "spec:prin:useful-with-zero-plugins",
    ordinal: 7,
    title: "Useful with zero plugins.",
    statement:
      "Every Core surface MUST be exercisable with no plugins installed. \"Out of the box\" is the baseline test, not an aspiration.",
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

// ── §22 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:auth-model",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Auth model. The current code uses an API-key model (`frontend/src/lib/auth.ts`). Should Core formalise it as part of §14, or wait until a future `SPEC-AUTH` lands?",
      default_choice:
        "Wait for SPEC-AUTH; v1.1 §14 documents what Core defends and what it does not, leaving auth-model formalisation to the dedicated SPEC.",
      is_blocking: "no",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:engine-nlp-placement",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "`engine/nlp.py` placement. It is used by both narrative and formal-specification analyses today. Three options: (a) move to whichever plugin uses it most and have the other declare a `dependencies.plugins` link; (b) split into per-plugin copies (accepts duplication, cleanest boundary); (c) promote to a Core capability `cap:nlp` (a Core SPEC minor bump, deferred to v1.1).",
      default_choice:
        "Until decided, §19.3 keeps it in Core under the `# TODO(spec-core-§22.2)` marker.",
      is_blocking: "yes",
      owner: "Operator",
    },
  },
  {
    id: "spec:q:default-frontend-forms-scope",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "Default frontend forms scope. Should the default form support all field types declared in the meta-model in v1.0, or accept a known subset and emit a \"unsupported field type\" placeholder for the rest?",
      default_choice:
        "Known-subset + placeholder is the pragmatic v1.0 choice; promote to full coverage when field-type list stabilises.",
      is_blocking: "no",
      owner: "Operator",
    },
  },
];

// ── §23 References ────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:purpose-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "PURPOSE.md — universality mandate this SPEC implements at the architectural level.",
      locator: "PURPOSE.md",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; the universality framing motivates §1's domain-neutrality decision.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "CLAUDE.md — process and verification rules this SPEC inherits.",
      locator: "CLAUDE.md",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; PALS's LAW and the Core Principles are inherited verbatim.",
    },
  },
  {
    id: "spec:ref:disclaimer-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "DISCLAIMER.md — epistemic commitments.",
      locator: "DISCLAIMER.md",
      verification: "self_evident",
    },
  },
  {
    id: "spec:ref:companion-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "Companion SPEC — defines the plugin runtime that consumes this Core.",
      locator: "docs/specs/SPEC-PLUGGABLE-ARCHITECTURE.md",
      verification: "verified",
      verification_note: "Read at SPEC-authoring time; companion §4 capability catalogue and §5 manifest schema are referenced throughout.",
    },
  },
  {
    id: "spec:ref:drift-risk-map",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "drift-risk-map.md — current coupling/drift inventory; informs §17.4 and §20.",
      locator: "drift-risk-map.md",
      verification: "unverified",
      verification_note: "Reader must verify the current state of the drift-risk map; it changes as the codebase evolves.",
    },
  },
  {
    id: "spec:ref:store-py",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "src/fdpm/store.py:19-65 — current store shape (Core-stable).",
      locator: "src/fdpm/store.py",
      verification: "unverified",
      verification_note: "Source-of-truth file; line numbers will drift across revisions.",
    },
  },
  {
    id: "spec:ref:models-core-py",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "src/fdpm/models/core.py:202-356 — current meta-model types (Core-stable).",
      locator: "src/fdpm/models/core.py",
      verification: "unverified",
      verification_note: "Source-of-truth file; line numbers will drift across revisions.",
    },
  },
  {
    id: "spec:ref:main-py",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "src/fdpm/main.py:23-33, 45-50, 142-152 — current Core violations (to be migrated per §19).",
      locator: "src/fdpm/main.py",
      verification: "unverified",
      verification_note: "Source-of-truth file; the violations enumerated here will disappear after §19 migration.",
    },
  },
  {
    id: "spec:ref:iso-iec-ieee-42010",
    type: "spec:Reference",
    fields: {
      kind: "iso_standard",
      citation:
        "ISO/IEC/IEEE 42010 — architecture description framework, source of \"stakeholders + concerns + viewpoints\" framing used implicitly throughout.",
      locator: "https://www.iso.org/standard/74393.html",
      verification: "unverified",
      verification_note: "Cited for the stakeholder/concern framing only; not load-bearing for any normative claim.",
    },
  },
  {
    id: "spec:ref:pep-660",
    type: "spec:Reference",
    fields: {
      kind: "url",
      citation:
        "PEP 660 / `importlib.metadata.entry_points` — entry-point mechanism Core relies on for plugin discovery (companion SPEC).",
      locator: "https://peps.python.org/pep-0660/",
      verification: "unverified",
      verification_note: "Reader must verify; the entry-point mechanism specifics belong to the companion SPEC.",
    },
  },
];

// ── §2 implicit Stakeholders (derived from the Risks section's surface) ────
//
// SPEC-CORE doesn't carry an explicit §2 Stakeholders table — the
// stakeholder framing is implicit (ISO/IEC/IEEE 42010, ref:iso-iec-ieee-42010).
// Materialise the stakeholder set the SPEC actually addresses so the renderer's
// §2 table has typed rows.

const stakeholders: PrimitiveSpec[] = [
  {
    id: "spec:stk:core-maintainer",
    type: "spec:Stakeholder",
    fields: {
      role: "Core maintainer",
      primary_concern:
        "Keep Core domain-neutral; resist scope creep; enforce the §17.2 forbidden-changes list against every PR.",
      category: "internal_team",
    },
  },
  {
    id: "spec:stk:plugin-author",
    type: "spec:Stakeholder",
    fields: {
      role: "Plugin author",
      primary_concern:
        "Have a stable, versioned contract (§9.1, §11.1) that does not break across Core minor bumps; rely on the verification gate as a safety net.",
      category: "external_team",
    },
  },
  {
    id: "spec:stk:operator",
    type: "spec:Stakeholder",
    fields: {
      role: "Operator",
      primary_concern:
        "Run a host that stays useful with zero plugins (§10.2), expose audit trails for compliance (§13.3), and have operator-only escape hatches (§15.2) that plugins cannot reach.",
      category: "human",
    },
  },
  {
    id: "spec:stk:security-reviewer",
    type: "spec:Stakeholder",
    fields: {
      role: "Security reviewer",
      primary_concern:
        "The verification gate is non-bypassable (§8.3); the defence-in-depth chain (§14.3) has no gaps; reserved namespaces (§9.3, §11.3) cannot be shadowed.",
      category: "internal_team",
    },
  },
  {
    id: "spec:stk:frontend-developer",
    type: "spec:Stakeholder",
    fields: {
      role: "Frontend developer (in-tree)",
      primary_concern:
        "The shell's zero-plugins baseline (§10.2) and the slot machinery (§10.1) work for any profile; per-plugin first-paint budget (§10.4) protects perceived performance.",
      category: "internal_team",
    },
  },
];

// ── §3 Quality Attributes (cross-cutting concerns from the SPEC's framing) ─

const qas: PrimitiveSpec[] = [
  {
    id: "spec:qa:domain-neutrality",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Domain neutrality",
      pressure:
        "Every Core surface must work for any profile; domain-specific code in Core is a Principle 1 violation.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:auditability",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Auditability",
      pressure:
        "Every state-changing operation must be reconstructable from the operation log alone (§5.5, §13.3); replay must be byte-equal across restarts.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:security",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Security",
      pressure:
        "The verification gate is the only contract that holds against adversarial plugins; the defence-in-depth chain (§14.3) has no skip path.",
      priority: "primary",
    },
  },
  {
    id: "spec:qa:modifiability",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Modifiability",
      pressure:
        "Adding a plugin is content; adding a Core endpoint is a SPEC minor bump. The boundary between the two must be operationally meaningful.",
      priority: "secondary",
    },
  },
  {
    id: "spec:qa:performance",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Performance",
      pressure:
        "Replay cost grows with log length; snapshots (§5.5.5) cap it. Per-plugin first-paint budgets (§10.4) protect SPA load time.",
      priority: "secondary",
    },
  },
  {
    id: "spec:qa:backwards-compat",
    type: "spec:QualityAttribute",
    fields: {
      attribute: "Backwards compatibility",
      pressure:
        "Existing v1.0 clients must continue to work after the v1.1 bump (§5.5 event sourcing is additive). Old logs replay forward via upcasters (§5.5.6).",
      priority: "primary",
    },
  },
];

// ── §17 Invariants ─────────────────────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:meta-model-fixed",
    type: "spec:Invariant",
    fields: {
      label: "Meta-model is fixed",
      statement:
        "A change to any §4 meta-model type is a Core SPEC major bump. Plugins cannot widen the meta-model.",
      enforcement: "review",
      scope_ref: "§4 + §17.2",
    },
  },
  {
    id: "spec:inv:operation-kind-set-closed",
    type: "spec:Invariant",
    fields: {
      label: "Operation kind set is closed",
      statement:
        "Plugins MUST NOT introduce new operation kinds (§5.5.1). Adding a kind is a Core SPEC minor bump. Existing kinds may be emitted by plugins via `cap:transformer`.",
      enforcement: "ci_check",
      scope_ref: "§5.5.1 + §17.2",
    },
  },
  {
    id: "spec:inv:replay-pure-deterministic",
    type: "spec:Invariant",
    fields: {
      label: "Replay is pure and deterministic",
      statement:
        "`replay(log)` produces byte-equal output every time; plugins MUST NOT contribute alternative implementations. Two implementations of replay would be the worst kind of drift.",
      enforcement: "ci_check",
      scope_ref: "§5.5.3",
    },
  },
  {
    id: "spec:inv:single-write-path",
    type: "spec:Invariant",
    fields: {
      label: "Store has one write path",
      statement:
        "All writes to the projection go through `Store.append(op)`. Direct mutation of projection maps is forbidden everywhere — including in Core handlers. AST inspection enforces this in CI.",
      enforcement: "ci_check",
      scope_ref: "§6.2",
    },
  },
  {
    id: "spec:inv:gate-non-bypassable",
    type: "spec:Invariant",
    fields: {
      label: "Verification gate is non-bypassable",
      statement:
        "No Core handler exposes a write path that skips the gate. No plugin permission grants gate-bypass. Operator override exists only for `quarantine-clear` (companion SPEC §6.6) and is audit-logged.",
      enforcement: "review",
      scope_ref: "§8.3",
    },
  },
  {
    id: "spec:inv:zero-plugins-baseline",
    type: "spec:Invariant",
    fields: {
      label: "Zero-plugins baseline holds",
      statement:
        "The shell remains useful with no plugins installed (§10.2). `core:empty` (§1.5) makes \"a workbook with any registered profile can be opened\" satisfiable.",
      enforcement: "ci_check",
      scope_ref: "§10.2",
    },
  },
  {
    id: "spec:inv:reserved-namespaces",
    type: "spec:Invariant",
    fields: {
      label: "Reserved namespaces are inviolable",
      statement:
        "Plugins MUST NOT mount on reserved paths (§9.3, §9.4) or define IDs in reserved namespaces (§11.3). The verification gate rejects violations at registration.",
      enforcement: "runtime_check",
      scope_ref: "§9.3 + §9.4 + §11.3",
    },
  },
];

// ── §18 Acceptance Criteria for Core v1.1 ─────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  ac(1, "core-meta-001", "Every meta-model type in §4.1 has Pydantic strict-mode tests for required fields, optional fields, and rejection of extra fields.", "open"),
  ac(2, "core-meta-002", "Profile resolution detects circular `extends`, ID collisions across the chain, and returns a flattened immutable result.", "open"),
  ac(3, "core-meta-003", "The `core:empty` profile (§1.5) is registered at host startup with zero plugins installed; a test asserts its presence and shape.", "open"),
  ac(4, "core-instance-001", "Instance creation through the API is impossible without a registered profile; tests cover the 404 path.", "open"),
  ac(5, "core-instance-002", "All invariants in §5.2 are unit-tested with a passing and failing case each.", "open"),
  ac(6, "core-store-001", "A repo-wide grep `from fdpm.store import store` matches only files inside `src/fdpm/api/**`, `src/fdpm/main.py`, and `src/fdpm/plugin/**`. Match elsewhere fails the test.", "open"),
  ac(7, "core-store-002", "The store's RLock is the only synchronisation primitive used for store mutation.", "open"),
  ac(8, "core-store-003", "The legacy `project_state` bag is either removed or each remaining writer is a Core API handler (no plugin path writes to it). Test enforces by AST/grep.", "open"),
  ac(9, "core-validation-001", "The §7 pipeline runs in the declared order; integration tests assert step-by-step ordering.", "open"),
  ac(10, "core-validation-002", "A plugin validator that raises is converted to a `findings` entry with level `error` per §7.1 step 6; the host does not crash; after `FDPM_VALIDATOR_QUARANTINE_THRESHOLD` consecutive raises the owning plugin is quarantined.", "open"),
  ac(11, "core-gate-001", "Every boundary in §8.1 has at least one passing and one failing test.", "open"),
  ac(12, "core-gate-002", "No write-path Core handler exists that bypasses the gate; a code-review checklist + test inventory is the evidence.", "open"),
  ac(13, "core-endpoint-001", "Every path in §9.1 is implemented and has request/response schema tests.", "open"),
  ac(14, "core-endpoint-002", "A plugin attempting to mount a router on any reserved path is rejected by the gate.", "open"),
  ac(15, "core-endpoint-003", "After §19 migration, requests to pre-migration paths (`/api/narrative/*`, `/api/spec_parser/*`, `/api/workbooks/{id}/export.pdf`) return 404 — no redirect, no shim. The contract test enumerates these paths and asserts their absence from OpenAPI.", "open"),
  ac(16, "core-fe-baseline-001", "A web client, when one exists, run with zero plugins, exercises §10.2 in an end-to-end browser test (including default print/preview render and `core:empty` workbook open). No web client ships in this repository — the `web/` prototype was retired on 2026-08-29 — so this criterion has no candidate implementation and cannot be closed until PURPOSE.md's future web UI is built.", "open"),
  ac(17, "core-fe-slot-001", "Each slot has a default implementation; a synthetic plugin overrides it; both code paths are tested.", "open"),
  ac(18, "core-fe-budget-001", "A synthetic frontend plugin that exceeds `FDPM_FE_PLUGIN_BUDGET_MS` does not block first paint; the slot falls back; the admin API records the breach.", "open"),
  ac(19, "core-boundary-001", "The `PluginContext` has no method that exposes mutable references to store internals; tested by introspection.", "open"),
  ac(20, "core-boundary-002", "The frontend scoped API client allows the read-side §9.1 endpoints listed in the plugin's `permissions` and rejects others (§11.1).", "open"),
  ac(21, "core-versioning-001", "`GET /version` returns `spec_core` as `\"1.1\"` (major.minor only) and a separate `spec_core_revision` field carrying the document revision (e.g. `\"1.1.0\"`); round-trip property test confirms both match `pyproject.toml` and this document.", "open"),
  ac(22, "core-observability-001", "Every metric in §13.1 is emitted; every log record carries the §13.2 fields; verified by capture in tests.", "open"),
  ac(23, "core-observability-002", "An audit record whose pre-truncation diff exceeds `FDPM_AUDIT_DIFF_MAX_BYTES` is truncated per §13.3, retains its `_audit_truncated` marker, and increments the truncation counter.", "open"),
  ac(24, "core-security-001", "The defence-in-depth chain in §14.3 is exercised by a test that injects a failure at each step and asserts the request aborts.", "open"),
  ac(25, "core-error-001", "Every category in §16 is producible via a dedicated test path.", "open"),
  ac(26, "core-extensibility-001", "A test attempts each forbidden change in §17.2 and asserts the host rejects it.", "open"),
  ac(27, "core-graphops-split-001", "`POST /workbooks/{id}:split` with a valid 2-way partition produces two new workbooks, deletes the source, drops cross-partition relations, and returns the dropped list. Audit log captures `workbook.split` + per-new-workbook `workbook.create` + per-dropped `relation.drop` records under one `request_id`.", "open"),
  ac(28, "core-graphops-split-002", "Each refused-input case in §5.4.1 returns the documented status/category. Atomicity test: a partition that triggers a per-primitive validation failure leaves the source workbook unchanged.", "open"),
  ac(29, "core-graphops-split-003", "A profile with no `is_partition_unit=True` primitive type rejects `:split` with 400 `validation`. `core:empty` exercises this path.", "open"),
  ac(30, "core-graphops-clone-001", "`POST /workbooks/{id}:clone` produces a workbook with the same `profile_id`, copies all primitives and relations and templates and test suites, does NOT copy `SuiteRunReport`s, and emits one `workbook.create` audit record with `cloned_from` evidence.", "open"),
  ac(31, "core-graphops-clone-002", "Clone with a target ID collision returns 409 `conflict`; clone of a missing source returns 404.", "open"),
  ac(32, "core-graphops-meta-001", "`PrimitiveTypeDef.is_partition_unit` is exercised in profile-construction tests: valid `True`/`False` declarations are accepted; the field defaults to `False` when absent.", "open"),
  ac(33, "core-edit-001", "Every meta-model field type round-trips through the default form to all four edit surfaces (whole, field, batch, structure).", "open"),
  ac(34, "core-edit-002", "A field-patch attempt at an immutable field (§9.7.7) is rejected with `category=verification`.", "open"),
  ac(35, "core-edit-003", "A batch with one failing operation rolls back all earlier operations; store revision is unchanged.", "open"),
  ac(36, "core-edit-004", "`If-Match` and `expected_*revision` mismatches yield `412` and do not mutate.", "open"),
  ac(37, "core-edit-005", "Every successful edit emits exactly one `AuditRecord` (§13.3) whose `diff` reconstructs the change.", "open"),
  ac(38, "core-edit-006", "A reorder request with a non-permutation ordering is rejected with `category=verification`.", "open"),
  ac(39, "core-edit-007", "A reparent that violates a `RelationTypeDef` scope constraint is rejected with `category=validation`.", "open"),
  ac(40, "core-eventsource-001", "Every state-changing endpoint in §9.1 appends exactly one operation per affected record under one `request_id`.", "open"),
  ac(41, "core-eventsource-002", "Replay is pure and deterministic: `replay(log) == replay(log)` byte-equal across runs and restarts. Property test against randomised operation sequences.", "open"),
  ac(42, "core-eventsource-003", "Direct projection mutation is forbidden by AST inspection of `src/fdpm/api/**` and `src/fdpm/engine/**`. The only write path is `Store.append`.", "open"),
  ac(43, "core-eventsource-004", "`GET /workbooks/{id}/log` honours all query filters and respects `read:audit`.", "open"),
  ac(44, "core-eventsource-005", "`GET /workbooks/{id}/at?revision=N` returns state byte-equal to `replay(log[:N+1])` for every N.", "open"),
  ac(45, "core-eventsource-006", "`:undo` of every kind in §9.8.4 produces state byte-equal to \"before the target operation\" when no later operations interfere; conflict path tested for kinds that admit a conflict.", "open"),
  ac(46, "core-eventsource-007", "Snapshots, when present, are byte-equal to `replay(log[:N])`. Property test creates random snapshots and verifies.", "open"),
  ac(47, "core-eventsource-008", "A SPEC bump that changes a kind's payload schema ships an upcaster; the release-time gate rejects the bump if any old `schema_version` lacks a chain to current.", "open"),
];

function ac(ord: number, id: string, criterion: string, status: string): PrimitiveSpec {
  return {
    id: `spec:ac:${id}`,
    type: "spec:AcceptanceCriterion",
    fields: { ordinal: ord, criterion, status },
  };
}

// ── §21 Risks ──────────────────────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  risk("spec:risk:built-ins-demoted", "Built-ins demoted by tight Core line", "Drawing the Core line tightly leaves three \"built-ins\" feeling demoted.", "low", "low"),
  risk("spec:risk:store-import-break", "Strict access discipline breaks store imports", "Strict access discipline (§6.2) breaks any third-party code currently importing `store`.", "medium", "medium"),
  risk("spec:risk:gate-startup-latency", "Verification gate adds startup latency", "Verification gate adds startup latency.", "medium", "low"),
  risk("spec:risk:reserved-namespace-forgotten", "Reserved namespaces are easy to forget", "Reserved namespaces are easy to forget when adding new Core endpoints.", "medium", "medium"),
  risk("spec:risk:zero-plugins-baseline-non-trivial", "Zero-plugins baseline is non-trivial", "The \"zero plugins\" baseline (§10.2) is non-trivial: defaults must work for any profile.", "medium", "high"),
  risk("spec:risk:client-breakage-on-router-move", "Migrating Core-domain routers breaks every existing client", "Migrating the three Core-domain routers breaks every existing client that hardcodes the old paths.", "high", "low"),
  risk("spec:risk:residual-py-ts-drift", "Plugin migration leaves Py↔TS drift surfaces", "Plugin migration removes domain code from Core but leaves the Python↔TypeScript drift surfaces.", "high", "medium"),
  risk("spec:risk:plugin-validator-mistaken-for-core-bug", "Plugin-supplied validators that raise could be mistaken for Core bugs", "Plugin-supplied validators that raise could be mistaken for Core bugs.", "medium", "medium"),
  risk("spec:risk:event-source-log-grows-unbounded", "Event-sourced log grows without bound", "Event-sourced log grows without bound.", "high", "medium"),
  risk("spec:risk:upcaster-bug", "Schema migrations land badly", "An upcaster is buggy, replay produces wrong state.", "medium", "critical"),
  risk("spec:risk:noisy-plugin-pollutes-history", "Plugin emits noisy operations that pollute history forever", "Plugin emits noisy operations that pollute history forever.", "medium", "low"),
  risk("spec:risk:event-source-impl-surface", "Event sourcing increases v1.1 implementation surface materially", "Adopting event sourcing increases v1.1 implementation surface materially.", "high", "medium"),
];

function risk(id: string, label: string, description: string, likelihood: string, impact: string): PrimitiveSpec {
  return {
    id,
    type: "spec:Risk",
    fields: { label, description, likelihood, impact },
  };
}

const mitigations: PrimitiveSpec[] = [
  mit("spec:mit:built-ins-shipped", "Built-ins remain shipped; they are simply re-shaped as plugins. Operator UX unchanged.", "implemented"),
  mit("spec:mit:companion-shim", "The companion SPEC's one-release shim covers it; removal is a documented major event.", "planned"),
  mit("spec:mit:gate-budget", "Per-plugin gate budget = 200 ms; alertable; parallelised across plugins.", "planned"),
  mit("spec:mit:reserved-namespace-test", "A test enumerates `/_admin`, `/_telemetry`, `/static` and asserts no plugin can shadow them.", "planned"),
  mit("spec:mit:core-empty-and-defaults", "`core:empty` profile + generic `FieldDef`-driven forms; tests cover at least three differently-shaped profiles to prove generality.", "planned"),
  mit("spec:mit:contract-test-gate", "Accepted by design (§9.6). The only in-tree client (`frontend/src/lib/api.ts`) is updated in the same PR; the contract test is the gate. No external clients exist at v1.0.", "planned"),
  mit("spec:mit:future-cap-shared-constants", "§17.4 documents the residual surface; addressed by a future SPEC, not v1.0.", "planned"),
  mit("spec:mit:exception-barrier", "§7.1 step 6 exception barrier converts raises to findings, with a clearly attributable `rule_id` and `evidence`; quarantine threshold prevents repeat flooding.", "planned"),
  mit("spec:mit:snapshots-and-future-compaction", "Snapshots (§5.5.5) cap replay cost; v1.1 keeps the log in memory so growth is bounded by RAM; v1.2's persistence SPEC will add disk-side compaction policies. The kind set is closed (§5.5.1) so log-shape growth is bounded by Core release cadence.", "planned"),
  mit("spec:mit:upcaster-release-gate", "Upcaster correctness is a release-time gate (`core-eventsource-008`) not a runtime gate. Buggy upcasters fail tests and never ship. If one slips through, `:rebuild-from-log` (§6.5) is the operator escape hatch.", "planned"),
  mit("spec:mit:rebuild-from-log", "Acknowledged limitation (§20). v1.1 has no compaction/redaction; mitigation is operator-authored compensating operations on a fresh log (§5.5.6). Frequency caps belong to a future SPEC.", "planned"),
  mit("spec:mit:sequenced-migration", "The migration is sequenced (§19.4) so steps 1–6 deliver a working SPEC-CORE 1.0 before step 7 lands event sourcing. The property test (`core-eventsource-002`) is land-first to catch refactor drift as code moves.", "planned"),
];

function mit(id: string, strategy: string, status: string): PrimitiveSpec {
  return {
    id,
    type: "spec:Mitigation",
    fields: { strategy, status },
  };
}

// ── §20 Future Work / Out of Scope ────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  fw("spec:fw:persistence", "Operation log persistence to disk", "v1.1 commits to the *shape* of the log (`Operation` model, kind set, payload schemas). A future `SPEC-CORE-PERSISTENCE` adds a write-ahead-log file format and snapshot persistence.", "1.2"),
  fw("spec:fw:multi-tenancy", "Multi-tenancy and per-tenant authorisation", "Core is single-tenant in v1.0. Multi-tenancy is a separate SPEC.", null),
  fw("spec:fw:plugin-sandbox", "WASM or process-level plugin sandboxing", "Trust tier model is the v1.0 mitigation; isolation is a future SPEC.", null),
  fw("spec:fw:plugin-marketplace", "Plugin marketplace or signed registry service", "Distribution channel is out of Core scope.", null),
  fw("spec:fw:cross-workbook-federation", "Cross-workbook federation (instances referencing other workbooks)", "§5.3 forbids cross-workbook references in v1.1. Federation is a future SPEC.", null),
  fw("spec:fw:realtime-collaboration", "Real-time collaboration (CRDT, OT, or socket layer)", "The operation log makes some of this feasible; it is not an obligation of v1.1.", null),
  fw("spec:fw:hot-reload", "Hot reload of Core code without restart", "Out of scope; restart is the v1.1 mechanism.", null),
  fw("spec:fw:cap-shared-constants", "`cap:shared-constants` for cross-runtime constants", "Would address `drift-risk-map.md` findings #1, #5–#8 systematically.", null),
  fw("spec:fw:cross-partition-preserve", "`cross_partition_relations: \"preserve\"` for `:split`", "Requires cross-workbook references in the meta-model, which §5.3 forbids in v1.1.", null),
  fw("spec:fw:cross-partition-annotate", "`cross_partition_relations: \"annotate\"` for `:split`", "Defensible but lossy; deferred until a user story demands it.", null),
  fw("spec:fw:workbook-merge", "Workbook merge / re-join (inverse of `:split`)", "Once split, workbooks are independent in v1.1.", null),
  fw("spec:fw:cap-workbook-event", "`cap:workbook-event` (§5.4.4)", "Letting plugins subscribe to operation-log events without polling. The natural \"free feature\" event sourcing unlocks; deferred to a future SPEC.", null),
  fw("spec:fw:cap-projection", "`cap:projection` (§5.5.8)", "Letting plugins build their own derived views over the log. Deferred to the same future SPEC as `cap:project-event`.", null),
  fw("spec:fw:primitive-level-split-clone", "Primitive-level split or clone", "Different surface from workbook-level (§5.4); rejected for v1.1 because no user story requires it.", null),
  fw("spec:fw:branching", "Branching, copy-on-write, alternative timelines (§5.5.7)", "Event sourcing makes these feasible; v1.1 explicitly does not ship them. `:undo` (§9.8.3) appends inverses rather than rewinding the trunk.", null),
  fw("spec:fw:log-compaction-redaction", "Log compaction / redaction", "A buggy plugin that emits 10 000 noisy operations pollutes history forever in v1.1. Operator tooling to compact or redact specific operation ranges is deferred.", null),
  fw("spec:fw:fleet-replay-validation", "Replaying the log in a sandbox to verify upcaster correctness across the entire historical fleet", "v1.1 ships upcasters with unit tests and the build-time gate (`core-eventsource-008`); large-fleet replay validation is operator tooling, not a Core obligation.", null),
];

function fw(id: string, label: string, description: string, target_version: string | null): PrimitiveSpec {
  return {
    id,
    type: "spec:FutureWork",
    fields: target_version ? { label, description, target_version } : { label, description },
  };
}

// ── §13 Implementation Changes (§19 migration violations) ──────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:remove-static-plugin-imports",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/main.py:23-33, :45-50",
      change:
        "Remove static plugin imports that hardcode three plugins as if they were Core. Replace with discovery-driven loading per the companion SPEC.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:move-domain-routers",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/api/{narrative,spec_parser,export_pdf}.py",
      change:
        "Move domain-specific routers (`narrative_router`, `spec_parser_router`, `export_pdf_router`) into the relevant plugin packages under `/plugins/{id}/...`.",
      complexity: "L",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:move-domain-engines",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/engine/{nlp,narrative_validation,spec_parser}.py",
      change:
        "Move domain-specific engine modules to the relevant plugins. `engine/nlp.py` placement remains an open question (§22.2).",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:event-source-store",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/store.py + src/fdpm/models/operations.py + src/fdpm/api/**",
      change:
        "Implement `Operation` model + per-kind payload schemas; refactor every write handler to construct an `Operation` and call `Store.append(op)`. Implement the replay engine. Land the property test `core-eventsource-002` first.",
      complexity: "XL",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:event-source-endpoints",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/api/log.py (new), src/fdpm/api/at.py (new), src/fdpm/api/undo.py (new), src/fdpm/api/rebuild.py (new)",
      change:
        "Implement §9.8 endpoints: `/log`, `/at`, `:undo`, `:rebuild-from-log`. Unify audit log with operation log per §13.3.",
      complexity: "L",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:bump-spec-core-version",
    type: "spec:ImplementationChange",
    fields: {
      area: "src/fdpm/version.py + GET /version response",
      change:
        "Bump `spec_core` reported by `GET /version` from `\"1.0\"` to `\"1.1\"`. Surface `spec_core_revision` (e.g. `\"1.1.0\"`) as a separate field.",
      complexity: "XS",
      status: "not_started",
    },
  },
];

// ── §19 Migration Steps ────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  mig(1, "spec:mig:1", "Stand up Core boundaries", "Stand up Core boundaries (§4–§9, §11) with current built-ins still loaded the legacy way; ship `core:empty` profile.", []),
  mig(2, "spec:mig:2", "Stand up the plugin runtime", "Stand up the plugin runtime (companion SPEC) behind feature flag `FDPM_PLUGGABLE_V1`.", ["spec:mig:1"]),
  mig(3, "spec:mig:3", "Migrate first built-in (smallest LOC)", "Migrate one built-in (start with `software_architecture` — smallest LOC) end-to-end. Verify Core test suite still passes.", ["spec:mig:2"]),
  mig(4, "spec:mig:4", "Migrate remaining built-ins", "Migrate the remaining two built-ins.", ["spec:mig:3"]),
  mig(5, "spec:mig:5", "Move violating Core routes/engines", "Move the violating Core routes/engines into the relevant plugins. In the same PR: update `frontend/src/lib/api.ts` and the contract test.", ["spec:mig:4"]),
  mig(6, "spec:mig:6", "Flip pluggable flag default", "Flip the `FDPM_PLUGGABLE_V1` flag default to on.", ["spec:mig:5"]),
  mig(7, "spec:mig:7", "Adopt event sourcing (v1.1)", "The largest single piece of migration work: define `Operation` model, refactor every write handler, implement replay, remove direct projection mutation, unify audit + operation logs, land §9.8 endpoints, bump `spec_core` to `\"1.1\"`.", ["spec:mig:6"]),
  mig(8, "spec:mig:8", "Remove legacy register(store) shim", "Remove the legacy `register(store)` shim (companion SPEC §9.2) in the next minor.", ["spec:mig:7"]),
];

function mig(ord: number, id: string, label: string, action: string, depends_on: string[]): PrimitiveSpec {
  return {
    id,
    type: "spec:MigrationStep",
    fields: depends_on.length > 0
      ? { ordinal: ord, label, action, depends_on }
      : { ordinal: ord, label, action },
  };
}

// ── §18 Conformance Items ──────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  conf(1, "Operation log canonicality", "Append an operation; query `GET /workbooks/{id}/log`; assert the operation is present with monotone revision.", "Log returns the appended operation; revision strictly greater than previous max."),
  conf(2, "Replay determinism", "Replay each fixture log on two independent host instances; serialize each projection via `JSON.stringify`.", "Both projections are byte-equal."),
  conf(3, "Direct projection mutation forbidden", "AST-inspect `src/fdpm/api/**` and `src/fdpm/engine/**`; assert no direct mutation of `store.primitives`, `store.relations`, etc., outside `Store.append`.", "Zero direct mutations; CI guard fails the build on any."),
  conf(4, "Reserved-namespace inviolability", "Attempt to mount a plugin router on `/_admin/*`, `/_telemetry/*`, `/static/*`, and any §9.1 path.", "Verification gate rejects each attempt; plugin transitions to `quarantined`."),
  conf(5, "Zero-plugins baseline", "Run the SPA against a host with no plugins installed; exercise §10.2 bullets.", "Login, workbook list, workbook open against `core:empty`, default form/card/panel render, default print renderer produce output, plugin admin shows \"no plugins installed\"."),
];

function conf(ord: number, name: string, procedure: string, expected: string): PrimitiveSpec {
  return {
    id: `spec:conf:${String(ord).padStart(3, "0")}`,
    type: "spec:ConformanceItem",
    fields: { ordinal: ord, name, procedure, expected },
  };
}

// ── §24 Revision History ──────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  rev("spec:rev:1-3-0", "1.3.0", "2026-08-31", "The `workbook.update` operation kind",
    "A SPEC minor bump. §5.5.1's Operation kind set is closed and Core-owned, so adding to it is a minor bump by construction. Adds `workbook.update`, which renames a workbook or rewrites its description. Before 1.3 a workbook's `name` and `description` were write-once at `workbook.create`: every other mutable thing in the model was event-sourced, but these two were reachable only by deleting and recreating the workbook, which discards its log. The payload carries `workbook_id` plus at least one of `name` and `description`; an update naming neither is rejected at the §8 verification gate rather than appended as a no-op. `description: null` clears the field, distinguishing 'clear it' from 'leave it alone', which JSON cannot express with `undefined` alone. The inverse is a `workbook.update` restoring only the fields the target changed (§9.8.3). `profile_id` is deliberately NOT updatable: every primitive and relation in the workbook validates against that profile, so re-binding it would invalidate the projection without revalidating a single instance — that is a migration, not an edit. No change to the §7 validation pipeline (there is no instance to validate) or to the §9 endpoint contract beyond the new `PATCH /workbooks/{id}`.",
    ["0", "5.5.1", "9.1", "9.8.3", "24"], "minor"),
  rev("spec:rev:1-2-0", "1.2.0", "2026-05-04", "SPEC-DNIS adoption as a normative extension of §5",
    "A SPEC minor bump. Adopts SPEC-DNIS (docs/specs/SPEC-DNIS.md, the Document Node Identity Specification) as a normative integration profile inside §5 The Instance Model. New §5.6 'Document Node Identity — SPEC-DNIS adoption' defines: the built-in `profile:dnis:0.1` and its primitive types (`dnis:Document`, `dnis:Node`) and relation type (`dnis:DerivedFrom`); the MUST-implement mapping from SPEC-DNIS §7 Operations onto SPEC-CORE §5.5.1 op-log entries via shared `causation_op_id`; the SPEC-DNIS §8 OperationResult idempotency map projected from the op log (no parallel persistence surface); the lineage walk implemented as transitive `dnis:DerivedFrom` traversal with the on-primitive `derived_from` array as a denormalized read-path mirror; the Q2 schema-version migration story via SPEC-CORE §5.5.6 upcasters; conformance against SPEC-DNIS TV-1..TV-7 with the host adapter under test. SPEC-CORE 1.2 supersedes SPEC-DNIS §1.3's pre-v0.1.7 'MAY layer on top of SPEC-CORE' clause for FDPM-CLI hosts: integration is now MUST. No changes to the §5.5 event-sourcing core, §7 validation pipeline, §8 verification gate, or §9 platform endpoint contract — DNIS sits on top of those without modifying them.",
    ["0", "5.6", "24"], "minor"),
  rev("spec:rev:1-1-1", "1.1.1", "2026-05-04", "Final-pass cleanup",
    "Editorial revision; no normative invariant change. Closes a small batch of consistency bugs introduced by the 1.1.0 bump. §15.1 added four missing environment-variable declarations (`FDPM_MAX_FIELD_PATCH_OPS`, `FDPM_MAX_BATCH_OPS`, `FDPM_SNAPSHOT_EVERY_OPS`, `FDPM_LOG_PAGE_MAX`). §18 heading corrected from \"v1.0\" to \"v1.1\"; `core-versioning-001` updated to assert `spec_core` returns `\"1.1\"`.",
    ["0", "15.1", "18"], "patch"),
  rev("spec:rev:1-1-0", "1.1.0", "2026-05-04", "Event sourcing as canonical persistence model",
    "A real SPEC minor bump. Operator decision: adopt event sourcing now rather than retrofitting it. The state of every project is now defined as the deterministic projection of an immutable, append-only log of operations. The kind set is closed and Core-owned. Two new platform endpoints expose the consequences (`GET /projects/{id}/log`, `GET /projects/{id}/at`, `POST /projects/{id}:undo`, `POST /projects/{id}:rebuild-from-log`). §6 store rewritten as projection over the log; §13.3 audit unified with operation log.",
    ["0", "5.5", "6", "9.1", "9.8", "13.3", "17.2", "19.4", "20", "21"], "minor"),
  rev("spec:rev:1-0-4", "1.0.4", "2026-05-04", "Final-pass clarification",
    "Editorial revision; no normative invariant change. §9.7.5 transaction-semantics bullet on permissions expanded: each operation is checked under its per-resource permission. A caller missing any required permission causes the whole batch to be rejected with `category=permission` before any operation runs.",
    ["0", "9.7.5"], "editorial"),
  rev("spec:rev:1-0-3", "1.0.3", "2026-05-04", "Core graph operations (workbook-level)",
    "Substantively a SPEC minor bump. Adds two platform endpoints (`:split`, `:clone`) and one optional meta-model field (`PrimitiveTypeDef.is_partition_unit`). A draft also added `POST .../primitives:reorder` and `order_field`; both dropped because §9.7's `structure:reorder` covers the use case more thoughtfully via scope-membership permutation.",
    ["0", "4.1", "4.2", "5.4", "9.1", "17.1", "17.2", "18", "20"], "minor"),
  rev("spec:rev:1-0-2", "1.0.2", "2026-05-04", "No URL-compatibility window",
    "Operator decision: removed the deprecation-redirect mechanism for migrated routers. Pre-migration paths return 404 the moment the §19 move PR merges. The frontend and the contract test are updated in the same PR; the contract test is the merge gate.",
    ["9.6", "13.1", "18", "19.4", "19.5", "21", "23"], "minor"),
  rev("spec:rev:1-0-1", "1.0.1", "2026-05-04", "Review-pass fixes",
    "Editorial revision; no normative invariant change. Resolves issues raised in the SPEC pair-review of 1.0.0. Added `core:empty` profile (§1.5); reframed `project_state` as migration debt; added `FDPM_VALIDATOR_QUARANTINE_THRESHOLD`; added `FDPM_FINDING_EVIDENCE_MAX_BYTES`; reworded §8.1 validator-function row; added §9.6, §10.4, §17.4; added six new acceptance criteria.",
    ["0", "1.5", "6.1", "7.1", "7.2", "7.3", "8.1", "9.1", "9.6", "10.1", "10.2", "10.3", "10.4", "11.1", "12.2", "13.3", "15.1", "17.2", "17.4", "18", "19.4", "19.5", "22.2"], "editorial"),
];

function rev(id: string, version: string, date: string, title: string, notes: string, affected_sections: string[], kind: string): PrimitiveSpec {
  return {
    id,
    type: "spec:Revision",
    fields: { version, date, title, notes, affected_sections, kind },
  };
}

// ── §0..§N Sections (the document tree) ────────────────────────────────────
//
// Each Section carries a body_md that preserves the source document's
// content verbatim where the spec_authoring profile's typed primitives
// don't capture it (§4 meta-model, §5 instance model + event sourcing,
// §6 store, §7 validation pipeline, §8 verification gate, §9 platform
// endpoints, §13.3 audit projection, §14 security, §15 configuration,
// §16 error taxonomy, §17 extensibility boundary, §19 migration prose).
//
// Section.kind drives renderer auto-includes (e.g. kind="definitions"
// pulls spec:Term primitives via spec:Defines into the section's table).

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
        "This SPEC defines the **invariant Core** of FDPM: the set of contracts, models, services, and policies that exist regardless of which plugins are installed, including zero plugins.",
        "",
        "If a plugin can change it, it is **not** Core.",
        "If removing every plugin breaks it, it **is** Core.",
        "",
        "### 1.2 What this document does **not** define",
        "",
        "- Specific domain content (formal specifications, narratives, software architecture). These live in plugins; see `spec:fdpm:pluggable-architecture:1.0`.",
        "- The plugin runtime mechanics (manifest schema, lifecycle state machine, capability catalogue). Those are the *companion* of Core, not Core itself.",
        "- Persistence, multi-tenancy, sandboxing, or marketplace concerns. Each is its own future SPEC.",
        "",
        "### 1.3 Companion relationship",
        "",
        "The Core SPEC and the Pluggable-Architecture SPEC together define a closed system:",
        "",
        "```",
        "   ┌─────────────── Core (this SPEC) ───────────────┐",
        "   │  Meta-model · Instances · Store · Validation   │",
        "   │  Verification gate · Platform endpoints · UI   │",
        "   │  shell · Identity, versioning, observability   │",
        "   └─────────────────────┬───────────────────────────┘",
        "                         │  PluginContext (typed boundary)",
        "   ┌─────────────────────┴───────────────────────────┐",
        "   │  Plugin runtime (companion SPEC)                │",
        "   │  Manifests · Discovery · Lifecycle · Sandbox    │",
        "   └─────────────────────┬───────────────────────────┘",
        "                         │  Capabilities",
        "   ┌─────────────────────┴───────────────────────────┐",
        "   │  Plugins (formal-specification, narrative, …)   │",
        "   └─────────────────────────────────────────────────┘",
        "```",
        "",
        "Core never depends on a plugin. The plugin runtime depends on Core. Plugins depend on the runtime; their only contact with Core is the typed `PluginContext` and the platform endpoints.",
        "",
        "### 1.4 The one-sentence test for Core membership",
        "",
        "> Could a competent operator, starting from FDPM Core with **zero plugins installed**, create an empty workbook, define a custom profile via the API, instantiate primitives and relations, and run validations — without ever invoking domain-specific code?",
        "",
        "If yes, Core is correctly drawn. Every section below contributes to making the answer yes.",
        "",
        "### 1.5 The `core:empty` profile (zero-plugins seed)",
        "",
        "Core ships exactly one profile as Core content: `core:empty`. It declares no primitive types, no relation types, one default scope (`core:scope:doc`), and one default category (`core:category:general`). Its sole purpose is to make §10.2 baseline bullet 3 (\"a workbook with any registered profile can be opened\") satisfiable in a zero-plugins state.",
        "",
        "`core:empty` is **not** a domain. It contains no semantics. It exists so that the operator's first action — \"create a workbook\" — has a profile to attach to and so that integration tests of the shell are not blocked on a plugin install. Plugins MUST NOT depend on `core:empty`; profile authors MUST NOT extend it.",
      ].join("\n"),
    },
  },
  {
    id: "spec:sec:2",
    type: "spec:Section",
    fields: {
      number: "2",
      title: "Architectural Principles",
      kind: "principles",
      body_md:
        "These rank-ordered principles bind every Core decision and resolve conflicts. Each is testable; the renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:3",
    type: "spec:Section",
    fields: {
      number: "3",
      title: "Definitions",
      kind: "definitions",
      body_md: "",
    },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "The Meta-Model (Layer 1 of Core)",
      kind: "prose",
      body_md: [
        "The meta-model is the type system Core uses to describe domains. It is fixed by this SPEC. A change to the meta-model is a major Core SPEC bump.",
        "",
        "### 4.1 Constituent types",
        "",
        "All defined in `src/fdpm/models/core.py`. The following constructors are normative; their fields are SPEC-stable.",
        "",
        "| Type                  | Purpose                                                                                |",
        "| --------------------- | -------------------------------------------------------------------------------------- |",
        "| `DomainProfile`       | Top-level container. Holds categories, scopes, primitive types, relation types, validation rules, rendering rules, templates. |",
        "| `CategoryDef`         | A grouping label for primitive types within a profile.                                 |",
        "| `ScopeDef`            | A ranked containment context (e.g. \"specification\", \"method\", \"execution\").       |",
        "| `PrimitiveTypeDef`    | A typed node in a workbook graph. Has fields, ID-format rule, optional inline structs, optional `is_partition_unit` (§5.4.3). |",
        "| `RelationTypeDef`     | A typed edge with cardinality, source/target type IDs, optional fields.               |",
        "| `FieldDef`            | A typed field on a primitive or relation. Carries validations.                        |",
        "| `FieldValidation`     | A declarative constraint (`max_length`, `min_items`, `pattern`, …).                   |",
        "| `IDFormatRule`        | Pattern + uniqueness scope (`global`, `workbook`).                                     |",
        "| `InlineStructDef`     | A nested record type used as a field value.                                           |",
        "| `ValidationRuleDef`   | A profile-level rule referencing primitives or relations.                             |",
        "| `RendererBinding`     | A declared mapping from primitive types to renderer targets.                          |",
        "| `Cardinality`         | Enum: `one-to-one`, `one-to-many`, `many-to-many`, …                                  |",
        "| `ValidationLevel`     | Enum: `error`, `warning`, `info`.                                                      |",
        "",
        "### 4.2 Invariants the meta-model imposes",
        "",
        "- Every `PrimitiveTypeDef` has a globally unique `id` within its `DomainProfile`.",
        "- Every `RelationTypeDef` references `source_type_id` and `target_type_id` that exist in the same (or parent) profile.",
        "- Every `FieldDef` has a `name` unique within its containing primitive or struct.",
        "- Every `IDFormatRule.pattern` produces deterministic IDs from the field values it references.",
        "- Every `Enum[...]` field type's value list is closed and finite.",
        "- `PrimitiveTypeDef.is_partition_unit` defaults to `False`. When `True`, primitives of this type are eligible Section units in `POST /workbooks/{id}:split` (§5.4.3). The flag is purely declarative; the validation pipeline does not change behaviour based on it.",
        "",
        "### 4.3 Profile resolution",
        "",
        "The Core resolution function (`Store.get_resolved_profile`) merges a profile with its `extends` chain and:",
        "",
        "- Detects circular extension and raises `ValueError`.",
        "- Detects ID collisions across the chain and raises `ValueError`.",
        "- Returns a single, flattened, immutable `DomainProfile`.",
        "",
        "Resolution is Core. The data being resolved is content.",
        "",
        "### 4.4 What is **not** in the meta-model",
        "",
        "- Field types specific to a domain (e.g. \"tensor shape\", \"legal citation\"). These are encoded as `string` or `ConstrainedText` plus validation; the meta-model does not grow per-domain primitive kinds.",
        "- Workflow states, lifecycles, role assignments. Plugins encode these as primitive types or relations; Core has no opinion.",
        "- Rendering output formats. The renderer target is a string; Core does not enumerate \"PDF\", \"Markdown\", etc.",
      ].join("\n"),
    },
  },
];

// §5 — large body_md preserving §5.1–§5.5 verbatim. Sections referenced
// by short numeric IDs to keep the renderer's outline clean.

sections.push({
  id: "spec:sec:5",
  type: "spec:Section",
  fields: {
    number: "5",
    title: "The Instance Model (Layer 2 of Core)",
    kind: "prose",
    body_md: [
      "What a populated workbook looks like, independent of any profile.",
      "",
      "### 5.1 Constituent types",
      "",
      "| Type                  | Purpose                                                                                |",
      "| --------------------- | -------------------------------------------------------------------------------------- |",
      "| `Workbook`             | A named container holding instances of a chosen profile.                              |",
      "| `PrimitiveInstance`   | A populated primitive: `id`, `type_id`, `field_values`, optional `scope_id`.          |",
      "| `RelationInstance`    | A populated relation: `id`, `type_id`, `source_id`, `target_id`, optional fields.     |",
      "| `ProjectTemplate`     | A reusable bundle of pre-populated instances.                                         |",
      "| `TestSuite`           | A set of declarative checks runnable against a workbook.                               |",
      "| `SuiteRunReport`      | The result of executing a `TestSuite`.                                                |",
      "| `ProjectTransfer`     | The serialisable form of a workbook for import/export.                                  |",
      "",
      "### 5.2 Invariants the instance model imposes",
      "",
      "- Every `PrimitiveInstance.type_id` resolves to a `PrimitiveTypeDef` in the workbook's profile.",
      "- Every `RelationInstance` connects two `PrimitiveInstance`s whose types satisfy the `RelationTypeDef.source_type_id`/`target_type_id` constraint.",
      "- Every `PrimitiveInstance.id` is unique within the scope declared by its type's `IDFormatRule.uniqueness`.",
      "- Every required field on a primitive or relation is present at persistence time.",
      "- Every field value satisfies the field's declared `FieldValidation` list.",
      "",
      "### 5.3 What is **not** in the instance model",
      "",
      "- Domain semantics. A `PrimitiveInstance` of type `fs:Equation` is to Core just a typed record; the meaning of \"equation\" is plugin business.",
      "- Cross-workbook references. Instances are workbook-local. Cross-workbook federation is out of Core scope (future SPEC).",
      "",
      "### 5.4 Core graph operations — workbook-level",
      "",
      "Beyond per-primitive CRUD (§9.7) and structural reordering / reparenting (§9.7.7), two **workbook-level** operations are domain-neutral mutations on the workbook graph. Core owns them; plugins MUST NOT re-implement them. Each operation goes through the §7 validation pipeline for every primitive it touches and emits one or more audit records per §13.3.",
      "",
      "These operations are **additive in v1.0**: they extend the platform endpoint set (§9.1) with two new routes (`:split`, `:clone`) and one new optional meta-model field (`PrimitiveTypeDef.is_partition_unit`). Reordering primitives within a workbook is **not** in this section — that is §9.7.7's `structure:reorder`, which already covers the use case via scope-membership permutation.",
      "",
      "#### 5.4.1 Workbook split — `POST /workbooks/{id}:split`",
      "",
      "Splits one workbook into N workbooks along an explicit Section partition.",
      "",
      "**Request body** carries an ordered `partition` of ≥ 2 entries (each with `target_project_name`, optional `target_project_id`, and a list of Section primitive IDs), plus `cross_partition_relations: \"drop\"` (the only v1.0 value), plus optional `include_unassigned: \"first\" | \"last\" | \"none\"`.",
      "",
      "**Semantics:** validate the partition is total over the supplied Sections; compute primitive assignment by containing Section; for each entry atomically create a new workbook with the same `profile_id`, deep-copy assigned primitives; cross-partition relations are dropped (the response lists them); the source workbook is deleted on success; one `workbook.split` audit record on the source plus per-new-workbook `workbook.create` plus per-dropped `relation.drop`, all under the same `request_id`.",
      "",
      "**Atomicity:** all-or-nothing. If any partition entry fails its validation pipeline, Core rolls back: no new workbooks, source unchanged, 4xx response.",
      "",
      "**Refused inputs:** partition with < 2 entries → 400 `validation`; Section appearing in two entries → 400 `validation`; target workbook ID already exists → 409 `conflict`; `cross_partition_relations` other than `\"drop\"` → 400 `verification`; source workbook has no Sections → 400 `validation`.",
      "",
      "#### 5.4.2 Workbook clone — `POST /workbooks/{id}:clone`",
      "",
      "Deep-copies a workbook under a new ID/name. `target_project_id` is optional; if absent, Core derives `{source_id}-clone-{ulid}`.",
      "",
      "**Semantics:** new workbook gets a fresh ID; primitive and relation IDs are preserved verbatim (uniqueness scope is per-workbook). All primitives, relations, templates, and test suites are copied; suite-run reports are NOT copied. The validation pipeline runs against each copied primitive; if any fail, the clone is rolled back. One `workbook.create` audit record on the new workbook with `evidence: {cloned_from: source_id}`.",
      "",
      "**Refused inputs:** target workbook ID already exists → 409 `conflict`; source workbook does not exist → 404 `not_found`.",
      "",
      "Clone is **shallow with respect to plugin-owned state**: per-plugin configuration, custom validator caches, and any future `cap:storage`-backed state are NOT copied.",
      "",
      "#### 5.4.3 What counts as a Section — `is_partition_unit`",
      "",
      "Split partitions on Sections. The meta-model does not have a `Section` primitive type — domains define their own (`fs:Section`, `narrative:Chapter`, `arch:Component`, etc.). Core identifies Sections structurally: a primitive type qualifies as a partition unit for split if its `PrimitiveTypeDef.is_partition_unit` is `True`. The flag is optional, defaults to `False`, and is profile-authored.",
      "",
      "A profile MAY mark zero, one, or more primitive types as partition units; if zero, that profile's workbooks cannot be split. Core's `core:empty` profile has no partition units, which is correct: a workbook on `core:empty` has nothing meaningful to split along.",
      "",
      "#### 5.4.4 What plugins contribute to graph operations",
      "",
      "Plugins **do not** contribute graph-operation handlers. The two workbook-level operations (split, clone) and the structural editing operations (§9.7.7 `structure:reorder` / `structure:reparent`) are Core-implemented and Core-tested.",
      "",
      "In v1.1, plugins that need to react to a split/clone must poll the operation log (§5.5, unified with §13.3 audit log) — which requires `read:audit` permission per companion SPEC §5.2. This is intentionally awkward; the awkwardness is the signal that `cap:workbook-event` belongs in a future SPEC.",
      "",
      "### 5.5 Event sourcing — the canonical persistence model",
      "",
      "Starting in SPEC version 1.1, the state of every project is defined as the deterministic projection of an immutable, append-only log of **operations**. The log is the source of truth; the in-memory `primitives` / `relations` / `templates` / `test_suites` maps in §6 are derived **projections** maintained by replaying the log.",
      "",
      "This subsection is normative. It defines the operation set, the log's invariants, the replay function, snapshots, and upcasting. The §6 store, §9.7 editing API, and §13.3 audit log all become facets of this single underlying model.",
      "",
      "#### 5.5.1 Operations — the closed kind set",
      "",
      "An **operation** is a typed, immutable record describing one logical mutation. The set of operation kinds is **closed and Core-owned**. Plugins MUST NOT introduce new kinds; they may only emit operations of existing kinds (e.g. via `cap:transformer` per the companion SPEC). Adding a new kind is a Core SPEC minor bump.",
      "",
      "The v1.3 kind set: `workbook.create`, `workbook.update`, `workbook.delete`, `workbook.split`, `workbook.clone`, `primitive.create`, `primitive.replace`, `primitive.patch`, `primitive.field-patch`, `primitive.delete`, `relation.create`, `relation.replace`, `relation.patch`, `relation.field-patch`, `relation.delete`, `structure.reorder`, `structure.reparent`, `template.create` / `template.delete` / `template.apply`, `test_suite.create` / `test_suite.replace` / `test_suite.delete`, `transfer.import`. (`workbook.update` was added in 1.3.0; every other kind dates from the v1.1 set.)",
      "",
      "`SuiteRunReport` records are **not** operations. They are observations of workbook state at a point in time, written by the test runner; they are projected separately and are not replayed.",
      "",
      "Each `Operation` carries: `op_id` (ulid), optional `parent_op_id`, `kind`, `workbook_id`, kind-specific `payload`, `actor`, optional `plugin_id`, `timestamp`, monotonically-increasing `revision`, `request_id` (uuid v7), optional `causation_op_id`, and `schema_version`. Operations are **immutable after append**.",
      "",
      "#### 5.5.2 Operation payload schemas",
      "",
      "Every operation kind has a Pydantic payload model defined in `src/fdpm/models/operations.py`. The verification gate (§8) validates each operation's payload against its kind's schema before the operation is appended. A failed validation rejects the request with `category: verification`.",
      "",
      "Payload schemas are versioned via `Operation.schema_version`. **Tightening validation** — accepting an old payload at append time but failing it on later replay — is forbidden. If a SPEC change would invalidate already-logged operations, the operator MUST author a migration that emits compensating operations; Core does not silently rewrite history.",
      "",
      "#### 5.5.3 The replay function",
      "",
      "The replay function `replay(log: list[Operation]) -> StoreState` is **pure, deterministic, and Core-owned**. Given the same log it MUST produce byte-equal output every time. Plugins MUST NOT contribute alternative replay implementations. Two implementations of replay would be the worst kind of drift, since the log claims to be authoritative.",
      "",
      "Each operation's application MUST satisfy the §7 validation pipeline at append time. Replay assumes the pipeline already passed; replay does not re-run the pipeline. If the post-replay state were to violate an invariant, that is a Core bug, not a data problem.",
      "",
      "A property test (`core-eventsource-replay-001`) asserts that for any sequence of operations applied through the §9.7 editing API or §5.4 graph operations, replaying the resulting log from empty produces a state byte-equal to the directly-mutated state.",
      "",
      "#### 5.5.4 Revisions and ordering",
      "",
      "`Operation.revision` is a per-workbook monotonically-increasing integer. The first operation creating a workbook has `revision = 1`. Every subsequent operation targeting that workbook has `revision = previous_revision_for_this_project + 1`. The §9.7.6 `ETag` for `GET /workbooks/{id}` is the workbook's current revision; the `ETag` for an individual primitive/relation is the revision of the most recent operation that touched it.",
      "",
      "Ordering across workbooks is given by `op_id` (ulid). Within a workbook, ordering is given by `revision`. The two orderings agree on operations that share a `request_id`.",
      "",
      "#### 5.5.5 Snapshots",
      "",
      "Snapshots are a **performance optimisation, not a source of truth**. Core MAY persist a snapshot `state_at_revision_N` per workbook at configurable intervals (default: every `FDPM_SNAPSHOT_EVERY_OPS` operations, default 1000). On startup or on a fresh replay request, Core loads the most recent snapshot and replays only the tail operations after it.",
      "",
      "Invariants: a snapshot MUST be byte-equal to what `replay(log[:N])` would produce; replaying from `revision = 0` MUST produce the same final state as loading any snapshot and replaying the tail; a snapshot MAY be discarded at any time without loss of correctness.",
      "",
      "`POST /projects/{id}:rebuild-from-log` (operator-only, audit-logged) discards all snapshots for the project and rebuilds projection from the log alone.",
      "",
      "#### 5.5.6 Upcasting — schema evolution without log rewrites",
      "",
      "When a SPEC minor bump changes the payload schema of an operation kind, three rules apply: old logged operations are not rewritten (their `schema_version` continues to identify them as old-shape); the new payload schema gets a new `schema_version`; Core ships an **upcaster** — a pure function from `(old_version_payload) → new_version_payload` — that runs at replay time before the operation is applied.",
      "",
      "Upcasters MUST be **total** (every old-shape payload accepted at append time MUST successfully upcast), **faithful** (the upcasted payload MUST produce the same logical effect), and **composable** (when multiple SPEC bumps stack, upcasters chain in declared order).",
      "",
      "The verification gate (§8) checks at SPEC-bump release time that every old `schema_version` has a defined chain of upcasters reaching the current version.",
      "",
      "#### 5.5.7 Branching and \"what-if\" — explicitly out of scope",
      "",
      "A natural consequence of an event-sourced log is that branches are cheap. **Branching is out of scope for v1.1.** The log is single-trunk per workbook. The `:undo` mechanism (§9.8.2) appends inverse operations rather than rewinding the trunk; this preserves history and avoids the merge-conflict problem.",
      "",
      "#### 5.5.8 What plugins contribute, what they do not",
      "",
      "**Plugins MAY:** emit operations of any closed-set kind via `cap:transformer`; read the log via `read:audit`; contribute validators (`cap:validator`) that participate in the §7 pipeline.",
      "",
      "**Plugins MUST NOT:** define new operation kinds; contribute alternative replay implementations; contribute upcasters; mutate the projection directly — even Core handlers must go through append.",
      "",
      "**§5.6 — Document Node Identity (SPEC-DNIS adoption).** SPEC-CORE 1.2.0 normatively adopts SPEC-DNIS (`docs/specs/SPEC-DNIS.md`) as an extension of this Instance Model layer. The full integration profile — primitive registration, the DNIS Operation ↔ SPEC-CORE op-log mapping, OperationResult idempotency from the op log, lineage as typed relations, schema-version compatibility, conformance, and plugin boundaries — is rendered as the §5.6 sibling section that follows.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:5-6",
  type: "spec:Section",
  fields: {
    number: "5.6",
    title: "Document Node Identity — SPEC-DNIS adoption",
    kind: "prose",
    body_md: [
      "Starting in SPEC version 1.2, the Core normatively adopts **SPEC-DNIS** (`docs/specs/SPEC-DNIS.md`, the Document Node Identity Specification) as the contract for paragraph-grain identity within document-shaped primitives. SPEC-DNIS is a peer specification of SPEC-CORE; this section defines the integration that makes a DNIS Document a first-class SPEC-CORE primitive and a DNIS Operation a first-class SPEC-CORE op-log entry. Conformance is **MUST**: any FDPM-CLI host claiming SPEC-CORE 1.2 conformance MUST implement this section in full.",
      "",
      "The §1.3 \"MAY layer on top of SPEC-CORE\" clause that appeared in SPEC-DNIS through v0.1.6 is superseded by this section: for FDPM-CLI hosts the integration is normative, and the v0.1.x DNIS proposal line is interpreted under the binding established here. SPEC-DNIS readers should treat this section as the operative integration profile until SPEC-DNIS itself ships an aligned revision.",
      "",
      "#### 5.6.1 Profile registration",
      "",
      "An FDPM-CLI host claiming SPEC-CORE 1.2 conformance MUST register a built-in domain profile with id `profile:dnis:0.1` that contributes the following primitive and relation types:",
      "",
      "- `dnis:Document` — `PrimitiveTypeDef` whose `is_partition_unit` is `False`. Required fields: `created_at` (ISO-8601), `created_by` (AgentId string), `schema_version` (immutable string; the SPEC-DNIS revision the document was created under), `hash_algorithm` (immutable enum, `sha256` REQUIRED, `blake3` OPTIONAL), `nid_format` (enum: `ulid` | `uuidv7` | `uuidv4` | `nanoid`; the latter two are SPEC-DNIS §4.1 privacy carve-outs and forfeit time-sortability). Optional `metadata` record.",
      "- `dnis:Node` — `PrimitiveTypeDef`; required fields: `document_id`, `kind` (free-form string, e.g. `paragraph`, `section`), `content` (record, shape determined by `kind`), `content_hash` (in `algo:hex` form per SPEC-DNIS §9.1), `parent_node_id` (nullable), `position` (Position string per SPEC-DNIS §6), `derived_from` (immutable string array of NIDs — defense-in-depth mirror of the relation graph defined in §5.6.4), `created_by` (immutable AgentId), `created_at` (immutable ISO-8601), `revision` (monotonic int starting at 0), `last_edited_by`, `last_edited_at`, `last_operation_id`. Optional retirement fields `retired_at`, `retired_by`. The primitive's SPEC-CORE `uid` (per SPEC-UID) MUST equal the DNIS NID.",
      "- `dnis:DerivedFrom` — `RelationTypeDef`; `source_id` is the descendant `dnis:Node`, `target_id` is the ancestor `dnis:Node`. No fields. Created atomically with the descendant during `split` and `merge` Operations. This relation graph is the normative source for SPEC-DNIS §11.3 lineage walks.",
      "",
      "Profile registration is built-in (analogous to `core:empty`); no plugin contribution is involved. Hosts MUST NOT permit a plugin to register a primitive type whose id collides with `dnis:*`.",
      "",
      "#### 5.6.2 DNIS Operation ↔ SPEC-CORE op-log mapping",
      "",
      "Each SPEC-DNIS §7 Operation MUST be expressed atomically as one or more SPEC-CORE operations of the closed kinds defined in §5.5.1. The mapping is:",
      "",
      "| SPEC-DNIS Operation | SPEC-CORE op-log entries |",
      "| --- | --- |",
      "| `create` | one `primitive.create` of type `dnis:Node` |",
      "| `edit` | one `primitive.replace` of the target `dnis:Node` (full record; `id`, `uid`, `derived_from`, `created_by`, `created_at` preserved verbatim per SPEC-DNIS §7.2) |",
      "| `move` | one `primitive.replace` of the target `dnis:Node` updating only `parent_node_id`, `position`, `revision`, `last_edited_*`, `last_operation_id` (SPEC-DNIS §7.3 locality) |",
      "| `split` | one `primitive.replace` setting retirement on the target + N `primitive.create` of type `dnis:Node` + N `relation.create` of type `dnis:DerivedFrom` |",
      "| `merge` | M `primitive.replace` setting retirement on each target + one `primitive.create` of the merged `dnis:Node` + M `relation.create` of type `dnis:DerivedFrom` (in `targetNodeIds` order, preserving SPEC-DNIS §7.5 lineage ordering) |",
      "| `retire` | one `primitive.replace` setting `retired_at` and `retired_by` |",
      "| `compact` | N `primitive.replace` updating only `position`, holding `revision` and `last_edited_*` constant. Hosts MUST provide a position-only mutation path (a SPEC-CORE `primitive.field-patch` constrained to the `position` JSON pointer is the canonical implementation) so SPEC-DNIS §7.8 \"compact MUST NOT bump revision\" holds end-to-end. |",
      "",
      "All SPEC-CORE op-log entries comprising a single SPEC-DNIS Operation MUST share the same `causation_op_id` so the §5.5.3 replay function reconstitutes the DNIS Operation deterministically. The first entry's `op_id` IS the SPEC-DNIS `OperationId`.",
      "",
      "#### 5.6.3 OperationResult idempotency from the op log",
      "",
      "The SPEC-DNIS §8 `OperationId → OperationResult` idempotency map MUST be a deterministic projection of the SPEC-CORE op log (§5.5) — not a parallel persistence surface. Concretely: given a DNIS `OperationId` (= the lead SPEC-CORE `op_id`), the `OperationResult.affectedNodeIds` is the set of `dnis:Node` primitive ids touched by the entries sharing that `causation_op_id`; `OperationResult.newRevisions` is the per-node revision after the operation applied; `OperationResult.appliedAt` is the lead entry's server `timestamp`.",
      "",
      "On retry of the same `OperationId`, the host adapter MUST return the projected snapshot without re-appending any op-log entry, satisfying SPEC-DNIS §8.1 and §8.5. Payload-mismatch detection (SPEC-DNIS §8.4) is enforced by the adapter: when an incoming DNIS Operation reuses an existing `OperationId` with a different payload, the adapter MUST return the original `OperationResult` and MUST log the mismatch through the §13 observability surface. The §8.3 retention floor (7 days) is enforced by op-log retention; hosts MUST document the chosen retention period.",
      "",
      "#### 5.6.4 Lineage as typed relations",
      "",
      "The SPEC-DNIS §11 reference-resolution algorithm walks `derivedFrom` transitively. Under this profile that walk MUST be implemented over the `dnis:DerivedFrom` relation graph; the array on the `dnis:Node` primitive is a denormalized read-path mirror, not the source of truth. Where the array and the relation graph disagree, the relation graph wins and the disagreement is a §13 audit event.",
      "",
      "The five SPEC-DNIS §11.2 outcomes (`active`, `retired`, `evolved-via-lineage`, `purged`, `not-found`) MUST be computed from: (a) primitive existence and `retired_at` field for `active`/`retired`/`not-found`; (b) outgoing `dnis:DerivedFrom` traversal from the queried NID for `evolved-via-lineage`; (c) tombstone primitive (id retained, `content` nulled, a `purged: true` field set) for `purged`. The §14.2 right-to-erasure purge path is implemented via SPEC-CORE `primitive.replace` setting the tombstone shape — never via `primitive.delete`, which would break SPEC-DNIS §3 invariant 5.",
      "",
      "#### 5.6.5 schemaVersion compatibility (resolves SPEC-DNIS Appendix A Q2)",
      "",
      "The `schema_version` field on `dnis:Document` is `readonly` per SPEC-DNIS §5.2. To migrate a Document forward across DNIS revisions, a host MUST: (a) issue a SPEC-CORE upcaster (§5.5.6) that creates a new `dnis:Document` primitive at the target version with a fresh DocumentId; (b) re-anchor every existing `dnis:Node` to the new document via `move` Operations; (c) record an explicit `dnis:MigratedFrom` relation between the new and old document primitives. Mixed-version interactions across primitives within a single Document are forbidden and MUST be rejected at the §7 validation pipeline.",
      "",
      "#### 5.6.6 Conformance",
      "",
      "A host claims §5.6 conformance by demonstrating that SPEC-DNIS test vectors TV-1 through TV-7 (SPEC-DNIS §16) pass against a real SPEC-CORE Host instance with `profile:dnis:0.1` activated, where the test fixture instantiates DNIS Operations through the host adapter rather than against an in-memory store directly. TV-7 (introduced by SPEC-DNIS to close the §10.1.2 merge-rejection evidence-shape gap) requires the adapter to surface the per-target current revision array, in `targetNodeIds` order, on stale `merge` rejection.",
      "",
      "The adapter test surface is `fdpm-cli/tests/dnis-host-adapter.test.ts`; the adapter implementation surface is `fdpm-cli/src/core/dnis/`. Neither file is normative on its own; both are reference fixtures for §5.6. A host MAY ship its own adapter and MUST then ship its own equivalent test surface.",
      "",
      "#### 5.6.7 What plugins contribute, what they do not",
      "",
      "**Plugins MAY:** declare primitives whose `kind` field aligns with DNIS Node kinds (so that paragraph-grain editors can target them through the DNIS surface); read DNIS Documents and Nodes via the standard primitive read paths; emit DNIS Operations via `cap:transformer` where the transformer payload maps onto the §5.6.2 op-log entries.",
      "",
      "**Plugins MUST NOT:** register primitive types whose ids collide with `dnis:*`; contribute alternative DNIS adapters; contribute alternative reference resolvers; bypass the host adapter to write `dnis:*` primitives directly.",
    ].join("\n"),
  },
});

// §6 store + §7 validation + §8 gate — combined section
sections.push({
  id: "spec:sec:6",
  type: "spec:Section",
  fields: {
    number: "6",
    title: "The Store (Layer 3 of Core)",
    kind: "prose",
    body_md: [
      "### 6.1 Role — projection over the operation log",
      "",
      "The store is the **derived projection** of the operation log (§5.5) into in-memory maps for fast read access. It is not a primary record; it can be discarded and rebuilt from the log at any time.",
      "",
      "The projection holds: `profiles`, `operation_log` (the canonical record, append-only), `projects`, `primitives`, `relations`, `templates`, `test_suites`, `suite_runs` (observation records, written directly by the test runner), and `snapshots` (performance optimisation per §5.5.5; not authoritative).",
      "",
      "The log is Core. Profile content (which plugins ship) and operation content (which users and plugins emit) are not.",
      "",
      "The legacy `project_state` ad-hoc bag from earlier code is removed by v1.1 — its consumers have been migrated to typed primitives/relations or to plugin-owned stores.",
      "",
      "### 6.2 Access discipline (SPEC requirement)",
      "",
      "- Plugins MUST NOT import `from fdpm.store import store`. The grep across `src/fdpm/plugins/**` for that import MUST return zero results.",
      "- The **only write path** to the projection is through the operation-log append. Even Core handlers MUST construct an `Operation` and call `Store.append(op)`; direct mutation of the projection maps is forbidden.",
      "- Read access for plugins flows through `PluginContext.list_*` / `PluginContext.get_*` methods.",
      "- Read access to the log itself is permission-gated (`read:audit`).",
      "",
      "### 6.3 Concurrency and append semantics",
      "",
      "The store is thread-safe under the `RLock` it owns. The log is the serialisation point: `Store.append(op)` acquires the lock, runs the §7 validation pipeline against the proposed post-application state, assigns `revision`, sets `timestamp`, appends to the log, and applies the operation to the projection — all under one lock. Either all of it happens or none of it does.",
      "",
      "Optimistic concurrency control (§9.7.6) compares the caller's `If-Match` / `expected_revision` against the workbook's current revision *before* acquiring the append lock; mismatches yield 412 without log mutation.",
      "",
      "### 6.4 Persistence",
      "",
      "The log is in-memory in v1.1, but its **shape is fixed**: `Operation` model, payload schemas, ordering, and replay semantics are all SPEC-locked here. A future Core SPEC minor (`SPEC-CORE-PERSISTENCE`) will add a write-ahead-log file format and snapshot persistence.",
      "",
      "Restart in v1.1 still loses workbook content. Profile registration via plugin `activate()` is unaffected because profiles are not in the log.",
      "",
      "### 6.5 Replay on demand",
      "",
      "`Store.rebuild_from_log(project_id)` discards the projection for one project and replays its log from `revision = 0` (or from the most recent snapshot). Exposed via `POST /projects/{id}:rebuild-from-log` (operator-only, audit-logged).",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:7",
  type: "spec:Section",
  fields: {
    number: "7",
    title: "The Validation Pipeline (Layer 4 of Core)",
    kind: "prose",
    body_md: [
      "### 7.1 Pipeline invariants",
      "",
      "When a `PrimitiveInstance` or `RelationInstance` is created or updated through the Core API, the following sequence is mandatory and Core-owned:",
      "",
      "1. **Type resolution.** Look up the corresponding `PrimitiveTypeDef`/`RelationTypeDef`. Missing type → 400.",
      "2. **ID format check.** Verify `IDFormatRule.pattern` is satisfied. Violation → 400.",
      "3. **Required-field check.** Every `FieldDef.required=True` is present. Violation → 400.",
      "4. **Per-field validation.** Each `FieldValidation` is evaluated. Violations are collected.",
      "5. **Profile-level rule evaluation.** Each applicable `ValidationRuleDef` is evaluated.",
      "6. **Custom-validator dispatch.** Any plugin-contributed validator (`cap:validator`) is called inside the host's exception barrier. Validators are *expected* to return a `ValidationResult`; if a validator raises, the barrier converts the exception to a synthetic `ValidationFinding` with `level=\"error\"`, `rule_id=f\"plugin-validator-raised:{validator_name}\"`, and `evidence` carrying the exception type and a bounded traceback string. The host does not propagate the exception. The owning plugin is moved to `quarantined` if the same validator raises N consecutive times (`FDPM_VALIDATOR_QUARANTINE_THRESHOLD`, default 3).",
      "7. **Aggregation.** The pipeline returns a `ValidationReport` containing all `error`/`warning`/`info` findings.",
      "",
      "### 7.2 What plugins contribute and what they do not",
      "",
      "- Plugins contribute **validators** via `cap:validator`. The act of registering a validator is unprivileged in v1.0 (no `permissions` entry gates it), because a validator that emits findings is purely additive — it cannot mutate state. A validator that raises is contained per §7.1 step 6.",
      "- Plugins do **not** contribute the act of validating, the order of steps, the report shape, or the decision to reject on `error`-level findings.",
      "",
      "Skipping the pipeline is impossible from outside Core; Core API handlers do not expose a write path that bypasses it.",
      "",
      "### 7.3 ValidationReport schema",
      "",
      "```python",
      "class ValidationFinding(BaseModel):",
      "    level: Literal[\"error\", \"warning\", \"info\"]",
      "    rule_id: str           # validator name or built-in rule id",
      "    target_id: str         # primitive or relation id",
      "    field_path: str | None # e.g. \"fields.title\" or None for primitive-level",
      "    message: str",
      "    evidence: dict | None  # structured detail; bounded by FDPM_FINDING_EVIDENCE_MAX_BYTES (default 16 KiB)",
      "",
      "class ValidationReport(BaseModel):",
      "    target_id: str",
      "    findings: list[ValidationFinding]",
      "    accepted: bool         # True iff no level==\"error\" findings",
      "```",
      "",
      "This shape is Core; plugins emit findings, they do not invent the report.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:8",
  type: "spec:Section",
  fields: {
    number: "8",
    title: "The Verification Gate (Layer 5 of Core)",
    kind: "prose",
    body_md: [
      "The gate enforces PALS's LAW at every external boundary. It is broader than the validation pipeline (§7), which only concerns Workbook instances; the gate covers every kind of artefact entering Core.",
      "",
      "### 8.1 What the gate covers",
      "",
      "| Boundary                                  | Verification rule                                                                                  |",
      "| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |",
      "| Inbound HTTP request body                 | Pydantic model construction; size bound (`FDPM_MAX_REQUEST_BYTES`).                                |",
      "| Plugin manifest                           | JSON Schema validation (companion SPEC §5.1).                                                      |",
      "| Plugin-contributed `DomainProfile`        | Pydantic construction; ID-collision check vs already-registered profiles.                          |",
      "| Plugin-contributed validator function     | Conforms to `ValidatorFn` `Protocol` at registration time. The \"never raises\" property is enforced at runtime by the §7.1 step-6 exception barrier. |",
      "| Plugin-contributed renderer output        | MIME type matches declared target; size below `FDPM_MAX_RENDER_BYTES`; UTF-8 if textual.           |",
      "| Plugin-contributed router                 | Empty prefix; no overlap with reserved namespaces (§9.4).                                          |",
      "| Plugin-contributed transformer output     | Result satisfies destination primitive type's schema (re-runs §7).                                 |",
      "| Plugin-contributed importer/exporter      | Round-trip property test on a Core-supplied synthetic workbook at install time.                    |",
      "| Inbound `ProjectTransfer`                 | Schema validation; profile compatibility check; per-instance §7 pipeline.                          |",
      "| Outbound response                         | Pydantic serialisation; no leak of internal types.                                                 |",
      "",
      "### 8.2 Failure semantics",
      "",
      "A gate failure produces a typed `FDPMException` with a `category` enum value and is mapped to a 4xx/5xx response by the central error handler. A plugin contribution that fails the gate transitions the plugin to `quarantined` (companion SPEC §6.4) without affecting Core.",
      "",
      "### 8.3 The gate is non-bypassable",
      "",
      "No Core handler exposes a write path that skips the gate. No plugin permission grants gate-bypass. Operator override exists only for `quarantine-clear` (companion SPEC §6.6) and is audit-logged.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:9",
  type: "spec:Section",
  fields: {
    number: "9",
    title: "The Platform Endpoint Contract (Layer 6 of Core)",
    kind: "prose",
    body_md: [
      "### 9.1 Reserved Core endpoints",
      "",
      "These routes are Core-owned and immutable across SPEC minor versions. Plugins MUST NOT mount on these paths and Core MUST refuse any attempt to do so.",
      "",
      "| Method | Path                                              | Concern                                    |",
      "| ------ | ------------------------------------------------- | ------------------------------------------ |",
      "| GET    | `/profiles`                                       | List registered profiles                   |",
      "| GET    | `/profiles/{id}`                                  | Resolved profile                           |",
      "| GET    | `/profiles/{id}/raw`                              | Raw (unresolved) profile                   |",
      "| POST   | `/workbooks`                                       | Create workbook                             |",
      "| GET    | `/workbooks`                                       | List workbooks                              |",
      "| GET    | `/workbooks/{id}`                                  | Workbook metadata                           |",
      "| DELETE | `/workbooks/{id}`                                  | Delete workbook                             |",
      "| POST   | `/workbooks/{id}:split`                            | Split workbook along a Section partition (§5.4.1). Destructive: source is deleted. |",
      "| POST   | `/workbooks/{id}:clone`                            | Deep-copy workbook under a new ID (§5.4.2). |",
      "| GET    | `/workbooks/{id}/primitives`                       | List primitives                            |",
      "| POST   | `/workbooks/{id}/primitives`                       | Create primitive (passes through §7)       |",
      "| GET    | `/workbooks/{id}/primitives/{pid}`                 | Read primitive                             |",
      "| PATCH  | `/workbooks/{id}/primitives/{pid}`                 | Update primitive (whole-record or `:field-patch`) |",
      "| DELETE | `/workbooks/{id}/primitives/{pid}`                 | Delete primitive                           |",
      "| (relations: same shape under `/relations/...`)    |                                                                            |",
      "| POST   | `/workbooks/{id}/edits`                            | Batch transactional edits (§9.7.5).        |",
      "| POST   | `/workbooks/{id}/structure:reorder`                | Reorder children within a `ScopeDef` (§9.7.7).      |",
      "| POST   | `/workbooks/{id}/structure:reparent`               | Move a primitive between scopes within the same workbook (§9.7.7). |",
      "| GET    | `/workbooks/{id}/views/{view_id}`                  | Read a Core-defined view                   |",
      "| GET    | `/workbooks/{id}/templates`                        | List templates                             |",
      "| POST   | `/workbooks/{id}/templates`                        | Apply template                             |",
      "| GET    | `/workbooks/{id}/test-suites`                      | List test suites                           |",
      "| POST   | `/workbooks/{id}/test-suites/{sid}:run`            | Execute suite                              |",
      "| POST   | `/transfer/import`                                | Import a `ProjectTransfer`                 |",
      "| GET    | `/workbooks/{id}/transfer/export`                  | Export a `ProjectTransfer`                 |",
      "| GET    | `/workbooks/{id}/log`                              | Read the operation log for a workbook (§5.5, §9.8.1). Permission-gated by `read:audit`. |",
      "| GET    | `/workbooks/{id}/at`                               | Time-travel: workbook state as of a given revision (§9.8.2). |",
      "| POST   | `/workbooks/{id}:undo`                             | Append an inverse operation (§9.8.3).      |",
      "| POST   | `/projects/{id}:rebuild-from-log`                 | Operator-only: discard projection, replay from log (§5.5.5, §6.5). |",
      "| GET    | `/plugins`                                        | Plugin admin (companion SPEC §6.6)         |",
      "| GET    | `/plugins/{id}`                                   | Plugin record                              |",
      "| POST   | `/plugins/{id}:enable` / `:disable` / `:reload`   | Plugin lifecycle ops                       |",
      "| ANY    | `/plugins/{id}/<plugin-defined-path>`             | Delegated to the plugin's `cap:route` mount, subject to §9.3/§9.4 reservations. |",
      "| GET    | `/healthz`                                        | Liveness probe                             |",
      "| GET    | `/readyz`                                         | Readiness probe                            |",
      "| GET    | `/version`                                        | Core SPEC version, host version            |",
      "",
      "### 9.2 Plugin namespace",
      "",
      "`/plugins/{plugin_id}/...` is the **only** path under which plugin-contributed routes mount. The plugin's `APIRouter` MUST have an empty prefix; Core imposes the namespace.",
      "",
      "### 9.3 Reserved sub-namespaces under the plugin namespace",
      "",
      "These are Core-owned even though they live under a plugin's prefix:",
      "",
      "- `/plugins/{plugin_id}/_admin/*`",
      "- `/plugins/{plugin_id}/_telemetry/*`",
      "- `/plugins/{plugin_id}/static/*` (frontend asset serving)",
      "",
      "A plugin's router MUST NOT define routes matching these patterns; the verification gate rejects them.",
      "",
      "### 9.4 Forbidden plugin paths",
      "",
      "A plugin's router MUST NOT define a route whose effective path:",
      "",
      "- Equals or prefixes any path in §9.1.",
      "- Falls within any reserved sub-namespace (§9.3).",
      "- Uses the literal prefix `/_` at any path component.",
      "",
      "### 9.5 Stability guarantees",
      "",
      "- Adding a new route to §9.1 is a Core SPEC minor bump.",
      "- Removing or breaking a route is a Core SPEC major bump.",
      "- Response shapes for §9.1 routes are Pydantic models in `src/fdpm/models/api_contracts.py` and are part of the Core SPEC surface.",
      "",
      "### 9.6 No URL-compatibility window for migrated routers",
      "",
      "The pre-migration routers (`narrative`, `spec_parser`, `export_pdf`) move to `/plugins/{owner}/...` as part of §19. **No deprecation redirects, no shims, no grace period.** Pre-migration paths are removed in the same release that performs the move; clients update or break.",
      "",
      "Rationale (operator decision): FDPM is pre-1.0 in user-facing terms; no third-party client base exists; the frontend is in-tree and updates in the same PR. A compatibility window would carry permanent maintenance cost for zero external benefit. CLAUDE.md Rule 8 (\"no half-finished implementations, no backwards-compatibility hacks\") applies.",
      "",
      "In-tree consumers — `frontend/src/lib/api.ts` and `tests/test_frontend_api_contract.py::FRONTEND_ROUTES` — MUST be updated in the same PR that performs each router move (§19.5).",
      "",
      "### 9.7 Document editing API (Core)",
      "",
      "A \"document\" in FDPM is not a blob — it is a typed graph of `PrimitiveInstance` and `RelationInstance` records belonging to a `Workbook`. **Editing a document = mutating that graph.** This subsection specifies the editing verbs Core owns. Plugins extend the *types* edited through this API; they do not extend the API itself.",
      "",
      "#### 9.7.1 Operating principles",
      "",
      "1. **Edits are typed.** Every edit names the primitive type or relation type whose schema governs it.",
      "2. **Edits are validated.** Every successful edit has passed §7 in full. There is no \"draft-bypass\" mode.",
      "3. **Edits are atomic per request.** Either the request succeeds and the store reflects exactly the requested mutation, or the store is unchanged.",
      "4. **Edits are auditable.** Every successful edit produces an audit record (§13.3) with a structured `diff`.",
      "5. **Edits are concurrency-safe.** The store lock (§6.3) serialises mutations. Optimistic concurrency control is exposed via `ETag` / `If-Match` (see §9.7.6).",
      "6. **Edits are framed in JSON.** Core specifies one wire shape; binary payloads (images, attachments) are out of scope for v1.0.",
      "7. **Edits never cross workbooks.** A single request mutates at most one workbook. Cross-workbook moves are a future SPEC.",
      "",
      "#### 9.7.2 Edit verbs",
      "",
      "Four editing surfaces, all Core, none delegable to plugins: **whole-record** (`PUT`/`PATCH`), **field-level** (`PATCH .../:field-patch`), **batch** (`POST .../edits`), **structural** (`POST .../structure:reorder` / `:reparent`).",
      "",
      "#### 9.7.3 Whole-record edits",
      "",
      "`PUT` replaces the primitive's `field_values`; required fields MUST be present; pipeline §7 runs. `PATCH` is partial update; absent fields are unchanged; pipeline §7 runs against the merged record. `type_id` MUST NOT change in a `PATCH`. A `PUT` that supplies a different `type_id` than the stored record is rejected with `409 conflict`. Relations follow the same shape under `/relations/{id}`, with `source_id`, `target_id`, `type_id` immutable per §9.7.7.",
      "",
      "#### 9.7.4 Field-level edits (JSON-patch-style)",
      "",
      "Constrained subset of RFC 6902. Allowed operations: `add`, `remove`, `replace`, `move`, `copy`. **`test` is allowed but does not commit; it is a precondition check.** Path syntax follows RFC 6901 against the `field_values` document.",
      "",
      "Constraints: operations applied in order; if any fails, none commit; post-application document MUST satisfy §7 in full; `expected_revision` (optional) gates on optimistic concurrency; total operation count MUST NOT exceed `FDPM_MAX_FIELD_PATCH_OPS` (default 100); total request body MUST NOT exceed `FDPM_MAX_REQUEST_BYTES`.",
      "",
      "The verification gate rejects: `op` values outside the allowed set; `path` strings that escape `field_values`; operations targeting Core-immutable fields (`id`, `type_id`).",
      "",
      "#### 9.7.5 Batch edits (transaction)",
      "",
      "`POST /workbooks/{pid}/edits` applies an ordered list of edit operations as a single transaction. Operation kinds (Core-fixed; not extensible by plugins): `primitive.create`, `primitive.replace`, `primitive.patch`, `primitive.field-patch`, `primitive.delete`, `relation.*` mirrors, `structure.reorder`, `structure.reparent`.",
      "",
      "Transaction semantics: applied in declared order under a single store-lock acquisition; if any operation fails any check, **all** prior operations are rolled back. **Per-operation permission check.** The batch endpoint requires only authentication; each operation is checked under its per-resource permission (`primitive.*` → `write:primitives`, `relation.*` → `write:relations`, `structure.*` → `write:workbooks`). A caller missing any required permission causes the whole batch to be rejected with `category=permission` before any operation runs (no partial application). Total operation count MUST NOT exceed `FDPM_MAX_BATCH_OPS` (default 500). The §7 pipeline runs after each operation; `error`-level findings abort the batch. `expected_project_revision` (optional) provides workbook-level optimistic concurrency.",
      "",
      "#### 9.7.6 Concurrency: revisions, ETags, If-Match",
      "",
      "Every `PrimitiveInstance` and `RelationInstance` carries an integer `revision` that increments on every successful mutation. Every `Workbook` carries a `project_revision`. `GET` responses for individual records emit `ETag: \"{revision}\"`; `GET` for `/workbooks/{id}` emits `ETag: \"{project_revision}\"`. `PUT`, `PATCH`, `DELETE` MAY supply `If-Match`; mismatch yields `412`. Batch requests MAY supply `expected_project_revision`. Field-patch requests MAY supply `expected_revision` in the body or `If-Match` header (header wins). Core does not perform automatic merge resolution in v1.0.",
      "",
      "#### 9.7.7 Immutability and structural edits",
      "",
      "Some fields are **immutable post-creation**: `PrimitiveInstance.id`, `PrimitiveInstance.type_id`, `RelationInstance.id`, `RelationInstance.type_id`, `RelationInstance.source_id`, `RelationInstance.target_id`, `Workbook.profile_id`. Mutating them requires delete-and-recreate.",
      "",
      "Structural edits (re-ordering, re-parenting within the same workbook) **are** allowed via `POST /workbooks/{pid}/structure:reorder` (reorders children within one `ScopeDef`) and `POST /workbooks/{pid}/structure:reparent` (moves a primitive between scopes). Reorderings MUST be permutations of the current scope membership; reparenting MUST respect any `RelationTypeDef`-imposed scope constraints.",
      "",
      "#### 9.7.8 Default forms drive edits",
      "",
      "The Core frontend shell builds default primitive forms entirely from `FieldDef` metadata. Every field type the meta-model permits MUST round-trip through the default form to one of the four edit surfaces above. This is acceptance criterion `core-edit-001`.",
      "",
      "#### 9.7.9 What plugins MAY contribute around editing",
      "",
      "- A `cap:validator` that runs as part of step 6 of §7.",
      "- A `cap:transformer` that maps one primitive type to another via `POST /plugins/{plugin_id}/transformers/{name}`.",
      "- A `cap:ui:primitive-form` that surfaces a richer editing experience for a specific `primitive_type_id`.",
      "",
      "#### 9.7.10 What plugins MUST NOT contribute around editing",
      "",
      "- A new edit verb (e.g. \"merge\", \"branch\"). New verbs are Core SPEC minor bumps.",
      "- A path that mutates store state outside `/plugins/{plugin_id}/...`.",
      "- A \"draft\" or \"skip-validation\" mode. There is none. §7 always runs.",
      "- An out-of-band write to the store. §6.2 access discipline forbids it.",
      "",
      "### 9.8 Time-travel and undo (event-sourced API)",
      "",
      "Three endpoints expose the consequences of §5.5's event-sourced persistence model. None of these is feasible without the log; all become natural once the log exists.",
      "",
      "#### 9.8.1 `GET /workbooks/{id}/log`",
      "",
      "Returns the operation log for a workbook, optionally filtered by `from_revision`, `to_revision`, `kind` (comma-separated), `actor`, `plugin_id`, `request_id`, `limit` (default 1000, cap `FDPM_LOG_PAGE_MAX` = 10 000). Response is a list of `Operation` records ordered by `revision`. Permission: `read:audit`. This endpoint is the unification of \"audit log\" and \"operation log.\"",
      "",
      "#### 9.8.2 `GET /workbooks/{id}/at?revision=N`",
      "",
      "Returns the project state as of operation `N` — i.e. the projection that `replay(log[:N+1])` would produce. Same response shape as `GET /projects/{id}` plus the embedded primitives/relations.",
      "",
      "Performance: Core uses the nearest snapshot ≤ N (§5.5.5) and replays forward.",
      "",
      "Caveat: time-travel returns historical state, but **not historical profile schema**. If a SPEC bump changed payload schemas, upcasters (§5.5.6) run during the replay so the returned state uses today's schema.",
      "",
      "#### 9.8.3 `POST /workbooks/{id}:undo`",
      "",
      "Appends an inverse operation that undoes the effect of a target operation. The target defaults to \"the most recent operation in the workbook\"; an optional body specifies a different one (`{ \"target_op_id\": \"01HV...\" }`).",
      "",
      "Semantics: Core reads the target operation; computes the **inverse** (kind-specific, see §9.8.4); appends the inverse with `causation_op_id = target_op_id`; the original target operation **remains in the log** (undo is forward motion, not history rewriting); re-undoing the inverse is `:undo` on the inverse — yielding a new op that re-applies the original effect.",
      "",
      "If the target operation cannot be cleanly inverted given the current state, Core returns 409 `conflict` with a structured explanation. Forced rebase is out of scope.",
      "",
      "#### 9.8.4 Inverse computation per kind",
      "",
      "| Kind                     | Inverse                                                                                            |",
      "| ------------------------ | -------------------------------------------------------------------------------------------------- |",
      "| `primitive.create`       | `primitive.delete` of the created id.                                                              |",
      "| `primitive.delete`       | `primitive.create` reconstructing pre-delete state from the log.                                   |",
      "| `primitive.replace`      | `primitive.replace` to the prior `field_values`.                                                   |",
      "| `primitive.patch`        | `primitive.patch` to the prior values of the patched fields.                                       |",
      "| `primitive.field-patch`  | `primitive.field-patch` whose ops are the inverses of the originals (RFC 6902 inverse rules).      |",
      "| `relation.*`             | Symmetric to `primitive.*`.                                                                        |",
      "| `structure.reorder`      | `structure.reorder` with the prior ordering.                                                       |",
      "| `structure.reparent`     | `structure.reparent` with `from`/`to` swapped.                                                     |",
      "| `workbook.create`         | `workbook.delete`. (Undoing creation deletes the workbook.)                                           |",
      "| `workbook.update`         | `workbook.update` restoring the prior values of exactly the fields the target changed, so undoing a rename leaves a later description edit intact. A description absent before the target is restored by clearing it. |",
      "| `workbook.delete`         | `workbook.create` + bulk replay; rejected with 409 if another workbook's `workbook.split` consumed this workbook's ID. |",
      "| `workbook.split`          | A single inverse that recreates the source and deletes the partition workbooks. Rejected if any partition workbook has been mutated since the split. |",
      "| `workbook.clone`          | `workbook.delete` of the clone.                                                                     |",
      "| `template.*`             | Symmetric.                                                                                         |",
      "| `transfer.import`        | A bulk inverse equivalent to `workbook.delete` of the imported workbook.                             |",
      "",
      "Multi-target undo is not a distinct endpoint; the caller issues `:undo` repeatedly. Each undo is a separate operation in the log, individually re-undoable.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:10",
  type: "spec:Section",
  fields: {
    number: "10",
    title: "The Frontend Shell (Layer 7 of Core)",
    kind: "prose",
    body_md: [
      "The frontend has a Core just as the backend does. Without it, the SPA cannot exist.",
      "",
      "### 10.1 What the shell provides",
      "",
      "- Application bootstrap (`App.tsx`, `routes.test.tsx` covered baseline routing).",
      "- Auth flow (API key entry, session, `protected-route.tsx`, `auth-guard.tsx`).",
      "- Workbook listing, creation, deletion, navigation.",
      "- The Explorer skeleton: header, layout, document outline, section blocks.",
      "- A **default** primitive form, primitive card, and explorer panel that work for any `PrimitiveTypeDef` using only field metadata from the meta-model.",
      "- A **default** print/preview renderer (HTML→browser-print) keyed off the same `FieldDef` metadata; produces a generic typeset output for any profile. Used as the zero-plugins fallback for \"Export PDF\" / Ctrl+P.",
      "- The slot machinery (`PrimitiveFormSlot`, `PrimitiveCardSlot`, `ExplorerPanelSlot`, `RendererPreviewSlot`, …). Slots are Core; their content is plugin-supplied or default.",
      "- The plugin registry, loader, and scoped API client (companion SPEC §7).",
      "- Theme baseline (light/dark/print) and i18n baseline (en-US, pt-BR).",
      "- Error boundaries that isolate plugin render failures from the surrounding tree.",
      "",
      "### 10.2 The \"zero plugins installed\" baseline",
      "",
      "The shell MUST render and remain useful with no plugins installed: login works; workbook list works; a workbook attached to `core:empty` (§1.5) or any other registered profile can be opened; for every primitive type in the active profile, the default form, card, and explorer panel render and accept input; validation findings render; import/export of `ProjectTransfer` works; the default print/preview renderer produces an output for any workbook; the plugin admin page works and shows \"no plugins installed\".",
      "",
      "This is acceptance criterion `core-fe-baseline-001`.",
      "",
      "### 10.3 What the shell does **not** provide",
      "",
      "- Domain-specific forms, cards, or panels.",
      "- Domain-specific renderers (PDF, Markdown, DOCX) beyond the generic default of §10.1.",
      "- Domain-specific menu actions or routes.",
      "- Theme variants beyond the three baselines.",
      "",
      "### 10.4 Plugin first-paint budget",
      "",
      "Frontend plugins are loaded asynchronously after the shell paints. A plugin bundle that delays the shell's first interactive paint past `FDPM_FE_PLUGIN_BUDGET_MS` (default 2000 ms) MUST NOT block the shell — the slot resolves to its default and the offending plugin is reported via the admin API. The budget applies per-plugin; total budget across N plugins is N × budget, parallelised. Total bundle size per plugin SHOULD stay under `FDPM_FE_PLUGIN_MAX_BYTES` (default 2 MiB compressed); the loader emits a warning above this and refuses to load above 4× this value.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:11",
  type: "spec:Section",
  fields: {
    number: "11",
    title: "The Plugin Boundary (Layer 8 of Core)",
    kind: "prose",
    body_md: [
      "Core defines the boundary; the companion SPEC defines what flows across it. This section is the Core view: what Core **promises** to plugins, and what Core **demands** from them.",
      "",
      "### 11.1 What Core promises",
      "",
      "- A typed `PluginContext` injected at lifecycle events.",
      "- A read API on the store that never raises for valid IDs and never returns mutable state.",
      "- Stable platform endpoints (§9.1) that plugins can call through the host's HTTP stack. The frontend's scoped API client (companion SPEC §7.5) MUST permit calls to the read-side §9.1 endpoints declared in the plugin's manifest `permissions` (e.g. `read:workbooks`, `read:primitives`), in addition to the plugin's own `/plugins/{id}/...` namespace.",
      "- Verification of plugin contributions before they take effect.",
      "- Failure isolation: a plugin error never crashes Core or another plugin.",
      "- Observability: every plugin call is traceable through metrics and logs.",
      "- Versioned, semver-respecting host compatibility checks.",
      "",
      "### 11.2 What Core demands",
      "",
      "- Plugins do not import `fdpm.store.store` directly.",
      "- Plugin routers have empty prefixes.",
      "- Plugin-contributed callables conform to declared protocols.",
      "- Plugin output passes the verification gate.",
      "- Plugins handle their own transient state; Core does not allocate per-plugin scratch space.",
      "- Plugins respect the permission set declared in their manifest.",
      "",
      "### 11.3 Cross-cutting symbol reservations",
      "",
      "The following identifiers are Core-reserved. Plugins MUST NOT define a profile, primitive type, relation type, scope, or category whose ID:",
      "",
      "- Begins with `core:`",
      "- Begins with `fdpm:`",
      "- Equals an existing Core symbol used in routing or documentation",
      "",
      "The verification gate enforces this at registration time.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:12",
  type: "spec:Section",
  fields: {
    number: "12",
    title: "Identity, Versioning, and Compatibility (Cross-cutting)",
    kind: "prose",
    body_md: [
      "### 12.1 Identifiers",
      "",
      "- All Core identifiers (`profile.id`, `primitive_type.id`, `relation_type.id`, `category.id`, `scope.id`) are colon-separated namespaced strings. Pattern: `^[a-z0-9-]+(:[a-z0-9-]+)+$` plus version suffix where applicable.",
      "- Core never auto-generates identifiers for plugin-contributed entities. The plugin chooses; Core verifies uniqueness.",
      "",
      "### 12.2 Versioning",
      "",
      "- This SPEC follows SemVer.",
      "- A SPEC minor bump MAY add a Core endpoint, a meta-model field that is optional, or a new platform-side capability point.",
      "- A SPEC major bump MAY remove or break any of the above.",
      "- The `host.version` exposed at `GET /version` includes both the running FDPM version and the supported Core SPEC version range.",
      "- The Core SPEC version reported in `/version.spec_core` is the **major.minor** form (`\"1.0\"`), not the document revision (`\"1.0.1\"`). Document revisions are editorial and do not change behaviour; SPEC minor/major bumps do.",
      "",
      "### 12.3 Compatibility checks",
      "",
      "- A plugin's `host_compatibility.fdpm` range is checked against the running host version.",
      "- Plugins targeting a Core SPEC version outside the host's supported range are rejected at discovery (companion SPEC §6.4 → `rejected`).",
      "- Core MUST NOT auto-translate plugin manifests across Core SPEC majors. Plugin authors update their manifest.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:13",
  type: "spec:Section",
  fields: {
    number: "13",
    title: "Observability and Auditing (Cross-cutting)",
    kind: "prose",
    body_md: [
      "### 13.1 Required metrics",
      "",
      "Core emits these regardless of plugin presence: `fdpm_http_request_duration_seconds` (histogram), `fdpm_http_request_total{method,route,status}` (counter), `fdpm_validation_findings_total{level}` (counter), `fdpm_store_size_bytes{kind}` (gauge), `fdpm_verification_gate_reject_total{boundary}` (counter), `fdpm_core_spec_version{version}` (gauge).",
      "",
      "Plugin metrics (companion SPEC §11) are layered on top, never replacing Core metrics.",
      "",
      "### 13.2 Required logs",
      "",
      "Every Core log record carries: `request_id` (uuid v7); `route` (templated, e.g. `/workbooks/{id}`); `actor` (auth principal id); `outcome` (`accept` | `reject` | `error`); `verification_gate_decision` when the gate fired.",
      "",
      "### 13.3 Audit trail — projection of the operation log",
      "",
      "Starting in v1.1, **the audit trail is the operation log** (§5.5). There is no separate audit table. Every state-changing endpoint appends an `Operation` to the project's log; queries that previously returned `AuditRecord` now return projections of `Operation`.",
      "",
      "The `AuditRecord` shape is preserved as a derived view for backward compatibility:",
      "",
      "```python",
      "class AuditRecord(BaseModel):",
      "    id: str                # = Operation.op_id",
      "    timestamp: datetime    # = Operation.timestamp",
      "    actor: str             # = Operation.actor",
      "    action: str            # = Operation.kind  (e.g. \"workbook.create\")",
      "    target_id: str         # derived from Operation.payload",
      "    diff: dict             # derived: { before: <pre-state>, after: <post-state> } reconstructed from log replay",
      "    plugin_id: str | None  # = Operation.plugin_id",
      "    request_id: str        # = Operation.request_id (now exposed)",
      "    op_id: str             # explicit pointer back to the canonical operation",
      "```",
      "",
      "`diff` is computed by replaying the log up to `op_id - 1` to reconstruct the pre-state, then computing the structural diff against the operation's effect. For high-throughput audit consumers, `GET /workbooks/{id}/log` (§9.8.1) is preferable.",
      "",
      "The `diff` field is bounded by `FDPM_AUDIT_DIFF_MAX_BYTES` (default 32 KiB). Truncation: truncate field-by-field, preferring to keep field names; replace each discarded value with `{\"_truncated\": true, \"_original_bytes\": N}`; add a top-level `_audit_truncated: true` marker; increment `fdpm_audit_diff_truncated_total`. A truncated audit record is still a valid audit record.",
      "",
      "The audit log is Core. Plugins MAY *emit* operations through their permitted write paths (§9.7, §5.4 graph operations) — those operations *are* the audit records of plugin actions. There is no separate `PluginContext.audit(...)` write path in v1.1; the operation log is the only audit channel. Plugins MAY *read* the log under the `read:audit` permission via `GET /workbooks/{id}/log`.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:14",
  type: "spec:Section",
  fields: {
    number: "14",
    title: "Security Model (Core view)",
    kind: "prose",
    body_md: [
      "### 14.1 What Core defends",
      "",
      "- The store: only Core handlers and `PluginContext`-authorised registrations mutate it.",
      "- The platform endpoints: §9.1 paths cannot be shadowed.",
      "- The verification gate: cannot be skipped from any path.",
      "- The plugin namespace: each plugin's routes are scoped to its own prefix.",
      "- The audit log: append-only from Core's perspective.",
      "",
      "### 14.2 What Core does not defend in v1.0",
      "",
      "- Adversarial Python plugin isolation (no in-process sandbox). Mitigated by the trust tier model (companion SPEC §10) and operator review.",
      "- Multi-tenant authorisation. Core is single-tenant in v1.0.",
      "- Persistent secrets management. Configuration uses environment variables; secret rotation is operator-owned.",
      "",
      "These exclusions are listed so absence is deliberate, not omission.",
      "",
      "### 14.3 Defence-in-depth checks",
      "",
      "For every state-changing request: 1) Auth check (Core); 2) Permission check (if plugin-routed: plugin's manifest permission set); 3) Verification gate; 4) Validation pipeline (if instance-touching); 5) Store mutation under the store lock; 6) Audit record write. Each step is a kill point. Failure at any step aborts the request and emits a structured error.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:15",
  type: "spec:Section",
  fields: {
    number: "15",
    title: "Configuration and Operator Surface",
    kind: "configuration",
    body_md: [
      "### 15.1 Core environment variables",
      "",
      "| Variable                               | Default                          | Role                                                |",
      "| -------------------------------------- | -------------------------------- | --------------------------------------------------- |",
      "| `FDPM_MAX_REQUEST_BYTES`               | `5_242_880` (5 MiB)              | Inbound body size cap.                              |",
      "| `FDPM_MAX_RENDER_BYTES`                | `52_428_800` (50 MiB)            | Renderer output cap.                                |",
      "| `FDPM_MAX_FIELD_PATCH_OPS`             | `100`                            | Max RFC-6902 ops in a `:field-patch` request (§9.7.4). |",
      "| `FDPM_MAX_BATCH_OPS`                   | `500`                            | Max operations in a single batch-edit request (§9.7.5). |",
      "| `FDPM_SNAPSHOT_EVERY_OPS`              | `1000`                           | Snapshot cadence per workbook (§5.5.5).              |",
      "| `FDPM_LOG_PAGE_MAX`                    | `10_000`                         | Hard cap on `GET /workbooks/{id}/log?limit=` (§9.8.1). |",
      "| `FDPM_FINDING_EVIDENCE_MAX_BYTES`      | `16_384` (16 KiB)                | Per-finding `evidence` cap (§7.3).                  |",
      "| `FDPM_AUDIT_DIFF_MAX_BYTES`            | `32_768` (32 KiB)                | Per-record audit diff cap (§13.3).                  |",
      "| `FDPM_VALIDATOR_QUARANTINE_THRESHOLD`  | `3`                              | Consecutive raises before validator-owning plugin is quarantined (§7.1). |",
      "| `FDPM_FE_PLUGIN_BUDGET_MS`             | `2000`                           | First-paint budget per frontend plugin (§10.4).     |",
      "| `FDPM_FE_PLUGIN_MAX_BYTES`             | `2_097_152` (2 MiB)              | Soft size warning per frontend plugin bundle.       |",
      "| `FDPM_PLUGIN_PATH`                     | `~/.fdpm/plugins`                | Filesystem plugin search path.                      |",
      "| `FDPM_PLUGIN_CONFIG_DIR`               | `~/.fdpm/plugin-config`          | Per-plugin config files.                            |",
      "| `FDPM_TRUSTED_KEYS`                    | empty                            | Public keys for trust-tier `verified`.              |",
      "| `FDPM_DOCS_ROOT`                       | unset (no docs mounted)          | Filesystem path to a built docs tree; if set and readable, Core mounts it at `/docs/`. The legacy boolean reading of this variable is removed in 1.0.1; pre-existing `0`/`1` values are ignored with a one-time deprecation log line. |",
      "| `FDPM_LOG_LEVEL`                       | `INFO`                           | Standard log level.                                 |",
      "| `FDPM_CORE_SPEC_VERSION`               | reported, not configurable       | The SPEC major.minor this binary implements.        |",
      "",
      "Plugins MUST NOT read environment variables not declared in their manifest's `permissions`. Core enforces this in `PluginContext` configuration resolution (companion SPEC §6.7).",
      "",
      "### 15.2 Operator-only actions",
      "",
      "These actions MUST be available to operators and unavailable to plugins: promote a plugin between trust tiers; `quarantine-clear` an active quarantine; edit `$FDPM_TRUSTED_KEYS`; restart the host; inspect raw audit records.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:16",
  type: "spec:Section",
  fields: {
    number: "16",
    title: "Error Taxonomy",
    kind: "error_taxonomy",
    body_md: [
      "All Core errors derive from `FDPMException` with a typed `category`:",
      "",
      "| Category               | Example trigger                                                       | HTTP status |",
      "| ---------------------- | --------------------------------------------------------------------- | ----------- |",
      "| `validation`           | §7 pipeline finding at `error` level.                                  | 400         |",
      "| `verification`         | §8 gate rejection.                                                     | 400         |",
      "| `not_found`            | Unknown profile / workbook / primitive / relation id.                  | 404         |",
      "| `conflict`             | ID collision, duplicate registration.                                 | 409         |",
      "| `permission`           | Plugin lacks declared permission for action.                          | 403         |",
      "| `unauthenticated`      | Missing or invalid auth.                                              | 401         |",
      "| `quota`                | Body / render size cap exceeded.                                      | 413         |",
      "| `unsupported_media`    | Wrong content type.                                                   | 415         |",
      "| `host_compat`          | Plugin demands an incompatible host.                                  | 409 (admin) |",
      "| `internal`             | Anything Core itself failed at; never a plugin-attributable error.    | 500         |",
      "",
      "Plugin-internal failures never surface as `internal`; they map to `verification` (with the failing plugin id in `evidence`) or transition the plugin to `quarantined`.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:17",
  type: "spec:Section",
  fields: {
    number: "17",
    title: "Extensibility Boundary",
    kind: "prose",
    body_md: [
      "This is the most important section: it defines, exactly, what plugins can change and what they cannot.",
      "",
      "### 17.1 Plugins MAY change (via capabilities)",
      "",
      "- Which `DomainProfile`s exist and what they contain.",
      "- Which custom validators run for which primitive types.",
      "- Which renderer targets the host can produce, and the bytes those renderers emit.",
      "- Which routes exist under `/plugins/{id}/...`.",
      "- Which UI forms, cards, panels, previews, menu actions, themes, and locales exist beyond Core defaults.",
      "- Which transformers, importers, and exporters exist.",
      "- Which primitive types are partition units (`PrimitiveTypeDef.is_partition_unit`, §5.4.3). This is a profile-authored declaration, not a Core-imposed list.",
      "",
      "### 17.2 Plugins MUST NOT change",
      "",
      "- The meta-model types (§4).",
      "- The instance model types (§5).",
      "- The store structures (§6) or their access discipline.",
      "- The validation pipeline's **step list, ordering, and report schema** (§7). The *content* of the custom-validator step is plugin-supplied; everything else is Core.",
      "- The graph operations (§5.4): split, clone. Plugins observe their effects via the operation log; they do not contribute alternative implementations or override semantics.",
      "- The operation kind set (§5.5.1). Plugins emit operations of existing kinds via `cap:transformer`; they MUST NOT define new kinds. Adding a kind is a Core SPEC minor bump.",
      "- The replay function (§5.5.3). One replay implementation; no plugin alternatives.",
      "- The upcasting layer (§5.5.6). Old `schema_version` payload definitions belong to the SPEC version that defined them; plugins do not contribute upcasters.",
      "- The store projection rule that all writes go through `Store.append(op)` (§6.2). Direct mutation of projection maps is forbidden everywhere — including in Core handlers.",
      "- The verification gate (§8) or its non-bypassability.",
      "- The platform endpoint set (§9.1) or any reserved namespace (§9.3, §9.4).",
      "- The frontend shell baseline (§10.2).",
      "- The plugin boundary contract (§11).",
      "- The identity, versioning, observability, security, configuration, or error-taxonomy policies (§12–§16).",
      "- The capability catalogue (companion SPEC §4) — adding a new capability is a SPEC bump, not a plugin contribution.",
      "",
      "### 17.3 The \"fork test\"",
      "",
      "If achieving an outcome requires changing anything in §17.2, the work is a Core change (this SPEC), a companion-SPEC change, or a fork — never a plugin.",
      "",
      "### 17.4 The drift-surface caveat",
      "",
      "The plugin migration removes domain-specific code from Core but does not, by itself, eliminate the drift surfaces between Python and TypeScript representations of shared data (e.g. type-color palettes, route templates, slug rules; see `drift-risk-map.md`). A future SPEC minor MAY add `cap:shared-constants` or a Core-emitted JSON contract surface so a plugin's shared constants are authored once and consumed from both runtimes. v1.0 does not include this; the CRITICAL drift findings #1, #5–#8 in `drift-risk-map.md` remain after migration unless addressed independently.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:18",
  type: "spec:Section",
  fields: {
    number: "18",
    title: "Acceptance Criteria for Core v1.1",
    kind: "acceptance_criteria",
    body_md:
      "Core is **conformant** when all the following hold against `main`. Each criterion has a test. A criterion without a test is not acceptable evidence — per `CLAUDE.md` Core Principle 3.",
  },
});

sections.push({
  id: "spec:sec:19",
  type: "spec:Section",
  fields: {
    number: "19",
    title: "Migration from Current Codebase",
    kind: "migration",
    body_md: [
      "The current codebase is mostly Core, but has three Core-violations that must be fixed.",
      "",
      "### 19.1 Violations to remove",
      "",
      "1. **Static plugin imports in `src/fdpm/main.py:23-33` and `:45-50`.** These hardcode three plugins as if they were Core. They are content. Replaced by discovery-driven loading per the companion SPEC.",
      "2. **Domain-specific routers mounted as Core (`narrative_router`, `spec_parser_router`, `export_pdf_router`).** Each is domain content and belongs to its respective plugin under `/plugins/{id}/...`. The corresponding files in `src/fdpm/api/` move into the relevant plugin packages.",
      "3. **Domain-specific engine modules (`src/fdpm/engine/{nlp.py, narrative_validation.py, spec_parser.py}`).** These import domain assumptions; they belong to the relevant plugins, not to Core.",
      "",
      "### 19.2 What stays in Core after migration",
      "",
      "- `src/fdpm/main.py` — bootstrap only.",
      "- `src/fdpm/store.py` — unchanged structurally; access discipline tightened.",
      "- `src/fdpm/models/{core, instances, workbook, api_contracts, transfer, errors, composition}.py` — Core data types.",
      "- `src/fdpm/api/{profiles, workbooks, primitives, relations, views, templates, transfer, test_suites}.py` — platform endpoints.",
      "- `src/fdpm/api/plugins.py` — admin surface (added by companion SPEC).",
      "- `src/fdpm/engine/{validation, compilation, rendering, test_runner}.py` — only the *generic* parts; domain-aware code splits out to plugins.",
      "- `src/fdpm/plugin/**` — the plugin runtime (companion SPEC).",
      "- `frontend/src/{App, routes, lib/api/core, plugin/**, components/{layout, primitives, shared, ui}}` — shell + slot machinery + defaults.",
      "",
      "### 19.3 What moves out of Core",
      "",
      "| From                                                    | To                                                          |",
      "| ------------------------------------------------------- | ----------------------------------------------------------- |",
      "| `src/fdpm/api/narrative.py`                              | `src/fdpm/plugins/narrative/api.py`                         |",
      "| `src/fdpm/api/spec_parser.py`                            | `src/fdpm/plugins/formal_specification/api.py`              |",
      "| `src/fdpm/api/export_pdf.py`                             | The renderer-owning plugin (likely `formal_specification`)  |",
      "| `src/fdpm/engine/narrative_validation.py`                | `src/fdpm/plugins/narrative/validation.py`                  |",
      "| `src/fdpm/engine/spec_parser.py`                         | `src/fdpm/plugins/formal_specification/parser.py`           |",
      "| `src/fdpm/engine/nlp.py`                                 | See §22 open question 2 — operator decision pending.       |",
      "| `src/fdpm/templates/export_pdf/`                         | Same plugin as `export_pdf.py`                              |",
      "| `src/fdpm/plugins/formal_specification.py` (3,251 LOC)   | `src/fdpm/plugins/formal_specification/` package            |",
      "| `src/fdpm/plugins/narrative.py`                          | `src/fdpm/plugins/narrative/` package                       |",
      "| `src/fdpm/plugins/software_architecture.py`              | `src/fdpm/plugins/software_architecture/` package           |",
      "| Frontend domain-specific components (where they exist)   | `frontend/plugins/{plugin-id}/` bundles                     |",
      "",
      "### 19.4 Migration ordering",
      "",
      "The migration MUST be sequenced so Core is always shippable. Steps 1–6 deliver SPEC-CORE 1.0. Step 7 delivers SPEC-CORE 1.1. The two are sequenced because step 7 assumes the §9.7 editing API landed in step 1, and because the operation kind set §5.5.1 is defined in terms of §9.7 / §5.4 endpoints. Doing event sourcing before §9.7 stabilised would have meant freezing kinds against a moving target.",
      "",
      "No migration step ships with Core in a half-migrated state visible to users (Principle 4 + CLAUDE.md Rule 8). Pre-migration paths return 404 the moment the move PR merges; this is intentional (§9.6).",
      "",
      "### 19.5 Frontend URL updates",
      "",
      "The frontend's `lib/api.ts` paths for migrated routers MUST be updated in the same PR that performs the move:",
      "",
      "| Pre-migration                              | Post-migration                                                                |",
      "| ------------------------------------------ | ----------------------------------------------------------------------------- |",
      "| `/api/narrative/*`                         | `/api/plugins/narrative/*`                                                    |",
      "| `/api/spec_parser/*`                       | `/api/plugins/formal-specification/*`                                         |",
      "| `/api/workbooks/{id}/export.pdf`            | `/api/plugins/formal-specification/workbooks/{id}/export.pdf`                  |",
      "",
      "The contract test (`tests/test_frontend_api_contract.py`) is updated in the same PR and is the gate that prevents a half-migrated merge. Per §9.6 there is no redirect fallback; a frontend build that misses a path 404s in production. This is the chosen design: a loud break in CI is preferable to a quiet shim that lingers.",
    ].join("\n"),
  },
});

sections.push({
  id: "spec:sec:20",
  type: "spec:Section",
  fields: {
    number: "20",
    title: "Out of Scope (Deferred)",
    kind: "future_work",
    body_md:
      "The following are deliberately excluded from Core v1.1. Listing them prevents accidental scope creep and makes their absence auditable. Each is a candidate for its own SPEC. None is a Core v1.1 obligation.",
  },
});

sections.push({
  id: "spec:sec:21",
  type: "spec:Section",
  fields: {
    number: "21",
    title: "Risks and Trade-offs",
    kind: "risks",
    body_md: "",
  },
});

sections.push({
  id: "spec:sec:22",
  type: "spec:Section",
  fields: {
    number: "22",
    title: "Open Questions",
    kind: "open_questions",
    body_md:
      "These require operator decision. They are the only items in this SPEC that are **not** pre-resolved. Each question has exactly one operator-decision point. Core does not pre-empt them.",
  },
});

sections.push({
  id: "spec:sec:23",
  type: "spec:Section",
  fields: {
    number: "23",
    title: "References",
    kind: "references",
    body_md: "",
  },
});

sections.push({
  id: "spec:sec:24",
  type: "spec:Section",
  fields: {
    number: "24",
    title: "Revision history",
    kind: "revision_history",
    body_md: "",
  },
});

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

  // Stakeholders hold concerns — implicit; no spec:Concern primitives in this SPEC.
  // (SPEC-CORE doesn't carry an explicit Concern table; QA primitives capture
  // the concern surface instead.)

  // Mitigations cover risks — pair them by index where the SPEC's §21 table
  // pairs them.
  rel("rel:mit-built-ins", "spec:Mitigates", "spec:mit:built-ins-shipped", "spec:risk:built-ins-demoted"),
  rel("rel:mit-store-shim", "spec:Mitigates", "spec:mit:companion-shim", "spec:risk:store-import-break"),
  rel("rel:mit-gate-budget", "spec:Mitigates", "spec:mit:gate-budget", "spec:risk:gate-startup-latency"),
  rel("rel:mit-reserved-ns", "spec:Mitigates", "spec:mit:reserved-namespace-test", "spec:risk:reserved-namespace-forgotten"),
  rel("rel:mit-zero-plugins", "spec:Mitigates", "spec:mit:core-empty-and-defaults", "spec:risk:zero-plugins-baseline-non-trivial"),
  rel("rel:mit-contract-test", "spec:Mitigates", "spec:mit:contract-test-gate", "spec:risk:client-breakage-on-router-move"),
  rel("rel:mit-shared-constants", "spec:Mitigates", "spec:mit:future-cap-shared-constants", "spec:risk:residual-py-ts-drift"),
  rel("rel:mit-exception-barrier", "spec:Mitigates", "spec:mit:exception-barrier", "spec:risk:plugin-validator-mistaken-for-core-bug"),
  rel("rel:mit-snapshots", "spec:Mitigates", "spec:mit:snapshots-and-future-compaction", "spec:risk:event-source-log-grows-unbounded"),
  rel("rel:mit-upcaster-gate", "spec:Mitigates", "spec:mit:upcaster-release-gate", "spec:risk:upcaster-bug"),
  rel("rel:mit-rebuild-from-log", "spec:Mitigates", "spec:mit:rebuild-from-log", "spec:risk:noisy-plugin-pollutes-history"),
  rel("rel:mit-sequenced-migration", "spec:Mitigates", "spec:mit:sequenced-migration", "spec:risk:event-source-impl-surface"),

  // Migration step dependencies (linear chain)
  rel("rel:mig-2-deps-1", "spec:DependsOn", "spec:mig:2", "spec:mig:1"),
  rel("rel:mig-3-deps-2", "spec:DependsOn", "spec:mig:3", "spec:mig:2"),
  rel("rel:mig-4-deps-3", "spec:DependsOn", "spec:mig:4", "spec:mig:3"),
  rel("rel:mig-5-deps-4", "spec:DependsOn", "spec:mig:5", "spec:mig:4"),
  rel("rel:mig-6-deps-5", "spec:DependsOn", "spec:mig:6", "spec:mig:5"),
  rel("rel:mig-7-deps-6", "spec:DependsOn", "spec:mig:7", "spec:mig:6"),
  rel("rel:mig-8-deps-7", "spec:DependsOn", "spec:mig:8", "spec:mig:7"),

  // Required reads on the document
  rel("rel:doc-req-claude", "spec:RequiredRead", documentSpec.id, "spec:ref:claude-md"),
  rel("rel:doc-req-purpose", "spec:RequiredRead", documentSpec.id, "spec:ref:purpose-md"),
  rel("rel:doc-req-disclaimer", "spec:RequiredRead", documentSpec.id, "spec:ref:disclaimer-md"),

  // Citations
  rel("rel:doc-cites-companion", "spec:Cites", documentSpec.id, "spec:ref:companion-spec"),
  rel("rel:doc-cites-drift", "spec:Cites", documentSpec.id, "spec:ref:drift-risk-map"),
  rel("rel:doc-cites-store", "spec:Cites", documentSpec.id, "spec:ref:store-py"),
  rel("rel:doc-cites-models-core", "spec:Cites", documentSpec.id, "spec:ref:models-core-py"),
  rel("rel:doc-cites-main", "spec:Cites", documentSpec.id, "spec:ref:main-py"),
  rel("rel:doc-cites-iso", "spec:Cites", documentSpec.id, "spec:ref:iso-iec-ieee-42010"),
  rel("rel:doc-cites-pep660", "spec:Cites", documentSpec.id, "spec:ref:pep-660"),

  // Document was revised through each version
  rel("rel:doc-revised-1-2-0", "spec:RevisedIn", documentSpec.id, "spec:rev:1-2-0"),
  rel("rel:doc-revised-1-1-1", "spec:RevisedIn", documentSpec.id, "spec:rev:1-1-1"),
  rel("rel:doc-revised-1-1-0", "spec:RevisedIn", documentSpec.id, "spec:rev:1-1-0"),
  rel("rel:doc-revised-1-0-4", "spec:RevisedIn", documentSpec.id, "spec:rev:1-0-4"),
  rel("rel:doc-revised-1-0-3", "spec:RevisedIn", documentSpec.id, "spec:rev:1-0-3"),
  rel("rel:doc-revised-1-0-2", "spec:RevisedIn", documentSpec.id, "spec:rev:1-0-2"),
  rel("rel:doc-revised-1-0-1", "spec:RevisedIn", documentSpec.id, "spec:rev:1-0-1"),
];

function rel(id: string, type: string, from: string, to: string): RelationSpec {
  return { id, type, from, to };
}

export const __PART_8__ = true;

async function main(): Promise<void> {
  const host = await openHost();

  // Phase 1: typed spec-authoring primitives (Document, Term, ADR
  // primitives, Reference, Revision, etc.) plus the relations that
  // bind them. NO spec:Section / spec:HasSection — the section tree
  // is a DNIS Node graph built in phase 2.
  const phase1Relations = relations.filter((r) => r.type !== "spec:HasSection");
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — FDPM Core v1.3",
    profile: PROFILE_ID,
    description:
      "1:1 migration of docs/specs/SPEC-CORE.md to a typed graph using the fdpm.spec-authoring-dnis composition profile. Section tree is committed as dnis:Document + dnis:Node primitives in phase 2.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...principleSpecs,
      ...stakeholders,
      ...qas,
      ...invariants,
      ...acceptances,
      ...risks,
      ...mitigations,
      ...futureWork,
      ...changes,
      ...migration,
      ...conformance,
      ...revisions,
      ...openQuestions,
      ...references,
      // sections array is NO LONGER committed as spec:Section. Its
      // content is read in phase 2 to build the DNIS Node tree.
    ])
    .relations(phase1Relations)
    .commit();

  console.log("Phase 1 — typed primitives committed:");
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);

  // Phase 2: build the §-tree as dnis:Node primitives via the host
  // adapter. The renderer's DNIS path (spec_md.ts /
  // renderSectionsFromDnis) walks this graph at render time. §5.6 is
  // a CHILD of §5 with number_override = "5.6" so the rendered
  // heading stays "### 5.6." despite the DFS path being [5, 1].
  const adapter = new DnisHostAdapter(host, { workbookId: PROJECT_ID });
  const dnisDoc = await adapter.createDocument({
    createdBy: SPEC_CORE_BUILD_AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });

  // Map the legacy section-id ("spec:sec:5") to the minted dnis:Node id
  // so the §5.6 child can target the right parent.
  const idToNodeId = new Map<string, NodeId>();

  // Sections that should NOT be committed as top-level peers because
  // they belong UNDER another section in the DNIS tree. Maps the
  // child-section id → { parentId, numberOverride }.
  const childSections: Record<string, { parent: string; override: string }> = {
    "spec:sec:5-6": { parent: "spec:sec:5", override: "5.6" },
  };

  let opCounter = 0;
  function nextOpId(): OperationId {
    opCounter += 1;
    return mintUid() as OperationId;
  }

  async function createDnisSection(
    parent: NodeId | null,
    sectionPrim: PrimitiveSpec,
    numberOverride: string | null,
  ): Promise<NodeId> {
    const fields = sectionPrim.fields as Record<string, unknown>;
    const title = String(fields["title"] ?? "(untitled)");
    const body_md = String(fields["body_md"] ?? "");
    const kindRaw = fields["kind"];
    const dispatch_kind =
      typeof kindRaw === "string" && kindRaw !== "prose" ? kindRaw : undefined;
    const siblings = adapter.listActiveNodes(dnisDoc.id, parent);
    const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
    const position = positionBetween(last?.position ?? null, null);
    const issuedAt = new Date(
      Date.UTC(2026, 4, 4, 12, 0, opCounter),
    ).toISOString();
    const result = await adapter.apply({
      id: nextOpId(),
      type: "create",
      documentId: dnisDoc.id,
      agentId: SPEC_CORE_BUILD_AGENT,
      issuedAt,
      payload: {
        kind: "section",
        content: {
          title,
          body_md,
          ...(dispatch_kind ? { dispatch_kind } : {}),
          ...(numberOverride ? { number_override: numberOverride } : {}),
        },
        parentNodeId: parent,
        position,
      },
    });
    return result.affectedNodeIds[0]!;
  }

  // Walk the sections array in declared order. Top-level sections
  // become DNIS top-level nodes; entries listed in childSections
  // become children of their declared parent with the override label.
  for (const sec of sections) {
    const childMeta = childSections[sec.id];
    if (childMeta) {
      const parentNodeId = idToNodeId.get(childMeta.parent);
      if (!parentNodeId) {
        throw new Error(
          `child section ${sec.id} declared before parent ${childMeta.parent}`,
        );
      }
      const nodeId = await createDnisSection(parentNodeId, sec, childMeta.override);
      idToNodeId.set(sec.id, nodeId);
    } else {
      const nodeId = await createDnisSection(null, sec, null);
      idToNodeId.set(sec.id, nodeId);
    }
  }

  console.log("Phase 2 — dnis:Node section tree built:");
  console.log("  dnis:Document:", dnisDoc.id);
  console.log("  sections     :", opCounter);
  console.log("  revision     :", host.getProject(PROJECT_ID).workbook.revision);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
