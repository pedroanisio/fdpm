/**
 * The import path: contract document in, workbook graph out.
 *
 * The parse boundary is tested before anything else, because every
 * renderer downstream is written against parsed input and would be
 * meaningless if malformed documents could reach it.
 */
import { describe, expect, it } from "vitest";
import {
  ingestLoopForwardStore,
  readLoopForwardStore,
} from "../../../plugins/loop_forward/ingest.js";
import { R, T } from "../../../plugins/loop_forward/ids.js";
import { FIXTURE_IDS, rawStore, validStore } from "./_fixture.js";

describe("loop-forward ingest", () => {
  it("test_fixture_parses_against_the_vendored_contract", () => {
    expect(() => validStore()).not.toThrow();
  });

  it("test_every_primitive_type_the_fixture_exercises_is_produced", () => {
    const { counts } = ingestLoopForwardStore(validStore());
    expect(counts[T.PromptTemplate]).toBe(4);
    expect(counts[T.AgentDefinition]).toBe(2);
    expect(counts[T.Pipeline]).toBe(1);
    expect(counts[T.Stage]).toBe(3);
    expect(counts[T.OutputContract]).toBe(3);
    // 1 + 2 + 0 across the three stages.
    expect(counts[T.OutputValidator]).toBe(3);
    // 2 + 1 + 3 bindings.
    expect(counts[T.VariableBinding]).toBe(6);
    expect(counts[T.Carry]).toBe(2);
    expect(counts[T.StopCondition]).toBe(3);
    expect(counts[T.ToolGrant]).toBe(4);
    expect(counts[T.LoopConfig]).toBe(1);
    expect(counts[T.PipelineExample]).toBe(2);
  });

  it("test_forward_edge_points_at_an_earlier_stage", () => {
    const { primitives, relations } = ingestLoopForwardStore(validStore());
    const byId = new Map(primitives.map((p) => [p.id, p]));
    const forward = relations.filter((r) => r.type_id === R.BindingReadsStage);
    // review reads draft; revise reads draft and review.
    expect(forward).toHaveLength(3);
    for (const edge of forward) {
      const binding = byId.get(edge.source_id);
      const stage = byId.get(edge.target_id);
      expect(binding?.type_id).toBe(T.VariableBinding);
      expect(stage?.type_id).toBe(T.Stage);
    }
  });

  it("test_carry_back_edge_may_point_at_a_later_stage", () => {
    const { primitives, relations } = ingestLoopForwardStore(validStore());
    const byId = new Map(primitives.map((p) => [p.id, p]));
    const back = relations.filter((r) => r.type_id === R.CarryCapturesStage);
    expect(back).toHaveLength(2);
    // `history` captures the LAST stage — the thing a forward edge may
    // never do, and the reason carries exist at all.
    const positions = back.map((edge) => byId.get(edge.target_id)?.field_values["position"]);
    expect(positions).toContain(2);
  });

  it("test_unchanged_condition_observes_every_distinct_stage_once", () => {
    const { primitives, relations } = ingestLoopForwardStore(validStore());
    const stopIds = new Set(
      primitives.filter((p) => p.type_id === T.StopCondition).map((p) => p.id),
    );
    const observed = relations.filter(
      (r) => r.type_id === R.StopConditionObservesStage && stopIds.has(r.source_id),
    );
    // accepted -> review, good_enough -> review, no_movement -> draft + review.
    expect(observed).toHaveLength(4);
  });

  it("test_system_prompt_tri_state_is_preserved", () => {
    const { primitives } = ingestLoopForwardStore(validStore());
    const modes = primitives
      .filter((p) => p.type_id === T.Stage)
      .sort(
        (a, b) => Number(a.field_values["position"]) - Number(b.field_values["position"]),
      )
      .map((p) => p.field_values["system_prompt_mode"]);
    expect(modes).toEqual(["inherit", "override", "disabled"]);
  });

  it("test_ingest_is_deterministic_across_runs", () => {
    const first = ingestLoopForwardStore(validStore());
    const second = ingestLoopForwardStore(validStore());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("test_absent_optional_fields_are_omitted_not_nulled", () => {
    const { primitives } = ingestLoopForwardStore(validStore());
    const markdown = primitives.find(
      (p) => p.type_id === T.OutputContract && p.field_values["format"] === "markdown",
    );
    expect(markdown).toBeDefined();
    // `fail` carries no attempt ceiling; the key must be absent, so a
    // renderer asking "did the author set this?" gets the right answer.
    expect(Object.hasOwn(markdown!.field_values, "max_attempts")).toBe(false);
    expect(Object.hasOwn(markdown!.field_values, "json_schema")).toBe(false);
  });

  it("test_read_rejects_a_malformed_document_with_typed_issues", () => {
    const broken = rawStore() as Record<string, unknown>;
    const pipelines = broken["pipelines"] as Record<string, unknown>[];
    const pipeline = pipelines[0] as Record<string, unknown>;
    const stages = pipeline["stages"] as Record<string, unknown>[];
    // A stage may read only STRICTLY EARLIER stages. Point the first
    // stage at the last one and the contract must refuse the document.
    (stages[0] as Record<string, unknown>)["bindings"] = [
      {
        variable_name: "topic",
        source: { kind: "stage_output", stage_id: FIXTURE_IDS.reviseStage, path: "/draft" },
      },
      { variable_name: "max_words", source: { kind: "pipeline_input", input_name: "max_words" } },
    ];

    const outcome = readLoopForwardStore(broken);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(outcome.issues.some((issue) => /earlier stages/.test(issue.message))).toBe(true);
  });

  it("test_read_rejects_unknown_keys_rather_than_stripping_them", () => {
    const broken = rawStore() as Record<string, unknown>;
    Object.assign(broken, { extra_collection: [] });
    const outcome = readLoopForwardStore(broken);
    expect(outcome.ok).toBe(false);
  });

  it("test_read_rejects_a_non_object", () => {
    expect(readLoopForwardStore("not a store").ok).toBe(false);
    expect(readLoopForwardStore(null).ok).toBe(false);
  });
});
