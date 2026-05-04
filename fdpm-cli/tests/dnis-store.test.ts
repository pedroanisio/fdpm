import { describe, expect, it } from "vitest";
import { FDPMException } from "../src/core/errors/fdpm-exception.js";
import {
  InMemoryDnisStore,
  comparePositions,
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../src/core/dnis/index.js";

const AGENT = "agent:test" as AgentId;
const DOCUMENT_ID = "doc:test" as DocumentId;

describe("positionBetween", () => {
  it("creates positions before, between, and after existing neighbors", () => {
    const root = positionBetween(null, null);
    const before = positionBetween(null, root);
    const after = positionBetween(root, null);
    const between = positionBetween(root, after);

    expect(comparePositions(before, root)).toBeLessThan(0);
    expect(comparePositions(root, between)).toBeLessThan(0);
    expect(comparePositions(between, after)).toBeLessThan(0);
  });
});

describe("InMemoryDnisStore", () => {
  function newStore() {
    let tick = 0;
    let nodeCounter = 0;
    return new InMemoryDnisStore({
      now: () => `2026-05-04T12:00:0${tick++}.000Z`,
      mintId: () => `NODE${(++nodeCounter).toString().padStart(22, "0")}`,
    });
  }

  function createDocument(store: InMemoryDnisStore) {
    return store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
  }

  it("creates a node with revision 0 and a canonical content hash", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });

    const createResult = store.apply({
      id: "OPCREATE000000000000000001" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { b: 2, a: 1 },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });

    const node = store.getNode(createResult.affectedNodeIds[0]!);
    expect(node.revision).toBe(0);
    expect(node.derivedFrom).toEqual([]);
    expect(node.lastOperationId).toBe("OPCREATE000000000000000001");
    expect(node.contentHash).toMatch(/^sha256:/);
    expect(createResult.newRevisions[node.id]).toBe(0);
  });

  it("preserves identity on edit and returns the original snapshot on retry with mismatched payload", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const createResult = store.apply({
      id: "OPCREATE000000000000000002" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "before" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const nodeId = createResult.affectedNodeIds[0]!;

    const firstEdit = store.apply({
      id: "OPEDIT00000000000000000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: nodeId,
      expectedRevision: 0,
      payload: { content: { text: "after" } },
    });
    const edited = store.getNode(nodeId);
    expect(edited.id).toBe(nodeId);
    expect(edited.revision).toBe(1);
    expect(edited.content).toEqual({ text: "after" });

    const retried = store.apply({
      id: "OPEDIT00000000000000000001" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:30:00.000Z",
      targetNodeId: nodeId,
      expectedRevision: 1,
      payload: { content: { text: "WRONG" } },
    });
    const afterRetry = store.getNode(nodeId);
    expect(retried).toEqual(firstEdit);
    expect(afterRetry.content).toEqual({ text: "after" });
    expect(store.listPayloadMismatches()).toEqual([
      "OPEDIT00000000000000000001",
    ]);
  });

  it("moves only the target node and increments only its revision", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const first = store.apply({
      id: "OPCREATE000000000000000003" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "left" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const firstNodeId = first.affectedNodeIds[0]!;
    const second = store.apply({
      id: "OPCREATE000000000000000004" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "right" },
        parentNodeId: null,
        position: positionBetween(
          store.getNode(firstNodeId).position,
          null,
        ),
      },
    });
    const secondNodeId = second.affectedNodeIds[0]!;
    const destination = positionBetween(
      null,
      store.getNode(firstNodeId).position,
    );

    store.apply({
      id: "OPMOVE00000000000000000001" as OperationId,
      type: "move",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:02.000Z",
      targetNodeId: secondNodeId,
      expectedRevision: 0,
      payload: {
        newPosition: destination,
      },
    });

    const moved = store.getNode(secondNodeId);
    const untouched = store.getNode(firstNodeId);
    expect(moved.position).toBe(destination);
    expect(moved.revision).toBe(1);
    expect(untouched.revision).toBe(0);
    expect(untouched.position).not.toBe(destination);
    expect(comparePositions(moved.position, untouched.position)).toBeLessThan(0);
  });

  it("rejects stale writes with the current revision in evidence", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const created = store.apply({
      id: "OPCREATE000000000000000005" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "x" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const nodeId = created.affectedNodeIds[0]!;
    store.apply({
      id: "OPEDIT00000000000000000002" as OperationId,
      type: "edit",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: nodeId,
      expectedRevision: 0,
      payload: { content: { text: "y" } },
    });

    try {
      store.apply({
        id: "OPEDIT00000000000000000003" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: nodeId,
        expectedRevision: 0,
        payload: { content: { text: "z" } },
      });
      throw new Error("expected stale write rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(FDPMException);
      expect((error as FDPMException).category).toBe("conflict");
      expect((error as FDPMException).evidence).toMatchObject({ current_revision: 1 });
    }
  });

  it("splits a node into derived descendants and resolves the retired original directly", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const created = store.apply({
      id: "OPCREATE000000000000000006" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "alpha beta" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    });
    const originalId = created.affectedNodeIds[0]!;

    const split = store.apply({
      id: "OPSPLIT0000000000000000001" as OperationId,
      type: "split",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: originalId,
      expectedRevision: 0,
      payload: {
        parts: [{ content: { text: "alpha" } }, { content: { text: "beta" } }],
      },
    });

    expect(split.affectedNodeIds).toHaveLength(3);
    const resolvedOriginal = store.resolveReference(document.id, originalId);
    expect(resolvedOriginal.outcome).toBe("retired");
    if (resolvedOriginal.outcome !== "retired") throw new Error("expected retired");
    expect(resolvedOriginal.retired).toBe(true);

    const activeRootNodes = store.listActiveNodes(document.id);
    expect(activeRootNodes).toHaveLength(2);
    expect(activeRootNodes.every((node) => node.derivedFrom.includes(originalId))).toBe(true);
    expect(comparePositions(activeRootNodes[0]!.position, activeRootNodes[1]!.position)).toBeLessThan(0);
  });

  it("retires a node explicitly and distinguishes retired from not-found", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const seed = store.apply({
      id: "OPCREATE000000000000000007" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "one two" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    }).affectedNodeIds[0]!;

    store.apply({
      id: "OPRETIRE0000000000000000001" as OperationId,
      type: "retire",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: seed,
      expectedRevision: 0,
      payload: {},
    });

    const retired = store.resolveReference(document.id, seed);
    expect(retired.outcome).toBe("retired");
    const missing = store.resolveReference(
      document.id,
      "NODE9999999999999999999999" as NodeId,
    );
    expect(missing.outcome).toBe("not-found");
  });

  it("merges contiguous siblings and creates a new descendant with ordered lineage", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const first = store.apply({
      id: "OPCREATE000000000000000008" as OperationId,
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
    }).affectedNodeIds[0]!;
    const second = store.apply({
      id: "OPCREATE000000000000000009" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "b" },
        parentNodeId: null,
        position: positionBetween(store.getNode(first).position, null),
      },
    }).affectedNodeIds[0]!;

    const merge = store.apply({
      id: "OPMERGE0000000000000000002" as OperationId,
      type: "merge",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:02.000Z",
      targetNodeIds: [first, second],
      payload: {
        content: { text: "ab" },
        expectedRevisions: [0, 0],
      },
    });

    expect(merge.affectedNodeIds).toHaveLength(3);
    const active = store.listActiveNodes(document.id);
    expect(active).toHaveLength(1);
    expect(active[0]!.derivedFrom).toEqual([first, second]);
    expect(active[0]!.position).toBe(store.getNode(first).position);
    expect(store.resolveReference(document.id, first).outcome).toBe("retired");
  });

  it("compacts positions without changing revision or audit fields", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const first = store.apply({
      id: "OPCREATE000000000000000010" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "a" },
        parentNodeId: null,
        position: "5000.2500" as never,
      },
    }).affectedNodeIds[0]!;
    const second = store.apply({
      id: "OPCREATE000000000000000011" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "b" },
        parentNodeId: null,
        position: "5000.7500" as never,
      },
    }).affectedNodeIds[0]!;

    const beforeFirst = store.getNode(first);
    const beforeSecond = store.getNode(second);
    const compact = store.apply({
      id: "OPCOMPACT00000000000000001" as OperationId,
      type: "compact",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:05:00.000Z",
      targetNodeIds: [first, second],
      payload: {
        repositions: [
          { nodeId: first, newPosition: "2500" as never },
          { nodeId: second, newPosition: "7500" as never },
        ],
      },
    });

    const afterFirst = store.getNode(first);
    const afterSecond = store.getNode(second);
    expect(compact.newRevisions[first]).toBe(beforeFirst.revision);
    expect(compact.newRevisions[second]).toBe(beforeSecond.revision);
    expect(afterFirst.revision).toBe(beforeFirst.revision);
    expect(afterSecond.revision).toBe(beforeSecond.revision);
    expect(afterFirst.lastEditedAt).toBe(beforeFirst.lastEditedAt);
    expect(afterSecond.lastEditedAt).toBe(beforeSecond.lastEditedAt);
    expect(afterFirst.lastOperationId).toBe(beforeFirst.lastOperationId);
    expect(afterSecond.lastOperationId).toBe(beforeSecond.lastOperationId);
    expect(afterFirst.position).toBe("2500");
    expect(afterSecond.position).toBe("7500");
  });

  it("returns purged for a purged retired node with no active descendants", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const original = store.apply({
      id: "OPCREATE000000000000000012" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "alpha" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    }).affectedNodeIds[0]!;
    store.apply({
      id: "OPRETIRE0000000000000000002" as OperationId,
      type: "retire",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: original,
      expectedRevision: 0,
      payload: {},
    });

    store.purgeNode(document.id, original);

    const purged = store.resolveReference(document.id, original);
    expect(purged.outcome).toBe("purged");
    if (purged.outcome !== "purged") throw new Error("expected purged");
    expect(purged.tombstone.purged).toBe(true);
  });

  it("prefers evolved-via-lineage over purged when active descendants still exist", () => {
    const store = newStore();
    const document = store.createDocument({
      id: DOCUMENT_ID,
      createdBy: AGENT,
      schemaVersion: "0.1.5",
      hashAlgorithm: "sha256",
    });
    const seed = store.apply({
      id: "OPCREATE000000000000000013" as OperationId,
      type: "create",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:00.000Z",
      payload: {
        kind: "paragraph",
        content: { text: "one two" },
        parentNodeId: null,
        position: positionBetween(null, null),
      },
    }).affectedNodeIds[0]!;
    const firstSplit = store.apply({
      id: "OPSPLIT0000000000000000005" as OperationId,
      type: "split",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:01.000Z",
      targetNodeId: seed,
      expectedRevision: 0,
      payload: {
        parts: [{ content: { text: "one" } }, { content: { text: "two" } }],
      },
    });
    store.purgeNode(document.id, seed);

    const evolved = store.resolveReference(document.id, seed);
    expect(evolved.outcome).toBe("evolved-via-lineage");
    if (evolved.outcome !== "evolved-via-lineage") throw new Error("expected lineage result");
    expect(evolved.descendants.length).toBeGreaterThan(0);

    const child = firstSplit.affectedNodeIds[1]!;
    const secondSplit = store.apply({
      id: "OPSPLIT0000000000000000006" as OperationId,
      type: "split",
      documentId: document.id,
      agentId: AGENT,
      issuedAt: "2026-05-04T12:00:02.000Z",
      targetNodeId: child,
      expectedRevision: 0,
      payload: {
        parts: [{ content: { text: "o" } }, { content: { text: "ne" } }],
      },
    });
    store.purgeNode(document.id, child);

    const viaLineage = store.resolveReference(document.id, child);
    expect(viaLineage.outcome).toBe("evolved-via-lineage");
    if (viaLineage.outcome !== "evolved-via-lineage") throw new Error("expected lineage result");
    expect(viaLineage.descendants.length).toBeGreaterThan(0);
    expect(secondSplit.affectedNodeIds).toHaveLength(3);
  });

  describe("DNIS spec test vectors", () => {
    it("TV-1 preserves identity under edit", () => {
      const store = newStore();
      const document = createDocument(store);
      const created = store.apply({
        id: "TV1CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "before", meta: { b: 2, a: 1 } },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      });
      const nodeId = created.affectedNodeIds[0]!;
      const before = store.getNode(nodeId);

      store.apply({
        id: "TV1EDIT0000000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        targetNodeId: nodeId,
        expectedRevision: before.revision,
        payload: {
          content: { meta: { a: 1, b: 2 }, text: "after" },
        },
      });

      const after = store.getNode(nodeId);
      const resolved = store.resolveReference(document.id, nodeId);
      expect(after.id).toBe(nodeId);
      expect(after.content).toEqual({ meta: { a: 1, b: 2 }, text: "after" });
      expect(after.contentHash).toBe(
        "sha256:36d24cd3104d43addada00024439659e8542cce84ed72789f00d51c4b3a0b8ba",
      );
      expect(after.revision).toBe(before.revision + 1);
      expect(resolved.outcome).toBe("active");
      if (resolved.outcome !== "active") throw new Error("expected active resolution");
      expect(resolved.node.id).toBe(nodeId);
    });

    it("TV-2 returns the original operation snapshot on retry", () => {
      const store = newStore();
      const document = createDocument(store);
      const created = store.apply({
        id: "TV2CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "seed" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      });
      const nodeId = created.affectedNodeIds[0]!;
      const first = store.apply({
        id: "TV2EDIT0000000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        targetNodeId: nodeId,
        expectedRevision: 0,
        payload: {
          content: { text: "applied" },
        },
      });

      store.apply({
        id: "TV2FOLLOW000000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: nodeId,
        expectedRevision: 1,
        payload: {
          content: { text: "later-state" },
        },
      });

      const retried = store.apply({
        id: "TV2EDIT0000000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:30:00.000Z",
        targetNodeId: nodeId,
        expectedRevision: 2,
        payload: {
          content: { text: "ignored-on-retry" },
        },
      });

      expect(retried).toEqual(first);
      expect(retried.appliedAt).toBe(first.appliedAt);
      expect(store.getOperationResult(first.operationId)).toEqual(first);
      expect(store.listPayloadMismatches()).toContain(first.operationId);
      expect(store.getNode(nodeId).content).toEqual({ text: "later-state" });
    });

    it("TV-3 returns a retired node plus its descendants after split", () => {
      const store = newStore();
      const document = createDocument(store);
      const created = store.apply({
        id: "TV3CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "alpha beta" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      });
      const originalId = created.affectedNodeIds[0]!;

      const split = store.apply({
        id: "TV3SPLIT0000000000000000001" as OperationId,
        type: "split",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        targetNodeId: originalId,
        expectedRevision: 0,
        payload: {
          parts: [{ content: { text: "alpha" } }, { content: { text: "beta" } }],
        },
      });

      const firstPart = store.getNode(split.affectedNodeIds[1]!);
      const secondPart = store.getNode(split.affectedNodeIds[2]!);
      expect(firstPart.id).not.toBe(originalId);
      expect(secondPart.id).not.toBe(originalId);
      expect(firstPart.derivedFrom).toEqual([originalId]);
      expect(secondPart.derivedFrom).toEqual([originalId]);

      const resolved = store.resolveReference(document.id, originalId);
      expect(resolved.outcome).toBe("retired");
      if (resolved.outcome !== "retired") throw new Error("expected retired resolution");
      expect(resolved.retired).toBe(true);
      expect(resolved.node.id).toBe(originalId);
      expect(resolved.descendants?.map((node) => node.id)).toEqual([
        firstPart.id,
        secondPart.id,
      ]);
    });

    it("TV-4 keeps move locality limited to the target node", () => {
      const store = newStore();
      const document = createDocument(store);
      const leftId = store.apply({
        id: "TV4CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "left" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      }).affectedNodeIds[0]!;
      const targetId = store.apply({
        id: "TV4CREATE00000000000000002" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "target" },
          parentNodeId: null,
          position: positionBetween(store.getNode(leftId).position, null),
        },
      }).affectedNodeIds[0]!;
      const siblingBefore = store.getNode(leftId);
      const targetBefore = store.getNode(targetId);
      const destination = positionBetween(null, siblingBefore.position);

      store.apply({
        id: "TV4MOVE0000000000000000001" as OperationId,
        type: "move",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: targetId,
        expectedRevision: 0,
        payload: {
          newPosition: destination,
        },
      });

      const siblingAfter = store.getNode(leftId);
      const targetAfter = store.getNode(targetId);
      expect(targetAfter.parentNodeId).toBe(targetBefore.parentNodeId);
      expect(targetAfter.position).toBe(destination);
      expect(targetAfter.revision).toBe(targetBefore.revision + 1);
      expect(targetAfter.lastEditedAt).toBe("2026-05-04T12:00:02.000Z");
      expect(targetAfter.lastOperationId).toBe("TV4MOVE0000000000000000001");
      expect(targetAfter.content).toEqual(targetBefore.content);
      expect(siblingAfter).toEqual(siblingBefore);
    });

    it("TV-5 rejects stale writes without mutating state or recording a result", () => {
      const store = newStore();
      const document = createDocument(store);
      const nodeId = store.apply({
        id: "TV5CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "seed" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      }).affectedNodeIds[0]!;
      store.apply({
        id: "TV5EDIT00000000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        targetNodeId: nodeId,
        expectedRevision: 0,
        payload: {
          content: { text: "fresh" },
        },
      });
      const beforeRejected = store.getNode(nodeId);

      try {
        store.apply({
          id: "TV5STALE0000000000000000001" as OperationId,
          type: "edit",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:02.000Z",
          targetNodeId: nodeId,
          expectedRevision: beforeRejected.revision - 1,
          payload: {
            content: { text: "rejected" },
          },
        });
        throw new Error("expected stale write rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("conflict");
        expect((error as FDPMException).evidence).toMatchObject({
          current_revision: beforeRejected.revision,
        });
      }

      expect(store.getNode(nodeId)).toEqual(beforeRejected);
      expect(
        store.getOperationResult("TV5STALE0000000000000000001" as OperationId),
      ).toBeNull();
    });

    it("TV-6 preserves revision and per-node audit fields during compact", () => {
      const store = newStore();
      const document = createDocument(store);
      const firstId = store.apply({
        id: "TV6CREATE00000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "a" },
          parentNodeId: null,
          position: "5000.2500" as never,
        },
      }).affectedNodeIds[0]!;
      const secondId = store.apply({
        id: "TV6CREATE00000000000000002" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "b" },
          parentNodeId: null,
          position: "5000.7500" as never,
        },
      }).affectedNodeIds[0]!;
      const beforeFirst = store.getNode(firstId);
      const beforeSecond = store.getNode(secondId);

      const compact = store.apply({
        id: "TV6COMPACT00000000000000001" as OperationId,
        type: "compact",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:05.000Z",
        targetNodeIds: [firstId, secondId],
        payload: {
          repositions: [
            { nodeId: firstId, newPosition: "2500" as never },
            { nodeId: secondId, newPosition: "7500" as never },
          ],
        },
      });

      const afterFirst = store.getNode(firstId);
      const afterSecond = store.getNode(secondId);
      expect(compact.appliedAt).toBe(store.getOperationResult(compact.operationId)?.appliedAt);
      expect(afterFirst.id).toBe(beforeFirst.id);
      expect(afterSecond.id).toBe(beforeSecond.id);
      expect(afterFirst.revision).toBe(beforeFirst.revision);
      expect(afterSecond.revision).toBe(beforeSecond.revision);
      expect(afterFirst.lastEditedBy).toBe(beforeFirst.lastEditedBy);
      expect(afterSecond.lastEditedBy).toBe(beforeSecond.lastEditedBy);
      expect(afterFirst.lastEditedAt).toBe(beforeFirst.lastEditedAt);
      expect(afterSecond.lastEditedAt).toBe(beforeSecond.lastEditedAt);
      expect(afterFirst.lastOperationId).toBe(beforeFirst.lastOperationId);
      expect(afterSecond.lastOperationId).toBe(beforeSecond.lastOperationId);
      expect(afterFirst.position).toBe("2500");
      expect(afterSecond.position).toBe("7500");
      expect(afterFirst.content).toEqual(beforeFirst.content);
      expect(afterSecond.content).toEqual(beforeSecond.content);
      expect(afterFirst.lastOperationId).not.toBe(compact.operationId);
      expect(afterSecond.lastOperationId).not.toBe(compact.operationId);
    });

    it("TV-7 surfaces the full per-target revision array on stale merge rejection", () => {
      // SPEC-DNIS §10.1.2 Mode A requires the rejection signal to carry
      // "the per-target current revisions in the order corresponding to
      // targetNodeIds". A short-circuit-on-first-mismatch implementation
      // is non-conformant. This vector is the §5.6.6 conformance test
      // for that evidence-shape requirement.
      const store = newStore();
      const document = createDocument(store);

      const firstId = store.apply({
        id: "TV7CREATE000000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "left" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      }).affectedNodeIds[0]!;
      const secondId = store.apply({
        id: "TV7CREATE000000000000000002" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "middle" },
          parentNodeId: null,
          position: positionBetween(store.getNode(firstId).position, null),
        },
      }).affectedNodeIds[0]!;
      const thirdId = store.apply({
        id: "TV7CREATE000000000000000003" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "right" },
          parentNodeId: null,
          position: positionBetween(store.getNode(secondId).position, null),
        },
      }).affectedNodeIds[0]!;

      // Make the second AND third targets stale; first is still at rev 0.
      store.apply({
        id: "TV7EDIT0000000000000000002" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:03.000Z",
        targetNodeId: secondId,
        expectedRevision: 0,
        payload: { content: { text: "middle-fresh" } },
      });
      store.apply({
        id: "TV7EDIT0000000000000000003" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:04.000Z",
        targetNodeId: thirdId,
        expectedRevision: 0,
        payload: { content: { text: "right-fresh" } },
      });

      const firstBefore = store.getNode(firstId);
      const secondBefore = store.getNode(secondId);
      const thirdBefore = store.getNode(thirdId);

      try {
        store.apply({
          id: "TV7MERGE000000000000000001" as OperationId,
          type: "merge",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:05.000Z",
          targetNodeIds: [firstId, secondId, thirdId],
          payload: {
            content: { text: "joined" },
            expectedRevisions: [0, 0, 0],
          },
        });
        throw new Error("expected stale merge rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        const fdpm = error as FDPMException;
        expect(fdpm.category).toBe("conflict");
        // The evidence MUST carry the per-target current revisions in the
        // order corresponding to targetNodeIds. A short-circuit
        // implementation that only reported the first stale target would
        // omit firstId and thirdId here.
        expect(fdpm.evidence).toMatchObject({
          current_revisions: [
            firstBefore.revision,
            secondBefore.revision,
            thirdBefore.revision,
          ],
          target_node_ids: [firstId, secondId, thirdId],
        });
      }

      // No state mutated, no result recorded.
      expect(store.getNode(firstId)).toEqual(firstBefore);
      expect(store.getNode(secondId)).toEqual(secondBefore);
      expect(store.getNode(thirdId)).toEqual(thirdBefore);
      expect(
        store.getOperationResult("TV7MERGE000000000000000001" as OperationId),
      ).toBeNull();
      expect(store.listActiveNodes(document.id)).toHaveLength(3);
    });
  });

  describe("Level 2 concurrency proofs", () => {
    it("rejects stale move, split, and retire operations without recording results", () => {
      const store = newStore();
      const document = createDocument(store);

      const moveAnchorId = store.apply({
        id: "L2MOVEANCHOR000000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "anchor" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      }).affectedNodeIds[0]!;
      const moveTargetId = store.apply({
        id: "L2MOVETARGET00000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "move-target" },
          parentNodeId: null,
          position: positionBetween(store.getNode(moveAnchorId).position, null),
        },
      }).affectedNodeIds[0]!;
      store.apply({
        id: "L2MOVEFRESH0000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: moveTargetId,
        expectedRevision: 0,
        payload: { content: { text: "move-target-fresh" } },
      });
      const beforeStaleMove = store.getNode(moveTargetId);

      try {
        store.apply({
          id: "L2MOVEFAIL0000000000000001" as OperationId,
          type: "move",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:03.000Z",
          targetNodeId: moveTargetId,
          expectedRevision: 0,
          payload: {
            newPosition: positionBetween(null, store.getNode(moveAnchorId).position),
          },
        });
        throw new Error("expected stale move rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("conflict");
      }
      expect(store.getNode(moveTargetId)).toEqual(beforeStaleMove);
      expect(
        store.getOperationResult("L2MOVEFAIL0000000000000001" as OperationId),
      ).toBeNull();

      const splitTargetId = store.apply({
        id: "L2SPLITTARGET0000000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:04.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "split me" },
          parentNodeId: null,
          position: positionBetween(store.getNode(moveTargetId).position, null),
        },
      }).affectedNodeIds[0]!;
      store.apply({
        id: "L2SPLITFRESH000000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:05.000Z",
        targetNodeId: splitTargetId,
        expectedRevision: 0,
        payload: { content: { text: "split me now" } },
      });
      const beforeStaleSplit = store.getNode(splitTargetId);

      try {
        store.apply({
          id: "L2SPLITFAIL0000000000000001" as OperationId,
          type: "split",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:06.000Z",
          targetNodeId: splitTargetId,
          expectedRevision: 0,
          payload: {
            parts: [{ content: { text: "split" } }, { content: { text: "me" } }],
          },
        });
        throw new Error("expected stale split rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("conflict");
      }
      expect(store.getNode(splitTargetId)).toEqual(beforeStaleSplit);
      expect(
        store.getOperationResult("L2SPLITFAIL0000000000000001" as OperationId),
      ).toBeNull();

      const retireTargetId = store.apply({
        id: "L2RETIRETARGET000000000000" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:07.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "retire me" },
          parentNodeId: null,
          position: positionBetween(store.getNode(splitTargetId).position, null),
        },
      }).affectedNodeIds[0]!;
      store.apply({
        id: "L2RETIREFRESH00000000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:08.000Z",
        targetNodeId: retireTargetId,
        expectedRevision: 0,
        payload: { content: { text: "retire me later" } },
      });
      const beforeStaleRetire = store.getNode(retireTargetId);

      try {
        store.apply({
          id: "L2RETIREFAIL00000000000001" as OperationId,
          type: "retire",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:09.000Z",
          targetNodeId: retireTargetId,
          expectedRevision: 0,
          payload: {},
        });
        throw new Error("expected stale retire rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("conflict");
      }
      expect(store.getNode(retireTargetId)).toEqual(beforeStaleRetire);
      expect(
        store.getOperationResult("L2RETIREFAIL00000000000001" as OperationId),
      ).toBeNull();
    });

    it("rejects merge Mode A when expectedRevisions length does not match targets", () => {
      const store = newStore();
      const document = createDocument(store);
      const firstId = store.apply({
        id: "L2MERGECREATE0000000000001" as OperationId,
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
      }).affectedNodeIds[0]!;
      const secondId = store.apply({
        id: "L2MERGECREATE0000000000002" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "b" },
          parentNodeId: null,
          position: positionBetween(store.getNode(firstId).position, null),
        },
      }).affectedNodeIds[0]!;
      const beforeFirst = store.getNode(firstId);
      const beforeSecond = store.getNode(secondId);

      try {
        store.apply({
          id: "L2MERGELENFAIL0000000000001" as OperationId,
          type: "merge",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:02.000Z",
          targetNodeIds: [firstId, secondId],
          payload: {
            content: { text: "ab" },
            expectedRevisions: [0],
          },
        });
        throw new Error("expected merge length rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("verification");
      }

      expect(store.getNode(firstId)).toEqual(beforeFirst);
      expect(store.getNode(secondId)).toEqual(beforeSecond);
      expect(
        store.getOperationResult("L2MERGELENFAIL0000000000001" as OperationId),
      ).toBeNull();
    });

    it("rejects merge Mode A when any target revision is stale and leaves state untouched", () => {
      const store = newStore();
      const document = createDocument(store);
      const firstId = store.apply({
        id: "L2MERGESTALECREATE000000001" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:00.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "left" },
          parentNodeId: null,
          position: positionBetween(null, null),
        },
      }).affectedNodeIds[0]!;
      const secondId = store.apply({
        id: "L2MERGESTALECREATE000000002" as OperationId,
        type: "create",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:01.000Z",
        payload: {
          kind: "paragraph",
          content: { text: "right" },
          parentNodeId: null,
          position: positionBetween(store.getNode(firstId).position, null),
        },
      }).affectedNodeIds[0]!;
      store.apply({
        id: "L2MERGESTALEFRESH000000001" as OperationId,
        type: "edit",
        documentId: document.id,
        agentId: AGENT,
        issuedAt: "2026-05-04T12:00:02.000Z",
        targetNodeId: secondId,
        expectedRevision: 0,
        payload: { content: { text: "right-fresh" } },
      });
      const beforeFirst = store.getNode(firstId);
      const beforeSecond = store.getNode(secondId);

      try {
        store.apply({
          id: "L2MERGESTALEFAIL0000000001" as OperationId,
          type: "merge",
          documentId: document.id,
          agentId: AGENT,
          issuedAt: "2026-05-04T12:00:03.000Z",
          targetNodeIds: [firstId, secondId],
          payload: {
            content: { text: "joined" },
            expectedRevisions: [0, 0],
          },
        });
        throw new Error("expected stale merge rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FDPMException);
        expect((error as FDPMException).category).toBe("conflict");
        // Per SPEC-DNIS §10.1.2 Mode A (closed by TV-7), stale merge
        // rejection MUST surface the per-target current revisions in
        // `targetNodeIds` order — see the TV-7 vector for the
        // normative shape.
        expect((error as FDPMException).evidence).toMatchObject({
          current_revisions: [beforeFirst.revision, beforeSecond.revision],
          target_node_ids: [firstId, secondId],
          expected_revisions: [0, 0],
        });
      }

      expect(store.getNode(firstId)).toEqual(beforeFirst);
      expect(store.getNode(secondId)).toEqual(beforeSecond);
      expect(
        store.getOperationResult("L2MERGESTALEFAIL0000000001" as OperationId),
      ).toBeNull();
      expect(store.listActiveNodes(document.id)).toHaveLength(2);
    });
  });
});
