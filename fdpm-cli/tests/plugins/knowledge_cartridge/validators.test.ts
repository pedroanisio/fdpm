/**
 * Pass 6 as code.
 *
 * GENERATOR.md's verification pass is eleven checks with one instruction
 * attached: *"Mechanical checks only. No self-assessment — a model asked
 * whether its output is good will say yes… Run them as operations, not as
 * judgements."* In the document those checks are a markdown checklist that a
 * model is asked to honour. Here they are writes that get rejected.
 *
 * The graph-checkable ones are enforced below. The three that are not are
 * named in `KC_UNENFORCEABLE_CHECKS` and asserted to be documented rather than
 * silently dropped — an unenforceable check that nobody declared is
 * indistinguishable from one that passed.
 *
 * ARCHITECTURAL REQUIREMENT (PALS's LAW): a cartridge is assembled from model
 * output. Pass 4's GAP FILLING is the failure this file exists to stop — a
 * fluent uncited claim sitting in a document whose every other claim is cited.
 * `kc:val:normative-claim-cited` is the control; the tests below feed it the
 * uncited case and assert the rejection.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Host } from "../../../src/core/host.js";
import { PROFILE_ID, R, T } from "../../../plugins/knowledge_cartridge/ids.js";
import {
  KC_UNENFORCEABLE_CHECKS,
  KC_VALIDATORS,
  RULE,
} from "../../../plugins/knowledge_cartridge/validators.js";
import { seedCartridge } from "./_fixture.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

function findingIds(findings: ReadonlyArray<{ rule_id: string }>): string[] {
  return [...new Set(findings.map((f) => f.rule_id))];
}

/**
 * A rejected write THROWS: `Host.runWithValidation` raises
 * `FDPMException("validation", …)` carrying `findings` rather than returning a
 * report with `accepted: false`. Assert on the thrown findings.
 */
async function rejectedFindings(write: Promise<unknown>): Promise<
  Array<{ rule_id: string; level: string; message: string }>
> {
  try {
    await write;
  } catch (err) {
    const findings = (err as { findings?: Array<{ rule_id: string; level: string; message: string }> })
      .findings;
    if (findings) return findings;
    throw err;
  }
  throw new Error("expected the write to be rejected, but it was accepted");
}

/**
 * `Host.validateProject` returns findings grouped into per-primitive and
 * per-relation reports. Every assertion here is about the set of findings the
 * workbook produced, so flatten once rather than at every call site.
 */
function allFindings(report: {
  primitives: Array<{ findings: ReadonlyArray<{ rule_id: string; level: string; message: string }> }>;
  relations: Array<{ findings: ReadonlyArray<{ rule_id: string; level: string; message: string }> }>;
}): Array<{ rule_id: string; level: string; message: string }> {
  return [
    ...report.primitives.flatMap((r) => [...r.findings]),
    ...report.relations.flatMap((r) => [...r.findings]),
  ];
}

