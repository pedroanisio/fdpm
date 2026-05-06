# Business-Deck Schema — Quick Reference

Compact reference for the FDPM business-deck schema. The source of truth
is `static/schemas/business-deck.ts`. Read it first if any field's
semantics are unclear; this document summarizes but cannot replace it.

---

## Top-level deck shape

```typescript
{
  deck: {
    id: string,
    title: string,
    subtitle?: string,
    description?: string,
    version?: string,
    language?: string,                      // legacy; superseded by localization
    target_duration_minutes?: number,

    // REQUIRED — pick first, gate other requirements
    presentation_posture: "case" | "briefing" | "story" | "workshop",
    delivery_mode: "presented_live" | "shared_async" | "hybrid",

    objective: ObjectiveSchema,             // required
    audience: AudienceSchema,               // required
    message_strategy: MessageStrategySchema, // required (carries star_moment)
    narrative_model: NarrativeModelSchema,   // required (progression[])
    conceptual_structure: ConceptualStructureSchema, // required
    information_architecture: InformationArchitectureSchema, // required

    evidence: Evidence[],                   // default []; each has warrant?
    risks: Risk[],                          // default []
    decision_frame?: DecisionFrameSchema,
    persuasion_plan?: PersuasionPlanSchema,
    slide_plan: Slide[],                    // required, min 1
    visual_artifacts: VisualArtifact[],     // default []
    design_system?: DesignSystemSchema,
    quality_rules: QualityRule[],           // default []
    constraints: DeckConstraint[],          // default = BuiltInBusinessConstraints
    speaker_plan?: SpeakerPlanSchema,
    success_criteria: SuccessCriteriaSchema, // required
    variants: DeckVariant[],                // default []
    localization?: LocalizationPipelineSchema,

    // Posture-gated layers
    case?: CaseSchema,                      // required when posture === "case"
    document_authorship?: DocumentAuthorshipSchema, // required when delivery_mode != "presented_live"
    decision_capture?: DecisionCaptureSchema, // required when shared_async + decision outcome
    reader_navigation?: ReaderNavigationSchema, // required when delivery_mode != "presented_live"

    // Sales-context layer (16.8) — all optional
    buyer_journey_stage?: BuyerJourneyStage,
    account_context?: AccountContextSchema,
    pain_points: PainPoint[],               // default []
    solution_mapping: CapabilityMapping[],  // default []
    commercial_model?: CommercialModelSchema,
  }
}
```

Note: `validation_report` is OUTPUT, not input. Removed from the input
schema in Pass 2 to prevent foot-guns.

---

## Branded IDs (typo-safe references)

Every cross-reference in the schema uses a branded string type. A typo
becomes a parse-time fail, not a silent join break.

| Brand | Used by | Resolves against |
|---|---|---|
| `ClaimId` | `core_claim.id`, `supporting_claims[].id`, `parent_claim_id`, `claims_supported[]`, `differentiation_claim_ids[]`, `supports_claim_ids[]`, `speaks_for_claim_ids[]`, `must_prove[]`, `proof_chain[].claim_id` | `message_strategy.{core_claim, supporting_claims}` |
| `EvidenceId` | `proof_evidence_ids[]`, `exhibit_ids[]`, `fallback_evidence_ids[]`, `uses_evidence_ids[]`, `references_evidence_ids[]` | `deck.evidence[]` |
| `RiskId` | `option.risk_ids[]`, `commercial_risks[]`, `phase.risks[]` | `deck.risks[]` |
| `OptionId` | `recommended_option_id` | `decision_frame.options[]` |
| `EntityId` | `relationship.from/to`, `layer.entities[]` | `information_architecture.entities[]` |
| `VisualArtifactId` | `content_block.visual_artifact_id` | `deck.visual_artifacts[]` |
| `ObjectionId` | `addresses_objection_ids[]`, `triggered_by_objection_id`, `preempts_objection_id`, `addresses_objection_id` | `audience.likely_objections[]` |
| `PersuasionStrategyId` | `persuasion_sequence[].strategy_id` | `persuasion_plan.{primary_strategy, supporting_strategies}` |
| `PresenterId` | `witness_id` | `speaker_plan.presenters[]` |
| `ExpectedQuestionId` | (just identity) | `speaker_plan.q_and_a.expected_questions[]` |
| `SegmentId` | `segment_id`, `segment_ids[]`, `source_segment_id`, `affected_persona_ids[]`, `required_responders[]` | `audience.segments[]` |
| `PainPointId` | `addresses_pain_point_ids[]` | `deck.pain_points[]` |

