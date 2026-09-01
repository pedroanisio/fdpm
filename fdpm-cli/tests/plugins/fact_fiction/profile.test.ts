/**
 * profile:fact-fiction:0.1 — profile shape and host-load acceptance.
 *
 * The fact-fiction domain arrived as a standalone Zod spike
 * (~/spikes/schemas/narrative/fact-fiction). Its inspection found one
 * design flaw the document model could not avoid: per-fact embedded
 * sources with global id uniqueness meant one real-world source could
 * not be cited by two facts. The plugin normalizes sources into
 * first-class primitives; these tests pin the profile shape that makes
 * that possible.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import {
  PROFILE,
  PROFILE_ID,
  manifest,
} from "../../../plugins/fact_fiction/index.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  return host;
}

const PRIMITIVE_IDS = [
  "ff:Work",
  "ff:Fact",
  "ff:Source",
  "ff:Assessment",
  "ff:Constraint",
  "ff:FictionElement",
  "ff:Arc",
  "ff:Chapter",
  "ff:Scene",
];

const RELATION_IDS = [
  "ff:Cites",
  "ff:BasedOn",
  "ff:ConstrainedBy",
  "ff:SupportedBy",
  "ff:CouplesTo",
  "ff:HasArc",
  "ff:HasChapter",
  "ff:HasScene",
  "ff:Depicts",
  "ff:Features",
];

describe("profile:fact-fiction:0.1 shape", () => {
  it("declares exactly the nine primitive types of the coupled-layer model", () => {
    expect(PROFILE.id).toBe(PROFILE_ID);
    expect(PROFILE.primitive_types.map((t) => t.id).sort()).toEqual(
      [...PRIMITIVE_IDS].sort(),
    );
  });

  it("declares exactly the ten relation types", () => {
    expect(PROFILE.relation_types.map((t) => t.id).sort()).toEqual(
      [...RELATION_IDS].sort(),
    );
  });

  it("normalizes sources: ff:Source is a primitive and ff:Cites is Fact → Source", () => {
    const cites = PROFILE.relation_types.find((r) => r.id === "ff:Cites")!;
    expect(cites.source_types).toEqual(["ff:Fact"]);
    expect(cites.target_types).toEqual(["ff:Source"]);
  });

  it("ff:CouplesTo carries the seven-value LinkRelation enum and a required explanation", () => {
    const couples = PROFILE.relation_types.find((r) => r.id === "ff:CouplesTo")!;
    expect(couples.source_types).toEqual(["ff:FictionElement"]);
    expect(couples.target_types).toEqual(["ff:Fact"]);
    const meta = couples.metadata_schema ?? [];
    const relation = meta.find((f) => f.name === "relation")!;
    expect(relation.required).toBe(true);
    for (const value of [
      "directly_depends_on",
      "plausibly_extends",
      "dramatizes",
      "fills_gap_in",
      "reframes",
      "compresses",
      "contradicts",
    ]) {
      expect(String(relation.legacy_type)).toContain(`"${value}"`);
    }
    const explanation = meta.find((f) => f.name === "explanation")!;
    expect(explanation.required).toBe(true);
  });

  it("ff:Assessment.fact_id and source_id are core-resolved id-ref fields", () => {
    const assessment = PROFILE.primitive_types.find((t) => t.id === "ff:Assessment")!;
    const factRef = assessment.fields.find((f) => f.name === "fact_id")!;
    expect(factRef.kind).toBe("id-ref");
    expect(factRef.ref_type_id).toBe("ff:Fact");
    expect(factRef.required).toBe(true);
    const sourceRef = assessment.fields.find((f) => f.name === "source_id")!;
    expect(sourceRef.kind).toBe("id-ref");
    expect(sourceRef.ref_type_id).toBe("ff:Source");
    expect(sourceRef.required).toBe(false);
  });

  it("the structural chain is Work → Arc → Chapter → Scene with an order slot on each edge", () => {
    for (const [rel, src, tgt] of [
      ["ff:HasArc", "ff:Work", "ff:Arc"],
      ["ff:HasChapter", "ff:Arc", "ff:Chapter"],
      ["ff:HasScene", "ff:Chapter", "ff:Scene"],
    ] as const) {
      const def = PROFILE.relation_types.find((r) => r.id === rel)!;
      expect(def.source_types).toEqual([src]);
      expect(def.target_types).toEqual([tgt]);
      const order = (def.metadata_schema ?? []).find((f) => f.name === "order")!;
      expect(order.required).toBe(true);
    }
  });

  it("manifest and profile agree on the renderer binding", () => {
    const rendererCaps = manifest.capabilities.filter(
      (c) => c.capability_id === "cap:renderer",
    );
    expect(rendererCaps).toHaveLength(1);
    expect(rendererCaps[0]!.metadata?.["renderer_id"]).toBe(
      "ff:ManuscriptOutlineRenderer",
    );
    expect(rendererCaps[0]!.metadata?.["target"]).toBe("text/markdown");
  });
});

describe("host load", () => {
  it("registers the profile from plugins/ and resolves it", async () => {
    const host = await freshHost();
    const resolved = host.profiles.getResolved(PROFILE_ID);
    expect(resolved.primitive_types.map((t) => t.id)).toEqual(
      expect.arrayContaining(PRIMITIVE_IDS),
    );
  });

  it("creates a workbook bound to the profile", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "ff-shape",
      name: "ff-shape",
      profile_id: PROFILE_ID,
    });
    expect(host.getProject("ff-shape").workbook.profile_id).toBe(PROFILE_ID);
  });
});
