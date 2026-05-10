/**
 * academic-paper.ts
 *
 * Academic paper schema — v0.2.0
 *
 * Source of truth for the future `fdpm.academic-paper` plugin. Each named
 * `z.object(...).strict()` below maps one-to-one onto an FDPM
 * `PrimitiveType` via `@fdpm/zod-bridge`. Cross-primitive references
 * (string IDs with regex patterns) are lifted by the bridge into
 * relations.
 *
 * Scope: scholarly papers, monographs, chapters, theses, essays, reviews,
 * historical studies. Designed to hold both literary-critical work
 * (Quotation/Concept/counter-reads heavy) and theoretical-physics work
 * (Equation/Postulate/internal-refs heavy) without forcing either genre
 * into the other's primitives.
 *
 * Out of scope (v0.2): peer-review records, dataset metadata, edition
 * lineage for multi-printing monographs (deferred to a sibling
 * `fdpm.monograph` profile). Note: minimal edition/translation linkage
 * (`Work.translationOf`, `Work.editionOf`) is now supported as a flat
 * sibling-link rather than a full FRBR Work/Expression split.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DISCLAIMER
 * No information validated against this schema should be taken for
 * granted. The schema captures structural relationships and provenance
 * metadata only; it does not validate factual claims, the soundness of
 * arguments, or the historical accuracy of citations. Every Claim,
 * Evidence, Citation, and Quotation invites hallucination — pair every
 * assertion with a `Provenance` and a verifiable `locator`. Any premise
 * not backed by a real logical definition or verifiable reference may be
 * invalid, erroneous, or a hallucination. See @DISCLAIMER.md.
 * ─────────────────────────────────────────────────────────────────────
 *
 * CHANGELOG (v0.1.0 → v0.2.0)
 *   P0:
 *   - NEW primitive `Citation`: typed citation links from Claim/Finding
 *     (or paper-level) to a cited Work, with a CiTO-2.7-aligned `kind`
 *     enum (extends, refutes, uses-method-of, ...). Closes the
 *     "counterReads only spans within-paper Claims" gap.
 *   - SPLIT `PaperKind` into `PaperEpistemicMethod` (empirical /
 *     theoretical / methodological / literary-critical / review /
 *     historical) and `PaperFormat` (article / essay / monograph /
 *     thesis / chapter / letter / editorial / commentary). Old `kind`
 *     conflated method with format and let a "historical monograph"
 *     bypass the historical CEL check.
 *
 *   P1:
 *   - NEW primitive `Funding`: paper-to-funder link with Crossref Funder
 *     Registry DOI or ROR ID, award ID, and CRediT-eligible recipients.
 *   - NEW field `Author.contributions: CreditRole[]` (NISO CRediT 1.0).
 *   - NEW fields `Work.translationOf`, `Work.editionOf` (flat
 *     FRBR-Expression linkage; full FRBR layering deferred).
 *   - NEW value `'hypothesis'` in `ClaimKind`; the `epistemicMethod ==
 *     'empirical'` CEL rule now requires both a hypothesis Claim and a
 *     data-supported empirical Claim.
 *   - REFINEMENT on `Equation`: requires at least one of {tex, mathml}.
 *
 *   P2:
 *   - RENAMED `Quotation.grifo` → `Quotation.emphasis`; values changed
 *     from {none, original, ours} to {none, original,
 *     added-by-citing-author}. Less locale-dependent than the
 *     Lusophone "grifo nosso" convention.
 *   - RENAMED `Limitation.scope` value `"scope"` → `"applicability"`
 *     (the field is named `scope`; the tautological value is gone).
 *   - NEW fields `Theorist.wikidataId`, `Theorist.viafId`,
 *     `Concept.wikidataId` for cross-paper consolidation.
 *   - LOWERED `Paper.year` lower bound from 1400 to 0 (matches
 *     `Work.year`; allows ancient papers/treatises modeled as Paper).
 *
 *   P3:
 *   - NEW fields `Figure.doi`, `Equation.doi` (DataCite asset DOIs).
 *
 * KIND-CONDITIONAL CEL (locked v0.2)
 *   - paper.epistemicMethod == 'theoretical'      ⇒ count(equations) > 0
 *   - paper.epistemicMethod == 'empirical'        ⇒ (∃ claim of kind
 *                                                    'hypothesis') AND
 *                                                   (∃ claim of kind
 *                                                    'empirical' with ∃
 *                                                    supporting
 *                                                    evidence of kind
 *                                                    'data')
 *   - paper.epistemicMethod == 'literary-critical' ⇒ count(quotations) > 0
 *   - paper.epistemicMethod == 'review'           ⇒ ≥10 distinct
 *                                                   citedWork IDs across
 *                                                   Citations of kind ∈
 *                                                   {reviews, critiques,
 *                                                    agrees-with,
 *                                                    disagrees-with,
 *                                                    qualifies, extends,
 *                                                    confirms, refutes}
 *   - paper.epistemicMethod == 'historical'       ⇒ ∃ evidence of kind
 *                                                   'observation' or 'data'
 *
 * BRIDGE-CLEAN CONVENTIONS (unchanged from v0.1)
 *   - every primitive is a plain `z.object(...).strict()` — no
 *     `.transform`, no `.pipe`, no primitive-level `.superRefine`;
 *   - cross-axis invariants colocate on `RefinedAcademicPaperSchema`;
 *   - kind-conditional required-ness rules live on the Refined root and
 *     are lifted to CEL as `paper.epistemicMethod == X implies <expr>`;
 *   - IDs are plain `z.string().regex(...)` with kebab-case prefixes;
 *   - no `z.discriminatedUnion`.
 *
 * Generated by: Claude Opus 4.7 (1M context) via Claude Code
 * Date: 2026-05-10
 */

import { z } from "zod";

/* =====================================================
 * 1. _meta envelope
 *
 * Every primitive carries the FDPM ontological _meta triple. Authority
 * strings reference real-world conventions (ISO 639-1, DOI Handbook,
 * CSL 1.0.2, BibTeX, JATS-XML, ISBN ISO 2108, MathML 3.0, ORCID,
 * Crossref REST API, CiTO 2.7, NISO CRediT 1.0, Crossref Funder
 * Registry, Wikidata, VIAF). Authors normally omit _meta and let the
 * default inject at parse time.
 * ===================================================== */

function metaSchema<
  D extends string,
  R extends string,
  A extends string,
>(domainPath: D, register: R, authority: A) {
  return z
    .object({
      domainPath: z.literal(domainPath),
      register: z.literal(register),
      authority: z.literal(authority),
    })
    .strict();
}

