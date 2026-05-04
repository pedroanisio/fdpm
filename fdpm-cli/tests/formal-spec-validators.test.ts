import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { PROFILE_ID } from "../plugins/formal_specification/index.js";

/**
 * Regression tests for the 23 cap:validator registrations the
 * formal_specification plugin installs at activation. Each registration
 * binds a TypeScript evaluator to one of the rule's predicates; this
 * suite exercises every predicate FAMILY at least once and confirms
 * that the pipeline's step-5 info emission is suppressed for any
 * rule_id covered by a validator.
 */

async function loadHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  await host.createProject({
    project_id: "p1",
    name: "P1",
    profile_id: PROFILE_ID,
  });
  return host;
}

const PHASE_BASE = {
  number: 1,
  name: "Foundation",
  question: "What is the problem?",
  inputs: "Stakeholder briefs.",
  outputs: "Problem frame.",
  procedure: ["Interview stakeholders", "Synthesise"],
  exit_condition: "Problem frame written.",
  reads: { components: [] },
  writes: { components: ["S.problem_frame"] },
  formality_level: "structural",
};

describe("formal_specification cap:validator — non_trivial family", () => {
  it("phase missing `question` is rejected with an error finding", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p1", {
        id: "phase:99",
        type_id: "fs:Phase",
        field_values: { ...PHASE_BASE, question: "" },
        scope_id: "scope:fs:specification",
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught?.category).toBe("validation");
    const findings = (caught!.findings ?? []) as Array<{
      rule_id: string;
      level: string;
      field_path?: string | null;
    }>;
    const f = findings.find((x) => x.rule_id === "fs:val:phase-has-question");
    expect(f).toBeDefined();
    expect(f!.level).toBe("error");
    expect(f!.field_path).toBeNull();
  });

  it("phase WITH `question` is accepted (predicate passes; no error from this rule)", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "phase:1",
      type_id: "fs:Phase",
      field_values: PHASE_BASE,
      scope_id: "scope:fs:specification",
    });
    expect(result.report.accepted).toBe(true);
    const present = result.report.findings.find(
      (f) => f.rule_id === "fs:val:phase-has-question",
    );
    expect(present).toBeUndefined();
  });

  it("citation missing year is rejected (error)", async () => {
    const host = await loadHost();
    await expect(
      host.createPrimitive("p1", {
        id: "citation:noyear",
        type_id: "fs:Citation",
        field_values: {
          key: "noyear",
          authors: ["X"],
          title: "T",
          year: "",
        },
      }),
    ).rejects.toThrow(/validation/);
  });
});

describe("formal_specification cap:validator — min_items family", () => {
  it("equation with no variables is rejected (error)", async () => {
    const host = await loadHost();
    await expect(
      host.createPrimitive("p1", {
        id: "equation:bad",
        type_id: "fs:Equation",
        field_values: {
          name: "bad",
          expression: "f(x) = 0",
          notation: "ascii",
          variables: [],
        },
      }),
    ).rejects.toThrow(/validation/);
  });

  it("ablation with one variation is rejected (min_items=2)", async () => {
    const host = await loadHost();
    await expect(
      host.createPrimitive("p1", {
        id: "ablation:onevar",
        type_id: "fs:AblationStudy",
        field_values: {
          name: "onevar",
          base_configuration: "config:base",
          variations: [
            { label: "v1", changes: "x", result_metric: "accuracy", result_value: "0.9" },
          ],
        },
      }),
    ).rejects.toThrow(/validation/);
  });
});

