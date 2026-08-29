/**
 * End to end: a source-shaped StyleRegistry goes in, a validated workbook
 * comes out, and the outline renderer reassembles the graph the ingest
 * took apart.
 *
 * The round trip is the real test of the decomposition. If a fact the
 * source carries as a field cannot be read back out of the primitives and
 * relations, the transcription lost it — and no amount of field-level
 * validation would have noticed.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { FDPMException } from "../../../src/core/errors/fdpm-exception.js";
import { buildStyleWorkbook } from "../../../plugins/style/ingest.js";
import { renderStyleOutline } from "../../../plugins/style/renderers/style_outline.js";
import { ENTITY_NAMES, PLUGIN_ID, PROFILE_ID, REL } from "../../../plugins/style/sidecar.js";
import { STYLE_OUTLINE_RENDERER_ID } from "../../../plugins/style/index.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import { bauhausOf, registryWith, validRegistry } from "./fixtures/registry.js";

const WB = "style-ingest-test";

let host: Host;
let report: Awaited<ReturnType<typeof buildStyleWorkbook>>;

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  report = await buildStyleWorkbook(host, validRegistry(), {
    workbookId: WB,
    workbookName: "Style registry (fixture)",
  });
});

describe("ingest", () => {
  it("writes a workbook on the style profile", () => {
    expect(report.profileId).toBe(PROFILE_ID);
    expect(report.workbookId).toBe(WB);
    expect(host.getProject(WB).workbook.profile_id).toBe(PROFILE_ID);
  });

  it("lands every entity the registry declares", () => {
    // 2 styles × (1 Style + 10 grammar sections) = 22
    // + 2 movements + 2×2 references (bauhaus 3, de-stijl 2) + rules + checks
    expect(report.byType["style:Style"]).toBe(2);
    expect(report.byType["style:Movement"]).toBe(2);
    // Bauhaus declares 7 rules, De Stijl 1.
    expect(report.byType["style:Rule"]).toBe(8);
    // Bauhaus declares 6 checks, De Stijl 1.
    expect(report.byType["style:ComplianceCheck"]).toBe(7);
    // Bauhaus 2 primary + 1 counter-example, De Stijl 1 + 1.
    expect(report.byType["style:CanonicalReference"]).toBe(5);
    // 2 Style + 2 Movement + 20 grammar + 8 Rule + 7 Check + 5 Reference.
    expect(report.primitives).toBe(44);
  });

  it("every write passed the host's §7 pipeline — the ingest checks do not replace it", () => {
    const slice = host.getProject(WB);
    // The host would have thrown on any field-level violation; the workbook
    // existing at all is the assertion. Confirm the stored shape survived.
    const bauhaus = slice.primitives["style:Style:bauhaus"];
    expect(bauhaus?.field_values["code"]).toBe("BAU");
    expect(bauhaus?.field_values["minimum_pass_ratio"]).toBe(0.8);
  });
});

describe("the decomposition preserves what the source carries", () => {
  it("turns Records into keyed entry lists without losing a key", () => {
    const bauhaus = host.getProject(WB).primitives["style:Style:bauhaus"]!;
    const colors = bauhaus.field_values["tokens_colors"] as { name: string; value: string }[];
    expect(colors.map((c) => c.name).sort()).toEqual(["accent", "ink", "paper"]);
    expect(colors.find((c) => c.name === "ink")?.value).toBe("#1A1A1A");

    const weights = bauhaus.field_values["tokens_weight_map"] as { step: number; weight: number }[];
    // Source keys are JSON strings; the projection restores them as numbers.
    expect(weights.map((w) => w.step).sort()).toEqual([4, 5]);
    expect(weights.find((w) => w.step === 4)?.weight).toBe(400);
  });

  it("flattens the origin-medium union onto its discriminant", () => {
    const bauhaus = host.getProject(WB).primitives["style:Style:bauhaus"]!;
    const om = bauhaus.field_values["origin_medium"] as Record<string, unknown>;
    expect(om.kind).toBe("single");
    expect(om.family).toBe("planographic");
    expect(om.process).toBe("lithography");
    expect(om.components).toBeUndefined();
  });

  it("lifts each grammar section into its own primitive, joined by section", () => {
    const slice = host.getProject(WB);
    const edges = Object.values(slice.relations).filter(
      (r) => r.type_id === REL.HasGrammar && r.source_id === "style:Style:bauhaus",
    );
    expect(edges).toHaveLength(10);
    const sections = edges.map((e) => e.field_values?.["section"]).sort();
    expect(sections).toEqual(
      ["color", "composition", "contrast", "form", "iconography", "line", "motion", "space", "surface", "typography"].sort(),
    );
    const line = slice.primitives["style:LineGrammar:bauhaus-line"];
    expect(line?.field_values["stroke_kind"]).toBe("uniform");
    expect(line?.field_values["stroke_weight"]).toBe(0.125);
  });

  it("turns exemplars, testsRule and reference buckets into traversable edges", () => {
    const slice = host.getProject(WB);
    const rels = Object.values(slice.relations);

    const exemplars = rels.filter((r) => r.type_id === REL.CitesExemplar);
    expect(exemplars.length).toBeGreaterThan(0);
    // Every exemplar edge points at a CanonicalReference that exists.
    for (const e of exemplars) expect(slice.primitives[e.target_id]?.type_id).toBe("style:CanonicalReference");

    const tests = rels.filter((r) => r.type_id === REL.TestsRule);
    expect(tests).toHaveLength(7);
    for (const t of tests) expect(slice.primitives[t.target_id]?.type_id).toBe("style:Rule");

    const buckets = rels
      .filter((r) => r.type_id === REL.HasReference && r.source_id === "style:Style:bauhaus")
      .map((r) => r.field_values?.["role"]);
    expect(buckets).toContain("primary");
    expect(buckets).toContain("counter-example");
  });

  it("records lineage as edges, including the cross-style influence", () => {
    const rels = Object.values(host.getProject(WB).relations);
    const influence = rels.find((r) => r.type_id === REL.InfluencesStyle);
    expect(influence?.source_id).toBe("style:Style:bauhaus");
    expect(influence?.target_id).toBe("style:Style:de-stijl");

    const parent = rels.find(
      (r) => r.type_id === REL.BelongsToMovement && r.source_id === "style:Style:bauhaus",
    );
    expect(parent?.target_id).toBe("style:Movement:modernism");

    const negates = rels.find((r) => r.type_id === REL.NegatesMovement);
    expect(negates?.target_id).toBe("style:Movement:historicism");
  });

  it("shares one CanonicalReference primitive across the rules that cite it", () => {
    const slice = host.getProject(WB);
    // bau-bayer-universal is cited by BAU-C-01, BAU-C-P01 and BAU-T-01.
    const citing = Object.values(slice.relations).filter(
      (r) => r.type_id === REL.CitesExemplar && r.target_id === "style:CanonicalReference:bau-bayer-universal",
    );
    expect(citing).toHaveLength(3);
    // One primitive, three edges — not three copies.
    expect(slice.primitives["style:CanonicalReference:bau-bayer-universal"]).toBeDefined();
  });
});

describe("nothing is written when verification fails", () => {
  it("refuses a registry whose cross-entity invariants do not hold, leaving no workbook", async () => {
    const broken = registryWith((reg) => {
      (bauhausOf(reg).references as Record<string, unknown>).counterExamples = [];
    });
    await expect(
      buildStyleWorkbook(host, broken, { workbookId: "style-should-not-exist" }),
    ).rejects.toThrow(FDPMException);
    expect(() => host.getProject("style-should-not-exist")).toThrow();
  });

  it("refuses a structurally malformed registry before it reaches the host", async () => {
    await expect(
      buildStyleWorkbook(host, { nonsense: true }, { workbookId: "style-also-not" }),
    ).rejects.toThrow(FDPMException);
    expect(() => host.getProject("style-also-not")).toThrow();
  });
});

describe("the outline renderer", () => {
  function render(): string {
    const slice = host.getProject(WB);
    const input = {
      workbookId: WB,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(PROFILE_ID),
    } as unknown as RendererInput;
    const out = renderStyleOutline(input);
    return new TextDecoder().decode(out.bytes);
  }

  it("emits markdown naming every style and movement", () => {
    const md = render();
    expect(md).toContain("# Style registry");
    expect(md).toContain("## Bauhaus `BAU`");
    expect(md).toContain("## De Stijl `DST`");
    expect(md).toContain("Modernism");
    expect(md).toContain("Historicism");
  });

  it("reassembles facts the ingest split across primitives and relations", () => {
    const md = render();
    // Period, from the Style primitive.
    expect(md).toContain("1919–1933");
    // Origin medium, from a flattened union.
    expect(md).toContain("planographic (lithography)");
    // An axiom with its mandatory citation.
    expect(md).toContain("Art and technology — a new unity.");
    // A rule, reached through HasGrammar -> DeclaresRule.
    expect(md).toContain("BAU-L-01");
    expect(md).toContain("BAU-L-P01");
    // Its exemplar, reached through CitesExemplar.
    expect(md).toContain("Table Lamp MT 8");
    // A check and the rule it tests, through DeclaresCheck -> TestsRule.
    expect(md).toContain("CC-BAU-02");
    expect(md).toContain("stroke-weight-ratio");
    // A counter-example, reached through HasReference with its role.
    expect(md).toContain("The Grammar of Ornament");
    // The token layer.
    expect(md).toContain("#1A1A1A");
    expect(md).toContain("WCAG contract");
  });

  it("prints all ten grammar sections for each style", () => {
    const md = render();
    for (const section of [
      "line",
      "color",
      "form",
      "space",
      "surface",
      "typography",
      "composition",
      "contrast",
      "iconography",
      "motion",
    ]) {
      expect(md).toContain(`#### ${section}`);
    }
  });

  it("renders an empty workbook without throwing", () => {
    const input = {
      workbookId: "empty",
      primitives: [],
      relations: [],
      profile: host.profiles.getResolved(PROFILE_ID),
    } as unknown as RendererInput;
    const md = new TextDecoder().decode(renderStyleOutline(input).bytes);
    expect(md).toContain("no style:Style primitives");
  });
});

describe("the per-entity renderers the manifest advertises", () => {
  /**
   * index.ts registers one markdown renderer per entity and advertises all
   * fifteen in fdpm-plugin.json. An advertised capability nothing exercises
   * is indistinguishable from a broken one, so each is run through the
   * host's own dispatch rather than called directly.
   */
  async function runRenderer(rendererId: string): Promise<string> {
    const slice = host.getProject(WB);
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: WB,
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId },
    );
    return new TextDecoder().decode(out.bytes);
  }

  it("runs every one of the fifteen without throwing", async () => {
    for (const name of ENTITY_NAMES) {
      const md = await runRenderer(`${PLUGIN_ID}:${name}MarkdownRenderer`);
      expect(md.length).toBeGreaterThan(0);
    }
  });

  it("renders the fields of the entity it is registered for", async () => {
    const md = await runRenderer(`${PLUGIN_ID}:RuleMarkdownRenderer`);
    expect(md).toContain("BAU-L-01");
    expect(md).toContain("BAU-L-P01");
    expect(md).toContain("Stroke weight is uniform across the whole artifact.");

    const colour = await runRenderer(`${PLUGIN_ID}:ColorGrammarMarkdownRenderer`);
    expect(colour).toContain("palette_limit_kind");
    expect(colour).toContain("capped");
  });

  it("KNOWN BRIDGE LIMIT: a list-of-struct field stringifies as [object Object]", async () => {
    // zodSchemaToMarkdownRenderer stringifies array elements with String(),
    // so `palette` — a list of {name, hex, role} structs — loses its
    // contents. This is @fdpm/zod-bridge behaviour shared by every plugin
    // that uses the generated renderers, NOT something this plugin
    // introduces, so it is asserted rather than worked around: the day the
    // bridge fixes it, this test fails and the note in README.md comes out.
    const colour = await runRenderer(`${PLUGIN_ID}:ColorGrammarMarkdownRenderer`);
    expect(colour).toContain("[object Object]");
    expect(colour).not.toContain("#1A1A1A");
    // The outline renderer in this plugin does NOT have the defect: it is
    // hand-written and prints the palette hexes.
    const outline = await runRenderer(STYLE_OUTLINE_RENDERER_ID);
    expect(outline).toContain("#1A1A1A");
  });

  it("dispatches the outline renderer through the host too", async () => {
    const md = await runRenderer(STYLE_OUTLINE_RENDERER_ID);
    expect(md).toContain("# Style registry");
    expect(md).toContain("## Bauhaus `BAU`");
  });

  it("says so plainly when a type has no primitives, rather than emitting nothing", async () => {
    const empty = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
    await empty.load();
    await empty.createProject({ workbook_id: "blank", name: "blank", profile_id: PROFILE_ID });
    const slice = empty.getProject("blank");
    const out = await empty.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "blank",
        workbook: slice.workbook,
        primitives: [],
        relations: [],
        templates: [],
        profile: empty.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: `${PLUGIN_ID}:MovementMarkdownRenderer` },
    );
    expect(new TextDecoder().decode(out.bytes)).toContain("no style:Movement primitives");
  });
});
