/**
 * Distributable PDF typefaces shared by renderer implementations.
 *
 * The Standard 14 PDF fonts are reader-provided, WinAnsi-only faces. They are
 * convenient but fail the renderer goal's font-embedding and multilingual
 * resilience requirements. These OFL-1.1 Fontsource packages travel as normal
 * production dependencies, so both the source checkout and a packed npm
 * installation resolve the exact same bytes without network or host fonts.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

export interface EmbeddedPdfFonts {
  body: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

const require = createRequire(import.meta.url);

const FONT_MODULES = {
  body: "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
  bold: "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
  italic: "@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff",
  mono: "@fontsource/noto-sans-mono/files/noto-sans-mono-latin-400-normal.woff",
} as const;

const FONT_BYTES = Object.fromEntries(
  Object.entries(FONT_MODULES).map(([role, specifier]) => [
    role,
    readFile(require.resolve(specifier)),
  ]),
) as Record<keyof typeof FONT_MODULES, Promise<Buffer>>;

/** Embed and subset the closed Noto family used by portable FDPM PDFs. */
export async function embedPdfFonts(pdf: PDFDocument): Promise<EmbeddedPdfFonts> {
  pdf.registerFontkit(fontkit);
  const [bodyBytes, boldBytes, italicBytes, monoBytes] = await Promise.all([
    FONT_BYTES.body,
    FONT_BYTES.bold,
    FONT_BYTES.italic,
    FONT_BYTES.mono,
  ]);
  const [body, bold, italic, mono] = await Promise.all([
    pdf.embedFont(bodyBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
    pdf.embedFont(italicBytes, { subset: true }),
    pdf.embedFont(monoBytes, { subset: true }),
  ]);
  return { body, bold, italic, mono };
}
