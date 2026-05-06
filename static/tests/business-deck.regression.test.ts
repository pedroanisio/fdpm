/**
 * Pass-2 regression tests for business-deck schema.
 *
 * Self-contained runner — execute with:
 *
 *   NODE_PATH=<fdpm-cli/node_modules> tsx static/tests/business-deck.regression.test.ts
 *
 * Each test mutates a deep clone of the DOS 5.2 fixture (which is the
 * canonical "valid case-live" reference deck) to trigger one specific
 * schema gate, then asserts the right error fires (or doesn't).
 *
 * Fixes covered (Pass 2 review numbering):
 *   C1 — orphan visual artifact → SOFT warning, NOT parse failure
 *   C2 — parent_claim_id cycle → parse failure
 *   C3 — unresolvable localization field_path → parse failure
 *   H1 — `expert` removed from AudienceTypeSchema → parse failure
 *   H2 — slide.narrative_steps[*] resolves; unknown step → parse failure
 *   H3 — proof_chain with weak evidence under stricter standard → parse failure
 *   H4 — duplicate stipulation / rebuttal IDs → parse failure
 *   H5 — presenter coverage gap → soft warning
 *   H6 — rehearsal_state vs delivery_mode mismatch → parse failure
 *   H7 — ConstraintConditionSchema honors not_audience_attitude / any_segment_attitude / any_audience_type
 *   M1 — audience aggregate vs segments mismatch → soft warning
 *   M3 — closing_arc.decision_demanded vs objective.decision_or_action_requested mismatch → soft warning
 *   M4 — q_and_a_minutes > 0 under shared_async → parse failure
 *   M6 — non-contiguous narrative_model.progression → soft warning
 *   L4 — publication_status "retracted" → validation FAIL in report
 *
 *   POS — the DOS fixture itself parses + validates (with one expected
 *         soft warning W6: shape_enum_divergence).
 */

import {
  RefinedBusinessDeckSchema,
  validateBusinessDeck,
  BusinessDeckSchema,
  evaluateConstraints,
  BuiltInPersuasionStrategyIdSchema,
} from "../schemas/business-deck";
import { dos52RollbackDeckInput } from "../fixtures/business-deck-dos-5_2";
import { fdpmSalesDeckInput } from "../fixtures/sales-deck-fdpm";
import type { z } from "zod";

type DeckInput = z.input<typeof BusinessDeckSchema>;

/* ---------------------------------------------------------------
 * Tiny test harness
 * --------------------------------------------------------------- */

let passCount = 0;
let failCount = 0;
const failures: { name: string; reason: string }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e: unknown) {
    failCount++;
    const reason = e instanceof Error ? e.message : String(e);
    failures.push({ name, reason });
    process.stdout.write(`  ✗ ${name}\n     ${reason}\n`);
  }
}

function assertParseFails(input: DeckInput, expectMatch: RegExp): void {
  const result = RefinedBusinessDeckSchema.safeParse(input);
  if (result.success) {
    throw new Error(
      `expected parse to fail with /${expectMatch.source}/ — but parse succeeded`
    );
  }
  const messages = result.error.issues.map((i) => i.message).join("\n");
  if (!expectMatch.test(messages)) {
    throw new Error(
      `expected error matching /${expectMatch.source}/ but got:\n${messages}`
    );
  }
}

function assertParseSucceeds(input: DeckInput): z.infer<typeof RefinedBusinessDeckSchema> {
  const result = RefinedBusinessDeckSchema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `[${i.path.join(".")}] ${i.message}`)
      .join("\n");
    throw new Error(`expected parse to succeed but got errors:\n${messages}`);
  }
  return result.data;
}

function assertWarningPresent(
  input: DeckInput,
  expectId: string
): void {
  const parsed = assertParseSucceeds(input);
  const report = validateBusinessDeck(parsed);
  const found = report.results.find(
    (r) => r.constraint_id === expectId && r.status === "warning"
  );
  if (!found) {
    const ids = report.results.map((r) => r.constraint_id).join(", ");
    throw new Error(
      `expected soft warning '${expectId}' in report; got ids: ${ids}`
    );
  }
}

function assertWarningAbsent(input: DeckInput, forbidId: string): void {
  const parsed = assertParseSucceeds(input);
  const report = validateBusinessDeck(parsed);
  const found = report.results.find((r) => r.constraint_id === forbidId);
  if (found && found.status === "warning") {
    throw new Error(`unexpected warning '${forbidId}' in report`);
  }
}

function assertReportFails(input: DeckInput, expectIdPrefix: string): void {
  const parsed = assertParseSucceeds(input);
  const report = validateBusinessDeck(parsed);
  const failed = report.results.find(
    (r) => r.status === "fail" && r.constraint_id.startsWith(expectIdPrefix)
  );
  if (!failed) {
    throw new Error(
      `expected validation report to contain a fail with constraint_id starting '${expectIdPrefix}'`
    );
  }
  if (report.overall_status !== "invalid") {
    throw new Error(
      `expected overall_status "invalid" but got "${report.overall_status}"`
    );
  }
}

/** Deep clone via structuredClone — preserves arrays, plain objects. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/* ---------------------------------------------------------------
 * POS — the DOS 5.2 fixture is canonical valid
 * --------------------------------------------------------------- */
process.stdout.write("\n[positive]\n");

test("POS FDPM sales-deck fixture parses + validates clean (sales-context exercised)", () => {
  const parsed = assertParseSucceeds(fdpmSalesDeckInput);
  const report = validateBusinessDeck(parsed);
  if (report.overall_status === "invalid") {
    throw new Error(
      `FDPM fixture should not be invalid; got results:\n${report.results
        .filter((r) => r.status === "fail")
        .map((r) => r.explanation)
        .join("\n")}`
    );
  }
  if (!report.case_solidity || report.case_solidity.grade !== "strong") {
    throw new Error(
      `expected FDPM case_solidity.grade === 'strong'; got '${report.case_solidity?.grade}'`
    );
  }
  if (!report.case_features) {
    throw new Error("expected case_features on FDPM report");
  }
  // FDPM fixture exercises the sales-context layer end-to-end.
  if ((parsed.deck.pain_points?.length ?? 0) === 0) {
    throw new Error("FDPM fixture should declare pain_points");
  }
  if ((parsed.deck.solution_mapping?.length ?? 0) === 0) {
    throw new Error("FDPM fixture should declare solution_mapping");
  }
  if (!parsed.deck.commercial_model) {
    throw new Error("FDPM fixture should declare commercial_model");
  }
  if (!parsed.deck.account_context) {
    throw new Error("FDPM fixture should declare account_context");
  }
  if (parsed.deck.buyer_journey_stage !== "business_case") {
    throw new Error("FDPM fixture should declare buyer_journey_stage");
  }
  // Every segment should declare a buyer_role.
  const segmentsWithRole = parsed.deck.audience.segments.filter(
    (s) => s.buyer_role !== undefined
  );
  if (segmentsWithRole.length !== parsed.deck.audience.segments.length) {
    throw new Error(
      "FDPM fixture should declare buyer_role on every segment"
    );
  }
  // Every option should have a kind discriminator.
  const optionsWithKind = parsed.deck.decision_frame?.options.filter(
    (o) => o.kind !== undefined
  );
  if (
    !optionsWithKind ||
    optionsWithKind.length !== parsed.deck.decision_frame?.options.length
  ) {
    throw new Error(
      "FDPM fixture should declare kind on every decision_frame option"
    );
  }
});

