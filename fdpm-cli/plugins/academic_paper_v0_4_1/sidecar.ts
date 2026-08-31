/**
 * Academic-paper plugin sidecar — single source of truth for the bridge
 * derivation, shared by activate() at runtime and scripts/run-bridge.ts
 * at build time.
 *
 * Per howto-zod-to-fdpm-plugin §4 (`example:bridge-entry-module`,
 * `decision:schema-as-source-of-truth`).
 *
 * Schema source: schemas/academic-paper.ts (v0.3.1, ported verbatim
 * from static/schemas/academic-paper.ts). 23 entities cover the
 * paradigm spectrum across two orthogonal axes:
 *   - epistemicMethod ∈ {empirical, descriptive, theoretical,
 *                        methodological, literary-critical, review,
 *                        historical}
 *   - format          ∈ {article, essay, monograph, thesis, chapter,
 *                        letter, editorial, commentary}
 *
 * v0.3 additions over v0.2:
 *   - Funder primitive (normalized — Funding.funder is now an FK)
 *   - Table primitive (parallel to Figure, JATS <table-wrap> equivalent)
 *   - PaperRelation primitive (paper-level Crossmark/Crossref relations)
 *   - Paper.publicationDate (ISO 8601) + Paper.version (NISO JAV)
 *   - Author.position ("first" | "middle" | "last") with workbook
 *     invariant (≤1 first, ≤1 last per paper)
 *   - Section.language, Footnote.language, Figure.captionLanguage,
 *     Table.captionLanguage (JATS 1.4 multi-language attributes)
 *   - Citation.citingLocator + Citation.citingSection (SPAR C4O)
 *   - 4 new CitationKind values; CiTO 2.8.1 alignment fix
 *   - Concept.closeMatch: URL[] (SKOS multi-vocabulary linking)
 *   - Transitive cycle detection on 7 relations in the Refined root
 *
 * v0.3.1 patch (review-pass cleanup):
 *   - Restored `descriptive` epistemic method (silently dropped during
 *     v0.3.0 rewrite). Covers exploratory/observational empirical work
 *     without pre-registered hypothesis.
 *   - Funder.registryId relaxed to optional + paper-coherence WARNING
 *     when absent (preserves PALS's LAW posture).
 *   - Paper.publicationDate.year cross-check against Paper.year.
 *   - Plus four documentation/cleanup fixes.
 *
 * The schema's RefinedAcademicPaperSchema.superRefine encodes
 * referential-integrity walks, cycle detection, and the
 * kind-conditional CEL rules. The host runs these at workbook-walking
 * time via the `paper-coherence` cap:validator registered in
 * index.ts; the bridge lifts per-entity refines (omission declaration,
 * borrowed-definition citedFrom, theorist death≥birth, equation
 * tex|mathml) into per-primitive validators.
 *
 * Declared losses (v0.3):
 *   - The kind-conditional CEL rules cannot be expressed as CEL
 *     constraints on a single primitive — they require the workbook
 *     context. They are enforced at runtime by paperCoherenceValidator
 *     (index.ts), not by the bridge's emitted constraints.
 *   - Author.position invariant (≤1 first, ≤1 last per paper) and the
 *     7-relation cycle detection likewise require the workbook context;
 *     enforced at runtime by paperCoherenceValidator.
 *   - Funder.registryId absence is a warning, not an error.
 */

