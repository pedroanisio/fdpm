import { describe, expect, it } from "vitest";
import type { RendererInput } from "../../../src/plugin/types.js";
import { renderTriageReport } from "../../../plugins/re_crt/renderers/triage_report.js";

const text = (o: { bytes: Uint8Array }) => new TextDecoder().decode(o.bytes);

const input = (over: Partial<RendererInput> = {}): RendererInput =>
  ({
    workbookId: "wb",
    primitives: [
      { id: "d", type_id: "recrt:ReasonDAG", field_values: { title: "Demo proof" } },
      {
        id: "l1",
        type_id: "recrt:ProofNode",
        field_values: { node_type: "open", payload: "Does the bound hold?" },
      },
      {
        id: "l2",
        type_id: "recrt:ProofNode",
        field_values: { node_type: "open", payload: "Is the constant tight?" },
      },
      {
        id: "b1",
        type_id: "recrt:ObstructionNode",
        field_values: { obstruction_type: "barrier", payload: "No known technique" },
      },
    ],
    relations: [
      { id: "r1", type_id: "recrt:ExplainedByBarrier", source_id: "l1", target_id: "b1" },
    ],
    profile: { id: "profile:re-crt:6.2" },
    ...over,
  }) as unknown as RendererInput;

describe("recrt:TriageRenderer", () => {
  it("groups the open leaves by status", () => {
    const md = text(renderTriageReport(input()));
    expect(md).toContain("## Unblocked (1)");
    expect(md).toContain("## Blocked (1)");
    expect(md).toContain("Is the constant tight?");
    expect(md).toContain("Does the bound hold?");
  });

  it("names the barrier that blocks a leaf", () => {
    expect(text(renderTriageReport(input()))).toContain("No known technique");
  });

  it("pluralises its counts", () => {
    expect(text(renderTriageReport(input()))).toContain("2 open leaves");
    const one = renderTriageReport(
      input({
        primitives: [
          {
            id: "l1",
            type_id: "recrt:ProofNode",
            field_values: { node_type: "open", payload: "only one" },
          },
        ] as never,
        relations: [] as never,
      }),
    );
    expect(text(one)).toContain("1 open leaf,");
  });

  /* The undecided bucket is the documented failure mode: empty in any graph
     whose defeat relation is well-formed. Printing an empty section on every
     report would train a reader to skip it. */
  it("omits the undecided section when it is empty", () => {
    expect(text(renderTriageReport(input()))).not.toContain("## Undecided");
  });

  it("declares markdown and a per-workbook filename", () => {
    const out = renderTriageReport(input());
    expect(out.contentType).toBe("text/markdown");
    expect(out.filename).toBe("wb-triage.md");
  });
});
