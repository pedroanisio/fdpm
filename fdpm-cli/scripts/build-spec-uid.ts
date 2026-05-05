/**
 * Build the SPEC for "Universal Identifiers (UID) for Cross-Artifact References"
 * using the `fdpm.spec-authoring` plugin profile.
 *
 * Authors SPEC-UID v0.1 as a typed graph: every structural element of
 * the SPEC (Document, Sections, Stakeholders, Quality Attributes, ADR
 * with Options + Trade-off Matrix, QA Scenarios, Requirements,
 * Acceptance Criteria, Conformance Items, Risks, Open Questions,
 * Future Work, References, Implementation Plan, Migration Steps,
 * Revision history, Definitions) is materialised as typed primitives
 * joined by typed relations.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-uid
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-uid npx tsx fdpm-cli/scripts/build-spec-uid.ts
 *
 * Then render the SPEC to disk:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-uid npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-uid text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-UID.md
 *
 * Validation runs on commit (§7 pipeline). Any rule violation surfaces
 * as a finding — including PALS-LAW rules (`spec:val:reference-has-
 * verification`, `spec:val:adr-has-options`, `spec:val:qas-six-fields`,
 * etc.). The script will fail loudly if the SPEC is structurally
 * incomplete; that's by design.
 */

import {
  openHost,
  defineProject,
  type PrimitiveSpec,
  type RelationSpec,
} from "../src/sdk.js";
import { PROFILE_ID } from "../plugins/spec_authoring/index.js";

const PROJECT_ID = "spec-uid";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:uid",
  type: "spec:Document",
  fields: {
    title: "SPEC — Universal Identifiers for Cross-Artifact References v0.2",
    subtitle:
      "Mint a ULID alongside every primitive and relation, treat it as the canonical reference key, and let cross-workbook links target it.",
    spec_id: "spec:fdpm:uid:0.2",
    version: "0.2.0",
    status: "Stable",
    audience:
      "FDPM core maintainers, plugin authors, security reviewers, and any operator who has wished `transfer.import` could detect duplicates by identity rather than by slug.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
    ],
    companion_code: "fdpm-cli/src/core/models/instance.ts",
    peer_spec: "docs/specs/SPEC-CORE.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "Cross-artifact references that use only human-authored slugs are unverified by " +
      "construction: a renamed slug breaks every reference silently, and a copied " +
      "primitive in another workbook carries the same slug with different identity. " +
      "An identifier system that cannot answer 'is this the same artifact?' is the " +
      "absence-of-verification this banner forbids.",
    date: "2026-05-04",
    generated_by: "Claude Opus 4.7 (1M context) via Claude Code (fdpm.spec-authoring)",
    revision_note:
      "0.2.0 — implementation landed: dual-ID schema, Core mint site, deterministic upcaster (op_id-seeded), uid_index, --by-uid CLI surface, and three-mode transfer.import dedup. 506 tests pass.",
    source_script: "fdpm-cli/scripts/build-spec-uid.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-uid",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-uid npx tsx fdpm-cli/scripts/build-spec-uid.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-uid npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-uid text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-UID.md",
    ].join("\n"),
  },
};

// ── §3 Definitions (Term primitives) ───────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  [
    "Slug",
    "A human-authored, profile-defined identifier with semantic meaning, e.g., `spec:doc:cel-validator`. Operator-typeable, greppable, and namespaced. Mutable: a `primitive.replace` op can change it.",
    "human ID, namespaced ID",
  ],
  [
    "UID",
    "A 26-character ULID (Crockford base32) minted by Core at primitive/relation creation. Opaque, immutable, time-sortable, and globally unique. Never authored by a human; never changed.",
    "universal identifier, ULID",
  ],
  [
    "ULID",
    "Universally Unique Lexicographically Sortable Identifier. 128 bits — 48 bits of millisecond timestamp + 80 bits of randomness. Crockford base32 encoding produces a 26-char string that sorts in creation order under byte comparison.",
  ],
  [
    "Cross-artifact reference",
    "A typed reference from a primitive in workbook A to a primitive in workbook B. Today: not supported (relations validate endpoints in the local workbook map only). Under this SPEC: a typed field carrying `{ uid, workbook_id?, slug? }` where `uid` is load-bearing.",
  ],
  [
    "Reference stability",
    "The property that a reference resolves to the same artifact even after slug rename, workbook rename, or transfer. UIDs guarantee this; slugs do not.",
  ],
  [
    "Dual-ID model",
    "Every primitive and relation carries both a `id` (slug, author-facing) and a `uid` (ULID, reference-canonical). Both are indexed; either resolves to the same instance.",
  ],
  [
    "Replay determinism",
    "The property (SPEC-CORE §5.5.3) that replaying the operation log produces byte-equal state every run. UIDs minted during replay must be deterministic functions of the operation, not fresh random values.",
  ],
  [
    "Upcaster",
    "A pure function `(oldPayload) → newPayload` registered in `fdpm-cli/src/core/operations/upcast.ts` that runs at replay time, before the operation is applied. Used to evolve persisted log shapes across SPEC versions.",
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
      "Keep typing `fdpm primitive show spec:doc:foo` as today; never have to memorise or paste 26-char opaque strings unless explicitly asked.",
    category: "human",
  },
  {
    id: "spec:stk:plugin-author",
    role: "Plugin author",
    primary_concern:
      "Continue declaring `id_format: idTemplate('spec:doc:{slug}', 'global')`; UID minting is Core's job, not the plugin's.",
    category: "external_team",
  },
  {
    id: "spec:stk:core-maintainer",
    role: "Core maintainer",
    primary_concern:
      "One canonical mint site; deterministic replay; no silent mutation of historical logs; upcaster path mirrors B/host_compat for existing JSONL.",
    category: "internal_team",
  },
  {
    id: "spec:stk:tooling-author",
    role: "Tooling / SDK author",
    primary_concern:
      "Resolve a reference to its target by `uid` in O(1) within a workbook and O(N_projects) across; deduplicate during transfer/import without prompting the user.",
    category: "external_team",
  },
  {
    id: "spec:stk:security-reviewer",
    role: "Security reviewer",
    primary_concern:
      "ULID minting is local (no network); randomness source is documented; collision probability is bounded; no information leakage via the timestamp prefix beyond what op_id already exposes.",
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
    id: "spec:qa:correctness",
    attribute: "Correctness",
    pressure:
      "Every primitive and relation must have a uid after migration; every reference must resolve; replay must produce byte-equal state.",
    priority: "primary",
  },
  {
    id: "spec:qa:auditability",
    attribute: "Auditability",
    pressure:
      "A uid is a permanent identity claim. Every mint event must be traceable to the originating operation; no out-of-band uid creation is permitted.",
    priority: "primary",
  },
  {
    id: "spec:qa:backwards-compat",
    attribute: "Backwards compatibility",
    pressure:
      "Existing JSONL logs must replay forward without operator intervention. Existing CLI commands must keep accepting slugs as today.",
    priority: "primary",
  },
  {
    id: "spec:qa:modifiability",
    attribute: "Modifiability",
    pressure:
      "Adding the uid field must be a Core-only change; plugins must not need to update.",
    priority: "secondary",
  },
  {
    id: "spec:qa:performance",
    attribute: "Performance",
    pressure:
      "ULID generation runs once per primitive/relation create. Cross-workbook resolution is O(N_projects) without an index; an index brings O(1).",
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
    id: "spec:prin:dual-id",
    ordinal: 1,
    title: "Slug and UID coexist; neither replaces the other.",
    statement:
      "Every primitive and relation carries both `id` (slug) and `uid` (ULID). The slug is author-facing; the uid is reference-canonical. Both are first-class indexed properties; neither is derivable from the other.",
    strength: "MUST",
  },
  {
    id: "spec:prin:uid-immutable",
    ordinal: 2,
    title: "UIDs are immutable.",
    statement:
      "Once minted, a uid never changes. `primitive.replace` preserves it. `primitive.patch` and `primitive.field-patch` cannot touch it. Any operation that produces a uid must produce a fresh one only when the artifact is logically new.",
    strength: "MUST",
  },
  {
    id: "spec:prin:replay-deterministic",
    ordinal: 3,
    title: "Replay is byte-equal.",
    statement:
      "UIDs persisted in the log are replayed as-is. UIDs minted at upcaster time (for legacy ops without uids) must be deterministic functions of the operation — same input log produces same uids on every replay, on every host.",
    strength: "MUST",
  },
  {
    id: "spec:prin:operator-ux-unchanged",
    ordinal: 4,
    title: "Operators keep typing slugs.",
    statement:
      "Every CLI command that accepts an id must continue to accept the slug as today. UIDs surface only when the operator explicitly asks (via a `--by-uid` flag or in JSON output) — never as the default.",
    strength: "MUST",
  },
  {
    id: "spec:prin:plugins-untouched",
    ordinal: 5,
    title: "Plugins do not author UIDs.",
    statement:
      "Plugin manifests, primitive type definitions, and CEL predicates do not reference uids. The mint site is Core; the surface is Core-controlled. A plugin author who has never heard of ULID still ships working primitives.",
    strength: "MUST",
  },
  {
    id: "spec:prin:cross-ref-typed",
    ordinal: 6,
    title: "Cross-artifact references are a typed primitive field.",
    statement:
      "A reference from one artifact to another is modelled as a struct field `{ uid: string(26), workbook_id?: string, slug?: string }`. The `uid` is load-bearing; `workbook_id` is a resolution hint; `slug` is operator-readable cache. Bare strings are not references.",
    strength: "SHOULD",
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
  id: "spec:opt:dual-id",
  type: "spec:Option",
  fields: {
    label: "Option A — Dual-ID model (slug + ULID)",
    description:
      "Add a `uid: string(26)` field to PrimitiveInstance and RelationInstance. Core mints at create time; preserves at replace; carries through transfer/template; mints fresh on clone. Slug remains the operator's surface; uid is the reference-canonical key.",
    pros: [
      "Operator UX is unchanged — `fdpm primitive show spec:doc:foo` still works.",
      "Plugins are untouched — no schema changes to plugin code.",
      "Cross-artifact references gain reference stability for free.",
      "Transfer/import deduplication becomes possible without prompting.",
      "Existing logs replay forward via an upcaster (the mechanism already exists).",
      "No SPEC v2 break — this is a v1.2 additive change.",
    ],
    cons: [
      "Schema gains a field on every primitive and relation; persistence size grows by ~30 bytes per op.",
      "Two id-spaces to keep in sync; bug surface is the index between them.",
      "Cross-workbook resolution is O(N_projects) without an index; needs a host-level uid_index for O(1).",
    ],
    verdict: "chosen",
  },
};

