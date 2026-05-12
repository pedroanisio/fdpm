/**
 * academic-paper.ts
 *
 * Academic paper schema — v0.4.1
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
 * Out of scope (v0.3): peer-review records, dataset metadata details,
 * edition lineage for multi-printing monographs (deferred to a sibling
 * `fdpm.monograph` profile), W3C Web Annotations Data Model. Note:
 * minimal edition/translation linkage (`Work.translationOf`,
 * `Work.editionOf`, plus the `PaperRelation` primitive) is supported as
 * a flat sibling-link rather than a full FRBR Work/Expression split.
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
 * CHANGELOG (v0.2.0 → v0.3.0)
 *   P0 (audit B.2, B.3, B.4, B.8):
 *   - FIXED: META_CITATION_VALUE.authority now reads "CiTO 2.8.1"
 *     (was "CiTO 2.7" — wrong version label; CiTO has been at 2.8.1
 *     since Feb 2018).
 *   - NEW fields `Paper.publicationDate` (ISO-8601), `Paper.version`
 *     (NISO RP-8-2008 JAV: author-original / submitted-manuscript-
 *     under-review / accepted-manuscript / proof / version-of-record
 *     / corrected-version-of-record / enhanced-version-of-record).
 *   - NEW field `Author.position` ("first" | "middle" | "last").
 *     Workbook invariant: at most one Author per paper has
 *     position='first', and at most one has position='last'.
 *   - NEW primitive `Table` (parallel to Figure): JATS <table-wrap>
 *     equivalent with rowCount/columnCount/headerRows + asset DOI +
 *     captionLanguage.
 *
 *   P1 (audit B.1, B.2, B.5, B.7, C.1):
 *   - NEW primitive `Funder` (id, name, registryId for ROR/Crossref
 *     Funder Registry DOI). The v0.2 `Funding.funderId` and
 *     `Funding.funderName` inline fields are REMOVED; `Funding.funder`
 *     now FKs to Funder. This is a breaking change but normalizes
 *     funder identity and aligns with JATS <funding-source> /
 *     OpenAlex Funder / DataCite fundingReference.
 *   - NEW primitive `PaperRelation` for paper-to-paper-or-Work
 *     relations (companion-of, commentary-on, correction-of,
 *     response-to, reply-to-letter, retraction-of, republication-of,
 *     translation-of, addendum-to). Subset of JATS @related-article-type.
 *   - NEW CitationKind values: `cites-as-data-source`,
 *     `cites-as-evidence`, `obtains-support-from`,
 *     `uses-conclusions-from`. Documented citing→cited direction in
 *     a comment block above CitationKindSchema. (CiTO 2.8.1 has ~40+
 *     forward predicates; v0.3 covers 23. Niche predicates like
 *     plagiarizes / parodies / ridicules / speculatesOn / derides
 *     remain deferred.)
 *   - NEW field `Section.language` (defaults to Paper.language at
 *     read-time via the bridge; `Iso639.optional()` here). Same field
 *     added to `Footnote`, `Figure` (as `captionLanguage`), and
 *     `Table` (as `captionLanguage`). Aligns with JATS 1.4
 *     multi-language attributes.
 *   - NEW fields `Citation.citingLocator`, `Citation.citingSection`
 *     (SPAR C4O alignment — captures *where* in the citing paper a
 *     citation appears).
 *
 *   P2 (audit B.6, §3.8 follow-on):
 *   - Transitive cycle detection (DFS) added on six relations:
 *     Section.parent, Concept.extends, Equation.derivesFrom,
 *     Theory.extendsTheory, Claim.derivesFrom, Work.translationOf,
 *     Work.editionOf. Detection is colocated on
 *     RefinedAcademicPaperSchema; cycle paths are reported in the
 *     issue message.
 *   - NEW field `Concept.closeMatch: URL[]` for SKOS-style
 *     cross-vocabulary linking (Wikidata + DBpedia + LoC, etc.).
 *
 * Deferred to v0.5 (P3 from audit + carried over from v0.4):
 *   - Propagate PALS's LAW omission rule to Definition.body and
 *     Evidence.summary.
 *   - Full SPAR PRO Publishing Roles (role-in-time semantics).
 *   - Full FRBR Work/Expression/Manifestation/Item split.
 *
 * CHANGELOG (v0.4.0 → v0.4.1) — parity with rev3 SHACL fix patch:
 *   The SHACL mirror (static/schemas/scientific-paper-cwa-shacl-rev3.ttl)
 *   gained two transitive cycle shapes in 2026-05-12 that closed coverage
 *   gaps in the typed-graph integrity layer:
 *
 *     - ap:ClaimSupersededByCycleShape  (Claim → Claim cycles via
 *       supersededBy). The v0.4.0 TS caught self-loops on
 *       Claim.supersededBy but not transitive cycles A→B→A. Multi-step
 *       supersession is rare in practice but the asymmetry meant a
 *       SHACL-validated workbook would catch what a TS-validated one
 *       missed.
 *     - ap:QuotationTranslatedFromCycleShape  (Quotation → Quotation
 *       cycles via translatedFrom). The v0.4.0 TS caught dangling
 *       translatedFrom refs but neither self-loops nor transitive
 *       cycles.
 *
 *   v0.4.1 adds parallel DFS-based cycle detection in
 *   `RefinedAcademicPaperSchema` (block 8 for supersededBy, block 9 for
 *   translatedFrom) using the existing `findCycleInRelation` helper. The
 *   Quotation per-record loop now also rejects translatedFrom self-loops
 *   in parallel with the existing Work.translationOf / Work.editionOf
 *   handling.
 *
 *   NON-BREAKING posture: workbooks valid under v0.4.0 remain valid
 *   under v0.4.1 unless they contained a previously-undetected
 *   supersededBy or translatedFrom cycle — in which case the schema
 *   was wrong to admit them.
 *
 * CHANGELOG (v0.3.1 → v0.4.0) — correction lifecycle + hypothesis closure:
 *   NEW primitive `Erratum` (§5.24). Within-paper corrigendum /
 *   retraction / expression-of-concern / addendum / erratum notice.
 *   Aligned with NISO STM Article Versions correction lifecycle and
 *   Crossmark update-type taxonomy. Each Erratum is scoped to a single
 *   Paper and may point to one or more of: Section, Claim, Finding,
 *   Equation (via the new `correctsSection` / `correctsClaim` /
 *   `correctsFinding` / `correctsEquation` ID-FK fields). A non-
 *   retraction Erratum must reference at least one of the four
 *   `corrects*` fields (entity-level refine); retraction notices may
 *   be authored without per-element targets because they nullify the
 *   paper wholesale.
 *
 *   NEW enums:
 *     - `ClaimLifecycleStatusSchema` (asserted / assumed / proven /
 *       refuted / superseded). Default 'asserted'. Lets a workbook
 *       carry the historical trajectory of a claim across
 *       corrigendum / retraction / supersession boundaries without
 *       deleting the original claim record.
 *     - `FindingOutcomeSchema` (supports / refutes / inconclusive /
 *       partial). Pairs with the new `Finding.testsHypothesis` field
 *       so empirical workbooks can close the loop between a
 *       hypothesis Claim and its experimental outcome.
 *     - `ErratumKindSchema` (correction / erratum / retraction /
 *       expression-of-concern / addendum).
 *
 *   NEW fields:
 *     - `Claim.lifecycleStatus` (default 'asserted').
 *     - `Claim.supersededBy` (optional Claim-FK).
 *     - `Finding.testsHypothesis` (optional Claim-FK).
 *     - `Finding.outcome` (optional FindingOutcome enum).
 *     - `AcademicPaperSchema.errata: Erratum[]` (default []).
 *
 *   NEW refined-root invariants:
 *     1. Every `Claim.supersededBy` must resolve to an existing Claim
 *        ID; self-loops are rejected.
 *     2. Every `Finding.testsHypothesis` must resolve to a Claim of
 *        `kind === 'hypothesis'`.
 *     3. Every hypothesis Claim must be referenced by at least one
 *        `Finding.testsHypothesis` (empirical closure rule). Triggers
 *        only when `paper.epistemicMethod ∈ {empirical, theoretical,
 *        historical}`; descriptive / literary-critical / review /
 *        position-paper papers exempt.
 *     4. Every `Erratum.correctsSection`/`correctsClaim`/
 *        `correctsFinding`/`correctsEquation` must resolve within the
 *        same paper.
 *
 *   KIND-CONDITIONAL CEL extended:
 *     - paper.epistemicMethod == 'empirical' ⇒ hypothesis-Finding
 *       closure rule (rule 3 above) now applies in addition to the
 *       existing empirical evidence rule.
 *
 *   NON-BREAKING posture: all new fields are optional or have
 *   defaults. Workbooks valid under v0.3.1 remain valid under v0.4.0
 *   unless they had a hypothesis Claim and were authored under an
 *   epistemic method that now requires Finding closure — in which
 *   case the workbook must add a Finding linking back. This is the
 *   intended migration cost.
 *
 * CHANGELOG (v0.3.0 → v0.3.1) — review-pass cleanup, no new primitives:
 *   - RESTORED: `descriptive` value in `PaperEpistemicMethodSchema`
 *     (originally added v0.2 review-pass; silently dropped during the
 *     v0.3 rewrite). Covers exploratory/observational empirical work
 *     without a pre-registered hypothesis. Empirical CEL rule remains
 *     strict; descriptive papers bypass it intentionally.
 *   - FIXED stale `CiTO 2.7` in the _meta envelope's introductory
 *     comment (META_CITATION_VALUE.authority was already correctly
 *     `CiTO 2.8.1` in v0.3.0; only the §1 comment lagged).
 *   - FIXED Section 5 header comment count: 20 → 23 to reflect
 *     Funder + Table + PaperRelation additions.
 *   - MERGED two fragmented `root.citations.forEach` blocks in the
 *     Refined root into a single pass (v0.3.0 added a separate walk
 *     just to check citingSection).
 *   - DROPPED misleading `path: ["tex"]` from the Equation
 *     `tex|mathml` refine — either field satisfies, so anchoring to
 *     `tex` was confusing when only `mathml` was the intended path.
 *   - CLARIFIED in PaperRelation docstring the relationship between
 *     `PaperRelation{kind:"translation-of"}` (paper-level Crossmark
 *     metadata) and `Work.translationOf` (bibliographic spine). Both
 *     may be populated when the workbook is comprehensive; prefer
 *     `Work.translationOf` for the catalogue facet.
 *   - ADDED Refined-root cross-check
 *     `paper.publicationDate.year == paper.year` (when both are set).
 *     Disagreement is almost always a copy-paste hallucination.
 *   - RELAXED `Funder.registryId` from required to optional, paired
 *     with a paper-coherence WARNING (not error) when the field is
 *     absent. Lets niche funders (university seed grants, family
 *     foundations) be modeled while preserving PALS's LAW posture:
 *     gaps are declared, never hidden.
 *
 * KIND-CONDITIONAL CEL (locked v0.4.0)
 *   - paper.epistemicMethod == 'theoretical'      ⇒ count(equations) > 0
 *   - paper.epistemicMethod == 'empirical'        ⇒ (∃ claim of kind
 *                                                    'hypothesis') AND
 *                                                   (∃ claim of kind
 *                                                    'empirical' with ∃
 *                                                    supporting
 *                                                    evidence of kind
 *                                                    'data')
 *   - paper.epistemicMethod == 'descriptive'      ⇒ NO required-ness
 *                                                   (intentional —
 *                                                    descriptive papers
 *                                                    observe and describe
 *                                                    rather than test;
 *                                                    a `descriptive`
 *                                                    epistemic method
 *                                                    relaxes the
 *                                                    hypothesis gate that
 *                                                    `empirical` enforces)
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
 * BRIDGE-CLEAN CONVENTIONS (unchanged)
 *   - every primitive is a plain `z.object(...).strict()` — no
 *     `.transform`, no `.pipe`, no primitive-level `.superRefine`;
 *   - cross-axis invariants colocate on `RefinedAcademicPaperSchema`;
 *   - kind-conditional required-ness rules live on the Refined root and
 *     are lifted to CEL as `paper.epistemicMethod == X implies <expr>`;
 *   - IDs are plain `z.string().regex(...)` with kebab-case prefixes;
 *   - no `z.discriminatedUnion`.
 *
 * Generated by: Claude Opus 4.7 (1M context) via Claude Code
 * Date: 2026-05-11
 */