import { defineDomain } from "@fdpm/zod-bridge";
import {
  AffiliationIdSchema,
  AffiliationSchema,
  AuthorIdSchema,
  AuthorSchema,
  CitationIdSchema,
  CitationSchema,
  ClaimIdSchema,
  ClaimSchema,
  ConceptIdSchema,
  ConceptSchema,
  DefinitionIdSchema,
  DefinitionSchema,
  EquationIdSchema,
  EquationSchema,
  EvidenceIdSchema,
  EvidenceSchema,
  FigureIdSchema,
  FigureSchema,
  FindingIdSchema,
  FindingSchema,
  FootnoteIdSchema,
  FootnoteSchema,
  FunderIdSchema,
  FunderSchema,
  FundingIdSchema,
  FundingSchema,
  LimitationIdSchema,
  LimitationSchema,
  MethodIdSchema,
  MethodSchema,
  PaperIdSchema,
  PaperRelationIdSchema,
  PaperRelationSchema,
  PaperSchema,
  QuotationIdSchema,
  QuotationSchema,
  SectionIdSchema,
  SectionSchema,
  TableIdSchema,
  TableSchema,
  ErratumIdSchema,
  ErratumSchema,
  TheoristIdSchema,
  TheoristSchema,
  TheoryIdSchema,
  TheorySchema,
  WorkIdSchema,
  WorkSchema,
} from "./schemas/academic-paper.js";

// v0.3 bumps the profile id (Funder normalization + Funding.funder FK
// is a breaking change) and the plugin version. The v0.3.1 patch is
// additive (descriptive restored, Funder.registryId relaxed,
// publicationDate cross-check) and does NOT bump the profile major;
// the plugin version reflects the patch.
// v0.4 (additive — Claim.lifecycleStatus + supersededBy,
// Finding.testsHypothesis + outcome, new Erratum primitive). All changes
// have defaults / are optional, so v0.3 workbooks remain valid against
// the new schema. Per the v0.3.1 precedent, additive evolutions DO NOT
// bump the profile major. Plugin version bumps to 0.4.0 because the
// plugin code did change (new entity registration, new walker blocks,
// new profile.validation_rules metadata).
// v0.4.1 side-by-side profile. Registered alongside the v0.3 plugin so
// new workbooks can opt into the additional cycle detection (Claim
// supersededBy + Quotation translatedFrom) without disturbing existing
// v0.3 workbooks. PROFILE_ID / PLUGIN_ID / VENDOR all carry a v0_4_1
// discriminator so the two plugins do not collide at host-registration
// time. Workbooks bind to one profile; promotion path is to migrate
// `profile_id` field-by-field once a workbook is on v0.4.1.
export const PROFILE_ID = "profile:academic-paper:0.4.1" as const;

export const PROFILE_DESCRIPTION =
  "A scholarly paper as an argument graph rather than a document: claims " +
  "standing on evidence, quotations bound to the works they come from, " +
  "concepts defined or borrowed, and equations, figures, tables and " +
  "citations attached to the sections that use them. Twenty-four types and " +
  "sixty-one relations cover eight genres — empirical, theoretical, " +
  "methodological, literary-critical, review, historical, essay and " +
  "monograph — and the genre decides what the paper is required to carry: " +
  "an empirical paper owes a hypothesis and data, a theoretical one owes " +
  "equations. Authorship, affiliation, funding and errata are modelled " +
  "because a submission is judged on them.";
export const PLUGIN_ID = "fdpm.academic-paper-v0-4-1" as const;
/*
 * `PROFILE_ID` stays at 0.4.1: no primitive type, relation type or field
 * changed. `PLUGIN_VERSION` moves because the plugin gained three renderers
 * — the argument graph, the BibTeX bibliography and the typeset PDF.
 */
export const PLUGIN_VERSION = "0.5.0" as const;

/** The type catalogue's version, independent of the plugin release. */
export const PROFILE_VERSION = "0.5.0" as const;
export const HOST_COMPATIBILITY = ">=1.1,<2" as const;
// Vendor controls the bridge's primitive_type_id prefix and the
// expr-helper function namespace. This was "acad041" while the v0.3
// plugin still existed: two plugins declaring `acad:Paper` collide at
// registration with "duplicate primitive_type_id", so the newer one
// carried a discriminator. The v0.3 plugin was withdrawn on 2026-08-29
// (the two profiles were identical apart from this prefix, and no
// workbook was bound to it), so the discriminator no longer
// discriminates and the namespace is reclaimed. Downstream tooling —
// acad_validate.py, scripts/fdpm_to_latex.py — addresses primitives as
// `acad:Paper`, and now matches again.
export const VENDOR = "acad" as const;