---

## Enums quick reference

### Severity / confidence / strength
- `SeveritySchema`: `must / should / nice_to_have`
- `ConfidenceSchema`: `low / medium / high` (also used for evidence.strength)
- `ImportanceSchema`: `primary / secondary / supporting / background`
- `KnowledgeLevelSchema`: `none / low / medium / high / expert`

### Posture / delivery
- `PresentationPostureSchema`: `case / briefing / story / workshop`
- `DeliveryModeSchema`: `presented_live / shared_async / hybrid`
- `RehearsalStateSchema`: `unrehearsed / walked / dress_rehearsed / live_proven / read_tested`

### Objective
- `DeckIntentSchema`: `inform / explain / persuade / align / teach / compare / decide / warn / inspire / provoke / summarize / mobilize`
- `DesiredOutcomeSchema`: `understanding / approval / decision / funding / alignment / behavior_change / strategic_commitment / risk_awareness / next_step_authorization / rejection_or_elimination`

### Audience
- `AudienceTypeSchema`: `executive / technical / business / mixed / regulatory / customer / investor / internal_team / public` (no `expert` / `non_expert` — Pass 2 H1)
- `AudienceAttitudeSchema`: `supportive / neutral / curious / skeptical / hostile / uninformed / divided`
- `ComplexityToleranceSchema`: `low / medium / high`

### Sales-context
- `BuyerRoleSchema`: `economic_buyer / technical_buyer / champion / user_buyer / procurement / legal / security / executive_sponsor / blocker / influencer`
- `BuyerJourneyStageSchema`: `discovery / qualification / solution_pitch / business_case / technical_validation / procurement / renewal / expansion`
- `OptionKindSchema`: `recommended / rejected / fallback / status_quo / direct_competitor / internal_build / manual_process / do_nothing / adjacent_solution`
- `PainSeveritySchema`: `low / medium / high / critical`

### Claims / evidence
- `ClaimKindSchema`: `core / supporting / sub / action` (Pass 5: `action` excluded from rule-of-three counter)
- `ClaimCoverageSchema`: `uncovered / weak / partial / sufficient`
- `EvidenceTypeSchema`: `data / example / case_study / expert_opinion / benchmark / financial_model / technical_analysis / user_research / experiment / logical_argument / scenario_analysis / risk_analysis / comparison_matrix`
- `ProofStandardSchema`: `preponderance / clear_and_convincing / beyond_doubt`

### Narrative / persuasion
- `NarrativePatternSchema`: 15 values incl. `problem_solution / context_problem_proposal / claim_evidence_decision / case_for_change / risk_assessment / provocation_resolution`
- `NarrativeFunctionSchema`: 20 values for progression step roles
- `MentalModelSchema`: 17 values incl. `flow / stack / matrix / decision_tree / system / cause_effect`
- `FramingAngleSchema`: `opportunity / risk / cost / efficiency / innovation / control / quality / growth / urgency / simplicity / tradeoff / transformation / comparison / exploration / learning`
- `ToneSchema`: `neutral / analytical / executive / technical / educational / provocative / visionary / urgent / cautious / persuasive`
- `PersuasionStrategyTypeSchema`: 17 values incl. `logos_reasoning / risk_avoidance / opportunity_capture / tradeoff_transparency / provocation / social_proof / authority_based / loss_aversion`
- `RhetoricalMoveSchema`: 17 values incl. `define_problem / state_claim / show_evidence / address_objections / show_tradeoffs / make_decision_ask`