describe("knowledge-cartridge validators — registration", () => {
  it("registers one validator per enforceable Pass-6 check", () => {
    expect(KC_VALIDATORS.length).toBeGreaterThanOrEqual(4);
    for (const reg of KC_VALIDATORS) {
      expect(reg.type_id).toMatch(/^kc:/);
      expect(reg.rule_id).toMatch(/^kc:val:/);
      expect(typeof reg.fn).toBe("function");
    }
  });

  it("declares the checks it cannot enforce rather than dropping them", () => {
    // "Every ordinal resolves to a real sentence in a real document" needs a
    // doc-ray call; a validator is a pure function of the instance and its
    // relations. Declaring it keeps the gap visible.
    expect(KC_UNENFORCEABLE_CHECKS.length).toBeGreaterThan(0);
    for (const c of KC_UNENFORCEABLE_CHECKS) {
      expect(c.check.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(0);
    }
    expect(KC_UNENFORCEABLE_CHECKS.map((c) => c.check).join(" ")).toMatch(/ordinal/i);
  });
});

describe("kc:val:normative-claim-cited — the gap-filling control", () => {
  /**
   * The check fires on the kc:Cartridge header, not on each claim as it is
   * written, and that is forced rather than chosen: a citation is a
   * kc:CitesSource edge, an edge needs both endpoints to exist, and the host
   * validates every write against the proposed post-state. A layer type that
   * demanded an inbound citation at creation could never be created — in a
   * batch or otherwise. Pass 5 creates the header last, so gating it is the
   * same guarantee at the only point in the sequence where it is satisfiable.
   */
  it("cannot be a per-write check, because the claim must exist before its citation can", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "kc-v1", name: "V", profile_id: PROFILE_ID });
    const out = await host.createPrimitive("kc-v1", {
      id: "kc:invariant:uncited",
      type_id: T.Invariant,
      field_values: {
        rule: "Never set body text below 8pt.",
        value: ">= 8pt",
        falsifier: "A 6pt body column.",
      },
    });
    expect(out.report.accepted, "an uncited claim is writable; the header is what gates").toBe(true);
    expect(findingIds(out.report.findings)).not.toContain(RULE.claimCited);
  });

  it("refuses the cartridge header while any normative claim is uncited", async () => {
    const host = await freshHost();
    await host.createProject({ workbook_id: "kc-v1b", name: "V", profile_id: PROFILE_ID });
    for (const [id, typeId, fields] of [
      ["kc:constant:x", T.Constant, { name: "leading", value: "1.2", unit: "em" }],
      [
        "kc:step:x",
        T.Step,
        { position: 1, action: "Set the measure.", constrains_next: "Leading is derived from the measure." },
      ],
      [
        "kc:diagnostic:x",
        T.Diagnostic,
        {
          symptom: "Rivers in justified text.",
          cause: "Measure too narrow for the word length.",
          correction: "Widen the measure or set ragged right.",
        },
      ],
    ] as Array<[string, string, Record<string, unknown>]>) {
      const w = await host.createPrimitive("kc-v1b", { id, type_id: typeId, field_values: fields });
      expect(w.report.accepted, `${typeId} should be writable`).toBe(true);
    }

    const findings = await rejectedFindings(
      host.createPrimitive("kc-v1b", {
        id: "kc:cartridge:blocked",
        type_id: T.Cartridge,
        field_values: {
          cartridge_id: "TC-X-001",
          subject: "X",
          archetype: "Y",
          substrate: "doc-ray",
          snapshot_date: "2026-08-30",
          source_token_estimate: 1000,
          disclaimer: "Unreviewed.",
        },
      }),
    );
    expect(findingIds(findings)).toContain(RULE.claimCited);
    const f = findings.find((x) => x.rule_id === RULE.claimCited)!;
    // The finding names every offender, so the fix does not need a second run.
    expect(f.message).toContain("kc:constant:x");
    expect(f.message).toContain("kc:step:x");
    expect(f.message).toContain("kc:diagnostic:x");
  });

  it("is silent once every claim carries a citation", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v2");
    const report = host.validateProject(workbookId, { minLevel: "error" });
    const cited = allFindings(report).filter((f) => f.rule_id === RULE.claimCited);
    expect(cited, JSON.stringify(cited)).toEqual([]);
  });

  it("does not demand a citation from L5 judgement, which is explicitly non-executable", async () => {
    // GENERATOR.md Pass 5: "Prose is permitted here and only here, because this
    // layer is explicitly non-executable." An override is a practitioner's
    // condition for ignoring a rule, not a normative claim about the corpus.
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v4");
    const out = await host.createPrimitive(workbookId, {
      id: "kc:override:house-style",
      type_id: T.Override,
      field_values: {
        condition: "The house style sheet fixes the measure.",
        rationale: "A client contract outranks a typographic default.",
      },
    });
    expect(findingIds(out.report.findings)).not.toContain(RULE.claimCited);
    const report = host.validateProject(workbookId, { minLevel: "error" });
    expect(findingIds(allFindings(report))).not.toContain(RULE.claimCited);
  });
});

