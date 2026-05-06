import { z } from "zod";

/**
 * BUSINESS DECK SCHEMA
 *
 * A schema for planning business / strategic-communication decks:
 * pitch decks, exec updates, board reviews, investment cases,
 * decision memos, internal proposals, regulatory briefings,
 * customer business reviews.
 *
 * Scope is deliberately *business / strategy* — not "universal".
 * The vocabulary (executive, investor, regulatory; logos / risk /
 * opportunity / tradeoff / provocation; approval / funding /
 * strategic_commitment) is drawn from boardroom rhetoric and
 * does not cleanly fit teaching, scientific, or artistic decks.
 * Use a different schema for those, or extend this one with a
 * domain-extension mechanism.
 *
 * It models:
 *  - audience transformation
 *  - objective
 *  - message strategy (with claims as first-class entities)
 *  - persuasion strategy
 *  - information architecture
 *  - evidence, risk, options, decisions
 *  - slide-by-slide structure
 *  - visual artifacts
 *  - rhetorical and logical constraints (data-driven)
 *  - referential integrity across all ID-bearing entities
 *  - validation reports (as output of validateBusinessDeck)
 *
 * Two layers:
 *  - BusinessDeckSchema: structural shape only.
 *  - RefinedBusinessDeckSchema: structural shape + must-level
 *    invariants (referential integrity, uniqueness, hard rules
 *    from the constraint catalog).
 *  - validateBusinessDeck(deck): runs the *full* constraint
 *    catalog at every severity and returns a ValidationReport.
 *
 * ─── Validation architecture (three layers, by intent) ───
 *
 * The validator is split into three architectural layers, each with
 * a distinct purpose. Adding a new check should consciously land in
 * the right layer; the layers are NOT interchangeable.
 *
 *  1. DECLARATIVE CONSTRAINT CATALOG (`BuiltInBusinessConstraints`,
 *     `evaluateConstraints`, `DeckConstraintSchema`):
 *       General rhetorical and deck-level rules expressed as
 *       data: condition → requirement. Audience attitude, intent,
 *       narrative pattern, persuasion strategy type. Easy to add,
 *       easy to inspect, easy to disable.
 *
 *  2. IMPERATIVE HARD VALIDATORS (`checkReferentialIntegrity`,
 *     `checkUniqueness`, `checkPostureAndDelivery`,
 *     `findAntiEnvelopeWarnings`):
 *       Structural gates and cross-axis invariants the DSL cannot
 *       express. Referential integrity, uniqueness, posture/
 *       delivery coupling, case-layer integrity, audience-response
 *       anti-envelope reasoning. These are deliberately code, not
 *       data, because they reach across multiple substructures
 *       simultaneously.
 *
 *  3. SOFT-WARNING BUILDERS (`buildSoftWarnings`,
 *     `buildCaseSolidity`, `buildClaimProvenance`,
 *     `deriveCaseFeatures`):
 *       Quality signals emitted only by `validateBusinessDeck()`,
 *       never blocking parse. Audience-response plausibility,
 *       orphan assets, duration mismatch, claim coverage,
 *       case-solidity grade, derived case features.
 *
 * Rule of thumb: if a violation should reject the deck → layer 1
 * (if expressible in DSL) or layer 2 (otherwise). If the deck is
 * still usable but you want the author to see a signal → layer 3.
 */

/* =====================================================
 * 1. Shared primitives
 * ===================================================== */

export const SeveritySchema = z.enum([
  "must",
  "should",
  "nice_to_have",
]);

export const ConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export const ImportanceSchema = z.enum([
  "primary",
  "secondary",
  "supporting",
  "background",
]);

export const KnowledgeLevelSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "expert",
]);

export const ComplexityToleranceSchema = z.enum([
  "low",
  "medium",
  "high",
]);

// Declared early (section 1) because ConstraintConditionSchema (section 14)
// references them. Their semantics — and the planning layers they gate —
// are documented in section 16.7.
export const PresentationPostureSchema = z.enum([
  "case",
  "briefing",
  "story",
  "workshop",
]);
export type PresentationPosture = z.infer<typeof PresentationPostureSchema>;

export const DeliveryModeSchema = z.enum([
  "presented_live",
  "shared_async",
  "hybrid",
]);
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;

/* =====================================================
 * 1.5. Branded ID types
 *
 * String IDs across the schema are branded so the TypeScript
 * compiler can catch cross-reference mistakes — e.g. passing a
 * RiskId where an EvidenceId is expected. Branding applies to the
 * *output* of parsing; raw input data (test fixtures, JSON
 * deserialization) remains plain string and is unaffected.
 *
 * Coverage: every ID that is cross-referenced from elsewhere in
 * the schema (ClaimId, EvidenceId, RiskId, OptionId, EntityId,
 * VisualArtifactId, ObjectionId, PersuasionStrategyId), plus
 * PresenterId and ExpectedQuestionId for symmetry. Internal-only
 * IDs (LayerSchema.id, QualityRuleSchema.id,
 * RequiredVisualElementSchema.id, StrategyConstraintSchema.id,
 * DeckConstraintSchema.id) remain plain z.string() because they
 * are not cross-referenced.
 *
 * For seed literals (BuiltInPersuasionStrategies etc.) use
 * z.input<typeof Schema> rather than z.infer<typeof Schema> so
 * plain string literals can satisfy the type.
 * ===================================================== */

export const ClaimIdSchema = z.string().brand<"ClaimId">();
export type ClaimId = z.infer<typeof ClaimIdSchema>;

export const EvidenceIdSchema = z.string().brand<"EvidenceId">();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

export const RiskIdSchema = z.string().brand<"RiskId">();
export type RiskId = z.infer<typeof RiskIdSchema>;

export const OptionIdSchema = z.string().brand<"OptionId">();
export type OptionId = z.infer<typeof OptionIdSchema>;

export const EntityIdSchema = z.string().brand<"EntityId">();
export type EntityId = z.infer<typeof EntityIdSchema>;

export const VisualArtifactIdSchema = z
  .string()
  .brand<"VisualArtifactId">();
export type VisualArtifactId = z.infer<typeof VisualArtifactIdSchema>;

export const ObjectionIdSchema = z.string().brand<"ObjectionId">();
export type ObjectionId = z.infer<typeof ObjectionIdSchema>;

export const PersuasionStrategyIdSchema = z
  .string()
  .brand<"PersuasionStrategyId">();
export type PersuasionStrategyId = z.infer<
  typeof PersuasionStrategyIdSchema
>;

export const PresenterIdSchema = z.string().brand<"PresenterId">();
export type PresenterId = z.infer<typeof PresenterIdSchema>;

export const ExpectedQuestionIdSchema = z
  .string()
  .brand<"ExpectedQuestionId">();
export type ExpectedQuestionId = z.infer<typeof ExpectedQuestionIdSchema>;

export const SegmentIdSchema = z.string().brand<"SegmentId">();
export type SegmentId = z.infer<typeof SegmentIdSchema>;

// Sales-context branded ID. PainPointSchema records use IDs because
// CapabilityMappingSchema cross-references them.
export const PainPointIdSchema = z.string().brand<"PainPointId">();
export type PainPointId = z.infer<typeof PainPointIdSchema>;

/* =====================================================
 * 1.6. Sales-context shared enums
 *
 * Sales presentations layer additional semantics on top of the base
 * business-deck schema. The enums live here (early) so AudienceSegment
 * and Option can reference them in their own sections without forward
 * references. The full sales-context schemas (PainPoint, Capability
 * mapping, Commercial model, Account context) live in section 16.8.
 *
 * These are *additions*, not replacements — a deck that doesn't
 * declare sales-context fields parses cleanly. Sales-specific
 * referential integrity only fires when the sales fields are present.
 * ===================================================== */

export const BuyerRoleSchema = z.enum([
  "economic_buyer",
  "technical_buyer",
  "champion",
  "user_buyer",
  "procurement",
  "legal",
  "security",
  "executive_sponsor",
  "blocker",
  "influencer",
]);
export type BuyerRole = z.infer<typeof BuyerRoleSchema>;

export const BuyerJourneyStageSchema = z.enum([
  "discovery",
  "qualification",
  "solution_pitch",
  "business_case",
  "technical_validation",
  "procurement",
  "renewal",
  "expansion",
]);
export type BuyerJourneyStage = z.infer<typeof BuyerJourneyStageSchema>;

// Discriminator for OptionSchema. When deck.decision_frame.options
// model competitive alternatives in a sales context, this records
// what *kind* of alternative each is — status quo, direct competitor,
// internal build, etc. Optional; not all decision frames are
// competitive comparisons.
export const OptionKindSchema = z.enum([
  "recommended",
  "rejected",
  "fallback",
  "status_quo",
  "direct_competitor",
  "internal_build",
  "manual_process",
  "do_nothing",
  "adjacent_solution",
]);
export type OptionKind = z.infer<typeof OptionKindSchema>;

export const PainSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

/* =====================================================
 * 2. Objective
 * ===================================================== */

export const DeckIntentSchema = z.enum([
  "inform",
  "explain",
  "persuade",
  "align",
  "teach",
  "compare",
  "decide",
  "warn",
  "inspire",
  "provoke",
  "summarize",
  "mobilize",
]);

export const DesiredOutcomeSchema = z.enum([
  "understanding",
  "approval",
  "decision",
  "funding",
  "alignment",
  "behavior_change",
  "strategic_commitment",
  "risk_awareness",
  "next_step_authorization",
  "rejection_or_elimination",
]);

export const ObjectiveSchema = z.object({
  primary_intent: DeckIntentSchema,
  secondary_intents: z.array(DeckIntentSchema).default([]),
  desired_audience_shift: z.object({
    from: z.string(),
    to: z.string(),
  }),
  desired_outcome: DesiredOutcomeSchema,
  decision_or_action_requested: z.string().optional(),
  success_definition: z.string(),
});

/* =====================================================
 * 3. Audience  (objections promoted to first-class entities)
 * ===================================================== */

// AudienceTypeSchema describes the audience's *role*. Expertise is
// modeled separately via KnowledgeLevelSchema (audience.prior_knowledge).
// Earlier drafts mixed roles with expertise (`expert`, `non_expert`) —
// removed in this revision because the two ontologies don't compose
// (a "regulatory expert" was unrepresentable). `mixed` is retained as
// a meta-value for genuinely heterogeneous rooms.
export const AudienceTypeSchema = z.enum([
  "executive",
  "technical",
  "business",
  "mixed",
  "regulatory",
  "customer",
  "investor",
  "internal_team",
  "public",
]);

export const AudienceAttitudeSchema = z.enum([
  "supportive",
  "neutral",
  "curious",
  "skeptical",
  "hostile",
  "uninformed",
  "divided",
]);

export const ObjectionSchema = z.object({
  id: ObjectionIdSchema,
  text: z.string(),
  severity: SeveritySchema.default("should"),
  // Branded reference to audience.segments[].id. Renamed from
  // `source_segment_id` (free string) in this revision; the
  // audience-response and rebuttal-coherence checks rely on this
  // resolving correctly, and a typo on a free string was silently
  // breaking those joins. Integrity check enforces resolution.
  source_segment_id: SegmentIdSchema.optional(),
  counter_argument: z.string().optional(),
});

/* ---------------------------------------------------------------
 * Expected audience response (per segment, per slide)
 *
 * Models what the deck-author predicts the audience will *feel* and
 * *do* on a given slide. Optional — slides without predictions parse
 * cleanly. When present, integrity and coherence checks fire:
 *
 *   Hard (parse-time):
 *     - segment_id must resolve to audience.segments[].id
 *
 *   Soft (validateBusinessDeck warnings):
 *     - decision-role slides must include decision-class reactions
 *       for at least one final_decision_maker / approver segment
 *     - objection-addressing slides must not predict
 *       hostility/resistance for the source_segment_id
 *       (a working rebuttal is supposed to *reduce* resistance)
 *     - decks asking for a decision must have at least one segment
 *       reaching a decision-class reaction by the deck's end
 *
 * The enums are intentionally compact. Bigger taxonomies ("delight",
 * "awe", "indignation") add more annotation friction than analytic
 * leverage in business-deck contexts.
 * --------------------------------------------------------------- */

export const ExpectedEmotionSchema = z.enum([
  // Engagement (positive)
  "curiosity",
  "interest",
  "validation",
  "relief",
  "trust",
  // Engagement (negative)
  "discomfort",
  "boredom",
  "confusion",
  // Reception (positive)
  "agreement",
  // Reception (negative)
  "skepticism",
  "resistance",
  "hostility",
  // Affective
  "alarm",
  "surprise",
]);
export type ExpectedEmotion = z.infer<typeof ExpectedEmotionSchema>;

export const ExpectedReactionSchema = z.enum([
  // Cognitive
  "take_notes",
  "ask_clarifying_question",
  "ask_challenging_question",
  "push_back",
  "drop_objection",
  "accept_framing",
  "request_more_info",
  // Body language
  "lean_in",
  "lean_back",
  "nod",
  "interrupt",
  // Decision-class
  "approve",
  "defer",
  "commit",
  "abstain",
  "reject",
]);
export type ExpectedReaction = z.infer<typeof ExpectedReactionSchema>;

// Reactions that count as taking a position on the decision ask.
// Used by the soft coherence checks (decision slides should evoke at
// least one of these, and the deck's terminal slide should evoke at
// least one for a final-decision-maker segment).
// Block 1 #2 — split decision reactions into outcome vs engagement.
//
// DECISION_OUTCOME_REACTIONS — the audience has actually *taken*
// a position on the decision ask: approved, deferred (with intent
// to decide later), committed, abstained, or rejected. These are
// the reactions a decision-asking deck must elicit.
//
// DECISION_ENGAGEMENT_REACTIONS — the audience is *engaged with*
// the decision but hasn't taken a position. They want more
// information, want to challenge, or want clarification.
// Decision-blocking, not decision-taking. A slide that produces
// only these has *engaged* the room without *closing* it.
//
// DECISION_CLASS_REACTIONS — preserved as the union of both, for
// backward compatibility with code that just wants "any reaction
// related to deciding". W8/W10/decision-coverage rules now use
// DECISION_OUTCOME_REACTIONS specifically.
export const DECISION_OUTCOME_REACTIONS: ReadonlySet<ExpectedReaction> =
  new Set(["approve", "defer", "commit", "abstain", "reject"]);

export const DECISION_ENGAGEMENT_REACTIONS: ReadonlySet<ExpectedReaction> =
  new Set([
    "request_more_info",
    "ask_challenging_question",
    "ask_clarifying_question",
  ]);

export const DECISION_CLASS_REACTIONS: ReadonlySet<ExpectedReaction> = new Set([
  ...DECISION_OUTCOME_REACTIONS,
  ...DECISION_ENGAGEMENT_REACTIONS,
]);

// Reactions that count as the deck *failing* on a hostile segment —
// the rebuttal didn't land.
export const HOSTILE_RESIDUAL_EMOTIONS: ReadonlySet<ExpectedEmotion> = new Set([
  "hostility",
  "resistance",
]);

export const AudienceResponseSchema = z.object({
  // The segment whose response is being predicted. Resolved against
  // deck.audience.segments[].id by checkReferentialIntegrity.
  segment_id: SegmentIdSchema,
  expected_emotion: ExpectedEmotionSchema,
  // Optional secondary emotion (real audiences feel several at once).
  secondary_emotion: ExpectedEmotionSchema.optional(),
  expected_reactions: z.array(ExpectedReactionSchema).default([]),
  // Free-text plan if the observed reaction diverges. Useful when the
  // deck is rehearsed against a stand-in audience or live-piloted.
  if_off_target: z.string().optional(),
  // How confident the planner is in this prediction. Drives soft
  // warnings: "low"-confidence predictions don't fire coherence
  // mismatches, since the planner has already flagged uncertainty.
  confidence: ConfidenceSchema.default("medium"),
});
export type AudienceResponse = z.infer<typeof AudienceResponseSchema>;

export const AudienceSegmentSchema = z.object({
  id: SegmentIdSchema,
  // Human-readable label, e.g. "CFO", "Engineering Lead", "Board Member".
  label: z.string(),
  audience_type: AudienceTypeSchema,
  prior_knowledge: KnowledgeLevelSchema,
  attitude: AudienceAttitudeSchema,
  complexity_tolerance: ComplexityToleranceSchema,
  decision_power: z.enum([
    "none",
    "influencer",
    "recommender",
    "approver",
    "final_decision_maker",
  ]),
  what_they_need_to_believe: z.array(z.string()).default([]),

  // Sales-context optional extensions. When the deck targets a sales
  // presentation, segments often map to identifiable buyer roles
  // (champion, economic buyer, technical buyer, etc.) and carry
  // role-specific priorities, fears, and success criteria. These
  // fields extend AudienceSegmentSchema rather than introducing a
  // parallel "buyer persona" hierarchy on the same SegmentId brand.
  buyer_role: BuyerRoleSchema.optional(),
  priorities: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  success_criteria: z.array(z.string()).default([]),

  // S6 (Pass 5) — Jobs to be Done framing. Optional explicit
  // categorization of what this segment "hires" the deck to do.
  // Functional jobs: information / decisions to extract.
  // Emotional jobs: how the segment wants to feel afterward.
  // Social jobs: how the segment wants to be perceived by peers
  //   for accepting (or rejecting) the deck's proposal.
  // Partial overlap with priorities/fears/success_criteria is
  // expected; the JTBD framing is more analytically useful when
  // designing slide-by-slide audience-response predictions.
  functional_jobs: z.array(z.string()).default([]),
  emotional_jobs: z.array(z.string()).default([]),
  social_jobs: z.array(z.string()).default([]),
});

export const AudienceSchema = z.object({
  primary_audience: z.string(),
  audience_type: AudienceTypeSchema,
  prior_knowledge: KnowledgeLevelSchema,
  attitude: AudienceAttitudeSchema,
  complexity_tolerance: ComplexityToleranceSchema,
  concerns: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  // Promoted from string[] to Objection[] so each objection has
  // identity (used by SlideSchema.addresses_objection_ids), severity,
  // and an optional counter-argument.
  likely_objections: z.array(ObjectionSchema).default([]),
  decision_power: z.enum([
    "none",
    "influencer",
    "recommender",
    "approver",
    "final_decision_maker",
  ]),
  what_they_need_to_believe: z.array(z.string()).default([]),
  // Named sub-audiences. IDs are cross-referenced by
  // DeckVariant.segment_ids and SlideVariant.segment_id.
  segments: z.array(AudienceSegmentSchema).default([]),
});

/* =====================================================
 * 4. Message strategy  (claims promoted to first-class entities)
 * ===================================================== */

export const FramingAngleSchema = z.enum([
  "opportunity",
  "risk",
  "cost",
  "efficiency",
  "innovation",
  "control",
  "quality",
  "growth",
  "urgency",
  "simplicity",
  "tradeoff",
  "transformation",
  "comparison",
  "exploration",
  "learning",
]);

export const ToneSchema = z.enum([
  "neutral",
  "analytical",
  "executive",
  "technical",
  "educational",
  "provocative",
  "visionary",
  "urgent",
  "cautious",
  "persuasive",
]);

export const ClaimKindSchema = z.enum([
  "core",
  "supporting",
  "sub",
  // S4 (Pass 5) — "action" kind. A claim that operates at the
  // recommendation layer rather than the architectural-pillar layer.
  // Excluded from Minto's rule-of-three counter for `supporting`
  // claims, which only counts peer architectural arguments. An
  // action claim still ladders up to the core claim via
  // parent_claim_id, but is structurally distinct from a peer.
  "action",
]);

export const ClaimSchema = z.object({
  id: ClaimIdSchema,
  kind: ClaimKindSchema,
  text: z.string(),
  // For "sub" claims, the supporting claim they buttress.
  // For "supporting" or "action" claims, optionally the core claim.
  parent_claim_id: ClaimIdSchema.optional(),

  // S2 (Pass 5) — Toulmin Modality / Qualifier. A linguistic
  // indicator of the claim's strength, probability, scope, or
  // condition. Examples: "highly likely", "in most enterprise
  // contexts", "subject to regulatory approval", "for fixed-function
  // workflows only". Optional but recommended for any non-tautological
  // claim. Honest claims carry visible qualifiers; sloppy claims
  // assert with implicit certainty the audience cannot evaluate.
  qualifier: z.string().optional(),
});

export const MessageStrategySchema = z.object({
  // Promoted from z.string() to Claim object; carries an ID so
  // slides and persuasion sequences can reference it.
  core_claim: ClaimSchema,
  supporting_claims: z.array(ClaimSchema).default([]),
  misconception_to_correct: z.string().optional(),
  framing_angle: FramingAngleSchema,
  tone: ToneSchema,
  non_goals: z.array(z.string()).default([]),
  thesis_pressure_test: z
    .object({
      strongest_counterargument: z.string(),
      response_strategy: z.string(),
    })
    .optional(),

  // S5 (Pass 5) — Duarte Sparkline "Star Moment". A single, engineered,
  // memorable beat the deck wants the audience to retain after the
  // meeting. Optional, but explicit when present: which slide carries
  // it, and the exact phrase or insight. Integrity check verifies
  // the slide_number resolves. Star moments anchor the closing arc's
  // callback_to_opening; without one, the closing has nothing to
  // echo back to.
  star_moment: z
    .object({
      slide_number: z.number().int().positive(),
      message: z.string(),
    })
    .optional(),
});

/* =====================================================
 * 5. Narrative model
 * ===================================================== */

export const NarrativePatternSchema = z.enum([
  "problem_solution",
  "before_after",
  "current_future",
  "question_answer",
  "claim_evidence_decision",
  "context_problem_proposal",
  "what_so_what_now_what",
  "tradeoff_analysis",
  "option_comparison",
  "system_explanation",
  "process_walkthrough",
  "case_for_change",
  "risk_assessment",
  "educational_progression",
  "provocation_resolution",
]);

export const NarrativeFunctionSchema = z.enum([
  "open",
  "context",
  "problem",
  "tension",
  "claim",
  "definition",
  "model",
  "mechanism",
  "evidence",
  "example",
  "comparison",
  "tradeoff",
  "risk",
  "objection",
  "implication",
  "option",
  "recommendation",
  "decision",
  "close",
  "appendix",
]);

export const NarrativeStepSchema = z.object({
  step: z.number().int().positive(),
  function: NarrativeFunctionSchema,
  message: z.string(),
  audience_question_answered: z.string().optional(),
});

export const NarrativeModelSchema = z.object({
  narrative_pattern: NarrativePatternSchema,
  progression: z.array(NarrativeStepSchema).min(1),
  pacing: z.enum([
    "fast",
    "balanced",
    "deliberate",
    "progressive_disclosure",
  ]),
  opening_strategy: z.enum([
    "direct_claim",
    "provocation",
    "problem_first",
    "data_first",
    "story_first",
    "definition_first",
    "contrast_first",
    "question_first",
  ]),
  closing_strategy: z.enum([
    "decision_ask",
    "summary",
    "call_to_action",
    "reflection",
    "recommendation",
    "next_steps",
  ]),
});

/* =====================================================
 * 6. Conceptual structure
 * ===================================================== */

export const MentalModelSchema = z.enum([
  "flow",
  "stack",
  "cycle",
  "loop",
  "timeline",
  "matrix",
  "map",
  "hierarchy",
  "network",
  "spectrum",
  "funnel",
  "comparison",
  "system",
  "portfolio",
  "journey",
  "decision_tree",
  "cause_effect",
]);

export const AbstractionLevelSchema = z.enum([
  "conceptual",
  "strategic",
  "operational",
  "technical",
  "implementation",
  "executive_summary",
]);

export const ConceptualStructureSchema = z.object({
  dominant_model: MentalModelSchema,
  secondary_models: z.array(MentalModelSchema).default([]),
  abstraction_level: AbstractionLevelSchema,
  central_question: z.string(),
  organizing_principle: z.string(),
  focal_point: z.string(),
  peripheral_elements: z.array(z.string()).default([]),
});

/* =====================================================
 * 7. Information architecture
 * ===================================================== */

export const EntityRoleSchema = z.enum([
  "actor",
  "object",
  "system",
  "process",
  "capability",
  "resource",
  "input",
  "output",
  "constraint",
  "dependency",
  "risk",
  "control",
  "metric",
  "evidence",
  "option",
  "decision",
  "environment",
  "principle",
  "assumption",
  "unknown",
]);

export const RelationshipTypeSchema = z.enum([
  "causes",
  "enables",
  "constrains",
  "depends_on",
  "transforms",
  "contains",
  "compares_to",
  "competes_with",
  "supports",
  "contradicts",
  "mitigates",
  "amplifies",
  "precedes",
  "follows",
  "feeds_back_into",
  "governs",
  "measures",
  "produces",
  "consumes",
  "influences",
]);

export const DirectionalitySchema = z.enum([
  "none",
  "one_way",
  "two_way",
  "recursive",
  "cross_cutting",
]);

export const EntitySchema = z.object({
  id: EntityIdSchema,
  label: z.string(),
  role: EntityRoleSchema,
  description: z.string().optional(),
  importance: ImportanceSchema,
  confidence: ConfidenceSchema.default("medium"),
});

export const RelationshipSchema = z.object({
  from: EntityIdSchema,
  to: EntityIdSchema,
  type: RelationshipTypeSchema,
  directionality: DirectionalitySchema,
  label: z.string().optional(),
  confidence: ConfidenceSchema.default("medium"),
});

export const LayerPurposeSchema = z.enum([
  "context",
  "problem",
  "actor_layer",
  "process_layer",
  "system_layer",
  "capability_layer",
  "evidence_layer",
  "risk_layer",
  "control_layer",
  "dependency_layer",
  "option_layer",
  "decision_layer",
  "outcome_layer",
]);

export const LayerSchema = z.object({
  id: z.string(),
  label: z.string(),
  purpose: LayerPurposeSchema,
  order: z.number().int().positive(),
  entities: z.array(EntityIdSchema),
  is_cross_cutting: z.boolean().default(false),
});

export const TradeoffSchema = z.object({
  dimension: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  implication: z.string(),
  importance: ImportanceSchema.default("secondary"),
});

