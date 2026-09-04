---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "fdpm-cli/scripts/build-profile-atlas.ts"
---

<!-- GENERATED FILE — DO NOT EDIT.
     Source: fdpm-cli/scripts/build-profile-atlas.ts
     Regenerate: npx tsx scripts/build-profile-atlas.ts
     Gate: fdpm-cli/tests/_meta/doc-drift.test.ts runs it with --check. -->

# Profile atlas

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Every `DomainProfile` this repository ships. Counts and identifiers are read
from the running host — the profile registry and each plugin's registered
contributions — not from the manifests on disk and not typed by hand.

## What a profile is

A profile is the schema a workbook is validated against: the closed set of
primitive types and relation types that workbook may contain, the fields
each type requires, the categories and scopes that organise them, and the
validation rules a write must satisfy. A workbook names one profile when it
is created and cannot change it afterwards: of the closed set of operation
kinds in `src/core/operations/kinds.ts`, `profile_id` appears in exactly one
payload — `ProjectCreatePayload` — and payloads are `.strict()`, so no
operation exists that could rewrite it.

A profile may `extend` others. The registry resolves the chain at
registration, rejecting cycles and id collisions, so a derived profile
resolves to the union of its own types and its parents'. **Resolved** counts
below are post-inheritance — what a workbook is actually checked against.
**Own** counts are what the profile's own file declares.

A profile is not the whole story. The plugin that ships it usually also
registers validators (rules the profile file cannot express), renderers
(how a workbook becomes a document), importers and exporters, expression
helpers, and MCP prompts. Those are listed per profile below, because in
practice they are what makes a profile usable.

## Inventory

25 profiles from 24 repository plugins: 22 base and
3 derived. Together they register 1409 validators,
53 renderers and 7 MCP prompts.

| Profile | Version | Prim. | Rel. | Rules | Extends | Shipped by |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `core:empty` | 1.0.0 | 0 | 0 | 0 | — | the core host |
| `profile:academic-paper:0.4.1` | 0.5.0 | 24 | 61 | 33 | — | `plugins/academic_paper_v0_4_1/` |
| `profile:acme-business-deck:0.1` | 0.1.0 | 13 | 12 | 0 | — | `plugins/acme_business_deck/` |
| `profile:acme-pitch-deck:0.1` | 0.1.0 | 21 | 21 | 0 | — | `plugins/acme_pitch_deck/` |
| `profile:agent-memory:2.0` | 2.0.0 | 6 | 6 | 0 | — | `plugins/agent_memory/` |
| `profile:dnis:0.1` | 0.1.0 | 2 | 2 | 0 | — | `plugins/dnis/` |
| `profile:document-plan-dnis:3.1` | 3.1.0 | 8 | 11 | 0 | `profile:document-plan:3.1` + `profile:dnis:0.1` | `plugins/document_plan_dnis/` |
| `profile:document-plan:3.1` | 3.1.0 | 6 | 0 | 0 | — | `plugins/document_plan/` |
| `profile:fact-fiction:0.1` | 0.1.0 | 9 | 10 | 6 | — | `plugins/fact_fiction/` |
| `profile:formal-specification-dnis:0.1` | 0.1.0 | 34 | 32 | 23 | `profile:formal-specification:3.0` + `profile:dnis:0.1` | `plugins/formal_specification_dnis/` |
| `profile:formal-specification:3.0` | 3.1.0 | 32 | 30 | 23 | — | `plugins/formal_specification/` |
| `profile:knowledge-cartridge:1.0` | 1.0.0 | 13 | 6 | 0 | — | `plugins/knowledge_cartridge/` |
| `profile:logical-knowledge-base:1.0` | 1.0.0 | 117 | 77 | 0 | — | `plugins/logical_knowledge_base/` |
| `profile:loop-forward:2.0` | 2.0.0 | 15 | 22 | 0 | — | `plugins/loop_forward/` |
| `profile:planning:0.1` | 0.1.0 | 6 | 9 | 12 | — | `plugins/planning/` |
| `profile:re-crt:6.2` | 6.2.0 | 10 | 15 | 0 | — | `plugins/re_crt/` |
| `profile:silent-acceptance:2.1` | 2.1.0 | 13 | 23 | 0 | — | `plugins/silent_acceptance/` |
| `profile:software-architecture:1.0` | 1.1.0 | 23 | 25 | 14 | — | `plugins/software_architecture/` |
| `profile:software-requirements:0.2` | 0.2.0 | 8 | 17 | 19 | — | `plugins/software_requirements/` |
| `profile:spec-authoring-dnis:0.1` | 0.1.0 | 31 | 20 | 24 | `profile:spec-authoring:0.1` + `profile:dnis:0.1` | `plugins/spec_authoring_dnis/` |
| `profile:spec-authoring:0.1` | 0.1.0 | 29 | 18 | 24 | — | `plugins/spec_authoring/` |
| `profile:starter:0.1` | 0.1.0 | 3 | 2 | 2 | — | `plugins/_starter/` |
| `profile:style:3.1` | 3.1.0 | 15 | 10 | 0 | — | `plugins/style/` |
| `profile:uixo:1.2` | 1.2.0 | 712 | 210 | 0 | — | `plugins/uixo/` |
| `profile:uml:2.5` | 2.5.1 | 22 | 24 | 0 | — | `plugins/uml/` |

