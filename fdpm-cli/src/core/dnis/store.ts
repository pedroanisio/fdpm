import { createHash } from "node:crypto";
import { FDPMException } from "../errors/fdpm-exception.js";
import { mintUid } from "../identity/uid.js";
import {
  comparePositions,
  isValidPosition,
  positionBetween,
} from "./position.js";
import type {
  AgentId,
  ContentHash,
  CreateDocumentInput,
  DnisOperation,
  Document,
  DocumentId,
  DnisHashAlgorithm,
  Node,
  NodeId,
  OperationId,
  OperationResult,
  Position,
  ReferenceResolution,
} from "./types.js";

export interface DnisStoreOptions {
  now?: () => string;
  mintId?: () => string;
}

type RecordedResult = {
  operation: DnisOperation;
  result: OperationResult;
};

type PurgeTombstone = {
  id: NodeId;
  documentId: DocumentId;
  purged: true;
  retiredAt?: string;
  retiredBy?: AgentId;
};

export class InMemoryDnisStore {
  private readonly now: () => string;
  private readonly mintId: () => string;
  private readonly documents = new Map<DocumentId, Document>();
  private readonly nodes = new Map<NodeId, Node>();
  private readonly results = new Map<OperationId, RecordedResult>();
  private readonly payloadMismatches = new Set<OperationId>();
  private readonly purged = new Map<NodeId, PurgeTombstone>();

  constructor(opts: DnisStoreOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.mintId = opts.mintId ?? mintUid;
  }

  createDocument(input: CreateDocumentInput): Document {
    const id = (input.id ?? this.mintId()) as DocumentId;
    if (this.documents.has(id)) {
      throw new FDPMException("conflict", `document already exists: ${id}`);
    }
    const createdAt = input.createdAt ?? this.now();
    const document: Document = {
      id,
      createdAt,
      createdBy: input.createdBy,
      schemaVersion: input.schemaVersion,
      hashAlgorithm: input.hashAlgorithm,
      metadata: structuredClone(input.metadata ?? {}),
    };
    this.documents.set(id, document);
    return structuredClone(document);
  }

  getDocument(id: DocumentId): Document {
    const document = this.documents.get(id);
    if (!document) throw new FDPMException("not_found", `document not found: ${id}`);
    return structuredClone(document);
  }

  getNode(id: NodeId): Node {
    const node = this.nodes.get(id);
    if (!node) throw new FDPMException("not_found", `node not found: ${id}`);
    return structuredClone(node);
  }

  getOperationResult(id: OperationId): OperationResult | null {
    return this.results.has(id) ? structuredClone(this.results.get(id)!.result) : null;
  }

  listPayloadMismatches(): OperationId[] {
    return [...this.payloadMismatches];
  }

  resolveReference(documentId: DocumentId, nodeId: NodeId): ReferenceResolution {
    const direct = this.nodes.get(nodeId);
    if (direct && direct.documentId === documentId) {
      if (direct.retiredAt === undefined) {
        return { outcome: "active", node: structuredClone(direct) };
      }
      const descendants = this.findActiveDescendants(documentId, nodeId);
      return {
        outcome: "retired",
        node: structuredClone(direct),
        retired: true,
        ...(descendants.length > 0 ? { descendants } : {}),
      };
    }

    const descendants = this.findActiveDescendants(documentId, nodeId);
    if (descendants.length > 0) {
      return {
        outcome: "evolved-via-lineage",
        descendants,
      };
    }

    const purged = this.purged.get(nodeId);
    if (purged && purged.documentId === documentId) {
      return {
        outcome: "purged",
        tombstone: structuredClone(purged),
      };
    }

    return { outcome: "not-found", nodeId };
  }

  purgeNode(documentId: DocumentId, nodeId: NodeId): void {
    const direct = this.nodes.get(nodeId);
    if (!direct || direct.documentId !== documentId) {
      throw new FDPMException("not_found", `node not found: ${nodeId}`);
    }
    if (direct.retiredAt === undefined) {
      throw new FDPMException(
        "conflict",
        `purge requires a retired node: ${nodeId}`,
      );
    }
    this.purged.set(nodeId, {
      id: direct.id,
      documentId: direct.documentId,
      purged: true,
      retiredAt: direct.retiredAt,
      retiredBy: direct.retiredBy,
    });
    this.nodes.delete(nodeId);
  }

