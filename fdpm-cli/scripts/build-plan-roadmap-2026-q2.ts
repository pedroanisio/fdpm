/**
 * 2026-Q2 roadmap — eight in-flight phases of FDPM development,
 * built as a planning workbook so it renders through `plan:RoadmapRenderer`,
 * `plan:GanttSvgRenderer`, and `plan:AgentBoardRenderer`.
 *
 * Phase order (per operator selection 2026-05-05):
 *   1. MCP slice 2  — subscriptions + size cap + more resource families
 *   2. MCP Tier-3 hardening — destructive-tool audit + extra gates
 *   3. REPL v0.2    — streaming, multi-line, tab-completion polish
 *   4. SECTIONS-TREE v0.2 — codemod ship + deprecation removal
 *   5. spec-authoring + formal-spec DNIS migration of remaining build-spec-*.ts
 *   6. Plugin batch-load improvements / hot-reload semantics
 *   7. Cross-plugin search / workbook-level search across primitives
 *   8. Operator docs cleanup — collapse MANUAL.md / README.md / AGENTS.md
 *
 * Layout:
 *   - One `plan:Iteration` (covers the whole quarter) so renderers
 *     have a single time-window.
 *   - One `plan:WorkBreakdown` per phase.
 *   - Tasks per phase wired into both the iteration (via plan:InIteration)
 *     and that phase's WBS (via plan:Contains).
 *   - One `plan:Milestone` per phase capturing the "phase ships" gate.
 *   - One `plan:AcceptanceCriterion` per phase with a CEL expression
 *     asserting the satisfying tasks exist in the graph.
 *   - Cross-phase `plan:DependsOn` edges where a later phase genuinely
 *     blocks on an earlier one.
 *   - Two `plan:Blocker` primitives for known active blockers (the
 *     resource-size-cap design call + the codemod-byte-equal design call).
 *
 * Run:
 *   rm -rf /tmp/fdpm-plan-roadmap-q2
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-roadmap-q2 npx tsx \
 *     fdpm-cli/scripts/build-plan-roadmap-2026-q2.ts
 *
 * Render:
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-roadmap-q2 npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-roadmap-2026-q2 text/markdown \
 *     --renderer-id plan:RoadmapRenderer \
 *     -o docs/planning/roadmap-2026-q2.md
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-roadmap-q2 npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-roadmap-2026-q2 image/svg+xml \
 *     --renderer-id plan:GanttSvgRenderer \
 *     -o docs/planning/roadmap-2026-q2-gantt.svg
 *   FDPM_DATA_DIR=/tmp/fdpm-plan-roadmap-q2 npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render plan-roadmap-2026-q2 text/markdown \
 *     --renderer-id plan:AgentBoardRenderer \
 *     -o docs/planning/roadmap-2026-q2-board.md
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
  PLAN_ITERATION,
  PLAN_WORK_BREAKDOWN,
  PLAN_MILESTONE,
  PLAN_ACCEPTANCE_CRITERION,
  PLAN_BLOCKER,
  PLAN_TASK,
  PLAN_REL_IN_ITERATION,
  PLAN_REL_CONTAINS,
  PLAN_REL_DEPENDS_ON,
  PLAN_REL_VERIFIES,
  PLAN_REL_HITS_MILESTONE,
  PLAN_REL_BLOCKED_BY,
} from "../plugins/planning/index.js";

const PROJECT_ID = "plan-roadmap-2026-q2";
const ITERATION_ID = "iteration:2026-q2";

// ── Iteration ─────────────────────────────────────────────────────

const iterationSpecs: PrimitiveSpec[] = [
  {
    id: ITERATION_ID,
    type: PLAN_ITERATION,
    scope: SCOPE_IDS.iteration,
    fields: {
      name: "2026-Q2",
      start_date: "2026-05-05",
      end_date: "2026-08-31",
      goal:
        "Land MCP server slice 2 (subscriptions + Tier-3 hardening), ship REPL v0.2, close out SECTIONS-TREE deprecation, finish DNIS migration, refresh plugin lifecycle semantics, ship cross-plugin search, and consolidate operator docs.",
    },
  },
];

// ── Work breakdowns (one per phase) ───────────────────────────────

interface PhaseDef {
  id: string;
  name: string;
  summary: string;
  /** P0 = unblocks downstream phases; P1 = important; P2 = nice-to-have. */
  priority: "P0" | "P1" | "P2";
}

