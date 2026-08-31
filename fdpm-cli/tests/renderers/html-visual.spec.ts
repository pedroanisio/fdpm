import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { Host } from "../../src/core/host.js";
import type { RendererInput, RendererOutput } from "../../src/plugin/types.js";
import type { DomainProfile } from "../../src/core/models/meta.js";
import { buildFixture, type FixtureState } from "../../scripts/render-acceptance.js";
import { renderPaperHtml } from "../../plugins/academic_paper_v0_4_1/renderers/paper_document.js";
import { renderArgumentGraph } from "../../plugins/academic_paper_v0_4_1/renderers/argument_graph.js";
import { renderDeckContactSheet } from "../../plugins/acme_business_deck/renderers/deck_document.js";
import { renderPitchDeckPhaseMap } from "../../plugins/acme_pitch_deck/renderers/deck_document.js";
import { renderHtml as renderFormalSpecificationHtml } from "../../plugins/formal_specification/renderers/html.js";
import { renderCitationIndex } from "../../plugins/knowledge_cartridge/renderers/citation_index.js";
import { renderLayerMap } from "../../plugins/knowledge_cartridge/renderers/layer_map.js";
import { renderAuthorityMatrix } from "../../plugins/loop_forward/renderers/authority_matrix.js";
import { renderBindingMatrix } from "../../plugins/loop_forward/renderers/binding_matrix.js";
import { renderPipelineGraph } from "../../plugins/loop_forward/renderers/pipeline_graph.js";
import { renderVerificationSurface } from "../../plugins/loop_forward/renderers/verification_surface.js";
import { renderGantt } from "../../plugins/planning/renderers/gantt.js";
import { renderSrsHtml } from "../../plugins/software_requirements/renderers/srs_document.js";
import { renderStyleHtml } from "../../plugins/style/renderers/style_html.js";
import { renderStyleSpecimen } from "../../plugins/style/renderers/style_specimen.js";
import { renderComponentTree } from "../../plugins/uixo/renderers/component_tree.js";
import { renderDocumentHtml as renderUixoDocumentHtml } from "../../plugins/uixo/renderers/document_html.js";

const decoder = new TextDecoder();
const STATES: readonly FixtureState[] = ["empty", "short", "typical", "long", "malformed", "dense"];
type RendererFn = (input: RendererInput) => RendererOutput;
type RendererSpec = readonly [name: string, rendererId: string, render: RendererFn];

const fixtureHost = new Host({
  dataDir: null,
  builtinDirs: [resolve(process.cwd(), "plugins")],
  pluginPaths: [],
});
await fixtureHost.load();

const profilesByRenderer = new Map<string, DomainProfile>();
for (const raw of fixtureHost.profiles.listRaw()) {
  const profile = fixtureHost.profiles.getResolved(raw.id);
  for (const binding of [...(profile.renderer_bindings ?? []), ...(profile.renderers ?? [])]) {
    if (binding.renderer_id && !profilesByRenderer.has(binding.renderer_id)) {
      profilesByRenderer.set(binding.renderer_id, profile);
    }
  }
}

const HTML_RENDERERS: readonly RendererSpec[] = [
  ["Academic paper", "acad:PaperHtmlRenderer", renderPaperHtml],
  ["Formal specification", "fs:SpecHtmlRenderer", renderFormalSpecificationHtml],
  ["Knowledge cartridge citation index", "kc:CitationIndexRenderer", renderCitationIndex],
  ["Authority matrix", "lf:AuthorityMatrixRenderer", renderAuthorityMatrix],
  ["Binding matrix", "lf:BindingMatrixRenderer", renderBindingMatrix],
  ["Verification surface", "lf:VerificationSurfaceRenderer", renderVerificationSurface],
  ["Software requirements", "srs:SrsHtmlRenderer", renderSrsHtml],
  ["Style registry", "style:StyleHtmlRenderer", renderStyleHtml],
  ["UIXO document", "uixo:DocumentHtmlRenderer", renderUixoDocumentHtml],
];

const SVG_RENDERERS: readonly RendererSpec[] = [
  ["Academic argument graph", "acad:ArgumentGraphRenderer", renderArgumentGraph],
  ["Business deck contact sheet", "acme:DeckContactSheetRenderer", renderDeckContactSheet],
  ["Pitch deck phase map", "acme.pitch-deck:PhaseMapRenderer", renderPitchDeckPhaseMap],
  ["Loop-forward pipeline graph", "lf:PipelineGraphRenderer", renderPipelineGraph],
  ["Knowledge cartridge layer map", "kc:LayerMapRenderer", renderLayerMap],
  ["Planning Gantt", "plan:GanttSvgRenderer", renderGantt],
  ["Style specimen", "style:StyleSpecimenRenderer", renderStyleSpecimen],
  ["UIXO component tree", "uixo:ComponentTreeRenderer", renderComponentTree],
];

