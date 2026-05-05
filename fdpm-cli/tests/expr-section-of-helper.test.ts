/**
 * fn.section_of (helper-set v1.2.0) — SPEC-SECTIONS-TREE v0.2 §6.4.
 *
 * Verifies the helper resolves a dnis:Node id to its rendered §N.M.K
 * heading via the render-time `sectionIndex` threaded through
 * RenderDslFacade.renderTemplate. Two cases:
 *   1. green path — index hit by NID and by slug-form id.
 *   2. red path  — unknown id surfaces a `render-error` finding (per
 *      Principle 4: silent coercion to '' is forbidden).
 *
 * The fixture exercises the runtime binding plumbing end-to-end:
 * ValidationEvaluationOptions.sectionIndex → ExprRuntimeHelperContext
 * .sectionIndex → resolveSectionOf → emitted text.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

describe("fn.section_of — helper-set v1.2.0", () => {
  it("resolves a dnis:Node id from sectionIndex (NID and slug both hit)", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "test-section-of",
      name: "test-section-of",
      profile_id: "profile:spec-authoring-dnis:0.1",
    });
    // We need a valid spec:Document for the renderTemplate doc-resolver
    // to pick up. Field shape mirrors the fixtures in
    // tests/spec-md-dnis-sections.test.ts.
    await host.createPrimitive("test-section-of", {
      id: "spec:doc:section-of",
      type_id: "spec:Document",
      field_values: {
        title: "section_of fixture",
        spec_id: "spec:fixture:0.1",
        version: "0.1.0",
        status: "Draft",
        audience: "test",
        date: "2026-05-04",
        disclaimer_path: "../DISCLAIMER.md",
        pals_banner: false,
        generated_by: "vitest fixture",
      },
    });
    const slice = host.getProject("test-section-of");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const facade = host.renderDsl.createFacade({ slice, profile });
    const sectionIndex = new Map<string, string>([
      ["01KQT00000000000000000ABCD", "5.6.1"],
      ["dnis:node:01kqt00000000000000000abcd", "5.6.1"],
      ["01KQT00000000000000000WXYZ", "7"],
    ]);

    const greenByNid = facade.renderTemplate(
      "see §${fn.section_of(\"01KQT00000000000000000ABCD\")} for details",
      { templateId: "test:fn:section_of:nid", sectionIndex },
    );
    expect(greenByNid.text).toBe("see §5.6.1 for details");
    expect(greenByNid.findings).toHaveLength(0);

    const greenBySlug = facade.renderTemplate(
      "see §${fn.section_of(\"dnis:node:01kqt00000000000000000abcd\")} for details",
      { templateId: "test:fn:section_of:slug", sectionIndex },
    );
    expect(greenBySlug.text).toBe("see §5.6.1 for details");
    expect(greenBySlug.findings).toHaveLength(0);

    const greenSecond = facade.renderTemplate(
      "and §${fn.section_of(\"01KQT00000000000000000WXYZ\")}",
      { templateId: "test:fn:section_of:second", sectionIndex },
    );
    expect(greenSecond.text).toBe("and §7");
  });

  it("emits a render-error finding (not a silent empty string) on unknown id", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "test-section-of-miss",
      name: "test-section-of-miss",
      profile_id: "profile:spec-authoring-dnis:0.1",
    });
    await host.createPrimitive("test-section-of-miss", {
      id: "spec:doc:section-of-miss",
      type_id: "spec:Document",
      field_values: {
        title: "section_of miss fixture",
        spec_id: "spec:fixture:0.1",
        version: "0.1.0",
        status: "Draft",
        audience: "test",
        date: "2026-05-04",
        disclaimer_path: "../DISCLAIMER.md",
        pals_banner: false,
        generated_by: "vitest fixture",
      },
    });
    const slice = host.getProject("test-section-of-miss");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const facade = host.renderDsl.createFacade({ slice, profile });
    const sectionIndex = new Map<string, string>([
      ["01KQT00000000000000000ABCD", "5.6.1"],
    ]);

    const result = facade.renderTemplate(
      "see §${fn.section_of(\"01KQT00000000000000000NOPE\")}",
      { templateId: "test:fn:section_of:miss", sectionIndex },
    );
    // Per SPEC-RENDER-DSL Principle 4: undefined name surfaces as a
    // render-error finding with the offending expression. The default
    // CLI policy emits inline markers; the marker SHOULD contain the
    // unknown-name diagnostic.
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const matching = result.findings.find((f) =>
      f.message.includes("fn.section_of") && f.message.includes("01KQT00000000000000000NOPE"),
    );
    expect(matching).toBeDefined();
    // Inline marker is in the rendered text, not the empty string.
    expect(result.text).not.toBe("see §");
    expect(result.text).toContain("render-error");
  });

  it("treats sectionIndex as empty when not provided (validate-time semantics)", async () => {
    const host = await freshHost();
    await host.createProject({
      project_id: "test-section-of-empty",
      name: "test-section-of-empty",
      profile_id: "profile:spec-authoring-dnis:0.1",
    });
    await host.createPrimitive("test-section-of-empty", {
      id: "spec:doc:section-of-empty",
      type_id: "spec:Document",
      field_values: {
        title: "section_of empty fixture",
        spec_id: "spec:fixture:0.1",
        version: "0.1.0",
        status: "Draft",
        audience: "test",
        date: "2026-05-04",
        disclaimer_path: "../DISCLAIMER.md",
        pals_banner: false,
        generated_by: "vitest fixture",
      },
    });
    const slice = host.getProject("test-section-of-empty");
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const facade = host.renderDsl.createFacade({ slice, profile });

    const result = facade.renderTemplate(
      "see §${fn.section_of(\"01KQT00000000000000000ABCD\")}",
      { templateId: "test:fn:section_of:no-index" },
      // No sectionIndex passed → helper sees an empty map → unknown-name.
    );
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0]!.message).toMatch(/fn\.section_of/);
  });
});