test("POS DOS 5.2 fixture parses + validates with case_solidity grade strong", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  const report = validateBusinessDeck(parsed);
  if (!report.case_solidity) {
    throw new Error("expected case_solidity report when posture === 'case'");
  }
  if (report.case_solidity.grade !== "strong") {
    throw new Error(
      `expected case_solidity.grade === 'strong'; got '${report.case_solidity.grade}'`
    );
  }
  if (report.overall_status === "invalid") {
    throw new Error(
      `DOS fixture should not be invalid; got results:\n${report.results
        .filter((r) => r.status === "fail")
        .map((r) => r.explanation)
        .join("\n")}`
    );
  }
});

/* ---------------------------------------------------------------
 * Hard-gate regressions (parse failure expected)
 * --------------------------------------------------------------- */
process.stdout.write("\n[hard gates — parse failure expected]\n");

test("C2 parent_claim_id cycle → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  // Make the core claim parent of itself to form a 1-node cycle.
  input.deck.message_strategy.core_claim.parent_claim_id =
    input.deck.message_strategy.core_claim.id;
  assertParseFails(input, /parent_claim_id cycle/i);
});

test("C2 parent_claim_id cycle (multi-node A→B→A) → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  // claim_complexity_cost.parent = claim_core (already in fixture);
  // make claim_core point at claim_complexity_cost to close the loop.
  input.deck.message_strategy.core_claim.parent_claim_id =
    "claim_complexity_cost";
  assertParseFails(input, /parent_claim_id cycle/i);
});

test("C3 unresolvable localization field_path → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.localization) throw new Error("fixture must have localization");
  input.deck.localization.target_locales[0].fields.push({
    field_path: "deck.nonexistent.field.path",
    source_text: "x",
    status: "pending",
  });
  assertParseFails(input, /does not resolve/i);
});

test("H1 AudienceTypeSchema rejects 'expert'", () => {
  const input = clone(dos52RollbackDeckInput);
  // @ts-expect-error — intentionally invalid for runtime check
  input.deck.audience.audience_type = "expert";
  assertParseFails(input, /Invalid enum value|invalid_enum_value/i);
});

test("H2 slide.narrative_steps[*] must resolve to a real progression step", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.slide_plan[0].narrative_steps = [999];
  assertParseFails(input, /narrative_steps.*does not match any step/i);
});

test("H3 proof_chain weak evidence under clear_and_convincing → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  // Bump the standard, then bind a low-strength evidence to one claim.
  input.deck.evidence.push({
    id: "ev_low",
    claims_supported: ["claim_core"],
    evidence_type: "logical_argument",
    summary: "weak",
    strength: "low",
  });
  input.deck.case.burden_of_proof.standard = "clear_and_convincing";
  input.deck.case.burden_of_proof.proof_chain = [
    { claim_id: "claim_core", evidence_ids: ["ev_low"] },
    { claim_id: "claim_pilot", evidence_ids: ["ev_pilot_logic"] },
  ];
  assertParseFails(input, /does not meet the "clear_and_convincing" burden/i);
});

test("H4 duplicate stipulation IDs → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  input.deck.case.stipulations.push({
    ...input.deck.case.stipulations[0],
  });
  assertParseFails(input, /Duplicate id/i);
});

test("H4 duplicate rebuttal IDs → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  input.deck.case.rebuttal_posture.push({
    ...input.deck.case.rebuttal_posture[0],
  });
  assertParseFails(input, /Duplicate id/i);
});

test("H6 rehearsal_state 'live_proven' + delivery_mode 'shared_async' → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  input.deck.case.rehearsal_state = "live_proven";
  input.deck.delivery_mode = "shared_async";
  // Need shared_async fields for the parse to even reach the rehearsal check.
  input.deck.document_authorship = {
    primary_author: "x",
    publication_status: "draft",
  };
  input.deck.reader_navigation = {
    exec_summary_slide: 1,
    if_you_read_only_one: 1,
  };
  // No q_and_a in async mode
  if (input.deck.speaker_plan) {
    input.deck.speaker_plan.time_budget.q_and_a_minutes = 0;
  }
  assertParseFails(input, /rehearsal_state "live_proven" is only valid/i);
});

test("M4 q_and_a_minutes > 0 under shared_async → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.delivery_mode = "shared_async";
  input.deck.document_authorship = {
    primary_author: "x",
    publication_status: "draft",
  };
  input.deck.reader_navigation = {
    exec_summary_slide: 1,
    if_you_read_only_one: 1,
  };
  // Keep speaker_plan with non-zero q_and_a — should now fail.
  if (!input.deck.speaker_plan) throw new Error("fixture must have speaker_plan");
  input.deck.speaker_plan.time_budget.q_and_a_minutes = 5;
  // Also need rehearsal compatible with shared_async.
  if (input.deck.case) input.deck.case.rehearsal_state = "read_tested";
  assertParseFails(input, /q_and_a_minutes must be 0/i);
});

/* ---------------------------------------------------------------
 * Soft-warning regressions (parse OK, warning in report)
 * --------------------------------------------------------------- */
process.stdout.write("\n[soft warnings — parse succeeds, warning in report]\n");

test("C1 orphan visual artifact → soft warning, not parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.visual_artifacts.push({
    id: "visual_orphan",
    title: "Unreferenced",
    artifact_type: "diagram",
    purpose: "summarize",
    composition: {
      orientation: "top_to_bottom",
      information_density: "minimal",
      reveal_strategy: "all_at_once",
      primary_focal_point: "x",
    },
    required_elements: [],
  });
  assertWarningPresent(input, "orphan_visual_artifact:visual_orphan");
});

test("H5 presenter coverage gap → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.speaker_plan) throw new Error("fixture must have speaker_plan");
  // Strip slide 10 from every presenter — leaves slide 10 undelivered.
  input.deck.speaker_plan.presenters = input.deck.speaker_plan.presenters.map(
    (p) => ({
      ...p,
      delivers_slide_numbers: p.delivers_slide_numbers!.filter((n) => n !== 10),
    })
  );
  assertWarningPresent(input, "presenter_coverage_gap");
});

test("M1 audience aggregate attitude mismatch → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Deck-level says "supportive" (a definite attitude) while every segment
  // is skeptical/hostile — should fire the mismatch warning.
  input.deck.audience.attitude = "supportive";
  // Drop "divided"/"neutral" escape hatch by ensuring it's a definite stance.
  assertWarningPresent(input, "audience_aggregate_attitude_mismatch");
});

