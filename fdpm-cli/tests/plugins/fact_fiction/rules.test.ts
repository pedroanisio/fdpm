/**
 * fact-fiction validation behavior, end to end through the Host.
 *
 * Includes the regression test for the flaw that motivated the plugin:
 * in the Zod spike, two facts could not cite the same source (global
 * source-id uniqueness over per-fact embedded copies). Here a source is
 * a primitive and citation is an edge, so sharing MUST work.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PROFILE_ID } from "../../../plugins/fact_fiction/index.js";

const SCOPE = "scope:ff:workbook";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

async function newWork(host: Host, id: string): Promise<void> {
  await host.createProject({ workbook_id: id, name: id, profile_id: PROFILE_ID });
}

const FACT_FIELDS = {
  label: "Battle of Kadesh",
  description: "Ramesses II engaged the Hittite army at Kadesh on the Orontes.",
  date_start: "-1274",
  place: "Kadesh",
};

const SOURCE_FIELDS = {
  citation: "Kadesh inscriptions of Ramesses II (Poem and Bulletin).",
  type: "primary_source",
  reliability: "medium",
};

async function seedFact(host: Host, wb: string, slug: string): Promise<string> {
  const id = `fact:${slug}`;
  await host.createPrimitive(wb, {
    id,
    type_id: "ff:Fact",
    scope_id: SCOPE,
    field_values: { ...FACT_FIELDS, label: slug },
  });
  return id;
}

async function seedSource(host: Host, wb: string, slug: string): Promise<string> {
  const id = `src:${slug}`;
  await host.createPrimitive(wb, {
    id,
    type_id: "ff:Source",
    scope_id: SCOPE,
    field_values: SOURCE_FIELDS,
  });
  return id;
}

function ruleIds(caught: unknown): string[] {
  const findings = ((caught as { findings?: Array<{ rule_id: string }> })?.findings ?? []);
  return findings.map((f) => f.rule_id);
}

describe("shared sources (the spike's design flaw, fixed by normalization)", () => {
  it("two facts cite the SAME source primitive via two ff:Cites edges", async () => {
    const host = await freshHost();
    await newWork(host, "w1");
    const src = await seedSource(host, "w1", "kadesh-poem");
    const factA = await seedFact(host, "w1", "kadesh-battle");
    const factB = await seedFact(host, "w1", "hittite-treaty");
    await host.createRelation("w1", {
      id: "rel:cites-a",
      type_id: "ff:Cites",
      source_id: factA,
      target_id: src,
      field_values: { locator: "Poem, ll. 1-25" },
    });
    await host.createRelation("w1", {
      id: "rel:cites-b",
      type_id: "ff:Cites",
      source_id: factB,
      target_id: src,
    });
    const slice = host.getProject("w1");
    const cites = Object.values(slice.relations).filter(
      (r) => r.type_id === "ff:Cites",
    );
    expect(cites).toHaveLength(2);
    expect(new Set(cites.map((r) => r.target_id))).toEqual(new Set([src]));
  });
});

describe("referential integrity via id-ref fields", () => {
  it("REJECTS an assessment whose fact_id names no primitive", async () => {
    const host = await freshHost();
    await newWork(host, "w2");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w2", {
        id: "assess:phantom",
        type_id: "ff:Assessment",
        scope_id: SCOPE,
        field_values: {
          fact_id: "fact:does-not-exist",
          assessor: "Braudel",
          confidence_level: "moderate",
        },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(ruleIds(caught)).toContain("core:field:id-ref");
  });

  it("REJECTS an assessment whose fact_id points at a non-Fact primitive", async () => {
    const host = await freshHost();
    await newWork(host, "w3");
    const src = await seedSource(host, "w3", "mistarget");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w3", {
        id: "assess:mistarget",
        type_id: "ff:Assessment",
        scope_id: SCOPE,
        field_values: { fact_id: src, assessor: "author", confidence_level: "low" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(ruleIds(caught)).toContain("core:field:id-ref");
  });

  it("ACCEPTS an assessment referencing an existing fact and source", async () => {
    const host = await freshHost();
    await newWork(host, "w4");
    const fact = await seedFact(host, "w4", "anchored");
    const src = await seedSource(host, "w4", "anchor-src");
    const { report } = await host.createPrimitive("w4", {
      id: "assess:anchored",
      type_id: "ff:Assessment",
      scope_id: SCOPE,
      field_values: {
        fact_id: fact,
        assessor: "scholarly consensus",
        confidence_level: "high",
        confidence_score: 0.9,
        source_id: src,
      },
    });
    expect(report.findings.filter((f) => f.level === "error")).toHaveLength(0);
  });
});

describe("ff:val:assessment-has-confidence", () => {
  it("REJECTS an assessment with neither confidence_level nor confidence_score", async () => {
    const host = await freshHost();
    await newWork(host, "w5");
    const fact = await seedFact(host, "w5", "unweighted");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w5", {
        id: "assess:unweighted",
        type_id: "ff:Assessment",
        scope_id: SCOPE,
        field_values: { fact_id: fact, assessor: "author" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(ruleIds(caught)).toContain("ff:val:assessment-has-confidence");
  });

  it("ACCEPTS score-only assessments (the spike's EpistemicConfidence contract)", async () => {
    const host = await freshHost();
    await newWork(host, "w6");
    const fact = await seedFact(host, "w6", "score-only");
    const { report } = await host.createPrimitive("w6", {
      id: "assess:score-only",
      type_id: "ff:Assessment",
      scope_id: SCOPE,
      field_values: { fact_id: fact, assessor: "author", confidence_score: 0.4 },
    });
    expect(report.findings.filter((f) => f.level === "error")).toHaveLength(0);
  });
});

describe("ff:val:disputed-fact-has-note", () => {
  it("REJECTS disputed=true without a dispute_note", async () => {
    const host = await freshHost();
    await newWork(host, "w7");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w7", {
        id: "fact:disputed-bare",
        type_id: "ff:Fact",
        scope_id: SCOPE,
        field_values: { ...FACT_FIELDS, disputed: true },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(ruleIds(caught)).toContain("ff:val:disputed-fact-has-note");
  });

  it("ACCEPTS disputed=true with a note", async () => {
    const host = await freshHost();
    await newWork(host, "w8");
    const { report } = await host.createPrimitive("w8", {
      id: "fact:disputed-noted",
      type_id: "ff:Fact",
      scope_id: SCOPE,
      field_values: {
        ...FACT_FIELDS,
        disputed: true,
        dispute_note: "Egyptian and Hittite accounts disagree on the outcome.",
      },
    });
    expect(report.findings.filter((f) => f.level === "error")).toHaveLength(0);
  });
});

describe("field-shape gates", () => {
  it("REJECTS an out-of-enum source type", async () => {
    const host = await freshHost();
    await newWork(host, "w9");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w9", {
        id: "src:bad-enum",
        type_id: "ff:Source",
        scope_id: SCOPE,
        field_values: { ...SOURCE_FIELDS, type: "wikipedia" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(ruleIds(caught)).toContain("core:field:enum");
  });

  it("REJECTS a confidence_score outside [0, 1]", async () => {
    const host = await freshHost();
    await newWork(host, "w10");
    const fact = await seedFact(host, "w10", "overconfident");
    let caught: unknown = null;
    try {
      await host.createPrimitive("w10", {
        id: "assess:overconfident",
        type_id: "ff:Assessment",
        scope_id: SCOPE,
        field_values: { fact_id: fact, assessor: "author", confidence_score: 1.5 },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
  });
});

describe("epistemic warnings surface without blocking writes", () => {
  it("an uncited fact and an ungrounded invented_dialogue element warn on validateProject", async () => {
    const host = await freshHost();
    await newWork(host, "w11");
    await seedFact(host, "w11", "uncited");
    await host.createPrimitive("w11", {
      id: "fic:whisper",
      type_id: "ff:FictionElement",
      scope_id: SCOPE,
      field_values: {
        label: "Whispered council",
        mechanism: "invented_dialogue",
        description: "Words never recorded in any source.",
        historicity: "plausible_inference",
      },
    });
    const report = host.validateProject("w11");
    const ids = report.primitives.flatMap((p) => p.findings).map((f) => f.rule_id);
    expect(ids).toContain("ff:val:fact-cited");
    expect(ids).toContain("ff:val:fiction-grounded");
  });

  it("a fully_invented element is exempt from the grounding warning", async () => {
    const host = await freshHost();
    await newWork(host, "w12");
    await host.createPrimitive("w12", {
      id: "fic:free",
      type_id: "ff:FictionElement",
      scope_id: SCOPE,
      field_values: {
        label: "Invented servant",
        mechanism: "invented_character",
        description: "Wholly fictional person.",
        historicity: "fully_invented",
      },
    });
    const report = host.validateProject("w12");
    const ids = report.primitives
      .flatMap((p) => p.findings)
      .filter((f) => f.rule_id === "ff:val:fiction-grounded")
      .map((f) => f.rule_id);
    expect(ids).toHaveLength(0);
  });
});

describe("relation gates", () => {
  it("REJECTS a ff:CouplesTo edge whose metadata relation is out of enum", async () => {
    const host = await freshHost();
    await newWork(host, "w13");
    const fact = await seedFact(host, "w13", "couple-target");
    await host.createPrimitive("w13", {
      id: "fic:couple-src",
      type_id: "ff:FictionElement",
      scope_id: SCOPE,
      field_values: {
        label: "Composite scribe",
        mechanism: "composite_character",
        description: "Two scribes merged.",
        historicity: "invented_but_constrained",
      },
    });
    let caught: unknown = null;
    try {
      await host.createRelation("w13", {
        id: "rel:couple-bad",
        type_id: "ff:CouplesTo",
        source_id: "fic:couple-src",
        target_id: fact,
        field_values: { relation: "vibes", explanation: "not a valid relation kind" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
  });

  it("REJECTS a ff:Cites edge from a fiction element (wrong source type)", async () => {
    const host = await freshHost();
    await newWork(host, "w14");
    const src = await seedSource(host, "w14", "wrong-src-type");
    await host.createPrimitive("w14", {
      id: "fic:not-a-fact",
      type_id: "ff:FictionElement",
      scope_id: SCOPE,
      field_values: {
        label: "Not a fact",
        mechanism: "invented_scene",
        description: "Fiction cannot cite directly; facts cite.",
        historicity: "fully_invented",
      },
    });
    let caught: unknown = null;
    try {
      await host.createRelation("w14", {
        id: "rel:bad-cites",
        type_id: "ff:Cites",
        source_id: "fic:not-a-fact",
        target_id: src,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
  });
});
