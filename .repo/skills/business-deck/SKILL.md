---
name: business-deck
description: >
  Create, validate, and improve instances of the FDPM business-deck schema
  — a typed Zod schema for planning business / strategic-communication decks
  (pitch decks, exec updates, board reviews, investment cases, decision memos,
  internal proposals, regulatory briefings, customer business reviews, sales
  presentations). Use this skill whenever the user asks to "draft a deck",
  "plan a presentation", "build a pitch", "create a sales deck", "write a
  board deck", "design an investment-case deck", "validate this deck",
  "score the case solidity", "check audience predictions", or any variation
  of authoring or auditing a structured presentation plan. Also trigger when
  the user references the schema files at static/schemas/business-deck.ts,
  the validation report (`validateBusinessDeck`), the case-solidity grade,
  the W14–W18 anti-envelope rules, the sales-context layer (pain points,
  capability mapping, commercial model, account context), or fixtures
  business-deck-dos-5_2.ts / sales-deck-fdpm.ts. If the user uploads a
  presentation outline and asks for it to be modeled into the schema, use
  this skill.
---

# Business Deck — Skill

This skill enables agents to author and validate well-formed instances of
the **FDPM business-deck schema** (~5,500 lines of Zod). The schema is not
just a structural shape — it carries first-class concepts for claims,
evidence, objections, audience segments, persuasion strategy, case posture,
sales context, audience-response prediction, and a multi-layer validator
that emits a **case_solidity** grade plus mechanized anti-envelope warnings.

## 0. Before You Begin

**Always inspect the live schema before authoring.** The schema evolves;
do not rely on memory.

```
static/schemas/business-deck.ts          # ~5,500 lines, single source of truth
static/fixtures/business-deck-dos-5_2.ts # canonical case posture / live delivery
static/fixtures/sales-deck-fdpm.ts       # sales-context / first-partner offer
static/tests/business-deck.regression.test.ts  # 81 tests, the contract
```

The schema header (lines 1–60 of `business-deck.ts`) documents the
**three-layer validation architecture** that this skill must respect:

1. **Declarative constraint catalog** (`BuiltInBusinessConstraints`,
   `evaluateConstraints`)
2. **Imperative hard validators** (`checkReferentialIntegrity`,
   `checkUniqueness`, `checkPostureAndDelivery`,
   `findAntiEnvelopeWarnings`)
3. **Soft-warning builders** (`buildSoftWarnings`, `buildCaseSolidity`,
   `buildClaimProvenance`, `deriveCaseFeatures`)

If a violation must reject the deck → catalog or imperative.
If the deck is still usable but the author should see a signal → soft.

Read the **constraint-id reference** in section 21.65 of the schema for
every soft-warning prefix the validator emits. Filter or address by
`constraint_id`.

## 1. Authoring Workflow

### Phase 1 — Decide posture and delivery first

These two fields are required and gate which other fields the schema
requires. Pick them before touching anything else.

| `presentation_posture` | When to choose |
|---|---|
| `case` | Argumentative proof: claim, burden, rebuttal posture. Required for decision-asking decks. |
| `briefing` | Informational: status, context, no decision ask. |
| `story` | Narrative-led: arc, characters, transformation. |
| `workshop` | Collaborative: prompts, exercises, co-creation. |

| `delivery_mode` | What it requires |
|---|---|
| `presented_live` | `speaker_plan` required. |
| `shared_async` | `document_authorship` + `reader_navigation` required; `decision_capture` if outcome demands a response; `q_and_a_minutes` must be 0; rebuttals must be `inline_in_slide_number`. |
| `hybrid` | Both `speaker_plan` and `reader_navigation` required. |

When `presentation_posture: "case"`, the `case` block becomes required
and includes: `theory_of_case`, `burden_of_proof` (with `proof_chain`),
`stipulations`, `order_of_proof`, `rebuttal_posture`, `closing_arc`,
`rehearsal_state`. See section 16.7 of the schema.

### Phase 2 — Scaffold the structural backbone

Build the deck skeleton in this order. Each step assumes prior steps
are complete; the validator checks references across all of these.

1. `objective` — `primary_intent`, `desired_audience_shift.from/to`,
   `desired_outcome`, `decision_or_action_requested`, `success_definition`
2. `audience` — top-level `attitude` + `prior_knowledge` + named
   `segments[]` with `decision_power`, `buyer_role` (sales-context),
   `priorities`, `fears`, `success_criteria`, optionally `functional_jobs /
   emotional_jobs / social_jobs`