const optB: PrimitiveSpec = {
  id: "spec:opt:replace-slug",
  type: "spec:Option",
  fields: {
    label: "Option B — Replace slugs with ULIDs entirely",
    description:
      "Drop the slug system. Every primitive's `id` becomes a 26-char ULID. Plugins lose `id_format` and `idTemplate(...)`. Operators paste ULIDs.",
    pros: [
      "Single id-space, simpler model.",
      "No dual-resolution code path.",
    ],
    cons: [
      "Operator UX disaster — every CLI command takes a 26-char opaque string.",
      "Cross-references in renderers (`See [§4.3]`) become unreadable.",
      "84 plugin primitive types currently declare `idTemplate('spec:doc:{slug}', ...)`; all must rewrite.",
      "Greppability of git diffs collapses.",
      "Documentation and ADRs that say 'see arch:component:auth-svc' all break.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Throws away authoring ergonomics; rejected by the operator, plugin-author, and tooling-author stakeholders.",
  },
};

const optC: PrimitiveSpec = {
  id: "spec:opt:status-quo",
  type: "spec:Option",
  fields: {
    label: "Option C — Status quo, document the gap",
    description:
      "Leave the schema unchanged. Document that cross-artifact references use slugs, accept the fragility, and ship `transfer.import --merge-by-slug` instead.",
    pros: [
      "Zero code change.",
      "No upcaster, no migration, no SPEC bump.",
    ],
    cons: [
      "Slug rename still silently breaks references.",
      "Two artifacts in different workbooks with the same slug remain ambiguous.",
      "PALS-LAW posture: 'is this the same artifact?' has no answer.",
      "Cross-workbook relations remain impossible — the boundary stays hard.",
    ],
    verdict: "rejected",
    rejection_reason:
      "Defers the problem; future cross-artifact references would re-litigate the design under more constraints.",
  },
};

const adr: PrimitiveSpec = {
  id: "spec:adr:uid-001",
  type: "spec:ADR",
  fields: {
    adr_id: "ADR-UID-001",
    title: "Adopt the dual-ID model (slug + ULID) for FDPM artifacts",
    status: "accepted",
    date: "2026-05-04",
    context: [
      "FDPM v1.1 has a hard workbook boundary: relations validate endpoints in the local primitive map only ([pipeline.ts:579-580](fdpm-cli/src/core/validation/pipeline.ts#L579)), and `primitive id collision` ([replay.ts:171-175](fdpm-cli/src/core/store/replay.ts#L171)) is enforced per-workbook, never globally.",
      "84 plugin primitives declare `uniqueness: 'global'` as their default ([_common.ts](fdpm-cli/plugins/spec_authoring/_common.ts), [formal_specification/_common.ts](fdpm-cli/plugins/formal_specification/_common.ts)) — but that field is parsed by Zod and never read by any runtime code.",
      "The audit-trail layer is already ULID-native: `op_id`, `causation_op_id`, and `parent_op_id` are 26-char ULIDs ([operation.ts:10-20](fdpm-cli/src/core/operations/operation.ts#L10)), and `request_id` is a UUIDv7. The `ulid` package is already in dependencies.",
      "Cross-artifact references — needed for inter-document citations, `transfer.import --merge`, and any future cross-workbook relation type — require an identifier with two properties slugs lack: global uniqueness *enforced* by the host, and stability across rename/transfer.",
      "PURPOSE.md frames FDPM as a **knowledge graph**. A graph whose nodes lack a stable identity cannot represent inter-graph references coherently.",
    ].join("\n\n"),
    decision:
      "Adopt the dual-ID model: every primitive and relation gets a `uid: string(26)` field. Core mints the ULID at create time; preserves it across replace/transfer/template; mints fresh on clone. The slug stays the operator's surface; the uid becomes the reference-canonical key. Cross-artifact references become a typed `{ uid, workbook_id?, slug? }` field shape.",
    consequences: [
      {
        polarity: "positive",
        text:
          "Cross-artifact references become reference-stable. Slug renames no longer break inter-document links.",
      },
      {
        polarity: "positive",
        text:
          "`transfer.import` can deduplicate by uid; clone vs. transfer becomes a semantic distinction (new uid vs. preserved uid).",
      },
      {
        polarity: "positive",
        text:
          "Audit-trail continuity: 'show every operation that ever touched this primitive' is O(log_lines), not O(N_projects × string_search).",
      },
      {
        polarity: "negative",
        text:
          "Schema grows on every primitive and relation; persistence size grows by ~30 bytes per op. Storage cost is real but bounded.",
      },
      {
        polarity: "negative",
        text:
          "Two id-spaces to keep in sync; a Core-level uid_index is needed for O(1) lookup. Bug surface is the index between them.",
      },
      {
        polarity: "neutral",
        text:
          "Existing JSONL logs replay forward via an upcaster — the same mechanism that handled `host_compat` in [upcast.ts](fdpm-cli/src/core/operations/upcast.ts). No operator-side migration needed.",
      },
    ],
    compliance_checks: [
      "✓ `PrimitiveInstance` and `RelationInstance` schemas declare `uid: z.string().length(26).regex(ULID_PATTERN)` (fdpm-cli/src/core/models/instance.ts).",
      "✓ Every `primitive.create`, `relation.create`, `transfer.import`, `template.apply`, `workbook.clone`, and `workbook.split` operation records a `uid` in its payload (fdpm-cli/src/core/host.ts, fdpm-cli/src/core/host-extra.ts).",
      "✓ Replay against a v1.1 log with no uids produces a v1.2 state with all uids present and byte-equal across runs — verified by SPEC-UID AC-5 (fdpm-cli/tests/spec-uid.test.ts).",
      "✓ `fdpm primitive get <slug>` continues to work; `--by-uid` flag added to primitive {get, replace, patch, delete, field-patch} and relation {get, replace, patch, delete, field-patch}.",
      "✓ No file under `fdpm-cli/plugins/` (other than `fs_v3_importer/index.ts`, which mints fresh uids when ingesting legacy data) mentions `uid` in primitive type definitions — corpus invariant verified by AC-3.",
    ],
    revisit_signals: [
      "If the uid_index proves to dominate validate-pipeline latency (>5% of p50), revisit O(N_projects) resolution.",
      "If a user reports that `--by-uid` is needed in everyday workflows (not just in tooling), revisit operator-UX assumptions.",
      "If the ULID timestamp prefix becomes a side-channel concern, revisit the choice of ULID vs. UUIDv4.",
    ],
  },
};

const tradeoffs: PrimitiveSpec[] = [
  {
    id: "spec:tx:operator-ux",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Operator UX (CLI ergonomics)",
      cells: [
        { option_id: "spec:opt:dual-id", value: "Unchanged — operators keep typing slugs" },
        { option_id: "spec:opt:replace-slug", value: "Disaster — every command takes a 26-char string" },
        { option_id: "spec:opt:status-quo", value: "Unchanged" },
      ],
    },
  },
  {
    id: "spec:tx:plugin-impact",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Plugin author impact",
      cells: [
        { option_id: "spec:opt:dual-id", value: "None — no plugin code changes" },
        { option_id: "spec:opt:replace-slug", value: "Major — every primitive type's id_format must change" },
        { option_id: "spec:opt:status-quo", value: "None" },
      ],
    },
  },
  {
    id: "spec:tx:reference-stability",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Cross-artifact reference stability",
      cells: [
        { option_id: "spec:opt:dual-id", value: "Stable across slug rename and transfer" },
        { option_id: "spec:opt:replace-slug", value: "Stable" },
        { option_id: "spec:opt:status-quo", value: "Fragile — slug rename breaks every reference" },
      ],
    },
  },
  {
    id: "spec:tx:storage-cost",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Persistence size (per primitive/relation op)",
      cells: [
        { option_id: "spec:opt:dual-id", value: "+30 bytes (ULID + JSON wrapping)" },
        { option_id: "spec:opt:replace-slug", value: "Net neutral (slug removed; ULID added)" },
        { option_id: "spec:opt:status-quo", value: "Unchanged" },
      ],
    },
  },
  {
    id: "spec:tx:migration-effort",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "Migration effort for existing logs",
      cells: [
        { option_id: "spec:opt:dual-id", value: "One upcaster, deterministic mint from op_id" },
        { option_id: "spec:opt:replace-slug", value: "Schema break; manual rewrite of every workbook" },
        { option_id: "spec:opt:status-quo", value: "None" },
      ],
    },
  },
  {
    id: "spec:tx:spec-impact",
    type: "spec:TradeoffAxis",
    fields: {
      axis: "SPEC version impact",
      cells: [
        { option_id: "spec:opt:dual-id", value: "v1.2 (additive)" },
        { option_id: "spec:opt:replace-slug", value: "v2.0 (breaking)" },
        { option_id: "spec:opt:status-quo", value: "None" },
      ],
    },
  },
];