export const InformationArchitectureSchema = z.object({
  entities: z.array(EntitySchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  layers: z.array(LayerSchema).default([]),
  key_tradeoffs: z.array(TradeoffSchema).default([]),
  unresolved_questions: z.array(z.string()).default([]),
});

/* =====================================================
 * 8. Evidence, risks, options, decisions
 * ===================================================== */

export const EvidenceTypeSchema = z.enum([
  "data",
  "example",
  "case_study",
  "expert_opinion",
  "benchmark",
  "financial_model",
  "technical_analysis",
  "user_research",
  "experiment",
  "logical_argument",
  "scenario_analysis",
  "risk_analysis",
  "comparison_matrix",
]);

export const EvidenceSchema = z.object({
  id: EvidenceIdSchema,
  // claims_supported: IDs of claims (core or supporting) this evidence
  // backs. Using an array allows one evidence item to support multiple
  // claims simultaneously (common for cross-cutting data points).
  // Branded as ClaimId[] for compile-time safety; runtime resolution
  // verified in checkReferentialIntegrity.
  claims_supported: z.array(ClaimIdSchema).min(1),
  evidence_type: EvidenceTypeSchema,
  summary: z.string(),
  source: z.string().optional(),
  // Default added for parity with EntitySchema.confidence, which
  // shares the same enum and similar role.
  strength: ConfidenceSchema.default("medium"),

  // S1 (Pass 5) — Toulmin Warrant. The implicit logical bridge from
  // grounds (this evidence) to the claim it supports. The claim/
  // evidence pair already exists in the schema; the warrant is the
  // sentence that says *why* the audience should accept that this
  // evidence proves the claim. Optional but strongly recommended for
  // any evidence with strength=medium under a "preponderance" or
  // higher burden — without an explicit warrant, the audience has to
  // construct the bridge themselves and may construct a different one.
  warrant: z.string().optional(),
});

/* =====================================================
 * 8.1. Claim provenance schemas
 *
 * ClaimCoverageSchema classifies how well each claim is backed by
 * evidence, based on the strength distribution of all evidence items
 * that reference it via claims_supported.
 *
 * ClaimProvenanceEntrySchema is the per-claim record produced by
 * buildClaimProvenance() (section 20.5) and surfaced in
 * ValidationReport.claim_provenance.
 * ===================================================== */

export const ClaimCoverageSchema = z.enum([
  "uncovered",  // no evidence item references this claim
  "weak",       // 1+ evidence items, but all have strength "low"
  "partial",    // at least one medium-strength item, none high
  "sufficient", // at least one high-strength item, or >=2 medium
]);
export type ClaimCoverage = z.infer<typeof ClaimCoverageSchema>;

export const ClaimProvenanceEntrySchema = z.object({
  claim_id: ClaimIdSchema,
  claim_text: z.string(),
  supporting_evidence_ids: z.array(EvidenceIdSchema),
  coverage: ClaimCoverageSchema,
});
export type ClaimProvenanceEntry = z.infer<typeof ClaimProvenanceEntrySchema>;

export const RiskSchema = z.object({
  id: RiskIdSchema,
  description: z.string(),
  likelihood: z.enum(["low", "medium", "high", "unknown"]),
  impact: z.enum(["low", "medium", "high", "unknown"]),
  mitigation: z.string().optional(),
  owner: z.string().optional(),
});

export const OptionSchema = z.object({
  id: OptionIdSchema,
  label: z.string(),
  description: z.string(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  // Risk IDs into the deck-level risks array.
  risk_ids: z.array(RiskIdSchema).default([]),
  decision_relevance: z.string(),

  // Sales-context optional extensions. Sales decks routinely model
  // competitive alternatives as Options; `kind` discriminates what
  // *type* of alternative each is. `differentiation_claim_ids` binds
  // an option (typically a competitor) to the claims that distinguish
  // the recommended path from it.
  kind: OptionKindSchema.optional(),
  differentiation_claim_ids: z.array(ClaimIdSchema).default([]),
});

export const RecommendationSchema = z.object({
  recommended_option_id: OptionIdSchema.optional(),
  recommendation: z.string(),
  rationale: z.string(),
  conditions: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
});

export const DecisionFrameSchema = z.object({
  decision_needed: z.boolean(),
  decision_question: z.string().optional(),
  options: z.array(OptionSchema).default([]),
  recommendation: RecommendationSchema.optional(),
  decision_criteria: z.array(z.string()).default([]),
});

/* =====================================================
 * 9. Persuasion strategy engine
 * ===================================================== */

export const PersuasionStrategyTypeSchema = z.enum([
  "logos_reasoning",
  "evidence_based",
  "risk_avoidance",
  "opportunity_capture",
  "cost_reduction",
  "urgency",
  "strategic_alignment",
  "contrast_before_after",
  "social_proof",
  "authority_based",
  "narrative_story",
  "tradeoff_transparency",
  "loss_aversion",
  "visionary_future",
  "pragmatic_feasibility",
  "moral_or_values_based",
  "provocation",
]);

export const RhetoricalMoveSchema = z.enum([
  "define_problem",
  "establish_stakes",
  "state_claim",
  "show_evidence",
  "show_mechanism",
  "compare_alternatives",
  "address_objections",
  "show_tradeoffs",
  "quantify_impact",
  "show_feasibility",
  "show_risk",
  "show_cost_of_inaction",
  "create_urgency",
  "connect_to_values",
  "show_precedent",
  "show_future_state",
  "make_decision_ask",
]);

export const StrategyConstraintSchema = z.object({
  id: z.string(),
  rule: z.string(),
  severity: SeveritySchema,
  validation_question: z.string(),
});

export const StrategyFailureModeSchema = z.object({
  failure_mode: z.string(),
  symptom: z.string(),
  correction: z.string(),
});

export const PersuasionStrategySchema = z.object({
  id: PersuasionStrategyIdSchema,
  strategy_type: PersuasionStrategyTypeSchema,
  purpose: z.string(),
  audience_fit: z.object({
    best_for: z.array(AudienceTypeSchema).default([]),
    works_when_audience_is: z.array(AudienceAttitudeSchema).default([]),
    risky_when_audience_is: z.array(AudienceAttitudeSchema).default([]),
    minimum_prior_knowledge: KnowledgeLevelSchema.optional(),
  }),
  required_rhetorical_moves: z.array(RhetoricalMoveSchema).default([]),
  required_evidence_types: z.array(EvidenceTypeSchema).default([]),
  constraints: z.array(StrategyConstraintSchema).default([]),
  failure_modes: z.array(StrategyFailureModeSchema).default([]),
});

export const PersuasionSequenceStepSchema = z.object({
  order: z.number().int().positive(),
  strategy_id: PersuasionStrategyIdSchema,
  rhetorical_move: RhetoricalMoveSchema,
  intended_effect_on_audience: z.string(),
  deck_section_or_slide_role: z.string(),
});

export const EthicalPersuasionConstraintSchema = z.object({
  rule: z.string(),
  rationale: z.string(),
});

export const PersuasionPlanSchema = z.object({
  primary_strategy: PersuasionStrategySchema,
  supporting_strategies: z.array(PersuasionStrategySchema).default([]),
  persuasion_sequence: z.array(PersuasionSequenceStepSchema).default([]),
  ethical_constraints: z
    .array(EthicalPersuasionConstraintSchema)
    .default([]),
});

/* =====================================================
 * 10. Built-in persuasion strategy catalog
 *     (validated through Zod at module load — see section 19)
 * ===================================================== */

const _builtInPersuasionStrategiesSeed: z.input<
  typeof PersuasionStrategySchema
>[] = [
  {
    id: "logos_reasoning",
    strategy_type: "logos_reasoning",
    purpose:
      "Persuade through explicit reasoning, premises, evidence, and inference.",
    audience_fit: {
      best_for: ["technical", "executive", "mixed"],
      works_when_audience_is: ["neutral", "curious", "skeptical"],
      risky_when_audience_is: ["hostile"],
      minimum_prior_knowledge: "medium",
    },
    required_rhetorical_moves: [
      "state_claim",
      "show_evidence",
      "show_mechanism",
      "address_objections",
      "make_decision_ask",
    ],
    required_evidence_types: [
      "logical_argument",
      "data",
      "technical_analysis",
    ],
    constraints: [
      {
        id: "logos_requires_inference_chain",
        rule:
          "The deck must make the reasoning path from evidence to conclusion explicit.",
        severity: "must",
        validation_question:
          "Can the audience see why the conclusion follows from the premises?",
      },
    ],
    failure_modes: [
      {
        failure_mode: "unsupported_assertion",
        symptom: "The deck states conclusions without showing why they follow.",
        correction: "Add premise-evidence-conclusion structure.",
      },
    ],
  },
  {
    id: "risk_avoidance",
    strategy_type: "risk_avoidance",
    purpose: "Persuade by showing downside, exposure, and cost of inaction.",
    audience_fit: {
      best_for: ["executive", "regulatory", "business"],
      works_when_audience_is: ["neutral", "skeptical", "divided"],
      risky_when_audience_is: ["supportive"],
      minimum_prior_knowledge: "low",
    },
    required_rhetorical_moves: [
      "define_problem",
      "establish_stakes",
      "show_risk",
      "quantify_impact",
      "show_cost_of_inaction",
      "make_decision_ask",
    ],
    required_evidence_types: [
      "risk_analysis",
      "scenario_analysis",
      "data",
      "case_study",
    ],
    constraints: [
      {
        id: "risk_requires_mitigation",
        rule: "A risk-based deck must include mitigation or decision options.",
        severity: "must",
        validation_question: "Does the deck offer a credible response to the risk?",
      },
      {
        id: "risk_requires_impact",
        rule: "A risk-based deck must explain impact, not just list threats.",
        severity: "must",
        validation_question:
          "Does the audience understand what happens if the risk materializes?",
      },
    ],
    failure_modes: [
      {
        failure_mode: "fear_without_action",
        symptom: "The deck creates anxiety but no decision path.",
        correction: "Add mitigation options and decision criteria.",
      },
    ],
  },
  {
    id: "opportunity_capture",
    strategy_type: "opportunity_capture",
    purpose:
      "Persuade by showing upside, timing, feasibility, and strategic advantage.",
    audience_fit: {
      best_for: ["executive", "investor", "business", "customer"],
      works_when_audience_is: ["supportive", "neutral", "curious"],
      risky_when_audience_is: ["hostile", "skeptical"],
      minimum_prior_knowledge: "low",
    },
    required_rhetorical_moves: [
      "establish_stakes",
      "show_future_state",
      "quantify_impact",
      "show_feasibility",
      "compare_alternatives",
      "make_decision_ask",
    ],
    required_evidence_types: [
      "financial_model",
      "benchmark",
      "case_study",
      "scenario_analysis",
    ],
    constraints: [
      {
        id: "opportunity_requires_capture_path",
        rule:
          "An opportunity deck must explain how value will actually be captured.",
        severity: "must",
        validation_question:
          "Does the deck show the path from opportunity to realized value?",
      },
    ],
    failure_modes: [
      {
        failure_mode: "vision_without_mechanism",
        symptom: "The upside is attractive but the execution path is vague.",
        correction:
          "Add operating model, milestones, feasibility proof, or next steps.",
      },
    ],
  },
  {
    id: "tradeoff_transparency",
    strategy_type: "tradeoff_transparency",
    purpose:
      "Build trust by showing gains, losses, constraints, and decision criteria openly.",
    audience_fit: {
      best_for: ["executive", "technical", "mixed"],
      works_when_audience_is: ["skeptical", "divided", "neutral"],
      risky_when_audience_is: ["uninformed"],
      minimum_prior_knowledge: "medium",
    },
    required_rhetorical_moves: [
      "compare_alternatives",
      "show_tradeoffs",
      "address_objections",
      "show_risk",
      "make_decision_ask",
    ],
    required_evidence_types: [
      "comparison_matrix",
      "technical_analysis",
      "financial_model",
      "risk_analysis",
    ],
    constraints: [
      {
        id: "tradeoff_requires_explicit_dimensions",
        rule: "A tradeoff deck must define the dimensions of comparison.",
        severity: "must",
        validation_question:
          "Are the options evaluated against explicit criteria?",
      },
    ],
    failure_modes: [
      {
        failure_mode: "false_balance",
        symptom: "All options appear equal because decision criteria are unclear.",
        correction: "Rank dimensions by importance and show implications.",
      },
    ],
  },
  {
    id: "provocation",
    strategy_type: "provocation",
    purpose:
      "Force reconsideration of hidden assumptions through an extreme or surprising argument.",
    audience_fit: {
      best_for: ["executive", "mixed"],
      works_when_audience_is: ["curious", "neutral", "divided"],
      risky_when_audience_is: ["hostile", "uninformed"],
      minimum_prior_knowledge: "medium",
    },
    required_rhetorical_moves: [
      "establish_stakes",
      "state_claim",
      "address_objections",
      "show_tradeoffs",
      "show_future_state",
      "make_decision_ask",
    ],
    required_evidence_types: [
      "logical_argument",
      "comparison_matrix",
      "scenario_analysis",
    ],
    constraints: [
      {
        id: "provocation_requires_resolution",
        rule:
          "A provocation must lead to a useful decision, insight, or reframing.",
        severity: "must",
        validation_question:
          "Does the deck resolve the provocation into something actionable?",
      },
    ],
    failure_modes: [
      {
        failure_mode: "rhetorical_theater",
        symptom:
          "The deck shocks the audience but does not help them decide or understand.",
        correction: "Add synthesis, implications, and next-step decision.",
      },
    ],
  },
];

/* =====================================================
 * 11. Slide plan
 * ===================================================== */

export const SlideRoleSchema = z.enum([
  "opening",
  "context",
  "problem",
  "definition",
  "claim",
  "model",
  "mechanism",
  "evidence",
  "example",
  "comparison",
  "tradeoff",
  "risk",
  "objection",
  "option",
  "recommendation",
  "decision",
  "closing",
  "appendix",
]);

export const ContentBlockTypeSchema = z.enum([
  "headline",
  "text",
  "diagram",
  "chart",
  "table",
  "matrix",
  "timeline",
  "flow",
  "callout",
  "quote",
  "example",
  "evidence",
  "risk",
  "recommendation",
  "decision",
  "summary",
]);

export const LayoutSchema = z.enum([
  "title_only",
  "single_message",
  "two_column",
  "three_column",
  "diagram_first",
  "text_plus_visual",
  "matrix",
  "timeline",
  "flow",
  "stack",
  "comparison",
  "cards",
  "dashboard",
  "progressive_build",
]);

export const ContentBlockSchema = z.object({
  type: ContentBlockTypeSchema,
  purpose: z.string(),
  content_summary: z.string(),
  visual_artifact_id: VisualArtifactIdSchema.optional(),
});

export const VisualHierarchyItemSchema = z.object({
  element: z.string(),
  priority: z.enum(["primary", "secondary", "tertiary"]),
});

export const SlideVisualStrategySchema = z.object({
  layout: LayoutSchema,
  density: z.enum(["low", "medium", "high"]),
  focal_point: z.string(),
  visual_hierarchy: z.array(VisualHierarchyItemSchema).default([]),
});

export const SlideSchema = z.object({
  slide_number: z.number().int().positive(),
  title: z.string(),
  role_in_deck: SlideRoleSchema,
  key_message: z.string(),
  audience_question_answered: z.string(),
  content_blocks: z.array(ContentBlockSchema).min(1),
  visual_strategy: SlideVisualStrategySchema,
  speaker_intent: z.string().optional(),
  // Renamed from supports_claims to make ID semantics explicit.
  supports_claim_ids: z.array(ClaimIdSchema).default([]),
  // Renamed from uses_evidence (still IDs, but now clearly named).
  uses_evidence_ids: z.array(EvidenceIdSchema).default([]),
  // Renamed from addresses_objections; objections are now first-class.
  addresses_objection_ids: z.array(ObjectionIdSchema).default([]),
  rhetorical_moves: z.array(RhetoricalMoveSchema).default([]),
  // Cross-link into NarrativeModel.progression by step number(s).
  // Promoted from a single optional `narrative_step` to an array,
  // because slides routinely span multiple narrative beats (e.g. an
  // opening slide that handles both step 1 ("frame the problem") and
  // step 2 ("name the stakes")). Empty array means the slide is not
  // narratively-anchored. Each element must resolve to a step in
  // narrative_model.progression (enforced by integrity check).
  narrative_steps: z.array(z.number().int().positive()).default([]),

  // Predicted audience emotions and reactions for this slide, keyed
  // by segment. Optional — slides without predictions parse cleanly.
  // When present, segment_id must resolve and three soft coherence
  // checks fire (see AudienceResponseSchema docs).
  expected_audience_responses: z.array(AudienceResponseSchema).default([]),
});

/* =====================================================
 * 11.5. Variants / audience-segment personalization
 *
 * A DeckVariant customises a subset of slides for one or more named
 * audience segments (declared in AudienceSchema.segments). Two kinds
 * of customisation are supported:
 *
 *   SlideVariant — overrides the key_message, content_blocks, or
 *   speaker_intent of an existing base slide, or marks it as skipped
 *   for this segment entirely.
 *
 *   DeckVariant.objective_override — restates the desired outcome for
 *   this segment track (e.g. exec track → approval vs.
 *   tech track → alignment).
 *
 * Referential integrity (enforced by checkReferentialIntegrity):
 *   - DeckVariant.segment_ids → audience.segments[].id
 *   - SlideVariant.slide_number → slide_plan[].slide_number
 *   - SlideVariant.segment_id  → DeckVariant.segment_ids (subset)
 * ===================================================== */

export const SlideVariantSchema = z.object({
  // Must reference an existing slide in deck.slide_plan.
  slide_number: z.number().int().positive(),
  // Must reference a segment in deck.audience.segments AND appear
  // in the enclosing DeckVariant.segment_ids.
  segment_id: SegmentIdSchema,
  // Overrides the base slide's key_message when present.
  key_message: z.string().optional(),
  // When present, replaces the base slide's content_blocks entirely.
  content_blocks: z.array(ContentBlockSchema).min(1).optional(),
  speaker_intent: z.string().optional(),
  // When true this slide is omitted for this segment's run.
  skip: z.boolean().default(false),
});

export const DeckVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  // Targeted segments — must each resolve to audience.segments[].id.
  segment_ids: z.array(SegmentIdSchema).min(1),
  slide_overrides: z.array(SlideVariantSchema).default([]),
  // Optional restatement of the deck objective for this segment track.
  objective_override: ObjectiveSchema.optional(),
});

/* =====================================================
 * 12. Visual artifacts
 * ===================================================== */

export const VisualArtifactTypeSchema = z.enum([
  "diagram",
  "chart",
  "table",
  "matrix",
  "timeline",
  "map",
  "flow",
  "stack",
  "comparison",
  "dashboard",
  "illustration",
  "framework",
]);

export const VisualArtifactPurposeSchema = z.enum([
  "explain_structure",
  "show_flow",
  "compare_options",
  "show_change_over_time",
  "show_relationships",
  "show_distribution",
  "show_tradeoffs",
  "summarize",
  "warn",
  "support_decision",
  "make_abstract_concrete",
]);

export const VisualCompositionSchema = z.object({
  orientation: z.enum([
    "left_to_right",
    "top_to_bottom",
    "center_out",
    "radial",
    "grid",
    "layered",
    "sequential",
    "hybrid",
  ]),
  information_density: z.enum([
    "minimal",
    "balanced",
    "dense",
    "comprehensive",
  ]),
  reveal_strategy: z.enum([
    "all_at_once",
    "progressive",
    "section_by_section",
    "comparison_reveal",
  ]),
  primary_focal_point: z.string(),
});

export const RequiredVisualElementSchema = z.object({
  id: z.string(),
  label: z.string(),
  communicative_role: z.enum([
    "contextualize",
    "explain",
    "prove",
    "compare",
    "warn",
    "connect",
    "differentiate",
    "summarize",
    "decide",
  ]),
});

// Promoted from inline anonymous shape for consistency with all
// other named schemas in this file.
export const VisualArtifactConstraintsSchema = z.object({
  must_be_readable: z.boolean().default(true),
  avoid_visual_clutter: z.boolean().default(true),
  max_width_px: z.number().int().positive().optional(),
  max_height_px: z.number().int().positive().optional(),
});

export const VisualArtifactSchema = z.object({
  id: VisualArtifactIdSchema,
  title: z.string(),
  artifact_type: VisualArtifactTypeSchema,
  purpose: VisualArtifactPurposeSchema,
  composition: VisualCompositionSchema,
  required_elements: z.array(RequiredVisualElementSchema).default([]),
  constraints: VisualArtifactConstraintsSchema.optional(),
});

/* =====================================================
 * 13. Design system
 * ===================================================== */

// Advisory enum: ColorRoleSchema describes *intent*, not concrete color
// values. The schema does not enforce that any rendering pipeline
// honours it; consumers that map roles to actual colors (themes,
// PDF/HTML exporters) are responsible for the binding. Decks that
// declare color_semantics without a downstream renderer are valid but
// the field has no observable effect.
export const ColorRoleSchema = z.enum([
  "primary",
  "secondary",
  "accent",
  "neutral",
  "positive",
  "negative",
  "warning",
  "info",
  "muted",
]);

export const DesignSystemSchema = z.object({
  style: z.enum([
    "minimal",
    "corporate",
    "technical",
    "editorial",
    "academic",
    "product",
    "strategic",
    "bold",
    "workshop",
  ]),
  tone_visual_alignment: z.string(),
  typography: z.object({
    title_scale: z.enum(["small", "medium", "large"]),
    body_scale: z.enum(["compact", "standard", "large"]),
    label_style: z.enum([
      "short",
      "descriptive",
      "technical",
      "plain_language",
    ]),
  }),
  color_semantics: z
    .array(
      z.object({
        meaning: z.string(),
        // Was z.string() — now constrained to a documented role enum.
        color_role: ColorRoleSchema,
      })
    )
    .default([]),
});

/* =====================================================
 * 13.5. Speaker / presenter modeling
 *
 * Models who delivers the deck, with what authority, in what time
 * budget, and how Q&A is structured. Optional at the deck level —
 * a deck planner working purely on content does not have to commit
 * to delivery details.
 *
 * Authority matters because the same persuasion strategy carries
 * different weight depending on who delivers it: an "owner" stating
 * an opportunity is not equivalent to a "messenger" doing the same.
 * Time budget matters because pacing claims (fast / balanced /
 * deliberate) are unverifiable without a duration target.
 * ===================================================== */

export const PresenterAuthoritySchema = z.enum([
  "owner",
  "delegate",
  "expert",
  "facilitator",
  "messenger",
  "unknown",
]);

export const PresenterRoleSchema = z.enum([
  "primary",
  "co_presenter",
  "support",
  "subject_matter_expert",
]);

export const PresenterSchema = z.object({
  id: PresenterIdSchema,
  name: z.string(),
  role: PresenterRoleSchema,
  authority: PresenterAuthoritySchema,
  // e.g. "VP of Engineering since 2022", "co-author of the pilot study".
  // Free text — its credibility is the audience's call, not the schema's.
  credibility_basis: z.string().optional(),
  // Claim IDs the presenter is willing to vouch for under questioning.
  // Validated for resolution by the integrity pass.
  speaks_for_claim_ids: z.array(ClaimIdSchema).default([]),
  // Slide numbers this presenter delivers. Multiple presenters may
  // share a slide (co-delivery). Validated for resolution.
  delivers_slide_numbers: z
    .array(z.number().int().positive())
    .default([]),
});

export const TimeBudgetSchema = z.object({
  total_minutes: z.number().positive(),
  presentation_minutes: z.number().positive(),
  q_and_a_minutes: z.number().nonnegative().default(0),
  buffer_minutes: z.number().nonnegative().default(0),
});

export const QAndAModeSchema = z.enum([
  "none",
  "at_end",
  "throughout",
  "after_each_section",
  "written_only",
  "moderated",
]);

export const ExpectedQuestionSchema = z.object({
  id: ExpectedQuestionIdSchema,
  question: z.string(),
  likely_asker_segment: z.string().optional(),
  prepared_answer: z.string().optional(),
  // Optional cross-link to a known objection. Resolved by integrity pass.
  addresses_objection_id: ObjectionIdSchema.optional(),
  // Evidence the prepared answer relies on. Resolved by integrity pass.
  references_evidence_ids: z.array(EvidenceIdSchema).default([]),
});

export const QAndAPlanSchema = z.object({
  mode: QAndAModeSchema,
  expected_questions: z.array(ExpectedQuestionSchema).default([]),
  hard_questions_to_prepare_for: z.array(z.string()).default([]),
  out_of_scope_topics: z.array(z.string()).default([]),
});

export const SpeakerPlanSchema = z.object({
  presenters: z.array(PresenterSchema).min(1),
  time_budget: TimeBudgetSchema,
  q_and_a: QAndAPlanSchema,
});

/* =====================================================
 * 14. Deck-level constraints (data-driven catalog)
 * ===================================================== */

export const ConstraintConditionSchema = z.object({
  primary_intent: z.array(DeckIntentSchema).optional(),
  audience_type: z.array(AudienceTypeSchema).optional(),
  audience_attitude: z.array(AudienceAttitudeSchema).optional(),
  prior_knowledge: z.array(KnowledgeLevelSchema).optional(),
  complexity_tolerance: z.array(ComplexityToleranceSchema).optional(),
  narrative_pattern: z.array(NarrativePatternSchema).optional(),
  persuasion_strategy_type: z
    .array(PersuasionStrategyTypeSchema)
    .optional(),
  // Note: this condition makes constraint evaluation depend on
  // the deck's *current* slide composition. The executor accepts
  // this and evaluates conditions against the deck-as-given;
  // it does not iterate to a fixpoint.
  required_slide_roles_present: z.array(SlideRoleSchema).optional(),
  presentation_posture: z.array(PresentationPostureSchema).optional(),
  delivery_mode: z.array(DeliveryModeSchema).optional(),

  // Disjunctive condition: at least one named segment must match the
  // listed attitudes. Lets constraints reach into named segments
  // instead of only the deck-level aggregate audience.attitude. Useful
  // when one segment is hostile but the room average is "neutral".
  any_segment_attitude: z.array(AudienceAttitudeSchema).optional(),

  // Negation: the constraint applies only when the deck's aggregate
  // audience attitude is *not* in the listed values. Combined with
  // the conjunctive base, you can express "X AND NOT Y" without
  // restructuring the catalog.
  not_audience_attitude: z.array(AudienceAttitudeSchema).optional(),

  // Disjunctive condition over deck-level audience type. Existing
  // `audience_type` is conjunctive (deck.audience.audience_type ∈ list);
  // `any_audience_type` is the same shape and provided as an alias
  // to make disjunctive intent explicit at the call site.
  any_audience_type: z.array(AudienceTypeSchema).optional(),
});

