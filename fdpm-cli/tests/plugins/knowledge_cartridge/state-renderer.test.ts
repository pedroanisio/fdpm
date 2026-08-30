/**
 * `kc:StateRenderer` — the machine-readable projection.
 *
 * The other three views are for a human. This one is what an agent loads, so
 * the properties under test are different in kind: it must be BOUNDED, and when
 * it drops something it must SAY SO.
 *
 * The second half is the whole point. A view that silently truncates makes the
 * agent's memory silently lie — it will reason confidently from a projection it
 * believes is complete. `_truncated` is therefore mandatory whenever anything
 * was evicted, and its absence is a positive assertion that nothing was.
 *
 * Eviction is recency (ULID order, newest kept) with one exception: an
 * invariant an override suspends is load-bearing, because the override is
 * meaningless without the rule it points at. Dropping the rule and keeping the
 * exception would emit a projection that contradicts itself.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Host } from "../../../src/core/host.js";
import { STATE_RENDERER_ID, T } from "../../../plugins/knowledge_cartridge/ids.js";
import { KC_STATE_BUDGET_BYTES } from "../../../plugins/knowledge_cartridge/renderers/state_json.js";
import { seedCartridge, type SeedOptions } from "./_fixture.js";

interface StateDoc {
  cartridge: { id: string; subject: string; archetype: string; snapshot_date: string } | null;
  layers: Record<string, Array<Record<string, unknown>>>;
  sources: Array<{ key: string; title: string; tier: string }>;
  gaps: Array<{ statement: string }>;
  _rendered_at: string;
  _truncated?: { dropped: number; policy: string; by_layer: Record<string, number> };
}

async function stateOf(workbookId: string, opts?: SeedOptions): Promise<StateDoc> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  await seedCartridge(host, workbookId, opts);
  const slice = host.getProject(workbookId);
  const out = await host.plugins.runRenderer(
    "application/json",
    {
      workbookId,
      renderedAt: "2026-08-30T00:00:00.000Z",
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(slice.workbook.profile_id),
    },
    { rendererId: STATE_RENDERER_ID },
  );
  expect(out.contentType).toBe("application/json");
  return JSON.parse(new TextDecoder().decode(out.bytes)) as StateDoc;
}

describe("kc:StateRenderer — shape", () => {
  it("emits parseable JSON with the cartridge header and every layer", async () => {
    const doc = await stateOf("kc-s1");
    expect(doc.cartridge?.subject).toContain("Typesetting");
    for (const layer of ["primitives", "invariants", "constants", "steps", "diagnostics", "overrides"]) {
      expect(Object.keys(doc.layers), `missing ${layer}`).toContain(layer);
    }
  });

  it("carries citations inline, so a claim is checkable without a second call", async () => {
    const doc = await stateOf("kc-s2");
    const inv = doc.layers["invariants"]![0]!;
    expect(inv["cites"]).toBeDefined();
    expect(JSON.stringify(inv["cites"])).toMatch(/BRING/);
  });

  it("uses renderedAt rather than the wall clock, so two renders are byte-equal", async () => {
    const a = await stateOf("kc-s3");
    const b = await stateOf("kc-s3b");
    expect(a._rendered_at).toBe("2026-08-30T00:00:00.000Z");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("includes declared gaps — a projection that hid them would mislead the reader most", async () => {
    const doc = await stateOf("kc-s4");
    expect(doc.gaps.length).toBeGreaterThan(0);
    expect(JSON.stringify(doc.gaps)).toMatch(/variable fonts/i);
  });
});

describe("kc:StateRenderer — bounded, and honest about it", () => {
  it("stays within the byte budget", async () => {
    const doc = await stateOf("kc-s5", { diagnostics: 10 });
    expect(Buffer.byteLength(JSON.stringify(doc), "utf8")).toBeLessThanOrEqual(KC_STATE_BUDGET_BYTES);
  });

  it("omits _truncated entirely when nothing was dropped", async () => {
    const doc = await stateOf("kc-s6", { diagnostics: 1, overrides: 1 });
    expect(doc._truncated).toBeUndefined();
  });

  it("declares what it dropped, and how many, when the budget bites", async () => {
    // Comfortably past the 16 KB budget without being gratuitous: each
    // diagnostic row serialises to roughly 300 B, so 120 overflows by ~2x.
    // Every seed here boots a Host with every bundled plugin, so an
    // oversized fixture buys nothing and costs the whole suite.
    const doc = await stateOf("kc-s7", { diagnostics: 120 });
    expect(Buffer.byteLength(JSON.stringify(doc), "utf8")).toBeLessThanOrEqual(KC_STATE_BUDGET_BYTES);
    expect(doc._truncated, "a truncated projection MUST say so").toBeDefined();
    expect(doc._truncated!.dropped).toBeGreaterThan(0);
    expect(doc._truncated!.policy).toMatch(/recency/i);
    expect(doc._truncated!.by_layer["diagnostics"]).toBeGreaterThan(0);
    // The count must be honest: dropped + kept === the whole layer.
    const kept = doc.layers["diagnostics"]!.length;
    expect(kept + doc._truncated!.by_layer["diagnostics"]!).toBe(120);
  });

  it("never evicts an invariant that an override suspends", async () => {
    // The fixture wires both overrides to kc:invariant:measure. Under heavy
    // truncation the rule must survive, or the projection contradicts itself:
    // an exception to a rule that is not there.
    const doc = await stateOf("kc-s8", { diagnostics: 120, overrides: 2 });
    const invariantIds = doc.layers["invariants"]!.map((i) => i["id"]);
    expect(invariantIds).toContain("kc:invariant:measure");
  });

  it("keeps the newest rows when it evicts by recency", async () => {
    const doc = await stateOf("kc-s9", { diagnostics: 120 });
    const kept = doc.layers["diagnostics"]!.map((d) => String(d["id"]));
    expect(kept.length).toBeGreaterThan(0);
    // kc:diagnostic:d119 is minted last, so it outranks d0 under uid recency.
    expect(kept).toContain("kc:diagnostic:d119");
    expect(kept).not.toContain("kc:diagnostic:d0");
  });
});

describe("kc:StateRenderer — registration", () => {
  it("is the only application/json renderer, so no --renderer-id is needed", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    const json = host.plugins.listRenderers().filter((r) => r.target === "application/json");
    expect(json.map((r) => r.rendererId)).toEqual([STATE_RENDERER_ID]);
  });

  it("renders an empty workbook without throwing", async () => {
    const host = new Host({
      dataDir: null,
      builtinDirs: [join(process.cwd(), "plugins")],
      pluginPaths: [],
    });
    await host.load();
    await host.createProject({
      workbook_id: "kc-empty",
      name: "Empty",
      profile_id: "profile:knowledge-cartridge:1.0",
    });
    const slice = host.getProject("kc-empty");
    const out = await host.plugins.runRenderer(
      "application/json",
      {
        workbookId: "kc-empty",
        renderedAt: "2026-08-30T00:00:00.000Z",
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile: host.profiles.getResolved(slice.workbook.profile_id),
      },
      { rendererId: STATE_RENDERER_ID },
    );
    const doc = JSON.parse(new TextDecoder().decode(out.bytes)) as StateDoc;
    expect(doc.cartridge).toBeNull();
    expect(doc.layers["invariants"]).toEqual([]);
    expect(doc._truncated).toBeUndefined();
    expect(T.Cartridge).toBe("kc:Cartridge");
  });
});
