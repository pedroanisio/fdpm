/**
 * Body_md template evaluation in spec:SpecMarkdownRenderer
 * (SPEC-RENDER-DSL v0.1.7 — opt-in via `content.eval_body: true`).
 *
 * Three contracts:
 *   1. Default off: a dnis:Node body_md with `${doc.title}` literal
 *      renders verbatim — preserves byte-equal output for SPECs whose
 *      prose contains literal `${…}` documentation.
 *   2. Opt-in: with `content.eval_body: true`, the body is evaluated;
 *      `${doc.title}` resolves to the spec:Document's title;
 *      `${fn.section_of("section:foo")}` resolves to the §-number.
 *   3. Findings forwarded: parse/runtime errors inside an eval'd body
 *      surface as render findings (NOT silent corruption).
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
const PROFILE = "profile:spec-authoring-dnis:0.1";

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

async function newProject(host: Host, projectId: string, docTitle: string): Promise<void> {
  await host.createProject({
    project_id: projectId,
    name: projectId,
    profile_id: PROFILE,
  });
  await host.createPrimitive(projectId, {
    id: "spec:doc:fixture",
    type_id: "spec:Document",
    field_values: {
      title: docTitle,
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
}

interface SectionContent {
  title: string;
  body_md?: string;
  ref_slug?: string;
  eval_body?: boolean;
}

async function createSection(
  adapter: DnisHostAdapter,
  documentId: DocumentId,
  parent: NodeId | null,
  index: number,
  content: SectionContent,
): Promise<NodeId> {
  const opId = `OPBE${String(index).padStart(21, "0")}A` as OperationId;
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
  return result.affectedNodeIds[0]!;
}

async function renderText(host: Host, projectId: string): Promise<{
  text: string;
  findings: ReadonlyArray<{ message: string; expression?: string }>;
}> {
  const slice = host.getProject(projectId);
  const profile = host.profiles.getResolved(slice.project.profile_id);
  const out = await host.plugins.runRenderer(
    "text/markdown",
    {
      projectId,
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
    findings: (out.findings ?? []) as ReadonlyArray<{
      message: string;
      expression?: string;
    }>,
  };
}

describe("spec:SpecMarkdownRenderer — body_md template evaluation", () => {
  it("default eval_body=false emits body_md verbatim (literal ${doc.title} survives)", async () => {
    const host = await freshHost();
    await newProject(host, "test-be-default-off", "Doc title");
    const adapter = new DnisHostAdapter(host, { projectId: "test-be-default-off" });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, {
      title: "Literal placeholders",
      body_md:
        "Authors writing CEL examples want `${doc.title}` to render literally.",
    });
    const { text, findings } = await renderText(host, "test-be-default-off");
    expect(text).toContain(
      "Authors writing CEL examples want `${doc.title}` to render literally.",
    );
    // `Doc title` is the spec:Document's title, which appears in the
    // rendered output as the H1 — but it MUST NOT appear inside the
    // section's body_md (which would mean the placeholder got
    // evaluated despite eval_body being false).
    expect(text).not.toContain("Authors writing CEL examples want `Doc title`");
    expect(
      findings.filter((f) => f.expression?.startsWith("spec:render:dnis-section")),
    ).toHaveLength(0);
  });

  it("opt-in eval_body=true resolves ${doc.title} to the spec:Document's title", async () => {
    const host = await freshHost();
    await newProject(host, "test-be-opt-in", "Resolved title");
    const adapter = new DnisHostAdapter(host, { projectId: "test-be-opt-in" });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, {
      title: "Templated section",
      // Note: under the current activation surface the spec:Document's
      // user-authored fields live under `doc.fields.*` (matching the
      // existing template-driven References path; see
      // renderReferencesWithTemplate's REFERENCE_ITEM_TEMPLATE which
      // uses doc.fields.citation). The bare `${doc.title}` would
      // surface as an unknown-name render-error.
      body_md: "The document is titled `${doc.fields.title}`.",
      eval_body: true,
    });
    const { text, findings } = await renderText(host, "test-be-opt-in");
    expect(text).toContain("The document is titled `Resolved title`.");
    expect(text).not.toContain("The document is titled `${doc.fields.title}`.");
    expect(findings).toHaveLength(0);
  });

  it("eval_body=true plus slug-keyed section_index resolves ${fn.section_of(\"section:other\")}", async () => {
    const host = await freshHost();
    await newProject(host, "test-be-section-of", "Body eval + section_of");
    const adapter = new DnisHostAdapter(host, { projectId: "test-be-section-of" });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    // §1: prose that references §2 by slug.
    await createSection(adapter, document.id, null, 1, {
      title: "Cross-reference test",
      body_md:
        "This section references the next one via slug: see §${fn.section_of(\"section:target\")} for the goods.",
      eval_body: true,
    });
    // §2: the target. Author-supplied ref_slug pins the handle.
    await createSection(adapter, document.id, null, 2, {
      title: "Goods",
      body_md: "The goods.",
      ref_slug: "target",
    });
    const { text, findings } = await renderText(host, "test-be-section-of");
    expect(text).toContain("This section references the next one via slug: see §2 for the goods.");
    expect(text).not.toContain("${fn.section_of");
    expect(findings).toHaveLength(0);
  });

  it("eval_body=true with an unknown section slug surfaces a render-error finding (not silent empty)", async () => {
    const host = await freshHost();
    await newProject(host, "test-be-bad-ref", "Bad ref");
    const adapter = new DnisHostAdapter(host, { projectId: "test-be-bad-ref" });
    const document = await adapter.createDocument({
      createdBy: AGENT,
      schemaVersion: "0.1.7",
      hashAlgorithm: "sha256",
    });
    await createSection(adapter, document.id, null, 1, {
      title: "Broken reference",
      body_md: "see §${fn.section_of(\"section:does-not-exist\")}.",
      eval_body: true,
    });
    const { text, findings } = await renderText(host, "test-be-bad-ref");
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const matching = findings.find((f) =>
      f.message.includes("fn.section_of") && f.message.includes("section:does-not-exist"),
    );
    expect(matching).toBeDefined();
    // The default error policy emits inline markers per Principle 4
    // (no silent empty strings).
    expect(text).not.toContain("see §.");
    expect(text).toContain("render-error");
  });
});