3. `audience.likely_objections[]` — first-class with branded `id`,
   `severity` (must / should / nice_to_have), `source_segment_id` (must
   resolve to `audience.segments[].id`), `counter_argument`
4. `message_strategy.core_claim` — `kind: "core"`, branded `id`,
   `text`, optional `qualifier` (Toulmin Modality)
5. `message_strategy.supporting_claims[]` — peer architectural pillars
   with `kind: "supporting"`. Use `kind: "action"` for recommendation-
   layer claims to exempt them from the rule-of-three counter
6. `narrative_model` — `narrative_pattern` + `progression[]` (steps
   contiguous from `min(step)`)
7. `evidence[]` — each item carries `claims_supported[]` (must resolve),
   `evidence_type`, `summary`, `strength`, optional `warrant` (Toulmin
   Warrant — strongly recommended for medium-strength evidence under
   non-trivial burdens)
8. `risks[]` — `likelihood / impact / mitigation / owner`
9. `slide_plan[]` — see Phase 3
10. `decision_frame.options[]` — each carries `kind` discriminator
    (`recommended` / `rejected` / `fallback` / `status_quo` /
    `direct_competitor` / `internal_build` / etc.) and
    `differentiation_claim_ids[]`
11. `case` block (when posture === `case`) — see Phase 4

### Phase 3 — Slide plan with audience-response predictions

Each slide carries:

```typescript
{
  slide_number: number,                  // unique
  title: string,                         // declarative sentence (Minto Action Title)
  role_in_deck: SlideRole,               // opening / problem / definition / model /
                                         // evidence / tradeoff / risk / objection /
                                         // recommendation / decision / appendix / ...
  key_message: string,
  audience_question_answered: string,
  narrative_steps: number[],             // each must resolve to progression[].step
  content_blocks: ContentBlock[],        // type / purpose / content_summary;
                                         // visual_artifact_id must resolve
  visual_strategy: { layout, density, focal_point, visual_hierarchy },
  speaker_intent?: string,
  supports_claim_ids: ClaimId[],
  uses_evidence_ids: EvidenceId[],
  addresses_objection_ids: ObjectionId[],
  rhetorical_moves: RhetoricalMove[],
  expected_audience_responses: AudienceResponse[],  // see below
}
```

**Action Title rule (Minto, Pass 5 S3)**: titles must contain a verb.
The validator emits `action_title_missing:slide_N` when a non-appendix
slide title has no recognizable verb. Rewrite topic labels as
declarative sentences:
- Bad: "Three failure modes, named"
- Good: "Audit, attention, and cold-start are blocking your agent rollout today"

**Audience-response predictions** (per slide, per segment): optional
but powerful. When present, the W8–W10 + W14–W18 rules check coherence:

```typescript
{
  segment_id: SegmentId,                 // must resolve
  expected_emotion: ExpectedEmotion,     // 14-value enum
  secondary_emotion?: ExpectedEmotion,
  expected_reactions: ExpectedReaction[], // 16-value enum
  if_off_target?: string,
  confidence: "low" | "medium" | "high", // "low" exempts from W9, W14–W18
}
```

The mechanized anti-envelope rules (W14–W18) deduce a context vector
per `(slide, segment, response)` tuple from observable signals
(slide position, role, evidence strength, addressed objections, segment
attitude, decision power, persuasion strategy) and warn when the
declared emotion/reactions are *strongly contradicted*. Authors who
disagree with a rule's verdict can set `confidence: "low"` to suppress
the warning.

Decision-class reactions (`approve / defer / commit / abstain / reject`)
are distinct from engagement reactions (`request_more_info /
ask_challenging_question / ask_clarifying_question`). W8 and W10 use
the **outcome** set specifically — engagement-only on a decision slide
fires the softer `decision_slide_engagement_only` warning.

### Phase 4 — Case layer (posture === "case")

```typescript
case: {
  theory_of_case: string,                // one-line frame
  burden_of_proof: {
    standard: "preponderance" | "clear_and_convincing" | "beyond_doubt",
    must_prove: ClaimId[],               // must include core_claim or a peer
    proof_chain: { claim_id, evidence_ids[] }[]  // must cover every must_prove
  },
  stipulations: { id, point_conceded, rationale, preempts_objection_id? }[],
  order_of_proof: {                      // every slide must belong to a section
    order, section_label, purpose,
    slide_numbers[],
    narrative_steps[],
    persuasion_sequence_orders[],
    witness_id?: PresenterId,
    exhibit_ids: EvidenceId[],
    time_allocation_minutes?: number,
    expected_reading_minutes?: number,
  }[],
  rebuttal_posture: {
    id, anticipated_attack,
    triggered_by_objection_id?,
    rebuttal,
    fallback_evidence_ids: EvidenceId[],
    pivot_to_slide?: number,
    inline_in_slide_number?: number,     // required when delivery_mode is shared_async
  }[],
  closing_arc: {
    final_belief_target,
    callback_to_opening?,
    decision_demanded,
    anchored_in_slide_number?,           // required when delivery_mode != presented_live
  },
  rehearsal_state: "unrehearsed" | "walked" | "dress_rehearsed" |
                   "live_proven" | "read_tested",
}
```