test("M3 closing decision vs objective decision mismatch → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  input.deck.case.closing_arc.decision_demanded =
    "Approve unrelated foobar quux thingamajig.";
  input.deck.objective.decision_or_action_requested =
    "Authorize widget rotation cadence.";
  assertWarningPresent(input, "closing_decision_mismatch");
});

test("M6 non-contiguous narrative_model.progression → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Make step numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 99] — a clear gap.
  input.deck.narrative_model.progression[9].step = 99;
  // Slide that referenced step 10 must update too — change to 99.
  input.deck.slide_plan.forEach((s) => {
    if (s.narrative_steps?.includes(10)) {
      s.narrative_steps = s.narrative_steps.map((n) => (n === 10 ? 99 : n));
    }
  });
  // Same for case.order_of_proof.
  if (input.deck.case) {
    input.deck.case.order_of_proof.forEach((step) => {
      step.narrative_steps = step.narrative_steps?.map((n) =>
        n === 10 ? 99 : n
      );
    });
  }
  assertWarningPresent(input, "narrative_step_non_contiguous");
});

/* ---------------------------------------------------------------
 * Validation-report failure (post-parse, structurally valid)
 * --------------------------------------------------------------- */
process.stdout.write("\n[validation-report failures — parse OK, report invalid]\n");

test("L4 publication_status 'retracted' → validation FAIL", () => {
  const input = clone(dos52RollbackDeckInput);
  // delivery_mode = shared_async to require document_authorship.
  input.deck.delivery_mode = "shared_async";
  input.deck.document_authorship = {
    primary_author: "x",
    publication_status: "retracted",
  };
  input.deck.reader_navigation = {
    exec_summary_slide: 1,
    if_you_read_only_one: 1,
  };
  // shared_async + a decision-outcome demands decision_capture too.
  input.deck.decision_capture = {
    mechanism: "signoff_block",
    decision_owner: "x",
    required_responders: [],
  };
  if (input.deck.speaker_plan) {
    input.deck.speaker_plan.time_budget.q_and_a_minutes = 0;
  }
  if (input.deck.case) input.deck.case.rehearsal_state = "read_tested";
  // The shared_async branch also requires every must-severity objection
  // to be addressed inline — they already are in the DOS fixture.
  // Rebuttals must additionally declare inline_in_slide_number.
  if (input.deck.case) {
    input.deck.case.rebuttal_posture = input.deck.case.rebuttal_posture.map(
      (rb) => ({
        ...rb,
        inline_in_slide_number: rb.pivot_to_slide ?? 1,
      })
    );
    // closing_arc must have anchored_in_slide_number for non-live.
    input.deck.case.closing_arc.anchored_in_slide_number = 10;
  }
  assertReportFails(input, "publication_status_retracted");
});

/* ---------------------------------------------------------------
 * Audience-response coherence (W8 / W9 / W10 + integrity)
 * --------------------------------------------------------------- */
process.stdout.write("\n[audience-response: integrity + coherence]\n");

test("AR1 unknown segment_id in expected_audience_responses → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.slide_plan[0].expected_audience_responses = [
    {
      segment_id: "seg_does_not_exist",
      expected_emotion: "curiosity",
      expected_reactions: ["lean_in"],
      confidence: "medium",
    },
  ];
  assertParseFails(input, /segment_id.*not defined in deck.audience.segments/i);
});

test("W8 decision-role slide without decision-class reaction for any approver → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Replace slide 10's predictions: every approver/final-decision-maker
  // segment leaves with non-decision-class reactions only.
  const decisionSlideIdx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 10
  );
  input.deck.slide_plan[decisionSlideIdx].expected_audience_responses = [
    {
      segment_id: "seg_coo",
      expected_emotion: "interest",
      expected_reactions: ["take_notes", "lean_in"],
      confidence: "high",
    },
    {
      segment_id: "seg_cfo",
      expected_emotion: "interest",
      expected_reactions: ["take_notes"],
      confidence: "high",
    },
    {
      segment_id: "seg_cio_infra",
      expected_emotion: "interest",
      expected_reactions: ["nod"],
      confidence: "high",
    },
  ];
  // Also make sure the recommendation slide doesn't accidentally hold
  // the decision-class reactions, otherwise W10 wouldn't fire.
  const recSlideIdx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 9
  );
  input.deck.slide_plan[recSlideIdx].expected_audience_responses = [];
  assertWarningPresent(
    input,
    "decision_slide_no_decision_reaction:slide_10"
  );
});

test("W9 objection-rebuttal slide predicting hostility for source segment → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 6 addresses obj_security (sourced from seg_ciso). Predict
  // CISO leaving the slide *more* hostile, not less — should fire W9.
  const slide6Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 6
  );
  input.deck.slide_plan[slide6Idx].expected_audience_responses = [
    {
      segment_id: "seg_ciso",
      expected_emotion: "hostility",
      expected_reactions: ["push_back"],
      confidence: "high",
    },
  ];
  assertWarningPresent(input, "rebuttal_does_not_land:slide_6:seg_ciso");
});

test("W9 low-confidence prediction does NOT fire rebuttal_does_not_land", () => {
  const input = clone(dos52RollbackDeckInput);
  const slide6Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 6
  );
  input.deck.slide_plan[slide6Idx].expected_audience_responses = [
    {
      segment_id: "seg_ciso",
      expected_emotion: "hostility",
      expected_reactions: ["push_back"],
      confidence: "low", // author has flagged uncertainty — suppress warn
    },
  ];
  assertWarningAbsent(input, "rebuttal_does_not_land:slide_6:seg_ciso");
});

test("W10 deck demands decision but no decision-role slide carries decision-class reaction → soft warning (Pass 3 C1)", () => {
  const input = clone(dos52RollbackDeckInput);
  // Strip every decision-class reaction from every slide's predictions.
  // After Pass 3 C1 the rule is named no_decision_reaction_at_decision_slide
  // when the deck has decision/recommendation slides (DOS does).
  const decisionClass = new Set([
    "approve",
    "defer",
    "commit",
    "abstain",
    "reject",
    "request_more_info",
  ]);
  input.deck.slide_plan.forEach((slide) => {
    slide.expected_audience_responses?.forEach((resp) => {
      resp.expected_reactions =
        resp.expected_reactions?.filter(
          (rx) => !decisionClass.has(rx)
        ) ?? [];
    });
  });
  assertWarningPresent(input, "no_decision_reaction_at_decision_slide");
});

/* ---------------------------------------------------------------
 * Mechanized response-soundness rules (W14–W18)
 *
 * Each rule fires when a (slide, segment, response) tuple lands in
 * the *anti-envelope* given observable signals (slide position, slide
 * role, evidence strength, addressed objections, segment attitude,
 * decision power, persuasion strategy). All rules respect the
 * confidence: "low" escape hatch.
 * --------------------------------------------------------------- */
process.stdout.write("\n[mechanized response soundness — anti-envelope]\n");

