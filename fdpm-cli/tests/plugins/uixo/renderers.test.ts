/**
 * The four specialized renderers: HTML, PDF, SVG and PNG.
 *
 * The markdown outline prints the containment list. These print the
 * document as the thing it describes — a page you can click through, an
 * artefact you can attach to a review, a wireframe you can look at. Each
 * is checked as its own format, not as a string that happens to contain
 * the right words: the HTML must be a self-contained document whose
 * cross-links resolve, the PDF must parse as a PDF and paginate, the SVG
 * must keep its ink inside its own viewBox, and the PNG must decode to
 * the pixels the layout says it painted.
 */
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { buildUixoWorkbook } from "../../../plugins/uixo/ingest.js";
import {
  COMPONENT_SHEET_RENDERER_ID,
  COMPONENT_TREE_RENDERER_ID,
  DOCUMENT_HTML_RENDERER_ID,
  DOCUMENT_PDF_RENDERER_ID,
} from "../../../plugins/uixo/index.js";
import { renderDocumentHtml } from "../../../plugins/uixo/renderers/document_html.js";
import { renderComponentTree } from "../../../plugins/uixo/renderers/component_tree.js";
import {
  boxHeaderCentre,
  componentSheetLayout,
  depthFill,
  renderComponentSheet,
} from "../../../plugins/uixo/renderers/component_sheet.js";
import { renderDocumentPdf } from "../../../plugins/uixo/renderers/document_pdf.js";
import { readDocument } from "../../../plugins/uixo/renderers/_model.js";
import { PROFILE_ID } from "../../../plugins/uixo/sidecar.js";
import type { RendererInput } from "../../../src/plugin/types.js";

type Json = Record<string, unknown>;

/**
 * A document with real depth and a real cross-link, following the
 * ontology's actual containment chain:
 *
 *   InteractionSystem -hasSurface-> Screen -hasLayout-> Layout
 *     -hasRegion-> Region -regionComponent-> Container
 *     -hasChildComponent-> Button, Button
 *
 * Depth matters here in a way it does not for the ingest tests: the
 * wireframe's nesting, the PDF's indent cap and the SVG's depth ramp are
 * all functions of it, and a two-level fixture would exercise none of them.
 */
function validDocument(): Json {
  return {
    schemaVersion: "1.2.0",
    entities: [
      {
        id: "ex:app",
        type: "uixo:InteractionSystem",
        label: "Demo application",
        hasSurface: ["ex:screen"],
        hasActor: ["ex:actor"],
        extensions: { spec: { features: ["ex:feature"], policies: ["ex:policy"] } },
      },
      { id: "ex:actor", type: "uixo:HumanActor", label: "Operator" },
      { id: "ex:feature", type: "uixo:Feature", label: "Editing" },
      { id: "ex:policy", type: "uixo:Policy", label: "Autosave policy" },
      { id: "ex:screen", type: "uixo:Screen", label: "Main screen", hasLayout: ["ex:layout"] },
      {
        id: "ex:layout",
        type: "uixo:Layout",
        label: "Main layout",
        hasRegion: ["ex:region", "ex:footer"],
      },
      { id: "ex:region", type: "uixo:Region", label: "Action bar", regionComponent: ["ex:bar"] },
      // A second region reusing the same container. One of the two
      // in-edges becomes ex:bar's tree edge and the other becomes a
      // cross-link — the multi-parent case the spanning forest exists to
      // handle, and the only one that produces a link to assert.
      { id: "ex:footer", type: "uixo:Region", label: "Footer", regionComponent: ["ex:bar"] },
      {
        id: "ex:bar",
        type: "uixo:Container",
        label: "Button bar",
        hasChildComponent: ["ex:save", "ex:cancel"],
      },
      { id: "ex:save", type: "uixo:Button", label: "Save", orderIndex: 0, parentComponent: ["ex:bar"] },
      {
        id: "ex:cancel",
        type: "uixo:Button",
        label: "Cancel",
        orderIndex: 1,
        parentComponent: ["ex:bar"],
      },
    ],
  };
}

function docWith(mutate: (d: Json) => void): Json {
  const clone = JSON.parse(JSON.stringify(validDocument())) as Json;
  mutate(clone);
  return clone;
}

let host: Host;
let input: RendererInput;

function inputFor(workbookId: string): RendererInput {
  const slice = host.getProject(workbookId);
  return {
    workbookId,
    primitives: Object.values(slice.primitives),
    relations: Object.values(slice.relations),
    profile: host.profiles.getResolved(PROFILE_ID),
  } as unknown as RendererInput;
}