### Audience response
- `ExpectedEmotionSchema`: 14 values incl. `curiosity / interest / validation / relief / trust / discomfort / boredom / confusion / agreement / skepticism / resistance / hostility / alarm / surprise`
- `ExpectedReactionSchema`: 16 values
  - Decision-OUTCOME: `approve / defer / commit / abstain / reject`
  - Decision-ENGAGEMENT: `request_more_info / ask_challenging_question / ask_clarifying_question`
  - Cognitive: `take_notes / push_back / drop_objection / accept_framing`
  - Body language: `lean_in / lean_back / nod / interrupt`

### Slide structure
- `SlideRoleSchema`: 18 values incl. `opening / problem / definition / model / evidence / tradeoff / risk / objection / option / recommendation / decision / closing / appendix`
- `LayoutSchema`: 14 values; `table` is **NOT** a value — use `two_column` or `three_column` for tabular layouts
- `ContentBlockTypeSchema`: 16 values incl. `headline / text / diagram / chart / table / matrix / timeline / flow / callout / quote / example / evidence / risk / recommendation / decision / summary`

---

## Required + recommended + optional fields per substructure

### Slide (`SlideSchema`)
```typescript
{
  slide_number: positive int,                 // REQUIRED, unique
  title: string,                              // REQUIRED, declarative (Action Title)
  role_in_deck: SlideRole,                    // REQUIRED
  key_message: string,                        // REQUIRED
  audience_question_answered: string,         // REQUIRED
  content_blocks: ContentBlock[],             // REQUIRED, min 1
  visual_strategy: SlideVisualStrategy,       // REQUIRED
  speaker_intent?: string,                    // recommended
  supports_claim_ids: ClaimId[],              // default []
  uses_evidence_ids: EvidenceId[],            // default []
  addresses_objection_ids: ObjectionId[],     // default []
  rhetorical_moves: RhetoricalMove[],         // default []
  narrative_steps: number[],                  // default []; each must resolve
  expected_audience_responses: AudienceResponse[], // default []
}
```

### Evidence (`EvidenceSchema`)
```typescript
{
  id: EvidenceId,                             // REQUIRED, unique
  claims_supported: ClaimId[],                // REQUIRED, min 1
  evidence_type: EvidenceType,                // REQUIRED
  summary: string,                            // REQUIRED
  source?: string,                            // recommended
  strength: Confidence,                       // default "medium"
  warrant?: string,                           // RECOMMENDED for medium-strength under preponderance+
}
```

### Claim (`ClaimSchema`)
```typescript
{
  id: ClaimId,                                // REQUIRED, unique
  kind: ClaimKind,                            // REQUIRED ("core" / "supporting" / "sub" / "action")
  text: string,                               // REQUIRED
  parent_claim_id?: ClaimId,                  // recommended for non-core
  qualifier?: string,                         // RECOMMENDED for non-tautological claims
}
```

### Objection (`ObjectionSchema`)
```typescript
{
  id: ObjectionId,                            // REQUIRED
  text: string,                               // REQUIRED
  severity: Severity,                         // default "should"
  source_segment_id?: SegmentId,              // RECOMMENDED, must resolve
  counter_argument?: string,                  // recommended
}
```

### Audience response (`AudienceResponseSchema`)
```typescript
{
  segment_id: SegmentId,                      // REQUIRED, must resolve
  expected_emotion: ExpectedEmotion,          // REQUIRED
  secondary_emotion?: ExpectedEmotion,
  expected_reactions: ExpectedReaction[],     // default []
  if_off_target?: string,                     // recommended for high-stakes slides
  confidence: Confidence,                     // default "medium"; "low" exempts from W14–W18
}
```

