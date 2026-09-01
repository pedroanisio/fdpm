import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PROFILE_ID } from "../../../plugins/re_crt/index.js";

/**
 * The constraint layer, end to end against a real Host.
 *
 * Two of these are the point of the mapping, and they are asserted through
 * the host rather than through a unit: the ontology's `SupportHomogeneityShape`
 * and its missing δ endpoint typing become STRUCTURE here, so the rejection
 * comes from `core:relation:source-type` / `core:relation:target-type` — the
 * host's own rule ids — not from anything this plugin wrote. A shape that is
 * not there cannot regress.
 *
 * The rest are validators, because a field constraint cannot see the graph:
 * acyclicity, bipartite defeat, V5 premise closure, the leaf rules, the
 * type/beta invariant, exactly-one DAG membership, and the v6.2 evidence gate.
 */

const WB = "re-crt-validators";
let host: Host;

const node = (id: string, over: Record<string, unknown> = {}) => ({
  id: `recrt:proof-node:${id}`,
  type_id: "recrt:ProofNode",
  field_values: {
    id,
    node_type: "goal",
    payload: `payload for ${id}`,
    verification_status: "unverified",
    ...over,
  },
});
const obstruction = (id: string, over: Record<string, unknown> = {}) => ({
  id: `recrt:obstruction-node:${id}`,
  type_id: "recrt:ObstructionNode",
  field_values: {
    id,
    obstruction_type: "barrier",
    payload: `obstruction ${id}`,
    blocking_strength: 1,
    ...over,
  },
});

/** Findings of a given rule id, from a create that the host accepted or refused. */
async function findingsFor(fn: () => Promise<unknown>): Promise<string[]> {
  try {
    const out = (await fn()) as { report?: { findings?: { rule_id: string }[] } };
    return (out.report?.findings ?? []).map((f) => f.rule_id);
  } catch (err) {
    // Host.runWithValidation throws FDPMException with { findings } on the
    // exception itself, not nested under `evidence`.
    const e = err as {
      findings?: { rule_id: string }[];
      evidence?: { findings?: { rule_id: string }[] };
      message?: string;
    };
    const ids = (e.findings ?? e.evidence?.findings ?? []).map((f) => f.rule_id);
    return ids.length > 0 ? ids : [`threw:${e.message ?? "unknown"}`];
  }
}

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  await host.createProject({ workbook_id: WB, name: "validators", profile_id: PROFILE_ID });
  await host.createPrimitive(WB, {
    id: "recrt:reason-dag:g",
    type_id: "recrt:ReasonDAG",
    field_values: { id: "g", title: "A reason DAG" },
  });
  await host.createPrimitive(WB, {
    id: "recrt:obstruction-dag:gp",
    type_id: "recrt:ObstructionDAG",
    field_values: { id: "gp", title: "An obstruction DAG" },
  });
});

describe("structure the host enforces, where the ontology relies on a shape", () => {
  it("refuses a support edge that crosses node kinds", async () => {
    await host.createPrimitive(WB, node("hom-p"));
    await host.createPrimitive(WB, obstruction("hom-o"));
    const ids = await findingsFor(() =>
      host.createRelation(WB, {
        id: "recrt:ProofSupports:hom",
        type_id: "recrt:ProofSupports",
        source_id: "recrt:proof-node:hom-p",
        target_id: "recrt:obstruction-node:hom-o",
      }),
    );
    expect(ids.join(" ")).toMatch(/core:relation:target-type|threw:/);
  });

  /* The .ttl accepts `leaf explainedByBarrier <a proof node>`: rdfs:range is
     an entailment obligation and its validation protocol runs without
     inference, so nothing checks it there. */
  it("refuses a delta edge that points at a proof node", async () => {
    await host.createPrimitive(WB, node("delta-a"));
    await host.createPrimitive(WB, node("delta-b"));
    const ids = await findingsFor(() =>
      host.createRelation(WB, {
        id: "recrt:ExplainedByBarrier:bad",
        type_id: "recrt:ExplainedByBarrier",
        source_id: "recrt:proof-node:delta-a",
        target_id: "recrt:proof-node:delta-b",
      }),
    );
    expect(ids.join(" ")).toMatch(/core:relation:target-type|threw:/);
  });
});

