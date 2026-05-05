import { describe, it, expect } from "vitest";
import { Host } from "../src/core/host.js";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Tests for the formal-specification schema widenings shipped in
 * commit 4d0163c:
 *
 *   1. fs:DesignDecision id_format accepts both `decision:foo` and
 *      `decision:d:01.01` (single- and two-segment ledger ids).
 *   2. fs:Assumption id_format accepts both shapes likewise
 *      (Assumption Ledger H-NN.kk).
 *   3. fs:Limitation id_format accepts both shapes (single-segment
 *      `limitation:methodology-bias` is now valid).
 *   4. fs:References.kind enum extended from 4 to 11 values to match
 *      observed real-world authoring vocabulary.
 *   5. The 35 `maxLength: 500` text-field caps were bumped to 800.
 *      Tested via fs:Phase.outputs accepting a 600-char value.
 *
 * Without these tests the widenings could silently regress (someone
 * narrows the regex back, the script that demonstrates the
 * widenings still passes because the data fits the narrower shape
 * too — the regression is invisible).
 */

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null });
  await host.load();
  return host;
}

async function newProject(host: Host, workbookId = "p"): Promise<void> {
  await host.createProject({
    workbook_id: workbookId,
    name: "P",
    profile_id: PROFILE_ID,
  });
}

// -- id_format widenings ------------------------------------------------

describe("fs:DesignDecision id_format", () => {
  it("accepts the single-segment `decision:{name}` form", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "decision:choose-rest",
      type_id: "fs:DesignDecision",
      field_values: {
        name: "choose-rest",
        context: "ctx",
        decision: "REST",
        alternatives: [{ option: "GraphQL", rejected_because: "scope" }],
        consequences: "ok",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("accepts the two-segment `decision:{kind}:{seq}` ledger form", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "decision:d:01.01",
      type_id: "fs:DesignDecision",
      field_values: {
        name: "ledger entry",
        context: "ctx",
        decision: "x",
        alternatives: [{ option: "y", rejected_because: "z" }],
        consequences: "ok",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("rejects malformed ids: empty segment, three+ segments, whitespace", async () => {
    const host = await freshHost();
    await newProject(host);
    for (const badId of ["decision:", "decision::foo", "decision:a:b:c", "decision:has space"]) {
      try {
        await host.createPrimitive("p", {
          id: badId,
          type_id: "fs:DesignDecision",
          field_values: {
            name: "x",
            context: "y",
            decision: "z",
            alternatives: [{ option: "a", rejected_because: "b" }],
            consequences: "c",
          },
        });
        throw new Error(`expected ${badId} to be rejected`);
      } catch (err) {
        // Validation rejection — confirm it's the id-format rule
        // specifically (not e.g. a missing-field error).
        const findings = (err as { findings?: Array<{ rule_id: string }> }).findings ?? [];
        expect(findings.some((f) => f.rule_id === "core:id-format")).toBe(true);
      }
    }
  });
});

describe("fs:Assumption id_format", () => {
  it("accepts the two-segment `assumption:h:NN.kk` ledger form", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "assumption:h:01.01",
      type_id: "fs:Assumption",
      field_values: {
        name: "first",
        statement: "We assume X.",
        kind: "axiom",
        falsifiable: false,
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("still accepts the single-segment `assumption:{name}` form", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "assumption:scaling",
      type_id: "fs:Assumption",
      field_values: {
        name: "scaling",
        statement: "We assume scaling holds.",
        kind: "assumption",
        falsifiable: true,
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

describe("fs:Limitation id_format", () => {
  it("accepts the single-segment `limitation:{name}` form (the change)", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "limitation:methodology-bias",
      type_id: "fs:Limitation",
      field_values: {
        description: "Methodology may carry bias.",
        kind: "limitation",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("still accepts the two-segment `limitation:{kind}:{seq}` form", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "limitation:scope:001",
      type_id: "fs:Limitation",
      field_values: {
        description: "Scope is limited to X.",
        kind: "limitation",
      },
    });
    expect(r.report.accepted).toBe(true);
  });
});

// -- fs:References.kind enum widening ----------------------------------

describe("fs:References.kind enum", () => {
  it.each([
    "uses",
    "refines",
    "overrides",
    "see_also",
    "governs",
    "records_decision",
    "records_assumption",
    "depends_on",
    "outputs_detail",
    "extends",
    "instantiates",
  ])("accepts kind=%s", async (kind) => {
    const host = await freshHost();
    await newProject(host);
    // Need two primitives to relate.
    await host.createPrimitive("p", {
      id: "principle:x",
      type_id: "fs:Principle",
      field_values: { name: "x", statement: "stmt" },
    });
    await host.createPrimitive("p", {
      id: "principle:y",
      type_id: "fs:Principle",
      field_values: { name: "y", statement: "stmt" },
    });
    const r = await host.createRelation("p", {
      id: `rel:${kind}`,
      type_id: "fs:References",
      source_id: "principle:x",
      target_id: "principle:y",
      field_values: { kind },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("rejects an undeclared kind value", async () => {
    const host = await freshHost();
    await newProject(host);
    await host.createPrimitive("p", {
      id: "principle:x",
      type_id: "fs:Principle",
      field_values: { name: "x", statement: "stmt" },
    });
    await host.createPrimitive("p", {
      id: "principle:y",
      type_id: "fs:Principle",
      field_values: { name: "y", statement: "stmt" },
    });
    await expect(
      host.createRelation("p", {
        id: "rel:bad",
        type_id: "fs:References",
        source_id: "principle:x",
        target_id: "principle:y",
        field_values: { kind: "invented_relation_kind" },
      }),
    ).rejects.toThrow(/enum|validation/i);
  });
});

// -- maxLength bump 500 → 800 ------------------------------------------

describe("formal-spec text fields accept 800-char content", () => {
  it("fs:Phase.outputs accepts a 600-char value (was rejected under old 500 cap)", async () => {
    const host = await freshHost();
    await newProject(host);
    const r = await host.createPrimitive("p", {
      id: "phase:1",
      type_id: "fs:Phase",
      field_values: {
        number: 1,
        name: "Phase 1",
        domain: "x",
        state_component: "S",
        question: "?",
        inputs: "i",
        outputs: "x".repeat(600), // > old cap 500, < new cap 800
        procedure: ["step"],
        exit_condition: "ec",
        objective: "obj",
      },
    });
    expect(r.report.accepted).toBe(true);
  });

  it("fs:Phase.outputs still rejects > 800 chars", async () => {
    const host = await freshHost();
    await newProject(host);
    await expect(
      host.createPrimitive("p", {
        id: "phase:2",
        type_id: "fs:Phase",
        field_values: {
          number: 2,
          name: "Phase 2",
          domain: "x",
          state_component: "S",
          question: "?",
          inputs: "i",
          outputs: "x".repeat(900), // > new cap 800
          procedure: ["step"],
          exit_condition: "ec",
          objective: "obj",
        },
      }),
    ).rejects.toThrow(/max_length|validation/i);
  });
});