const PHASES: PhaseDef[] = [
  {
    id: "wbs:p1-mcp-slice-2",
    name: "phase-1-mcp-slice-2",
    summary:
      "MCP server slice 2 — resource subscriptions, per-resource size cap, additional resource providers (workbook transfer, validate report, primitive view).",
    priority: "P0",
  },
  {
    id: "wbs:p2-mcp-tier3-hardening",
    name: "phase-2-mcp-tier3-hardening",
    summary:
      "MCP Tier-3 destructive-tool hardening — audit log review for deletes, idempotency keys on destructive calls, dry-run mode, additional preflight gates, restricted-by-default access patterns.",
    priority: "P0",
  },
  {
    id: "wbs:p3-repl-v02",
    name: "phase-3-repl-v0-2",
    summary:
      "REPL v0.2 — streaming partial responses for long renders, multi-line input continuation, tab-completion expansion (filename hints under -f, profile/primitive id hints).",
    priority: "P1",
  },
  {
    id: "wbs:p4-sections-tree-v02",
    name: "phase-4-sections-tree-v0-2",
    summary:
      "SECTIONS-TREE v0.2 — ship the codemod, run it across all build-spec-*.ts, remove the spec:Section.number deprecation note, flip SPEC status to Stable.",
    priority: "P1",
  },
  {
    id: "wbs:p5-dnis-migration-rest",
    name: "phase-5-dnis-migration-rest",
    summary:
      "DNIS migration of remaining build-spec-*.ts scripts — convert spec_authoring + formal_specification scripts that still hand-author `number` strings to use the dnis:Node graph.",
    priority: "P1",
  },
  {
    id: "wbs:p6-plugin-lifecycle",
    name: "phase-6-plugin-lifecycle",
    summary:
      "Plugin batch-load + hot-reload semantics — make plugin discovery incremental (don't rescan unchanged dirs), stabilize :reload plugins under partial-failure scenarios, document the activation order contract.",
    priority: "P2",
  },
  {
    id: "wbs:p7-cross-plugin-search",
    name: "phase-7-cross-plugin-search",
    summary:
      "Cross-plugin / workbook-level search — `fdpm primitive search` extended with --across-workbooks, --type-class (e.g. all `*:Section`), --field-equals filters that span multiple profiles.",
    priority: "P2",
  },
  {
    id: "wbs:p8-docs-cleanup",
    name: "phase-8-docs-cleanup",
    summary:
      "Operator-facing docs consolidation — pull current state of MANUAL.md / README.md / AGENTS.md into one source of truth (or three with a shared content-include mechanism); kill the env-table drift problem at its root.",
    priority: "P2",
  },
];

const wbsSpecs: PrimitiveSpec[] = PHASES.map((p) => ({
  id: p.id,
  type: PLAN_WORK_BREAKDOWN,
  scope: SCOPE_IDS.workbook,
  fields: {
    name: p.name,
    summary: p.summary,
    status: "Active",
  },
}));

// ── Milestones (one per phase ship date) ──────────────────────────

const milestoneSpecs: PrimitiveSpec[] = [
  {
    id: "milestone:p1-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p1-mcp-slice-2-ships",
      target_date: "2026-05-30",
      summary:
        "MCP slice 2 lands: subscriptions, size cap, three new resource providers (transfer, validate, primitive). Claude Code can pin live-updating resources.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p2-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p2-mcp-tier3-ships",
      target_date: "2026-06-15",
      summary:
        "MCP Tier-3 hardening lands: dry-run mode, idempotency keys, audit-log gates. fdpm-mcp can be safely run with --enable-destructive in shared environments.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p3-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p3-repl-v0-2-ships",
      target_date: "2026-06-30",
      summary:
        "REPL v0.2 lands: streaming, multi-line input, expanded tab completion. SPEC-REPL §27 deferrals 1-3 closed.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p4-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p4-sections-tree-v0-2-ships",
      target_date: "2026-07-15",
      summary:
        "SECTIONS-TREE v0.2 lands: codemod applied across all build-spec-*.ts, spec:Section.number removed from the active surface, SPEC moved to Stable.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p5-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p5-dnis-migration-ships",
      target_date: "2026-07-31",
      summary:
        "Every remaining build-spec-*.ts uses dnis:Node sections. The legacy compareSectionNumbers code path in spec_md.ts can be removed in v0.3.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p6-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p6-plugin-lifecycle-ships",
      target_date: "2026-08-15",
      summary:
        "Plugin lifecycle hardening lands: incremental discovery, partial-failure-safe :reload plugins, documented activation order.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p7-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p7-cross-plugin-search-ships",
      target_date: "2026-08-25",
      summary:
        "Cross-plugin search lands. Operators can grep across all workbook primitives without writing a script.",
      status: "Upcoming",
    },
  },
  {
    id: "milestone:p8-ships",
    type: PLAN_MILESTONE,
    scope: SCOPE_IDS.workbook,
    fields: {
      name: "p8-docs-cleanup-ships",
      target_date: "2026-08-31",
      summary:
        "Operator docs consolidation lands. Single source of truth (or shared-include mechanism) eliminates env-table drift.",
      status: "Upcoming",
    },
  },
];

// ── Acceptance criteria (one per phase) ───────────────────────────