export const ConstraintRequirementSchema = z.object({
  must_include_slide_roles: z.array(SlideRoleSchema).optional(),
  must_include_narrative_functions: z
    .array(NarrativeFunctionSchema)
    .optional(),
  must_include_entity_roles: z.array(EntityRoleSchema).optional(),
  must_include_relationship_types: z
    .array(RelationshipTypeSchema)
    .optional(),
  must_include_content_block_types: z
    .array(ContentBlockTypeSchema)
    .optional(),
  must_include_rhetorical_moves: z.array(RhetoricalMoveSchema).optional(),
  must_include_decision_frame: z.boolean().optional(),
  must_include_options: z.boolean().optional(),
  must_include_risks: z.boolean().optional(),
  must_include_evidence: z.boolean().optional(),
  must_include_tradeoffs: z.boolean().optional(),
  discouraged_slide_roles: z.array(SlideRoleSchema).optional(),
  discouraged_content_block_types: z
    .array(ContentBlockTypeSchema)
    .optional(),
});

export const DeckConstraintSchema = z.object({
  id: z.string(),
  category: z.enum([
    "structural",
    "logical",
    "rhetorical",
    "audience_fit",
    "visual",
    "decision_quality",
    "persuasion_strategy",
    "ethical",
  ]),
  condition: ConstraintConditionSchema,
  requirement: ConstraintRequirementSchema,
  validation_question: z.string(),
  severity: SeveritySchema,
});

/* =====================================================
 * 15. Built-in constraint catalog seed
 *     (validated through Zod at module load — see section 19)
 * ===================================================== */

const _builtInBusinessConstraintsSeed: z.infer<
  typeof DeckConstraintSchema
>[] = [
  {
    id: "decision_requires_options",
    category: "decision_quality",
    condition: { primary_intent: ["decide"] },
    requirement: {
      must_include_slide_roles: ["option", "recommendation", "decision"],
      must_include_options: true,
      must_include_decision_frame: true,
    },
    validation_question:
      "Can the audience see the available options before being asked to decide?",
    severity: "must",
  },
  {
    id: "persuasion_requires_evidence_path",
    category: "logical",
    condition: { primary_intent: ["persuade"] },
    requirement: {
      must_include_slide_roles: ["evidence", "tradeoff", "recommendation"],
      must_include_evidence: true,
    },
    validation_question:
      "Does the deck provide a credible path from claim to belief?",
    severity: "must",
  },
  {
    id: "recommendation_requires_rationale",
    category: "logical",
    condition: { required_slide_roles_present: ["recommendation"] },
    requirement: {
      must_include_evidence: true,
      must_include_tradeoffs: true,
    },
    validation_question:
      "Is the recommendation supported by evidence, tradeoffs, or risk analysis?",
    severity: "must",
  },
  {
    id: "comparison_requires_dimensions",
    category: "logical",
    condition: {
      narrative_pattern: ["option_comparison", "tradeoff_analysis"],
    },
    requirement: {
      must_include_tradeoffs: true,
      must_include_content_block_types: ["matrix", "table"],
    },
    validation_question:
      "Are the alternatives compared using explicit dimensions?",
    severity: "must",
  },
  {
    id: "skeptical_audience_requires_objection_handling",
    category: "rhetorical",
    condition: { audience_attitude: ["skeptical", "hostile"] },
    requirement: {
      must_include_slide_roles: ["objection", "risk", "tradeoff"],
      must_include_rhetorical_moves: [
        "address_objections",
        "show_tradeoffs",
      ],
    },
    validation_question:
      "Does the deck address predictable resistance before asking for belief or approval?",
    severity: "must",
  },
  {
    id: "executive_audience_requires_decision_relevance",
    category: "audience_fit",
    condition: { audience_type: ["executive"] },
    requirement: {
      must_include_slide_roles: ["recommendation", "decision"],
    },
    validation_question:
      "Does the deck connect the topic to executive-level consequences quickly enough?",
    severity: "should",
  },
  {
    id: "low_knowledge_requires_definition_before_complexity",
    category: "rhetorical",
    condition: { prior_knowledge: ["none", "low"] },
    requirement: {
      must_include_slide_roles: ["definition", "model"],
    },
    validation_question:
      "Does the deck introduce the concept before asking the audience to reason about complexity?",
    severity: "must",
  },
  {
    id: "provocation_requires_resolution",
    category: "persuasion_strategy",
    condition: { persuasion_strategy_type: ["provocation"] },
    requirement: {
      must_include_narrative_functions: ["tension", "implication", "close"],
      must_include_rhetorical_moves: [
        "address_objections",
        "show_tradeoffs",
        "make_decision_ask",
      ],
    },
    validation_question:
      "Does the provocation lead somewhere useful rather than remaining rhetorical theater?",
    severity: "must",
  },
  {
    id: "risk_strategy_requires_impact_and_mitigation",
    category: "persuasion_strategy",
    condition: { persuasion_strategy_type: ["risk_avoidance"] },
    requirement: {
      must_include_risks: true,
      must_include_rhetorical_moves: [
        "show_risk",
        "quantify_impact",
        "show_cost_of_inaction",
      ],
    },
    validation_question:
      "Does the risk argument explain impact, consequence, and response?",
    severity: "must",
  },
  {
    id: "opportunity_strategy_requires_capture_path",
    category: "persuasion_strategy",
    condition: { persuasion_strategy_type: ["opportunity_capture"] },
    requirement: {
      must_include_rhetorical_moves: [
        "show_future_state",
        "quantify_impact",
        "show_feasibility",
        "make_decision_ask",
      ],
    },
    validation_question:
      "Does the deck explain how the opportunity becomes realized value?",
    severity: "must",
  },
  {
    id: "tradeoff_strategy_requires_explicit_criteria",
    category: "persuasion_strategy",
    condition: { persuasion_strategy_type: ["tradeoff_transparency"] },
    requirement: {
      must_include_tradeoffs: true,
      must_include_content_block_types: ["matrix", "table"],
    },
    validation_question:
      "Does the deck compare alternatives using explicit criteria?",
    severity: "must",
  },
  {
    id: "warning_deck_requires_risks",
    category: "logical",
    condition: { primary_intent: ["warn"] },
    requirement: {
      must_include_risks: true,
      must_include_slide_roles: ["risk"],
    },
    validation_question:
      "Does the warning deck make the actual risks explicit?",
    severity: "must",
  },
  {
    // Pass 3 L5 — exercises the segment-level condition extension.
    // Decks with a hostile or resistant segment should always include
    // a tradeoff slide AND an objection slide, regardless of the
    // deck-level aggregate audience attitude. Without this rule, a
    // deck with a "neutral" room average but a hostile CISO segment
    // could ship without taking on objections.
    id: "hostile_segment_requires_tradeoff_and_objection",
    category: "audience_fit",
    condition: { any_segment_attitude: ["hostile"] },
    requirement: {
      must_include_slide_roles: ["tradeoff", "objection"],
      must_include_rhetorical_moves: ["address_objections"],
    },
    validation_question:
      "When at least one named segment is hostile, has the deck taken its objections on directly?",
    severity: "must",
  },
];

/* =====================================================
 * 16. Quality rules and validation report
 * ===================================================== */

export const QualityRuleSchema = z.object({
  id: z.string(),
  rule: z.string(),
  rationale: z.string(),
  severity: SeveritySchema,
  validation_question: z.string(),
});

export const ValidationStatusSchema = z.enum([
  "pass",
  "warning",
  "fail",
  "not_applicable",
]);

export const ValidationResultSchema = z.object({
  constraint_id: z.string(),
  status: ValidationStatusSchema,
  severity: SeveritySchema.optional(),
  explanation: z.string(),
  recommended_revision: z.string().optional(),
});

export const ValidationReportSchema = z.object({
  overall_status: z.enum(["valid", "valid_with_warnings", "invalid"]),
  results: z.array(ValidationResultSchema),
  summary: z.string(),
  // Populated by validateBusinessDeck() — not expected in user input.
  claim_provenance: z.array(ClaimProvenanceEntrySchema).optional(),
});

// Note: case_solidity is intentionally NOT a field on
// ValidationReportSchema. It is an additional output produced by
// validateBusinessDeck() (see section 21.5) and is attached to the
// returned report as an extra property. Keeping it out of the
// schema avoids a forward reference to CaseSolidityReportSchema
// (declared later in section 16.7) that would collapse type
// inference for the entire deck via the recursive shape.

export const SuccessCriteriaSchema = z.object({
  audience_can_explain_back: z.string(),
  audience_can_decide: z.boolean(),
  minimum_required_belief: z.string(),
  failure_modes: z.array(z.string()).default([]),
});

/* =====================================================
 * 16.5. Localization and translation pipeline
 *
 * Models multi-locale delivery of a business deck.
 *
 * LocaleConfigSchema   — BCP 47 tag + text direction + formatting
 *                        directives (number, date, currency).
 *
 * TranslatableFieldSchema — one entry per human-readable field that
 *   needs translation. Uses a dot-path (e.g. "deck.title",
 *   "deck.slide_plan.0.key_message") to identify the field, carries
 *   the source text and optional translated text, and tracks the
 *   translation lifecycle via TranslationStatusSchema.
 *
 * DeckLocalizationSchema — groups a target locale with its full
 *   catalog of TranslatableField records.
 *
 * LocalizationPipelineSchema — top-level container: source locale +
 *   array of target locale records. Added to BusinessDeckSchema as
 *   an optional field; the existing deck.language string is retained
 *   for backward compatibility but superseded when this is present.
 *
 * Referential integrity (enforced by checkReferentialIntegrity):
 *   - target_locales[].locale.bcp47 must differ from source_locale.bcp47
 * Uniqueness (enforced by checkUniqueness):
 *   - target_locales[].locale.bcp47 must be distinct across the array
 * ===================================================== */

export const TextDirectionSchema = z.enum(["ltr", "rtl"]);

export const LocaleConfigSchema = z.object({
  // BCP 47 language tag. Loose validation accepts the full subtag
  // grammar: language [-Script] [-REGION] [-variant ...]
  // Examples: "en", "en-US", "zh-Hans-CN", "pt-BR", "ar-SA".
  bcp47: z.string().regex(
    /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/,
    "Must be a valid BCP 47 language tag (e.g. 'en-US', 'pt-BR', 'zh-Hans-CN')"
  ),
  // Human-readable name for tooling UIs, e.g. "English (US)".
  display_name: z.string(),
  text_direction: TextDirectionSchema.default("ltr"),
  // Decimal and thousands separators used in this locale.
  number_format: z
    .object({
      decimal_separator: z.string().max(1),
      thousands_separator: z.string().max(1),
    })
    .optional(),
  // Date display pattern for tooling, e.g. "MM/DD/YYYY" or "DD.MM.YYYY".
  date_format: z.string().optional(),
  // ISO 4217 three-letter currency code, e.g. "USD", "BRL", "EUR".
  currency_code: z.string().length(3).optional(),
});
export type LocaleConfig = z.infer<typeof LocaleConfigSchema>;

export const TranslationStatusSchema = z.enum([
  "source",   // original source text — not yet queued
  "pending",  // queued for translation, work not started
  "machine",  // machine-translated, human review pending
  "reviewed", // human-reviewed machine translation
  "approved", // final, cleared for publication
  "outdated", // source changed after this translation was approved
]);

export const TranslatableFieldSchema = z.object({
  // Dot-notation path into the deck object.
  // Examples: "deck.title", "deck.message_strategy.core_claim.text",
  // "deck.slide_plan.2.key_message".
  field_path: z.string(),
  source_text: z.string(),
  translated_text: z.string().optional(),
  status: TranslationStatusSchema,
  // Free-text identifier of the translator (person or service name).
  translator: z.string().optional(),
  reviewed_by: z.string().optional(),
  // ISO 8601 timestamp of the last change to translated_text.
  last_updated: z.string().optional(),
});

export const DeckLocalizationSchema = z.object({
  locale: LocaleConfigSchema,
  // One entry per translatable field in this locale.
  // An empty array is valid — it signals that no fields have been
  // catalogued yet for this target locale.
  fields: z.array(TranslatableFieldSchema).default([]),
});

export const LocalizationPipelineSchema = z.object({
  // The locale of the base deck content. Supersedes deck.language
  // when present.
  source_locale: LocaleConfigSchema,
  // One record per target locale. Order is not significant.
  target_locales: z.array(DeckLocalizationSchema).default([]),
});

/* =====================================================
 * 16.7. Presentation posture, delivery mode, and the Case layer
 *
 * Two orthogonal axes describe the deck's argumentative posture
 * and how the audience consumes it. These are first-class fields
 * because they gate which planning instruments are required.
 *
 * presentation_posture — the kind of argument the deck makes:
 *   case      → adversarial proof, rigorous: claim, burden, rebuttal
 *   briefing  → informational: context, status, no decision ask
 *   story     → narrative-led: arc, characters, transformation
 *   workshop  → collaborative: prompts, exercises, co-creation
 *
 * delivery_mode — how the audience receives the deck:
 *   presented_live → spoken delivery; presenter handles pacing & Q&A
 *   shared_async   → read alone; document must be self-contained
 *   hybrid         → live presentation with pre-read or post-read
 *
 * The Case layer (CaseSchema and its sub-schemas) is required when
 * presentation_posture === "case". Other postures may be added
 * later with their own optional planning layers.
 *
 * Cross-axis invariants are enforced in checkPostureAndDelivery:
 *   - posture === "case" → deck.case is required.
 *   - delivery_mode === "presented_live" → deck.speaker_plan required.
 *   - delivery_mode === "shared_async"  → speaker_plan is optional;
 *     deck.document_authorship and deck.reader_navigation are required;
 *     deck.decision_capture required if a decision outcome is requested;
 *     every must-severity objection must be addressed by some slide.
 *   - delivery_mode === "hybrid" → both speaker_plan and reader_navigation
 *     are required.
 *   - When deck.case is present, all its references resolve (claims,
 *     slide numbers, narrative steps, persuasion orders, presenters,
 *     evidence, objections), and σ time_allocation_minutes ≤
 *     speaker_plan.time_budget.presentation_minutes when delivered live.
 * ===================================================== */

// PresentationPostureSchema and DeliveryModeSchema are declared early
// in section 1 because ConstraintConditionSchema (section 14) references
// them. The planning layers below are gated by their values.

/* ---------------------------------------------------------------
 * Document authorship — required for non-live delivery, since the
 * document is the deliverable and provenance becomes load-bearing
 * in the absence of a speaker.
 * --------------------------------------------------------------- */
export const PublicationStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "published",
  "retracted",
]);

export const DocumentAuthorshipSchema = z.object({
  primary_author: z.string(),
  contributing_authors: z.array(z.string()).default([]),
  reviewers: z.array(z.string()).default([]),
  // Ordered chain of approvers; later entries depend on earlier.
  sign_off_chain: z.array(z.string()).default([]),
  publication_status: PublicationStatusSchema,
});

/* ---------------------------------------------------------------
 * Decision capture — required for shared_async decks that ask for
 * a decision/approval/funding/etc., because the room is not there
 * to extract the answer.
 * --------------------------------------------------------------- */
export const DecisionCaptureMechanismSchema = z.enum([
  "inline_form",
  "comment_thread",
  "reply_email",
  "signoff_block",
  "no_response_expected",
]);

export const DecisionCaptureSchema = z.object({
  mechanism: DecisionCaptureMechanismSchema,
  // ISO 8601 timestamp by which a response is expected.
  response_deadline: z.string().optional(),
  // Segment IDs whose response is required to consider the decision closed.
  required_responders: z.array(SegmentIdSchema).default([]),
  // Free-text owner of the decision-capture process (e.g. "Chief of Staff").
  decision_owner: z.string(),
});

/* ---------------------------------------------------------------
 * Reader navigation — required when the deck is read, not delivered.
 * Without a presenter, reading order is the reader's choice; the deck
 * must offer recovery paths (TL;DR, single-slide-summary, exec section).
 * --------------------------------------------------------------- */
export const ReaderNavigationSchema = z.object({
  // Slide that contains the executive summary.
  exec_summary_slide: z.number().int().positive(),
  // The single most-load-bearing slide, for time-pressured readers.
  if_you_read_only_one: z.number().int().positive(),
  // Optional even-shorter version (one paragraph, no visuals).
  tldr_slide: z.number().int().positive().optional(),
  // Optional table-of-contents slide for long decks.
  table_of_contents_slide: z.number().int().positive().optional(),
  // [first, last] inclusive range of appendix slides.
  appendix_slide_range: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .optional(),
});

/* ---------------------------------------------------------------
 * Case layer — only required when presentation_posture === "case".
 * Models the deck as an adversarial-proof argument with explicit
 * burden, stipulations, order of proof, rebuttal posture, and
 * closing arc. Borrows vocabulary from trial advocacy because the
 * fit is structural, not decorative.
 * --------------------------------------------------------------- */
export const ProofStandardSchema = z.enum([
  // Most permissive: more likely than not (~ business-as-usual).
  "preponderance",
  // Higher confidence threshold (regulatory, board-level decisions).
  "clear_and_convincing",
  // Used sparingly; reserved for irreversible / safety-critical asks.
  "beyond_doubt",
]);

export const ProofChainEntrySchema = z.object({
  claim_id: ClaimIdSchema,
  evidence_ids: z.array(EvidenceIdSchema).min(1),
});

export const BurdenOfProofSchema = z.object({
  standard: ProofStandardSchema,
  // Subset of message_strategy claims that carry the burden.
  // Resolved against {core_claim} ∪ supporting_claims.
  must_prove: z.array(ClaimIdSchema).min(1),
  // Optional explicit claim → evidence binding. When present, every
  // claim_id must be in must_prove and every evidence_id must resolve.
  proof_chain: z.array(ProofChainEntrySchema).default([]),
});

export const StipulationSchema = z.object({
  id: z.string(),
  point_conceded: z.string(),
  rationale: z.string(),
  // Optional binding to a known objection that the stipulation
  // forecloses by pre-emptive concession.
  preempts_objection_id: ObjectionIdSchema.optional(),
});

export const OrderOfProofPurposeSchema = z.enum([
  "setup",
  "stipulation",
  "argument",
  "evidence",
  "tradeoff",
  "rebuttal",
  "pivot",
  "decision",
  "close",
]);

export const OrderOfProofStepSchema = z.object({
  order: z.number().int().positive(),
  section_label: z.string(),
  purpose: OrderOfProofPurposeSchema,
  // Slide numbers implementing this section. Resolved against slide_plan.
  slide_numbers: z.array(z.number().int().positive()).default([]),
  // Narrative step numbers covered. Resolved against narrative_model.
  narrative_steps: z.array(z.number().int().positive()).default([]),
  // Persuasion sequence orders that land in this section.
  persuasion_sequence_orders: z.array(z.number().int().positive()).default([]),
  // Optional presenter who leads this section. Resolved against speaker_plan.
  witness_id: PresenterIdSchema.optional(),
  // Foregrounded evidence for this section. Resolved against deck.evidence.
  exhibit_ids: z.array(EvidenceIdSchema).default([]),
  // Time allocation for live delivery. Sum must not exceed
  // speaker_plan.time_budget.presentation_minutes.
  time_allocation_minutes: z.number().nonnegative().optional(),
  // Reading-time allocation for shared_async / hybrid. Advisory only.
  expected_reading_minutes: z.number().nonnegative().optional(),
});

export const RebuttalPostureItemSchema = z.object({
  id: z.string(),
  // Free-text description of the attack the case prepares for.
  anticipated_attack: z.string(),
  // Optional binding to a declared objection. When delivery_mode is
  // shared_async, the rebuttal must be inline (see invariants).
  triggered_by_objection_id: ObjectionIdSchema.optional(),
  // The rebuttal text. For shared_async this text *must* also appear
  // in some slide's content; for live this can be held in reserve.
  rebuttal: z.string(),
  // Evidence the rebuttal relies on if challenged.
  fallback_evidence_ids: z.array(EvidenceIdSchema).default([]),
  // Optional pivot — the slide to jump to when this rebuttal is invoked.
  pivot_to_slide: z.number().int().positive().optional(),
  // For shared_async: the slide whose content carries the inline rebuttal.
  // Resolved against slide_plan.
  inline_in_slide_number: z.number().int().positive().optional(),
});

export const ClosingArcSchema = z.object({
  // What the audience must walk out believing.
  final_belief_target: z.string(),
  // Optional callback to the opening (closes the loop).
  callback_to_opening: z.string().optional(),
  // The exact decision the deck demands.
  decision_demanded: z.string(),
  // Slide where the close lands. Required when delivery_mode is not
  // presented_live (the document needs a visual anchor for the close).
  anchored_in_slide_number: z.number().int().positive().optional(),
});

export const RehearsalStateSchema = z.enum([
  "unrehearsed",     // text exists, never run through
  "walked",          // walked through alone
  "dress_rehearsed", // run with intended audience-shape
  "live_proven",     // delivered live at least once
  "read_tested",     // (shared_async) reviewed by a stand-in reader
]);

export const CaseSchema = z.object({
  // One-line frame the entire deck serves. Functionally analogous to
  // a trial lawyer's "theory of the case".
  theory_of_case: z.string(),
  burden_of_proof: BurdenOfProofSchema,
  stipulations: z.array(StipulationSchema).default([]),
  order_of_proof: z.array(OrderOfProofStepSchema).min(1),
  rebuttal_posture: z.array(RebuttalPostureItemSchema).default([]),
  closing_arc: ClosingArcSchema,
  rehearsal_state: RehearsalStateSchema,
});
export type Case = z.infer<typeof CaseSchema>;

/* ---------------------------------------------------------------
 * Case solidity assessment
 *
 * A summary signal of how strong the case is, surfaced in
 * ValidationReport.case_solidity. The grade is computed
 * deterministically from observable case features; rationale
 * carries the per-area assessments so a reviewer can see *why*.
 *
 * Grade ladder (ascending):
 *   inadmissible  — hard gates failed (would normally block parse)
 *   weak          — gates met, but multiple soft signals failed
 *   adequate      — gates met, no excellence signals
 *   strong        — gates met + ≥3 excellence signals
 *   airtight      — gates met + all excellence signals + rehearsed live
 * --------------------------------------------------------------- */
export const CaseSolidityGradeSchema = z.enum([
  "inadmissible",
  "weak",
  "adequate",
  "strong",
  "airtight",
]);
export type CaseSolidityGrade = z.infer<typeof CaseSolidityGradeSchema>;

export const ProofStandardAdequacySchema = z.enum([
  // Claim has at least one evidence item meeting the standard's strength bar.
  "meets",
  // Claim has evidence but below the strength bar required by the standard.
  "below_standard",
  // Claim has no evidence pointing at it.
  "uncovered",
]);

export const ClaimBurdenAssessmentSchema = z.object({
  claim_id: ClaimIdSchema,
  adequacy: ProofStandardAdequacySchema,
  evidence_count: z.number().int().nonnegative(),
  highest_strength: ConfidenceSchema.optional(),
});

export const ObjectionCoverageEntrySchema = z.object({
  objection_id: ObjectionIdSchema,
  severity: SeveritySchema,
  rebutted: z.boolean(),
  stipulated: z.boolean(),
  inline_in_slide_number: z.number().int().positive().optional(),
});

export const RehearsalAdequacySchema = z.object({
  standard: ProofStandardSchema,
  state: RehearsalStateSchema,
  is_adequate: z.boolean(),
  explanation: z.string(),
});

export const ClosingArcAssessmentSchema = z.object({
  has_callback_to_opening: z.boolean(),
  has_visual_anchor: z.boolean(),
  required_visual_anchor: z.boolean(),
});

export const TimeConcentrationFindingSchema = z.object({
  step_order: z.number().int().positive(),
  section_label: z.string(),
  share_of_presentation: z.number().min(0).max(1),
});

export const CaseSolidityReportSchema = z.object({
  grade: CaseSolidityGradeSchema,
  rationale: z.string(),
  burden: z.object({
    standard: ProofStandardSchema,
    must_prove_count: z.number().int().nonnegative(),
    claims: z.array(ClaimBurdenAssessmentSchema),
  }),
  objections: z.object({
    must_severity_count: z.number().int().nonnegative(),
    rebutted_count: z.number().int().nonnegative(),
    stipulated_count: z.number().int().nonnegative(),
    unanswered_must_severity: z.array(ObjectionIdSchema),
    coverage: z.array(ObjectionCoverageEntrySchema),
  }),
  rehearsal: RehearsalAdequacySchema,
  closing_arc: ClosingArcAssessmentSchema,
  time_concentration_findings: z.array(TimeConcentrationFindingSchema),
  excellence_signals: z.array(z.string()),
  soft_warnings: z.array(z.string()),
});
export type CaseSolidityReport = z.infer<typeof CaseSolidityReportSchema>;