interface VisualFixture {
  name: string;
  rendererId: string;
  state: FixtureState;
  markup: string;
  kind: "html" | "svg";
}

function renderFixture([name, rendererId, render]: RendererSpec, state: FixtureState, kind: VisualFixture["kind"]): VisualFixture {
  const profile = profilesByRenderer.get(rendererId);
  if (!profile) throw new Error(`${rendererId} is not bound to a registered profile`);
  const workbook = {
    id: "renderer-acceptance",
    name: `Renderer acceptance — ${state}`,
    profile_id: profile.id,
    created_at: "2026-08-29T12:00:00.000Z",
    revision: 0,
  };
  const output = render({
    workbookId: workbook.id,
    workbook,
    renderedAt: workbook.created_at,
    profile,
    ...buildFixture(profile, state),
  });
  const expected = kind === "html" ? "text/html" : "image/svg+xml";
  if (output.contentType !== expected) throw new Error(`${name} emitted ${output.contentType}`);
  return { name, rendererId, state, markup: decoder.decode(output.bytes), kind };
}

const HTML_FIXTURES = HTML_RENDERERS.flatMap((renderer) =>
  STATES.map((state) => renderFixture(renderer, state, "html")),
);
const SVG_FIXTURES = SVG_RENDERERS.flatMap((renderer) =>
  STATES.map((state) => renderFixture(renderer, state, "svg")),
);