const acSpecs: PrimitiveSpec[] = [
  {
    id: "ac:p1-subs-and-sizecap",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P1: resources/subscribe + notifications/resources/updated work end-to-end against a watcher polling host.statProjectLog; FDPM_MCP_MAX_RESOURCE_BYTES rejects oversized renders with a structured envelope; transfer + validate + primitive resource providers all return content via resources/read.",
      expression:
        'graph.exists("task:p1-subscribe") && graph.exists("task:p1-sizecap") && graph.exists("task:p1-providers") && graph.exists("task:p1-catalog-budget") && graph.exists("task:p1-server-instructions")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/src/mcp/resources/",
        "fdpm-cli/src/bin/fdpm-mcp.ts",
      ],
    },
  },
  {
    id: "ac:p2-tier3-hardened",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P2: every Tier-3 destructive tool accepts --dry-run, requires an idempotency key on first call, writes a pre-execution audit entry, and refuses on a sub-second-old re-issue without the same key. Coverage gate: 100% of Tier-3 tools.",
      expression:
        'graph.exists("task:p2-dry-run") && graph.exists("task:p2-idempotency") && graph.exists("task:p2-audit-gates")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/src/mcp/tools/",
        "fdpm-cli/src/persistence/mcp-audit-log.ts",
      ],
    },
  },
  {
    id: "ac:p3-repl-streaming",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P3: a render of >1 MB streams partial chunks to stdout in JSON-mode (each chunk a JSON envelope with sequence + final flag); multi-line input via trailing backslash works at the prompt; tab completion suggests primitive ids when the cursor is after `--id`.",
      expression:
        'graph.exists("task:p3-streaming") && graph.exists("task:p3-multiline") && graph.exists("task:p3-completion")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/src/commands/repl.ts",
        "fdpm-cli/tests/repl/",
      ],
    },
  },
  {
    id: "ac:p4-sections-tree-stable",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P4: SPEC-SECTIONS-TREE status flipped to Stable; every build-spec-*.ts is migrated and renders byte-equal pre/post; spec:Section.number removed from the active schema (or hard-deprecated with an error finding).",
      expression:
        'graph.exists("task:p4-codemod-apply") && graph.exists("task:p4-spec-stable")',
      status: "open",
      evidence_refs: [
        "docs/specs/SPEC-SECTIONS-TREE.md",
        "fdpm-cli/scripts/migrate-section-numbers.ts",
      ],
    },
  },
  {
    id: "ac:p5-dnis-everywhere",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P5: zero remaining build-spec-*.ts hand-authors `number` strings on spec:Section; renderSectionsLegacy in spec_md.ts is removable (the dnis:Node path is the only path used in production).",
      expression:
        'graph.exists("task:p5-migrate-scripts") && graph.exists("task:p5-legacy-removal-tracked")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/scripts/",
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
      ],
    },
  },
  {
    id: "ac:p6-plugin-lifecycle-safe",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P6: :reload plugins survives a single plugin failing activate() (the others stay loaded); incremental discovery skips unchanged plugin dirs (verified via stat-mtime cache); SPEC-PLUGIN-LIFECYCLE documents the activation order.",
      expression:
        'graph.exists("task:p6-partial-failure") && graph.exists("task:p6-incremental") && graph.exists("task:p6-spec-doc")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/src/plugin/runtime.ts",
        "fdpm-cli/src/plugin/discovery.ts",
      ],
    },
  },
  {
    id: "ac:p7-search-cross-plugin",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P7: `fdpm primitive search --across-workbooks` returns matches from every loaded workbook; `--type-class '*:Section'` matches across spec/fs/sw section primitives; field-equals filters work without a custom script.",
      expression:
        'graph.exists("task:p7-host-impl") && graph.exists("task:p7-cli-flags")',
      status: "open",
      evidence_refs: [
        "fdpm-cli/src/core/host.ts",
        "fdpm-cli/src/commands/primitive.ts",
      ],
    },
  },
  {
    id: "ac:p8-docs-single-source",
    type: PLAN_ACCEPTANCE_CRITERION,
    scope: SCOPE_IDS.workbook,
    fields: {
      criterion:
        "AC-P8: the env-contract test passes without manual edits to MANUAL.md and README.md after adding a new env var (i.e. the docs are generated from src/core/config/env.ts, or the duplication is eliminated by a content-include mechanism).",
      expression:
        'graph.exists("task:p8-design") && graph.exists("task:p8-implementation")',
      status: "open",
      evidence_refs: [
        "README.md",
        "fdpm-cli/MANUAL.md",
        "AGENTS.md",
        "fdpm-cli/src/core/config/env.ts",
      ],
    },
  },
];

// ── Tasks ─────────────────────────────────────────────────────────

interface TaskDef {
  id: string;
  name: string;
  summary: string;
  kind:
    | "Implementation"
    | "Test"
    | "Documentation"
    | "Investigation"
    | "Review"
    | "Refactor";
  executor: "AI" | "Human" | "Either";
  ai_minutes?: number;
  human_estimate?: string;
  status:
    | "Backlog"
    | "Ready"
    | "In_progress"
    | "Blocked"
    | "In_review"
    | "Done"
    | "Cancelled";
  priority: "P0" | "P1" | "P2" | "P3";
  planned_start?: string;
  planned_finish?: string;
  /** Which WBS contains this task. */
  wbs: string;
}