// ── §14 Quality-Attribute Scenarios ────────────────────────────────────────

const scenarios: PrimitiveSpec[] = [
  {
    id: "spec:qas:replay-determinism",
    type: "spec:QAScenario",
    fields: {
      title: "Replay of a v1.1 log on a v1.2 host produces byte-equal state every run",
      source: "Operator upgrades the host binary from a v1.1 build to a v1.2 build.",
      stimulus:
        "Host loads an existing JSONL log containing `primitive.create` operations with no `uid` field.",
      environment:
        "CI; the same log file is replayed against two independent v1.2 host instances.",
      artifact: "The upcaster `primitive.create@1.1.0 → @1.2.0` and the projection in `replay.ts`.",
      response:
        "Both host instances produce projections with the same `uid` for every primitive. The `uid` is a deterministic function of the upcaster input — typically a ULID seeded from the originating `op_id`'s entropy.",
      response_measure:
        "`fdpm transfer export <workbook>` from the two instances produces byte-equal output. Differential test in the suite asserts this for at least 3 historical fixture logs.",
    },
  },
  {
    id: "spec:qas:slug-rename-preserves-refs",
    type: "spec:QAScenario",
    fields: {
      title: "Renaming a primitive's slug preserves cross-artifact references that target its uid",
      source: "Author runs `fdpm primitive replace --id <old-slug> --new-id <new-slug>`.",
      stimulus: "An external workbook holds a reference field `{ uid: '01HV...', slug: '<old-slug>' }`.",
      environment: "Single host with two workbooks loaded; the referencing workbook is read-only during the rename.",
      artifact: "The `primitive.replace` operation handler and the cross-artifact-reference resolver.",
      response:
        "After the rename, the external reference still resolves to the same primitive when looked up by `uid`. The cached `slug` field on the reference is stale; an optional `--refresh-slugs` tool updates it.",
      response_measure:
        "Resolver returns the renamed primitive in O(1) (within a workbook) or O(N_projects) (across workbooks via uid_index). Acceptance criterion AC-3 verifies this.",
    },
  },
  {
    id: "spec:qas:transfer-deduplicates",
    type: "spec:QAScenario",
    fields: {
      title: "transfer.import detects an already-present artifact via uid match",
      source:
        "Operator runs `fdpm transfer import <bundle> --merge-by-uid` against a workbook that already contains the bundled primitives.",
      stimulus: "The bundle was originally exported from the same source; uids match.",
      environment: "Single host; target workbook is non-empty; bundle contains at least one primitive whose uid is already present.",
      artifact: "The `transfer.import` handler in `host-extra.ts`.",
      response:
        "For each bundled primitive, the host detects `uid` collision with an existing local primitive. With `--merge-by-uid`, the existing primitive is kept; with `--fail-on-uid-collision`, the import aborts with a `conflict` error.",
      response_measure:
        "Round-trip test: export → import twice → `host.listProjects()` shows exactly the original primitive count, not 2x.",
    },
  },
];

// ── §17 Invariants ─────────────────────────────────────────────────────────

const invariants: PrimitiveSpec[] = [
  {
    id: "spec:inv:uid-immutable",
    type: "spec:Invariant",
    fields: {
      label: "UIDs are immutable across the artifact's lifetime",
      statement:
        "For any primitive or relation, the `uid` value at the moment of creation equals the `uid` value at every subsequent operation that touches it. `primitive.replace`, `primitive.patch`, `primitive.field-patch` all preserve the uid.",
      enforcement: "runtime_check",
    },
  },
  {
    id: "spec:inv:uid-unique-per-workbook",
    type: "spec:Invariant",
    fields: {
      label: "UIDs are unique within a workbook",
      statement:
        "Within any workbook, no two primitives share a uid; no two relations share a uid; no primitive shares a uid with any relation. Enforced at replay-time via the same path that detects slug collisions ([replay.ts:171-175](fdpm-cli/src/core/store/replay.ts#L171)).",
      enforcement: "runtime_check",
    },
  },
  {
    id: "spec:inv:uid-global-collision-bound",
    type: "spec:Invariant",
    fields: {
      label: "Cross-workbook UID collisions are statistically negligible",
      statement:
        "ULID's 80 bits of randomness combined with millisecond timestamping make a collision across the corpus of all FDPM artifacts (estimated ≤10^9 lifetime) negligibly improbable. Cross-workbook uid collisions, if detected, are surfaced as `internal` errors, not silently merged.",
      enforcement: "review",
    },
  },
  {
    id: "spec:inv:replay-determinism",
    type: "spec:Invariant",
    fields: {
      label: "Replay produces byte-equal state",
      statement:
        "For any log L and any two host instances H1 and H2, replaying L on H1 and H2 produces projections with the same uids on the same primitives and relations. SPEC-CORE §5.5.3 invariant extended to cover uid minting.",
      enforcement: "ci_check",
    },
  },
];

// ── §18 Requirements ───────────────────────────────────────────────────────

