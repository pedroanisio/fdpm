/**
 * Build SPEC-DOCUMENT-PLAN 3.1.0 using the `fdpm.spec-authoring-dnis`
 * composition profile.
 *
 * The normative source is the Zod schema at
 * fdpm-cli/plugins/document_plan/schemas/document-plan.ts (DocumentPlan
 * v3.1.0). This script transcribes it into a typed graph: every Term,
 * Principle, Stakeholder, Schema Definition, Invariant (one per
 * `superRefine` rule and per field-level refinement, message quoted
 * verbatim), Requirement, Acceptance Criterion, Conformance Item,
 * Migration Step, Risk / Mitigation, Open Question, Reference and Revision
 * is a spec:* primitive joined by typed relations. The section tree is
 * committed as `dnis:Document` + `dnis:Node` primitives (SPEC-CORE §5.6 /
 * SPEC-SECTIONS-TREE v0.2).
 *
 * spec:Requirement and spec:Invariant have no auto-renderer in
 * spec:SpecMarkdownRenderer, so §5 / §6 / §8 build their tables from the
 * SAME arrays that produce the primitives — the prose cannot drift from
 * the typed graph.
 *
 * Run with:
 *   rm -rf /tmp/fdpm-spec-document-plan
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-document-plan npx tsx fdpm-cli/scripts/build-spec-document-plan.ts
 *
 * Render with:
 *   FDPM_DATA_DIR=/tmp/fdpm-spec-document-plan npx tsx fdpm-cli/src/bin/fdpm.ts \
 *     render spec-document-plan text/markdown \
 *     --renderer-id spec:SpecMarkdownRenderer \
 *     -o docs/specs/SPEC-DOCUMENT-PLAN.md
 *
 * Validation runs on commit (§7 pipeline of the SPEC-CORE host); the
 * spec-authoring rules (reference verification, MUST-not-unverifiable,
 * acceptance-criterion evidence, migration action, …) apply.
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
  type OperationId,
} from "../src/core/dnis/index.js";
import { mintUid } from "../src/core/identity/uid.js";

const BUILD_AGENT = "agent:build-spec-document-plan" as AgentId;
const PROJECT_ID = "spec-document-plan";
const SCHEMA_PATH = "fdpm-cli/plugins/document_plan/schemas/document-plan.ts";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function table(header: string[], rows: string[][]): string[] {
  const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ];
}

// ── Document root ──────────────────────────────────────────────────────────

const documentSpec: PrimitiveSpec = {
  id: "spec:doc:document-plan",
  type: "spec:Document",
  fields: {
    title: "SPEC — DocumentPlan 3.1.0",
    subtitle:
      "A planning contract for written works, from a one-sitting essay to a multi-part book: identity, structure, claims, evidence, budgets and the boundary between plan text and manuscript text.",
    spec_id: "spec:fdpm:document-plan:3.1",
    version: "3.1.0",
    status: "Draft",
    audience:
      "Authors and editors who write plans; implementers of validators, renderers and drafting agents that consume them; FDPM plugin authors realising the schema as a workbook profile.",
    required_reads: [
      "CLAUDE.md",
      "PURPOSE.md",
      "DISCLAIMER.md",
      "docs/specs/SPEC-CORE.md",
      "docs/specs/SPEC-DNIS.md",
    ],
    companion_code: SCHEMA_PATH,
    peer_spec: "docs/specs/SPEC-FDPM-BRIDGE-ZOD.md",
    disclaimer_path: "../../DISCLAIMER.md",
    pals_banner: true,
    pals_extension:
      "A DocumentPlan is typically produced or edited by an LLM agent. Every rule in this specification exists so that a plan can be rejected mechanically before a single sentence of manuscript is drafted from it; a consumer that skips DocumentPlanSchema.safeParse on a plan it did not author has no verification layer at all.",
    date: "2026-08-28",
    generated_by: "Claude Fable 5 via Claude Code (fdpm.spec-authoring-dnis)",
    revision_note:
      "3.1.0 — first SPEC edition. Transcribes DocumentPlan schema v3.1.0 (MIGRATES_FROM 2.0.0, 3.0.0) into the spec-authoring vocabulary; every superRefine rule and field-level refinement appears as a spec:Invariant with its validation message quoted verbatim.",
    source_script: "fdpm-cli/scripts/build-spec-document-plan.ts",
    regeneration_command: [
      "rm -rf /tmp/fdpm-spec-document-plan",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-document-plan npx tsx fdpm-cli/scripts/build-spec-document-plan.ts",
      "FDPM_DATA_DIR=/tmp/fdpm-spec-document-plan npx tsx fdpm-cli/src/bin/fdpm.ts \\",
      "  render spec-document-plan text/markdown \\",
      "  --renderer-id spec:SpecMarkdownRenderer \\",
      "  -o docs/specs/SPEC-DOCUMENT-PLAN.md",
    ].join("\n"),
  },
};

// ── §2.3 Terms ─────────────────────────────────────────────────────────────

const terms: Array<[string, string, string?]> = [
  ["DocumentPlan", "The root object: one plan for one written work, in one language, at one `schema_version`. Owns its structure and registries; references people."],
  ["Plan text", "Any free-text value in a DocumentPlan that is addressed to the author and read before drafting. It constrains what the prose must achieve and supplies no wording for it. Never rendered into the manuscript.", "planning text"],
  ["Manuscript text", "The four kinds of value that may appear verbatim in the finished work: plan `title`/`subtitle`, node `title`/`subtitle`, concept `term`/`aliases`, asset `caption`, and the sources themselves. Enumerated by `MANUSCRIPT_TEXT_FIELDS`."],
  ["Node", "A structural element of the work — part, chapter, section, subsection, front-matter element, appendix or back-matter element — carrying a human-authored slug identity, an optional ClaimBlock and ordered children.", "SectionNode"],
  ["Region", "One of the three ordered node containers of `structure`: `front_matter`, `sections` (the body) and `back_matter`. Reading order is front matter, body, back matter."],
  ["Node kind", "The structural role of a node (`part`, `chapter`, `section`, `subsection`, `front_matter_element`, `appendix`, `back_matter_element`). Each kind has a rank; a child's rank must exceed its parent's."],
  ["Rank", "The integer `NODE_KIND_RANK[kind]` that orders node kinds from coarsest (`part` = 1) to finest (`subsection` = 4)."],
  ["Work type", "The scale and genre of the work (`essay` … `series_volume`). `WORK_TYPE_PROFILE[work_type]` fixes the maximum nesting depth, whether front and back matter are permitted, and the minimum rank a body node may open with."],
  ["ClaimBlock", "The unit of argument on a node: the single assertion the node must land (`claim`), why it holds (`reasoning`), the citations backing it (`evidence`) and the objections the prose must survive (`counter_arguments`)."],
  ["Claim", "An assertion stated as itself, in the third person of its subject. Plan text; never printed. Rejected when written in the voice of the document (see AssertionText)."],
  ["Through-line", "Plan text on a grouping node stating what holds its children together and governs their sequence. Required on a grouping node that carries no claim."],
  ["Narrative function", "The role a node performs in the arc of the whole work (`setup`, `development`, `turn`, `complication`, `payoff`, `synthesis`, `reference`). The prose performs the role; it never announces it."],
  ["Registry", "An unordered list of entities the plan owns and that nodes reference by id: `content.sources`, `content.concepts`, `content.assets`, `threads`. `people` is an association registry — people exist independently of the plan."],
  ["Source", "An evidence-registry entry (`ContentSource`): a citable work with an optional BibTeX-safe `citation_key`, a discriminated `identifier` (DOI, ISBN, ISSN, arXiv, URL, archive, internal) and an authority level.", "ContentSource"],
  ["Evidence reference", "A citation from a claim to a source: `source_id` plus an optional page-level `locator`, the relation of the passage to the claim (`supports`) and a note.", "EvidenceRef"],
  ["Concept", "A term the work defines and then depends on. Declares `introduced_in`, the node that defines it for the reader; every use must come at or after that node in reading order."],
  ["Thread", "An argument or narrative line that runs across nodes. A thread picked up by fewer than two nodes is not a through-line and fails validation."],
  ["Asset", "Non-prose material (figure, table, chart, photograph, illustration, code listing, epigraph) with a placement node and a rights-clearance state."],
  ["Person", "A named human involved in the work (author, co-author, editor, researcher, translator, illustrator, reviewer, other). `name` is PII-low, stored once, referenced by id."],
  ["Milestone", "A dated delivery target covering a set of nodes that must reach `target_status` by `due`. Sequence is given by `due`; every `due` falls on or before `constraints.deadline`."],
  ["Dependency", "A declaration that a node depends on other nodes, with an optional reason (`context`, `argument_buildup`, `evidence_introduction`, `logical_prerequisite`). The dependency graph must be a DAG."],
  ["Reading order", "The depth-first traversal of the plan: front matter, then body, then back matter; within each, array order and then children. Derived by `flattenStructure`, never stored."],
  ["Word budget", "`target_words` on a node, inclusive of all descendants; `constraints.min_words`/`max_words` on the whole work; `word_budget_tolerance` the permitted overshoot fraction (default 0.1)."],
  ["Slug", "The human-authored `NodeId`: 1–64 characters matching `^[a-z0-9][a-z0-9-]*$`, unique across front matter, body and back matter."],
  ["AssertionText", "A string of bounded length that is rejected when it opens by naming the document or one of its parts (`SELF_REFERENTIAL`). Used for `thesis`, `claim` and `through_line`."],
];
const termSpecs: PrimitiveSpec[] = terms.map(([term, definition, synonyms]) => ({
  id: `spec:term:${slug(term)}`,
  type: "spec:Term",
  fields: synonyms ? { term, definition, synonyms } : { term, definition },
}));

// ── §3 Design Principles ───────────────────────────────────────────────────

const principles = [
  { id: "spec:prin:plan-is-not-manuscript", ordinal: 1, title: "A plan specifies what the manuscript must establish; it never supplies its wording", strength: "MUST",
    statement: "Every free-text field is addressed to the author and read before drafting. A renderer MUST NOT print any value that is not listed in `MANUSCRIPT_TEXT_FIELDS`; a validator MUST reject plan text written in the voice of the document." },
  { id: "spec:prin:scale-is-structural", ordinal: 2, title: "Scale is structural, not cosmetic", strength: "MUST",
    statement: "An essay and a book differ in nesting depth, in whether front and back matter exist, and in which node kinds may open the body. `work_type` selects a profile and the validator enforces it mechanically instead of forcing a book into a flat list of sections." },
  { id: "spec:prin:nodes-are-the-claims", ordinal: 3, title: "The nodes are the claims", strength: "MUST",
    statement: "There is no separate claim registry. A claim lives on the node that must land it, so a claim cannot drift out of sync with the structure that carries it. A leaf node MUST state its claim; a grouping node MUST state a claim or a through-line." },
  { id: "spec:prin:define-once-reference-by-id", ordinal: 4, title: "Define once, reference by id", strength: "MUST",
    statement: "Sources, concepts, assets, threads and people are declared exactly once in a registry and referenced everywhere else by id. Every reference MUST resolve; the validator checks resolution, uniqueness and, where order matters, reading order." },
  { id: "spec:prin:identity-two-kinds", ordinal: 5, title: "Two kinds of identity: authored slugs for structure, opaque ids for registries", strength: "SHOULD",
    statement: "Nodes carry a human-authored slug (`NodeId`) because authors cross-reference them by hand; registry entries carry opaque RFC 4122 UUIDs because they are created by tools and never modified. A producer SHOULD keep both stable across revisions." },
  { id: "spec:prin:derived-never-stored", ordinal: 6, title: "Derived values are never stored", strength: "MUST",
    statement: "Reading order, the plan total of word budgets and effective (post-fallback) values are computed by exported helpers (`flattenStructure`, `totalTargetWords`, `effectiveEvidence`, `effectiveTargetWords`). A producer MUST NOT persist them as fields." },
  { id: "spec:prin:single-locale", ordinal: 7, title: "One plan, one language", strength: "MUST",
    statement: "Every free-text field of a plan is written in `language` (a BCP 47 tag). A translation is a separate DocumentPlan linked through `translation_of`; a plan MUST NOT be a translation of itself." },
  { id: "spec:prin:deprecations-carry-sunset", ordinal: 8, title: "Deprecations are readable until a named sunset", strength: "MUST",
    statement: "A deprecated field stays readable, is read only when its replacement is absent, and is rejected when both are supplied with conflicting values. Each deprecation names the version since which it applies, its replacement and its sunset (4.0.0 for the current set)." },
];
const principleSpecs: PrimitiveSpec[] = principles.map((p) => ({
  id: p.id,
  type: "spec:Principle",
  fields: { ordinal: p.ordinal, title: p.title, statement: p.statement, strength: p.strength },
}));

// ── Stakeholders and quality attributes ────────────────────────────────────

const stakeholders: PrimitiveSpec[] = [
  { id: "spec:stk:author", type: "spec:Stakeholder", fields: { role: "Author / editor", category: "human", primary_concern: "Plan a work at any scale without the plan's scaffolding leaking into the draft; be told early when a claim, budget or reference is inconsistent." } },
  { id: "spec:stk:drafting-agent", type: "spec:Stakeholder", fields: { role: "Drafting agent (LLM)", category: "agent", primary_concern: "Receive an unambiguous contract for each node — the assertion to land, the evidence to cite, the objections to survive — and a machine-checkable list of what may be printed verbatim." } },
  { id: "spec:stk:validator-implementer", type: "spec:Stakeholder", fields: { role: "Validator implementer", category: "internal_team", primary_concern: "Implement every rule of §5 and §6 exactly once, with the messages in this specification, so two conforming validators agree on what they reject." } },
  { id: "spec:stk:renderer-implementer", type: "spec:Stakeholder", fields: { role: "Renderer implementer", category: "internal_team", primary_concern: "Know which values reach the page (`MANUSCRIPT_TEXT_FIELDS`) and which never do, without reading field descriptions one by one." } },
  { id: "spec:stk:fdpm-host", type: "spec:Stakeholder", fields: { role: "FDPM host and plugin author", category: "automated", primary_concern: "Realise the schema as a workbook profile whose primitives, relations and judges preserve the invariants of this specification, and declare precisely which constructs are lost in translation." } },
];

const qualityAttributes: PrimitiveSpec[] = [
  { id: "spec:qa:verifiability", type: "spec:QualityAttribute", fields: { attribute: "Verifiability", priority: "primary", pressure: "Every structural and cross-reference rule is mechanical; a plan is accepted or rejected by `safeParse` alone, with a path and a message per issue." } },
  { id: "spec:qa:scale-portability", type: "spec:QualityAttribute", fields: { attribute: "Portability across scales", priority: "primary", pressure: "The same shape serves a 600-word essay and a multi-volume series; work-type profiles, not schema variants, absorb the difference." } },
  { id: "spec:qa:locale-integrity", type: "spec:QualityAttribute", fields: { attribute: "Locale integrity", priority: "secondary", pressure: "Self-referential-voice detection and prohibited patterns cover English and Portuguese today; other languages fall back to structural checks only." } },
  { id: "spec:qa:evolvability", type: "spec:QualityAttribute", fields: { attribute: "Evolvability", priority: "constraint", pressure: "Additive changes ship as minor versions; a field removal or a new rejection needs a migration note and, for removals, a major version." } },
];

// ── §4 Schema definitions (dialect: zod; excerpts keep every constraint) ───

const schemaDefs: PrimitiveSpec[] = [
  { id: "spec:schema:identifiers", type: "spec:SchemaDefinition", fields: { name: "Identifiers and shared primitives", dialect: "zod", body: [
    "export const SCHEMA_VERSION = '3.1.0' as const;",
    "export const MIGRATES_FROM = ['2.0.0', '3.0.0'] as const;",
    "",
    "const ISODateTime = z.string().datetime({ offset: true });                     // second precision, UTC-normalised",
    "const ISODate = z.string().regex(/^\\d{4}(-\\d{2}(-\\d{2})?)?$/);                // YYYY, YYYY-MM or YYYY-MM-DD",
    "export const Uuid = z.string().uuid();                                        // RFC 4122",
    "export const NodeId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/); // human-authored slug, unique across the whole plan",
    "export const SectionId = NodeId;                                              // retained v2 alias",
    "",
    "const SourceIdRef = Uuid;   // FK → content.sources[].id",
    "const ConceptIdRef = Uuid;  // FK → content.concepts[].id",
    "const ThreadIdRef = Uuid;   // FK → threads[].id",
    "const PersonIdRef = Uuid;   // FK → people[].id",
    "",
    "const AssertionText = (max: number) =>",
    "  z.string().min(1).max(max).refine((value) => !SELF_REFERENTIAL.test(value), { message: SELF_REFERENTIAL_MESSAGE });",
  ].join("\n") } },
  { id: "spec:schema:enumerations", type: "spec:SchemaDefinition", fields: { name: "Enumerations", dialect: "zod", body: [
    "export const WorkType = z.enum(['essay', 'article', 'long_form_feature', 'report', 'whitepaper', 'thesis', 'book', 'edited_volume', 'series_volume']);",
    "export const NodeKind = z.enum(['part', 'chapter', 'section', 'subsection', 'front_matter_element', 'appendix', 'back_matter_element']);",
    "const WorkStatus = z.enum(['draft', 'outline_complete', 'research', 'writing', 'review', 'final']);",
    "const AuthorityLevel = z.enum(['primary', 'secondary', 'tertiary']);",
    "purpose:            z.enum(['inform', 'persuade', 'decide', 'explain', 'report', 'propose', 'other'])",
    "narrative_function: z.enum(['setup', 'development', 'turn', 'complication', 'payoff', 'synthesis', 'reference'])",
    "EvidenceRef.supports: z.enum(['asserts', 'illustrates', 'qualifies', 'contradicts']).default('asserts')",
    "Asset.kind:         z.enum(['figure', 'table', 'chart', 'photograph', 'illustration', 'code_listing', 'epigraph'])",
    "Asset.rights_status: z.enum(['original', 'public_domain', 'licensed', 'permission_pending', 'permission_denied']).default('original')",
    "Person.role:        z.enum(['author', 'co_author', 'editor', 'researcher', 'translator', 'illustrator', 'reviewer', 'other'])",
    "audience.knowledge_level: z.enum(['expert', 'intermediate', 'novice'])",
    "style.tone:         z.enum(['formal', 'conversational', 'technical', 'narrative', 'advisory'])",
    "style.voice:        z.enum(['first_person', 'second_person', 'third_person', 'passive'])",
    "style.reading_level: z.enum(['academic', 'professional', 'general'])",
    "style.citation_style: z.enum(['none', 'chicago_notes', 'chicago_author_date', 'apa', 'mla', 'harvard', 'ieee', 'abnt', 'numeric']).default('none')",
    "constraints.format: z.enum(['markdown', 'docx', 'pdf', 'html', 'plaintext', 'latex', 'epub', 'indesign'])",
    "structure.opening_strategy: z.enum(['context', 'problem', 'question', 'narrative', 'thesis'])",
    "structure.closing_strategy: z.enum(['conclusion', 'call_to_action', 'recommendation', 'implications'])",
    "dependencies[].reason: z.enum(['context', 'argument_buildup', 'evidence_introduction', 'logical_prerequisite'])",
  ].join("\n") } },
  { id: "spec:schema:work-type-profile", type: "spec:SchemaDefinition", fields: { name: "Work-type profiles and node-kind ranks (normative tables)", dialect: "typescript", body: [
    "export const WORK_TYPE_PROFILE = {",
    "  essay:             { max_depth: 2, allows_matter: false, top_level_min_rank: 3 },",
    "  article:           { max_depth: 2, allows_matter: false, top_level_min_rank: 3 },",
    "  long_form_feature: { max_depth: 3, allows_matter: false, top_level_min_rank: 3 },",
    "  report:            { max_depth: 3, allows_matter: true,  top_level_min_rank: 2 },",
    "  whitepaper:        { max_depth: 3, allows_matter: true,  top_level_min_rank: 2 },",
    "  thesis:            { max_depth: 4, allows_matter: true,  top_level_min_rank: 1 },",
    "  book:              { max_depth: 4, allows_matter: true,  top_level_min_rank: 1 },",
    "  edited_volume:     { max_depth: 4, allows_matter: true,  top_level_min_rank: 1 },",
    "  series_volume:     { max_depth: 4, allows_matter: true,  top_level_min_rank: 1 },",
    "} as const;",
    "",
    "export const NODE_KIND_RANK = {",
    "  part: 1,",
    "  chapter: 2, front_matter_element: 2, appendix: 2, back_matter_element: 2,",
    "  section: 3,",
    "  subsection: 4,",
    "} as const;",
  ].join("\n") } },
  { id: "spec:schema:document-plan-root", type: "spec:SchemaDefinition", fields: { name: "DocumentPlan (root object)", dialect: "zod", body: [
    "export const DocumentPlanSchema = z.object({",
    "  schema_version: z.literal('3.1.0'),",
    "  id: Uuid,                                             // opaque, stable, set at creation, never modified",
    "  work_type: WorkType,",
    "  title: z.string().min(1).max(200),                    // manuscript text",
    "  subtitle: z.string().min(1).max(300).optional(),      // manuscript text",
    "  description: z.string().min(1).max(1000),             // plan text",
    "  language: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/), // BCP 47; single-locale strategy",
    "  translation_of: Uuid.optional(),                      // FK → DocumentPlan.id; must differ from `id`",
    "  series: z.object({",
    "    title: z.string().min(1).max(200),",
    "    volume_number: z.number().int().positive(),",
    "    previous_volume_id: Uuid.optional(),",
    "    carried_concept_ids: z.array(ConceptIdRef).max(200).optional(),",
    "  }).optional(),                                        // required in practice when work_type = 'series_volume'",
    "  audience: z.object({",
    "    primary: z.string().min(1).max(200),",
    "    secondary: z.array(z.string().min(1).max(200)).max(10).optional(),",
    "    knowledge_level: z.enum(['expert', 'intermediate', 'novice']),",
    "    includes_decision_makers: z.boolean().default(false),",
    "    prior_reading_assumed: z.array(z.string().min(1).max(200)).max(20).optional(),",
    "  }),",
    "  thesis: AssertionText(500),                           // plan text",
    "  purpose: z.enum([...]), purpose_other: z.string().min(1).max(200).optional(),",
    "  success_criteria: z.array(z.string().min(1).max(300)).min(1).max(20),",
    "  out_of_scope: z.array(z.string().min(1).max(300)).max(30).optional(),",
    "  structure: z.object({",
    "    front_matter: z.array(SectionNodeSchema).max(20).optional(),",
    "    sections: z.array(SectionNodeSchema).min(1).max(200),",
    "    back_matter: z.array(SectionNodeSchema).max(50).optional(),",
    "    max_depth: z.number().int().min(1).max(4).optional(), // may tighten the work-type limit, never exceed it",
    "    opening_strategy: z.enum([...]).optional(), closing_strategy: z.enum([...]).optional(),",
    "  }),",
    "  threads: z.array(Thread).max(50).optional(),",
    "  content: z.object({",
    "    sources: z.array(ContentSource).max(2000).optional(),",
    "    concepts: z.array(Concept).max(500).optional(),",
    "    assets: z.array(Asset).max(500).optional(),",
    "    examples: z.array(z.object({ description: z.string().min(1).max(500), section_id: NodeId.optional() })).max(200).optional(),",
    "  }),",
    "  people: z.array(Person).max(100).optional(),",
    "  style: z.object({ tone, voice?, reading_level?, citation_style (default 'none'),",
    "    prohibited_patterns: z.array(z.string().min(1).max(200)).max(30).optional(),",
    "    required_patterns:   z.array(z.string().min(1).max(200)).max(30).optional() }),",
    "  constraints: z.object({",
    "    min_words: z.number().int().positive().max(2_000_000).optional(),",
    "    max_words: z.number().int().positive().max(2_000_000).optional(),",
    "    word_budget_tolerance: z.number().min(0).max(1).default(0.1),",
    "    deadline: ISODateTime.optional(), format: z.enum([...]).optional(),",
    "    reviewers: z.array(z.object({ name, role? })).max(20).optional(),   // DEPRECATED since 3.0.0, sunset 4.0.0",
    "  }),",
    "  milestones: z.array(z.object({ id: NodeId, label: z.string().min(1).max(200), due: ISODateTime,",
    "    node_ids: z.array(NodeId).min(1).max(200), target_status: WorkStatus })).max(100).optional(),",
    "  review: z.object({",
    "    require_coherence_test: z.boolean().default(true), require_completeness_test: z.boolean().default(true),",
    "    require_self_contained_test: z.boolean().default(true), require_substantive_test: z.boolean().default(true),",
    "    require_thread_continuity_test: z.boolean().default(false), require_concept_introduction_test: z.boolean().default(false),",
    "    require_budget_test: z.boolean().default(false),",
    "    assignments: z.array(z.object({ person_id: PersonIdRef, scope_node_ids: z.array(NodeId).max(200).optional(),",
    "      required: z.boolean().default(true) })).max(50).optional(),",
    "  }).optional(),",
    "  review_requirements: z.object({ /* four booleans */ }).optional(),  // DEPRECATED since 3.0.0, sunset 4.0.0",
    "  dependencies: z.array(z.object({ section_id: NodeId, depends_on: z.array(NodeId).min(1).max(50),",
    "    reason: z.enum(['context', 'argument_buildup', 'evidence_introduction', 'logical_prerequisite']).optional() })).max(500).optional(),",
    "  metadata: z.object({ revision: z.number().int().positive(), created_by: z.string().min(1).max(200), created_at: ISODateTime,",
    "    modified_by: z.string().min(1).max(200).optional(), modified_at: ISODateTime.optional(), status: WorkStatus.default('draft') }),",
    "}).superRefine(/* §5 and §6 of this specification */);",
  ].join("\n") } },
  { id: "spec:schema:section-node", type: "spec:SchemaDefinition", fields: { name: "SectionNode, ClaimBlock and EvidenceRef", dialect: "zod", body: [
    "const EvidenceRef = z.object({",
    "  source_id: SourceIdRef,",
    "  locator: z.string().min(1).max(120).optional(),       // \"pp. 44–47\", \"§3.2\", \"00:14:20\", \"fig. 6\"",
    "  supports: z.enum(['asserts', 'illustrates', 'qualifies', 'contradicts']).default('asserts'),",
    "  note: z.string().max(500).optional(),",
    "});",
    "",
    "const ClaimBlock = z.object({",
    "  claim: AssertionText(500),                             // the single assertion this node must land",
    "  reasoning: z.string().min(1).max(2000).nullable().optional(), // absent: not yet drafted; null: asserted without reasoning by design",
    "  evidence: z.array(EvidenceRef).max(200).optional(),",
    "  evidence_source_ids: z.array(SourceIdRef).max(200).optional(), // DEPRECATED since 3.0.0, sunset 4.0.0 — read only when `evidence` is absent",
    "  counter_arguments: z.array(z.string().min(1).max(500)).max(20).optional(),",
    "});",
    "",
    "const SectionNodeCore = z.object({",
    "  id: NodeId,",
    "  kind: NodeKind,",
    "  title: z.string().min(1).max(200),                     // manuscript text",
    "  subtitle: z.string().min(1).max(300).optional(),       // manuscript text",
    "  content: ClaimBlock.optional(),                        // required on leaf nodes",
    "  through_line: AssertionText(500).optional(),           // required on a grouping node without a claim",
    "  narrative_function: z.enum(['setup', 'development', 'turn', 'complication', 'payoff', 'synthesis', 'reference']).optional(),",
    "  target_words: z.number().int().positive().max(500_000).optional(), // inclusive of all descendants",
    "  word_count: z.number().int().positive().optional(),    // DEPRECATED since 3.0.0, sunset 4.0.0 — renamed to target_words",
    "  status: WorkStatus.default('draft'),",
    "  owner_id: PersonIdRef.optional(),",
    "  concept_ids: z.array(ConceptIdRef).max(100).optional(),",
    "  thread_ids: z.array(ThreadIdRef).max(20).optional(),",
    "  notes: z.string().max(2000).optional(),",
    "});",
    "",
    "export const SectionNodeSchema: z.ZodType<SectionNode, SectionNodeInput> = SectionNodeCore.extend({",
    "  children: z.lazy(() => z.array(SectionNodeSchema).max(200)).optional(), // composition: ordered; deleted with the parent",
    "});",
    "",
    "export function effectiveEvidence(block: ClaimBlock): EvidenceRef[]      // `evidence` ?? evidence_source_ids mapped to { supports: 'asserts' }",
    "export function effectiveTargetWords(node: SectionNode): number | undefined // target_words ?? word_count",
    "export function flattenStructure(structure): FlatNode[]                   // DFS reading order: front matter, body, back matter",
    "export function totalTargetWords(structure): number                       // sum of top-level budgets (a parent budget includes its descendants)",
  ].join("\n") } },
  { id: "spec:schema:registries", type: "spec:SchemaDefinition", fields: { name: "Registries: ContentSource, Concept, Asset, Thread, Person", dialect: "zod", body: [
    "const SourceIdentifier = z.discriminatedUnion('kind', [",
    "  z.object({ kind: z.literal('doi'),      value: z.string().regex(/^10\\.\\d{4,9}\\/\\S+$/) }),",
    "  z.object({ kind: z.literal('isbn'),     value: z.string().regex(/^(97[89])?\\d{9}[\\dX]$/) }),",
    "  z.object({ kind: z.literal('issn'),     value: z.string().regex(/^\\d{4}-\\d{3}[\\dX]$/) }),",
    "  z.object({ kind: z.literal('arxiv'),    value: z.string().min(1).max(64) }),",
    "  z.object({ kind: z.literal('url'),      value: z.string().url() }),",
    "  z.object({ kind: z.literal('archive'),  value: z.string().min(1).max(300) }),",
    "  z.object({ kind: z.literal('internal'), value: z.string().min(1).max(200) }),",
    "]);",
    "",
    "const ContentSource = z.object({",
    "  id: Uuid,",
    "  citation_key: z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/).optional(), // unique across content.sources when present",
    "  title: z.string().min(1).max(300),",
    "  authors: z.array(z.string().min(1).max(200)).max(50).optional(),",
    "  publication_date: ISODate.optional(), publisher: z.string().min(1).max(200).optional(),",
    "  identifier: SourceIdentifier.optional(), url: z.string().url().optional(),",
    "  authority_level: AuthorityLevel.optional(),",
    "  excerpt: z.string().max(1000).optional(),              // quoted passage held for drafting; respect the source licence",
    "  retrieved_at: ISODateTime.optional(),",
    "});",
    "",
    "const Concept = z.object({ id: Uuid, term: z.string().min(1).max(120), definition: z.string().min(1).max(1000),",
    "  aliases: z.array(z.string().min(1).max(120)).max(20).optional(), introduced_in: NodeId });",
    "",
    "const Asset = z.object({ id: Uuid, kind: z.enum([...7 kinds]), caption: z.string().min(1).max(500), node_id: NodeId,",
    "  source_id: SourceIdRef.optional(), rights_status: z.enum([...5 states]).default('original') });",
    "",
    "const Thread = z.object({ id: Uuid, name: z.string().min(1).max(200), description: z.string().min(1).max(1000),",
    "  resolution: z.string().max(500).optional() });        // absent on threads deliberately left open",
    "",
    "const Person = z.object({ id: Uuid, name: z.string().min(1).max(200), role: z.enum([...8 roles]),",
    "  role_other: z.string().min(1).max(120).optional() });  // required when role = 'other'",
  ].join("\n") } },
  { id: "spec:schema:boundary-constants", type: "spec:SchemaDefinition", fields: { name: "Planning/manuscript boundary constants", dialect: "typescript", body: [
    "const PLANNING_CLAUSE = 'Planning field: it constrains what the prose must achieve and supplies no wording for it. Never rendered.';",
    "",
    "export const MANUSCRIPT_TEXT_FIELDS = [",
    "  'title', 'subtitle', 'structure.*.title', 'structure.*.subtitle',",
    "  'content.concepts[].term', 'content.concepts[].aliases[]', 'content.assets[].caption', 'content.sources[]',",
    "] as const;",
    "",
    "const SELF_REFERENTIAL =",
    "  /^\\s*(this|the following|the present|o|a|este|esta|o presente|a presente)\\s+(document|documento|work|obra|book|livro|part|parte|chapter|cap[ií]tulo|section|se[cç][ãa]o|subsection|subse[cç][ãa]o|node|essay|ensaio|article|artigo|paper|report|relat[óo]rio|piece|text|texto|passage|passagem)\\b/i;",
    "",
    "const SELF_REFERENTIAL_MESSAGE =",
    "  'Plan text describes the document instead of asserting its content. Write the assertion itself (\"Caching removes most database load\"), not a description of where it sits (\"This section argues that caching…\").';",
    "",
    "export const DEFAULT_PROHIBITED_PATTERNS = [ // 20 entries; applied to no plan automatically",
    "  'this document', 'this section', 'this chapter', 'this essay', 'this report', 'in what follows', 'as mentioned earlier',",
    "  'as noted above', 'we will examine', 'we will discuss', 'the purpose of this', 'it is important to note', 'it is worth noting',",
    "  'este documento', 'esta seção', 'este capítulo', 'a seguir', 'como mencionado', 'vale notar', 'é importante notar',",
    "] as const;",
  ].join("\n") } },
];

