/**
 * The three specialized renderers: HTML, SVG and PNG.
 *
 * The markdown outline prints the registry as prose. These print it as the
 * thing it describes — a page you can read, a plate you can hold up, and a
 * palette you can drop into a pixel tool. Each is checked as its own
 * format, not as a string that happens to contain the right words: the
 * HTML must be a self-contained document, the SVG must carry real
 * geometry, and the PNG must decode to the palette's actual pixels.
 */
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { buildStyleWorkbook } from "../../../plugins/style/ingest.js";
import {
  PALETTE_SHEET_RENDERER_ID,
  STYLE_HTML_RENDERER_ID,
  STYLE_SPECIMEN_RENDERER_ID,
} from "../../../plugins/style/index.js";
import { renderStyleHtml } from "../../../plugins/style/renderers/style_html.js";
import { renderStyleSpecimen } from "../../../plugins/style/renderers/style_specimen.js";
import {
  cellCentre,
  paletteSheetLayout,
  renderPaletteSheet,
} from "../../../plugins/style/renderers/style_palette.js";
import { readRegistry } from "../../../plugins/style/renderers/_model.js";
import { PROFILE_ID } from "../../../plugins/style/sidecar.js";
import { contrastRatio, wcagMinimumContrast } from "../../../plugins/style/invariants.js";
import type { RendererInput } from "../../../src/plugin/types.js";
import { bauhausOf, registryWith, validRegistry } from "./fixtures/registry.js";

const WB = "style-renderers-test";

let host: Host;
let input: RendererInput;

/** Render input for a workbook already in the host. */
function inputFor(host: Host, workbookId: string): RendererInput {
  const slice = host.getProject(workbookId);
  return {
    workbookId,
    primitives: Object.values(slice.primitives),
    relations: Object.values(slice.relations),
    profile: host.profiles.getResolved(PROFILE_ID),
  } as unknown as RendererInput;
}

/** Ingest a registry into a fresh workbook and return its render input. */
async function ingest(registry: unknown, workbookId: string): Promise<RendererInput> {
  await buildStyleWorkbook(host, registry, { workbookId });
  return inputFor(host, workbookId);
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  input = await ingest(validRegistry(), WB);
});

// ── Registration ───────────────────────────────────────────────────────

describe("registration", () => {
  it("registers one renderer per target, resolvable through the host", () => {
    const wanted: [string, string][] = [
      ["text/html", STYLE_HTML_RENDERER_ID],
      ["image/svg+xml", STYLE_SPECIMEN_RENDERER_ID],
      ["image/png", PALETTE_SHEET_RENDERER_ID],
    ];
    const profile = host.profiles.getResolved(PROFILE_ID);
    for (const [target, rendererId] of wanted) {
      const found = host.plugins.findRenderer(target, rendererId, profile);
      expect(found, `no renderer for ${target} / ${rendererId}`).toBeDefined();
      expect(found!.target).toBe(target);
    }
  });

  it("keeps the markdown outline as the profile's default document view", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const found = host.plugins.findRenderer("text/markdown", undefined, profile);
    expect(found?.rendererId).toBe("style:StyleOutlineRenderer");
  });
});

// ── HTML ───────────────────────────────────────────────────────────────