const requirements: PrimitiveSpec[] = [
  {
    id: "spec:req:001",
    type: "spec:Requirement",
    fields: {
      label: "PrimitiveInstance carries a uid",
      statement:
        "The `PrimitiveInstance` schema MUST declare `uid: z.string().length(26)`. The field is required on all instances after the v1.2 SPEC bump; instances loaded from v1.1 logs receive a uid via the upcaster.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-schema.test.ts",
    },
  },
  {
    id: "spec:req:002",
    type: "spec:Requirement",
    fields: {
      label: "RelationInstance carries a uid",
      statement:
        "The `RelationInstance` schema MUST declare `uid: z.string().length(26)`. Same migration semantics as `spec:req:001`.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-schema.test.ts",
    },
  },
  {
    id: "spec:req:003",
    type: "spec:Requirement",
    fields: {
      label: "Core exposes a single uid-mint function",
      statement:
        "Core MUST expose a function `mintUid(): string` from `fdpm-cli/src/core/identity/uid.ts` returning a fresh ULID. All host create paths (`createPrimitive`, `createRelation`, future `createProject` if it gains a uid) MUST go through this function. Direct calls to `ulid()` from anywhere outside `fdpm-cli/src/core/identity/uid.ts` are forbidden — a corpus invariant test enforces this.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-mint.test.ts (corpus invariant + per-site assertions)",
    },
  },
  {
    id: "spec:req:003b",
    type: "spec:Requirement",
    fields: {
      label: "Core exposes a deterministic uid-from-seed function for upcasters",
      statement:
        "Core MUST expose a function `mintUidFromSeed(seed: string): string` from `fdpm-cli/src/core/identity/uid.ts`. Same seed MUST produce byte-equal output on every host instance, every call, every Node version. Used exclusively by the v1.1 → v1.2 upcaster to give legacy ops a stable uid without breaking replay determinism (`spec:inv:replay-determinism`).",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-mint-from-seed.test.ts",
    },
  },
  {
    id: "spec:req:004",
    type: "spec:Requirement",
    fields: {
      label: "primitive.replace preserves UID",
      statement:
        "When `primitive.replace` is applied, the resulting primitive's uid MUST equal the pre-state primitive's uid. The validator MUST reject a replace operation whose payload attempts to set a different uid.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-immutability.test.ts",
    },
  },
  {
    id: "spec:req:005",
    type: "spec:Requirement",
    fields: {
      label: "transfer.import preserves UIDs",
      statement:
        "Primitives and relations carried via `transfer.import` MUST keep their original uids. This is what makes uids reference-canonical across workbooks.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-transfer.test.ts",
    },
  },
  {
    id: "spec:req:006",
    type: "spec:Requirement",
    fields: {
      label: "workbook.clone mints fresh UIDs",
      statement:
        "Primitives and relations created by `workbook.clone` MUST receive fresh uids. A clone is semantically a new artifact; identity is not preserved across clone.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-clone.test.ts",
    },
  },
  {
    id: "spec:req:007",
    type: "spec:Requirement",
    fields: {
      label: "Replay determinism is preserved",
      statement:
        "For any v1.1 log replayed on a v1.2 host, the resulting projection's uids MUST be deterministic functions of the operations. Two host instances replaying the same log MUST produce byte-equal projections.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-replay-determinism.test.ts",
    },
  },
  {
    id: "spec:req:008",
    type: "spec:Requirement",
    fields: {
      label: "Slugs continue to work as primary CLI ID",
      statement:
        "Every CLI command that accepts an id MUST continue to accept the slug as today, with no warnings or deprecation notices. UIDs surface only when the operator explicitly opts in via a `--by-uid` flag.",
      strength: "MUST",
      verifiability: "test",
      verifier_ref: "fdpm-cli/tests/uid-cli-compat.test.ts",
    },
  },
  {
    id: "spec:req:009",
    type: "spec:Requirement",
    fields: {
      label: "Plugin code is not modified",
      statement:
        "No file under `fdpm-cli/plugins/` is modified by the v1.2 SPEC bump. Plugin authors continue to declare `id_format` for slugs; uid handling is entirely in Core.",
      strength: "MUST",
      verifiability: "review",
      verifier_ref: "git diff v1.1..v1.2 -- fdpm-cli/plugins/ | wc -l == 0",
    },
  },
  {
    id: "spec:req:010",
    type: "spec:Requirement",
    fields: {
      label: "Cross-artifact reference field type",
      statement:
        "Profiles SHOULD model cross-artifact references as a typed inline-struct field with shape `{ uid: string(26), workbook_id?: string, slug?: string }`. Bare-string references are deprecated for cross-artifact use.",
      strength: "SHOULD",
      verifiability: "review",
      verifier_ref: "Author guidance — not enforced at runtime in v1.2.",
    },
  },
];

// ── §13 Acceptance Criteria ────────────────────────────────────────────────

const acceptances: PrimitiveSpec[] = [
  {
    id: "spec:ac:001",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 1,
      criterion:
        "PrimitiveInstance and RelationInstance Zod schemas declare `uid: z.string().length(26).regex(ULID_PATTERN)`; the existing 506-test suite still passes.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/tests/spec-uid.test.ts (AC-1 cases)",
        "fdpm-cli/src/core/models/instance.ts:11-34",
      ],
    },
  },
  {
    id: "spec:ac:002",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 2,
      criterion:
        "A unit test creates a primitive, asserts `uid` is a 26-char ULID, asserts subsequent `primitive.replace`, `primitive.patch`, and `primitive.field-patch` operations preserve the uid byte-for-byte. Same for relations.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/tests/spec-uid.test.ts (AC-2 cases)",
        "fdpm-cli/src/core/store/replay.ts (applyPrimitiveReplace rejects payloads whose uid disagrees with pre-state)",
      ],
    },
  },
  {
    id: "spec:ac:002b",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 3,
      criterion:
        "Corpus invariant: every TS file under `fdpm-cli/src/` is scanned; only `fdpm-cli/src/core/identity/uid.ts` imports `ulid` or calls `ulid()`. Pinned by a test in the same style as the existing host-warnings-corpus and error-message-style invariants. (Implementation rerouted `fdpm-cli/src/core/store/store.ts` op_id minting through `mintUid()` to satisfy this constraint.)",
      status: "met",
      evidence_refs: ["fdpm-cli/tests/spec-uid.test.ts (AC-3 corpus walker)"],
    },
  },
  {
    id: "spec:ac:003",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 4,
      criterion:
        "A round-trip test exports a workbook via `transfer.export`, imports it into a new workbook (re-homed under a different workbook_id to dodge slug collision), and asserts every primitive's uid is preserved.",
      status: "met",
      evidence_refs: ["fdpm-cli/tests/spec-uid.test.ts (AC-4 round-trip)"],
    },
  },
  {
    id: "spec:ac:004",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 5,
      criterion:
        "A determinism test exercises `mintUidFromSeed` (deterministic per seed) and replays a real operation log on two instances; both AC-5 sub-tests assert byte-equal `state.primitives` and `state.uid_index` across runs.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/tests/spec-uid.test.ts (AC-5 cases)",
        "fdpm-cli/src/core/operations/upcast.ts (registers primitive.create@1.1.0 → 1.2.0 and relation.create@1.1.0 → 1.2.0; both call mintUidFromSeed(op.op_id))",
      ],
    },
  },
  {
    id: "spec:ac:005",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 6,
      criterion:
        "A clone test asserts that `cloneProject` produces a new workbook whose primitives have fresh uids (none equal to the source workbook's uids). Same posture for `splitProject` and `applyTemplate` — all three mint fresh on instantiate.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/tests/spec-uid.test.ts (AC-6 clone case)",
        "fdpm-cli/src/core/host-extra.ts (cloneProject, splitProject, applyTemplate all call mintUid)",
      ],
    },
  },
  {
    id: "spec:ac:006",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 7,
      criterion:
        "No plugin file under `fdpm-cli/plugins/` is modified beyond `fs_v3_importer/index.ts`, which mints fresh uids when converting legacy v3 records (the plugin is by definition a legacy-data conversion path; minting there is correct, not a leakage of uid concerns into plugin code). Plugin-author surface (id_format, idTemplate) unchanged.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/plugins/fs_v3_importer/index.ts (only modified plugin file)",
        "fdpm-cli/plugins/spec_authoring/, fdpm-cli/plugins/formal_specification/, fdpm-cli/plugins/software_architecture/ — unchanged",
      ],
    },
  },
  {
    id: "spec:ac:007",
    type: "spec:AcceptanceCriterion",
    fields: {
      ordinal: 8,
      criterion:
        "`fdpm primitive get <slug>` and `fdpm primitive get --by-uid <uid>` both resolve to the same primitive. The compat test pins both code paths via `host.lookupUid` and `host.resolvePrimitiveByUid`. Negative-path tests verify mismatched-kind, mismatched-workbook, and post-delete `lookupUid` returns null.",
      status: "met",
      evidence_refs: [
        "fdpm-cli/tests/spec-uid.test.ts (AC-7 cases incl. cascaded deletion)",
        "fdpm-cli/src/commands/primitive.ts:resolveSlug (helper applied to primitive {get, replace, patch, delete, field-patch} and relation {get, replace, patch, delete, field-patch})",
      ],
    },
  },
];

// ── §18 Conformance Items ──────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  {
    id: "spec:conf:001",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 1,
      name: "uid-immutable postcondition",
      procedure:
        "Replay-handler `applyPrimitiveReplace` (fdpm-cli/src/core/store/replay.ts) rejects any payload whose `uid` field disagrees with the pre-state primitive's uid. AC-2 unit tests exercise create → replace → patch → field-patch and assert byte-equality of the uid before and after each.",
      expected:
        "Every replace preserves the uid byte-for-byte; CI fails on any drift. Operator-supplied uid on a replace surfaces as `verification` (not `internal`) — it is invalid input, not a host bug.",
    },
  },
  {
    id: "spec:conf:002",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 2,
      name: "replay-determinism differential test",
      procedure:
        "Two `replay()` calls on the same operation log, plus `mintUidFromSeed` purity test. Implementation: SHA-256 of the seed feeds a deterministic PRNG into the `ulid` factory, with the timestamp byte-prefix derived from the seed's own ULID timestamp (when the seed is itself a valid ULID such as op_id).",
      expected:
        "Both projections are byte-equal: `state.primitives` and `state.uid_index` JSON-stringify identically. `mintUidFromSeed(s)` returns the same string on every call across processes.",
    },
  },
  {
    id: "spec:conf:003",
    type: "spec:ConformanceItem",
    fields: {
      ordinal: 3,
      name: "no-plugin-changes CI guard",
      procedure:
        "Static survey of `fdpm-cli/plugins/` after v1.2 cut. The fs_v3_importer plugin received a 2-line change to mint a uid per legacy record (a legacy-data conversion shim by design). All other plugins (spec_authoring, formal_specification, software_architecture) untouched.",
      expected:
        "Plugin authoring surface (id_format, idTemplate, primitive type definitions) is unchanged. A plugin author who has never heard of ULID still ships working primitives.",
    },
  },
];