// ── §5 / §6 Invariants — one per superRefine rule, message verbatim ────────

interface Inv { id: string; group: string; label: string; statement: string; enforcement: string; scope_ref: string; constrains?: string }

const invariants: Inv[] = [
  // Field-level refinements
  { id: "spec:inv:schema-version-literal", group: "identity", label: "schema_version is the literal '3.1.0'", statement: "`schema_version` MUST equal the literal `'3.1.0'`; any other value is rejected at parse time.", enforcement: "type_system", scope_ref: "§4.1", constrains: "spec:schema:document-plan-root" },
  { id: "spec:inv:assertion-not-self-referential", group: "boundary", label: "Assertions are not written in the voice of the document", statement: "`thesis`, every `content.claim` and every `through_line` MUST NOT match `SELF_REFERENTIAL`. Message: \"Plan text describes the document instead of asserting its content. Write the assertion itself (\\\"Caching removes most database load\\\"), not a description of where it sits (\\\"This section argues that caching…\\\").\"", enforcement: "runtime_check", scope_ref: "§7.2", constrains: "spec:schema:boundary-constants" },
  // Structure legality
  { id: "spec:inv:node-id-unique", group: "structure", label: "Node ids are unique across all regions", statement: "Message: `Duplicate node id \"<id>\": ids must be unique across front matter, body, and back matter.`", enforcement: "runtime_check", scope_ref: "§5.1", constrains: "spec:schema:section-node" },
  { id: "spec:inv:max-depth-within-profile", group: "structure", label: "structure.max_depth may tighten, never exceed, the work-type limit", statement: "Message: `structure.max_depth <n> exceeds the limit of <max_depth> for work_type \"<work_type>\".` The effective limit is `min(structure.max_depth ?? profile.max_depth, profile.max_depth)`.", enforcement: "runtime_check", scope_ref: "§5.2", constrains: "spec:schema:work-type-profile" },
  { id: "spec:inv:no-matter-when-disallowed", group: "structure", label: "Front and back matter only where the work type allows them", statement: "Message: `work_type \"<work_type>\" does not carry front or back matter. Move that material into structure.sections or change work_type.`", enforcement: "runtime_check", scope_ref: "§5.2", constrains: "spec:schema:work-type-profile" },
  { id: "spec:inv:depth-within-limit", group: "structure", label: "No node sits deeper than the effective limit", statement: "Message: `Node \"<id>\" sits at depth <d>, beyond the limit of <max> for work_type \"<work_type>\".`", enforcement: "runtime_check", scope_ref: "§5.2" },
  { id: "spec:inv:child-rank-finer-than-parent", group: "structure", label: "A child is of a finer kind than its parent", statement: "Message: `Node \"<id>\" of kind \"<kind>\" cannot sit inside \"<parent id>\" of kind \"<parent kind>\". A child must be of a finer kind than its parent.` (`NODE_KIND_RANK[child] > NODE_KIND_RANK[parent]`.)", enforcement: "runtime_check", scope_ref: "§5.3", constrains: "spec:schema:work-type-profile" },
  { id: "spec:inv:body-opens-at-min-rank", group: "structure", label: "The body opens at or above the work type's minimum rank", statement: "Message: `work_type \"<work_type>\" cannot open its body with a \"<kind>\".` (Top-level body nodes need `NODE_KIND_RANK[kind] >= top_level_min_rank`.)", enforcement: "runtime_check", scope_ref: "§5.3" },
  { id: "spec:inv:front-matter-kind", group: "structure", label: "Top-level front matter nodes are front_matter_element", statement: "Message: `Top-level front matter node \"<id>\" must be of kind \"front_matter_element\".`", enforcement: "runtime_check", scope_ref: "§5.3" },
  { id: "spec:inv:back-matter-kind", group: "structure", label: "Top-level back matter nodes are appendix or back_matter_element", statement: "Message: `Top-level back matter node \"<id>\" must be of kind \"appendix\" or \"back_matter_element\".`", enforcement: "runtime_check", scope_ref: "§5.3" },
  { id: "spec:inv:leaf-has-content", group: "structure", label: "A leaf states its claim", statement: "Message: `Leaf node \"<id>\" carries no content. A node that has no children must state the claim it advances.`", enforcement: "runtime_check", scope_ref: "§5.4", constrains: "spec:schema:section-node" },
  { id: "spec:inv:grouping-has-claim-or-through-line", group: "structure", label: "A grouping node states a claim or a through-line", statement: "Message: `Grouping node \"<id>\" states neither a claim nor a through_line, so nothing explains why its children belong together.`", enforcement: "runtime_check", scope_ref: "§5.4", constrains: "spec:schema:section-node" },
  { id: "spec:inv:evidence-not-both-forms", group: "structure", label: "evidence and the deprecated evidence_source_ids are not both set", statement: "Message: `Node \"<id>\" sets both evidence and the deprecated evidence_source_ids. Keep evidence only.`", enforcement: "runtime_check", scope_ref: "§11.2" },
  { id: "spec:inv:budget-forms-agree", group: "structure", label: "target_words and the deprecated word_count agree when both are set", statement: "Message: `Node \"<id>\" declares conflicting budgets in target_words and the deprecated word_count.`", enforcement: "runtime_check", scope_ref: "§11.2" },
  // Evidence
  { id: "spec:inv:citation-key-unique", group: "evidence", label: "citation_key is unique across sources", statement: "Message: `Duplicate citation_key \"<key>\" across content.sources.`", enforcement: "runtime_check", scope_ref: "§6.1", constrains: "spec:schema:registries" },
  { id: "spec:inv:evidence-resolves", group: "evidence", label: "Every cited source is declared", statement: "For every node, every entry of `effectiveEvidence(content)` resolves. Message: `Node \"<id>\" cites source \"<source_id>\", which is not declared in content.sources.`", enforcement: "runtime_check", scope_ref: "§6.1" },
  // Concepts
  { id: "spec:inv:concept-introduced-in-exists", group: "concepts", label: "A concept is introduced in an existing node", statement: "Message: `Concept \"<term>\" is introduced in \"<introduced_in>\", which is not a node in this plan.`", enforcement: "runtime_check", scope_ref: "§6.2", constrains: "spec:schema:registries" },
  { id: "spec:inv:concept-declared-or-carried", group: "concepts", label: "A used concept is declared or carried from an earlier volume", statement: "Message: `Node \"<id>\" uses concept \"<cid>\", which is declared neither in content.concepts nor in series.carried_concept_ids.`", enforcement: "runtime_check", scope_ref: "§6.2" },
  { id: "spec:inv:concept-introduced-before-use", group: "concepts", label: "A concept is introduced at or before its first use in reading order", statement: "Message: `Node \"<id>\" uses \"<term>\" before \"<introduced_in>\" introduces it. Move the definition earlier or the use later.` (Rejected only when the introducing node's reading-order index is strictly greater than the using node's.)", enforcement: "runtime_check", scope_ref: "§6.2" },
  // Assets, examples, threads, people
  { id: "spec:inv:asset-id-unique", group: "registries", label: "Asset ids are unique", statement: "Message: `Duplicate asset id \"<id>\".`", enforcement: "runtime_check", scope_ref: "§6.3" },
  { id: "spec:inv:asset-node-exists", group: "registries", label: "An asset is placed in an existing node", statement: "Message: `Asset \"<caption>\" is placed in node \"<node_id>\", which does not exist.`", enforcement: "runtime_check", scope_ref: "§6.3" },
  { id: "spec:inv:asset-source-resolves", group: "registries", label: "An asset's source is declared", statement: "Message: `Asset \"<caption>\" cites source \"<source_id>\", which is not declared in content.sources.`", enforcement: "runtime_check", scope_ref: "§6.3" },
  { id: "spec:inv:example-section-exists", group: "registries", label: "An example's section exists", statement: "Message: `content.examples references section_id \"<section_id>\", which does not exist.`", enforcement: "runtime_check", scope_ref: "§6.3" },
  { id: "spec:inv:thread-declared", group: "registries", label: "A thread advanced by a node is declared", statement: "Message: `Node \"<id>\" advances thread \"<tid>\", which is not declared in threads.`", enforcement: "runtime_check", scope_ref: "§6.4" },
  { id: "spec:inv:thread-two-nodes", group: "registries", label: "A thread runs through at least two nodes", statement: "Message: `Thread \"<name>\" is picked up by fewer than two nodes, so it does not run through the work. Attach it to more nodes or remove it.`", enforcement: "runtime_check", scope_ref: "§6.4" },
  { id: "spec:inv:person-id-unique", group: "registries", label: "Person ids are unique", statement: "Message: `Duplicate person id \"<id>\".`", enforcement: "runtime_check", scope_ref: "§6.5" },
  { id: "spec:inv:person-role-other", group: "registries", label: "role = 'other' names the role", statement: "Message: `Person \"<name>\" has role 'other' without role_other.`", enforcement: "runtime_check", scope_ref: "§6.5" },
  { id: "spec:inv:owner-declared", group: "registries", label: "A node's owner is a declared person", statement: "Message: `Node \"<id>\" is owned by \"<owner_id>\", who is not declared in people.`", enforcement: "runtime_check", scope_ref: "§6.5" },
  { id: "spec:inv:review-person-declared", group: "registries", label: "A review assignment names a declared person", statement: "Message: `Review assignment references person \"<person_id>\", who is not declared in people.`", enforcement: "runtime_check", scope_ref: "§6.5" },
  { id: "spec:inv:review-scope-exists", group: "registries", label: "A review scope names existing nodes", statement: "Message: `Review assignment scopes node \"<nid>\", which does not exist.`", enforcement: "runtime_check", scope_ref: "§6.5" },
  // Dependencies
  { id: "spec:inv:dependency-section-exists", group: "dependencies", label: "A dependency's subject exists", statement: "Message: `dependencies.section_id \"<section_id>\" does not exist.`", enforcement: "runtime_check", scope_ref: "§6.6" },
  { id: "spec:inv:dependency-target-exists", group: "dependencies", label: "A dependency's targets exist", statement: "Message: `dependencies for \"<section_id>\" reference \"<target>\", which does not exist.`", enforcement: "runtime_check", scope_ref: "§6.6" },
  { id: "spec:inv:logical-prerequisite-precedes", group: "dependencies", label: "A logical prerequisite is read first", statement: "Message: `\"<section_id>\" declares \"<target>\" a logical prerequisite, but \"<target>\" is read later. Reorder the work or downgrade the reason.` (Applies only to `reason: 'logical_prerequisite'`.)", enforcement: "runtime_check", scope_ref: "§6.6" },
  { id: "spec:inv:dependency-dag", group: "dependencies", label: "The dependency graph is a DAG", statement: "Message: `Circular dependency detected starting at node \"<section_id>\". The dependency graph must be a DAG.` (Reported once, at the first cycle found.)", enforcement: "runtime_check", scope_ref: "§6.6" },
  // Budgets
  { id: "spec:inv:child-budgets-within-tolerance", group: "budgets", label: "Children's budgets fit the parent's within tolerance", statement: "When a node and ALL its children declare budgets: message `Children of \"<id>\" budget <sum> words against a parent budget of <budget>, beyond the <tolerance%> tolerance.` (Checked only when every child declares a budget.)", enforcement: "runtime_check", scope_ref: "§6.7" },
  { id: "spec:inv:min-not-above-max", group: "budgets", label: "min_words does not exceed max_words", statement: "Message: `constraints.min_words must not exceed constraints.max_words.`", enforcement: "runtime_check", scope_ref: "§6.7" },
  { id: "spec:inv:total-within-max", group: "budgets", label: "The planned total fits max_words within tolerance", statement: "When `totalTargetWords(structure) > 0`: message `Node budgets total <planned> words against constraints.max_words of <max>.` (Fails when planned > max × (1 + tolerance).)", enforcement: "runtime_check", scope_ref: "§6.7" },
  { id: "spec:inv:total-reaches-min", group: "budgets", label: "The planned total reaches min_words within tolerance", statement: "When `totalTargetWords(structure) > 0`: message `Node budgets total <planned> words against constraints.min_words of <min>.` (Fails when planned < min × (1 − tolerance).)", enforcement: "runtime_check", scope_ref: "§6.7" },
  // Milestones
  { id: "spec:inv:milestone-id-unique", group: "milestones", label: "Milestone ids are unique", statement: "Message: `Duplicate milestone id \"<id>\".`", enforcement: "runtime_check", scope_ref: "§6.8" },
  { id: "spec:inv:milestone-node-exists", group: "milestones", label: "A milestone covers existing nodes", statement: "Message: `Milestone \"<label>\" covers node \"<nid>\", which does not exist.`", enforcement: "runtime_check", scope_ref: "§6.8" },
  { id: "spec:inv:milestone-before-deadline", group: "milestones", label: "A milestone falls on or before the deadline", statement: "When `constraints.deadline` is set: message `Milestone \"<label>\" falls due after constraints.deadline.`", enforcement: "runtime_check", scope_ref: "§6.8" },
  // Identity and status
  { id: "spec:inv:not-translation-of-self", group: "identity", label: "A plan is not a translation of itself", statement: "Message: `A plan cannot be a translation of itself.`", enforcement: "runtime_check", scope_ref: "§6.9" },
  { id: "spec:inv:not-previous-volume-of-self", group: "identity", label: "A volume does not follow itself", statement: "Message: `A volume cannot follow itself.`", enforcement: "runtime_check", scope_ref: "§6.9" },
  { id: "spec:inv:series-volume-has-series", group: "identity", label: "A series volume declares its series", statement: "Message: `work_type 'series_volume' requires a series block.`", enforcement: "runtime_check", scope_ref: "§6.9" },
  { id: "spec:inv:purpose-other-required", group: "identity", label: "purpose = 'other' names the purpose", statement: "Message: `purpose_other is required when purpose is 'other'.`", enforcement: "runtime_check", scope_ref: "§6.9" },
  { id: "spec:inv:final-requires-final-leaves", group: "status", label: "A final document has only final leaves", statement: "When `metadata.status === 'final'`: message `Document status is final while <n> leaf node(s) are not, starting with \"<id>\".`", enforcement: "runtime_check", scope_ref: "§6.10" },
  { id: "spec:inv:final-requires-rights", group: "status", label: "A final document has no asset with permission denied", statement: "When `metadata.status === 'final'`: message `Document status is final while <n> asset(s) carry permission_denied, starting with \"<caption>\".`", enforcement: "runtime_check", scope_ref: "§6.10" },
];
const invariantSpecs: PrimitiveSpec[] = invariants.map((i) => ({
  id: i.id,
  type: "spec:Invariant",
  fields: { label: i.label, statement: i.statement, enforcement: i.enforcement, scope_ref: i.scope_ref },
}));

