/**
 * Build the SPEC for "Sections-as-Tree: Derive Numbering and Order
 * from the spec:HasSection Graph" using the `fdpm.spec-authoring`
 * plugin profile.
 *
 * Authors SPEC-SECTIONS-TREE v0.1 as a typed graph. The SPEC proposes a
 * core change to the spec_md renderer: stop reading `number` as a
 * hand-authored string and instead derive it via a DFS over the
 * `spec:HasSection` edges, sorted by a new `order` field on the
 * relation. Author-supplied `number` becomes a back-compat fallback
 * for one minor release, then is removed.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-sections-tree
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx cli/scripts/build-spec-sections-tree.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx cli/src/bin/fdpm.ts \
 *     render spec-sections-tree text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-SECTIONS-TREE.md
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

const PROJECT_ID = "spec-sections-tree";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:sections-tree",
  type: "spec:Document",
  fields: {
    title: "SPEC — Sections-as-Tree: Derive Numbering from Graph Position v0.1",
    subtitle:
      "Stop hand-authoring `number` on every spec:Section. Order subsections by a numeric `order` field on spec:HasSection; derive the rendered §N.M.K from a DFS of the document tree.",
    spec_id: "spec:fdpm:sections-tree:0.1",
    version: "0.1.0",
    status: "Proposal",
    audience:
      "FDPM core maintainers, spec_authoring plugin maintainers, and any author of a `cli/scripts/build-spec-*.ts` script who has had to renumber sections after inserting one.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-UID.md",
    ],
    companion_code: "cli/plugins/spec_authoring/renderers/spec_md.ts",
    peer_spec: "docs/specs/SPEC-RENDER-DSL.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Hand-authored section numbers are an unverified mirror of authorial intent: the " +
      "operator types `number: \"7\"` on a primitive whose actual position in the " +
      "document tree is determined by the order of `spec:HasSection` relations. The two " +
      "drift silently — inserting a section between §6 and §7 leaves either the new " +
      "section at the wrong number or the old §7 with a stale string. An identifier " +
      "system that cannot answer 'where in the tree am I?' from its own edges is the " +
      "absence-of-verification this banner forbids.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.1.0 — initial proposal. Derive numbering from `spec:HasSection` edges sorted by a new `order: int` field; keep author-supplied `number` as a deprecated fallback for one minor release.",
    source_script: "cli/scripts/build-spec-sections-tree.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-sections-tree",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx cli/scripts/build-spec-sections-tree.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx cli/src/bin/fdpm.ts \\",
      "  render spec-sections-tree text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-SECTIONS-TREE.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "Section tree",
    "The directed graph formed by `spec:HasSection` edges rooted at a `spec:Document`. Today the renderer ignores its tree shape and re-flattens by string-comparing `number` fields; under this SPEC, the tree IS the canonical shape and `number` is derived from it.",
    "document tree",
  ],
  [
    "Order field",
    "A new optional `order: int` field on `spec:HasSection`. Sparse integers are recommended (10, 20, 30, …) so that inserting a sibling between two existing sections only requires creating one relation, not patching others. Ties broken by `uid` for determinism.",
  ],
  [
    "Derived number",
    "The §N.M.K string the renderer prints next to a section title. Computed by DFS from the document root, accumulating one positional integer per HasSection traversal, joined by '.'. Never authored by humans under this SPEC.",
  ],
  [
    "Authored number (deprecated)",
    "The `number` field on `spec:Section` as it exists today — a hand-typed string like '7' or '12.3.1'. Becomes a fallback for one minor release; emits a deprecation finding when present alongside an `order` edge.",
  ],
  [
    "Sparse ordering",
    "The convention of leaving gaps between successive `order` values (10, 20, 30, …) so that future inserts do not require renumbering siblings. The renderer treats `order` as an opaque comparison key — gaps have no semantic meaning beyond ordering.",
  ],
  [
    "Tree DFS numbering",
    "The standard outline-numbering algorithm: walk depth-first from the root; at each level, assign 1-based positional indices in `order` then `uid` order; concatenate ancestor indices with '.'. Identical to what `compareSectionNumbers` produces today, but sourced from the graph instead of from authored strings.",
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
    id: "spec:stk:script-author",
    role: "SPEC build-script author",
    primary_concern:
      "Insert a section without renumbering twenty downstream `number` strings. Today every insertion in build-spec-*.ts is a sed-style ripple; under this SPEC it is one new relation with a sparse `order`.",
    category: "internal_team",
  },
  {
    id: "spec:stk:renderer-maintainer",
    role: "spec_md renderer maintainer",
    primary_concern:
      "One canonical numbering algorithm; no two sections of truth (graph vs. string). The current `compareSectionNumbers` lexicographic sort masks bugs when authored numbers skip values.",
    category: "internal_team",
  },
  {
    id: "spec:stk:operator",
    role: "Operator",
    primary_concern:
      "Read the rendered SPEC and see correct, contiguous numbering. Edit a section with `fdpm primitive patch` without thinking about whether `number` matches its position.",
    category: "human",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Continue authoring sections with stable IDs; do not learn a new numbering API. Migration must be a one-time codemod, not a behavioural change.",
    category: "external_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "Numbering must be deterministic across replays (SPEC-CORE §5.5.3). DFS over `(order, uid)` is deterministic by construction since `uid` is fixed at create-time per SPEC-UID.",
    category: "internal_team",
  },
];
const stakeholderSpecs: PrimitiveSpec[] = stakeholders.map((s) => ({
  id: s.id,
  type: "spec:Stakeholder",
  fields: { role: s.role, primary_concern: s.primary_concern, category: s.category },
}));

// ── §3 Quality Attributes ──────────────────────────────────────────────────

const qas: Array<{ id: string; attribute: string; pressure: string; priority: string }> = [
  {
    id: "spec:qa:single-source",
    attribute: "Single source of truth",
    pressure:
      "The document's section structure must be derivable from one artifact. Today the graph and the `number` strings are two artifacts that can disagree.",
    priority: "primary",
  },
  {
    id: "spec:qa:author-ergonomics",
    attribute: "Author ergonomics",
    pressure:
      "Inserting one section must require O(1) edits, not O(N) — where N is the count of downstream siblings. Sparse `order` integers achieve this.",
    priority: "primary",
  },
  {
    id: "spec:qa:replay-determinism",
    attribute: "Replay determinism",
    pressure:
      "Numbering must be a deterministic function of the operation log. DFS over `(order, uid)` qualifies because `uid` is minted once and never changes (SPEC-UID §10).",
    priority: "primary",
  },
  {
    id: "spec:qa:back-compat",
    attribute: "Backward compatibility",
    pressure:
      "Existing build-spec-*.ts scripts must continue to render correctly without code changes for one minor release. The renderer falls back to authored `number` when no `order` edge is present.",
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
  label: string;
  statement: string;
  enforcement: "ci_check" | "runtime_check" | "type_system" | "review" | "manual" | "unenforced";
}> = [
  {
    id: "spec:inv:graph-is-truth",
    label: "Graph is the single source of section structure",
    statement:
      "The document's section structure is fully determined by the `spec:HasSection` edges rooted at a `spec:Document`. No other artifact (no authored `number`, no DSL fragment, no plugin override) may contribute to that structure. If two artifacts can describe the same fact, they will eventually disagree; eliminate one.",
    enforcement: "ci_check",
  },
  {
    id: "spec:inv:sparse-order",
    label: "Order is sparse and comparison-only",
    statement:
      "The `order: int` field on `spec:HasSection` is a comparison key, not a positional index. Authors use sparse 10/20/30 conventions; the renderer never displays the integer. Gaps let inserts stay O(1) on existing siblings.",
    enforcement: "review",
  },
  {
    id: "spec:inv:deterministic-tiebreak",
    label: "Ties break on uid, never on insertion timestamp",
    statement:
      "When two siblings share an identical `order`, rendering ordering is determined by their `uid` lexicographic comparison. `uid` is the only field guaranteed unique-and-stable across replay (SPEC-UID §10), so this tiebreak preserves byte-equal-replay.",
    enforcement: "ci_check",
  },
  {
    id: "spec:inv:authored-number-deprecated",
    label: "Authored `number` is fallback-only and deprecated",
    statement:
      "In v0.1, the `number` field on `spec:Section` is honored only when no `spec:HasSection` edge in the project carries `order != 0`. Mixed-mode projects emit deprecation findings. In v0.2 the field is removed and its presence is an error.",
    enforcement: "ci_check",
  },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Invariant",
  fields: { label: p.label, statement: p.statement, enforcement: p.enforcement },
}));

// ── §6 Decision Summary ────────────────────────────────────────────────────
// Rendered by the spec_md renderer from the ADR primitive plus the
// kind: "decision_summary" section body — no separate primitive type
// exists in the spec_authoring profile for it.

// ── §7 ADR ──────────────────────────────────────────────────────────────────

const optA: PrimitiveSpec = {
  id: "spec:opt:graph-derived",
  type: "spec:Option",
  fields: {
    label: "Option A — Graph-derived numbering with `order` field",
    description:
      "Add `order: int` (optional, default 0) to `spec:HasSection`. Renderer performs DFS rooted at the Document, sorting siblings by `(order, uid)`. Derived numbers replace authored `number` strings entirely after a one-release deprecation window.",
    pros: [
      "Single source of truth — the graph is canonical.",
      "Inserts are O(1) edits.",
      "Deterministic by construction (uid tiebreak is stable across replay).",
      "Renderer code shrinks: `compareSectionNumbers` becomes one line of integer comparison.",
      "Cross-doc references (\"§7 of SPEC-CORE\") become uid-resolvable per SPEC-UID.",
    ],
    cons: [
      "Existing scripts need a migration pass (codemod ships with the SPEC).",
      "Operators reading raw graph data see `order: 70` instead of `number: \"7\"` — slightly less self-explanatory until rendered.",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:keep-number",
  type: "spec:Option",
  fields: {
    label: "Option B — Keep authored `number`, add validator for contiguity",
    description:
      "Leave the schema unchanged. Add a `spec:val:section-numbers-contiguous` validator that fails commits when authored numbers skip values within a sibling group.",
    pros: [
      "Zero migration cost.",
      "Explicit numbers stay greppable.",
    ],
    cons: [
      "Does not solve insertion churn — operator still re-types every downstream string.",
      "Validator is content-only; it cannot detect that a number is wrong relative to its tree position because the tree position is implicit.",
      "Two-source-of-truth bug remains.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Treats the symptom (skipped numbers) without addressing the cause (numbering is not derivable from structure). Operator pain on insertion is unchanged.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:render-dsl-only",
  type: "spec:Option",
  fields: {
    label: "Option C — Defer to render-DSL section directives",
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
      "Wrong layer. Section position is graph data, not template logic. Mixing them defeats both.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:sections-tree-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-SECTIONS-TREE-001",
    title: "Derive section numbering from the spec:HasSection tree",
    status: "proposed",
    date: "2026-05-04",
    context:
      "Three converging signals: (1) every build-spec-*.ts script hand-authors `number` strings that duplicate the implicit ordering of `spec:HasSection` relations; (2) `spec:HasSection` already supports `Section → Section` per cli/plugins/spec_authoring/relations.ts:15-16, so the tree shape is permissible today, just unused by the renderer; (3) SPEC-UID v0.2 ships `uid` on every primitive and relation, giving us a deterministic tiebreak for sibling ordering.",
    decision:
      "Adopt graph-derived numbering. Add `order: int` (optional, default 0) to `spec:HasSection`. Renderer DFS-walks `(Document → Section → Section…)` sorted by `(order, uid)` and assigns §N.M.K from the walk. Authored `number` is honored as a fallback for v0.1 and deprecated; removed in v0.2.",
    consequences: [
      {
        polarity: "positive",
        text: "Build scripts shrink: ~20 hand-typed `number` fields drop per SPEC.",
      },
      {
        polarity: "positive",
        text: "Renderer simplifies — `compareSectionNumbers` lexicographic sort is replaced by integer comparison plus uid tiebreak.",
      },
      {
        polarity: "positive",
        text: "Cross-document section references become uid-resolvable, aligned with SPEC-UID v0.2.",
      },
      {
        polarity: "negative",
        text: "One-time migration via codemod required for the eight existing build-spec-*.ts scripts.",
      },
      {
        polarity: "neutral",
        text: "A one-release deprecation window keeps authored `number` as a fallback before removal in v0.2.",
      },
    ],
    compliance_checks: [
      "Differential CI test renders pre- and post-codemod outputs and asserts byte-equality.",
      "Replay-determinism test asserts byte-equal SHA-256 across two consecutive replays of any sections-tree project's log.",
    ],
    revisit_signals: [
      "If a SPEC needs more than ~200 siblings under a single parent and sparse-int `order` becomes unwieldy, revisit Q-1 (fractional indexing).",
      "If FW-2 (kind registry) lands and motivates a richer Section schema, fold this SPEC's invariants into the registry contract.",
    ],
  },
};

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:author-ergonomics",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Author ergonomics (insert cost)",
      cells: [
        { option_id: "spec:opt:graph-derived", value: "O(1) — one new relation with sparse order" },
        { option_id: "spec:opt:keep-number", value: "O(N) — retype every downstream number string" },
        { option_id: "spec:opt:render-dsl-only", value: "O(N) — depends on DSL maturity" },
      ],
    },
  },
  {
    id: "spec:tx:source-of-truth",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Source of truth",
      cells: [
        { option_id: "spec:opt:graph-derived", value: "Single (the graph)" },
        { option_id: "spec:opt:keep-number", value: "Dual (graph + strings)" },
        { option_id: "spec:opt:render-dsl-only", value: "Dual (graph + DSL fragments)" },
      ],
    },
  },
  {
    id: "spec:tx:migration-cost",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Migration cost",
      cells: [
        { option_id: "spec:opt:graph-derived", value: "One codemod run" },
        { option_id: "spec:opt:keep-number", value: "Zero" },
        { option_id: "spec:opt:render-dsl-only", value: "High — depends on DSL stabilisation" },
      ],
    },
  },
  {
    id: "spec:tx:replay-determinism",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Replay determinism",
      cells: [
        { option_id: "spec:opt:graph-derived", value: "Deterministic by (order, uid)" },
        { option_id: "spec:opt:keep-number", value: "Deterministic (already is)" },
        { option_id: "spec:opt:render-dsl-only", value: "Depends on DSL evaluation order" },
      ],
    },
  },
  {
    id: "spec:tx:renderer-complexity",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Renderer complexity",
      cells: [
        { option_id: "spec:opt:graph-derived", value: "compareSectionNumbers deleted; integer compare + DFS" },
        { option_id: "spec:opt:keep-number", value: "Unchanged" },
        { option_id: "spec:opt:render-dsl-only", value: "Higher — DSL hook for numbering" },
      ],
    },
  },
];

// ── §9 QA Scenarios ────────────────────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:insert-section",
    type: "spec:QAScenario",
    fields: {
      title: "Author ergonomics — insert a section without renumbering",
      source: "Build-script author maintaining a SPEC-*.ts script.",
      stimulus: "Insert a new section between §6 and §7 of an existing SPEC.",
      environment: "build-spec-*.ts authoring against a v0.1 host with sections-tree enabled.",
      artifact: "spec:HasSection edges and spec:Section primitives in the project graph.",
      response:
        "Author creates one new spec:Section and one spec:HasSection with order: 65 (between the existing 60 and 70). Renderer outputs the new section as §7 and renumbers downstream automatically.",
      response_measure:
        "Edits to existing primitives = 0; edits to existing relations = 0; new primitives = 1; new relations = 1.",
    },
  },
  {
    id: "spec:qas:replay-determinism",
    type: "spec:QAScenario",
    fields: {
      title: "Replay determinism — byte-equal SHA-256 across replays",
      source: "Core replay subsystem on Host startup.",
      stimulus: "Replay the operation log of a project containing N sections.",
      environment: "FDPM Host startup with the persistent JSONL log on disk.",
      artifact: "Materialised primitive/relation map plus rendered Markdown.",
      response: "The renderer produces byte-equal Markdown output across replays of the same log.",
      response_measure:
        "Two consecutive replays of the same log produce identical SHA-256 of the rendered file.",
    },
  },
  {
    id: "spec:qas:fallback-legacy-script",
    type: "spec:QAScenario",
    fields: {
      title: "Back-compat — unmigrated script renders byte-equal",
      source: "Operator running an unmigrated build script.",
      stimulus:
        "Run `npx tsx cli/scripts/build-spec-uid.ts` (still using authored `number` strings) against a v0.1 host.",
      environment: "v0.1 sections-tree-enabled host with deprecation warnings active.",
      artifact: "The rendered Markdown plus the findings list emitted alongside it.",
      response:
        "Renderer falls back to authored `number`. Output matches pre-SPEC byte-for-byte. A deprecation finding is emitted per Section without an incoming HasSection that carries `order`.",
      response_measure:
        "diff(rendered_v0.1, rendered_pre_spec) == empty. Deprecation findings count equals count(spec:Section without order edge).",
    },
  },
];

// ── §10 Invariants ─────────────────────────────────────────────────────────
// principleSpecs above are typed as spec:Invariant already (the profile
// uses spec:Invariant for both principles and stated invariants). They
// are added to the project once via the `principleSpecs` spread below;
// no separate `invariants` array is needed.

// ── §11 Requirements ───────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:1",
    type: "spec:Requirement",
    fields: {
      label: "Add `order` field to spec:HasSection",
      statement:
        "`spec:HasSection` MUST accept an optional `order: int` field. Default value is 0 when absent.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref: "cli/plugins/spec_authoring/relations.ts; profile schema test.",
    },
  },
  {
    id: "spec:req:2",
    type: "spec:Requirement",
    fields: {
      label: "DFS numbering from the graph",
      statement:
        "The renderer MUST derive §N.M.K from a DFS over `spec:HasSection` rooted at the document, sorting siblings by `(order, uid)`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref:
        "cli/plugins/spec_authoring/renderers/spec_md.test.ts — DFS fixture for nested sections.",
    },
  },
  {
    id: "spec:req:3",
    type: "spec:Requirement",
    fields: {
      label: "Fallback to authored number when no order edge present",
      statement:
        "When NO `spec:HasSection` edge in a project carries `order != 0`, the renderer MUST fall back to authored `number` and produce byte-equal output to v0.0.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "Differential CI test against pre-SPEC rendered fixtures.",
    },
  },
  {
    id: "spec:req:4",
    type: "spec:Requirement",
    fields: {
      label: "Deprecation finding on mixed-mode projects",
      statement:
        "When a Section has both an authored `number` AND a derivable position from the tree, the renderer SHOULD emit one `info`-level finding per such section flagging the redundancy.",
      strength: "SHOULD",
      verifiability: "test",
      verifier_ref: "Mixed-mode fixture in spec_md.test.ts; assert findings count matches.",
    },
  },
  {
    id: "spec:req:5",
    type: "spec:Requirement",
    fields: {
      label: "Migration codemod ships with the SPEC",
      statement:
        "A migration codemod MUST be shipped as `cli/scripts/migrate-section-numbers.ts` that converts existing build-spec-*.ts scripts to the `order`-based form.",
      strength: "MUST",
      verifiability: "ci_check",
      verifier_ref:
        "Codemod run against all eight existing build-spec-*.ts; resulting SPECs render byte-equal.",
    },
  },
  {
    id: "spec:req:6",
    type: "spec:Requirement",
    fields: {
      label: "Remove authored `number` field in v0.2",
      statement:
        "In v0.2.0 of this SPEC, the authored-`number` fallback MUST be removed; presence of `number` on a `spec:Section` MUST raise an `error` finding.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "Tracked under FW-1 in the next revision of this SPEC.",
    },
  },
];

// ── §12 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:1",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion: "`spec:HasSection.order` field is registered and accepts non-negative integers.",
      status: "open",
      evidence_refs: ["cli/plugins/spec_authoring/relations.ts"],
    },
  },
  {
    id: "spec:ac:2",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion: "Rendering a project with `order` edges produces correct §N.M.K headings via DFS.",
      status: "open",
      evidence_refs: ["cli/plugins/spec_authoring/renderers/spec_md.test.ts"],
    },
  },
  {
    id: "spec:ac:3",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "All eight existing build-spec-*.ts scripts render byte-equal output before and after the renderer change, when the migration codemod has not been run.",
      status: "open",
      evidence_refs: ["cli/scripts/", "Differential CI test"],
    },
  },
  {
    id: "spec:ac:4",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "After running the codemod, all eight existing build-spec-*.ts scripts no longer set `number` on any `spec:Section` and still render byte-equal output.",
      status: "open",
      evidence_refs: ["cli/scripts/migrate-section-numbers.ts", "Differential CI test"],
    },
  },
  {
    id: "spec:ac:5",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "Replay determinism: byte-equal SHA-256 across two consecutive replays of any sections-tree project's log.",
      status: "open",
      evidence_refs: ["Replay determinism harness from SPEC-UID coverage, extended for order"],
    },
  },
];

// ── §13 Conformance ────────────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:1",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "DFS numbering matches the document tree",
      procedure:
        "Construct a fixture project with three nested sections (1 → 1.1 → 1.1.1 plus a 1.2 sibling and a §2 root sibling); render via spec:SpecMarkdownRenderer.",
      expected:
        "Output headings read `## 1. …`, `### 1.1. …`, `#### 1.1.1. …`, `### 1.2. …`, `## 2. …` with no other sections present.",
    },
  },
  {
    id: "spec:conf:2",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "Fallback to authored number produces zero diff",
      procedure:
        "Run the eight existing build-spec-*.ts scripts before and after the renderer change with the codemod NOT applied; diff the rendered Markdown.",
      expected: "diff exits 0 for every script.",
    },
  },
  {
    id: "spec:conf:3",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "Tiebreak determinism on identical order",
      procedure:
        "Shuffle the insertion order of sibling sections that share an identical `order`; render twice and compare.",
      expected:
        "Rendered output is invariant across shuffles because uid is the deterministic tiebreak.",
    },
  },
];

// ── §14 Implementation Plan ────────────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:relations-order",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/relations.ts",
      change:
        "Add `order: int` (optional, default 0) to the `spec:HasSection` field list. No cardinality changes.",
      complexity: "XS",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:renderer-dfs",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/renderers/spec_md.ts",
      change:
        "Replace `renderSections` flat-filter with a DFS rooted at the document, sorting children by `(order, uid)`. Introduce `deriveNumber(path: number[]): string`.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:fallback-detection",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/renderers/spec_md.ts",
      change:
        "Detect 'no `order` edges in project' and route through the legacy `compareSectionNumbers` path; emit deprecation findings on mixed-mode projects.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:codemod",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/scripts/migrate-section-numbers.ts",
      change:
        "New script: parses existing build-spec-*.ts, replaces `number: \"N\"` literals with `fields: { order: N * 10 }` on the corresponding `spec:HasSection`, drops the `number` from the `spec:Section` payload.",
      complexity: "M",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:tests",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/renderers/spec_md.test.ts",
      change:
        "Three new fixtures: (a) pure graph-derived; (b) pure authored-number fallback; (c) mixed-mode with deprecation findings.",
      complexity: "S",
      status: "not_started",
    },
  },
  {
    id: "spec:chg:profile-schema",
    type: "spec:ImplementationChange",
    fields: {
      area: "cli/plugins/spec_authoring/primitives/document.ts",
      change:
        "Mark the `number` field on `spec:Section` as deprecated in its description. No structural change in v0.1; field is removed in v0.2.",
      complexity: "XS",
      status: "not_started",
    },
  },
];

// ── §15 Migration Plan ─────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 1,
      label: "Land `order` field + DFS renderer (back-compat)",
      action:
        "Ship CHG-1, CHG-2, CHG-3, CHG-5. Renderer derives numbering from graph when `order != 0` is present anywhere in the project; otherwise falls back. Zero existing build script changes required.",
      affected_paths: [
        "cli/plugins/spec_authoring/relations.ts",
        "cli/plugins/spec_authoring/renderers/spec_md.ts",
        "cli/plugins/spec_authoring/renderers/spec_md.test.ts",
      ],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "Ship the codemod",
      action:
        "CHG-4. Run against all eight existing build-spec-*.ts; commit the migrated forms in a separate PR. Each migrated SPEC re-renders byte-equal.",
      affected_paths: ["cli/scripts/migrate-section-numbers.ts", "cli/scripts/build-spec-*.ts"],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "Mark `number` deprecated in profile docs",
      action:
        "CHG-6. Description-only change; no behaviour change. Operators see the deprecation when they consult `fdpm profile inspect`.",
      affected_paths: ["cli/plugins/spec_authoring/primitives/document.ts"],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "Remove `number` field in SPEC v0.2",
      action:
        "Tracked separately. Once all callers are migrated and one minor release has passed, remove the field from `spec:Section` and the fallback path from the renderer.",
      affected_paths: [
        "cli/plugins/spec_authoring/primitives/document.ts",
        "cli/plugins/spec_authoring/renderers/spec_md.ts",
      ],
      depends_on: ["spec:mig:3"],
    },
  },
];

// ── §16 Risks ──────────────────────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:dfs-bug",
    type: "spec:Risk",
    fields: {
      label: "DFS bug on deep or cyclic graphs",
      description:
        "DFS algorithm bug produces wrong numbering for deeply nested or cycle-containing graphs.",
      likelihood: "low",
      impact: "high",
    },
  },
  {
    id: "spec:risk:codemod-loss",
    type: "spec:Risk",
    fields: {
      label: "Codemod silent loss",
      description:
        "Codemod misparses an existing build-spec-*.ts script and silently drops a section.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:order-collisions",
    type: "spec:Risk",
    fields: {
      label: "Order collisions and uid-order surprise",
      description:
        "Authors copy-paste `order: 10` everywhere, causing all sections to tie and rely on uid order — which is creation-time-correlated, hard to reason about, and often not what the author intended.",
      likelihood: "medium",
      impact: "medium",
    },
  },
  {
    id: "spec:risk:render-perf",
    type: "spec:Risk",
    fields: {
      label: "Render-time perf regression on large docs",
      description: "DFS over large documents (>500 sections) increases render time noticeably.",
      likelihood: "low",
      impact: "low",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:dfs-test",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Property-test the DFS against a reference outline-numbering implementation across 1000 random trees. Reject cycles at validate time (HasSection is already declared transitive but cycles are not allowed).",
      status: "planned",
    },
  },
  {
    id: "spec:mit:codemod-diff-gate",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Codemod is gated by a per-SPEC differential test: if rendered output diverges by even one byte before/after migration, the codemod refuses to write the file.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:lint-sparse-order",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Add a `spec:val:section-order-sparse` advisory validator that emits an `info` finding when any sibling group has more than two ties. Documents the 10/20/30 convention.",
      status: "planned",
    },
  },
  {
    id: "spec:mit:perf-baseline",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Benchmark render time on the largest existing SPEC (SPEC-DNIS, ~120 sections); fail CI if it exceeds 2× the pre-change baseline.",
      status: "planned",
    },
  },
];

// ── §17 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:order-type",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should `order` be an integer (this SPEC's choice) or a fractional/decimal type (à la fractional indexing) so that arbitrary inserts never require renumbering even with dense neighbours?",
      default_choice:
        "Integer with sparse convention (10/20/30). Fractional indexing solves a problem we don't have at SPEC scale (≤200 siblings); the operator-readability cost of fractional values outweighs the saved corner case.",
      is_blocking: "yes",
    },
  },
  {
    id: "spec:q:depth-field",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Should `spec:Section.depth` (already optional, `## … ######`) remain authored, or be derived from the DFS depth too?",
      default_choice:
        "Derive from DFS depth in v0.1; keep `depth` as an override-only field. Out of scope for the main proposal.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:cross-doc-numbers",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "Cross-document section references (\"§7 of SPEC-CORE\") — should the renderer hot-link the §-number into a uid-based anchor at render time?",
      default_choice:
        "Out of scope for v0.1. Tracked under SPEC-UID Q1 (cross-project relations). Revisit when that lands.",
      is_blocking: "no",
    },
  },
];

// ── §18 Future Work ────────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:remove-number",
    type: "spec:FutureWork",
    fields: {
      label: "Remove `number` field on spec:Section in v0.2",
      description:
        "Tracked as REQ-6. Requires one minor release of fallback behaviour; ship in the SPEC after this one.",
      target_version: "0.2",
      deferred_reason: ["Needs one minor release of fallback behaviour before removal."],
    },
  },
  {
    id: "spec:fw:section-kind-registry",
    type: "spec:FutureWork",
    fields: {
      label: "Promote `kind` from closed enum to plugin-extensible registry",
      description:
        "Today the `kind` enum is hard-coded in primitives/document.ts and the dispatch table is private to spec_md.ts. A separate SPEC will let plugins register new kinds (with renderer fragments) without forking spec_authoring.",
      target_version: "future",
      deferred_reason: ["Out of scope: structural numbering and kind extensibility are independent concerns."],
    },
  },
  {
    id: "spec:fw:render-dsl-integration",
    type: "spec:FutureWork",
    fields: {
      label: "Once render-DSL stabilises, allow body_md to be a DSL fragment",
      description:
        "Independent of this SPEC. Numbering still derives from the graph; the DSL only affects body content.",
      target_version: "future",
      deferred_reason: ["Blocked on SPEC-RENDER-DSL stabilisation."],
    },
  },
];

// ── §19 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "CLAUDE.md — Project Guidelines (this repository, root).",
      locator: "CLAUDE.md",
      verification: "verified",
      verification_note:
        "Read the file at HEAD. Sections \"Behavioral Constraints\" and \"PALS's LAW\" govern the disclaimer/banner requirements honored by this SPEC.",
    },
  },
  {
    id: "spec:ref:purpose",
    type: "spec:Reference",
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
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-CORE — Replay determinism (§5.5.3).",
      locator: "docs/specs/SPEC-CORE.md",
      verification: "verified",
      verification_note:
        "Read §5.5.3. The DFS-over-(order, uid) numbering preserves the byte-equal-replay property because both `order` and `uid` are immutable post-creation.",
    },
  },
  {
    id: "spec:ref:spec-uid",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-UID — Universal Identifiers (§10 invariants).",
      locator: "docs/specs/SPEC-UID.md",
      verification: "verified",
      verification_note:
        "Read §10. Confirms uid is minted once and never changes — the necessary precondition for using uid as a stable tiebreak in this SPEC's DFS.",
    },
  },
  {
    id: "spec:ref:relations-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "spec_authoring/relations.ts — HasSection definition.",
      locator: "cli/plugins/spec_authoring/relations.ts",
      verification: "verified",
      verification_note:
        "Read lines 11-21. Confirms `source_types: [\"spec:Document\", \"spec:Section\"]` already permits the tree shape; this SPEC adds the `order` field, not the tree itself.",
    },
  },
  {
    id: "spec:ref:spec-md-renderer",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "spec_md.ts — current spec:SpecMarkdownRenderer implementation.",
      locator: "cli/plugins/spec_authoring/renderers/spec_md.ts",
      verification: "verified",
      verification_note:
        "Read lines 705-769. `KIND_RENDERERS` is the closed dispatch table; `renderSections` is the function this SPEC modifies; `compareSectionNumbers` is the lexicographic sort that becomes obsolete.",
    },
  },
  {
    id: "spec:ref:spec-render-dsl",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "SPEC-RENDER-DSL — Render-Time DSL for FDPM Document Templates.",
      locator: "docs/specs/SPEC-RENDER-DSL.md",
      verification: "verified",
      verification_note:
        "Read §1 Purpose. Confirms render-DSL targets template content, not structural metadata — supports the rejection of Option C.",
    },
  },
];

// ── §20 Revision history ───────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title: "Initial Proposal — graph-derived section numbering",
      notes:
        "Captures the dual-source-of-truth bug between `spec:Section.number` and `spec:HasSection` order; proposes graph-derived numbering with sparse `order: int` and `uid` tiebreak; outlines six implementation changes, four migration steps, three QA scenarios, and a one-release deprecation window for authored `number`.",
      affected_sections: ["§1", "§7", "§8", "§9", "§11", "§14", "§15"],
      kind: "minor",
    },
  },
];

// ── §0..§N Sections (the document tree) ────────────────────────────────────
//
// The sections themselves are still authored with hand-typed `number`
// strings here, because this script targets the CURRENT renderer (which
// reads `number`). Once this SPEC's CHG-2 lands, this script gets
// migrated by CHG-4's codemod to drop the `number` field and add `order`
// to each spec:HasSection — at which point the script becomes self-
// demonstrating evidence of the SPEC's effect.

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
        "This SPEC defines a change to the `spec_authoring` profile and its companion renderer: section numbering (the §N.M.K strings printed next to titles) is derived from the `spec:HasSection` graph instead of being hand-authored on each `spec:Section`. A new optional field `order: int` on `spec:HasSection` provides the sibling-ordering key; the existing `uid` (per SPEC-UID v0.2) provides the tiebreak.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- **A new `kind` registry.** Section roles (`stakeholders`, `adr`, …) remain a closed enum in v0.1. Plugin-extensible kinds are tracked under FW-2.",
        "- **Render-DSL integration.** Body content can become DSL-evaluated (SPEC-RENDER-DSL); this SPEC is strictly about heading structure.",
        "- **Cross-document section references.** Referring to '§7 of SPEC-CORE' across projects is FW-tracked, contingent on SPEC-UID Q1 (cross-project relations).",
        "- **Deprecation timeline beyond v0.2.** REQ-6 commits to removing the `number` field in v0.2 of THIS SPEC; the calendar window is set when v0.2 ships.",
        "",
        "### 1.3 Why now",
        "",
        "Three converging signals:",
        "",
        "1. **Every existing `cli/scripts/build-spec-*.ts` hand-authors `number` strings.** Inserting one section means renumbering all downstream siblings — a real, repeated source of churn.",
        "2. **`spec:HasSection` already supports `Section → Section`** (cli/plugins/spec_authoring/relations.ts:15-16). The tree is already representable; the renderer just doesn't use the tree shape.",
        "3. **SPEC-UID v0.2 ships `uid` on every primitive and relation**, giving us the deterministic, replay-stable tiebreak this SPEC needs for `(order, uid)` sibling ordering.",
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
        "The recurring tension is **author ergonomics vs. back-compat**. Sparse `order` integers and a one-release fallback window resolve both: existing scripts keep working unchanged; new authoring patterns are O(1).",
    },
  },
  {
    id: "spec:sec:4",
    type: "spec:Section",
    fields: {
      number: "4",
      title: "Architectural Principles",
      kind: "principles",
      body_md: "Each principle is testable; the renderer enumerates them in declared order.",
    },
  },
  {
    id: "spec:sec:5",
    type: "spec:Section",
    fields: {
      number: "5",
      title: "Definitions",
      kind: "definitions",
      body_md:
        "Terms used by this SPEC. Definitions are auto-included from `spec:Term` primitives joined by `spec:Defines`.",
    },
  },
  {
    id: "spec:sec:6",
    type: "spec:Section",
    fields: {
      number: "6",
      title: "Decision Summary",
      kind: "decision_summary",
      body_md:
        "The single architectural decision in this SPEC is captured by ADR-SECTIONS-TREE-001: derive numbering from the `spec:HasSection` tree. Trade-offs are tabulated in §8.",
    },
  },
  {
    id: "spec:sec:7",
    type: "spec:Section",
    fields: {
      number: "7",
      title: "Architecture Decision Record",
      kind: "adr",
      body_md: "The full ADR text is embedded below.",
    },
  },
  {
    id: "spec:sec:8",
    type: "spec:Section",
    fields: {
      number: "8",
      title: "Trade-off Matrix",
      kind: "tradeoff_matrix",
      body_md:
        "Trade-off axes for ADR-SECTIONS-TREE-001 across the three considered options. Option A wins on every axis except migration cost (where Option B's zero-migration wins by definition).",
    },
  },
  {
    id: "spec:sec:9",
    type: "spec:Section",
    fields: {
      number: "9",
      title: "Quality-Attribute Scenarios",
      kind: "scenarios",
      body_md:
        "Three SEI-format scenarios pin the most consequential behaviours: insert-without-renumbering (§9.1), replay-determinism across the new ordering (§9.2), and back-compat fallback (§9.3).",
    },
  },
  {
    id: "spec:sec:10",
    type: "spec:Section",
    fields: {
      number: "10",
      title: "Invariants",
      kind: "prose",
      body_md:
        "Four invariants the renderer MUST maintain for graph-derived numbering to be sound. Each invariant is checked by a conformance item (§13).",
    },
  },
  {
    id: "spec:sec:11",
    type: "spec:Section",
    fields: {
      number: "11",
      title: "Requirements",
      kind: "prose",
      body_md:
        "Six normative requirements. Five MUST, one SHOULD. All MUST clauses are verifiable by automated tests.",
    },
  },
  {
    id: "spec:sec:12",
    type: "spec:Section",
    fields: {
      number: "12",
      title: "Acceptance Criteria",
      kind: "acceptance_criteria",
      body_md:
        "Five acceptance criteria. AC-3 (zero diff before migration) and AC-4 (zero diff after codemod) together prove byte-level back-compat.",
    },
  },
  {
    id: "spec:sec:13",
    type: "spec:Section",
    fields: {
      number: "13",
      title: "Conformance",
      kind: "conformance",
      body_md:
        "Three conformance items: derive-from-graph, fallback-zero-diff, and tiebreak-determinism.",
    },
  },
  {
    id: "spec:sec:14",
    type: "spec:Section",
    fields: {
      number: "14",
      title: "Required Changes to Existing Code",
      kind: "implementation_plan",
      body_md:
        "Six implementation changes spanning the profile schema (1), the renderer (2 edits, 1 deprecation), the codemod (1 new script), and the test suite (1).",
    },
  },
  {
    id: "spec:sec:15",
    type: "spec:Section",
    fields: {
      number: "15",
      title: "Migration Plan",
      kind: "migration",
      body_md:
        "Four sequenced steps: ship back-compat → ship codemod → mark deprecated → remove in v0.2.",
    },
  },
  {
    id: "spec:sec:16",
    type: "spec:Section",
    fields: {
      number: "16",
      title: "Risks and Mitigations",
      kind: "risks",
      body_md:
        "Four risks identified, four mitigations planned. The most consequential is RSK-2 (codemod silent loss); mitigated by MIT-2's byte-diff gate.",
    },
  },
  {
    id: "spec:sec:17",
    type: "spec:Section",
    fields: {
      number: "17",
      title: "Open Questions",
      kind: "open_questions",
      body_md:
        "Three open questions, all with default resolutions. Q-1 (integer vs. fractional `order`) is the closest to blocking — the integer-with-sparse-convention default is what this SPEC commits to.",
    },
  },
  {
    id: "spec:sec:18",
    type: "spec:Section",
    fields: {
      number: "18",
      title: "Future Work",
      kind: "future_work",
      body_md:
        "Three items deferred: removing `number` (v0.2), promoting `kind` to a plugin registry (separate SPEC), and DSL-evaluated body_md (separate SPEC).",
    },
  },
  {
    id: "spec:sec:19",
    type: "spec:Section",
    fields: {
      number: "19",
      title: "References",
      kind: "references",
      body_md:
        "Seven references, all PALS-verified. Three repo files (CLAUDE.md, PURPOSE.md, two profile source files), three peer SPECs (CORE, UID, RENDER-DSL), and one renderer source file.",
    },
  },
  {
    id: "spec:sec:20",
    type: "spec:Section",
    fields: {
      number: "20",
      title: "Revision History",
      kind: "revision_history",
      body_md: "0.1.0 — initial Proposal (2026-05-04).",
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
  { id: "rel:adr-considers-graph", type: "spec:Considers", from: adr.id, to: optA.id },
  { id: "rel:adr-considers-keep", type: "spec:Considers", from: adr.id, to: optB.id },
  { id: "rel:adr-considers-dsl", type: "spec:Considers", from: adr.id, to: optC.id },

  // ADR chose Option A
  { id: "rel:adr-chose-graph", type: "spec:Chose", from: adr.id, to: optA.id },

  // ADR has trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target quality attributes
  {
    id: "rel:qas-insert-targets-ergonomics",
    type: "spec:Targets",
    from: "spec:qas:insert-section",
    to: "spec:qa:author-ergonomics",
  },
  {
    id: "rel:qas-replay-targets-determinism",
    type: "spec:Targets",
    from: "spec:qas:replay-determinism",
    to: "spec:qa:replay-determinism",
  },
  {
    id: "rel:qas-fallback-targets-back-compat",
    type: "spec:Targets",
    from: "spec:qas:fallback-legacy-script",
    to: "spec:qa:back-compat",
  },

  // Mitigations cover risks
  { id: "rel:mit-dfs-mitigates", type: "spec:Mitigates", from: "spec:mit:dfs-test", to: "spec:risk:dfs-bug" },
  { id: "rel:mit-codemod-mitigates", type: "spec:Mitigates", from: "spec:mit:codemod-diff-gate", to: "spec:risk:codemod-loss" },
  { id: "rel:mit-sparse-mitigates", type: "spec:Mitigates", from: "spec:mit:lint-sparse-order", to: "spec:risk:order-collisions" },
  { id: "rel:mit-perf-mitigates", type: "spec:Mitigates", from: "spec:mit:perf-baseline", to: "spec:risk:render-perf" },

  // Migration step dependencies
  { id: "rel:mig-2-deps-1", type: "spec:DependsOn", from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-2", type: "spec:DependsOn", from: "spec:mig:3", to: "spec:mig:2" },
  { id: "rel:mig-4-deps-3", type: "spec:DependsOn", from: "spec:mig:4", to: "spec:mig:3" },

  // Acceptance criteria verify requirements
  { id: "rel:ac1-verifies-r1", type: "spec:Verifies", from: "spec:ac:1", to: "spec:req:1" },
  { id: "rel:ac2-verifies-r2", type: "spec:Verifies", from: "spec:ac:2", to: "spec:req:2" },
  { id: "rel:ac3-verifies-r3", type: "spec:Verifies", from: "spec:ac:3", to: "spec:req:3" },
  { id: "rel:ac4-verifies-r5", type: "spec:Verifies", from: "spec:ac:4", to: "spec:req:5" },
  { id: "rel:ac5-verifies-inv-tiebreak", type: "spec:Verifies", from: "spec:ac:5", to: "spec:inv:deterministic-tiebreak" },

  // Conformance items verify
  { id: "rel:conf1-verifies-r2", type: "spec:Verifies", from: "spec:conf:1", to: "spec:req:2" },
  { id: "rel:conf2-verifies-r3", type: "spec:Verifies", from: "spec:conf:2", to: "spec:req:3" },
  { id: "rel:conf3-verifies-tiebreak", type: "spec:Verifies", from: "spec:conf:3", to: "spec:inv:deterministic-tiebreak" },

  // ADR resolves the blocking question (chose integer over fractional)
  { id: "rel:adr-resolves-order-type", type: "spec:Resolves", from: adr.id, to: "spec:q:order-type" },

  // Citations
  { id: "rel:adr-cites-relations", type: "spec:Cites", from: adr.id, to: "spec:ref:relations-ts" },
  { id: "rel:adr-cites-spec-md", type: "spec:Cites", from: adr.id, to: "spec:ref:spec-md-renderer" },
  { id: "rel:adr-cites-uid", type: "spec:Cites", from: adr.id, to: "spec:ref:spec-uid" },
  { id: "rel:adr-cites-core", type: "spec:Cites", from: adr.id, to: "spec:ref:spec-core" },
  { id: "rel:doc-cites-claude", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-cites-purpose", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:purpose" },
  { id: "rel:opt-c-cites-render-dsl", type: "spec:Cites", from: optC.id, to: "spec:ref:spec-render-dsl" },

  // Required reads
  { id: "rel:doc-req-claude", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-req-purpose", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:purpose" },
  { id: "rel:doc-req-core", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:spec-core" },
  { id: "rel:doc-req-uid", type: "spec:RequiredRead", from: documentSpec.id, to: "spec:ref:spec-uid" },

  // Document RevisedIn
  { id: "rel:doc-revised-0-1-0", type: "spec:RevisedIn", from: documentSpec.id, to: "spec:rev:0-1-0" },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main() {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — Sections-as-Tree: Derive Numbering from Graph Position",
    profile: PROFILE_ID,
    description:
      "SPEC for replacing hand-authored `number` strings on spec:Section with graph-derived numbering: add `order: int` to spec:HasSection, DFS the document tree, render §N.M.K from the walk; deprecate authored `number` for one minor release.",
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
    `  FDPM_DATA_DIR=/tmp/fdpm-spec-sections-tree npx tsx cli/src/bin/fdpm.ts \\`,
  );
  console.log(
    `    render ${PROJECT_ID} text/markdown --renderer-id spec:SpecMarkdownRenderer \\`,
  );
  console.log(`    -o docs/specs/SPEC-SECTIONS-TREE.md`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  if (e && typeof e === "object" && "findings" in e) {
    console.error("Findings:", JSON.stringify((e as { findings: unknown }).findings, null, 2));
  }
  process.exit(1);
});