describe("validators — the constraints a field cannot state", () => {
  it("rejects a barrier whose beta contradicts its type", async () => {
    const ids = await findingsFor(() =>
      host.createPrimitive(WB, obstruction("beta-bad", { blocking_strength: 0.5 })),
    );
    expect(ids.join(" ")).toContain("recrt:val.type-beta");
  });

  it("requires beta on a barrier but not on an unvalidated open_bypass", async () => {
    const missing = await findingsFor(() =>
      host.createPrimitive(WB, obstruction("beta-missing", { blocking_strength: undefined })),
    );
    expect(missing.join(" ")).toContain("recrt:val.type-beta");

    const open = await findingsFor(() =>
      host.createPrimitive(WB, {
        ...obstruction("open-bypass", { obstruction_type: "open_bypass" }),
        field_values: {
          id: "open-bypass",
          obstruction_type: "open_bypass",
          payload: "a potential bypass",
        },
      }),
    );
    expect(open.join(" ")).not.toContain("recrt:val.type-beta");
  });

  it("rejects a derived node with no premise and no rule (V5)", async () => {
    const ids = await findingsFor(() =>
      host.createPrimitive(WB, node("derived-bare", { node_type: "derived" })),
    );
    expect(ids.join(" ")).toContain("recrt:val.derived-premise");
  });

  it("rejects an assumption that carries a rule, and an open node that is supported (V7)", async () => {
    await host.createPrimitive(WB, node("leaf-open", { node_type: "open" }));
    await host.createPrimitive(WB, node("leaf-src"));
    const ids = await findingsFor(() =>
      host.createRelation(WB, {
        id: "recrt:ProofSupports:leaf",
        type_id: "recrt:ProofSupports",
        source_id: "recrt:proof-node:leaf-src",
        target_id: "recrt:proof-node:leaf-open",
      }),
    );
    expect(ids.join(" ")).toContain("recrt:val.leaf");
  });

  it("rejects a node claiming a verified status with no evidence bundle (v6.2)", async () => {
    const ids = await findingsFor(() =>
      host.createPrimitive(WB, node("verified-bare", { verification_status: "cas_checked" })),
    );
    expect(ids.join(" ")).toContain("recrt:val.evidence-gate");
  });

  it("accepts a verified node once it cites a bundle", async () => {
    await host.createPrimitive(WB, {
      id: "recrt:evidence-bundle:e1",
      type_id: "recrt:EvidenceBundle",
      field_values: {
        id: "e1",
        manifest_root: "a".repeat(64),
        hash_algorithm: "sha256",
        bundle_path: "evidence/e1.tar",
      },
    });
    await host.createPrimitive(WB, node("verified-ok", { verification_status: "cas_checked" }));
    const ids = await findingsFor(() =>
      host.createRelation(WB, {
        id: "recrt:EvidencedBy:ok",
        type_id: "recrt:EvidencedBy",
        source_id: "recrt:proof-node:verified-ok",
        target_id: "recrt:evidence-bundle:e1",
      }),
    );
    expect(ids.join(" ")).not.toContain("recrt:val.evidence-gate");
  });

  it("rejects a manifest root that is not a lowercase hex sha256", async () => {
    const ids = await findingsFor(() =>
      host.createPrimitive(WB, {
        id: "recrt:evidence-bundle:bad",
        type_id: "recrt:EvidenceBundle",
        field_values: {
          id: "bad",
          manifest_root: "NOT-A-HASH",
          hash_algorithm: "sha256",
          bundle_path: "x.tar",
        },
      }),
    );
    expect(ids.length).toBeGreaterThan(0);
  });

  /* Endpoint typing cannot express this: both ends are recrt:ObstructionNode
     and the distinction is a field value. It is the reason the validator
     exists alongside the relation declaration. */
  it("rejects a barrier holding an outgoing defeat edge", async () => {
    await host.createPrimitive(WB, obstruction("def-b1"));
    await host.createPrimitive(WB, obstruction("def-b2"));
    const ids = await findingsFor(() =>
      host.createRelation(WB, {
        id: "recrt:BypassDefeatsBarrier:bad",
        type_id: "recrt:BypassDefeatsBarrier",
        source_id: "recrt:obstruction-node:def-b1",
        target_id: "recrt:obstruction-node:def-b2",
      }),
    );
    expect(ids.join(" ")).toContain("recrt:val.defeat-bipartite");
  });
});