function invariantTable(group: string): string[] {
  return table(
    ["Id", "Invariant", "Rule (validation message quoted verbatim)", "Enforcement"],
    invariants.filter((i) => i.group === group).map((i) => [`\`${i.id.replace("spec:inv:", "")}\``, i.label, i.statement, i.enforcement]),
  );
}

// ── §8 Requirements ────────────────────────────────────────────────────────

interface Req { id: string; label: string; statement: string; strength: string; verifiability: string; verifier_ref: string }
const requirements: Req[] = [
  { id: "spec:req:producer-valid-plan", label: "R1 — A producer emits a plan that passes DocumentPlanSchema", strength: "MUST", verifiability: "test", verifier_ref: "fdpm-cli/plugins/document_plan_dnis/build.ts#parseDocumentPlan", statement: "A producer (human tool or agent) MUST emit a document that `DocumentPlanSchema.safeParse` accepts, including every invariant in §5 and §6." },
  { id: "spec:req:producer-stable-ids", label: "R2 — Identifiers are stable across revisions", strength: "MUST", verifiability: "review", verifier_ref: "§4.2; Principle 5", statement: "A producer MUST NOT change `id`, a node slug, or a registry uuid once the plan has been shared; renames are new entities with a migration note in `metadata`." },
  { id: "spec:req:producer-no-derived", label: "R3 — Derived values are not stored", strength: "MUST_NOT", verifiability: "review", verifier_ref: "Principle 6; exported helpers", statement: "A producer MUST NOT persist reading order, plan totals or effective fallback values; consumers compute them with `flattenStructure`, `totalTargetWords`, `effectiveEvidence`, `effectiveTargetWords`." },
  { id: "spec:req:producer-single-locale", label: "R4 — All free text in `language`", strength: "MUST", verifiability: "manual_audit", verifier_ref: "Principle 7", statement: "Every free-text field MUST be written in the plan's `language`; a translation MUST be a separate plan linked through `translation_of`." },
  { id: "spec:req:validator-all-rules", label: "R5 — A validator implements every §5/§6 rule", strength: "MUST", verifiability: "test", verifier_ref: "DocumentPlanSchema.superRefine", statement: "A conforming validator MUST reject exactly the inputs the reference `superRefine` rejects, reporting the issue path and a message equivalent to the one quoted in this specification." },
  { id: "spec:req:validator-collect-all-issues", label: "R6 — A validator reports every issue, not the first", strength: "SHOULD", verifiability: "test", verifier_ref: "Zod safeParse issues[]", statement: "A validator SHOULD accumulate all issues in one pass so an author can fix a plan in one round." },
  { id: "spec:req:validator-deprecated-fallback", label: "R7 — Deprecated fields are read only as fallback", strength: "MUST", verifiability: "test", verifier_ref: "effectiveEvidence / effectiveTargetWords", statement: "A validator or consumer MUST read `evidence_source_ids` only when `evidence` is absent and `word_count` only when `target_words` is absent, and MUST reject conflicting pairs (§5 `evidence-not-both-forms`, `budget-forms-agree`)." },
  { id: "spec:req:renderer-manuscript-fields-only", label: "R8 — A manuscript renderer prints only MANUSCRIPT_TEXT_FIELDS", strength: "MUST_NOT", verifiability: "test", verifier_ref: "MANUSCRIPT_TEXT_FIELDS", statement: "A renderer that produces manuscript output MUST NOT print any value outside `MANUSCRIPT_TEXT_FIELDS`. Everything else is plan text by default, which is what makes the default safe." },
  { id: "spec:req:renderer-plan-outline-labelled", label: "R9 — A plan-outline renderer labels its output as plan text", strength: "SHOULD", verifiability: "review", verifier_ref: "fdpm-cli/plugins/document_plan_dnis/renderers/plan_outline.ts", statement: "A renderer that prints planning fields for review SHOULD state at the top that the output is the plan, not the manuscript." },
  { id: "spec:req:drafting-agent-performs-roles", label: "R10 — A drafting agent performs roles and answers objections without naming them", strength: "SHOULD", verifiability: "manual_audit", verifier_ref: "style.prohibited_patterns; DEFAULT_PROHIBITED_PATTERNS", statement: "A drafting agent SHOULD treat `narrative_function`, `counter_arguments` and `opening_strategy`/`closing_strategy` as behaviour to perform, never as sentences to print; a draft that announces its own scaffolding fails `style.prohibited_patterns` when those are supplied." },
  { id: "spec:req:prohibited-patterns-manuscript-only", label: "R11 — prohibited_patterns are checked against the manuscript", strength: "MUST", verifiability: "review", verifier_ref: "§7.3", statement: "`style.prohibited_patterns` and `style.required_patterns` MUST be checked against manuscript text, not against the plan; `DEFAULT_PROHIBITED_PATTERNS` is applied to no plan automatically." },
  { id: "spec:req:review-gates-declared-not-executed", label: "R12 — Review gates are obligations, not results", strength: "MUST_NOT", verifiability: "review", verifier_ref: "§4.1 review", statement: "A consumer MUST NOT record review results in the plan; `review.*` declares which gates must be satisfied before `metadata.status` advances to `final` and who holds each gate." },
  { id: "spec:req:fdpm-realisation-declares-losses", label: "R13 — An FDPM realisation declares its losses", strength: "MUST", verifiability: "ci_check", verifier_ref: "fdpm-cli/plugins/document_plan/generated/audit.json", statement: "A realisation of this schema as an FDPM profile MUST declare every construct it does not carry mechanically (recursive tree, cross-reference rules, self-referential refinement, discriminated identifier) and where each is enforced instead." },
  { id: "spec:req:fdpm-ingest-full-schema", label: "R14 — FDPM ingest runs the full schema before any write", strength: "MUST", verifiability: "test", verifier_ref: "fdpm-cli/tests/plugins/document_plan/build-and-render.test.ts", statement: "An FDPM ingestion path MUST run `DocumentPlanSchema.safeParse` on the whole plan and write nothing when it fails; per-primitive validators are a second line, not a substitute." },
];
const requirementSpecs: PrimitiveSpec[] = requirements.map((r) => ({
  id: r.id,
  type: "spec:Requirement",
  fields: { label: r.label, statement: r.statement, strength: r.strength, verifiability: r.verifiability, verifier_ref: r.verifier_ref },
}));