Across the 22 base profiles that is 1099 primitive types,
600 relation types and 133 declared validation rules. Derived
profiles are excluded from those totals: their types are their parents',
and counting them again would count every inherited type twice.

## The profiles

### `core:empty`

**Core (empty)** · v1.0.0

Zero-plugins seed profile. Contains no domain semantics.

- **Resolved:** 0 primitive types, 0 relation types, 1 category, 1 scope, 0 declared validation rules
- **Shipped by:** the core host, not a plugin

### `profile:academic-paper:0.4.1`

**Academic Paper 0.4.1** · v0.5.0

A scholarly paper as an argument graph rather than a document: claims standing on evidence, quotations bound to the works they come from, concepts defined or borrowed, and equations, figures, tables and citations attached to the sections that use them. Twenty-four types and sixty-one relations cover eight genres — empirical, theoretical, methodological, literary-critical, review, historical, essay and monograph — and the genre decides what the paper is required to carry: an empirical paper owes a hypothesis and data, a theoretical one owes equations. Authorship, affiliation, funding and errata are modelled because a submission is judged on them.

- **Resolved:** 24 primitive types, 61 relation types, 0 categories, 0 scopes, 33 declared validation rules
- **Shipped by:** `plugins/academic_paper_v0_4_1/` — `fdpm.academic-paper-v0-4-1` v0.5.0
- **Renderers (6):** `acad:PaperDocumentRenderer` → text/markdown, `acad:PaperHtmlRenderer` → text/html, `acad:ArgumentGraphRenderer` → image/svg+xml, `acad:BibliographyRenderer` → application/x-bibtex, `acad:PaperPdfRenderer` → application/pdf, `acad:LatexRenderer` → application/x-tex
- **Validators (25, 25 distinct rule ids):** see `plugins/academic_paper_v0_4_1/fdpm-plugin.json`

### `profile:acme-business-deck:0.1`

**Acme Business Deck 0.1** · v0.1.0

A business presentation as the case it makes, not the slides it renders to: claims backed by evidence, the risks and objections a room will raise, the options weighed, and the audience segments and pain points the argument is aimed at. Slides reference that material rather than containing it, so the same case can be re-cut for a different room without rewriting the reasoning, and a claim that lost its evidence is visible before the meeting rather than during it.

