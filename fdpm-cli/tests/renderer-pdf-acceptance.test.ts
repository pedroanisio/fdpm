/**
 * PDF acceptance must prove that a parser can open the artifact and that every
 * page keeps the repository's A4 contract. A `%PDF-` prefix alone accepts a
 * truncated file and cannot detect a renderer that silently switches to Letter.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { A4_HEIGHT, A4_WIDTH } from "../src/core/render/pdf.js";
import type { RendererOutput } from "../src/plugin/types.js";
import { structuralProblems } from "../scripts/render-acceptance.js";

function output(bytes: Uint8Array): RendererOutput {
  return { bytes, contentType: "application/pdf", filename: "review.pdf" };
}

describe("renderer acceptance — PDF structure", () => {
  it("records parser-proven page count and A4 dimensions", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    pdf.addPage([A4_WIDTH, A4_HEIGHT]);

    const result = await structuralProblems(output(await pdf.save()), "application/pdf");

    expect(result.problems).toEqual([]);
    expect(result.metrics).toMatchObject({
      pages: 2,
      minPageWidth: A4_WIDTH,
      maxPageWidth: A4_WIDTH,
      minPageHeight: A4_HEIGHT,
      maxPageHeight: A4_HEIGHT,
    });
  });

  it("rejects bytes with a PDF header that a parser cannot load", async () => {
    const result = await structuralProblems(
      output(new TextEncoder().encode("%PDF-not-a-document")),
      "application/pdf",
    );

    expect(result.problems).toContain("PDF cannot be parsed");
  });

  it("rejects a parseable non-A4 page", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);

    const result = await structuralProblems(output(await pdf.save()), "application/pdf");

    expect(result.problems).toContain("PDF page 1 is not A4 (612 x 792 pt)");
  });
});
