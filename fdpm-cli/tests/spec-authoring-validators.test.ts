import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";

/**
 * Tests for the cap:validator registrations the spec_authoring plugin
 * installs at activation. Covers one rule per predicate family — the
 * registrations themselves are mechanical wrappers around the same
 * helpers used by formal_specification.
 *
 * Each test asserts:
 *   1. The registered validator emits at the rule's declared level
 *      (error / warning), not as `info: predicate not evaluated`.
 *   2. The pipeline suppresses step-5's info emission for the rule_id
 *      so we get exactly one finding per logical check.
 */

async function loadHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  await host.createProject({
    workbook_id: "p",
    name: "P",
    profile_id: "profile:spec-authoring:0.1",
  });
  return host;
}

const DOCUMENT_BASE = {
  title: "X",
  spec_id: "spec:x:0",
  version: "0.1.0",
  status: "Draft",
  audience: "engineers",
  required_reads: ["CLAUDE.md"],
  disclaimer_path: "../../DISCLAIMER.md",
  pals_banner: true,
  date: "2026-05-04",
  generated_by: "test",
};

describe("spec_authoring — Document validators", () => {
  it("Document missing disclaimer_path is rejected with error", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p", {
        id: "spec:doc:bad",
        type_id: "spec:Document",
        field_values: { ...DOCUMENT_BASE, disclaimer_path: "" },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeDefined();
    const findings = caught!.findings ?? [];
    const hit = findings.find((f) => f.rule_id === "spec:val:document-has-disclaimer");
    expect(hit?.level).toBe("error");
    // No `info: predicate not evaluated` for this rule_id — pipeline must
    // suppress step-5 emission when a cap:validator is registered.
    const info = findings.find(
      (f) =>
        f.rule_id === "spec:val:document-has-disclaimer" && f.level === "info",
    );
    expect(info).toBeUndefined();
  });

  it("Document missing required_reads triggers a warning, not an error", async () => {
    const host = await loadHost();
    await host.createPrimitive("p", {
      id: "spec:doc:warn",
      type_id: "spec:Document",
      field_values: { ...DOCUMENT_BASE, required_reads: [] },
    });
    const report = host.validateProject("p");
    const docFindings = report.primitives
      .find((r) => r.target_id === "spec:doc:warn")
      ?.findings.filter((f) => f.rule_id === "spec:val:document-has-required-reads");
    expect(docFindings?.length).toBe(1);
    expect(docFindings?.[0]?.level).toBe("warning");
  });
});

describe("spec_authoring — ADR validators (graph predicates)", () => {
  async function buildAdrSetup(host: Host) {
    await host.createPrimitive("p", {
      id: "spec:adr:t",
      type_id: "spec:ADR",
      field_values: {
        adr_id: "ADR-T",
        title: "T",
        status: "proposed",
        date: "2026-05-04",
        context: "ctx",
        decision: "dec",
        consequences: [{ polarity: "positive", text: "ok" }],
      },
    });
    await host.createPrimitive("p", {
      id: "spec:opt:a",
      type_id: "spec:Option",
      field_values: { label: "A", description: "a", verdict: "chosen" },
    });
    await host.createPrimitive("p", {
      id: "spec:opt:b",
      type_id: "spec:Option",
      field_values: {
        label: "B",
        description: "b",
        verdict: "rejected",
        rejection_reason: "no",
      },
    });
  }

  it("ADR with only 1 Considers edge surfaces a warning at validateProject", async () => {
    const host = await loadHost();
    await buildAdrSetup(host);
    // One Considers edge only. The rule is a workbook-coherence check
    // (warning, not error) because it cannot be satisfied at primitive-
    // create time — the ADR exists before its outgoing relations.
    await host.createRelation("p", {
      id: "rel:c1",
      type_id: "spec:Considers",
      source_id: "spec:adr:t",
      target_id: "spec:opt:a",
      field_values: {},
    });
    const report = host.validateProject("p");
    const adrFindings = report.primitives
      .find((r) => r.target_id === "spec:adr:t")
      ?.findings.filter((f) => f.rule_id === "spec:val:adr-has-options");
    expect(adrFindings?.length).toBe(1);
    expect(adrFindings?.[0]?.level).toBe("warning");
  });

  it("ADR with 2 considered + 1 chose passes adr-has-options and adr-has-chosen", async () => {
    const host = await loadHost();
    await buildAdrSetup(host);
    await host.createRelation("p", {
      id: "rel:c1",
      type_id: "spec:Considers",
      source_id: "spec:adr:t",
      target_id: "spec:opt:a",
      field_values: {},
    });
    await host.createRelation("p", {
      id: "rel:c2",
      type_id: "spec:Considers",
      source_id: "spec:adr:t",
      target_id: "spec:opt:b",
      field_values: {},
    });
    await host.createRelation("p", {
      id: "rel:chose",
      type_id: "spec:Chose",
      source_id: "spec:adr:t",
      target_id: "spec:opt:a",
      field_values: {},
    });
    const report = host.validateProject("p");
    const adrFindings = report.primitives
      .find((r) => r.target_id === "spec:adr:t")
      ?.findings.filter(
        (f) =>
          f.rule_id === "spec:val:adr-has-options" ||
          f.rule_id === "spec:val:adr-has-chosen",
      );
    expect(adrFindings ?? []).toEqual([]);
  });
});

