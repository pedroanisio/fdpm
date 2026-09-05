/**
 * Gate for profile:frontier-proof-loop:0.1 and its three seeded workbooks.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * Beyond "it builds clean", the gate asserts the properties that make the
 * loop runnable rather than described: every named verifier the pipeline
 * declares has an implementation, every CAS runner is an absolute path, and
 * the one blocking rule blocks.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { DomainProfile } from "../src/core/models/meta.js";
import type { ValidationFinding as Finding } from "../src/core/models/instance.js";
import { NAMED_VALIDATORS } from "../src/loop/named.js";
import { loadPipeline } from "../src/loop/pipeline.js";
import { ERROR_CLASSES } from "../plugins/silent_acceptance/ids.js";
import { buildFrontierProofLoop } from "../scripts/build-frontier-proof-loop.js";
import { FPL, FPL_R, FPL_RULE, PARENTS, PROFILE, PROFILE_ID } from "../scripts/frontier-proof-loop/profile.js";
import {
  AGENT_ASTRA_ID,
  KNOWLEDGE_WORKBOOK_ID,
  NAMED_VALIDATORS as DECLARED,
  ORCHESTRATION_WORKBOOK_ID,
  PIPELINE_ID,
  PROOFS_WORKBOOK_ID,
  STAGES,
  allSeeds,
} from "../scripts/frontier-proof-loop/seed.js";

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  return host;
}

describe("profile:frontier-proof-loop:0.1", () => {
  it("is a valid composition of its four parents", () => {
    expect(() => DomainProfile.parse(PROFILE)).not.toThrow();
    expect(PROFILE.id).toBe(PROFILE_ID);
    expect(PROFILE.extends).toEqual([...PARENTS]);
    expect(PROFILE.primitive_types.map((t) => t.id)).toEqual([FPL.Pursuit]);
    expect(PROFILE.relation_types.map((t) => t.id).sort()).toEqual(Object.values(FPL_R).sort());
  });
});

describe("the three workbooks build clean", () => {
  let host: Host;

  beforeAll(async () => {
    host = await freshHost();
    await buildFrontierProofLoop(host);
  });

  it("accepts every record in every workbook with no error or warning findings", () => {
    for (const wb of [ORCHESTRATION_WORKBOOK_ID, PROOFS_WORKBOOK_ID, KNOWLEDGE_WORKBOOK_ID]) {
      const report = host.validateProject(wb, { minLevel: "warning" });
      const findings = [...report.primitives, ...report.relations].flatMap((r) => r.findings.map((f) => `${wb}: ${f.level} ${f.rule_id} ${f.target_id}: ${f.message}`));
      expect(findings).toEqual([]);
    }
  });

  it("guards all four stages with a boundary over the nine error classes", () => {
    const relations = Object.values(host.getProject(ORCHESTRATION_WORKBOOK_ID).relations);
    expect(relations.filter((r) => r.type_id === FPL_R.BoundaryGuardsStage)).toHaveLength(STAGES.length);
    expect(relations.filter((r) => r.type_id === "sa:BoundaryDeclaresCoverage")).toHaveLength(STAGES.length * ERROR_CLASSES.length);
  });

  it("loads as a runnable pipeline whose every named validator is implemented", () => {
    const model = loadPipeline(host, ORCHESTRATION_WORKBOOK_ID, PIPELINE_ID);
    expect(model.stages.map((s) => s.name)).toEqual(["plan", "attempt", "audit", "register"]);
    const named = model.stages.flatMap((s) => s.contract.validators.filter((v) => v.kind === "named").map((v) => v.validator_name!));
    expect(new Set(named)).toEqual(new Set(DECLARED));
    for (const name of named) expect(NAMED_VALIDATORS.has(name), `${name} has no implementation`).toBe(true);
  });

  it("spells every CAS runner as an absolute path, because this shell aliases gp to git push", () => {
    const model = loadPipeline(host, ORCHESTRATION_WORKBOOK_ID, PIPELINE_ID);
    for (const stage of model.stages) {
      for (const v of stage.contract.validators) {
        if (v.validator_name !== "fpl.formal_artifact_check") continue;
        const runners = (JSON.parse(v.args ?? "{}") as { runners?: Record<string, string> }).runners ?? {};
        expect(runners["cas"]).toMatch(/^\//);
        expect(runners["python"]).toMatch(/^\//);
      }
    }
  });

  it("names the solver as the operator's configured Codex model", () => {
    const astra = host.getProject(ORCHESTRATION_WORKBOOK_ID).primitives[AGENT_ASTRA_ID];
    expect(astra?.field_values["model_id"]).toBe("gpt-6-astra");
  });

  it("implements every declared verifier with a pipeline record", () => {
    const slice = host.getProject(ORCHESTRATION_WORKBOOK_ID);
    const verifiers = Object.values(slice.primitives).filter((p) => p.type_id === "sa:Verifier");
    expect(verifiers.length).toBeGreaterThanOrEqual(10);
    const implemented = new Set(Object.values(slice.relations).filter((r) => r.type_id === FPL_R.VerifierImplementedBy).map((r) => r.source_id));
    for (const v of verifiers) expect(implemented.has(v.id), `${v.id} is implemented by nothing`).toBe(true);
  });

  it("is re-runnable against a host that already carries the profile", async () => {
    const again = await freshHost();
    expect((await buildFrontierProofLoop(again)).profile).toBe("registered");
    for (const seed of allSeeds()) await again.deleteProject(seed.header.id);
    expect((await buildFrontierProofLoop(again)).profile).toBe("already-present");
  });
});

describe("the blocking rule blocks", () => {
  it("rejects a pursuit whose proof and knowledge workbooks are the same", async () => {
    const host = await freshHost();
    await buildFrontierProofLoop(host);
    const existing = host.getProject(ORCHESTRATION_WORKBOOK_ID).primitives["fpl:pursuit:ecdlp-frontiermath"]!;
    let findings: Finding[] = [];
    try {
      const r = await host.createPrimitive(ORCHESTRATION_WORKBOOK_ID, {
        id: "fpl:pursuit:conflated",
        type_id: FPL.Pursuit,
        field_values: { ...existing.field_values, title: "conflated", knowledge_workbook_id: existing.field_values["proofs_workbook_id"] },
      });
      findings = r.report.findings;
    } catch (err) {
      findings = (err as { findings?: Finding[] }).findings ?? [];
    }
    const rule = findings.find((f) => f.rule_id === FPL_RULE.pursuitWorkbooksDistinct);
    expect(rule?.level).toBe("error");
    expect(rule?.evidence).not.toHaveProperty("parse_error");
  });
});