- **Resolved:** 13 primitive types, 12 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/acme_business_deck/` — `acme.business-deck` v0.1.0
- **Renderers (2):** `acme:DeckRunningOrderRenderer` → text/markdown, `acme:DeckContactSheetRenderer` → image/svg+xml
- **Validators (14, 14 distinct rule ids):** see `plugins/acme_business_deck/fdpm-plugin.json`

### `profile:acme-pitch-deck:0.1`

**Acme Pitch Deck 0.1** · v0.1.0

A strategic pitch deck with its slide layouts as first-class types. Strategic claims carry the data points and sources that support them, alongside the competitors, risks and anti-patterns the pitch has to answer. Thirteen slide variants — title, thesis, stat tiles, comparison, competitive quadrant, milestone timeline, ask, appendix and the rest — are separate types rather than one slide with a mode field, so each layout requires exactly the material it displays and a slide cannot be built half-populated.

- **Resolved:** 21 primitive types, 21 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/acme_pitch_deck/` — `acme.pitch-deck` v0.1.0
- **Renderers (2):** `acme.pitch-deck:RunningOrderRenderer` → text/markdown, `acme.pitch-deck:PhaseMapRenderer` → image/svg+xml
- **Validators (22, 22 distinct rule ids):** see `plugins/acme_pitch_deck/fdpm-plugin.json`

### `profile:agent-memory:2.0`

**Agent Memory 2.0** · v2.0.0

Episode-scoped memory for an autonomous agent: facts with provenance, hypotheses that owe live evidence, the actions that produced them and the decisions derived from them. A claim is never overwritten — it is superseded by a later one, and the chain of replacements is the account of how it changed.

- **Resolved:** 6 primitive types, 6 relation types, 3 categories, 1 scope, 0 declared validation rules
- **Shipped by:** `plugins/agent_memory/` — `fdpm.agent-memory` v0.1.0
- **Validators (19, 4 distinct rule ids):** `am:val:episode-partition`, `am:val:episode-writable`, `am:val:evidence`, `am:val:supersede-shape`

### `profile:dnis:0.1`

**Document Node Identity** · v0.1.0

Document Node Identity profile per SPEC-CORE §5.6 (which adopts SPEC-DNIS as a normative extension of §5). Registers the primitive types (dnis:Document, dnis:Node) and relation types (dnis:DerivedFrom, dnis:MigratedFrom) that the runtime adapter (src/core/dnis/adapter.ts) materialises SPEC-DNIS Operations into.

- **Resolved:** 2 primitive types, 2 relation types, 1 category, 1 scope, 0 declared validation rules
- **Shipped by:** `plugins/dnis/` — `fdpm.dnis` v0.1.0
- **Renderers (1):** `dnis:DocumentOutlineRenderer` → text/markdown

### `profile:document-plan-dnis:3.1`

**Document Plan (DNIS tree)** · v3.1.0

Composition profile extending profile:document-plan:3.1 and profile:dnis:0.1. A workbook on this profile holds one DocumentPlan header, its registries, and the plan's section tree as dnis:Node primitives, connected by the docplan:* relations declared here.

- **Resolved:** 8 primitive types, 11 relation types, 1 category, 1 scope, 0 declared validation rules
- **Extends:** `profile:document-plan:3.1`, `profile:dnis:0.1` — adds 0 primitive types and 9 relation types of its own
- **Shipped by:** `plugins/document_plan_dnis/` — `fdpm.document-plan-dnis` v0.1.0
- **Renderers (1):** `docplan:PlanOutlineRenderer` → text/markdown
- **Validators (1, 1 distinct rule id):** `docplan:coherence.comparative-claim-without-baseline`

### `profile:document-plan:3.1`

**Document Plan (v3.1.0)** · v3.1.0

Bridge-generated from schemas/document-plan.ts (DocumentPlan v3.1.0): the plan header and its registries (ContentSource, Concept, Asset, Thread, Person). The section tree lives as dnis:Node primitives under profile:document-plan-dnis:3.1.