test("W14 hostile segment + first third + positive emotion + objection unaddressed → warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 1 is at 10% of deck. seg_ciso is hostile. Slide 1 does not
  // address obj_security (which is sourced from CISO). Predicting
  // "validation" should trip W14.
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  const responses = input.deck.slide_plan[slide1Idx].expected_audience_responses!;
  const cisoResp = responses.find((r) => r.segment_id === "seg_ciso")!;
  cisoResp.expected_emotion = "validation";
  cisoResp.secondary_emotion = undefined;
  cisoResp.confidence = "high"; // ensure escape hatch is closed
  assertWarningPresent(
    input,
    "w14_initial_attitude_unrealistic:slide_1:seg_ciso"
  );
});

test("W14 confidence:'low' suppresses initial-attitude warning", () => {
  const input = clone(dos52RollbackDeckInput);
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  const cisoResp = input.deck.slide_plan[slide1Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_emotion = "validation";
  cisoResp.secondary_emotion = undefined;
  cisoResp.confidence = "low";
  assertWarningAbsent(
    input,
    "w14_initial_attitude_unrealistic:slide_1:seg_ciso"
  );
});

test("W15 rebuttal-without-evidence: addresses objection but no medium-or-high evidence + positive emotion → warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 6 addresses obj_security (sourced from CISO). The fixture's
  // CISO prediction is "skepticism"+"validation". Strip the slide's
  // medium-strength evidence so only the low track remains.
  const slide6Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 6
  );
  // Replace uses_evidence_ids with a single low-strength evidence.
  input.deck.evidence.push({
    id: "ev_low_for_test",
    claims_supported: ["claim_security_tradeoff"],
    evidence_type: "logical_argument",
    summary: "x",
    strength: "low",
  });
  input.deck.slide_plan[slide6Idx].uses_evidence_ids = ["ev_low_for_test"];
  // Keep CISO prediction = validation; force confidence high.
  const cisoResp = input.deck.slide_plan[slide6Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_emotion = "validation";
  cisoResp.secondary_emotion = undefined;
  cisoResp.confidence = "high";
  assertWarningPresent(
    input,
    "w15_rebuttal_without_evidence:slide_6:seg_ciso"
  );
});

test("W16 risk-bystander: risk-role slide + segment not source + positive emotion → warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 6 is risk role. seg_cio_infra is NOT source of obj_security.
  // Mutate CIO's slide-6 prediction to "validation" — should trip W16.
  const slide6Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 6
  );
  const cioResp = input.deck.slide_plan[slide6Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_cio_infra"
  )!;
  cioResp.expected_emotion = "validation";
  cioResp.secondary_emotion = undefined;
  cioResp.confidence = "high";
  assertWarningPresent(
    input,
    "w16_risk_bystander_positive:slide_6:seg_cio_infra"
  );
});

test("W17 provocation premature agreement fires when W14 is suppressed by addressing the objection (Pass 3 C3)", () => {
  // Pass 3 C3: when W14 already fires on the same prediction, W17 is
  // suppressed (one warning per defect). To exercise W17 in isolation,
  // construct a scenario where W14 does NOT fire but W17 does — i.e.,
  // the slide DOES address the segment's objection (W14 condition
  // !addresses_segment_objection becomes false), but the slide is
  // still the first opening slide with provocation active.
  const input = clone(dos52RollbackDeckInput);
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  // Make slide 1 address obj_security (sourced from CISO); now W14 won't fire.
  input.deck.slide_plan[slide1Idx].addresses_objection_ids = ["obj_security"];
  const cisoResp = input.deck.slide_plan[slide1Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_emotion = "agreement";
  cisoResp.secondary_emotion = undefined;
  cisoResp.confidence = "high";
  assertWarningPresent(
    input,
    "w17_provocation_premature_agreement:slide_1:seg_ciso"
  );
  // Verify W14 was suppressed (defect-deduplication confirmed).
  assertWarningAbsent(
    input,
    "w14_initial_attitude_unrealistic:slide_1:seg_ciso"
  );
});

test("W18 high-evidence + decision-powerful segment + only passive reactions → warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 9 brings ev_pilot_logic (high) + ev_total_cost_model (high).
  // seg_coo is final_decision_maker. Mutate reactions to lean_back only.
  const slide9Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 9
  );
  const cooResp = input.deck.slide_plan[slide9Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_coo"
  )!;
  cooResp.expected_reactions = ["lean_back"];
  cooResp.confidence = "high";
  assertWarningPresent(
    input,
    "w18_high_evidence_passive_reaction:slide_9:seg_coo"
  );
});

/* ---------------------------------------------------------------
 * Constraint-condition extensions (H7 + M5)
 * --------------------------------------------------------------- */
process.stdout.write("\n[constraint-condition extensions]\n");

test("H7 not_audience_attitude excludes the deck when attitude is in the list", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  // DOS audience.attitude = "skeptical". A constraint with
  // not_audience_attitude: ["skeptical"] should be NOT applicable.
  const result = evaluateConstraints(parsed.deck, [
    {
      id: "test_neg",
      category: "rhetorical",
      condition: { not_audience_attitude: ["skeptical"] },
      requirement: { must_include_evidence: true },
      validation_question: "test",
      severity: "must",
    },
  ]);
  if (result[0].status !== "not_applicable") {
    throw new Error(
      `not_audience_attitude should exclude deck; got status '${result[0].status}'`
    );
  }
});

test("H7 any_audience_type matches when deck.audience.audience_type is in the list", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  const result = evaluateConstraints(parsed.deck, [
    {
      id: "test_any_at",
      category: "audience_fit",
      condition: { any_audience_type: ["executive", "investor"] },
      requirement: { must_include_evidence: true },
      validation_question: "test",
      severity: "must",
    },
  ]);
  if (result[0].status === "not_applicable") {
    throw new Error(
      `any_audience_type should match 'executive'; got not_applicable`
    );
  }
});

test("M5 any_segment_attitude matches when one segment has the listed attitude", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  // DOS has seg_ciso with attitude "hostile" — should match.
  const matchingResult = evaluateConstraints(parsed.deck, [
    {
      id: "test_seg_hostile",
      category: "audience_fit",
      condition: { any_segment_attitude: ["hostile"] },
      requirement: { must_include_evidence: true },
      validation_question: "test",
      severity: "must",
    },
  ]);
  if (matchingResult[0].status === "not_applicable") {
    throw new Error(`any_segment_attitude should match 'hostile' segment`);
  }
  // No segment is "supportive" → not_applicable.
  const nonMatchingResult = evaluateConstraints(parsed.deck, [
    {
      id: "test_seg_supportive",
      category: "audience_fit",
      condition: { any_segment_attitude: ["supportive"] },
      requirement: { must_include_evidence: true },
      validation_question: "test",
      severity: "must",
    },
  ]);
  if (nonMatchingResult[0].status !== "not_applicable") {
    throw new Error(
      `any_segment_attitude with 'supportive' should be not_applicable`
    );
  }
});

