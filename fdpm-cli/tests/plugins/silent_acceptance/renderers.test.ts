import { describe, expect, it } from "vitest";
import type { RendererInput } from "../../../src/plugin/types.js";
import type { Host } from "../../../src/core/host.js";
import {
  ASSURANCE_DASHBOARD_RENDERER_ID,
  BOUNDARY_DECLARATION_RENDERER_ID,
  CONTROL_DOMAIN_MAP_RENDERER_ID,
  PROFILE,
  STATE_RENDERER_ID,
  renderAssuranceDashboard,
  renderBoundaryDeclaration,
  renderControlDomainMap,
  renderStateJson,
} from "../../../plugins/silent_acceptance/index.js";
import { freshHost, seedSilentAcceptance } from "./_fixture.js";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const EMPTY_INPUT: RendererInput = {
  workbookId: "sa-empty-render",
  primitives: [],
  relations: [],
  profile: PROFILE,
  renderedAt: "2026-09-04T21:00:00Z",
};

async function renderWithHost(host: Host, workbookId: string, target: string, rendererId: string) {
  const slice = host.getProject(workbookId);
  const input: RendererInput = {
    workbookId,
    primitives: Object.values(slice.primitives),
    relations: Object.values(slice.relations),
    profile: host.profiles.getResolved(slice.workbook.profile_id),
    renderedAt: "2026-09-04T21:00:00Z",
  };
  return host.plugins.runRenderer(target, input, { rendererId });
}

describe("silent-acceptance renderers", () => {
  it("renders the reviewable §9.1 declaration with all nine classes", async () => {
    const host = await freshHost();
    await seedSilentAcceptance(host, "sa-render-md");
    const out = await renderWithHost(host, "sa-render-md", "text/markdown", BOUNDARY_DECLARATION_RENDERER_ID);
    const markdown = decode(out.bytes);
    expect(out.filename).toBe("silent-acceptance-boundary.md");
    expect(markdown).toContain("SOLVER_CONFIGURATION_ID");
    expect(markdown).toContain("Acceptance authority");
    expect(markdown).toContain("ERR_HALLUCINATION");
    expect(markdown).toContain("ERR_REASONING");
    expect(markdown).toContain("These are separately declared quantities and are not directly compared");
    expect(markdown).toContain("Checks this artifact cannot prove");
  });

  it("renders a responsive, printable assurance dashboard", async () => {
    const host = await freshHost();
    await seedSilentAcceptance(host, "sa-render-html");
    const out = await renderWithHost(host, "sa-render-html", "text/html", ASSURANCE_DASHBOARD_RENDERER_ID);
    const html = decode(out.bytes);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('class="fdpm-skip-link"');
    expect(html).toContain("window.print()");
    expect(html).toContain("9 / 9 classes declared");
    expect(html).toContain("Producer control domain");
    expect(html).toContain("distinct declared quantities");
  });

  it("renders an accessible control-domain map with the authority outside the producer", async () => {
    const host = await freshHost();
    await seedSilentAcceptance(host, "sa-render-svg");
    const out = await renderWithHost(host, "sa-render-svg", "image/svg+xml", CONTROL_DOMAIN_MAP_RENDERER_ID);
    const svg = decode(out.bytes);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
    expect(svg).toContain("agent-runtime");
    expect(svg).toContain("assurance-governance");
    expect(svg).toContain("Research team");
  });

  it("renders a bounded machine projection with completeness and caveats", async () => {
    const host = await freshHost();
    await seedSilentAcceptance(host, "sa-render-json");
    const out = await renderWithHost(
      host,
      "sa-render-json",
      "application/vnd.fdpm.silent-acceptance+json",
      STATE_RENDERER_ID,
    );
    const state = JSON.parse(decode(out.bytes)) as Record<string, unknown>;
    expect(state["schema_version"]).toBe("2.1.0");
    expect(state["complete_error_class_count"]).toBe(9);
    expect(state["silent_acceptance"]).toBe(false);
    expect(state["boundaries"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tolerated_failure_rate: expect.any(Number),
          aggregate_residual_risk: expect.any(Number),
        }),
      ]),
    );
    expect(out.bytes.byteLength).toBeLessThanOrEqual(256 * 1024);
  });

  it("renders explicit empty states instead of throwing or borrowing another profile", () => {
    expect(decode(renderBoundaryDeclaration(EMPTY_INPUT).bytes)).toContain("No verification boundary");
    expect(decode(renderAssuranceDashboard(EMPTY_INPUT).bytes)).toContain("No verification boundary");
    expect(decode(renderControlDomainMap(EMPTY_INPUT).bytes)).toContain("No verification boundary");
    expect(JSON.parse(decode(renderStateJson(EMPTY_INPUT).bytes)).silent_acceptance).toBe(true);
  });
});