- **Resolved:** 6 primitive types, 0 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/document_plan/` — `fdpm.document-plan` v0.1.0
- **Renderers (1):** `docplan:PlanBriefRenderer` → text/markdown
- **Validators (6, 6 distinct rule ids):** `docplan:val:asset-zod`, `docplan:val:concept-zod`, `docplan:val:contentsource-zod`, `docplan:val:documentplan-zod`, `docplan:val:person-zod`, `docplan:val:thread-zod`

### `profile:fact-fiction:0.1`

**FactFiction** · v0.1.0

Historical-fiction workbench: facts with shared sources and scholarly assessments, historicity-graded fiction elements, historical constraints, a typed fact-fiction coupling layer, and an arc/chapter/scene structure with narrative-style overrides.

- **Resolved:** 9 primitive types, 10 relation types, 3 categories, 1 scope, 6 declared validation rules
- **Shipped by:** `plugins/fact_fiction/` — `fdpm.fact-fiction` v0.1.0
- **Renderers (1):** `ff:ManuscriptOutlineRenderer` → text/markdown
- **MCP prompts:** `fact-fiction/ground_fiction`

### `profile:formal-specification-dnis:0.1`

**Formal-Specification + DNIS** · v0.1.0

Composition profile extending profile:formal-specification:3.0 and profile:dnis:0.1. A workbook on this profile can hold both formal_specification's typed primitives and a DNIS Node tree for graph-derived section numbering. Contributes no types of its own.

- **Resolved:** 34 primitive types, 32 relation types, 10 categories, 9 scopes, 23 declared validation rules
- **Extends:** `profile:formal-specification:3.0`, `profile:dnis:0.1` — a pure composition, declaring no types of its own
- **Shipped by:** `plugins/formal_specification_dnis/` — `fdpm.formal-specification-dnis` v0.1.0

### `profile:formal-specification:3.0`

**Formal Specification** · v3.1.0

Primitives, relations, and validation rules for modeling formal specifications, technical papers, and typed execution roadmaps. v3.1: adds enforcement to Invariant, full Assumption Ledger fields, DesignDecision lifecycle, Phase domain/state-component/objective, Citation category, four new relation types, and corrects four enum mismatches.

- **Resolved:** 32 primitive types, 30 relation types, 9 categories, 8 scopes, 23 declared validation rules, 3 templates
- **Shipped by:** `plugins/formal_specification/` — `fdpm.formal-specification` v3.1.0
- **Renderers (3):** `fs:SpecRenderer` → text/markdown, `fs:SpecHtmlRenderer` → text/html, `fs:SpecPdfRenderer` → application/pdf
- **Validators (3, 3 distinct rule ids):** `fs:val:ci-invariant-justified`, `fs:val:doi-canonical-url`, `fs:val:section-length-cap`
- **Importers:** `fs-jsonl`
- **Exporters:** `fs-jsonl`
- **Transformers:** `fs:formal-property-to-invariant`
- **Expression helpers:** `fn.fdpm.formal-specification.section-depth`

### `profile:knowledge-cartridge:1.0`

**Knowledge Cartridge 1.0** · v1.0.0

A corpus compressed into an executable competence module: a bounded competence envelope, a tiered source list, verbatim harvest with both its retained and discarded arms, six layers of procedural knowledge — primitives, invariants, constants, procedures, diagnostics, judgement — and the gaps and source conflicts the corpus could not resolve. Every normative claim carries a KEY:ordinal or it is not written.

- **Resolved:** 13 primitive types, 6 relation types, 4 categories, 1 scope, 0 declared validation rules
- **Shipped by:** `plugins/knowledge_cartridge/` — `fdpm.knowledge-cartridge` v0.1.0
- **Renderers (5):** `kc:CartridgeRenderer` → text/markdown, `kc:CartridgePdfRenderer` → application/pdf, `kc:CitationIndexRenderer` → text/html, `kc:LayerMapRenderer` → image/svg+xml, `kc:StateRenderer` → application/json
- **Validators (5, 5 distinct rule ids):** `kc:val:harvest-retention-arm`, `kc:val:invariant-falsifiable`, `kc:val:normative-claim-cited`, `kc:val:override-suspends-a-rule`, `kc:val:step-constrains-next`
- **Importers:** `kc-jsonl`
- **Exporters:** `kc-jsonl`
- **MCP prompts:** `knowledge-cartridge/build_cartridge`

### `profile:logical-knowledge-base:1.0`

**Logical Knowledge Base 1.0.0** · v1.0.0

A logical knowledge base as a typed, event-sourced graph: declarations, statements, rules, constraints, queries, proofs, argumentation, processes, conflict policies, provenance records and interoperability mappings as primitives; every `Reference` field as a typed edge; the formula, term, type and concept languages as JSON validated by the vendored schema.

- **Resolved:** 117 primitive types, 77 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/logical_knowledge_base/` — `fdpm.logical-knowledge-base` v1.0.0
- **Renderers (2):** `lkb:TheoryRenderer` → text/markdown, `lkb:ArgumentGraphRenderer` → image/svg+xml
- **Validators (503, 11 distinct rule ids):** `lkb:val:arity`, `lkb:val:document`, `lkb:val:framework-grounded`, `lkb:val:mentions-current`, `lkb:val:node-shape`, `lkb:val:reference-family`, `lkb:val:reference-resolution`, `lkb:val:rule-cycle`, `lkb:val:self-parent`, `lkb:val:single-header`, `lkb:val:step-slot`
- **Importers:** `lkb-json`
- **Exporters:** `lkb-json`
- **MCP prompts:** `logical-knowledge-base/author_theory`