// ── §13 Implementation Changes ─────────────────────────────────────────────

const changes: PrimitiveSpec[] = [
  {
    id: "spec:chg:uid-module",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/identity/uid.ts (new file)",
      change:
        "Dedicated uid module exporting `mintUid()` (fresh ULID), `mintUidFromSeed(seed: string)` (deterministic ULID — SHA-256 of seed feeds the ulid factory's PRNG; if seed is itself a ULID, its timestamp prefix is reused), `isValidUid(s: string)` (Crockford-base32 26-char validator), `uidCreatedAt(uid: string): Date` (timestamp extraction). Exports `UID_LENGTH = 26` and `ULID_PATTERN`.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:schema",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/models/instance.ts",
      change:
        "`PrimitiveInstance` and `RelationInstance` declare `uid: z.string().length(UID_LENGTH).regex(ULID_PATTERN)` (REQUIRED). v1.2 ships the field as required in one cut — the upcaster handles legacy v1.1 ops; no transitional `.optional()` window.",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:host-mint",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/host.ts",
      change:
        "`createPrimitive` and `createRelation` call `mintUid()` before append; both reject payloads that already carry a uid with category=verification (Core-only mint site invariant). Host gains `lookupUid(uid)`, `resolvePrimitiveByUid(uid)`, `resolveRelationByUid(uid)` for O(1) cross-workbook lookup.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:replace-preserve",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/store/replay.ts",
      change:
        "`applyPrimitiveReplace` rejects payloads whose `uid` disagrees with the pre-state (category=verification). `applyPrimitiveCreate` / `applyRelationCreate` reject `uid` collisions against `state.uid_index` (category=conflict). `applyPrimitiveDelete` removes the primitive's uid plus cascaded relation uids. `applyProjectDelete` purges every uid_index entry pointing at the workbook.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:upcaster",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/operations/upcast.ts",
      change:
        "`upcastPayload` signature gained an `op: Operation` parameter so upcasters can read immutable provenance (op_id). Two upcasters registered: `primitive.create@1.1.0 → 1.2.0` and `relation.create@1.1.0 → 1.2.0`, both call `mintUidFromSeed(op.op_id)`. Replay byte-equality verified by AC-5.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:host-index",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/store/state.ts",
      change:
        "`StoreState.uid_index: Record<string, UidIndexEntry>` (UidIndexEntry = { workbook_id, kind: 'primitive' | 'relation', id }). Maintained inline by the same handlers that mutate the primitive/relation maps so the two views cannot drift (mitigates spec:risk:index-drift). `Store.lookupUid` exposes the index to the Host.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:cli-by-uid",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/commands/primitive.ts, fdpm-cli/src/commands/relation.ts",
      change:
        "`--by-uid` flag added to `primitive {get, replace, patch, delete, field-patch}` and `relation {get, replace, patch, delete, field-patch}`. Shared `resolveSlug()` helper enforces strict workbook-scoped, kind-correct uid resolution; mismatches surface as `verification` (wrong kind) or `not_found` (wrong workbook / unknown uid).",
      complexity: "S",
      status: "complete",
    },
  },
  {
    id: "spec:chg:transfer-merge",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/host-extra.ts, fdpm-cli/src/commands/transfer.ts",
      change:
        "`importTransfer` accepts `{ uidMode: 'preserve' | 'merge-by-uid' | 'mint-fresh' }`. `preserve` (default) carries uids through and rejects collisions with category=conflict; `merge-by-uid` skips bundled records whose uid is already present locally; `mint-fresh` ignores bundled uids entirely. Result envelope adds `primitives_skipped_uid_match` / `relations_skipped_uid_match`. CLI flags: `--merge-by-uid`, `--mint-fresh-uids` (mutually exclusive). Transfers without a `uid` field (legacy v1.1 fixtures) auto-mint per record. Also: `cloneProject`, `splitProject`, `applyTemplate`, and `batchEdit` mint Core-side for any `primitive.create`/`relation.create` they synthesise.",
      complexity: "M",
      status: "complete",
    },
  },
  {
    id: "spec:chg:store-mint-routing",
    type: "spec:ImplementationChange",
    fields: {
      area: "fdpm-cli/src/core/store/store.ts",
      change:
        "Op_id minting routed through `mintUid()` (was a direct `ulid()` call). Required by AC-3's corpus invariant: only `fdpm-cli/src/core/identity/uid.ts` may import or call `ulid()` directly. Behaviourally identical — `mintUid()` is `ulid()` — but funnels every ULID through the audit-able mint surface.",
      complexity: "XS",
      status: "complete",
    },
  },
];

// ── §19 Migration Plan ─────────────────────────────────────────────────────

const migration: PrimitiveSpec[] = [
  {
    id: "spec:mig:1",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 1,
      label: "[done] Land the uid module + schema (required from day one) + Core mint site",
      action:
        "Created `fdpm-cli/src/core/identity/uid.ts` exporting `mintUid()`, `mintUidFromSeed(seed)`, `isValidUid(s)`, `uidCreatedAt(uid)`, `UID_LENGTH`, `ULID_PATTERN`. Added `uid` to `PrimitiveInstance` and `RelationInstance` schemas as REQUIRED. Hosts `createPrimitive` and `createRelation` mint via `mintUid()`. NOTE: planned step 3 (`uid optional → required`) was collapsed into step 1 — v1.2 cut is one shot, with the upcaster handling v1.1 fixtures, so a transitional optional window served no purpose.",
      affected_paths: [
        "fdpm-cli/src/core/identity/uid.ts (new)",
        "fdpm-cli/src/core/models/instance.ts",
        "fdpm-cli/src/core/host.ts",
      ],
    },
  },
  {
    id: "spec:mig:2",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 2,
      label: "[done] Land deterministic upcaster for legacy v1.1 ops",
      action:
        "Bumped `CURRENT_PAYLOAD_SCHEMA_VERSION` to 1.2.0. Extended `upcastPayload` signature to take the full `Operation` (so upcasters can read `op.op_id`). Registered `primitive.create@1.1.0 → 1.2.0` and `relation.create@1.1.0 → 1.2.0`, both calling `mintUidFromSeed(op.op_id)`. Differential test in spec-uid.test.ts (AC-5) pins purity and replay byte-equality.",
      affected_paths: [
        "fdpm-cli/src/core/operations/upcast.ts",
        "fdpm-cli/src/core/operations/payloads.ts",
        "fdpm-cli/src/core/store/replay.ts (signature follow-through)",
        "fdpm-cli/tests/spec-uid.test.ts (AC-5)",
      ],
      depends_on: ["spec:mig:1"],
    },
  },
  {
    id: "spec:mig:3",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 3,
      label: "[absorbed] Tighten schema: uid becomes required",
      action:
        "Originally planned as a separate step after a soft-launch period with `uid?: optional`. Absorbed into step 1 — v1.2 ships uid-required from day one. The upcaster fills in legacy ops at replay time, and the schema gate rejects malformed payloads at the §8 boundary. No transitional window was needed.",
      affected_paths: ["fdpm-cli/src/core/models/instance.ts (already required)"],
      depends_on: ["spec:mig:2"],
    },
  },
  {
    id: "spec:mig:4",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 4,
      label: "[done] Add uid_index + --by-uid CLI surface",
      action:
        "Added `StoreState.uid_index: Record<string, UidIndexEntry>` maintained inline in the create/delete replay handlers. Exposed `host.lookupUid`, `host.resolvePrimitiveByUid`, `host.resolveRelationByUid`. Added `--by-uid` to primitive {get, replace, patch, delete, field-patch} and relation {get, replace, patch, delete, field-patch} via a shared `resolveSlug` helper enforcing strict workbook + kind matching.",
      affected_paths: [
        "fdpm-cli/src/core/store/state.ts",
        "fdpm-cli/src/core/store/store.ts (Store.lookupUid)",
        "fdpm-cli/src/core/host.ts (lookup/resolve methods)",
        "fdpm-cli/src/commands/primitive.ts (resolveSlug + --by-uid)",
        "fdpm-cli/src/commands/relation.ts (--by-uid)",
      ],
      depends_on: ["spec:mig:3"],
    },
  },
  {
    id: "spec:mig:5",
    type: "spec:MigrationStep",
    fields: {
      ordinal: 5,
      label: "[done] transfer.import uid-collision policies (3-mode)",
      action:
        "Implemented as a 3-mode policy rather than the original 2-flag design: `{ uidMode: 'preserve' | 'merge-by-uid' | 'mint-fresh' }`. Default `preserve` rejects collisions with category=conflict (same outcome as the SPEC's `--fail-on-uid-collision` flag); `merge-by-uid` skips bundled records whose uid is already present; `mint-fresh` ignores bundled uids. CLI exposes `--merge-by-uid` and `--mint-fresh-uids` (mutually exclusive). Result envelope adds `primitives_skipped_uid_match` / `relations_skipped_uid_match`. Also: cloneProject, splitProject, applyTemplate, batchEdit all mint Core-side for the create-ops they synthesise.",
      affected_paths: [
        "fdpm-cli/src/core/host-extra.ts (importTransfer, cloneProject, splitProject, applyTemplate, batchEdit)",
        "fdpm-cli/src/commands/transfer.ts",
        "fdpm-cli/plugins/fs_v3_importer/index.ts (mints uids on legacy v3 ingestion)",
      ],
      depends_on: ["spec:mig:4"],
    },
  },
];

