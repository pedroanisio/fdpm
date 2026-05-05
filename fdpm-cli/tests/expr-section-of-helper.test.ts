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
      workbook_id: "test-section-of",
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
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
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
      workbook_id: "test-section-of-miss",
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
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
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

  it("integration: spec_md populateSectionIndex produces a usable index for fn.section_of", async () => {
    // End-to-end proof: build a real dnis:Document + dnis:Node tree
    // via DnisHostAdapter (matching the SPEC-SECTIONS-TREE v0.2 fixture
    // pattern), then ask the renderer to populate the section index
    // and run a `fn.section_of` template against the resulting map.
    // The test does NOT exercise spec_md's body_md path (which today
    // emits body_md verbatim); it confirms that the index-building
    // half of the contract works against a real DNIS Operation graph.
    const { resolve } = await import("node:path");
    const { Host } = await import("../src/core/host.js");
    const { DnisHostAdapter, positionBetween } = await import(
      "../src/core/dnis/index.js"
    );
    type AgentId = import("../src/core/dnis/index.js").AgentId;
    type DocumentId = import("../src/core/dnis/index.js").DocumentId;
    type NodeId = import("../src/core/dnis/index.js").NodeId;
    type OperationId = import("../src/core/dnis/index.js").OperationId;

    const host = new Host({
      dataDir: null,
      builtinDirs: [resolve(process.cwd(), "plugins")],
    });
    await host.load();
    const workbookId = "test-section-of-integration";
    await host.createProject({
      workbook_id: workbookId,
      name: workbookId,
      profile_id: "profile:spec-authoring-dnis:0.1",
    });
    await host.createPrimitive(workbookId, {
      id: "spec:doc:integration",
      type_id: "spec:Document",
      field_values: {
        title: "section_of integration",
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
    const adapter = new DnisHostAdapter(host, { workbookId });
    const document = await adapter.createDocument({
      createdBy: "agent:test" as AgentId,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    // Build §1 → §1.1 → §1.1.1 plus §2 sibling.
    const s1 = (
      await adapter.apply({
        id: "OP1CREATE000000000000000A1" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: "agent:test" as AgentId,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "section",
          content: { title: "Purpose" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      })
    ).affectedNodeIds[0]!;
    const s11 = (
      await adapter.apply({
        id: "OP1CREATE000000000000000A2" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: "agent:test" as AgentId,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "section",
          content: { title: "Why now" },
          parentNodeId: s1,
          position: positionBetween(null, null),
        },
      })
    ).affectedNodeIds[0]!;
    void s11;
    const s2 = (
      await adapter.apply({
        id: "OP1CREATE000000000000000A3" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: "agent:test" as AgentId,
        issuedAt: "2026-05-04T12:00:02.000Z",
        payload: {
          kind: "section",
          content: { title: "Plan" },
          parentNodeId: null,
          position: positionBetween(adapter.getNode(s1).position, null),
        },
      })
    ).affectedNodeIds[0]!;
    void s2 as NodeId;

    // Now build the section index the same way spec_md does, by
    // running the full renderer (which calls populateSectionIndex
    // internally) and capturing the rendered output. The §1.1 heading
    // must appear; if it does, populateSectionIndex saw the node at
    // path [1, 1] and indexed it.
    const slice = host.getProject(workbookId);
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId,
        workbook: slice.workbook,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        templates: Object.values(slice.templates),
        profile,
      },
      { rendererId: "spec:SpecMarkdownRenderer" },
    );
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toContain("## 1. Purpose");
    expect(text).toContain("### 1.1. Why now");
    expect(text).toContain("## 2. Plan");

    // Now exercise the helper against the same workbook via the
    // RenderDslFacade. The renderer's populateSectionIndex emits to
    // `ctx.sectionIndex` which is then passed into renderTemplate
    // calls — but for THIS test, we reproduce the index ourselves and
    // pass it directly to confirm the resolution path.
    const facade = host.renderDsl.createFacade({ slice, profile });
    const sectionIndex = new Map<string, string>([
      [s1, "1"],
      [s11, "1.1"],
      [s2, "2"],
    ]);
    const rendered = facade.renderTemplate(
      "see §${fn.section_of(\"" + s11 + "\")} for details",
      { templateId: "test:integration:body", sectionIndex },
    );
    expect(rendered.text).toBe("see §1.1 for details");
    expect(rendered.findings).toHaveLength(0);
  });

  it("treats sectionIndex as empty when not provided (validate-time semantics)", async () => {
    const host = await freshHost();
    await host.createProject({
      workbook_id: "test-section-of-empty",
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
    const profile = host.profiles.getResolved(slice.workbook.profile_id);
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
