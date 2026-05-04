export type DocumentId = string & { readonly __brand: "DocumentId" };
export type NodeId = string & { readonly __brand: "NodeId" };
export type OperationId = string & { readonly __brand: "OperationId" };
export type AgentId = string & { readonly __brand: "AgentId" };
export type ContentHash = string & { readonly __brand: "ContentHash" };
export type Position = string & { readonly __brand: "Position" };

export type DnisHashAlgorithm = "sha256" | "blake3";

export interface Document {
  readonly id: DocumentId;
  readonly createdAt: string;
  readonly createdBy: AgentId;
  readonly schemaVersion: string;
  readonly hashAlgorithm: DnisHashAlgorithm;
  metadata: Record<string, unknown>;
}

export interface Node {
  readonly id: NodeId;
  readonly documentId: DocumentId;
  kind: string;
  content: unknown;
  contentHash: ContentHash;
  parentNodeId: NodeId | null;
  position: Position;
  readonly derivedFrom: ReadonlyArray<NodeId>;
  readonly createdBy: AgentId;
  readonly createdAt: string;
  revision: number;
  lastEditedBy: AgentId;
  lastEditedAt: string;
  lastOperationId: OperationId;
  retiredAt?: string;
  retiredBy?: AgentId;
  vectorClock?: Record<AgentId, number>;
}

export interface OperationCommon {
  readonly id: OperationId;
  readonly documentId: DocumentId;
  readonly agentId: AgentId;
  readonly issuedAt: string;
}

export interface CreatePayload {
  kind: string;
  content: unknown;
  parentNodeId: NodeId | null;
  position: Position;
}

export interface EditPayload {
  content: unknown;
}

export interface MovePayload {
  newParentNodeId?: NodeId | null;
  newPosition: Position;
}

export interface SplitPayload {
  parts: ReadonlyArray<{ content: unknown }>;
}

export interface MergePayload {
  content: unknown;
  expectedRevisions?: ReadonlyArray<number>;
}

export interface RetirePayload {
  reason?: string;
}

export interface CompactPayload {
  repositions: ReadonlyArray<{ nodeId: NodeId; newPosition: Position }>;
}

export type DnisOperation =
  | (OperationCommon & { readonly type: "create"; payload: CreatePayload })
  | (OperationCommon & {
      readonly type: "edit";
      targetNodeId: NodeId;
      expectedRevision?: number;
      payload: EditPayload;
    })
  | (OperationCommon & {
      readonly type: "move";
      targetNodeId: NodeId;
      expectedRevision?: number;
      payload: MovePayload;
    })
  | (OperationCommon & {
      readonly type: "split";
      targetNodeId: NodeId;
      expectedRevision?: number;
      payload: SplitPayload;
    })
  | (OperationCommon & {
      readonly type: "merge";
      targetNodeIds: ReadonlyArray<NodeId>;
      payload: MergePayload;
    })
  | (OperationCommon & {
      readonly type: "retire";
      targetNodeId: NodeId;
      expectedRevision?: number;
      payload: RetirePayload;
    })
  | (OperationCommon & {
      readonly type: "compact";
      targetNodeIds: ReadonlyArray<NodeId>;
      payload: CompactPayload;
    });

export interface OperationResult {
  readonly operationId: OperationId;
  readonly appliedAt: string;
  readonly affectedNodeIds: ReadonlyArray<NodeId>;
  readonly newRevisions: Record<string, number>;
}

export type ReferenceResolution =
  | {
      outcome: "active";
      node: Node;
    }
  | {
      outcome: "retired";
      node: Node;
      retired: true;
      descendants?: ReadonlyArray<Node>;
    }
  | {
      outcome: "evolved-via-lineage";
      descendants: ReadonlyArray<Node>;
    }
  | {
      outcome: "purged";
      tombstone: {
        id: NodeId;
        documentId: DocumentId;
        purged: true;
        retiredAt?: string;
        retiredBy?: AgentId;
      };
    }
  | {
      outcome: "not-found";
      nodeId: NodeId;
    };

export interface CreateDocumentInput {
  id?: DocumentId;
  createdBy: AgentId;
  createdAt?: string;
  schemaVersion: string;
  hashAlgorithm: DnisHashAlgorithm;
  metadata?: Record<string, unknown>;
}