export const META_BIBLIO_VALUE = {
  domainPath: "academia/paper/bibliographic",
  register: "empirical",
  authority:
    "CSL 1.0.2, BibTeX, JATS-XML, ISO 639-1, DOI Handbook, ISBN ISO 2108, ORCID",
} as const;
export const META_AUTHORSHIP_VALUE = {
  domainPath: "academia/paper/authorship",
  register: "empirical",
  authority:
    "ORCID, ROR, Crossref REST API, NISO CRediT 1.0, VIAF, Wikidata",
} as const;
export const META_STRUCTURE_VALUE = {
  domainPath: "academia/paper/structure",
  register: "empirical",
  authority: "JATS-XML §body conventions, IMRAD",
} as const;
export const META_ARGUMENT_VALUE = {
  domainPath: "academia/paper/argument",
  register: "interpretive",
  authority:
    "Toulmin argument model, academic rhetoric conventions, IMRAD, SPAR DEO",
} as const;
export const META_EVIDENCE_VALUE = {
  domainPath: "academia/paper/evidence",
  register: "empirical",
  authority: "FAIR principles, replication-package conventions, SPAR DEO",
} as const;
export const META_CITATION_VALUE = {
  domainPath: "academia/paper/citation",
  register: "empirical",
  authority:
    "CSL 1.0.2, BibTeX, ISO 690, APA 7, MLA 9, Chicago 17, SPAR CiTO 2.7",
} as const;
export const META_CONCEPT_VALUE = {
  domainPath: "academia/paper/concept",
  register: "interpretive",
  authority:
    "philosophy-of-science conventions, lexicographic practice, SKOS, Wikidata",
} as const;
export const META_METHOD_VALUE = {
  domainPath: "academia/paper/methodology",
  register: "empirical",
  authority: "PRISMA, EQUATOR network, methodological reporting standards",
} as const;
export const META_MATH_VALUE = {
  domainPath: "academia/paper/mathematics",
  register: "formal",
  authority: "LaTeX, MathML 3.0, MathJax, AMS conventions",
} as const;
export const META_FIGURE_VALUE = {
  domainPath: "academia/paper/illustration",
  register: "empirical",
  authority: "JATS-XML <fig>, accessibility (alt-text) conventions, DataCite",
} as const;
export const META_FUNDING_VALUE = {
  domainPath: "academia/paper/funding",
  register: "empirical",
  authority: "Crossref Funder Registry, ROR, JATS <funding-group>",
} as const;
export const META_PROVENANCE_VALUE = {
  domainPath: "academia/paper/provenance",
  register: "empirical",
  authority: "PROV-O W3C, FAIR provenance",
} as const;
export const META_ROOT_VALUE = {
  domainPath: "academia/paper",
  register: "empirical",
  authority: "Academic publishing conventions",
} as const;

const META_BIBLIO = metaSchema(
  META_BIBLIO_VALUE.domainPath,
  META_BIBLIO_VALUE.register,
  META_BIBLIO_VALUE.authority,
).default(META_BIBLIO_VALUE);
const META_AUTHORSHIP = metaSchema(
  META_AUTHORSHIP_VALUE.domainPath,
  META_AUTHORSHIP_VALUE.register,
  META_AUTHORSHIP_VALUE.authority,
).default(META_AUTHORSHIP_VALUE);
const META_STRUCTURE = metaSchema(
  META_STRUCTURE_VALUE.domainPath,
  META_STRUCTURE_VALUE.register,
  META_STRUCTURE_VALUE.authority,
).default(META_STRUCTURE_VALUE);
const META_ARGUMENT = metaSchema(
  META_ARGUMENT_VALUE.domainPath,
  META_ARGUMENT_VALUE.register,
  META_ARGUMENT_VALUE.authority,
).default(META_ARGUMENT_VALUE);
const META_EVIDENCE = metaSchema(
  META_EVIDENCE_VALUE.domainPath,
  META_EVIDENCE_VALUE.register,
  META_EVIDENCE_VALUE.authority,
).default(META_EVIDENCE_VALUE);
const META_CITATION = metaSchema(
  META_CITATION_VALUE.domainPath,
  META_CITATION_VALUE.register,
  META_CITATION_VALUE.authority,
).default(META_CITATION_VALUE);
const META_CONCEPT = metaSchema(
  META_CONCEPT_VALUE.domainPath,
  META_CONCEPT_VALUE.register,
  META_CONCEPT_VALUE.authority,
).default(META_CONCEPT_VALUE);
const META_METHOD = metaSchema(
  META_METHOD_VALUE.domainPath,
  META_METHOD_VALUE.register,
  META_METHOD_VALUE.authority,
).default(META_METHOD_VALUE);
const META_MATH = metaSchema(
  META_MATH_VALUE.domainPath,
  META_MATH_VALUE.register,
  META_MATH_VALUE.authority,
).default(META_MATH_VALUE);
const META_FIGURE = metaSchema(
  META_FIGURE_VALUE.domainPath,
  META_FIGURE_VALUE.register,
  META_FIGURE_VALUE.authority,
).default(META_FIGURE_VALUE);
const META_FUNDING = metaSchema(
  META_FUNDING_VALUE.domainPath,
  META_FUNDING_VALUE.register,
  META_FUNDING_VALUE.authority,
).default(META_FUNDING_VALUE);

/* =====================================================
 * 2. Shared primitive value-types (NOT registered as
 *    FDPM primitives — these are inline value objects).
 * ===================================================== */

const ShortText = z.string().min(1).max(280);
const MediumText = z.string().min(1).max(2000);
const LongText = z.string().min(1).max(20000);

// ISO 639-1 two-letter language code (a 2-letter lowercase pattern is the
// pragmatic check; full validation against the registry belongs to a
// cap:expr-helper `iso639(x)`).
const Iso639 = z.string().regex(/^[a-z]{2}$/, {
  message: "language must be a 2-letter ISO 639-1 code",
});

// DOI: Crossref-style. Anchored. The cap:expr-helper `doi(x)` will do a
// stricter resolution check at use-time.
const Doi = z.string().regex(/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/, {
  message: "doi must match the DOI Handbook syntax",
});

// ISBN-10 or ISBN-13 (digits + optional hyphens, length 10 or 13 sans
// hyphens). Checksum is a cap:expr-helper concern.
const Isbn = z.string().regex(/^(?:\d[- ]?){9}[\dX]$|^(?:\d[- ]?){13}$/, {
  message: "isbn must be 10 or 13 digits, optional hyphens",
});

// ORCID: 0000-0000-0000-000X
const Orcid = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);

