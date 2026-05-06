/**
 * pitch-deck.schema.v2.ts
 *
 * Strategic pitch-deck schema — v2
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISCLAIMER
 * No information in this schema or any instance validated against it should
 * be taken for granted. The schema captures structural relationships and
 * provenance metadata; it does not validate factual claims against the
 * world. The schema surfaces *missing* provenance — it does not certify
 * *correct* provenance. Any premise not backed by a real logical definition
 * or verifiable reference may be invalid, erroneous, or a hallucination.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * BREAKING CHANGES from v1:
 *   - Slides are identified by SlugId (`id`), not by number. `displayNumber`
 *     is a separate field for human-facing rendering. All cross-references
 *     use `id`. (Closes the "delete slide 7 → all refs break" hole.)
 *   - Audience IDs are open slugs validated against `audiences[]`, not a
 *     hardcoded enum. Adding a new audience no longer forks the schema.
 *   - Palette is semantic-role-keyed (bg/text/accent/...). Brand-specific
 *     named colors live in an optional `brandColors` record. The brand-named
 *     v1 palette (navyDeep, amber, etc.) is removed.
 *   - HexColor accepts either `#abc123` or `abc123`; output is normalized
 *     to include `#`.
 *   - Stat tiles MUST reference a `dataPointId` (was optional in v1).
 *   - Load-bearing claims may not have any data point with verificationStatus
 *     "asserted-without-source" in their direct evidence.
 *   - Audience-reading coverage rule is now phase-based, not a 50% magic
 *     number. Every audience must be addressed in every "argumentative"
 *     phase (everything except `opening` and `appendix`).
 *
 * NEW in v2:
 *   - Cycle detection in the claim-support DAG (DFS with visiting set).
 *   - Bidirectional reference consistency for evidence ↔ usedOnSlides.
 *   - Top-level `risks: Risk[]` register with severity × likelihood and
 *     a discipline rule: high/critical risks must be addressed on a slide
 *     OR explicitly accepted-as-not-addressed with notes.
 *   - Time budget: `deck.targetDurationMinutes` + optional
 *     `slide.estimatedSpeakingSeconds`. Tolerance is ±20%.
 *   - Fact freshness: `source.lastVerifiedDate` + `deck.staleAfterDays`
 *     produces warnings (not failures) for stale sources on load-bearing
 *     claims.
 *   - `revisionHistory[]` at deck level.
 *   - Optional `openQuestions[]` per slide for honest unknowns.
 *   - Logical and visual lints are exposed as separate refinement layers
 *     (`withLogicalChecks`, `withVisualChecks`); the default export applies
 *     both.
 *
 * Design principles preserved from v1:
 *   1. Every numeric/factual claim ("data point") carries provenance.
 *   2. Every slide has a strategic job, not just a topic.
 *   3. Anti-patterns are first-class — what the deck refused to do matters.
 *   4. Cross-references resolve at parse time (validator is verifier).
 *   5. Single-sourced claims must be asterisked AND appear in the appendix.
 */

import { z } from "zod";

// ─── Primitive types ─────────────────────────────────────────────────────

const Pct01 = z.number().min(0).max(1);

const SlugId = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase-kebab");

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD");

// Loose ISO date accepts YYYY, YYYY-MM, or YYYY-MM-DD (used for source dates
// where month/day may be unknown).
const IsoDateLoose = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "ISO date YYYY, YYYY-MM, or YYYY-MM-DD");

// Display number for human-facing slide labels. Does NOT determine identity.
const DisplayNumber = z.number().int().min(1).max(200);

