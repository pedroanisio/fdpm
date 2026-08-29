/**
 * The five Family A renderers.
 *
 * Each is checked as the format it claims to be, not as a string that
 * happens to contain the right words: the SVG must keep its ink inside
 * its own viewBox and put its two edge families on opposite sides of the
 * stage row, the HTML must be a complete document, and the markdown must
 * carry arithmetic a reader can redo by hand.
 *
 * Every renderer is also checked for the thing it exists to find. A
 * matrix that renders beautifully and misses an unbound variable is
 * worse than no matrix, so the negative cases are built by mutating the
 * fixture into the defect and asserting the page names it.
 */
import { describe, expect, it } from "vitest";
import { ingestLoopForwardStore } from "../../../plugins/loop_forward/ingest.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import type { DomainProfile } from "../../../src/core/models/meta.js";
import { PROFILE } from "../../../plugins/loop_forward/index.js";
import {
  pipelineGraphLayout,
  renderPipelineGraph,
} from "../../../plugins/loop_forward/renderers/pipeline_graph.js";
import {
  controlRows,
  renderVerificationSurface,
} from "../../../plugins/loop_forward/renderers/verification_surface.js";
import {
  pipelineAuthority,
  renderAuthorityMatrix,
} from "../../../plugins/loop_forward/renderers/authority_matrix.js";
import {
  coverageRows,
  renderBindingMatrix,
  strayBindings,
} from "../../../plugins/loop_forward/renderers/binding_matrix.js";
import {
  budgetEnvelope,
  renderBudgetEnvelope,
} from "../../../plugins/loop_forward/renderers/budget_envelope.js";
import { readStore } from "../../../plugins/loop_forward/renderers/_model.js";
import { validStore } from "./_fixture.js";
import type { LoopForwardStore } from "../../../plugins/loop_forward/schemas/loop-forward.js";

function inputFor(store: LoopForwardStore = validStore()): RendererInput {
  const { primitives, relations } = ingestLoopForwardStore(store);
  return {
    workbookId: "wb-loop-forward",
    primitives,
    relations,
    profile: PROFILE as DomainProfile,
  };
}

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** An input with no primitives at all — every renderer must survive it. */
const emptyInput: RendererInput = {
  workbookId: "wb-empty",
  primitives: [],
  relations: [],
  profile: PROFILE as DomainProfile,
};

describe("shared model", () => {
  it("test_stages_come_back_in_execution_order", () => {
    const view = readStore(inputFor());
    const pipeline = view.pipelines[0]!;
    expect(pipeline.stages.map((s) => s.name)).toEqual(["draft", "review", "revise"]);
  });

  it("test_forward_binding_resolves_to_an_earlier_stage_object", () => {
    const pipeline = readStore(inputFor()).pipelines[0]!;
    const revise = pipeline.stages[2]!;
    const critique = revise.bindings.find((b) => b.variableName === "critique")!;
    expect(critique.sourceKind).toBe("stage_output");
    expect(critique.readsStage?.name).toBe("review");
    expect(critique.readsStage!.position).toBeLessThan(revise.position);
  });

  it("test_carry_resolves_to_its_source_stage", () => {
    const pipeline = readStore(inputFor()).pipelines[0]!;
    const history = pipeline.loop!.carries.find((c) => c.name === "history")!;
    expect(history.carryMode).toBe("append");
    expect(history.sourceStage?.name).toBe("revise");
  });
});

