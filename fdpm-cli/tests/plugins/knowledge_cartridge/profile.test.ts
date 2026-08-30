/**
 * `profile:knowledge-cartridge:1.0` — the schema a talent cartridge lives in.
 *
 * The generator protocol (`plugins/knowledge_cartridge/GENERATOR.md`) already
 * did the design work: its Pass-5 "layer type contracts" are row shapes, not
 * prose, and its Pass-3 transposition test is a five-arm discriminated union.
 * This suite holds the profile to that document rather than to taste.
 *
 * Two properties are load-bearing and are asserted here rather than trusted:
 *
 *   - **The six layers are six types.** A cartridge that omits L4 or L5 has
 *     encoded a textbook, not a practitioner (GENERATOR.md §0), so the layers
 *     cannot be one polymorphic "item" type with a `layer` string — that would
 *     make "L4 has >= 8 rows" a filter rather than a count, and would let a
 *     diagnostic ship without a correction.
 *   - **Discarded harvest is retained.** Pass 6 requires a discard rate >= 50%.
 *     If the workbook stored only kept passages that number would be asserted
 *     by whoever wrote it, which is the SELF-CERTIFICATION failure Pass 6
 *     exists to prevent. `kc:Harvest.retained` makes it a count.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Host } from "../../../src/core/host.js";
import { PROFILE, manifest } from "../../../plugins/knowledge_cartridge/index.js";
import { PROFILE_ID, R, T } from "../../../plugins/knowledge_cartridge/ids.js";

function primitiveType(id: string) {
  const t = PROFILE.primitive_types.find((p) => p.id === id);
  expect(t, `primitive type ${id} must exist`).toBeDefined();
  return t!;
}

function fieldNames(typeId: string): string[] {
  return primitiveType(typeId).fields.map((f) => f.name);
}

describe("knowledge-cartridge profile — identity", () => {
  it("declares the profile id and version the manifest advertises", () => {
    expect(PROFILE.id).toBe(PROFILE_ID);
    expect(PROFILE_ID).toBe("profile:knowledge-cartridge:1.0");
    expect(manifest.id).toBe("fdpm.knowledge-cartridge");
    const profileCap = manifest.capabilities.find((c) => c.capability_id === "cap:profile");
    expect(profileCap).toBeDefined();
  });

  it("every declared primitive and relation type id is namespaced under kc:", () => {
    for (const p of PROFILE.primitive_types) expect(p.id).toMatch(/^kc:[A-Z]/);
    for (const r of PROFILE.relation_types ?? []) expect(r.id).toMatch(/^kc:[A-Z]/);
  });
});

describe("knowledge-cartridge profile — the six layers are six types", () => {
  it("ships one primitive type per layer, none of them a generic item", () => {
    for (const id of [T.Primitive, T.Invariant, T.Constant, T.Step, T.Diagnostic, T.Override]) {
      expect(PROFILE.primitive_types.some((p) => p.id === id), id).toBe(true);
    }
    // A polymorphic "item with a layer string" would defeat every cardinality
    // check Pass 6 asks for. Assert no such escape hatch exists.
    for (const p of PROFILE.primitive_types) {
      expect(p.fields.map((f) => f.name), `${p.id} must not carry a free "layer" field`).not.toContain("layer");
    }
  });

  it("L4 Diagnostic carries symptom, cause and correction — symptom first", () => {
    const names = fieldNames(T.Diagnostic);
    expect(names.slice(0, 3)).toEqual(["symptom", "cause", "correction"]);
  });

  it("L1 Invariant is falsifiable: it carries the thing that would violate it", () => {
    // GENERATOR.md Pass 3: "a constraint must be falsifiable — you must be able
    // to point at a page and say *this violates it*. If you cannot, it is a
    // theme, not a constraint."
    expect(fieldNames(T.Invariant)).toContain("falsifier");
  });

  it("L2 Constant carries a value and a unit, not prose", () => {
    const names = fieldNames(T.Constant);
    expect(names).toContain("value");
    expect(names).toContain("unit");
  });

  it("L3 Step carries its position and why it constrains the next step", () => {
    const names = fieldNames(T.Step);
    expect(names).toContain("position");
    expect(names).toContain("constrains_next");
  });

  it("L5 Override names the condition under which a rule is ignored", () => {
    expect(fieldNames(T.Override)).toContain("condition");
  });
});

describe("knowledge-cartridge profile — provenance and process", () => {
  it("kc:Harvest keeps discarded passages so the discard rate is counted, not asserted", () => {
    const names = fieldNames(T.Harvest);
    expect(names).toContain("retained");
    expect(names).toContain("discard_reason");
    expect(names).toContain("verbatim");
    expect(names).toContain("ordinal");
    expect(names).toContain("probe");
  });

  it("kc:Harvest.probe is the closed six-probe vocabulary from Pass 2", () => {
    const probe = primitiveType(T.Harvest).fields.find((f) => f.name === "probe")!;
    expect(probe.enum_values?.slice().sort()).toEqual(
      ["condition", "constraint", "failure", "ordering", "preference", "quantity"],
    );
  });

  it("kc:Source is tiered, because tiers make incompatible claims and must not co-rank", () => {
    const tier = primitiveType(T.Source).fields.find((f) => f.name === "tier")!;
    expect(tier.enum_values?.slice().sort()).toEqual(
      ["practitioner", "primary", "strategy", "tooling"],
    );
    expect(fieldNames(T.Source)).toContain("citation_key");
  });

  it("kc:EnvelopeItem distinguishes covered from excluded", () => {
    const arm = primitiveType(T.EnvelopeItem).fields.find((f) => f.name === "disposition")!;
    expect(arm.enum_values?.slice().sort()).toEqual(["covered", "excluded"]);
  });

  it("kc:Gap and kc:Conflict exist — the gap is the deliverable, and conflicts are not averaged", () => {
    expect(PROFILE.primitive_types.some((p) => p.id === T.Gap)).toBe(true);
    const conflict = fieldNames(T.Conflict);
    expect(conflict).toContain("value_a");
    expect(conflict).toContain("value_b");
  });

  it("kc:Cartridge records the numbers Pass 6 checks", () => {
    const names = fieldNames(T.Cartridge);
    for (const n of ["subject", "archetype", "substrate", "snapshot_date", "source_token_estimate"]) {
      expect(names, `kc:Cartridge must carry ${n}`).toContain(n);
    }
  });
});

describe("knowledge-cartridge profile — citation edges", () => {
  it("kc:CitesSource carries the ordinal, so a citation is KEY:ordinal not KEY", () => {
    const rel = (PROFILE.relation_types ?? []).find((r) => r.id === R.CitesSource);
    expect(rel, "kc:CitesSource must exist").toBeDefined();
    expect(rel!.fields?.map((f) => f.name)).toContain("ordinal");
    expect(rel!.target_types).toEqual([T.Source]);
    // Every layer type must be able to cite.
    for (const id of [T.Invariant, T.Constant, T.Step, T.Diagnostic, T.Override, T.Primitive]) {
      expect(rel!.source_types, `${id} must be able to cite a source`).toContain(id);
    }
  });

  it("kc:OverridesInvariant points L5 at the L1 rule it suspends", () => {
    const rel = (PROFILE.relation_types ?? []).find((r) => r.id === R.OverridesInvariant);
    expect(rel).toBeDefined();
    expect(rel!.source_types).toEqual([T.Override]);
    expect(rel!.target_types).toEqual([T.Invariant]);
  });
});

describe("knowledge-cartridge plugin — activation", () => {
  it("activates in a real Host and registers its profile, renderers and prompt", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();

    expect(host.profiles.getResolved(PROFILE_ID).id).toBe(PROFILE_ID);

    const renderers = host.plugins.listRenderers();
    for (const rendererId of [
      "kc:CartridgeRenderer",
      "kc:CitationIndexRenderer",
      "kc:LayerMapRenderer",
    ]) {
      expect(
        renderers.some((r) => r.rendererId === rendererId),
        `${rendererId} must be registered`,
      ).toBe(true);
    }

    const prompts = host.plugins.listPrompts().filter((p) => p.pluginId === "fdpm.knowledge-cartridge");
    expect(prompts.map((p) => p.promptId)).toEqual(["knowledge-cartridge/build_cartridge"]);
  });

  it("can create a workbook on the profile and write one primitive of every layer", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    await host.createProject({ workbook_id: "kc-smoke", name: "Smoke", profile_id: PROFILE_ID });

    const src = await host.createPrimitive("kc-smoke", {
      id: "kc:source:bringhurst",
      type_id: T.Source,
      field_values: {
        citation_key: "BRING",
        title: "The Elements of Typographic Style",
        tier: "primary",
        sentence_count: 4200,
      },
    });
    expect(src.report.accepted, JSON.stringify(src.report.findings)).toBe(true);

    const inv = await host.createPrimitive("kc-smoke", {
      id: "kc:invariant:measure",
      type_id: T.Invariant,
      field_values: {
        rule: "Set the measure between 45 and 75 characters.",
        value: "45-75 characters",
        falsifier: "A body column measuring 110 characters at 10pt.",
      },
    });
    expect(inv.report.accepted, JSON.stringify(inv.report.findings)).toBe(true);

    const cite = await host.createRelation("kc-smoke", {
      id: "kc:cite:measure-bring",
      type_id: R.CitesSource,
      source_id: "kc:invariant:measure",
      target_id: "kc:source:bringhurst",
      field_values: { ordinal: 424 },
    });
    expect(cite.report.accepted, JSON.stringify(cite.report.findings)).toBe(true);
  });
});