/* =====================================================
 * 16.8. Sales-context schemas
 *
 * Optional layer for decks targeting sales presentations: enterprise
 * pitches, customer business reviews, account expansion, procurement-
 * facing justification, etc. None of these schemas is required; a
 * deck without sales-context fields parses cleanly.
 *
 * The shapes here add concepts that are GENUINELY missing from the
 * base schema (per Pass 4 review):
 *
 *   AccountContextSchema        — industry, situation, known initiatives.
 *                                 Drives variant generation per account.
 *   PainPointSchema             — buyer pain that the deck addresses,
 *                                 with severity and current cost. Distinct
 *                                 from `audience.likely_objections` (those
 *                                 are *resistance to the deck*) and from
 *                                 `risks` (those are *threats to the option*).
 *   CapabilityMappingSchema     — capability → addressed pain points →
 *                                 proof evidence. Sales-specific structure
 *                                 not modeled by claim/evidence.
 *   CommercialModelSchema       — pricing frame, value metric, ROI.
 *
 * Buyer roles, journey stages, and option-kind discriminators are
 * declared earlier (section 1.6) because AudienceSegmentSchema and
 * OptionSchema reference them. Buyer personas are NOT a separate
 * entity — segments carry buyer_role / priorities / fears /
 * success_criteria via AudienceSegmentSchema's optional fields.
 *
 * Closing / next-step structure for sales decks is intentionally not
 * duplicated: existing fields cover it.
 *   - the "ask" lives in objective.decision_or_action_requested
 *   - the "next steps" live in decision_frame.recommendation.next_steps
 *   - the closing arc lives in case.closing_arc
 *
 * Referential integrity (enforced in checkReferentialIntegrity):
 *   pain_points[].affected_persona_ids -> audience.segments[].id
 *   solution_mapping[].addresses_pain_point_ids -> pain_points[].id
 *   solution_mapping[].proof_evidence_ids -> evidence[].id
 *   commercial_model.commercial_risks -> risks[].id
 *   options[].differentiation_claim_ids -> claim IDs
 *
 * Uniqueness:
 *   pain_points[].id is unique
 * ===================================================== */

export const AccountContextSchema = z.object({
  account_name: z.string().optional(),
  industry: z.string().optional(),
  // One-line situational frame, e.g. "Q3 cost-reduction mandate, new
  // CFO, frozen vendor budget except for compliance work."
  account_situation: z.string().optional(),
  // Named initiatives the buyer has publicly committed to. Used
  // when the deck wants to anchor its value proposition to an
  // existing roadmap line item rather than introducing a new one.
  known_initiatives: z.array(z.string()).default([]),
});
export type AccountContext = z.infer<typeof AccountContextSchema>;

export const PainPointSchema = z.object({
  id: PainPointIdSchema,
  // One-line description of the buyer pain in their own language.
  description: z.string(),
  // Segments most affected by this pain. Resolved against
  // audience.segments by checkReferentialIntegrity.
  affected_persona_ids: z.array(SegmentIdSchema).default([]),
  severity: PainSeveritySchema,
  // Free-text quantified or qualified cost: "~$2M/yr in unrecovered
  // chargebacks", "12-week cycle time delays in launches", etc.
  current_cost_or_impact: z.string().optional(),
});
export type PainPoint = z.infer<typeof PainPointSchema>;

export const CapabilityMappingSchema = z.object({
  // Free-text capability label. Not branded — capabilities are
  // typically declared once per deck and not cross-referenced
  // outside the mapping.
  capability: z.string(),
  // PainPoint IDs this capability addresses. Resolved against
  // pain_points[].id by checkReferentialIntegrity.
  addresses_pain_point_ids: z.array(PainPointIdSchema).default([]),
  // Evidence demonstrating the capability — case studies,
  // benchmarks, technical_analysis. Resolved against evidence[].
  proof_evidence_ids: z.array(EvidenceIdSchema).default([]),
  // Honest disclosure of when the capability does NOT apply or
  // requires conditions. Helps the deck avoid overclaim.
  limitation_or_caveat: z.string().optional(),
});
export type CapabilityMapping = z.infer<typeof CapabilityMappingSchema>;

export const CommercialModelSchema = z.object({
  // E.g. "$X per seat per month, annual prepay required."
  pricing_frame: z.string().optional(),
  // The metric the pricing scales on, e.g. "transactions processed",
  // "engineers", "stored GB". Critical for buyer total-cost projection.
  value_metric: z.string().optional(),
  // One-line ROI summary. The full model lives in evidence as a
  // financial_model entry; this is the deck's elevator-pitch version.
  roi_summary: z.string().optional(),
  // Risks associated specifically with the commercial model
  // (price escalation, vendor lock-in, etc.). Resolved against risks[].
  commercial_risks: z.array(RiskIdSchema).default([]),
});
export type CommercialModel = z.infer<typeof CommercialModelSchema>;

/* =====================================================
 * 17. Module-load validation of built-in catalogs
 *
 * The seeds are validated through Zod here so that any drift
 * between the schemas and the seed data fails fast at import
 * time, not at first use.
 *
 * The `BuiltIn*` exports are the parsed (and therefore type-checked)
 * arrays. Consumers should import these, not the underscore-prefixed
 * raw seeds.
 * ===================================================== */

export const BuiltInPersuasionStrategies: ReadonlyArray<
  z.infer<typeof PersuasionStrategySchema>
> = z
  .array(PersuasionStrategySchema)
  .parse(_builtInPersuasionStrategiesSeed);

// Block 1 #3 — runtime schema for built-in persuasion strategy IDs.
// The TypeScript union below was added previously for compile-time
// safety; this Zod enum exposes the same values at runtime, so
// tooling (form builders, dashboards, dropdowns, validators outside
// this schema's parse path) can discover the values without
// hardcoding them.
export const BuiltInPersuasionStrategyIdSchema = z.enum([
  "logos_reasoning",
  "risk_avoidance",
  "opportunity_capture",
  "tradeoff_transparency",
  "provocation",
]);
export type BuiltInPersuasionStrategyId = z.infer<
  typeof BuiltInPersuasionStrategyIdSchema
>;

export const BuiltInBusinessConstraints: ReadonlyArray<
  z.infer<typeof DeckConstraintSchema>
> = z.array(DeckConstraintSchema).parse(_builtInBusinessConstraintsSeed);

/* =====================================================
 * 18. Final BusinessDeck schema (structural)
 *
 * Structural shape only. No conditional rules.
 * For full validation, use RefinedBusinessDeckSchema (parse-time
 * must-rules) and validateBusinessDeck() (full report).
 * ===================================================== */

export const BusinessDeckSchema = z.object({
  deck: z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    // Legacy free-text language tag. When localization is present,
    // localization.source_locale.bcp47 is authoritative; this field
    // is retained for backward compatibility with existing data.
    language: z.string().optional(),
    target_duration_minutes: z.number().int().positive().optional(),

    objective: ObjectiveSchema,
    audience: AudienceSchema,
    message_strategy: MessageStrategySchema,
    narrative_model: NarrativeModelSchema,
    conceptual_structure: ConceptualStructureSchema,
    information_architecture: InformationArchitectureSchema,

    evidence: z.array(EvidenceSchema).default([]),
    risks: z.array(RiskSchema).default([]),

    decision_frame: DecisionFrameSchema.optional(),
    persuasion_plan: PersuasionPlanSchema.optional(),

    slide_plan: z.array(SlideSchema).min(1),
    visual_artifacts: z.array(VisualArtifactSchema).default([]),

    // Made optional: a deck planner working on narrative does not
    // need to commit to typography choices early.
    design_system: DesignSystemSchema.optional(),

    quality_rules: z.array(QualityRuleSchema).default([]),

    // Factory default to avoid sharing one array reference across
    // every parsed deck (Zod's .default() is shallow).
    constraints: z
      .array(DeckConstraintSchema)
      .default(() => [...BuiltInBusinessConstraints]),

    speaker_plan: SpeakerPlanSchema.optional(),

    success_criteria: SuccessCriteriaSchema,

    // Segment-specific personalizations. References audience.segments
    // for identity; each variant overrides a subset of slides.
    variants: z.array(DeckVariantSchema).default([]),

    // Localization and translation pipeline. Supersedes deck.language
    // when present; defines source locale, target locales, and the
    // per-field translation catalog with lifecycle status.
    localization: LocalizationPipelineSchema.optional(),

    // Argumentative posture of the deck. When "case", deck.case is
    // required and its references are integrity-checked.
    presentation_posture: PresentationPostureSchema,

    // How the audience consumes the deck. Gates which delivery-side
    // planning fields (speaker_plan, document_authorship,
    // reader_navigation, decision_capture) are required.
    delivery_mode: DeliveryModeSchema,

    // Case-posture planning layer. Required when
    // presentation_posture === "case"; otherwise must be omitted.
    case: CaseSchema.optional(),

    // Required when delivery_mode !== "presented_live".
    document_authorship: DocumentAuthorshipSchema.optional(),

    // Required when delivery_mode === "shared_async" AND objective.desired_outcome
    // requires a response (decision/approval/funding/next_step_authorization/
    // strategic_commitment/behavior_change/rejection_or_elimination).
    decision_capture: DecisionCaptureSchema.optional(),

    // Required when delivery_mode !== "presented_live".
    reader_navigation: ReaderNavigationSchema.optional(),

    // ----- Sales-context layer (all optional). -----
    // None of these fields is required; a non-sales deck parses
    // cleanly without them. When present, they trigger sales-specific
    // referential-integrity and uniqueness checks. See section 16.8
    // for the full schemas and section 23 (referential integrity)
    // for the joins.
    buyer_journey_stage: BuyerJourneyStageSchema.optional(),
    account_context: AccountContextSchema.optional(),
    pain_points: z.array(PainPointSchema).default([]),
    solution_mapping: z.array(CapabilityMappingSchema).default([]),
    commercial_model: CommercialModelSchema.optional(),

    // validation_report is *output* of validateBusinessDeck(), not
    // user input. Earlier drafts allowed it on the deck so a deck
    // could be serialized with its quality state — that turned out
    // to be a foot-gun (a user could write a fake "valid" report
    // into the deck). The authoritative source is validateBusinessDeck().
    // The serialized report lives alongside the deck, not inside it.
  }),
});

export type BusinessDeck = z.infer<typeof BusinessDeckSchema>;

/* =====================================================
 * 19. Constraint executor
 *
 * Single source of truth for evaluating constraints from the
 * data-driven catalog. Used in two contexts:
 *
 *   (a) RefinedBusinessDeckSchema's superRefine: only `must`-level
 *       failures are reported (parse fails).
 *   (b) validateBusinessDeck(): all severities, returned as a
 *       ValidationReport with proper status mapping.
 *
 * The condition DSL fields are interpreted as: each field, if
 * present, must match the deck. A constraint with multiple condition
 * fields is the conjunction of all fields. An empty/undefined
 * `condition` matches any deck.
 *
 * The requirement DSL fields, when present, must all be satisfied
 * for the constraint to PASS. If any unsatisfied requirement is
 * found, the constraint FAILS and a human-readable explanation is
 * produced.
 * ===================================================== */

type Deck = BusinessDeck["deck"];

function arrayOverlaps<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
  return a.some((x) => b.includes(x));
}

function evaluateCondition(
  deck: Deck,
  condition: z.infer<typeof ConstraintConditionSchema>
): boolean {
  if (
    condition.primary_intent &&
    !condition.primary_intent.includes(deck.objective.primary_intent)
  ) {
    return false;
  }
  if (
    condition.audience_type &&
    !condition.audience_type.includes(deck.audience.audience_type)
  ) {
    return false;
  }
  if (
    condition.audience_attitude &&
    !condition.audience_attitude.includes(deck.audience.attitude)
  ) {
    return false;
  }
  if (
    condition.prior_knowledge &&
    !condition.prior_knowledge.includes(deck.audience.prior_knowledge)
  ) {
    return false;
  }
  if (
    condition.complexity_tolerance &&
    !condition.complexity_tolerance.includes(deck.audience.complexity_tolerance)
  ) {
    return false;
  }
  if (
    condition.narrative_pattern &&
    !condition.narrative_pattern.includes(
      deck.narrative_model.narrative_pattern
    )
  ) {
    return false;
  }
  if (condition.persuasion_strategy_type) {
    const strategyTypes: string[] = [];
    if (deck.persuasion_plan?.primary_strategy.strategy_type) {
      strategyTypes.push(deck.persuasion_plan.primary_strategy.strategy_type);
    }
    for (const s of deck.persuasion_plan?.supporting_strategies ?? []) {
      strategyTypes.push(s.strategy_type);
    }
    if (!arrayOverlaps(condition.persuasion_strategy_type, strategyTypes)) {
      return false;
    }
  }
  if (condition.required_slide_roles_present) {
    const presentRoles = new Set(
      deck.slide_plan.map((s) => s.role_in_deck)
    );
    if (
      !condition.required_slide_roles_present.every((r) => presentRoles.has(r))
    ) {
      return false;
    }
  }
  if (
    condition.presentation_posture &&
    !condition.presentation_posture.includes(deck.presentation_posture)
  ) {
    return false;
  }
  if (
    condition.delivery_mode &&
    !condition.delivery_mode.includes(deck.delivery_mode)
  ) {
    return false;
  }
  if (
    condition.any_audience_type &&
    !condition.any_audience_type.includes(deck.audience.audience_type)
  ) {
    return false;
  }
  if (
    condition.not_audience_attitude &&
    condition.not_audience_attitude.includes(deck.audience.attitude)
  ) {
    return false;
  }
  if (condition.any_segment_attitude) {
    const someMatches = deck.audience.segments.some((seg) =>
      condition.any_segment_attitude!.includes(seg.attitude)
    );
    if (!someMatches) {
      return false;
    }
  }
  return true;
}

function evaluateRequirement(
  deck: Deck,
  requirement: z.infer<typeof ConstraintRequirementSchema>
): string[] {
  const failures: string[] = [];

  const slideRoles = new Set(deck.slide_plan.map((s) => s.role_in_deck));
  const blockTypes = new Set(
    deck.slide_plan.flatMap((s) =>
      s.content_blocks.map((b) => b.type)
    )
  );
  const rhetoricalMoves = new Set(
    deck.slide_plan.flatMap((s) => s.rhetorical_moves)
  );
  const narrativeFunctions = new Set(
    deck.narrative_model.progression.map((n) => n.function)
  );
  const entityRoles = new Set(
    deck.information_architecture.entities.map((e) => e.role)
  );
  const relationshipTypes = new Set(
    deck.information_architecture.relationships.map((r) => r.type)
  );

  if (requirement.must_include_slide_roles) {
    const missing = requirement.must_include_slide_roles.filter(
      (r) => !slideRoles.has(r)
    );
    if (missing.length > 0) {
      failures.push(`missing slide roles: ${missing.join(", ")}`);
    }
  }
  if (requirement.must_include_narrative_functions) {
    const missing = requirement.must_include_narrative_functions.filter(
      (f) => !narrativeFunctions.has(f)
    );
    if (missing.length > 0) {
      failures.push(`missing narrative functions: ${missing.join(", ")}`);
    }
  }
  if (requirement.must_include_entity_roles) {
    const missing = requirement.must_include_entity_roles.filter(
      (r) => !entityRoles.has(r)
    );
    if (missing.length > 0) {
      failures.push(`missing entity roles: ${missing.join(", ")}`);
    }
  }
  if (requirement.must_include_relationship_types) {
    const missing = requirement.must_include_relationship_types.filter(
      (t) => !relationshipTypes.has(t)
    );
    if (missing.length > 0) {
      failures.push(`missing relationship types: ${missing.join(", ")}`);
    }
  }
  if (requirement.must_include_content_block_types) {
    const missing = requirement.must_include_content_block_types.filter(
      (t) => !blockTypes.has(t)
    );
    if (missing.length > 0) {
      failures.push(`missing content block types: ${missing.join(", ")}`);
    }
  }
  if (requirement.must_include_rhetorical_moves) {
    const missing = requirement.must_include_rhetorical_moves.filter(
      (m) => !rhetoricalMoves.has(m)
    );
    if (missing.length > 0) {
      failures.push(`missing rhetorical moves: ${missing.join(", ")}`);
    }
  }
  if (
    requirement.must_include_decision_frame === true &&
    !deck.decision_frame
  ) {
    failures.push("decision_frame is required but missing");
  }
  if (requirement.must_include_options === true) {
    if (!deck.decision_frame || deck.decision_frame.options.length === 0) {
      failures.push("at least one option is required but none provided");
    }
  }
  if (requirement.must_include_risks === true && deck.risks.length === 0) {
    failures.push("at least one risk is required but none provided");
  }
  if (
    requirement.must_include_evidence === true &&
    deck.evidence.length === 0
  ) {
    failures.push("at least one evidence entry is required but none provided");
  }
  if (
    requirement.must_include_tradeoffs === true &&
    deck.information_architecture.key_tradeoffs.length === 0
  ) {
    failures.push("at least one explicit tradeoff is required but none provided");
  }
  if (requirement.discouraged_slide_roles) {
    const present = requirement.discouraged_slide_roles.filter((r) =>
      slideRoles.has(r)
    );
    if (present.length > 0) {
      failures.push(`discouraged slide roles present: ${present.join(", ")}`);
    }
  }
  if (requirement.discouraged_content_block_types) {
    const present = requirement.discouraged_content_block_types.filter((t) =>
      blockTypes.has(t)
    );
    if (present.length > 0) {
      failures.push(
        `discouraged content block types present: ${present.join(", ")}`
      );
    }
  }

  return failures;
}

function severityToFailingStatus(
  severity: z.infer<typeof SeveritySchema>
): z.infer<typeof ValidationStatusSchema> {
  // must -> fail (blocks parse)
  // should / nice_to_have -> warning (collected, never blocks parse)
  return severity === "must" ? "fail" : "warning";
}

export function evaluateConstraints(
  deck: Deck,
  constraints: ReadonlyArray<z.infer<typeof DeckConstraintSchema>>
): z.infer<typeof ValidationResultSchema>[] {
  return constraints.map((constraint) => {
    if (!evaluateCondition(deck, constraint.condition)) {
      return {
        constraint_id: constraint.id,
        status: "not_applicable" as const,
        severity: constraint.severity,
        explanation: "Condition not met for this deck.",
      };
    }
    const failures = evaluateRequirement(deck, constraint.requirement);
    if (failures.length === 0) {
      return {
        constraint_id: constraint.id,
        status: "pass" as const,
        severity: constraint.severity,
        explanation: constraint.validation_question,
      };
    }
    return {
      constraint_id: constraint.id,
      status: severityToFailingStatus(constraint.severity),
      severity: constraint.severity,
      explanation: `${constraint.validation_question} — failures: ${failures.join("; ")}`,
    };
  });
}

/* =====================================================
 * 20. Referential integrity and uniqueness pass
 *
 * All ID-bearing entities have their references verified here.
 * This is parse-time correctness, so failures use ctx.addIssue
 * regardless of any user-defined severity.
 * ===================================================== */

type RefineCtx = z.RefinementCtx;