import { z } from "zod";

/* =====================================================
 * 1. _meta envelope
 *
 * Every primitive carries the FDPM ontological _meta triple. Authority
 * strings reference real-world conventions (ISO 639-1, DOI Handbook,
 * CSL 1.0.2, BibTeX, JATS-XML, ISBN ISO 2108, MathML 3.0, ORCID,
 * Crossref REST API, SPAR CiTO 2.8.1, NISO CRediT 1.0, NISO RP-8-2008
 * JAV, Crossref Funder Registry, ROR, Wikidata, VIAF, SKOS, DataCite).
 * Authors normally omit _meta and let the default inject at parse time.
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
    "CSL 1.0.2, BibTeX, ISO 690, APA 7, MLA 9, Chicago 17, SPAR CiTO 2.8.1",
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

// Funder registry identifier: accepts either a Crossref Funder Registry
// DOI (10.13039/<digits>) or a ROR URL. The Crossref Funder Registry
// has been migrating to ROR, so OpenAlex unifies these; we accept both.
// (Renamed from `FunderId` in v0.3 to disambiguate from the new
// FunderIdSchema primitive ID.)
const FunderRegistryId = z
  .string()
  .regex(
    /^(?:https:\/\/ror\.org\/0[a-z0-9]{6}\d{2}|10\.13039\/[0-9]+)$/,
    {
      message:
        "registryId must be either a ROR URL (https://ror.org/...) or a Crossref Funder Registry DOI (10.13039/...)",
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
export const FunderIdSchema = z.string().regex(/^funder-[a-z0-9-]+$/);
export const TableIdSchema = z.string().regex(/^table-[a-z0-9-]+$/);
export const PaperRelationIdSchema = z
  .string()
  .regex(/^prel-[a-z0-9-]+$/);
// v0.4 (NEW): Erratum — within-paper corrigendum / retraction / errata
// record. Distinct from PaperRelation{kind:"retraction-of"} which links
// THIS paper to a different Work; Erratum is the internal fix-up trace.
export const ErratumIdSchema = z.string().regex(/^erratum-[a-z0-9-]+$/);

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
//
// `descriptive` (v0.2 review-pass, restored in v0.3.1) covers
// exploratory / observational empirical work that does not pre-register
// a hypothesis: ethnographies, cross-sectional surveys, corpus studies,
// descriptive cohort studies, replication papers without
// hypothesis-pre-registration. The empirical CEL rule does NOT apply
// to descriptive — it imposes no required-ness, on purpose.
// Use `descriptive` when the paper observes-and-describes rather than
// tests-a-hypothesis; use `empirical` when there is a falsifiable
// hypothesis the paper licenses with data.
export const PaperEpistemicMethodSchema = z.enum([
  "empirical",
  "descriptive",
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

// v0.4 (NEW): Lifecycle status for a Claim.
//   asserted   - default; the paper currently makes this claim
//   assumed    - taken without proof (axiom, working assumption)
//   proven     - established by derivation or accepted evidence
//   refuted    - established as false by later work or internal argument
//   superseded - replaced by a different claim (must set `supersededBy`)
// Default 'asserted' keeps existing data compatible.
export const ClaimLifecycleStatusSchema = z.enum([
  "asserted",
  "assumed",
  "proven",
  "refuted",
  "superseded",
]);
export type ClaimLifecycleStatus = z.infer<
  typeof ClaimLifecycleStatusSchema
>;

// v0.4 (NEW): Outcome of a Finding with respect to a hypothesis it tests.
// Optional — only meaningful when `Finding.testsHypothesis` is set.
export const FindingOutcomeSchema = z.enum([
  "supports",
  "refutes",
  "inconclusive",
  "partial",
]);
export type FindingOutcome = z.infer<typeof FindingOutcomeSchema>;

// v0.4 (NEW): Erratum kind. Aligned with NISO STM erratum/corrigendum
// vocabulary and the relevant JATS @related-article-type values
// (correction, retraction, expression-of-concern, addendum) restricted
// to the within-paper case.
export const ErratumKindSchema = z.enum([
  "correction",
  "erratum",
  "retraction",
  "expression-of-concern",
  "addendum",
]);
export type ErratumKind = z.infer<typeof ErratumKindSchema>;

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

// CiTO 2.8.1-aligned subset (SPAR Citation Typing Ontology). Covers 23
// of CiTO 2.8.1's ~40+ forward predicates — the most common in
// scholarly practice. Niche predicates (plagiarizes, parodies,
// ridicules, speculatesOn, derides, corrects, disputes, credits,
// describes, discusses, documents, linksTo, containsAssertionFrom,
// givesBackgroundTo, citesAsMetadataDocument, citesAsSourceDocument,
// citesAsRecommendedReading, citesAsPotentialSolution) are deferred.
//
// DIRECTIONAL SEMANTICS (citing → cited):
//   Per CiTO, every sub-property of cito:cites characterizes the
//   relation FROM the citing entity TO the cited entity. So for a
//   Citation { citingClaim: C, citedWork: W, kind: K }, K describes
//   what *this paper's Claim C* does to *cited Work W*:
//     - 'supports'                  → C provides intellectual support FOR W
//     - 'obtains-support-from'      → C draws its support FROM W (common direction)
//     - 'extends'                   → C extends W
//     - 'refutes'                   → C refutes a claim of W
//     - 'uses-method-of'            → C uses W's methodology
//     - 'uses-data-of'              → C uses W's data
//     - 'cites-as-data-source'      → W is cited as a data source by C
//     - 'cites-as-evidence'         → W is cited as evidence by C
//     - 'obtains-background-from'   → C uses W as background literature
//     - 'uses-conclusions-from'     → C uses W's conclusions as input
//   When in doubt, the question to ask is: "does the *citing*
//   paper do this to the *cited* one?". If yes, the kind fits.
export const CitationKindSchema = z.enum([
  "extends",
  "disagrees-with",
  "agrees-with",
  "confirms",
  "refutes",
  "uses-method-of",
  "uses-data-of",
  "obtains-background-from",
  "obtains-support-from",
  "uses-conclusions-from",
  "qualifies",
  "reviews",
  "critiques",
  "compiles",
  "supports",
  "cites-as-authority",
  "cites-as-data-source",
  "cites-as-evidence",
  "cites-as-related",
  "cites-for-information",
  "replies-to",
  "updates",
  "retracts",
]);
export type CitationKind = z.infer<typeof CitationKindSchema>;

// NISO RP-8-2008 Journal Article Versions (JAV). Used by JATS 1.4 via
// <article-version vocab="JAV" .../>, and by Crossref. The full set of
// JAV labels:
//   AO    - Author's Original
//   SMUR  - Submitted Manuscript Under Review
//   AM    - Accepted Manuscript
//   P     - Proof
//   VoR   - Version of Record
//   CVoR  - Corrected Version of Record
//   EVoR  - Enhanced Version of Record
export const PaperVersionSchema = z.enum([
  "author-original",
  "submitted-manuscript-under-review",
  "accepted-manuscript",
  "proof",
  "version-of-record",
  "corrected-version-of-record",
  "enhanced-version-of-record",
]);
export type PaperVersion = z.infer<typeof PaperVersionSchema>;

// Author position in the byline. Aligns with OpenAlex
// `authorships[].author_position` and Crossref's `sequence` field
// ("first" | "additional", which we expand to "first" | "middle" |
// "last" because "last author" carries semantic weight in many
// disciplines). Workbook invariant: at most one author per paper has
// position='first', and at most one has position='last'.
export const AuthorPositionSchema = z.enum(["first", "middle", "last"]);
export type AuthorPosition = z.infer<typeof AuthorPositionSchema>;

// Paper-to-Work relations (subset of JATS 1.4 @related-article-type,
// normalized to "X-of/-on/-to" suffixes for unambiguous direction). The
// `paper` field is always the citing/relating paper; the `relatedWork`
// is what the relation points to.
//   companion-of      - this paper is a companion to the related Work
//   commentary-on     - this paper is a commentary on the related Work
//   correction-of     - this paper corrects the related Work
//   response-to       - this paper responds to the related Work
//   reply-to-letter   - this paper is a reply to a letter (related Work)
//   retraction-of     - this paper retracts the related Work
//   republication-of  - this paper is a republication of the related Work
//   translation-of    - this paper is a translation of the related Work
//   addendum-to       - this paper is an addendum to the related Work
export const PaperRelationKindSchema = z.enum([
  "companion-of",
  "commentary-on",
  "correction-of",
  "response-to",
  "reply-to-letter",
  "retraction-of",
  "republication-of",
  "translation-of",
  "addendum-to",
]);
export type PaperRelationKind = z.infer<typeof PaperRelationKindSchema>;

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
 * 5. Primitives (23 total in v0.3; v0.2 added Citation+Funding to the
 *    v0.1 set of 18; v0.3 added Funder+Table+PaperRelation.)
 * ===================================================== */