/**
 * Build the domain definition consumed by `assembleDomainProfileFromSidecar`.
 *
 * Every entity uses the standard `id-field` identity kind (`id` field
 * with a regex'd ID schema). All 23 entities follow the convention.
 *
 * References declare cross-primitive ID fields. The bridge converts
 * these to RelationTypeDefs in the emitted profile. Cardinality is set
 * to match the schema (single-value optional → many-to-one;
 * `z.array(...)` → many-to-many).
 */
export function buildAcademicPaperSidecar() {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Paper: {
        schema: PaperSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: PaperIdSchema,
      },
      Author: {
        schema: AuthorSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: AuthorIdSchema,
      },
      Affiliation: {
        schema: AffiliationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: AffiliationIdSchema,
      },
      Section: {
        schema: SectionSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: SectionIdSchema,
      },
      Claim: {
        schema: ClaimSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: ClaimIdSchema,
      },
      Evidence: {
        schema: EvidenceSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: EvidenceIdSchema,
      },
      Quotation: {
        schema: QuotationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: QuotationIdSchema,
      },
      Work: {
        schema: WorkSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: WorkIdSchema,
      },
      Concept: {
        schema: ConceptSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: ConceptIdSchema,
      },
      Definition: {
        schema: DefinitionSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: DefinitionIdSchema,
      },
      Theorist: {
        schema: TheoristSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: TheoristIdSchema,
      },
      Theory: {
        schema: TheorySchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: TheoryIdSchema,
      },
      Method: {
        schema: MethodSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: MethodIdSchema,
      },
      Finding: {
        schema: FindingSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: FindingIdSchema,
      },
      Limitation: {
        schema: LimitationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: LimitationIdSchema,
      },
      Footnote: {
        schema: FootnoteSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: FootnoteIdSchema,
      },
      Equation: {
        schema: EquationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: EquationIdSchema,
      },
      Figure: {
        schema: FigureSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: FigureIdSchema,
      },
      Citation: {
        schema: CitationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: CitationIdSchema,
      },
      Funding: {
        schema: FundingSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: FundingIdSchema,
      },
      Funder: {
        schema: FunderSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: FunderIdSchema,
      },
      Table: {
        schema: TableSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: TableIdSchema,
      },
      PaperRelation: {
        schema: PaperRelationSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: PaperRelationIdSchema,
      },
      Erratum: {
        schema: ErratumSchema,
        identityKind: "id-field",
        idField: "id",
        idSchema: ErratumIdSchema,
      },
    },
    references: [
      // Author → Paper, Author → Affiliation
      {
        from: "Author",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Author",
        field: "affiliations",
        to: "Affiliation",
        cardinality: "many-to-many",
      },
      // Section → Paper, Section → Section (parent)
      {
        from: "Section",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Section",
        field: "parent",
        to: "Section",
        cardinality: "many-to-one",
        acyclic: true,
      },
      // Claim → Paper, Claim → Section, Claim → Claim
      {
        from: "Claim",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Claim",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Claim",
        field: "derivesFrom",
        to: "Claim",
        cardinality: "many-to-many",
        acyclic: true,
      },
      {
        from: "Claim",
        field: "counterReads",
        to: "Claim",
        cardinality: "many-to-many",
      },
      // Evidence → Paper, Evidence → Claim, Evidence → Quotation, Evidence → Work
      {
        from: "Evidence",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Evidence",
        field: "supports",
        to: "Claim",
        cardinality: "many-to-many",
      },
      {
        from: "Evidence",
        field: "quotation",
        to: "Quotation",
        cardinality: "many-to-one",
      },
      {
        from: "Evidence",
        field: "work",
        to: "Work",
        cardinality: "many-to-one",
      },
      // Quotation → Paper, Quotation → Section, Quotation → Work, Quotation → Quotation
      {
        from: "Quotation",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Quotation",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Quotation",
        field: "quotesFrom",
        to: "Work",
        cardinality: "many-to-one",
      },
      {
        from: "Quotation",
        field: "translatedFrom",
        to: "Quotation",
        cardinality: "many-to-one",
      },
      // Concept → Theorist, Concept → Concept
      {
        from: "Concept",
        field: "borrowsFrom",
        to: "Theorist",
        cardinality: "many-to-many",
      },
      {
        from: "Concept",
        field: "extends",
        to: "Concept",
        cardinality: "many-to-many",
        acyclic: true,
      },
      // Definition → Paper, Definition → Concept, Definition → Section, Definition → Work
      {
        from: "Definition",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Definition",
        field: "concept",
        to: "Concept",
        cardinality: "many-to-one",
      },
      {
        from: "Definition",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Definition",
        field: "citedFrom",
        to: "Work",
        cardinality: "many-to-one",
      },
      // Theorist → Theory
      {
        from: "Theorist",
        field: "notableTheories",
        to: "Theory",
        cardinality: "many-to-many",
      },
      // Theory → Theorist, Theory → Theory
      {
        from: "Theory",
        field: "primaryTheorist",
        to: "Theorist",
        cardinality: "many-to-one",
      },
      {
        from: "Theory",
        field: "extendsTheory",
        to: "Theory",
        cardinality: "many-to-many",
        acyclic: true,
      },
      {
        from: "Theory",
        field: "respondsTo",
        to: "Theory",
        cardinality: "many-to-many",
      },
      // Method → Paper
      {
        from: "Method",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      // Finding → Paper, Finding → Section, Finding → Evidence
      {
        from: "Finding",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Finding",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Finding",
        field: "supportedBy",
        to: "Evidence",
        cardinality: "many-to-many",
      },
      // Limitation → Paper
      {
        from: "Limitation",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      // Footnote → Paper, Footnote → Section
      {
        from: "Footnote",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Footnote",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      // Equation → Paper, Equation → Section, Equation → Equation, Equation → Claim
      {
        from: "Equation",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Equation",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Equation",
        field: "derivesFrom",
        to: "Equation",
        cardinality: "many-to-many",
        acyclic: true,
      },
      {
        from: "Equation",
        field: "fromPostulates",
        to: "Claim",
        cardinality: "many-to-many",
      },
      // Figure → Paper, Figure → Section
      {
        from: "Figure",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Figure",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      // Work → Work (translationOf, editionOf — flat FRBR-Expression
      // linkage, v0.2). Self-loops are caught by the Refined root;
      // cycle detection across the graph is deferred to a cap:expr
      // helper.
      {
        from: "Work",
        field: "translationOf",
        to: "Work",
        cardinality: "many-to-one",
        acyclic: true,
      },
      {
        from: "Work",
        field: "editionOf",
        to: "Work",
        cardinality: "many-to-one",
        acyclic: true,
      },
      // Citation (NEW v0.2; v0.3 adds citingSection) → Paper, Claim,
      // Finding, Section, Work, Quotation. CiTO 2.8.1-aligned typed
      // citation primitive. citingClaim, citingFinding, and
      // citingSection are all optional — paper-level citations have
      // none set.
      {
        from: "Citation",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Citation",
        field: "citingClaim",
        to: "Claim",
        cardinality: "many-to-one",
      },
      {
        from: "Citation",
        field: "citingFinding",
        to: "Finding",
        cardinality: "many-to-one",
      },
      {
        from: "Citation",
        field: "citingSection",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Citation",
        field: "citedWork",
        to: "Work",
        cardinality: "many-to-one",
      },
      {
        from: "Citation",
        field: "citedQuotation",
        to: "Quotation",
        cardinality: "many-to-one",
      },
      // Funding (NEW v0.2; v0.3 splits funderId/funderName out into a
      // separate Funder primitive) → Paper, Funder, Author. CRediT
      // `funding-acquisition` declared on contributing Authors via
      // Author.contributions; not enforced here (soft-coupled).
      {
        from: "Funding",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Funding",
        field: "funder",
        to: "Funder",
        cardinality: "many-to-one",
      },
      {
        from: "Funding",
        field: "recipients",
        to: "Author",
        cardinality: "many-to-many",
      },
      // Table (NEW v0.3) → Paper, Section. Parallel to Figure.
      {
        from: "Table",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Table",
        field: "section",
        to: "Section",
        cardinality: "many-to-one",
      },
      // PaperRelation (NEW v0.3) → Paper, Work. Paper-level
      // Crossmark/Crossref relations (companion-of, retraction-of,
      // translation-of, etc.). Note: PaperRelation.kind='translation-of'
      // overlaps with Work.translationOf — the latter is the
      // bibliographic spine, the former is paper-level metadata.
      {
        from: "PaperRelation",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "PaperRelation",
        field: "relatedWork",
        to: "Work",
        cardinality: "many-to-one",
      },
      // v0.4 — Claim lifecycle: when supersededBy is set, it points to
      // the replacing Claim within the same paper.
      {
        from: "Claim",
        field: "supersededBy",
        to: "Claim",
        cardinality: "many-to-one",
      },
      // v0.4 — Finding tests a hypothesis Claim. Referential and kind
      // semantics (target Claim.kind == 'hypothesis') are enforced by
      // the Refined root and the paper-coherence walker.
      {
        from: "Finding",
        field: "testsHypothesis",
        to: "Claim",
        cardinality: "many-to-one",
      },
      // v0.4 — Erratum (within-paper correction/retraction) →
      // Paper, Section, Claim, Finding, Equation.
      {
        from: "Erratum",
        field: "paper",
        to: "Paper",
        cardinality: "many-to-one",
      },
      {
        from: "Erratum",
        field: "correctsSection",
        to: "Section",
        cardinality: "many-to-one",
      },
      {
        from: "Erratum",
        field: "correctsClaim",
        to: "Claim",
        cardinality: "many-to-one",
      },
      {
        from: "Erratum",
        field: "correctsFinding",
        to: "Finding",
        cardinality: "many-to-one",
      },
      {
        from: "Erratum",
        field: "correctsEquation",
        to: "Equation",
        cardinality: "many-to-one",
      },
    ],
    // No discriminated unions in this schema; declare empty variants[]
    // so the helper functions below typecheck under
    // strictPropertyInitialization.
    variants: [],
    fdpm: {
      pluginId: PLUGIN_ID,
      vendor: VENDOR,
      profileId: PROFILE_ID,
      profileDescription: PROFILE_DESCRIPTION,
      // Stated, not inherited. With `profileVersion` unset the bridge falls
      // back to `pluginVersion` (sidecar-orchestrator.ts), so the profile's
      // version tracked plugin releases — a renderer added or a bug fixed
      // moved the version of the type catalogue, which had not changed.
      // Pinned to the value that fallback currently produces, so today's
      // output is unchanged and tomorrow's plugin release no longer moves it.
      profileVersion: PROFILE_VERSION,
      pluginVersion: PLUGIN_VERSION,
      hostCompatibility: HOST_COMPATIBILITY,
    },
  });
}

/**
 * No variant-per-primitive splits — schema has no z.discriminatedUnion.
 * Both helpers exist only because the runtime registration loop and
 * the manifest-parity test reuse them; for academic-paper both return
 * empty results.
 */
export function variantFieldsByEntity(
  sidecar: ReturnType<typeof buildAcademicPaperSidecar>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const variants = (sidecar as unknown as {
    variants?: ReadonlyArray<{ from: string; field: string; strategy: string }>;
  }).variants ?? [];
  for (const v of variants) {
    if (v.strategy !== "variant-per-primitive") continue;
    if (!out.has(v.from)) out.set(v.from, new Set());
    out.get(v.from)!.add(v.field);
  }
  return out;
}

export function validatorSchemaFor(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entitySchema: any,
  variantFields: Map<string, Set<string>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const drop = variantFields.get(entityName);
  if (!drop || drop.size === 0) return entitySchema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const omitFn = (entitySchema as any).omit?.bind(entitySchema);
  if (!omitFn) return entitySchema;
  return omitFn(
    Object.fromEntries(Array.from(drop).map((f) => [f, true as const])),
  );
}