describe("spec_authoring — PALS-LAW reference validators", () => {
  it("Reference without verification posture is rejected", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p", {
        id: "spec:ref:r",
        type_id: "spec:Reference",
        field_values: {
          kind: "url",
          citation: "X",
          verification: "",
        },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeDefined();
    const hit = caught?.findings?.find(
      (f) => f.rule_id === "spec:val:reference-has-verification",
    );
    expect(hit?.level).toBe("error");
  });

  it("Unverified reference without note is rejected", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p", {
        id: "spec:ref:r",
        type_id: "spec:Reference",
        field_values: {
          kind: "url",
          citation: "X",
          verification: "unverified",
          // verification_note absent
        },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeDefined();
    const hit = caught?.findings?.find(
      (f) => f.rule_id === "spec:val:reference-unverified-needs-note",
    );
    expect(hit?.level).toBe("error");
  });

  it("Verified reference without note is accepted", async () => {
    const host = await loadHost();
    await host.createPrimitive("p", {
      id: "spec:ref:r",
      type_id: "spec:Reference",
      field_values: {
        kind: "url",
        citation: "X",
        verification: "verified",
      },
    });
    const report = host.validateProject("p");
    const findings = report.primitives.find((r) => r.target_id === "spec:ref:r")
      ?.findings.filter((f) => f.rule_id.startsWith("spec:val:reference-"));
    expect(findings ?? []).toEqual([]);
  });
});

describe("spec_authoring — MUST + unverifiable interlock", () => {
  it("MUST + unverifiable is rejected", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p", {
        id: "spec:req:m",
        type_id: "spec:Requirement",
        field_values: {
          label: "L",
          statement: "S",
          strength: "MUST",
          verifiability: "unverifiable",
        },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeDefined();
    const hit = caught?.findings?.find(
      (f) => f.rule_id === "spec:val:must-not-unverifiable",
    );
    expect(hit?.level).toBe("error");
  });

  it("SHOULD + unverifiable is accepted (downgrade path)", async () => {
    const host = await loadHost();
    await host.createPrimitive("p", {
      id: "spec:req:s",
      type_id: "spec:Requirement",
      field_values: {
        label: "L",
        statement: "S",
        strength: "SHOULD",
        verifiability: "unverifiable",
      },
    });
    const report = host.validateProject("p");
    const findings = report.primitives
      .find((r) => r.target_id === "spec:req:s")
      ?.findings.filter((f) => f.rule_id === "spec:val:must-not-unverifiable");
    expect(findings ?? []).toEqual([]);
  });
});

describe("spec_authoring — QAScenario six-fields", () => {
  it("missing response_measure produces six-fields error", async () => {
    const host = await loadHost();
    let caught: FDPMException | undefined;
    try {
      await host.createPrimitive("p", {
        id: "spec:qas:t",
        type_id: "spec:QAScenario",
        field_values: {
          title: "T",
          source: "s",
          stimulus: "s",
          environment: "e",
          artifact: "a",
          response: "r",
          response_measure: "",
        },
      });
    } catch (e) {
      caught = e as FDPMException;
    }
    expect(caught).toBeDefined();
    const hit = caught?.findings?.find(
      (f) => f.rule_id === "spec:val:qas-six-fields",
    );
    expect(hit?.level).toBe("error");
  });
});
