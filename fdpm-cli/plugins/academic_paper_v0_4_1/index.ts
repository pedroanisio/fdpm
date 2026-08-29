/**
 * fdpm.academic-paper plugin entry point — v0.3.1.
 *
 * Glue between @fdpm/zod-bridge@0.4.0 and the FDPM host. The plugin's
 * data model is auto-derived from `schemas/academic-paper.ts` (v0.3.1)
 * via a hand-authored sidecar; this file binds the derived
 * DomainProfile + per-entity validators + a paper-coherence validator
 * into the host's PluginContext.
 *
 * Hand-authored:
 *   - The sidecar (sidecar.ts: 23 entities, ~58 references).
 *   - The activate() registration sequence.
 *   - The paper-coherence validator that ports the source schema's
 *     RefinedAcademicPaperSchema.superRefine into a workbook-walking
 *     form. Per-entity validators handle within-row Zod rules; this
 *     validator handles the cross-workbook invariants (referential
 *     integrity + kind-conditional required-ness + Author.position
 *     uniqueness + 7-relation transitive cycle detection +
 *     publication-date year cross-check + Funder.registryId advisory).
 *
 * Generated:
 *   - PrimitiveTypeDefs and RelationTypeDefs — bridge.
 *   - CEL field-validation rules — bridge.
 *   - Per-entity Zod validator closures + closed-set rule_ids — bridge.
 *   - The fdpm-plugin.json manifest — bridge wrote it; we read it in.
 *
 * Declared losses (per SPEC-FDPM-BRIDGE §8.2):
 *   - Kind-conditional required-ness (paper.epistemicMethod=='theoretical'
 *     ⇒ count(equations)>0, etc.) cannot be expressed as CEL on a
 *     single primitive — they require workbook context. Enforced at
 *     runtime via paperCoherenceValidator below.
 *   - Cycle detection over 7 relations (Section.parent, Concept.extends,
 *     Claim.derivesFrom, Equation.derivesFrom, Theory.extendsTheory,
 *     Work.translationOf, Work.editionOf) likewise requires workbook
 *     context. Enforced at runtime; cycle paths are reported in the
 *     finding message.
 *   - Funder.registryId absence is a paper-coherence WARNING, not an
 *     error (v0.3.1 — preserves PALS's LAW posture while allowing
 *     niche funders without ROR/Crossref Funder Registry entries).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  assembleDomainProfileFromSidecar,
  zodSchemaToExporter,
  zodSchemaToImporter,
  zodSchemaToMarkdownRenderer,
  zodSchemaToValidator,
} from "@fdpm/zod-bridge";
import { mintUid } from "../../src/core/identity/uid.js";
import type { DomainProfile } from "../../src/core/models/meta.js";
import type {
  ExporterFn,
  ImporterFn,
  PluginContext,
  PluginEntryModule,
  RendererFn,
  RendererInput,
  RendererOutput,
  ValidatorFn,
} from "../../src/plugin/types.js";
import type { PluginManifest } from "../../src/plugin/manifest.js";
import type {
  PrimitiveInstance,
  ProjectTransfer,
} from "../../src/core/models/instance.js";
import {
  buildAcademicPaperSidecar,
  PLUGIN_ID,
  PROFILE_ID,
  validatorSchemaFor,
  variantFieldsByEntity,
  VENDOR,
} from "./sidecar.js";
import { renderPaperMarkdown, renderPaperHtml } from "./renderers/paper_document.js";
import { renderArgumentGraph } from "./renderers/argument_graph.js";
import { renderBibliography } from "./renderers/bibliography.js";
import { renderPaperPdf } from "./renderers/paper_pdf.js";
import { renderPaperLatex } from "./renderers/paper_latex.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const manifestRaw = readFileSync(join(__dirname, "fdpm-plugin.json"), "utf8");
export const manifest: PluginManifest = JSON.parse(
  manifestRaw,
) as PluginManifest;

export { PLUGIN_ID, PROFILE_ID };

const TYPE_PREFIX = VENDOR;

/* ────────────────────────────────────────────────────────────────────
 * Cycle detection helper (NEW v0.3)
 *
 * Three-color DFS. Returns the cycle path [n_0, n_1, ..., n_k, n_0]
 * when found, or null when the directed graph rooted at the given
 * node set is acyclic. Mirrors `findCycleInRelation` in
 * static/schemas/academic-paper.ts — the schema version runs at
 * structured-parse time; this version runs at workbook-walking time
 * (so it sees the same graph in a different shape).
 * ──────────────────────────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────────────────────────
 * Paper-coherence validator (v0.2)
 *
 * Walks ctx.workbook.primitives at create/patch/replace time on
 * acad:Paper and reports findings for:
 *   (A) referential integrity — every cross-primitive ID resolves to
 *       a primitive of the right type in the workbook;
 *   (B) author/affiliation invariants — every Paper has ≥1 Author,
 *       every Author has ≥1 Affiliation;
 *   (C) concept reachability — every Concept has either a Definition
 *       in the workbook OR a borrowsFrom→Theorist link;
 *   (D) method-conditional required-ness — paper.epistemicMethod
 *       drives required collections. v0.2 rules:
 *         theoretical      ⇒ ≥1 Equation
 *         empirical        ⇒ ≥1 hypothesis Claim AND ≥1 empirical
 *                            Claim with ≥1 supporting data Evidence
 *         descriptive      ⇒ no required-ness (intentional)
 *         literary-critical ⇒ ≥1 Quotation
 *         review           ⇒ ≥10 distinct cited Works across
 *                            Citations of review-relevant kinds
 *         historical       ⇒ ≥1 observation/data Evidence
 *
 * Findings use rule_id namespace `fdpm.academic-paper:paper.<rule>`
 * (kind-conditional rules use the `paper.method.<method>-needs-<thing>`
 * shape) so they're distinguishable from per-entity findings (which
 * use `fdpm.academic-paper:zod.<entity>.<code>`).
 * ──────────────────────────────────────────────────────────────────── */

