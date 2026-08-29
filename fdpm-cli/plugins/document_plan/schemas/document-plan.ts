/**
 * DocumentPlan schema v3.1.0 — plugin copy (fdpm.document-plan).
 *
 * Source: _ingest_bin/document-plan.schema.ts, ingested 2026-08-28. The
 * planning semantics are unchanged. The only edits relative to the source:
 *   (a) `export` on the entity sub-schemas (ContentSource, Concept, Asset,
 *       Thread, Person, ClaimBlock, EvidenceRef, SectionNodeCore,
 *       SourceIdentifier) and on the pre-refinement root object
 *       `DocumentPlanObject`, so sidecar.ts can hand them to @fdpm/zod-bridge;
 *   (b) the recursive SectionNode annotation uses Zod v4's two-parameter
 *       `z.ZodType<Output, Input>`;
 *   (c) the `Schemas` bundle appended at the end of the file.
 *
 * Everything under generated/ is derived from this file by
 * scripts/run-bridge.ts; `npm run bridge -- --check` fails when they drift.
 */
import { z } from 'zod';

/**
 * DocumentPlan — a single planning contract for written works ranging from a
 * one-sitting essay to a multi-part book manuscript.
 *
 * The scale difference between an essay and a book is structural, not
 * cosmetic: a book nests parts inside a manuscript and chapters inside parts,
 * carries front and back matter, tracks concepts introduced once and reused
 * for three hundred pages, distributes a word budget across a tree, and is
 * written by more than one person over months. Version 3.0.0 modeled those
 * facts directly instead of forcing a book into a flat list of sections.
 *
 * A DocumentPlan specifies what the manuscript must establish. It never
 * supplies wording for the manuscript. Every free-text field here is addressed
 * to the author and read before drafting; the reader of the finished work sees
 * none of it. A claim states what a node must land, not a sentence to print. A
 * through_line states what holds a node together, not an opening paragraph. A
 * narrative_function names a role the prose performs, not a role the prose
 * announces. Version 3.1.0 makes that boundary explicit at every field that
 * could be mistaken for copy, names the four fields whose values do reach the
 * page, and rejects plan text written in the voice of the document.
 */
export const SCHEMA_VERSION = '3.1.0' as const;

/** Versions this schema knows how to migrate from. See MIGRATION at the end. */
export const MIGRATES_FROM = ['2.0.0', '3.0.0'] as const;

// ---------------------------------------------------------------------------
// Shared primitives (Rules 15/17: defined once, referenced everywhere)
// ---------------------------------------------------------------------------

const ISODateTime = z
  .string()
  .datetime({ offset: true })
  .describe('ISO 8601 instant, UTC-normalized, second precision (e.g. 2026-08-27T14:30:00Z)');

const ISODate = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'ISO 8601 calendar date: YYYY, YYYY-MM, or YYYY-MM-DD')
  .describe('Publication date at year, month, or day precision. No time, no timezone.');

export const Uuid = z.string().uuid();

export const NodeId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase slug: letters, digits, hyphens')
  .describe(
    'Human-authored slug, unique across the entire plan: front matter, body tree at every depth, and back matter.'
  );

/** Retained alias: v2 called every structural node a section. */
export const SectionId = NodeId;

const SourceIdRef = Uuid.describe('FK → content.sources[].id');
const ConceptIdRef = Uuid.describe('FK → content.concepts[].id');
const ThreadIdRef = Uuid.describe('FK → threads[].id');
const PersonIdRef = Uuid.describe('FK → people[].id');

export const AuthorityLevel = z.enum(['primary', 'secondary', 'tertiary']);

// ---------------------------------------------------------------------------
// Plan text and manuscript text (Rule 17: the boundary is stated once here and
// referenced by every field that sits on one side of it)
// ---------------------------------------------------------------------------

const PLANNING_CLAUSE =
  'Planning field: it constrains what the prose must achieve and supplies no wording for it. Never rendered.';

/**
 * Marks a field as instruction to the author rather than copy for the reader.
 * A renderer that emits the value of a field carrying this clause has printed
 * the plan instead of the work.
 */
const planning = (description: string): string => `${description} ${PLANNING_CLAUSE}`;

/**
 * The only paths whose values may appear verbatim in the finished work. A
 * renderer reads this list rather than deciding field by field; everything
 * absent from it is planning text by default, which is what makes the default
 * safe.
 */
export const MANUSCRIPT_TEXT_FIELDS = [
  'title',
  'subtitle',
  'structure.*.title',
  'structure.*.subtitle',
  'content.concepts[].term',
  'content.concepts[].aliases[]',
  'content.assets[].caption',
  'content.sources[]',
] as const;

/**
 * Plan text that talks about the document instead of asserting its content.
 * A claim reading "This chapter argues that X" is a description of the
 * chapter; drafted straight, it produces a paragraph that announces its own
 * function before performing it. The pattern is rejected at the plan stage
 * because that is the last point where correcting it costs one line.
 */
const SELF_REFERENTIAL =
  /^\s*(this|the following|the present|o|a|este|esta|o presente|a presente)\s+(document|documento|work|obra|book|livro|part|parte|chapter|cap[ií]tulo|section|se[cç][ãa]o|subsection|subse[cç][ãa]o|node|essay|ensaio|article|artigo|paper|report|relat[óo]rio|piece|text|texto|passage|passagem)\b/i;

const SELF_REFERENTIAL_MESSAGE =
  'Plan text describes the document instead of asserting its content. Write the assertion itself ("Caching removes most database load"), not a description of where it sits ("This section argues that caching…").';

/**
 * Constructions through which a plan surfaces in the draft it produced. They
 * narrate the act of writing rather than assert anything, so a manuscript
 * containing them has printed part of its own scaffolding. Copy this list into
 * `style.prohibited_patterns` on any plan whose draft is machine-checked; it is
 * not applied as a default, because the field is checked against manuscript
 * text and this schema validates plans.
 */
export const DEFAULT_PROHIBITED_PATTERNS = [
  'this document',
  'this section',
  'this chapter',
  'this essay',
  'this report',
  'in what follows',
  'as mentioned earlier',
  'as noted above',
  'we will examine',
  'we will discuss',
  'the purpose of this',
  'it is important to note',
  'it is worth noting',
  'este documento',
  'esta seção',
  'este capítulo',
  'a seguir',
  'como mencionado',
  'vale notar',
  'é importante notar',
] as const;