### Audience segment (`AudienceSegmentSchema`)
```typescript
{
  id: SegmentId,                              // REQUIRED
  label: string,                              // REQUIRED
  audience_type: AudienceType,                // REQUIRED
  prior_knowledge: KnowledgeLevel,            // REQUIRED
  attitude: AudienceAttitude,                 // REQUIRED
  complexity_tolerance: ComplexityTolerance,  // REQUIRED
  decision_power: DecisionPower,              // REQUIRED
  what_they_need_to_believe: string[],        // default []

  // Sales-context optional extensions
  buyer_role?: BuyerRole,
  priorities: string[],
  fears: string[],
  success_criteria: string[],

  // JTBD jobs (Pass 5 S6)
  functional_jobs: string[],
  emotional_jobs: string[],
  social_jobs: string[],
}
```

### Case (`CaseSchema`) — required when posture === "case"
```typescript
{
  theory_of_case: string,                     // REQUIRED
  burden_of_proof: {
    standard: ProofStandard,                  // REQUIRED
    must_prove: ClaimId[],                    // REQUIRED, min 1
    proof_chain: { claim_id, evidence_ids }[],// REQUIRED if non-empty: must cover every must_prove
  },
  stipulations: Stipulation[],                // default []; recommended ≥3
  order_of_proof: OrderOfProofStep[],         // REQUIRED, min 1, every slide must be in some step
  rebuttal_posture: RebuttalPostureItem[],    // default []
  closing_arc: ClosingArc,                    // REQUIRED
  rehearsal_state: RehearsalState,            // REQUIRED
}
```

### Pain point + capability mapping (sales-context, 16.8)
```typescript
PainPoint = {
  id: PainPointId,
  description: string,
  affected_persona_ids: SegmentId[],
  severity: PainSeverity,
  current_cost_or_impact?: string,
}

CapabilityMapping = {
  capability: string,
  addresses_pain_point_ids: PainPointId[],
  proof_evidence_ids: EvidenceId[],
  limitation_or_caveat?: string,
}
```

---

## Soft-warning constraint_id catalog

All emitted by `validateBusinessDeck()`. Severity in parentheses.

### Structural / quality
- `orphan_visual_artifact:<id>` (`should`) — visual not referenced
- `time_budget_target_duration_mismatch` (`should`) — totals diverge
- `presenter_coverage_gap` (`should`) — slides not delivered (live mode)
- `audience_aggregate_attitude_mismatch` (`should`) — deck-level vs segments
- `closing_decision_mismatch` (`should`) — closing_arc vs objective
- `shape_enum_divergence:dominant` / `:secondary[N]` (`should`) — model-vs-layout mismatch
- `narrative_step_non_contiguous` (`should`) — gaps in progression steps

### Audience-response coherence (W8–W10)
- `decision_slide_no_decision_powerful_prediction:slide_N` (`should`)
- `decision_slide_no_decision_reaction:slide_N` (`must`)
- `decision_slide_engagement_only:slide_N` (`should`)
- `rebuttal_does_not_land:slide_N:segment_id` (`should`)
- `no_decision_reaction_at_decision_slide` (`must`)
- `no_decision_reaction_anywhere` (`must`)

### Mechanized anti-envelope (W14–W18)
- `w14_initial_attitude_unrealistic:slide_N:segment_id` (`must`)
- `w15_rebuttal_without_evidence:slide_N:segment_id` (`should`)
- `w16_risk_bystander_positive:slide_N:segment_id` (`should`)
- `w17_provocation_premature_agreement:slide_N:segment_id` (`must`)
- `w18_high_evidence_passive_reaction:slide_N:segment_id` (`nice_to_have`)
- `audience_response_emotion_without_reactions:slide_N:segment_id` (`nice_to_have`)

### Pass 5 (Minto)
- `action_title_missing:slide_N` (`should`)
- `supporting_claims_count_high` (`should`)

### Sales-context (16.8)
- `critical_pain_unaddressed:<pain_id>` (`should`)
- `capability_without_pain:<index>` (`should`)

### Localization
- `localization_source_text_stale:<bcp47>:<field_path>` (`should`)

### Claim provenance
- `claim_provenance:<claim_id>` (`should`) — uncovered or weak

