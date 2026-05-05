/**
 * Tiny demo: builds a fake "Cats Must Nap" SPEC as DNIS-Node primitives,
 * then dumps the resulting project slice as JSON.
 *
 * Run:
 *   FDPM_DATA_DIR=/tmp/fdpm-fake-cats npx tsx fdpm-cli/scripts/build-spec-fake-cats.ts
 *
 * Output: /tmp/fdpm-fake-cats/spec-fake-cats.primitives.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Host } from "../src/core/host.js";
import {
  DnisHostAdapter,
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../src/core/dnis/index.js";

const PROJECT_ID = "spec-fake-cats";
const PROFILE_ID = "profile:spec-authoring-dnis:0.1";
const AGENT = "agent:author" as AgentId;

async function createSection(
  adapter: DnisHostAdapter,
  documentId: DocumentId,
  parent: NodeId | null,
  index: number,
  content: { title: string; body_md?: string; dispatch_kind?: string },
): Promise<NodeId> {
  const opId = `OPCATS${String(index).padStart(20, "0")}` as OperationId;
  const siblings = adapter.listActiveNodes(documentId, parent);
  const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
  const position = positionBetween(last?.position ?? null, null);
  const result = await adapter.apply({
    id: opId,
    type: "create",
    documentId,
    agentId: AGENT,
    issuedAt: `2026-05-04T10:00:${String(index).padStart(2, "0")}.000Z`,
    payload: { kind: "section", content, parentNodeId: parent, position },
  });
  return result.affectedNodeIds[0]!;
}

async function main(): Promise<void> {
  const dataDir = process.env.FDPM_DATA_DIR ?? "/tmp/fdpm-fake-cats";
  mkdirSync(dataDir, { recursive: true });

  const host = new Host({
    dataDir,
    builtinDirs: [resolve(process.cwd(), "fdpm-cli/plugins")],
  });
  await host.load();

  await host.createProject({
    project_id: PROJECT_ID,
    name: "Cats Must Nap (fake demo)",
    profile_id: PROFILE_ID,
  });

  await host.createPrimitive(PROJECT_ID, {
    id: "spec:doc:fake-cats",
    type_id: "spec:Document",
    field_values: {
      title: "Cats Must Nap",
      spec_id: "spec:fake:cats:0.1",
      version: "0.1.0",
      status: "Draft",
      audience: "felines, owners",
      date: "2026-05-04",
      disclaimer_path: "../DISCLAIMER.md",
      pals_banner: false,
      generated_by: "build-spec-fake-cats.ts (manual demo fixture)",
    },
  });

  const adapter = new DnisHostAdapter(host, { projectId: PROJECT_ID });
  const document = await adapter.createDocument({
    createdBy: AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });

  let i = 0;
  const purpose = await createSection(adapter, document.id, null, ++i, {
    title: "Purpose",
    body_md: "Cats need naps. This spec mandates them.",
  });
  await createSection(adapter, document.id, purpose, ++i, {
    title: "Why naps",
    body_md: "Sleep deprivation causes hissing.",
  });
  await createSection(adapter, document.id, purpose, ++i, {
    title: "Out of scope",
    body_md: "Dogs.",
  });
  await createSection(adapter, document.id, null, ++i, {
    title: "Rules",
    body_md: "At least 14 hours of nap per day.",
  });

  const slice = host.getProject(PROJECT_ID);
  const dump = {
    project: slice.project,
    primitives: slice.primitives,
    relations: slice.relations,
  };

  const jsonPath = `${dataDir}/${PROJECT_ID}.primitives.json`;
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(dump, null, 2) + "\n");
  console.log(`wrote ${jsonPath}`);
  console.log(`  primitives: ${Object.keys(slice.primitives).length}`);
  console.log(`  relations:  ${Object.keys(slice.relations).length}`);

  const profile = host.profiles.getResolved(slice.project.profile_id);
  const out = await host.plugins.runRenderer(
    "text/markdown",
    {
      projectId: PROJECT_ID,
      project: slice.project,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile,
    },
    { rendererId: "spec:SpecMarkdownRenderer" },
  );

  const mdPath = `${dataDir}/${PROJECT_ID}.md`;
  writeFileSync(mdPath, new TextDecoder().decode(out.bytes));
  console.log(`wrote ${mdPath}`);
  console.log(`  findings: ${(out.findings ?? []).length}`);
  for (const f of out.findings ?? []) {
    console.log(`    [${f.expression ?? "?"}] ${f.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