// ISO 8601 date (YYYY-MM-DD) — full datetime not required for paper-level
// metadata.
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// A locator is a free-form pointer into a source: "p. 257", "§3.2",
// "ll. 12-19", "Appendix III", "Section 12, fn. 4". Not pattern-locked
// — the heterogeneity of academic locators defeats regex.
const Locator = z.string().min(1).max(120);

// SPDX-style license identifier (subset accepted; full SPDX list lives in
// a cap:expr-helper).
const Spdx = z.string().min(1).max(80);

// Wikidata QID, e.g. "Q42". Permissive: forbids leading zeros but not
// rare malformed inputs; cap:expr-helper `wikidata(x)` does the live
// dereference check.
const WikidataQid = z.string().regex(/^Q[1-9]\d*$/, {
  message: "wikidataId must match Wikidata QID syntax (e.g. Q42)",
});

// VIAF ID: numeric string. Length is variable in practice (VIAF
// publishes 8-22 digit IDs); cap:expr-helper `viaf(x)` does length and
// dereference check.
const ViafId = z.string().regex(/^\d+$/, {
  message: "viafId must be a numeric VIAF identifier",
});

// Funder identifier: accepts either a Crossref Funder Registry DOI
// (10.13039/<digits>) or a ROR URL. The Crossref Funder Registry has
// been migrating to ROR, so OpenAlex unifies these; we accept both.
const FunderId = z
  .string()
  .regex(
    /^(?:https:\/\/ror\.org\/0[a-z0-9]{6}\d{2}|10\.13039\/[0-9]+)$/,
    {
      message:
        "funderId must be either a ROR URL (https://ror.org/...) or a Crossref Funder Registry DOI (10.13039/...)",
    },
  );

/* ID schemas — bridge uses these for entity resolution. Kebab-prefixed
 * by primitive type. Exported (and used by-reference both inside each
 * entity's `id:` field AND by the plugin sidecar's `idSchema:` slot)
 * so the bridge's reference-equality identity check resolves cleanly.
 * The pattern `[a-z0-9-]+` is permissive enough for ULIDs, slugs, or
 * hand-authored kebab IDs.
 */
export const PaperIdSchema = z.string().regex(/^paper-[a-z0-9-]+$/);
export const AuthorIdSchema = z.string().regex(/^author-[a-z0-9-]+$/);
export const AffiliationIdSchema = z.string().regex(/^affil-[a-z0-9-]+$/);
export const SectionIdSchema = z.string().regex(/^section-[a-z0-9-]+$/);
export const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9-]+$/);
export const EvidenceIdSchema = z.string().regex(/^evidence-[a-z0-9-]+$/);
export const QuotationIdSchema = z.string().regex(/^quote-[a-z0-9-]+$/);
export const WorkIdSchema = z.string().regex(/^work-[a-z0-9-]+$/);
export const ConceptIdSchema = z.string().regex(/^concept-[a-z0-9-]+$/);
export const DefinitionIdSchema = z.string().regex(/^defn-[a-z0-9-]+$/);
export const TheoristIdSchema = z.string().regex(/^theorist-[a-z0-9-]+$/);
export const TheoryIdSchema = z.string().regex(/^theory-[a-z0-9-]+$/);
export const MethodIdSchema = z.string().regex(/^method-[a-z0-9-]+$/);
export const FindingIdSchema = z.string().regex(/^finding-[a-z0-9-]+$/);
export const LimitationIdSchema = z.string().regex(/^limit-[a-z0-9-]+$/);
export const FootnoteIdSchema = z.string().regex(/^note-[a-z0-9-]+$/);
export const EquationIdSchema = z.string().regex(/^eq-[a-z0-9-]+$/);
export const FigureIdSchema = z.string().regex(/^fig-[a-z0-9-]+$/);
export const CitationIdSchema = z.string().regex(/^citation-[a-z0-9-]+$/);
export const FundingIdSchema = z.string().regex(/^funding-[a-z0-9-]+$/);

/* =====================================================
 * 3. Provenance / Confidence (shared annotations,
 *    NOT registered as primitives — same pattern as
 *    business-plan.ts ClaimAnnotation)
 * ===================================================== */

export const ConfidenceLevelSchema = z.enum([
  "speculative",
  "low",
  "moderate",
  "high",
  "verified",
]);