const tasks: TaskDef[] = [
  // ── Phase 1: MCP slice 2 ──────────────────────────────────────────
  {
    id: "task:p1-subscribe",
    name: "p1-resource-subscribe",
    summary:
      "Wire ResourceSubscribeRequestSchema + the watcher loop. On subscribe, take a (mtime_ns, size) snapshot via host.statProjectLog and poll on a 250-500ms cadence; emit notifications/resources/updated when the snapshot changes.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-08",
    planned_finish: "2026-05-12",
    wbs: "wbs:p1-mcp-slice-2",
  },
  {
    id: "task:p1-sizecap",
    name: "p1-resource-size-cap",
    summary:
      "Add FDPM_MCP_MAX_RESOURCE_BYTES (default 1 MiB). Reject oversized renders in resources/read with a `quota` envelope carrying `evidence.bytes` and `evidence.cap`. Cap also applies after base64 expansion for binary blobs.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Ready",
    priority: "P0",
    planned_start: "2026-05-13",
    planned_finish: "2026-05-15",
    wbs: "wbs:p1-mcp-slice-2",
  },
  {
    id: "task:p1-providers",
    name: "p1-additional-providers",
    summary:
      "Add three more resource providers: (a) workbook transfer at fdpm://workbook/{id}/transfer, (b) validate report at fdpm://workbook/{id}/validate, (c) primitive view at fdpm://workbook/{id}/primitive/{pid}. Each ~50 lines under src/mcp/resources/.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Ready",
    priority: "P1",
    planned_start: "2026-05-18",
    planned_finish: "2026-05-25",
    wbs: "wbs:p1-mcp-slice-2",
  },
  {
    id: "task:p1-server-instructions",
    name: "p1-server-instructions",
    summary:
      "Static initialize.instructions (cold-start workflow, response contract, gating) mirrored at fdpm://guide; 18 tool descriptions deduplicated; catalog 25,699 \u2192 23,567 B, budget ratcheted to 26,000. Shipped 33c774b + 6689bfd (SPEC-MCP-SERVER 0.1.4 \u00a78.6, ADR decision:0007, GH #10).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    // In_review at create, patched to Done post-commit (see `shipped` in main()).
    status: "In_review",
    priority: "P0",
    planned_start: "2026-08-28",
    planned_finish: "2026-08-28",
    wbs: "wbs:p1-mcp-slice-2",
  },
  {
    id: "task:p1-catalog-budget",
    name: "p1-catalog-byte-budget",
    summary:
      "Measure and cap the advertised tools/list catalog (28,000 B / 2,000 B per tool) at boot and in CI; fdpm://schema/profile resource; opaque fdpm.profile.register input validated server-side. Shipped fe03e34 (SPEC-MCP-SERVER 0.1.3, ADR decision:0006, GH #9).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    // Created as In_review and patched to Done AFTER relations land:
    // plan:val requires a Done task to carry a plan:Verifies edge, and the
    // builder commits primitives before relations (GH #1 create-time rule).
    status: "In_review",
    priority: "P0",
    planned_start: "2026-08-28",
    planned_finish: "2026-08-28",
    wbs: "wbs:p1-mcp-slice-2",
  },
  {
    id: "task:p1-tests",
    name: "p1-tests",
    summary:
      "End-to-end JSON-RPC smoke against fdpm-mcp via stdio: subscribe, modify workbook log, observe notification; oversized render → quota envelope; each new provider returns content.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-05-26",
    planned_finish: "2026-05-29",
    wbs: "wbs:p1-mcp-slice-2",
  },

  // ── Phase 2: MCP Tier-3 hardening ────────────────────────────────
  {
    id: "task:p2-dry-run",
    name: "p2-tier3-dry-run",
    summary:
      "Add `dry_run: boolean` to every Tier-3 tool input schema. When true, the tool runs the validation pipeline + computes the would-affect set but does NOT call host.delete*. Returns the would-affect summary.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-06-01",
    planned_finish: "2026-06-04",
    wbs: "wbs:p2-mcp-tier3-hardening",
  },
  {
    id: "task:p2-idempotency",
    name: "p2-tier3-idempotency",
    summary:
      "Require an `idempotency_key: string` on every Tier-3 tool call. Server stores (tool_name, key) → first_seen_at in a TTL map (~5 min). Re-issue with same key returns the cached result; re-issue with different key after the TTL succeeds normally.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-06-05",
    planned_finish: "2026-06-08",
    wbs: "wbs:p2-mcp-tier3-hardening",
  },
  {
    id: "task:p2-audit-gates",
    name: "p2-audit-pre-execution",
    summary:
      "Write the McpAuditLog entry BEFORE invoking host.delete* (today it's after) — on crash the audit shows intent; on success it's amended with outcome=ok. Add a debounce gate: refuse re-issue if the prior same-workbook audit entry is <100ms old.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-06-09",
    planned_finish: "2026-06-11",
    wbs: "wbs:p2-mcp-tier3-hardening",
  },
  {
    id: "task:p2-tests",
    name: "p2-tests",
    summary:
      "Tests covering: dry-run returns correct would-affect; idempotency key dedupes within TTL; pre-execution audit entry persists across simulated crash; debounce refuses sub-100ms re-issue.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-06-12",
    planned_finish: "2026-06-14",
    wbs: "wbs:p2-mcp-tier3-hardening",
  },

  // ── Phase 3: REPL v0.2 ───────────────────────────────────────────
  {
    id: "task:p3-streaming",
    name: "p3-streaming",
    summary:
      "Long renders (>1 MB) stream partial chunks to stdout in JSON mode. Each chunk: `{stream_id, seq, final, bytes_chunk}` envelope. Renderer needs an optional streaming hook the REPL drives.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-06-16",
    planned_finish: "2026-06-22",
    wbs: "wbs:p3-repl-v02",
  },
  {
    id: "task:p3-multiline",
    name: "p3-multiline",
    summary:
      "Trailing backslash continues input across lines. Continuation prompt `... > ` on stderr. Cancel via Ctrl-C clears the in-progress buffer.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-06-23",
    planned_finish: "2026-06-25",
    wbs: "wbs:p3-repl-v02",
  },
  {
    id: "task:p3-completion",
    name: "p3-completion-expansion",
    summary:
      "Tab completion learns: profile ids after `--profile`, primitive ids after `--id`/`get`/`patch` second arg, type ids after `--type`. Sourced from registry only (per SPEC-REPL §8.6 — never from filesystem).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-06-26",
    planned_finish: "2026-06-29",
    wbs: "wbs:p3-repl-v02",
  },
  {
    id: "task:p3-tests",
    name: "p3-tests",
    summary:
      "Tests: streaming render produces N+1 chunks (N data + 1 final flag); multi-line via spawn-with-stdin-pipe assembles correctly; completion returns expected candidates for known fixtures.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-06-29",
    planned_finish: "2026-06-30",
    wbs: "wbs:p3-repl-v02",
  },

  // ── Phase 4: SECTIONS-TREE v0.2 ──────────────────────────────────
  {
    id: "task:p4-codemod-write",
    name: "p4-codemod-write",
    summary:
      "Implement fdpm-cli/scripts/migrate-section-numbers.ts. Parses build-spec-*.ts, replaces hand-authored `number: \"N\"` with the dnis:Node path, drops legacy spec:Section. Per-script byte-diff gate: refuses to write if pre/post output differs.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-07-01",
    planned_finish: "2026-07-07",
    wbs: "wbs:p4-sections-tree-v02",
  },
  {
    id: "task:p4-codemod-apply",
    name: "p4-codemod-apply",
    summary:
      "Run the codemod across every build-spec-*.ts. Commit each migrated script in a separate commit so reviewers can see one-at-a-time diffs. Re-render every SPEC and confirm byte-equal output.",
    kind: "Implementation",
    executor: "Human",
    human_estimate: "1 day",
    status: "Backlog",
    priority: "P0",
    planned_start: "2026-07-08",
    planned_finish: "2026-07-09",
    wbs: "wbs:p4-sections-tree-v02",
  },
  {
    id: "task:p4-deprecation-removal",
    name: "p4-deprecation-removal",
    summary:
      "Remove the spec:Section.number field from the active schema OR escalate the deprecation to an error finding (decide based on whether any external workbook still uses it). Update SPEC-SECTIONS-TREE §11 / §15.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-07-10",
    planned_finish: "2026-07-12",
    wbs: "wbs:p4-sections-tree-v02",
  },
  {
    id: "task:p4-spec-stable",
    name: "p4-spec-stable",
    summary:
      "Flip SPEC-SECTIONS-TREE status from Proposal to Stable in build-spec-sections-tree.ts; re-render docs/specs/SPEC-SECTIONS-TREE.md.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 20,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-07-13",
    planned_finish: "2026-07-15",
    wbs: "wbs:p4-sections-tree-v02",
  },

  // ── Phase 5: DNIS migration of remaining build-spec-*.ts ─────────
  {
    id: "task:p5-audit",
    name: "p5-audit-remaining",
    summary:
      "Audit which build-spec-*.ts under fdpm-cli/scripts/ still hand-author `number` on spec:Section / fs:Section. Produce a spreadsheet (or just a markdown table) of (script, section_count, profile_id).",
    kind: "Investigation",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-07-16",
    planned_finish: "2026-07-17",
    wbs: "wbs:p5-dnis-migration-rest",
  },
  {
    id: "task:p5-migrate-scripts",
    name: "p5-migrate-scripts",
    summary:
      "Migrate each script identified by p5-audit to use dnis:Node sections via DnisHostAdapter. Re-render and confirm byte-equal output (the DNIS path's DFS numbering should match the legacy compareSectionNumbers output for any well-formed SPEC).",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P1",
    planned_start: "2026-07-20",
    planned_finish: "2026-07-28",
    wbs: "wbs:p5-dnis-migration-rest",
  },
  {
    id: "task:p5-legacy-removal-tracked",
    name: "p5-legacy-removal-tracked",
    summary:
      "Add a tracking-issue or SPEC-CORE follow-up entry for removing renderSectionsLegacy in spec_md.ts (the function is dead code once every script is migrated). Keep a one-release deprecation window before removal.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 20,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-07-29",
    planned_finish: "2026-07-31",
    wbs: "wbs:p5-dnis-migration-rest",
  },

  // ── Phase 6: Plugin lifecycle ────────────────────────────────────
  {
    id: "task:p6-partial-failure",
    name: "p6-partial-failure",
    summary:
      "Make :reload plugins survive a single plugin's activate() throwing. Today the reload aborts mid-way through. Fix: catch per-plugin, mark as `quarantined`, continue with the rest. Surface the count of quarantined plugins in the reload result.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-01",
    planned_finish: "2026-08-05",
    wbs: "wbs:p6-plugin-lifecycle",
  },
  {
    id: "task:p6-incremental",
    name: "p6-incremental-discovery",
    summary:
      "Plugin discovery currently rescans every dir on every load. Cache (dir, mtime_ns) and skip unchanged dirs. Cache invalidates on :reload plugins. Saves wall-clock on REPL :reload and MCP SIGHUP.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-06",
    planned_finish: "2026-08-10",
    wbs: "wbs:p6-plugin-lifecycle",
  },
  {
    id: "task:p6-spec-doc",
    name: "p6-spec-plugin-lifecycle",
    summary:
      "Write SPEC-PLUGIN-LIFECYCLE: documents activation order (profile-deps first, capability-deps next), partial-failure semantics, and the incremental-discovery contract. Either as a fresh SPEC under docs/specs/ or as a §-level addition to SPEC-CORE.",
    kind: "Documentation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-11",
    planned_finish: "2026-08-15",
    wbs: "wbs:p6-plugin-lifecycle",
  },

  // ── Phase 7: Cross-plugin search ─────────────────────────────────
  {
    id: "task:p7-host-impl",
    name: "p7-host-search-across",
    summary:
      "Add Host.searchPrimitivesAcross(filters) that walks every loaded workbook and returns a flat array of (workbook_id, primitive). Reuses the per-workbook searchPrimitives implementation; coalesces results by id when --dedupe is passed.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-16",
    planned_finish: "2026-08-19",
    wbs: "wbs:p7-cross-plugin-search",
  },
  {
    id: "task:p7-cli-flags",
    name: "p7-cli-cross-search-flags",
    summary:
      "Extend `fdpm primitive search` with --across-workbooks, --type-class GLOB (e.g. `*:Section` matches spec:Section, fs:Section, sw:Section), --field-equals key=value (multiple). Output groups results by workbook_id in human mode, flat array in JSON mode.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-20",
    planned_finish: "2026-08-22",
    wbs: "wbs:p7-cross-plugin-search",
  },
  {
    id: "task:p7-tests",
    name: "p7-tests",
    summary:
      "Tests against a multi-workbook fixture (3 workbooks, 2 profiles, ~20 primitives total). Cover: --across-workbooks returns all matches, --type-class glob matches across profiles, --field-equals composes with the others.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-23",
    planned_finish: "2026-08-25",
    wbs: "wbs:p7-cross-plugin-search",
  },

  // ── Phase 8: Docs cleanup ────────────────────────────────────────
  {
    id: "task:p8-design",
    name: "p8-design-decision",
    summary:
      "Decide between (a) generating MANUAL.md + README.md env tables from src/core/config/env.ts at build time, or (b) introducing a content-include mechanism (e.g. <!--include:env-table--> markers replaced by a script). (a) is simpler; (b) is more flexible.",
    kind: "Investigation",
    executor: "Either",
    ai_minutes: 45,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-25",
    planned_finish: "2026-08-26",
    wbs: "wbs:p8-docs-cleanup",
  },
  {
    id: "task:p8-implementation",
    name: "p8-implementation",
    summary:
      "Implement the chosen approach from p8-design. Either way: env-contract test passes after adding a new env var without manual MANUAL.md / README.md edits.",
    kind: "Implementation",
    executor: "Either",
    ai_minutes: 60,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-27",
    planned_finish: "2026-08-30",
    wbs: "wbs:p8-docs-cleanup",
  },
  {
    id: "task:p8-tests",
    name: "p8-tests",
    summary:
      "Update tests/env-contract.test.ts to reflect the new generation/include mechanism. Add a regression test: adding a fake env var to env.ts triggers regeneration and the test re-passes without manual edits.",
    kind: "Test",
    executor: "Either",
    ai_minutes: 30,
    status: "Backlog",
    priority: "P2",
    planned_start: "2026-08-31",
    planned_finish: "2026-08-31",
    wbs: "wbs:p8-docs-cleanup",
  },
];