function svgPage(svg: string): string {
  const inline = svg.replace(/^<\?xml[^>]*>\s*/i, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Renderer preview</title><style>html,body{margin:0;min-width:0;background:#fff}body{padding:12px}svg{display:block;width:100%;height:auto;max-width:100%}</style></head><body>${inline}</body></html>`;
}

const VIEWPORTS = [
  { name: "mobile", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 2560, height: 1200 },
] as const;

function observeFailures(page: Page): { errors: string[]; failedResources: string[] } {
  const errors: string[] = [];
  const failedResources: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    failedResources.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`);
  });
  return { errors, failedResources };
}

for (const fixture of HTML_FIXTURES) {
  test(`${fixture.name} — ${fixture.state}: responsive, keyboard, accessible, and printable`, async ({ page }) => {
    const failures = observeFailures(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.setContent(fixture.markup, { waitUntil: "load" });

      const overflow = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        return {
          viewport,
          content: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((element) =>
              element.getBoundingClientRect().right > viewport + 1 || element.scrollWidth > element.clientWidth + 1,
            )
            .slice(0, 6)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              className: element.className,
              right: Math.round(element.getBoundingClientRect().right),
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: getComputedStyle(element).overflowX,
            })),
        };
      });
      expect(
        overflow.content,
        `${fixture.name} overflows horizontally at ${viewport.name}: ${JSON.stringify(overflow.offenders)}`,
      ).toBeLessThanOrEqual(overflow.viewport + 1);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setContent(fixture.markup, { waitUntil: "load" });

    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const severe = audit.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      severe.map(({ id, impact, help, nodes }) => ({
        id,
        impact,
        help,
        nodes: nodes.length,
        targets: nodes.slice(0, 4).map((node) => node.target),
      })),
    ).toEqual([]);

    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.classList.contains("fdpm-skip-link"))).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-fdpm-theme-toggle"))).toBe(true);

    const paperBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fdpm-paper"));
    await page.locator("[data-fdpm-theme-toggle]").check();
    const paperAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fdpm-paper"));
    expect(paperAfter.trim()).not.toBe(paperBefore.trim());

    await page.evaluate(() => {
      Object.assign(window, { __fdpmPrintCalled: false });
      window.print = () => {
        Object.assign(window, { __fdpmPrintCalled: true });
      };
    });
    await page.locator("[data-fdpm-print]").click();
    expect(await page.evaluate(() => (window as unknown as { __fdpmPrintCalled: boolean }).__fdpmPrintCalled)).toBe(true);

    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".fdpm-document-actions")).toBeHidden();
    const printOverflow = await page.evaluate(() => ({
      body: getComputedStyle(document.body).overflow,
      document: getComputedStyle(document.documentElement).overflow,
      headingPx: Number.parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize),
      clipped: [...document.querySelectorAll<HTMLElement>(".scroll, pre")].filter(
        (element) => getComputedStyle(element).overflow !== "visible",
      ).length,
    }));
    expect(printOverflow.body).toBe("visible");
    expect(printOverflow.document).toBe("visible");
    expect(printOverflow.clipped).toBe(0);
    expect(printOverflow.headingPx).toBeLessThanOrEqual(28);

    expect(failures.errors).toEqual([]);
    expect(failures.failedResources).toEqual([]);
  });
}

for (const fixture of SVG_FIXTURES) {
  test(`${fixture.name} — ${fixture.state}: scalable, accessible, and resource-clean`, async ({ page }) => {
    const failures = observeFailures(page);
    for (const viewport of [VIEWPORTS[0], VIEWPORTS[3]]) {
      await page.setViewportSize(viewport);
      await page.setContent(svgPage(fixture.markup), { waitUntil: "load" });
      const geometry = await page.evaluate(() => {
        const svg = document.querySelector("svg");
        return {
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
          width: svg?.getBoundingClientRect().width ?? 0,
          height: svg?.getBoundingClientRect().height ?? 0,
        };
      });
      expect(geometry.content, `${fixture.name} overflows at ${viewport.name}`).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.height).toBeGreaterThan(0);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setContent(svgPage(fixture.markup), { waitUntil: "load" });
    const svg = page.locator("svg");
    await expect(svg).toHaveAttribute("role", "img");
    expect(
      await svg.evaluate((element) => element.getAttribute("aria-label") ?? element.querySelector("title")?.textContent ?? ""),
    ).not.toBe("");
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      audit.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.length })),
    ).toEqual([]);
    expect(failures.errors).toEqual([]);
    expect(failures.failedResources).toEqual([]);
  });
}

const GALLERY_FIXTURES = [...HTML_FIXTURES, ...SVG_FIXTURES].filter(
  (fixture) => fixture.state === "empty" || fixture.state === "typical",
);

async function setGallery(page: Page): Promise<void> {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FDPM renderer gallery</title>
    <style>
      *{box-sizing:border-box} body{margin:0;padding:22px;background:#d8d8d3;color:#141712;font:14px/1.4 sans-serif}
      h1{margin:0 0 18px;font-size:22px}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
      article{min-width:0}h2{margin:0 0 7px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
      iframe{display:block;width:100%;height:560px;border:1px solid #8d918b;background:#fff;box-shadow:0 8px 24px #0002}
      @media(max-width:700px){body{padding:12px}.gallery{grid-template-columns:1fr;gap:16px}iframe{height:520px}}
    </style></head><body><h1>FDPM renderers — empty and typical-state matrix</h1><div class="gallery">
    ${GALLERY_FIXTURES.map((fixture, index) => `<article><h2>${fixture.name} · ${fixture.state}</h2><iframe title="${fixture.name} — ${fixture.state}" data-index="${index}"></iframe></article>`).join("")}
    </div></body></html>`);

  const frames = page.locator("iframe");
  for (let index = 0; index < GALLERY_FIXTURES.length; index += 1) {
    const frame = await frames.nth(index).elementHandle();
    const contentFrame = await frame?.contentFrame();
    if (contentFrame === null || contentFrame === undefined) throw new Error(`gallery frame ${index} did not load`);
    const fixture = GALLERY_FIXTURES[index]!;
    await contentFrame.setContent(fixture.kind === "svg" ? svgPage(fixture.markup) : fixture.markup, { waitUntil: "load" });
  }
}

test("empty and typical-state renderer gallery visual regression", async ({ page }) => {
  const variants = [
    { name: "desktop-light", width: 1440, colorScheme: "light" as const, media: "screen" as const },
    { name: "mobile-light", width: 390, colorScheme: "light" as const, media: "screen" as const },
    { name: "desktop-dark", width: 1440, colorScheme: "dark" as const, media: "screen" as const },
    { name: "desktop-print", width: 1440, colorScheme: "light" as const, media: "print" as const },
  ];

  for (const variant of variants) {
    await page.setViewportSize({ width: variant.width, height: 1000 });
    await page.emulateMedia({ colorScheme: variant.colorScheme, media: variant.media });
    await setGallery(page);
    await expect(page).toHaveScreenshot(`html-empty-${variant.name}.png`, { fullPage: true });
  }
});