/* ---------------------------------------------------------------
 * Pass 3 — additional regressions
 *
 * Each test pins one Pass 3 finding's fix:
 *   C1  W10 retargeted to decision-role slides
 *   C3  W14/W17 deduplication
 *   H1  per-slide segment_id uniqueness in expected_audience_responses
 *   H2  W9 also fires on hostile reactions (not just emotions)
 *   H3  decision_slide_no_decision_powerful_prediction
 *   H4  stem-based matching for closing_decision overlap
 *   H5  shape divergence symmetric (secondary_models)
 *   M5  narrative contiguity vs min(step), missing-step naming
 *   M6  empty reactions warning when emotion declared
 *   M8  case_features surfaced in report
 *   L4  hybrid delivery_mode positive + negative
 *   L5  built-in catalog uses any_segment_attitude (handled by
 *       constraint-extension test extension below)
 * --------------------------------------------------------------- */
process.stdout.write("\n[Pass 3 regressions]\n");

test("Pass3-H1 duplicate segment_id in expected_audience_responses → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  const responses = input.deck.slide_plan[slide1Idx].expected_audience_responses!;
  const cisoResp = responses.find((r) => r.segment_id === "seg_ciso")!;
  // Add a second prediction for the same segment.
  responses.push({
    segment_id: "seg_ciso",
    expected_emotion: "curiosity",
    expected_reactions: ["lean_in"],
    confidence: "medium",
  });
  assertParseFails(input, /appears more than once/i);
});

test("Pass3-H2 W9 fires on hostile-residual reactions (not just emotions)", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 6 addresses obj_security (sourced from CISO). Predict
  // benign emotion BUT hostile-residual reactions only.
  const slide6Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 6
  );
  const cisoResp = input.deck.slide_plan[slide6Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_emotion = "skepticism"; // benign — passes emotion check
  cisoResp.secondary_emotion = undefined;
  cisoResp.expected_reactions = ["push_back", "ask_challenging_question"];
  cisoResp.confidence = "high";
  assertWarningPresent(input, "rebuttal_does_not_land:slide_6:seg_ciso");
});

test("Pass3-H3 decision-role slide with no prediction for any decision-powerful segment → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Strip all predictions on slide 10 so no decision-powerful segment
  // is even imagined to react.
  const slide10Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 10
  );
  input.deck.slide_plan[slide10Idx].expected_audience_responses = [];
  assertWarningPresent(
    input,
    "decision_slide_no_decision_powerful_prediction:slide_10"
  );
});

test("Pass3-H4 stem matching: 'approve' and 'approval' overlap, no warning", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  // Old anchor-word heuristic would say zero overlap (no shared word
  // ≥ 5 chars); stem-based approach should normalize both to "approv".
  input.deck.objective.decision_or_action_requested =
    "Approval of the assessment";
  input.deck.case.closing_arc.decision_demanded = "Approve the assessment";
  assertWarningAbsent(input, "closing_decision_mismatch");
});

test("Pass3-H4 stem matching: completely different decisions → warning", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.case) throw new Error("fixture must have case");
  input.deck.objective.decision_or_action_requested =
    "Authorize the marketing relaunch";
  input.deck.case.closing_arc.decision_demanded =
    "Approve the engineering reorganization";
  assertWarningPresent(input, "closing_decision_mismatch");
});

test("Pass3-H5 secondary_model shape divergence is also flagged", () => {
  const input = clone(dos52RollbackDeckInput);
  // We want to verify a secondary_models entry trips its own warning.
  // Set dominant_model to a non-shape word so the dominant scope
  // doesn't trigger; set secondary_models to ["matrix"]. No slide uses
  // matrix layout in the DOS fixture (visual_strategy.layout values are
  // mostly single_message, two_column, three_column, stack, comparison).
  input.deck.conceptual_structure.dominant_model = "system";
  input.deck.conceptual_structure.secondary_models = ["matrix"];
  // Ensure no slide layout is "matrix" — strip if any.
  input.deck.slide_plan.forEach((s) => {
    if (s.visual_strategy.layout === "matrix") {
      s.visual_strategy.layout = "single_message";
    }
  });
  assertWarningPresent(input, "shape_enum_divergence:secondary[0]");
});

test("Pass3-M5 narrative contiguity warning names the missing step number", () => {
  const input = clone(dos52RollbackDeckInput);
  // Keep step 1, jump to step 99 in the second beat. Missing 2..98.
  input.deck.narrative_model.progression[1].step = 99;
  // Update slide that referenced step 2.
  input.deck.slide_plan.forEach((s) => {
    if (s.narrative_steps?.includes(2)) {
      s.narrative_steps = s.narrative_steps.map((n) => (n === 2 ? 99 : n));
    }
  });
  if (input.deck.case) {
    input.deck.case.order_of_proof.forEach((op) => {
      op.narrative_steps = op.narrative_steps?.map((n) => (n === 2 ? 99 : n));
    });
  }
  // Renumber other progression steps to keep them resolvable but with gap
  const progressionLength = input.deck.narrative_model.progression.length;
  for (let i = 2; i < progressionLength; i++) {
    input.deck.narrative_model.progression[i].step = 99 + i;
  }
  // Update slide and order_of_proof references for those changes.
  for (let oldStep = 3; oldStep <= progressionLength; oldStep++) {
    const newStep = 99 + (oldStep - 1);
    input.deck.slide_plan.forEach((s) => {
      if (s.narrative_steps?.includes(oldStep)) {
        s.narrative_steps = s.narrative_steps.map((n) =>
          n === oldStep ? newStep : n
        );
      }
    });
    if (input.deck.case) {
      input.deck.case.order_of_proof.forEach((op) => {
        op.narrative_steps = op.narrative_steps?.map((n) =>
          n === oldStep ? newStep : n
        );
      });
    }
  }
  const parsed = assertParseSucceeds(input);
  const report = validateBusinessDeck(parsed);
  const found = report.results.find(
    (r) => r.constraint_id === "narrative_step_non_contiguous"
  );
  if (!found) throw new Error("expected narrative_step_non_contiguous warning");
  if (!/missing step\(s\)/.test(found.explanation)) {
    throw new Error(
      `expected explanation to name missing step(s); got:\n${found.explanation}`
    );
  }
});

test("Pass3-M6 emotion declared but no reactions → audience_response_emotion_without_reactions warning", () => {
  const input = clone(dos52RollbackDeckInput);
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  const cisoResp = input.deck.slide_plan[slide1Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_reactions = []; // empty
  cisoResp.confidence = "medium"; // ensure not exempt
  assertWarningPresent(
    input,
    "audience_response_emotion_without_reactions:slide_1:seg_ciso"
  );
});

test("Pass3-M8 validation report carries case_features with controversy/evidence/pressure", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  const report = validateBusinessDeck(parsed);
  if (!report.case_features) {
    throw new Error("expected case_features on report");
  }
  const cf = report.case_features;
  if (!["low", "medium", "high"].includes(cf.controversy_level)) {
    throw new Error(`bad controversy_level: ${cf.controversy_level}`);
  }
  if (typeof cf.evidence_balance.high !== "number") {
    throw new Error(`bad evidence_balance shape`);
  }
  if (!cf.rationale.includes("controversy_level=")) {
    throw new Error(`rationale missing expected substring`);
  }
  // DOS has hostile-segment + 3 must objections → high.
  if (cf.controversy_level !== "high") {
    throw new Error(
      `expected controversy_level=high (DOS: skeptical aggregate + 3 must objections); got ${cf.controversy_level}`
    );
  }
});

