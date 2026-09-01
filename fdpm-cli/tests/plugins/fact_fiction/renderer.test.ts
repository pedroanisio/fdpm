/**
 * ff:ManuscriptOutlineRenderer — the human-review document.
 *
 * The renderer owns the two read-side responsibilities the graph model
 * cannot express declaratively:
 *   1. The narrative-style cascade (work → arc → chapter → scene
 *      style_override, most specific wins) from the spike's
 *      NarrativeStyleOverrideSchema merge semantics.
 *   2. Epistemic surfacing: facts with no ff:Cites edge render UNCITED,
 *      facts with no ff:Assessment render UNASSESSED, disputed facts
 *      render DISPUTED.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { PROFILE_ID } from "../../../plugins/fact_fiction/index.js";

const WB = "ff-render";
const SCOPE = "scope:ff:workbook";

let host: Host;
let md = "";

async function prim(
  id: string,
  type_id: string,
  field_values: Record<string, unknown>,
): Promise<void> {
  await host.createPrimitive(WB, { id, type_id, scope_id: SCOPE, field_values });
}

async function rel(
  id: string,
  type_id: string,
  source_id: string,
  target_id: string,
  field_values?: Record<string, unknown>,
): Promise<void> {
  await host.createRelation(WB, { id, type_id, source_id, target_id, field_values });
}

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  await host.createProject({ workbook_id: WB, name: "Kadesh novel", profile_id: PROFILE_ID });

  await prim("wrk:kadesh", "ff:Work", {
    title: "The Chariots of Kadesh",
    historical_period: "Late Bronze Age Levant",
    world_start: "-1290",
    world_end: "-1258",
    regions: ["Orontes valley", "Pi-Ramesses"],
    pov: "third_person_limited",
    temporal_mode: "linear",
    tone_primary: "grim",
    narrator_distance: "medium",
    narrative_reliability: "reliable",
    archaic_level: "light",
    modern_intrusion_allowed: false,
    idiomatic_freedom: "low",
    real_figures_inner_thoughts_allowed: false,
    invented_inner_thoughts_allowed: true,
  });

  await prim("fact:battle", "ff:Fact", {
    label: "Battle of Kadesh",
    description: "Ramesses II engaged Muwatalli II's army at Kadesh.",
    date_start: "-1274",
    disputed: true,
    dispute_note: "Egyptian and Hittite accounts disagree on the outcome.",
  });
  await prim("fact:treaty", "ff:Fact", {
    label: "Silver Treaty",
    description: "Egypt and Hatti concluded a parity treaty.",
    date_start: "-1259",
  });
  await prim("src:poem", "ff:Source", {
    citation: "Kadesh inscriptions of Ramesses II (Poem).",
    type: "primary_source",
    reliability: "medium",
  });
  await rel("rel:c1", "ff:Cites", "fact:battle", "src:poem", { locator: "ll. 1-25" });
  await prim("assess:battle", "ff:Assessment", {
    fact_id: "fact:battle",
    assessor: "scholarly consensus",
    confidence_level: "high",
    source_id: "src:poem",
  });

  await prim("fic:charioteer", "ff:FictionElement", {
    label: "Menna the charioteer",
    mechanism: "invented_character",
    description: "A composite of the named shield-bearers.",
    historicity: "invented_but_constrained",
  });
  await rel("rel:b1", "ff:BasedOn", "fic:charioteer", "fact:battle");
  await rel("rel:l1", "ff:CouplesTo", "fic:charioteer", "fact:battle", {
    relation: "dramatizes",
    explanation: "Menna's charge dramatizes the documented counterattack.",
  });

  await prim("arc:war", "ff:Arc", {
    title: "The War Arc",
    style_override: { pov: "first_person" },
  });
  await prim("ch:one", "ff:Chapter", { title: "Mustering" });
  await prim("scene:muster", "ff:Scene", {
    title: "Mustering at Pi-Ramesses",
    summary: "The divisions assemble.",
  });
  await prim("scene:ford", "ff:Scene", {
    title: "Crossing the ford",
    summary: "The Amun division crosses the Orontes.",
    style_override: { narrator_distance: "distant" },
  });
  await rel("rel:s1", "ff:HasArc", "wrk:kadesh", "arc:war", { order: 1 });
  await rel("rel:s2", "ff:HasChapter", "arc:war", "ch:one", { order: 1 });
  // Deliberately register the later scene first: order metadata, not
  // insertion order, must drive the rendering.
  await rel("rel:s4", "ff:HasScene", "ch:one", "scene:ford", { order: 2 });
  await rel("rel:s3", "ff:HasScene", "ch:one", "scene:muster", { order: 1 });
  await rel("rel:d1", "ff:Depicts", "scene:ford", "fact:battle");
  await rel("rel:f1", "ff:Features", "scene:ford", "fic:charioteer");

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
    { rendererId: "ff:ManuscriptOutlineRenderer" },
  );
  md = new TextDecoder().decode(out.bytes);
});

describe("ff:ManuscriptOutlineRenderer", () => {
  it("renders the work header with title and period", () => {
    expect(md).toContain("The Chariots of Kadesh");
    expect(md).toContain("Late Bronze Age Levant");
  });

  it("orders scenes by HasScene order metadata, not insertion order", () => {
    const muster = md.indexOf("Mustering at Pi-Ramesses");
    const ford = md.indexOf("Crossing the ford");
    expect(muster).toBeGreaterThan(-1);
    expect(ford).toBeGreaterThan(-1);
    expect(muster).toBeLessThan(ford);
  });

  it("flags the uncited, unassessed fact and the disputed fact", () => {
    expect(md).toContain("UNCITED");
    expect(md).toContain("UNASSESSED");
    expect(md).toContain("DISPUTED");
    // The cited+assessed fact must not be the one flagged: its row
    // carries the citation and the assessor instead.
    expect(md).toContain("scholarly consensus");
  });

  it("resolves the style cascade: arc pov override + scene distance override", () => {
    // scene:ford inherits pov=first_person from the arc override and
    // narrator_distance=distant from its own override, everything else
    // from the work (temporal_mode=linear).
    const fordIdx = md.indexOf("Crossing the ford");
    const fordBlock = md.slice(fordIdx, fordIdx + 400);
    expect(fordBlock).toContain("first_person");
    expect(fordBlock).toContain("distant");
    // scene:muster inherits the arc pov but keeps the work's distance.
    const musterIdx = md.indexOf("Mustering at Pi-Ramesses");
    const musterBlock = md.slice(musterIdx, fordIdx);
    expect(musterBlock).toContain("first_person");
    expect(musterBlock).not.toContain("distant");
  });

  it("renders the coupling layer with relation kind and explanation", () => {
    expect(md).toContain("dramatizes");
    expect(md).toContain("Menna's charge dramatizes the documented counterattack.");
  });

  it("lists what each scene depicts and features", () => {
    const fordIdx = md.indexOf("Crossing the ford");
    const fordBlock = md.slice(fordIdx, fordIdx + 400);
    expect(fordBlock).toContain("Battle of Kadesh");
    expect(fordBlock).toContain("Menna the charioteer");
  });
});
