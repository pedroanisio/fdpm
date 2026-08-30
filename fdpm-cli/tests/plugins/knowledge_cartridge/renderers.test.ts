/**
 * The three views, run against a real workbook rather than a hand-built model.
 *
 * A renderer that is only ever exercised from a unit test with a synthetic
 * input has never proved it can read what the host actually stores, so every
 * case below seeds through `Host` and renders through the plugin runtime.
 *
 * What is asserted is what each view is FOR, not its wording:
 *
 *   - the cartridge must print the back matter. A view that renders the rules
 *     and hides the gaps is the audit failure the protocol exists to prevent,
 *     and it would look perfectly fine;
 *   - the citation index must print UNCHECKED for the three checks it cannot
 *     make. A scoreboard showing only enforceable checks is self-certification;
 *   - the layer map must mark a layer under its floor, because a cartridge with
 *     three diagnostics and no judgement is a textbook and the whole point of
 *     the view is to show that at a glance.
 *
 * Determinism is asserted too: renderers sort before emitting because primitive
 * and relation collections are sets, and a view whose output moves between runs
 * cannot be diffed by a reviewer.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Host } from "../../../src/core/host.js";
import {
  CARTRIDGE_RENDERER_ID,
  CITATION_INDEX_RENDERER_ID,
  LAYER_MAP_RENDERER_ID,
} from "../../../plugins/knowledge_cartridge/ids.js";
import { seedCartridge, type SeedOptions } from "./_fixture.js";

async function renderOf(
  target: string,
  rendererId: string,
  workbookId: string,
  opts?: SeedOptions,
): Promise<string> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  await seedCartridge(host, workbookId, opts);
  const slice = host.getProject(workbookId);
  const out = await host.plugins.runRenderer(
    target,
    {
      workbookId,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile: host.profiles.getResolved(slice.workbook.profile_id),
    },
    { rendererId },
  );
  return new TextDecoder().decode(out.bytes);
}

describe("kc:CartridgeRenderer — the artifact", () => {
  it("prints every layer under its own heading", async () => {
    const md = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r1");
    for (const heading of [
      "L0 · Primitives",
      "L1 · Invariants",
      "L2 · Constants",
      "L3 · Procedures",
      "L4 · Diagnostics",
      "L5 · Judgement",
    ]) {
      expect(md, `missing ${heading}`).toContain(heading);
    }
  });

  it("carries a KEY:ordinal on every normative row", async () => {
    const md = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r2");
    expect(md).toMatch(/BRING:424/);
    expect(md).toMatch(/HOCH:88/);
  });

  it("prints the declared gaps and the unreconciled conflicts, not just the rules", async () => {
    const md = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r3");
    expect(md).toContain("## Declared gaps");
    expect(md).toContain("Optical sizing in variable fonts");
    expect(md).toContain("## Unreconciled conflicts");
    // Both sides of the conflict, attributed. Never averaged, never picked.
    expect(md).toContain("1.2 times the type size");
    expect(md).toContain("Between 1.2 and 1.5, depending on the measure");
  });

  it("reports the discard rate as a count, not a claim", async () => {
    const md = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r4", {
      harvestKept: 3,
      harvestDiscarded: 7,
    });
    expect(md).toContain("## Construction record");
    expect(md).toMatch(/Discard rate \| 70%/);
  });

  it("names the checks it cannot make", async () => {
    const md = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r5");
    expect(md).toContain("Checks this render cannot make");
    expect(md).toMatch(/ordinal resolves/i);
  });

  it("is deterministic across two renders of the same state", async () => {
    const a = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r6");
    const b = await renderOf("text/markdown", CARTRIDGE_RENDERER_ID, "kc-r6b");
    expect(a).toBe(b);
  });
});

describe("kc:CitationIndexRenderer — the verification surface", () => {
  it("inverts the evidence: each source with the claims resting on it", async () => {
    const html = await renderOf("text/html", CITATION_INDEX_RENDERER_ID, "kc-r7");
    expect(html).toContain("Evidence by source");
    expect(html).toContain("BRING");
    expect(html).toContain("HOCH");
    expect(html).toContain("kc:invariant:measure");
  });

  it("prints UNCHECKED for the checks the graph cannot answer", async () => {
    const html = await renderOf("text/html", CITATION_INDEX_RENDERER_ID, "kc-r8");
    expect(html).toContain("UNCHECKED");
    expect(html).toMatch(/UNCHECKED is not PASS/);
  });

  it("shows a clean scoreboard for a well-formed cartridge", async () => {
    const html = await renderOf("text/html", CITATION_INDEX_RENDERER_ID, "kc-r9");
    expect(html).not.toContain('class="fail"');
  });

  it("fails the scoreboard when a floor is missed", async () => {
    const html = await renderOf("text/html", CITATION_INDEX_RENDERER_ID, "kc-r10", {
      diagnostics: 2,
      overrides: 0,
    });
    expect(html).toContain('class="fail"');
    expect(html).toContain("2 diagnostics");
    expect(html).toContain("0 overrides");
  });
});

describe("kc:LayerMapRenderer — is this a practitioner or a textbook?", () => {
  it("emits well-formed SVG with a row per layer", async () => {
    const svg = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r11");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    for (const label of ["L0 · Primitives", "L4 · Diagnostics", "L5 · Judgement"]) {
      expect(svg).toContain(label);
    }
  });

  it("hatches a layer under its Pass-6 floor, so the mark survives a greyscale print", async () => {
    const under = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r12", {
      diagnostics: 2,
    });
    expect(under).toContain("url(#under)");
    const ok = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r13", { diagnostics: 8 });
    expect(ok).not.toContain("url(#under)");
  });

  it("reports the harvest split and flags a discard rate under the floor", async () => {
    const svg = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r14", {
      harvestKept: 9,
      harvestDiscarded: 1,
    });
    expect(svg).toContain("discard rate 10%");
    expect(svg).toContain("below the 50% floor");
  });

  it("is deterministic", async () => {
    const a = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r15");
    const b = await renderOf("image/svg+xml", LAYER_MAP_RENDERER_ID, "kc-r15b");
    expect(a).toBe(b);
  });
});