/** A single assertion, stated in the third person of its subject. */
const AssertionText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !SELF_REFERENTIAL.test(value), { message: SELF_REFERENTIAL_MESSAGE });

/**
 * One status vocabulary for the whole plan. A node and the document it belongs
 * to move through the same states, so progress rolls up without translation.
 */
export const WorkStatus = z.enum(['draft', 'outline_complete', 'research', 'writing', 'review', 'final']);

/**
 * What is being planned. The work type sets structural defaults — nesting
 * depth, whether front and back matter are permitted, which node kinds may sit
 * at the top of the body — that the validator enforces mechanically.
 */
export const WorkType = z.enum([
  'essay',
  'article',
  'long_form_feature',
  'report',
  'whitepaper',
  'thesis',
  'book',
  'edited_volume',
  'series_volume',
]);

export const WORK_TYPE_PROFILE = {
  essay: { max_depth: 2, allows_matter: false, top_level_min_rank: 3 },
  article: { max_depth: 2, allows_matter: false, top_level_min_rank: 3 },
  long_form_feature: { max_depth: 3, allows_matter: false, top_level_min_rank: 3 },
  report: { max_depth: 3, allows_matter: true, top_level_min_rank: 2 },
  whitepaper: { max_depth: 3, allows_matter: true, top_level_min_rank: 2 },
  thesis: { max_depth: 4, allows_matter: true, top_level_min_rank: 1 },
  book: { max_depth: 4, allows_matter: true, top_level_min_rank: 1 },
  edited_volume: { max_depth: 4, allows_matter: true, top_level_min_rank: 1 },
  series_volume: { max_depth: 4, allows_matter: true, top_level_min_rank: 1 },
} as const satisfies Record<
  z.infer<typeof WorkType>,
  { max_depth: number; allows_matter: boolean; top_level_min_rank: number }
>;

/**
 * Structural role of a node. Rank orders the hierarchy: a child's rank must
 * exceed its parent's, so a chapter can contain sections and a section cannot
 * contain a part.
 */
export const NodeKind = z.enum([
  'part',
  'chapter',
  'section',
  'subsection',
  'front_matter_element',
  'appendix',
  'back_matter_element',
]);

export const NODE_KIND_RANK = {
  part: 1,
  chapter: 2,
  front_matter_element: 2,
  appendix: 2,
  back_matter_element: 2,
  section: 3,
  subsection: 4,
} as const satisfies Record<z.infer<typeof NodeKind>, number>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * A single citation: which source, and where inside it. Page-level locators
 * are the difference between a citable book manuscript and a list of further
 * reading, so the locator lives on the citation rather than on the source.
 */
export const EvidenceRef = z.object({
  source_id: SourceIdRef,
  locator: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('Position inside the source: "pp. 44–47", "§3.2", "00:14:20", "fig. 6".'),
  supports: z
    .enum(['asserts', 'illustrates', 'qualifies', 'contradicts'])
    .default('asserts')
    .describe('Relation of the cited passage to the claim. A contradicting source is cited on purpose.'),
  note: z.string().max(500).optional().describe('Why this passage carries the claim.'),
});

/**
 * A claim paired with its reasoning and its evidence. Every structural node
 * that asserts something uses this one shape, so a claim is modeled once and
 * its evidence always resolves to a declared source.
 *
 * The four fields specify a paragraph's target, not its text. Their order is
 * an addressing order and not a drafting order: a node emitted field by field
 * yields "This section argues X. The reason is Y. Some might object that Z",
 * which is the plan wearing prose. The draft asserts X, carries Y inside the
 * assertion, cites the evidence where the assertion needs support, and answers
 * the objection without naming it as an objection.
 */
export const ClaimBlock = z.object({
  claim: AssertionText(500).describe(
    planning(
      'The single assertion this node must land, written as the assertion itself so the gap between plan and draft stays visible.'
    )
  ),
  reasoning: z
    .string()
    .min(1)
    .max(2000)
    .nullable()
    .optional()
    .describe(
      planning(
        'Why the claim holds. Absent: not yet drafted. Null: asserted without reasoning by design. The draft carries this reasoning; it does not report having reasoning.'
      )
    ),
  evidence: z
    .array(EvidenceRef)
    .max(200)
    .optional()
    .describe(
      'Unordered citations backing the claim. Absent or empty: the claim is asserted without cited evidence — intentional, not an oversight. Only `locator` and the referenced source reach the page, formatted by style.citation_style.'
    ),
  evidence_source_ids: z
    .array(SourceIdRef)
    .max(200)
    .optional()
    .describe(
      'DEPRECATED since 3.0.0, sunset 4.0.0 — use `evidence`, which adds locators. Read only when `evidence` is absent; supplying both is a validation error.'
    ),
  counter_arguments: z
    .array(z.string().min(1).max(500))
    .max(20)
    .optional()
    .describe(
      planning(
        'Objections the drafted prose must survive. Answering an objection is required; announcing that the work anticipates objections is not.'
      )
    ),
});

export type ClaimBlock = z.infer<typeof ClaimBlock>;

/** Citations actually in force for a claim, after the v2 fallback resolves. */
export function effectiveEvidence(block: ClaimBlock): z.infer<typeof EvidenceRef>[] {
  if (block.evidence) return block.evidence;
  return (block.evidence_source_ids ?? []).map((source_id) => ({ source_id, supports: 'asserts' as const }));
}

// ---------------------------------------------------------------------------
// Structural nodes — one recursive shape for parts, chapters, sections,
// subsections, and matter elements (Rule 17).
// ---------------------------------------------------------------------------