  listActiveNodes(documentId: DocumentId, parentNodeId: NodeId | null = null): Node[] {
    return [...this.nodes.values()]
      .filter(
        (node) =>
          node.documentId === documentId &&
          node.parentNodeId === parentNodeId &&
          node.retiredAt === undefined,
      )
      .sort((left, right) => comparePositions(left.position, right.position))
      .map((node) => structuredClone(node));
  }

  nextPosition(
    documentId: DocumentId,
    parentNodeId: NodeId | null,
    leftNodeId: NodeId | null,
    rightNodeId: NodeId | null,
  ): Position {
    const siblings = this.listActiveNodes(documentId, parentNodeId);
    const left = leftNodeId === null
      ? null
      : siblings.find((node) => node.id === leftNodeId)?.position ?? null;
    const right = rightNodeId === null
      ? null
      : siblings.find((node) => node.id === rightNodeId)?.position ?? null;
    return positionBetween(left, right);
  }

  apply(operation: DnisOperation): OperationResult {
    const recorded = this.results.get(operation.id);
    if (recorded) {
      if (canonicalize(recorded.operation) !== canonicalize(operation)) {
        this.payloadMismatches.add(operation.id);
      }
      return structuredClone(recorded.result);
    }

    const document = this.documents.get(operation.documentId);
    if (!document) {
      throw new FDPMException(
        "not_found",
        `document not found: ${operation.documentId}`,
      );
    }

    const appliedAt = this.now();
    const planned = this.planOperation(document, operation, appliedAt);
    for (const node of planned.upserts) {
      this.nodes.set(node.id, node);
    }
    const result: OperationResult = {
      operationId: operation.id,
      appliedAt,
      affectedNodeIds: planned.affectedNodeIds,
      newRevisions: planned.newRevisions,
    };
    this.results.set(operation.id, {
      operation: structuredClone(operation),
      result: structuredClone(result),
    });
    return structuredClone(result);
  }

  private planOperation(
    document: Document,
    operation: DnisOperation,
    appliedAt: string,
  ): {
    upserts: Node[];
    affectedNodeIds: NodeId[];
    newRevisions: Record<string, number>;
  } {
    switch (operation.type) {
      case "create":
        return this.planCreate(document, operation);
      case "edit":
        return this.planEdit(document, operation);
      case "move":
        return this.planMove(document, operation);
      case "split":
        return this.planSplit(document, operation, appliedAt);
      case "merge":
        return this.planMerge(document, operation, appliedAt);
      case "retire":
        return this.planRetire(document, operation, appliedAt);
      case "compact":
        return this.planCompact(document, operation);
      default:
        throw new FDPMException("internal", "unreachable DNIS operation branch");
    }
  }

  private planCreate(
    document: Document,
    operation: Extract<DnisOperation, { type: "create" }>,
  ) {
    this.assertPosition(operation.payload.position);
    if (operation.payload.parentNodeId !== null) {
      this.assertActiveNode(document.id, operation.payload.parentNodeId);
    }
    this.assertUniqueSiblingPosition(
      document.id,
      operation.payload.parentNodeId,
      operation.payload.position,
      null,
    );
    const nodeId = this.mintId() as NodeId;
    const contentHash = this.hashContent(document.hashAlgorithm, operation.payload.content);
    const node: Node = {
      id: nodeId,
      documentId: document.id,
      kind: operation.payload.kind,
      content: structuredClone(operation.payload.content),
      contentHash,
      parentNodeId: operation.payload.parentNodeId,
      position: operation.payload.position,
      derivedFrom: [],
      createdBy: operation.agentId,
      createdAt: operation.issuedAt,
      revision: 0,
      lastEditedBy: operation.agentId,
      lastEditedAt: operation.issuedAt,
      lastOperationId: operation.id,
    };
    return {
      upserts: [node],
      affectedNodeIds: [nodeId],
      newRevisions: { [nodeId]: 0 },
    };
  }

  private planEdit(
    document: Document,
    operation: Extract<DnisOperation, { type: "edit" }>,
  ) {
    const target = this.assertActiveNode(document.id, operation.targetNodeId);
    this.assertExpectedRevision(target, operation.expectedRevision);
    const updated: Node = {
      ...target,
      content: structuredClone(operation.payload.content),
      contentHash: this.hashContent(document.hashAlgorithm, operation.payload.content),
      revision: target.revision + 1,
      lastEditedBy: operation.agentId,
      lastEditedAt: operation.issuedAt,
      lastOperationId: operation.id,
    };
    return {
      upserts: [updated],
      affectedNodeIds: [target.id],
      newRevisions: { [target.id]: updated.revision },
    };
  }