// ── §9 Acceptance criteria ─────────────────────────────────────────────────

function ac(ord: number, id: string, criterion: string, status: string, evidence_refs: string[]): PrimitiveSpec {
  return { id: `spec:ac:${id}`, type: "spec:AcceptanceCriterion", fields: { ordinal: ord, criterion, status, evidence_refs } };
}
const acceptances: PrimitiveSpec[] = [
  ac(1, "valid-plan-round-trips", "**AC-1 — A valid plan round-trips.** A plan that satisfies §4–§7 parses, is ingested into an FDPM workbook (header + registries + one dnis:Node per node) and renders as a plan outline whose headings follow reading order.", "met", ["fdpm-cli/tests/plugins/document_plan/build-and-render.test.ts", "fdpm-cli/tests/plugins/document_plan/fixtures/architecture-report.plan.json"]),
  ac(2, "leaf-without-claim-rejected", "**AC-2 — A leaf without a claim is rejected before any write.** Removing `content` from a leaf node yields the message of `leaf-has-content` and no workbook is created.", "met", ["fdpm-cli/tests/plugins/document_plan/build-and-render.test.ts"]),
  ac(3, "self-referential-rejected", "**AC-3 — Plan text in the voice of the document is rejected.** A `thesis`, `claim` or `through_line` matching `SELF_REFERENTIAL` fails with `SELF_REFERENTIAL_MESSAGE`.", "open", [SCHEMA_PATH]),
  ac(4, "concept-order-enforced", "**AC-4 — Concept order is enforced.** Using a concept in a node that precedes `introduced_in` in reading order fails with the `concept-introduced-before-use` message; using it at or after passes.", "open", [SCHEMA_PATH]),
  ac(5, "budget-tolerance-enforced", "**AC-5 — Budget tolerance is enforced.** Children whose budgets sum beyond the parent's budget × (1 + tolerance) fail; within tolerance passes.", "open", [SCHEMA_PATH]),
  ac(6, "deprecated-fallback", "**AC-6 — Deprecated fields behave as fallback.** `evidence_source_ids` alone yields `supports: 'asserts'` citations; `evidence` present wins; both present fails.", "open", [SCHEMA_PATH]),
  ac(7, "renderer-prints-manuscript-fields-only", "**AC-7 — A manuscript renderer never prints plan text.** Given a plan whose planning fields contain a sentinel string, the manuscript output does not contain the sentinel.", "open", ["§7.1 MANUSCRIPT_TEXT_FIELDS"]),
  ac(8, "comparative-claim-baseline-warned", "**AC-8 — A comparative claim without a baseline is surfaced.** The FDPM realisation warns (never errors) when a claim carries a comparative marker and no `context`/`logical_prerequisite` dependency points to an earlier node.", "met", ["fdpm-cli/tests/plugins/document_plan/coherence.test.ts", "fdpm-cli/plugins/document_plan_dnis/validators/coherence.ts"]),
];

