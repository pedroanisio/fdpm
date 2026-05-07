/**
 * business-plan.ts
 *
 * Strategic / operating business-plan schema — v1.4.0
 *
 * Ported from `business-plan.schema.json` (JSON Schema Draft 2020-12).
 * Source of truth lives here from now on; the JSON Schema can be re-emitted
 * from this file via `z.toJSONSchema(...)` (Zod v4) when an external consumer
 * needs it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISCLAIMER
 * No information in this schema or any instance validated against it should
 * be taken for granted. The schema captures structural relationships and
 * provenance metadata; it does not validate factual claims against the
 * world. Every numeric, monetary, or market-sizing field invites
 * hallucination — pair every assertion with a `ClaimAnnotation` and treat
 * unannotated values as untrusted. Any premise not backed by a real
 * logical definition or verifiable reference may be invalid, erroneous,
 * or a hallucination.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * FDPM USAGE
 *
 * This schema is the *authoring* form. Each named `z.object` below maps
 * one-to-one onto an FDPM `PrimitiveType`; the bridge
 * (`@fdpm/zod-bridge`) converts the named exports into a `DomainProfile`
 * the MCP server can register via `fdpm.profile.register`. Once a profile
 * is registered, instances are constructed primitive-by-primitive through
 * the validating-write tier (`fdpm.primitive.create`,
 * `fdpm.primitive.create_batch`, `fdpm.workbook.create`).
 *
 * The bridge is sensitive to a small set of features. To stay
 * bridge-clean we intentionally:
 *   - keep every named entity as a plain `z.object(...).strict()`
 *     (no `.transform`, no `.pipe`, no top-level `.superRefine`);
 *   - colocate cross-axis invariants on the *Refined* root (only),
 *     where they will not be visited as field validators;
 *   - use `z.string()` for IDs, not branded types, because the
 *     bridge maps brands to plain strings anyway and unbranded types
 *     stay friendly to JSON imports / fixtures;
 *   - avoid `z.discriminatedUnion` (none of the three union sites
 *     have a discriminator key worth introducing).
 *
 * TWO LAYERS
 *
 *   - `BusinessPlanSchema` — structural shape only. Use this when
 *     authoring or feeding the FDPM bridge.
 *   - `RefinedBusinessPlanSchema` — structural shape + cross-cutting
 *     invariants:
 *       * referential integrity for assumption / segment / milestone
 *         IDs;
 *       * arithmetic invariants (`riskScore ≈ likelihood × impact`,
 *         `ltvCacRatio ≈ ltv / cac`, `paybackPeriodMonths`,
 *         `grossProfit ≈ revenue − cogs`, `som ≤ sam ≤ tam`,
 *         `MoneyRange.min ≤ max`, `Range.min ≤ max`,
 *         `TimeHorizon.startDate ≤ endDate`,
 *         `CurrencyCode` consistency inside `MoneyRange`).
 *
 * The `Confidence` presence-coupling rule (at least one of
 * `level` / `score`) lives directly on `ConfidenceSchema` via a single
 * `.refine()`, so every annotation site picks it up — covered or not —
 * without a per-site walk in the root refinement.
 *
 * The per-cluster `_meta` defaults (`META_*_VALUE`) are exported so
 * external authors / fixtures / bridge code can reuse the literal
 * triples without hand-typing them. Each named entity already calls
 * `.default(...)` on its `_meta` field, so authors normally omit
 * `_meta` entirely and let Zod inject the default at parse time.
 *
 * The numeric tolerances (±0.01 for ratios, ±1 month for payback) match
 * the descriptions on the source JSON Schema; tightening them belongs
 * in a follow-up PR with explicit fixtures.
 */

import { z } from "zod";

/* =====================================================
 * 1. Ontological _meta envelope
 *
 * Every domain object below carries an `_meta` block whose three
 * fields are constants per type. These are the JSON-Schema `const`
 * values from the source file, preserved verbatim. We expose a
 * factory that produces a strict `z.object` matching that constant
 * triple, so each entity gets its own typed `_meta` schema.
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

// Per-cluster meta presets — each surfaces as the `_meta` default for
// every entity in that cluster. Constants and their literal values are
// exported so external authors / fixtures / bridge code can reuse them
// without hand-typing the triple.

export const META_PRIMITIVES_VALUE = {
  domainPath: "business/business-plan/primitives",
  register: "hypothetical",
  authority: "IFRS/GAAP, ISO 4217, business planning conventions",
} as const;
export const META_IDENTITY_VALUE = {
  domainPath: "business/business-plan/identity",
  register: "empirical",
  authority: "Company registration authorities, ISO 8601",
} as const;
export const META_IDENTITY_HYPO_VALUE = {
  domainPath: "business/business-plan/identity",
  register: "hypothetical",
  authority: "Business planning conventions, Lean Canvas",
} as const;
export const META_PROBLEM_SOLUTION_VALUE = {
  domainPath: "business/business-plan/problem-solution",
  register: "hypothetical",
  authority: "Lean Startup methodology, Jobs-to-be-Done framework",
} as const;
export const META_MARKET_VALUE = {
  domainPath: "business/business-plan/market",
  register: "hypothetical",
  authority:
    "Industry classification standards (NAICS, SIC), market research conventions",
} as const;
export const META_BUSINESS_MODEL_VALUE = {
  domainPath: "business/business-plan/business-model",
  register: "hypothetical",
  authority: "Business Model Canvas, IFRS/GAAP, SaaS metrics conventions",
} as const;
export const META_GTM_VALUE = {
  domainPath: "business/business-plan/go-to-market",
  register: "hypothetical",
  authority: "Marketing and sales strategy frameworks (STP, AIDA, MEDDIC)",
} as const;
export const META_OPERATIONS_VALUE = {
  domainPath: "business/business-plan/operations",
  register: "hypothetical",
  authority:
    "Operations management frameworks, ISO 27001, SOC 2, GDPR",
} as const;
export const META_TEAM_VALUE = {
  domainPath: "business/business-plan/team",
  register: "empirical",
  authority: "HR and organizational design conventions",
} as const;
export const META_MILESTONES_VALUE = {
  domainPath: "business/business-plan/milestones",
  register: "hypothetical",
  authority: "Project management conventions, OKR frameworks",
} as const;
export const META_FINANCIALS_VALUE = {
  domainPath: "business/business-plan/financials",
  register: "hypothetical",
  authority: "IFRS/GAAP, financial modeling conventions",
} as const;
export const META_FUNDING_ASK_VALUE = {
  domainPath: "business/business-plan/funding-ask",
  register: "hypothetical",
  authority: "Venture capital and fundraising conventions",
} as const;
export const META_RISKS_VALUE = {
  domainPath: "business/business-plan/risks",
  register: "hypothetical",
  authority: "ISO 31000, COSO ERM, risk management frameworks",
} as const;
export const META_EXIT_VALUE = {
  domainPath: "business/business-plan/exit-strategy",
  register: "speculative",
  authority: "M&A conventions, venture capital exit frameworks",
} as const;
export const META_APPENDIX_VALUE = {
  domainPath: "business/business-plan/appendix",
  register: "empirical",
  authority: "Document management conventions",
} as const;
export const META_ROOT_VALUE = {
  domainPath: "business/business-plan",
  register: "hypothetical",
  authority: "Lean Startup methodology, SBA, IFRS/GAAP",
} as const;

const META_PRIMITIVES = metaSchema(
  META_PRIMITIVES_VALUE.domainPath,
  META_PRIMITIVES_VALUE.register,
  META_PRIMITIVES_VALUE.authority,
).default(META_PRIMITIVES_VALUE);
const META_IDENTITY = metaSchema(
  META_IDENTITY_VALUE.domainPath,
  META_IDENTITY_VALUE.register,
  META_IDENTITY_VALUE.authority,
).default(META_IDENTITY_VALUE);
const META_IDENTITY_HYPO = metaSchema(
  META_IDENTITY_HYPO_VALUE.domainPath,
  META_IDENTITY_HYPO_VALUE.register,
  META_IDENTITY_HYPO_VALUE.authority,
).default(META_IDENTITY_HYPO_VALUE);
const META_PROBLEM_SOLUTION = metaSchema(
  META_PROBLEM_SOLUTION_VALUE.domainPath,
  META_PROBLEM_SOLUTION_VALUE.register,
  META_PROBLEM_SOLUTION_VALUE.authority,
).default(META_PROBLEM_SOLUTION_VALUE);
const META_MARKET = metaSchema(
  META_MARKET_VALUE.domainPath,
  META_MARKET_VALUE.register,
  META_MARKET_VALUE.authority,
).default(META_MARKET_VALUE);
const META_BUSINESS_MODEL = metaSchema(
  META_BUSINESS_MODEL_VALUE.domainPath,
  META_BUSINESS_MODEL_VALUE.register,
  META_BUSINESS_MODEL_VALUE.authority,
).default(META_BUSINESS_MODEL_VALUE);
const META_GTM = metaSchema(
  META_GTM_VALUE.domainPath,
  META_GTM_VALUE.register,
  META_GTM_VALUE.authority,
).default(META_GTM_VALUE);
const META_OPERATIONS = metaSchema(
  META_OPERATIONS_VALUE.domainPath,
  META_OPERATIONS_VALUE.register,
  META_OPERATIONS_VALUE.authority,
).default(META_OPERATIONS_VALUE);
const META_TEAM = metaSchema(
  META_TEAM_VALUE.domainPath,
  META_TEAM_VALUE.register,
  META_TEAM_VALUE.authority,
).default(META_TEAM_VALUE);
const META_MILESTONES = metaSchema(
  META_MILESTONES_VALUE.domainPath,
  META_MILESTONES_VALUE.register,
  META_MILESTONES_VALUE.authority,
).default(META_MILESTONES_VALUE);
const META_FINANCIALS = metaSchema(
  META_FINANCIALS_VALUE.domainPath,
  META_FINANCIALS_VALUE.register,
  META_FINANCIALS_VALUE.authority,
).default(META_FINANCIALS_VALUE);
const META_FUNDING_ASK = metaSchema(
  META_FUNDING_ASK_VALUE.domainPath,
  META_FUNDING_ASK_VALUE.register,
  META_FUNDING_ASK_VALUE.authority,
).default(META_FUNDING_ASK_VALUE);
const META_RISKS = metaSchema(
  META_RISKS_VALUE.domainPath,
  META_RISKS_VALUE.register,
  META_RISKS_VALUE.authority,
).default(META_RISKS_VALUE);
const META_EXIT = metaSchema(
  META_EXIT_VALUE.domainPath,
  META_EXIT_VALUE.register,
  META_EXIT_VALUE.authority,
).default(META_EXIT_VALUE);
const META_APPENDIX = metaSchema(
  META_APPENDIX_VALUE.domainPath,
  META_APPENDIX_VALUE.register,
  META_APPENDIX_VALUE.authority,
).default(META_APPENDIX_VALUE);
const META_ROOT = metaSchema(
  META_ROOT_VALUE.domainPath,
  META_ROOT_VALUE.register,
  META_ROOT_VALUE.authority,
).default(META_ROOT_VALUE);

/* =====================================================
 * 2. Shared primitives
 * ===================================================== */