interface PaperFinding {
  rule_id: string;
  level: "error" | "warning";
  target_id: string;
  message: string;
  field_path?: string;
}

const RULE = (suffix: string): string => `${PLUGIN_ID}:paper.${suffix}`;

/**
 * Paper-coherence rule metadata — used to populate
 * `DomainProfile.validation_rules` so each rule is introspectable via
 * `fdpm profile get` and the MCP `fdpm_profile_get` tool. The actual
 * rule implementations live in `findingsForPaper`, and findings carry
 * the matching `rule_id`. The host's profile compiler treats
 * `predicate: "host-validator"` as opaque metadata (compile.ts maps it
 * to `expression` verbatim and does not evaluate it).
 *
 * v0.4 additions (claim/finding lifecycle + Erratum) are tagged below.
 */
const PAPER_COHERENCE_RULES: ReadonlyArray<{
  id: string;
  level: "error" | "warning";
  description: string;
  since: string;
}> = [
  // Reference integrity (block A).
  { id: RULE("authors-required"), level: "error", description: "Every paper must have ≥1 Author.", since: "0.1" },
  { id: RULE("author-affiliations-resolve"), level: "error", description: "Every Author must declare ≥1 Affiliation and all referenced affiliation IDs must resolve.", since: "0.1" },
  { id: RULE("evidence-supports-resolve"), level: "error", description: "Every Evidence.supports must resolve to a Claim in this paper.", since: "0.1" },
  { id: RULE("quotation-quotesfrom-resolves"), level: "error", description: "Quotation.quotesFrom must resolve to a Work in the workbook.", since: "0.1" },
  { id: RULE("citation-references-resolve"), level: "error", description: "Citation.citingClaim / citingFinding / citingSection / citedWork / citedQuotation must all resolve when set.", since: "0.2" },
  { id: RULE("funding-funder-resolves"), level: "error", description: "Funding.funder must resolve to a Funder primitive.", since: "0.3" },
  { id: RULE("funding-recipients-resolve"), level: "error", description: "Funding.recipients[] must all resolve to Authors in this paper.", since: "0.3" },
  { id: RULE("funder-registry-id-missing"), level: "warning", description: "Funder.registryId is absent (ROR or Crossref Funder Registry ID recommended; PALS's LAW: declare gaps).", since: "0.3.1" },
  { id: RULE("table-references-resolve"), level: "error", description: "Table.section, when set, must resolve to a Section in this paper.", since: "0.3" },
  { id: RULE("paper-relation-references-resolve"), level: "error", description: "PaperRelation.relatedWork must resolve to a Work in the workbook.", since: "0.3" },
  { id: RULE("section-parent-resolves"), level: "error", description: "Section.parent, when set, must resolve to another Section in this paper.", since: "0.1" },
  { id: RULE("concept-defined-or-borrowed"), level: "error", description: "Every Concept used must have a Definition in this paper OR a borrowsFrom→Theorist link.", since: "0.1" },
  { id: RULE("publication-date-year-agrees"), level: "error", description: "Paper.publicationDate's year prefix must equal Paper.year when both are set.", since: "0.3.1" },
  { id: RULE("author-position-unique-first"), level: "error", description: "At most one Author per paper may have position='first'.", since: "0.3" },
  { id: RULE("author-position-unique-last"), level: "error", description: "At most one Author per paper may have position='last'.", since: "0.3" },
  // Cycle detection (7 relations).
  { id: RULE("cycle.section-parent"), level: "error", description: "sections.parent must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.concept-extends"), level: "error", description: "concepts.extends must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.claim-derives-from"), level: "error", description: "claims.derivesFrom must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.equation-derives-from"), level: "error", description: "equations.derivesFrom must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.theory-extends-theory"), level: "error", description: "theories.extendsTheory must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.work-translation-of"), level: "error", description: "works.translationOf must form an acyclic graph.", since: "0.3" },
  { id: RULE("cycle.work-edition-of"), level: "error", description: "works.editionOf must form an acyclic graph.", since: "0.3" },
  // Kind-conditional required-ness (block D).
  { id: RULE("method.theoretical-needs-equations"), level: "error", description: "epistemicMethod='theoretical' implies ≥1 Equation in the workbook.", since: "0.2" },
  { id: RULE("method.literary-critical-needs-quotations"), level: "error", description: "epistemicMethod='literary-critical' implies ≥1 Quotation in the workbook.", since: "0.2" },
  { id: RULE("method.empirical-needs-hypothesis"), level: "error", description: "epistemicMethod='empirical' implies ≥1 Claim with kind='hypothesis'.", since: "0.2" },
  { id: RULE("method.empirical-needs-data"), level: "error", description: "epistemicMethod='empirical' implies ≥1 empirical Claim supported by data Evidence.", since: "0.2" },
  { id: RULE("method.review-needs-citations"), level: "error", description: "epistemicMethod='review' implies ≥10 distinct cited Works via review-relevant Citation kinds.", since: "0.2" },
  { id: RULE("method.historical-needs-observation-or-data"), level: "error", description: "epistemicMethod='historical' implies ≥1 Evidence of kind 'observation' or 'data'.", since: "0.2" },
  // v0.4 additions — lifecycle + Erratum.
  { id: RULE("claim-superseded-by-resolves"), level: "error", description: "Claim.supersededBy must resolve to a different Claim in this paper.", since: "0.4" },
  { id: RULE("finding-tests-hypothesis-resolves"), level: "error", description: "Finding.testsHypothesis must resolve to a Claim in this paper.", since: "0.4" },
  { id: RULE("finding-tests-hypothesis-kind"), level: "error", description: "Finding.testsHypothesis must reference a Claim with kind='hypothesis'.", since: "0.4" },
  { id: RULE("method.empirical-hypothesis-tested"), level: "error", description: "epistemicMethod='empirical' implies every hypothesis Claim is referenced by ≥1 Finding via testsHypothesis.", since: "0.4" },
  { id: RULE("erratum-references-resolve"), level: "error", description: "Erratum.correctsSection / correctsClaim / correctsFinding / correctsEquation must all resolve when set.", since: "0.4" },
];