// ── §9 Conformance ─────────────────────────────────────────────────────────

const conformance: PrimitiveSpec[] = [
  { id: "spec:conf:producer", type: "spec:ConformanceItem", fields: { ordinal: 1, name: "Conforming producer", procedure: "Emit plans; run them through the reference `DocumentPlanSchema.safeParse`.", expected: "Every emitted plan is accepted; identifiers are stable across re-emission; no derived value is stored (R1–R4)." } },
  { id: "spec:conf:validator", type: "spec:ConformanceItem", fields: { ordinal: 2, name: "Conforming validator", procedure: "Run the validator against a corpus containing one violating input per invariant in §5 and §6 and one valid plan per work type.", expected: "Rejects each violating input with the corresponding path and an equivalent message; accepts every valid plan (R5–R7)." } },
  { id: "spec:conf:manuscript-renderer", type: "spec:ConformanceItem", fields: { ordinal: 3, name: "Conforming manuscript renderer", procedure: "Render a plan whose plan-text fields contain a unique sentinel.", expected: "The sentinel never appears; only `MANUSCRIPT_TEXT_FIELDS` values do (R8)." } },
  { id: "spec:conf:plan-outline-renderer", type: "spec:ConformanceItem", fields: { ordinal: 4, name: "Conforming plan-outline renderer", procedure: "Render the plan for review.", expected: "Output is labelled as the plan; nodes appear in reading order with their claims, evidence resolved to sources, and registries (R9)." } },
  { id: "spec:conf:fdpm-realisation", type: "spec:ConformanceItem", fields: { ordinal: 5, name: "Conforming FDPM realisation", procedure: "Regenerate the bridge artefacts with `--check`; ingest the fixture plan; run `fdpm validate`.", expected: "No drift; ingestion refuses invalid plans before any write; declared losses match the audit log; coherence warnings surface without blocking (R13, R14, AC-1, AC-2, AC-8)." } },
];

// ── §10 Migration ──────────────────────────────────────────────────────────

const migrationSteps: PrimitiveSpec[] = [
  { id: "spec:mig:1", type: "spec:MigrationStep", fields: { ordinal: 1, label: "2.0.0 → 3.0.0: schema_version literal", action: "Set `schema_version` to `\"3.0.0\"`. Breaking; major version increment required.", affected_paths: ["schema_version"] } },
  { id: "spec:mig:2", type: "spec:MigrationStep", fields: { ordinal: 2, label: "2.0.0 → 3.0.0: work_type is required", action: "Add `work_type`; it has no default. Essays and articles that used v2 flat sections map to `essay` / `article`.", affected_paths: ["work_type"], depends_on: ["spec:mig:1"] } },
  { id: "spec:mig:3", type: "spec:MigrationStep", fields: { ordinal: 3, label: "2.0.0 → 3.0.0: subsections become children", action: "Rename `Section.subsections` (one level) to `SectionNode.children` (recursive, depth-limited by work_type).", affected_paths: ["structure.sections[].children"], depends_on: ["spec:mig:2"] } },
  { id: "spec:mig:4", type: "spec:MigrationStep", fields: { ordinal: 4, label: "2.0.0 → 3.0.0: node kind is required", action: "Add `kind` to every node: v2 top-level sections become `section`, v2 subsections become `subsection`.", affected_paths: ["structure.*.kind"], depends_on: ["spec:mig:3"] } },
  { id: "spec:mig:5", type: "spec:MigrationStep", fields: { ordinal: 5, label: "2.0.0 → 3.0.0: evidence_source_ids deprecated", action: "`ClaimBlock.evidence_source_ids` changes from required to optional and is deprecated; supply `evidence` (with locators) instead.", affected_paths: ["structure.*.content.evidence", "structure.*.content.evidence_source_ids"], depends_on: ["spec:mig:1"] } },
  { id: "spec:mig:6", type: "spec:MigrationStep", fields: { ordinal: 6, label: "3.0.0 additions (backward-compatible)", action: "Optionally adopt: `structure.front_matter`, `structure.back_matter`, `structure.max_depth`; `threads`, `people`, `milestones`, `review`, `series`, `out_of_scope`; `content.concepts`, `content.assets`, enriched `content.sources`; node `status`, `owner_id`, `narrative_function`, `through_line`, `concept_ids`, `thread_ids`, `notes`; `constraints.word_budget_tolerance` (default 0.1), `style.citation_style` (default `\"none\"`).", affected_paths: ["structure", "threads", "people", "milestones", "review", "series", "content", "constraints", "style"], depends_on: ["spec:mig:1"] } },
  { id: "spec:mig:7", type: "spec:MigrationStep", fields: { ordinal: 7, label: "3.0.0 → 3.1.0: schema_version literal", action: "Set `schema_version` to `\"3.1.0\"`. No field is added, removed, renamed or retyped.", affected_paths: ["schema_version"], depends_on: ["spec:mig:1"] } },
  { id: "spec:mig:8", type: "spec:MigrationStep", fields: { ordinal: 8, label: "3.0.0 → 3.1.0: rewrite self-referential plan text", action: "`thesis`, every `content.claim` and every `through_line` now reject text that opens by naming the document or one of its parts (\"This chapter argues…\", \"Este capítulo examina…\"). Rewrite each offending string into the assertion it describes — work the draft would otherwise inherit.", affected_paths: ["thesis", "structure.*.content.claim", "structure.*.through_line"], depends_on: ["spec:mig:7"] } },
  { id: "spec:mig:9", type: "spec:MigrationStep", fields: { ordinal: 9, label: "Deprecations readable until 4.0.0", action: "Plan the removal of `SectionCore.word_count` (→ `target_words`), `ClaimBlock.evidence_source_ids` (→ `evidence`), `constraints.reviewers` (→ `people` + `review.assignments`) and `review_requirements` (→ `review`). Each stays readable and is used only when its replacement is absent.", affected_paths: ["structure.*.word_count", "structure.*.content.evidence_source_ids", "constraints.reviewers", "review_requirements"], depends_on: ["spec:mig:6"] } },
];