function checkReferentialIntegrity(deck: Deck, ctx: RefineCtx): void {
  // Build defined-ID sets.
  const evidenceIds = new Set(deck.evidence.map((e) => e.id));
  const riskIds = new Set(deck.risks.map((r) => r.id));
  const optionIds = new Set(
    deck.decision_frame?.options.map((o) => o.id) ?? []
  );
  const entityIds = new Set(
    deck.information_architecture.entities.map((e) => e.id)
  );
  const visualIds = new Set(deck.visual_artifacts.map((v) => v.id));
  const claimIds = new Set<string>([
    deck.message_strategy.core_claim.id,
    ...deck.message_strategy.supporting_claims.map((c) => c.id),
  ]);
  const objectionIds = new Set(
    deck.audience.likely_objections.map((o) => o.id)
  );
  const persuasionStrategyIds = new Set(
    [
      deck.persuasion_plan?.primary_strategy.id,
      ...(deck.persuasion_plan?.supporting_strategies.map((s) => s.id) ?? []),
    ].filter((id): id is PersuasionStrategyId => Boolean(id))
  );
  const narrativeStepNumbers = new Set(
    deck.narrative_model.progression.map((n) => n.step)
  );
  // Hoisted so both speaker_plan and variant integrity checks can use them.
  const slideNumbers = new Set(
    deck.slide_plan.map((s) => s.slide_number)
  );
  const segmentIds = new Set(
    deck.audience.segments.map((seg) => seg.id)
  );

  const issue = (
    path: (string | number)[],
    message: string
  ) =>
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message,
    });

  // Block 1 #1 — Objection.source_segment_id resolution.
  // Branded reference; if present, must resolve to a declared segment.
  // Earlier drafts left this as a free string named
  // `source_audience_segment` and a typo silently broke the rebuttal/
  // audience-response joins downstream.
  deck.audience.likely_objections.forEach((obj, i) => {
    if (
      obj.source_segment_id !== undefined &&
      !segmentIds.has(obj.source_segment_id)
    ) {
      issue(
        ["deck", "audience", "likely_objections", i, "source_segment_id"],
        `Objection '${obj.id}' source_segment_id '${obj.source_segment_id}' is not defined in deck.audience.segments.`
      );
    }
  });

  // Sales-context layer (16.8) referential integrity.
  // PainPoint.affected_persona_ids → audience.segments[].id
  // CapabilityMapping.addresses_pain_point_ids → pain_points[].id
  // CapabilityMapping.proof_evidence_ids → evidence[].id
  // CommercialModel.commercial_risks → risks[].id
  // Option.differentiation_claim_ids → claim IDs
  const painPointIds = new Set(deck.pain_points.map((p) => p.id));

  deck.pain_points.forEach((pain, i) => {
    pain.affected_persona_ids.forEach((id, j) => {
      if (!segmentIds.has(id)) {
        issue(
          ["deck", "pain_points", i, "affected_persona_ids", j],
          `PainPoint '${pain.id}' affected_persona_ids[${j}] '${id}' is not defined in deck.audience.segments.`
        );
      }
    });
  });

  deck.solution_mapping.forEach((cap, i) => {
    cap.addresses_pain_point_ids.forEach((id, j) => {
      if (!painPointIds.has(id)) {
        issue(
          ["deck", "solution_mapping", i, "addresses_pain_point_ids", j],
          `solution_mapping[${i}] (capability "${cap.capability}") addresses_pain_point_ids[${j}] '${id}' is not defined in deck.pain_points.`
        );
      }
    });
    cap.proof_evidence_ids.forEach((id, j) => {
      if (!evidenceIds.has(id)) {
        issue(
          ["deck", "solution_mapping", i, "proof_evidence_ids", j],
          `solution_mapping[${i}] (capability "${cap.capability}") proof_evidence_ids[${j}] '${id}' is not defined in deck.evidence.`
        );
      }
    });
  });

  if (deck.commercial_model) {
    deck.commercial_model.commercial_risks.forEach((id, j) => {
      if (!riskIds.has(id)) {
        issue(
          ["deck", "commercial_model", "commercial_risks", j],
          `commercial_model.commercial_risks[${j}] '${id}' is not defined in deck.risks.`
        );
      }
    });
  }

  // OptionSchema.differentiation_claim_ids — bind to claim universe.
  (deck.decision_frame?.options ?? []).forEach((option, i) => {
    option.differentiation_claim_ids.forEach((id, j) => {
      if (!claimIds.has(id)) {
        issue(
          [
            "deck",
            "decision_frame",
            "options",
            i,
            "differentiation_claim_ids",
            j,
          ],
          `Option '${option.id}' differentiation_claim_ids[${j}] '${id}' is not defined in deck.message_strategy claims.`
        );
      }
    });
  });

  // Slide -> evidence, claims, objections, narrative_step
  deck.slide_plan.forEach((slide, i) => {
    slide.uses_evidence_ids.forEach((id, j) => {
      if (!evidenceIds.has(id)) {
        issue(
          ["deck", "slide_plan", i, "uses_evidence_ids", j],
          `Evidence ID '${id}' is referenced but not defined in deck.evidence.`
        );
      }
    });
    slide.supports_claim_ids.forEach((id, j) => {
      if (!claimIds.has(id)) {
        issue(
          ["deck", "slide_plan", i, "supports_claim_ids", j],
          `Claim ID '${id}' is referenced but not defined in deck.message_strategy.`
        );
      }
    });
    slide.addresses_objection_ids.forEach((id, j) => {
      if (!objectionIds.has(id)) {
        issue(
          ["deck", "slide_plan", i, "addresses_objection_ids", j],
          `Objection ID '${id}' is referenced but not defined in deck.audience.likely_objections.`
        );
      }
    });
    slide.content_blocks.forEach((block, j) => {
      if (
        block.visual_artifact_id &&
        !visualIds.has(block.visual_artifact_id)
      ) {
        issue(
          [
            "deck",
            "slide_plan",
            i,
            "content_blocks",
            j,
            "visual_artifact_id",
          ],
          `Visual artifact ID '${block.visual_artifact_id}' is referenced but not defined.`
        );
      }
    });
    slide.narrative_steps.forEach((step, j) => {
      if (!narrativeStepNumbers.has(step)) {
        issue(
          ["deck", "slide_plan", i, "narrative_steps", j],
          `narrative_steps[${j}] = ${step} does not match any step in deck.narrative_model.progression.`
        );
      }
    });
    slide.expected_audience_responses.forEach((resp, j) => {
      if (!segmentIds.has(resp.segment_id)) {
        issue(
          ["deck", "slide_plan", i, "expected_audience_responses", j, "segment_id"],
          `expected_audience_responses[${j}] segment_id '${resp.segment_id}' is not defined in deck.audience.segments.`
        );
      }
    });
  });

  // Options -> risks
  (deck.decision_frame?.options ?? []).forEach((option, i) => {
    option.risk_ids.forEach((id, j) => {
      if (!riskIds.has(id)) {
        issue(
          ["deck", "decision_frame", "options", i, "risk_ids", j],
          `Risk ID '${id}' is referenced but not defined in deck.risks.`
        );
      }
    });
  });

  // Recommendation -> options
  if (deck.decision_frame?.recommendation?.recommended_option_id) {
    const id = deck.decision_frame.recommendation.recommended_option_id;
    if (!optionIds.has(id)) {
      issue(
        [
          "deck",
          "decision_frame",
          "recommendation",
          "recommended_option_id",
        ],
        `Recommended option ID '${id}' is referenced but not defined in deck.decision_frame.options.`
      );
    }
  }

  // Information architecture: relationships -> entities
  deck.information_architecture.relationships.forEach((rel, i) => {
    if (!entityIds.has(rel.from)) {
      issue(
        ["deck", "information_architecture", "relationships", i, "from"],
        `Relationship 'from' references unknown entity ID '${rel.from}'.`
      );
    }
    if (!entityIds.has(rel.to)) {
      issue(
        ["deck", "information_architecture", "relationships", i, "to"],
        `Relationship 'to' references unknown entity ID '${rel.to}'.`
      );
    }
  });

  // Information architecture: layers -> entities
  deck.information_architecture.layers.forEach((layer, i) => {
    layer.entities.forEach((id, j) => {
      if (!entityIds.has(id)) {
        issue(
          ["deck", "information_architecture", "layers", i, "entities", j],
          `Layer entity ID '${id}' is not defined in deck.information_architecture.entities.`
        );
      }
    });
  });

  // Persuasion sequence -> persuasion strategies
  (deck.persuasion_plan?.persuasion_sequence ?? []).forEach((step, i) => {
    if (!persuasionStrategyIds.has(step.strategy_id)) {
      issue(
        ["deck", "persuasion_plan", "persuasion_sequence", i, "strategy_id"],
        `persuasion_sequence references unknown strategy_id '${step.strategy_id}'.`
      );
    }
  });

  // Evidence.claims_supported -> claim IDs (each element must resolve)
  deck.evidence.forEach((ev, i) => {
    ev.claims_supported.forEach((id, j) => {
      if (!claimIds.has(id)) {
        issue(
          ["deck", "evidence", i, "claims_supported", j],
          `Evidence claims_supported[${j}] references unknown claim ID '${id}'.`
        );
      }
    });
  });

  // Claim parent links: parent_claim_id (if any) must exist AND must
  // not introduce a cycle. Earlier drafts checked existence only;
  // a cycle (A → parent B → parent A) was structurally valid and
  // would only blow up downstream traversals.
  const allClaims = [
    deck.message_strategy.core_claim,
    ...deck.message_strategy.supporting_claims,
  ];
  const claimById = new Map<string, (typeof allClaims)[number]>();
  allClaims.forEach((c) => claimById.set(c.id, c));

  const detectCycle = (startId: string): string[] | null => {
    const visited = new Set<string>();
    const path: string[] = [];
    let current: string | undefined = startId;
    while (current !== undefined) {
      if (visited.has(current)) {
        return [...path, current]; // cycle
      }
      visited.add(current);
      path.push(current);
      const node = claimById.get(current);
      current = node?.parent_claim_id;
    }
    return null;
  };

  allClaims.forEach((claim, i) => {
    const path =
      i === 0
        ? ["deck", "message_strategy", "core_claim", "parent_claim_id"]
        : [
            "deck",
            "message_strategy",
            "supporting_claims",
            i - 1,
            "parent_claim_id",
          ];
    if (claim.parent_claim_id && !claimIds.has(claim.parent_claim_id)) {
      issue(
        path,
        `Claim parent_claim_id '${claim.parent_claim_id}' does not refer to any defined claim.`
      );
      return; // skip cycle check for unresolvable links
    }
    if (claim.parent_claim_id) {
      const cycle = detectCycle(claim.id);
      if (cycle) {
        issue(
          path,
          `Claim '${claim.id}' is part of a parent_claim_id cycle: ${cycle.join(" → ")}.`
        );
      }
    }
  });

  // Localization: every translatable field_path must resolve against
  // the deck. Earlier drafts left field_path as a free string, which
  // let translations drift silently when slides were renumbered or
  // fields renamed. Now: walk the dot-path and confirm the leaf exists.
  if (deck.localization) {
    deck.localization.target_locales.forEach((tl, ti) => {
      tl.fields.forEach((field, fi) => {
        const result = resolveDeckDotPath(deck, field.field_path);
        if (!result.ok) {
          issue(
            [
              "deck",
              "localization",
              "target_locales",
              ti,
              "fields",
              fi,
              "field_path",
            ],
            `Translatable field_path '${field.field_path}' does not resolve to any value in the deck.`
          );
        }
      });
    });
  }

  // Speaker plan references (only when speaker_plan is present).
  if (deck.speaker_plan) {
    deck.speaker_plan.presenters.forEach((p, i) => {
      p.speaks_for_claim_ids.forEach((id, j) => {
        if (!claimIds.has(id)) {
          issue(
            [
              "deck",
              "speaker_plan",
              "presenters",
              i,
              "speaks_for_claim_ids",
              j,
            ],
            `Presenter speaks_for_claim_ids references unknown claim ID '${id}'.`
          );
        }
      });
      p.delivers_slide_numbers.forEach((n, j) => {
        if (!slideNumbers.has(n)) {
          issue(
            [
              "deck",
              "speaker_plan",
              "presenters",
              i,
              "delivers_slide_numbers",
              j,
            ],
            `Presenter delivers_slide_numbers references unknown slide_number ${n}.`
          );
        }
      });
    });
    deck.speaker_plan.q_and_a.expected_questions.forEach((q, i) => {
      if (
        q.addresses_objection_id &&
        !objectionIds.has(q.addresses_objection_id)
      ) {
        issue(
          [
            "deck",
            "speaker_plan",
            "q_and_a",
            "expected_questions",
            i,
            "addresses_objection_id",
          ],
          `Expected question addresses_objection_id '${q.addresses_objection_id}' is not defined.`
        );
      }
      q.references_evidence_ids.forEach((id, j) => {
        if (!evidenceIds.has(id)) {
          issue(
            [
              "deck",
              "speaker_plan",
              "q_and_a",
              "expected_questions",
              i,
              "references_evidence_ids",
              j,
            ],
            `Expected question references unknown evidence ID '${id}'.`
          );
        }
      });
    });
    // Time budget arithmetic: parts must not exceed total.
    const tb = deck.speaker_plan.time_budget;
    const parts =
      tb.presentation_minutes + tb.q_and_a_minutes + tb.buffer_minutes;
    if (parts > tb.total_minutes) {
      issue(
        ["deck", "speaker_plan", "time_budget"],
        `Time budget parts (${parts} min) exceed total_minutes (${tb.total_minutes}).`
      );
    }
    // Note: target_duration_minutes vs time_budget.total_minutes
    // consistency is now reported as a soft warning in
    // validateBusinessDeck() (was an `[warning]`-prefixed parse-time
    // issue, which actually failed parse — see Pass 2 review C1).
  }

  // Variants -> segment IDs + slide numbers
  deck.variants.forEach((variant, vi) => {
    variant.segment_ids.forEach((id, j) => {
      if (!segmentIds.has(id)) {
        issue(
          ["deck", "variants", vi, "segment_ids", j],
          `Variant '${variant.id}' segment_ids[${j}] '${id}' not defined in deck.audience.segments.`
        );
      }
    });
    variant.slide_overrides.forEach((ov, j) => {
      if (!slideNumbers.has(ov.slide_number)) {
        issue(
          ["deck", "variants", vi, "slide_overrides", j, "slide_number"],
          `Variant '${variant.id}' slide_overrides[${j}] references unknown slide_number ${ov.slide_number}.`
        );
      }
      if (!segmentIds.has(ov.segment_id)) {
        issue(
          ["deck", "variants", vi, "slide_overrides", j, "segment_id"],
          `Variant '${variant.id}' slide_overrides[${j}] segment_id '${ov.segment_id}' not in audience.segments.`
        );
      } else if (!variant.segment_ids.includes(ov.segment_id)) {
        issue(
          ["deck", "variants", vi, "slide_overrides", j, "segment_id"],
          `Variant '${variant.id}' slide_overrides[${j}] segment_id '${ov.segment_id}' must also appear in variant.segment_ids.`
        );
      }
    });
  });

  // Localization: each target locale must differ from the source locale.
  if (deck.localization) {
    const sourceBcp47 = deck.localization.source_locale.bcp47;
    deck.localization.target_locales.forEach((tl, i) => {
      if (tl.locale.bcp47 === sourceBcp47) {
        issue(
          ["deck", "localization", "target_locales", i, "locale", "bcp47"],
          `Target locale '${tl.locale.bcp47}' is identical to source_locale — a locale cannot translate to itself.`
        );
      }
    });
  }

  // S5 (Pass 5) — star_moment.slide_number must resolve.
  if (deck.message_strategy.star_moment) {
    const sm = deck.message_strategy.star_moment;
    if (!slideNumbers.has(sm.slide_number)) {
      issue(
        ["deck", "message_strategy", "star_moment", "slide_number"],
        `Star Moment references slide_number ${sm.slide_number}, which is not in slide_plan.`
      );
    }
  }

  // Core claim must have kind="core".
  if (deck.message_strategy.core_claim.kind !== "core") {
    issue(
      ["deck", "message_strategy", "core_claim", "kind"],
      `core_claim.kind must be "core" (got "${deck.message_strategy.core_claim.kind}").`
    );
  }
}

function checkUniqueness(deck: Deck, ctx: RefineCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // Slide numbers must be unique.
  const slideNumberCounts = new Map<number, number>();
  deck.slide_plan.forEach((s) => {
    slideNumberCounts.set(
      s.slide_number,
      (slideNumberCounts.get(s.slide_number) ?? 0) + 1
    );
  });
  deck.slide_plan.forEach((s, i) => {
    if ((slideNumberCounts.get(s.slide_number) ?? 0) > 1) {
      issue(
        ["deck", "slide_plan", i, "slide_number"],
        `Duplicate slide_number ${s.slide_number}.`
      );
    }
  });

  // Narrative steps must be unique.
  const narrativeStepCounts = new Map<number, number>();
  deck.narrative_model.progression.forEach((n) => {
    narrativeStepCounts.set(
      n.step,
      (narrativeStepCounts.get(n.step) ?? 0) + 1
    );
  });
  deck.narrative_model.progression.forEach((n, i) => {
    if ((narrativeStepCounts.get(n.step) ?? 0) > 1) {
      issue(
        ["deck", "narrative_model", "progression", i, "step"],
        `Duplicate narrative step ${n.step}.`
      );
    }
  });

  // Persuasion sequence orders must be unique.
  const sequence = deck.persuasion_plan?.persuasion_sequence ?? [];
  const orderCounts = new Map<number, number>();
  sequence.forEach((s) => {
    orderCounts.set(s.order, (orderCounts.get(s.order) ?? 0) + 1);
  });
  sequence.forEach((s, i) => {
    if ((orderCounts.get(s.order) ?? 0) > 1) {
      issue(
        ["deck", "persuasion_plan", "persuasion_sequence", i, "order"],
        `Duplicate persuasion_sequence order ${s.order}.`
      );
    }
  });

  // Layer orders must be unique.
  const layerOrderCounts = new Map<number, number>();
  deck.information_architecture.layers.forEach((l) => {
    layerOrderCounts.set(
      l.order,
      (layerOrderCounts.get(l.order) ?? 0) + 1
    );
  });
  deck.information_architecture.layers.forEach((l, i) => {
    if ((layerOrderCounts.get(l.order) ?? 0) > 1) {
      issue(
        ["deck", "information_architecture", "layers", i, "order"],
        `Duplicate layer order ${l.order}.`
      );
    }
  });

  // ID-uniqueness checks.
  const checkIdUniqueness = <T extends { id: string }>(
    items: ReadonlyArray<T>,
    pathPrefix: (string | number)[]
  ) => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    });
    items.forEach((item, i) => {
      if ((counts.get(item.id) ?? 0) > 1) {
        issue(
          [...pathPrefix, i, "id"],
          `Duplicate id '${item.id}'.`
        );
      }
    });
  };

  checkIdUniqueness(deck.evidence, ["deck", "evidence"]);
  checkIdUniqueness(deck.risks, ["deck", "risks"]);
  checkIdUniqueness(
    deck.decision_frame?.options ?? [],
    ["deck", "decision_frame", "options"]
  );
  checkIdUniqueness(
    deck.information_architecture.entities,
    ["deck", "information_architecture", "entities"]
  );
  checkIdUniqueness(
    deck.information_architecture.layers,
    ["deck", "information_architecture", "layers"]
  );
  checkIdUniqueness(deck.visual_artifacts, ["deck", "visual_artifacts"]);
  checkIdUniqueness(
    deck.audience.likely_objections,
    ["deck", "audience", "likely_objections"]
  );
  checkIdUniqueness(
    deck.message_strategy.supporting_claims,
    ["deck", "message_strategy", "supporting_claims"]
  );

  // Claim IDs must be unique across core_claim + supporting_claims.
  const allClaimIds = [
    deck.message_strategy.core_claim.id,
    ...deck.message_strategy.supporting_claims.map((c) => c.id),
  ];
  const claimIdCounts = new Map<string, number>();
  allClaimIds.forEach((id) => {
    claimIdCounts.set(id, (claimIdCounts.get(id) ?? 0) + 1);
  });
  if ((claimIdCounts.get(deck.message_strategy.core_claim.id) ?? 0) > 1) {
    issue(
      ["deck", "message_strategy", "core_claim", "id"],
      `Claim id '${deck.message_strategy.core_claim.id}' is duplicated across core_claim and supporting_claims.`
    );
  }

  // Persuasion strategy IDs (primary + supporting) must be unique.
  if (deck.persuasion_plan) {
    const allStrategyIds = [
      deck.persuasion_plan.primary_strategy.id,
      ...deck.persuasion_plan.supporting_strategies.map((s) => s.id),
    ];
    const strategyCounts = new Map<string, number>();
    allStrategyIds.forEach((id) => {
      strategyCounts.set(id, (strategyCounts.get(id) ?? 0) + 1);
    });
    deck.persuasion_plan.supporting_strategies.forEach((s, i) => {
      if ((strategyCounts.get(s.id) ?? 0) > 1) {
        issue(
          ["deck", "persuasion_plan", "supporting_strategies", i, "id"],
      `Persuasion strategy id '${s.id}' is duplicated.`
        );
      }
    });
  }

  // Audience segment IDs must be unique.
  checkIdUniqueness(
    deck.audience.segments,
    ["deck", "audience", "segments"]
  );

  // Sales-context: PainPoint IDs must be unique. CapabilityMappings
  // do not carry IDs (capabilities are typically declared once per
  // deck and not cross-referenced outside the mapping).
  checkIdUniqueness(deck.pain_points, ["deck", "pain_points"]);

  // Case-layer ID uniqueness — added in Pass 2 review for parity with
  // the rest of the schema's uniqueness checks. Stipulations and
  // rebuttal-posture items both carry user-specified IDs that are
  // referenced in audit trails and tooling; duplicates corrupt those
  // references silently.
  if (deck.case) {
    checkIdUniqueness(
      deck.case.stipulations,
      ["deck", "case", "stipulations"]
    );
    checkIdUniqueness(
      deck.case.rebuttal_posture,
      ["deck", "case", "rebuttal_posture"]
    );
  }

  // Pass 3 H1 — per-slide segment-id uniqueness in
  // expected_audience_responses. Two contradictory predictions for
  // the same segment on the same slide would silently pass and then
  // multiply spurious warnings downstream.
  deck.slide_plan.forEach((slide, i) => {
    const segCounts = new Map<string, number>();
    slide.expected_audience_responses.forEach((resp) => {
      segCounts.set(resp.segment_id, (segCounts.get(resp.segment_id) ?? 0) + 1);
    });
    slide.expected_audience_responses.forEach((resp, j) => {
      if ((segCounts.get(resp.segment_id) ?? 0) > 1) {
        issue(
          ["deck", "slide_plan", i, "expected_audience_responses", j, "segment_id"],
          `Segment '${resp.segment_id}' appears more than once in slide ${slide.slide_number}.expected_audience_responses. Each segment may have at most one prediction per slide.`
        );
      }
    });
  });

  // Variant IDs must be unique.
  checkIdUniqueness(deck.variants, ["deck", "variants"]);

  // Per-variant: (slide_number, segment_id) pairs must be unique.
  deck.variants.forEach((variant, vi) => {
    const seenPairs = new Set<string>();
    variant.slide_overrides.forEach((ov, j) => {
      const key = `${ov.slide_number}:${ov.segment_id}`;
      if (seenPairs.has(key)) {
        issue(
          ["deck", "variants", vi, "slide_overrides", j],
          `Duplicate (slide_number ${ov.slide_number}, segment_id '${ov.segment_id}') in variant '${variant.id}'.`
        );
      }
      seenPairs.add(key);
    });
  });

  // Localization: target locale bcp47 tags must be unique.
  if (deck.localization) {
    const bcp47Counts = new Map<string, number>();
    deck.localization.target_locales.forEach((tl) => {
      bcp47Counts.set(tl.locale.bcp47, (bcp47Counts.get(tl.locale.bcp47) ?? 0) + 1);
    });
    deck.localization.target_locales.forEach((tl, i) => {
      if ((bcp47Counts.get(tl.locale.bcp47) ?? 0) > 1) {
        issue(
          ["deck", "localization", "target_locales", i, "locale", "bcp47"],
          `Duplicate target locale '${tl.locale.bcp47}'.`
        );
      }
    });
  }

  // Speaker plan: presenter IDs and expected-question IDs unique.
  if (deck.speaker_plan) {
    checkIdUniqueness(
      deck.speaker_plan.presenters,
      ["deck", "speaker_plan", "presenters"]
    );
    checkIdUniqueness(
      deck.speaker_plan.q_and_a.expected_questions,
      ["deck", "speaker_plan", "q_and_a", "expected_questions"]
    );
  }
}

/* =====================================================
 * 20.4. Posture and delivery integrity
 *
 * Enforces the cross-axis invariants described in section 16.7:
 * which planning layers are required given the deck's posture and
 * delivery mode, and the referential integrity of the Case layer
 * when posture === "case".
 * ===================================================== */
