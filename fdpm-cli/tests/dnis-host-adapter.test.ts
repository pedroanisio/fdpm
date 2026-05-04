/**
 * SPEC-CORE §5.6.6 conformance fixture.
 *
 * Exercises TV-1..TV-7 against a real Host with the built-in
 * `profile:dnis:0.1` profile activated, where DNIS Operations are
 * applied through DnisHostAdapter (not InMemoryDnisStore directly).
 * The adapter materialises every Operation as one or more SPEC-CORE
 * primitive/relation entries on the op log; this test asserts both
 * the SPEC-DNIS-level outcome AND the SPEC-CORE-level shape (op-log
 * kinds, causation_op_id chaining, primitive contents).
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Host } from "../src/core/host.js";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import {
  DnisHostAdapter,
  DNIS_HOST_ADAPTER_TYPES,
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../src/core/dnis/index.js";

const AGENT = "agent:test" as AgentId;

async function freshHost(): Promise<Host> {
  const host = new Host({
    dataDir: null,
    builtinDirs: [resolve(process.cwd(), "plugins")],
  });
  await host.load();
  return host;
}

async function newDnisProject(host: Host, project_id: string): Promise<void> {
  await host.createProject({
    project_id,
    name: project_id,
    profile_id: "profile:dnis:0.1",
  });
}

async function setupAdapter(): Promise<{
  host: Host;
  adapter: DnisHostAdapter;
  document: { id: DocumentId };
  projectId: string;
}> {
  const host = await freshHost();
  const projectId = "test-dnis";
  await newDnisProject(host, projectId);
  const adapter = new DnisHostAdapter(host, { projectId });
  const document = await adapter.createDocument({
    id: "DOC0000000000000000000001" as DocumentId,
    createdBy: AGENT,
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
  });
  return { host, adapter, document, projectId };
}

describe("DnisHostAdapter — SPEC-CORE §5.6.6 conformance", () => {
  it("registers profile:dnis:0.1 and persists dnis:Document on createDocument", async () => {
    const { host, document, projectId } = await setupAdapter();
    const slice = host.getProject(projectId);
    const docPrimitiveId = DNIS_HOST_ADAPTER_TYPES.documentPrimitiveId(document.id);
    const docPrim = slice.primitives[docPrimitiveId];
    expect(docPrim).toBeDefined();
    expect(docPrim!.type_id).toBe("dnis:Document");
    expect(docPrim!.field_values["schema_version"]).toBe("0.1.7");
    expect(docPrim!.field_values["hash_algorithm"]).toBe("sha256");
  });

  it("TV-1 (host-adapter) preserves identity under edit and emits a primitive.replace op-log entry", async () => {
    const { host, adapter, document, projectId } = await setupAdapter();
    const created = await adapter.apply({
      id: "OPCREATEHOSTTV10000000001A" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "v1" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const nodeId = created.affectedNodeIds[0]!;
    const beforeHash = adapter.getNode(nodeId).contentHash;

    const edited = await adapter.apply({
      id: "OPEDITHOSTTV10000000000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: nodeId,
      expectedRevision: 0,
      payload: { content: { text: "v2" } },
    });

    const after = adapter.getNode(nodeId);
    expect(after.id).toBe(nodeId);
    expect(after.content).toEqual({ text: "v2" });
    expect(after.contentHash).not.toBe(beforeHash);
    expect(after.revision).toBe(1);
    expect(edited.affectedNodeIds).toEqual([nodeId]);

    const log = host.store.getOperationLog(projectId);
    const replaceOps = log.filter((op) => op.kind === "primitive.replace");
    expect(replaceOps).toHaveLength(1);
    expect(replaceOps[0]!.payload).toMatchObject({
      type_id: "dnis:Node",
    });
  });

  it("TV-3 (host-adapter) materialises split as one replace + N create + N derived-from relations sharing causation_op_id", async () => {
    const { host, adapter, document, projectId } = await setupAdapter();
    const created = await adapter.apply({
      id: "OPCREATEHOSTTV30000000001A" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "left right" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const originalId = created.affectedNodeIds[0]!;
    const logBeforeSplit = host.store.getOperationLog(projectId).length;

    const split = await adapter.apply({
      id: "OPSPLITHOSTTV3000000000001" as OperationId,
      type: "split",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: originalId,
      expectedRevision: 0,
      payload: {
        parts: [{ content: { text: "left" } }, { content: { text: "right" } }],
      },
    });
    expect(split.affectedNodeIds).toHaveLength(3); // retired + 2 new
    const [retiredId, p1Id, p2Id] = split.affectedNodeIds as [NodeId, NodeId, NodeId];
    expect(retiredId).toBe(originalId);

    // SPEC-DNIS lineage walk works through the adapter (cache-side).
    const resolution = adapter.resolveReference(document.id, originalId);
    expect(resolution.outcome).toBe("retired");
    expect(adapter.getNode(p1Id).derivedFrom).toEqual([originalId]);
    expect(adapter.getNode(p2Id).derivedFrom).toEqual([originalId]);

    // SPEC-CORE op-log shape: 1 replace (retire) + 2 creates + 2 relation.creates,
    // all under one shared causation_op_id (= the lead op_id).
    const log = host.store.getOperationLog(projectId);
    const splitEntries = log.slice(logBeforeSplit);
    expect(splitEntries).toHaveLength(5);
    expect(splitEntries.filter((o) => o.kind === "primitive.replace")).toHaveLength(1);
    expect(splitEntries.filter((o) => o.kind === "primitive.create")).toHaveLength(2);
    expect(splitEntries.filter((o) => o.kind === "relation.create")).toHaveLength(2);
    const leadId = splitEntries[0]!.op_id;
    expect(splitEntries[0]!.causation_op_id).toBeNull();
    for (const entry of splitEntries.slice(1)) {
      expect(entry.causation_op_id).toBe(leadId);
    }
    // request_id MUST be shared across the batch.
    const reqId = splitEntries[0]!.request_id;
    for (const entry of splitEntries) {
      expect(entry.request_id).toBe(reqId);
    }
    // dnis:DerivedFrom relations point descendant → ancestor.
    const derivedRels = splitEntries.filter((o) => o.kind === "relation.create");
    for (const rel of derivedRels) {
      expect(rel.payload).toMatchObject({
        type_id: "dnis:DerivedFrom",
        target_id: DNIS_HOST_ADAPTER_TYPES.nodePrimitiveId(originalId),
      });
    }
  });

  it("TV-5 (host-adapter) rejects stale edit and records no op-log entry", async () => {
    const { host, adapter, document, projectId } = await setupAdapter();
    const created = await adapter.apply({
      id: "OPCREATEHOSTTV50000000001A" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "v1" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const nodeId = created.affectedNodeIds[0]!;
    // Bump revision so the next edit sees expectedRevision mismatch.
    await adapter.apply({
      id: "OPEDITHOSTTV5FRESH00000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: nodeId,
      expectedRevision: 0,
      payload: { content: { text: "v2-fresh" } },
    });
    const logBeforeStale = host.store.getOperationLog(projectId).length;

    await expect(
      adapter.apply({
        id: "OPEDITHOSTTV5STALE00000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: nodeId,
        expectedRevision: 0, // stale
        payload: { content: { text: "v2-stale" } },
      }),
    ).rejects.toBeInstanceOf(FDPMException);

    // No new op-log entries; no recorded result.
    expect(host.store.getOperationLog(projectId).length).toBe(logBeforeStale);
    expect(adapter.getOperationResult("OPEDITHOSTTV5STALE00000001" as OperationId)).toBeNull();
  });

  it("TV-7 (host-adapter) surfaces ordered per-target evidence on stale merge", async () => {
    const { host, adapter, document, projectId } = await setupAdapter();
    const a = (
      await adapter.apply({
        id: "OPCREATEHOSTTV70000000001A" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "a" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      })
    ).affectedNodeIds[0]!;
    const b = (
      await adapter.apply({
        id: "OPCREATEHOSTTV70000000002A" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "b" },
          parentNodeId: null,
          position: positionBetween(adapter.getNode(a).position, null),
        },
      })
    ).affectedNodeIds[0]!;
    const c = (
      await adapter.apply({
        id: "OPCREATEHOSTTV70000000003A" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "c" },
          parentNodeId: null,
          position: positionBetween(adapter.getNode(b).position, null),
        },
      })
    ).affectedNodeIds[0]!;

    // Bump b and c's revisions so the merge sees stale on both.
    await adapter.apply({
      id: "OPEDITHOSTTV7BUMPB00000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:03.000Z",
      targetNodeId: b,
      expectedRevision: 0,
      payload: { content: { text: "b-fresh" } },
    });
    await adapter.apply({
      id: "OPEDITHOSTTV7BUMPC00000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:04.000Z",
      targetNodeId: c,
      expectedRevision: 0,
      payload: { content: { text: "c-fresh" } },
    });
    const logBeforeStale = host.store.getOperationLog(projectId).length;
    const aRev = adapter.getNode(a).revision;
    const bRev = adapter.getNode(b).revision;
    const cRev = adapter.getNode(c).revision;

    try {
      await adapter.apply({
        id: "OPMERGEHOSTTV70000000000001" as OperationId,
        type: "merge",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:05.000Z",
        targetNodeIds: [a, b, c],
        payload: {
          content: { text: "abc" },
          expectedRevisions: [0, 0, 0],
        },
      });
      throw new Error("expected stale merge rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(FDPMException);
      const fdpm = err as FDPMException;
      expect(fdpm.category).toBe("conflict");
      // Per SPEC-DNIS §10.1.2 Mode A the evidence MUST carry the per-
      // target current revisions in `targetNodeIds` order.
      expect(fdpm.evidence).toMatchObject({
        current_revisions: [aRev, bRev, cRev],
        target_node_ids: [a, b, c],
        expected_revisions: [0, 0, 0],
      });
    }

    // No host op-log entries written for the rejected merge.
    expect(host.store.getOperationLog(projectId).length).toBe(logBeforeStale);
  });

  it("idempotency: re-applying the same OperationId does not append again", async () => {
    const { host, adapter, document, projectId } = await setupAdapter();
    const op = {
      id: "OPIDEMPOTENT0000000000001A" as OperationId,
      type: "create" as const,
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "once" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    };
    const first = await adapter.apply(op);
    const logAfterFirst = host.store.getOperationLog(projectId).length;
    const second = await adapter.apply(op);
    expect(second).toEqual(first);
    expect(host.store.getOperationLog(projectId).length).toBe(logAfterFirst);
  });
});