const taskSpecs: PrimitiveSpec[] = tasks.map((t) => ({
  id: t.id,
  type: PLAN_TASK,
  scope: SCOPE_IDS.workbook,
  fields: {
    name: t.name,
    summary: t.summary,
    kind: t.kind,
    executor_kind: t.executor,
    status: t.status,
    priority: t.priority,
    is_root: true,
    ...(t.ai_minutes !== undefined ? { ai_minutes: t.ai_minutes } : {}),
    ...(t.human_estimate !== undefined ? { human_estimate: t.human_estimate } : {}),
    ...(t.planned_start ? { planned_start: t.planned_start } : {}),
    ...(t.planned_finish ? { planned_finish: t.planned_finish } : {}),
  },
}));

// ── Blockers (active, in-flight) ──────────────────────────────────

const blockerSpecs: PrimitiveSpec[] = [
  {
    id: "blocker:resource-size-cap-design",
    type: PLAN_BLOCKER,
    scope: SCOPE_IDS.workbook,
    fields: {
      description:
        "FDPM_MCP_MAX_RESOURCE_BYTES default needs operator agreement: 1 MiB is friendly to LLM context budgets but rejects most real PDF outputs. Options: (a) 1 MiB hard cap with --enable-large-resources opt-in; (b) different caps per content_type (text=1MB, binary=10MB); (c) no cap, document the risk. Decision blocks p1-sizecap.",
      severity: "Medium",
      discovered_at: "2026-05-05",
    },
  },
  {
    id: "blocker:codemod-byte-equal-strategy",
    type: PLAN_BLOCKER,
    scope: SCOPE_IDS.workbook,
    fields: {
      description:
        "p4-codemod-write's byte-equal gate may legitimately fail for SPECs where the legacy compareSectionNumbers ordering differs subtly from DFS-of-(parent_node_id, position). Need to decide: (a) hand-fix divergent SPECs and document the fix, (b) accept a short list of intentionally-divergent SPECs with explanation, (c) discover none diverge in practice. Resolution requires running the codemod against the corpus first.",
      severity: "Medium",
      discovered_at: "2026-05-05",
    },
  },
];