function checkPostureAndDelivery(deck: Deck, ctx: RefineCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  const posture = deck.presentation_posture;
  const mode = deck.delivery_mode;

  // ---- Posture gating ----
  if (posture === "case") {
    if (!deck.case) {
      issue(
        ["deck", "case"],
        `presentation_posture is "case" but deck.case is missing.`
      );
    }
  } else if (deck.case) {
    issue(
      ["deck", "case"],
      `deck.case is present but presentation_posture is "${posture}" (case fields are only valid when posture is "case").`
    );
  }

  // ---- Delivery-mode gating ----
  const decisionOutcomes = new Set([
    "decision",
    "approval",
    "funding",
    "next_step_authorization",
    "strategic_commitment",
    "behavior_change",
    "rejection_or_elimination",
  ]);

  // q_and_a_minutes: meaningful only when there is a room. shared_async
  // decks declaring non-zero q_and_a time are nonsensical.
  if (mode === "shared_async" && deck.speaker_plan) {
    if (deck.speaker_plan.time_budget.q_and_a_minutes > 0) {
      issue(
        ["deck", "speaker_plan", "time_budget", "q_and_a_minutes"],
        `delivery_mode is "shared_async": q_and_a_minutes must be 0 (no live Q&A possible). Got ${deck.speaker_plan.time_budget.q_and_a_minutes}.`
      );
    }
  }

  // Rehearsal-state vs delivery-mode coupling. `read_tested` only makes
  // sense for documents read alone; `live_proven` only makes sense for
  // talks delivered live. `walked` and `dress_rehearsed` apply across
  // modes; `unrehearsed` is universally valid as a low-readiness state.
  if (deck.case) {
    const rs = deck.case.rehearsal_state;
    if (rs === "read_tested" && mode === "presented_live") {
      issue(
        ["deck", "case", "rehearsal_state"],
        `rehearsal_state "read_tested" is only valid for delivery_mode "shared_async" or "hybrid"; got "${mode}".`
      );
    }
    if (rs === "live_proven" && mode === "shared_async") {
      issue(
        ["deck", "case", "rehearsal_state"],
        `rehearsal_state "live_proven" is only valid for delivery_mode "presented_live" or "hybrid"; got "${mode}".`
      );
    }
  }

  if (mode === "presented_live") {
    if (!deck.speaker_plan) {
      issue(
        ["deck", "speaker_plan"],
        `delivery_mode is "presented_live" but speaker_plan is missing.`
      );
    }
  } else if (mode === "shared_async") {
    if (!deck.document_authorship) {
      issue(
        ["deck", "document_authorship"],
        `delivery_mode is "shared_async" — document_authorship is required (the document is the deliverable).`
      );
    }
    if (!deck.reader_navigation) {
      issue(
        ["deck", "reader_navigation"],
        `delivery_mode is "shared_async" — reader_navigation is required (no presenter to enforce reading order).`
      );
    }
    if (
      decisionOutcomes.has(deck.objective.desired_outcome) &&
      !deck.decision_capture
    ) {
      issue(
        ["deck", "decision_capture"],
        `delivery_mode is "shared_async" with desired_outcome "${deck.objective.desired_outcome}" — decision_capture is required (no room to extract the answer).`
      );
    }
    // Every must-severity objection must be addressed inline by some slide.
    const addressedObjectionIds = new Set(
      deck.slide_plan.flatMap((s) => s.addresses_objection_ids)
    );
    deck.audience.likely_objections.forEach((obj, i) => {
      if (obj.severity === "must" && !addressedObjectionIds.has(obj.id)) {
        issue(
          ["deck", "audience", "likely_objections", i],
          `Must-severity objection '${obj.id}' is not addressed by any slide; required when delivery_mode is "shared_async" (no presenter to handle it live).`
        );
      }
    });
  } else if (mode === "hybrid") {
    if (!deck.speaker_plan) {
      issue(
        ["deck", "speaker_plan"],
        `delivery_mode is "hybrid" — speaker_plan is required.`
      );
    }
    if (!deck.reader_navigation) {
      issue(
        ["deck", "reader_navigation"],
        `delivery_mode is "hybrid" — reader_navigation is required (the deck is also read).`
      );
    }
  }

  // ---- reader_navigation slide refs (when present) must resolve ----
  if (deck.reader_navigation) {
    const slideNumberSet = new Set(
      deck.slide_plan.map((s) => s.slide_number)
    );
    const checkSlide = (
      n: number | undefined,
      path: (string | number)[]
    ) => {
      if (n !== undefined && !slideNumberSet.has(n)) {
        issue(path, `reader_navigation references unknown slide_number ${n}.`);
      }
    };
    checkSlide(
      deck.reader_navigation.exec_summary_slide,
      ["deck", "reader_navigation", "exec_summary_slide"]
    );
    checkSlide(
      deck.reader_navigation.if_you_read_only_one,
      ["deck", "reader_navigation", "if_you_read_only_one"]
    );
    checkSlide(deck.reader_navigation.tldr_slide, [
      "deck",
      "reader_navigation",
      "tldr_slide",
    ]);
    checkSlide(deck.reader_navigation.table_of_contents_slide, [
      "deck",
      "reader_navigation",
      "table_of_contents_slide",
    ]);
    if (deck.reader_navigation.appendix_slide_range) {
      const [from, to] = deck.reader_navigation.appendix_slide_range;
      if (from > to) {
        issue(
          ["deck", "reader_navigation", "appendix_slide_range"],
          `appendix_slide_range start (${from}) must not exceed end (${to}).`
        );
      }
      checkSlide(from, [
        "deck",
        "reader_navigation",
        "appendix_slide_range",
        0,
      ]);
      checkSlide(to, [
        "deck",
        "reader_navigation",
        "appendix_slide_range",
        1,
      ]);
    }
  }

  // ---- decision_capture: required_responders must resolve to segments ----
  if (deck.decision_capture) {
    const segIds = new Set(deck.audience.segments.map((s) => s.id));
    deck.decision_capture.required_responders.forEach((id, i) => {
      if (!segIds.has(id)) {
        issue(
          ["deck", "decision_capture", "required_responders", i],
          `decision_capture.required_responders[${i}] '${id}' is not defined in audience.segments.`
        );
      }
    });
  }

  // ---- Case layer integrity (when posture === "case" AND case is present) ----
  if (posture === "case" && deck.case) {
    const c = deck.case;
    const claimIdSet = new Set<string>([
      deck.message_strategy.core_claim.id,
      ...deck.message_strategy.supporting_claims.map((cl) => cl.id),
    ]);
    const evidenceIdSet = new Set(deck.evidence.map((e) => e.id));
    const objectionIdSet = new Set(
      deck.audience.likely_objections.map((o) => o.id)
    );
    const slideNumberSet = new Set(
      deck.slide_plan.map((s) => s.slide_number)
    );
    const narrativeStepSet = new Set(
      deck.narrative_model.progression.map((n) => n.step)
    );
    const persuasionOrderSet = new Set(
      (deck.persuasion_plan?.persuasion_sequence ?? []).map((p) => p.order)
    );
    const presenterIdSet = new Set(
      (deck.speaker_plan?.presenters ?? []).map((p) => p.id)
    );

    // burden_of_proof.must_prove → claim IDs
    c.burden_of_proof.must_prove.forEach((id, i) => {
      if (!claimIdSet.has(id)) {
        issue(
          ["deck", "case", "burden_of_proof", "must_prove", i],
          `burden_of_proof.must_prove references unknown claim '${id}'.`
        );
      }
    });

    // burden_of_proof.proof_chain references
    c.burden_of_proof.proof_chain.forEach((entry, i) => {
      if (!claimIdSet.has(entry.claim_id)) {
        issue(
          ["deck", "case", "burden_of_proof", "proof_chain", i, "claim_id"],
          `proof_chain claim_id '${entry.claim_id}' is not defined.`
        );
      }
      if (!c.burden_of_proof.must_prove.includes(entry.claim_id)) {
        issue(
          ["deck", "case", "burden_of_proof", "proof_chain", i, "claim_id"],
          `proof_chain claim_id '${entry.claim_id}' must also appear in burden_of_proof.must_prove.`
        );
      }
      entry.evidence_ids.forEach((eid, j) => {
        if (!evidenceIdSet.has(eid)) {
          issue(
            [
              "deck",
              "case",
              "burden_of_proof",
              "proof_chain",
              i,
              "evidence_ids",
              j,
            ],
            `proof_chain evidence_id '${eid}' is not defined in deck.evidence.`
          );
        }
      });
    });

    // stipulations.preempts_objection_id → objection IDs
    c.stipulations.forEach((s, i) => {
      if (
        s.preempts_objection_id &&
        !objectionIdSet.has(s.preempts_objection_id)
      ) {
        issue(
          ["deck", "case", "stipulations", i, "preempts_objection_id"],
          `stipulation preempts_objection_id '${s.preempts_objection_id}' is not defined.`
        );
      }
    });

    // order_of_proof references + uniqueness
    const orderSet = new Set<number>();
    let timeAllocSum = 0;
    c.order_of_proof.forEach((step, i) => {
      if (orderSet.has(step.order)) {
        issue(
          ["deck", "case", "order_of_proof", i, "order"],
          `Duplicate order_of_proof.order ${step.order}.`
        );
      }
      orderSet.add(step.order);
      step.slide_numbers.forEach((sn, j) => {
        if (!slideNumberSet.has(sn)) {
          issue(
            ["deck", "case", "order_of_proof", i, "slide_numbers", j],
            `order_of_proof slide_number ${sn} not in slide_plan.`
          );
        }
      });
      step.narrative_steps.forEach((ns, j) => {
        if (!narrativeStepSet.has(ns)) {
          issue(
            ["deck", "case", "order_of_proof", i, "narrative_steps", j],
            `order_of_proof narrative_step ${ns} not in narrative_model.progression.`
          );
        }
      });
      step.persuasion_sequence_orders.forEach((po, j) => {
        if (!persuasionOrderSet.has(po)) {
          issue(
            [
              "deck",
              "case",
              "order_of_proof",
              i,
              "persuasion_sequence_orders",
              j,
            ],
            `order_of_proof persuasion_sequence_order ${po} not in persuasion_plan.persuasion_sequence.`
          );
        }
      });
      step.exhibit_ids.forEach((eid, j) => {
        if (!evidenceIdSet.has(eid)) {
          issue(
            ["deck", "case", "order_of_proof", i, "exhibit_ids", j],
            `order_of_proof exhibit_id '${eid}' is not defined in deck.evidence.`
          );
        }
      });
      if (step.witness_id && !presenterIdSet.has(step.witness_id)) {
        issue(
          ["deck", "case", "order_of_proof", i, "witness_id"],
          `order_of_proof witness_id '${step.witness_id}' is not defined in speaker_plan.presenters.`
        );
      }
      if (step.time_allocation_minutes !== undefined) {
        timeAllocSum += step.time_allocation_minutes;
      }
    });

    // Time-allocation arithmetic (live delivery only).
    if (
      mode === "presented_live" &&
      deck.speaker_plan &&
      timeAllocSum > 0 &&
      timeAllocSum > deck.speaker_plan.time_budget.presentation_minutes
    ) {
      issue(
        ["deck", "case", "order_of_proof"],
        `Σ time_allocation_minutes (${timeAllocSum}) exceeds speaker_plan.time_budget.presentation_minutes (${deck.speaker_plan.time_budget.presentation_minutes}).`
      );
    }

    // rebuttal_posture references + inline-rebuttal rule for shared_async
    c.rebuttal_posture.forEach((rb, i) => {
      if (
        rb.triggered_by_objection_id &&
        !objectionIdSet.has(rb.triggered_by_objection_id)
      ) {
        issue(
          ["deck", "case", "rebuttal_posture", i, "triggered_by_objection_id"],
          `rebuttal_posture triggered_by_objection_id '${rb.triggered_by_objection_id}' is not defined.`
        );
      }
      rb.fallback_evidence_ids.forEach((eid, j) => {
        if (!evidenceIdSet.has(eid)) {
          issue(
            ["deck", "case", "rebuttal_posture", i, "fallback_evidence_ids", j],
            `rebuttal_posture fallback_evidence_id '${eid}' is not defined.`
          );
        }
      });
      if (
        rb.pivot_to_slide !== undefined &&
        !slideNumberSet.has(rb.pivot_to_slide)
      ) {
        issue(
          ["deck", "case", "rebuttal_posture", i, "pivot_to_slide"],
          `rebuttal_posture pivot_to_slide ${rb.pivot_to_slide} not in slide_plan.`
        );
      }
      if (
        rb.inline_in_slide_number !== undefined &&
        !slideNumberSet.has(rb.inline_in_slide_number)
      ) {
        issue(
          ["deck", "case", "rebuttal_posture", i, "inline_in_slide_number"],
          `rebuttal_posture inline_in_slide_number ${rb.inline_in_slide_number} not in slide_plan.`
        );
      }
      // For shared_async, every triggered_by_objection_id rebuttal MUST have
      // an inline_in_slide_number — the rebuttal cannot be held in reserve.
      if (
        mode === "shared_async" &&
        rb.triggered_by_objection_id &&
        rb.inline_in_slide_number === undefined
      ) {
        issue(
          ["deck", "case", "rebuttal_posture", i, "inline_in_slide_number"],
          `delivery_mode is "shared_async": rebuttal '${rb.id}' must declare inline_in_slide_number (no presenter to deploy it live).`
        );
      }
    });

    // closing_arc.anchored_in_slide_number must resolve when present, and
    // is required when delivery_mode !== "presented_live".
    if (c.closing_arc.anchored_in_slide_number !== undefined) {
      if (!slideNumberSet.has(c.closing_arc.anchored_in_slide_number)) {
        issue(
          ["deck", "case", "closing_arc", "anchored_in_slide_number"],
          `closing_arc.anchored_in_slide_number ${c.closing_arc.anchored_in_slide_number} not in slide_plan.`
        );
      }
    } else if (mode !== "presented_live") {
      issue(
        ["deck", "case", "closing_arc", "anchored_in_slide_number"],
        `delivery_mode is "${mode}": closing_arc.anchored_in_slide_number is required (the close needs a visual anchor in the document).`
      );
    }

    /* ------------------------------------------------------------
     * Solidity gates (hard — must, parse-time)
     *
     * Beyond pure referential integrity, these enforce that the case
     * actually meets its declared burden, anticipates its declared
     * objections, and is staffed and structured for delivery. They
     * are the difference between a syntactically-valid case and an
     * argumentatively-sound one.
     * ------------------------------------------------------------ */

    // (S1) proof_chain completeness — when present, must cover every
    // claim in must_prove. Partial proof_chain is misleading.
    if (c.burden_of_proof.proof_chain.length > 0) {
      const chainClaimIds = new Set(
        c.burden_of_proof.proof_chain.map((e) => e.claim_id)
      );
      c.burden_of_proof.must_prove.forEach((id, i) => {
        if (!chainClaimIds.has(id)) {
          issue(
            ["deck", "case", "burden_of_proof", "must_prove", i],
            `proof_chain is non-empty but does not cover must_prove claim '${id}'. Either add a proof_chain entry or leave proof_chain empty.`
          );
        }
      });
    }

    // (S2) Burden coverage by evidence strength — every must_prove claim
    // must have at least one evidence item meeting the standard's bar:
    //   preponderance        → ≥1 medium or high
    //   clear_and_convincing → ≥1 high OR ≥2 medium
    //   beyond_doubt         → ≥1 high
    const evidenceByClaim = new Map<
      string,
      { strength: z.infer<typeof ConfidenceSchema> }[]
    >();
    deck.evidence.forEach((ev) => {
      ev.claims_supported.forEach((cid) => {
        const bucket = evidenceByClaim.get(cid) ?? [];
        bucket.push({ strength: ev.strength });
        evidenceByClaim.set(cid, bucket);
      });
    });
    const standard = c.burden_of_proof.standard;
    const standardBar =
      standard === "preponderance"
        ? "at least one medium-or-high evidence item"
        : standard === "clear_and_convincing"
          ? "at least one high OR two medium evidence items"
          : "at least one high evidence item";
    const meetsStandard = (
      strengths: ReadonlyArray<z.infer<typeof ConfidenceSchema>>
    ): boolean => {
      const highCount = strengths.filter((s) => s === "high").length;
      const mediumCount = strengths.filter((s) => s === "medium").length;
      if (standard === "preponderance") {
        return highCount + mediumCount >= 1;
      }
      if (standard === "clear_and_convincing") {
        return highCount >= 1 || mediumCount >= 2;
      }
      return highCount >= 1;
    };

    c.burden_of_proof.must_prove.forEach((id, i) => {
      const items = evidenceByClaim.get(id) ?? [];
      const strengths = items.map((x) => x.strength);
      if (!meetsStandard(strengths)) {
        const highCount = strengths.filter((s) => s === "high").length;
        const mediumCount = strengths.filter((s) => s === "medium").length;
        issue(
          ["deck", "case", "burden_of_proof", "must_prove", i],
          `Claim '${id}' does not meet the "${standard}" burden: needs ${standardBar}; has ${highCount} high + ${mediumCount} medium.`
        );
      }
    });

    // proof_chain strength check (H3): the explicit chain itself must
    // satisfy the standard, not just the broader deck.evidence pool.
    // A proof_chain that maps a claim to weak evidence undercuts the
    // very purpose of declaring the chain.
    const evidenceById = new Map(deck.evidence.map((e) => [e.id, e]));
    c.burden_of_proof.proof_chain.forEach((entry, i) => {
      const chainStrengths = entry.evidence_ids
        .map((eid) => evidenceById.get(eid)?.strength)
        .filter(
          (s): s is z.infer<typeof ConfidenceSchema> => s !== undefined
        );
      if (chainStrengths.length === 0) {
        // existence already checked above; no double-report
        return;
      }
      if (!meetsStandard(chainStrengths)) {
        const highCount = chainStrengths.filter((s) => s === "high").length;
        const mediumCount = chainStrengths
          .filter((s) => s === "medium")
          .length;
        issue(
          ["deck", "case", "burden_of_proof", "proof_chain", i, "evidence_ids"],
          `proof_chain entry for claim '${entry.claim_id}' does not meet the "${standard}" burden: needs ${standardBar}; chain has ${highCount} high + ${mediumCount} medium.`
        );
      }
    });

    // (S3) Must-severity objection coverage — every objection of severity
    // "must" must be either rebutted (rebuttal_posture.triggered_by_objection_id)
    // or stipulated (stipulations.preempts_objection_id). Unanswered "must"
    // objections leave the audience's strongest line of attack open.
    const rebuttedObjectionIds = new Set(
      c.rebuttal_posture
        .map((rb) => rb.triggered_by_objection_id)
        .filter((id): id is z.infer<typeof ObjectionIdSchema> => Boolean(id))
    );
    const stipulatedObjectionIds = new Set(
      c.stipulations
        .map((s) => s.preempts_objection_id)
        .filter((id): id is z.infer<typeof ObjectionIdSchema> => Boolean(id))
    );
    deck.audience.likely_objections.forEach((obj, i) => {
      if (obj.severity !== "must") return;
      const handled =
        rebuttedObjectionIds.has(obj.id) ||
        stipulatedObjectionIds.has(obj.id);
      if (!handled) {
        issue(
          ["deck", "audience", "likely_objections", i],
          `Must-severity objection '${obj.id}' is not handled by case.rebuttal_posture (no triggered_by_objection_id) or case.stipulations (no preempts_objection_id). Solid cases either rebut or concede every "must" objection.`
        );
      }
    });

    // (S4) Order-of-proof completeness — every slide must appear in at
    // least one order_of_proof step. Orphan slides break the binding
    // between argumentative structure and slide implementation.
    const coveredSlideNumbers = new Set(
      c.order_of_proof.flatMap((step) => step.slide_numbers)
    );
    deck.slide_plan.forEach((slide, i) => {
      if (!coveredSlideNumbers.has(slide.slide_number)) {
        issue(
          ["deck", "case", "order_of_proof"],
          `Slide ${slide.slide_number} ('${slide.title}') is not assigned to any order_of_proof step (slide_plan[${i}]). Every slide in a case must belong to a section.`
        );
      }
    });

    // (S5) Witness assignment for must_prove — when speaker_plan is
    // present, every must_prove claim must have at least one presenter
    // who lists it in speaks_for_claim_ids. The case needs an accountable
    // witness for every load-bearing claim.
    if (deck.speaker_plan) {
      const claimsWithWitness = new Set<string>();
      deck.speaker_plan.presenters.forEach((p) => {
        p.speaks_for_claim_ids.forEach((cid) => claimsWithWitness.add(cid));
      });
      c.burden_of_proof.must_prove.forEach((id, i) => {
        if (!claimsWithWitness.has(id)) {
          issue(
            ["deck", "case", "burden_of_proof", "must_prove", i],
            `must_prove claim '${id}' has no presenter willing to speak for it (no entry in any speaker_plan.presenters[].speaks_for_claim_ids). Assign a witness.`
          );
        }
      });
    }
  }
}

// Note: orphan visual artifact detection moved out of the refine
// pass and into validateBusinessDeck() — see Pass 2 review C1. The
// previous implementation emitted `[warning]`-prefixed ctx.addIssue
// calls expecting downstream filtering; in fact every ctx.addIssue
// fails parse, so the "warning" was actually a parse error.
function findOrphanedVisualArtifacts(
  deck: Deck
): { id: string; index: number }[] {
  const referencedVisualIds = new Set(
    deck.slide_plan.flatMap((s) =>
      s.content_blocks
        .map((b) => b.visual_artifact_id)
        .filter((id): id is VisualArtifactId => Boolean(id))
    )
  );
  const orphans: { id: string; index: number }[] = [];
  deck.visual_artifacts.forEach((artifact, i) => {
    if (!referencedVisualIds.has(artifact.id)) {
      orphans.push({ id: artifact.id, index: i });
    }
  });
  return orphans;
}

/* =====================================================
 * 20.5. Claim provenance builder
 *
 * buildClaimProvenance(deck) maps every declared claim to the evidence
 * items that list it in claims_supported and computes a coverage grade.
 *
 * Coverage grading rules (deterministic, no thresholds to tune):
 *   uncovered  — 0 evidence items reference this claim
 *   weak       — 1+ items, all strength "low"
 *   partial    — at least 1 medium-strength item, none high
 *   sufficient — at least 1 high-strength item, OR >=2 medium-strength
 * ===================================================== */

function buildClaimProvenance(deck: Deck): ClaimProvenanceEntry[] {
  const allClaims = [
    deck.message_strategy.core_claim,
    ...deck.message_strategy.supporting_claims,
  ];

  // Group evidence by claim ID.
  const evidenceByClaimId = new Map<string, (typeof deck.evidence)[number][]>();
  for (const ev of deck.evidence) {
    for (const id of ev.claims_supported) {
      const bucket = evidenceByClaimId.get(id) ?? [];
      bucket.push(ev);
      evidenceByClaimId.set(id, bucket);
    }
  }

  return allClaims.map((claim): ClaimProvenanceEntry => {
    const supporting = evidenceByClaimId.get(claim.id) ?? [];

    let coverage: ClaimCoverage;
    if (supporting.length === 0) {
      coverage = "uncovered";
    } else {
      const strengths = supporting.map((e) => e.strength);
      const hasHigh = strengths.some((s) => s === "high");
      const mediumCount = strengths.filter((s) => s === "medium").length;
      if (hasHigh || mediumCount >= 2) {
        coverage = "sufficient";
      } else if (mediumCount >= 1) {
        coverage = "partial";
      } else {
        coverage = "weak";
      }
    }

    return ClaimProvenanceEntrySchema.parse({
      claim_id: claim.id,
      claim_text: claim.text,
      supporting_evidence_ids: supporting.map((e) => e.id),
      coverage,
    });
  });
}

/* =====================================================
 * 21. Refined schema  (parse-time hard rules)
 *
 * Combines:
 *  - Referential integrity (always must)
 *  - Uniqueness (always must)
 *  - The constraint catalog filtered to severity = "must"
 * ===================================================== */

export const RefinedBusinessDeckSchema = BusinessDeckSchema.superRefine(
  (value, ctx) => {
    const deck = value.deck;

    checkReferentialIntegrity(deck, ctx);
    checkUniqueness(deck, ctx);
    checkPostureAndDelivery(deck, ctx);

    // Run the constraint executor, but only report `must`-level
    // failures here. should/nice_to_have go through validateBusinessDeck.
    const results = evaluateConstraints(deck, deck.constraints);
    for (const r of results) {
      if (r.status === "fail") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deck"],
          message: `[constraint:${r.constraint_id}] ${r.explanation}`,
        });
      }
    }
  }
);

export type RefinedBusinessDeck = z.infer<typeof RefinedBusinessDeckSchema>;

/* =====================================================
 * 22. validateBusinessDeck — full-severity quality report
 *
 * This is the authoritative source for ValidationReport.
 * It runs the full constraint catalog (all severities) and
 * returns a structured report. Use this after parsing with
 * RefinedBusinessDeckSchema (which guarantees the structural
 * and must-level invariants).
 * ===================================================== */

/* =====================================================
 * 21.5. Case solidity assessment
 *
 * Produces the CaseSolidityReport surfaced in
 * ValidationReport.case_solidity. Operates on a deck that has
 * already passed RefinedBusinessDeckSchema (so all hard solidity
 * gates have been cleared) — this layer adds soft signals and
 * computes the final grade.
 *
 * Soft signals are *not* hard gates; they emit warnings into the
 * validation results array AND inform the grade. A case can be
 * "adequate" or even "strong" while carrying warnings, just as a
 * trial brief can carry style criticism without losing on the merits.
 * ===================================================== */

function strengthRank(s: z.infer<typeof ConfidenceSchema>): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function buildCaseSolidity(deck: Deck): {
  report: CaseSolidityReport;
  warnings: z.infer<typeof ValidationResultSchema>[];
} {
  // Caller has already verified deck.case is present.
  const c = deck.case!;
  const standard = c.burden_of_proof.standard;
  const warnings: z.infer<typeof ValidationResultSchema>[] = [];
  const excellence_signals: string[] = [];
  const soft_warnings: string[] = [];

  const pushWarning = (id: string, explanation: string) => {
    warnings.push({
      constraint_id: `case_solidity:${id}`,
      status: "warning",
      severity: "should",
      explanation,
    });
    soft_warnings.push(explanation);
  };

  // ---- Per-claim burden assessment ----
  const evidenceByClaim = new Map<string, typeof deck.evidence>();
  deck.evidence.forEach((ev) => {
    ev.claims_supported.forEach((cid) => {
      const bucket = evidenceByClaim.get(cid) ?? [];
      bucket.push(ev);
      evidenceByClaim.set(cid, bucket);
    });
  });

  const claimAssessments: z.infer<typeof ClaimBurdenAssessmentSchema>[] =
    c.burden_of_proof.must_prove.map((id) => {
      const items = evidenceByClaim.get(id) ?? [];
      const strengths = items.map((it) => it.strength);
      const highCount = strengths.filter((s) => s === "high").length;
      const mediumCount = strengths.filter((s) => s === "medium").length;
      let adequacy: z.infer<typeof ProofStandardAdequacySchema>;
      if (items.length === 0) {
        adequacy = "uncovered";
      } else {
        let meets = false;
        if (standard === "preponderance") {
          meets = highCount + mediumCount >= 1;
        } else if (standard === "clear_and_convincing") {
          meets = highCount >= 1 || mediumCount >= 2;
        } else {
          meets = highCount >= 1;
        }
        adequacy = meets ? "meets" : "below_standard";
      }
      const highest =
        strengths.length === 0
          ? undefined
          : strengths.reduce((a, b) => (strengthRank(a) >= strengthRank(b) ? a : b));
      return ClaimBurdenAssessmentSchema.parse({
        claim_id: id,
        adequacy,
        evidence_count: items.length,
        highest_strength: highest,
      });
    });

  const claimsMeeting = claimAssessments.filter((a) => a.adequacy === "meets");
  if (claimsMeeting.length === c.burden_of_proof.must_prove.length) {
    excellence_signals.push(
      `every must_prove claim meets the "${standard}" burden`
    );
  }

  // ---- Per-objection coverage assessment ----
  const rebuttedById = new Map<string, z.infer<typeof RebuttalPostureItemSchema>>();
  c.rebuttal_posture.forEach((rb) => {
    if (rb.triggered_by_objection_id) {
      rebuttedById.set(rb.triggered_by_objection_id, rb);
    }
  });
  const stipulatedIds = new Set(
    c.stipulations.map((s) => s.preempts_objection_id).filter(Boolean) as string[]
  );

  const coverage: z.infer<typeof ObjectionCoverageEntrySchema>[] =
    deck.audience.likely_objections.map((obj) =>
      ObjectionCoverageEntrySchema.parse({
        objection_id: obj.id,
        severity: obj.severity,
        rebutted: rebuttedById.has(obj.id),
        stipulated: stipulatedIds.has(obj.id),
        inline_in_slide_number:
          rebuttedById.get(obj.id)?.inline_in_slide_number,
      })
    );

  const mustObjections = deck.audience.likely_objections.filter(
    (o) => o.severity === "must"
  );
  const rebuttedCount = mustObjections.filter((o) =>
    rebuttedById.has(o.id)
  ).length;
  const stipulatedCount = mustObjections.filter((o) =>
    stipulatedIds.has(o.id)
  ).length;
  const unanswered = mustObjections
    .filter((o) => !rebuttedById.has(o.id) && !stipulatedIds.has(o.id))
    .map((o) => o.id);

  if (
    mustObjections.length > 0 &&
    rebuttedCount === mustObjections.length &&
    stipulatedCount === mustObjections.length
  ) {
    excellence_signals.push(
      "every must-severity objection is both rebutted AND stipulated (defense-in-depth)"
    );
  }

  // Soft: rebuttals without fallback evidence are weaker signals.
  const rebuttalsWithoutFallback = c.rebuttal_posture.filter(
    (rb) => rb.fallback_evidence_ids.length === 0
  );
  if (
    c.rebuttal_posture.length > 0 &&
    rebuttalsWithoutFallback.length / c.rebuttal_posture.length >= 0.5
  ) {
    pushWarning(
      "rebuttal_fallback_thin",
      `${rebuttalsWithoutFallback.length} of ${c.rebuttal_posture.length} rebuttals have no fallback_evidence_ids; rebuttals without backing evidence collapse under hostile follow-up.`
    );
  } else if (
    c.rebuttal_posture.length > 0 &&
    rebuttalsWithoutFallback.length === 0
  ) {
    excellence_signals.push("every rebuttal carries fallback evidence");
  }

  // Soft: stipulation density vs audience attitude.
  if (
    (deck.audience.attitude === "hostile" ||
      deck.audience.attitude === "skeptical") &&
    c.stipulations.length === 0
  ) {
    pushWarning(
      "no_stipulations_for_skeptical_audience",
      `Audience attitude is "${deck.audience.attitude}" but no stipulations are declared. Hostile and skeptical audiences expect concessions; their absence reads as overreach.`
    );
  }
  if (c.stipulations.length >= 3) {
    excellence_signals.push(
      `${c.stipulations.length} stipulations declared (concessions earn credibility)`
    );
  }

  // ---- Rehearsal adequacy ----
  const rehearsalRank: Record<z.infer<typeof RehearsalStateSchema>, number> = {
    unrehearsed: 0,
    walked: 1,
    read_tested: 1,
    dress_rehearsed: 2,
    live_proven: 3,
  };
  const requiredRehearsalRank: Record<z.infer<typeof ProofStandardSchema>, number> = {
    preponderance: 0,
    clear_and_convincing: 1,
    beyond_doubt: 2,
  };
  const rehearsalAdequate =
    rehearsalRank[c.rehearsal_state] >= requiredRehearsalRank[standard];
  const rehearsalReport: z.infer<typeof RehearsalAdequacySchema> =
    RehearsalAdequacySchema.parse({
      standard,
      state: c.rehearsal_state,
      is_adequate: rehearsalAdequate,
      explanation: rehearsalAdequate
        ? `Rehearsal state "${c.rehearsal_state}" is adequate for "${standard}" standard.`
        : `Rehearsal state "${c.rehearsal_state}" is below the bar for "${standard}" standard (need at least "walked" for clear_and_convincing, "dress_rehearsed" for beyond_doubt).`,
    });
  if (!rehearsalAdequate) {
    pushWarning(
      "rehearsal_below_standard",
      rehearsalReport.explanation
    );
  } else if (
    c.rehearsal_state === "live_proven" ||
    c.rehearsal_state === "dress_rehearsed"
  ) {
    excellence_signals.push(`rehearsed (${c.rehearsal_state})`);
  }

  // ---- Closing arc assessment ----
  const requiresVisualAnchor = deck.delivery_mode !== "presented_live";
  const closingReport: z.infer<typeof ClosingArcAssessmentSchema> =
    ClosingArcAssessmentSchema.parse({
      has_callback_to_opening: Boolean(c.closing_arc.callback_to_opening),
      has_visual_anchor:
        c.closing_arc.anchored_in_slide_number !== undefined,
      required_visual_anchor: requiresVisualAnchor,
    });
  // Provocation and before-after narratives need callbacks; flag missing.
  const callbackExpected =
    deck.narrative_model.narrative_pattern === "provocation_resolution" ||
    deck.narrative_model.narrative_pattern === "before_after" ||
    deck.narrative_model.narrative_pattern === "current_future";
  if (callbackExpected && !closingReport.has_callback_to_opening) {
    pushWarning(
      "closing_callback_missing",
      `narrative_pattern "${deck.narrative_model.narrative_pattern}" expects closing_arc.callback_to_opening to close the loop; it is missing.`
    );
  } else if (closingReport.has_callback_to_opening) {
    excellence_signals.push("closing arc loops back to the opening");
  }

  // ---- Time concentration findings ----
  const timeConcentrationFindings: z.infer<typeof TimeConcentrationFindingSchema>[] = [];
  if (deck.delivery_mode === "presented_live" && deck.speaker_plan) {
    const presentationMinutes =
      deck.speaker_plan.time_budget.presentation_minutes;
    c.order_of_proof.forEach((step) => {
      if (step.time_allocation_minutes !== undefined && presentationMinutes > 0) {
        const share = step.time_allocation_minutes / presentationMinutes;
        if (share > 0.4) {
          const finding = TimeConcentrationFindingSchema.parse({
            step_order: step.order,
            section_label: step.section_label,
            share_of_presentation: share,
          });
          timeConcentrationFindings.push(finding);
          pushWarning(
            `time_concentration:order_${step.order}`,
            `Order-of-proof step ${step.order} ('${step.section_label}') consumes ${(share * 100).toFixed(0)}% of presentation_minutes — high concentration in a single section.`
          );
        }
      }
    });
  }

  // ---- proof_chain bonus signal ----
  if (
    c.burden_of_proof.proof_chain.length === c.burden_of_proof.must_prove.length &&
    c.burden_of_proof.must_prove.length > 0
  ) {
    excellence_signals.push("proof_chain explicitly maps every must_prove claim to evidence");
  }

  // ---- Grade computation ----
  // inadmissible — should be impossible at this point (hard gates would
  // have failed parse), but keep as a guard for future schema changes.
  let grade: CaseSolidityGrade;
  const claimsBelowOrUncovered = claimAssessments.filter(
    (a) => a.adequacy !== "meets"
  ).length;
  if (claimsBelowOrUncovered > 0 || unanswered.length > 0) {
    grade = "inadmissible";
  } else if (c.rehearsal_state === "live_proven" && excellence_signals.length >= 5) {
    grade = "airtight";
  } else if (excellence_signals.length >= 3 && soft_warnings.length === 0) {
    grade = "strong";
  } else if (soft_warnings.length >= 3) {
    grade = "weak";
  } else {
    grade = "adequate";
  }

  const rationale =
    `Burden "${standard}" with ${claimsMeeting.length}/${c.burden_of_proof.must_prove.length} ` +
    `must_prove claims meeting the bar; ` +
    `${rebuttedCount}/${mustObjections.length} must-severity objections rebutted, ` +
    `${stipulatedCount}/${mustObjections.length} stipulated; ` +
    `rehearsal state "${c.rehearsal_state}" → ${rehearsalAdequate ? "adequate" : "below standard"}; ` +
    `${excellence_signals.length} excellence signal(s), ${soft_warnings.length} soft warning(s).`;

  const report: CaseSolidityReport = CaseSolidityReportSchema.parse({
    grade,
    rationale,
    burden: {
      standard,
      must_prove_count: c.burden_of_proof.must_prove.length,
      claims: claimAssessments,
    },
    objections: {
      must_severity_count: mustObjections.length,
      rebutted_count: rebuttedCount,
      stipulated_count: stipulatedCount,
      unanswered_must_severity: unanswered,
      coverage,
    },
    rehearsal: rehearsalReport,
    closing_arc: closingReport,
    time_concentration_findings: timeConcentrationFindings,
    excellence_signals,
    soft_warnings,
  });

  return { report, warnings };
}