**Solidity gates (parse-time, see section 20.4 / S1–S5):**

- **S1** — proof_chain completeness: when non-empty, must cover every claim in must_prove.
- **S2** — burden vs. evidence strength:
  - `preponderance` → ≥1 medium-or-high
  - `clear_and_convincing` → ≥1 high OR ≥2 medium
  - `beyond_doubt` → ≥1 high
- **S3** — every must-severity objection must be either rebutted or stipulated.
- **S4** — every slide must appear in some `order_of_proof` section.
- **S5** — every must_prove claim needs a presenter (when speaker_plan exists).

**Case-solidity grade** in the validation report:
`inadmissible` (gates failed) → `weak` (≥3 soft warnings) → `adequate`
→ `strong` (≥3 excellence signals, 0 warnings) → `airtight` (`live_proven`
+ ≥5 excellence signals).

### Phase 5 — Sales-context layer (optional, section 16.8)

For sales presentations specifically, attach:

- `buyer_journey_stage` — `discovery / qualification / solution_pitch /
  business_case / technical_validation / procurement / renewal / expansion`
- `account_context` — industry, situation, known_initiatives
- `pain_points[]` — branded `PainPointId`, `severity` (low/medium/high/
  critical), `affected_persona_ids[]` (must resolve to segments)
- `solution_mapping[]` — `capability` → `addresses_pain_point_ids[]` →
  `proof_evidence_ids[]`
- `commercial_model` — `pricing_frame`, `value_metric`, `roi_summary`,
  `commercial_risks[]`

Sales-context soft warnings:
- `critical_pain_unaddressed:<pain_id>` — high/critical pain with no
  capability mapping
- `capability_without_pain:<index>` — capability not bound to any pain

### Phase 6 — Localization, variants, design system

All optional. See sections 11.5 (variants), 16.5 (localization), 13
(design system). Localization carries `field_path` strings; the
validator resolves every path against the deck and emits
`localization_source_text_stale:<bcp47>:<path>` when `source_text`
diverges from the deck's current value at that path.

## 2. Validation Workflow

After authoring (or before delivering an authored deck), validate:

```typescript
import {
  RefinedBusinessDeckSchema,
  validateBusinessDeck,
} from "./static/schemas/business-deck";

const parsed = RefinedBusinessDeckSchema.parse(deckInput);  // throws on must-fail
const report = validateBusinessDeck(parsed);                // soft-warning report
```

`RefinedBusinessDeckSchema.parse()` enforces:
- All `z.object` shape
- Referential integrity (every branded ID resolves)
- Uniqueness (no duplicate IDs)
- Posture/delivery gating (Phase 1 rules)
- Case-layer integrity (Phase 4 gates)

`validateBusinessDeck()` returns the full **ValidationReportWithSolidity**:

```typescript
{
  overall_status: "valid" | "valid_with_warnings" | "invalid",
  results: ValidationResult[],          // every constraint catalog entry +
                                        // every soft-warning
  summary: string,                      // "N pass, M warning, K fail, J n/a | case_solidity: <grade>"
  claim_provenance: ClaimProvenanceEntry[],
  case_solidity?: CaseSolidityReport,   // when posture === "case"
  case_features?: CaseFeaturesReport,   // controversy / evidence balance / pressure
}
```

A valid deck has `overall_status: "valid"`. A `valid_with_warnings`
deck still ships but each warning should be addressed or explicitly
acknowledged (e.g., via `confidence: "low"` on audience responses).

### Reading the report

Sort by severity:
1. **fail** (`must`-severity) — blocks adoption
2. **warning** (`should` or `nice_to_have`) — quality signal
3. **pass** / **not_applicable** — context

Filter by `constraint_id` prefix to triage:

| Prefix | Triage |
|---|---|
| `claim_provenance:*` | Add evidence with strength medium or high |
| `case_solidity:*` | Look at case-solidity sub-warnings (rebuttal fallback, time concentration, stipulation density) |
| `w14_initial_attitude_unrealistic:*` | Hostile audience predicted to feel persuaded too early |
| `w15_rebuttal_without_evidence:*` | Slide claims to rebut but brings no evidence |
| `w16_risk_bystander_positive:*` | Bystander predicted to feel relief about a risk that isn't theirs |
| `w17_provocation_premature_agreement:*` | Provocation slide predicts agreement on contact |
| `w18_high_evidence_passive_reaction:*` | Strong evidence + passive reactions |
| `decision_slide_no_decision_reaction:*` | Decision slide doesn't predict any outcome reaction |
| `decision_slide_engagement_only:*` | Decision slide predicts engagement but no outcome |
| `rebuttal_does_not_land:*` | Rebuttal slide predicts source segment still hostile |
| `action_title_missing:*` | Title is a topic label, not a declarative sentence |
| `supporting_claims_count_high` | More than 3 peer supporting claims |
| `orphan_visual_artifact:*` | Visual artifact defined but unreferenced |
| `presenter_coverage_gap` | Slides not delivered by any presenter |
| `audience_aggregate_attitude_mismatch` | Deck-level attitude contradicts every segment |
| `closing_decision_mismatch` | closing_arc.decision_demanded ≠ objective.decision_or_action_requested |
| `shape_enum_divergence:*` | Conceptual model is a shape word but no slide uses that layout |
| `narrative_step_non_contiguous` | Gap in narrative_model.progression step numbers |
| `time_budget_target_duration_mismatch` | speaker_plan total ≠ deck.target_duration_minutes |
| `localization_source_text_stale:*` | Translatable field's snapshot drifted from current value |
| `critical_pain_unaddressed:*` | Sales pain with severity high/critical not in any solution_mapping |
| `capability_without_pain:*` | Capability not bound to any pain point |

## 3. Authoring Patterns and Anti-Patterns

### Patterns

**Bind a deck to its context.** Every claim has evidence; every
must-severity objection has a rebuttal or a stipulation; every must_prove
claim has a presenter willing to speak for it; every slide belongs to
an order_of_proof section.

**Concede first, persuade second.** Use stipulations to disclose what
the audience would otherwise spot — vendor weaknesses, hypothesis status,
unproven claims. The case_solidity grade rewards this.

**Predict the room.** Even sparse `expected_audience_responses` (a few
slides × a few segments) lets the W8/W9/W10/W14–W18 rules surface
incoherent predictions. Use `confidence: "low"` to acknowledge
uncertainty without firing warnings.

**Use action titles.** Slide titles should be declarative sentences
the audience can extract as the slide's takeaway. The W3 heuristic
catches topic labels.

**Mark recommendation claims as `kind: "action"`** so the rule-of-three
counter doesn't penalize the deck for a fourth claim that operates at
a different layer.

**Carry a star moment.** Set `message_strategy.star_moment` to anchor
the deck's memorable beat. The closing arc's `callback_to_opening`
should echo it.

### Anti-patterns (will produce failures or warnings)

| Anti-pattern | What fires |
|---|---|
| Claim with no evidence under "preponderance"+ | `claim_provenance:*` (uncovered/weak) |
| `must_prove` claim with low-strength-only evidence | parse fail (S2) |
| Must-severity objection neither rebutted nor stipulated | parse fail (S3) |
| Slide not in any `order_of_proof` section | parse fail (S4) |
| Hostile segment predicted to feel `validation` on slide 1 | W14 (`must` severity) |
| Provocation strategy slide predicts `agreement` | W17 (`must` severity) |
| Decision slide predicts only `take_notes` for approvers | `decision_slide_no_decision_reaction` (`must`) |
| Topic-label slide title (e.g. "Risks") | `action_title_missing:slide_N` |
| 4+ peer `supporting` claims (no `action` kind on the 4th) | `supporting_claims_count_high` |
| `q_and_a_minutes > 0` under `delivery_mode: shared_async` | parse fail (M4) |
| `case` block when posture ≠ `case` | parse fail |
| `rehearsal_state: live_proven` under `shared_async` | parse fail (H6) |

## 4. Quick-Start Templates

For a sales deck (sales-context + case posture + presented_live), use
the `sales-deck-fdpm.ts` fixture as a structural template. It exercises
all 16.8 sales fields, the case layer, audience-response predictions,
and the JTBD jobs on segments. Walk through Phases 1–6 above; replace
content but preserve the cross-reference web.

For a strategic provocation deck (no sales context), use
`business-deck-dos-5_2.ts`. It carries 5 audience segments, 5
objections, full case layer, no sales fields.

## 5. Honesty Constraints (Inherited from CLAUDE.md)