// ── Relations ─────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Every task lives in the Q2 iteration.
  ...tasks.map((t, i) => ({
    id: `rel:in-iter-${i}`,
    type: PLAN_REL_IN_ITERATION,
    from: t.id,
    to: ITERATION_ID,
  })),
  // Every task is contained by its phase's WBS.
  ...tasks.map((t, i) => ({
    id: `rel:contains-${i}`,
    type: PLAN_REL_CONTAINS,
    from: t.wbs,
    to: t.id,
  })),

  // ── Within-phase dependencies (linear by planned dates) ─────────
  // Phase 1: subscribe + sizecap independent; providers + tests after.
  { id: "rel:p1-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p1-providers", to: "task:p1-sizecap" },
  { id: "rel:p1-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p1-tests", to: "task:p1-subscribe" },
  { id: "rel:p1-dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:p1-tests", to: "task:p1-sizecap" },
  { id: "rel:p1-dep-4", type: PLAN_REL_DEPENDS_ON, from: "task:p1-tests", to: "task:p1-providers" },
  { id: "rel:p1-dep-5", type: PLAN_REL_DEPENDS_ON, from: "task:p1-server-instructions", to: "task:p1-catalog-budget" },

  // Phase 2: dry-run first, then idempotency, then audit gates, then tests.
  { id: "rel:p2-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p2-idempotency", to: "task:p2-dry-run" },
  { id: "rel:p2-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p2-audit-gates", to: "task:p2-idempotency" },
  { id: "rel:p2-dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:p2-tests", to: "task:p2-audit-gates" },

  // Phase 3: streaming, multiline, completion are independent; tests after.
  { id: "rel:p3-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p3-tests", to: "task:p3-streaming" },
  { id: "rel:p3-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p3-tests", to: "task:p3-multiline" },
  { id: "rel:p3-dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:p3-tests", to: "task:p3-completion" },

  // Phase 4: write codemod → apply → deprecation removal → spec stable.
  { id: "rel:p4-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p4-codemod-apply", to: "task:p4-codemod-write" },
  { id: "rel:p4-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p4-deprecation-removal", to: "task:p4-codemod-apply" },
  { id: "rel:p4-dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:p4-spec-stable", to: "task:p4-deprecation-removal" },

  // Phase 5: audit → migrate → tracking note.
  { id: "rel:p5-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p5-migrate-scripts", to: "task:p5-audit" },
  { id: "rel:p5-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p5-legacy-removal-tracked", to: "task:p5-migrate-scripts" },

  // Phase 6: partial-failure first, incremental-discovery alongside, spec doc last.
  { id: "rel:p6-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p6-incremental", to: "task:p6-partial-failure" },
  { id: "rel:p6-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p6-spec-doc", to: "task:p6-partial-failure" },
  { id: "rel:p6-dep-3", type: PLAN_REL_DEPENDS_ON, from: "task:p6-spec-doc", to: "task:p6-incremental" },

  // Phase 7: host impl → cli flags → tests.
  { id: "rel:p7-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p7-cli-flags", to: "task:p7-host-impl" },
  { id: "rel:p7-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p7-tests", to: "task:p7-cli-flags" },

  // Phase 8: design → implementation → tests.
  { id: "rel:p8-dep-1", type: PLAN_REL_DEPENDS_ON, from: "task:p8-implementation", to: "task:p8-design" },
  { id: "rel:p8-dep-2", type: PLAN_REL_DEPENDS_ON, from: "task:p8-tests", to: "task:p8-implementation" },

  // ── Cross-phase dependencies ───────────────────────────────────
  // P5 (DNIS migration) is more comfortable AFTER P4 (sections-tree v0.2)
  // since the codemod ships first.
  { id: "rel:cross-p5-p4", type: PLAN_REL_DEPENDS_ON, from: "task:p5-migrate-scripts", to: "task:p4-codemod-apply" },
  // P3 (REPL streaming) benefits from P1 size cap design
  // (similar size-budget question, easier to settle once).
  { id: "rel:cross-p3-p1", type: PLAN_REL_DEPENDS_ON, from: "task:p3-streaming", to: "task:p1-sizecap" },

  // ── Verifies edges ─────────────────────────────────────────────
  { id: "rel:ver-p1-1", type: PLAN_REL_VERIFIES, from: "task:p1-subscribe", to: "ac:p1-subs-and-sizecap" },
  { id: "rel:ver-p1-2", type: PLAN_REL_VERIFIES, from: "task:p1-sizecap", to: "ac:p1-subs-and-sizecap" },
  { id: "rel:ver-p1-3", type: PLAN_REL_VERIFIES, from: "task:p1-providers", to: "ac:p1-subs-and-sizecap" },
  { id: "rel:ver-p1-4", type: PLAN_REL_VERIFIES, from: "task:p1-catalog-budget", to: "ac:p1-subs-and-sizecap" },
  { id: "rel:ver-p1-5", type: PLAN_REL_VERIFIES, from: "task:p1-server-instructions", to: "ac:p1-subs-and-sizecap" },
  { id: "rel:ver-p2-1", type: PLAN_REL_VERIFIES, from: "task:p2-dry-run", to: "ac:p2-tier3-hardened" },
  { id: "rel:ver-p2-2", type: PLAN_REL_VERIFIES, from: "task:p2-idempotency", to: "ac:p2-tier3-hardened" },
  { id: "rel:ver-p2-3", type: PLAN_REL_VERIFIES, from: "task:p2-audit-gates", to: "ac:p2-tier3-hardened" },
  { id: "rel:ver-p3-1", type: PLAN_REL_VERIFIES, from: "task:p3-streaming", to: "ac:p3-repl-streaming" },
  { id: "rel:ver-p3-2", type: PLAN_REL_VERIFIES, from: "task:p3-multiline", to: "ac:p3-repl-streaming" },
  { id: "rel:ver-p3-3", type: PLAN_REL_VERIFIES, from: "task:p3-completion", to: "ac:p3-repl-streaming" },
  { id: "rel:ver-p4-1", type: PLAN_REL_VERIFIES, from: "task:p4-codemod-apply", to: "ac:p4-sections-tree-stable" },
  { id: "rel:ver-p4-2", type: PLAN_REL_VERIFIES, from: "task:p4-spec-stable", to: "ac:p4-sections-tree-stable" },
  { id: "rel:ver-p5-1", type: PLAN_REL_VERIFIES, from: "task:p5-migrate-scripts", to: "ac:p5-dnis-everywhere" },
  { id: "rel:ver-p5-2", type: PLAN_REL_VERIFIES, from: "task:p5-legacy-removal-tracked", to: "ac:p5-dnis-everywhere" },
  { id: "rel:ver-p6-1", type: PLAN_REL_VERIFIES, from: "task:p6-partial-failure", to: "ac:p6-plugin-lifecycle-safe" },
  { id: "rel:ver-p6-2", type: PLAN_REL_VERIFIES, from: "task:p6-incremental", to: "ac:p6-plugin-lifecycle-safe" },
  { id: "rel:ver-p6-3", type: PLAN_REL_VERIFIES, from: "task:p6-spec-doc", to: "ac:p6-plugin-lifecycle-safe" },
  { id: "rel:ver-p7-1", type: PLAN_REL_VERIFIES, from: "task:p7-host-impl", to: "ac:p7-search-cross-plugin" },
  { id: "rel:ver-p7-2", type: PLAN_REL_VERIFIES, from: "task:p7-cli-flags", to: "ac:p7-search-cross-plugin" },
  { id: "rel:ver-p8-1", type: PLAN_REL_VERIFIES, from: "task:p8-design", to: "ac:p8-docs-single-source" },
  { id: "rel:ver-p8-2", type: PLAN_REL_VERIFIES, from: "task:p8-implementation", to: "ac:p8-docs-single-source" },

  // ── Milestone hits ─────────────────────────────────────────────
  { id: "rel:mile-p1", type: PLAN_REL_HITS_MILESTONE, from: "task:p1-tests", to: "milestone:p1-ships" },
  { id: "rel:mile-p2", type: PLAN_REL_HITS_MILESTONE, from: "task:p2-tests", to: "milestone:p2-ships" },
  { id: "rel:mile-p3", type: PLAN_REL_HITS_MILESTONE, from: "task:p3-tests", to: "milestone:p3-ships" },
  { id: "rel:mile-p4", type: PLAN_REL_HITS_MILESTONE, from: "task:p4-spec-stable", to: "milestone:p4-ships" },
  { id: "rel:mile-p5", type: PLAN_REL_HITS_MILESTONE, from: "task:p5-legacy-removal-tracked", to: "milestone:p5-ships" },
  { id: "rel:mile-p6", type: PLAN_REL_HITS_MILESTONE, from: "task:p6-spec-doc", to: "milestone:p6-ships" },
  { id: "rel:mile-p7", type: PLAN_REL_HITS_MILESTONE, from: "task:p7-tests", to: "milestone:p7-ships" },
  { id: "rel:mile-p8", type: PLAN_REL_HITS_MILESTONE, from: "task:p8-tests", to: "milestone:p8-ships" },

  // ── Blocker edges (BlockedBy: task → blocker) ─────────────────
  { id: "rel:blk-p1-sizecap", type: PLAN_REL_BLOCKED_BY, from: "task:p1-sizecap", to: "blocker:resource-size-cap-design" },
  { id: "rel:blk-p4-codemod", type: PLAN_REL_BLOCKED_BY, from: "task:p4-codemod-write", to: "blocker:codemod-byte-equal-strategy" },
];