test("Pass3-L4 delivery_mode 'hybrid' requires both speaker_plan AND reader_navigation", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.delivery_mode = "hybrid";
  // speaker_plan present (from DOS); deliberately omit reader_navigation.
  // Should fail parse with explicit hybrid message.
  assertParseFails(input, /hybrid.*reader_navigation is required/i);
});

test("Pass3-L4 hybrid with reader_navigation parses cleanly", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.delivery_mode = "hybrid";
  input.deck.reader_navigation = {
    exec_summary_slide: 1,
    if_you_read_only_one: 9,
  };
  // case.closing_arc.anchored_in_slide_number is required when delivery
  // is non-live.
  if (input.deck.case) {
    input.deck.case.closing_arc.anchored_in_slide_number = 10;
  }
  assertParseSucceeds(input);
});

test("Pass3-L5 catalog entry hostile_segment_requires_tradeoff_and_objection passes on DOS (which has both)", () => {
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  const report = validateBusinessDeck(parsed);
  const result = report.results.find(
    (r) => r.constraint_id === "hostile_segment_requires_tradeoff_and_objection"
  );
  if (!result) throw new Error("expected catalog entry to be evaluated");
  if (result.status !== "pass") {
    throw new Error(
      `expected pass; got ${result.status}: ${result.explanation}`
    );
  }
});

test("Pass3-L5 catalog entry blocks parse when hostile segment has no objection-handling moves", () => {
  // The catalog entry is must-severity, so failing it rejects parse
  // (via RefinedBusinessDeckSchema.superRefine). Construct a deck
  // that satisfies every other must-constraint EXCEPT the new one.
  // We do this by stripping all rhetorical_moves of "address_objections"
  // — every required slide role stays present, but the rhetorical-
  // move requirement of the new catalog entry is unmet.
  const input = clone(dos52RollbackDeckInput);
  input.deck.slide_plan.forEach((s) => {
    s.rhetorical_moves = (s.rhetorical_moves ?? []).filter(
      (m) => m !== "address_objections"
    );
  });
  // Verify parse fails citing the new constraint id (it should appear
  // in the error messages).
  assertParseFails(
    input,
    /hostile_segment_requires_tradeoff_and_objection/i
  );
});

test("Pass3-C3 W14 fires alone when W17 conditions also met (W17 suppressed)", () => {
  // The default DOS-fixture W17 test (above) sets up CISO=hostile +
  // first opening slide + persuaded emotion → W14 fires, W17 is
  // suppressed by !w14Fired guard. This pins that contract.
  const input = clone(dos52RollbackDeckInput);
  const slide1Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 1
  );
  // Make sure slide 1 doesn't address obj_security (so W14 condition holds).
  input.deck.slide_plan[slide1Idx].addresses_objection_ids = [];
  const cisoResp = input.deck.slide_plan[slide1Idx].expected_audience_responses!.find(
    (r) => r.segment_id === "seg_ciso"
  )!;
  cisoResp.expected_emotion = "agreement";
  cisoResp.secondary_emotion = undefined;
  cisoResp.confidence = "high";
  assertWarningPresent(
    input,
    "w14_initial_attitude_unrealistic:slide_1:seg_ciso"
  );
  // W17 must be suppressed.
  assertWarningAbsent(
    input,
    "w17_provocation_premature_agreement:slide_1:seg_ciso"
  );
});

/* ---------------------------------------------------------------
 * Block 1 — easy wins from external review
 *
 * #1  source_audience_segment → source_segment_id (branded)
 * #2  DECISION_OUTCOME_REACTIONS vs DECISION_ENGAGEMENT_REACTIONS split
 * #3  BuiltInPersuasionStrategyIdSchema exposed at runtime
 * #4  localization_source_text_stale soft warning
 * #5  Architectural-layer docstring (no runtime test — comment-only)
 * --------------------------------------------------------------- */
process.stdout.write("\n[Block 1 regressions]\n");

test("Block1-#1 unknown source_segment_id on objection → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.audience.likely_objections[0].source_segment_id =
    "seg_does_not_exist";
  assertParseFails(
    input,
    /source_segment_id.*not defined in deck.audience.segments/i
  );
});

test("Block1-#1 omitted source_segment_id is allowed (optional)", () => {
  const input = clone(dos52RollbackDeckInput);
  delete (input.deck.audience.likely_objections[0] as { source_segment_id?: string })
    .source_segment_id;
  assertParseSucceeds(input);
});

test("Block1-#2 decision slide producing only engagement reactions → softer warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Slide 10 (decision role): replace every approver/final-decision-maker
  // segment's reactions with engagement-only — request_more_info / asks.
  const slide10Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 10
  );
  input.deck.slide_plan[slide10Idx].expected_audience_responses!.forEach(
    (r) => {
      r.expected_reactions = ["request_more_info"];
    }
  );
  // Make the recommendation slide's predictions also engagement-only
  // so W10 (terminal-slide decision-outcome check) doesn't separately fire.
  const slide9Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 9
  );
  input.deck.slide_plan[slide9Idx].expected_audience_responses!.forEach(
    (r) => {
      r.expected_reactions = ["request_more_info"];
    }
  );
  assertWarningPresent(input, "decision_slide_engagement_only:slide_10");
  // Confirm the *outcome*-strict warning didn't also fire (engagement
  // present means we stopped at the softer signal).
  assertWarningAbsent(input, "decision_slide_no_decision_reaction:slide_10");
});

test("Block1-#2 decision slide with NO reaction at all → strongest warning", () => {
  const input = clone(dos52RollbackDeckInput);
  const slide10Idx = input.deck.slide_plan.findIndex(
    (s) => s.slide_number === 10
  );
  // Strip all reactions for decision-powerful segments. emit
  // audience_response_emotion_without_reactions per slide AND
  // decision_slide_no_decision_reaction.
  input.deck.slide_plan[slide10Idx].expected_audience_responses!.forEach(
    (r) => {
      r.expected_reactions = [];
    }
  );
  assertWarningPresent(input, "decision_slide_no_decision_reaction:slide_10");
});

test("Block1-#2 W10 looks at outcome-only at decision slide", () => {
  const input = clone(dos52RollbackDeckInput);
  // Strip every decision-OUTCOME reaction across the deck, keeping
  // engagement reactions intact. W10 should fire (no outcome at
  // decision slide), even though engagement reactions exist.
  const outcome = new Set([
    "approve",
    "defer",
    "commit",
    "abstain",
    "reject",
  ]);
  input.deck.slide_plan.forEach((slide) => {
    slide.expected_audience_responses?.forEach((r) => {
      r.expected_reactions = (r.expected_reactions ?? []).filter(
        (rx) => !outcome.has(rx)
      );
      if (r.expected_reactions.length === 0) {
        // ensure something engagement-class still present so we can
        // observe the outcome-vs-engagement distinction
        r.expected_reactions = ["request_more_info"];
      }
    });
  });
  assertWarningPresent(input, "no_decision_reaction_at_decision_slide");
});

