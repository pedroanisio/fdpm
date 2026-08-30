import { describe, expect, it } from "vitest";
import type { RendererInput, RendererOutput } from "../src/plugin/types.js";
import { renderStandaloneDocument } from "../src/core/render/document.js";
import { renderPaperHtml } from "../plugins/academic_paper_v0_4_1/renderers/paper_document.js";
import { renderHtml as renderFormalSpecificationHtml } from "../plugins/formal_specification/renderers/html.js";
import { renderAuthorityMatrix } from "../plugins/loop_forward/renderers/authority_matrix.js";
import { renderBindingMatrix } from "../plugins/loop_forward/renderers/binding_matrix.js";
import { renderVerificationSurface } from "../plugins/loop_forward/renderers/verification_surface.js";
import { renderSrsHtml } from "../plugins/software_requirements/renderers/srs_document.js";
import { renderStyleHtml } from "../plugins/style/renderers/style_html.js";
import { renderDocumentHtml as renderUixoDocumentHtml } from "../plugins/uixo/renderers/document_html.js";
import { TEST_PROFILE } from "./fixtures.js";

const decoder = new TextDecoder();

const EMPTY_INPUT: RendererInput = {
  workbookId: "renderer-acceptance",
  primitives: [],
  relations: [],
  profile: TEST_PROFILE,
};

const HTML_RENDERERS: ReadonlyArray<readonly [string, (input: RendererInput) => RendererOutput, string]> = [
  ["academic paper", renderPaperHtml, "No paper content has been recorded yet."],
  ["formal specification", renderFormalSpecificationHtml, "No specification sections or primitives have been recorded yet."],
  ["loop-forward authority matrix", renderAuthorityMatrix, "This workbook declares no agent."],
  ["loop-forward binding matrix", renderBindingMatrix, "This workbook declares no pipeline"],
  ["loop-forward verification surface", renderVerificationSurface, "This workbook declares no pipeline"],
  ["software requirements", renderSrsHtml, "No requirements have been recorded yet."],
  ["style registry", renderStyleHtml, "No styles have been recorded yet."],
  ["UIXO document", renderUixoDocumentHtml, "No UIXO entities have been recorded yet."],
];

function text(output: RendererOutput): string {
  expect(output.contentType).toBe("text/html");
  return decoder.decode(output.bytes);
}

describe("standalone document design system", () => {
  it("escapes document metadata while preserving already-escaped body content", () => {
    const html = renderStandaloneDocument({
      title: '<Renderer & "review">',
      body: "<main><h1>Trusted body</h1></main>",
      accent: "cobalt",
    });

    expect(html).toContain("<title>&lt;Renderer &amp; &quot;review&quot;&gt;</title>");
    expect(html).toContain("<main><h1>Trusted body</h1></main>");
    expect(html).toContain('data-accent="cobalt"');
  });

  it.each(HTML_RENDERERS)("gives the %s renderer the complete responsive and print shell", (_name, render, emptyCopy) => {
    const html = text(render(EMPTY_INPUT));

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('class="fdpm-skip-link"');
    expect(html).toContain('id="fdpm-content"');
    expect(html).toContain('aria-label="Document actions"');
    expect(html).toContain('data-fdpm-theme-toggle');
    expect(html).toContain('data-fdpm-print');
    expect(html).toContain(":focus-visible");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("@page");
    expect(html).toContain("overflow: visible !important");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("window.print()");
    expect(html).toContain(emptyCopy);
  });
});
