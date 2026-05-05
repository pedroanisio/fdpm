/**
 * `fdpm dnis edit` / `fdpm dnis move` CLI surface + adapter rehydration.
 *
 * Covers:
 *   - hydrate(): a fresh DnisHostAdapter created in a separate process-
 *     equivalent (separate adapter instance, same Host) reconstructs
 *     its in-memory cache from the projected dnis:Document/dnis:Node
 *     primitives. This is the path every CLI invocation takes.
 *   - dnis edit: applies a SPEC-DNIS edit Operation, bumps revision,
 *     rewrites the node's content, surfaces optimistic-concurrency
 *     failures via expectedRevision.
 *   - dnis move: places the moved node under a new parent at a position
 *     computed from --after / --before sibling pointers, with --parent
 *     overriding the sibling-inferred parent.
 *
 * The harness re-uses the existing DnisHostAdapter to build the
 * fixture (so we have stable NodeIds to script against) and then
 * drives the CLI through commander's parseAsync against a freshly
 * constructed adapter inside the command's action — exactly the
 * code path the binary takes.
 */
import { resolve } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import { buildDnisCommand } from "../src/commands/dnis.js";
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

async function newProject(host: Host, projectId: string): Promise<void> {
  await host.createProject({
    project_id: projectId,
    name: projectId,
    profile_id: PROFILE,
  });
  // The spec-authoring-dnis profile requires a spec:Document to render,
  // but neither the adapter API nor the CLI subcommands depend on it.
  // Skipping it keeps the fixture minimal.
}

interface BuiltSection {
  nodeId: NodeId;
}

async function createSection(
  adapter: DnisHostAdapter,
  documentId: DocumentId,
  parent: NodeId | null,
  index: number,
  content: { title: string; body_md?: string },
): Promise<BuiltSection> {
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
  return { nodeId: result.affectedNodeIds[0]! };
}

interface Fixture {
  host: Host;
  projectId: string;
  documentId: DocumentId;
  purpose: NodeId;
  why: NodeId;
  scope: NodeId;
  rules: NodeId;
}

async function buildFixture(projectId: string): Promise<Fixture> {
  const host = await freshHost();
  await newProject(host, projectId);
  const adapter = new DnisHostAdapter(host, { projectId });
  const document = await adapter.createDocument({
    createdBy: AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });
  const purpose = await createSection(adapter, document.id, null, 1, {
    title: "Purpose",
    body_md: "Cats need naps.",
  });
  const why = await createSection(adapter, document.id, purpose.nodeId, 2, {
    title: "Why naps",
    body_md: "Sleep deprivation causes hissing.",
  });
  const scope = await createSection(adapter, document.id, purpose.nodeId, 3, {
    title: "Out of scope",
    body_md: "Dogs.",
  });
  const rules = await createSection(adapter, document.id, null, 4, {
    title: "Rules",
    body_md: "At least 14 hours of nap per day.",
  });
  return {
    host,
    projectId,
    documentId: document.id,
    purpose: purpose.nodeId,
    why: why.nodeId,
    scope: scope.nodeId,
    rules: rules.nodeId,
  };
}

async function runDnis(host: Host, args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  program.addCommand(buildDnisCommand(host));
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  await program.parseAsync(["node", "fdpm", "dnis", ...args]);
}