export const SectionNodeCore = z.object({
  id: NodeId,
  kind: NodeKind.describe('Structural role. Constrains what this node may contain and where it may sit.'),
  title: z.string().min(1).max(200).describe('Manuscript text: printed as the heading of this node.'),
  subtitle: z.string().min(1).max(300).optional().describe('Manuscript text: printed beneath the heading.'),

  content: ClaimBlock.optional().describe(
    'The assertion this node makes. Required on leaf nodes; optional on nodes that only group children.'
  ),
  through_line: AssertionText(500)
    .optional()
    .describe(
      planning(
        'What holds this node together across its children. Required on a grouping node that carries no claim of its own. It governs the sequence of the children; it is not an introductory paragraph announcing that sequence.'
      )
    ),
  narrative_function: z
    .enum(['setup', 'development', 'turn', 'complication', 'payoff', 'synthesis', 'reference'])
    .optional()
    .describe(
      planning(
        'Role in the arc of the whole work, meaningful at book length and ignorable at essay length. The prose performs the role: a node marked `turn` turns, and never states that a turn is occurring.'
      )
    ),

  target_words: z
    .number()
    .int()
    .positive()
    .max(500_000)
    .optional()
    .describe(
      'Budget for this node in words, counted as whitespace-delimited tokens in `language`, inclusive of all descendants.'
    ),
  word_count: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('DEPRECATED since 3.0.0, sunset 4.0.0 — renamed to `target_words`. Read only when `target_words` is absent.'),

  status: WorkStatus.default('draft').describe('Progress of this node, independent of its siblings.'),
  owner_id: PersonIdRef.optional().describe('Person responsible for drafting this node.'),

  concept_ids: z
    .array(ConceptIdRef)
    .max(100)
    .optional()
    .describe('Concepts this node relies on. Each must be introduced at or before this node in reading order.'),
  thread_ids: z
    .array(ThreadIdRef)
    .max(20)
    .optional()
    .describe('Through-lines this node advances.'),

  notes: z
    .string()
    .max(2000)
    .optional()
    .describe(planning('Working notes for the author, outside the argument: open questions, drafting decisions, reminders.')),
});

export type SectionNode = z.infer<typeof SectionNodeCore> & { children?: SectionNode[] };
type SectionNodeInput = z.input<typeof SectionNodeCore> & { children?: SectionNodeInput[] };

/**
 * Composition: children have no identity outside their parent and are deleted
 * with it. Ordered — array position is reading order. The tree may nest to the
 * depth allowed by `work_type`; cycles are impossible by construction.
 */
export const SectionNodeSchema: z.ZodType<SectionNode, SectionNodeInput> =
  SectionNodeCore.extend({
    children: z
      .lazy(() => z.array(SectionNodeSchema).max(200))
      .optional()
      .describe('Ordered child nodes. Composition: deleting this node deletes them.'),
  });

/** Budget in force for a node, after the v2 fallback resolves. */
export function effectiveTargetWords(node: SectionNode): number | undefined {
  return node.target_words ?? node.word_count;
}

export type Region = 'front_matter' | 'body' | 'back_matter';

export interface FlatNode {
  node: SectionNode;
  parent: SectionNode | null;
  region: Region;
  depth: number;
  /** Position in depth-first reading order across the whole plan. */
  order: number;
  path: (string | number)[];
}

interface PlanStructure {
  front_matter?: SectionNode[];
  sections: SectionNode[];
  back_matter?: SectionNode[];
}

/**
 * Depth-first traversal of the whole plan in reading order: front matter,
 * body, back matter. Derived, never stored.
 */
export function flattenStructure(structure: PlanStructure): FlatNode[] {
  const flat: FlatNode[] = [];
  let order = 0;

  const walk = (
    nodes: SectionNode[],
    parent: SectionNode | null,
    region: Region,
    depth: number,
    path: (string | number)[]
  ) => {
    nodes.forEach((node, i) => {
      flat.push({ node, parent, region, depth, order: order++, path: [...path, i] });
      if (node.children?.length) walk(node.children, node, region, depth + 1, [...path, i, 'children']);
    });
  };

  walk(structure.front_matter ?? [], null, 'front_matter', 1, ['structure', 'front_matter']);
  walk(structure.sections, null, 'body', 1, ['structure', 'sections']);
  walk(structure.back_matter ?? [], null, 'back_matter', 1, ['structure', 'back_matter']);
  return flat;
}

/** Sum of top-level budgets, since a parent budget includes its descendants. */
export function totalTargetWords(structure: PlanStructure): number {
  const roots = [...(structure.front_matter ?? []), ...structure.sections, ...(structure.back_matter ?? [])];
  return roots.reduce((sum, node) => sum + (effectiveTargetWords(node) ?? subtreeWords(node)), 0);
}

function subtreeWords(node: SectionNode): number {
  const own = effectiveTargetWords(node);
  if (own !== undefined) return own;
  return (node.children ?? []).reduce((sum, child) => sum + subtreeWords(child), 0);
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** Where a source lives, discriminated so a consumer never probes for shape. */
export const SourceIdentifier = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('doi'), value: z.string().regex(/^10\.\d{4,9}\/\S+$/, 'DOI, e.g. 10.1000/xyz123') }),
  z.object({
    kind: z.literal('isbn'),
    value: z.string().regex(/^(97[89])?\d{9}[\dX]$/, 'ISBN-10 or ISBN-13, digits only, no hyphens'),
  }),
  z.object({ kind: z.literal('issn'), value: z.string().regex(/^\d{4}-\d{3}[\dX]$/, 'ISSN, e.g. 0028-0836') }),
  z.object({ kind: z.literal('arxiv'), value: z.string().min(1).max(64).describe('arXiv identifier, e.g. 2301.04567') }),
  z.object({ kind: z.literal('url'), value: z.string().url() }),
  z.object({
    kind: z.literal('archive'),
    value: z.string().min(1).max(300).describe('Archival locator: repository, fonds, box, folder'),
  }),
  z.object({ kind: z.literal('internal'), value: z.string().min(1).max(200).describe('Identifier in a private system') }),
]);

export const ContentSource = z.object({
  id: Uuid.describe('Opaque, stable. Set at creation, never modified.'),
  citation_key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, 'BibTeX-safe key')
    .optional()
    .describe('Key used in the manuscript text. Unique across content.sources when present.'),
  title: z.string().min(1).max(300),
  authors: z
    .array(z.string().min(1).max(200))
    .max(50)
    .optional()
    .describe('Ordered as printed on the source. Published names: public information, not restricted PII.'),
  publication_date: ISODate.optional(),
  publisher: z.string().min(1).max(200).optional(),
  identifier: SourceIdentifier.optional(),
  url: z.string().url().optional().describe('Retrieval URL when it differs from `identifier`.'),
  authority_level: AuthorityLevel.optional(),
  excerpt: z.string().max(1000).optional().describe('Quoted passage held for drafting. Respect the source licence.'),
  retrieved_at: ISODateTime.optional(),
});

/**
 * A term the work defines and then depends on. Books fail when a term is used
 * two hundred pages before it is defined, so the concept declares where it is
 * introduced and the validator checks every use against reading order.
 */