// ── Commit ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const host = await openHost();
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "FDPM 2026-Q2 roadmap",
    profile: PROFILE_ID,
    description:
      "Eight-phase roadmap for FDPM 2026-Q2: MCP slice 2 → Tier-3 hardening → REPL v0.2 → SECTIONS-TREE v0.2 → DNIS migration → plugin lifecycle → cross-plugin search → docs cleanup. One iteration, one WBS per phase, ~24 tasks, 8 milestones, 8 acceptance criteria, 2 active blockers.",
  })
    .primitives([
      ...iterationSpecs,
      ...wbsSpecs,
      ...milestoneSpecs,
      ...acSpecs,
      ...blockerSpecs,
      ...taskSpecs,
    ])
    .relations(relations)
    .commit();

  // Shipped tasks: flip to Done now that their plan:Verifies edges exist.
  const shipped = ["task:p1-catalog-budget", "task:p1-server-instructions"];
  for (const id of shipped) {
    const { report } = await host.patchPrimitive(PROJECT_ID, {
      id,
      field_values: { status: "Done" },
    });
    if (!report.accepted) {
      throw new Error(`could not mark ${id} Done: ${JSON.stringify(report.findings)}`);
    }
  }

  console.log("Built workbook:", result.workbook_id);
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);
  console.log("  revision:  ", result.revision);
  console.log("");
  console.log("Render:");
  console.log(
    `  FDPM_DATA_DIR=${process.env["FDPM_DATA_DIR"] ?? "/tmp/fdpm-plan-roadmap-q2"} npx tsx fdpm-cli/src/bin/fdpm.ts \\`,
  );
  console.log(
    `    render ${PROJECT_ID} text/markdown --renderer-id plan:RoadmapRenderer \\`,
  );
  console.log(`    -o docs/planning/roadmap-2026-q2.md`);
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