### `profile:loop-forward:2.0`

**Loop-Forward 2.0** · v2.0.0

The canonical loop-forward v2 contract: versioned prompt templates, reusable agents with approval-aware tool grants, bounded multi-stage feedback pipelines whose only backward data path is a named carry, per-stage output contracts, executable examples, an evaluation gate, and terminal run receipts.

- **Resolved:** 15 primitive types, 22 relation types, 4 categories, 1 scope, 0 declared validation rules
- **Shipped by:** `plugins/loop_forward/` — `fdpm.loop-forward` v0.1.0
- **Renderers (5):** `lf:PipelineGraphRenderer` → image/svg+xml, `lf:VerificationSurfaceRenderer` → text/html, `lf:AuthorityMatrixRenderer` → text/html, `lf:BindingMatrixRenderer` → text/html, `lf:BudgetEnvelopeRenderer` → text/markdown
- **Validators (8, 8 distinct rule ids):** `lf:val:binding-source-arm`, `lf:val:carry-consistency`, `lf:val:example-reason`, `lf:val:output-contract-arm`, `lf:val:output-validator-arm`, `lf:val:stop-condition-arm`, `lf:val:tool-grant-zod`, `lf:val:variable-enum-consistency`
- **MCP prompts:** `loop-forward/author_pipeline`, `loop-forward/audit_pipeline`

### `profile:planning:0.1`

**Planning** · v0.1.0

Planning-and-tracking profile for software implementation and testing workflows. Covers work breakdown, per-task acceptance criteria (free-text and CEL-evaluable), dependency and blocker management, descriptive Gantt scheduling, and concurrent execution by humans and multiple AI agents working in parallel. AI-task durations are bounded to [5,60] minutes in 5-minute steps.

- **Resolved:** 6 primitive types, 9 relation types, 4 categories, 3 scopes, 12 declared validation rules, 3 templates
- **Shipped by:** `plugins/planning/` — `fdpm.planning` v0.1.0
- **Renderers (3):** `plan:RoadmapRenderer` → text/markdown, `plan:GanttSvgRenderer` → image/svg+xml, `plan:AgentBoardRenderer` → text/markdown
- **Validators (3, 3 distinct rule ids):** `plan:val:ai-minutes-numeric-bucket`, `plan:val:blocker-opened-not-future`, `plan:val:iteration-name-non-empty`
- **Importers:** `plan-jsonl`
- **Exporters:** `plan-jsonl`
- **Transformers:** `plan:task-to-ac`
- **Expression helpers:** `fn.fdpm.planning.minutes-to-hours`
- **MCP prompts:** `planning/triage_iteration`

### `profile:re-crt:6.2`

**RE-CRT 6.2** · v6.2.0

Typed reason DAG, obstruction DAG, duality maps, claims and theorem registries, and the v6.2 evidence layer, mapped from the OWL 2 DL + SHACL ontology at w3id.org/re-crt.