// HexColor: accepts `#abc123` or `abc123`. Normalizes output to include `#`.
const HexColor = z
  .string()
  .regex(/^#?[0-9A-Fa-f]{6}$/, "6-char hex (with or without # prefix)")
  .transform(s => (s.startsWith("#") ? s.toLowerCase() : `#${s.toLowerCase()}`));

// ─── Audiences ───────────────────────────────────────────────────────────
// v2: AudienceId is an open slug. The deck's `audiences[]` defines the
// closed set; cross-refs are checked in the refinement.

const AudienceId = SlugId;

const AudienceSchema = z.object({
  id: AudienceId,
  label: z.string().min(2),
  primaryQuestion: z
    .string()
    .min(10)
    .describe("The single question this audience is silently asking throughout the deck."),
  evaluationCriteria: z
    .array(z.string().min(3))
    .min(2)
    .describe("What this audience uses to grade the deck."),
  failureMode: z
    .string()
    .min(10)
    .describe("What this audience defaults to thinking if the deck fails to land."),
});

// ─── Sources / provenance ────────────────────────────────────────────────

const SourceTypeSchema = z.enum([
  "internal-data",        // our own measurement/registry
  "vendor-disclosure",    // 10-K, blog, product page from the cited company
  "regulator",            // gov agency, central bank
  "industry-publication", // analyst report, trade press
  "community-source",     // independent blog, forum
  "derived",              // computed from other sources (must list inputs)
]);

const SourceSchema = z
  .object({
    id: SlugId,
    type: SourceTypeSchema,
    citation: z.string().min(5),
    url: z.string().url().optional(),
    date: IsoDateLoose.optional().describe("When the source was published."),
    // NEW: when this source was last checked against the live world.
    lastVerifiedDate: IsoDate
      .optional()
      .describe("When a human last confirmed this source still says what we claim."),
    // For "derived" sources, declare what was combined.
    derivedFrom: z.array(SlugId).optional(),
    notes: z.string().optional(),
  })
  .superRefine((src, ctx) => {
    if (src.type === "derived" && (!src.derivedFrom || src.derivedFrom.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source "${src.id}" is type=derived but has no derivedFrom inputs.`,
      });
    }
  });

// ─── Data points ─────────────────────────────────────────────────────────
// v2: usedOnSlides is now a SlugId[] (slide IDs), not numbers.

const VerificationStatusSchema = z.enum([
  "verified-multi-source",      // ≥2 independent sources agree
  "verified-internal",          // measured/computed from our own data; reproducible
  "single-sourced-asterisked",  // one source; deck must mark with * and disclose
  "derived",                    // computed in-deck from listed inputs
  "asserted-without-source",    // editorial judgment; flag explicitly
]);

const DataPointSchema = z.object({
  id: SlugId,
  label: z.string().min(2),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  verificationStatus: VerificationStatusSchema,
  sourceIds: z.array(SlugId).default([]),
  usedOnSlides: z.array(SlugId).default([]).describe("Slide IDs that surface this data point."),
  appendixEntry: z.boolean().default(false),
  notes: z.string().optional(),
});

// ─── Strategic claims ────────────────────────────────────────────────────
// v2: appearsOnSlides is SlugId[], not numbers.

const ClaimSchema = z.object({
  id: SlugId,
  statement: z.string().min(10),
  loadBearing: z.boolean().describe("Does the deck collapse if this claim fails?"),
  supportedByDataPoints: z.array(SlugId).default([]),
  supportedByClaims: z.array(SlugId).default([]),
  appearsOnSlides: z.array(SlugId).min(1),
  potentialDismissals: z
    .array(z.string().min(5))
    .default([])
    .describe("Predictable buyer/skeptic responses this claim must survive."),
  antiDismissalEvidence: z
    .array(z.string().min(5))
    .default([])
    .describe("Specific evidence prepared for each dismissal above (1:1 with potentialDismissals)."),
});

// ─── Anti-patterns ───────────────────────────────────────────────────────

const AntiPatternSchema = z.object({
  id: SlugId,
  label: z.string().min(2),
  description: z.string().min(10),
  whyHarmful: z.string().min(10),
  detectionSignals: z
    .array(z.string().min(5))
    .min(1)
    .describe("How to spot this anti-pattern in a draft deck."),
});

// ─── Risks (NEW in v2) ───────────────────────────────────────────────────

const RiskSeverity = z.enum(["low", "medium", "high", "critical"]);
const RiskLikelihood = z.enum(["unlikely", "possible", "likely", "near-certain"]);
const RiskCategory = z.enum([
  "market",
  "execution",
  "regulatory",
  "technical",
  "financial",
  "team",
  "competitive",
  "macro",
]);

const RiskSchema = z.object({
  id: SlugId,
  description: z.string().min(20),
  severity: RiskSeverity,
  likelihood: RiskLikelihood,
  category: RiskCategory,
  mitigation: z.string().min(20).describe("Concrete action — not a posture."),
  addressedOnSlides: z
    .array(SlugId)
    .default([])
    .describe("Slide IDs where this risk is named and answered."),
  acceptedAsNotAddressed: z
    .boolean()
    .default(false)
    .describe("If true, the deck deliberately does not address this risk; notes must explain why."),
  notes: z.string().optional(),
});

// ─── Competitive positioning ─────────────────────────────────────────────

const CompetitorSchema = z.object({
  id: SlugId,
  name: z.string().min(2),
  axes: z
    .object({
      // Generic 0..1 axes. Concrete labels are declared on the quadrant slide.
      x: Pct01,
      y: Pct01,
      z: Pct01.optional(),
    })
    .strict(),
  threatLevel: z.enum(["direct", "adjacent", "non-threat", "ourselves"]),
  citationKind: z
    .enum(["positioned-against", "benchmark", "inspiration"])
    .default("positioned-against")
    .describe("Why we mention them. Distinguishes rivals from referenced peers."),
  notes: z.string().optional(),
});

// ─── Design system ───────────────────────────────────────────────────────
// v2: SemanticPaletteSchema replaces the brand-named palette. Brand colors
// move to an optional `brandColors` record, keyed by slug. The schema is no
// longer overfit to a specific deck's identity.

const SemanticPaletteSchema = z.object({
  bg: HexColor,            // primary canvas background
  bgAlt: HexColor,         // alternate canvas (e.g., dark variant of bg)
  surface: HexColor,       // cards, tiles, panels
  surfaceAlt: HexColor,    // alternate surface
  text: HexColor,          // primary on-bg text
  textMuted: HexColor,     // secondary / metadata text
  textInverse: HexColor,   // text used on accent or dark backgrounds
  accent: HexColor,        // primary accent
  accentSoft: HexColor,    // subdued accent (e.g., for backgrounds, hovers)
  divider: HexColor,
  success: HexColor,
  warning: HexColor,
  danger: HexColor,
});

const PaletteSchema = z.object({
  semantic: SemanticPaletteSchema,
  brandColors: z
    .record(SlugId, HexColor)
    .default({})
    .describe("Optional brand-specific named colors keyed by slug (e.g., 'navy-deep')."),
});

const DesignSystemSchema = z.object({
  paletteName: z.string().min(2),
  palette: PaletteSchema,
  paletteRationale: z
    .string()
    .min(20)
    .describe("Why this palette suits this topic and audience. (Soft check; quality not enforced.)"),
  visualMotif: z
    .string()
    .min(5)
    .describe("The repeating visual element across slides."),
  contrastModel: z.enum([
    "sandwich-dark-light-dark",  // dark title + ask, light body
    "all-dark",
    "all-light",
    "alternating",
  ]),
  fonts: z.object({
    header: z.string().min(2),
    body: z.string().min(2),
  }),
  layoutFormat: z.enum(["LAYOUT_16x9", "LAYOUT_WIDE", "LAYOUT_4x3", "LAYOUT_16x10"]),
});

// ─── Visual treatments ───────────────────────────────────────────────────
// v2: StatTileSchema.dataPointId is REQUIRED. A stat tile without a data
// point is exactly the unprovenanced-number hole the rest of the schema
// works to prevent.

const StatTileSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(2),
  sublabel: z.string().optional(),
  dataPointId: SlugId.describe("Required: every visible stat must trace to a DataPoint."),
});

const QuadrantItemSchema = z.object({
  label: z.string().min(2),
  competitorId: SlugId.optional(),
  axes: z.object({ x: Pct01, y: Pct01 }),
  emphasis: z.enum(["ourselves", "incumbent", "adjacent", "non-threat"]),
  caption: z.string().optional(),
});

const ThreatAnswerPairSchema = z.object({
  threat: z.string().min(5),
  threatBody: z.string().min(10),
  ourMove: z.string().min(5),
  moveBody: z.string().min(10),
});

const TimelinePhaseSchema = z.object({
  monthRange: z.string().min(2),
  title: z.string().min(2),
  bullets: z.array(z.string().min(3)).min(1),
  gateLabel: z.string().min(2),
  gateCriteria: z.string().min(10),
});

// v2: AskKindSchema replaces the loose `asks: {label,n,sub}[]`. Asks now
// carry semantics — capital, partner intros, hires, design partners — so a
// downstream consumer can build the ask slide and CRM hand-off correctly.

const AskKindSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("capital"),
    amountUsdMin: z.number().nonnegative(),
    amountUsdMax: z.number().nonnegative(),
    instrument: z.enum(["equity", "safe", "convertible-note", "grant", "debt", "other"]),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("design-partners"),
    countTarget: z.number().int().positive(),
    profile: z.string().min(10),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("partner-intros"),
    targetEntities: z.array(z.string().min(2)).min(1),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("hires"),
    roles: z.array(z.string().min(2)).min(1),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("other"),
    label: z.string().min(2),
    body: z.string().min(10),
  }),
]);

const VisualTreatmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("title"),
    tagline: z.string().optional(),
    audienceLine: z.string().optional(),
  }),
  z.object({
    kind: z.literal("thesis-with-implications"),
    thesisRich: z.string().min(10),
    implications: z
      .array(z.object({ title: z.string().min(2), body: z.string().min(10) }))
      .length(3),
  }),
  z.object({
    kind: z.literal("stat-tiles-plus-chart"),
    tiles: z.array(StatTileSchema).min(2).max(4),
    chartLabel: z.string().min(2),
    chartType: z.enum(["bar-horizontal", "bar-vertical", "line", "pie"]),
    chartDataPointIds: z
      .array(SlugId)
      .default([])
      .describe("Data points that drive the chart (required for provenance audit)."),
    sideCallout: z
      .object({
        label: z.string().min(2),
        body: z.string().min(10),
        implication: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("comparison-two-column"),
    leftHeader: z.string().min(2),
    leftClaim: z.string().min(5),
    leftBody: z.string().min(10),
    leftFootlabel: z.string().min(2),
    leftFootnote: z.string().min(5),
    rightHeader: z.string().min(2),
    rightClaim: z.string().min(5),
    rightBody: z.string().min(10),
    rightFootlabel: z.string().min(2),
    rightFootnote: z.string().min(5),
  }),
  z.object({
    kind: z.literal("chart-with-signal-rail"),
    chartTitle: z.string().min(2),
    chartType: z.enum(["bar-vertical-log", "bar-vertical", "bar-horizontal", "line"]),
    chartDataPointIds: z.array(SlugId).default([]),
    signalRailItems: z
      .array(z.object({ label: z.string().min(2), body: z.string().min(10) }))
      .min(3),
    chartFootnote: z.string().optional(),
  }),
  z.object({
    kind: z.literal("trigger-event-pair"),
    cards: z
      .array(
        z.object({
          eyebrow: z.string().min(2),
          date: z.string().min(2),
          title: z.string().min(2),
          body: z.string().min(10),
          proof: z.string().min(5),
          cta: z.string().min(2),
        }),
      )
      .length(2),
  }),
  z.object({
    kind: z.literal("competitive-quadrant"),
    xAxisLabel: z.string().min(2),
    yAxisLabel: z.string().min(2),
    items: z.array(QuadrantItemSchema).min(3),
    positionRail: z.object({
      label: z.string().min(2),
      claims: z.array(z.string().min(5)).min(1),
      entryClaim: z.string().min(5),
    }),
  }),
  z.object({
    kind: z.literal("recommendation-three-pillars"),
    pillars: z
      .array(
        z.object({
          n: z.string().min(1),
          title: z.string().min(2),
          body: z.string().min(10),
          kpi: z.string().min(2),
        }),
      )
      .length(3),
    antiRecommendation: z.string().optional(),
  }),
  z.object({
    kind: z.literal("milestone-timeline"),
    phases: z.array(TimelinePhaseSchema).min(2),
    closingNote: z.string().optional(),
  }),
  z.object({
    kind: z.literal("threat-answer-pairs"),
    pairs: z.array(ThreatAnswerPairSchema).min(2).max(4),
  }),
  z.object({
    kind: z.literal("ask-with-stats"),
    capitalRange: z.string().optional().describe("Display string; structured data is in `asks`."),
    capitalRationale: z.string().min(10),
    capitalComps: z.string().optional(),
    asks: z.array(AskKindSchema).min(1).max(6),
  }),
  z.object({
    kind: z.literal("appendix-sources"),
    groups: z
      .array(
        z.object({
          section: z.string().min(2),
          items: z.array(z.string().min(2)).min(1),
        }),
      )
      .min(2),
    asteriskNote: z.string().min(5),
  }),
  z.object({
    kind: z.literal("open-questions"),
    questions: z
      .array(
        z.object({
          question: z.string().min(10),
          whyOpen: z.string().min(10),
          whoAnswers: z.string().min(2),
          byWhen: IsoDate.optional(),
        }),
      )
      .min(1),
  }),
]);

// ─── Narrative phases ────────────────────────────────────────────────────

const NarrativePhaseSchema = z.enum([
  "opening",       // title; brand + audience scope
  "thesis",        // structural claim
  "evidence",      // empirical anchor
  "differentiation", // unique property
  "market",        // who pays + how much
  "timing",        // why now
  "positioning",   // where we play
  "recommendation",// the chosen path
  "execution",     // how we ship
  "defense",       // threats + answers
  "ask",           // capital + design partners
  "appendix",      // provenance/methodology
]);

// Phases where every audience must be addressed at least once. Opening and
// appendix are exempt; everything else must speak to every audience.
const ARGUMENTATIVE_PHASES = [
  "thesis",
  "evidence",
  "differentiation",
  "market",
  "timing",
  "positioning",
  "recommendation",
  "execution",
  "defense",
  "ask",
] as const;

// ─── Slide ───────────────────────────────────────────────────────────────
// v2: slides have a SlugId `id` that determines identity. `displayNumber`
// is for human-facing rendering only. References across the schema use `id`.

const SlideSchema = z.object({
  id: SlugId.describe("Stable slug identifier. Does not change when slides are reordered."),
  displayNumber: DisplayNumber.describe("Number shown in the slide footer / nav. Derived; must be 1..N."),

  phase: NarrativePhaseSchema,

  eyebrow: z
    .string()
    .min(2)
    .describe("Top-of-slide section label (e.g., '03 · THE UNIQUE PROPERTY')."),

  headline: z.string().min(5).describe("The slide's main claim in one sentence."),

  strategicJob: z
    .string()
    .min(20)
    .describe("What this slide must accomplish for the audience to advance."),

  buyerObjectionAddressed: z
    .string()
    .min(10)
    .describe("The specific objection or question this slide neutralizes."),

  rationaleForPosition: z
    .string()
    .min(10)
    .describe("Why this slide is at this position in the arc — what it depends on, what it sets up."),

  visual: VisualTreatmentSchema,

  // Cross-refs to the data layer (use slide IDs and other slugs)
  evidenceUsed: z
    .array(SlugId)
    .default([])
    .describe("dataPoint IDs whose values are surfaced on this slide."),
  claimsAdvanced: z
    .array(SlugId)
    .default([])
    .describe("strategicClaim IDs this slide moves forward."),
  competitorsCited: z.array(SlugId).default([]),
  risksAddressed: z
    .array(SlugId)
    .default([])
    .describe("risk IDs this slide names and answers (for the defense phase, mostly)."),

  antiPatternsAvoided: z
    .array(SlugId)
    .default([])
    .describe("antiPattern IDs this slide explicitly does NOT manifest, given its topic."),

  audienceReadings: z
    .array(
      z.object({
        audienceId: SlugId,
        expectedTakeaway: z.string().min(10),
      }),
    )
    .min(1),

  // NEW in v2: explicit unknowns. Empty by default.
  openQuestions: z
    .array(
      z.object({
        question: z.string().min(10),
        whyHere: z.string().min(10).describe("Why this slide is the right place to surface this unknown."),
      }),
    )
    .default([]),

  // NEW in v2: optional time budget per slide.
  estimatedSpeakingSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 30)
    .optional()
    .describe("Optional. If present, contributes to deck-level time-budget audit."),

  background: z.enum(["light", "dark"]),
});

// ─── Narrative arc ───────────────────────────────────────────────────────
// v2: phase sequence references slide IDs, not numbers.

const NarrativeArcSchema = z.object({
  spine: z
    .string()
    .min(20)
    .describe("One sentence describing the deck's argumentative trajectory."),
  phaseSequence: z
    .array(
      z.object({
        phase: NarrativePhaseSchema,
        slideIds: z.array(SlugId).min(1),
        role: z.string().min(5),
      }),
    )
    .min(3),
  arcConstraints: z
    .array(z.string().min(5))
    .describe("Ordering constraints between phases (e.g., 'evidence MUST precede market sizing')."),
});

// ─── Revision history ────────────────────────────────────────────────────

const RevisionEntrySchema = z.object({
  date: IsoDate,
  version: z.string().min(1),
  author: z.string().optional(),
  summary: z.string().min(10),
  changes: z.array(z.string().min(5)).min(1),
});

// ─── Top-level deck (base; refinements applied below) ────────────────────

const PitchDeckBase = z
  .object({
    schemaVersion: z.literal("2.0.0"),

    meta: z.object({
      title: z.string().min(2),
      subtitle: z.string().optional(),
      generatedDate: IsoDate,
      version: z.string().min(1),
      totalSlides: z.number().int().min(3),
      tagline: z.string().min(5),
    }),

    disclaimer: z.string().min(50).describe("Verbatim disclaimer text per project policy."),

    targetDurationMinutes: z
      .number()
      .positive()
      .max(180)
      .describe("Target presentation length in minutes. Used for time-budget audit."),

    staleAfterDays: z
      .number()
      .int()
      .positive()
      .default(180)
      .describe("Sources whose lastVerifiedDate is older than this trigger a freshness warning."),

    audiences: z.array(AudienceSchema).min(1),

    thesisStatement: z
      .string()
      .min(20)
      .describe("The single sentence this entire deck argues for."),

    narrativeArc: NarrativeArcSchema,

    designSystem: DesignSystemSchema,

    antiPatterns: z.array(AntiPatternSchema).min(1),

    sources: z.array(SourceSchema).min(1),

    dataPoints: z.array(DataPointSchema).min(1),

    strategicClaims: z.array(ClaimSchema).min(1),

    competitors: z.array(CompetitorSchema).default([]),

    risks: z.array(RiskSchema).default([]),

    slides: z.array(SlideSchema).min(3),

    revisionHistory: z.array(RevisionEntrySchema).default([]),
  })
  .strict();

// ─── Refinement: logical checks ──────────────────────────────────────────
// All the "did the argument hold together" checks. No visual conventions.

function applyLogicalChecks(deck: z.infer<typeof PitchDeckBase>, ctx: z.RefinementCtx): void {
  // Index lookups
  const slideIds = new Set(deck.slides.map(s => s.id));
  const dpIds = new Set(deck.dataPoints.map(d => d.id));
  const dpById = new Map(deck.dataPoints.map(d => [d.id, d]));
  const sourceIds = new Set(deck.sources.map(s => s.id));
  const sourceById = new Map(deck.sources.map(s => [s.id, s]));
  const claimIds = new Set(deck.strategicClaims.map(c => c.id));
  const claimById = new Map(deck.strategicClaims.map(c => [c.id, c]));
  const competitorIds = new Set(deck.competitors.map(c => c.id));
  const antiPatternIds = new Set(deck.antiPatterns.map(a => a.id));
  const audienceIds = new Set(deck.audiences.map(a => a.id));
  const riskIds = new Set(deck.risks.map(r => r.id));

  // ── 1. Slide identity & display numbering ───────────────────────────
  // Slide IDs are unique (Set already collapses dupes; check via length).
  if (slideIds.size !== deck.slides.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slides"],
      message: "Slide IDs must be unique.",
    });
  }
  // Display numbers are contiguous 1..N (independent of order in array).
  const sortedDisplay = [...deck.slides.map(s => s.displayNumber)].sort((a, b) => a - b);
  for (let i = 0; i < sortedDisplay.length; i++) {
    if (sortedDisplay[i] !== i + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slides"],
        message: `Slide displayNumbers must be contiguous 1..N. Got: ${sortedDisplay.join(", ")}`,
      });
      break;
    }
  }
  if (deck.meta.totalSlides !== deck.slides.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "totalSlides"],
      message: `meta.totalSlides=${deck.meta.totalSlides} but ${deck.slides.length} slides present.`,
    });
  }

  // ── 2. Cross-reference resolution ─────────────────────────────────────
  deck.slides.forEach((s, i) => {
    s.evidenceUsed.forEach(id => {
      if (!dpIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "evidenceUsed"],
          message: `Slide "${s.id}" references unknown dataPoint "${id}".`,
        });
      }
    });
    s.claimsAdvanced.forEach(id => {
      if (!claimIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "claimsAdvanced"],
          message: `Slide "${s.id}" references unknown claim "${id}".`,
        });
      }
    });
    s.competitorsCited.forEach(id => {
      if (!competitorIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "competitorsCited"],
          message: `Slide "${s.id}" references unknown competitor "${id}".`,
        });
      }
    });
    s.antiPatternsAvoided.forEach(id => {
      if (!antiPatternIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "antiPatternsAvoided"],
          message: `Slide "${s.id}" references unknown antiPattern "${id}".`,
        });
      }
    });
    s.risksAddressed.forEach(id => {
      if (!riskIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "risksAddressed"],
          message: `Slide "${s.id}" references unknown risk "${id}".`,
        });
      }
    });
    s.audienceReadings.forEach((ar, j) => {
      if (!audienceIds.has(ar.audienceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "audienceReadings", j],
          message: `Slide "${s.id}" references unknown audience "${ar.audienceId}".`,
        });
      }
    });
  });

  deck.dataPoints.forEach((d, i) => {
    d.sourceIds.forEach(id => {
      if (!sourceIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dataPoints", i, "sourceIds"],
          message: `dataPoint "${d.id}" references unknown source "${id}".`,
        });
      }
    });
    d.usedOnSlides.forEach(id => {
      if (!slideIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dataPoints", i, "usedOnSlides"],
          message: `dataPoint "${d.id}" references unknown slide "${id}".`,
        });
      }
    });
  });

  deck.strategicClaims.forEach((c, i) => {
    c.supportedByDataPoints.forEach(id => {
      if (!dpIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategicClaims", i, "supportedByDataPoints"],
          message: `claim "${c.id}" references unknown dataPoint "${id}".`,
        });
      }
    });
    c.supportedByClaims.forEach(id => {
      if (!claimIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategicClaims", i, "supportedByClaims"],
          message: `claim "${c.id}" references unknown claim "${id}".`,
        });
      }
      if (id === c.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategicClaims", i, "supportedByClaims"],
          message: `claim "${c.id}" cannot support itself.`,
        });
      }
    });
    c.appearsOnSlides.forEach(id => {
      if (!slideIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategicClaims", i, "appearsOnSlides"],
          message: `claim "${c.id}" references unknown slide "${id}".`,
        });
      }
    });
  });

  deck.risks.forEach((r, i) => {
    r.addressedOnSlides.forEach(id => {
      if (!slideIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["risks", i, "addressedOnSlides"],
          message: `risk "${r.id}" references unknown slide "${id}".`,
        });
      }
    });
  });

  deck.sources.forEach((src, i) => {
    if (src.derivedFrom) {
      src.derivedFrom.forEach(id => {
        if (!sourceIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sources", i, "derivedFrom"],
            message: `source "${src.id}" derivedFrom unknown source "${id}".`,
          });
        }
        if (id === src.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sources", i, "derivedFrom"],
            message: `source "${src.id}" cannot derive from itself.`,
          });
        }
      });
    }
  });

  // ── 3. Cycle detection in claim DAG (NEW in v2) ──────────────────────
  // DFS with WHITE/GRAY/BLACK coloring. A back-edge (target is GRAY) = cycle.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const c of deck.strategicClaims) color.set(c.id, WHITE);
  const cyclesFound: string[][] = [];

  function dfs(node: string, stack: string[]): void {
    color.set(node, GRAY);
    stack.push(node);
    const claim = claimById.get(node);
    if (claim) {
      for (const nb of claim.supportedByClaims) {
        const c = color.get(nb);
        if (c === undefined) continue; // unknown ref already reported above
        if (c === GRAY) {
          const cycleStart = stack.indexOf(nb);
          cyclesFound.push([...stack.slice(cycleStart), nb]);
        } else if (c === WHITE) {
          dfs(nb, stack);
        }
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }
  for (const c of deck.strategicClaims) {
    if (color.get(c.id) === WHITE) dfs(c.id, []);
  }
  cyclesFound.forEach(cycle => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["strategicClaims"],
      message: `Claim support cycle detected: ${cycle.join(" → ")}`,
    });
  });

  // ── 4. Bidirectional reference consistency (NEW in v2) ────────────────
  // If slide.evidenceUsed contains dpId, dp.usedOnSlides must contain slide.id.
  deck.slides.forEach((s, i) => {
    s.evidenceUsed.forEach(dpId => {
      const dp = dpById.get(dpId);
      if (dp && !dp.usedOnSlides.includes(s.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "evidenceUsed"],
          message: `Slide "${s.id}" lists dataPoint "${dpId}" in evidenceUsed, but dataPoint "${dpId}".usedOnSlides does not include "${s.id}".`,
        });
      }
    });
  });
  deck.dataPoints.forEach((d, i) => {
    d.usedOnSlides.forEach(sId => {
      const slide = deck.slides.find(s => s.id === sId);
      if (slide && !slide.evidenceUsed.includes(d.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dataPoints", i, "usedOnSlides"],
          message: `dataPoint "${d.id}".usedOnSlides includes "${sId}", but slide "${sId}".evidenceUsed does not include "${d.id}".`,
        });
      }
    });
  });
  // Same shape for claims ↔ slides.
  deck.slides.forEach((s, i) => {
    s.claimsAdvanced.forEach(cId => {
      const claim = claimById.get(cId);
      if (claim && !claim.appearsOnSlides.includes(s.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "claimsAdvanced"],
          message: `Slide "${s.id}" advances claim "${cId}" but claim "${cId}".appearsOnSlides does not include "${s.id}".`,
        });
      }
    });
  });

  // ── 5. Provenance discipline ──────────────────────────────────────────
  deck.dataPoints.forEach((d, i) => {
    if (d.verificationStatus === "single-sourced-asterisked" && !d.appendixEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPoints", i, "appendixEntry"],
        message: `dataPoint "${d.id}" is single-sourced but lacks appendix entry. Asterisked claims must be disclosed in appendix.`,
      });
    }
    if (d.verificationStatus === "asserted-without-source" && !d.notes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPoints", i, "notes"],
        message: `dataPoint "${d.id}" is asserted-without-source and must include notes explaining why no source.`,
      });
    }
    if (d.verificationStatus === "verified-multi-source" && d.sourceIds.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPoints", i, "sourceIds"],
        message: `dataPoint "${d.id}" claims verified-multi-source but has ${d.sourceIds.length} source(s).`,
      });
    }
    if (d.verificationStatus === "single-sourced-asterisked" && d.sourceIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPoints", i, "sourceIds"],
        message: `dataPoint "${d.id}" claims single-sourced but has ${d.sourceIds.length} source(s).`,
      });
    }
    if (d.verificationStatus === "derived" && d.sourceIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPoints", i, "sourceIds"],
        message: `dataPoint "${d.id}" is derived but lists no input sources.`,
      });
    }
  });

  // ── 6. Load-bearing claims must have evidence and survive dismissals ─
  deck.strategicClaims.forEach((c, i) => {
    if (c.loadBearing && c.supportedByDataPoints.length === 0 && c.supportedByClaims.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["strategicClaims", i],
        message: `claim "${c.id}" is load-bearing but has no supporting data points or claims.`,
      });
    }
    if (c.loadBearing && c.potentialDismissals.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["strategicClaims", i, "potentialDismissals"],
        message: `claim "${c.id}" is load-bearing but lists no potentialDismissals. Pre-empt skeptic responses.`,
      });
    }
    if (c.loadBearing && c.potentialDismissals.length !== c.antiDismissalEvidence.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["strategicClaims", i, "antiDismissalEvidence"],
        message: `claim "${c.id}": ${c.potentialDismissals.length} dismissal(s) declared but ${c.antiDismissalEvidence.length} anti-dismissal evidence item(s). Pair them 1:1.`,
      });
    }
    // NEW in v2: load-bearing claims may not rest on asserted-without-source data points.
    if (c.loadBearing) {
      c.supportedByDataPoints.forEach(dpId => {
        const dp = dpById.get(dpId);
        if (dp && dp.verificationStatus === "asserted-without-source") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["strategicClaims", i, "supportedByDataPoints"],
            message: `Load-bearing claim "${c.id}" relies on dataPoint "${dpId}" with status "asserted-without-source". Load-bearing arguments must rest on real evidence.`,
          });
        }
      });
    }
  });

  // ── 7. Narrative arc covers all slides exactly once ────────────────────
  const slidesInArc = deck.narrativeArc.phaseSequence.flatMap(p => p.slideIds);
  const arcSet = new Set(slidesInArc);
  if (slidesInArc.length !== arcSet.size) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["narrativeArc", "phaseSequence"],
      message: `Narrative arc references some slide IDs more than once.`,
    });
  }
  deck.slides.forEach((s, i) => {
    if (!arcSet.has(s.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["narrativeArc", "phaseSequence"],
        message: `Slide "${s.id}" is not assigned to any phase in narrativeArc.`,
      });
    }
    const arcEntry = deck.narrativeArc.phaseSequence.find(p => p.slideIds.includes(s.id));
    if (arcEntry && arcEntry.phase !== s.phase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slides", i, "phase"],
        message: `Slide "${s.id}" declares phase="${s.phase}" but narrativeArc places it in phase="${arcEntry.phase}".`,
      });
    }
  });

  // ── 8. Audience reading coverage by phase (replaces v1 50% rule) ─────
  // Every audience must be addressed at least once in every argumentative
  // phase that the deck actually contains.
  const phasesInDeck = new Set(deck.slides.map(s => s.phase));
  for (const phase of ARGUMENTATIVE_PHASES) {
    if (!phasesInDeck.has(phase)) continue; // deck didn't use this phase
    const slidesInPhase = deck.slides.filter(s => s.phase === phase);
    for (const a of deck.audiences) {
      const addressed = slidesInPhase.some(s =>
        s.audienceReadings.some(r => r.audienceId === a.id),
      );
      if (!addressed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `Audience "${a.id}" is not addressed in phase "${phase}". Each argumentative phase must speak to every audience at least once.`,
        });
      }
    }
  }

  // ── 9. Risk discipline ───────────────────────────────────────────────
  // High/critical risks must be addressed somewhere OR explicitly accepted.
  deck.risks.forEach((r, i) => {
    const high = r.severity === "high" || r.severity === "critical";
    if (high && r.addressedOnSlides.length === 0 && !r.acceptedAsNotAddressed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["risks", i],
        message: `Risk "${r.id}" has severity="${r.severity}" but is neither addressed on a slide nor explicitly acceptedAsNotAddressed.`,
      });
    }
    if (r.acceptedAsNotAddressed && !r.notes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["risks", i, "notes"],
        message: `Risk "${r.id}" is acceptedAsNotAddressed=true; notes must explain why.`,
      });
    }
  });

  // ── 10. Time budget (NEW in v2) ─────────────────────────────────────
  // If any slide carries estimatedSpeakingSeconds, all slides must.
  // Total must be within ±20% of targetDurationMinutes.
  const slidesWithTime = deck.slides.filter(s => s.estimatedSpeakingSeconds !== undefined);
  if (slidesWithTime.length > 0 && slidesWithTime.length !== deck.slides.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slides"],
      message: `${slidesWithTime.length}/${deck.slides.length} slides have estimatedSpeakingSeconds. Either annotate all slides or none.`,
    });
  }
  if (slidesWithTime.length === deck.slides.length) {
    const totalSec = slidesWithTime.reduce((acc, s) => acc + (s.estimatedSpeakingSeconds ?? 0), 0);
    const targetSec = deck.targetDurationMinutes * 60;
    const tolerance = 0.2;
    const lo = targetSec * (1 - tolerance);
    const hi = targetSec * (1 + tolerance);
    if (totalSec < lo || totalSec > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDurationMinutes"],
        message: `Sum of estimatedSpeakingSeconds is ${Math.round(totalSec / 60 * 10) / 10}min, target is ${deck.targetDurationMinutes}min (tolerance ±${tolerance * 100}%). Adjust slides or target.`,
      });
    }
  }

  // ── 11. Fact freshness (NEW in v2) ──────────────────────────────────
  // Sources backing load-bearing claims should be re-verified within
  // staleAfterDays. Stale sources produce a warning issue (still rejects;
  // the call site can downgrade severity by post-processing if desired).
  const today = new Date(deck.meta.generatedDate);
  const staleMs = deck.staleAfterDays * 24 * 60 * 60 * 1000;
  const loadBearingDpIds = new Set(
    deck.strategicClaims
      .filter(c => c.loadBearing)
      .flatMap(c => c.supportedByDataPoints),
  );
  for (const dpId of loadBearingDpIds) {
    const dp = dpById.get(dpId);
    if (!dp) continue;
    for (const sId of dp.sourceIds) {
      const src = sourceById.get(sId);
      if (!src) continue;
      if (src.lastVerifiedDate) {
        const verified = new Date(src.lastVerifiedDate);
        if (today.getTime() - verified.getTime() > staleMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sources"],
            message: `Source "${src.id}" backs load-bearing dataPoint "${dpId}" but was last verified ${src.lastVerifiedDate} (>${deck.staleAfterDays} days before deck date ${deck.meta.generatedDate}).`,
          });
        }
      } else if (src.type !== "internal-data") {
        // Non-internal sources backing load-bearing claims should declare freshness.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources"],
          message: `Source "${src.id}" backs load-bearing dataPoint "${dpId}" but has no lastVerifiedDate. External sources for load-bearing claims must declare freshness.`,
        });
      }
    }
  }

  // ── 12. StatTile and chart consistency with evidenceUsed ────────────
  // Every dataPointId referenced by a visual treatment must appear in the
  // slide's evidenceUsed (which already implies bidirectional consistency
  // with the data point's usedOnSlides).
  deck.slides.forEach((s, i) => {
    const v = s.visual;
    const referencedDpIds: string[] = [];
    if (v.kind === "stat-tiles-plus-chart") {
      v.tiles.forEach(t => referencedDpIds.push(t.dataPointId));
      referencedDpIds.push(...v.chartDataPointIds);
    } else if (v.kind === "chart-with-signal-rail") {
      referencedDpIds.push(...v.chartDataPointIds);
    }
    referencedDpIds.forEach(dpId => {
      if (!s.evidenceUsed.includes(dpId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "visual"],
          message: `Slide "${s.id}" visual references dataPoint "${dpId}" but it is not in evidenceUsed.`,
        });
      }
    });
  });
}

// ─── Refinement: visual checks ──────────────────────────────────────────
// Pure visual conventions. Separated so logical lints can be run
// independently of branding decisions.

function applyVisualChecks(deck: z.infer<typeof PitchDeckBase>, ctx: z.RefinementCtx): void {
  // Sandwich-contrast rule: dark opening, dark close (last non-appendix).
  if (deck.designSystem.contrastModel === "sandwich-dark-light-dark") {
    const byDisplay = [...deck.slides].sort((a, b) => a.displayNumber - b.displayNumber);
    const first = byDisplay[0];
    const lastNonAppendix = [...byDisplay].reverse().find(s => s.phase !== "appendix");
    if (first && first.background !== "dark") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slides"],
        message: `contrastModel=sandwich requires the first slide ("${first.id}") to have background="dark".`,
      });
    }
    if (lastNonAppendix && lastNonAppendix.background !== "dark") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slides"],
        message: `contrastModel=sandwich requires the final non-appendix slide ("${lastNonAppendix.id}") to have background="dark".`,
      });
    }
  }
  // all-dark / all-light: every slide background must match.
  if (deck.designSystem.contrastModel === "all-dark") {
    deck.slides.forEach((s, i) => {
      if (s.background !== "dark") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "background"],
          message: `contrastModel=all-dark requires every slide background="dark".`,
        });
      }
    });
  }
  if (deck.designSystem.contrastModel === "all-light") {
    deck.slides.forEach((s, i) => {
      if (s.background !== "light") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "background"],
          message: `contrastModel=all-light requires every slide background="light".`,
        });
      }
    });
  }
  // alternating: backgrounds must alternate by displayNumber.
  if (deck.designSystem.contrastModel === "alternating") {
    const byDisplay = [...deck.slides].sort((a, b) => a.displayNumber - b.displayNumber);
    for (let i = 1; i < byDisplay.length; i++) {
      if (byDisplay[i].background === byDisplay[i - 1].background) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `contrastModel=alternating: slides "${byDisplay[i - 1].id}" and "${byDisplay[i].id}" share background="${byDisplay[i].background}".`,
        });
        break;
      }
    }
  }
}

// ─── Public schemas ──────────────────────────────────────────────────────
// `PitchDeckLogicalSchema` — logical lints only. Useful in CI where visual
// conventions are still in flux.
// `PitchDeckSchema` — full schema with both logical and visual lints. This
// is the default export.

export const PitchDeckLogicalSchema = PitchDeckBase.superRefine(applyLogicalChecks);

export const PitchDeckSchema = PitchDeckBase
  .superRefine(applyLogicalChecks)
  .superRefine(applyVisualChecks);

// ─── Exported types ──────────────────────────────────────────────────────

export type PitchDeck = z.infer<typeof PitchDeckSchema>;
export type Audience = z.infer<typeof AudienceSchema>;
export type DataPoint = z.infer<typeof DataPointSchema>;
export type StrategicClaim = z.infer<typeof ClaimSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type AntiPattern = z.infer<typeof AntiPatternSchema>;
export type VisualTreatment = z.infer<typeof VisualTreatmentSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type RevisionEntry = z.infer<typeof RevisionEntrySchema>;
export type AskKind = z.infer<typeof AskKindSchema>;

// ─── Re-exported primitive schemas (useful for callers building helpers) ─

export const Schemas = {
  Audience: AudienceSchema,
  Source: SourceSchema,
  DataPoint: DataPointSchema,
  Claim: ClaimSchema,
  AntiPattern: AntiPatternSchema,
  Risk: RiskSchema,
  Competitor: CompetitorSchema,
  Slide: SlideSchema,
  NarrativeArc: NarrativeArcSchema,
  DesignSystem: DesignSystemSchema,
  Palette: PaletteSchema,
  SemanticPalette: SemanticPaletteSchema,
  VisualTreatment: VisualTreatmentSchema,
  AskKind: AskKindSchema,
  RevisionEntry: RevisionEntrySchema,
  // primitives
  SlugId,
  HexColor,
  Pct01,
  IsoDate,
  IsoDateLoose,
} as const;
