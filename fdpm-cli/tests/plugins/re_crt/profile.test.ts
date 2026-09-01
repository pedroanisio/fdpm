import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PLUGIN_ID, PROFILE_ID } from "../../../plugins/re_crt/index.js";

/**
 * `profile:re-crt:6.2` — the artifact layer of the RE-CRT ontology.
 *
 * The mapping's claim is not that RDF can be transcribed, but that two of the
 * ontology's SHACL shapes stop being checks and become structure:
 *
 *  - `explainedByBarrier` (δ) has no endpoint typing in the .ttl, so a δ edge
 *    pointing at a bypass, or at a proof node, validates. `rdfs:range` is an
 *    entailment, not a constraint, and the ontology's own validation protocol
 *    runs without inference. Here the endpoints are declared on the relation
 *    type and the host rejects a mistyped edge at error level.
 *  - `SupportHomogeneityShape` forbids a support edge crossing node kinds.
 *    Declared as two relation types, a cross-kind support edge cannot be
 *    expressed at all.
 */

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

let host: Host;
beforeAll(async () => {
  host = await freshHost();
});

const PRIMITIVES = [
  "recrt:ProofNode",
  "recrt:ObstructionNode",
  "recrt:ReasonDAG",
  "recrt:ObstructionDAG",
  "recrt:Rule",
  "recrt:RuleBasis",
  "recrt:SideCondition",
  "recrt:Claim",
  "recrt:Theorem",
  "recrt:EvidenceBundle",
];

describe("fdpm.re-crt activation", () => {
  it("registers the profile under a semver version", () => {
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    const p = host.profiles.getResolved(PROFILE_ID);
    // The ontology versions itself "6.2"; FDPM requires major.minor.patch.
    expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PLUGIN_ID).toBe("fdpm.re-crt");
  });

  it("carries every class the ontology declares", () => {
    const ids = host.profiles.getResolved(PROFILE_ID).primitive_types.map((t) => t.id);
    expect(ids.sort()).toEqual([...PRIMITIVES].sort());
  });

  it("closes the five enumerations, which OWL needs oneOf + AllDifferent to state", () => {
    const p = host.profiles.getResolved(PROFILE_ID);
    const field = (type: string, name: string) =>
      p.primitive_types.find((t) => t.id === type)?.fields.find((f) => f.name === name);

    expect(field("recrt:ProofNode", "node_type")?.enum_values).toEqual([
      "assumption",
      "derived",
      "goal",
      "condition",
      "open",
    ]);
    expect(field("recrt:ObstructionNode", "obstruction_type")?.enum_values).toEqual([
      "barrier",
      "conditional_barrier",
      "bypass",
      "open_bypass",
    ]);
    expect(field("recrt:ProofNode", "verification_status")?.enum_values).toEqual([
      "unverified",
      "cas_checked",
      "proof_witnessed",
      "axiom",
    ]);
    expect(field("recrt:Claim", "claim_status")?.enum_values).toHaveLength(7);
    expect(field("recrt:Claim", "confidence")?.enum_values).toEqual(["high", "medium", "low"]);
  });

  it("types the duality maps, which the ontology leaves unconstrained", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    const delta = rels.find((r) => r.id === "recrt:ExplainedByBarrier")!;
    expect(delta.source_types).toEqual(["recrt:ProofNode"]);
    expect(delta.target_types).toEqual(["recrt:ObstructionNode"]);
    const deltaPerp = rels.find((r) => r.id === "recrt:BypassTargets")!;
    expect(deltaPerp.source_types).toEqual(["recrt:ObstructionNode"]);
    expect(deltaPerp.target_types).toEqual(["recrt:ProofNode"]);
  });

  it("splits support into two kind-homogeneous relations rather than one polymorphic edge", () => {
    const rels = host.profiles.getResolved(PROFILE_ID).relation_types ?? [];
    const proof = rels.find((r) => r.id === "recrt:ProofSupports")!;
    const obstruction = rels.find((r) => r.id === "recrt:ObstructionSupports")!;
    expect(proof.source_types).toEqual(["recrt:ProofNode"]);
    expect(proof.target_types).toEqual(["recrt:ProofNode"]);
    expect(obstruction.source_types).toEqual(["recrt:ObstructionNode"]);
    expect(obstruction.target_types).toEqual(["recrt:ObstructionNode"]);
    // No relation may accept a node of either kind on both ends.
    expect(rels.some((r) => (r.source_types ?? []).length > 1 && r.id.endsWith("Supports"))).toBe(
      false,
    );
  });

  it("pins the evidence manifest root to a lowercase hex sha256", () => {
    const bundle = host.profiles
      .getResolved(PROFILE_ID)
      .primitive_types.find((t) => t.id === "recrt:EvidenceBundle")!;
    const root = bundle.fields.find((f) => f.name === "manifest_root")!;
    expect(root.required).toBe(true);
    expect(JSON.stringify(root.validations)).toContain("[0-9a-f]{64}");
  });

  it("registers the triage renderer", () => {
    const ids = host.plugins.listRenderers().map((r) => r.rendererId);
    expect(ids).toContain("recrt:TriageRenderer");
  });
});