test("Block1-#3 BuiltInPersuasionStrategyIdSchema parses valid IDs and rejects invalid", () => {
  const ok = BuiltInPersuasionStrategyIdSchema.safeParse("logos_reasoning");
  if (!ok.success) throw new Error("'logos_reasoning' should parse");
  const bad = BuiltInPersuasionStrategyIdSchema.safeParse("not_a_real_strategy");
  if (bad.success) throw new Error("'not_a_real_strategy' should fail parse");
});

test("Block1-#4 localization source_text drift → soft warning", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.localization) throw new Error("fixture must have localization");
  // The fixture's first translatable field is deck.title with
  // source_text "Reconsidering Endpoint Complexity". Mutate the
  // current deck.title so the snapshot diverges.
  input.deck.title = "Endpoint Simplification Mandate";
  assertWarningPresent(
    input,
    "localization_source_text_stale:pt-BR:deck.title"
  );
});

test("Block1-#4 fresh source_text (matches deck) emits no drift warning", () => {
  const input = clone(dos52RollbackDeckInput);
  // Don't mutate anything; the DOS fixture's localization.fields
  // already match the deck.title / deck.subtitle values.
  assertWarningAbsent(
    input,
    "localization_source_text_stale:pt-BR:deck.title"
  );
});

/* ---------------------------------------------------------------
 * Sales-context layer (section 16.8)
 *
 * All sales fields are optional. The DOS 5.2 fixture is NOT a
 * sales deck — it parses cleanly with no sales fields. These
 * tests construct minimal sales overlays on cloned DOS to exercise
 * the new code paths.
 * --------------------------------------------------------------- */
process.stdout.write("\n[Sales-context layer (16.8)]\n");

test("Sales positive: DOS 5.2 with no sales fields parses cleanly", () => {
  // Sanity: existing fixture continues to validate.
  const parsed = assertParseSucceeds(dos52RollbackDeckInput);
  if ((parsed.deck.pain_points?.length ?? 0) !== 0) {
    throw new Error("expected no pain_points by default");
  }
});

test("Sales: AudienceSegmentSchema accepts buyer_role + priorities + fears + success_criteria", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.audience.segments[0].buyer_role = "economic_buyer";
  input.deck.audience.segments[0].priorities = ["cost certainty", "minimal disruption"];
  input.deck.audience.segments[0].fears = ["budget overrun", "vendor lock-in"];
  input.deck.audience.segments[0].success_criteria = ["TCO model approved"];
  assertParseSucceeds(input);
});

test("Sales: AudienceSegmentSchema rejects unknown buyer_role", () => {
  const input = clone(dos52RollbackDeckInput);
  // @ts-expect-error — intentional bad value
  input.deck.audience.segments[0].buyer_role = "not_a_real_role";
  assertParseFails(input, /Invalid enum value|invalid_enum_value/i);
});

test("Sales: OptionSchema accepts kind + differentiation_claim_ids", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.decision_frame) {
    throw new Error("DOS fixture must have decision_frame");
  }
  input.deck.decision_frame.options[0].kind = "status_quo";
  input.deck.decision_frame.options[0].differentiation_claim_ids = ["claim_core"];
  assertParseSucceeds(input);
});

test("Sales: Option.differentiation_claim_ids must resolve to a claim", () => {
  const input = clone(dos52RollbackDeckInput);
  if (!input.deck.decision_frame) {
    throw new Error("DOS fixture must have decision_frame");
  }
  input.deck.decision_frame.options[0].differentiation_claim_ids = [
    "claim_does_not_exist",
  ];
  assertParseFails(
    input,
    /differentiation_claim_ids.*not defined in deck.message_strategy claims/i
  );
});

test("Sales: pain_points + solution_mapping happy path parses", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_endpoint_drift",
      description: "Configuration drift across endpoints inflates support cost.",
      affected_persona_ids: ["seg_cio_infra"],
      severity: "high",
      current_cost_or_impact: "~25% of helpdesk volume",
    },
  ];
  input.deck.solution_mapping = [
    {
      capability: "Frozen-image endpoint baseline",
      addresses_pain_point_ids: ["pain_endpoint_drift"],
      proof_evidence_ids: ["ev_benchmark_endpoint_variance"],
    },
  ];
  assertParseSucceeds(input);
});

test("Sales: pain_point.affected_persona_ids must resolve to audience.segments[].id", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_x",
      description: "x",
      affected_persona_ids: ["seg_does_not_exist"],
      severity: "low",
    },
  ];
  assertParseFails(input, /affected_persona_ids.*not defined in deck.audience.segments/i);
});

test("Sales: capability_mapping.addresses_pain_point_ids must resolve to declared pain points", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_real",
      description: "real pain",
      affected_persona_ids: [],
      severity: "low",
    },
  ];
  input.deck.solution_mapping = [
    {
      capability: "thing",
      addresses_pain_point_ids: ["pain_does_not_exist"],
      proof_evidence_ids: [],
    },
  ];
  assertParseFails(
    input,
    /addresses_pain_point_ids.*not defined in deck.pain_points/i
  );
});

test("Sales: capability_mapping.proof_evidence_ids must resolve to declared evidence", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_real",
      description: "real pain",
      affected_persona_ids: [],
      severity: "low",
    },
  ];
  input.deck.solution_mapping = [
    {
      capability: "thing",
      addresses_pain_point_ids: ["pain_real"],
      proof_evidence_ids: ["ev_does_not_exist"],
    },
  ];
  assertParseFails(input, /proof_evidence_ids.*not defined in deck.evidence/i);
});

test("Sales: duplicate pain_point IDs → parse failure", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_dup",
      description: "a",
      affected_persona_ids: [],
      severity: "low",
    },
    {
      id: "pain_dup",
      description: "b",
      affected_persona_ids: [],
      severity: "low",
    },
  ];
  assertParseFails(input, /Duplicate id 'pain_dup'/i);
});

test("Sales: commercial_model.commercial_risks must resolve to risks[].id", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.commercial_model = {
    pricing_frame: "$X per seat per month",
    value_metric: "endpoint count",
    roi_summary: "12-month payback",
    commercial_risks: ["risk_does_not_exist"],
  };
  assertParseFails(
    input,
    /commercial_risks.*not defined in deck.risks/i
  );
});

test("Sales: commercial_model with valid risk reference parses", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.commercial_model = {
    pricing_frame: "$X per seat per month",
    value_metric: "endpoint count",
    roi_summary: "12-month payback",
    commercial_risks: ["risk_support_burden"],
  };
  assertParseSucceeds(input);
});