export const Concept = z.object({
  id: Uuid.describe('Opaque, stable.'),
  term: z.string().min(1).max(120),
  definition: z.string().min(1).max(1000),
  aliases: z.array(z.string().min(1).max(120)).max(20).optional(),
  introduced_in: NodeId.describe('FK → the node that defines this term for the reader.'),
});

/** Non-prose material that needs placement and rights clearance before print. */
export const Asset = z.object({
  id: Uuid.describe('Opaque, stable.'),
  kind: z.enum(['figure', 'table', 'chart', 'photograph', 'illustration', 'code_listing', 'epigraph']),
  caption: z.string().min(1).max(500),
  node_id: NodeId.describe('FK → the node this asset appears in.'),
  source_id: SourceIdRef.optional().describe('Origin, when the asset is reproduced rather than original.'),
  rights_status: z
    .enum(['original', 'public_domain', 'licensed', 'permission_pending', 'permission_denied'])
    .default('original')
    .describe('Clearance state. `permission_denied` blocks advancing document status to final.'),
});

/**
 * An argument or narrative line that runs across nodes. Navigable from node to
 * thread through `thread_ids`; a thread picked up by fewer than two nodes is
 * not a through-line and fails validation.
 */
export const Thread = z.object({
  id: Uuid.describe('Opaque, stable.'),
  name: z.string().min(1).max(200).describe(planning('Handle used to refer to the thread inside the plan.')),
  description: z
    .string()
    .min(1)
    .max(1000)
    .describe(planning('What the thread carries across the nodes that pick it up.')),
  resolution: z
    .string()
    .max(500)
    .optional()
    .describe(
      planning('How the thread closes. Absent on threads deliberately left open. The closing node performs the resolution.')
    ),
});

/**
 * A named human involved in the work. `name` is personal data (sensitivity:
 * PII-low, internal use); it is stored once here and referenced by id
 * everywhere else so removal is a single operation.
 */