- **Resolved:** 10 primitive types, 15 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/re_crt/` — `fdpm.re-crt` v6.2.0
- **Renderers (1):** `recrt:TriageRenderer` → text/markdown
- **Validators (14, 7 distinct rule ids):** `recrt:val.dag-membership`, `recrt:val.defeat-bipartite`, `recrt:val.derived-premise`, `recrt:val.evidence-gate`, `recrt:val.leaf`, `recrt:val.support-acyclic`, `recrt:val.type-beta`

### `profile:silent-acceptance:2.1`

**Silent Acceptance 2.1** · v2.1.0

A reviewable verification-boundary assurance case for LLM output: the complete nine-class intrinsic error taxonomy, one pinned solver configuration, per-class mechanism/recall/specificity/failure behaviour/oracle/severity/residual risk, a declared consumer tolerance, dated calibration, runtime verdict evidence, and acceptance authority outside the producer control domain.

- **Resolved:** 13 primitive types, 23 relation types, 4 categories, 1 scope, 0 declared validation rules
- **Shipped by:** `plugins/silent_acceptance/` — `fdpm.silent-acceptance` v0.1.0
- **Renderers (4):** `sa:BoundaryDeclarationRenderer` → text/markdown, `sa:AssuranceDashboardRenderer` → text/html, `sa:ControlDomainMapRenderer` → image/svg+xml, `sa:StateRenderer` → application/vnd.fdpm.silent-acceptance+json
- **Validators (9, 8 distinct rule ids):** `sa:val:boundary-complete`, `sa:val:class-consistency`, `sa:val:configuration-pin`, `sa:val:coverage-arm`, `sa:val:coverage-unique`, `sa:val:decision-gate`, `sa:val:temporal-order`, `sa:val:terminal-evidence`

### `profile:software-architecture:1.0`

**Software Architecture** · v1.1.0

Primitives, relations, and validation rules for documenting software systems including domain models, services, APIs, state machines, decisions, and operational behavior.

- **Resolved:** 23 primitive types, 25 relation types, 5 categories, 4 scopes, 14 declared validation rules, 5 templates
- **Shipped by:** `plugins/software_architecture/` — `fdpm.software-architecture` v1.1.0
- **Renderers (2):** `sw:OpenAPIRenderer` → application/x-yaml, `sw:ADRRenderer` → text/markdown
- **Validators (3, 3 distinct rule ids):** `sw:val:deprecated-since-required`, `sw:val:http-method-canonical`, `sw:val:proposed-no-decided-at`
- **Importers:** `sw-jsonl`
- **Exporters:** `sw-jsonl`
- **Transformers:** `sw:capability-to-endpoint`
- **Expression helpers:** `fn.fdpm.software-architecture.endpoint-route`

### `profile:software-requirements:0.2`

**Software Requirements** · v0.2.0

Corpus-led Requirements Engineering model. Translates the Doc·Ray-grounded Zod SRS schema (plugins/software_requirements/schemas/software-requirements.ts) into an FDPM DomainProfile: a Software Requirements Specification decomposed into typed primitives (Specification, ScopeBoundary, Requirement, Stakeholder, Agreement, ChangeRequest, GlossaryEntry, Baseline) and relations (scope definition/exclusion, traceability, provenance, agreement, change control, baselining). v0.2 downgrades edge-existence rules from error to warning where nodes must be creatable before edges are wired. Grounding anchors preserved in descriptions as (SOURCE, sN): MRK=Managing Requirements Knowledge,…

- **Resolved:** 8 primitive types, 17 relation types, 5 categories, 0 scopes, 19 declared validation rules
- **Shipped by:** `plugins/software_requirements/` — `fdpm.software-requirements` v0.2.0
- **Renderers (2):** `srs:SrsDocumentRenderer` → text/markdown, `srs:SrsHtmlRenderer` → text/html

### `profile:spec-authoring-dnis:0.1`

**Spec-Authoring + DNIS** · v0.1.0

Composition profile extending profile:spec-authoring:0.1 and profile:dnis:0.1. A workbook on this profile can hold both spec-authoring's typed primitives and a DNIS Node tree for graph-derived section numbering. Contributes no types of its own.

- **Resolved:** 31 primitive types, 20 relation types, 8 categories, 5 scopes, 24 declared validation rules
- **Extends:** `profile:spec-authoring:0.1`, `profile:dnis:0.1` — a pure composition, declaring no types of its own
- **Shipped by:** `plugins/spec_authoring_dnis/` — `fdpm.spec-authoring-dnis` v0.1.0

### `profile:spec-authoring:0.1`

**Spec Authoring** · v0.1.0

Primitives, relations, and validation rules for authoring FDPM-style SPEC documents (SPEC-CORE / SPEC-MCP-SERVER house style). Models a SPEC as a typed object graph and renders the full Markdown document with the canonical structure.

- **Resolved:** 29 primitive types, 18 relation types, 7 categories, 4 scopes, 24 declared validation rules, 3 templates
- **Shipped by:** `plugins/spec_authoring/` — `fdpm.spec-authoring` v0.1.0
- **Renderers (1):** `spec:SpecMarkdownRenderer` → text/markdown
- **Validators (24, 24 distinct rule ids):** see `plugins/spec_authoring/fdpm-plugin.json`
- **Importers:** `spec-jsonl`
- **Exporters:** `spec-jsonl`
- **Transformers:** `spec:requirement-to-ac`
- **Expression helpers:** `fn.fdpm.spec-authoring.section-number`

### `profile:starter:0.1`

**Starter** · v0.1.0

Educational template for FDPM plugin authors. Models a small recipe-book domain. Every common capability kind is exercised. See README.md and EDUCATION.md.

- **Resolved:** 3 primitive types, 2 relation types, 2 categories, 1 scope, 2 declared validation rules
- **Shipped by:** `plugins/_starter/` — `fdpm.starter` v0.1.0
- **Renderers (1):** `recipe:ShoppingListRenderer` → text/markdown
- **Validators (1, 1 distinct rule id):** `recipe:val:has-at-least-one-ingredient`
- **Importers:** `recipe-jsonl`
- **Exporters:** `recipe-jsonl`
- **Transformers:** `recipe:to-shopping-list`
- **Expression helpers:** `fn.fdpm.starter.minutes-to-hours`

### `profile:style:3.1`

**Visual Style Definition 3.1.0** · v3.1.0

Bridge-generated from schemas/style.ts — a normalisation of _ingest_bin/style-schema.ts v3.1.0. Fifteen entities as primitives (Style, Movement, the ten grammar sections, Rule, ComplianceCheck, CanonicalReference) and ten typed edges for grammar composition, rule declaration, compliance linkage, exemplar citation, reference buckets and movement lineage. A workbook is one StyleRegistry: the closed world against which every cross-reference resolves.

- **Resolved:** 15 primitive types, 10 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/style/` — `fdpm.style` v0.2.0
- **Renderers (4):** `style:StyleOutlineRenderer` → text/markdown, `style:StyleHtmlRenderer` → text/html, `style:StyleSpecimenRenderer` → image/svg+xml, `style:PaletteSheetRenderer` → image/png
- **Validators (15, 15 distinct rule ids):** see `plugins/style/fdpm-plugin.json`