describe("A1 pipeline graph (image/svg+xml)", () => {
  it("test_output_is_svg_with_the_declared_content_type", () => {
    const out = renderPipelineGraph(inputFor());
    expect(out.contentType).toBe("image/svg+xml");
    const svg = decode(out.bytes);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("test_every_stage_gets_a_box_in_execution_order", () => {
    const layout = pipelineGraphLayout(readStore(inputFor()).pipelines[0]!);
    expect(layout.boxes.map((b) => b.name)).toEqual(["draft", "review", "revise"]);
    // Left to right, no overlap.
    for (let i = 1; i < layout.boxes.length; i += 1) {
      expect(layout.boxes[i]!.x).toBeGreaterThanOrEqual(
        layout.boxes[i - 1]!.x + layout.boxes[i - 1]!.w,
      );
    }
  });

  it("test_forward_arcs_sit_above_the_row_and_carries_below_it", () => {
    const layout = pipelineGraphLayout(readStore(inputFor()).pipelines[0]!);
    const rowTop = layout.boxes[0]!.y;
    const rowBottom = rowTop + layout.boxes[0]!.h;
    // Forward arcs apex above the boxes; carry lanes are under them.
    for (const edge of layout.forward) {
      expect(rowTop - edge.lane * 26).toBeLessThan(rowTop);
    }
    for (const carry of layout.carries) {
      expect(rowBottom + 18 + (carry.lane - 1) * 30).toBeGreaterThan(rowBottom);
    }
    expect(layout.forward.length).toBe(3);
    expect(layout.carries.length).toBe(2);
  });

  it("test_all_ink_stays_inside_the_viewbox", () => {
    const layout = pipelineGraphLayout(readStore(inputFor()).pipelines[0]!);
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.h).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.bandY + layout.bandH).toBeLessThanOrEqual(layout.height);
  });

  it("test_unguarded_stage_is_marked_in_the_drawing", () => {
    const layout = pipelineGraphLayout(readStore(inputFor()).pipelines[0]!);
    const revise = layout.boxes.find((b) => b.name === "revise")!;
    expect(revise.guarded).toBe(false);
    expect(decode(renderPipelineGraph(inputFor()).bytes)).toContain("UNGUARDED");
  });

  it("test_every_stop_condition_appears_with_its_terminal_state", () => {
    const layout = pipelineGraphLayout(readStore(inputFor()).pipelines[0]!);
    expect(layout.stops.map((s) => s.conditionId).sort()).toEqual([
      "accepted",
      "good_enough",
      "no_movement",
    ]);
    const stagnated = layout.stops.find((s) => s.conditionId === "no_movement")!;
    expect(stagnated.terminalState).toBe("stagnated");
    expect(stagnated.observedStageNames).toEqual(["draft", "review"]);
  });

  it("test_names_only_generic_font_families", () => {
    const svg = decode(renderPipelineGraph(inputFor()).bytes);
    const families = [...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]!);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(family).toMatch(/^ui-(sans-serif|monospace)/);
    }
  });

  it("test_empty_workbook_still_renders_an_svg", () => {
    const out = renderPipelineGraph(emptyInput);
    expect(decode(out.bytes)).toContain("declares no pipeline");
  });
});