  private planSplit(
    document: Document,
    operation: Extract<DnisOperation, { type: "split" }>,
    appliedAt: string,
  ) {
    const target = this.assertActiveNode(document.id, operation.targetNodeId);
    this.assertExpectedRevision(target, operation.expectedRevision);
    if (operation.payload.parts.length < 2) {
      throw new FDPMException("verification", "split requires at least 2 parts");
    }

    const nextSibling = this.findNextActiveSibling(document.id, target);
    const nextBoundary = nextSibling?.position ?? null;
    let previousPosition = target.position;
    const created: Node[] = operation.payload.parts.map((part, index) => {
      const position =
        index === 0
          ? target.position
          : positionBetween(previousPosition, nextBoundary);
      previousPosition = position;
      const nodeId = this.mintId() as NodeId;
      return {
        id: nodeId,
        documentId: document.id,
        kind: target.kind,
        content: structuredClone(part.content),
        contentHash: this.hashContent(document.hashAlgorithm, part.content),
        parentNodeId: target.parentNodeId,
        position,
        derivedFrom: [target.id],
        createdBy: operation.agentId,
        createdAt: operation.issuedAt,
        revision: 0,
        lastEditedBy: operation.agentId,
        lastEditedAt: operation.issuedAt,
        lastOperationId: operation.id,
      };
    });

    const retiredTarget: Node = {
      ...target,
      retiredAt: appliedAt,
      retiredBy: operation.agentId,
    };

    return {
      upserts: [retiredTarget, ...created],
      affectedNodeIds: [target.id, ...created.map((node) => node.id)],
      newRevisions: Object.fromEntries([
        [target.id, target.revision],
        ...created.map((node) => [node.id, 0]),
      ]),
    };
  }

  private planMerge(
    document: Document,
    operation: Extract<DnisOperation, { type: "merge" }>,
    appliedAt: string,
  ) {
    if (operation.targetNodeIds.length < 2) {
      throw new FDPMException("verification", "merge requires at least 2 target nodes");
    }
    const targets = operation.targetNodeIds.map((nodeId) =>
      this.assertActiveNode(document.id, nodeId),
    );
    const parentNodeId = targets[0]!.parentNodeId;
    const kind = targets[0]!.kind;
    for (const target of targets) {
      if (target.parentNodeId !== parentNodeId) {
        throw new FDPMException(
          "conflict",
          "merge targets must share the same parentNodeId",
        );
      }
      if (target.kind !== kind) {
        throw new FDPMException("conflict", "merge targets must share the same kind");
      }
    }

    if (operation.payload.expectedRevisions !== undefined) {
      if (operation.payload.expectedRevisions.length !== targets.length) {
        throw new FDPMException(
          "verification",
          "merge expectedRevisions must align 1:1 with targetNodeIds",
        );
      }
      for (const [index, target] of targets.entries()) {
        this.assertExpectedRevision(target, operation.payload.expectedRevisions[index]);
      }
    }

    const orderedTargets = [...targets].sort((left, right) =>
      comparePositions(left.position, right.position),
    );
    const siblings = this.listActiveNodes(document.id, parentNodeId);
    const siblingIds = siblings.map((node) => node.id);
    const targetIndices = orderedTargets.map((node) => siblingIds.indexOf(node.id));
    for (let i = 1; i < targetIndices.length; i += 1) {
      if (targetIndices[i] !== targetIndices[i - 1]! + 1) {
        throw new FDPMException(
          "conflict",
          "merge targets must be contiguous active siblings",
        );
      }
    }

    const mergedId = this.mintId() as NodeId;
    const merged: Node = {
      id: mergedId,
      documentId: document.id,
      kind,
      content: structuredClone(operation.payload.content),
      contentHash: this.hashContent(document.hashAlgorithm, operation.payload.content),
      parentNodeId,
      position: orderedTargets[0]!.position,
      derivedFrom: orderedTargets.map((node) => node.id),
      createdBy: operation.agentId,
      createdAt: operation.issuedAt,
      revision: 0,
      lastEditedBy: operation.agentId,
      lastEditedAt: operation.issuedAt,
      lastOperationId: operation.id,
    };
    const retiredTargets = orderedTargets.map((target) => ({
      ...target,
      retiredAt: appliedAt,
      retiredBy: operation.agentId,
    }));

    return {
      upserts: [...retiredTargets, merged],
      affectedNodeIds: [...orderedTargets.map((node) => node.id), mergedId],
      newRevisions: Object.fromEntries([
        ...orderedTargets.map((node) => [node.id, node.revision]),
        [mergedId, 0],
      ]),
    };
  }