- **No fabricated quantitative numbers.** Pilot results, ROI percentages,
  benchmark comparisons live in evidence as `summary` text and are
  framed as projection, not result, until proven.
- **Concede known weaknesses up front** in `stipulations`. The
  case_solidity grade rewards this; sales-context decks specifically
  should disclose the absence of reference customers (see FDPM
  fixture's `stip_no_reference_customer`).
- **Hypothesis-stage architecture acknowledged.** If the deck advocates
  for an unproven product, the deck should say so. Quality rules
  (`quality_rules` array) document this contract.

## 6. Common Operations

### "Draft a deck for X audience selling Y"

1. Phase 1 (posture/delivery) — almost always `case` + `presented_live`
   for sales; `briefing` + `shared_async` for status updates.
2. Phase 2 (scaffold) — segments first; objections per segment;
   claims per architectural axis.
3. Phase 3 (slide plan) — narrative_pattern is `context_problem_proposal`
   for SCQA-style openings; `claim_evidence_decision` for direct.
4. Phase 4 (case) — required when posture is case. Stipulations are
   the highest-leverage place to start.
5. Validate. Iterate on warnings.

### "Validate this deck and explain the warnings"

1. Run `validateBusinessDeck(parsed)`.
2. Group results by `constraint_id` prefix using the table in §2.
3. For each warning, name the rule, the evidence, and the fix path.
4. Report `case_solidity.grade` and `case_features` (controversy /
   evidence balance / pressure) as the executive summary.

### "Improve this deck's case solidity"

Solidity grade improves with:
- More excellence signals: every claim meets burden, defense-in-depth on
  must objections (rebut AND stipulate), every rebuttal carries fallback
  evidence, ≥3 stipulations, callback_to_opening present, proof_chain
  covers every must_prove claim
- Higher rehearsal state (`walked` → `dress_rehearsed` → `live_proven`)
- Stronger evidence (medium → high)

The grade ladder is in section 21.5 of the schema.

### "Add a sales offer / first-implementation pitch"

Use the FDPM fixture's pattern:
- `commercial_model.pricing_frame` carries the offer terms in plain
  text. No schema extension needed.
- New evidence item with `evidence_type: "financial_model"` for the
  term sheet itself.
- New stipulation disclosing the offer's mechanic (e.g.,
  "we have no paying customer yet; this is why the offer exists").
- New risk for first-mover burden with named mitigation.
- New Q&A entry for the predictable "what's the catch?" question.
- Update `decision_frame.options[opt_pilot]` with first-partner terms
  in pros/cons.
- Optionally add a dedicated slide with `role_in_deck: "option"`.

## 7. Testing Authored Decks

The skill's contract is the regression suite at
`static/tests/business-deck.regression.test.ts` (81 tests). Run it
after any schema-touching changes:

```bash
NODE_PATH=fdpm-cli/node_modules \
  fdpm-cli/node_modules/.bin/tsx \
  static/tests/business-deck.regression.test.ts
```

For a bespoke deck, write a 5-line check script:

```typescript
import { RefinedBusinessDeckSchema, validateBusinessDeck } from "../schemas/business-deck";
import { myDeckInput } from "../fixtures/my-deck";

const parsed = RefinedBusinessDeckSchema.parse(myDeckInput);
const report = validateBusinessDeck(parsed);
console.log(report.summary);
console.log("grade:", report.case_solidity?.grade);
report.results
  .filter((r) => r.status === "fail" || r.status === "warning")
  .forEach((r) => console.log(`  [${r.status}] ${r.constraint_id}: ${r.explanation}`));
```

## References

- `references/schema-quick-ref.md` — every top-level schema field, every
  branded ID, every enum, every soft-warning constraint_id, with one-line
  semantics
- `static/schemas/business-deck.ts` — the source of truth (always check
  this before guessing)
- `static/fixtures/business-deck-dos-5_2.ts` — case/live canonical example
- `static/fixtures/sales-deck-fdpm.ts` — sales-context canonical example,
  including first-implementation-partner offer pattern
- `static/tests/business-deck.regression.test.ts` — 81 regression tests;
  the behavioral contract

## Final reminder

The schema is **opinionated**. It treats audit, attention, and cold-start
as architectural concerns; it treats objections as first-class entities
with branded IDs; it treats evidence as load-bearing artifacts that must
ladder up to claims with explicit warrants. Authors who fight the
opinions produce decks that fail validation. Authors who lean into them
produce decks that read as professional planning artifacts.

When a user asks you to author or validate a deck, **always run the
validator** and report the case_solidity grade alongside the deck
content. The grade is the deck's quality summary in one word.