/* ---------------------------------------------------------------
 * Case features — derived signals (Pass 3 M8)
 *
 * The mechanized soundness rules (W14–W18) compute per-(slide,
 * segment) context vectors internally but never expose them. Authors
 * couldn't see *what* the schema thought the case was before reading
 * the warnings. This block surfaces the deck-level derived signals
 * so the report shows the schema's view of the case at a glance.
 *
 *   controversy_level — derived from audience.attitude + count of
 *     must-severity objections. Maps to {low, medium, high}.
 *   evidence_balance  — distribution of evidence strength across
 *     deck.evidence (count of low/medium/high items).
 *   pressure          — derived from objective.desired_outcome ×
 *     audience.decision_power. Decision-class outcomes asked of a
 *     final-decision-maker = high pressure.
 *
 * These are descriptive, not normative — the schema doesn't reject a
 * deck because its features look one way or another. They exist so
 * the validation report explains its own reasoning.
 * --------------------------------------------------------------- */

export const CaseFeaturesReportSchema = z.object({
  controversy_level: z.enum(["low", "medium", "high"]),
  evidence_balance: z.object({
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  pressure: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});
export type CaseFeaturesReport = z.infer<typeof CaseFeaturesReportSchema>;

export type ValidationReportWithSolidity = z.infer<
  typeof ValidationReportSchema
> & {
  case_solidity?: CaseSolidityReport;
  case_features?: CaseFeaturesReport;
};

/* =====================================================
 * 21.55. Shared dot-path resolver
 *
 * Used by both checkReferentialIntegrity (parse-time field_path
 * existence check) and buildSoftWarnings (Block 1 #4 source_text
 * drift detection). Walks "deck.title" / "deck.slide_plan.0.key_message"
 * dot-paths against a BusinessDeck instance and returns the leaf
 * value (or { ok: false } if the path doesn't resolve).
 * ===================================================== */
function resolveDeckDotPath(
  deck: Deck,
  dotPath: string
): { ok: boolean; reachedLeaf: boolean; value: unknown } {
  const parts = dotPath.split(".");
  let cursor: unknown = { deck };
  for (const part of parts) {
    if (cursor === undefined || cursor === null) {
      return { ok: false, reachedLeaf: false, value: undefined };
    }
    const idx = /^\d+$/.test(part) ? Number(part) : null;
    if (idx !== null) {
      if (!Array.isArray(cursor) || idx >= cursor.length) {
        return { ok: false, reachedLeaf: false, value: undefined };
      }
      cursor = cursor[idx];
    } else if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return { ok: false, reachedLeaf: false, value: undefined };
    }
  }
  return {
    ok: cursor !== undefined,
    reachedLeaf: true,
    value: cursor,
  };
}

/* =====================================================
 * 21.6. Tunable thresholds + emotion sets used by soft warnings
 *
 * Centralised so the choice of every magic constant is documented
 * in one place. Bumping any value here is a deliberate change to
 * how strict the validator is, not an accidental edit buried in a
 * 400-line function.
 * ===================================================== */

const SOFTNESS_THRESHOLDS = {
  // W14: "first third" — predicting strong-positive emotion from a
  // hostile segment before this fraction of slides is implausible.
  // 1/3 is a deliberate call: the typical persuasion deck spends
  // its first third on framing/scope and only begins rebutting in
  // the middle third. If your deck disagrees, override per-prediction
  // with confidence: "low".
  W14_FIRST_THIRD: 1 / 3,

  // W17: anchored on opening_strategy === "provocation" + first
  // opening slide rather than position_fraction — see the rule body.
  // The earlier 0.2 fraction proxy was too coarse for decks whose
  // provocation is the central reveal.

  // W6 (case_solidity time concentration): a single section consuming
  // > this fraction of presentation_minutes is concentration risk.
  TIME_CONCENTRATION_SHARE: 0.4,

  // M3 closing decision overlap: minimum word length for an "anchor
  // word" used in the keyword-overlap heuristic.
  ANCHOR_WORD_MIN_LENGTH: 5,

  // case_solidity grade thresholds.
  AIRTIGHT_MIN_EXCELLENCE: 5,
  STRONG_MIN_EXCELLENCE: 3,
  WEAK_MIN_WARNINGS: 3,

  // case_solidity: rebuttals without fallback evidence beyond this
  // fraction of total rebuttals → "rebuttal_fallback_thin" warning.
  REBUTTAL_FALLBACK_THIN_FRACTION: 0.5,

  // case_solidity: ≥ this many declared stipulations counts as an
  // excellence signal ("concessions earn credibility").
  STIPULATIONS_EXCELLENCE_MIN: 3,
} as const;

/* ---------------------------------------------------------------
 * Emotion-set semantics
 *
 * EMOTIONS_PERSUADED — emotions that signal the deck has *won the
 *   audience over*: the audience agrees, validates, or trusts. A
 *   hostile segment leaving the slide with one of these means the
 *   rebuttal landed (or a stipulation pre-empted the resistance).
 *
 * EMOTIONS_RESOLVED — superset of EMOTIONS_PERSUADED that also
 *   includes "relief". Used for risk-bystander checks: an audience
 *   who is not the source of an addressed risk should not feel
 *   relieved by it (W16).
 *
 * Earlier names (EMOTIONS_PERSUADED / _STRONG) were misleading;
 * the split has nothing to do with strength of feeling and
 * everything to do with the kind of rhetorical move the emotion
 * implies.
 * --------------------------------------------------------------- */

const EMOTIONS_PERSUADED: ReadonlySet<ExpectedEmotion> = new Set([
  "agreement",
  "validation",
  "trust",
]);

const EMOTIONS_RESOLVED: ReadonlySet<ExpectedEmotion> = new Set([
  "agreement",
  "validation",
  "trust",
  "relief",
]);

/* ---------------------------------------------------------------
 * Reaction-set semantics
 *
 * REACTIONS_HOSTILE_RESIDUAL — reactions that signal a rebuttal did
 *   NOT land: source segment is still actively pushing back against
 *   the slide's argument. Used in W9 alongside the emotion check.
 *
 * REACTIONS_PASSIVE — reactions that count as "engagement absent."
 *   Used in W18 (high-evidence + decision-powerful + only passive).
 *
 * Both are upper bounds: a reaction set of just these is the trigger,
 * not "any of these in any combination."
 * --------------------------------------------------------------- */

const REACTIONS_HOSTILE_RESIDUAL: ReadonlySet<ExpectedReaction> = new Set([
  "push_back",
  "ask_challenging_question",
  "interrupt",
  "reject",
]);

const REACTIONS_PASSIVE: ReadonlySet<ExpectedReaction> = new Set([
  "lean_back",
]);

/* =====================================================
 * 21.65. Constraint-ID reference
 *
 * Soft warnings emitted by validateBusinessDeck() use stable
 * `constraint_id` strings so consumers (dashboards, dashboards,
 * CI gates, IDE plugins) can filter or surface specific signals.
 * The full namespace, with a one-line semantic for each:
 *
 *   orphan_visual_artifact:<id>                 — W1, defined-but-unused visual
 *   time_budget_target_duration_mismatch        — W2
 *   presenter_coverage_gap                      — W3 / H5
 *   audience_aggregate_attitude_mismatch        — W4 / M1
 *   closing_decision_mismatch                   — W5 / M3
 *   shape_enum_divergence:<scope>               — W6 / M2 (dominant or secondary)
 *   narrative_step_non_contiguous               — W7 / M6
 *   decision_slide_no_decision_reaction:<slide> — W8
 *   decision_slide_no_decision_powerful_prediction:<slide>
 *                                               — W8b (Pass 3 H3)
 *   rebuttal_does_not_land:<slide>:<segment>    — W9 (emotions OR hostile reactions)
 *   no_decision_reaction_anywhere               — W10
 *   no_decision_reaction_at_decision_slide      — W10b (Pass 3 C1)
 *   w14_initial_attitude_unrealistic:<slide>:<segment>
 *   w15_rebuttal_without_evidence:<slide>:<segment>
 *   w16_risk_bystander_positive:<slide>:<segment>
 *   w17_provocation_premature_agreement:<slide>:<segment>
 *   w18_high_evidence_passive_reaction:<slide>:<segment>
 *   audience_response_emotion_without_reactions:<slide>:<segment>
 *                                               — Pass 3 M6
 *   localization_source_text_stale:<bcp47>:<path>
 *                                               — Block 1 #4
 *   critical_pain_unaddressed:<pain_id>         — sales context (16.8)
 *   capability_without_pain:<index>             — sales context (16.8)
 *   action_title_missing:slide_N                — Pass 5 S3 (Minto)
 *   supporting_claims_count_high                — Pass 5 S4 (Minto rule of three)
 *   case_solidity:<sub>                         — case-solidity sub-warnings
 *   claim_provenance:<claim_id>                 — claim-coverage warnings
 *   publication_status_retracted                — L4 (FAIL, not warning)
 *
 * Severities are differentiated as of Pass 3 M4: severe planning
 * defects are `must` (W14, W17), structural quality issues are
 * `should` (most), advisory observations are `nice_to_have`.
 * ===================================================== */

/* =====================================================
 * 21.7. Soft warnings emitted by validateBusinessDeck()
 *
 * These checks were either previously parse-time `[warning]`-prefixed
 * issues that actually failed parse (Pass 2 review, finding C1),
 * or new soft signals added in the same review. They live here
 * because Zod's superRefine has no warning channel — anything added
 * to ctx.addIssue is a fail. Surfacing them as `should`-severity
 * results keeps `RefinedBusinessDeckSchema.parse()` permissive while
 * still putting the signal in the validation report.
 * ===================================================== */
/* =====================================================
 * 21.7a. Mechanized anti-envelope rules (W14–W18)
 *
 * Pass 3 M1 — extracted from buildSoftWarnings into its own helper
 * for maintenance velocity. The block is the largest single source
 * of warnings; isolating it keeps the orchestrator function readable
 * and makes the rule logic locally inspectable.
 *
 * Returns ValidationResult[] (severity differentiated per rule, per
 * Pass 3 M4). Pure function: no closures over the orchestrator.
 * ===================================================== */
function findAntiEnvelopeWarnings(
  deck: Deck
): z.infer<typeof ValidationResultSchema>[] {
  type SlideContext = {
    position_fraction: number;
    addresses_segment_objection: boolean;
    max_evidence_strength: "none" | "low" | "medium" | "high";
    is_risk_role: boolean;
    provocation_active: boolean;
  };

  const out: z.infer<typeof ValidationResultSchema>[] = [];
  const push = (
    id: string,
    explanation: string,
    severity: z.infer<typeof SeveritySchema>
  ) =>
    out.push({
      constraint_id: id,
      status: "warning",
      severity,
      explanation,
    });

  const totalSlides = deck.slide_plan.length;
  const evidenceById = new Map(deck.evidence.map((e) => [e.id, e]));
  const objectionById = new Map(
    deck.audience.likely_objections.map((o) => [o.id, o])
  );
  const segmentById = new Map(deck.audience.segments.map((s) => [s.id, s]));
  const provocationActive =
    deck.persuasion_plan?.primary_strategy.strategy_type === "provocation" ||
    (deck.persuasion_plan?.supporting_strategies ?? []).some(
      (s) => s.strategy_type === "provocation"
    );
  const firstOpeningSlideNumber = Math.min(
    ...deck.slide_plan
      .filter((s) => s.role_in_deck === "opening")
      .map((s) => s.slide_number),
    Infinity
  );

  const STRENGTH_RANK: Record<"low" | "medium" | "high", number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const NEGATIVE_STARTING_ATTITUDES = new Set<
    z.infer<typeof AudienceAttitudeSchema>
  >(["hostile"]);
  const SKEPTICAL_OR_HOSTILE_ATTITUDES = new Set<
    z.infer<typeof AudienceAttitudeSchema>
  >(["hostile", "skeptical", "divided"]);

  const computeSlideContext = (
    slide: (typeof deck.slide_plan)[number],
    segmentId: string
  ): SlideContext => {
    const slideEvidenceStrengths = slide.uses_evidence_ids
      .map((id) => evidenceById.get(id)?.strength)
      .filter((s): s is "low" | "medium" | "high" => Boolean(s));
    let maxStrength: SlideContext["max_evidence_strength"] = "none";
    if (slideEvidenceStrengths.length > 0) {
      const top = slideEvidenceStrengths.reduce((a, b) =>
        STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b
      );
      maxStrength = top;
    }
    const addressesSegmentObj = slide.addresses_objection_ids.some((oid) => {
      const obj = objectionById.get(oid);
      return obj?.source_segment_id === segmentId;
    });
    return {
      position_fraction: slide.slide_number / totalSlides,
      addresses_segment_objection: addressesSegmentObj,
      max_evidence_strength: maxStrength,
      is_risk_role: slide.role_in_deck === "risk",
      provocation_active: !!provocationActive,
    };
  };

  deck.slide_plan.forEach((slide) => {
    slide.expected_audience_responses.forEach((resp) => {
      if (resp.confidence === "low") return;
      const segment = segmentById.get(resp.segment_id);
      if (!segment) return;

      const ctx = computeSlideContext(slide, resp.segment_id);
      const emotions: ExpectedEmotion[] = [resp.expected_emotion];
      if (resp.secondary_emotion) emotions.push(resp.secondary_emotion);
      const reactions = resp.expected_reactions;
      const emit = (
        rule: string,
        explanation: string,
        severity: z.infer<typeof SeveritySchema> = "should"
      ) =>
        push(
          `${rule}:slide_${slide.slide_number}:${resp.segment_id}`,
          explanation,
          severity
        );

      // (W14) Initial-attitude realism.
      let w14Fired = false;
      if (
        ctx.position_fraction <= SOFTNESS_THRESHOLDS.W14_FIRST_THIRD &&
        NEGATIVE_STARTING_ATTITUDES.has(segment.attitude) &&
        !ctx.addresses_segment_objection
      ) {
        const offending = emotions.filter((e) => EMOTIONS_PERSUADED.has(e));
        if (offending.length > 0) {
          w14Fired = true;
          emit(
            "w14_initial_attitude_unrealistic",
            `Slide ${slide.slide_number} (position ${(
              ctx.position_fraction * 100
            ).toFixed(0)}% of deck) predicts segment '${
              resp.segment_id
            }' (declared attitude: "${segment.attitude}") will feel ${offending
              .map((e) => `"${e}"`)
              .join(", ")}, but no objection sourced from this segment is addressed yet. A hostile audience does not move to ${offending
              .map((e) => `"${e}"`)
              .join("/")} before its objections are taken on. Either move the rebuttal earlier, soften the predicted emotion, or set confidence: "low".`,
            "must"
          );
        }
      }

      // (W15) Rebuttal-without-evidence.
      if (
        ctx.addresses_segment_objection &&
        (ctx.max_evidence_strength === "none" ||
          ctx.max_evidence_strength === "low") &&
        SKEPTICAL_OR_HOSTILE_ATTITUDES.has(segment.attitude)
      ) {
        const offending = emotions.filter((e) => EMOTIONS_RESOLVED.has(e));
        if (offending.length > 0) {
          emit(
            "w15_rebuttal_without_evidence",
            `Slide ${slide.slide_number} addresses an objection from '${
              resp.segment_id
            }' (attitude: "${segment.attitude}") but its uses_evidence_ids contains ${
              ctx.max_evidence_strength === "none"
                ? "no evidence"
                : "only low-strength evidence"
            }. Predicting ${offending
              .map((e) => `"${e}"`)
              .join("/")} is implausible — a rebuttal without medium-or-high evidence does not move a hostile/skeptical audience. Add evidence to uses_evidence_ids, soften the prediction, or set confidence: "low".`,
            "should"
          );
        }
      }

      // (W16) Risk-slide bystander.
      if (ctx.is_risk_role && !ctx.addresses_segment_objection) {
        const offending = emotions.filter((e) => EMOTIONS_RESOLVED.has(e));
        if (offending.length > 0) {
          emit(
            "w16_risk_bystander_positive",
            `Slide ${slide.slide_number} (role: "risk") predicts '${
              resp.segment_id
            }' will feel ${offending
              .map((e) => `"${e}"`)
              .join(", ")}, but this segment is not the source of any objection addressed by this slide. Bystanders to a risk do not feel validation/relief/agreement about it. Use a neutral emotion (interest, alarm, discomfort) or set confidence: "low".`,
            "should"
          );
        }
      }

      // (W17) Provocation premature agreement (suppressed when W14 fires).
      const isFirstOpeningSlide =
        slide.role_in_deck === "opening" &&
        slide.slide_number === firstOpeningSlideNumber;
      if (
        deck.narrative_model.opening_strategy === "provocation" &&
        ctx.provocation_active &&
        isFirstOpeningSlide &&
        NEGATIVE_STARTING_ATTITUDES.has(segment.attitude) &&
        !w14Fired
      ) {
        const offending = emotions.filter((e) => EMOTIONS_PERSUADED.has(e));
        if (offending.length > 0) {
          emit(
            "w17_provocation_premature_agreement",
            `Slide ${slide.slide_number} (first opening slide, narrative_model.opening_strategy === "provocation", persuasion uses "provocation") predicts hostile segment '${
              resp.segment_id
            }' will feel ${offending
              .map((e) => `"${e}"`)
              .join(", ")}. Provocations are intended to disturb, not to win immediate agreement. Expect "discomfort", "surprise", or "skepticism" here. If agreement is genuinely expected, the slide is mis-classified as provocation.`,
            "must"
          );
        }
      }

      // (W18) High-evidence + decision-powerful + only passive reactions.
      // M6: empty reactions when emotion declared → separate signal.
      if (reactions.length === 0 && resp.expected_emotion) {
        emit(
          "audience_response_emotion_without_reactions",
          `Slide ${slide.slide_number} predicts emotion "${resp.expected_emotion}" for '${resp.segment_id}' but no expected_reactions are declared. Emotions without observable reactions cannot be tested in rehearsal — declare at least one reaction or set confidence: "low".`,
          "nice_to_have"
        );
      }
      const allPassive =
        reactions.length > 0 &&
        reactions.every((r) => REACTIONS_PASSIVE.has(r));
      if (
        ctx.max_evidence_strength === "high" &&
        (segment.decision_power === "approver" ||
          segment.decision_power === "final_decision_maker") &&
        allPassive
      ) {
        emit(
          "w18_high_evidence_passive_reaction",
          `Slide ${slide.slide_number} brings high-strength evidence and predicts decision-powerful segment '${
            resp.segment_id
          }' will only "${reactions.join('", "')}". Passive reactions to high-strength evidence are implausible — expect at least one of "take_notes", "nod", "lean_in", "ask_clarifying_question", or a decision-class reaction.`,
          "nice_to_have"
        );
      }
    });
  });

  return out;
}

function buildSoftWarnings(
  deck: Deck
): z.infer<typeof ValidationResultSchema>[] {
  const out: z.infer<typeof ValidationResultSchema>[] = [];
  const warn = (id: string, explanation: string) =>
    out.push({
      constraint_id: id,
      status: "warning",
      severity: "should",
      explanation,
    });
  // Pass 3 M4 — let rules promote to "must" or demote to
  // "nice_to_have" without re-engineering the call sites.
  const warnWithSeverity = (
    id: string,
    explanation: string,
    severity: z.infer<typeof SeveritySchema>
  ) =>
    out.push({
      constraint_id: id,
      status: "warning",
      severity,
      explanation,
    });

  // Pass 3 C2 — firstOpeningSlideNumber is computed inside
  // findAntiEnvelopeWarnings (section 21.7a) where it is consumed.
  // No longer pre-computed here.

  // (W1) Orphan visual artifacts (was C1 — bogus parse failure).
  findOrphanedVisualArtifacts(deck).forEach((o) => {
    warn(
      `orphan_visual_artifact:${o.id}`,
      `Visual artifact '${o.id}' is defined but not referenced by any slide. Either reference it or remove it.`
    );
  });

  // (W2) target_duration_minutes vs time_budget.total_minutes (was C1).
  if (deck.speaker_plan && deck.target_duration_minutes !== undefined) {
    const total = deck.speaker_plan.time_budget.total_minutes;
    if (total !== deck.target_duration_minutes) {
      warn(
        "time_budget_target_duration_mismatch",
        `time_budget.total_minutes (${total}) differs from deck.target_duration_minutes (${deck.target_duration_minutes}). Pick one source of truth.`
      );
    }
  }

  // (W3) Presenter coverage of slides — every slide should have at
  // least one presenter when the deck is delivered live (H5).
  if (deck.delivery_mode === "presented_live" && deck.speaker_plan) {
    const deliveredSlides = new Set(
      deck.speaker_plan.presenters.flatMap((p) => p.delivers_slide_numbers)
    );
    const undelivered = deck.slide_plan
      .map((s) => s.slide_number)
      .filter((n) => !deliveredSlides.has(n));
    if (undelivered.length > 0) {
      warn(
        "presenter_coverage_gap",
        `delivery_mode is "presented_live" but slide(s) ${undelivered.join(", ")} are not in any presenter's delivers_slide_numbers.`
      );
    }
  }

  // (W4) Audience aggregate vs segments (M1). When segments are
  // declared, the deck-level attitude should not be an outright
  // contradiction of every segment (e.g. "supportive" deck-level with
  // every segment hostile).
  if (deck.audience.segments.length > 0) {
    const allSegmentAttitudes = new Set(
      deck.audience.segments.map((s) => s.attitude)
    );
    if (
      allSegmentAttitudes.size > 0 &&
      !allSegmentAttitudes.has(deck.audience.attitude) &&
      // unless deck-level is genuinely a meta-value
      deck.audience.attitude !== "divided" &&
      deck.audience.attitude !== "neutral"
    ) {
      warn(
        "audience_aggregate_attitude_mismatch",
        `Deck-level audience.attitude is "${deck.audience.attitude}" but no declared segment shares that attitude (segments are: ${[...allSegmentAttitudes].join(", ")}). Reconcile or use "divided"/"neutral" at the deck level.`
      );
    }
  }

  // (W5) closing_arc.decision_demanded vs objective.decision_or_action_requested (M3).
  // Pass 3 H4: stem-based matching, not anchor words. Strip common
  // English suffixes so "approve" and "approval" match, "assess" and
  // "assessment" match. Still a heuristic — the alternative (semantic
  // equality) needs an LLM and goes against the schema's deterministic
  // contract.
  if (deck.case && deck.objective.decision_or_action_requested) {
    const demanded = deck.case.closing_arc.decision_demanded.trim();
    const requested = deck.objective.decision_or_action_requested.trim();

    const SUFFIXES = [
      "ization",
      "isation",
      "ation",
      "ment",
      "ness",
      "ity",
      "ing",
      "ies",
      "ed",
      "es",
      "al",
      "er",
      "or",
      "ly",
      "y",
      "s",
    ];
    const stem = (word: string): string => {
      let w = word.toLowerCase();
      for (const suf of SUFFIXES) {
        if (w.length > suf.length + 2 && w.endsWith(suf)) {
          w = w.slice(0, -suf.length);
          break;
        }
      }
      return w;
    };
    const stems = (s: string): Set<string> => {
      return new Set(
        s
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length >= SOFTNESS_THRESHOLDS.ANCHOR_WORD_MIN_LENGTH)
          .map(stem)
      );
    };
    const aStems = stems(demanded);
    const bStems = stems(requested);
    const shared = [...aStems].filter((s) => bStems.has(s));
    if (shared.length === 0) {
      warn(
        "closing_decision_mismatch",
        `case.closing_arc.decision_demanded ("${demanded.slice(0, 80)}…") does not share any stem with objective.decision_or_action_requested ("${requested.slice(0, 80)}…"). Verify they refer to the same decision; if they intentionally diverge (e.g., demanded narrower than requested), set confidence: "low" via a stipulation.`
      );
    }
  }

  // (W6) Shape-enum divergence (M2). When dominant_model OR any
  // secondary_model is a shape word that overlaps with LayoutSchema,
  // at least one slide layout should plausibly support it. Pass 3 H5:
  // symmetric — secondary_models also checked.
  const shapeOverlap = new Set([
    "matrix",
    "timeline",
    "flow",
    "stack",
    "comparison",
  ]);
  const layouts = new Set(
    deck.slide_plan.map((s) => s.visual_strategy.layout)
  );
  const checkShape = (
    model: z.infer<typeof MentalModelSchema>,
    scope: "dominant" | `secondary[${number}]`
  ) => {
    if (
      shapeOverlap.has(model) &&
      !layouts.has(model as z.infer<typeof LayoutSchema>)
    ) {
      warn(
        `shape_enum_divergence:${scope}`,
        `conceptual_structure.${scope === "dominant" ? "dominant_model" : `secondary_models[${scope.replace(/[^0-9]/g, "")}]`} is "${model}" but no slide layout uses it. Either align the model to slide layouts or pick a non-shape model (e.g. "system", "decision_tree").`
      );
    }
  };
  checkShape(deck.conceptual_structure.dominant_model, "dominant");
  deck.conceptual_structure.secondary_models.forEach((m, i) => {
    checkShape(m, `secondary[${i}]`);
  });

  // (W7) Narrative-step contiguity. progression.step values should be
  // contiguous starting at min(steps) — gaps signal poor sequencing
  // even though they parse cleanly. Pass 3 M5: don't hardcode 1 as
  // the start; some workflows legitimately offset (e.g. 0-indexed
  // sub-narratives, 100-series for appendix progressions). Pass 3 M7:
  // surface the missing step numbers AND any case.order_of_proof
  // narrative_steps references that would land on them.
  const stepNumbers = deck.narrative_model.progression
    .map((n) => n.step)
    .sort((a, b) => a - b);
  if (stepNumbers.length > 0) {
    const start = stepNumbers[0];
    const expected = Array.from(
      { length: stepNumbers.length },
      (_, i) => start + i
    );
    const missing: number[] = [];
    let actualIdx = 0;
    for (let cursor = start; actualIdx < stepNumbers.length; cursor++) {
      if (stepNumbers[actualIdx] === cursor) {
        actualIdx++;
      } else {
        missing.push(cursor);
      }
    }
    const drift = stepNumbers.some((n, i) => n !== expected[i]) || missing.length > 0;
    if (drift) {
      // Cross-reference: any case.order_of_proof.narrative_steps
      // pointing at a missing step would compound the defect.
      const danglingFromCase: number[] = [];
      if (deck.case) {
        deck.case.order_of_proof.forEach((op) => {
          op.narrative_steps.forEach((ns) => {
            if (missing.includes(ns)) danglingFromCase.push(ns);
          });
        });
      }
      const missingNote =
        missing.length === 0
          ? `step numbers ${JSON.stringify(stepNumbers)} are not strictly contiguous from ${start}`
          : `missing step(s) ${missing.join(", ")} between ${start} and ${stepNumbers[stepNumbers.length - 1]}`;
      const caseNote =
        danglingFromCase.length > 0
          ? ` Additionally, case.order_of_proof references step(s) ${[...new Set(danglingFromCase)].join(", ")} which fall in the gap — fix the progression first to avoid cascading errors.`
          : "";
      warn(
        "narrative_step_non_contiguous",
        `narrative_model.progression: ${missingNote}; gaps obscure the narrative shape.${caseNote}`
      );
    }
  }

  // (Block 1 #4) Localization source_text drift. Each
  // TranslatableField carries a snapshot of the source text. If the
  // deck's current value at field_path no longer matches that
  // snapshot, the catalogued translation is stale — the `outdated`
  // lifecycle status exists for exactly this case but had no detector.
  if (deck.localization) {
    deck.localization.target_locales.forEach((tl) => {
      tl.fields.forEach((field) => {
        const result = resolveDeckDotPath(deck, field.field_path);
        if (!result.ok) return; // already caught by referential integrity
        if (typeof result.value !== "string") return; // non-string leaf — skip
        if (result.value !== field.source_text) {
          warn(
            `localization_source_text_stale:${tl.locale.bcp47}:${field.field_path}`,
            `Localization for '${tl.locale.bcp47}' carries source_text "${field.source_text.slice(
              0,
              60
            )}…" for field_path '${field.field_path}', but the deck's current value at that path is "${result.value.slice(
              0,
              60
            )}…". The translation is stale — update source_text and any translated_text, or set status to "outdated".`
          );
        }
      });
    });
  }

  // ---- Pass 5 soft warnings (S3, S4) ----

  // (S4) Rule-of-Three counter — Minto. Counts only `kind:
  // "supporting"` claims; "action" and "sub" claims are excluded by
  // design. The soft warning fires at >3 supporting claims, signaling
  // that the deck risks diluting its core argument's persuasive
  // structure.
  const supportingCount = deck.message_strategy.supporting_claims.filter(
    (c) => c.kind === "supporting"
  ).length;
  if (supportingCount > 3) {
    warn(
      "supporting_claims_count_high",
      `message_strategy.supporting_claims has ${supportingCount} entries with kind="supporting". Minto's rule-of-three: credibility and retention drop above 3 peer supporting arguments. Either consolidate, mark non-peer claims as kind="action" or "sub", or accept the dilution risk explicitly.`
    );
  }

  // (S3) Action Title heuristic — Minto. Detects slide titles that
  // look like topic labels rather than declarative sentences. Skips
  // appendix slides (legitimately topic-labeled) and titles that
  // contain a recognizable verb form. Heuristic — false positives
  // are tolerated; authors can refine titles or ignore noisy hits.
  // Verb inflections covered: bare form (V), -s (3rd-person), -ed
  // (past), -ing (gerund). Heuristic — false positives possible but
  // bounded; the fix path is: rewrite the title or accept the noise.
  const VERB_STEMS = [
    // common action verbs in title contexts
    "ship", "kill", "block", "fail", "fix", "win", "lose", "beat",
    "move", "drive", "push", "pull", "break", "earn",
    "approve", "reject", "accept", "decide", "commit", "defer",
    "abstain", "authorize",
    "show", "prove", "demonstrate", "require", "need", "demand",
    "deliver", "explain", "describe",
    "make", "take", "build", "buy", "sell", "run",
    "reduce", "increase", "grow", "shrink", "cut", "raise", "lower",
    "answer", "address", "handle", "solve", "defeat", "land",
    "close", "open",
    "create", "destroy", "enable", "prevent", "allow", "forbid",
    "remove", "add", "convert", "shift",
    "matter", "count", "fit", "work", "live", "die", "stay", "leave",
    "name", "list", "map", "rank", "score",
    "cost", "save", "spend", "pay", "earn",
    "realize", "recognize", "discover", "find", "see", "know",
    "ask", "answer", "tell", "say", "speak",
  ].join("|");
  const ACTION_VERB_PATTERN = new RegExp(
    [
      // forms of be / have / do (already-inflected, listed explicitly)
      "\\b(is|are|was|were|be|been|being)\\b",
      "\\b(has|have|had|having)\\b",
      "\\b(does|do|did|doing|done)\\b",
      "\\b(made|took|built|bought|sold|ran|won|lost|broken)\\b",
      // modal verbs
      "\\b(can|could|will|would|should|must|may|might|shall)\\b",
      // verb stems with optional -s / -ed / -ing inflections
      `\\b(${VERB_STEMS})(s|es|ed|ing)?\\b`,
    ].join("|"),
    "i"
  );
  deck.slide_plan.forEach((slide) => {
    // Skip appendix — appendix slides are legitimately topic-labeled.
    if (slide.role_in_deck === "appendix") return;
    if (!ACTION_VERB_PATTERN.test(slide.title)) {
      warn(
        `action_title_missing:slide_${slide.slide_number}`,
        `Slide ${slide.slide_number} title "${slide.title}" appears to be a topic label rather than a declarative sentence (Minto Action Title rule). Consider rewriting as a complete sentence with a verb that asserts the slide's key message. (Heuristic check; ignore if the title genuinely contains an action that this rule missed.)`
      );
    }
  });

  // ---- Sales-context soft warnings (16.8 layer) ----

  // critical_pain_unaddressed — a pain point with severity "critical"
  // (or "high") that NO capability mapping addresses. The deck names
  // a top-priority pain but never claims to solve it. Strongest sales
  // hygiene signal.
  if (deck.pain_points.length > 0 && deck.solution_mapping.length > 0) {
    const addressedPainIds = new Set<string>(
      deck.solution_mapping.flatMap((cap) => cap.addresses_pain_point_ids)
    );
    deck.pain_points.forEach((pain) => {
      if (
        (pain.severity === "critical" || pain.severity === "high") &&
        !addressedPainIds.has(pain.id)
      ) {
        warn(
          `critical_pain_unaddressed:${pain.id}`,
          `Pain point '${pain.id}' has severity "${pain.severity}" but no solution_mapping entry addresses it. Either add a CapabilityMapping with this pain in addresses_pain_point_ids, downgrade the severity, or remove the pain point if it is not in scope.`
        );
      }
    });
  }

  // capability_without_pain — a capability mapping that doesn't bind
  // to ANY pain point. The deck pitches a feature with no buyer
  // problem behind it. Common pre-flight defect in product-led
  // pitches that haven't been re-anchored on the buyer's situation.
  deck.solution_mapping.forEach((cap, i) => {
    if (cap.addresses_pain_point_ids.length === 0) {
      warn(
        `capability_without_pain:${i}`,
        `solution_mapping[${i}] (capability "${cap.capability}") does not bind to any pain point. Add a pain point this capability addresses, or remove the capability if it has no buyer-side anchor.`
      );
    }
  });

  // ---- Audience-response coherence (per-slide predictions vs slide content) ----

  const decisionPowerful = new Set(
    deck.audience.segments
      .filter(
        (s) =>
          s.decision_power === "final_decision_maker" ||
          s.decision_power === "approver"
      )
      .map((s) => s.id)
  );

  // Index objections by source segment for W9.
  const objectionsBySegment = new Map<string, string[]>();
  deck.audience.likely_objections.forEach((o) => {
    if (o.source_segment_id) {
      const bucket = objectionsBySegment.get(o.source_segment_id) ?? [];
      bucket.push(o.id);
      objectionsBySegment.set(o.source_segment_id, bucket);
    }
  });

  // (W8) Decision-role slides should evoke a decision-class reaction
  // for at least one approver / final_decision_maker segment whose
  // response is predicted on the slide. Decision-role slides without
  // any decision-class reaction signal a missing decision moment.
  deck.slide_plan.forEach((slide) => {
    const isDecisionRole =
      slide.role_in_deck === "decision" ||
      slide.role_in_deck === "recommendation";
    if (!isDecisionRole) return;

    // Pass 3 H3 — separate signal: decision-role slide that doesn't
    // even *predict* a response for any decision-powerful segment.
    // The author hasn't imagined how the room will react. Fire only
    // when the deck has decision-powerful segments declared (otherwise
    // there's nothing to predict).
    const decisionPowerfulPredictions =
      slide.expected_audience_responses.filter(
        (r) => decisionPowerful.has(r.segment_id) && r.confidence !== "low"
      );
    if (
      decisionPowerful.size > 0 &&
      decisionPowerfulPredictions.length === 0
    ) {
      warnWithSeverity(
        `decision_slide_no_decision_powerful_prediction:slide_${slide.slide_number}`,
        `Slide ${slide.slide_number} has role "${slide.role_in_deck}" but no expected_audience_response is declared for any approver/final_decision_maker segment. The author hasn't imagined how the room actually responds at the decision moment — declare at least one such prediction or set confidence: "low" to acknowledge.`,
        "should"
      );
      return;
    }
    if (decisionPowerfulPredictions.length === 0) return;

    // (W8) When predictions exist for decision-powerful segments,
    // at least one must include a decision-OUTCOME reaction (Block 1
    // #2: outcome != engagement). A slide that produces only
    // engagement reactions (e.g. request_more_info) has *engaged*
    // the room without *closing* it — softer warning W8b.
    const anyOutcome = decisionPowerfulPredictions.some((r) =>
      r.expected_reactions.some((rx) =>
        DECISION_OUTCOME_REACTIONS.has(rx)
      )
    );
    if (!anyOutcome) {
      const anyEngagement = decisionPowerfulPredictions.some((r) =>
        r.expected_reactions.some((rx) =>
          DECISION_ENGAGEMENT_REACTIONS.has(rx)
        )
      );
      if (anyEngagement) {
        // The room engaged — asked for clarification, more info, or
        // pushed back — but didn't take a position. Decision-blocked,
        // not decision-rejected. Softer signal.
        warnWithSeverity(
          `decision_slide_engagement_only:slide_${slide.slide_number}`,
          `Slide ${slide.slide_number} has role "${slide.role_in_deck}" and predicts decision-engagement reactions (${[
            ...DECISION_ENGAGEMENT_REACTIONS,
          ].join(", ")}) for approver/final-decision-maker segments, but no decision-outcome reactions (${[
            ...DECISION_OUTCOME_REACTIONS,
          ].join(", ")}). The slide produced decision engagement but not a decision outcome — the room is interested but not yet committed.`,
          "should"
        );
      } else {
        // No outcome AND no engagement — the room is silent on the
        // decision. Strongest signal: the deck is asking for a
        // decision the room doesn't even respond to.
        warnWithSeverity(
          `decision_slide_no_decision_reaction:slide_${slide.slide_number}`,
          `Slide ${slide.slide_number} has role "${slide.role_in_deck}" and predicts responses for approver/final-decision-maker segments, but none are decision-outcome reactions (${[
            ...DECISION_OUTCOME_REACTIONS,
          ].join(", ")}) or decision-engagement reactions (${[
            ...DECISION_ENGAGEMENT_REACTIONS,
          ].join(", ")}). The slide is asking for a decision but the room isn't predicted to take any position.`,
          "must"
        );
      }
    }
  });

  // (W9) Objection-rebuttal slides shouldn't predict that the SOURCE
  // segment of the addressed objection ends the slide more hostile
  // than they started. A working rebuttal *reduces* resistance.
  deck.slide_plan.forEach((slide) => {
    if (slide.addresses_objection_ids.length === 0) return;
    if (slide.expected_audience_responses.length === 0) return;
    const sourceSegmentsAddressed = new Set<string>();
    slide.addresses_objection_ids.forEach((oid) => {
      const obj = deck.audience.likely_objections.find((o) => o.id === oid);
      if (obj?.source_segment_id) {
        sourceSegmentsAddressed.add(obj.source_segment_id);
      }
    });
    slide.expected_audience_responses.forEach((resp) => {
      if (resp.confidence === "low") return; // author flagged uncertainty
      if (!sourceSegmentsAddressed.has(resp.segment_id)) return;
      const negativePrimary = HOSTILE_RESIDUAL_EMOTIONS.has(
        resp.expected_emotion
      );
      const negativeSecondary =
        resp.secondary_emotion !== undefined &&
        HOSTILE_RESIDUAL_EMOTIONS.has(resp.secondary_emotion);
      // Pass 3 H2 — reactions are as load-bearing as emotions. A
      // prediction of `skepticism` (passes) but reactions
      // [push_back, ask_challenging_question] (rebuttal didn't land)
      // is the same defect under a different surface.
      const dominantHostileReactions =
        resp.expected_reactions.length > 0 &&
        resp.expected_reactions.every((r) =>
          REACTIONS_HOSTILE_RESIDUAL.has(r)
        );
      if (negativePrimary || negativeSecondary || dominantHostileReactions) {
        const trigger = negativePrimary || negativeSecondary
          ? `feel "${resp.expected_emotion}"${
              resp.secondary_emotion
                ? ` / "${resp.secondary_emotion}"`
                : ""
            }`
          : `react with ${resp.expected_reactions
              .map((r) => `"${r}"`)
              .join(", ")} (all hostile-residual)`;
        warnWithSeverity(
          `rebuttal_does_not_land:slide_${slide.slide_number}:${resp.segment_id}`,
          `Slide ${slide.slide_number} addresses objection(s) sourced from segment '${resp.segment_id}' but predicts that segment will ${trigger}. A rebuttal that lands should reduce hostility/resistance, not preserve it.`,
          "should"
        );
      }
    });
  });

  // Pass 3 M1 — extracted to findAntiEnvelopeWarnings.
  out.push(...findAntiEnvelopeWarnings(deck));

  /* (Original mechanized-rules block deleted; see section 21.7a.) */
  /* ===== begin removed block (kept only as a comment guard) =====
   * Mechanized response-soundness rules (W14–W18)
   *
   * For each declared (slide, segment, response), compute a context
   * vector from observable signals in the deck:
   *
   *   - position           — slide_number / total_slides
   *   - addresses_my_obj   — does slide address an objection sourced
   *                          from this segment?
   *   - max_evidence_str   — strongest evidence item referenced by
   *                          this slide ('low' / 'medium' / 'high' /
   *                          'none')
   *   - is_risk_role       — slide.role_in_deck === "risk"
   *   - provocation_active — deck.persuasion_plan uses "provocation"
   *                          as primary or supporting strategy
   *   - segment_attitude   — segment.attitude
   *   - decision_power     — segment.decision_power
   *
   * Then apply rules of the form:
   *
   *   "given context C, declared emotion E is implausible because
   *    no realistic mechanism in C produces E."
   *
   * Each rule fires only when *strongly* contradicted (we model the
   * anti-envelope, not the most-likely point), so authors aren't
   * penalised for non-modal-but-defensible predictions. Predictions
   * with confidence: "low" are exempt (existing escape hatch).
   *
   * Each warning cites the active rule AND the context features that
   * triggered it, so the author can see exactly which signals the
   * schema disagreed with.
   * ============================================================ */


  // (W10) When the deck demands a decision, at least one decision-
  // powerful segment must reach a decision-class reaction *somewhere*
  // in the deck. Otherwise the deck is asking for a yes/no it never
  // lets the audience give.
  const decisionOutcomes = new Set([
    "decision",
    "approval",
    "funding",
    "next_step_authorization",
    "strategic_commitment",
    "behavior_change",
    "rejection_or_elimination",
  ]);
  if (
    decisionOutcomes.has(deck.objective.desired_outcome) &&
    decisionPowerful.size > 0
  ) {
    // Pass 3 C1 — restrict to decision/recommendation slides. The
    // earlier rule looked at all slides; a `take_notes` reaction
    // predicted on slide 3 satisfied "the room takes a position",
    // even though the actual decision moment (slide 10) could be
    // empty. Decisions are taken at decision-role slides; that's
    // the only place this check is meaningful.
    const decisionRoleSlides = deck.slide_plan.filter(
      (s) =>
        s.role_in_deck === "decision" || s.role_in_deck === "recommendation"
    );
    const decisionRolePredictions = decisionRoleSlides.flatMap((s) =>
      s.expected_audience_responses.map((r) => ({
        slide_number: s.slide_number,
        ...r,
      }))
    );

    // Whole-deck check: if NO slide in the entire deck has any
    // prediction at all, we can't evaluate reach — stay silent.
    const anyPredictionAtAll = deck.slide_plan.some(
      (s) => s.expected_audience_responses.length > 0
    );
    if (anyPredictionAtAll) {
      // Block 1 #2 — outcome reactions specifically (engagement is
      // not enough at the decision moment).
      const anyOutcomeAtDecisionSlide = decisionRolePredictions.some(
        (r) =>
          decisionPowerful.has(r.segment_id) &&
          r.confidence !== "low" &&
          r.expected_reactions.some((rx) =>
            DECISION_OUTCOME_REACTIONS.has(rx)
          )
      );
      if (!anyOutcomeAtDecisionSlide) {
        // Pass 3 C1: name the rule precisely. If decision-role slides
        // exist but don't carry a decision-outcome reaction → W10b.
        // If no decision-role slides at all, fall back to W10 (legacy).
        if (decisionRoleSlides.length > 0) {
          warnWithSeverity(
            "no_decision_reaction_at_decision_slide",
            `objective.desired_outcome is "${deck.objective.desired_outcome}" but no decision-role slide (${decisionRoleSlides
              .map((s) => `slide ${s.slide_number}`)
              .join(
                ", "
              )}) predicts an approver / final_decision_maker producing a decision-outcome reaction (${[
              ...DECISION_OUTCOME_REACTIONS,
            ].join(", ")}). The deck asks for a decision the room is never predicted to give *at the decision moment*.`,
            "must"
          );
        } else {
          warnWithSeverity(
            "no_decision_reaction_anywhere",
            `objective.desired_outcome is "${deck.objective.desired_outcome}" but the deck has no decision-role or recommendation-role slide. Add one or revise the desired_outcome.`,
            "must"
          );
        }
      }
    }
  }

  return out;
}