describe("DnisHostAdapter.hydrate", () => {
  it("rebuilds the cache from projected dnis:Document and dnis:Node primitives", async () => {
    const fx = await buildFixture("hydrate-basic");

    // A fresh adapter against the same Host starts with an empty cache.
    const fresh = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    expect(() => fresh.getDocument(fx.documentId)).toThrow(FDPMException);
    expect(fresh.listActiveNodes(fx.documentId, null)).toHaveLength(0);

    fresh.hydrate();

    // Document round-trips.
    const doc = fresh.getDocument(fx.documentId);
    expect(doc.id).toBe(fx.documentId);
    expect(doc.schemaVersion).toBe("0.1.7");
    expect(doc.hashAlgorithm).toBe("sha256");

    // Root nodes ordered by SPEC-DNIS Position.
    const roots = fresh.listActiveNodes(fx.documentId, null);
    expect(roots.map((n) => n.id)).toEqual([fx.purpose, fx.rules]);

    // Children of Purpose ordered by Position.
    const children = fresh.listActiveNodes(fx.documentId, fx.purpose);
    expect(children.map((n) => n.id)).toEqual([fx.why, fx.scope]);

    // Body content survived the JSON round-trip through field_values.
    const why = fresh.getNode(fx.why);
    expect(why.content).toEqual({
      title: "Why naps",
      body_md: "Sleep deprivation causes hissing.",
    });
    expect(why.parentNodeId).toBe(fx.purpose);
    expect(why.revision).toBe(0);
  });

  it("is idempotent — calling hydrate twice does not duplicate or corrupt nodes", async () => {
    const fx = await buildFixture("hydrate-idempotent");
    const fresh = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    fresh.hydrate();
    fresh.hydrate();
    const roots = fresh.listActiveNodes(fx.documentId, null);
    expect(roots).toHaveLength(2);
    const children = fresh.listActiveNodes(fx.documentId, fx.purpose);
    expect(children).toHaveLength(2);
  });
});

describe("fdpm dnis edit", () => {
  it("rewrites a node's content and bumps its revision", async () => {
    const fx = await buildFixture("edit-basic");
    await runDnis(fx.host, [
      "edit",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.why,
      "--agent",
      "agent:operator",
      "--content",
      JSON.stringify({
        title: "Why naps",
        body_md: "Sleep-deprived cats hiss, scratch furniture, refuse treats.",
      }),
      "--expected-revision",
      "0",
    ]);

    const adapter = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter.hydrate();
    const why = adapter.getNode(fx.why);
    expect(why.revision).toBe(1);
    expect(why.content).toEqual({
      title: "Why naps",
      body_md: "Sleep-deprived cats hiss, scratch furniture, refuse treats.",
    });
  });

  it("rejects --content that is not valid JSON with a verification exception", async () => {
    const fx = await buildFixture("edit-bad-json");
    await expect(
      runDnis(fx.host, [
        "edit",
        fx.projectId,
        "--document",
        fx.documentId,
        "--node",
        fx.why,
        "--agent",
        "agent:operator",
        "--content",
        "{not json",
      ]),
    ).rejects.toThrow(/--content is not valid JSON/);
  });

  it("rejects an edit when --expected-revision does not match the current revision", async () => {
    const fx = await buildFixture("edit-stale-rev");
    await expect(
      runDnis(fx.host, [
        "edit",
        fx.projectId,
        "--document",
        fx.documentId,
        "--node",
        fx.why,
        "--agent",
        "agent:operator",
        "--content",
        JSON.stringify({ title: "x", body_md: "y" }),
        "--expected-revision",
        "99",
      ]),
    ).rejects.toThrow();
    // Node is unchanged.
    const adapter = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter.hydrate();
    expect(adapter.getNode(fx.why).revision).toBe(0);
  });
});

