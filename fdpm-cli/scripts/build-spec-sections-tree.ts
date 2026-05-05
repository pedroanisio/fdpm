/**
 * Build SPEC-SECTIONS-TREE v0.2 — "Model section structure as DNIS
 * Nodes; derive §N.M.K numbering from a DFS of the dnis:Node graph"
 * — using the `fdpm.spec-authoring-dnis` composition profile.
 *
 * v0.2 supersedes v0.1's "add order:int to spec:HasSection" proposal.
 * Rationale: SPEC-CORE 1.2 §5.6 (commit 3bcced2) ships a SPEC-DNIS
 * adoption that already provides paragraph-grain identity with stable
 * NIDs and fractional-index Position semantics. Rather than introduce
 * a parallel ordering mechanism on spec:HasSection, the proposal now
 * adopts DNIS Nodes as the canonical section primitive: each
 * spec:Section becomes a dnis:Node with kind="section" whose content
 * carries title + body_md + dispatch_kind. Sibling order comes from
 * SPEC-DNIS Position (string-comparable per SPEC-DNIS §6.1) — the
 * Insertion Property holds, so inserting between any two siblings is
 * O(1) regardless of how dense the neighbourhood is. Tiebreak
 * concerns (Q-1 in v0.1) disappear because Position has no ties.
 *
 * This script demonstrates the new authoring pattern: construct
 * typed spec-authoring primitives (Document, Term, Stakeholder, ADR,
 * Reference, …) the usual way; construct the section tree via
 * DnisHostAdapter calls. The composed profile permits both.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-sections-tree
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx fdpm-cli/scripts/build-spec-sections-tree.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-sections-tree text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-SECTIONS-TREE.md
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import {
  // Primitive type ids
  SPEC_DOCUMENT,
  SPEC_TERM,
  SPEC_STAKEHOLDER,
  SPEC_QUALITY_ATTRIBUTE,
  SPEC_INVARIANT,
  SPEC_OPTION,
  SPEC_ADR,
  SPEC_TRADEOFF_AXIS,
  SPEC_QA_SCENARIO,
  SPEC_REQUIREMENT,
  SPEC_ACCEPTANCE_CRITERION,
  SPEC_CONFORMANCE_ITEM,
  SPEC_IMPLEMENTATION_CHANGE,
  SPEC_MIGRATION_STEP,
  SPEC_RISK,
  SPEC_MITIGATION,
  SPEC_OPEN_QUESTION,
  SPEC_FUTURE_WORK,
  SPEC_REFERENCE,
  SPEC_REVISION,
  // Relation type ids
  SPEC_REL_DEFINES,
  SPEC_REL_CONSIDERS,
  SPEC_REL_CHOSE,
  SPEC_REL_HAS_TRADEOFF,
  SPEC_REL_TARGETS,
  SPEC_REL_MITIGATES,
  SPEC_REL_DEPENDS_ON,
  SPEC_REL_VERIFIES,
  SPEC_REL_RESOLVES,
  SPEC_REL_CITES,
  SPEC_REL_REQUIRED_READ,
  SPEC_REL_REVISED_IN,
} from "../plugins/spec_authoring/index.js";
import { PROFILE_ID } from "../plugins/spec_authoring_dnis/index.js";
import { DnisHostAdapter } from "../src/core/dnis/adapter.js";
import {
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
  type Position,
} from "../src/core/dnis/index.js";
import { mintUid } from "../src/core/identity/uid.js";
import {
  SPEC_CORE_PATH,
  SPEC_DNIS_PATH,
  SPEC_RENDER_DSL_PATH,
  SPEC_SECTIONS_TREE_PATH,
  SPEC_UID_PATH,
} from "./_spec-paths.js";

const PROJECT_ID = "spec-sections-tree";
const AGENT = "agent:build-spec-sections-tree" as AgentId;

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:sections-tree",
  type: SPEC_DOCUMENT,
  fields: {
    title: "SPEC — Sections-as-DNIS-Tree: Adopt SPEC-DNIS for Section Identity and Order v0.2",
    subtitle:
      "Stop hand-authoring `number` on every spec:Section. Adopt SPEC-DNIS: each section is a dnis:Node; the renderer DFS-walks the DNIS Node graph and derives §N.M.K from the path.",
    spec_id: "spec:fdpm:sections-tree:0.2",
    version: "0.2.0",
    status: "Proposal",
    audience:
      "FDPM core maintainers, spec_authoring plugin maintainers, and any author of a `fdpm-cli/scripts/build-spec-*.ts` script who has had to renumber sections after inserting one.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      SPEC_CORE_PATH,
      SPEC_DNIS_PATH,
      SPEC_UID_PATH,
    ],
    companion_code: "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
    peer_spec: SPEC_DNIS_PATH,
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Hand-authored section numbers are an unverified mirror of authorial intent: the " +
      "operator types `number: \"7\"` on a primitive whose actual position in the " +
      "document tree is determined by the order of `spec:HasSection` relations (or, " +
      "under v0.2, by the DNIS Position field on dnis:Node). The two drift silently — " +
      "inserting a section between §6 and §7 leaves either the new section at the wrong " +
      "number or the old §7 with a stale string. An identifier system that cannot answer " +
      "'where in the tree am I?' from its own edges is the absence-of-verification this " +
      "banner forbids. v0.2 closes this gap by adopting SPEC-DNIS: identity and position " +
      "are first-class, immutable except via typed Operations, and replay-deterministic " +
      "by construction (SPEC-CORE 1.2 §5.6.6).",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring-dnis)",
    revision_note:
      "0.2.0 — pivot from \"add order:int to spec:HasSection\" to \"adopt SPEC-DNIS for section identity and order.\" The integer-with-sparse-convention proposal of v0.1 is obsoleted by SPEC-DNIS Position; tiebreak concerns disappear; mixed-mode rendering is normative.",
    source_script: "fdpm-cli/scripts/build-spec-sections-tree.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-sections-tree",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx fdpm-cli/scripts/build-spec-sections-tree.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-sections-tree text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      `  -o ${SPEC_SECTIONS_TREE_PATH}`,
    ].join("\n"),
  },
};

// ── §5 Definitions (Term primitives) ──────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "Section tree",
    "The directed graph formed by `dnis:Node` primitives whose `kind` is `section`, rooted at a `dnis:Document`. Children point at parents via `parent_node_id`. The renderer walks this tree via DFS sorted by SPEC-DNIS Position; §N.M.K headings are derived from the path. _(also: document tree)_",
    "document tree",
  ],
  [
    "DNIS Position",
    "The fractional-index string SPEC-DNIS §6 mints for each Node. Two Positions a < b admit a Position c with a < c < b without modifying a or b (the §6.2 Insertion Property). Comparable as opaque byte strings. v0.2 adopts this as the sibling-ordering key for spec sections; the integer `order` field of v0.1 is dropped.",
  ],
  [
    "Section dispatch_kind",
    "An optional string inside a `dnis:Node`'s `content` JSON that names the kind dispatcher (`adr`, `stakeholders`, `references`, …). The renderer reads it and routes to KIND_RENDERERS — identical mechanism to v0.1's `kind` field on `spec:Section`, just relocated.",
  ],
  [
    "Mixed-mode workbook",
    "A workbook that contains BOTH `spec:Section` primitives and `dnis:Node` primitives of kind `section`. The renderer treats this as a defect: it emits a `spec:render:mixed-mode-sections` warning, prefers the DNIS path, and ignores the `spec:Section` primitives. Authors are expected to migrate or remove the legacy primitives.",
  ],
  [
    "Authored number (deprecated)",
    "The `number` field on `spec:Section` as it exists today — a hand-typed string like '7' or '12.3.1'. Becomes a fallback only for workbooks that have NOT yet adopted DNIS Nodes; under v0.2 it is silently honored on the legacy spec:Section path and silently ignored on the DNIS path. Removed in a future SPEC version once all in-tree build scripts are migrated.",
  ],
];

const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: SPEC_TERM,
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── §2 Stakeholders ────────────────────────────────────────────────────────

const stakeholders: Array<{
  id: string;
  role: string;
  primary_concern: string;
  category?: string;
}> = [
  {
    id: "spec:stk:build-script-author",
    role: "SPEC build-script author",
    primary_concern:
      "Insert a section without renumbering twenty downstream `number` strings. Today every insertion in build-spec-*.ts is a sed-style ripple; under v0.2 it is one DnisHostAdapter.apply({type:'create',position:positionBetween(left,right)}) call.",
  },
  {
    id: "spec:stk:renderer-maintainer",
    role: "spec_md renderer maintainer",
    primary_concern:
      "One canonical numbering algorithm; no two sources of truth (graph vs. string). v0.2 forks renderSections by detection: dnis:Document present ⇒ DFS the DNIS Node graph; otherwise fall back to the legacy spec:Section path. The two paths share the KIND_RENDERERS dispatch table.",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Read the rendered SPEC and see correct, contiguous numbering. Edit a section with `fdpm dnis edit` (the SPEC-CORE 1.2 §5.6 CLI) without thinking about whether `number` matches its position.",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Continue authoring sections with stable IDs; do not learn a new numbering API. Migration is a one-time codemod, not a behavioural change. spec:Section keeps working forever for plugins that don't opt into DNIS.",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "Numbering must be deterministic across replays (SPEC-CORE §5.5.3, §5.6.6). DFS over DNIS Position is deterministic by construction since Position is immutable except via typed Operations, and SPEC-CORE §5.6.2 guarantees op-log ordering across replays.",
  },
];

const stakeholderSpecs: PrimitiveSpec[] = stakeholders.map((s) => ({
  id: s.id,
  type: SPEC_STAKEHOLDER,
  fields: { role: s.role, primary_concern: s.primary_concern },
}));

// ── §3 Quality Attributes ──────────────────────────────────────────────────

const qas: Array<{ id: string; attribute: string; pressure: string; priority: string }> = [
  {
    id: "spec:qa:single-source",
    attribute: "Single source of truth",
    pressure:
      "The document's section structure must be derivable from one artifact. Today the graph and the `number` strings are two artifacts that can disagree. Under v0.2 the DNIS Node graph is canonical; mixed-mode is a warning, not a feature.",
    priority: "primary",
  },
  {
    id: "spec:qa:author-ergonomics",
    attribute: "Author ergonomics",
    pressure:
      "Inserting one section must require O(1) edits, not O(N). DNIS Position satisfies this for arbitrary insert points (the §6.2 Insertion Property is total — no sparse-convention discipline required).",
    priority: "primary",
  },
  {
    id: "spec:qa:replay-determinism",
    attribute: "Replay determinism",
    pressure:
      "Numbering must be a deterministic function of the operation log. DFS over DNIS Position qualifies because Position is a string and the op log records every Operation that creates/moves/retires a Node (SPEC-CORE §5.6.2).",
    priority: "primary",
  },
  {
    id: "spec:qa:back-compat",
    attribute: "Backward compatibility",
    pressure:
      "Existing build-spec-*.ts scripts must continue to render correctly without code changes. The renderer keeps the legacy spec:Section path intact; only workbooks that explicitly construct dnis:Document + dnis:Node primitives switch to the new path.",
    priority: "primary",
  },
];

const qaSpecs: PrimitiveSpec[] = qas.map((q) => ({
  id: q.id,
  type: SPEC_QUALITY_ATTRIBUTE,
  fields: { attribute: q.attribute, pressure: q.pressure, priority: q.priority },
}));

// ── §4 Principles / Invariants ────────────────────────────────────────────

const principles: Array<{
  id: string;
  label: string;
  statement: string;
  enforcement: "ci_check" | "runtime_check" | "type_system" | "review" | "manual" | "unenforced";
}> = [
  {
    id: "spec:inv:graph-is-truth",
    label: "Graph-is-truth",
    statement:
      "When the workbook contains a `dnis:Document`, the section structure is fully determined by `dnis:Node` primitives whose `kind` is `section`, rooted at that document via `parent_node_id`. No other artifact (no authored `number`, no DSL fragment, no plugin override) may contribute to that structure. If two artifacts can describe the same fact, they will eventually disagree; eliminate one. In a mixed-mode workbook the DNIS path wins and the renderer emits a warning so the operator sees the conflict.",
    enforcement: "ci_check",
  },
  {
    id: "spec:inv:dnis-position-canonical",
    label: "DNIS-Position-canonical",
    statement:
      "Among siblings of one parent, the rendered order is the lexicographic order of `position` strings (SPEC-DNIS §6.1 total-order property). No additional ordering field is permitted on the relation graph. SPEC-DNIS already pays the operator-readability cost of fractional indexing; adding a parallel integer key (the v0.1 proposal) would re-introduce the dual-source-of-truth bug we are trying to eliminate.",
    enforcement: "type_system",
  },
  {
    id: "spec:inv:replay-determinism",
    label: "Replay-determinism",
    statement:
      "Re-rendering a SPEC document from a fresh replay of its SPEC-CORE op log MUST produce byte-equal Markdown. DNIS Position values are committed to the op log at create time and never mutate without an explicit `move` Operation (also logged). SPEC-CORE §5.5.3 / §5.6.6 are the binding requirement; this principle is its restatement at the spec-authoring layer.",
    enforcement: "ci_check",
  },
  {
    id: "spec:inv:legacy-fallback-non-canonical",
    label: "Legacy-fallback-non-canonical",
    statement:
      "When a workbook contains `dnis:Document` AND `spec:Section` primitives simultaneously, the DNIS path is canonical and the spec:Section primitives are ignored by the renderer. The renderer emits a `spec:render:mixed-mode-sections` warning. Pure spec:Section workbooks (no dnis:Document) continue to render via the legacy path indefinitely. We do not break existing build-spec-*.ts scripts.",
    enforcement: "runtime_check",
  },
];

const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: SPEC_INVARIANT,
  fields: { label: p.label, statement: p.statement, enforcement: p.enforcement },
}));

// ── §6 / §7 ADR — Decision Record ──────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:adopt-dnis",
  type: SPEC_OPTION,
  fields: {
    label: "Adopt SPEC-DNIS for section identity and order",
    description:
      "Each spec section becomes a `dnis:Node` of kind `section`, anchored at a `dnis:Document` root. SPEC-DNIS Position drives sibling order (Insertion Property is total — O(1) inserts at any density). Renderer DFS-walks the dnis:Node graph and derives §N.M.K from the path. spec:Section + spec:HasSection stay registered for legacy workbooks but are non-canonical when DNIS Nodes are present.",
    pros: [
      "Single source of truth — the DNIS Node graph is canonical.",
      "Inserts are O(1) at arbitrary density (DNIS §6.2 Insertion Property is total).",
      "Tiebreak concerns of v0.1 (Q-1) disappear because Position has no ties.",
      "Replay determinism inherits from SPEC-CORE 1.2 §5.6.6 — no new conformance fixture required.",
      "Cycle prevention is enforced by SPEC-DNIS §7.3 move precondition; no new validator needed.",
      "Reuses SPEC-DNIS infrastructure: typed Operations (create/move/retire), op-log audit trail, idempotency by OperationId, lineage via dnis:DerivedFrom — none of which the v0.1 order:int proposal got for free.",
    ],
    cons: [
      "Requires a workbook to be on the composed `profile:spec-authoring-dnis:0.1` profile (not pure `profile:spec-authoring:0.1`). Existing scripts must opt in; this is a profile_id change at workbook create time.",
      "Operators reading raw graph data see a `dnis:Node` with JSON `content` instead of a `spec:Section` with separate fields; less self-explanatory until rendered.",
      "Migration codemod is M-sized (rewrite each build-spec-*.ts to use DnisHostAdapter for sections); the v0.1 proposal's `order:int` codemod was simpler.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:add-order-field",
  type: SPEC_OPTION,
  fields: {
    label: "Add `order: int` to spec:HasSection (v0.1's chosen option)",
    description:
      "Add `order: int` (optional, default 0) to `spec:HasSection`. Renderer DFS-walks the spec:HasSection graph rooted at the document, sorting siblings by `(order, uid)`. Authored `number` honored as fallback for one minor release.",
    pros: [
      "Single new field on one relation type — minimal schema delta.",
      "Codemod is straightforward (rewrite `number: \"N\"` literals to `order: N * 10`).",
      "No profile change required; pure spec_authoring extension.",
    ],
    cons: [
      "Reinvents what SPEC-DNIS §6 already provides. Adopting SPEC-CORE 1.2 §5.6 means we already have a fractional-index Position type; adding a parallel integer key is redundant.",
      "Sparse-int convention (10/20/30) is a discipline, not a guarantee — authors who copy-paste `order: 10` everywhere collapse to uid-tiebreak surprise.",
      "Tiebreak determinism requires SPEC-UID v0.2; it works but is more moving parts than DNIS Position's single comparison key.",
      "Cycles in spec:HasSection are not currently prevented at validate time; v0.1 promised a defensive check that DNIS already enforces in the move op (§7.3).",
      "Replay-determinism gate is NEW work for v0.1; under v0.2 it is inherited from SPEC-CORE §5.6.6.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Builds parallel infrastructure. SPEC-CORE 1.2 §5.6 (the SPEC-DNIS adoption) already ships every property v0.1 needs to provide from scratch. Choosing this option would mean writing — and forever maintaining — a second numbering subsystem next to DNIS's.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:render-dsl-deferral",
  type: SPEC_OPTION,
  fields: {
    label: "Defer to render-DSL section directives",
    description:
      "Wait for SPEC-RENDER-DSL §directive support to mature; encode numbering in DSL fragments inside `body_md`.",
    pros: [
      "No core schema change.",
      "Numbering becomes one of many things the DSL can express.",
    ],
    cons: [
      "Section structure is not a presentation concern — it is structural metadata.",
      "Pushing it into the DSL trades one source-of-truth problem for another (DSL fragments vs. graph).",
      "Blocks on render-DSL maturity; render-DSL itself is still v0.1 Proposal.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Wrong layer. Section position is graph data, not template logic. Mixing them defeats both. Same rejection as v0.1.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:sections-dnis-001",
  type: SPEC_ADR,
  fields: {
    adr_id: "ADR-SECTIONS-TREE-001",
    title: "Adopt SPEC-DNIS as the section-tree primitive",
    status: "proposed",
    date: "2026-05-04",
    context:
      "v0.1 of this SPEC proposed adding `order: int` to spec:HasSection and DFS-walking the relation graph. v0.1 was authored before SPEC-CORE 1.2 §5.6 (commit 3bcced2) shipped the SPEC-DNIS adoption — which already provides paragraph-grain identity (SPEC-DNIS §3 invariants), fractional-index Position (§6 Insertion Property), typed Operations with op-log audit (§7), idempotency (§8), and replay-determinism conformance (§5.6.6). Choosing the v0.1 option would mean reinventing a subset of SPEC-DNIS specifically for spec sections. v0.2 instead reuses what SPEC-DNIS already provides.",
    decision:
      "Adopt SPEC-DNIS for section identity and order. Each spec section becomes a `dnis:Node` of kind `section`. The `dnis:Document` primitive roots the tree. Build scripts use `DnisHostAdapter.apply` to create/move/retire sections; sibling order comes from DNIS Position via `positionBetween`. The renderer (commit c4dc8d8) walks the dnis:Node graph when present and falls back to spec:Section otherwise.",
    consequences: [
      { polarity: "positive", text: "Build scripts no longer hand-author `number` strings on sections; the renderer derives §N.M.K from the DFS path." },
      { polarity: "positive", text: "Inserts at arbitrary density are O(1) (DNIS Position Insertion Property is total — sparse-int convention not required)." },
      { polarity: "positive", text: "Tiebreak concerns disappear; Q-1 of v0.1 is closed." },
      { polarity: "positive", text: "Replay-determinism is inherited from SPEC-CORE §5.6.6; no new conformance fixture." },
      { polarity: "positive", text: "Cycles in the section tree are prevented by SPEC-DNIS §7.3 (move precondition)." },
      { polarity: "negative", text: "Build scripts must target `profile:spec-authoring-dnis:0.1` (the composition profile that extends both spec-authoring and dnis). The legacy `profile:spec-authoring:0.1` keeps working for unmigrated scripts." },
      { polarity: "negative", text: "The codemod work to migrate the seven existing build-spec-*.ts is M-sized (rewrite each to use DnisHostAdapter); v0.1's order-field codemod was XS-sized." },
      { polarity: "neutral", text: "v0.1's `order: int` field is NOT added to spec:HasSection; that proposal is dropped." },
    ],
    compliance_checks: [
      "Adapter integration test in `fdpm-cli/tests/spec-md-dnis-sections.test.ts` exercises the renderer's DNIS path against a hand-built fixture.",
      "The replay-determinism test from SPEC-CORE §5.6.6 covers any workbook on the composed profile.",
      "A differential CI test asserts byte-equal renders before and after migrating a single build-spec-*.ts script.",
    ],
    revisit_signals: [
      "If a renderer regression breaks DFS over DNIS Nodes, the legacy spec:Section path stays available indefinitely — the cost of revisiting is bounded.",
      "If a future plugin author needs section structure WITHOUT DNIS (no SPEC-CORE 1.2 host), v0.1's order:int proposal can be revived as a fallback path — but that's a separate SPEC.",
    ],
  },
};

// ── §8 Trade-off Matrix ────────────────────────────────────────────────────

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:insert-cost",
    type: SPEC_TRADEOFF_AXIS,
    fields: {
      axis: "Author ergonomics (insert cost)",
      cells: [
        { option_id: "spec:opt:adopt-dnis", value: "O(1) at arbitrary density (DNIS §6.2 Insertion Property is total)." },
        { option_id: "spec:opt:add-order-field", value: "O(1) WHEN sparse-int convention holds; O(N) when neighbours are dense." },
        { option_id: "spec:opt:render-dsl-deferral", value: "Depends on DSL maturity; at minimum O(N)." },
      ],
    },
  },
  {
    id: "spec:tx:source-of-truth",
    type: SPEC_TRADEOFF_AXIS,
    fields: {
      axis: "Source of truth",
      cells: [
        { option_id: "spec:opt:adopt-dnis", value: "Single — DNIS Node graph (relation graph as mirror per §5.6.4)." },
        { option_id: "spec:opt:add-order-field", value: "Dual during deprecation — graph + authored numbers." },
        { option_id: "spec:opt:render-dsl-deferral", value: "Dual — graph + DSL fragments." },
      ],
    },
  },
  {
    id: "spec:tx:migration-cost",
    type: SPEC_TRADEOFF_AXIS,
    fields: {
      axis: "Migration cost",
      cells: [
        { option_id: "spec:opt:adopt-dnis", value: "M — codemod each build-spec-*.ts to DnisHostAdapter; profile bump per workbook." },
        { option_id: "spec:opt:add-order-field", value: "XS — sed-style number→order rewrite in each build script." },
        { option_id: "spec:opt:render-dsl-deferral", value: "High — depends on DSL stabilisation." },
      ],
    },
  },
  {
    id: "spec:tx:replay-determinism",
    type: SPEC_TRADEOFF_AXIS,
    fields: {
      axis: "Replay determinism",
      cells: [
        { option_id: "spec:opt:adopt-dnis", value: "Inherited from SPEC-CORE §5.6.6 (no new fixture)." },
        { option_id: "spec:opt:add-order-field", value: "Deterministic by (order, uid); needs new fixture." },
        { option_id: "spec:opt:render-dsl-deferral", value: "Depends on DSL evaluation order." },
      ],
    },
  },
  {
    id: "spec:tx:renderer-complexity",
    type: SPEC_TRADEOFF_AXIS,
    fields: {
      axis: "Renderer complexity",
      cells: [
        { option_id: "spec:opt:adopt-dnis", value: "+~100 LoC (renderSectionsFromDnis); compareSectionNumbers stays for legacy." },
        { option_id: "spec:opt:add-order-field", value: "compareSectionNumbers replaced by integer compare + uid tiebreak; ~30 LoC." },
        { option_id: "spec:opt:render-dsl-deferral", value: "Higher — DSL hook for numbering." },
      ],
    },
  },
];

// ── §9 QA Scenarios ────────────────────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:insert-section",
    type: SPEC_QA_SCENARIO,
    fields: {
      title: "Insert a section between any two siblings — O(1) at arbitrary density",
      source: "Build-script author maintaining a SPEC-*.ts script.",
      stimulus:
        "Insert a new section between §6 and §7 of an existing SPEC. The two existing sections may be at any DNIS Position — including immediately adjacent.",
      environment:
        "build-spec-*.ts authoring against a v0.2 host (profile:spec-authoring-dnis:0.1).",
      artifact: "dnis:Node primitives in the workbook graph.",
      response:
        "Author calls DnisHostAdapter.apply({ type: 'create', payload: { ..., position: positionBetween(prevSibling.position, nextSibling.position) } }). The renderer outputs the new section as §7 and renumbers downstream automatically.",
      response_measure:
        "Edits to existing primitives = 0; edits to existing relations = 0; new primitives = 1; new SPEC-CORE op-log entries = 1. Holds REGARDLESS of how dense the neighbourhood is, because DNIS Position's Insertion Property is total (SPEC-DNIS §6.2).",
    },
  },
  {
    id: "spec:qas:replay-determinism",
    type: SPEC_QA_SCENARIO,
    fields: {
      title: "Replay determinism — byte-equal SHA-256 across replays",
      source: "Core replay subsystem on Host startup.",
      stimulus: "Replay the operation log of a SPEC workbook containing N dnis:Node sections.",
      environment: "FDPM Host startup with the persistent JSONL log on disk.",
      artifact: "Materialised primitive/relation map plus rendered Markdown.",
      response:
        "The renderer produces byte-equal Markdown output across replays of the same log. The DNIS adapter rebuilds its in-memory cache deterministically from the op log per SPEC-CORE §5.6.3.",
      response_measure:
        "Two consecutive replays of the same log produce identical SHA-256 of the rendered file. Inherited from SPEC-CORE §5.6.6 conformance; this scenario is the spec-authoring-layer restatement.",
    },
  },
  {
    id: "spec:qas:legacy-passthrough",
    type: SPEC_QA_SCENARIO,
    fields: {
      title: "Legacy passthrough — unmigrated script renders byte-equal",
      source: "Operator running an unmigrated build script.",
      stimulus:
        "Run `npx tsx fdpm-cli/scripts/build-spec-uid.ts` (still using profile:spec-authoring:0.1 and spec:Section primitives) against a v0.2 host.",
      environment: "v0.2 host with the dnis path active in the renderer.",
      artifact: "The rendered Markdown plus the findings list emitted alongside it.",
      response:
        "Renderer detects no dnis:Document in the workbook, falls back to the legacy spec:Section path. Output matches pre-v0.2 byte-for-byte.",
      response_measure:
        "diff(rendered_v0.2, rendered_v0.1) == empty for any workbook on profile:spec-authoring:0.1. Mixed-mode warning count = 0 because the workbook does not contain a dnis:Document.",
    },
  },
];

// ── §11 Requirements ──────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:1",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Renderer DNIS-Node path",
      statement:
        "spec:SpecMarkdownRenderer MUST DFS-walk dnis:Node primitives whose kind is `section` when a workbook contains a dnis:Document. Sibling order MUST be determined by the lexicographic comparison of `position` field values per SPEC-DNIS §6.1.",
      strength: "MUST",
      verifiability: "test",
    },
  },
  {
    id: "spec:req:2",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Section number derivation",
      statement:
        "Rendered §N.M.K headings MUST be derived from the DFS path indices (1-based) joined by '.'. Heading depth MUST be `min(max(depth_override ?? path_length + 1, 2), 6)` so a top-level section is `##`, a sub-section `###`, etc.",
      strength: "MUST",
      verifiability: "test",
    },
  },
  {
    id: "spec:req:3",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Mixed-mode warning",
      statement:
        "When a workbook contains BOTH spec:Section primitives AND dnis:Node primitives of kind `section`, the renderer MUST emit exactly one `spec:render:mixed-mode-sections` warning finding and MUST render only the dnis:Node sections (the legacy primitives are ignored).",
      strength: "MUST",
      verifiability: "test",
    },
  },
  {
    id: "spec:req:4",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Legacy fallback preserved",
      statement:
        "When a workbook contains spec:Section primitives but NO dnis:Document, the renderer MUST render via the legacy compareSectionNumbers path with byte-equal output to v0.1. This is the back-compat guarantee for unmigrated build-spec-*.ts scripts.",
      strength: "MUST",
      verifiability: "ci_check",
    },
  },
  {
    id: "spec:req:5",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Composition profile",
      statement:
        "The host MUST register a built-in profile `profile:spec-authoring-dnis:0.1` that extends `profile:spec-authoring:0.1` and `profile:dnis:0.1`. Build scripts opting into the v0.2 authoring pattern MUST target this profile_id.",
      strength: "MUST",
      verifiability: "test",
    },
  },
  {
    id: "spec:req:6",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Replay determinism",
      statement:
        "Re-rendering a SPEC document from a fresh replay of its SPEC-CORE op log MUST produce byte-equal Markdown. This requirement is satisfied by SPEC-CORE 1.2 §5.6.6 conformance plus the renderer's pure-function semantics (no IO, no mutable global state).",
      strength: "MUST",
      verifiability: "ci_check",
    },
  },
  {
    id: "spec:req:7",
    type: SPEC_REQUIREMENT,
    fields: {
      label: "Cycle prevention",
      statement:
        "The renderer SHOULD reject (or warn) on cyclic parent_node_id references within a workbook's dnis:Node graph. SPEC-DNIS §7.3 already prevents cycles at write time; this requirement is defense-in-depth at render time for workbooks whose op log was mutated externally.",
      strength: "SHOULD",
      verifiability: "review",
    },
  },
];

// ── §12 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: SPEC_ACCEPTANCE_CRITERION,
    fields: {
      ordinal: 1,
      criterion:
        "The renderer's DNIS path emits §N.M.K headings derived from a fixture of three nested levels (1, 1.1, 1.1.1, 1.2, 2). Verified by `tests/spec-md-dnis-sections.test.ts > walks dnis:Node tree DFS and emits §N.M.K headings derived from the path`.",
      status: "met",
      evidence_refs: ["fdpm-cli/tests/spec-md-dnis-sections.test.ts"],
    },
  },
  {
    id: "spec:ac:2",
    type: SPEC_ACCEPTANCE_CRITERION,
    fields: {
      ordinal: 2,
      criterion:
        "Retired dnis:Node sections are skipped — the renderer renders only the active document state. Verified by the `ignores retired dnis:Node sections` test case.",
      status: "met",
      evidence_refs: ["fdpm-cli/tests/spec-md-dnis-sections.test.ts"],
    },
  },
  {
    id: "spec:ac:3",
    type: SPEC_ACCEPTANCE_CRITERION,
    fields: {
      ordinal: 3,
      criterion:
        "Mixed-mode warning fires when both spec:Section and dnis:Node sections coexist; legacy primitives are NOT rendered. Verified by the `emits a mixed-mode warning` test case.",
      status: "met",
      evidence_refs: ["fdpm-cli/tests/spec-md-dnis-sections.test.ts"],
    },
  },
  {
    id: "spec:ac:4",
    type: SPEC_ACCEPTANCE_CRITERION,
    fields: {
      ordinal: 4,
      criterion:
        "The composition profile resolves correctly: a workbook on profile:spec-authoring-dnis:0.1 sees both spec:* and dnis:* primitive types. Verified by the smoke test in `/tmp/spec-authoring-dnis-smoke.ts` (run-once during implementation; not a CI fixture).",
      status: "met",
      evidence_refs: ["fdpm-cli/plugins/spec_authoring_dnis/index.ts"],
    },
  },
  {
    id: "spec:ac:5",
    type: SPEC_ACCEPTANCE_CRITERION,
    fields: {
      ordinal: 5,
      criterion:
        "This SPEC document itself is built via DnisHostAdapter — the meta-circular proof. The fact that the rendered SPEC-SECTIONS-TREE.md exists with correct §N.M.K headings IS the AC.",
      status: "met",
      evidence_refs: ["fdpm-cli/scripts/build-spec-sections-tree.ts"],
    },
  },
];

// ── §13 Conformance ────────────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: SPEC_CONFORMANCE_ITEM,
    fields: {
      ordinal: 1,
      name: "DFS numbering matches the dnis:Node tree",
      procedure:
        "Construct a fixture workbook with three nested sections (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling) via DnisHostAdapter; render via spec:SpecMarkdownRenderer.",
      expected:
        "Output headings read `## 1. …`, `### 1.1. …`, `#### 1.1.1. …`, `### 1.2. …`, `## 2. …` with no other sections present.",
    },
  },
  {
    id: "spec:conf:2",
    type: SPEC_CONFORMANCE_ITEM,
    fields: {
      ordinal: 2,
      name: "Legacy fallback produces zero diff",
      procedure:
        "Run any pre-v0.2 build-spec-*.ts script (still using profile:spec-authoring:0.1) against a v0.2 host; diff the rendered Markdown against pre-v0.2 reference.",
      expected: "diff exits 0 for every script.",
    },
  },
  {
    id: "spec:conf:3",
    type: SPEC_CONFORMANCE_ITEM,
    fields: {
      ordinal: 3,
      name: "Mixed-mode warning is exactly one",
      procedure:
        "Construct a workbook with one spec:Section primitive and one dnis:Node section; render and inspect findings.",
      expected:
        "Findings array contains exactly one entry with expression `spec:render:mixed-mode-sections`. Rendered text contains the dnis:Node title and does NOT contain the spec:Section title.",
    },
  },
  {
    id: "spec:conf:4",
    type: SPEC_CONFORMANCE_ITEM,
    fields: {
      ordinal: 4,
      name: "Insertion Property at arbitrary density",
      procedure:
        "Create three sibling sections, then insert a fourth between the first two without renumbering. Verify positionBetween returns a fresh position string strictly between the existing two.",
      expected:
        "comparePositions(left, new) < 0 AND comparePositions(new, right) < 0; no other primitive's `position` field is mutated.",
    },
  },
];

// ── §14 Required Changes (now mostly historical — landed in commit c4dc8d8) ──

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:profile",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/plugins/spec_authoring_dnis/",
      change:
        "New built-in plugin declaring profile:spec-authoring-dnis:0.1 that extends spec-authoring:0.1 and dnis:0.1.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:renderer-dnis-path",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
      change:
        "Add renderSectionsFromDnis: detect dnis:Document; DFS by parent_node_id sorted by position; derive §N.M.K from path; reuse KIND_RENDERERS for body content.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:adapter-uid-pin",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/src/core/host.ts + src/core/dnis/adapter.ts",
      change:
        "DnisBatchIntent.uid optional override; adapter routes createDocument through appendBatchWithCausation to pin uid==NID per SPEC-CORE §5.6.1.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:tests",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/tests/spec-md-dnis-sections.test.ts",
      change:
        "Three TDD-driven tests: DFS heading derivation, retired-section skip, mixed-mode warning.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:source-script",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/scripts/build-spec-sections-tree.ts",
      change:
        "Rewrite to construct sections via DnisHostAdapter on the composed profile. The script is the meta-circular proof: it builds itself using the very pattern it specifies.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:codemod",
    type: SPEC_IMPLEMENTATION_CHANGE,
    fields: {
      area: "fdpm-cli/scripts/migrate-section-numbers.ts (future)",
      change:
        "Codemod to rewrite the seven existing build-spec-*.ts scripts onto the composed profile and DNIS-modelled sections. Tracked as future work; this v0.2 SPEC ships without it because every existing script keeps working unchanged via the legacy path.",
      complexity: "M",
      status: "not_started",
    },
  },
];

// ── §15 Migration Plan ────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: SPEC_MIGRATION_STEP,
    fields: {
      ordinal: 1,
      label: "Land renderer DNIS path + composition profile (this commit)",
      action:
        "Ship CHG-1 through CHG-5. Renderer forks on dnis:Document presence; legacy workbooks unaffected. Composition profile available for opt-in.",
      affected_paths: [
        "fdpm-cli/plugins/spec_authoring_dnis/",
        "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
        "fdpm-cli/src/core/host.ts",
        "fdpm-cli/src/core/dnis/adapter.ts",
      ],
    },
  },
  {
    id: "spec:mig:2",
    type: SPEC_MIGRATION_STEP,
    fields: {
      ordinal: 2,
      label: "Build SPEC-SECTIONS-TREE itself via DnisHostAdapter (this commit)",
      action:
        "Rewrite build-spec-sections-tree.ts to construct its document on the composed profile and use DnisHostAdapter for sections. The rendered SPEC-SECTIONS-TREE.md is the proof that the path works.",
      affected_paths: ["fdpm-cli/scripts/build-spec-sections-tree.ts"],
    },
  },
  {
    id: "spec:mig:3",
    type: SPEC_MIGRATION_STEP,
    fields: {
      ordinal: 3,
      label: "Codemod the remaining build-spec-*.ts scripts (future)",
      action:
        "Write fdpm-cli/scripts/migrate-section-numbers.ts that converts each pre-v0.2 build script to the composed profile and DNIS-modelled sections. Gate by byte-diff: the rendered Markdown before/after must be identical.",
      affected_paths: [
        "fdpm-cli/scripts/migrate-section-numbers.ts",
        "fdpm-cli/scripts/build-spec-*.ts",
      ],
    },
  },
  {
    id: "spec:mig:4",
    type: SPEC_MIGRATION_STEP,
    fields: {
      ordinal: 4,
      label: "Deprecate spec:Section/spec:HasSection — separate SPEC, future",
      action:
        "Once every in-tree build-spec-*.ts is on the composed profile, mark spec:Section and spec:HasSection deprecated in their primitive descriptions. The renderer's legacy path stays available for downstream consumers who haven't migrated. Removal is tracked under a separate SPEC-SECTIONS-TREE v0.3.",
      affected_paths: ["fdpm-cli/plugins/spec_authoring/primitives/document.ts"],
    },
  },
];

// ── §16 Risks and Mitigations ─────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:dfs-bug",
    type: SPEC_RISK,
    fields: {
      label: "DFS bug on deep or asymmetric trees",
      description:
        "DFS algorithm bug produces wrong numbering for deeply nested or asymmetric graphs. Cycle case is already prevented by SPEC-DNIS §7.3 move precondition, so this is bounded to non-cyclic correctness.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:codemod-loss",
    type: SPEC_RISK,
    fields: {
      label: "Codemod silent loss (deferred to mig:3)",
      description:
        "Codemod misparses an existing build-spec-*.ts script and silently drops a section during migration. Affects mig:3 only; v0.2 itself does not run a codemod.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:profile-mismatch",
    type: SPEC_RISK,
    fields: {
      label: "Build script targets wrong profile",
      description:
        "Author writes a v0.2-style build script (using DnisHostAdapter) but commits with profile:spec-authoring:0.1 (no dnis types registered). The dnis:Document/dnis:Node primitive.create calls fail at validate time. Loud, not silent — but a confusing first error for newcomers.",
      likelihood: "low",
      impact: "low",
    },
  },
  {
    id: "spec:risk:render-perf",
    type: SPEC_RISK,
    fields: {
      label: "Render-time perf regression on large docs",
      description:
        "DFS over large documents (>500 sections) increases render time. Expected: same algorithmic complexity as v0.1 (O(N log N) for the position sort plus O(N) for the DFS). Position string comparison is short (DNIS uses base-10000 segments) — comparable to integer comparison.",
      likelihood: "low",
      impact: "low",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:dfs-test",
    type: SPEC_MITIGATION,
    fields: {
      strategy:
        "Property-test renderSectionsFromDnis against a reference outline-numbering implementation across 1000 random trees of depth ≤ 6 and arity ≤ 10. The fixture in tests/spec-md-dnis-sections.test.ts covers the depth-3 case; property test extends coverage.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:codemod-diff-gate",
    type: SPEC_MITIGATION,
    fields: {
      strategy:
        "The mig:3 codemod is gated by a per-SPEC differential test: render before, render after, refuse to write the migrated file if the bytes differ. Same gate as v0.1 promised; semantically unchanged.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:profile-validator",
    type: SPEC_MITIGATION,
    fields: {
      strategy:
        "When a primitive.create with type_id='dnis:Document' or 'dnis:Node' fails because the profile lacks the dnis:* types, the host's existing 'profile not found' error message already points at the missing profile. No additional code; the existing behaviour is the mitigation.",
      status: "implemented",
    },
  },
  {
    id: "spec:mit:perf-baseline",
    type: SPEC_MITIGATION,
    fields: {
      strategy:
        "Benchmark render time on the largest existing SPEC (SPEC-DNIS, ~120 sections) before and after v0.2; fail CI if it exceeds 2× the pre-v0.2 baseline. Inherits methodology from v0.1; threshold unchanged.",
      status: "planned",
    },
  },
];

// ── §17 Open Questions ────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:legacy-removal-timeline",
    type: SPEC_OPEN_QUESTION,
    fields: {
      ordinal: 1,
      question:
        "When does spec:Section / spec:HasSection get removed entirely from the spec_authoring profile?",
      default_choice:
        "Out of scope for v0.2. Tracked under a separate SPEC-SECTIONS-TREE v0.3 once all in-tree build-spec-*.ts scripts are migrated AND one minor release of fallback behaviour has passed. The legacy path is non-canonical but supported indefinitely until then.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:cross-document-refs",
    type: SPEC_OPEN_QUESTION,
    fields: {
      ordinal: 2,
      question:
        "Cross-document section references — should the renderer hot-link the §-number into a uid-based anchor at render time? E.g. resolving '§7 of SPEC-CORE' to a stable dnis:Node uid?",
      default_choice:
        "Out of scope for v0.2. Tracked under SPEC-UID Q1 (cross-workbook relations). Revisit when that lands. Note that under v0.2 the target IS already a stable uid (the dnis:Node's NID), so the work reduces to URL-construction once cross-workbook relations are normative.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:depth-override",
    type: SPEC_OPEN_QUESTION,
    fields: {
      ordinal: 3,
      question:
        "Should the dnis:Node content's `depth_override` field be retained, or is path-derived depth always sufficient?",
      default_choice:
        "Retain in v0.2 as an escape hatch. The renderer derives depth from path length by default; depth_override lets authors break out of the default for unusual layouts (e.g. embedded section-like content inside a 'kind: prose' section). Remove if no callers materialise.",
      is_blocking: "no",
    },
  },
];

// ── §18 Future Work ───────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:codemod",
    type: SPEC_FUTURE_WORK,
    fields: {
      label: "Codemod for in-tree build-spec-*.ts migration",
      target_version: "0.3",
      description:
        "Tracked as mig:3. Migrates each pre-v0.2 build script to the composed profile and DNIS-modelled sections. Gated by per-SPEC byte-diff CI test.",
    },
  },
  {
    id: "spec:fw:remove-legacy-types",
    type: SPEC_FUTURE_WORK,
    fields: {
      label: "Remove spec:Section / spec:HasSection",
      target_version: "future (v0.4 or later)",
      description:
        "Tracked as mig:4 / OQ-1. Conditional on all in-tree callers being migrated AND no external consumer dependencies. Removing the legacy path simplifies the renderer; keeping it is the conservative default.",
    },
  },
  {
    id: "spec:fw:dsl-body",
    type: SPEC_FUTURE_WORK,
    fields: {
      label: "DSL-evaluated body_md inside dnis:Node content",
      target_version: "future",
      description:
        "Independent of this SPEC. SPEC-RENDER-DSL stabilisation enables body_md to be a DSL fragment; numbering still derives from the DNIS Node graph; the DSL only affects body content.",
    },
  },
];

// ── §19 References ────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:claude-md",
    type: SPEC_REFERENCE,
    fields: {
      kind: "repo_file",
      citation: "CLAUDE.md — Workbook Guidelines (this repository, root).",
      locator: "CLAUDE.md",
      verification: "verified",
      verification_note:
        "Read the file at HEAD. Sections \"Behavioral Constraints\" and \"PALS's LAW\" govern the disclaimer/banner requirements honored by this SPEC.",
    },
  },
  {
    id: "spec:ref:purpose",
    type: SPEC_REFERENCE,
    fields: {
      kind: "repo_file",
      citation: "PURPOSE.md (this repository, root).",
      locator: "PURPOSE.md",
      verification: "verified",
      verification_note:
        "Read the file at HEAD. CLAUDE.md mandates that no proposal conflict with PURPOSE.md; this SPEC's single-source-of-truth principle aligns with PURPOSE's typed-graph-first stance.",
    },
  },
  {
    id: "spec:ref:spec-core",
    type: SPEC_REFERENCE,
    fields: {
      kind: "spec",
      citation: "SPEC-CORE 1.2 — §5.6 SPEC-DNIS adoption.",
      locator: SPEC_CORE_PATH,
      verification: "verified",
      verification_note:
        "Read §5.6.1 (primitive registration), §5.6.2 (DNIS Operation ↔ op-log mapping), §5.6.3 (OperationResult idempotency from the op log), §5.6.6 (conformance fixture). v0.2 of this SPEC reuses every property §5.6 provides.",
    },
  },
  {
    id: "spec:ref:spec-dnis",
    type: SPEC_REFERENCE,
    fields: {
      kind: "spec",
      citation: "SPEC-DNIS 0.1.7 — Document Node Identity Specification.",
      locator: SPEC_DNIS_PATH,
      verification: "verified",
      verification_note:
        "Read §3 invariants, §6 Position semantics (Insertion Property is normative), §7 Operations, §16 TV-1..TV-7 conformance vectors. The composition profile registers SPEC-DNIS's primitive and relation types verbatim.",
    },
  },
  {
    id: "spec:ref:spec-uid",
    type: SPEC_REFERENCE,
    fields: {
      kind: "spec",
      citation: "SPEC-UID — Universal Identifiers (§10 invariants).",
      locator: SPEC_UID_PATH,
      verification: "verified",
      verification_note:
        "Read §10. Confirms uid is minted once and never changes — necessary precondition for SPEC-CORE §5.6.1's uid==NID pin.",
    },
  },
  {
    id: "spec:ref:spec-render-dsl",
    type: SPEC_REFERENCE,
    fields: {
      kind: "spec",
      citation: "SPEC-RENDER-DSL — Render-Time DSL for FDPM Document Templates.",
      locator: SPEC_RENDER_DSL_PATH,
      verification: "verified",
      verification_note:
        "Read §1 Purpose. Confirms render-DSL targets template content, not structural metadata — supports the rejection of Option C.",
    },
  },
  {
    id: "spec:ref:spec-md-renderer",
    type: SPEC_REFERENCE,
    fields: {
      kind: "repo_file",
      citation: "spec_md.ts — current spec:SpecMarkdownRenderer implementation.",
      locator: "fdpm-cli/plugins/spec_authoring/renderers/spec_md.ts",
      verification: "verified",
      verification_note:
        "Read renderSections, renderSectionsLegacy, renderSectionsFromDnis, KIND_RENDERERS dispatch table. These are the functions modified by CHG-2.",
    },
  },
  {
    id: "spec:ref:dnis-adapter",
    type: SPEC_REFERENCE,
    fields: {
      kind: "repo_file",
      citation: "DnisHostAdapter — fdpm-cli/src/core/dnis/adapter.ts",
      locator: "fdpm-cli/src/core/dnis/adapter.ts",
      verification: "verified",
      verification_note:
        "The adapter this SPEC's build script uses to construct its sections. Its createDocument and apply methods are the v0.2 authoring surface.",
    },
  },
];

// ── §20 Revision History ──────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-2-0",
    type: SPEC_REVISION,
    fields: {
      version: "0.2.0",
      date: "2026-05-04",
      title: "Adopt SPEC-DNIS for section identity and order",
      notes:
        "Pivots the proposal from v0.1's \"add order:int to spec:HasSection\" to \"model sections as DNIS Nodes; use DNIS Position for sibling order.\" Rationale: SPEC-CORE 1.2 §5.6 ships a SPEC-DNIS adoption that already provides every property v0.1 sought to build from scratch (paragraph-grain identity, fractional-index Position with total Insertion Property, op-log audit, idempotency, replay determinism, cycle prevention). v0.2 reuses that infrastructure instead of duplicating it.",
      affected_sections: [
        "0",
        "1",
        "5",
        "6",
        "7",
        "8",
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
        "19",
        "20",
      ],
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-1-0",
    type: SPEC_REVISION,
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial Proposal — graph-derived section numbering via order:int",
      notes:
        "Captured the dual-source-of-truth bug between spec:Section.number and spec:HasSection order; proposed graph-derived numbering with sparse `order: int` and `uid` tiebreak. Superseded by v0.2 — see §6/§7 ADR-SECTIONS-TREE-001 for the rejection rationale.",
      affected_sections: ["all"],
      kind: "minor",
    },
  },
];

// ── Section content (used by the DnisHostAdapter pass below) ──────────────

interface SectionDef {
  title: string;
  body_md: string;
  dispatch_kind?: string;
  children?: SectionDef[];
}

const SECTION_TREE: SectionDef[] = [
  {
    title: "Purpose and Scope",
    body_md: [
      "### 1.1 What this document defines",
      "",
      "This SPEC defines an architectural change to the spec_authoring rendering pipeline: section structure is modelled as DNIS Nodes (kind=`section`) rooted at a `dnis:Document`, and the renderer DFS-walks the DNIS Node graph to derive §N.M.K headings. SPEC-DNIS Position drives sibling order — the §6.2 Insertion Property is total, so inserts are O(1) at arbitrary density.",
      "",
      "### 1.2 What this document does NOT define",
      "",
      "- **Removal of spec:Section / spec:HasSection.** They remain registered for legacy workbooks. Removal is tracked under FW-2.",
      "- **A new kind registry.** Section dispatch_kinds (`stakeholders`, `adr`, …) remain a closed enum tied to the renderer's KIND_RENDERERS table.",
      "- **Render-DSL integration.** Body content can become DSL-evaluated independently; this SPEC is strictly about heading structure.",
      "- **Cross-document section references.** Cross-workbook relations are tracked under SPEC-UID Q1.",
      "",
      "### 1.3 Why now",
      "",
      "Three converging signals:",
      "",
      "1. **SPEC-CORE 1.2 §5.6 (commit 3bcced2) ships SPEC-DNIS adoption.** Every property v0.1 of this SPEC needed to build from scratch — stable identity, fractional-index Position, op-log audit, idempotency, replay determinism, cycle prevention — is now part of the SPEC-CORE host's surface.",
      "2. **The v0.1 `order: int` proposal would build parallel infrastructure.** Adding a sparse-int sibling-ordering key on top of SPEC-DNIS's Position would mean two ordering systems where one suffices.",
      "3. **The composition profile pattern is already validated** by other plugins via `extends` (SPEC-CORE §4.3 profile resolution). A new `profile:spec-authoring-dnis:0.1` is a one-file addition.",
    ].join("\n"),
  },
  {
    title: "Stakeholders and Concerns",
    body_md:
      "If a concern has no listed stakeholder, no one will defend it. Flag any gap before implementation.",
    dispatch_kind: "stakeholders",
  },
  {
    title: "Quality Attributes in Tension",
    body_md:
      "The recurring tension is **author ergonomics vs. back-compat**. Adopting SPEC-DNIS resolves both: existing workbooks keep working unchanged via the legacy path; new authoring patterns get O(1) inserts plus all the SPEC-DNIS guarantees for free.",
    dispatch_kind: "quality_attributes",
  },
  {
    title: "Architectural Principles",
    body_md: "Each principle is testable; the renderer enumerates them in declared order.",
    dispatch_kind: "principles",
  },
  {
    title: "Definitions",
    body_md:
      "Terms used by this SPEC. Definitions are auto-included from `spec:Term` primitives joined by `spec:Defines`.",
    dispatch_kind: "definitions",
  },
  {
    title: "Decision Summary",
    body_md:
      "The single architectural decision in this SPEC is captured by ADR-SECTIONS-TREE-001: adopt SPEC-DNIS for section identity and order. Trade-offs are tabulated in §8.",
    dispatch_kind: "decision_summary",
  },
  {
    title: "Architecture Decision Record",
    body_md: "The full ADR text is embedded below.",
    dispatch_kind: "adr",
  },
  {
    title: "Trade-off Matrix",
    body_md:
      "Trade-off axes for ADR-SECTIONS-TREE-001 across the three considered options. Option A (adopt SPEC-DNIS) wins on every axis except migration cost, where Option B's XS-sized field rewrite wins by definition.",
    dispatch_kind: "tradeoff_matrix",
  },
  {
    title: "Quality-Attribute Scenarios",
    body_md:
      "Three SEI-format scenarios pin the most consequential behaviours: insert-at-arbitrary-density (§9.1), replay-determinism (§9.2), and legacy passthrough (§9.3).",
    dispatch_kind: "scenarios",
  },
  {
    title: "Invariants",
    body_md:
      "The four `spec:Invariant` primitives enumerated in §4 (Architectural Principles) ARE this SPEC's invariants — `graph-is-truth`, `dnis-position-canonical`, `replay-determinism`, and `legacy-fallback-non-canonical`. Each is checked by a conformance item in §13.",
  },
  {
    title: "Requirements",
    body_md:
      "Seven requirements. Six MUST, one SHOULD. All MUST clauses are verifiable by automated tests in tests/spec-md-dnis-sections.test.ts plus the SPEC-CORE §5.6.6 conformance fixture.",
  },
  {
    title: "Acceptance Criteria",
    body_md:
      "Five acceptance criteria, all `met` because the supporting code landed in commit c4dc8d8. AC-5 is the meta-circular proof: this SPEC document IS rendered through the path it specifies.",
    dispatch_kind: "acceptance_criteria",
  },
  {
    title: "Conformance",
    body_md:
      "Four conformance items. CONF-1 covers the DFS heading derivation; CONF-2 the legacy fallback; CONF-3 the mixed-mode warning; CONF-4 the Insertion Property at arbitrary density.",
    dispatch_kind: "conformance",
  },
  {
    title: "Required Changes to Existing Code",
    body_md:
      "Six implementation changes. Five completed in commit c4dc8d8 plus the rewrite of build-spec-sections-tree.ts in this commit. The codemod for in-tree build-spec-*.ts migration is tracked as future work.",
    dispatch_kind: "implementation_plan",
  },
  {
    title: "Migration Plan",
    body_md:
      "Four sequenced steps. Steps 1 and 2 land in this commit; step 3 (codemod) is future work; step 4 (legacy removal) is conditional on step 3 completing and one minor release of fallback behaviour.",
    dispatch_kind: "migration",
  },
  {
    title: "Risks and Mitigations",
    body_md:
      "Four risks identified, four mitigations planned. The most consequential is the codemod-loss risk in mig:3; mitigated by per-SPEC byte-diff CI gate (mit:codemod-diff-gate).",
    dispatch_kind: "risks",
  },
  {
    title: "Open Questions",
    body_md:
      "Three open questions, all with default resolutions and `is_blocking: no`. Q-1 of v0.1 (integer vs. fractional `order`) is closed by adopting DNIS Position and is therefore not listed here.",
    dispatch_kind: "open_questions",
  },
  {
    title: "Future Work",
    body_md:
      "Three items deferred: codemod for in-tree migration, removal of spec:Section/spec:HasSection, and DSL-evaluated body_md.",
    dispatch_kind: "future_work",
  },
  {
    title: "References",
    body_md:
      "Eight references, all PALS-verified. Two repo files (CLAUDE.md, PURPOSE.md), four peer SPECs (CORE, DNIS, UID, RENDER-DSL), one renderer source file, one adapter source file.",
    dispatch_kind: "references",
  },
  {
    title: "Revision History",
    body_md: "0.2.0 — initial Proposal of the DNIS-adoption pivot (2026-05-04).",
    dispatch_kind: "revision_history",
  },
];

// ── Relations ──────────────────────────────────────────────────────────────

const relations: RelationSpec[] = [
  // Document defines each Term (spec:Defines is independent of section tree)
  ...termSpecs.map((t, i) => ({
    id: `rel:doc-defines-${i + 1}`,
    type: SPEC_REL_DEFINES,
    from: documentSpec.id,
    to: t.id,
  })),

  // ADR considers each option
  { id: "rel:adr-considers-dnis", type: SPEC_REL_CONSIDERS, from: adr.id, to: optA.id },
  { id: "rel:adr-considers-order", type: SPEC_REL_CONSIDERS, from: adr.id, to: optB.id },
  { id: "rel:adr-considers-dsl", type: SPEC_REL_CONSIDERS, from: adr.id, to: optC.id },

  // ADR chose Option A
  { id: "rel:adr-chose-dnis", type: SPEC_REL_CHOSE, from: adr.id, to: optA.id },

  // ADR has trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: SPEC_REL_HAS_TRADEOFF,
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target quality attributes
  {
    id: "rel:qas-insert-targets-ergonomics",
    type: SPEC_REL_TARGETS,
    from: "spec:qas:insert-section",
    to: "spec:qa:author-ergonomics",
  },
  {
    id: "rel:qas-replay-targets-determinism",
    type: SPEC_REL_TARGETS,
    from: "spec:qas:replay-determinism",
    to: "spec:qa:replay-determinism",
  },
  {
    id: "rel:qas-legacy-targets-back-compat",
    type: SPEC_REL_TARGETS,
    from: "spec:qas:legacy-passthrough",
    to: "spec:qa:back-compat",
  },

  // Mitigations cover risks
  { id: "rel:mit-dfs-mitigates", type: SPEC_REL_MITIGATES, from: "spec:mit:dfs-test", to: "spec:risk:dfs-bug" },
  { id: "rel:mit-codemod-mitigates", type: SPEC_REL_MITIGATES, from: "spec:mit:codemod-diff-gate", to: "spec:risk:codemod-loss" },
  { id: "rel:mit-profile-mitigates", type: SPEC_REL_MITIGATES, from: "spec:mit:profile-validator", to: "spec:risk:profile-mismatch" },
  { id: "rel:mit-perf-mitigates", type: SPEC_REL_MITIGATES, from: "spec:mit:perf-baseline", to: "spec:risk:render-perf" },

  // Migration step dependencies
  { id: "rel:mig-2-deps-1", type: SPEC_REL_DEPENDS_ON, from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-2", type: SPEC_REL_DEPENDS_ON, from: "spec:mig:3", to: "spec:mig:2" },
  { id: "rel:mig-4-deps-3", type: SPEC_REL_DEPENDS_ON, from: "spec:mig:4", to: "spec:mig:3" },

  // Acceptance criteria verify requirements / invariants
  { id: "rel:ac1-verifies-r1", type: SPEC_REL_VERIFIES, from: "spec:ac:1", to: "spec:req:1" },
  { id: "rel:ac1-verifies-r2", type: SPEC_REL_VERIFIES, from: "spec:ac:1", to: "spec:req:2" },
  { id: "rel:ac2-verifies-r1", type: SPEC_REL_VERIFIES, from: "spec:ac:2", to: "spec:req:1" },
  { id: "rel:ac3-verifies-r3", type: SPEC_REL_VERIFIES, from: "spec:ac:3", to: "spec:req:3" },
  { id: "rel:ac4-verifies-r5", type: SPEC_REL_VERIFIES, from: "spec:ac:4", to: "spec:req:5" },
  { id: "rel:ac5-verifies-graph", type: SPEC_REL_VERIFIES, from: "spec:ac:5", to: "spec:inv:graph-is-truth" },

  // Conformance items verify
  { id: "rel:conf1-verifies-r2", type: SPEC_REL_VERIFIES, from: "spec:conf:1", to: "spec:req:2" },
  { id: "rel:conf2-verifies-r4", type: SPEC_REL_VERIFIES, from: "spec:conf:2", to: "spec:req:4" },
  { id: "rel:conf3-verifies-r3", type: SPEC_REL_VERIFIES, from: "spec:conf:3", to: "spec:req:3" },
  { id: "rel:conf4-verifies-position", type: SPEC_REL_VERIFIES, from: "spec:conf:4", to: "spec:inv:dnis-position-canonical" },

  // ADR resolves the v0.1 blocking question (chose DNIS Position over fractional `order`)
  { id: "rel:adr-resolves-order-type", type: SPEC_REL_RESOLVES, from: adr.id, to: "spec:q:legacy-removal-timeline" },

  // Citations
  { id: "rel:adr-cites-spec-core", type: SPEC_REL_CITES, from: adr.id, to: "spec:ref:spec-core" },
  { id: "rel:adr-cites-spec-dnis", type: SPEC_REL_CITES, from: adr.id, to: "spec:ref:spec-dnis" },
  { id: "rel:adr-cites-uid", type: SPEC_REL_CITES, from: adr.id, to: "spec:ref:spec-uid" },
  { id: "rel:adr-cites-renderer", type: SPEC_REL_CITES, from: adr.id, to: "spec:ref:spec-md-renderer" },
  { id: "rel:adr-cites-adapter", type: SPEC_REL_CITES, from: adr.id, to: "spec:ref:dnis-adapter" },
  { id: "rel:doc-cites-claude", type: SPEC_REL_CITES, from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-cites-purpose", type: SPEC_REL_CITES, from: documentSpec.id, to: "spec:ref:purpose" },
  { id: "rel:opt-c-cites-render-dsl", type: SPEC_REL_CITES, from: optC.id, to: "spec:ref:spec-render-dsl" },

  // Required reads
  { id: "rel:doc-req-claude", type: SPEC_REL_REQUIRED_READ, from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-purpose", type: SPEC_REL_REQUIRED_READ, from: documentSpec.id, to: "spec:ref:purpose" },
  { id: "rel:doc-req-core", type: SPEC_REL_REQUIRED_READ, from: documentSpec.id, to: "spec:ref:spec-core" },
  { id: "rel:doc-req-dnis", type: SPEC_REL_REQUIRED_READ, from: documentSpec.id, to: "spec:ref:spec-dnis" },
  { id: "rel:doc-req-uid", type: SPEC_REL_REQUIRED_READ, from: documentSpec.id, to: "spec:ref:spec-uid" },

  // Document RevisedIn
  { id: "rel:doc-revised-0-2-0", type: SPEC_REL_REVISED_IN, from: documentSpec.id, to: "spec:rev:0-2-0" },
  { id: "rel:doc-revised-0-1-0", type: SPEC_REL_REVISED_IN, from: documentSpec.id, to: "spec:rev:0-1-0" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();

  // Phase 1: commit all typed spec-authoring primitives + relations.
  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — Sections-as-DNIS-Tree v0.2",
    profile: PROFILE_ID, // profile:spec-authoring-dnis:0.1
    description:
      "v0.2 of SPEC-SECTIONS-TREE: model section structure as dnis:Node primitives; derive §N.M.K from a DFS of the dnis:Node graph sorted by SPEC-DNIS Position. Supersedes v0.1's order:int proposal.",
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
    ])
    .relations(relations)
    .commit();

  console.log("Phase 1 — typed primitives committed:");
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);

  // Phase 2: build the section tree as dnis:Node primitives via the
  // host adapter. The SPEC-CORE op log records every Operation; the
  // renderer (commit c4dc8d8) walks the resulting graph at render time.
  const adapter = new DnisHostAdapter(host, { workbookId: PROJECT_ID });
  const dnisDoc = await adapter.createDocument({
    createdBy: AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });

  let opCounter = 0;
  function nextOpId(): OperationId {
    opCounter += 1;
    return mintUid() as OperationId;
  }

  async function emitTree(parent: NodeId | null, defs: SectionDef[]): Promise<void> {
    let lastSibling: { position: Position } | null = null;
    for (const def of defs) {
      const position = positionBetween(lastSibling?.position ?? null, null);
      const issuedAt = new Date(Date.UTC(2026, 4, 4, 12, 0, opCounter)).toISOString();
      const result = await adapter.apply({
        id: nextOpId(),
        type: "create",
        documentId: dnisDoc.id,
        agentId: AGENT,
        issuedAt,
        payload: {
          kind: "section",
          content: {
            title: def.title,
            body_md: def.body_md,
            ...(def.dispatch_kind ? { dispatch_kind: def.dispatch_kind } : {}),
          },
          parentNodeId: parent,
          position,
        },
      });
      const newId = result.affectedNodeIds[0]!;
      lastSibling = { position };
      if (def.children && def.children.length > 0) {
        await emitTree(newId, def.children);
      }
    }
  }

  await emitTree(null, SECTION_TREE);

  console.log("Phase 2 — dnis:Node section tree built:");
  console.log("  dnis:Document:", dnisDoc.id);
  console.log("  sections     :", opCounter);
  console.log("");
  console.log("Render to Markdown:");
  console.log(
    `  FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx fdpm-cli/src/bin/fdpm.ts \\`,
  );
  console.log(
    `    render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer \\`,
  );
  console.log(`    -o ${SPEC_SECTIONS_TREE_PATH}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});

// Suppress unused-import lint when DocumentId only appears in inferred
// types. The symbol is used by the dnisDoc.id assignment indirectly.
void (undefined as unknown as DocumentId);