describe("kc:val:diagnostic-minimum / l5-non-empty — the under-harvest checks", () => {
  it("warns while L4 holds fewer than eight rows", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v5", { diagnostics: 3 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).toContain(RULE.diagnosticMinimum);
  });

  it("is quiet once L4 reaches eight rows", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v6", { diagnostics: 8 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).not.toContain(RULE.diagnosticMinimum);
  });

  it("flags a cartridge with no L5 at all — no adaptive expertise encoded", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v7", { overrides: 0 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).toContain(RULE.judgementPresent);
  });
});

describe("kc:val:exclusions-non-empty — the envelope-inflation control", () => {
  it("flags an envelope that excludes nothing", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v8", { exclusions: 0 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).toContain(RULE.exclusionsPresent);
  });
});

describe("kc:val:discard-rate — counted, never asserted", () => {
  it("flags a discard rate below 50%, computed from retained harvest rows", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v9", { harvestKept: 9, harvestDiscarded: 1 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).toContain(RULE.discardRate);
  });

  it("is quiet at or above 50%", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v10", { harvestKept: 3, harvestDiscarded: 7 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).not.toContain(RULE.discardRate);
  });

  it("says nothing when there is no harvest at all rather than dividing by zero", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v11", { harvestKept: 0, harvestDiscarded: 0 });
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(report))).not.toContain(RULE.discardRate);
  });
});

describe("kc:val:harvest-arm / gap-consistency — the remaining arms", () => {
  it("rejects a discarded harvest row that carries no reason", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v12");
    const findings = await rejectedFindings(
      host.createPrimitive(workbookId, {
        id: "kc:harvest:bad",
        type_id: T.Harvest,
        field_values: {
          citation_key: "BRING",
          ordinal: 1,
          verbatim: "Some sentence.",
          probe: "constraint",
          retained: false,
        },
      }),
    );
    expect(findingIds(findings)).toContain(RULE.harvestArm);
  });

  it("rejects a retained harvest row that carries a discard reason", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v13");
    const findings = await rejectedFindings(
      host.createPrimitive(workbookId, {
        id: "kc:harvest:bad2",
        type_id: T.Harvest,
        field_values: {
          citation_key: "BRING",
          ordinal: 2,
          verbatim: "Some sentence.",
          probe: "quantity",
          retained: true,
          discard_reason: "not transposable",
        },
      }),
    );
    expect(findingIds(findings)).toContain(RULE.harvestArm);
  });

  it("rejects an override that suspends nothing", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-v14");
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    // The fixture's overrides are all wired to an invariant.
    expect(findingIds(allFindings(report))).not.toContain(RULE.orphanOverride);

    await host.createPrimitive(workbookId, {
      id: "kc:override:dangling",
      type_id: T.Override,
      field_values: { condition: "Whenever.", rationale: "Because." },
    });
    const after = host.validateProject(workbookId, { minLevel: "warning" });
    expect(findingIds(allFindings(after))).toContain(RULE.orphanOverride);
  });
});

describe("knowledge-cartridge — a well-formed cartridge validates clean", () => {
  it("produces zero error-level findings", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-clean");
    const report = host.validateProject(workbookId, { minLevel: "error" });
    const errors = allFindings(report);
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });

  it("produces zero warning-level findings either", async () => {
    const host = await freshHost();
    const { workbookId } = await seedCartridge(host, "kc-clean2");
    const report = host.validateProject(workbookId, { minLevel: "warning" });
    const mine = allFindings(report).filter((f) => f.rule_id.startsWith("kc:"));
    expect(mine, JSON.stringify(mine, null, 2)).toEqual([]);
  });
});