// ── §12 Risks and mitigations ──────────────────────────────────────────────

const risks: PrimitiveSpec[] = [
  { id: "spec:risk:voice-detection-locale-bound", type: "spec:Risk", fields: { label: "Self-referential-voice detection is English/Portuguese only", description: "`SELF_REFERENTIAL` and `DEFAULT_PROHIBITED_PATTERNS` list English and Portuguese forms; a plan in another language passes the boundary check silently, and a French or Spanish plan may still be written in the voice of the document.", likelihood: "high", impact: "medium" } },
  { id: "spec:risk:heuristic-false-positives", type: "spec:Risk", fields: { label: "Lexical heuristics produce false positives", description: "A claim that legitimately opens with \"A parte…\" (\"the part that …\") or \"O texto…\" as a subject is rejected by `SELF_REFERENTIAL`; comparative-marker detection in the FDPM realisation can flag non-comparative sentences.", likelihood: "medium", impact: "low" } },
  { id: "spec:risk:excerpt-licensing", type: "spec:Risk", fields: { label: "Source excerpts exceed fair use", description: "`ContentSource.excerpt` holds up to 1,000 characters of quoted text for drafting; plans shared outside the authoring team may redistribute licensed material.", likelihood: "medium", impact: "medium" } },
  { id: "spec:risk:pii-in-people", type: "spec:Risk", fields: { label: "Personal data spreads beyond `people`", description: "Names are PII-low and isolated in `people`, but free-text fields (`notes`, `counter_arguments`, `description`) can carry names or contact details a validator cannot detect.", likelihood: "medium", impact: "medium" } },
  { id: "spec:risk:word-count-definition", type: "spec:Risk", fields: { label: "Word counting is language-dependent", description: "Budgets count whitespace-delimited tokens in `language`; for languages without whitespace word boundaries the budget test under-counts and the tolerance is meaningless.", likelihood: "low", impact: "medium" } },
];
const mitigations: PrimitiveSpec[] = [
  { id: "spec:mit:locale-declared-coverage", type: "spec:Mitigation", fields: { strategy: "Document the covered locales next to the regex; a validator SHOULD emit an informational finding when `language` is outside the covered set so authors know the boundary check did not run. Extending the lists is an additive minor version.", status: "planned" } },
  { id: "spec:mit:rewrite-not-relax", type: "spec:Mitigation", fields: { strategy: "Keep the rejection: rewriting a subject-first sentence into an assertion costs one line at plan time and prevents the draft from inheriting meta-narration. In the FDPM realisation the comparative-marker judge is warning-level and never blocks a write.", status: "implemented" } },
  { id: "spec:mit:excerpt-policy", type: "spec:Mitigation", fields: { strategy: "The `excerpt` description states \"Respect the source licence\"; a producer SHOULD strip excerpts before sharing a plan outside the authoring team, and an FDPM realisation MAY register an exporter that omits them.", status: "planned" } },
  { id: "spec:mit:pii-review-gate", type: "spec:Mitigation", fields: { strategy: "Names are stored once and referenced by id so removal is a single operation; the `review.require_self_contained_test` gate and a human reviewer own free-text PII, which no schema rule can detect.", status: "implemented" } },
  { id: "spec:mit:word-count-rule-named", type: "spec:Mitigation", fields: { strategy: "The counting rule (whitespace-delimited tokens in `language`) is stated on `target_words`; a future version MAY add `constraints.count_unit` (`words` | `characters`) — recorded as an open question.", status: "planned" } },
];

// ── Appendix A — Open questions ────────────────────────────────────────────

const openQuestions: PrimitiveSpec[] = [
  { id: "spec:q:reasoning-null-vs-absent", type: "spec:OpenQuestion", fields: { ordinal: 1, question: "`reasoning` is the only field where `null` (asserted without reasoning by design) and absent (not yet drafted) differ. Every other optional field means \"not yet authored\". Should the distinction be generalised through a status field on ClaimBlock, or kept as the single documented exception?", default_choice: "Keep the exception; document it on the field. Generalising would add a status to every optional field for one use case.", is_blocking: "no", owner: "Schema author" } },
  { id: "spec:q:purpose-other-extension", type: "spec:OpenQuestion", fields: { ordinal: 2, question: "`purpose_other` is the intentional extension slot. When a new purpose recurs across plans, should it be promoted into the `purpose` enum (a minor version) and `purpose_other` values migrated?", default_choice: "Promote on recurrence in three or more independent plans; migration is a rewrite of `purpose` with `purpose_other` cleared.", is_blocking: "no", owner: "Schema author" } },
  { id: "spec:q:cross-plan-references", type: "spec:OpenQuestion", fields: { ordinal: 3, question: "`translation_of`, `series.previous_volume_id` and `series.carried_concept_ids` reference other plans by id, but no resolution mechanism is defined: a plan cannot verify that the referenced plan exists or that a carried concept was actually introduced there.", default_choice: "Out of scope for 3.x: references are opaque ids; an FDPM realisation MAY materialise `docplan:PlanTranslationOf` only when the target is present in the same workbook.", is_blocking: "no", owner: "Schema author" } },
  { id: "spec:q:count-unit", type: "spec:OpenQuestion", fields: { ordinal: 4, question: "Should budgets support a count unit other than whitespace-delimited words (characters for CJK languages, minutes for spoken works)?", default_choice: "Add `constraints.count_unit` in a future minor version with `words` as the default; until then budgets for such works are advisory.", is_blocking: "no", owner: "Schema author" } },
  { id: "spec:q:baseline-for-comparative-claims", type: "spec:OpenQuestion", fields: { ordinal: 5, question: "A comparative claim (\"fits in ten lines\", \"simpler than\") needs a baseline the reader has seen. The schema can express it (`dependencies[].reason: 'context'`) but not require it. Should 4.0.0 add `ClaimBlock.baseline_node_id`, or is the warning-level heuristic in the FDPM realisation sufficient?", default_choice: "Keep the heuristic as a warning through 3.x; revisit with usage data before 4.0.0.", is_blocking: "no", owner: "Schema author" } },
  { id: "spec:q:locale-coverage", type: "spec:OpenQuestion", fields: { ordinal: 6, question: "Which locales must `SELF_REFERENTIAL` and `DEFAULT_PROHIBITED_PATTERNS` cover before a plan in that language can claim full conformance?", default_choice: "Full conformance is claimable only for `en*` and `pt*` in 3.1.0; other locales conform structurally (§5, §6) and are marked as boundary-unchecked.", is_blocking: "no", owner: "Schema author" } },
];

// ── §14 References ─────────────────────────────────────────────────────────

const references: PrimitiveSpec[] = [
  { id: "spec:ref:schema-source", type: "spec:Reference", fields: { kind: "repo_file", citation: "fdpm-cli/plugins/document_plan/schemas/document-plan.ts — DocumentPlan schema v3.1.0 (Zod v4). The normative source of every definition and invariant in this specification.", locator: SCHEMA_PATH, verification: "verified", verification_note: "Read in full at SPEC-authoring time; invariants transcribed from `superRefine` with messages quoted verbatim." } },
  { id: "spec:ref:bcp-14", type: "spec:Reference", fields: { kind: "rfc", citation: "Bradner, S., \"Key words for use in RFCs to Indicate Requirement Levels\", BCP 14, RFC 2119, March 1997. Leiba, B., \"Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words\", BCP 14, RFC 8174, May 2017.", locator: "https://datatracker.ietf.org/doc/bcp14/", verification: "verified", verification_note: "Keyword interpretation rules used throughout follow them." } },
  { id: "spec:ref:rfc-4122", type: "spec:Reference", fields: { kind: "rfc", citation: "Leach, P., Mealling, M., Salz, R., \"A Universally Unique IDentifier (UUID) URN Namespace\", RFC 4122, July 2005 (obsoleted by RFC 9562, May 2024, which preserves the wire format).", locator: "https://www.rfc-editor.org/rfc/rfc4122", verification: "verified", verification_note: "`Uuid` is `z.string().uuid()`; the format is the RFC 4122 textual representation." } },
  { id: "spec:ref:bcp-47", type: "spec:Reference", fields: { kind: "rfc", citation: "Phillips, A., Davis, M., \"Tags for Identifying Languages\", BCP 47, RFC 5646, September 2009.", locator: "https://www.rfc-editor.org/rfc/rfc5646", verification: "verified", verification_note: "`language` accepts the subset `^[a-z]{2,3}(-[A-Z]{2})?$` (language, optional region), not the full BCP 47 grammar." } },
  { id: "spec:ref:iso-8601", type: "spec:Reference", fields: { kind: "iso_standard", citation: "ISO 8601-1:2019, Date and time — Representations for information interchange — Part 1: Basic rules.", locator: "https://www.iso.org/standard/70907.html", verification: "verified", verification_note: "`ISODateTime` requires an offset; `ISODate` accepts year, year-month or full date." } },
  { id: "spec:ref:zod", type: "spec:Reference", fields: { kind: "url", citation: "Zod — TypeScript-first schema validation with static type inference, v4 documentation.", locator: "https://zod.dev/", verification: "verified", verification_note: "The reference implementation uses Zod 4.4.x (`z.discriminatedUnion`, `z.lazy`, `superRefine`)." } },
  { id: "spec:ref:bibtex-keys", type: "spec:Reference", fields: { kind: "book", citation: "Patashnik, O., \"BibTeXing\", 1988 (documentation distributed with BibTeX).", locator: "https://ctan.org/pkg/bibtex", verification: "verified", verification_note: "`citation_key` is constrained to `^[A-Za-z0-9][A-Za-z0-9:_-]*$`, a conservative BibTeX-safe subset." } },
  { id: "spec:ref:spec-core", type: "spec:Reference", fields: { kind: "spec", citation: "SPEC-CORE 1.2 — FDPM Core: contracts, models, services and policies, including §5.6 SPEC-DNIS adoption.", locator: "docs/specs/SPEC-CORE.md", verification: "verified", verification_note: "The FDPM realisation stores the section tree as dnis:Node primitives per §5.6." } },
  { id: "spec:ref:spec-dnis", type: "spec:Reference", fields: { kind: "spec", citation: "SPEC-DNIS 0.1.7 — Document Node Identity Specification.", locator: "docs/specs/SPEC-DNIS.md", verification: "verified", verification_note: "Identity-stable, position-ordered nodes are the contract the plan's section tree needs." } },
  { id: "spec:ref:spec-fdpm-bridge-zod", type: "spec:Reference", fields: { kind: "spec", citation: "SPEC-FDPM-BRIDGE-ZOD — The Zod v4 realisation of the general bridge contract.", locator: "docs/specs/SPEC-FDPM-BRIDGE-ZOD.md", verification: "verified", verification_note: "The document_plan plugin is generated by @fdpm/zod-bridge under this contract; declared losses follow its §8 vocabulary." } },
  { id: "spec:ref:plugin-readme", type: "spec:Reference", fields: { kind: "repo_file", citation: "fdpm.document-plan / fdpm.document-plan-dnis — plugin README (process, declared losses, coherence judge).", locator: "fdpm-cli/plugins/document_plan/README.md", verification: "verified", verification_note: "Describes the realisation summarised in §11." } },
  { id: "spec:ref:schema-design-rules", type: "spec:Reference", fields: { kind: "spec", citation: "\"Rules for Great Schema Design\" v2.0.0 — the rule set the schema's scorecard comment grades itself against (Rules 4, 15, 17, 26 are cited inline in the source).", verification: "cannot_verify", verification_note: "No locator is given in the schema source and the document was not available at SPEC-authoring time; rule numbers are reproduced as cited, not checked." } },
  { id: "spec:ref:claude-md", type: "spec:Reference", fields: { kind: "repo_file", citation: "CLAUDE.md — project guidelines (LLM output verification as an architectural requirement).", locator: "CLAUDE.md", verification: "verified", verification_note: "Binding on this document." } },
  { id: "spec:ref:purpose-md", type: "spec:Reference", fields: { kind: "repo_file", citation: "PURPOSE.md — why the repository exists.", locator: "PURPOSE.md", verification: "verified", verification_note: "Binding on this document." } },
];

// ── Appendix B — Revision history ──────────────────────────────────────────

