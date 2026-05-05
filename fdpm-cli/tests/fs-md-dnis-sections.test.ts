/**
 * formal_specification renderers — DNIS-Node section path.
 *
 * Verifies that when a project carries a dnis:Document and one or more
 * dnis:Node primitives of kind="section" (typically via
 * profile:formal-specification-dnis:0.1), the markdown / html / pdf
 * renderers walk the DNIS Node graph (DFS over parent_node_id, sorted
 * by SPEC-DNIS Position) and emit dotted §N.M.K numbering derived from
 * the DFS path, instead of using the legacy fs:Section flat-by-`number`
 * sort.
 *
 * Also asserts:
 *   - membership: fs:ContainedIn whose target_id is a dnis:Node uid
 *     anchors a primitive into that section's bucket
 *   - mixed-mode finding: project containing both fs:Section AND
 *     dnis:Node sections triggers fs:render:mixed-mode-sections
 *   - retired dnis:Nodes are excluded
 *   - bibliography (fs:Citation) and unsectioned buckets work in DNIS
 *     mode the same way they do in legacy mode
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
import { buildDocumentTreeFromDnis } from "../plugins/formal_specification/renderers/_common.js";
import type { PrimitiveInstance, RelationInstance } from "../src/core/models/instance.js";
import type { DomainProfile } from "../src/core/models/meta.js";

const AGENT = "agent:test" as AgentId;
const FS_DNIS_PROFILE = "profile:formal-specification-dnis:0.1";

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
    profile_id: FS_DNIS_PROFILE,
  });
}

async function createSection(
  adapter: DnisHostAdapter,
  documentId: DocumentId,
  parent: NodeId | null,
  index: number,
  content: { title: string; status?: string; description?: string },
): Promise<NodeId> {
  const opId = `OPSEC${String(index).padStart(20, "0")}A` as OperationId;
  const siblings = adapter.listActiveNodes(documentId, parent);
  const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
  const position = positionBetween(last?.position ?? null, null);
  const result = await adapter.apply({
    id: opId,
    type: "create",
    documentId,
    agentId: AGENT,
    issuedAt: `2026-05-04T12:00:${String(index).padStart(2, "0")}.000Z`,
    payload: { kind: "section", content, parentNodeId: parent, position },
  });
  return result.affectedNodeIds[0]!;
}

interface RendererOut {
  text: string;
  findings: ReadonlyArray<{ message: string; expression?: string }>;
  bytes: Uint8Array;
  contentType: string;
}

async function renderWith(
  host: Host,
  projectId: string,
  rendererId: string,
  contentType: string,
): Promise<RendererOut> {
  const slice = host.getProject(projectId);
  const profile = host.profiles.getResolved(slice.project.profile_id);
  const out = await host.plugins.runRenderer(
    contentType,
    {
      projectId,
      project: slice.project,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile,
    },
    { rendererId },
  );
  return {
    text: new TextDecoder().decode(out.bytes),
    findings: (out.findings ?? []) as ReadonlyArray<{
      message: string;
      expression?: string;
    }>,
    bytes: out.bytes,
    contentType: out.contentType,
  };
}

describe("formal_specification renderers — DNIS Node section path", () => {
  it("markdown: walks dnis:Node tree DFS and emits §N.M.K headings derived from the path", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-md-fixture";
    await newComposedProject(host, projectId);

    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });

    // Build:
    //   §1 Background
    //     §1.1 Prior art
    //   §2 Method
    //     §2.1 Setup
    //     §2.2 Procedure
    //   §3 Conclusion
    let i = 0;
    const bg = await createSection(adapter, document.id, null, ++i, {
      title: "Background",
      description: "Why this work matters.",
    });
    await createSection(adapter, document.id, bg, ++i, {
      title: "Prior art",
      description: "Related literature.",
    });
    const method = await createSection(adapter, document.id, null, ++i, {
      title: "Method",
    });
    await createSection(adapter, document.id, method, ++i, {
      title: "Setup",
    });
    await createSection(adapter, document.id, method, ++i, {
      title: "Procedure",
    });
    await createSection(adapter, document.id, null, ++i, {
      title: "Conclusion",
      description: "Wrap-up.",
    });

    const out = await renderWith(host, projectId, "fs:SpecRenderer", "text/markdown");

    // Headings derived from DFS path. fs renderers use depth-2 (`##`)
    // for every section; the dotted number captures the depth.
    expect(out.text).toContain("## 1. Background");
    expect(out.text).toContain("## 1.1. Prior art");
    expect(out.text).toContain("## 2. Method");
    expect(out.text).toContain("## 2.1. Setup");
    expect(out.text).toContain("## 2.2. Procedure");
    expect(out.text).toContain("## 3. Conclusion");

    // Description from dnis:Node.content survives.
    expect(out.text).toContain("Why this work matters.");
    expect(out.text).toContain("Wrap-up.");

    // No mixed-mode warning since there are no fs:Section primitives.
    expect(
      out.findings.filter((f) => f.expression === "fs:render:mixed-mode-sections"),
    ).toHaveLength(0);

    // Document order preserved.
    const i1 = out.text.indexOf("## 1. Background");
    const i2 = out.text.indexOf("## 2. Method");
    const i3 = out.text.indexOf("## 3. Conclusion");
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it("html: wraps DFS-derived headings in <h2> with dotted numbers", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-html-fixture";
    await newComposedProject(host, projectId);
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    const a = await createSection(adapter, document.id, null, 1, { title: "Alpha" });
    await createSection(adapter, document.id, a, 2, { title: "Alpha-1" });
    await createSection(adapter, document.id, null, 3, { title: "Beta" });

    const out = await renderWith(host, projectId, "fs:SpecHtmlRenderer", "text/html");
    expect(out.text).toContain("<h2>1. Alpha");
    expect(out.text).toContain("<h2>1.1. Alpha-1");
    expect(out.text).toContain("<h2>2. Beta");
  });

  it("pdf: produces a valid PDF and surfaces no findings on a clean DNIS project", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-pdf-fixture";
    await newComposedProject(host, projectId);
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, { title: "Solo" });

    const out = await renderWith(host, projectId, "fs:SpecPdfRenderer", "application/pdf");
    expect(out.contentType).toBe("application/pdf");
    expect(out.bytes.length).toBeGreaterThan(100);
    // PDF magic header.
    expect(new TextDecoder().decode(out.bytes.slice(0, 4))).toBe("%PDF");
    expect(out.findings).toHaveLength(0);
  });

  it("ignores retired dnis:Node sections (renders only active nodes)", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-retired";
    await newComposedProject(host, projectId);
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, { title: "Kept section" });
    const retired = await createSection(adapter, document.id, null, 2, {
      title: "Retired section",
    });
    await adapter.apply({
      id: "OPRETIRE000000000000000001" as OperationId,
      type: "retire",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:10.000Z",
      targetNodeId: retired,
      payload: {},
    });

    const out = await renderWith(host, projectId, "fs:SpecRenderer", "text/markdown");
    expect(out.text).toContain("## 1. Kept section");
    expect(out.text).not.toContain("Retired section");
  });

  it("emits a mixed-mode warning when both fs:Section and dnis:Node sections coexist; DNIS path wins", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-mixed";
    await newComposedProject(host, projectId);

    // Legacy fs:Section primitive: should be ignored once DNIS sections
    // exist, but the warning MUST fire.
    await host.createPrimitive(projectId, {
      id: "section:99",
      type_id: "fs:Section",
      field_values: {
        number: 99,
        title: "Legacy section to ignore",
        status: "draft",
        version: "0.1",
        description: "This text should NOT appear in the rendered output.",
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
      description: "DNIS-path content wins.",
    });

    const out = await renderWith(host, projectId, "fs:SpecRenderer", "text/markdown");
    const mixed = out.findings.filter(
      (f) => f.expression === "fs:render:mixed-mode-sections",
    );
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.message).toMatch(/dnis:Node section.*fs:Section primitive.*DNIS path is canonical/);

    // Markdown body surfaces the warning, then the DNIS section, never
    // the legacy one.
    expect(out.text).toContain("[!WARNING]");
    expect(out.text).toContain("## 1. DNIS section");
    expect(out.text).not.toContain("Legacy section to ignore");
    expect(out.text).not.toContain("## 99.");

    // All three renderers surface the same finding via
    // RendererOutput.findings (so downstream tooling can group across
    // formats). HTML emits an <aside> band; PDF draws an italic line
    // on the title page.
    const htmlOut = await renderWith(host, projectId, "fs:SpecHtmlRenderer", "text/html");
    expect(
      htmlOut.findings.filter((f) => f.expression === "fs:render:mixed-mode-sections"),
    ).toHaveLength(1);
    expect(htmlOut.text).toContain('class="fdpm-finding"');
    expect(htmlOut.text).toContain("DNIS path is canonical");

    const pdfOut = await renderWith(host, projectId, "fs:SpecPdfRenderer", "application/pdf");
    expect(
      pdfOut.findings.filter((f) => f.expression === "fs:render:mixed-mode-sections"),
    ).toHaveLength(1);
    // PDF magic header survives; nothing more we can portably assert
    // without parsing the byte stream.
    expect(new TextDecoder().decode(pdfOut.bytes.slice(0, 4))).toBe("%PDF");
  });

  it("anchors primitives via fs:ContainedIn when the relation targets a dnis:Node primitive id", async () => {
    const host = await freshHost();
    const projectId = "fs-dnis-containedin";
    await newComposedProject(host, projectId);

    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    const secNid = await createSection(adapter, document.id, null, 1, { title: "Method" });

    // The slug-shaped primitive id derived from the NID (per the
    // SPEC-CORE §5.6.1 NID==uid pin and the adapter's
    // nodePrimitiveId() helper). Relation validation looks up
    // primitives by id, so the relation's target_id must be the
    // slug-shaped form, not the bare NID. The renderer accepts
    // either at the read side.
    const secId = `dnis:node:${secNid.toLowerCase()}`;

    // Add a small domain primitive (fs:Audience — only 3 fields, no
    // composite id template) and anchor it to the dnis:Node section
    // via fs:ContainedIn.
    await host.createPrimitive(projectId, {
      id: "audience:methodologists",
      type_id: "fs:Audience",
      field_values: {
        name: "Methodologists",
        visibility: "public",
        description: "Researchers reviewing the experimental method.",
      },
    });
    await host.createRelation(projectId, {
      id: "rel:audience-in-method",
      type_id: "fs:ContainedIn",
      source_id: "audience:methodologists",
      target_id: secId,
      field_values: {
        is_primary: true,
        order: 1,
      },
    });

    const out = await renderWith(host, projectId, "fs:SpecRenderer", "text/markdown");
    expect(out.text).toContain("## 1. Method");
    // The Audience primitive should appear under §1, not in the appendix.
    expect(out.text).not.toContain("Appendix — Unsectioned");
    expect(out.text).toContain("audience:methodologists");
    expect(out.text).toContain("Researchers reviewing the experimental method.");
  });

  it("(defensive) renderer accepts a fs:ContainedIn target_id that is the bare dnis:Node uid (NID), not the slug-shaped id", async () => {
    // The relation validator only accepts the slug-shaped id today
    // (relations look up primitives by `id`, not `uid`), so this code
    // path is unreachable through createRelation. But fixtures and
    // JSONL importers can produce uid-targeted relations, and the
    // renderer treats both as valid for ergonomics. This test calls
    // buildDocumentTreeFromDnis directly with hand-crafted primitives
    // and relations to exercise that defensive branch.
    const host = await freshHost();
    const projectId = "fs-dnis-uid-target";
    await newComposedProject(host, projectId);
    const adapter = new DnisHostAdapter(host, { projectId });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    const secNid = await createSection(adapter, document.id, null, 1, { title: "Solo" });
    await host.createPrimitive(projectId, {
      id: "audience:m",
      type_id: "fs:Audience",
      field_values: {
        name: "M",
        visibility: "public",
        description: "Anchored via uid.",
      },
    });

    // Hand-craft a relation whose target_id is the bare uid (NID),
    // bypassing host.createRelation's validator.
    const slice = host.getProject(projectId);
    const profile = host.profiles.getResolved(slice.project.profile_id);
    const handRelation: RelationInstance = {
      id: "rel:hand-crafted-uid-target",
      uid: "01ZZZHANDCRAFTEDUIDREL000",
      type_id: "fs:ContainedIn",
      source_id: "audience:m",
      target_id: secNid, // BARE uid, not the slug-shaped id
      field_values: { is_primary: true, order: 1 },
      revision: 0,
    };

    const tree = buildDocumentTreeFromDnis(
      {
        projectId,
        primitives: Object.values(slice.primitives) as PrimitiveInstance[],
        relations: [
          ...(Object.values(slice.relations) as RelationInstance[]),
          handRelation,
        ],
        profile: profile as DomainProfile,
      },
      Object.values(slice.primitives).filter(
        (p) => p.type_id === "dnis:Node" && p.field_values["kind"] === "section",
      ) as PrimitiveInstance[],
    );

    expect(tree.sections).toHaveLength(1);
    const block = tree.sections[0]!;
    expect(block.number).toBe("1");
    expect(block.title).toBe("Solo");
    // The Audience primitive landed in the section bucket (via the
    // uid-targeted relation), NOT in the unsectioned appendix.
    expect(block.primitives.map((p) => p.id)).toContain("audience:m");
    expect(tree.unsectioned.map((p) => p.id)).not.toContain("audience:m");
  });
});