// CiTO 2.7-aligned subset counted as "review-relevant" for the
// epistemicMethod=='review' invariant. Mirror of
// REVIEW_RELEVANT_CITATION_KINDS in static/schemas/academic-paper.ts.
const REVIEW_RELEVANT_CITATION_KINDS = new Set<string>([
  "reviews",
  "critiques",
  "agrees-with",
  "disagrees-with",
  "qualifies",
  "extends",
  "confirms",
  "refutes",
]);

function findingsForPaper(
  paperPrim: PrimitiveInstance,
  workbook: { primitives: Record<string, PrimitiveInstance> },
): PaperFinding[] {
  const findings: PaperFinding[] = [];
  const paperFv = paperPrim.field_values as Record<string, unknown>;
  const paperId = paperFv["id"] as string | undefined;
  if (!paperId) return findings;

  // Index workbook primitives by type for O(1) reference resolution.
  const byType = new Map<string, Map<string, PrimitiveInstance>>();
  for (const p of Object.values(workbook.primitives)) {
    if (!byType.has(p.type_id)) byType.set(p.type_id, new Map());
    const fv = p.field_values as Record<string, unknown>;
    const id = fv["id"] as string | undefined;
    if (id) byType.get(p.type_id)!.set(id, p);
  }
  const ids = (entity: string): Map<string, PrimitiveInstance> =>
    byType.get(`${TYPE_PREFIX}:${entity}`) ?? new Map();

  const inThisPaper = (
    p: PrimitiveInstance,
  ): boolean =>
    (p.field_values as Record<string, unknown>)["paper"] === paperId;

  const authors = Array.from(ids("Author").values()).filter(inThisPaper);
  const sections = Array.from(ids("Section").values()).filter(inThisPaper);
  const claims = Array.from(ids("Claim").values()).filter(inThisPaper);
  const evidence = Array.from(ids("Evidence").values()).filter(inThisPaper);
  const quotations = Array.from(ids("Quotation").values()).filter(
    inThisPaper,
  );
  const definitions = Array.from(ids("Definition").values()).filter(
    inThisPaper,
  );
  const equations = Array.from(ids("Equation").values()).filter(
    inThisPaper,
  );
  const findingsPrim = Array.from(ids("Finding").values()).filter(
    inThisPaper,
  );
  const citations = Array.from(ids("Citation").values()).filter(
    inThisPaper,
  );
  const fundings = Array.from(ids("Funding").values()).filter(inThisPaper);
  // v0.3 collections — Funder is workbook-wide (not paper-scoped), Table
  // and PaperRelation are paper-scoped like the others.
  const funders = Array.from(ids("Funder").values());
  const tables = Array.from(ids("Table").values()).filter(inThisPaper);
  const paperRelations = Array.from(ids("PaperRelation").values()).filter(
    inThisPaper,
  );
  // v0.4 — Erratum (within-paper correction/retraction record).
  const errata = Array.from(ids("Erratum").values()).filter(inThisPaper);
  // Theories are workbook-wide (cross-paper consolidation).
  const theories = Array.from(ids("Theory").values());
  const concepts = Array.from(ids("Concept").values());
  const affiliationIds = ids("Affiliation");
  const works = ids("Work");

  const fvId = (p: PrimitiveInstance): string =>
    (p.field_values as Record<string, unknown>)["id"] as string;
  const claimIdSet = new Set(claims.map(fvId));
  const findingIdSet = new Set(findingsPrim.map(fvId));
  const quotationIdSet = new Set(quotations.map(fvId));
  const sectionIdSet = new Set(sections.map(fvId));
  const authorIdSet = new Set(authors.map(fvId));
  // v0.3 id sets.
  const funderIdSet = new Set(funders.map(fvId));
  const conceptIdSet = new Set(concepts.map(fvId));
  const equationIdSet = new Set(equations.map(fvId));
  const theoryIdSet = new Set(theories.map(fvId));
  const workIdSet = new Set(
    Array.from(works.values()).map(
      (w) => (w.field_values as Record<string, unknown>)["id"] as string,
    ),
  );

  // (B) authors-required + author-affiliations-resolve.
  if (authors.length === 0) {
    findings.push({
      rule_id: RULE("authors-required"),
      level: "error",
      target_id: paperPrim.id,
      message: "paper must have at least one Author",
    });
  }
  for (const author of authors) {
    const affs =
      (author.field_values as Record<string, unknown>)["affiliations"] ??
      [];
    const list = Array.isArray(affs) ? (affs as string[]) : [];
    if (list.length === 0) {
      findings.push({
        rule_id: RULE("author-affiliations-resolve"),
        level: "error",
        target_id: author.id,
        message: `Author ${fvId(author)} must declare at least one Affiliation`,
      });
    }
    for (const affId of list) {
      if (!affiliationIds.has(affId)) {
        findings.push({
          rule_id: RULE("author-affiliations-resolve"),
          level: "error",
          target_id: author.id,
          message: `Author affiliation ref '${affId}' does not resolve in workbook`,
          field_path: "affiliations",
        });
      }
    }
  }

  // (A) referential integrity — heavy cross-references.
  for (const e of evidence) {
    const supports =
      ((e.field_values as Record<string, unknown>)["supports"] as
        | string[]
        | undefined) ?? [];
    for (const claimId of supports) {
      if (!claimIdSet.has(claimId)) {
        findings.push({
          rule_id: RULE("evidence-supports-resolve"),
          level: "error",
          target_id: e.id,
          message: `Evidence supports unknown Claim '${claimId}'`,
          field_path: "supports",
        });
      }
    }
  }
  for (const q of quotations) {
    const fromWork = (q.field_values as Record<string, unknown>)[
      "quotesFrom"
    ] as string | undefined;
    if (fromWork && !works.has(fromWork)) {
      findings.push({
        rule_id: RULE("quotation-quotesfrom-resolves"),
        level: "error",
        target_id: q.id,
        message: `Quotation.quotesFrom='${fromWork}' does not resolve to a Work`,
        field_path: "quotesFrom",
      });
    }
  }

  // Citation ref-integrity (v0.2 + v0.3 citingSection check).
  for (const ci of citations) {
    const fv = ci.field_values as Record<string, unknown>;
    const citedWork = fv["citedWork"] as string | undefined;
    if (citedWork && !workIdSet.has(citedWork)) {
      findings.push({
        rule_id: RULE("citation-references-resolve"),
        level: "error",
        target_id: ci.id,
        message: `Citation.citedWork='${citedWork}' does not resolve to a Work`,
        field_path: "citedWork",
      });
    }
    const citingClaim = fv["citingClaim"] as string | undefined;
    if (citingClaim && !claimIdSet.has(citingClaim)) {
      findings.push({
        rule_id: RULE("citation-references-resolve"),
        level: "error",
        target_id: ci.id,
        message: `Citation.citingClaim='${citingClaim}' does not resolve`,
        field_path: "citingClaim",
      });
    }
    const citingFinding = fv["citingFinding"] as string | undefined;
    if (citingFinding && !findingIdSet.has(citingFinding)) {
      findings.push({
        rule_id: RULE("citation-references-resolve"),
        level: "error",
        target_id: ci.id,
        message: `Citation.citingFinding='${citingFinding}' does not resolve`,
        field_path: "citingFinding",
      });
    }
    const citingSection = fv["citingSection"] as string | undefined;
    if (citingSection && !sectionIdSet.has(citingSection)) {
      findings.push({
        rule_id: RULE("citation-references-resolve"),
        level: "error",
        target_id: ci.id,
        message: `Citation.citingSection='${citingSection}' does not resolve`,
        field_path: "citingSection",
      });
    }
    const citedQuotation = fv["citedQuotation"] as string | undefined;
    if (citedQuotation && !quotationIdSet.has(citedQuotation)) {
      findings.push({
        rule_id: RULE("citation-references-resolve"),
        level: "error",
        target_id: ci.id,
        message: `Citation.citedQuotation='${citedQuotation}' does not resolve`,
        field_path: "citedQuotation",
      });
    }
  }

  // Funding ref-integrity (v0.2 recipients + v0.3 funder FK).
  for (const fu of fundings) {
    const fv = fu.field_values as Record<string, unknown>;
    const funderRef = fv["funder"] as string | undefined;
    if (funderRef && !funderIdSet.has(funderRef)) {
      findings.push({
        rule_id: RULE("funding-funder-resolves"),
        level: "error",
        target_id: fu.id,
        message: `Funding.funder='${funderRef}' does not resolve to a Funder`,
        field_path: "funder",
      });
    }
    const recipients = (fv["recipients"] as string[] | undefined) ?? [];
    for (const aid of recipients) {
      if (!authorIdSet.has(aid)) {
        findings.push({
          rule_id: RULE("funding-recipients-resolve"),
          level: "error",
          target_id: fu.id,
          message: `Funding.recipients includes unknown Author '${aid}'`,
          field_path: "recipients",
        });
      }
    }
  }

  // Funder.registryId advisory (NEW v0.3.1). WARNING level — declares
  // the gap (PALS's LAW posture) without blocking. Only fires for
  // Funders referenced by this paper's Fundings; orphan Funders in the
  // workbook are someone else's problem.
  const referencedFunderIds = new Set<string>();
  for (const fu of fundings) {
    const f = (fu.field_values as Record<string, unknown>)["funder"] as
      | string
      | undefined;
    if (f) referencedFunderIds.add(f);
  }
  for (const funder of funders) {
    const fv = funder.field_values as Record<string, unknown>;
    const fid = fv["id"] as string;
    if (!referencedFunderIds.has(fid)) continue;
    const registryId = fv["registryId"] as string | undefined;
    if (!registryId || registryId === "") {
      findings.push({
        rule_id: RULE("funder-registry-id-missing"),
        level: "warning",
        target_id: funder.id,
        message: `Funder '${fid}' (${
          (fv["name"] as string | undefined) ?? "<unnamed>"
        }) has no registryId — niche funders may lack a ROR/Crossref Funder Registry entry, but the absence should be deliberate. PALS's LAW: declare the gap.`,
        field_path: "registryId",
      });
    }
  }

  // Table ref-integrity (NEW v0.3).
  for (const tb of tables) {
    const fv = tb.field_values as Record<string, unknown>;
    const section = fv["section"] as string | undefined;
    if (section && !sectionIdSet.has(section)) {
      findings.push({
        rule_id: RULE("table-references-resolve"),
        level: "error",
        target_id: tb.id,
        message: `Table.section='${section}' does not resolve`,
        field_path: "section",
      });
    }
  }

  // PaperRelation ref-integrity (NEW v0.3).
  for (const pr of paperRelations) {
    const fv = pr.field_values as Record<string, unknown>;
    const relatedWork = fv["relatedWork"] as string | undefined;
    if (relatedWork && !workIdSet.has(relatedWork)) {
      findings.push({
        rule_id: RULE("paper-relation-references-resolve"),
        level: "error",
        target_id: pr.id,
        message: `PaperRelation.relatedWork='${relatedWork}' does not resolve to a Work`,
        field_path: "relatedWork",
      });
    }
  }

  // v0.4 — Claim.supersededBy must resolve and not self-loop. When
  // lifecycleStatus='superseded', supersededBy MUST be present (enforced
  // at primitive .refine()); here we check the cross-claim reference.
  for (const c of claims) {
    const fv = c.field_values as Record<string, unknown>;
    const claimId = fv["id"] as string;
    const supersededBy = fv["supersededBy"] as string | undefined;
    if (supersededBy === undefined) continue;
    if (supersededBy === claimId) {
      findings.push({
        rule_id: RULE("claim-superseded-by-resolves"),
        level: "error",
        target_id: c.id,
        message: `Claim.supersededBy='${supersededBy}' refers to itself`,
        field_path: "supersededBy",
      });
    } else if (!claimIdSet.has(supersededBy)) {
      findings.push({
        rule_id: RULE("claim-superseded-by-resolves"),
        level: "error",
        target_id: c.id,
        message: `Claim.supersededBy='${supersededBy}' does not resolve to a Claim in this paper`,
        field_path: "supersededBy",
      });
    }
  }

  // v0.4 — Finding.testsHypothesis must resolve to a Claim whose
  // kind=='hypothesis'. The entity-level .refine() already requires that
  // Finding.outcome is only set when Finding.testsHypothesis is set;
  // here we verify the cross-claim reference and its kind.
  for (const f of findingsPrim) {
    const fv = f.field_values as Record<string, unknown>;
    const testsHypothesis = fv["testsHypothesis"] as string | undefined;
    if (testsHypothesis === undefined) continue;
    if (!claimIdSet.has(testsHypothesis)) {
      findings.push({
        rule_id: RULE("finding-tests-hypothesis-resolves"),
        level: "error",
        target_id: f.id,
        message: `Finding.testsHypothesis='${testsHypothesis}' does not resolve to a Claim in this paper`,
        field_path: "testsHypothesis",
      });
      continue;
    }
    const target = claims.find((cc) => fvId(cc) === testsHypothesis);
    if (
      target &&
      (target.field_values as Record<string, unknown>)["kind"] !==
        "hypothesis"
    ) {
      findings.push({
        rule_id: RULE("finding-tests-hypothesis-kind"),
        level: "error",
        target_id: f.id,
        message: `Finding.testsHypothesis must reference a Claim with kind='hypothesis' (referenced Claim '${testsHypothesis}' has kind='${
          (target.field_values as Record<string, unknown>)["kind"]
        }')`,
        field_path: "testsHypothesis",
      });
    }
  }

  // v0.4 — Erratum ref-integrity. Each Erratum's corrects* fields must
  // resolve to in-paper primitives. Entity-level .refine() guarantees
  // that at least one corrects* target is set (except kind='retraction').
  const equationIdSetForErrata = new Set(equations.map(fvId));
  for (const er of errata) {
    const fv = er.field_values as Record<string, unknown>;
    const correctsSection = fv["correctsSection"] as string | undefined;
    const correctsClaim = fv["correctsClaim"] as string | undefined;
    const correctsFinding = fv["correctsFinding"] as string | undefined;
    const correctsEquation = fv["correctsEquation"] as string | undefined;
    if (correctsSection && !sectionIdSet.has(correctsSection)) {
      findings.push({
        rule_id: RULE("erratum-references-resolve"),
        level: "error",
        target_id: er.id,
        message: `Erratum.correctsSection='${correctsSection}' does not resolve`,
        field_path: "correctsSection",
      });
    }
    if (correctsClaim && !claimIdSet.has(correctsClaim)) {
      findings.push({
        rule_id: RULE("erratum-references-resolve"),
        level: "error",
        target_id: er.id,
        message: `Erratum.correctsClaim='${correctsClaim}' does not resolve`,
        field_path: "correctsClaim",
      });
    }
    if (correctsFinding && !findingIdSet.has(correctsFinding)) {
      findings.push({
        rule_id: RULE("erratum-references-resolve"),
        level: "error",
        target_id: er.id,
        message: `Erratum.correctsFinding='${correctsFinding}' does not resolve`,
        field_path: "correctsFinding",
      });
    }
    if (correctsEquation && !equationIdSetForErrata.has(correctsEquation)) {
      findings.push({
        rule_id: RULE("erratum-references-resolve"),
        level: "error",
        target_id: er.id,
        message: `Erratum.correctsEquation='${correctsEquation}' does not resolve`,
        field_path: "correctsEquation",
      });
    }
  }

  // Author.position invariant (NEW v0.3): at most one Author per paper
  // has position='first', and at most one has position='last'.
  let firstCount = 0;
  let lastCount = 0;
  for (const a of authors) {
    const pos = (a.field_values as Record<string, unknown>)["position"];
    if (pos === "first") firstCount++;
    if (pos === "last") lastCount++;
  }
  if (firstCount > 1) {
    findings.push({
      rule_id: RULE("author-position-unique-first"),
      level: "error",
      target_id: paperPrim.id,
      message: `at most one Author may have position='first' (found ${firstCount})`,
    });
  }
  if (lastCount > 1) {
    findings.push({
      rule_id: RULE("author-position-unique-last"),
      level: "error",
      target_id: paperPrim.id,
      message: `at most one Author may have position='last' (found ${lastCount})`,
    });
  }

  // Paper.publicationDate.year vs Paper.year cross-check (NEW v0.3.1).
  const publicationDate = paperFv["publicationDate"] as string | undefined;
  const paperYear = paperFv["year"] as number | undefined;
  if (publicationDate && typeof paperYear === "number") {
    const pubYear = Number(publicationDate.slice(0, 4));
    if (Number.isFinite(pubYear) && pubYear !== paperYear) {
      findings.push({
        rule_id: RULE("publication-date-year-agrees"),
        level: "error",
        target_id: paperPrim.id,
        message: `paper.publicationDate's year (${pubYear}) disagrees with paper.year (${paperYear}); the two MUST match.`,
        field_path: "publicationDate",
      });
    }
  }

  // Transitive cycle detection (NEW v0.3) — 7 relations, mirrors the
  // schema's RefinedAcademicPaperSchema.superRefine cycle block.
  const reportCycle = (
    suffix: string,
    relationLabel: string,
    cycle: string[],
  ) =>
    findings.push({
      rule_id: RULE(`cycle.${suffix}`),
      level: "error",
      target_id: paperPrim.id,
      message: `cycle detected in ${relationLabel}: ${cycle.join(" → ")}`,
    });

  // 1. Section.parent
  {
    const edges = new Map<string, string[]>();
    for (const s of sections) {
      const parent = (s.field_values as Record<string, unknown>)[
        "parent"
      ] as string | undefined;
      if (parent) edges.set(fvId(s), [parent]);
    }
    const cycle = findCycleInRelation(sectionIdSet, edges);
    if (cycle) reportCycle("section-parent", "sections.parent", cycle);
  }
  // 2. Concept.extends
  {
    const edges = new Map<string, string[]>();
    for (const c of concepts) {
      const extendsArr =
        ((c.field_values as Record<string, unknown>)["extends"] as
          | string[]
          | undefined) ?? [];
      edges.set(fvId(c), extendsArr);
    }
    const cycle = findCycleInRelation(conceptIdSet, edges);
    if (cycle) reportCycle("concept-extends", "concepts.extends", cycle);
  }
  // 3. Claim.derivesFrom
  {
    const edges = new Map<string, string[]>();
    for (const c of claims) {
      const derivesFromArr =
        ((c.field_values as Record<string, unknown>)["derivesFrom"] as
          | string[]
          | undefined) ?? [];
      edges.set(fvId(c), derivesFromArr);
    }
    const cycle = findCycleInRelation(claimIdSet, edges);
    if (cycle)
      reportCycle("claim-derives-from", "claims.derivesFrom", cycle);
  }
  // 4. Equation.derivesFrom
  {
    const edges = new Map<string, string[]>();
    for (const eq of equations) {
      const derivesFromArr =
        ((eq.field_values as Record<string, unknown>)["derivesFrom"] as
          | string[]
          | undefined) ?? [];
      edges.set(fvId(eq), derivesFromArr);
    }
    const cycle = findCycleInRelation(equationIdSet, edges);
    if (cycle)
      reportCycle(
        "equation-derives-from",
        "equations.derivesFrom",
        cycle,
      );
  }
  // 5. Theory.extendsTheory
  {
    const edges = new Map<string, string[]>();
    for (const t of theories) {
      const extendsArr =
        ((t.field_values as Record<string, unknown>)["extendsTheory"] as
          | string[]
          | undefined) ?? [];
      edges.set(fvId(t), extendsArr);
    }
    const cycle = findCycleInRelation(theoryIdSet, edges);
    if (cycle)
      reportCycle(
        "theory-extends-theory",
        "theories.extendsTheory",
        cycle,
      );
  }
  // 6. Work.translationOf
  {
    const edges = new Map<string, string[]>();
    for (const w of works.values()) {
      const fv = w.field_values as Record<string, unknown>;
      const t = fv["translationOf"] as string | undefined;
      if (t) edges.set(fv["id"] as string, [t]);
    }
    const cycle = findCycleInRelation(workIdSet, edges);
    if (cycle)
      reportCycle(
        "work-translation-of",
        "works.translationOf",
        cycle,
      );
  }
  // 7. Work.editionOf
  {
    const edges = new Map<string, string[]>();
    for (const w of works.values()) {
      const fv = w.field_values as Record<string, unknown>;
      const e = fv["editionOf"] as string | undefined;
      if (e) edges.set(fv["id"] as string, [e]);
    }
    const cycle = findCycleInRelation(workIdSet, edges);
    if (cycle)
      reportCycle("work-edition-of", "works.editionOf", cycle);
  }

  // (C) Concept must be defined OR borrowsFrom a Theorist.
  for (const c of concepts) {
    const cFv = c.field_values as Record<string, unknown>;
    const conceptId = cFv["id"] as string;
    const borrowsFrom = (cFv["borrowsFrom"] as string[] | undefined) ?? [];
    const hasDefinition = definitions.some(
      (d) =>
        (d.field_values as Record<string, unknown>)["concept"] ===
        conceptId,
    );
    if (!hasDefinition && borrowsFrom.length === 0) {
      findings.push({
        rule_id: RULE("concept-defined-or-borrowed"),
        level: "error",
        target_id: c.id,
        message: `Concept '${conceptId}' must have a Definition in this paper or a borrowsFrom→Theorist link`,
      });
    }
  }

  // Section parent ref-integrity (separate rule_id from evidence walk).
  for (const s of sections) {
    const parent = (s.field_values as Record<string, unknown>)[
      "parent"
    ] as string | undefined;
    if (parent && !sectionIdSet.has(parent)) {
      findings.push({
        rule_id: RULE("section-parent-resolves"),
        level: "error",
        target_id: s.id,
        message: `Section.parent='${parent}' does not resolve`,
        field_path: "parent",
      });
    }
  }

  // (D) method-conditional required-ness — v0.2 rules.
  // Read epistemicMethod (the new field). Tolerate missing for forward
  // compatibility — the per-entity Zod validator will already have
  // rejected an instance lacking the required field.
  const method = paperFv["epistemicMethod"] as string | undefined;

  if (method === "theoretical" && equations.length === 0) {
    findings.push({
      rule_id: RULE("method.theoretical-needs-equations"),
      level: "error",
      target_id: paperPrim.id,
      message:
        "paper.epistemicMethod == 'theoretical' requires at least one Equation in the workbook",
    });
  }

  if (method === "literary-critical" && quotations.length === 0) {
    findings.push({
      rule_id: RULE("method.literary-critical-needs-quotations"),
      level: "error",
      target_id: paperPrim.id,
      message:
        "paper.epistemicMethod == 'literary-critical' requires at least one Quotation in the workbook",
    });
  }

  if (method === "empirical") {
    // Strengthened in v0.2: BOTH a hypothesis Claim AND an empirical
    // Claim supported by data Evidence. `descriptive` is the relaxed
    // alternative for exploratory/observational work.
    const hasHypothesis = claims.some(
      (c) => (c.field_values as Record<string, unknown>)["kind"] === "hypothesis",
    );
    if (!hasHypothesis) {
      findings.push({
        rule_id: RULE("method.empirical-needs-hypothesis"),
        level: "error",
        target_id: paperPrim.id,
        message:
          "paper.epistemicMethod == 'empirical' requires ≥1 Claim of kind 'hypothesis' (use 'descriptive' for exploratory/observational work without a pre-registered hypothesis)",
      });
    }
    const empiricalClaims = claims.filter(
      (c) =>
        (c.field_values as Record<string, unknown>)["kind"] === "empirical",
    );
    const hasDataSupport = empiricalClaims.some((c) => {
      const claimId = fvId(c);
      return evidence.some((e) => {
        const fv = e.field_values as Record<string, unknown>;
        const supports = (fv["supports"] as string[] | undefined) ?? [];
        return supports.includes(claimId) && fv["kind"] === "data";
      });
    });
    if (!hasDataSupport) {
      findings.push({
        rule_id: RULE("method.empirical-needs-data"),
        level: "error",
        target_id: paperPrim.id,
        message:
          "paper.epistemicMethod == 'empirical' requires ≥1 empirical Claim supported by Evidence of kind 'data'",
      });
    }
    // v0.4 — every hypothesis Claim must be referenced by ≥1 Finding via
    // testsHypothesis. Empirical work that states a hypothesis but never
    // closes the loop is a coherence gap.
    const hypothesisIds = new Set<string>(
      claims
        .filter(
          (c) =>
            (c.field_values as Record<string, unknown>)["kind"] ===
            "hypothesis",
        )
        .map(fvId),
    );
    const testedHypothesisIds = new Set<string>(
      findingsPrim
        .map(
          (f) =>
            (f.field_values as Record<string, unknown>)["testsHypothesis"] as
              | string
              | undefined,
        )
        .filter((x): x is string => typeof x === "string"),
    );
    for (const hid of hypothesisIds) {
      if (!testedHypothesisIds.has(hid)) {
        const target = claims.find((c) => fvId(c) === hid);
        findings.push({
          rule_id: RULE("method.empirical-hypothesis-tested"),
          level: "error",
          target_id: target?.id ?? paperPrim.id,
          message: `paper.epistemicMethod == 'empirical': hypothesis Claim '${hid}' is not tested by any Finding (no Finding.testsHypothesis == '${hid}')`,
        });
      }
    }
  }

  // method == 'descriptive' intentionally has no required-ness check.
  // method == 'methodological' likewise has no v0.2 required-ness check.

  if (method === "review") {
    // CHANGE v0.2: count distinct Citations of "review-relevant" kinds,
    // not the v0.1 proxy of (quotations ∪ evidence.work ∪
    // definitions.citedFrom). A review must engage substantively.
    const reviewedWorkIds = new Set<string>();
    for (const ci of citations) {
      const fv = ci.field_values as Record<string, unknown>;
      const kind = fv["kind"] as string | undefined;
      const citedWork = fv["citedWork"] as string | undefined;
      if (kind && citedWork && REVIEW_RELEVANT_CITATION_KINDS.has(kind)) {
        reviewedWorkIds.add(citedWork);
      }
    }
    if (reviewedWorkIds.size < 10) {
      findings.push({
        rule_id: RULE("method.review-needs-citations"),
        level: "error",
        target_id: paperPrim.id,
        message: `paper.epistemicMethod == 'review' requires ≥10 distinct cited Works across Citations of review-relevant kinds (reviews, critiques, agrees-with, disagrees-with, qualifies, extends, confirms, refutes); found ${reviewedWorkIds.size}`,
      });
    }
  }

  if (method === "historical") {
    const hasObs = evidence.some((e) => {
      const k = (e.field_values as Record<string, unknown>)["kind"];
      return k === "observation" || k === "data";
    });
    if (!hasObs) {
      findings.push({
        rule_id: RULE("method.historical-needs-observation-or-data"),
        level: "error",
        target_id: paperPrim.id,
        message:
          "paper.epistemicMethod == 'historical' requires ≥1 Evidence of kind 'observation' or 'data'",
      });
    }
  }

  return findings;
}