async function ingest(doc: unknown, workbookId: string): Promise<RendererInput> {
  await buildUixoWorkbook(host, doc, { workbookId });
  return inputFor(workbookId);
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  input = await ingest(validDocument(), "uixo-renderers");
});

// ── Registration ───────────────────────────────────────────────────────

describe("registration", () => {
  it("registers one renderer per target, resolvable through the host", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const wanted: [string, string][] = [
      ["text/html", DOCUMENT_HTML_RENDERER_ID],
      ["application/pdf", DOCUMENT_PDF_RENDERER_ID],
      ["image/svg+xml", COMPONENT_TREE_RENDERER_ID],
      ["image/png", COMPONENT_SHEET_RENDERER_ID],
    ];
    for (const [target, rendererId] of wanted) {
      const found = host.plugins.findRenderer(target, rendererId, profile);
      expect(found, `no renderer for ${target} / ${rendererId}`).toBeDefined();
      expect(found!.target).toBe(target);
    }
  });

  it("keeps the markdown outline as the profile's default document view", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    expect(host.plugins.findRenderer("text/markdown", undefined, profile)?.rendererId).toBe(
      "uixo:DocumentOutlineRenderer",
    );
  });
});

// ── The shared view ────────────────────────────────────────────────────

describe("readDocument — the spanning forest", () => {
  it("reaches every entity, unlike the hasChildComponent-only outline", () => {
    const doc = readDocument(input);
    expect(doc.nodeCount).toBe(11);
    expect(doc.order).toHaveLength(11);
    expect(new Set(doc.order).size).toBe(11);
    expect(doc.cycleBroken).toEqual([]);
    // Three roots: the InteractionSystem, plus the Feature and the Policy,
    // which the root declares through `extensions.spec` soft links rather
    // than typed edges — so nothing points at them and they are roots in
    // the graph's own terms, not by oversight.
    const rootClasses = doc.roots.map((r) => doc.nodes.get(r)!.className).sort();
    expect(rootClasses).toEqual(["uixo:Feature", "uixo:InteractionSystem", "uixo:Policy"]);
  });

  it("records a second parent as a cross-link instead of duplicating the subtree", () => {
    const doc = readDocument(input);
    const byEntity = new Map([...doc.nodes.values()].map((n) => [n.entityId, n]));
    const bar = byEntity.get("ex:bar")!;
    // ex:bar is claimed by both regions; exactly one owns it in the tree.
    const owners = ["ex:region", "ex:footer"].filter((r) =>
      byEntity.get(r)!.children.includes(bar.id),
    );
    expect(owners).toHaveLength(1);
    // The other region keeps the edge as a link, and ex:bar records it.
    const other = owners[0] === "ex:region" ? "ex:footer" : "ex:region";
    expect(byEntity.get(other)!.crossLinks.map((l) => l.property)).toContain("regionComponent");
    expect(bar.backLinks.map((l) => l.property)).toContain("regionComponent");
  });

  it("nests along the ontology's own containment chain", () => {
    const doc = readDocument(input);
    const byEntity = new Map([...doc.nodes.values()].map((n) => [n.entityId, n]));
    expect(byEntity.get("ex:screen")!.depth).toBe(1);
    expect(byEntity.get("ex:layout")!.depth).toBe(2);
    expect(byEntity.get("ex:region")!.depth).toBe(3);
    expect(byEntity.get("ex:bar")!.depth).toBe(4);
    expect(byEntity.get("ex:save")!.depth).toBe(5);
  });

  it("orders siblings by orderIndex, not by id", () => {
    const doc = readDocument(input);
    const bar = [...doc.nodes.values()].find((n) => n.entityId === "ex:bar")!;
    const names = bar.children.map((c) => doc.nodes.get(c)!.label);
    expect(names).toEqual(["Save", "Cancel"]);
  });

  it("is stable across reads", () => {
    expect(readDocument(input).order).toEqual(readDocument(input).order);
  });
});

// ── HTML ───────────────────────────────────────────────────────────────