export const Person = z.object({
  id: Uuid.describe('Opaque, stable.'),
  name: z.string().min(1).max(200).describe('Sensitivity: PII-low. Store no contact details in this schema.'),
  role: z.enum(['author', 'co_author', 'editor', 'researcher', 'translator', 'illustrator', 'reviewer', 'other']),
  role_other: z.string().min(1).max(120).optional().describe("Required when role = 'other'."),
});

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const DocumentPlanObject = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),

    id: Uuid.describe('Opaque, stable identifier. Set at creation, never modified.'),

    work_type: WorkType.describe(
      'Scale and genre of the work. Determines permitted nesting depth, whether front and back matter may exist, and which node kinds may open the body.'
    ),

    title: z.string().min(1).max(200).describe('Manuscript text: the title of the work as printed.'),
    subtitle: z.string().min(1).max(300).optional().describe('Manuscript text: the subtitle as printed.'),
    description: z
      .string()
      .min(1)
      .max(1000)
      .describe(planning('Brief statement of what the work is for, written for whoever picks up the plan.')),

    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'BCP 47 tag, e.g. "en", "pt-BR"')
      .describe(
        'Single-locale strategy: every free-text field in this plan is written in this language. A translation is a separate DocumentPlan linked via translation_of.'
      ),
    translation_of: Uuid.optional().describe('FK → DocumentPlan.id this plan translates. Must differ from `id`.'),

    series: z
      .object({
        title: z.string().min(1).max(200),
        volume_number: z.number().int().positive().describe('Position in the series, 1-based.'),
        previous_volume_id: Uuid.optional().describe('FK → DocumentPlan.id of the preceding volume.'),
        carried_concept_ids: z
          .array(ConceptIdRef)
          .max(200)
          .optional()
          .describe('Concepts defined in an earlier volume and reused here without redefinition.'),
      })
      .optional()
      .describe("Required in practice when work_type = 'series_volume'; validated as such."),

    // -----------------------------------------------------------------
    // Audience and context
    // -----------------------------------------------------------------
    audience: z.object({
      primary: z.string().min(1).max(200).describe('Primary reader type'),
      secondary: z.array(z.string().min(1).max(200)).max(10).optional(),
      knowledge_level: z.enum(['expert', 'intermediate', 'novice']),
      includes_decision_makers: z
        .boolean()
        .default(false)
        .describe('Whether any reader in this audience will act on this document'),
      prior_reading_assumed: z
        .array(z.string().min(1).max(200))
        .max(20)
        .optional()
        .describe('Works the reader is assumed to know. At book length this bounds what must be explained.'),
    }),

    // -----------------------------------------------------------------
    // Purpose and thesis
    // -----------------------------------------------------------------
    thesis: AssertionText(500).describe(
      planning(
        'The argument of the work in one sentence, written as the argument. The finished work establishes it; no passage is obliged to quote it.'
      )
    ),

    purpose: z.enum(['inform', 'persuade', 'decide', 'explain', 'report', 'propose', 'other']),
    purpose_other: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Required when purpose = 'other'. Intentional extension slot pending a schema_version bump."),

    success_criteria: z
      .array(z.string().min(1).max(300))
      .min(1)
      .max(20)
      .describe(planning('Falsifiable statements of what success looks like, tested against the draft rather than printed in it.')),

    out_of_scope: z
      .array(z.string().min(1).max(300))
      .max(30)
      .optional()
      .describe(
        planning(
          'Questions this work declines to answer, since a book without stated limits expands until it stops shipping. Bounding the draft is required; a passage listing what the work will not cover is a separate editorial decision.'
        )
      ),

    // -----------------------------------------------------------------
    // Structure — the nodes ARE the claims. No separate claim registry
    // exists, so a claim cannot drift out of sync with the node carrying it.
    // -----------------------------------------------------------------
    structure: z.object({
      front_matter: z
        .array(SectionNodeSchema)
        .max(20)
        .optional()
        .describe('Ordered. Preface, foreword, acknowledgements, introduction-before-the-argument.'),
      sections: z
        .array(SectionNodeSchema)
        .min(1)
        .max(200)
        .describe('Ordered body of the work: the argument itself, from first node to last.'),
      back_matter: z
        .array(SectionNodeSchema)
        .max(50)
        .optional()
        .describe('Ordered. Appendices, glossary, notes, bibliography, index.'),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe('Override of the nesting limit implied by work_type. May tighten it, never exceed it.'),
      opening_strategy: z
        .enum(['context', 'problem', 'question', 'narrative', 'thesis'])
        .optional()
        .describe(planning('How the work opens. The first node opens that way; it does not describe how it opens.')),
      closing_strategy: z
        .enum(['conclusion', 'call_to_action', 'recommendation', 'implications'])
        .optional()
        .describe(planning('How the work closes. The last node closes that way.')),
    }),

    threads: z
      .array(Thread)
      .max(50)
      .optional()
      .describe('Aggregation: threads are referenced by nodes and survive the deletion of any single node.'),

    // -----------------------------------------------------------------
    // Content — the registries every reference resolves against.
    // -----------------------------------------------------------------
    content: z.object({
      sources: z.array(ContentSource).max(2000).optional().describe('Unordered evidence registry.'),
      concepts: z.array(Concept).max(500).optional().describe('Unordered term registry.'),
      assets: z.array(Asset).max(500).optional().describe('Unordered registry of figures, tables, and images.'),
      examples: z
        .array(
          z.object({
            description: z.string().min(1).max(500),
            section_id: NodeId.optional().describe('FK → the node this example illustrates'),
          })
        )
        .max(200)
        .optional(),
    }),

    // -----------------------------------------------------------------
    // People — named once, referenced by id (Rule 26).
    // -----------------------------------------------------------------
    people: z
      .array(Person)
      .max(100)
      .optional()
      .describe('Association: people exist independently of this plan and are referenced, not owned.'),

    // -----------------------------------------------------------------
    // Style and tone
    // -----------------------------------------------------------------
    style: z.object({
      tone: z.enum(['formal', 'conversational', 'technical', 'narrative', 'advisory']),
      voice: z.enum(['first_person', 'second_person', 'third_person', 'passive']).optional(),
      reading_level: z.enum(['academic', 'professional', 'general']).optional(),
      citation_style: z
        .enum(['none', 'chicago_notes', 'chicago_author_date', 'apa', 'mla', 'harvard', 'ieee', 'abnt', 'numeric'])
        .default('none')
        .describe('Rendering convention for `evidence`. Independent of what is cited.'),
      prohibited_patterns: z
        .array(z.string().min(1).max(200))
        .max(30)
        .optional()
        .describe(
          'Constructions the draft must not contain, checked against the manuscript rather than against this plan. The one field in the schema that reaches wording, and therefore where meta-narration is banned: see DEFAULT_PROHIBITED_PATTERNS.'
        ),
      required_patterns: z
        .array(z.string().min(1).max(200))
        .max(30)
        .optional()
        .describe('Constructions the draft must contain, such as a house term or a mandated disclosure.'),
    }),

    // -----------------------------------------------------------------
    // Constraints
    // -----------------------------------------------------------------
    constraints: z.object({
      min_words: z.number().int().positive().max(2_000_000).optional().describe('Whole work, in words.'),
      max_words: z.number().int().positive().max(2_000_000).optional().describe('Whole work, in words.'),
      word_budget_tolerance: z
        .number()
        .min(0)
        .max(1)
        .default(0.1)
        .describe(
          'Fraction by which the sum of child budgets may exceed a parent budget, and the plan total may exceed max_words, before validation fails. 0.1 = 10%.'
        ),
      deadline: ISODateTime.optional().describe('Delivery of the whole work.'),
      format: z.enum(['markdown', 'docx', 'pdf', 'html', 'plaintext', 'latex', 'epub', 'indesign']).optional(),
      reviewers: z
        .array(
          z.object({
            name: z.string().min(1).max(200),
            role: z.string().min(1).max(100).optional(),
          })
        )
        .max(20)
        .optional()
        .describe(
          'DEPRECATED since 3.0.0, sunset 4.0.0 — declare reviewers in `people` and assign them in `review.assignments`, which gives them stable ids and approval state.'
        ),
    }),

    // -----------------------------------------------------------------
    // Milestones — a book is delivered in pieces, on dates.
    // -----------------------------------------------------------------
    milestones: z
      .array(
        z.object({
          id: NodeId.describe('Slug, unique across milestones.'),
          label: z.string().min(1).max(200),
          due: ISODateTime,
          node_ids: z.array(NodeId).min(1).max(200).describe('FK → nodes this milestone covers.'),
          target_status: WorkStatus.describe('Status those nodes must reach by `due`.'),
        })
      )
      .max(100)
      .optional()
      .describe('Unordered; sequence is given by `due`. Every `due` must fall on or before constraints.deadline.'),

    // -----------------------------------------------------------------
    // Review — gates to satisfy before status advances to final, plus who
    // holds each gate. Results are not recorded here.
    // -----------------------------------------------------------------
    review: z
      .object({
        require_coherence_test: z.boolean().default(true),
        require_completeness_test: z.boolean().default(true),
        require_self_contained_test: z.boolean().default(true),
        require_substantive_test: z.boolean().default(true),
        require_thread_continuity_test: z
          .boolean()
          .default(false)
          .describe('Every declared thread is opened, advanced, and resolved or deliberately left open.'),
        require_concept_introduction_test: z
          .boolean()
          .default(false)
          .describe('No concept is used before the node that introduces it.'),
        require_budget_test: z
          .boolean()
          .default(false)
          .describe('Drafted word counts sit inside the declared budgets.'),
        assignments: z
          .array(
            z.object({
              person_id: PersonIdRef,
              scope_node_ids: z
                .array(NodeId)
                .max(200)
                .optional()
                .describe('Nodes under this reviewer. Absent: the whole work.'),
              required: z.boolean().default(true).describe('Whether final status waits on this reviewer.'),
            })
          )
          .max(50)
          .optional(),
      })
      .optional(),

    review_requirements: z
      .object({
        require_coherence_test: z.boolean().default(true),
        require_completeness_test: z.boolean().default(true),
        require_self_contained_test: z.boolean().default(true),
        require_substantive_test: z.boolean().default(true),
      })
      .optional()
      .describe('DEPRECATED since 3.0.0, sunset 4.0.0 — superseded by `review`, which adds gates and assignments.'),

    // -----------------------------------------------------------------
    // Dependencies and sequencing
    // -----------------------------------------------------------------
    dependencies: z
      .array(
        z.object({
          section_id: NodeId,
          depends_on: z.array(NodeId).min(1).max(50),
          reason: z
            .enum(['context', 'argument_buildup', 'evidence_introduction', 'logical_prerequisite'])
            .optional()
            .describe(
              "Graph must be a DAG. With reason 'logical_prerequisite', every target must also precede the dependent node in reading order."
            ),
        })
      )
      .max(500)
      .optional(),

    // -----------------------------------------------------------------
    // Provenance, identity, and version
    // -----------------------------------------------------------------
    metadata: z.object({
      revision: z.number().int().positive().describe('Plan revision, distinct from schema_version'),
      created_by: z.string().min(1).max(200).describe('Sensitivity: PII-low.'),
      created_at: ISODateTime.describe('Immutable. Set once at creation.'),
      modified_by: z.string().min(1).max(200).optional().describe('Sensitivity: PII-low.'),
      modified_at: ISODateTime.optional(),
      status: WorkStatus.default('draft').describe(
        'Status of the whole work. Advancing to final requires every leaf node at final and no asset with permission_denied.'
      ),
    }),
  });