/* ────────────────────────────────────────────────────────────────────
 * activate(ctx) — host calls this once per session per plugin.
 * ──────────────────────────────────────────────────────────────────── */

export const PAPER_MARKDOWN_RENDERER_ID = "acad:PaperDocumentRenderer" as const;
export const PAPER_HTML_RENDERER_ID = "acad:PaperHtmlRenderer" as const;
export const PAPER_ARGUMENT_RENDERER_ID = "acad:ArgumentGraphRenderer" as const;
export const PAPER_BIBLIOGRAPHY_RENDERER_ID = "acad:BibliographyRenderer" as const;
export const PAPER_PDF_RENDERER_ID = "acad:PaperPdfRenderer" as const;
export const PAPER_LATEX_RENDERER_ID = "acad:LatexRenderer" as const;

export async function activate(ctx: PluginContext): Promise<void> {
  const sidecar = buildAcademicPaperSidecar();
  const result = assembleDomainProfileFromSidecar({
    domain: sidecar,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });

  if (result.profile.id !== PROFILE_ID) {
    throw new Error(
      `fdpm.academic-paper activation drift: bridge emitted profile id "${result.profile.id}" but PROFILE_ID="${PROFILE_ID}". Schema, sidecar, and constant must agree. Run \`npm run bridge\` and bump the version per principle:schema-change-implies-version-bump.`,
    );
  }
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(
      `fdpm.academic-paper manifest mismatch: fdpm-plugin.json declares id="${manifest.id}" but PLUGIN_ID="${PLUGIN_ID}".`,
    );
  }

  const profile = JSON.parse(JSON.stringify(result.profile)) as DomainProfile;
  // Attach paper-coherence rule metadata to the profile so each rule is
  // introspectable via `fdpm profile get` and the MCP profile_get tool.
  // The bridge does not emit profile.validation_rules; we author it here.
  // Each rule's implementation lives in `findingsForPaper`; findings
  // carry the matching `rule_id`. The host compiler treats `predicate`
  // as opaque metadata when no CEL expression is provided.
  const paperTypeId = `${TYPE_PREFIX}:Paper`;
  const profileWithRules = profile as DomainProfile & {
    validation_rules?: unknown[];
  };
  profileWithRules.validation_rules = [
    ...(profileWithRules.validation_rules ?? []),
    ...PAPER_COHERENCE_RULES.map((r) => ({
      id: r.id,
      name: r.id,
      targets: [paperTypeId],
      level: r.level,
      // Predicate is "true" (no-op CEL) because the actual rule logic
      // runs through the registered `${VENDOR}:val:paper-coherence`
      // walker (see findingsForPaper); the metadata here exists solely
      // to make rule ids introspectable via `profile get`. Using a
      // non-evaluable sentinel raises "Unknown variable" at validation
      // time; "true" is the cheapest CEL no-op.
      predicate: "true",
      description: `${r.description} [since ${r.since}, impl: ${VENDOR}:val:paper-coherence]`,
    })),
  ];
  ctx.registerProfile(profile);

  // Per-entity Zod validators. No variant-per-primitive splits.
  const variantFields = variantFieldsByEntity(sidecar);

  for (const [entityName, entity] of Object.entries(sidecar.entities)) {
    const typeId = `${TYPE_PREFIX}:${entityName}`;
    const ruleId = `${VENDOR}:val:${entityName.toLowerCase()}-zod`;
    const schemaForValidator = validatorSchemaFor(
      entityName,
      entity.schema,
      variantFields,
    );
    const { validator } = zodSchemaToValidator(
      schemaForValidator as typeof entity.schema,
      {
        pluginId: PLUGIN_ID,
        typeName: entityName.toLowerCase(),
      },
    );
    const adapted: ValidatorFn = (instance) => {
      const findings = validator({
        id: instance.id,
        type_id: instance.type_id,
        field_values:
          (instance as { field_values?: Record<string, unknown> })
            .field_values ?? {},
      });
      return findings.map((f) => ({
        rule_id: f.rule_id,
        level: f.level === "warning" ? "warning" : "error",
        target_id: instance.id,
        message: f.message,
        ...(f.path && f.path.length > 0
          ? { field_path: f.path.join(".") }
          : {}),
      })) as never;
    };
    ctx.registerValidator({ type_id: typeId, rule_id: ruleId, fn: adapted });
  }

  // Paper-coherence validator. Registered against acad:Paper because
  // Paper is the workbook-framing entity and the kind-conditional rules
  // depend on paper.kind. Fires on Paper create/patch/replace; walks
  // the entire workbook to verify referential integrity and required-ness.
  const paperValidator: ValidatorFn = (instance, _type, _profile, vctx) => {
    const wb = (
      vctx as
        | {
            workbook?: { primitives?: Record<string, PrimitiveInstance> };
          }
        | undefined
    )?.workbook;
    if (!wb || !wb.primitives) return [];
    const findings = findingsForPaper(instance as PrimitiveInstance, {
      primitives: wb.primitives,
    });
    return findings as never;
  };
  ctx.registerValidator({
    type_id: `${TYPE_PREFIX}:Paper`,
    rule_id: `${VENDOR}:val:paper-coherence`,
    fn: paperValidator,
  });

  // ─────────────────────────────────────────────────────────────────
  // Optional capabilities — cap:renderer / cap:importer / cap:exporter.
  // ─────────────────────────────────────────────────────────────────

  const SPEC_CORE_VERSION = "1.0";

  // The paper as a paper: sections in order, claims with their evidence,
  // findings, references. Twenty-four field tables described the records;
  // none rendered the argument they describe.
  ctx.registerRenderer({ target: "text/markdown", rendererId: PAPER_MARKDOWN_RENDERER_ID, fn: renderPaperMarkdown as RendererFn });
  ctx.registerRenderer({ target: "text/html", rendererId: PAPER_HTML_RENDERER_ID, fn: renderPaperHtml as RendererFn });
  // The argument, drawn. Five relation types carry derivation, rebuttal,
  // supersession, support and hypothesis-testing, and a bulleted list of
  // claims hides every one of them.
  ctx.registerRenderer({ target: "image/svg+xml", rendererId: PAPER_ARGUMENT_RENDERER_ID, fn: renderArgumentGraph as RendererFn });
  ctx.registerRenderer({ target: "application/x-bibtex", rendererId: PAPER_BIBLIOGRAPHY_RENDERER_ID, fn: renderBibliography as RendererFn });
  ctx.registerRenderer({ target: "application/pdf", rendererId: PAPER_PDF_RENDERER_ID, fn: renderPaperPdf as RendererFn });
  ctx.registerRenderer({ target: "application/x-tex", rendererId: PAPER_LATEX_RENDERER_ID, fn: renderPaperLatex as RendererFn });
  ctx.logger.info(
    `fdpm.academic-paper activated: ${result.profile.primitive_types.length} primitive types, ${result.profile.relation_types.length} relation types, ${
      (result.profile.constraints ?? []).length
    } CEL rules + ${result.profile.primitive_types.length} per-primitive validators + 1 paper-coherence validator + 6 renderers (md, html, svg, bibtex, pdf, tex) + ${Object.keys(sidecar.entities).length} importers + ${
      Object.keys(sidecar.entities).length
    } exporters. Profile id: ${PROFILE_ID}.`,
  );
}

export function onInstall(ctx: PluginContext): void {
  ctx.logger.debug(`onInstall fired for ${ctx.pluginId}`);
}
export function onEnable(ctx: PluginContext): void {
  ctx.logger.debug(`onEnable fired for ${ctx.pluginId}`);
}
export function onDisable(ctx: PluginContext): void {
  ctx.logger.debug(`onDisable fired for ${ctx.pluginId}`);
}
export function onUninstall(ctx: PluginContext): void {
  ctx.logger.debug(`onUninstall fired for ${ctx.pluginId}`);
}
export function deactivate(ctx: PluginContext): void {
  ctx.logger.debug(`deactivate fired for ${ctx.pluginId}`);
}

const entry: PluginEntryModule = {
  manifest,
  activate,
  onInstall,
  onEnable,
  onDisable,
  onUninstall,
  deactivate,
};
export default entry;