test("Sales soft warning: critical pain unaddressed", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [
    {
      id: "pain_unsolved",
      description: "Something painful nobody is addressing",
      affected_persona_ids: [],
      severity: "critical",
    },
    {
      id: "pain_addressed",
      description: "Pain we do address",
      affected_persona_ids: [],
      severity: "low",
    },
  ];
  input.deck.solution_mapping = [
    {
      capability: "Solves the second one",
      addresses_pain_point_ids: ["pain_addressed"],
      proof_evidence_ids: [],
    },
  ];
  assertWarningPresent(input, "critical_pain_unaddressed:pain_unsolved");
});

test("Sales soft warning: capability without pain", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.pain_points = [];
  input.deck.solution_mapping = [
    {
      capability: "Orphan feature",
      addresses_pain_point_ids: [],
      proof_evidence_ids: [],
    },
  ];
  assertWarningPresent(input, "capability_without_pain:0");
});

test("Sales: BuyerJourneyStageSchema accepted on top-level deck", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.buyer_journey_stage = "business_case";
  assertParseSucceeds(input);
});

test("Sales: AccountContextSchema accepted on top-level deck", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.account_context = {
    account_name: "Acme Corp",
    industry: "Manufacturing",
    account_situation:
      "Q3 cost-reduction mandate; CFO recently appointed; vendor-budget freeze except compliance.",
    known_initiatives: ["Endpoint compliance program 2026"],
  };
  assertParseSucceeds(input);
});

/* ---------------------------------------------------------------
 * Pass 5 — research-driven schema additions (S1–S6)
 *
 * S1  EvidenceSchema.warrant?              (Toulmin Warrant)
 * S2  ClaimSchema.qualifier?               (Toulmin Modality)
 * S3  action_title_missing soft warning    (Minto Action Title)
 * S4  ClaimKind="action" + rule-of-three   (Minto rule of three)
 * S5  MessageStrategy.star_moment          (Duarte Sparkline)
 * S6  AudienceSegment JTBD jobs            (Jobs to be Done)
 * --------------------------------------------------------------- */
process.stdout.write("\n[Pass 5 — research-driven additions]\n");

test("Pass5-S1 EvidenceSchema accepts warrant string", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.evidence[0].warrant =
    "Audit logs are the artifact compliance review consumes; an event-sourced log with attribution is exactly that.";
  assertParseSucceeds(input);
});

test("Pass5-S2 ClaimSchema accepts qualifier string", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.message_strategy.core_claim.qualifier =
    "for fixed-function workflows under defined compensating controls";
  input.deck.message_strategy.supporting_claims[0].qualifier =
    "subject to evidence in the pilot's compatibility inventory";
  assertParseSucceeds(input);
});

test("Pass5-S3 topic-label title fires action_title_missing", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.slide_plan[0].title = "Endpoint Complexity Considerations";
  assertWarningPresent(input, "action_title_missing:slide_1");
});

test("Pass5-S3 declarative title with verb does NOT fire", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.slide_plan[0].title =
    "Endpoint complexity costs more than the buyer realizes today";
  assertWarningAbsent(input, "action_title_missing:slide_1");
});

test("Pass5-S3 appendix slides are exempt from action_title_missing", () => {
  const input = clone(dos52RollbackDeckInput);
  // Append an appendix slide with a topic-label title — must NOT warn.
  const lastSlide = input.deck.slide_plan[input.deck.slide_plan.length - 1];
  input.deck.slide_plan.push({
    slide_number: lastSlide.slide_number + 1,
    title: "Appendix A — Reference Architecture",
    role_in_deck: "appendix",
    key_message: "Reference material.",
    audience_question_answered: "Where is the deeper detail?",
    content_blocks: [
      { type: "text", purpose: "Reference", content_summary: "details" },
    ],
    visual_strategy: {
      layout: "single_message",
      density: "low",
      focal_point: "Reference",
    },
    narrative_steps: [],
    rhetorical_moves: [],
    supports_claim_ids: [],
    uses_evidence_ids: [],
    addresses_objection_ids: [],
    expected_audience_responses: [],
  });
  // Bind appendix slide to an order_of_proof section so the case-S4
  // gate (every slide must be in some section) is satisfied.
  if (input.deck.case) {
    input.deck.case.order_of_proof[
      input.deck.case.order_of_proof.length - 1
    ].slide_numbers.push(lastSlide.slide_number + 1);
  }
  assertWarningAbsent(
    input,
    `action_title_missing:slide_${lastSlide.slide_number + 1}`
  );
});

test("Pass5-S4 supporting_claims_count_high fires when 4+ kind=supporting", () => {
  const input = clone(dos52RollbackDeckInput);
  // The fixture intentionally keeps the 4th claim as kind="action"
  // (claim_pilot is the recommendation-layer claim). To exercise the
  // rule-of-three trigger, promote it back to kind="supporting" so
  // the deck carries 4 peer architectural claims.
  for (let i = 0; i < input.deck.message_strategy.supporting_claims.length; i++) {
    if (input.deck.message_strategy.supporting_claims[i].id === "claim_pilot") {
      input.deck.message_strategy.supporting_claims[i].kind = "supporting";
    }
  }
  assertWarningPresent(input, "supporting_claims_count_high");
});

test("Pass5-S4 supporting_claims_count_high does NOT fire when 4th is kind=action", () => {
  const input = clone(dos52RollbackDeckInput);
  // Fixture already keeps claim_pilot as kind="action". The
  // rule-of-three counter should ignore action-layer claims and
  // therefore not fire.
  assertWarningAbsent(input, "supporting_claims_count_high");
});

test("Pass5-S4 ClaimKindSchema accepts 'action' value", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.message_strategy.supporting_claims[0].kind = "action";
  assertParseSucceeds(input);
});

test("Pass5-S5 MessageStrategy.star_moment with valid slide_number parses", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.message_strategy.star_moment = {
    slide_number: 1,
    message: "Reconsidering Endpoint Complexity is the deck's anchor beat.",
  };
  assertParseSucceeds(input);
});

test("Pass5-S5 star_moment with unknown slide_number fails parse", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.message_strategy.star_moment = {
    slide_number: 99,
    message: "Phantom slide",
  };
  assertParseFails(input, /Star Moment references slide_number 99/i);
});

test("Pass5-S6 AudienceSegmentSchema accepts JTBD jobs arrays", () => {
  const input = clone(dos52RollbackDeckInput);
  input.deck.audience.segments[0].functional_jobs = [
    "Decide on the assessment authorization",
    "Verify the compensating-control envelope is achievable",
  ];
  input.deck.audience.segments[0].emotional_jobs = [
    "Feel that the proposal isn't a stunt",
  ];
  input.deck.audience.segments[0].social_jobs = [
    "Be perceived by peers as having engaged seriously with the proposal",
  ];
  assertParseSucceeds(input);
});

/* ---------------------------------------------------------------
 * Final tally
 * --------------------------------------------------------------- */
process.stdout.write("\n");
process.stdout.write(
  `${passCount} passed, ${failCount} failed (${passCount + failCount} total)\n`
);
if (failures.length > 0) {
  process.stdout.write("\nFAILURES:\n");
  failures.forEach((f) =>
    process.stdout.write(`  • ${f.name}\n    ${f.reason}\n`)
  );
  process.exit(1);
}
process.exit(0);