describe("formal_specification cap:validator — boolean composition (status-conditional)", () => {
  it("assumption with status='assumed' but no risk_owner is rejected (error)", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p1", {
        id: "assumption:noowner",
        type_id: "fs:Assumption",
        field_values: {
          name: "noowner",
          statement: "X is true.",
          kind: "assumption",
          falsifiable: true,
          status: "assumed",
        },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught?.category).toBe("validation");
    const f = (caught!.findings ?? []).find(
      (x) =>
        (x as { rule_id: string }).rule_id === "fs:val:assumption-assumed-needs-owner",
    );
    expect(f).toBeDefined();
  });

  it("assumption with status='assumed' AND risk_owner is accepted", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "assumption:owned",
      type_id: "fs:Assumption",
      field_values: {
        name: "owned",
        statement: "Y is true.",
        kind: "assumption",
        falsifiable: true,
        status: "assumed",
        risk_owner: "RolePerson",
      },
    });
    expect(result.report.accepted).toBe(true);
    const f = result.report.findings.find(
      (x) => x.rule_id === "fs:val:assumption-assumed-needs-owner",
    );
    expect(f).toBeUndefined();
  });

  it("assumption with status NOT 'assumed' does not require risk_owner", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "assumption:verified",
      type_id: "fs:Assumption",
      field_values: {
        name: "verified",
        statement: "Z is true.",
        kind: "assumption",
        falsifiable: true,
        status: "verified",
      },
    });
    expect(result.report.accepted).toBe(true);
    const f = result.report.findings.find(
      (x) => x.rule_id === "fs:val:assumption-assumed-needs-owner",
    );
    expect(f).toBeUndefined();
  });
});

describe("formal_specification cap:validator — graph predicates (has_incoming/has_outgoing)", () => {
  it("phase without an incoming fs:OccursIn yields a warning (does NOT block)", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "phase:42",
      type_id: "fs:Phase",
      field_values: { ...PHASE_BASE, number: 42, name: "Lonely" },
      scope_id: "scope:fs:specification",
    });
    expect(result.report.accepted).toBe(true);
    const f = result.report.findings.find(
      (x) => x.rule_id === "fs:val:phase-has-failure-mode",
    );
    expect(f).toBeDefined();
    expect(f!.level).toBe("warning");
  });

  it("phase WITH an incoming fs:OccursIn does not yield the warning", async () => {
    const host = await loadHost();
    // Create the phase first (warning fires).
    await host.createPrimitive("p1", {
      id: "phase:7",
      type_id: "fs:Phase",
      field_values: { ...PHASE_BASE, number: 7, name: "Connected" },
      scope_id: "scope:fs:specification",
    });
    // Create a FailureMode and an OccursIn relation pointing at phase:7.
    await host.createPrimitive("p1", {
      id: "failure:phase-7:slow-discovery",
      type_id: "fs:FailureMode",
      field_values: {
        phase: "phase:7",
        slug: "slow-discovery",
        condition: "Stakeholders unavailable.",
        recovery: "Defer to async interviews.",
        severity: "degrades",
      },
    });
    await host.createRelation("p1", {
      id: "rel:phase-7-fm",
      type_id: "fs:OccursIn",
      source_id: "failure:phase-7:slow-discovery",
      target_id: "phase:7",
    });
    // Patch phase:7 (a no-op patch on `name` triggers re-validation).
    const patched = await host.patchPrimitive("p1", {
      id: "phase:7",
      field_values: { name: "Connected (validated)" },
    });
    expect(patched.report.accepted).toBe(true);
    const f = patched.report.findings.find(
      (x) => x.rule_id === "fs:val:phase-has-failure-mode",
    );
    expect(f).toBeUndefined();
  });
});

describe("formal_specification cap:validator — step-5 suppression for covered rule_ids", () => {
  it("creating a fs:FormalProperty does NOT emit a duplicate info finding for fs:val:property-has-intuition (covered by validator)", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "property:test",
      type_id: "fs:FormalProperty",
      field_values: {
        name: "test",
        claim: "X holds.",
        intuition: "Because Y.",
      },
    });
    expect(result.report.accepted).toBe(true);
    const matches = result.report.findings.filter(
      (f) => f.rule_id === "fs:val:property-has-intuition",
    );
    // Exactly zero (validator passed; step-5 suppressed because covered).
    expect(matches).toHaveLength(0);
  });

  it("creating a fs:FormalProperty WITHOUT intuition emits exactly one warning from the validator (no duplicate info)", async () => {
    const host = await loadHost();
    const result = await host.createPrimitive("p1", {
      id: "property:empty-intuition",
      type_id: "fs:FormalProperty",
      field_values: {
        name: "empty",
        claim: "X holds.",
        intuition: "",
      },
    });
    expect(result.report.accepted).toBe(true);
    const matches = result.report.findings.filter(
      (f) => f.rule_id === "fs:val:property-has-intuition",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.level).toBe("warning");
  });
});