export const DocumentPlanSchema = DocumentPlanObject.superRefine((plan, ctx) => {
    // Cross-references the type system alone cannot enforce: every id
    // resolves, every graph is acyclic, every declared range is consistent,
    // and the structure matches the declared work type.

    const profile = WORK_TYPE_PROFILE[plan.work_type];
    const flat = flattenStructure(plan.structure);
    const nodeIds = new Set<string>();
    const orderById = new Map<string, number>();

    for (const { node, order } of flat) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id "${node.id}": ids must be unique across front matter, body, and back matter.`,
        });
      }
      nodeIds.add(node.id);
      if (!orderById.has(node.id)) orderById.set(node.id, order);
    }

    // --- Structure legality -------------------------------------------------
    const maxDepth = Math.min(plan.structure.max_depth ?? profile.max_depth, profile.max_depth);
    if (plan.structure.max_depth !== undefined && plan.structure.max_depth > profile.max_depth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['structure', 'max_depth'],
        message: `structure.max_depth ${plan.structure.max_depth} exceeds the limit of ${profile.max_depth} for work_type "${plan.work_type}".`,
      });
    }

    const matterCount = (plan.structure.front_matter?.length ?? 0) + (plan.structure.back_matter?.length ?? 0);
    if (!profile.allows_matter && matterCount > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['structure'],
        message: `work_type "${plan.work_type}" does not carry front or back matter. Move that material into structure.sections or change work_type.`,
      });
    }

    for (const { node, parent, region, depth, path } of flat) {
      if (depth > maxDepth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Node "${node.id}" sits at depth ${depth}, beyond the limit of ${maxDepth} for work_type "${plan.work_type}".`,
        });
      }

      const rank = NODE_KIND_RANK[node.kind];

      if (parent) {
        const parentRank = NODE_KIND_RANK[parent.kind];
        if (rank <= parentRank) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `Node "${node.id}" of kind "${node.kind}" cannot sit inside "${parent.id}" of kind "${parent.kind}". A child must be of a finer kind than its parent.`,
          });
        }
      } else if (region === 'body' && rank < profile.top_level_min_rank) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `work_type "${plan.work_type}" cannot open its body with a "${node.kind}".`,
        });
      } else if (region === 'front_matter' && node.kind !== 'front_matter_element') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Top-level front matter node "${node.id}" must be of kind "front_matter_element".`,
        });
      } else if (region === 'back_matter' && node.kind !== 'appendix' && node.kind !== 'back_matter_element') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Top-level back matter node "${node.id}" must be of kind "appendix" or "back_matter_element".`,
        });
      }

      const isLeaf = !node.children?.length;
      if (isLeaf && !node.content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'content'],
          message: `Leaf node "${node.id}" carries no content. A node that has no children must state the claim it advances.`,
        });
      }
      if (!isLeaf && !node.content && !node.through_line) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'through_line'],
          message: `Grouping node "${node.id}" states neither a claim nor a through_line, so nothing explains why its children belong together.`,
        });
      }

      if (node.content?.evidence && node.content.evidence_source_ids) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'content', 'evidence_source_ids'],
          message: `Node "${node.id}" sets both evidence and the deprecated evidence_source_ids. Keep evidence only.`,
        });
      }
      if (node.target_words !== undefined && node.word_count !== undefined && node.target_words !== node.word_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'word_count'],
          message: `Node "${node.id}" declares conflicting budgets in target_words and the deprecated word_count.`,
        });
      }
    }

    // --- Evidence resolves --------------------------------------------------
    const sourceIds = new Set((plan.content.sources ?? []).map((s) => s.id));
    const citationKeys = new Map<string, number>();
    for (const source of plan.content.sources ?? []) {
      if (!source.citation_key) continue;
      citationKeys.set(source.citation_key, (citationKeys.get(source.citation_key) ?? 0) + 1);
    }
    for (const [key, count] of citationKeys) {
      if (count > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'sources'],
          message: `Duplicate citation_key "${key}" across content.sources.`,
        });
      }
    }

    for (const { node, path } of flat) {
      if (!node.content) continue;
      for (const ref of effectiveEvidence(node.content)) {
        if (!sourceIds.has(ref.source_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, 'content', 'evidence'],
            message: `Node "${node.id}" cites source "${ref.source_id}", which is not declared in content.sources.`,
          });
        }
      }
    }

    // --- Concepts are introduced before they are used -----------------------
    const conceptById = new Map((plan.content.concepts ?? []).map((c) => [c.id, c]));
    const carried = new Set(plan.series?.carried_concept_ids ?? []);
    for (const concept of plan.content.concepts ?? []) {
      if (!nodeIds.has(concept.introduced_in)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'concepts'],
          message: `Concept "${concept.term}" is introduced in "${concept.introduced_in}", which is not a node in this plan.`,
        });
      }
    }
    for (const { node, order, path } of flat) {
      for (const cid of node.concept_ids ?? []) {
        const concept = conceptById.get(cid);
        if (!concept) {
          if (!carried.has(cid)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, 'concept_ids'],
              message: `Node "${node.id}" uses concept "${cid}", which is declared neither in content.concepts nor in series.carried_concept_ids.`,
            });
          }
          continue;
        }
        const introducedAt = orderById.get(concept.introduced_in);
        if (introducedAt !== undefined && introducedAt > order) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, 'concept_ids'],
            message: `Node "${node.id}" uses "${concept.term}" before "${concept.introduced_in}" introduces it. Move the definition earlier or the use later.`,
          });
        }
      }
    }

    // --- Assets, examples, threads, people ----------------------------------
    const assetIds = new Set<string>();
    for (const asset of plan.content.assets ?? []) {
      if (assetIds.has(asset.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'assets'],
          message: `Duplicate asset id "${asset.id}".`,
        });
      }
      assetIds.add(asset.id);
      if (!nodeIds.has(asset.node_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'assets'],
          message: `Asset "${asset.caption}" is placed in node "${asset.node_id}", which does not exist.`,
        });
      }
      if (asset.source_id && !sourceIds.has(asset.source_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'assets'],
          message: `Asset "${asset.caption}" cites source "${asset.source_id}", which is not declared in content.sources.`,
        });
      }
    }

    for (const example of plan.content.examples ?? []) {
      if (example.section_id && !nodeIds.has(example.section_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'examples'],
          message: `content.examples references section_id "${example.section_id}", which does not exist.`,
        });
      }
    }

    const threadUse = new Map<string, number>();
    for (const { node, path } of flat) {
      for (const tid of node.thread_ids ?? []) {
        threadUse.set(tid, (threadUse.get(tid) ?? 0) + 1);
        if (!(plan.threads ?? []).some((t) => t.id === tid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, 'thread_ids'],
            message: `Node "${node.id}" advances thread "${tid}", which is not declared in threads.`,
          });
        }
      }
    }
    for (const thread of plan.threads ?? []) {
      if ((threadUse.get(thread.id) ?? 0) < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['threads'],
          message: `Thread "${thread.name}" is picked up by fewer than two nodes, so it does not run through the work. Attach it to more nodes or remove it.`,
        });
      }
    }

    const peopleIds = new Set<string>();
    for (const person of plan.people ?? []) {
      if (peopleIds.has(person.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['people'],
          message: `Duplicate person id "${person.id}".`,
        });
      }
      peopleIds.add(person.id);
      if (person.role === 'other' && !person.role_other) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['people'],
          message: `Person "${person.name}" has role 'other' without role_other.`,
        });
      }
    }
    for (const { node, path } of flat) {
      if (node.owner_id && !peopleIds.has(node.owner_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'owner_id'],
          message: `Node "${node.id}" is owned by "${node.owner_id}", who is not declared in people.`,
        });
      }
    }
    for (const assignment of plan.review?.assignments ?? []) {
      if (!peopleIds.has(assignment.person_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['review', 'assignments'],
          message: `Review assignment references person "${assignment.person_id}", who is not declared in people.`,
        });
      }
      for (const nid of assignment.scope_node_ids ?? []) {
        if (!nodeIds.has(nid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['review', 'assignments'],
            message: `Review assignment scopes node "${nid}", which does not exist.`,
          });
        }
      }
    }

    // --- Dependency graph ---------------------------------------------------
    const adjacency = new Map<string, string[]>();
    for (const dep of plan.dependencies ?? []) {
      if (!nodeIds.has(dep.section_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dependencies'],
          message: `dependencies.section_id "${dep.section_id}" does not exist.`,
        });
      }
      for (const target of dep.depends_on) {
        if (!nodeIds.has(target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dependencies'],
            message: `dependencies for "${dep.section_id}" reference "${target}", which does not exist.`,
          });
        }
        if (dep.reason === 'logical_prerequisite') {
          const from = orderById.get(dep.section_id);
          const to = orderById.get(target);
          if (from !== undefined && to !== undefined && to > from) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['dependencies'],
              message: `"${dep.section_id}" declares "${target}" a logical prerequisite, but "${target}" is read later. Reorder the work or downgrade the reason.`,
            });
          }
        }
      }
      adjacency.set(dep.section_id, dep.depends_on);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (node: string): boolean => {
      if (visited.has(node)) return false;
      if (visiting.has(node)) return true;
      visiting.add(node);
      for (const next of adjacency.get(node) ?? []) {
        if (hasCycle(next)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    for (const dep of plan.dependencies ?? []) {
      if (hasCycle(dep.section_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dependencies'],
          message: `Circular dependency detected starting at node "${dep.section_id}". The dependency graph must be a DAG.`,
        });
        break;
      }
    }

    // --- Word budget --------------------------------------------------------
    const tolerance = plan.constraints.word_budget_tolerance;
    for (const { node, path } of flat) {
      const budget = effectiveTargetWords(node);
      if (budget === undefined || !node.children?.length) continue;
      const declaredChildren = node.children.filter((c) => effectiveTargetWords(c) !== undefined);
      if (declaredChildren.length !== node.children.length) continue;
      const childSum = declaredChildren.reduce((sum, c) => sum + (effectiveTargetWords(c) ?? 0), 0);
      if (childSum > budget * (1 + tolerance)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'target_words'],
          message: `Children of "${node.id}" budget ${childSum} words against a parent budget of ${budget}, beyond the ${Math.round(
            tolerance * 100
          )}% tolerance.`,
        });
      }
    }

    const { min_words, max_words } = plan.constraints;
    if (min_words !== undefined && max_words !== undefined && min_words > max_words) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['constraints', 'min_words'],
        message: 'constraints.min_words must not exceed constraints.max_words.',
      });
    }
    const planned = totalTargetWords(plan.structure);
    if (planned > 0) {
      if (max_words !== undefined && planned > max_words * (1 + tolerance)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['structure'],
          message: `Node budgets total ${planned} words against constraints.max_words of ${max_words}.`,
        });
      }
      if (min_words !== undefined && planned < min_words * (1 - tolerance)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['structure'],
          message: `Node budgets total ${planned} words against constraints.min_words of ${min_words}.`,
        });
      }
    }

    // --- Milestones ---------------------------------------------------------
    const milestoneIds = new Set<string>();
    for (const milestone of plan.milestones ?? []) {
      if (milestoneIds.has(milestone.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['milestones'],
          message: `Duplicate milestone id "${milestone.id}".`,
        });
      }
      milestoneIds.add(milestone.id);
      for (const nid of milestone.node_ids) {
        if (!nodeIds.has(nid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['milestones'],
            message: `Milestone "${milestone.label}" covers node "${nid}", which does not exist.`,
          });
        }
      }
      if (plan.constraints.deadline && milestone.due > plan.constraints.deadline) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['milestones'],
          message: `Milestone "${milestone.label}" falls due after constraints.deadline.`,
        });
      }
    }

    // --- Identity and status invariants -------------------------------------
    if (plan.translation_of === plan.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['translation_of'],
        message: 'A plan cannot be a translation of itself.',
      });
    }
    if (plan.series?.previous_volume_id === plan.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series', 'previous_volume_id'],
        message: 'A volume cannot follow itself.',
      });
    }
    if (plan.work_type === 'series_volume' && !plan.series) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: "work_type 'series_volume' requires a series block.",
      });
    }
    if (plan.purpose === 'other' && !plan.purpose_other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purpose_other'],
        message: "purpose_other is required when purpose is 'other'.",
      });
    }
    if (plan.metadata.status === 'final') {
      const unfinished = flat.filter((f) => !f.node.children?.length && f.node.status !== 'final');
      if (unfinished.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['metadata', 'status'],
          message: `Document status is final while ${unfinished.length} leaf node(s) are not, starting with "${unfinished[0]!.node.id}".`,
        });
      }
      const blocked = (plan.content.assets ?? []).filter((a) => a.rights_status === 'permission_denied');
      if (blocked.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['metadata', 'status'],
          message: `Document status is final while ${blocked.length} asset(s) carry permission_denied, starting with "${blocked[0]!.caption}".`,
        });
      }
    }
  });