describe("text/html — uixo:DocumentHtmlRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderDocumentHtml(input);
    expect(out.contentType).toBe("text/html");
    expect(out.filename).toBe("uixo-document.html");
  });

  it("is a complete, self-contained document", () => {
    const html = text(renderDocumentHtml(input).bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
  });

  it("gives every entity an anchor, and every cross-link resolves to one", () => {
    const html = text(renderDocumentHtml(input).bytes);
    const ids = new Set([...html.matchAll(/<section class="node" id="([^"]+)"/g)].map((m) => m[1]!));
    expect(ids.size).toBe(readDocument(input).nodeCount);
    const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(ids.has(href), `dangling anchor #${href}`).toBe(true);
    }
  });

  it("nests containment as real elements", () => {
    const html = text(renderDocumentHtml(input).bytes);
    for (let depth = 0; depth <= 5; depth++) {
      expect(html, `missing depth ${depth}`).toContain(`data-depth="${depth}"`);
    }
  });

  it("escapes hostile label text rather than emitting it as markup", async () => {
    const hostile = docWith((d) => {
      const app = (d.entities as Json[]).find((e) => e["id"] === "ex:app")!;
      app["label"] = '</style><script>alert("xss")</script>';
    });
    const html = text(renderDocumentHtml(await ingest(hostile, "uixo-html-escape")).bytes);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });

  it("renders an empty workbook as a document that says so, not a crash", () => {
    const empty = { ...input, primitives: [], relations: [] } as RendererInput;
    const html = text(renderDocumentHtml(empty).bytes);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("no uixo primitives");
  });
});

// ── PDF ────────────────────────────────────────────────────────────────

