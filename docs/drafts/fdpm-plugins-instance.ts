/**
 * ============================================================================
 * FDPM Plugins Registry — concept-design/schemas projection (PLUGINS ONLY)
 * ============================================================================
 *
 * Disclaimer:
 * No information in this file should be taken for granted. Tier assignments,
 * capability tags, and cross-references are calibrated judgments derived from
 * the source TypeScript files (concept-design/schemas/**). Verify against the
 * original source for any consequential decision. Any statement not backed by
 * a real definition or a verifiable reference may be invalid, erroneous, or a
 * model hallucination.
 *
 * Scope (changed from prior revision):
 *   This file now lists ONLY entries that would actually be packaged as an
 *   FDPM plugin (kind: "plugin" — ships at least one cap:* surface). The
 *   prior revision conflated three different things into one 105-entry list:
 *     1. Real FDPM plugin candidates                                — kept here
 *     2. Library utilities (Result<T,E>, KpiSchema, helpers)        — moved
 *     3. Pure barrels and runnable demos                            — moved
 *   The full 105-file inventory now lives in concept-schemas-inventory.ts,
 *   which uses the same FdpmPluginIdeasRegistrySchema with the new `kind`
 *   discriminator to distinguish plugin / utility / barrel / demo / data
 *   entries honestly rather than padding capabilityKinds: ["cap:profile"]
 *   onto every utility module to satisfy a min(1) constraint that no longer
 *   exists.
 *
 *   Concretely the four reviewer recommendations are applied:
 *     1. Renamed concept: this file is now plugins-only; the inventory split
 *        is concept-schemas-inventory.ts.
 *     2. Schema gained an EntryKind discriminator and capabilityKinds.min(1)
 *        is now enforced only when kind === "plugin".
 *     3. The 71 business-models/* framework files are no longer 71 separate
 *        plugin entries. They collapse to ONE plugin (fdpm.business-models-
 *        canvases) backed by a framework catalogue; the full per-framework
 *        list lives in the inventory file as kind: "data".
 *     4. crossReferences is now editorial only; structural import edges live
 *        in the new dependsOn field, validated against the id set.
 * ============================================================================
 */

import { FdpmPluginIdeasRegistrySchema, type FdpmPluginIdeasRegistry } from "./plugins";