export const ShortTextSchema = z.string().trim().min(1).max(300);
export type ShortText = z.infer<typeof ShortTextSchema>;

export const LongTextSchema = z.string().trim().min(1).max(10000);
export type LongText = z.infer<typeof LongTextSchema>;

export const TagSchema = z.string().min(1).max(50);
export type Tag = z.infer<typeof TagSchema>;

// ISO 8601 calendar date with day-of-month / leap-year correctness baked in.
// Pattern is preserved from the source JSON Schema so emitted JSON Schema
// round-trips byte-for-byte.
const ISO_DATE_REGEX =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))$/;
export const ISODateSchema = z
  .string()
  .regex(ISO_DATE_REGEX, "ISO 8601 calendar date YYYY-MM-DD");
export type ISODate = z.infer<typeof ISODateSchema>;

// Email — the JSON Schema combined `format: email` with a strict regex;
// the regex is the binding constraint. Use it as the source of truth.
const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
export const EmailSchema = z.string().regex(EMAIL_REGEX, "valid email address");
export type Email = z.infer<typeof EmailSchema>;

// ISO 4217 three-letter currency code.
export const CurrencyCodeSchema = z
  .string()
  .min(3)
  .max(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 three-letter uppercase code");
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const PercentageSchema = z.number().min(0).max(100);
export type Percentage = z.infer<typeof PercentageSchema>;

export const ProbabilitySchema = z.number().min(0).max(1);
export type Probability = z.infer<typeof ProbabilitySchema>;

/* =====================================================
 * 3. Annotation primitives (no _meta — pure annotation shapes)
 * ===================================================== */

export const ConfidenceLevelSchema = z.enum([
  "very_low",
  "low",
  "moderate",
  "high",
  "verified",
]);

// Confidence has no required fields *structurally*, but at least one of
// `level` / `score` MUST be present. Enforced via a single `.refine()` on
// the Confidence shape itself — centralizing the rule eliminates the
// per-site walk that used to live in RefinedBusinessPlanSchema and made
// adding new annotation sites a silent-drift hazard. The refinement is
// pure (no transform / pipe / superRefine), so the bridge sees a plain
// ZodObject — `Confidence` is also intentionally not registered in the
// `Schemas` map.
export const ConfidenceSchema = z
  .object({
    level: ConfidenceLevelSchema.optional(),
    score: ProbabilitySchema.optional(),
  })
  .strict()
  .refine((c) => c.level !== undefined || c.score !== undefined, {
    message:
      "Confidence requires at least one of `level` or `score` to be present.",
  });
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProvenanceSourceTypeSchema = z.enum([
  "primary_research",
  "secondary_research",
  "expert_opinion",
  "assumption",
  "calculation",
  "observation",
  "model_output",
  "analogy",
  "unknown",
]);

export const ProvenanceSchema = z
  .object({
    sourceType: ProvenanceSourceTypeSchema,
    sourceLabel: ShortTextSchema.optional(),
    sourceUrl: z.string().url().optional(),
    retrievedAt: ISODateSchema.optional(),
    methodology: LongTextSchema.optional(),
  })
  .strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ClaimAnnotationSchema = z
  .object({
    confidence: ConfidenceSchema.optional(),
    provenance: z.array(ProvenanceSchema).default([]),
    rationale: LongTextSchema.optional(),
  })
  .strict();
export type ClaimAnnotation = z.infer<typeof ClaimAnnotationSchema>;

/* =====================================================
 * 4. Money / Range primitives
 * ===================================================== */

export const MoneySchema = z
  .object({
    _meta: META_PRIMITIVES,
    amount: z.number(),
    currency: CurrencyCodeSchema,
  })
  .strict();
export type Money = z.infer<typeof MoneySchema>;

export const MoneyRangeSchema = z
  .object({
    _meta: META_PRIMITIVES,
    min: MoneySchema,
    max: MoneySchema,
  })
  .strict();
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;

export const AnnotatedMoneySchema = z
  .object({
    _meta: META_PRIMITIVES,
    value: MoneySchema,
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type AnnotatedMoney = z.infer<typeof AnnotatedMoneySchema>;

export const RangeSchema = z
  .object({
    _meta: META_PRIMITIVES,
    min: z.number(),
    max: z.number(),
  })
  .strict();
export type Range = z.infer<typeof RangeSchema>;

export const TimeHorizonSchema = z
  .object({
    _meta: META_PRIMITIVES,
    startDate: ISODateSchema.optional(),
    endDate: ISODateSchema.optional(),
    periodLabel: ShortTextSchema.optional(),
  })
  .strict();
export type TimeHorizon = z.infer<typeof TimeHorizonSchema>;

export const AssumptionSchema = z
  .object({
    _meta: META_PRIMITIVES,
    id: z.string().min(1),
    statement: LongTextSchema,
    owner: z.string().min(1).optional(),
    lastUpdated: ISODateSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type Assumption = z.infer<typeof AssumptionSchema>;

export const KPITypeSchema = z.enum([
  "revenue",
  "arr",
  "mrr",
  "gross_margin",
  "burn",
  "runway",
  "cac",
  "ltv",
  "ltv_cac_ratio",
  "conversion_rate",
  "churn",
  "retention",
  "nps",
  "active_users",
  "customers",
  "pipeline",
  "other",
]);

export const KPIValueSchema = z
  .object({
    _meta: META_PRIMITIVES,
    name: z.string().min(1),
    type: KPITypeSchema,
    // anyOf: number | string | Money — no discriminator key, plain union.
    value: z.union([z.number(), z.string(), MoneySchema]),
    unit: ShortTextSchema.optional(),
    date: ISODateSchema.optional(),
    note: ShortTextSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type KPIValue = z.infer<typeof KPIValueSchema>;

export const PersonSchema = z
  .object({
    _meta: META_PRIMITIVES,
    fullName: z.string().min(1),
    role: z.string().min(1),
    bio: LongTextSchema.optional(),
    email: EmailSchema.optional(),
    linkedinUrl: z.string().url().optional(),
    ownershipPercent: PercentageSchema.optional(),
  })
  .strict();
export type Person = z.infer<typeof PersonSchema>;

/* =====================================================
 * 5. Document metadata + identity
 * ===================================================== */

export const ConfidentialitySchema = z.enum([
  "public",
  "internal",
  "confidential",
  "strictly_confidential",
]);

export const MetadataSchema = z
  .object({
    _meta: META_IDENTITY,
    title: z.string().min(1),
    subtitle: ShortTextSchema.optional(),
    author: z.string().min(1).optional(),
    createdAt: ISODateSchema.optional(),
    updatedAt: ISODateSchema.optional(),
    tags: z.array(TagSchema).default([]),
    confidentiality: ConfidentialitySchema.default("confidential"),
  })
  .strict();
export type Metadata = z.infer<typeof MetadataSchema>;

export const StageSchema = z.enum([
  "idea",
  "problem_validation",
  "solution_validation",
  "mvp",
  "early_revenue",
  "growth",
  "scale",
  "mature",
]);

export const LegalStructureSchema = z.enum([
  "sole_proprietorship",
  "llc",
  "corporation",
  "partnership",
  "nonprofit",
  "other",
]);

export const BusinessIdentitySchema = z
  .object({
    _meta: META_IDENTITY,
    legalName: z.string().min(1),
    brandName: z.string().min(1).optional(),
    tagline: ShortTextSchema.optional(),
    websiteUrl: z.string().url().optional(),
    contactEmail: EmailSchema.optional(),
    headquarters: ShortTextSchema.optional(),
    foundedDate: ISODateSchema.optional(),
    stage: StageSchema,
    mission: LongTextSchema,
    vision: LongTextSchema.optional(),
    legalStructure: LegalStructureSchema.optional(),
  })
  .strict();
export type BusinessIdentity = z.infer<typeof BusinessIdentitySchema>;

export const ExecutiveSummarySchema = z
  .object({
    _meta: META_IDENTITY_HYPO,
    oneLiner: ShortTextSchema,
    problemSummary: LongTextSchema,
    solutionSummary: LongTextSchema,
    targetMarketSummary: LongTextSchema,
    businessModelSummary: LongTextSchema,
    tractionSummary: LongTextSchema.optional(),
    financialHighlightsSummary: LongTextSchema.optional(),
    fundingSummary: LongTextSchema.optional(),
    strategicAskSummary: LongTextSchema.optional(),
  })
  .strict();
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

/* =====================================================
 * 6. Problem / Solution / IP
 * ===================================================== */

export const UrgencySchema = z.enum(["low", "medium", "high"]);

const ProblemEvidenceItemSchema = z
  .object({
    claim: LongTextSchema,
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();

export const ProblemSchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    problemStatement: LongTextSchema,
    painPoints: z.array(LongTextSchema).min(1),
    existingAlternatives: z.array(LongTextSchema).default([]),
    urgency: UrgencySchema,
    evidence: z.array(ProblemEvidenceItemSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type Problem = z.infer<typeof ProblemSchema>;

export const SolutionFeatureStatusSchema = z.enum([
  "concept",
  "planned",
  "in_progress",
  "live",
]);

export const SolutionFeatureSchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    name: z.string().min(1),
    description: LongTextSchema,
    benefit: LongTextSchema.optional(),
    differentiator: LongTextSchema.optional(),
    status: SolutionFeatureStatusSchema.optional(),
  })
  .strict();
export type SolutionFeature = z.infer<typeof SolutionFeatureSchema>;

export const IPAssetTypeSchema = z.enum([
  "patent",
  "patent_pending",
  "trademark",
  "trade_secret",
  "copyright",
  "exclusive_license",
  "proprietary_data",
  "other",
]);

export const IPAssetStatusSchema = z.enum([
  "active",
  "pending",
  "expired",
  "abandoned",
]);

export const IPAssetSchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    id: z.string().min(1),
    type: IPAssetTypeSchema,
    title: z.string().min(1),
    description: LongTextSchema.optional(),
    jurisdiction: ShortTextSchema.optional(),
    filingDate: ISODateSchema.optional(),
    grantDate: ISODateSchema.optional(),
    expirationDate: ISODateSchema.optional(),
    registrationNumber: ShortTextSchema.optional(),
    status: IPAssetStatusSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type IPAsset = z.infer<typeof IPAssetSchema>;

export const IntellectualPropertySchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    assets: z.array(IPAssetSchema).default([]),
    strategy: LongTextSchema.optional(),
    freedomToOperate: LongTextSchema.optional(),
  })
  .strict();
export type IntellectualProperty = z.infer<typeof IntellectualPropertySchema>;

export const ValuePropositionSchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    coreValueProposition: LongTextSchema,
    uniqueSellingPoints: z.array(LongTextSchema).min(1),
    whyNow: LongTextSchema.optional(),
    defensibility: z.array(LongTextSchema).default([]),
    intellectualProperty: IntellectualPropertySchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type ValueProposition = z.infer<typeof ValuePropositionSchema>;

export const SolutionSchema = z
  .object({
    _meta: META_PROBLEM_SOLUTION,
    solutionStatement: LongTextSchema,
    productOrServiceDescription: LongTextSchema,
    features: z.array(SolutionFeatureSchema).default([]),
    valueProposition: ValuePropositionSchema,
  })
  .strict();
export type Solution = z.infer<typeof SolutionSchema>;

/* =====================================================
 * 7. Market analysis
 * ===================================================== */

export const CustomerSegmentTypeSchema = z.enum([
  "consumer",
  "smb",
  "mid_market",
  "enterprise",
  "government",
  "nonprofit",
  "developer",
  "partner",
  "other",
]);

export const CustomerSegmentPhaseSchema = z.enum([
  "beachhead",
  "secondary",
  "later",
  "opportunistic",
]);

export const CustomerSegmentSchema = z
  .object({
    _meta: META_MARKET,
    id: z.string().min(1),
    name: z.string().min(1),
    type: CustomerSegmentTypeSchema,
    phase: CustomerSegmentPhaseSchema.optional(),
    phaseRationale: LongTextSchema.optional(),
    description: LongTextSchema,
    buyerPersona: ShortTextSchema.optional(),
    userPersona: ShortTextSchema.optional(),
    geography: ShortTextSchema.optional(),
    industry: ShortTextSchema.optional(),
    companySize: ShortTextSchema.optional(),
    painPoints: z.array(LongTextSchema).default([]),
    jobsToBeDone: z.array(LongTextSchema).default([]),
    // willingness to pay can be a point or a range. Split into two optional
    // fields with an XOR refinement so the bridge can map each as a plain
    // struct field (kind: "struct"). The pre-bridge form was
    //   willingnessToPay: z.union([MoneySchema, MoneyRangeSchema]).optional()
    // which lacks a discriminator key the bridge can lift.
    willingnessToPayPoint: MoneySchema.optional(),
    willingnessToPayRange: MoneyRangeSchema.optional(),
    priority: z.number().int().min(1).max(10).optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict()
  .refine(
    (s: {
      willingnessToPayPoint?: Money | undefined;
      willingnessToPayRange?: MoneyRange | undefined;
    }) =>
      !(
        s.willingnessToPayPoint !== undefined &&
        s.willingnessToPayRange !== undefined
      ),
    {
      message:
        "CustomerSegment: at most one of `willingnessToPayPoint` / `willingnessToPayRange` may be set.",
      path: ["willingnessToPayPoint"],
    },
  );
export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

export const MarketSizingSchema = z
  .object({
    _meta: META_MARKET,
    tam: AnnotatedMoneySchema.optional(),
    sam: AnnotatedMoneySchema.optional(),
    som: AnnotatedMoneySchema.optional(),
    methodology: LongTextSchema.optional(),
    assumptions: z.array(AssumptionSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type MarketSizing = z.infer<typeof MarketSizingSchema>;

export const MarketTrendImpactSchema = z.enum([
  "negative",
  "neutral",
  "positive",
]);

export const MarketTrendSchema = z
  .object({
    _meta: META_MARKET,
    title: z.string().min(1),
    description: LongTextSchema,
    impact: MarketTrendImpactSchema,
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type MarketTrend = z.infer<typeof MarketTrendSchema>;

export const CompetitorTypeSchema = z.enum([
  "direct",
  "indirect",
  "substitute",
  "status_quo",
]);

export const CompetitorSchema = z
  .object({
    _meta: META_MARKET,
    name: z.string().min(1),
    type: CompetitorTypeSchema,
    description: LongTextSchema.optional(),
    websiteUrl: z.string().url().optional(),
    strengths: z.array(ShortTextSchema).default([]),
    weaknesses: z.array(ShortTextSchema).default([]),
    pricingNotes: LongTextSchema.optional(),
    marketPosition: ShortTextSchema.optional(),
    estimatedRevenue: AnnotatedMoneySchema.optional(),
    fundingRaised: AnnotatedMoneySchema.optional(),
    marketSharePercent: PercentageSchema.optional(),
    headcount: z.number().min(0).optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type Competitor = z.infer<typeof CompetitorSchema>;

export const DurabilitySchema = z.enum(["low", "medium", "high"]);

export const CompetitiveAdvantageSchema = z
  .object({
    _meta: META_MARKET,
    title: z.string().min(1),
    description: LongTextSchema,
    durability: DurabilitySchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type CompetitiveAdvantage = z.infer<typeof CompetitiveAdvantageSchema>;

export const MarketAnalysisSchema = z
  .object({
    _meta: META_MARKET,
    industryOverview: LongTextSchema,
    customerSegments: z.array(CustomerSegmentSchema).min(1),
    marketSizing: MarketSizingSchema.optional(),
    trends: z.array(MarketTrendSchema).default([]),
    competitors: z.array(CompetitorSchema).default([]),
    competitiveAdvantages: z.array(CompetitiveAdvantageSchema).default([]),
  })
  .strict();
export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

/* =====================================================
 * 8. Business model
 * ===================================================== */

export const PricingStrategySchema = z.enum([
  "cost_plus",
  "value_based",
  "competition_based",
  "penetration",
  "premium",
  "freemium",
  "custom",
]);

export const PricingSchema = z
  .object({
    _meta: META_BUSINESS_MODEL,
    strategy: PricingStrategySchema,
    description: LongTextSchema,
    packaging: z.array(ShortTextSchema).default([]),
    discountPolicy: LongTextSchema.optional(),
  })
  .strict();
export type Pricing = z.infer<typeof PricingSchema>;

export const RevenueStreamTypeSchema = z.enum([
  "subscription",
  "one_time_sale",
  "transaction_fee",
  "usage_based",
  "licensing",
  "services",
  "ads",
  "affiliate",
  "other",
]);

export const RevenueStreamSchema = z
  .object({
    _meta: META_BUSINESS_MODEL,
    id: z.string().min(1),
    name: z.string().min(1),
    type: RevenueStreamTypeSchema,
    description: LongTextSchema,
    pricingMechanism: LongTextSchema.optional(),
    // pricePoint can be a point price (Money) or a numeric range (Range, no
    // currency). Split into two optional fields with an XOR refinement; same
    // motivation as CustomerSegment.willingnessToPay above.
    pricePointMoney: MoneySchema.optional(),
    pricePointRange: RangeSchema.optional(),
    grossMarginPercent: PercentageSchema.optional(),
    grossMarginPercentNote: LongTextSchema.optional(),
    assumptions: z.array(AssumptionSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict()
  .refine(
    (s: {
      pricePointMoney?: Money | undefined;
      pricePointRange?: Range | undefined;
    }) =>
      !(s.pricePointMoney !== undefined && s.pricePointRange !== undefined),
    {
      message:
        "RevenueStream: at most one of `pricePointMoney` / `pricePointRange` may be set.",
      path: ["pricePointMoney"],
    },
  );
export type RevenueStream = z.infer<typeof RevenueStreamSchema>;

export const CostItemTypeSchema = z.enum([
  "fixed",
  "variable",
  "semi_variable",
  "capex",
  "opex",
]);

export const CostFrequencySchema = z.enum([
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "usage_based",
]);

export const CostItemSchema = z
  .object({
    _meta: META_BUSINESS_MODEL,
    id: z.string().min(1),
    name: z.string().min(1),
    type: CostItemTypeSchema,
    description: LongTextSchema.optional(),
    amount: MoneySchema.optional(),
    frequency: CostFrequencySchema.optional(),
    assumptions: z.array(AssumptionSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type CostItem = z.infer<typeof CostItemSchema>;

const UnitEconomicsSegmentItemSchema = z
  .object({
    segmentId: z.string().min(1),
    cac: AnnotatedMoneySchema.optional(),
    ltv: AnnotatedMoneySchema.optional(),
    ltvCacRatio: z.number().optional(),
    paybackPeriodMonths: z.number().min(0).optional(),
    contributionMargin: AnnotatedMoneySchema.optional(),
    contributionMarginPercent: PercentageSchema.optional(),
  })
  .strict();

export const UnitEconomicsSchema = z
  .object({
    _meta: META_BUSINESS_MODEL,
    cac: AnnotatedMoneySchema.optional(),
    ltv: AnnotatedMoneySchema.optional(),
    ltvCacRatio: z.number().optional(),
    paybackPeriodMonths: z.number().min(0).optional(),
    contributionMargin: AnnotatedMoneySchema.optional(),
    contributionMarginPercent: PercentageSchema.optional(),
    perSegment: z.array(UnitEconomicsSegmentItemSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type UnitEconomics = z.infer<typeof UnitEconomicsSchema>;

export const BusinessModelTypeSchema = z.enum([
  "b2b",
  "b2c",
  "b2b2c",
  "marketplace",
  "saas",
  "services",
  "subscription",
  "transactional",
  "ecommerce",
  "licensing",
  "hybrid",
]);

export const BusinessModelSchema = z
  .object({
    _meta: META_BUSINESS_MODEL,
    modelTypes: z.array(BusinessModelTypeSchema).min(1),
    description: LongTextSchema,
    pricing: PricingSchema,
    revenueStreams: z.array(RevenueStreamSchema).min(1),
    costStructure: z.array(CostItemSchema).default([]),
    unitEconomicsSummary: LongTextSchema.optional(),
    unitEconomics: UnitEconomicsSchema.optional(),
  })
  .strict();
export type BusinessModel = z.infer<typeof BusinessModelSchema>;

/* =====================================================
 * 9. Go-to-market
 * ===================================================== */

export const ChannelTypeSchema = z.enum([
  "direct_sales",
  "inside_sales",
  "field_sales",
  "self_serve",
  "content_marketing",
  "seo",
  "paid_ads",
  "social",
  "email",
  "partnerships",
  "resellers",
  "marketplaces",
  "events",
  "community",
  "other",
]);

export const ChannelRoleSchema = z.enum([
  "acquisition",
  "activation",
  "retention",
  "expansion",
]);

export const ChannelSchema = z
  .object({
    _meta: META_GTM,
    id: z.string().min(1),
    type: ChannelTypeSchema,
    name: z.string().min(1),
    description: LongTextSchema,
    expectedRole: ChannelRoleSchema,
    estimatedCAC: MoneySchema.optional(),
    assumptions: z.array(AssumptionSchema).default([]),
  })
  .strict();
export type Channel = z.infer<typeof ChannelSchema>;

export const MarketingPlanSchema = z
  .object({
    _meta: META_GTM,
    positioningStatement: LongTextSchema,
    messagingPillars: z.array(ShortTextSchema).default([]),
    acquisitionChannels: z.array(ChannelSchema).default([]),
    launchStrategy: LongTextSchema.optional(),
    contentStrategy: LongTextSchema.optional(),
    partnershipsStrategy: LongTextSchema.optional(),
  })
  .strict();
export type MarketingPlan = z.infer<typeof MarketingPlanSchema>;

export const SalesMotionSchema = z.enum([
  "self_serve",
  "product_led",
  "inside_sales",
  "field_sales",
  "partner_led",
  "hybrid",
]);

export const SalesProcessStepSchema = z
  .object({
    _meta: META_GTM,
    order: z.number().int().min(1),
    name: z.string().min(1),
    description: LongTextSchema,
    ownerRole: ShortTextSchema.optional(),
  })
  .strict();
export type SalesProcessStep = z.infer<typeof SalesProcessStepSchema>;

export const SalesPlanSchema = z
  .object({
    _meta: META_GTM,
    salesMotion: SalesMotionSchema,
    averageSalesCycleDays: z.number().min(0).optional(),
    salesCycleNote: LongTextSchema.optional(),
    averageDealSize: MoneySchema.optional(),
    salesProcess: z.array(SalesProcessStepSchema).default([]),
    pipelineAssumptions: z.array(AssumptionSchema).default([]),
  })
  .strict();
export type SalesPlan = z.infer<typeof SalesPlanSchema>;

export const RetentionPlanSchema = z
  .object({
    _meta: META_GTM,
    onboardingApproach: LongTextSchema.optional(),
    supportModel: LongTextSchema.optional(),
    retentionLevers: z.array(LongTextSchema).default([]),
    expansionStrategy: LongTextSchema.optional(),
  })
  .strict();
export type RetentionPlan = z.infer<typeof RetentionPlanSchema>;

export const GoToMarketSchema = z
  .object({
    _meta: META_GTM,
    marketing: MarketingPlanSchema,
    sales: SalesPlanSchema.optional(),
    retention: RetentionPlanSchema.optional(),
  })
  .strict();
export type GoToMarket = z.infer<typeof GoToMarketSchema>;

/* =====================================================
 * 10. Operations
 * ===================================================== */

export const ProcessCriticalitySchema = z.enum(["low", "medium", "high"]);

export const ProcessSchema = z
  .object({
    _meta: META_OPERATIONS,
    id: z.string().min(1),
    name: z.string().min(1),
    description: LongTextSchema,
    ownerRole: ShortTextSchema.optional(),
    criticality: ProcessCriticalitySchema.optional(),
  })
  .strict();
export type Process = z.infer<typeof ProcessSchema>;

export const TechnologySchema = z
  .object({
    _meta: META_OPERATIONS,
    architectureSummary: LongTextSchema.optional(),
    keySystems: z.array(ShortTextSchema).default([]),
    securityConsiderations: z.array(LongTextSchema).default([]),
    dataConsiderations: z.array(LongTextSchema).default([]),
    scalabilityConsiderations: z.array(LongTextSchema).default([]),
  })
  .strict();
export type Technology = z.infer<typeof TechnologySchema>;

export const HiringPriority = z.enum(["low", "medium", "high"]);

export const HiringPlanItemSchema = z
  .object({
    _meta: META_OPERATIONS,
    role: z.string().min(1),
    headcount: z.number().int().min(1),
    targetDate: ISODateSchema.optional(),
    rationale: LongTextSchema.optional(),
    priority: HiringPriority.optional(),
  })
  .strict();
export type HiringPlanItem = z.infer<typeof HiringPlanItemSchema>;

export const ComplianceStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "achieved",
  "expired",
]);

export const ComplianceFrameworkSchema = z
  .object({
    _meta: META_OPERATIONS,
    id: z.string().min(1),
    name: z.string().min(1),
    description: LongTextSchema.optional(),
    status: ComplianceStatusSchema,
    targetDate: ISODateSchema.optional(),
    certificationDate: ISODateSchema.optional(),
    expirationDate: ISODateSchema.optional(),
    scope: ShortTextSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;

export const OperationsSchema = z
  .object({
    _meta: META_OPERATIONS,
    operatingModelSummary: LongTextSchema,
    coreProcesses: z.array(ProcessSchema).default([]),
    suppliersAndPartners: z.array(ShortTextSchema).default([]),
    technology: TechnologySchema.optional(),
    hiringPlan: z.array(HiringPlanItemSchema).default([]),
    compliance: z.array(ComplianceFrameworkSchema).default([]),
  })
  .strict();
export type Operations = z.infer<typeof OperationsSchema>;

/* =====================================================
 * 11. Team
 * ===================================================== */

export const AdvisorSchema = z
  .object({
    _meta: META_TEAM,
    fullName: z.string().min(1),
    area: ShortTextSchema,
    bio: LongTextSchema.optional(),
    email: EmailSchema.optional(),
    linkedinUrl: z.string().url().optional(),
  })
  .strict();
export type Advisor = z.infer<typeof AdvisorSchema>;

export const TeamSchema = z
  .object({
    _meta: META_TEAM,
    founders: z.array(PersonSchema).min(1),
    leadership: z.array(PersonSchema).default([]),
    advisors: z.array(AdvisorSchema).default([]),
    orgDesignSummary: LongTextSchema.optional(),
    culturePrinciples: z.array(ShortTextSchema).default([]),
    capabilityGaps: z.array(ShortTextSchema).default([]),
  })
  .strict();
export type Team = z.infer<typeof TeamSchema>;

/* =====================================================
 * 12. Milestones / roadmap / traction
 * ===================================================== */

export const MilestoneStatusSchema = z.enum([
  "planned",
  "in_progress",
  "achieved",
  "delayed",
  "cancelled",
]);

export const MilestoneSchema = z
  .object({
    _meta: META_MILESTONES,
    id: z.string().min(1),
    title: z.string().min(1),
    description: LongTextSchema.optional(),
    targetDate: ISODateSchema.optional(),
    status: MilestoneStatusSchema,
    phase: ShortTextSchema.optional(),
    successCriteria: z.array(ShortTextSchema).default([]),
    goNoGo: LongTextSchema.optional(),
    contingency: LongTextSchema.optional(),
    dependsOn: z.array(z.string().min(1)).default([]),
    budget: MoneySchema.optional(),
  })
  .strict();
export type Milestone = z.infer<typeof MilestoneSchema>;

export const RoadmapSchema = z
  .object({
    _meta: META_MILESTONES,
    upcomingMilestones: z.array(MilestoneSchema).default([]),
    strategicPriorities: z.array(ShortTextSchema).default([]),
  })
  .strict();
export type Roadmap = z.infer<typeof RoadmapSchema>;

export const TractionSchema = z
  .object({
    _meta: META_MILESTONES,
    summary: LongTextSchema.optional(),
    metrics: z.array(KPIValueSchema).default([]),
    notableCustomers: z.array(ShortTextSchema).default([]),
    testimonials: z.array(LongTextSchema).default([]),
    partnerships: z.array(ShortTextSchema).default([]),
    milestonesAchieved: z.array(MilestoneSchema).default([]),
  })
  .strict();
export type Traction = z.infer<typeof TractionSchema>;

/* =====================================================
 * 13. Financial plan / funding
 * ===================================================== */

export const FinancialScenarioSchema = z.enum([
  "base",
  "optimistic",
  "pessimistic",
  "stress_test",
]);

export const FinancialMetricProjectionSchema = z
  .object({
    _meta: META_FINANCIALS,
    period: z.string().min(1),
    scenario: FinancialScenarioSchema.default("base"),
    revenue: z.number().min(0).optional(),
    cogs: z.number().min(0).optional(),
    grossProfit: z.number().optional(),
    operatingExpenses: z.number().min(0).optional(),
    ebitda: z.number().optional(),
    netIncome: z.number().optional(),
    cashEnding: z.number().optional(),
    customers: z.number().min(0).optional(),
    assumptionIds: z.array(z.string().min(1)).default([]),
    variedAssumptionIds: z.array(z.string().min(1)).default([]),
    deltaDescription: LongTextSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type FinancialMetricProjection = z.infer<
  typeof FinancialMetricProjectionSchema
>;

export const FundingRoundStatusSchema = z.enum(["planned", "open", "closed"]);

export const FundingInstrumentSchema = z.enum([
  "equity",
  "safe",
  "convertible_note",
  "debt",
  "grant",
  "bootstrapped",
  "other",
]);

export const FundingRoundSchema = z
  .object({
    _meta: META_FINANCIALS,
    roundName: z.string().min(1),
    status: FundingRoundStatusSchema,
    targetAmount: MoneySchema,
    raisedAmount: MoneySchema.optional(),
    instrument: FundingInstrumentSchema.optional(),
    preMoneyValuation: MoneySchema.optional(),
    postMoneyValuation: MoneySchema.optional(),
    useOfFundsSummary: LongTextSchema.optional(),
    closedDate: ISODateSchema.optional(),
  })
  .strict();
export type FundingRound = z.infer<typeof FundingRoundSchema>;

export const UseOfFundsItemSchema = z
  .object({
    _meta: META_FINANCIALS,
    category: z.string().min(1),
    amount: MoneySchema,
    percent: PercentageSchema.optional(),
    rationale: LongTextSchema.optional(),
  })
  .strict();
export type UseOfFundsItem = z.infer<typeof UseOfFundsItemSchema>;

export const FinancialPlanSchema = z
  .object({
    _meta: META_FINANCIALS,
    currency: CurrencyCodeSchema,
    assumptions: z.array(AssumptionSchema).default([]),
    historicalMetrics: z.array(KPIValueSchema).default([]),
    projections: z.array(FinancialMetricProjectionSchema).default([]),
    breakEvenPoint: TimeHorizonSchema.optional(),
    burnRateMonthly: MoneySchema.optional(),
    runwayMonths: z.number().min(0).optional(),
    fundingRounds: z.array(FundingRoundSchema).default([]),
    useOfFunds: z.array(UseOfFundsItemSchema).default([]),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type FinancialPlan = z.infer<typeof FinancialPlanSchema>;

export const FundingAskSchema = z
  .object({
    _meta: META_FUNDING_ASK,
    isSeekingFunding: z.boolean(),
    targetAmount: MoneySchema.optional(),
    minimumAmount: MoneySchema.optional(),
    idealInvestorProfile: LongTextSchema.optional(),
    plannedRunwayMonthsFromRound: z.number().min(0).optional(),
    useOfFundsSummary: LongTextSchema.optional(),
    milestoneUnlocks: z.array(ShortTextSchema).default([]),
  })
  .strict();
export type FundingAsk = z.infer<typeof FundingAskSchema>;

/* =====================================================
 * 14. Risks
 * ===================================================== */

export const RiskCategorySchema = z.enum([
  "market",
  "product",
  "technology",
  "operational",
  "financial",
  "legal",
  "regulatory",
  "competitive",
  "team",
  "security",
  "reputation",
  "other",
]);

export const RiskScaleSchema = z.enum(["low", "medium", "high", "critical"]);

export const RiskSchema = z
  .object({
    _meta: META_RISKS,
    id: z.string().min(1),
    title: z.string().min(1),
    category: RiskCategorySchema,
    description: LongTextSchema,
    likelihood: RiskScaleSchema,
    impact: RiskScaleSchema,
    mitigationPlan: LongTextSchema.optional(),
    contingencyPlan: LongTextSchema.optional(),
    owner: ShortTextSchema.optional(),
    likelihoodScore: ProbabilitySchema.optional(),
    // Bounded to [0,1] so `riskScore = likelihoodScore × impactScore`
    // produces a meaningful product (also in [0,1]) rather than an
    // unbounded numeric coincidence.
    impactScore: ProbabilitySchema.optional(),
    riskScore: ProbabilitySchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type Risk = z.infer<typeof RiskSchema>;

const RiskRegistrySchema = z
  .object({
    _meta: META_RISKS,
    risks: z.array(RiskSchema).default([]),
  })
  .strict();
export type RiskRegistry = z.infer<typeof RiskRegistrySchema>;

/* =====================================================
 * 15. Exit strategy
 * ===================================================== */

export const ExitMechanismSchema = z.enum([
  "ipo",
  "acquisition",
  "merger",
  "secondary_sale",
  "management_buyout",
  "liquidation",
  "other",
]);

export const PotentialAcquirerFitSchema = z.enum(["low", "medium", "high"]);

export const PotentialAcquirerSchema = z
  .object({
    _meta: META_EXIT,
    name: z.string().min(1),
    rationale: LongTextSchema.optional(),
    estimatedFit: PotentialAcquirerFitSchema.optional(),
  })
  .strict();
export type PotentialAcquirer = z.infer<typeof PotentialAcquirerSchema>;

export const ComparableTransactionSchema = z
  .object({
    _meta: META_EXIT,
    companyName: z.string().min(1),
    acquirerName: ShortTextSchema.optional(),
    mechanism: ExitMechanismSchema,
    transactionValue: MoneySchema.optional(),
    revenueMultiple: z.number().optional(),
    ebitdaMultiple: z.number().optional(),
    date: ISODateSchema.optional(),
    source: z.string().url().optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type ComparableTransaction = z.infer<typeof ComparableTransactionSchema>;

export const ExitStrategySchema = z
  .object({
    _meta: META_EXIT,
    preferredMechanisms: z.array(ExitMechanismSchema).min(1),
    targetTimeline: TimeHorizonSchema.optional(),
    targetRevenueMultiple: z.number().optional(),
    targetEbitdaMultiple: z.number().optional(),
    potentialAcquirers: z.array(PotentialAcquirerSchema).default([]),
    comparableTransactions: z.array(ComparableTransactionSchema).default([]),
    narrative: LongTextSchema.optional(),
    annotation: ClaimAnnotationSchema.optional(),
  })
  .strict();
export type ExitStrategy = z.infer<typeof ExitStrategySchema>;

/* =====================================================
 * 16. Appendix
 * ===================================================== */

export const ReferenceTypeSchema = z.enum([
  "deck",
  "financial_model",
  "market_research",
  "customer_interview",
  "legal_document",
  "product_demo",
  "other",
]);

export const ReferenceSchema = z
  .object({
    _meta: META_APPENDIX,
    title: z.string().min(1),
    type: ReferenceTypeSchema,
    url: z.string().url().optional(),
    note: ShortTextSchema.optional(),
  })
  .strict();
export type Reference = z.infer<typeof ReferenceSchema>;

export const AppendixSchema = z
  .object({
    _meta: META_APPENDIX,
    references: z.array(ReferenceSchema).default([]),
    notes: z.array(LongTextSchema).default([]),
    glossary: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type Appendix = z.infer<typeof AppendixSchema>;

/* =====================================================
 * 17. Root BusinessPlan
 * ===================================================== */

const ChangelogEntrySchema = z
  .object({
    version: z.string().min(1),
    date: ISODateSchema,
    changes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const BUSINESS_PLAN_SCHEMA_VERSION = "1.4.0" as const;

export const BusinessPlanSchema = z
  .object({
    _meta: META_ROOT,
    schemaVersion: z.literal(BUSINESS_PLAN_SCHEMA_VERSION),
    changelog: z.array(ChangelogEntrySchema).default([]),
    metadata: MetadataSchema,
    identity: BusinessIdentitySchema,
    executiveSummary: ExecutiveSummarySchema,
    problem: ProblemSchema,
    solution: SolutionSchema,
    marketAnalysis: MarketAnalysisSchema,
    businessModel: BusinessModelSchema,
    goToMarket: GoToMarketSchema,
    operations: OperationsSchema,
    team: TeamSchema,
    traction: TractionSchema.optional(),
    roadmap: RoadmapSchema.optional(),
    financialPlan: FinancialPlanSchema,
    risks: RiskRegistrySchema.default({
      _meta: META_RISKS_VALUE,
      risks: [],
    }),
    fundingAsk: FundingAskSchema.optional(),
    exitStrategy: ExitStrategySchema.optional(),
    appendix: AppendixSchema.optional(),
  })
  .strict();
export type BusinessPlan = z.infer<typeof BusinessPlanSchema>;

/* =====================================================
 * 18. Cross-cutting invariants (Refined)
 *
 * Structural shape lives on `BusinessPlanSchema`. Cross-axis rules
 * the JSON Schema cannot express (referential integrity, arithmetic
 * tolerances, presence-coupling on `Confidence`) live here. The
 * refinement deliberately runs only at the root so the structural
 * schema stays bridge-clean.
 * ===================================================== */

const NUMERIC_RATIO_TOLERANCE = 0.01;
const PAYBACK_TOLERANCE_MONTHS = 1;

function approxEq(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function isoLessOrEqual(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a <= b;
}

function checkMoneyRange(
  m: MoneyRange | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (!m) return;
  if (m.min.currency !== m.max.currency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `MoneyRange currency mismatch: min=${m.min.currency} max=${m.max.currency}.`,
      path,
    });
  }
  if (m.min.amount > m.max.amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `MoneyRange.min.amount (${m.min.amount}) > max.amount (${m.max.amount}).`,
      path,
    });
  }
}

function checkRange(
  r: Range | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (!r) return;
  if (r.min > r.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Range.min (${r.min}) > Range.max (${r.max}).`,
      path,
    });
  }
}

function checkTimeHorizon(
  t: TimeHorizon | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (!t) return;
  if (!isoLessOrEqual(t.startDate, t.endDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `TimeHorizon.startDate (${t.startDate}) > endDate (${t.endDate}).`,
      path,
    });
  }
}

export const RefinedBusinessPlanSchema = BusinessPlanSchema.superRefine(
  (deck: BusinessPlan, ctx: z.RefinementCtx) => {
    // Confidence presence-coupling is now enforced inside ConfidenceSchema
    // itself, so every annotation site (covered or not) gets the rule for
    // free. Don't reintroduce a per-site walk here.

    /* ── 1. MoneyRange / Range / TimeHorizon invariants ── */
    deck.marketAnalysis.customerSegments.forEach((s, i) => {
      // willingnessToPay was z.union([Money, MoneyRange]).optional(); now
      // split into two optional fields (XOR-refined on the entity itself).
      // Only the range form carries min/max ordering.
      if (s.willingnessToPayRange) {
        checkMoneyRange(
          s.willingnessToPayRange,
          ["marketAnalysis", "customerSegments", i, "willingnessToPayRange"],
          ctx,
        );
      }
    });
    deck.businessModel.revenueStreams.forEach((rs, i) => {
      // pricePoint was z.union([Money, Range]).optional(); now split into
      // pricePointMoney + pricePointRange (XOR-refined on the entity).
      // Only the range form carries min/max ordering.
      if (rs.pricePointRange) {
        checkRange(
          rs.pricePointRange,
          ["businessModel", "revenueStreams", i, "pricePointRange"],
          ctx,
        );
      }
    });
    if (deck.financialPlan.breakEvenPoint) {
      checkTimeHorizon(
        deck.financialPlan.breakEvenPoint,
        ["financialPlan", "breakEvenPoint"],
        ctx,
      );
    }
    if (deck.exitStrategy?.targetTimeline) {
      checkTimeHorizon(
        deck.exitStrategy.targetTimeline,
        ["exitStrategy", "targetTimeline"],
        ctx,
      );
    }

    /* ── 2. MarketSizing ordering: som ≤ sam ≤ tam (when same currency) ── */
    const sizing = deck.marketAnalysis.marketSizing;
    if (sizing) {
      const tam = sizing.tam?.value;
      const sam = sizing.sam?.value;
      const som = sizing.som?.value;
      if (sam && tam && sam.currency === tam.currency && sam.amount > tam.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `MarketSizing.sam (${sam.amount}) > tam (${tam.amount}).`,
          path: ["marketAnalysis", "marketSizing", "sam"],
        });
      }
      if (som && sam && som.currency === sam.currency && som.amount > sam.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `MarketSizing.som (${som.amount}) > sam (${sam.amount}).`,
          path: ["marketAnalysis", "marketSizing", "som"],
        });
      }
      if (som && tam && som.currency === tam.currency && som.amount > tam.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `MarketSizing.som (${som.amount}) > tam (${tam.amount}).`,
          path: ["marketAnalysis", "marketSizing", "som"],
        });
      }
    }

    /* ── 3. Risk arithmetic: riskScore ≈ likelihoodScore × impactScore ── */
    deck.risks.risks.forEach((r, i) => {
      if (
        r.riskScore !== undefined &&
        r.likelihoodScore !== undefined &&
        r.impactScore !== undefined
      ) {
        const expected = r.likelihoodScore * r.impactScore;
        if (!approxEq(r.riskScore, expected, NUMERIC_RATIO_TOLERANCE)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Risk[${r.id}].riskScore (${r.riskScore}) ≉ likelihoodScore × impactScore (${expected.toFixed(4)}); tolerance ±${NUMERIC_RATIO_TOLERANCE}.`,
            path: ["risks", "risks", i, "riskScore"],
          });
        }
      }
    });

    /* ── 4. UnitEconomics arithmetic ── */
    function checkUnitEconomicsBlock(
      cac: AnnotatedMoney | undefined,
      ltv: AnnotatedMoney | undefined,
      ratio: number | undefined,
      payback: number | undefined,
      marginPct: number | undefined,
      monthlyContrib: AnnotatedMoney | undefined,
      basePath: (string | number)[],
    ): void {
      // ltvCacRatio ≈ ltv / cac
      if (
        ratio !== undefined &&
        cac &&
        ltv &&
        cac.value.currency === ltv.value.currency &&
        cac.value.amount !== 0
      ) {
        const expected = ltv.value.amount / cac.value.amount;
        if (!approxEq(ratio, expected, NUMERIC_RATIO_TOLERANCE)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `UnitEconomics.ltvCacRatio (${ratio}) ≉ ltv/cac (${expected.toFixed(4)}); tolerance ±${NUMERIC_RATIO_TOLERANCE}.`,
            path: [...basePath, "ltvCacRatio"],
          });
        }
      }
      // paybackPeriodMonths ≈ cac / monthly contribution margin (±1 month).
      // Only enforced when both cac and an explicit monthly contribution
      // amount are present. Deriving monthly contribution from ltv +
      // marginPct is intentionally not attempted — the source schema does
      // not assert ltv's time horizon, so any derivation would smuggle in
      // an unstated assumption.
      void marginPct;
      void ltv;
      if (payback !== undefined && cac && monthlyContrib) {
        const monthly = monthlyContrib.value.amount;
        if (monthly > 0) {
          const expected = cac.value.amount / monthly;
          if (!approxEq(payback, expected, PAYBACK_TOLERANCE_MONTHS)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `UnitEconomics.paybackPeriodMonths (${payback}) ≉ cac / monthly contribution (${expected.toFixed(2)}); tolerance ±${PAYBACK_TOLERANCE_MONTHS} month.`,
              path: [...basePath, "paybackPeriodMonths"],
            });
          }
        }
      }
    }
    const ue = deck.businessModel.unitEconomics;
    if (ue) {
      checkUnitEconomicsBlock(
        ue.cac,
        ue.ltv,
        ue.ltvCacRatio,
        ue.paybackPeriodMonths,
        ue.contributionMarginPercent,
        ue.contributionMargin,
        ["businessModel", "unitEconomics"],
      );
      ue.perSegment.forEach((s, i) => {
        checkUnitEconomicsBlock(
          s.cac,
          s.ltv,
          s.ltvCacRatio,
          s.paybackPeriodMonths,
          s.contributionMarginPercent,
          s.contributionMargin,
          ["businessModel", "unitEconomics", "perSegment", i],
        );
      });
    }

    /* ── 5. FinancialMetricProjection: grossProfit ≈ revenue − cogs ── */
    deck.financialPlan.projections.forEach((p, i) => {
      if (
        p.grossProfit !== undefined &&
        p.revenue !== undefined &&
        p.cogs !== undefined
      ) {
        const expected = p.revenue - p.cogs;
        if (!approxEq(p.grossProfit, expected, NUMERIC_RATIO_TOLERANCE)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `FinancialPlan.projections[${i}].grossProfit (${p.grossProfit}) ≉ revenue − cogs (${expected}); tolerance ±${NUMERIC_RATIO_TOLERANCE}.`,
            path: ["financialPlan", "projections", i, "grossProfit"],
          });
        }
      }
    });

    /* ── 6. Referential integrity ──
     * 6a. FinancialMetricProjection.assumptionIds /
     *     variedAssumptionIds ⊆ financialPlan.assumptions[*].id.
     * 6b. UnitEconomics.perSegment[].segmentId ⊆
     *     marketAnalysis.customerSegments[*].id.
     * 6c. Milestone.dependsOn ⊆ all known milestone IDs (roadmap +
     *     traction.milestonesAchieved).
     */
    const knownAssumptionIds = new Set(
      deck.financialPlan.assumptions.map((a) => a.id),
    );
    deck.financialPlan.projections.forEach((p, i) => {
      p.assumptionIds.forEach((id, j) => {
        if (!knownAssumptionIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `FinancialPlan.projections[${i}].assumptionIds[${j}] = "${id}" not found in financialPlan.assumptions.`,
            path: ["financialPlan", "projections", i, "assumptionIds", j],
          });
        }
      });
      p.variedAssumptionIds.forEach((id, j) => {
        if (!knownAssumptionIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `FinancialPlan.projections[${i}].variedAssumptionIds[${j}] = "${id}" not found in financialPlan.assumptions.`,
            path: ["financialPlan", "projections", i, "variedAssumptionIds", j],
          });
        }
      });
    });

    const knownSegmentIds = new Set(
      deck.marketAnalysis.customerSegments.map((s) => s.id),
    );
    if (ue) {
      ue.perSegment.forEach((s, i) => {
        if (!knownSegmentIds.has(s.segmentId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `UnitEconomics.perSegment[${i}].segmentId = "${s.segmentId}" not found in marketAnalysis.customerSegments.`,
            path: ["businessModel", "unitEconomics", "perSegment", i, "segmentId"],
          });
        }
      });
    }

    const knownMilestoneIds = new Set<string>();
    deck.roadmap?.upcomingMilestones.forEach((m) => knownMilestoneIds.add(m.id));
    deck.traction?.milestonesAchieved.forEach((m) =>
      knownMilestoneIds.add(m.id),
    );
    deck.roadmap?.upcomingMilestones.forEach((m, i) => {
      m.dependsOn.forEach((dep, j) => {
        if (!knownMilestoneIds.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Roadmap.upcomingMilestones[${i}].dependsOn[${j}] = "${dep}" not a known milestone id.`,
            path: ["roadmap", "upcomingMilestones", i, "dependsOn", j],
          });
        }
      });
    });
    deck.traction?.milestonesAchieved.forEach((m, i) => {
      m.dependsOn.forEach((dep, j) => {
        if (!knownMilestoneIds.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Traction.milestonesAchieved[${i}].dependsOn[${j}] = "${dep}" not a known milestone id.`,
            path: ["traction", "milestonesAchieved", i, "dependsOn", j],
          });
        }
      });
    });
  },
);
export type RefinedBusinessPlan = z.infer<typeof RefinedBusinessPlanSchema>;

/* =====================================================
 * 19. FDPM bridge entry point
 *
 * The bridge accepts a flat `Record<TypeName, ZodObject>` map and emits
 * a `DomainProfile` whose primitive types align 1:1 with these names.
 * Re-exporting this map lets a downstream plugin call:
 *
 *   import { Schemas } from "../static/schemas/business-plan";
 *   const profile = assembleDomainProfile(Schemas, { ... });
 *
 * Only types exposed as workbook primitives are listed; structural
 * sub-shapes that always live inline (changelog entry, evidence item,
 * unit-economics segment row, RiskRegistry wrapper) are intentionally
 * omitted.
 * ===================================================== */

export const Schemas = {
  // Primitives & annotations
  Money: MoneySchema,
  MoneyRange: MoneyRangeSchema,
  AnnotatedMoney: AnnotatedMoneySchema,
  Range: RangeSchema,
  TimeHorizon: TimeHorizonSchema,
  Assumption: AssumptionSchema,
  KPIValue: KPIValueSchema,
  Person: PersonSchema,
  // Identity
  Metadata: MetadataSchema,
  BusinessIdentity: BusinessIdentitySchema,
  ExecutiveSummary: ExecutiveSummarySchema,
  // Problem / Solution
  Problem: ProblemSchema,
  SolutionFeature: SolutionFeatureSchema,
  IPAsset: IPAssetSchema,
  IntellectualProperty: IntellectualPropertySchema,
  ValueProposition: ValuePropositionSchema,
  Solution: SolutionSchema,
  // Market
  CustomerSegment: CustomerSegmentSchema,
  MarketSizing: MarketSizingSchema,
  MarketTrend: MarketTrendSchema,
  Competitor: CompetitorSchema,
  CompetitiveAdvantage: CompetitiveAdvantageSchema,
  MarketAnalysis: MarketAnalysisSchema,
  // Business model
  Pricing: PricingSchema,
  RevenueStream: RevenueStreamSchema,
  CostItem: CostItemSchema,
  UnitEconomics: UnitEconomicsSchema,
  BusinessModel: BusinessModelSchema,
  // GTM
  Channel: ChannelSchema,
  MarketingPlan: MarketingPlanSchema,
  SalesProcessStep: SalesProcessStepSchema,
  SalesPlan: SalesPlanSchema,
  RetentionPlan: RetentionPlanSchema,
  GoToMarket: GoToMarketSchema,
  // Operations
  Process: ProcessSchema,
  Technology: TechnologySchema,
  HiringPlanItem: HiringPlanItemSchema,
  ComplianceFramework: ComplianceFrameworkSchema,
  Operations: OperationsSchema,
  // Team
  Advisor: AdvisorSchema,
  Team: TeamSchema,
  // Milestones
  Milestone: MilestoneSchema,
  Roadmap: RoadmapSchema,
  Traction: TractionSchema,
  // Financials
  FinancialMetricProjection: FinancialMetricProjectionSchema,
  FundingRound: FundingRoundSchema,
  UseOfFundsItem: UseOfFundsItemSchema,
  FinancialPlan: FinancialPlanSchema,
  FundingAsk: FundingAskSchema,
  // Risks
  Risk: RiskSchema,
  // Exit
  PotentialAcquirer: PotentialAcquirerSchema,
  ComparableTransaction: ComparableTransactionSchema,
  ExitStrategy: ExitStrategySchema,
  // Appendix
  Reference: ReferenceSchema,
  Appendix: AppendixSchema,
  // Root (kept last; bridge users typically register entities, not the root)
  BusinessPlan: BusinessPlanSchema,
} as const;
export type SchemasMap = typeof Schemas;