// --- 5.1 Paper ----------------------------------------------------------
// CHANGE v0.2: `kind` removed; replaced by `epistemicMethod` + `format`.
// `year` lower bound lowered from 1400 to 0 (matches Work.year).
// CHANGE v0.3: `publicationDate` (ISO 8601) and `version` (NISO JAV)
// added.
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
    publicationDate: IsoDate.optional(),
    version: PaperVersionSchema.optional(),
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
// CHANGE v0.3: `position` added ("first" | "middle" | "last"). Workbook
// invariant: at most one Author per paper has position='first', and at
// most one has position='last' (see RefinedAcademicPaperSchema).
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
    position: AuthorPositionSchema.optional(),
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
// CHANGE v0.3: `language` added (JATS 1.4 multi-language attribute).
// When omitted, the bridge defaults to Paper.language at read-time.
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
    language: Iso639.optional(),
  })
  .strict();
export type Section = z.infer<typeof SectionSchema>;

// --- 5.5 Claim ---------------------------------------------------------
// CHANGE v0.2: `kind` enum picks up 'hypothesis' (see ClaimKindSchema).
// CHANGE v0.4: `lifecycleStatus` and `supersededBy` added so claims can
// carry an explicit lifecycle (asserted / assumed / proven / refuted /
// superseded). Default 'asserted' preserves prior data. When the status
// is 'superseded', `supersededBy` must point to another Claim within the
// paper (referential integrity enforced by RefinedAcademicPaperSchema).
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
    lifecycleStatus: ClaimLifecycleStatusSchema.default("asserted"),
    supersededBy: ClaimIdSchema.optional(),
  })
  .strict()
  // Bridge-clean: a single .refine() on the entity itself.
  // When lifecycleStatus='superseded', supersededBy MUST be present.
  // When lifecycleStatus!='superseded', supersededBy SHOULD be absent
  // (we allow it to remain, but the Refined root walker emits a warning
  // because a dangling pointer is informational, not a bug).
  .refine(
    (c) =>
      c.lifecycleStatus !== "superseded" || c.supersededBy !== undefined,
    {
      message:
        "Claim.lifecycleStatus='superseded' requires `supersededBy` to point to the replacing Claim.",
      path: ["supersededBy"],
    },
  );
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
// CHANGE v0.3: `closeMatch: URL[]` added for SKOS-style multi-vocabulary
// linking (Wikidata + DBpedia + LoC + GND, etc.). Each URL should
// dereference to a concept in another vocabulary that this Concept
// approximately matches.
export const ConceptSchema = z
  .object({
    _meta: META_CONCEPT,
    id: ConceptIdSchema,
    label: ShortText, // "rasura", "Lorentz transformation", "counter-gaze"
    canonicalForm: ShortText.optional(), // disambiguation key
    domain: ShortText.optional(), // "literary criticism", "physics", ...
    wikidataId: WikidataQid.optional(),
    closeMatch: z.array(z.string().url()).default([]),
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
// CHANGE v0.4: `testsHypothesis` and `outcome` added so empirical
// findings can close the loop with a `kind='hypothesis'` Claim. The
// paper-coherence walker enforces that, on `epistemicMethod='empirical'`
// papers, every hypothesis-Claim is referenced by at least one Finding,
// and that `outcome` is one of supports/refutes/inconclusive/partial.
export const FindingSchema = z
  .object({
    _meta: META_ARGUMENT,
    id: FindingIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema,
    statement: MediumText,
    supportedBy: z.array(EvidenceIdSchema).default([]),
    testsHypothesis: ClaimIdSchema.optional(),
    outcome: FindingOutcomeSchema.optional(),
  })
  .strict()
  // Bridge-clean: a single .refine() on the entity itself.
  // If `outcome` is set, `testsHypothesis` must also be set (an outcome
  // is only meaningful against a specific hypothesis). The reverse
  // implication (testsHypothesis present → outcome present) is enforced
  // as a WARNING by the paper-coherence walker, not at primitive level,
  // because a freshly-recorded test may not yet have a determined outcome.
  .refine(
    (f) => f.outcome === undefined || f.testsHypothesis !== undefined,
    {
      message:
        "Finding.outcome is set without `testsHypothesis`. An outcome is only meaningful against a specific hypothesis Claim.",
      path: ["testsHypothesis"],
    },
  );
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
// CHANGE v0.3: `language` added (JATS 1.4 multi-lang).
export const FootnoteSchema = z
  .object({
    _meta: META_STRUCTURE,
    id: FootnoteIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema,
    label: ShortText, // "1", "12", "*"
    body: MediumText,
    language: Iso639.optional(),
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
  // No `path` — either `tex` or `mathml` would satisfy; anchoring to
  // one of the two would misleadingly suggest that field specifically
  // is required.
  .refine((eq) => eq.tex !== undefined || eq.mathml !== undefined, {
    message:
      "Equation must have at least one of `tex` or `mathml`. JATS canonicalizes math as MathML; LaTeX is supported as alternate.",
  });
export type Equation = z.infer<typeof EquationSchema>;

// --- 5.18 Figure -------------------------------------------------------
// CHANGE v0.2: `doi` added (DataCite asset DOI).
// CHANGE v0.3: `captionLanguage` added (JATS 1.4 multi-lang).
export const FigureSchema = z
  .object({
    _meta: META_FIGURE,
    id: FigureIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema.optional(),
    label: ShortText, // "Fig. 4"
    caption: MediumText,
    captionLanguage: Iso639.optional(),
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
// CiTO 2.8.1 alignment: see CitationKindSchema. The "review-relevant"
// subset enforced by the review CEL rule is documented inline in
// RefinedAcademicPaperSchema.
//
// CHANGE v0.3: `citingLocator` and `citingSection` added (SPAR C4O
// alignment — captures *where in the citing paper* the citation
// appears, distinct from `citedQuotation` which refers to the cited
// Work).
export const CitationSchema = z
  .object({
    _meta: META_CITATION,
    id: CitationIdSchema,
    paper: PaperIdSchema,
    citingClaim: ClaimIdSchema.optional(),
    citingFinding: FindingIdSchema.optional(),
    citingSection: SectionIdSchema.optional(),
    citingLocator: Locator.optional(),
    citedWork: WorkIdSchema,
    citedQuotation: QuotationIdSchema.optional(),
    kind: CitationKindSchema,
    rationale: MediumText.optional(),
  })
  .strict();
export type Citation = z.infer<typeof CitationSchema>;

// --- 5.20 Funding (CHANGED v0.3 — funder split into separate Funder
// primitive) -----------------------------------------------------------
// Paper-to-funder link. Aligns with JATS <funding-group>, Crossref
// `funder`, and DataCite `fundingReference`. CRediT
// `funding-acquisition` may be declared on contributing Authors via
// `Author.contributions`.
//
// CHANGE v0.3: BREAKING. The v0.2 inline `funderId` and `funderName`
// fields are removed; `funder` is now an FK to a separate `Funder`
// primitive (entity 5.21 below). This normalizes funder identity (one
// Funder row per real-world funder, multiple Funding rows per paper).
export const FundingSchema = z
  .object({
    _meta: META_FUNDING,
    id: FundingIdSchema,
    paper: PaperIdSchema,
    funder: FunderIdSchema,
    awardId: ShortText.optional(),
    awardTitle: ShortText.optional(),
    recipients: z.array(AuthorIdSchema).default([]),
  })
  .strict();
export type Funding = z.infer<typeof FundingSchema>;

// --- 5.21 Funder (NEW v0.3) -------------------------------------------
// A funding agency. Entity is keyed by an opaque `funder-...` ID; the
// real-world identifier (ROR or Crossref Funder Registry DOI) lives in
// `registryId`. Two Funding rows pointing to the same Funder share that
// real-world identifier without duplicating it inline.
//
// CHANGE v0.3.1: `registryId` relaxed from required to optional. Some
// niche funders (university internal seed grants, family foundations,
// private donors) lack ROR or Crossref Funder Registry entries. Making
// the field optional lets those funders be modeled; the paper-coherence
// validator emits a warning (level='warning', not 'error') when the
// field is absent, so the PALS's LAW "declare gaps, never hide them"
// posture is preserved. Authors and importers are encouraged to set
// `registryId` whenever possible.
export const FunderSchema = z
  .object({
    _meta: META_FUNDING,
    id: FunderIdSchema,
    name: ShortText,
    registryId: FunderRegistryId.optional(),
  })
  .strict();
export type Funder = z.infer<typeof FunderSchema>;

// --- 5.22 Table (NEW v0.3) --------------------------------------------
// Tabular data. Parallel to Figure but with table-specific structure
// (rowCount, columnCount, headerRows). Aligns with JATS <table-wrap>.
// `contentRef` is an opaque pointer to the table content (e.g., a
// dnis:Document id, a CSV path, or a JATS <table> XML reference).
export const TableSchema = z
  .object({
    _meta: META_FIGURE, // tables share the illustration domain
    id: TableIdSchema,
    paper: PaperIdSchema,
    section: SectionIdSchema.optional(),
    label: ShortText, // "Table 4"
    caption: MediumText,
    captionLanguage: Iso639.optional(),
    page: z.number().int().positive().optional(),
    altText: MediumText.optional(),
    contentRef: z.string().min(1).optional(),
    rowCount: z.number().int().nonnegative().optional(),
    columnCount: z.number().int().nonnegative().optional(),
    headerRows: z.number().int().nonnegative().optional(),
    doi: Doi.optional(),
  })
  .strict();
export type Table = z.infer<typeof TableSchema>;

// --- 5.23 PaperRelation (NEW v0.3) ------------------------------------
// Relations between this paper and another Work — companion, commentary,
// correction, response, retraction, translation, etc. Subset of JATS 1.4
// @related-article-type values, normalized for direction. The
// `relatedWork` is the target of the relation; `paper` is the related
// paper (this paper).
//
// Example: this paper retracts a previous paper.
//   { paper: paper-x, relatedWork: work-12, kind: "retraction-of" }
//
// Distinct from `Citation` because PaperRelations are paper-level
// metadata about the publication's relationship to other works (e.g.,
// for Crossmark / Crossref linking), whereas Citations are
// rhetorical/factual relations between this paper's claims and a cited
// Work's content.
//
// On the overlap with `Work.translationOf` / `Work.editionOf`:
//   `Work.translationOf` is the **bibliographic spine** — the
//   relationship between two Works in this workbook's Work catalogue,
//   used by anyone resolving bibliographic identity (e.g., authoring
//   a quotation, looking up the cited work's original-language form).
//   `PaperRelation{kind: "translation-of"}` is **paper-level
//   metadata** — used to surface "this paper translates Work W" at the
//   Crossmark / Crossref / publication-record layer.
//   When both are appropriate (this paper IS a translation of another
//   Work AND that Work has its own entry), populate both: they encode
//   complementary facets. When in doubt, prefer `Work.translationOf`
//   for the catalogue facet and add a `PaperRelation` only when the
//   publication record itself needs to surface the relationship.
export const PaperRelationSchema = z
  .object({
    _meta: META_CITATION,
    id: PaperRelationIdSchema,
    paper: PaperIdSchema,
    relatedWork: WorkIdSchema,
    kind: PaperRelationKindSchema,
    rationale: MediumText.optional(),
  })
  .strict();
export type PaperRelation = z.infer<typeof PaperRelationSchema>;

// --- 5.24 Erratum (NEW v0.4) ------------------------------------------
// Within-paper correction / corrigendum / retraction / addendum record.
// Distinct from `PaperRelation{kind:"correction-of"|"retraction-of"}`:
//   - PaperRelation links THIS paper to a DIFFERENT Work that this paper
//     corrects or retracts at the publication-record layer.
//   - Erratum is the internal trace of fix-ups to THIS paper's own
//     Section / Claim / Finding / Equation, attached at the same
//     publication.
//
// Aligns with NISO STM erratum/corrigendum nomenclature and the JATS 1.4
// @related-article-type vocabulary restricted to within-paper meanings.
//
// Each Erratum carries at least one of `correctsSection`,
// `correctsClaim`, `correctsFinding`, or `correctsEquation`. Empty
// errata (kind without a target) are rejected by the entity-level
// .refine() below.
//
// `issuedDate` (ISO 8601) records when the erratum was published.
// `noticeDoi` is the DataCite/Crossref DOI of the erratum notice when
// one exists separately from the parent paper DOI.
export const ErratumSchema = z
  .object({
    _meta: META_STRUCTURE,
    id: ErratumIdSchema,
    paper: PaperIdSchema,
    kind: ErratumKindSchema,
    title: ShortText,
    body: MediumText,
    issuedDate: IsoDate.optional(),
    noticeDoi: Doi.optional(),
    correctsSection: SectionIdSchema.optional(),
    correctsClaim: ClaimIdSchema.optional(),
    correctsFinding: FindingIdSchema.optional(),
    correctsEquation: EquationIdSchema.optional(),
  })
  .strict()
  // Bridge-clean: a single .refine() on the entity itself.
  // An Erratum without any `corrects*` target is rejected. A retraction
  // of the paper as a whole can omit all four (kind='retraction' is the
  // only exception); the .refine() below encodes that.
  .refine(
    (e) =>
      e.kind === "retraction" ||
      e.correctsSection !== undefined ||
      e.correctsClaim !== undefined ||
      e.correctsFinding !== undefined ||
      e.correctsEquation !== undefined,
    {
      message:
        "Erratum must point to at least one of `correctsSection`, `correctsClaim`, `correctsFinding`, or `correctsEquation` (except kind='retraction', which may target the whole paper).",
    },
  );
export type Erratum = z.infer<typeof ErratumSchema>;

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
  Funder: FunderSchema,
  Table: TableSchema,
  PaperRelation: PaperRelationSchema,
  Erratum: ErratumSchema,
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
    funders: z.array(FunderSchema).default([]),
    tables: z.array(TableSchema).default([]),
    paperRelations: z.array(PaperRelationSchema).default([]),
    errata: z.array(ErratumSchema).default([]),
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

// Generic cycle-detection helper (DFS with three-color marking).
// Returns the cycle as an array [n_0, n_1, ..., n_k, n_0] when found,
// or null when the directed graph is acyclic. Used by
// RefinedAcademicPaperSchema below to flag transitive cycles in nine
// relations: Section.parent, Concept.extends, Claim.derivesFrom,
// Equation.derivesFrom, Theory.extendsTheory, Work.translationOf,
// Work.editionOf, Claim.supersededBy (added v0.4.1), and
// Quotation.translatedFrom (added v0.4.1).
function findCycleInRelation(
  nodeIds: Set<string>,
  edges: Map<string, string[]>,
): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    color.set(node, GRAY);
    stack.push(node);
    const neighbors = edges.get(node) ?? [];
    for (const next of neighbors) {
      if (!nodeIds.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        return stack.slice(idx).concat(next);
      }
      if (c === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

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
    const equationIds = new Set(root.equations.map((eq) => eq.id));
    const funderIds = new Set(root.funders.map((f) => f.id));

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
      // v0.4: supersededBy must resolve and may not be self-loop.
      if (c.supersededBy !== undefined) {
        if (c.supersededBy === c.id) {
          ctx.addIssue({
            code: "custom",
            path: ["claims", i, "supersededBy"],
            message: "Claim.supersededBy may not reference itself.",
          });
        } else if (!claimIds.has(c.supersededBy)) {
          reportMissing(
            ["claims", i, "supersededBy"],
            "claim",
            c.supersededBy,
          );
        }
      }
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
      if (q.translatedFrom !== undefined) {
        // v0.4.1: reject self-loop in parallel with Work.translationOf /
        // Work.editionOf handling. Transitive cycles caught by the
        // findCycleInRelation pass below (block 9).
        if (q.translatedFrom === q.id) {
          ctx.addIssue({
            code: "custom",
            path: ["quotations", i, "translatedFrom"],
            message:
              "Quotation cannot be a translation of itself (translatedFrom self-loop).",
          });
        } else if (!quotationIds.has(q.translatedFrom)) {
          reportMissing(
            ["quotations", i, "translatedFrom"],
            "quotation",
            q.translatedFrom,
          );
        }
      }
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
      // v0.4: testsHypothesis must resolve to a Claim whose kind ==
      // 'hypothesis'. Other kinds are rejected because the field name
      // commits to the semantics.
      if (f.testsHypothesis !== undefined) {
        if (!claimIds.has(f.testsHypothesis)) {
          reportMissing(
            ["findings", i, "testsHypothesis"],
            "claim",
            f.testsHypothesis,
          );
        } else {
          const target = root.claims.find(
            (cc) => cc.id === f.testsHypothesis,
          );
          if (target && target.kind !== "hypothesis") {
            ctx.addIssue({
              code: "custom",
              path: ["findings", i, "testsHypothesis"],
              message: `Finding.testsHypothesis must reference a Claim with kind='hypothesis' (referenced Claim has kind='${target.kind}').`,
            });
          }
        }
      }
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

    // Citation ref-integrity (v0.2 + v0.3 citingSection merged into one
    // pass per the v0.3.1 cleanup).
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
      if (ci.citingSection && !sectionIds.has(ci.citingSection))
        reportMissing(
          ["citations", i, "citingSection"],
          "section",
          ci.citingSection,
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

    // Funding ref-integrity (CHANGED v0.3: funder is now an FK to a
    // Funder primitive, not inline funderId/funderName).
    root.fundings.forEach((fu, i) => {
      if (fu.paper !== paperId)
        reportMissing(["fundings", i, "paper"], "paper", fu.paper);
      if (!funderIds.has(fu.funder))
        reportMissing(["fundings", i, "funder"], "funder", fu.funder);
      fu.recipients.forEach((a, j) => {
        if (!authorIds.has(a))
          reportMissing(
            ["fundings", i, "recipients", j],
            "author",
            a,
          );
      });
    });

    // Table ref-integrity (NEW v0.3)
    root.tables.forEach((tb, i) => {
      if (tb.paper !== paperId)
        reportMissing(["tables", i, "paper"], "paper", tb.paper);
      if (tb.section && !sectionIds.has(tb.section))
        reportMissing(["tables", i, "section"], "section", tb.section);
    });

    // PaperRelation ref-integrity (NEW v0.3)
    root.paperRelations.forEach((pr, i) => {
      if (pr.paper !== paperId)
        reportMissing(
          ["paperRelations", i, "paper"],
          "paper",
          pr.paper,
        );
      if (!workIds.has(pr.relatedWork))
        reportMissing(
          ["paperRelations", i, "relatedWork"],
          "work",
          pr.relatedWork,
        );
    });

    // Erratum ref-integrity (NEW v0.4). Each Erratum belongs to THIS
    // paper and points to ≥0 of {Section, Claim, Finding, Equation}
    // within it (entity-level .refine() already enforces that at least
    // one is set when kind != 'retraction').
    root.errata.forEach((er, i) => {
      if (er.paper !== paperId)
        reportMissing(["errata", i, "paper"], "paper", er.paper);
      if (
        er.correctsSection !== undefined &&
        !sectionIds.has(er.correctsSection)
      )
        reportMissing(
          ["errata", i, "correctsSection"],
          "section",
          er.correctsSection,
        );
      if (
        er.correctsClaim !== undefined &&
        !claimIds.has(er.correctsClaim)
      )
        reportMissing(
          ["errata", i, "correctsClaim"],
          "claim",
          er.correctsClaim,
        );
      if (
        er.correctsFinding !== undefined &&
        !findingIds.has(er.correctsFinding)
      )
        reportMissing(
          ["errata", i, "correctsFinding"],
          "finding",
          er.correctsFinding,
        );
      if (
        er.correctsEquation !== undefined &&
        !equationIds.has(er.correctsEquation)
      )
        reportMissing(
          ["errata", i, "correctsEquation"],
          "equation",
          er.correctsEquation,
        );
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

    // Paper.publicationDate.year must agree with Paper.year when both
    // are present (NEW v0.3.1). Soft-couples two optional precisions of
    // the publication date. Disagreement is almost always a
    // copy-paste hallucination; surfacing it at the schema level
    // prevents drift downstream.
    if (root.paper.publicationDate) {
      const pubYearStr = root.paper.publicationDate.slice(0, 4);
      const pubYear = Number(pubYearStr);
      if (Number.isFinite(pubYear) && pubYear !== root.paper.year) {
        ctx.addIssue({
          code: "custom",
          path: ["paper", "publicationDate"],
          message: `paper.publicationDate's year (${pubYear}) disagrees with paper.year (${root.paper.year}); the two MUST match.`,
        });
      }
    }

    // Author position invariant (NEW v0.3): at most one Author per
    // paper has position='first', and at most one has position='last'.
    const firstCount = root.authors.filter(
      (a) => a.position === "first",
    ).length;
    const lastCount = root.authors.filter(
      (a) => a.position === "last",
    ).length;
    if (firstCount > 1)
      ctx.addIssue({
        code: "custom",
        path: ["authors"],
        message: `at most one Author may have position='first' (found ${firstCount})`,
      });
    if (lastCount > 1)
      ctx.addIssue({
        code: "custom",
        path: ["authors"],
        message: `at most one Author may have position='last' (found ${lastCount})`,
      });

    // Transitive cycle detection (NEW v0.3) — uses findCycleInRelation
    // helper defined above the Refined root. We check seven relations.
    const reportCycle = (
      collectionName: string,
      relationName: string,
      cycle: string[],
    ) =>
      ctx.addIssue({
        code: "custom",
        path: [collectionName],
        message: `cycle detected in ${collectionName}.${relationName}: ${cycle.join(" → ")}`,
      });

    // 1. Section.parent
    {
      const edges = new Map<string, string[]>();
      for (const s of root.sections)
        if (s.parent) edges.set(s.id, [s.parent]);
      const cycle = findCycleInRelation(sectionIds, edges);
      if (cycle) reportCycle("sections", "parent", cycle);
    }

    // 2. Concept.extends
    {
      const edges = new Map<string, string[]>();
      for (const c of root.concepts) edges.set(c.id, c.extends);
      const cycle = findCycleInRelation(conceptIds, edges);
      if (cycle) reportCycle("concepts", "extends", cycle);
    }

    // 3. Claim.derivesFrom
    {
      const edges = new Map<string, string[]>();
      for (const c of root.claims) edges.set(c.id, c.derivesFrom);
      const cycle = findCycleInRelation(claimIds, edges);
      if (cycle) reportCycle("claims", "derivesFrom", cycle);
    }

    // 4. Equation.derivesFrom
    {
      const edges = new Map<string, string[]>();
      for (const eq of root.equations)
        edges.set(eq.id, eq.derivesFrom);
      const cycle = findCycleInRelation(equationIds, edges);
      if (cycle) reportCycle("equations", "derivesFrom", cycle);
    }

    // 5. Theory.extendsTheory
    {
      const edges = new Map<string, string[]>();
      for (const t of root.theories) edges.set(t.id, t.extendsTheory);
      const cycle = findCycleInRelation(theoryIds, edges);
      if (cycle) reportCycle("theories", "extendsTheory", cycle);
    }

    // 6. Work.translationOf
    {
      const edges = new Map<string, string[]>();
      for (const w of root.works)
        if (w.translationOf) edges.set(w.id, [w.translationOf]);
      const cycle = findCycleInRelation(workIds, edges);
      if (cycle) reportCycle("works", "translationOf", cycle);
    }

    // 7. Work.editionOf
    {
      const edges = new Map<string, string[]>();
      for (const w of root.works)
        if (w.editionOf) edges.set(w.id, [w.editionOf]);
      const cycle = findCycleInRelation(workIds, edges);
      if (cycle) reportCycle("works", "editionOf", cycle);
    }

    // 8. Claim.supersededBy (NEW v0.4.1 — parity with rev3 SHACL fix).
    //    The per-record loop above catches self-loops + dangling refs;
    //    this catches transitive cycles A → B → A.
    {
      const edges = new Map<string, string[]>();
      for (const c of root.claims)
        if (c.supersededBy) edges.set(c.id, [c.supersededBy]);
      const cycle = findCycleInRelation(claimIds, edges);
      if (cycle) reportCycle("claims", "supersededBy", cycle);
    }

    // 9. Quotation.translatedFrom (NEW v0.4.1 — parity with rev3 SHACL
    //    fix). Self-loop check is in the per-record quotations pass
    //    above; this catches transitive cycles.
    {
      const edges = new Map<string, string[]>();
      for (const q of root.quotations)
        if (q.translatedFrom) edges.set(q.id, [q.translatedFrom]);
      const cycle = findCycleInRelation(quotationIds, edges);
      if (cycle) reportCycle("quotations", "translatedFrom", cycle);
    }

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
      // v0.4: every hypothesis Claim must be referenced by at least one
      // Finding via `testsHypothesis`. Empirical papers that state a
      // hypothesis but never close the loop on whether the data
      // supported / refuted / left it open are an integrity gap.
      const hypothesisIds = new Set(
        root.claims
          .filter((c) => c.kind === "hypothesis")
          .map((c) => c.id),
      );
      const testedHypothesisIds = new Set(
        root.findings
          .map((f) => f.testsHypothesis)
          .filter((x): x is string => typeof x === "string"),
      );
      for (const hid of hypothesisIds) {
        if (!testedHypothesisIds.has(hid)) {
          const idx = root.claims.findIndex((c) => c.id === hid);
          ctx.addIssue({
            code: "custom",
            path: ["claims", idx],
            message: `paper.epistemicMethod == 'empirical': hypothesis Claim '${hid}' is not tested by any Finding (no Finding.testsHypothesis == '${hid}')`,
          });
        }
      }
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