describe("text/html — style:StyleHtmlRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderStyleHtml(input);
    expect(out.contentType).toBe("text/html");
    expect(out.filename).toBe("style-registry.html");
  });

  it("is a complete document", () => {
    const html = text(renderStyleHtml(input).bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="');
    expect(html).toContain("</html>");
    expect(html).toContain("<title>");
  });

  it("is self-contained — no network fetch can be triggered by opening it", () => {
    const html = text(renderStyleHtml(input).bytes);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
  });

  it("names every style and every grammar section", () => {
    const html = text(renderStyleHtml(input).bytes);
    expect(html).toContain("Bauhaus");
    expect(html).toContain("De Stijl");
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
      expect(html, `missing grammar section ${section}`).toContain(`data-section="${section}"`);
    }
  });

  it("paints each palette entry as a swatch in its own colour", () => {
    const html = text(renderStyleHtml(input).bytes);
    for (const hex of ["#1A1A1A", "#FFFFFF", "#D2232A"]) {
      expect(html).toContain(`background:${hex}`);
    }
  });

  it("emits the colour tokens as copyable CSS custom properties", () => {
    const html = text(renderStyleHtml(input).bytes);
    expect(html).toContain(":root");
    expect(html).toContain("--ink: #1A1A1A;");
    expect(html).toContain("--paper: #FFFFFF;");
    expect(html).toContain("--accent: #D2232A;");
  });

  it("computes each WCAG pair's real ratio and verdict", () => {
    const html = text(renderStyleHtml(input).bytes);
    // ink on paper, normal-text: the fixture's own tokens.
    const ratio = contrastRatio("#1A1A1A", "#FFFFFF")!;
    const required = wcagMinimumContrast("aa", "normal-text")!;
    expect(ratio).toBeGreaterThan(required);
    expect(html).toContain(`${ratio.toFixed(2)}:1`);
    expect(html).toContain('data-verdict="pass"');
  });

  it("escapes hostile field text rather than emitting it as markup", async () => {
    const hostile = registryWith((r) => {
      const b = bauhausOf(r) as Record<string, Record<string, Record<string, unknown>>>;
      (b.grammar!.line!.rules as { statement: string }[])[0]!.statement =
        '</style><script>alert("xss")</script>';
    });
    const html = text(renderStyleHtml(await ingest(hostile, "style-html-escape")).bytes);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });

  it("renders an empty workbook as a document that says so, not a crash", () => {
    const empty = { ...input, primitives: [], relations: [] } as RendererInput;
    const html = text(renderStyleHtml(empty).bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("no style:Style primitives");
  });
});

// ── SVG ────────────────────────────────────────────────────────────────

describe("image/svg+xml — style:StyleSpecimenRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderStyleSpecimen(input);
    expect(out.contentType).toBe("image/svg+xml");
    expect(out.filename).toBe("style-specimen.svg");
  });

  it("is a well-formed standalone SVG with an explicit viewBox", () => {
    const svg = text(renderStyleSpecimen(input).bytes);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws one plate per style and one swatch per palette entry", () => {
    const svg = text(renderStyleSpecimen(input).bytes);
    expect(svg.match(/data-plate="/g) ?? []).toHaveLength(2);
    // Bauhaus 3 + De Stijl 2 palette entries.
    expect(svg.match(/data-swatch="/g) ?? []).toHaveLength(5);
  });

  it("grows its canvas with the number of styles", async () => {
    const one = registryWith((r) => {
      (r.styles as unknown[]).splice(1);
      // The registry is a closed world: dropping De Stijl also drops
      // every pointer at it, or the ingest rejects the whole thing.
      (bauhausOf(r).identity as Record<string, unknown>).influencedStyles = [];
    });
    const single = renderStyleSpecimen(await ingest(one, "style-svg-single"));
    const height = (s: string): number => Number(/viewBox="0 0 \d+ (\d+)"/.exec(s)![1]);
    expect(height(text(renderStyleSpecimen(input).bytes))).toBeGreaterThan(
      height(text(single.bytes)),
    );
  });

  it("is byte-deterministic across renders", () => {
    expect(Buffer.from(renderStyleSpecimen(input).bytes)).toEqual(
      Buffer.from(renderStyleSpecimen(input).bytes),
    );
  });

  /**
   * The plate's height is predicted by `plateHeight` and consumed by the
   * painter. If those two ever disagree the overflow is invisible — an
   * SVG does not complain about ink outside its viewBox, it just clips —
   * so the agreement is asserted rather than assumed.
   */
  it("paints nothing outside its own viewBox", () => {
    const svg = text(renderStyleSpecimen(input).bytes);
    const height = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)![1]);
    const width = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1]);
    let checked = 0;
    for (const [, x, y] of svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
      expect(Number(y), `text baseline ${y} outside 0..${height}`).toBeLessThanOrEqual(height);
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      checked++;
    }
    for (const [, x, y, w, h] of svg.matchAll(
      /<rect [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
    )) {
      expect(Number(y) + Number(h), `rect bottom outside 0..${height}`).toBeLessThanOrEqual(height);
      expect(Number(x) + Number(w), `rect right outside 0..${width}`).toBeLessThanOrEqual(width);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("escapes XML metacharacters in style-supplied text", async () => {
    const hostile = registryWith((r) => {
      const b = bauhausOf(r) as Record<string, Record<string, unknown>>;
      (b.identity as Record<string, unknown>).name = 'Bau<&>"haus"';
    });
    const svg = text(renderStyleSpecimen(await ingest(hostile, "style-svg-escape")).bytes);
    expect(svg).toContain("Bau&lt;&amp;&gt;");
    expect(svg).not.toContain('Bau<&>"haus"');
  });
});

// ── PNG ────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Chunk {
  type: string;
  data: Buffer;
}

/** Walk the chunk stream, verifying every CRC. Throws on a bad chunk. */
function readChunks(png: Buffer): Chunk[] {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  const chunks: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("latin1");
    const data = png.subarray(at + 8, at + 8 + length);
    const declared = png.readUInt32BE(at + 8 + length);
    expect(crc32(png.subarray(at + 4, at + 8 + length)), `bad CRC on ${type}`).toBe(declared);
    chunks.push({ type, data: Buffer.from(data) });
    at += 12 + length;
  }
  expect(at).toBe(png.length);
  return chunks;
}