/* ---------------------------------------------------------------
 * deriveCaseFeatures — Pass 3 M8.
 *
 * Pure function. Inputs are observable; output is deterministic.
 * --------------------------------------------------------------- */
function deriveCaseFeatures(deck: Deck): CaseFeaturesReport {
  // Controversy: hostile/skeptical aggregate audience adds weight,
  // each must-severity objection adds weight.
  let controversyScore = 0;
  if (deck.audience.attitude === "hostile") controversyScore += 2;
  else if (
    deck.audience.attitude === "skeptical" ||
    deck.audience.attitude === "divided"
  )
    controversyScore += 1;
  const mustObj = deck.audience.likely_objections.filter(
    (o) => o.severity === "must"
  ).length;
  controversyScore += Math.min(mustObj, 3); // cap so 100 objections
  // doesn't dwarf attitude.
  const controversy_level: CaseFeaturesReport["controversy_level"] =
    controversyScore >= 4 ? "high" : controversyScore >= 2 ? "medium" : "low";

  // Evidence balance: histogram by strength.
  const evidence_balance = {
    high: deck.evidence.filter((e) => e.strength === "high").length,
    medium: deck.evidence.filter((e) => e.strength === "medium").length,
    low: deck.evidence.filter((e) => e.strength === "low").length,
  };

  // Pressure: decision-class outcome × decision power.
  const decisionOutcomes = new Set([
    "decision",
    "approval",
    "funding",
    "next_step_authorization",
    "strategic_commitment",
    "rejection_or_elimination",
  ]);
  const isDecisionAsk = decisionOutcomes.has(deck.objective.desired_outcome);
  const hasFinalDecider =
    deck.audience.decision_power === "final_decision_maker" ||
    deck.audience.segments.some(
      (s) => s.decision_power === "final_decision_maker"
    );
  const hasApprover = deck.audience.segments.some(
    (s) => s.decision_power === "approver"
  );
  let pressure: CaseFeaturesReport["pressure"] = "low";
  if (isDecisionAsk && hasFinalDecider) pressure = "high";
  else if (isDecisionAsk && hasApprover) pressure = "medium";
  else if (isDecisionAsk) pressure = "medium";
  else pressure = "low";

  const rationale =
    `controversy_level=${controversy_level} (audience.attitude="${deck.audience.attitude}", ${mustObj} must-severity objection(s)); ` +
    `evidence_balance: ${evidence_balance.high} high + ${evidence_balance.medium} medium + ${evidence_balance.low} low; ` +
    `pressure=${pressure} (desired_outcome="${deck.objective.desired_outcome}", final_decision_maker present: ${hasFinalDecider}).`;

  return CaseFeaturesReportSchema.parse({
    controversy_level,
    evidence_balance,
    pressure,
    rationale,
  });
}

export function validateBusinessDeck(
  parsed: BusinessDeck
): ValidationReportWithSolidity {
  const deck = parsed.deck;
  const constraintResults = evaluateConstraints(deck, deck.constraints);

  // Build claim provenance and emit per-claim sufficiency warnings.
  const claim_provenance = buildClaimProvenance(deck);
  const provenanceResults: z.infer<typeof ValidationResultSchema>[] =
    claim_provenance
      .filter((e) => e.coverage === "uncovered" || e.coverage === "weak")
      .map((e) => ({
        constraint_id: `claim_provenance:${e.claim_id}`,
        status: "warning" as const,
        severity: "should" as const,
        explanation:
          `Claim '${e.claim_id}' ("${e.claim_text.slice(0, 60)}") ` +
          `has ${e.coverage} evidence support ` +
          `(${e.supporting_evidence_ids.length} item(s) — ` +
          `add evidence with strength "medium" or "high" to resolve).`,
      }));

  // Case solidity (only when posture === "case" AND deck.case is present).
  let case_solidity: CaseSolidityReport | undefined;
  let caseWarnings: z.infer<typeof ValidationResultSchema>[] = [];
  if (deck.presentation_posture === "case" && deck.case) {
    const built = buildCaseSolidity(deck);
    case_solidity = built.report;
    caseWarnings = built.warnings;
  }

  const softWarnings = buildSoftWarnings(deck);
  const results = [
    ...constraintResults,
    ...provenanceResults,
    ...caseWarnings,
    ...softWarnings,
  ];

  // (L4) Retracted documents must not validate as "valid" regardless
  // of structural quality. A retracted deck is, by author's own
  // declaration, no longer authoritative — surfacing it as valid
  // would invite reuse.
  const retracted =
    deck.document_authorship?.publication_status === "retracted";
  if (retracted) {
    results.push({
      constraint_id: "publication_status_retracted",
      status: "fail",
      severity: "must",
      explanation:
        `document_authorship.publication_status is "retracted" — the deck is not authoritative and cannot validate as valid.`,
    });
  }

  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warning");

  let overall_status: "valid" | "valid_with_warnings" | "invalid";
  if (failed.length > 0) {
    overall_status = "invalid";
  } else if (warned.length > 0) {
    overall_status = "valid_with_warnings";
  } else {
    overall_status = "valid";
  }

  const summary =
    `${results.filter((r) => r.status === "pass").length} pass, ` +
    `${warned.length} warning, ` +
    `${failed.length} fail, ` +
    `${results.filter((r) => r.status === "not_applicable").length} not_applicable` +
    (case_solidity ? ` | case_solidity: ${case_solidity.grade}` : "");

  const baseReport = ValidationReportSchema.parse({
    overall_status,
    results,
    summary,
    claim_provenance,
  });
  // Pass 3 M8 — surface derived case features alongside solidity.
  const case_features = deriveCaseFeatures(deck);
  const extended: ValidationReportWithSolidity = {
    ...baseReport,
    case_features,
  };
  if (case_solidity) extended.case_solidity = case_solidity;
  return extended;
}

/* =====================================================
 * 23. Known limitations (deliberately out of scope)
 *
 *  - Domain extension mechanism for non-business decks.
 * These are tracked here to make the scope of *this* schema
 * explicit. Adding any of them is a new piece of work, not a
 * defect of the current draft.
 * ===================================================== */