const revisions: PrimitiveSpec[] = [
  { id: "spec:rev:3-1-0", type: "spec:Revision", fields: { version: "3.1.0", date: "2026-08-28", kind: "minor", title: "First SPEC edition, aligned with DocumentPlan schema v3.1.0.", affected_sections: ["all"], notes: [
    "Transcribes schemas/document-plan.ts into the spec-authoring vocabulary: 25 terms, 8 principles, 7 schema definitions, 47 invariants (one per superRefine rule and field-level refinement, messages quoted verbatim), 14 requirements, 8 acceptance criteria, 5 conformance items, 9 migration steps, 5 risks with mitigations, 6 open questions, 14 references.",
    "",
    "Schema lineage recorded in §11: 2.0.0 → 3.0.0 (breaking: work_type, node kinds, recursive children, evidence with locators) and 3.0.0 → 3.1.0 (additive; one new rejection: self-referential plan text). The schema's own MIGRATES_FROM is ['2.0.0', '3.0.0'].",
    "",
    "§12 records the FDPM realisation shipped alongside this edition (fdpm.document-plan 0.1.0 + fdpm.document-plan-dnis 0.1.0) and its declared losses.",
  ].join("\n") } },
];

// ── Sections (committed as dnis:Node in phase 2) ───────────────────────────

interface Sec { id: string; title: string; kind?: string; number_override?: string; body: string[] }

const requirementsTable = table(
  ["Id", "Requirement", "Statement", "Strength", "Verifiability", "Verifier"],
  requirements.map((r) => [`\`${r.id.replace("spec:req:", "")}\``, r.label, r.statement, r.strength, r.verifiability, `\`${r.verifier_ref}\``]),
);

const sections: Sec[] = [
  { id: "status", title: "Status of This Document", body: [
    "### 1.1 Abstract", "",
    "This specification defines **DocumentPlan 3.1.0**: a single planning contract for written works ranging from a one-sitting essay to a multi-part book manuscript. A plan declares what the manuscript must establish — its thesis, the claim each structural node must land, the evidence each claim rests on, the objections the prose must survive, the concepts it defines and the threads it carries — together with audience, style, word budgets, milestones, review gates and provenance.", "",
    "The scale difference between an essay and a book is structural, not cosmetic: a book nests parts inside a manuscript and chapters inside parts, carries front and back matter, tracks concepts introduced once and reused for three hundred pages, distributes a word budget across a tree, and is written by more than one person over months. Version 3.0.0 modelled those facts directly instead of forcing a book into a flat list of sections; version 3.1.0 makes the boundary between **plan text** (addressed to the author, never printed) and **manuscript text** (the few values that reach the page) explicit at every field, enumerates the manuscript fields, and rejects plan text written in the voice of the document.", "",
    "The normative source is the Zod schema at `" + SCHEMA_PATH + "`. Where this document and the schema disagree, the schema is authoritative and this document has a defect.", "",
    "### 1.2 Status", "",
    "This is a **draft**: the first SPEC edition of a schema that is already in use (v3.1.0, `MIGRATES_FROM ['2.0.0', '3.0.0']`). It is offered so that validators, renderers and drafting agents other than the reference implementation can be built against a stated contract. The canonical version is recorded in the §0 Document Status table.", "",
    "### 1.3 Relation to other FDPM specifications", "",
    "- **SPEC-CORE** and **SPEC-DNIS** define the host this schema is realised on: the plan's section tree is stored as identity-stable `dnis:Node` primitives (SPEC-CORE §5.6), so a node keeps its identity across moves, splits and merges. §12 describes the realisation.",
    "- **SPEC-FDPM-BRIDGE-ZOD** and **SPEC-DOMAIN-SIDECAR** define how the schema's registries become FDPM primitive types via `@fdpm/zod-bridge`; the constructs the bridge cannot carry are declared losses (§12.3).",
    "- This document does not define a manuscript format, a drafting procedure or a storage layout. It defines what a plan is and when it is invalid.",
  ] },
  { id: "conventions", title: "Conventions and Terminology", kind: "definitions", body: [
    "### 2.1 Requirement keywords", "",
    "The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [BCP 14] (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.", "",
    "### 2.2 Out of scope", "",
    "- The manuscript itself: its wording, format (`constraints.format` only names the target) and typesetting.",
    "- The drafting procedure by which a person or an agent turns a plan into prose.",
    "- Review *results*: `review.*` declares gates and who holds them; outcomes are recorded elsewhere.",
    "- Cross-plan resolution: `translation_of` and `series.previous_volume_id` are opaque identifiers (Appendix A, Q3).",
    "- Storage, transport and access control.", "",
    "### 2.3 Terms", "",
    "Terms are defined once here and used with these meanings throughout.",
  ] },
  { id: "principles", title: "Design Principles", kind: "principles", body: [
    "Eight principles explain every rule in §5–§7. A reader who holds them can predict what the validator rejects before reading the invariant tables.",
  ] },
  { id: "data-model", title: "Data Model", kind: "schema", body: [
    "### 4.1 Overview", "",
    "A plan is one root object with four regions of content:", "",
    "1. **Identity and framing** — `schema_version`, `id`, `work_type`, `title`, `subtitle`, `description`, `language`, `translation_of`, `series`, `audience`, `thesis`, `purpose`, `success_criteria`, `out_of_scope`.",
    "2. **Structure** — the ordered node tree: `structure.front_matter`, `structure.sections` (body), `structure.back_matter`, plus `max_depth`, `opening_strategy`, `closing_strategy`. *The nodes are the claims* (Principle 3).",
    "3. **Registries** — `content.sources`, `content.concepts`, `content.assets`, `content.examples`, `threads` (owned) and `people` (associated).",
    "4. **Process** — `style`, `constraints`, `milestones`, `review`, `dependencies`, `metadata`.", "",
    "### 4.2 Identifiers", "",
    "Two identifier kinds coexist by design (Principle 5). Structural nodes and milestones use a **human-authored slug** (`NodeId`: 1–64 characters, `^[a-z0-9][a-z0-9-]*$`, unique across all three regions) because authors cross-reference them by hand in `dependencies`, `milestones`, `concept.introduced_in` and `asset.node_id`. Registry entries and the plan itself use an **opaque RFC 4122 UUID** because tools create them and they are never modified. Every foreign key is documented at the field (`SourceIdRef`, `ConceptIdRef`, `ThreadIdRef`, `PersonIdRef`) and is checked for resolution in §6.", "",
    "### 4.3 Definitions", "",
    "The definitions below are excerpts of the Zod source. Every numeric bound, pattern, default and enumeration is reproduced exactly; long `.describe()` texts are omitted. The section tree is recursive (`SectionNodeSchema` extends `SectionNodeCore` with a lazy `children` array); depth is bounded by `work_type`, not by the type.",
  ] },
  { id: "structural-rules", title: "Structural Rules — Work Types and Node Kinds", body: [
    "### 5.1 Node identity", "",
    "A node slug MUST be unique across front matter, body and back matter (`node-id-unique`). `flattenStructure` assigns each node a reading-order index used by every ordering rule below.", "",
    "### 5.2 Depth and matter", "",
    "`WORK_TYPE_PROFILE[work_type]` fixes `max_depth` (2 for essays and articles, 3 for long-form features, reports and whitepapers, 4 for theses, books, edited volumes and series volumes), whether front and back matter are permitted (`allows_matter`: false for essay, article, long_form_feature), and the coarsest kind that may open the body (`top_level_min_rank`: 3 = section for essays/articles/features, 2 = chapter for reports/whitepapers, 1 = part for theses/books/volumes). `structure.max_depth` MAY tighten the limit and MUST NOT exceed it.", "",
    "### 5.3 Rank ordering", "",
    "`NODE_KIND_RANK` orders kinds: part 1 · chapter, front_matter_element, appendix, back_matter_element 2 · section 3 · subsection 4. A child MUST be of a finer kind (higher rank) than its parent, so a chapter can contain sections and a section cannot contain a part. Top-level front matter nodes MUST be `front_matter_element`; top-level back matter nodes MUST be `appendix` or `back_matter_element`.", "",
    "### 5.4 Leaves and grouping nodes", "",
    "A node without children is a leaf and MUST carry `content` (a claim). A node with children is a grouping node and MUST state either a claim or a `through_line` — nothing else explains why its children belong together.", "",
    "### 5.5 Invariants", "",
    ...invariantTable("structure"),
  ] },
  { id: "cross-reference-rules", title: "Cross-Reference, Ordering, Budget and Status Rules", body: [
    "Every rule in this section is enforced by the reference `superRefine`; messages are quoted verbatim so that independent validators can be checked for equivalence (R5).", "",
    "### 6.1 Evidence", "", ...invariantTable("evidence"), "",
    "### 6.2 Concepts", "",
    "A concept declares `introduced_in`, the node that defines it for the reader. A node may use a concept only at or after that node in reading order; concepts carried from an earlier volume (`series.carried_concept_ids`) are exempt from declaration but not from order.", "", ...invariantTable("concepts"), "",
    "### 6.3 – 6.5 Assets, examples, threads and people", "",
    "Registry entries are owned by the plan (assets, examples, threads) or associated with it (people). Every reference to them resolves; threads must run through at least two nodes.", "", ...invariantTable("registries"), "",
    "### 6.6 Dependencies", "",
    "`dependencies` declares that a node depends on others, with an optional reason. The graph MUST be a DAG. With `reason: 'logical_prerequisite'` every target MUST also precede the dependent node in reading order; the other reasons (`context`, `argument_buildup`, `evidence_introduction`) carry no ordering constraint.", "", ...invariantTable("dependencies"), "",
    "### 6.7 Word budgets", "",
    "`target_words` on a node includes all descendants. Budgets are checked only where they are declared: a parent's children are compared with it only when every child declares a budget, and the plan total (`totalTargetWords`: sum of top-level budgets, falling back to subtree sums) is compared with `constraints.min_words`/`max_words` only when it is positive. `word_budget_tolerance` (default 0.1) is the permitted fraction of overshoot in both comparisons.", "", ...invariantTable("budgets"), "",
    "### 6.8 Milestones", "", ...invariantTable("milestones"), "",
    "### 6.9 Identity", "", ...invariantTable("identity"), "",
    "### 6.10 Status gates", "",
    "`metadata.status` advances to `final` only when every leaf node is `final` and no asset carries `permission_denied`. The `review.*` booleans declare which additional gates a reviewer must satisfy; the schema does not check them (R12).", "", ...invariantTable("status"),
  ] },
  { id: "boundary", title: "The Planning / Manuscript Boundary", body: [
    "### 7.1 What reaches the page", "",
    "`MANUSCRIPT_TEXT_FIELDS` enumerates the only paths whose values may appear verbatim in the finished work: `title`, `subtitle`, `structure.*.title`, `structure.*.subtitle`, `content.concepts[].term`, `content.concepts[].aliases[]`, `content.assets[].caption`, `content.sources[]`. A renderer reads this list rather than deciding field by field; everything absent from it is plan text by default, which is what makes the default safe (R8).", "",
    "### 7.2 Assertions, not descriptions", "",
    "`thesis`, every `content.claim` and every `through_line` are `AssertionText`: bounded strings that MUST NOT open by naming the document or one of its parts. The reference pattern (`SELF_REFERENTIAL`, §4.3) covers English and Portuguese determiners and document nouns; the rejection message tells the author to write the assertion itself (\"Caching removes most database load\") instead of where it sits (\"This section argues that caching…\"). The four ClaimBlock fields (`claim`, `reasoning`, `evidence`, `counter_arguments`) specify a paragraph's target, not its text, and their order is an addressing order, not a drafting order: a node emitted field by field yields the plan wearing prose.", "", ...invariantTable("boundary"), "",
    "### 7.3 Patterns checked against the manuscript", "",
    "`style.prohibited_patterns` and `style.required_patterns` are the one place where the plan reaches wording — and they are checked against the **manuscript**, never against the plan (R11). `DEFAULT_PROHIBITED_PATTERNS` (20 English and Portuguese meta-narration constructions such as \"this document\", \"in what follows\", \"este capítulo\", \"vale notar\") is exported for authors to copy into `style.prohibited_patterns` and is applied to no plan automatically.",
  ] },
  { id: "requirements", title: "Requirements for Producers, Validators, Renderers and Agents", body: [
    "Requirements are numbered R1–R14. Each names how it is verified and where.", "", ...requirementsTable,
  ] },
  { id: "conformance", title: "Conformance", kind: "conformance", body: [
    "Five conformance targets. A component claims conformance to one or more of them by running the stated procedure and observing the expected result. Acceptance criteria (§10) provide the executable evidence behind the targets that the reference implementation already meets.",
  ] },
  { id: "acceptance", title: "Acceptance Criteria", kind: "acceptance_criteria", body: [
    "Status legend: `met` — evidence checked in and passing at SPEC-authoring time; `open` — the schema enforces the criterion but no dedicated test exists yet. AC-1, AC-2 and AC-8 are met by the checked-in FDPM realisation and its tests; AC-3 to AC-7 await a dedicated conformance corpus.",
  ] },
  { id: "migration", title: "Migration and Versioning", kind: "migration", body: [
    "### 11.1 Version line", "",
    "`SCHEMA_VERSION` is `'3.1.0'`; `MIGRATES_FROM` is `['2.0.0', '3.0.0']`. A change that adds a field, an enumeration value or a rule that only rejects previously-invalid input ships as a **minor** version. A change that removes or renames a field, or that rejects previously-valid input, is **breaking** and requires a **major** version — with one recorded exception: 3.1.0 adds the self-referential-voice rejection as a minor version because the rejected text is, by the schema's own definition, a defect in the plan (step 8).", "",
    "### 11.2 Deprecations in force", "",
    ...table(["Deprecated", "Since", "Replacement", "Read when", "Sunset"], [
      ["`SectionCore.word_count`", "3.0.0", "`target_words`", "`target_words` is absent; conflicting values rejected", "4.0.0"],
      ["`ClaimBlock.evidence_source_ids`", "3.0.0", "`evidence` (adds locators)", "`evidence` is absent; supplying both rejected", "4.0.0"],
      ["`constraints.reviewers`", "3.0.0", "`people` + `review.assignments`", "always readable; no fallback semantics", "4.0.0"],
      ["`review_requirements`", "3.0.0", "`review`", "always readable; `review` adds gates and assignments", "4.0.0"],
    ]), "",
    "### 11.3 Steps", "",
    "Steps 1–6 migrate 2.0.0 → 3.0.0; steps 7–8 migrate 3.0.0 → 3.1.0; step 9 lists what 4.0.0 removes.",
  ] },
  { id: "fdpm-realisation", title: "Realisation in FDPM", body: [
    "### 12.1 Two plugins", "",
    "- **`fdpm.document-plan`** (`profile:document-plan:3.1`) is generated from the schema by `@fdpm/zod-bridge` through a hand-authored sidecar: the plan **header** (`docplan:DocumentPlan`, the root minus its tree and registries) and five registry entities (`docplan:ContentSource`, `docplan:Concept`, `docplan:Asset`, `docplan:Thread`, `docplan:Person`), each with a Zod validator and a field-table renderer. `run-bridge.ts --check` is the CI drift gate.",
    "- **`fdpm.document-plan-dnis`** (`profile:document-plan-dnis:3.1`) extends that profile and `profile:dnis:0.1`: every `SectionNode` becomes a `dnis:Node` (kind = node kind; content = the node's own fields plus `region` and `slug`; reading order = SPEC-DNIS position); nine `docplan:*` relation types connect nodes to registries (`NodeUsesConcept`, `NodeAdvancesThread`, `NodeCites` with `locator`/`supports`/`note`, `NodeOwnedBy`, `AssetPlacedIn`, `ConceptIntroducedIn`, `PlanHasDocument`, `AssetReproducedFrom`, `PlanTranslationOf`); `docplan:PlanOutlineRenderer` renders the plan for review (R9).", "",
    "### 12.2 Ingestion", "",
    "`buildDocumentPlanWorkbook` runs the full `DocumentPlanSchema.safeParse` first and writes nothing on failure (R14); then commits header and registries, then the tree through the DNIS host adapter, then the relations. Every write still passes the host's §7 pipeline.", "",
    "### 12.3 Declared losses", "",
    ...table(["Construct", "Stored as", "Enforced by"], [
      ["`structure.*` recursive tree", "`dnis:Node` primitives", "ingest (`build.ts`) + DNIS adapter invariants"],
      ["§5–§6 cross-reference, ordering, budget, DAG and status rules", "—", "`DocumentPlanSchema.safeParse` at ingest; the host relation pipeline for endpoint existence afterwards"],
      ["`AssertionText` self-referential refinement", "—", "per-entity Zod validator for header fields; ingest `safeParse` for node content"],
      ["`SourceIdentifier` discriminated union", "flat `{kind, value}` struct", "per-kind formats at ingest only"],
    ]), "",
    "### 12.4 A judge the schema cannot express", "",
    "The composition plugin adds one warning-level validator, `docplan:coherence.comparative-claim-without-baseline`: a claim carrying a comparative marker (pt-BR and English list) must have a `context` or `logical_prerequisite` dependency on a node that precedes it in reading order. It runs on every node write, in `fdpm validate` and at ingest; it makes the omission visible without judging the argument (AC-8; Appendix A, Q5).",
  ] },
  { id: "security-privacy", title: "Security and Privacy Considerations", kind: "risks", body: [
    "A plan is not a secret document by design, but it carries three kinds of sensitive content: personal names (`people[].name`, PII-low, stored once and referenced by id so removal is one operation), quoted source material (`ContentSource.excerpt`, up to 1,000 characters, subject to the source licence) and free text that a schema cannot police. The risks below and their mitigations are the current posture; none is a substitute for access control, which is out of scope.",
  ] },
  { id: "references", title: "References", kind: "references", body: [
    "Each reference carries its verification posture. `cannot_verify` entries are reproduced as cited in the schema source and MUST NOT be relied on beyond that.",
  ] },
  { id: "appendix-a", title: "Open Questions", kind: "open_questions", number_override: "A", body: [
    "Every question carries a default so that the absence of a decision never blocks an implementation.",
  ] },
  { id: "appendix-b", title: "Revision History", kind: "revision_history", number_override: "B", body: [] },
];