export const ConfidenceSchema = z
  .object({
    level: ConfidenceLevelSchema.optional(),
    score: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine((c) => c.level !== undefined || c.score !== undefined, {
    message:
      "Confidence requires at least one of `level` or `score` to be present.",
  });

export const ProvenanceSchema = z
  .object({
    sourceType: z.enum([
      "primary_text",
      "secondary_literature",
      "archival_record",
      "dataset",
      "interview",
      "observation",
      "derivation",
      "model_output",
      "personal_communication",
      "unknown",
    ]),
    sourceLabel: ShortText.optional(),
    sourceUrl: z.string().url().optional(),
    retrievedAt: IsoDate.optional(),
  })
  .strict();

/* =====================================================
 * 4. Top-level enums (drive kind-conditional CEL)
 * ===================================================== */

// SPLIT in v0.2: epistemic method (how the paper produces knowledge)
// is now separate from format (length / genre). Kind-conditional CEL
// rules apply to `epistemicMethod`.
export const PaperEpistemicMethodSchema = z.enum([
  "empirical",
  "theoretical",
  "methodological",
  "literary-critical",
  "review",
  "historical",
]);
export type PaperEpistemicMethod = z.infer<
  typeof PaperEpistemicMethodSchema
>;

export const PaperFormatSchema = z.enum([
  "article",
  "essay",
  "monograph",
  "thesis",
  "chapter",
  "letter",
  "editorial",
  "commentary",
]);
export type PaperFormat = z.infer<typeof PaperFormatSchema>;

// `hypothesis` added in v0.2 — DEO/IMRAD-aligned distinction between a
// falsifiable conjecture and an empirically-licensed claim.
export const ClaimKindSchema = z.enum([
  "descriptive",
  "interpretive",
  "normative",
  "methodological",
  "empirical",
  "definitional",
  "postulate",
  "hypothesis",
]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const EvidenceKindSchema = z.enum([
  "data",
  "derivation",
  "citation",
  "observation",
  "exemplar",
  "textual-passage",
  "thought-experiment",
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const WorkKindSchema = z.enum([
  "journal-article",
  "book",
  "book-chapter",
  "thesis",
  "report",
  "preprint",
  "conference-paper",
  "newspaper-article",
  "archival-document",
  "film",
  "audio-recording",
  "website",
  "dataset",
  "software",
  "other",
]);

export const EquationRoleSchema = z.enum([
  "axiom",
  "postulate",
  "definition",
  "derived",
  "empirical-law",
  "transformation",
  "identity",
]);

// CiTO 2.7-aligned subset (SPAR Citation Typing Ontology). Covers the
// most common 19 of CiTO's ~40 predicates; further values can be added
// without breaking change. The "review-relevant" subset used by the
// review CEL rule is documented in the RefinedAcademicPaperSchema.
export const CitationKindSchema = z.enum([
  "extends",
  "disagrees-with",
  "agrees-with",
  "confirms",
  "refutes",
  "uses-method-of",
  "uses-data-of",
  "obtains-background-from",
  "qualifies",
  "reviews",
  "critiques",
  "compiles",
  "supports",
  "cites-as-authority",
  "cites-as-related",
  "cites-for-information",
  "replies-to",
  "updates",
  "retracts",
]);
export type CitationKind = z.infer<typeof CitationKindSchema>;

// NISO CRediT 1.0 contribution roles (Contributor Roles Taxonomy).
// Authors may have ≥0 of these; an Author with no `contributions`
// declares only authorship-position via `Author.role`.
export const CreditRoleSchema = z.enum([
  "conceptualization",
  "methodology",
  "software",
  "validation",
  "formal-analysis",
  "investigation",
  "resources",
  "data-curation",
  "writing-original-draft",
  "writing-review-editing",
  "visualization",
  "supervision",
  "project-administration",
  "funding-acquisition",
]);
export type CreditRole = z.infer<typeof CreditRoleSchema>;

/* =====================================================
 * 5. Primitives (20 total in v0.2; +Citation, +Funding)
 * ===================================================== */

// --- 5.1 Paper ----------------------------------------------------------
// CHANGE v0.2: `kind` removed; replaced by `epistemicMethod` + `format`.
// `year` lower bound lowered from 1400 to 0 (matches Work.year).
export const PaperSchema = z
  .object({
    _meta: META_BIBLIO,
    id: PaperIdSchema,
    title: ShortText,
    subtitle: ShortText.optional(),
    abstract: LongText.optional(),
    language: Iso639,
    epistemicMethod: PaperEpistemicMethodSchema,
    format: PaperFormatSchema,
    venue: ShortText.optional(),
    publisher: ShortText.optional(),
    year: z.number().int().gte(0).lte(2100),
    doi: Doi.optional(),
    isbn: Isbn.optional(),
    license: Spdx.optional(),
    pageCount: z.number().int().positive().optional(),
    sourceDocument: z.string().min(1).optional(), // dnis:Document id
    keywords: z.array(ShortText).max(20).default([]),
  })
  .strict();
export type Paper = z.infer<typeof PaperSchema>;

// --- 5.2 Author --------------------------------------------------------
// CHANGE v0.2: `contributions: CreditRole[]` added (NISO CRediT 1.0).
export const AuthorSchema = z
  .object({
    _meta: META_AUTHORSHIP,
    id: AuthorIdSchema,
    paper: PaperIdSchema,
    fullName: ShortText,
    familyName: ShortText,
    givenNames: ShortText.optional(),
    orcid: Orcid.optional(),
    email: z.string().email().optional(),
    role: z
      .enum([
        "lead",
        "co-author",
        "corresponding",
        "supervisor",
        "translator",
      ])
      .default("co-author"),
    affiliations: z.array(AffiliationIdSchema).default([]),
    contributions: z.array(CreditRoleSchema).default([]),
  })
  .strict();
export type Author = z.infer<typeof AuthorSchema>;

// --- 5.3 Affiliation ---------------------------------------------------
export const AffiliationSchema = z
  .object({
    _meta: META_AUTHORSHIP,
    id: AffiliationIdSchema,
    institution: ShortText,
    department: ShortText.optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional(), // ISO 3166-1 alpha-2
    rorId: z
      .string()
      .regex(/^https:\/\/ror\.org\/0[a-z0-9]{6}\d{2}$/)
      .optional(),
  })
  .strict();
export type Affiliation = z.infer<typeof AffiliationSchema>;

// --- 5.4 Section -------------------------------------------------------
export const SectionSchema = z
  .object({
    _meta: META_STRUCTURE,
    id: SectionIdSchema,
    paper: PaperIdSchema,
    parent: SectionIdSchema.optional(),
    label: ShortText, // "Part I", "Chapter 23", "2.2"
    title: ShortText,
    order: z.number().int().nonnegative(),
    role: z
      .enum([
        "preface",
        "introduction",
        "body",
        "methods",
        "results",
        "discussion",
        "conclusion",
        "appendix",
        "footnotes",
        "bibliography",
        "other",
      ])
      .default("body"),
    bodyText: LongText.optional(),
  })
  .strict();
export type Section = z.infer<typeof SectionSchema>;

// --- 5.5 Claim ---------------------------------------------------------
// CHANGE v0.2: `kind` enum picks up 'hypothesis' (see ClaimKindSchema).
export const ClaimSchema = z
  .object({
    _meta: META_ARGUMENT,
    id: ClaimIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema,
    kind: ClaimKindSchema,
    statement: MediumText,
    derivesFrom: z.array(ClaimIdSchema).default([]), // for kind='postulate' chains
    counterReads: z.array(ClaimIdSchema).default([]), // dialogic / oppositional (within-paper)
    confidence: ConfidenceSchema.optional(),
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;

// --- 5.6 Evidence ------------------------------------------------------
export const EvidenceSchema = z
  .object({
    _meta: META_EVIDENCE,
    id: EvidenceIdSchema,
    paper: PaperIdSchema,
    supports: z.array(ClaimIdSchema).min(1),
    kind: EvidenceKindSchema,
    summary: MediumText,
    quotation: QuotationIdSchema.optional(),
    work: WorkIdSchema.optional(),
    locator: Locator.optional(),
    provenance: z.array(ProvenanceSchema).default([]),
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;

// --- 5.7 Quotation -----------------------------------------------------
// CHANGE v0.2: `grifo` renamed to `emphasis`; values from
// {none, original, ours} → {none, original, added-by-citing-author}.
// PALS's LAW (omissions invariant) preserved unchanged.
export const QuotationSchema = z
  .object({
    _meta: META_CITATION,
    id: QuotationIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema.optional(),
    quotesFrom: WorkIdSchema,
    locator: Locator,
    body: MediumText,
    bodyLanguage: Iso639,
    emphasis: z
      .enum(["none", "original", "added-by-citing-author"])
      .default("none"),
    omissionsPresent: z.boolean().default(false),
    translatedFrom: QuotationIdSchema.optional(),
  })
  .strict()
  // Bridge-clean: a single .refine() on the entity itself (no
  // .superRefine) so the bridge sees a plain ZodObject.
  .refine((q) => !q.body.includes("[...]") || q.omissionsPresent, {
    message:
      "quotation containing '[...]' must set omissionsPresent=true (PALS's LAW: omissions must be declared, never silent).",
    path: ["omissionsPresent"],
  });
export type Quotation = z.infer<typeof QuotationSchema>;

// --- 5.8 Work ----------------------------------------------------------
// CHANGE v0.2: `translationOf` and `editionOf` added (flat
// FRBR-Expression linkage). Self-reference cycles (Work → translationOf
// → ... → Work) are forbidden by the Refined root.
export const WorkSchema = z
  .object({
    _meta: META_CITATION,
    id: WorkIdSchema,
    kind: WorkKindSchema,
    title: ShortText,
    authorsFreeText: z.array(ShortText).default([]), // when not modeled as Theorist
    year: z.number().int().gte(0).lte(2100).optional(),
    venue: ShortText.optional(),
    publisher: ShortText.optional(),
    doi: Doi.optional(),
    isbn: Isbn.optional(),
    url: z.string().url().optional(),
    language: Iso639.optional(),
    translationOf: WorkIdSchema.optional(),
    editionOf: WorkIdSchema.optional(),
  })
  .strict();
export type Work = z.infer<typeof WorkSchema>;

// --- 5.9 Concept -------------------------------------------------------
// CHANGE v0.2: `wikidataId` added for cross-paper concept consolidation.
export const ConceptSchema = z
  .object({
    _meta: META_CONCEPT,
    id: ConceptIdSchema,
    label: ShortText, // "rasura", "Lorentz transformation", "counter-gaze"
    canonicalForm: ShortText.optional(), // disambiguation key
    domain: ShortText.optional(), // "literary criticism", "physics", ...
    wikidataId: WikidataQid.optional(),
    borrowsFrom: z.array(TheoristIdSchema).default([]),
    extends: z.array(ConceptIdSchema).default([]),
  })
  .strict();
export type Concept = z.infer<typeof ConceptSchema>;

// --- 5.10 Definition ---------------------------------------------------
export const DefinitionSchema = z
  .object({
    _meta: META_CONCEPT,
    id: DefinitionIdSchema,
    paper: PaperIdSchema,
    concept: ConceptIdSchema,
    section: SectionIdSchema,
    body: MediumText,
    provenance: z.enum(["stipulated", "derived", "borrowed"]),
    citedFrom: WorkIdSchema.optional(),
  })
  .strict()
  .refine(
    (d) => d.provenance !== "borrowed" || d.citedFrom !== undefined,
    {
      message:
        "definition with provenance='borrowed' must reference a citedFrom Work",
      path: ["citedFrom"],
    },
  );
export type Definition = z.infer<typeof DefinitionSchema>;

// --- 5.11 Theorist -----------------------------------------------------
// CHANGE v0.2: `wikidataId` and `viafId` added.
export const TheoristSchema = z
  .object({
    _meta: META_AUTHORSHIP,
    id: TheoristIdSchema,
    fullName: ShortText,
    familyName: ShortText,
    birthYear: z.number().int().gte(0).lte(2100).optional(),
    deathYear: z.number().int().gte(0).lte(2100).optional(),
    primaryAffiliation: ShortText.optional(),
    wikidataId: WikidataQid.optional(),
    viafId: ViafId.optional(),
    notableTheories: z.array(TheoryIdSchema).default([]),
  })
  .strict()
  .refine(
    (t) =>
      t.birthYear === undefined ||
      t.deathYear === undefined ||
      t.deathYear >= t.birthYear,
    {
      message: "deathYear must be ≥ birthYear",
      path: ["deathYear"],
    },
  );
export type Theorist = z.infer<typeof TheoristSchema>;

// --- 5.12 Theory -------------------------------------------------------
export const TheorySchema = z
  .object({
    _meta: META_CONCEPT,
    id: TheoryIdSchema,
    name: ShortText,
    summary: MediumText.optional(),
    primaryTheorist: TheoristIdSchema.optional(),
    extendsTheory: z.array(TheoryIdSchema).default([]),
    respondsTo: z.array(TheoryIdSchema).default([]),
  })
  .strict();
export type Theory = z.infer<typeof TheorySchema>;

// --- 5.13 Method -------------------------------------------------------
export const MethodSchema = z
  .object({
    _meta: META_METHOD,
    id: MethodIdSchema,
    paper: PaperIdSchema,
    name: ShortText, // "literary close-reading", "axiomatic-deductive"
    kind: z.enum([
      "qualitative",
      "quantitative",
      "mixed",
      "theoretical",
      "literary",
      "historical",
      "computational",
      "experimental",
    ]),
    procedure: LongText.optional(),
  })
  .strict();
export type Method = z.infer<typeof MethodSchema>;

// --- 5.14 Finding ------------------------------------------------------
export const FindingSchema = z
  .object({
    _meta: META_ARGUMENT,
    id: FindingIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema,
    statement: MediumText,
    supportedBy: z.array(EvidenceIdSchema).default([]),
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;

// --- 5.15 Limitation ---------------------------------------------------
// CHANGE v0.2: `scope` value renamed from "scope" → "applicability"
// (the field is named `scope`; the tautological value is gone).
export const LimitationSchema = z
  .object({
    _meta: META_ARGUMENT,
    id: LimitationIdSchema,
    paper: PaperIdSchema,
    statement: MediumText,
    scope: z
      .enum(["methodological", "empirical", "interpretive", "applicability"])
      .default("applicability"),
  })
  .strict();
export type Limitation = z.infer<typeof LimitationSchema>;

// --- 5.16 Footnote -----------------------------------------------------
export const FootnoteSchema = z
  .object({
    _meta: META_STRUCTURE,
    id: FootnoteIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema,
    label: ShortText, // "1", "12", "*"
    body: MediumText,
  })
  .strict();
export type Footnote = z.infer<typeof FootnoteSchema>;

// --- 5.17 Equation -----------------------------------------------------
// CHANGE v0.2: `doi` added (DataCite asset DOI). Refinement: at least
// one of {tex, mathml} must be present.
export const EquationSchema = z
  .object({
    _meta: META_MATH,
    id: EquationIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema.optional(),
    label: ShortText.optional(), // "(4.2)", "Eq. 17", "Lorentz"
    tex: MediumText.optional(),
    mathml: LongText.optional(),
    role: EquationRoleSchema,
    derivesFrom: z.array(EquationIdSchema).default([]), // chain
    fromPostulates: z.array(ClaimIdSchema).default([]), // postulate-driven derivations
    doi: Doi.optional(),
  })
  .strict()
  // Bridge-clean: single .refine() on the entity, no .superRefine.
  .refine((eq) => eq.tex !== undefined || eq.mathml !== undefined, {
    message:
      "Equation must have at least one of `tex` or `mathml`. JATS canonicalizes math as MathML; LaTeX is supported as alternate.",
    path: ["tex"],
  });
export type Equation = z.infer<typeof EquationSchema>;

// --- 5.18 Figure -------------------------------------------------------
// CHANGE v0.2: `doi` added (DataCite asset DOI).
export const FigureSchema = z
  .object({
    _meta: META_FIGURE,
    id: FigureIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema.optional(),
    label: ShortText, // "Fig. 4"
    caption: MediumText,
    page: z.number().int().positive().optional(),
    altText: MediumText.optional(), // accessibility
    imageRef: z.string().min(1).optional(), // dnis:Document or asset path
    doi: Doi.optional(),
  })
  .strict();
export type Figure = z.infer<typeof FigureSchema>;

// --- 5.19 Citation (NEW v0.2) -----------------------------------------
// Typed citation link from this paper (or a Claim/Finding within it) to
// a cited Work. Closes the gap that v0.1 had no way to encode oppositional
// or methodological citation relations across paper boundaries.
//
// Cardinality:
//   - At minimum, every Citation has `citedWork`.
//   - `citingClaim` and `citingFinding` are both optional. A Citation with
//     neither is "paper-level" — the paper as a whole cites Work W with
//     kind K. Useful for review/historical kinds.
//   - Both may be set if a Finding licensed by a Claim co-cites the same
//     Work; this is permitted (no mutual exclusion).
//   - `citedQuotation`, when present, refers to a Quotation drawn from
//     `citedWork`.
//
// CiTO 2.7 alignment: see CitationKindSchema. The "review-relevant"
// subset enforced by the review CEL rule is documented inline in
// RefinedAcademicPaperSchema.
export const CitationSchema = z
  .object({
    _meta: META_CITATION,
    id: CitationIdSchema,
    paper: PaperIdSchema,
    citingClaim: ClaimIdSchema.optional(),
    citingFinding: FindingIdSchema.optional(),
    citedWork: WorkIdSchema,
    citedQuotation: QuotationIdSchema.optional(),
    kind: CitationKindSchema,
    rationale: MediumText.optional(),
  })
  .strict();
export type Citation = z.infer<typeof CitationSchema>;

// --- 5.20 Funding (NEW v0.2) ------------------------------------------
// Paper-to-funder link. Aligns with JATS <funding-group>, Crossref
// `funder`, and DataCite `fundingReference`. CRediT
// `funding-acquisition` may be declared on contributing Authors via
// `Author.contributions`.
export const FundingSchema = z
  .object({
    _meta: META_FUNDING,
    id: FundingIdSchema,
    paper: PaperIdSchema,
    funderId: FunderId,
    funderName: ShortText,
    awardId: ShortText.optional(),
    awardTitle: ShortText.optional(),
    recipients: z.array(AuthorIdSchema).default([]),
  })
  .strict();
export type Funding = z.infer<typeof FundingSchema>;

/* =====================================================
 * 6. Bridge Schemas map
 *
 * These are the named exports the bridge consumes via
 * `assembleDomainProfile({ schemas })`. ID fields with regex patterns
 * become the primitive identity; cross-primitive ID references become
 * relations (the bridge classifier's Entity-vs-ValueObject heuristic).
 * ===================================================== */

export const Schemas = {
  Paper: PaperSchema,
  Author: AuthorSchema,
  Affiliation: AffiliationSchema,
  Section: SectionSchema,
  Claim: ClaimSchema,
  Evidence: EvidenceSchema,
  Quotation: QuotationSchema,
  Work: WorkSchema,
  Concept: ConceptSchema,
  Definition: DefinitionSchema,
  Theorist: TheoristSchema,
  Theory: TheorySchema,
  Method: MethodSchema,
  Finding: FindingSchema,
  Limitation: LimitationSchema,
  Footnote: FootnoteSchema,
  Equation: EquationSchema,
  Figure: FigureSchema,
  Citation: CitationSchema,
  Funding: FundingSchema,
} as const;

/* =====================================================
 * 7. Workbook-level top schema (structural root)
 * ===================================================== */

const META_ROOT = metaSchema(
  META_ROOT_VALUE.domainPath,
  META_ROOT_VALUE.register,
  META_ROOT_VALUE.authority,
).default(META_ROOT_VALUE);

export const AcademicPaperSchema = z
  .object({
    _meta: META_ROOT,
    paper: PaperSchema,
    authors: z.array(AuthorSchema).default([]),
    affiliations: z.array(AffiliationSchema).default([]),
    sections: z.array(SectionSchema).default([]),
    claims: z.array(ClaimSchema).default([]),
    evidence: z.array(EvidenceSchema).default([]),
    quotations: z.array(QuotationSchema).default([]),
    works: z.array(WorkSchema).default([]),
    concepts: z.array(ConceptSchema).default([]),
    definitions: z.array(DefinitionSchema).default([]),
    theorists: z.array(TheoristSchema).default([]),
    theories: z.array(TheorySchema).default([]),
    methods: z.array(MethodSchema).default([]),
    findings: z.array(FindingSchema).default([]),
    limitations: z.array(LimitationSchema).default([]),
    footnotes: z.array(FootnoteSchema).default([]),
    equations: z.array(EquationSchema).default([]),
    figures: z.array(FigureSchema).default([]),
    citations: z.array(CitationSchema).default([]),
    fundings: z.array(FundingSchema).default([]),
  })
  .strict();
export type AcademicPaper = z.infer<typeof AcademicPaperSchema>;

/* =====================================================
 * 8. Cross-cutting invariants (Refined root)
 *
 * Two classes of rules:
 *
 *  (A) referential integrity — every cross-primitive ID resolves
 *      inside the workbook;
 *  (B) kind-conditional required-ness — paper.epistemicMethod drives
 *      which collections must be non-empty (lifted to CEL by the bridge
 *      as `paper.epistemicMethod == X implies <expr>`).
 * ===================================================== */

// Citation kinds counted as "review-relevant" for the
// epistemicMethod=='review' invariant. A review paper must engage
// substantively with the works it cites — bare 'cites-for-information'
// or 'cites-as-related' do not count toward the breadth threshold.
const REVIEW_RELEVANT_CITATION_KINDS = new Set<CitationKind>([
  "reviews",
  "critiques",
  "agrees-with",
  "disagrees-with",
  "qualifies",
  "extends",
  "confirms",
  "refutes",
]);

export const RefinedAcademicPaperSchema = AcademicPaperSchema.superRefine(
  (root, ctx) => {
    const paperId = root.paper.id;
    const authorIds = new Set(root.authors.map((a) => a.id));
    const affilIds = new Set(root.affiliations.map((a) => a.id));
    const sectionIds = new Set(root.sections.map((s) => s.id));
    const claimIds = new Set(root.claims.map((c) => c.id));
    const evidenceIds = new Set(root.evidence.map((e) => e.id));
    const quotationIds = new Set(root.quotations.map((q) => q.id));
    const workIds = new Set(root.works.map((w) => w.id));
    const conceptIds = new Set(root.concepts.map((c) => c.id));
    const theoristIds = new Set(root.theorists.map((t) => t.id));
    const theoryIds = new Set(root.theories.map((t) => t.id));
    const findingIds = new Set(root.findings.map((f) => f.id));

    // -- (A) referential integrity ----------------------------------
    const reportMissing = (
      path: (string | number)[],
      kind: string,
      id: string,
    ) =>
      ctx.addIssue({
        code: "custom",
        path,
        message: `unresolved ${kind} reference: ${id}`,
      });

    root.authors.forEach((a, i) => {
      if (a.paper !== paperId)
        reportMissing(["authors", i, "paper"], "paper", a.paper);
      a.affiliations.forEach((aff, j) => {
        if (!affilIds.has(aff))
          reportMissing(
            ["authors", i, "affiliations", j],
            "affiliation",
            aff,
          );
      });
    });

    root.sections.forEach((s, i) => {
      if (s.paper !== paperId)
        reportMissing(["sections", i, "paper"], "paper", s.paper);
      if (s.parent && !sectionIds.has(s.parent))
        reportMissing(["sections", i, "parent"], "section", s.parent);
    });

    root.claims.forEach((c, i) => {
      if (c.paper !== paperId)
        reportMissing(["claims", i, "paper"], "paper", c.paper);
      if (!sectionIds.has(c.section))
        reportMissing(["claims", i, "section"], "section", c.section);
      c.derivesFrom.forEach((d, j) => {
        if (!claimIds.has(d))
          reportMissing(["claims", i, "derivesFrom", j], "claim", d);
      });
      c.counterReads.forEach((d, j) => {
        if (!claimIds.has(d))
          reportMissing(["claims", i, "counterReads", j], "claim", d);
      });
    });

    root.evidence.forEach((e, i) => {
      if (e.paper !== paperId)
        reportMissing(["evidence", i, "paper"], "paper", e.paper);
      e.supports.forEach((c, j) => {
        if (!claimIds.has(c))
          reportMissing(["evidence", i, "supports", j], "claim", c);
      });
      if (e.quotation && !quotationIds.has(e.quotation))
        reportMissing(
          ["evidence", i, "quotation"],
          "quotation",
          e.quotation,
        );
      if (e.work && !workIds.has(e.work))
        reportMissing(["evidence", i, "work"], "work", e.work);
    });

    root.quotations.forEach((q, i) => {
      if (q.paper !== paperId)
        reportMissing(["quotations", i, "paper"], "paper", q.paper);
      if (q.section && !sectionIds.has(q.section))
        reportMissing(["quotations", i, "section"], "section", q.section);
      if (!workIds.has(q.quotesFrom))
        reportMissing(
          ["quotations", i, "quotesFrom"],
          "work",
          q.quotesFrom,
        );
      if (q.translatedFrom && !quotationIds.has(q.translatedFrom))
        reportMissing(
          ["quotations", i, "translatedFrom"],
          "quotation",
          q.translatedFrom,
        );
    });

    // Works: validate translationOf / editionOf and forbid self-loops.
    // Cycle detection across the whole graph is left to a cap:expr
    // helper (`acyclic(works, "translationOf")`); here we only catch
    // self-references and dangling refs.
    root.works.forEach((w, i) => {
      if (w.translationOf) {
        if (w.translationOf === w.id)
          ctx.addIssue({
            code: "custom",
            path: ["works", i, "translationOf"],
            message: "Work cannot be a translation of itself",
          });
        else if (!workIds.has(w.translationOf))
          reportMissing(
            ["works", i, "translationOf"],
            "work",
            w.translationOf,
          );
      }
      if (w.editionOf) {
        if (w.editionOf === w.id)
          ctx.addIssue({
            code: "custom",
            path: ["works", i, "editionOf"],
            message: "Work cannot be an edition of itself",
          });
        else if (!workIds.has(w.editionOf))
          reportMissing(["works", i, "editionOf"], "work", w.editionOf);
      }
    });

    root.concepts.forEach((c, i) => {
      c.borrowsFrom.forEach((t, j) => {
        if (!theoristIds.has(t))
          reportMissing(["concepts", i, "borrowsFrom", j], "theorist", t);
      });
      c.extends.forEach((cc, j) => {
        if (!conceptIds.has(cc))
          reportMissing(["concepts", i, "extends", j], "concept", cc);
      });
    });

    root.definitions.forEach((d, i) => {
      if (d.paper !== paperId)
        reportMissing(["definitions", i, "paper"], "paper", d.paper);
      if (!conceptIds.has(d.concept))
        reportMissing(["definitions", i, "concept"], "concept", d.concept);
      if (!sectionIds.has(d.section))
        reportMissing(["definitions", i, "section"], "section", d.section);
      if (d.citedFrom && !workIds.has(d.citedFrom))
        reportMissing(
          ["definitions", i, "citedFrom"],
          "work",
          d.citedFrom,
        );
    });

    root.theories.forEach((t, i) => {
      if (t.primaryTheorist && !theoristIds.has(t.primaryTheorist))
        reportMissing(
          ["theories", i, "primaryTheorist"],
          "theorist",
          t.primaryTheorist,
        );
      t.extendsTheory.forEach((tt, j) => {
        if (!theoryIds.has(tt))
          reportMissing(["theories", i, "extendsTheory", j], "theory", tt);
      });
      t.respondsTo.forEach((tt, j) => {
        if (!theoryIds.has(tt))
          reportMissing(["theories", i, "respondsTo", j], "theory", tt);
      });
    });

    root.methods.forEach((m, i) => {
      if (m.paper !== paperId)
        reportMissing(["methods", i, "paper"], "paper", m.paper);
    });

    root.findings.forEach((f, i) => {
      if (f.paper !== paperId)
        reportMissing(["findings", i, "paper"], "paper", f.paper);
      if (!sectionIds.has(f.section))
        reportMissing(["findings", i, "section"], "section", f.section);
      f.supportedBy.forEach((e, j) => {
        if (!evidenceIds.has(e))
          reportMissing(["findings", i, "supportedBy", j], "evidence", e);
      });
    });

    root.equations.forEach((eq, i) => {
      if (eq.paper !== paperId)
        reportMissing(["equations", i, "paper"], "paper", eq.paper);
      if (eq.section && !sectionIds.has(eq.section))
        reportMissing(
          ["equations", i, "section"],
          "section",
          eq.section,
        );
      eq.derivesFrom.forEach((dd, j) => {
        if (!new Set(root.equations.map((e) => e.id)).has(dd))
          reportMissing(
            ["equations", i, "derivesFrom", j],
            "equation",
            dd,
          );
      });
      eq.fromPostulates.forEach((pc, j) => {
        if (!claimIds.has(pc))
          reportMissing(
            ["equations", i, "fromPostulates", j],
            "claim",
            pc,
          );
      });
    });

    root.figures.forEach((fg, i) => {
      if (fg.paper !== paperId)
        reportMissing(["figures", i, "paper"], "paper", fg.paper);
      if (fg.section && !sectionIds.has(fg.section))
        reportMissing(["figures", i, "section"], "section", fg.section);
    });

    // Citation ref-integrity (NEW v0.2)
    root.citations.forEach((ci, i) => {
      if (ci.paper !== paperId)
        reportMissing(["citations", i, "paper"], "paper", ci.paper);
      if (ci.citingClaim && !claimIds.has(ci.citingClaim))
        reportMissing(
          ["citations", i, "citingClaim"],
          "claim",
          ci.citingClaim,
        );
      if (ci.citingFinding && !findingIds.has(ci.citingFinding))
        reportMissing(
          ["citations", i, "citingFinding"],
          "finding",
          ci.citingFinding,
        );
      if (!workIds.has(ci.citedWork))
        reportMissing(
          ["citations", i, "citedWork"],
          "work",
          ci.citedWork,
        );
      if (ci.citedQuotation && !quotationIds.has(ci.citedQuotation))
        reportMissing(
          ["citations", i, "citedQuotation"],
          "quotation",
          ci.citedQuotation,
        );
    });

    // Funding ref-integrity (NEW v0.2)
    root.fundings.forEach((fu, i) => {
      if (fu.paper !== paperId)
        reportMissing(["fundings", i, "paper"], "paper", fu.paper);
      fu.recipients.forEach((a, j) => {
        if (!authorIds.has(a))
          reportMissing(
            ["fundings", i, "recipients", j],
            "author",
            a,
          );
      });
    });

    // Author count must be ≥ 1 (paper-level invariant).
    if (root.authors.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["authors"],
        message: "paper must have at least one Author",
      });

    // Every Author must have ≥1 Affiliation (academic norm).
    root.authors.forEach((a, i) => {
      if (a.affiliations.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["authors", i, "affiliations"],
          message: "every Author must declare at least one Affiliation",
        });
    });

    // Every Concept used in a Claim must be either defined inside this
    // paper OR borrowed-from a Theorist.
    const definedConcepts = new Set(
      root.definitions.map((d) => d.concept),
    );
    root.concepts.forEach((c, i) => {
      const hasDefinition = definedConcepts.has(c.id);
      const hasBorrow = c.borrowsFrom.length > 0;
      if (!hasDefinition && !hasBorrow)
        ctx.addIssue({
          code: "custom",
          path: ["concepts", i],
          message:
            "Concept must either have a Definition in this paper or a borrowsFrom→Theorist link",
        });
    });

    // -- (B) kind-conditional required-ness --------------------------
    // CHANGE v0.2: rules are gated on `paper.epistemicMethod`, not the
    // old `paper.kind` (which mixed method with format).
    const method = root.paper.epistemicMethod;

    if (method === "theoretical" && root.equations.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["equations"],
        message:
          "paper.epistemicMethod == 'theoretical' requires at least one Equation",
      });
    }

    if (method === "empirical") {
      // Strengthened in v0.2: require both a hypothesis Claim AND an
      // empirical Claim supported by data Evidence.
      const hasHypothesis = root.claims.some(
        (c) => c.kind === "hypothesis",
      );
      if (!hasHypothesis)
        ctx.addIssue({
          code: "custom",
          path: ["claims"],
          message:
            "paper.epistemicMethod == 'empirical' requires ≥1 Claim of kind 'hypothesis'",
        });
      const empiricalClaims = root.claims.filter(
        (c) => c.kind === "empirical",
      );
      const hasDataSupport = empiricalClaims.some((c) =>
        root.evidence.some(
          (e) => e.supports.includes(c.id) && e.kind === "data",
        ),
      );
      if (!hasDataSupport)
        ctx.addIssue({
          code: "custom",
          path: ["claims"],
          message:
            "paper.epistemicMethod == 'empirical' requires ≥1 empirical Claim supported by Evidence of kind 'data'",
        });
    }

    if (method === "literary-critical" && root.quotations.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quotations"],
        message:
          "paper.epistemicMethod == 'literary-critical' requires at least one Quotation",
      });
    }

    if (method === "review") {
      // CHANGE v0.2: count distinct Citations of "review-relevant"
      // kinds, not the old proxy of (quotations ∪ evidence.work ∪
      // definitions.citedFrom). A review must engage substantively
      // with the works it cites; bare 'cites-for-information' or
      // 'cites-as-related' do not count toward breadth.
      const reviewedWorkIds = new Set<string>();
      root.citations.forEach((ci) => {
        if (REVIEW_RELEVANT_CITATION_KINDS.has(ci.kind))
          reviewedWorkIds.add(ci.citedWork);
      });
      if (reviewedWorkIds.size < 10)
        ctx.addIssue({
          code: "custom",
          path: ["citations"],
          message:
            "paper.epistemicMethod == 'review' requires ≥10 distinct cited Works across Citations of kind ∈ {reviews, critiques, agrees-with, disagrees-with, qualifies, extends, confirms, refutes}",
        });
    }

    if (method === "historical") {
      const hasObservationOrData = root.evidence.some(
        (e) => e.kind === "observation" || e.kind === "data",
      );
      if (!hasObservationOrData)
        ctx.addIssue({
          code: "custom",
          path: ["evidence"],
          message:
            "paper.epistemicMethod == 'historical' requires ≥1 Evidence of kind 'observation' or 'data'",
        });
    }
  },
);
export type RefinedAcademicPaper = z.infer<
  typeof RefinedAcademicPaperSchema
>;