/**
 * Visual and print-production acceptance for the knowledge-cartridge PDF.
 *
 * pdf-lib proves structure; Poppler proves that an independent reader can
 * extract the text, see embedded Unicode maps, and raster the pages. The three
 * snapshots protect the cover, a typed register, and the audit back matter—the
 * three composition systems that a first-page-only check would miss.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { resolve } from "node:path";
import { Host } from "../../src/core/host.js";
import type { RendererInput } from "../../src/plugin/types.js";
import { buildFixture } from "../../scripts/render-acceptance.js";
import { CARTRIDGE_PDF_RENDERER_ID, T } from "../../plugins/knowledge_cartridge/ids.js";
import { renderCartridgePdf } from "../../plugins/knowledge_cartridge/renderers/cartridge_pdf.js";

const run = promisify(execFile);
const host = new Host({
  dataDir: null,
  builtinDirs: [resolve(process.cwd(), "plugins")],
  pluginPaths: [],
});
await host.load();

const profile = host.profiles
  .listRaw()
  .map((raw) => host.profiles.getResolved(raw.id))
  .find((candidate) =>
    [...(candidate.renderer_bindings ?? []), ...(candidate.renderers ?? [])]
      .some((binding) => binding.renderer_id === CARTRIDGE_PDF_RENDERER_ID),
  );
if (!profile) throw new Error(`${CARTRIDGE_PDF_RENDERER_ID} is not bound to a registered profile`);

async function rasterPage(pdfPath: string, page: number, outputPrefix: string): Promise<Buffer> {
  await run(
    "pdftoppm",
    ["-f", String(page), "-l", String(page), "-singlefile", "-png", "-r", "96", pdfPath, outputPrefix],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return readFile(`${outputPrefix}.png`);
}

test("knowledge cartridge PDF embeds fonts, preserves text, and matches representative pages", async ({}, testInfo) => {
  const workbook = {
    id: "kc-pdf-visual",
    name: "Knowledge cartridge PDF visual acceptance",
    profile_id: profile.id,
    created_at: "2026-08-31T12:00:00.000Z",
    revision: 0,
  };
  const fixture = buildFixture(profile, "typical");
  const source = fixture.primitives.find((primitive) => primitive.type_id === T.Source);
  if (!source) throw new Error("typical knowledge-cartridge fixture has no source");
  source.field_values["title"] = "Composição tipográfica — ação, precisão e legibilidade";
  const input: RendererInput = {
    workbookId: workbook.id,
    workbook,
    renderedAt: workbook.created_at,
    profile,
    ...fixture,
  };
  const output = await renderCartridgePdf(input);
  const pdfPath = testInfo.outputPath("knowledge-cartridge.pdf");
  await writeFile(pdfPath, output.bytes);

  const [{ stdout: fontReport }, { stdout: extracted }, pdf] = await Promise.all([
    run("pdffonts", [pdfPath], { maxBuffer: 4 * 1024 * 1024 }),
    run("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 16 * 1024 * 1024 }),
    PDFDocument.load(output.bytes),
  ]);
  const fontRows = String(fontReport).trim().split(/\r?\n/).slice(2).filter(Boolean);
  expect(fontRows.length).toBeGreaterThanOrEqual(4);
  for (const row of fontRows) {
    expect(row, `font is not embedded and Unicode-mapped: ${row}`)
      .toMatch(/\s+yes\s+(?:yes|no)\s+yes\s+\d+\s+\d+\s*$/);
  }
  expect(String(extracted)).toContain("Composição tipográfica — ação, precisão e legibilidade");

  const pageCount = pdf.getPageCount();
  expect(pageCount).toBeGreaterThanOrEqual(10);
  const [cover, register, audit] = await Promise.all([
    rasterPage(pdfPath, 1, testInfo.outputPath("cover")),
    rasterPage(pdfPath, 4, testInfo.outputPath("register")),
    rasterPage(pdfPath, pageCount, testInfo.outputPath("audit")),
  ]);
  expect(cover).toMatchSnapshot("kc-pdf-cover.png", { maxDiffPixelRatio: 0.001 });
  expect(register).toMatchSnapshot("kc-pdf-register.png", { maxDiffPixelRatio: 0.001 });
  expect(audit).toMatchSnapshot("kc-pdf-audit.png", { maxDiffPixelRatio: 0.001 });
});