/** Independent CRC-32 — deliberately not the encoder's implementation. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

describe("image/png — style:PaletteSheetRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderPaletteSheet(input);
    expect(out.contentType).toBe("image/png");
    expect(out.filename).toBe("style-palette.png");
  });

  it("is a structurally valid PNG: signature, IHDR first, IEND last, CRCs intact", () => {
    const chunks = readChunks(Buffer.from(renderPaletteSheet(input).bytes));
    expect(chunks[0]!.type).toBe("IHDR");
    expect(chunks.at(-1)!.type).toBe("IEND");
    expect(chunks.some((c) => c.type === "IDAT")).toBe(true);
  });

  it("declares 8-bit truecolour with no interlace", () => {
    const [ihdr] = readChunks(Buffer.from(renderPaletteSheet(input).bytes));
    expect(ihdr!.data.readUInt8(8)).toBe(8); // bit depth
    expect(ihdr!.data.readUInt8(9)).toBe(2); // colour type: truecolour
    expect(ihdr!.data.readUInt8(12)).toBe(0); // interlace: none
  });

  it("decompresses to exactly one filter byte plus RGB triples per scanline", () => {
    const chunks = readChunks(Buffer.from(renderPaletteSheet(input).bytes));
    const ihdr = chunks[0]!.data;
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
    expect(raw.length).toBe(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
      expect(raw.readUInt8(y * (1 + width * 3)), `scanline ${y} filter byte`).toBe(0);
    }
  });

  it("paints each declared colour into its own chip", () => {
    const chunks = readChunks(Buffer.from(renderPaletteSheet(input).bytes));
    const ihdr = chunks[0]!.data;
    const width = ihdr.readUInt32BE(0);
    const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
    const pixel = (x: number, y: number): string => {
      const at = y * (1 + width * 3) + 1 + x * 3;
      return (
        "#" +
        [raw.readUInt8(at), raw.readUInt8(at + 1), raw.readUInt8(at + 2)]
          .map((v) => v.toString(16).padStart(2, "0").toUpperCase())
          .join("")
      );
    };
    // The layout is the renderer's contract, so the assertion addresses
    // real geometry instead of a guessed coordinate.
    const layout = paletteSheetLayout(readRegistry(input));
    expect(layout.width).toBe(width);
    const painted = layout.cells.filter((c) => c.hex !== null);
    expect(painted.length).toBeGreaterThan(0);
    for (const cell of painted) {
      const at = cellCentre(cell);
      expect(pixel(at.x, at.y), `${cell.band} ${cell.name}`).toBe(cell.hex!.toUpperCase());
    }
  });

  it("covers every palette entry, forbidden colour and colour token", () => {
    const registry = readRegistry(input);
    const layout = paletteSheetLayout(registry);
    const expected = registry.styles.reduce(
      (n, s) => n + s.palette.length + s.forbiddenColors.length + s.tokens.colors.length,
      0,
    );
    expect(layout.cells).toHaveLength(expected);
  });

  it("is byte-deterministic across renders", () => {
    expect(Buffer.from(renderPaletteSheet(input).bytes)).toEqual(
      Buffer.from(renderPaletteSheet(input).bytes),
    );
  });

  it("still emits a valid PNG when the workbook holds no styles", () => {
    const empty = { ...input, primitives: [], relations: [] } as RendererInput;
    const chunks = readChunks(Buffer.from(renderPaletteSheet(empty).bytes));
    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBeGreaterThan(0);
    expect(ihdr.readUInt32BE(4)).toBeGreaterThan(0);
  });
});
