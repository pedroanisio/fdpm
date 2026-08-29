/**
 * Activation contract for fdpm.style: the profile the host serves is the
 * profile on disk, the ten author-declared relation types survive
 * finalizeProfile, and every entity carries a Zod validator that rejects
 * malformed input rather than storing it.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import {
  ENTITY_NAMES,
  GRAMMAR_TYPE_IDS,
  PLUGIN_ID,
  PROFILE_ID,
  RELATION_TYPES,
  primitiveTypeId,
} from "../../../plugins/style/sidecar.js";
import generated from "../../../plugins/style/generated/profile.json" with { type: "json" };

async function freshHost(): Promise<Host> {
  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  return host;
}

let host: Host;
beforeAll(async () => {
  host = await freshHost();
});

describe("fdpm.style activation", () => {
  it("registers profile:style:3.1 with all fifteen entities", () => {
    expect(host.profiles.has(PROFILE_ID)).toBe(true);
    const profile = host.profiles.getResolved(PROFILE_ID);
    const ids = profile.primitive_types.map((p) => p.id).sort();
    expect(ids).toEqual(ENTITY_NAMES.map(primitiveTypeId).sort());
    expect(ids).toContain("style:Style");
    expect(ids).toContain("style:ColorGrammar");
    expect(ids).toContain("style:CanonicalReference");
  });

  it("carries the ten author-declared relation types with their polymorphic endpoints", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const rels = profile.relation_types ?? [];
    expect(rels.map((r) => r.id).sort()).toEqual(RELATION_TYPES.map((r) => r.id).sort());

    // HasGrammar is polymorphic over all ten grammar sections. This is the
    // case the sidecar's ReferenceSpec cannot express and the reason the
    // relation types are hand-declared.
    const hasGrammar = rels.find((r) => r.id === "style:HasGrammar");
    expect(hasGrammar?.source_types).toEqual(["style:Style"]);
    expect(hasGrammar?.target_types).toEqual(GRAMMAR_TYPE_IDS);
    expect(hasGrammar?.target_types).toHaveLength(10);

    // DeclaresRule is polymorphic in the SOURCE position, which is the
    // mirror-image case.
    const declaresRule = rels.find((r) => r.id === "style:DeclaresRule");
    expect(declaresRule?.source_types).toEqual(GRAMMAR_TYPE_IDS);
    expect(declaresRule?.target_types).toEqual(["style:Rule"]);
  });

  it("the registered profile matches generated/profile.json (no runtime-only drift)", () => {
    const live = host.profiles.getResolved(PROFILE_ID);
    expect(live.primitive_types.map((p) => p.id).sort()).toEqual(
      generated.primitive_types.map((p) => p.id).sort(),
    );
    expect((live.relation_types ?? []).map((r) => r.id).sort()).toEqual(
      generated.relation_types.map((r) => r.id).sort(),
    );
    expect(live.version).toBe(generated.version);
  });

  it("registers the registry-outline renderer alongside one per entity", () => {
    const ids = host.plugins.listRenderers().map((r) => r.rendererId);
    expect(ids).toContain("style:StyleOutlineRenderer");
    for (const name of ENTITY_NAMES) expect(ids).toContain(`${PLUGIN_ID}:${name}MarkdownRenderer`);
  });
});

describe("per-entity Zod validators reject rather than store", () => {
  const WB = "style-validator-test";

  beforeAll(async () => {
    await host.createProject({ workbook_id: WB, name: "validator probe", profile_id: PROFILE_ID });
  });

  /** A minimal, valid Movement — the smallest thing the host will accept. */
  const goodMovement = {
    movement_id: "modernism",
    name: "Modernism",
    aliases: [],
    period: { kind: "open", start: 1890 },
  };

  it("accepts a well-formed primitive", async () => {
    const out = await host.createPrimitive(WB, {
      id: "style:Movement:modernism",
      type_id: "style:Movement",
      field_values: goodMovement,
    });
    expect(out.report.accepted).toBe(true);
    const stored = host.getProject(WB).primitives["style:Movement:modernism"];
    expect(stored?.field_values["name"]).toBe("Modernism");
  });

  it("rejects a MovementId that is not a lowercase slug", async () => {
    await expect(
      host.createPrimitive(WB, {
        id: "style:Movement:bad",
        type_id: "style:Movement",
        field_values: { ...goodMovement, movement_id: "Not A Slug" },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects an unknown field — the schema is closed", async () => {
    await expect(
      host.createPrimitive(WB, {
        id: "style:Movement:extra",
        type_id: "style:Movement",
        field_values: { ...goodMovement, movement_id: "extra", smuggled: true },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a closed period whose end precedes its start — a cross-FIELD refinement, at the host boundary", async () => {
    await expect(
      host.createPrimitive(WB, {
        id: "style:Movement:inverted",
        type_id: "style:Movement",
        field_values: {
          ...goodMovement,
          movement_id: "inverted",
          period: { kind: "closed", start: 1933, end: 1919 },
        },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a flattened-union arm violation at the host boundary", async () => {
    // kind "no-lines" carrying a stroke weight: representable in the
    // emitted FieldDefs, rejected by the entity superRefine. This is the
    // declared soundness loss being caught exactly where it must be.
    await expect(
      host.createPrimitive(WB, {
        id: "style:LineGrammar:bad",
        type_id: "style:LineGrammar",
        field_values: { grammar_id: "bad", kind: "no-lines", stroke_weight: 3 },
      }),
    ).rejects.toThrow(FDPMException);
  });

  it("rejects a relation whose endpoint does not exist", async () => {
    await expect(
      host.createRelation(WB, {
        id: "style:parentmovement:ghost",
        type_id: "style:ParentMovement",
        source_id: "style:Movement:modernism",
        target_id: "style:Movement:does-not-exist",
        field_values: {},
      }),
    ).rejects.toThrow(FDPMException);
  });
});
