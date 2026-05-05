/**
 * spec:SpecMarkdownRenderer — DNIS-Node section path.
 *
 * Verifies SPEC-SECTIONS-TREE v0.2 / SPEC-CORE 1.2 §5.6 contract:
 * when a project carries a dnis:Document and one or more dnis:Node
 * primitives of kind "section", the renderer walks the DNIS Node graph
 * (DFS over parent_node_id, sorted by SPEC-DNIS Position) and emits
 * §N.M.K headings derived from the DFS path.
 *
 * Also asserts the mixed-mode warning (a project containing both
 * spec:Section and dnis:Node sections is a defect; the DNIS path wins
 * but the renderer surfaces a finding so the project author can clean
 * up).
 *
 * The fixtures are constructed via DnisHostAdapter against a real
 * Host on profile:spec-authoring-dnis:0.1 — the §5.6.6-equivalent
 * conformance pattern.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import {
  DnisHostAdapter,
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../src/core/dnis/index.js";

const AGENT = "agent:test" as AgentId;
const SPEC_AUTHORING_DNIS_PROFILE = "profile:spec-authoring-dnis:0.1";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

async function newComposedProject(host: Host, project_id: string): Promise<void> {
  await host.createProject({
    project_id,
    name: project_id,
    profile_id: SPEC_AUTHORING_DNIS_PROFILE,
  });
}

interface BuiltSection {
  nodeId: NodeId;
}

async function createSection(
  adapter: DnisHostAdapter,
  documentId: DocumentId,
  parent: NodeId | null,
  index: number,
  content: {
    title: string;
    body_md?: string;
    dispatch_kind?: string;
    ref_slug?: string;
    number_override?: string;
  },
): Promise<BuiltSection> {
  const opId = `OPSEC${String(index).padStart(20, "0")}A` as OperationId;
  // Compute position by appending after the last sibling under the same
  // parent (the test fixture is constructed in document order, so we
  // can use positionBetween(lastPosition, null) for "append to end").
  const siblings = adapter.listActiveNodes(documentId, parent);
  const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
  const position = positionBetween(last?.position ?? null, null);
  const result = await adapter.apply({
    id: opId,
    type: "create",
    documentId,
    agentId: AGENT,
    issuedAt: `2026-05-04T12:00:${String(index).padStart(2, "0")}.000Z`,
    payload: {
      kind: "section",
      content,
      parentNodeId: parent,
      position,
    },
  });
  return { nodeId: result.affectedNodeIds[0]! };
}

async function renderWithRenderer(host: Host, project_id: string): Promise<{
  text: string;
  findings: ReadonlyArray<{ message: string; expression?: string }>;
}> {
  const slice = host.getProject(project_id);
  const profile = host.profiles.getResolved(slice.project.profile_id);
  const out = await host.plugins.runRenderer(
    "text/markdown",
    {
      projectId: project_id,
      project: slice.project,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile,
    },
    { rendererId: "spec:SpecMarkdownRenderer" },
  );
  return {
    text: new TextDecoder().decode(out.bytes),
    findings: (out.findings ?? []) as ReadonlyArray<{ message: string; expression?: string }>,
  };
}

describe("spec:SpecMarkdownRenderer — DNIS Node section path", () => {
  it("walks dnis:Node tree DFS and emits §N.M.K headings derived from the path", async () => {
    const host = await freshHost();
    const projectId = "test-spec-dnis-fixture";
    await newComposedProject(host, projectId);

    // The renderer needs a spec:Document to populate the frontmatter
    // and §0 Document Status table; that primitive lives in the
    // spec-authoring side of the composed profile.
    await host.createPrimitive(projectId, {
      id: "spec:doc:fixture",
      type_id: "spec:Document",
      field_values: {
        title: "DNIS Fixture",
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

    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });

    // Build a tree:
    //   §1 Purpose
    //     §1.1 Why now
    //     §1.2 Out of scope
    //   §2 Plan
    //     §2.1 Step one
    //       §2.1.1 Sub-step
    //     §2.2 Step two
    //   §3 References
    let counter = 0;
    const s1 = await createSection(adapter, document.id, null, ++counter, {
      title: "Purpose",
      body_md: "Why this document exists.",
    });
    const s11 = await createSection(adapter, document.id, s1.nodeId, ++counter, {
      title: "Why now",
      body_md: "Forcing function.",
    });
    void s11;
    const s12 = await createSection(adapter, document.id, s1.nodeId, ++counter, {
      title: "Out of scope",
      body_md: "Out-of-scope items.",
    });
    void s12;
    const s2 = await createSection(adapter, document.id, null, ++counter, {
      title: "Plan",
      body_md: "Implementation plan.",
    });
    const s21 = await createSection(adapter, document.id, s2.nodeId, ++counter, {
      title: "Step one",
      body_md: "First step.",
    });
    const s211 = await createSection(adapter, document.id, s21.nodeId, ++counter, {
      title: "Sub-step",
      body_md: "Sub-step prose.",
    });
    void s211;
    const s22 = await createSection(adapter, document.id, s2.nodeId, ++counter, {
      title: "Step two",
      body_md: "Second step.",
    });
    void s22;
    const s3 = await createSection(adapter, document.id, null, ++counter, {
      title: "References",
      body_md: "Bibliography.",
    });
    void s3;

    const { text, findings } = await renderWithRenderer(host, projectId);

    // No mixed-mode warning since there are no spec:Section primitives.
    expect(findings.filter((f) => f.expression === "spec:render:mixed-mode-sections")).toHaveLength(0);

    // Headings derived from DFS path indices, NOT from any authored
    // `number` field. Top-level uses `## N.`, sub-section `### N.M.`,
    // sub-sub `#### N.M.K.`.
    expect(text).toContain("## 1. Purpose");
    expect(text).toContain("### 1.1. Why now");
    expect(text).toContain("### 1.2. Out of scope");
    expect(text).toContain("## 2. Plan");
    expect(text).toContain("### 2.1. Step one");
    expect(text).toContain("#### 2.1.1. Sub-step");
    expect(text).toContain("### 2.2. Step two");
    expect(text).toContain("## 3. References");

    // Body content survives.
    expect(text).toContain("Why this document exists.");
    expect(text).toContain("Sub-step prose.");

    // Order: §1 prose appears before §2 prose, which appears before §3.
    const i1 = text.indexOf("## 1. Purpose");
    const i2 = text.indexOf("## 2. Plan");
    const i3 = text.indexOf("## 3. References");
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it("ignores retired dnis:Node sections (renders only the active document state)", async () => {
    const host = await freshHost();
    const projectId = "test-spec-dnis-retire";
    await newComposedProject(host, projectId);
    await host.createPrimitive(projectId, {
      id: "spec:doc:retire",
      type_id: "spec:Document",
      field_values: {
        title: "Retire fixture",
        spec_id: "spec:retire:0.1",
        version: "0.1.0",
        status: "Draft",
        audience: "test",
        date: "2026-05-04",
        disclaimer_path: "../DISCLAIMER.md",
        pals_banner: false,
        generated_by: "vitest fixture",
      },
    });
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    const keep = await createSection(adapter, document.id, null, 1, {
      title: "Kept section",
    });
    const retired = await createSection(adapter, document.id, null, 2, {
      title: "Retired section",
    });

    await adapter.apply({
      id: "OPRETIRE000000000000000001" as OperationId,
      type: "retire",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:10.000Z",
      targetNodeId: retired.nodeId,
      payload: {},
    });
    void keep;

    const { text } = await renderWithRenderer(host, projectId);
    expect(text).toContain("## 1. Kept section");
    expect(text).not.toContain("Retired section");
  });

  it("emits a mixed-mode warning when both spec:Section and dnis:Node sections coexist; DNIS path is canonical", async () => {
    const host = await freshHost();
    const projectId = "test-spec-dnis-mixed";
    await newComposedProject(host, projectId);
    await host.createPrimitive(projectId, {
      id: "spec:doc:mixed",
      type_id: "spec:Document",
      field_values: {
        title: "Mixed-mode fixture",
        spec_id: "spec:mixed:0.1",
        version: "0.1.0",
        status: "Draft",
        audience: "test",
        date: "2026-05-04",
        disclaimer_path: "../DISCLAIMER.md",
        pals_banner: false,
        generated_by: "vitest fixture",
      },
    });
    // Legacy spec:Section: should be ignored by the renderer when the
    // DNIS path is active, but the warning MUST fire.
    await host.createPrimitive(projectId, {
      id: "spec:sec:legacy",
      type_id: "spec:Section",
      field_values: {
        number: "99",
        title: "Legacy section to ignore",
        kind: "prose",
        body_md: "This text should NOT appear in the rendered output.",
      },
    });

    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, {
      title: "DNIS section",
      body_md: "DNIS-path content wins.",
    });

    const { text, findings } = await renderWithRenderer(host, projectId);
    const mixed = findings.filter((f) => f.expression === "spec:render:mixed-mode-sections");
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.message).toMatch(/dnis:Node section.*spec:Section primitive.*DNIS path is canonical/);

    expect(text).toContain("## 1. DNIS section");
    expect(text).not.toContain("Legacy section to ignore");
    expect(text).not.toContain("## 99.");
  });

  it("buildSectionIndex emits slug-keyed entries (title-derived + author-supplied ref_slug + collision suffix)", async () => {
    // End-to-end proof: build a real dnis:Document with three top-level
    // sections (one with explicit ref_slug, two with colliding titles),
    // call buildSectionIndex against the project's primitives, and
    // assert the slug-keyed entries land. Then exercise the lookups
    // through fn.section_of via the renderTemplate facade — using the
    // EXACT map buildSectionIndex produced.
    const { buildSectionIndex } = await import(
      "../plugins/spec_authoring/renderers/spec_md.js"
    );

    const host = await freshHost();
    const projectId = "test-spec-dnis-slugs";
    await newComposedProject(host, projectId);
    await host.createPrimitive(projectId, {
      id: "spec:doc:slugs",
      type_id: "spec:Document",
      field_values: {
        title: "Slug fixture",
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
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    // §1 Purpose and Scope    → slug from title
    // §2 References (biblio)  → author-supplied ref_slug "biblio"
    // §3 References           → collision with §2's title-derived
    //                            slug → suffixed `section:references-2`
    let counter = 0;
    await createSection(adapter, document.id, null, ++counter, {
      title: "Purpose and Scope",
      body_md: "Why this exists.",
    });
    await createSection(adapter, document.id, null, ++counter, {
      title: "References",
      body_md: "First references list.",
      ref_slug: "biblio",
    });
    await createSection(adapter, document.id, null, ++counter, {
      title: "References",
      body_md: "Second references list (collision)!",
    });

    // Sanity-check the raw renderer outputs the right §-numbers.
    const { text } = await renderWithRenderer(host, projectId);
    expect(text).toContain("## 1. Purpose and Scope");
    expect(text).toContain("## 2. References");
    expect(text).toContain("## 3. References");

    // Real test: buildSectionIndex emits the slug entries.
    const slice = host.getProject(projectId);
    const index = buildSectionIndex(Object.values(slice.primitives));
    expect(index.get("section:purpose-and-scope")).toBe("1");
    // §2 used an author-supplied ref_slug, so its baseSlug is
    // `section:biblio` (NOT the title-derived `section:references`).
    // That means §3's title-derived `section:references` is the FIRST
    // occurrence of that base — it claims the bare slug, no suffix.
    expect(index.get("section:biblio")).toBe("2");
    expect(index.get("section:references")).toBe("3");
    expect(index.has("section:references-2")).toBe(false);

    // End-to-end via fn.section_of.
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const facade = host.renderDsl.createFacade({ slice, profile });
    const a = facade.renderTemplate(
      "see §${fn.section_of(\"section:purpose-and-scope\")}",
      { templateId: "test:slug:purpose", sectionIndex: index },
    );
    expect(a.text).toBe("see §1");
    expect(a.findings).toHaveLength(0);

    const b = facade.renderTemplate(
      "see §${fn.section_of(\"section:biblio\")}",
      { templateId: "test:slug:biblio", sectionIndex: index },
    );
    expect(b.text).toBe("see §2");

    const c = facade.renderTemplate(
      "see §${fn.section_of(\"section:references\")}",
      { templateId: "test:slug:references", sectionIndex: index },
    );
    expect(c.text).toBe("see §3");
  });

  it("buildSectionIndex disambiguates colliding title-derived slugs with -2, -3, ... in DFS order", async () => {
    const { buildSectionIndex } = await import(
      "../plugins/spec_authoring/renderers/spec_md.js"
    );

    const host = await freshHost();
    const projectId = "test-spec-dnis-slug-collision";
    await newComposedProject(host, projectId);
    await host.createPrimitive(projectId, {
      id: "spec:doc:slug-collision",
      type_id: "spec:Document",
      field_values: {
        title: "Slug collision fixture",
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
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    // Three sections all titled "Open Questions" — no ref_slug.
    let counter = 0;
    await createSection(adapter, document.id, null, ++counter, {
      title: "Open Questions",
      body_md: "First.",
    });
    await createSection(adapter, document.id, null, ++counter, {
      title: "Open Questions",
      body_md: "Second.",
    });
    await createSection(adapter, document.id, null, ++counter, {
      title: "Open Questions",
      body_md: "Third.",
    });

    const slice = host.getProject(projectId);
    const index = buildSectionIndex(Object.values(slice.primitives));
    expect(index.get("section:open-questions")).toBe("1");
    expect(index.get("section:open-questions-2")).toBe("2");
    expect(index.get("section:open-questions-3")).toBe("3");
  });

  it("number_override on dnis:Node content drives heading label, depth, and section_index value", async () => {
    // Two cases combined:
    //   (1) Letter appendix — top-level "A" sibling of integer
    //       top-level sections.
    //   (2) Mid-chain insert — child node tagged "5.6" placed
    //       under §5; depth derives from override's dot count (= 3 →
    //       `### 5.6.`).
    //
    // Both override cases:
    //   - Render the literal label as the heading number.
    //   - Populate fn.section_of with the literal label as the value.
    const { buildSectionIndex } = await import(
      "../plugins/spec_authoring/renderers/spec_md.js"
    );

    const host = await freshHost();
    const projectId = "test-spec-dnis-number-override";
    await newComposedProject(host, projectId);
    await host.createPrimitive(projectId, {
      id: "spec:doc:override",
      type_id: "spec:Document",
      field_values: {
        title: "Number-override fixture",
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
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });

    // §5 The Instance Model (top-level, plain DFS gives "5")
    let counter = 0;
    const s5 = await createSection(adapter, document.id, null, ++counter, {
      title: "Instance Model",
      ref_slug: "instance-model",
    });
    // §5.6 SPEC-DNIS adoption (CHILD of §5, override label "5.6"
    // because legacy SPEC-CORE has it numbered 5.6 even though it's
    // structurally the first/only child of §5).
    await createSection(adapter, document.id, s5.nodeId, ++counter, {
      title: "SPEC-DNIS adoption",
      number_override: "5.6",
      ref_slug: "dnis-adoption",
    });
    // §6 The Store (top-level)
    await createSection(adapter, document.id, null, ++counter, {
      title: "The Store",
    });
    // §A Open Questions (top-level appendix; override "A")
    await createSection(adapter, document.id, null, ++counter, {
      title: "Open Questions",
      number_override: "A",
      ref_slug: "open-questions",
    });
    // §B Revision History (top-level appendix; override "B")
    await createSection(adapter, document.id, null, ++counter, {
      title: "Revision History",
      number_override: "B",
      ref_slug: "revisions",
    });

    const { text, findings } = await renderWithRenderer(host, projectId);
    expect(findings.filter((f) => f.expression?.startsWith("spec:render:dnis"))).toHaveLength(0);

    // Heading labels match the overrides where set, DFS where not.
    expect(text).toContain("## 1. Instance Model");
    expect(text).toContain("### 5.6. SPEC-DNIS adoption");
    expect(text).toContain("## 2. The Store");
    expect(text).toContain("## A. Open Questions");
    expect(text).toContain("## B. Revision History");

    // Depth comes from the override's dot count when set: "5.6" has
    // one dot → 1+2 = 3 (###). "A" has zero dots → 2 (##). "1" / "2"
    // come from DFS path length (top-level → 2 → ##). The test above
    // verifies this implicitly via the heading hashes.

    // section_index value is the override when set, DFS otherwise.
    const index = buildSectionIndex(
      Object.values(host.getProject(projectId).primitives),
    );
    expect(index.get("section:instance-model")).toBe("1");
    expect(index.get("section:dnis-adoption")).toBe("5.6");
    expect(index.get("section:the-store")).toBe("2");
    expect(index.get("section:open-questions")).toBe("A");
    expect(index.get("section:revisions")).toBe("B");

    // fn.section_of returns the literal override when callers
    // reference the slug.
    const slice = host.getProject(projectId);
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const facade = host.renderDsl.createFacade({ slice, profile });
    const r = facade.renderTemplate(
      "see §${fn.section_of(\"section:dnis-adoption\")} and appendix §${fn.section_of(\"section:open-questions\")}",
      { templateId: "test:override:lookup", sectionIndex: index },
    );
    expect(r.text).toBe("see §5.6 and appendix §A");
    expect(r.findings).toHaveLength(0);
  });
});