describe("A2 verification surface (text/html)", () => {
  it("test_output_is_a_complete_html_document", () => {
    const out = renderVerificationSurface(inputFor());
    expect(out.contentType).toBe("text/html");
    const html = decode(out.bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    // Self-contained: nothing to fetch.
    expect(html).not.toMatch(/<link[^>]+href=|<script[^>]+src=/);
  });

  it("test_json_stage_passes_the_typed_parse_control", () => {
    const rows = controlRows(readStore(inputFor()).pipelines[0]!);
    const draft = rows.find((r) => r.stageName === "draft")!;
    expect(draft.typedParse).toBe(true);
    expect(draft.validatorCount).toBe(1);
    expect(draft.failurePath).toBe("retry ×2");
    expect(draft.unguarded).toBe(false);
  });

  it("test_markdown_stage_with_no_validator_is_reported_unguarded", () => {
    const rows = controlRows(readStore(inputFor()).pipelines[0]!);
    const revise = rows.find((r) => r.stageName === "revise")!;
    expect(revise.typedParse).toBe(false);
    expect(revise.validatorCount).toBe(0);
    expect(revise.unguarded).toBe(true);

    const html = decode(renderVerificationSurface(inputFor()).bytes);
    expect(html).toContain("no declared validator");
    expect(html).toContain("revise");
  });

  it("test_adversarial_example_is_attributed_to_the_stage_it_targets", () => {
    const rows = controlRows(readStore(inputFor()).pipelines[0]!);
    expect(rows.find((r) => r.stageName === "draft")!.adversarialCount).toBe(1);
    expect(rows.find((r) => r.stageName === "review")!.adversarialCount).toBe(0);
    expect(decode(renderVerificationSurface(inputFor()).bytes)).toContain(
      "no adversarial example",
    );
  });

  it("test_empty_workbook_renders_without_throwing", () => {
    expect(decode(renderVerificationSurface(emptyInput).bytes)).toContain("no pipeline");
  });
});

describe("A3 authority matrix (text/html)", () => {
  it("test_direct_grants_appear_with_their_approval_boundary", () => {
    const html = decode(renderAuthorityMatrix(inputFor()).bytes);
    expect(html).toContain("document.delete");
    expect(html).toContain("per action");
    expect(html).toContain("writer-agent");
  });

  it("test_pipeline_inherits_the_authority_of_its_stages_agents", () => {
    const pipeline = readStore(inputFor()).pipelines[0]!;
    const row = pipelineAuthority(pipeline);
    expect(row.agentNames.sort()).toEqual(["critic-agent", "writer-agent"]);
    expect(row.authorities).toEqual(["read", "write", "destructive"]);
    expect(row.elevated).toEqual(["destructive"]);
  });

  it("test_elevated_inherited_authority_is_reported_as_a_finding", () => {
    const html = decode(renderAuthorityMatrix(inputFor()).bytes);
    expect(html).toContain("exercises destructive");
    expect(html).toContain("inherited from its stages");
  });

  it("test_agent_with_no_grant_is_reported_as_text_only", () => {
    const store = validStore();
    store.agents[0]!.tool_policy = [];
    store.agents[1]!.tool_policy = [];
    const html = decode(renderAuthorityMatrix(inputFor(store)).bytes);
    expect(html).toContain("can only produce text");
  });

  it("test_empty_workbook_renders_without_throwing", () => {
    expect(decode(renderAuthorityMatrix(emptyInput).bytes)).toContain("declares no agent");
  });
});

describe("A4 binding matrix (text/html)", () => {
  it("test_every_declared_variable_gets_a_cell", () => {
    const rows = coverageRows(readStore(inputFor()).pipelines[0]!);
    expect(rows.map((r) => r.cells.length)).toEqual([2, 1, 3]);
    const draft = rows[0]!;
    expect(draft.cells.map((c) => c.variableName).sort()).toEqual(["max_words", "topic"]);
    for (const cell of draft.cells) expect(cell.bound).toBe(true);
  });

  it("test_source_kinds_are_reported_per_cell", () => {
    const rows = coverageRows(readStore(inputFor()).pipelines[0]!);
    const revise = rows[2]!;
    const kinds = Object.fromEntries(revise.cells.map((c) => [c.variableName, c.sourceKind]));
    expect(kinds["draft"]).toBe("stage_output");
    expect(kinds["critique"]).toBe("stage_output");
    expect(kinds["history"]).toBe("carried");
  });

  it("test_a_typed_input_binding_is_verified_not_assumed", () => {
    const rows = coverageRows(readStore(inputFor()).pipelines[0]!);
    const maxWords = rows[0]!.cells.find((c) => c.variableName === "max_words")!;
    // integer input into an integer variable — a real check, not a guess.
    expect(maxWords.typeVerdict).toBe("ok");
    const draft = rows[2]!.cells.find((c) => c.variableName === "draft")!;
    // stage output: the type lives in the source schema, so: unknown.
    expect(draft.typeVerdict).toBe("unknown");
  });

  it("test_unbound_required_variable_is_found_and_named", () => {
    const store = validStore();
    // Drop the binding that supplies `topic`.
    const stage = store.pipelines[0]!.stages[0]!;
    stage.bindings = stage.bindings.filter((b) => b.variable_name !== "topic");

    const rows = coverageRows(readStore(inputFor(store)).pipelines[0]!);
    const topic = rows[0]!.cells.find((c) => c.variableName === "topic")!;
    expect(topic.bound).toBe(false);
    expect(topic.typeVerdict).toBe("unbound");

    // The page escapes quotes, which is what a browser must receive.
    const html = decode(renderBindingMatrix(inputFor(store)).bytes);
    expect(html).toContain("A required variable &quot;topic&quot; is not bound");
  });

  it("test_carry_type_mismatch_is_found", () => {
    const store = validStore();
    // `history` is a string variable; point it at the number carry.
    const revise = store.pipelines[0]!.stages[2]!;
    revise.bindings = revise.bindings.map((b) =>
      b.variable_name === "history"
        ? { variable_name: "history", source: { kind: "carried" as const, carry_name: "last_score" } }
        : b,
    );
    const rows = coverageRows(readStore(inputFor(store)).pipelines[0]!);
    const history = rows[2]!.cells.find((c) => c.variableName === "history")!;
    expect(history.typeVerdict).toBe("mismatch");
    expect(decode(renderBindingMatrix(inputFor(store)).bytes)).toContain(
      "cannot satisfy its declared type string",
    );
  });

  it("test_stray_binding_is_found", () => {
    const store = validStore();
    const stage = store.pipelines[0]!.stages[0]!;
    stage.bindings = [
      ...stage.bindings,
      { variable_name: "not_declared", source: { kind: "literal" as const, value: "x" } },
    ];
    const stray = strayBindings(readStore(inputFor(store)).pipelines[0]!);
    expect(stray).toEqual([{ stage: "draft", variable: "not_declared" }]);
    expect(decode(renderBindingMatrix(inputFor(store)).bytes)).toContain(
      "computed and discarded",
    );
  });

  it("test_empty_workbook_renders_without_throwing", () => {
    expect(decode(renderBindingMatrix(emptyInput).bytes)).toContain("no pipeline");
  });
});

describe("A5 budget envelope (text/markdown)", () => {
  it("test_structural_bound_matches_the_contracts_own_arithmetic", () => {
    const envelope = budgetEnvelope(readStore(inputFor()).pipelines[0]!)!;
    // draft retries to 2, review to 3, revise fails outright (1).
    expect(envelope.attemptsPerIteration).toBe(6);
    expect(envelope.maxIterations).toBe(4);
    expect(envelope.structuralCalls).toBe(24);
  });

  it("test_pipeline_that_can_only_end_exhausted_is_named", () => {
    const envelope = budgetEnvelope(readStore(inputFor()).pipelines[0]!)!;
    expect(envelope.declaredCalls).toBe(8);
    expect(envelope.callsExceeded).toBe(true);

    const md = decode(renderBudgetEnvelope(inputFor()).bytes);
    expect(md).toContain("Every run of this pipeline ends `exhausted`");
    expect(md).toContain("budget reached first");
  });

  it("test_token_floor_is_labelled_a_floor_not_an_estimate", () => {
    const envelope = budgetEnvelope(readStore(inputFor()).pipelines[0]!)!;
    // (4000x2 draft) + (2000x3 review) + (4000x1 revise) = 18000 per iteration.
    expect(envelope.outputTokenFloor).toBe(18_000 * 4);
    const md = decode(renderBudgetEnvelope(inputFor()).bytes);
    expect(md).toContain("Output tokens are a **floor**");
  });

  it("test_append_carry_growth_is_reported", () => {
    const envelope = budgetEnvelope(readStore(inputFor()).pipelines[0]!)!;
    expect(envelope.appendCarryChars).toBe(32_000);
    expect(decode(renderBudgetEnvelope(inputFor()).bytes)).toContain(
      "re-sent as input on every later iteration",
    );
  });

  it("test_a_pipeline_within_budget_reports_no_finding", () => {
    const store = validStore();
    store.pipelines[0]!.loop.budget.max_model_calls = 100;
    store.pipelines[0]!.loop.budget.max_total_tokens = 5_000_000;
    const envelope = budgetEnvelope(readStore(inputFor(store)).pipelines[0]!)!;
    expect(envelope.callsExceeded).toBe(false);
    expect(envelope.tokensExceeded).toBe(false);
  });

  it("test_output_is_markdown_with_a_table_a_reader_can_check", () => {
    const out = renderBudgetEnvelope(inputFor());
    expect(out.contentType).toBe("text/markdown");
    const md = decode(out.bytes);
    expect(md).toContain("| Quantity | Structural worst case | Declared budget | Verdict |");
    expect(md).toContain("4 iterations × 6 attempts per iteration");
  });

  it("test_empty_workbook_renders_without_throwing", () => {
    expect(decode(renderBudgetEnvelope(emptyInput).bytes)).toContain("declares no pipeline");
  });
});

describe("determinism", () => {
  it("test_every_renderer_is_byte_stable_across_runs", () => {
    const renderers = [
      renderPipelineGraph,
      renderVerificationSurface,
      renderAuthorityMatrix,
      renderBindingMatrix,
      renderBudgetEnvelope,
    ];
    for (const render of renderers) {
      expect(decode(render(inputFor()).bytes)).toBe(decode(render(inputFor()).bytes));
    }
  });

  it("test_relation_order_does_not_change_any_output", () => {
    const base = inputFor();
    const shuffled: RendererInput = {
      ...base,
      primitives: [...base.primitives].reverse(),
      relations: [...base.relations].reverse(),
    };
    for (const render of [
      renderPipelineGraph,
      renderVerificationSurface,
      renderAuthorityMatrix,
      renderBindingMatrix,
      renderBudgetEnvelope,
    ]) {
      expect(decode(render(shuffled).bytes)).toBe(decode(render(base).bytes));
    }
  });
});