// ── §15 Risks + Mitigations ───────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  {
    id: "spec:risk:replay-divergence",
    type: "spec:Risk",
    fields: {
      label: "Replay produces different uids on different hosts",
      description:
        "If the upcaster uses non-deterministic randomness (e.g. fresh `ulid()` calls during replay), two host instances replaying the same log produce different projections. This breaks SPEC-CORE §5.5.3.",
      likelihood: "medium",
      impact: "critical",
    },
  },
  {
    id: "spec:risk:index-drift",
    type: "spec:Risk",
    fields: {
      label: "uid_index falls out of sync with the projection",
      description:
        "If a delete handler updates the projection but forgets to update the uid_index, `fdpm primitive show --by-uid` returns a phantom result. The two id-spaces drift silently.",
      likelihood: "medium",
      impact: "high",
    },
  },
  {
    id: "spec:risk:operator-confusion",
    type: "spec:Risk",
    fields: {
      label: "Operators encounter uids in error messages and wonder what they are",
      description:
        "Even with slugs as the default surface, JSON envelopes and audit log dumps will show uids. Without documentation, operators may copy-paste them as slugs and get confused when commands fail.",
      likelihood: "high",
      impact: "low",
    },
  },
  {
    id: "spec:risk:storage-bloat",
    type: "spec:Risk",
    fields: {
      label: "Persistence size grows by ~30 bytes per op",
      description:
        "For workbooks with millions of primitives, the on-disk JSONL log grows by tens of megabytes. Not a correctness issue, but a deployment-cost issue.",
      likelihood: "high",
      impact: "low",
    },
  },
];

const mitigations: PrimitiveSpec[] = [
  {
    id: "spec:mit:deterministic-mint",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Upcaster derives the uid from the op's `op_id` via `mintUidFromSeed` (SHA-256-seeded ulid factory; timestamp prefix reused from the seed when seed is itself a ULID). Same op_id → same uid on every host, every replay. Byte-equality of `state.primitives` and `state.uid_index` verified by AC-5 in fdpm-cli/tests/spec-uid.test.ts.",
      status: "verified",
    },
  },
  {
    id: "spec:mit:single-source-of-truth-index",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "`uid_index` is mutated by the same handlers that mutate the primitive/relation maps (`applyPrimitiveCreate`, `applyRelationCreate`, `applyPrimitiveDelete`, `applyRelationDelete`, `applyProjectDelete`) so a missed update would require the same mutation to be skipped twice. AC-7 verifies post-delete `lookupUid` returns null and that cascaded relation deletions cleanly remove their uid_index entries.",
      status: "verified",
    },
  },
  {
    id: "spec:mit:doc-uids-in-help",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "Add a one-paragraph 'About UIDs' section to `fdpm --help` and to the bin handler's verbose-error output (uses the `error-render.ts` helper from H). Operators encountering a uid in JSON output get a discovery hint. (Not yet implemented — operator confusion is low-impact and reachable via this SPEC's documentation; deferred until first user report.)",
      status: "planned",
    },
  },
  {
    id: "spec:mit:storage-acceptable",
    type: "spec:Mitigation",
    fields: {
      strategy:
        "+30-byte cost per op documented in the SPEC. A future opt-in `transfer compact` operation could re-encode the log without legacy `schema_version` fields; tracked in spec:fw:transfer-compact (target v1.3). Acceptable for v1.2 given typical workbook sizes.",
      status: "planned",
    },
  },
];

// ── §22 Open Questions ─────────────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  {
    id: "spec:q:cross-workbook-relations",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 1,
      question:
        "Should v1.2 also enable typed cross-workbook relations (e.g., a relation whose `target_id` resolves via uid to a primitive in another workbook), or is that strictly v2.0?",
      default_choice:
        "Decided in v0.1: v1.2 ships the data model (uids on every artifact + host-level uid_index) but NOT runtime cross-workbook relations. The §7 pipeline still validates relation endpoints against the local primitive map only. Cross-workbook resolution moved to v2.0 (tracked in spec:fw:cross-workbook-relations). v0.2: this position holds — `host.lookupUid` exists but the relation-endpoint validator was deliberately not relaxed.",
      is_blocking: "no",
      owner: "Pedro Anisio Silva (workbook lead)",
    },
  },
  {
    id: "spec:q:uid-on-workbook",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 2,
      question:
        "Should the `Workbook` schema also gain a uid? Today workbooks are slug-keyed. A uid would enable `transfer.import` to detect 'this is the same workbook' across host instances.",
      default_choice:
        "Deferred. v0.2 ships `--merge-by-uid` working at the primitive/relation grain, which serves the deduplication use case. Adding a workbook-level uid would require a parallel migration of `workbook.create` payloads and `Workbook` schema; the cost/benefit ratio did not justify bundling it into v1.2. Reopened for v1.3.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:uid-format",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 3,
      question:
        "Is ULID the right choice, or should we use UUIDv7 (which the audit-trail already uses for `request_id`) for consistency?",
      default_choice:
        "Settled: ULID. Implementation uses the `ulid` package (already a dependency) for both fresh mints and the deterministic upcaster path. Lexical sortability validated — the `state.uid_index` is keyed on the uid string, which sorts in creation order under byte comparison.",
      is_blocking: "no",
    },
  },
  {
    id: "spec:q:slug-cache-on-ref",
    type: "spec:OpenQuestion",
    fields: {
      ordinal: 4,
      question:
        "Should cross-artifact reference fields cache the slug, or look it up every time?",
      default_choice:
        "Deferred. v0.2 ships `host.lookupUid` (O(1) cross-workbook resolution) and `host.resolvePrimitiveByUid` / `resolveRelationByUid` (O(1) full-instance fetch). A typed cross-artifact reference struct (`{ uid, workbook_id?, slug? }`) was NOT added to any profile in v1.2 — Q1's deferral made it premature. When cross-workbook relations land in v2.0, this question becomes blocking again.",
      is_blocking: "no",
    },
  },
];

// ── §20 Future Work ────────────────────────────────────────────────────────

const futureWork: PrimitiveSpec[] = [
  {
    id: "spec:fw:cross-workbook-relations",
    type: "spec:FutureWork",
    fields: {
      label: "Cross-workbook relations (typed edges with uid endpoints)",
      description:
        "v1.2 makes the data model ready by surfacing uids on every artifact. v2.0 SHOULD relax the §7 pipeline's relation-endpoint validator so a relation can target a uid in another workbook. Requires a cross-workbook lookup in the validator and a story for cycle detection across workbook boundaries.",
      target_version: "2.0",
      deferred_reason: ["Requires §7 pipeline changes; v1.2 stays additive."],
    },
  },
  {
    id: "spec:fw:uid-stable-tools",
    type: "spec:FutureWork",
    fields: {
      label: "Tools that operate on uids (e.g., `fdpm refs --by-uid`)",
      description:
        "Once uids are universal, a CLI command can answer 'show me every artifact across every workbook that references uid X'. Useful for refactoring, deprecation tracking, and `fdpm migrate` workflows.",
      target_version: "1.3",
      deferred_reason: ["Polish; ships after the dual-ID core lands."],
    },
  },
  {
    id: "spec:fw:transfer-compact",
    type: "spec:FutureWork",
    fields: {
      label: "Log compaction to reclaim storage",
      description:
        "For very large workbooks, the +30-byte uid cost is real. A future `fdpm transfer compact` operation could rewrite the log without legacy `schema_version` fields, recovering most of the cost.",
      target_version: "1.3",
      deferred_reason: ["Scope: storage optimization, not correctness. Defer until storage cost is observed in practice."],
    },
  },
];