  private planRetire(
    document: Document,
    operation: Extract<DnisOperation, { type: "retire" }>,
    appliedAt: string,
  ) {
    const target = this.assertActiveNode(document.id, operation.targetNodeId);
    this.assertExpectedRevision(target, operation.expectedRevision);
    const retired: Node = {
      ...target,
      retiredAt: appliedAt,
      retiredBy: operation.agentId,
    };
    return {
      upserts: [retired],
      affectedNodeIds: [target.id],
      newRevisions: { [target.id]: target.revision },
    };
  }

  private planCompact(
    document: Document,
    operation: Extract<DnisOperation, { type: "compact" }>,
  ) {
    if (operation.targetNodeIds.length === 0) {
      throw new FDPMException("verification", "compact requires at least 1 target node");
    }
    if (operation.targetNodeIds.length !== operation.payload.repositions.length) {
      throw new FDPMException(
        "verification",
        "compact targetNodeIds must align 1:1 with payload.repositions",
      );
    }

    const targets = operation.targetNodeIds.map((nodeId) =>
      this.assertActiveNode(document.id, nodeId),
    );
    const repositionMap = new Map<NodeId, Position>();
    for (const entry of operation.payload.repositions) {
      this.assertPosition(entry.newPosition);
      repositionMap.set(entry.nodeId, entry.newPosition);
    }
    for (const target of targets) {
      if (!repositionMap.has(target.id)) {
        throw new FDPMException(
          "verification",
          `compact payload missing reposition for ${target.id}`,
        );
      }
    }

    const currentOrder = [...targets].sort((left, right) =>
      comparePositions(left.position, right.position),
    );
    const proposedOrder = [...targets].sort((left, right) =>
      comparePositions(repositionMap.get(left.id)!, repositionMap.get(right.id)!),
    );
    for (let i = 0; i < currentOrder.length; i += 1) {
      if (currentOrder[i]!.id !== proposedOrder[i]!.id) {
        throw new FDPMException(
          "conflict",
          "compact must preserve the relative ordering of the targeted nodes",
        );
      }
    }

    const updated = targets.map((target) => ({
      ...target,
      position: repositionMap.get(target.id)!,
    }));
    return {
      upserts: updated,
      affectedNodeIds: updated.map((node) => node.id),
      newRevisions: Object.fromEntries(updated.map((node) => [node.id, node.revision])),
    };
  }

  private planMove(
    document: Document,
    operation: Extract<DnisOperation, { type: "move" }>,
  ) {
    const target = this.assertActiveNode(document.id, operation.targetNodeId);
    this.assertExpectedRevision(target, operation.expectedRevision);
    this.assertPosition(operation.payload.newPosition);

    const parentNodeId =
      "newParentNodeId" in operation.payload
        ? (operation.payload.newParentNodeId ?? null)
        : target.parentNodeId;
    if (parentNodeId !== null) {
      this.assertActiveNode(document.id, parentNodeId);
      this.assertNotDescendant(parentNodeId, target.id);
    }
    this.assertUniqueSiblingPosition(
      document.id,
      parentNodeId,
      operation.payload.newPosition,
      target.id,
    );

    const updated: Node = {
      ...target,
      parentNodeId,
      position: operation.payload.newPosition,
      revision: target.revision + 1,
      lastEditedBy: operation.agentId,
      lastEditedAt: operation.issuedAt,
      lastOperationId: operation.id,
    };
    return {
      upserts: [updated],
      affectedNodeIds: [target.id],
      newRevisions: { [target.id]: updated.revision },
    };
  }