export const fdpmPluginsRegistry: FdpmPluginIdeasRegistry = {
  schemaVersion: "1.0.0",

  frontmatter: {
    title: "FDPM Plugins — concept-design/schemas projection (plugins only)",
    status: "draft",
    disclaimer:
      "No information in this registry should be taken for granted. Tier assignments, capability tags, and cross-references are calibrated judgments derived from the README.md and per-file headers in the concept-design/schemas/** archive; verify against the original sources before any consequential decision. Any statement not backed by a real definition or verifiable reference may be invalid, erroneous, or a model hallucination.",
    provenance: {
      sourceRequest:
        "Apply four reviewer recommendations to the prior 105-entry list: (1) rename/scope to plugins-only and split the inventory; (2) add a kind discriminator so utilities/barrels do not have to fake cap:* surfaces; (3) collapse the 71 business-models/* frameworks into a single plugin backed by a framework catalogue; (4) add a machine-checked dependsOn field.",
      baseline:
        "Prior revision of fdpm-plugins-instance.ts (105 entries, every entry tagged kind: implicit plugin) plus the source archive concept-design/schemas/**.",
      capabilityKindsReferenced: {
        count: 9,
        kinds: [
          "cap:profile",
          "cap:renderer",
          "cap:validator",
          "cap:transformer",
          "cap:exporter",
          "cap:expr-helper",
          "cap:lifecycle-hook",
          "cap:template",
          "cap:asset",
        ],
        note:
          "cap:importer is not exercised because the source archive is purely Zod-side schemas; if/when an importer plugin is added (e.g., DTCG token importer for fdpm.design-system) it would land here.",
      },
    },
  },

  heading: "FDPM plugins — concept-design/schemas projection (21 plugin entries)",

  honestPreamble: {
    body:
      "Every entry below is something that would actually be packaged as an FDPM plugin: it ships at least one cap:* surface, has a non-trivial behavioural contract, and would have its own fdpm-plugin.json. Library utilities, barrels, and runnable demos that the prior revision listed alongside real plugins now live in concept-schemas-inventory.ts with kind: \"utility\" / \"barrel\" / \"demo\" so the registry no longer has to pretend everything is a plugin. The 71 business-models/* framework formalisations also live there as kind: \"data\" because they are catalogue content for a single plugin (fdpm.business-models-canvases), not 71 plugins.",
    tierDefinitions: [
      {
        tier: "S",
        label: "Load-bearing",
        meaning:
          "Foundational plugin that downstream plugins compose with. Removing it would break large parts of the system.",
      },
      {
        tier: "A",
        label: "Canonical",
        meaning:
          "Important, well-defined, widely useful plugin with clear standalone value.",
      },
      {
        tier: "B",
        label: "Specialized",
        meaning:
          "Valid and useful, but narrow in scope or applicable only to a specific framework or domain.",
      },
      {
        tier: "C",
        label: "Auxiliary",
        meaning:
          "Marginal — listed for completeness; would only be promoted on concrete user demand.",
      },
    ],
    tierDistribution: {
      totalEntries: 21,
      rows: [
        { tier: "S", count: 9 },
        { tier: "A", count: 10 },
        { tier: "B", count: 2 },
        { tier: "C", count: 0 },
      ],
    },
    backlogRecommendation: {
      keepLiveTiers: ["S", "A"],
      parkingLotTiers: ["B"],
      calibrationOnlyTiers: ["C"],
      rationale:
        "After the plugin/utility split S and A together cover 19 of 21 entries — the live roadmap is essentially the whole list. The two B-tier entries (fdpm.bridge-theory, fdpm.continuity-journal) are parked pending demand evidence.",
    },
    notes: [
      "Per-entry capabilityKinds describe what the plugin would register at activation time (cap:profile contributes a profile, cap:validator contributes CEL or Zod refinements, etc.). They are deliberately tighter than the prior revision, which over-applied cap:profile to utility code.",
      "dependsOn lists the upstream plugins the entry's module imports from. crossReferences is now reserved for purely editorial 'see also' links.",
      "fdpm.business-models-canvases is one plugin that ships a framework catalogue covering BMC, VPC, Porter, Wardley, JTBD, Lean Startup, Blue Ocean, Seven Powers, Dynamic Capabilities, DDBM and the long tail of strategy/AI-economics/ governance frameworks. The 71 individual framework formalisations are catalogue data exposed by this one plugin, not 71 plugins.",
    ],
  },

  sections: [
    {
      title: "Core Foundations",
      primaryCapabilityKinds: ["cap:profile", "cap:validator", "cap:transformer"],
      description:
        "Plugins downstream profiles compose with: shared primitives (UUID, ISO datetime, hex color, slug, semver), the patch engine, and version metadata. Utilities like Result<T,E> and the AI-meta mixin are inventory entries, not plugins, and live in concept-schemas-inventory.ts.",
      entries: [
        {
          displayNumber: 1,
          id: "fdpm.common",
          what:
            "Primitives & reusable atoms: UUID, ISO-8601 DateTime, hex color, URI, lowercase-hyphen Slug, SemVer, user reference, rich-text spans, asset metadata, dataset, axis config. Every other plugin in the projection composes from this layer.",
          why:
            "Single source of truth for shared primitive validation; downstream plugins depend on these atoms and validators.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:validator"],
          crossReferences: [],
          dependsOn: [],
          notes: ["Source: concept-design/schemas/common.ts"],
        },
        {
          displayNumber: 2,
          id: "fdpm.patchable",
          what:
            "Generic patch engine: validate(doc), patch(original, partial) with deep merge and immutable field protection, computeDiff producing structural DiffEntry[], applyArrayOps for id-resolved insert/remove/move/update, batched cross-entity transactions with rollback.",
          why:
            "Encodes the patchable-first convention that makes every other schema surgically editable. Without this plugin, edits would be replace-only.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:transformer", "cap:lifecycle-hook"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/patchable.ts"],
        },
        {
          displayNumber: 3,
          id: "fdpm.version-mixin",
          what:
            "SemVer 2.0.0-based version tracking: ParsedSemVer { major, minor, patch, prerelease?, build? }, optimistic locking metadata, snapshot history, and structured comparable version metadata that replaces ad-hoc integer counters.",
          why:
            "Standard, comparable version metadata for any schema, template, or content entity. Every long-lived primitive type needs this.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:lifecycle-hook"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/version-mixin.ts"],
        },
        {
          displayNumber: 4,
          id: "fdpm.bridge-theory",
          what:
            "Implementation profile for Bridge Theory: overlap typing (equivalence, subsumption, constraint, derivation, independent), bridge relations (causal etc.), and slug/uuid/semver-typed identity for cross-domain conceptual mapping.",
          why:
            "Reusable schema for declaring relationships between two formal models or domains. B-tier because demand for cross-domain bridge declarations is unproven.",
          tier: "B",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:validator"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/bridge-theory.ts"],
        },
      ],
    },
    {
      title: "Design System & Rendering",
      primaryCapabilityKinds: ["cap:profile", "cap:renderer", "cap:transformer"],
      description:
        "Canonical design tokens, cross-surface rendering policy, and transform-target constraints — the portable, pixel-consistent surface contract for the content layer.",
      entries: [
        {
          displayNumber: 5,
          id: "fdpm.design-system",
          what:
            "Canonical theme/tokens object for colors, typography, spacing, radius, breakpoints. Includes a DTCG-aligned token model (DesignTokenLeaf with $type/$value, recursive DesignTokenGroup) and named token collections (core, semantic, components, modes, platforms).",
          why:
            "Foundation for pixel-consistent rendering across presentation and CMS surfaces. Every renderer depends on this.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:asset"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/design-system.ts"],
        },
        {
          displayNumber: 6,
          id: "fdpm.render-profile",
          what:
            "Cross-surface rendering policy: ImagePlacement (fit, alignment, focal point, crop, safe area), RenderProfile contract (surface kind, density, unit system, motion, color mode), RenderProfileSet with optional default-profile id.",
          why:
            "A single contract that lets the same content render pixel-consistently across slides, pages, and templates.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:renderer", "cap:profile"],
          crossReferences: [],
          dependsOn: ["fdpm.design-system"],
          notes: ["Source: concept-design/schemas/render-profile.ts"],
        },
        {
          displayNumber: 7,
          id: "fdpm.transform-profile",
          what:
            "Discriminated transform-target schema (SurfaceSchema slide_deck/page_layout, WebsiteSchema website) that constrains which frame types are valid per surface kind, plus the SemVer-stamped transform profile metadata.",
          why:
            "Encodes which transforms are legal between which schemas, preventing mismatched surface/frame combinations at validate time instead of at render time.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:transformer", "cap:validator"],
          crossReferences: [],
          dependsOn: ["fdpm.common", "fdpm.presentation"],
          notes: ["Source: concept-design/schemas/transform-profile.ts"],
        },
      ],
    },
    {
      title: "Content Domains",
      primaryCapabilityKinds: ["cap:profile", "cap:renderer"],
      description:
        "The three primary content schemas: structured Content documents, slide-deck Presentations that bind to content via SlotBindings, and branded Websites with 22 section variants.",
      entries: [
        {
          displayNumber: 8,
          id: "fdpm.content",
          what:
            "Structured documents composed of typed Blocks (text, heading, image, chart, table, list, quote, code, callout, embed, divider) grouped into Sections and bundled into a Content document with provenance fields.",
          why:
            "Content authored once here projects into many surfaces (slides, pages, templates).",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/content.ts"],
        },
        {
          displayNumber: 9,
          id: "fdpm.presentation",
          what:
            "Slide deck schema: Slides compose by SlotBindings that point to ContentPointers (entire section, single block, range of blocks, or inline-only deck content), with per-slide overrides and animations.",
          why:
            "Separates content authorship from presentation; the same content can drive many decks.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:renderer"],
          crossReferences: [],
          dependsOn: ["fdpm.content", "fdpm.render-profile"],
          notes: ["Source: concept-design/schemas/presentation.ts"],
        },
        {
          displayNumber: 10,
          id: "fdpm.website",
          what:
            "Branded landing-page schema: 22 PageSection variants (hero, manifesto, value proposition, services, competitive positioning, voice & tone, etc.) with discriminated union, per-section AI context, and primary plus additional content-source tracking.",
          why:
            "Encodes the marketing/brand surface so the same content tree can feed many sites.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:renderer"],
          crossReferences: [],
          dependsOn: ["fdpm.content", "fdpm.render-profile"],
          notes: ["Source: concept-design/schemas/website.ts"],
        },
      ],
    },
    {
      title: "Universal Site CMS",
      primaryCapabilityKinds: [
        "cap:profile",
        "cap:validator",
        "cap:transformer",
        "cap:template",
      ],
      description:
        "The data-driven, template-based universal CMS. The eight site-schema/* sub-modules of the source archive collapse to ONE plugin here — they are co-evolving facets of the same surface and would not be packaged independently.",
      entries: [
        {
          displayNumber: 11,
          id: "fdpm.site-schema",
          what:
            "Universal CMS plugin: SectionTemplate (versioned), recursive FieldDefinition (slots and union variants), SectionInstance/Page/Site composition, hardcoded primitive field values (text/richtext/number/boolean/color/enum/date + media + currency), hierarchical TaxonomyTerm with helpers, runtime per-template/per-field validation, computed-field expression resolver, template-version migrations, and TypeScript-interface codegen for known templates.",
          why:
            "Section types are SectionTemplate definitions with recursive FieldDefinition trees, not hard-coded code — growth happens via templates, not enums. The eight source files (definitions, field-values, taxonomy, validation, computed, migrations, typegen, index) are facets of one plugin in any sane packaging.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: [
            "cap:profile",
            "cap:validator",
            "cap:transformer",
            "cap:template",
            "cap:exporter",
            "cap:expr-helper",
            "cap:lifecycle-hook",
            "cap:asset",
          ],
          crossReferences: [],
          dependsOn: [
            "fdpm.common",
            "fdpm.version-mixin",
            "fdpm.design-system",
            "fdpm.render-profile",
          ],
          notes: [
            "Source: concept-design/schemas/site-schema.ts (public barrel) + concept-design/schemas/site-schema/{index,field-values,definitions,taxonomy,validation,computed,migrations,typegen}.ts.",
            "Prior revision listed these 8 files as 9 separate plugin entries (counting both the root barrel and the internal index). They are one plugin with eight modules; splitting them would force consumers to install eight packages to get a working CMS.",
          ],
        },
      ],
    },
    {
      title: "AI Agent Layer",
      primaryCapabilityKinds: ["cap:profile", "cap:transformer", "cap:template"],
      description:
        "Layered AI context (Site → Section → Field) with persona, audience, principles, and voice/tone, plus the runtime that resolves layered context into a system prompt and the DB-backed prompt-template surface. Four source files (ai-agent-mixin, ai-context, ai-generation, ai-runtime) collapse to ONE plugin here for the same reason as the CMS — they are facets of one feature.",
      entries: [
        {
          displayNumber: 12,
          id: "fdpm.ai-agent-context",
          what:
            "Layered AI context plugin: three-scope inheritance (Site → Section → Field), AgentPersona / Audience / FieldAIHints / SectionAIContext / SurfaceAIContext / FrameAIContext / SlotAIContext schemas, voice/tone enrichments (VocabularyLevel, FormalityLevel, WritingPrinciple, PersonaVoiceVariant, VoiceGuidelines), DB-backed PromptTemplate (slug-keyed, organization-scoped, non-technical-editable), and the resolveAIContext + buildSystemPrompt runtime that emits a structured system prompt with policy and behavioural-execution constraints.",
          why:
            "Turns 'fill in a string' into 'write a 6-word headline for enterprise CTOs avoiding the word leverage'. Encodes intent (audience, tone, banned words, quality criteria) as data, not hand-written prompts. The mixin/context/generation/runtime split exists for source-file ergonomics, not packaging.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: [
            "cap:profile",
            "cap:transformer",
            "cap:template",
            "cap:expr-helper",
          ],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: [
            "Source: concept-design/schemas/{ai-agent-mixin, ai-context, ai-generation, ai-runtime}.ts.",
            "ai-agent-mixin-usage.ts is a runnable demo and lives in the inventory file as kind: \"demo\".",
          ],
        },
      ],
    },
    {
      title: "Cross-Cutting Concerns",
      primaryCapabilityKinds: ["cap:profile", "cap:template", "cap:validator"],
      description:
        "Microcopy patterns, i18n / localization configuration, and an RBAC permissions model — concerns any production surface needs and that should not be re-invented per module.",
      entries: [
        {
          displayNumber: 13,
          id: "fdpm.microcopy",
          what:
            "Reusable UI copy patterns: MessagePattern (template + tone + max length), EmptyStatePattern (headline + body + action + illustration), CTAPattern (verb choices + length + caps rules), ConfirmationDialogPattern (with destructive flag), FeedbackPattern (toast/alert with duration and dismissibility), bundled into MicrocopyPatterns and exposed as a spread MicrocopyMixin.",
          why:
            "Standardised UI copy primitives that prevent each surface from inventing its own message conventions.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:template", "cap:profile"],
          crossReferences: [],
          dependsOn: [],
          notes: ["Source: concept-design/schemas/microcopy.ts"],
        },
        {
          displayNumber: 14,
          id: "fdpm.localization",
          what:
            "i18n configuration: PluralizationConfig (zero-one-other / one-other / ordinal / custom rules), InterpolationConfig (braces / doubleBraces / percent / dollar variable syntax), full LocalizationConfig with locales, fallback, RTL, date/number formatting, plus a LocalizationMixin spread.",
          why:
            "Lets any schema declare its locale/formatting/pluralization expectations in one place.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:expr-helper"],
          crossReferences: [],
          dependsOn: [],
          notes: ["Source: concept-design/schemas/localization.ts"],
        },
        {
          displayNumber: 15,
          id: "fdpm.permissions",
          what:
            "RBAC model: DataScope (own/team/org/global), RoleDefinition (named role with inheritance, default and admin flags), PermissionDefinition (categorised), FeatureEntitlement (plan-gated with limits and upsell), DataScopeRule (per-entity visibility with conditions), PermissionUIBehavior, all bundled into PermissionsModel.",
          why:
            "Standard RBAC primitives so feature entitlements, roles, and data scopes are not reinvented per app.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:validator"],
          crossReferences: [],
          dependsOn: [],
          notes: ["Source: concept-design/schemas/permissions.ts"],
        },
      ],
    },
    {
      title: "Operational / Lifecycle",
      primaryCapabilityKinds: ["cap:profile", "cap:lifecycle-hook", "cap:validator"],
      description:
        "Long-lived operational shapes: a feature catalogue with status / dependency / hint probes, plus a continuity-journal schema for AI-assisted session journaling. The runnable AI-prompt demo is in the inventory file.",
      entries: [
        {
          displayNumber: 16,
          id: "fdpm.continuity-journal",
          what:
            "Structured AI-assisted session-journaling schema: ContinuityJournal entries with stop-reasons (discriminated union), files-of-interest, branch state, weighted observations, and explicit next-step lists, designed to minimise context loss between coding sessions.",
          why:
            "Captures the 'why', not just the 'what', of a working session so the next session can resume cleanly. B-tier because adoption depends on workflow discipline — this is a shipping plugin candidate, not an obvious win.",
          tier: "B",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:lifecycle-hook"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: ["Source: concept-design/schemas/continuity-journal.ts"],
        },
        {
          displayNumber: 17,
          id: "fdpm.feature-schema",
          what:
            "Feature catalogue schema: FeatureStatus (draft / in_development / feature_flagged / ga / deprecated / removed), DependencyType (required / optional / conflicts), Hint probes (class / method / regex) that confirm a file is genuinely linked to a feature, plus AI-teaching metadata via the zod-ai-meta utility.",
          why:
            "Treats features as first-class, machine-checkable entities with status, dependencies, and code-link probes — the kind of artefact that survives reorgs.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:validator", "cap:lifecycle-hook"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: [
            "Source: concept-design/schemas/feature-schema.ts.",
            "The zod-ai-meta library it depends on is a utility in the inventory file, not its own plugin.",
          ],
        },
      ],
    },
    {
      title: "Business-Model Frameworks",
      primaryCapabilityKinds: ["cap:profile", "cap:validator"],
      description:
        "ONE plugin (collapsed from 71 sibling files). Ships a framework catalogue covering the canonical strategy / business-model / governance / AI-economics frameworks via a shared schema shape. The full per-framework list lives in concept-schemas-inventory.ts as kind: \"data\".",
      entries: [
        {
          displayNumber: 18,
          id: "fdpm.business-models-canvases",
          what:
            "Framework formalisation plugin: registers a single profile (cap:profile) for canvas-style frameworks plus a validator (cap:validator) that runs the per-framework superRefine cross-checks. Ships a built-in catalogue of 71 frameworks — BMC, VPC, St. Gallen, Platform vs Pipeline, Porter Five Forces, Porter Generic Strategies, JTBD (Christensen, Ulwick), Lean Startup, Blue Ocean, Seven Powers, Dynamic Capabilities, DDBM (Hartmann/Zaki/Feldmann/Neely), Four Box, Wardley Mapping, plus the long tail of strategy/AI-economics/ governance/ethics frameworks. New frameworks are added as catalogue data, not as new plugins.",
          why:
            "All 71 source files share the same architectural shape (enums + atoms → item schemas → root model schema → portfolio schema, with patchable-first identified arrays and superRefine cross-checks). Splitting them into 71 plugins forced the prior revision to invent a Tier-B label for the long tail and produced a registry where the framework family dominated by sheer file count rather than by FDPM-specific value. One plugin + a parameter (which framework set to load) is the right packaging.",
          tier: "S",
          kind: "plugin",
          capabilityKinds: ["cap:profile", "cap:validator"],
          crossReferences: [],
          dependsOn: ["fdpm.common", "fdpm.patchable"],
          notes: [
            "Source: concept-design/schemas/business-models/*.ts (71 framework files + shared.ts utility + framework-list.ts catalogue + index.ts barrel).",
            "Per-framework formalisations are catalogued in concept-schemas-inventory.ts as kind: \"data\" entries (one per framework), each linking to its source file.",
            "The framework catalogue is not a closed enum — new frameworks are added by appending to the catalogue, not by issuing a new plugin.",
          ],
        },
      ],
    },
    {
      title: "Standards & Identity Adapters",
      primaryCapabilityKinds: ["cap:exporter", "cap:transformer"],
      description:
        "Plugins that bridge the schema library to external standards (DTCG design tokens) or to identity stores (the brand-identity-pack adapter). These are real packaging candidates that would commonly be installed without the full design-system plugin.",
      entries: [
        {
          displayNumber: 19,
          id: "fdpm.design-tokens-dtcg",
          what:
            "Design Token Community Group (DTCG) interop: import/export DesignTokenLeaf trees as DTCG-compliant JSON, normalise vendor-specific extensions, and round-trip with the canonical fdpm.design-system token model.",
          why:
            "DTCG is the only cross-vendor interop format for design tokens (Figma Tokens, Style Dictionary, Tokens Studio). Shipping the adapter as a separable plugin avoids forcing every design-system consumer to take the DTCG dependency.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:exporter", "cap:transformer"],
          crossReferences: [],
          dependsOn: ["fdpm.design-system"],
          notes: [
            "Implementation surface: derived from the DTCG sections of concept-design/schemas/design-system.ts; would be split into its own module on packaging.",
          ],
        },
        {
          displayNumber: 20,
          id: "fdpm.brand-identity-pack",
          what:
            "Brand identity bundle: ships a single coherent set of tokens, microcopy patterns, voice/tone, and AI-context defaults as one installable pack. Composes design-system + microcopy + ai-agent-context defaults.",
          why:
            "The most common consumer ask is 'give me a starter brand', not 'let me wire 4 plugins together'. A meta-plugin that ships defaults across the three layers is a real packaging unit, not a reach.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:asset", "cap:template"],
          crossReferences: [],
          dependsOn: ["fdpm.design-system", "fdpm.microcopy", "fdpm.ai-agent-context"],
          notes: [
            "Implementation surface: synthesised from design-system + microcopy + ai-context defaults; explicitly NOT in the source archive yet (the archive ships per-layer schemas, not a packaged bundle). Listed here as a real packaging candidate, called out as new in notes.",
            "New entry vs prior revision — was implicit in the design-system + microcopy + ai-context combination but never named.",
          ],
        },
      ],
    },
    {
      title: "Authoring Tooling",
      primaryCapabilityKinds: ["cap:transformer", "cap:exporter"],
      description:
        "Plugins that operate on schemas as inputs — typegen, lint, migration generation. These are extracted from the universal-CMS plugin's typegen module because they apply to any cap:profile, not just SectionTemplate.",
      entries: [
        {
          displayNumber: 21,
          id: "fdpm.profile-typegen",
          what:
            "TypeScript-interface codegen plugin: walks a registered cap:profile and emits a TypeScript declaration so consumers can opt into compile-time type checks for known templates while keeping the runtime flexibility of the universal schema.",
          why:
            "The site-schema plugin's typegen module is useful for any profile, not just SectionTemplate. Promoting it to a standalone plugin lets non-CMS profiles use it without taking the CMS dependency.",
          tier: "A",
          kind: "plugin",
          capabilityKinds: ["cap:transformer", "cap:exporter"],
          crossReferences: [],
          dependsOn: ["fdpm.common"],
          notes: [
            "Source: concept-design/schemas/site-schema/typegen.ts (extracted from the universal-CMS plugin in this revision).",
          ],
        },
      ],
    },
  ],

  numberingReconciliation: {
    note:
      "Display numbers are dense (1..21). Section counts are cross-checked against actual entries.length by FdpmPluginIdeasRegistrySchema.superRefine. The drop from 105 prior entries to 21 plugins reflects the kind discriminator: 8 site-schema/* sub-files collapsed to one CMS plugin, 4 ai-* files collapsed to one AI-context plugin, 71 business-models/* frameworks collapsed to one canvases plugin, and the utilities/barrels/demos moved out of plugin scope entirely.",
    displayedNumberMin: 1,
    displayedNumberMax: 21,
    actualEntryCount: 21,
    sectionCounts: [
      { sectionTitle: "Core Foundations", count: 4 },
      { sectionTitle: "Design System & Rendering", count: 3 },
      { sectionTitle: "Content Domains", count: 3 },
      { sectionTitle: "Universal Site CMS", count: 1 },
      { sectionTitle: "AI Agent Layer", count: 1 },
      { sectionTitle: "Cross-Cutting Concerns", count: 3 },
      { sectionTitle: "Operational / Lifecycle", count: 2 },
      { sectionTitle: "Business-Model Frameworks", count: 1 },
      { sectionTitle: "Standards & Identity Adapters", count: 2 },
      { sectionTitle: "Authoring Tooling", count: 1 },
    ],
  },

  deliberateOmissions: {
    introduction:
      "This file lists only kind: \"plugin\" entries. Everything else from the source archive is in concept-schemas-inventory.ts under the appropriate kind discriminator. Two source files are also omitted from the inventory entirely (README.md ×2 are documentation, not schemas).",
    omissions: [
      {
        category: "Library utilities",
        decision: "deferred",
        rationale:
          "Result<T,E>, the assertUniqueKeys helper (business-models-shared), and the zod-ai-meta mixin are utility code — they ship no cap:* surface and would not have their own fdpm-plugin.json. Listed in concept-schemas-inventory.ts as kind: \"utility\".",
        examples: [
          "fdpm.result",
          "fdpm.business-models-shared",
          "fdpm.zod-ai-meta",
        ],
      },
      {
        category: "Pure barrels",
        decision: "deferred",
        rationale:
          "Re-export barrels (top-level index, versioned alias, business-models index, site-schema public-barrel one-liner, site-schema internal index) ship no behaviour. Listed as kind: \"barrel\" in the inventory.",
        examples: [
          "fdpm.index",
          "fdpm.index-v1",
          "fdpm.business-models-index",
          "fdpm.site-schema-barrel",
          "fdpm.site-schema-index",
        ],
      },
      {
        category: "Runnable demos",
        decision: "deferred",
        rationale:
          "ai-agent-mixin-usage.ts and feature-schema-ai-demo.ts are reference / walkthrough files. Listed as kind: \"demo\" in the inventory.",
        examples: ["fdpm.ai-agent-mixin-usage", "fdpm.feature-schema-ai-demo"],
      },
      {
        category: "Per-framework formalisations",
        decision: "included_low_tier",
        rationale:
          "The 71 business-models/* framework formalisations are catalogue data for the single fdpm.business-models-canvases plugin (entry #18 above). They are listed in the inventory as kind: \"data\" so the per-framework provenance and validator status are still queryable, without inflating the plugin count by 70.",
        examples: [
          "fdpm.business-model-canvas (data)",
          "fdpm.porter-five-forces (data)",
          "fdpm.wardley-mapping (data)",
        ],
      },
    ],
  },

  maintainerRecommendation: {
    body:
      "The four reviewer recommendations have been applied. Net structural effect: 105 entries → 21 plugins + 84 inventory entries (utility/barrel/demo/data). The plugin list now reads as a real packaging plan rather than a file-count census; the inventory preserves full provenance for everything in the source archive.",
    actions: [
      {
        action: "Promote the framework catalogue inside fdpm.business-models-canvases to its own queryable resource so consumers can list available frameworks without loading them all.",
        rationale:
          "With 71 frameworks under one plugin, lazy-loading per-framework validators is the obvious next move. Today this would be a runtime concern; documenting it now keeps the plugin honest about what it ships at activation vs on-demand.",
        targetTiers: ["S"],
        targetCapabilities: ["cap:profile", "cap:validator"],
      },
      {
        action: "Wire the dependsOn graph into the plugin contract conformance test so a plugin cannot depend on a kind: \"utility\" or kind: \"data\" entry from the inventory file (only on other plugins).",
        rationale:
          "The current schema cross-checks dependsOn ids resolve, but does not check that the target is a plugin. Restricting plugin → plugin edges would catch accidental coupling to internal utility modules at validation time.",
        targetTiers: ["S", "A", "B"],
        targetCapabilities: ["cap:validator"],
      },
      {
        action: "Move fdpm.brand-identity-pack from \"called out in notes\" to a real source module so it stops being aspirational.",
        rationale:
          "The entry is the most common consumer ask but does not exist in the source archive. Shipping the adapter is a real, small piece of work that would close the gap between the registry and the codebase.",
        targetTiers: ["A"],
        targetCapabilities: ["cap:asset", "cap:template"],
      },
    ],
    highestLeverageAction: {
      title: "Plugin-vs-inventory boundary check in CI",
      description:
        "Single test that walks both fdpmPluginsRegistry and the inventory registry, asserts every kind: \"plugin\" entry has a non-empty capabilityKinds (already enforced by the schema), every dependsOn target is also kind: \"plugin\" (NOT enforced today — see action 2 above), and every inventory entry references a real source file under concept-design/schemas/. The first half is schema-enforced; the second and third halves are the cheap CI win.",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Inline parse: validates the instance against the schema at module load.
// Throws a ZodError describing every violation if anything is off.
// ─────────────────────────────────────────────────────────────────────────
export const fdpmPluginsRegistryParsed =
  FdpmPluginIdeasRegistrySchema.parse(fdpmPluginsRegistry);