// ── Relations ──────────────────────────────────────────────────────────────

function rel(id: string, type: string, from: string, to: string): RelationSpec {
  return { id, type, from, to };
}

const relations: RelationSpec[] = [
  ...termSpecs.map((t, i) => rel(`rel:doc-defines-${i + 1}`, "spec:Defines", documentSpec.id, t.id)),
  ...references.map((r) => rel(`rel:doc-cites-${r.id.replace("spec:ref:", "")}`, "spec:Cites", documentSpec.id, r.id)),
  rel("rel:doc-req-claude", "spec:RequiredRead", documentSpec.id, "spec:ref:claude-md"),
  rel("rel:doc-req-purpose", "spec:RequiredRead", documentSpec.id, "spec:ref:purpose-md"),
  rel("rel:doc-req-spec-core", "spec:RequiredRead", documentSpec.id, "spec:ref:spec-core"),
  rel("rel:doc-req-spec-dnis", "spec:RequiredRead", documentSpec.id, "spec:ref:spec-dnis"),
  rel("rel:doc-revised-3-1-0", "spec:RevisedIn", documentSpec.id, "spec:rev:3-1-0"),
  // Mitigations cover risks (pairwise, same order)
  ...risks.map((r, i) => rel(`rel:mit-${i + 1}`, "spec:Mitigates", mitigations[i]!.id, r.id)),
  // Invariants constrain schema definitions
  ...invariants.filter((i) => i.constrains).map((i) => rel(`rel:constrains-${i.id.replace("spec:inv:", "")}`, "spec:Constrains", i.id, i.constrains!)),
  // Acceptance criteria verify requirements / invariants
  rel("rel:ac1-verifies-r1", "spec:Verifies", "spec:ac:valid-plan-round-trips", "spec:req:producer-valid-plan"),
  rel("rel:ac1-verifies-r14", "spec:Verifies", "spec:ac:valid-plan-round-trips", "spec:req:fdpm-ingest-full-schema"),
  rel("rel:ac2-verifies-leaf", "spec:Verifies", "spec:ac:leaf-without-claim-rejected", "spec:inv:leaf-has-content"),
  rel("rel:ac2-verifies-r14", "spec:Verifies", "spec:ac:leaf-without-claim-rejected", "spec:req:fdpm-ingest-full-schema"),
  rel("rel:ac3-verifies-voice", "spec:Verifies", "spec:ac:self-referential-rejected", "spec:inv:assertion-not-self-referential"),
  rel("rel:ac4-verifies-concept-order", "spec:Verifies", "spec:ac:concept-order-enforced", "spec:inv:concept-introduced-before-use"),
  rel("rel:ac5-verifies-budget", "spec:Verifies", "spec:ac:budget-tolerance-enforced", "spec:inv:child-budgets-within-tolerance"),
  rel("rel:ac6-verifies-r7", "spec:Verifies", "spec:ac:deprecated-fallback", "spec:req:validator-deprecated-fallback"),
  rel("rel:ac6-verifies-evidence-forms", "spec:Verifies", "spec:ac:deprecated-fallback", "spec:inv:evidence-not-both-forms"),
  rel("rel:ac7-verifies-r8", "spec:Verifies", "spec:ac:renderer-prints-manuscript-fields-only", "spec:req:renderer-manuscript-fields-only"),
  rel("rel:ac8-verifies-r13", "spec:Verifies", "spec:ac:comparative-claim-baseline-warned", "spec:req:fdpm-realisation-declares-losses"),
  // Conformance items verify requirements
  rel("rel:conf1-verifies-r1", "spec:Verifies", "spec:conf:producer", "spec:req:producer-valid-plan"),
  rel("rel:conf2-verifies-r5", "spec:Verifies", "spec:conf:validator", "spec:req:validator-all-rules"),
  rel("rel:conf3-verifies-r8", "spec:Verifies", "spec:conf:manuscript-renderer", "spec:req:renderer-manuscript-fields-only"),
  rel("rel:conf4-verifies-r9", "spec:Verifies", "spec:conf:plan-outline-renderer", "spec:req:renderer-plan-outline-labelled"),
  rel("rel:conf5-verifies-r13", "spec:Verifies", "spec:conf:fdpm-realisation", "spec:req:fdpm-realisation-declares-losses"),
  // Migration step ordering
  ...migrationSteps.flatMap((m) => ((m.fields as { depends_on?: string[] }).depends_on ?? []).map((d) => rel(`rel:${m.id.replace("spec:", "")}-after-${d.replace("spec:", "")}`, "spec:DependsOn", m.id, d))),
];

// ── Commit ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const host = await openHost();

  const result = await defineProject(host, {
    id: PROJECT_ID,
    name: "SPEC — DocumentPlan 3.1.0",
    profile: PROFILE_ID,
    description:
      "Normative specification of the DocumentPlan 3.1.0 schema (fdpm-cli/plugins/document_plan/schemas/document-plan.ts) as a typed graph on the fdpm.spec-authoring-dnis composition profile. Section tree committed as dnis:Document + dnis:Node primitives.",
  })
    .primitives([
      documentSpec,
      ...termSpecs,
      ...principleSpecs,
      ...stakeholders,
      ...qualityAttributes,
      ...schemaDefs,
      ...invariantSpecs,
      ...requirementSpecs,
      ...acceptances,
      ...conformance,
      ...migrationSteps,
      ...risks,
      ...mitigations,
      ...openQuestions,
      ...references,
      ...revisions,
    ])
    .relations(relations)
    .commit();

  console.log("Phase 1 — typed primitives committed:");
  console.log("  primitives:", result.primitives_created);
  console.log("  relations: ", result.relations_created);

  const adapter = new DnisHostAdapter(host, { workbookId: PROJECT_ID });
  const dnisDoc = await adapter.createDocument({
    createdBy: BUILD_AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });

  let opCounter = 0;
  for (const sec of sections) {
    opCounter += 1;
    const siblings = adapter.listActiveNodes(dnisDoc.id, null);
    const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
    const position = positionBetween(last?.position ?? null, null);
    await adapter.apply({
      id: mintUid() as OperationId,
      type: "create",
      documentId: dnisDoc.id,
      agentId: BUILD_AGENT,
      issuedAt: new Date(Date.UTC(2026, 7, 28, 12, 0, opCounter)).toISOString(),
      payload: {
        kind: "section",
        content: {
          title: sec.title,
          body_md: sec.body.join("\n"),
          ref_slug: sec.id,
          ...(sec.kind ? { dispatch_kind: sec.kind } : {}),
          ...(sec.number_override ? { number_override: sec.number_override } : {}),
        },
        parentNodeId: null,
        position,
      },
    });
  }

  console.log("Phase 2 — dnis:Node section tree built:");
  console.log("  dnis:Document:", dnisDoc.id);
  console.log("  sections     :", opCounter);
  console.log("  revision     :", host.getProject(PROJECT_ID).workbook.revision);
  console.log("");
  console.log("Render with:");
  console.log(`  FDPM_DATA_DIR=${process.env["FDPM_DATA_DIR"] ?? "~/.fdpm-cli"} npx tsx fdpm-cli/src/bin/fdpm.ts \\`);
  console.log("    render spec-document-plan text/markdown --renderer-id spec:SpecMarkdownRenderer \\");
  console.log("    -o docs/specs/SPEC-DOCUMENT-PLAN.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