### `profile:uixo:1.2`

**UIXO v11 interaction ontology (native 1.2.0)** · v1.2.0

Bridge-generated from schemas/uixo-native.ts 1.2.0 (source ontology uixo_tbox_full_v11, sha256 bd808d5130922949c78d3fffd5774c4e3f48deee4b48c7af9beaba401c76cdfd). 712 ontology classes as primitive types and 210 relation types derived from the 1,653 graph-edge fields, with target sets expanded through the ontology's CLASS_PARENT hierarchy so the host enforces referential integrity on every write.

- **Resolved:** 712 primitive types, 210 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/uixo/` — `fdpm.uixo` v0.2.0
- **Renderers (5):** `uixo:DocumentOutlineRenderer` → text/markdown, `uixo:DocumentHtmlRenderer` → text/html, `uixo:DocumentPdfRenderer` → application/pdf, `uixo:ComponentTreeRenderer` → image/svg+xml, `uixo:ComponentSheetRenderer` → image/png
- **Validators (712, 712 distinct rule ids):** see `plugins/uixo/fdpm-plugin.json`

### `profile:uml:2.5`

**UML 2.5.1 (Foundation subset)** · v2.5.1

Bridge-generated from schemas/uml-foundation.ts — a normalisation of schemas-lib src/schemas/domains/uml (UML 2.5.1). Twenty-two metaclasses as primitives (Package, Model, Class, Interface, DataType, PrimitiveType, Enumeration, EnumerationLiteral, Property, Operation, Parameter, Association, AssociationClass, Component, Port, Connector, ConnectorEnd, Artifact, Signal, Reception, Constraint, Comment) and twenty-four typed edges for ownership, typing, generalisation, realisation, dependency, association ends, annotation and constraint.

- **Resolved:** 22 primitive types, 24 relation types, 0 categories, 0 scopes, 0 declared validation rules
- **Shipped by:** `plugins/uml/` — `fdpm.uml` v0.3.0
- **Renderers (1):** `uml:ModelOutlineRenderer` → text/markdown
- **Validators (22, 22 distinct rule ids):** see `plugins/uml/fdpm-plugin.json`
- **MCP prompts:** `uml/model_a_domain`

## Derived profiles

These compose an existing vocabulary rather than restating it — the parent
stays usable on its own, and the child adds one concern across it.

| Profile | Extends | Adds of its own |
| --- | --- | --- |
| `profile:document-plan-dnis:3.1` | `profile:document-plan:3.1` + `profile:dnis:0.1` | 0 primitive, 9 relation type(s) |
| `profile:formal-specification-dnis:0.1` | `profile:formal-specification:3.0` + `profile:dnis:0.1` | 0 primitive, 0 relation type(s) |
| `profile:spec-authoring-dnis:0.1` | `profile:spec-authoring:0.1` + `profile:dnis:0.1` | 0 primitive, 0 relation type(s) |

## Known gaps

### Profiles that declare no description of their own

None: every profile declares its own `description`.

### Profile id version tails

[SPEC-PLUGIN-NAMING §5.5.1](../specs/SPEC-PLUGIN-NAMING.md) fixes a profile
id as `profile:<leaf>:<major>.<minor>` and defines the tail as a
**compatibility series, not a release**. It moves only when the type
catalogue changes in a way existing workbooks cannot survive, because the
id is recorded in the `workbook.create` operation of every workbook that
uses it and that log is append-only. Changing an id does not rename
anything; it orphans every log that names it, and the host has no
profile-id migration.

**So the tail does not tell you the profile's version, and is not meant
to.** Read `version` from the profile, or the Version column above.

2 profiles carry a tail behind the current `version`.
That is the rule working, not drift: the catalogue grew compatibly and
the series stayed put.

- `profile:formal-specification:3.0` at v3.1.0
- `profile:software-architecture:1.0` at v1.1.0

1 id does not satisfy the two-segment rule:

- `profile:academic-paper:0.4.1` — tail `0.4.1` carries a patch segment; §5.5.1 requires exactly `<major>.<minor>`

It predates §5.5.1 and has workbooks in the field, so
it is exempt by name in `tests/_meta/profile-contract.test.ts` rather than
renamed — the same posture §9 takes for the other naming gates. A new
profile cannot join that list without a deliberate edit.

## What this document does not cover

Two kinds of profile exist that are deliberately absent here, because
neither belongs to this repository and including either would make the
document a function of the machine it was generated on:

- **Runtime-registered profiles.** A data directory can hold profiles
  registered through `fdpm.profile.register` or `fdpm profile register`,
  stored under `<data-dir>/profiles/`. This atlas is built against an empty
  data directory on purpose.
- **User-installed plugins.** The loader also discovers plugins from
  `~/.fdpm/plugins`. Only plugins under this checkout's `plugins/` are
  counted.

Run `fdpm profile list` to see what a given workspace actually has, which
may legitimately be more than this.

## Regenerating

```sh
npx tsx scripts/build-profile-atlas.ts           # write
npx tsx scripts/build-profile-atlas.ts --check   # verify, exit 1 on drift
```

See also [CENSUS.md](./CENSUS.md), the counted facts about this repository,
and [SPEC-PLUGIN-NAMING.md](../specs/SPEC-PLUGIN-NAMING.md), which fixes the
naming rules these ids follow. Back to the [repository root](../../README.md).
