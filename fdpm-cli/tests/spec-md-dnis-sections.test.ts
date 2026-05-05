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
  content: { title: string; body_md?: string; dispatch_kind?: string },
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
});