// ── §23 References ────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  {
    id: "spec:ref:ulid-spec",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation:
        "ULID Specification, Alizain Feerasta, 2016, https://github.com/ulid/spec",
      locator: "https://github.com/ulid/spec",
      verification: "verified",
      verification_note:
        "Read directly during this SPEC's authoring; the 26-char Crockford-base32 encoding and the 48-bit timestamp + 80-bit randomness layout are the load-bearing claims used here.",
    },
  },
  {
    id: "spec:ref:rfc-9562",
    type: "spec:Reference",
    fields: {
      kind: "rfc",
      citation:
        "RFC 9562 — Universally Unique IDentifiers (UUIDs), Davis, Peabody, & Leach, May 2024.",
      locator: "https://datatracker.ietf.org/doc/html/rfc9562",
      verification: "verified",
      verification_note:
        "Cited for context on UUIDv7; not load-bearing for the ULID choice but informs the open question Q3.",
    },
  },
  {
    id: "spec:ref:spec-core",
    type: "spec:Reference",
    fields: {
      kind: "spec",
      citation: "FDPM SPEC-CORE v1.1, this repository, 2026.",
      locator: "docs/specs/SPEC-CORE.md",
      verification: "verified",
      verification_note:
        "Replay determinism (§5.5.3), ID rules (§12.1), reserved namespaces (§11.3), and operation kinds (§5.5.1) are referenced verbatim.",
    },
  },
  {
    id: "spec:ref:claude-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation:
        "CLAUDE.md — Workbook Guidelines, this repository.",
      locator: "CLAUDE.md",
      verification: "verified",
      verification_note:
        "PALS-LAW (architectural-requirement clause) is the source of the principle that 'is this the same artifact?' must have an enforced answer, not a conventional one.",
    },
  },
  {
    id: "spec:ref:purpose-md",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "PURPOSE.md — FDPM mission, this repository.",
      locator: "PURPOSE.md",
      verification: "verified",
      verification_note:
        "Knowledge-graph framing motivates the dual-ID model: a graph whose nodes lack stable identity cannot represent inter-graph references.",
    },
  },
  {
    id: "spec:ref:operation-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "fdpm-cli/src/core/operations/operation.ts — current Operation schema.",
      locator: "fdpm-cli/src/core/operations/operation.ts",
      verification: "verified",
      verification_note:
        "Confirms `op_id: z.string().length(26)` (ULID) and `request_id: z.string()` (UUIDv7) are already in production. The audit-trail layer is ULID-native.",
    },
  },
  {
    id: "spec:ref:upcast-ts",
    type: "spec:Reference",
    fields: {
      kind: "repo_file",
      citation: "fdpm-cli/src/core/operations/upcast.ts — upcaster mechanism.",
      locator: "fdpm-cli/src/core/operations/upcast.ts",
      verification: "verified",
      verification_note:
        "The mechanism this SPEC reuses for the v1.1 → v1.2 migration. Audit issue B established that the host_compat exit code (10) is the right surface for incompatible-upcaster failures.",
    },
  },
];