describe("fdpm dnis move", () => {
  it("--after places the node immediately after the named sibling under that sibling's parent", async () => {
    // Move 'Out of scope' (under Purpose) to root, after 'Rules'.
    const fx = await buildFixture("move-after-root");
    await runDnis(fx.host, [
      "move",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.scope,
      "--agent",
      "agent:operator",
      "--after",
      fx.rules,
    ]);

    const adapter = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter.hydrate();

    // Purpose's children: only 'Why naps' remains.
    expect(adapter.listActiveNodes(fx.documentId, fx.purpose).map((n) => n.id)).toEqual([
      fx.why,
    ]);
    // Roots: Purpose, Rules, Out of scope (in that order).
    expect(adapter.listActiveNodes(fx.documentId, null).map((n) => n.id)).toEqual([
      fx.purpose,
      fx.rules,
      fx.scope,
    ]);
    // Moved node's parent reflects the change.
    expect(adapter.getNode(fx.scope).parentNodeId).toBeNull();
    expect(adapter.getNode(fx.scope).revision).toBe(1);
  });

  it("--before places the node immediately before the named sibling under that sibling's parent", async () => {
    // Move 'Rules' to be under Purpose, before 'Why naps'.
    const fx = await buildFixture("move-before-child");
    await runDnis(fx.host, [
      "move",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.rules,
      "--agent",
      "agent:operator",
      "--before",
      fx.why,
    ]);

    const adapter = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter.hydrate();
    expect(adapter.listActiveNodes(fx.documentId, fx.purpose).map((n) => n.id)).toEqual([
      fx.rules,
      fx.why,
      fx.scope,
    ]);
    expect(adapter.getNode(fx.rules).parentNodeId).toBe(fx.purpose);
  });

  it("--parent overrides the sibling-inferred parent and falls back to append-to-end", async () => {
    // --after points at 'Why naps' (parent=Purpose), --parent says root.
    // Override semantics: the node lands at root, not under Purpose, and
    // the sibling pointer is dropped (placing it after a child of a
    // different parent has no SPEC-DNIS-§6 meaning).
    const fx = await buildFixture("move-parent-override");
    await runDnis(fx.host, [
      "move",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.scope,
      "--agent",
      "agent:operator",
      "--after",
      fx.why,
      // No --parent: would land under Purpose, between Why and (end).
      // We test the override below in a second call, not here, so this
      // first call confirms baseline inference.
    ]);
    const adapter = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter.hydrate();
    expect(adapter.getNode(fx.scope).parentNodeId).toBe(fx.purpose);
    // Order under Purpose: Why naps, Out of scope (Out of scope was
    // already after Why naps; this --after just confirms idempotent
    // placement).
    expect(adapter.listActiveNodes(fx.documentId, fx.purpose).map((n) => n.id)).toEqual([
      fx.why,
      fx.scope,
    ]);

    // Now: same --after, but --parent=<root> wins.
    await runDnis(fx.host, [
      "move",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.scope,
      "--agent",
      "agent:operator",
      "--after",
      fx.why,
      // No --parent flag → root via the existing default. Re-issue with
      // an explicit non-matching parent: pick 'Rules' as the new parent.
    ]);
    // Issue the override explicitly:
    await runDnis(fx.host, [
      "move",
      fx.projectId,
      "--document",
      fx.documentId,
      "--node",
      fx.scope,
      "--agent",
      "agent:operator",
      "--after",
      fx.why,
      "--parent",
      fx.rules,
    ]);

    const adapter2 = new DnisHostAdapter(fx.host, { projectId: fx.projectId });
    adapter2.hydrate();
    // Scope now lives under Rules, not under Purpose.
    expect(adapter2.getNode(fx.scope).parentNodeId).toBe(fx.rules);
    expect(adapter2.listActiveNodes(fx.documentId, fx.rules).map((n) => n.id)).toEqual([
      fx.scope,
    ]);
    expect(adapter2.listActiveNodes(fx.documentId, fx.purpose).map((n) => n.id)).toEqual([
      fx.why,
    ]);
  });

  it("rejects --after and --before pointing at siblings under different parents", async () => {
    const fx = await buildFixture("move-sibling-mismatch");
    await expect(
      runDnis(fx.host, [
        "move",
        fx.projectId,
        "--document",
        fx.documentId,
        "--node",
        fx.scope,
        "--agent",
        "agent:operator",
        "--after",
        fx.why, // parent=Purpose
        "--before",
        fx.rules, // parent=<root>
      ]),
    ).rejects.toThrow(/--after and --before reference siblings under different parents/);
  });
});
