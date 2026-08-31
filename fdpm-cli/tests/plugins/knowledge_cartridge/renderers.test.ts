/**
 * The five views, run against a real workbook rather than a hand-built model.
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
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { Host } from "../../../src/core/host.js";
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import {
  CARTRIDGE_PDF_RENDERER_ID,
  CARTRIDGE_RENDERER_ID,
  CITATION_INDEX_RENDERER_ID,
  LAYER_MAP_RENDERER_ID,
} from "../../../plugins/knowledge_cartridge/ids.js";
import { seedCartridge, type SeedOptions } from "./_fixture.js";

async function renderOutputOf(
  target: string,
  rendererId: string,
  workbookId: string,
  opts?: SeedOptions,
  mutate?: (input: RendererInput) => void,
): Promise<RendererOutput> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [join(process.cwd(), "plugins")],
    pluginPaths: [],
  });
  await host.load();
  await seedCartridge(host, workbookId, opts);
  const slice = host.getProject(workbookId);
  const input: RendererInput = {
    workbookId,
    primitives: Object.values(slice.primitives),
    relations: Object.values(slice.relations),
    profile: host.profiles.getResolved(slice.workbook.profile_id),
  };
  mutate?.(input);
  return host.plugins.runRenderer(
    target,
    input,
    { rendererId },
  );
}

async function renderOf(
  target: string,
  rendererId: string,
  workbookId: string,
  opts?: SeedOptions,
): Promise<string> {
  const out = await renderOutputOf(target, rendererId, workbookId, opts);
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
  it("is a standalone accessible document rather than an HTML fragment", async () => {
    const html = await renderOf("text/html", CITATION_INDEX_RENDERER_ID, "kc-r7-shell");
    expect(html.toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<main id="kc-citation-index"');
    expect(html).toContain('aria-label="Document actions"');
  });

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

describe("kc:CartridgePdfRenderer — the portable practitioner edition", () => {
  it("registers a real application/pdf artifact with a stable filename", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-registration",
    );
    expect(out.contentType).toBe("application/pdf");
    expect(out.filename).toBe("knowledge-cartridge.pdf");
    expect(Buffer.from(out.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("parses as A4, paginates, and carries useful document metadata", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-structure",
    );
    const pdf = await PDFDocument.load(out.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.276, 2);
      expect(page.getHeight()).toBeCloseTo(841.89, 2);
    }
    expect(pdf.getTitle()).toContain("TC-TYP-001");
    expect(pdf.getSubject()).toMatch(/knowledge cartridge/i);
    expect(pdf.getKeywords()).toContain("declared gaps");
    expect(pdf.getKeywords()).toContain("unreconciled conflicts");
  });

  it("embeds every face so print output does not depend on reader-installed Base-14 fonts", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-embedded-fonts",
    );
    const pdf = await PDFDocument.load(out.bytes);
    const dictionaries = pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict);
    const embeddedPrograms = dictionaries.filter(
      (dictionary) =>
        dictionary.has(PDFName.of("FontFile")) ||
        dictionary.has(PDFName.of("FontFile2")) ||
        dictionary.has(PDFName.of("FontFile3")),
    );
    const base14Fonts = dictionaries.filter((dictionary) => {
      if (dictionary.get(PDFName.of("Type"))?.toString() !== "/Font") return false;
      const base = dictionary.get(PDFName.of("BaseFont"))?.toString() ?? "";
      return /^\/(Courier|Helvetica|Times)/.test(base);
    });

    expect(embeddedPrograms.length).toBeGreaterThanOrEqual(3);
    expect(base14Fonts).toEqual([]);
  });

  it("is byte-deterministic for the same workbook state", async () => {
    const a = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-deterministic",
    );
    const b = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-deterministic",
    );
    expect(Buffer.from(a.bytes)).toEqual(Buffer.from(b.bytes));
  });

  it("survives long dense content without changing the A4 page contract", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-dense",
      { diagnostics: 48, harvestKept: 20, harvestDiscarded: 40 },
    );
    const pdf = await PDFDocument.load(out.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(10);
    expect(pdf.getPages().every((page) => page.getWidth() === pdf.getPage(0).getWidth())).toBe(true);
  });

  it("continues an exceptionally long card title instead of drawing it below the page", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-title-pagination",
      undefined,
      (input) => {
        const primitive = input.primitives.find((item) => item.type_id === "kc:Primitive");
        if (primitive) primitive.field_values["term"] = "measure ".repeat(2_000);
      },
    );
    const pdf = await PDFDocument.load(out.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(15);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(595.276, 2);
      expect(page.getHeight()).toBeCloseTo(841.89, 2);
    }
  });

  it("makes unsupported Unicode visible instead of failing the whole render", async () => {
    const out = await renderOutputOf(
      "application/pdf",
      CARTRIDGE_PDF_RENDERER_ID,
      "kc-pdf-unicode",
      undefined,
      (input) => {
        const source = input.primitives.find((primitive) => primitive.id === "kc:source:bringhurst");
        if (source) source.field_values["title"] = "組版の本 — practitioner's edition 🚀";
      },
    );
    expect(Buffer.from(out.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    await expect(PDFDocument.load(out.bytes)).resolves.toBeDefined();
  });
});