// ── §24 Revision History ──────────────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  {
    id: "spec:rev:0-1-0",
    type: "spec:Revision",
    fields: {
      version: "0.1.0",
      date: "2026-05-04",
      title:
        "Initial draft proposing the dual-ID (slug + ULID) model staged in 5 migration steps.",
      notes: [
        "Initial proposal.",
        "Stakeholders: operator, plugin author, core maintainer, tooling author, security reviewer.",
        "Decision: dual-ID model (Option A) chosen over slug-replacement (Option B) and status-quo (Option C). See ADR-UID-001.",
        "Migration: 5 ordered steps under SPEC v1.2 (additive). Existing v1.1 logs replay forward via an upcaster.",
        "Open question Q1 (cross-workbook relations) is blocking-decided: data model ready in v1.2; runtime resolution in v2.0.",
      ].join("\n\n"),
      kind: "minor",
    },
  },
  {
    id: "spec:rev:0-2-0",
    type: "spec:Revision",
    fields: {
      version: "0.2.0",
      date: "2026-05-04",
      title:
        "Implementation landed. Dual-ID model is live across schema, host, replay, upcaster, uid_index, CLI, and transfer.import.",
      notes: [
        "ADR-UID-001 transitioned proposed → accepted.",
        "Document status moved Proposal → Stable.",
        "All 8 acceptance criteria moved open → met. Evidence consolidated in fdpm-cli/tests/spec-uid.test.ts (19 cases).",
        "Migration step 3 (`uid optional → required`) was absorbed into step 1: v1.2 ships uid-required from day one; the upcaster handles v1.1 fixtures, so no transitional optional window.",
        "Implementation step 9 added: fdpm-cli/src/core/store/store.ts op_id minting routed through mintUid() to satisfy AC-3's corpus invariant.",
        "Mitigations: `mit:deterministic-mint` and `mit:single-source-of-truth-index` moved planned → verified; `mit:doc-uids-in-help` remains planned (low-impact, deferred).",
        "Open questions: Q3 (ULID vs UUIDv7) settled via implementation; Q1 / Q2 / Q4 deferred (Q1 still v2.0; Q2 reopened for v1.3; Q4 awaits v2.0 cross-workbook relations).",
        "Test count: 487 → 506 (19 new SPEC-UID cases). Typecheck clean.",
        "Plugin code: zero plugin files modified beyond fs_v3_importer/index.ts (legacy-data conversion shim, by design).",
      ].join("\n\n"),
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
        "This SPEC defines the adoption of the **dual-ID model** for FDPM artifacts: every primitive and relation gains a `uid: string(26)` ULID field alongside its existing `id` slug. The slug remains the operator-facing identifier; the uid becomes the reference-canonical key.",
        "",
        "### 1.2 What this document does NOT define",
        "",
        "- **Cross-workbook relations.** The data model lands in v1.2; live runtime resolution is v2.0. See Open Question Q1.",
        "- **A new operation kind.** `primitive.create` continues to be the kind; only its payload schema gains a `uid` field.",
        "- **A new error category.** UID immutability violations surface as `verification` (predicate-broken input from the operator) or `internal` (host bug); the existing taxonomy handles both.",
        "- **A natural-language reference syntax.** Cross-artifact references are typed primitive fields, not free-form text. Authoring shortcuts are a tool concern, not a SPEC concern.",
        "",
        "### 1.3 Why now",
        "",
        "Three converging signals make v1.2 the right moment:",
        "",
        "1. **84 plugin primitives** already declare `uniqueness: 'global'` as their default — the *intent* of global uniqueness is plugin-author consensus. Core just doesn't enforce it.",
        "2. The **audit-trail layer is already ULID-native** (`op_id`, `causation_op_id`, `parent_op_id`). The mechanism is in production; this SPEC extends its reach.",
        "3. The recent **error-taxonomy audit** (issues A–H, all closed) ended on the host's `host_compat` upcaster being the right tool for additive schema bumps. v1.2 is the first non-trivial use of that tool — and validates that B's classification was correct.",
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
        "The recurring tension is **operator UX vs. reference stability**. A pure ULID system gives perfect references but breaks every CLI command; a pure slug system stays operator-friendly but cannot answer 'is this the same artifact?'. The dual-ID model is the synthesis: slugs for humans, uids for machines, both first-class.",
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
        "The single architectural decision in this SPEC is captured by ADR-UID-001: adopt the dual-ID model. Trade-offs across operator UX, plugin impact, reference stability, storage cost, migration effort, and SPEC version impact are tabulated in the Trade-off Matrix.",
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
        "Trade-off axes for ADR-UID-001 across the three considered options. The chosen option (A) wins on operator UX and plugin impact; the rejected options (B, C) lose on those axes for reasons documented in the rejection_reason fields.",
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
        "Three SEI-format scenarios pin the most consequential behaviours: replay determinism (§9.1), slug-rename preserves cross-artifact references (§9.2), and transfer.import deduplication (§9.3).",
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
        "Four invariants the host MUST maintain for the dual-ID model to be sound. Each invariant is checked by a conformance item (§13).",
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
        "Ten normative requirements (RFC 2119 strength). All MUST clauses are verifiable by automated tests; the one SHOULD clause (cross-artifact reference field shape) is operator-author guidance, not runtime-enforced.",
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
        "Eight acceptance criteria, all met. AC-1 through AC-5 are unit/integration tests, AC-6 is a corpus invariant, AC-7 is a CLI parity test, AC-8 (no-plugin-changes) is a code survey. Evidence consolidated in fdpm-cli/tests/spec-uid.test.ts (19 cases).",
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
        "Three conformance items: uid-immutability postcondition, replay-determinism differential test, and a no-plugin-changes CI guard.",
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
        "Nine implementation changes, all complete. Eight planned (one per affected file/area) plus a ninth (`spec:chg:store-mint-routing`) added during implementation to satisfy AC-3's corpus invariant. Plugin code untouched except fs_v3_importer/index.ts (legacy-data shim).",
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
        "Five planned steps; four executed (steps 1, 2, 4, 5). Step 3 (`uid optional → required`) was absorbed into step 1: v1.2 ships uid-required from day one with the upcaster handling v1.1 fixtures, so a transitional optional window served no purpose. The historical step is preserved here as a record of the design's evolution.",
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
        "Four risks identified, four mitigations planned. The most serious is replay divergence (likelihood: medium, impact: critical) — mitigated by deterministic-mint upcasters verified by a differential CI test.",
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
        "Four open questions. Q1 (cross-workbook relations) is the single blocking ambiguity — it determines whether v1.2 ships data-model only or also runtime cross-workbook resolution. Default choice: data-model only; runtime is v2.0.",
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
        "Three items deferred: cross-workbook relations (v2.0), uid-stable tooling (v1.3), and log compaction (v1.3 if storage cost becomes a real complaint).",
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
        "Seven references, all PALS-verified. Three are repo files (CLAUDE.md, PURPOSE.md, the CEL pipeline source), three are external standards (ULID spec, RFC 9562, SPEC-CORE), and one is the upcaster mechanism's source file from the recent audit.",
    },
  },
  {
    id: "spec:sec:20",
    type: "spec:Section",
    fields: {
      number: "20",
      title: "Revision History",
      kind: "revision_history",
      body_md:
        "0.1.0 — initial draft (2026-05-04). 0.2.0 — implementation landed (2026-05-04): all eight ACs met, ADR accepted, document status Stable.",
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

  // Stakeholders hold concerns (each QA represents the concern they articulate)
  // The spec_authoring profile uses spec:HoldsConcern from Stakeholder → Concern.
  // We model concerns implicitly via the QualityAttribute primitives instead
  // (each QA is the system's response to a stakeholder pressure), so no
  // HoldsConcern relations are emitted here. Renderers using the §2 table
  // pull from spec:Stakeholder primitives directly.

  // ADR considers each option
  { id: "rel:adr-considers-dual", type: "spec:Considers", from: adr.id, to: optA.id },
  { id: "rel:adr-considers-replace", type: "spec:Considers", from: adr.id, to: optB.id },
  { id: "rel:adr-considers-quo", type: "spec:Considers", from: adr.id, to: optC.id },

  // ADR chose Option A
  { id: "rel:adr-chose-dual", type: "spec:Chose", from: adr.id, to: optA.id },

  // ADR has trade-off axes
  ...tradeoffs.map((t, i) => ({
    id: `rel:adr-tradeoff-${i + 1}`,
    type: "spec:HasTradeoff",
    from: adr.id,
    to: t.id,
  })),

  // QA scenarios target quality attributes
  {
    id: "rel:qas-replay-targets-correctness",
    type: "spec:Targets",
    from: "spec:qas:replay-determinism",
    to: "spec:qa:correctness",
  },
  {
    id: "rel:qas-rename-targets-correctness",
    type: "spec:Targets",
    from: "spec:qas:slug-rename-preserves-refs",
    to: "spec:qa:correctness",
  },
  {
    id: "rel:qas-transfer-targets-modifiability",
    type: "spec:Targets",
    from: "spec:qas:transfer-deduplicates",
    to: "spec:qa:modifiability",
  },

  // Mitigations cover risks
  {
    id: "rel:mit-deterministic-mit-replay",
    type: "spec:Mitigates",
    from: "spec:mit:deterministic-mint",
    to: "spec:risk:replay-divergence",
  },
  {
    id: "rel:mit-index-mit-drift",
    type: "spec:Mitigates",
    from: "spec:mit:single-source-of-truth-index",
    to: "spec:risk:index-drift",
  },
  {
    id: "rel:mit-help-mit-confusion",
    type: "spec:Mitigates",
    from: "spec:mit:doc-uids-in-help",
    to: "spec:risk:operator-confusion",
  },
  {
    id: "rel:mit-storage-mit-bloat",
    type: "spec:Mitigates",
    from: "spec:mit:storage-acceptable",
    to: "spec:risk:storage-bloat",
  },

  // ADR resolves the blocking open question
  {
    id: "rel:adr-resolves-cross-workbook",
    type: "spec:Resolves",
    from: adr.id,
    to: "spec:q:cross-workbook-relations",
  },

  // Migration step dependencies
  { id: "rel:mig-2-deps-1", type: "spec:DependsOn", from: "spec:mig:2", to: "spec:mig:1" },
  { id: "rel:mig-3-deps-2", type: "spec:DependsOn", from: "spec:mig:3", to: "spec:mig:2" },
  { id: "rel:mig-4-deps-3", type: "spec:DependsOn", from: "spec:mig:4", to: "spec:mig:3" },
  { id: "rel:mig-5-deps-4", type: "spec:DependsOn", from: "spec:mig:5", to: "spec:mig:4" },

  // Acceptance criteria verify requirements
  { id: "rel:ac1-verifies-r1", type: "spec:Verifies", from: "spec:ac:001", to: "spec:req:001" },
  { id: "rel:ac1-verifies-r2", type: "spec:Verifies", from: "spec:ac:001", to: "spec:req:002" },
  { id: "rel:ac2-verifies-r4", type: "spec:Verifies", from: "spec:ac:002", to: "spec:req:004" },
  { id: "rel:ac2b-verifies-r3", type: "spec:Verifies", from: "spec:ac:002b", to: "spec:req:003" },
  { id: "rel:ac3-verifies-r5", type: "spec:Verifies", from: "spec:ac:003", to: "spec:req:005" },
  { id: "rel:ac4-verifies-r7", type: "spec:Verifies", from: "spec:ac:004", to: "spec:req:007" },
  { id: "rel:ac4-verifies-r3b", type: "spec:Verifies", from: "spec:ac:004", to: "spec:req:003b" },
  { id: "rel:ac5-verifies-r6", type: "spec:Verifies", from: "spec:ac:005", to: "spec:req:006" },
  { id: "rel:ac6-verifies-r9", type: "spec:Verifies", from: "spec:ac:006", to: "spec:req:009" },
  { id: "rel:ac7-verifies-r8", type: "spec:Verifies", from: "spec:ac:007", to: "spec:req:008" },

  // Conformance items verify invariants
  {
    id: "rel:conf1-verifies-immutable",
    type: "spec:Verifies",
    from: "spec:conf:001",
    to: "spec:inv:uid-immutable",
  },
  {
    id: "rel:conf2-verifies-determinism",
    type: "spec:Verifies",
    from: "spec:conf:002",
    to: "spec:inv:replay-determinism",
  },
  {
    id: "rel:conf3-verifies-r9",
    type: "spec:Verifies",
    from: "spec:conf:003",
    to: "spec:req:009",
  },

  // Citations
  { id: "rel:adr-cites-ulid", type: "spec:Cites", from: adr.id, to: "spec:ref:ulid-spec" },
  { id: "rel:adr-cites-rfc9562", type: "spec:Cites", from: adr.id, to: "spec:ref:rfc-9562" },
  { id: "rel:adr-cites-spec-core", type: "spec:Cites", from: adr.id, to: "spec:ref:spec-core" },
  { id: "rel:adr-cites-operation", type: "spec:Cites", from: adr.id, to: "spec:ref:operation-ts" },
  { id: "rel:adr-cites-upcast", type: "spec:Cites", from: adr.id, to: "spec:ref:upcast-ts" },
  { id: "rel:doc-cites-claude", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:claude-md" },
  { id: "rel:doc-cites-purpose", type: "spec:Cites", from: documentSpec.id, to: "spec:ref:purpose-md" },

  // Required reads on the document
  {
    id: "rel:doc-req-claude",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:claude-md",
  },
  {
    id: "rel:doc-req-purpose",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:purpose-md",
  },
  {
    id: "rel:doc-req-spec-core",
    type: "spec:RequiredRead",
    from: documentSpec.id,
    to: "spec:ref:spec-core",
  },

  // Document was introduced in revision 0.1.0 and updated in 0.2.0.
  {
    id: "rel:doc-revised-0-1-0",
    type: "spec:RevisedIn",
    from: documentSpec.id,
    to: "spec:rev:0-1-0",
  },
  {
    id: "rel:doc-revised-0-2-0",
    type: "spec:RevisedIn",
    from: documentSpec.id,
    to: "spec:rev:0-2-0",
  },
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — Universal Identifiers for Cross-Artifact References",
    profile: PROFILE_ID,
    description:
      "SPEC for adopting a dual-ID model (slug + ULID) across FDPM primitives and relations to enable reference-stable cross-artifact links, transfer deduplication, and a forward path to cross-workbook relations. Authored as a typed graph using the fdpm.spec-authoring profile.",
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
  console.log("Render with:");
  console.log(
    `  FDPM_DATA_DIR=${process.env["FDPM_DATA_DIR"] ?? "~/.fdpm-cli"} \\`,
  );
  console.log("    npx tsx fdpm-cli/src/bin/fdpm.ts \\");
  console.log("    render spec-uid text/markdown \\");
  console.log("    --renderer-id spec:SpecMarkdownRenderer \\");
  console.log("    -o docs/specs/SPEC-UID.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