### Case-solidity (when posture === "case")
- `case_solidity:rebuttal_fallback_thin` (`should`)
- `case_solidity:no_stipulations_for_skeptical_audience` (`should`)
- `case_solidity:rehearsal_below_standard` (`should`)
- `case_solidity:closing_callback_missing` (`should`)
- `case_solidity:time_concentration:order_N` (`should`)

### Validation-fail (output is `overall_status: "invalid"`)
- `publication_status_retracted` (`must`-severity FAIL)

---

## Built-in constraint catalog (declarative DSL)

13 entries in `BuiltInBusinessConstraints`. Each has `condition` (when
applicable), `requirement` (what must be true), `severity`. Entries:

1. `decision_requires_options` (`must`)
2. `persuasion_requires_evidence_path` (`must`)
3. `recommendation_requires_rationale` (`must`)
4. `comparison_requires_dimensions` (`must`)
5. `skeptical_audience_requires_objection_handling` (`must`)
6. `executive_audience_requires_decision_relevance` (`should`)
7. `low_knowledge_requires_definition_before_complexity` (`must`)
8. `provocation_requires_resolution` (`must`)
9. `risk_strategy_requires_impact_and_mitigation` (`must`)
10. `opportunity_strategy_requires_capture_path` (`must`)
11. `tradeoff_strategy_requires_explicit_criteria` (`must`)
12. `warning_deck_requires_risks` (`must`)
13. `hostile_segment_requires_tradeoff_and_objection` (`must`) — added Pass 3 L5

Authors can override `deck.constraints` to add/remove rules.

---

## Built-in persuasion strategies

`BuiltInPersuasionStrategies` ships 5 entries. Use via:
```typescript
const getStrategy = (id: BuiltInPersuasionStrategyId) =>
  BuiltInPersuasionStrategies.find((s) => s.id === id)!;
```

| ID | Strategy type | Best for |
|---|---|---|
| `logos_reasoning` | logos_reasoning | technical / executive / mixed |
| `risk_avoidance` | risk_avoidance | executive / regulatory / business |
| `opportunity_capture` | opportunity_capture | executive / investor / business / customer |
| `tradeoff_transparency` | tradeoff_transparency | executive / technical / mixed |
| `provocation` | provocation | executive / mixed |

`BuiltInPersuasionStrategyIdSchema` is the runtime z.enum (Pass-Block-1 #3).

---

## Validation entry points

```typescript
import {
  BusinessDeckSchema,             // structural shape, no integrity rules
  RefinedBusinessDeckSchema,      // shape + must-level invariants (use this)
  validateBusinessDeck,           // full quality report w/ case_solidity
  ValidationReportWithSolidity,   // return type
  CaseSolidityReport,
  CaseFeaturesReport,
} from "./static/schemas/business-deck";

// Author input (raw):
type DeckInput = z.input<typeof BusinessDeckSchema>;

// Validation:
const parsed = RefinedBusinessDeckSchema.parse(deckInput);  // throws on must-fail
const report = validateBusinessDeck(parsed);

// Inspect:
report.overall_status;       // "valid" | "valid_with_warnings" | "invalid"
report.summary;              // "N pass, M warning, K fail, J n/a | case_solidity: <grade>"
report.case_solidity?.grade; // "inadmissible" | "weak" | "adequate" | "strong" | "airtight"
report.case_features;        // controversy_level / evidence_balance / pressure / rationale
report.results;              // ValidationResult[] — filter by constraint_id prefix
```

---

## File structure (skill scope)

```
static/
├── schemas/
│   └── business-deck.ts                    # SOURCE OF TRUTH (~5,500 lines)
├── fixtures/
│   ├── business-deck-dos-5_2.ts            # case + presented_live, no sales context
│   └── sales-deck-fdpm.ts                  # case + presented_live + full sales context
└── tests/
    └── business-deck.regression.test.ts    # 81 tests, behavioral contract
```

When in doubt, **read the schema**. This reference summarizes — it does
not replace.