  private assertActiveNode(documentId: DocumentId, nodeId: NodeId): Node {
    const node = this.nodes.get(nodeId);
    if (!node || node.documentId !== documentId) {
      throw new FDPMException("not_found", `node not found: ${nodeId}`);
    }
    if (node.retiredAt !== undefined) {
      throw new FDPMException("conflict", `node is retired: ${nodeId}`);
    }
    return structuredClone(node);
  }

  private assertExpectedRevision(node: Node, expectedRevision?: number): void {
    if (expectedRevision === undefined) return;
    if (node.revision !== expectedRevision) {
      throw new FDPMException(
        "conflict",
        `expectedRevision=${expectedRevision} does not match current=${node.revision}`,
        { evidence: { current_revision: node.revision, node_id: node.id } },
      );
    }
  }

  private assertPosition(position: Position): void {
    if (!isValidPosition(position)) {
      throw new FDPMException("verification", `invalid position: ${position}`);
    }
  }

  private assertUniqueSiblingPosition(
    documentId: DocumentId,
    parentNodeId: NodeId | null,
    position: Position,
    excludeNodeId: NodeId | null,
  ): void {
    const duplicate = [...this.nodes.values()].find(
      (node) =>
        node.documentId === documentId &&
        node.parentNodeId === parentNodeId &&
        node.retiredAt === undefined &&
        node.position === position &&
        node.id !== excludeNodeId,
    );
    if (duplicate) {
      throw new FDPMException(
        "conflict",
        `position already occupied under parent ${parentNodeId ?? "root"}: ${position}`,
        { evidence: { conflicting_node_id: duplicate.id } },
      );
    }
  }

  private assertNotDescendant(candidateParentId: NodeId, targetNodeId: NodeId): void {
    let cursor: NodeId | null = candidateParentId;
    const seen = new Set<NodeId>();
    while (cursor !== null) {
      if (cursor === targetNodeId) {
        throw new FDPMException(
          "conflict",
          `move would create a parent cycle through ${candidateParentId}`,
        );
      }
      if (seen.has(cursor)) {
        throw new FDPMException("conflict", `existing parent cycle detected at ${cursor}`);
      }
      seen.add(cursor);
      const node = this.nodes.get(cursor);
      cursor = node?.parentNodeId ?? null;
    }
  }

  private hashContent(algorithm: DnisHashAlgorithm, content: unknown): ContentHash {
    if (algorithm !== "sha256") {
      throw new FDPMException(
        "verification",
        `hash algorithm not implemented in this slice: ${algorithm}`,
      );
    }
    const canonical = canonicalize(content);
    const digest = createHash("sha256").update(canonical).digest("hex");
    return `sha256:${digest}` as ContentHash;
  }

  private findNextActiveSibling(documentId: DocumentId, node: Node): Node | null {
    return this.listActiveNodes(documentId, node.parentNodeId).find(
      (sibling) => comparePositions(sibling.position, node.position) > 0,
    ) ?? null;
  }

  private findActiveDescendants(documentId: DocumentId, ancestorId: NodeId): Node[] {
    const descendantsByAncestor = new Map<NodeId, Node[]>();
    for (const node of this.nodes.values()) {
      for (const directAncestor of node.derivedFrom) {
        const bucket = descendantsByAncestor.get(directAncestor) ?? [];
        bucket.push(node);
        descendantsByAncestor.set(directAncestor, bucket);
      }
    }

    const queue: NodeId[] = [ancestorId];
    const visited = new Set<NodeId>();
    const active = new Map<NodeId, Node>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const children = descendantsByAncestor.get(current) ?? [];
      for (const child of children) {
        queue.push(child.id);
        if (child.documentId === documentId && child.retiredAt === undefined) {
          active.set(child.id, structuredClone(child));
        }
      }
    }

    return [...active.values()].sort((left, right) =>
      comparePositions(left.position, right.position),
    );
  }
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new FDPMException("verification", "content contains a non-finite number");
      }
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
    case "function":
    case "symbol":
      throw new FDPMException(
        "verification",
        `content contains a non-JSON value of type ${typeof value}`,
      );
    case "undefined":
      return "null";
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
      }
      if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
      }
      return `{${Object.keys(value)
        .sort()
        .flatMap((key) => {
          const entry = (value as Record<string, unknown>)[key];
          if (entry === undefined) return [];
          return [`${JSON.stringify(key)}:${canonicalize(entry)}`];
        })
        .join(",")}}`;
  }
  throw new FDPMException("internal", "unreachable canonicalize branch");
}