export type DocumentPlan = z.infer<typeof DocumentPlanSchema>;
export type DocumentPlanInput = z.input<typeof DocumentPlanSchema>;

/*
 * ---------------------------------------------------------------------------
 * Migration 3.0.0 → 3.1.0 (additive, with one new rejection)
 * ---------------------------------------------------------------------------
 * No field is added, removed, renamed, or retyped. Descriptions across the
 * plan now carry the planning clause, and `title` and `subtitle` at both plan
 * and node level are labelled manuscript text; MANUSCRIPT_TEXT_FIELDS lists
 * the complete set of values a renderer may print.
 *
 * The one behavioural change: `thesis`, every `content.claim`, and every
 * `through_line` reject text that opens by naming the document or one of its
 * parts ("This chapter argues…", "Este capítulo examina…"). A v3.0.0 plan
 * written in that voice fails validation against 3.1.0. Migration is a rewrite
 * of the offending strings into the assertions they describe, which is work
 * the draft would otherwise inherit.
 *
 * DEFAULT_PROHIBITED_PATTERNS is exported for `style.prohibited_patterns` and
 * applied to no plan automatically, since that field is checked against
 * manuscript text.
 *
 * ---------------------------------------------------------------------------
 * Migration 2.0.0 → 3.0.0 (breaking; major version increment required)
 * ---------------------------------------------------------------------------
 * Breaking:
 *   · schema_version literal moves to "3.0.0".
 *   · work_type added as a required field without a default. Essays and
 *     articles that used v2 flat sections map to work_type "essay"/"article".
 *   · Section.subsections (one level) replaced by SectionNode.children
 *     (recursive, depth-limited by work_type). Migration: rename the key.
 *   · Node.kind added as required. Migration: v2 top-level sections become
 *     "section", v2 subsections become "subsection".
 *   · ClaimBlock.evidence_source_ids changes from required to optional and
 *     is deprecated; supply `evidence` instead.
 * Backward-compatible additions:
 *   · structure.front_matter, structure.back_matter, structure.max_depth
 *   · threads, people, milestones, review, series, out_of_scope
 *   · content.concepts, content.assets, enriched content.sources
 *   · node status, owner_id, narrative_function, through_line, concept_ids,
 *     thread_ids, notes
 *   · constraints.word_budget_tolerance (default 0.1), style.citation_style
 *     (default "none")
 * Deprecated, readable until 4.0.0:
 *   · SectionCore.word_count → target_words
 *   · ClaimBlock.evidence_source_ids → evidence
 *   · constraints.reviewers → people + review.assignments
 *   · review_requirements → review
 *
 * ---------------------------------------------------------------------------
 * Scorecard (Rules for Great Schema Design v2.0.0)
 * ---------------------------------------------------------------------------
 * MUST   1 Pass · 2 Pass · 3 Pass · 4 Warn(§) · 5 Pass · 6 Pass · 7 Pass
 *        8 Pass (SourceIdentifier discriminated on `kind`) · 10 Pass
 *        11 Pass · 12 Pass (composition on children, aggregation on threads,
 *        association on people — stated at each field) · 13 Pass · 14 Pass
 *        (tree is acyclic by construction and depth-limited; dependencies
 *        declared DAG and enforced) · 15 Pass · 19 Pass · 20 Pass
 *        21 Pass (migration block above) · 22 Pass (four deprecations
 *        annotated with since/replacement/sunset) · 23 Pass (person names
 *        classified PII-low, isolated in `people`; no contact data modeled)
 *        27 Pass · 28 Pass · 29 Pass (purpose_other marked as the intentional
 *        extension slot; no open records) · 31 Pass
 * SHOULD 9 Pass · 16 Pass · 17 Pass · 18 Pass (target words and reading order
 *        are derived by exported helpers, never stored) · 24 Pass · 25 Pass
 *        (single locale per instance; translations linked by translation_of)
 *        26 Pass (people registry with stable ids resolves the v2 warning)
 *        30 Pass
 * (§) Rule 4: `reasoning` remains the only field where null and absent differ.
 *     Every other optional field means "not yet authored", consistent with
 *     node status.
 *
 * ---------------------------------------------------------------------------
 * Plan text and manuscript text
 * ---------------------------------------------------------------------------
 * Rule 15 (define once) applies to the boundary itself: PLANNING_CLAUSE states
 * it, `planning()` attaches it, and MANUSCRIPT_TEXT_FIELDS enumerates the
 * exception. A field is planning text unless that list names it, so a renderer
 * added later inherits the safe default without reading this note.
 *
 * The boundary is enforced where it can be. AssertionText rejects plan strings
 * written in the voice of the document, which is the one leak a plan validator
 * can catch, since the plan is all it holds. Everything downstream —
 * transcribing a ClaimBlock in field order, opening a `turn` node by
 * announcing the turn, printing `out_of_scope` as a passage — is a drafting
 * failure, checkable only against the manuscript and only through
 * `style.prohibited_patterns`.
 */

/**
 * Named schema bundle consumed by sidecar.ts (bridge entities) and by
 * plugins/document_plan_dnis/build.ts (ingest-time validation).
 */
export const Schemas = {
  DocumentPlanObject,
  DocumentPlanSchema,
  ContentSource,
  Concept,
  Asset,
  Thread,
  Person,
  ClaimBlock,
  EvidenceRef,
  SectionNodeCore,
  SectionNodeSchema,
  SourceIdentifier,
  Uuid,
  NodeId,
  AuthorityLevel,
  WorkStatus,
  WorkType,
  NodeKind,
} as const;