describe("application/pdf — uixo:DocumentPdfRenderer", () => {
  it("declares its content type and a filename", async () => {
    const out = await renderDocumentPdf(input);
    expect(out.contentType).toBe("application/pdf");
    expect(out.filename).toBe("uixo-document.pdf");
  });

  it("emits a PDF a parser can load, with a title page plus content", async () => {
    const bytes = Buffer.from((await renderDocumentPdf(input)).bytes);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.subarray(-1024).toString("latin1")).toContain("%%EOF");
    // Re-loading is the real check: pdf-lib compresses its object streams,
    // so grepping the raw bytes for /Type /Page finds nothing even in a
    // perfectly good document.
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(reloaded.getTitle()).toContain("uixo-renderers");
  });

  it("is byte-deterministic — no creation timestamp leaks in", async () => {
    const a = Buffer.from((await renderDocumentPdf(input)).bytes);
    const b = Buffer.from((await renderDocumentPdf(input)).bytes);
    expect(a).toEqual(b);
  });

  /**
   * pdf-lib's StandardFonts are WinAnsi and `drawText` THROWS on a code
   * point they cannot encode. Without sanitisation a single exotic
   * character in a label fails the whole render — from data that passed
   * validation.
   */
  it("survives a label pdf-lib's standard fonts cannot encode", async () => {
    const exotic = docWith((d) => {
      const app = (d.entities as Json[]).find((e) => e["id"] === "ex:app")!;
      app["label"] = "デモ — 🚀 application";
    });
    const out = await renderDocumentPdf(await ingest(exotic, "uixo-pdf-exotic"));
    expect(Buffer.from(out.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders an empty workbook without throwing", async () => {
    const empty = { ...input, primitives: [], relations: [] } as RendererInput;
    const out = await renderDocumentPdf(empty);
    expect(Buffer.from(out.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

// ── SVG ────────────────────────────────────────────────────────────────

describe("image/svg+xml — uixo:ComponentTreeRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderComponentTree(input);
    expect(out.contentType).toBe("image/svg+xml");
    expect(out.filename).toBe("uixo-component-tree.svg");
  });

  it("is a well-formed standalone SVG with an explicit viewBox", () => {
    const svg = text(renderComponentTree(input).bytes);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws one box per entity, keyed by nesting depth", () => {
    const svg = text(renderComponentTree(input).bytes);
    expect(svg.match(/data-box="/g) ?? []).toHaveLength(readDocument(input).nodeCount);
    expect(svg).toContain('data-depth="0"');
    expect(svg).toContain('data-depth="5"');
  });

  it("carries both censuses", () => {
    const svg = text(renderComponentTree(input).bytes);
    expect(svg).toContain("EDGES BY PROPERTY");
    expect(svg).toContain("CLASSES IN USE");
    expect(svg).toContain('data-bar="hasChildComponent"');
    expect(svg).toContain('data-bar="uixo:Button"');
  });

  /**
   * The plate's height is predicted by the layout and consumed by the
   * painter. If the two disagree the overflow is invisible — an SVG does
   * not complain about ink outside its viewBox, it clips.
   */
  it("paints nothing outside its own viewBox", () => {
    const svg = text(renderComponentTree(input).bytes);
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
    let checked = 0;
    for (const [, x, y, rw, rh] of svg.matchAll(
      /<rect [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
    )) {
      expect(Number(y) + Number(rh)).toBeLessThanOrEqual(Number(h));
      expect(Number(x) + Number(rw)).toBeLessThanOrEqual(Number(w));
      checked++;
    }
    for (const [, , y] of svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
      expect(Number(y)).toBeLessThanOrEqual(Number(h));
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("is byte-deterministic across renders", () => {
    expect(Buffer.from(renderComponentTree(input).bytes)).toEqual(
      Buffer.from(renderComponentTree(input).bytes),
    );
  });

  it("escapes XML metacharacters in entity labels", async () => {
    const hostile = docWith((d) => {
      const app = (d.entities as Json[]).find((e) => e["id"] === "ex:app")!;
      app["label"] = 'App<&>"x"';
    });
    const svg = text(renderComponentTree(await ingest(hostile, "uixo-svg-escape")).bytes);
    expect(svg).toContain("App&lt;&amp;&gt;");
    expect(svg).not.toContain('App<&>"x"');
  });
});

// ── PNG ────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Independent CRC-32 — deliberately not the encoder's implementation. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readChunks(png: Buffer): { type: string; data: Buffer }[] {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  const chunks: { type: string; data: Buffer }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("latin1");
    expect(crc32(png.subarray(at + 4, at + 8 + length)), `bad CRC on ${type}`).toBe(
      png.readUInt32BE(at + 8 + length),
    );
    chunks.push({ type, data: Buffer.from(png.subarray(at + 8, at + 8 + length)) });
    at += 12 + length;
  }
  expect(at).toBe(png.length);
  return chunks;
}

describe("image/png — uixo:ComponentSheetRenderer", () => {
  it("declares its content type and a filename", () => {
    const out = renderComponentSheet(input);
    expect(out.contentType).toBe("image/png");
    expect(out.filename).toBe("uixo-component-sheet.png");
  });

  it("is a structurally valid PNG: signature, IHDR first, IEND last, CRCs intact", () => {
    const chunks = readChunks(Buffer.from(renderComponentSheet(input).bytes));
    expect(chunks[0]!.type).toBe("IHDR");
    expect(chunks.at(-1)!.type).toBe("IEND");
    expect(chunks.some((c) => c.type === "IDAT")).toBe(true);
    expect(chunks[0]!.data.readUInt8(8)).toBe(8); // bit depth
    expect(chunks[0]!.data.readUInt8(9)).toBe(2); // truecolour
  });

  it("paints each box's header in the fill its depth selects", () => {
    const chunks = readChunks(Buffer.from(renderComponentSheet(input).bytes));
    const width = chunks[0]!.data.readUInt32BE(0);
    const raw = inflateSync(
      Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)),
    );
    const pixel = (x: number, y: number): [number, number, number] => {
      const at = y * (1 + width * 3) + 1 + x * 3;
      return [raw.readUInt8(at), raw.readUInt8(at + 1), raw.readUInt8(at + 2)];
    };
    // The layout is the renderer's contract, so the assertion addresses
    // real geometry instead of a guessed coordinate.
    const layout = componentSheetLayout(input);
    expect(layout.width).toBe(width);
    expect(layout.boxes.length).toBe(readDocument(input).nodeCount);
    for (const box of layout.boxes) {
      // Sample the header strip just inside its left edge, clear of the
      // caption glyphs that start further in.
      const centre = boxHeaderCentre(box);
      const at = pixel(box.x + 3, centre.y);
      expect(at, `${box.entityId} at depth ${box.depth}`).toEqual([...depthFill(box.depth + 1)]);
    }
  });

  it("keeps every box inside the surface", () => {
    const layout = componentSheetLayout(input);
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("is byte-deterministic across renders", () => {
    expect(Buffer.from(renderComponentSheet(input).bytes)).toEqual(
      Buffer.from(renderComponentSheet(input).bytes),
    );
  });

  it("still emits a valid PNG when the workbook holds no entities", () => {
    const empty = { ...input, primitives: [], relations: [] } as RendererInput;
    const chunks = readChunks(Buffer.from(renderComponentSheet(empty).bytes));
    expect(chunks[0]!.data.readUInt32BE(0)).toBeGreaterThan(0);
    expect(chunks[0]!.data.readUInt32BE(4)).toBeGreaterThan(0);
  });
});
