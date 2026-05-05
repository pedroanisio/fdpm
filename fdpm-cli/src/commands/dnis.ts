/**
 * `fdpm dnis` subcommands — operator surface for the SPEC-CORE §5.6
 * SPEC-DNIS adoption. Routes through DnisHostAdapter so every DNIS
 * Operation lands as one or more SPEC-CORE primitive/relation entries
 * on the op log per §5.6.2.
 *
 * Scope of this CLI surface:
 *   - `dnis create-doc` — create a `dnis:Document`
 *   - `dnis create-node` — apply a SPEC-DNIS `create` Operation
 *   - `dnis list` — list active nodes within a document (via the
 *                    adapter's projection)
 *   - `dnis resolve` — SPEC-DNIS §11 reference resolution
 *
 * Edit/move surface:
 *   - `dnis edit` — apply a SPEC-DNIS `edit` Operation (replaces content)
 *   - `dnis move` — apply a SPEC-DNIS `move` Operation; position is
 *                    chosen via --after/--before sibling pointers and
 *                    fed through DnisHostAdapter.nextPosition (i.e.
 *                    SPEC-DNIS §6 fractional-index positionBetween).
 *
 * Out of CLI scope (use SDK / DnisHostAdapter directly): `split`,
 * `merge`, `compact`. These take payloads complex enough that
 * JSON-on-stdin or scripted callers are the right surface. SPEC-CORE
 * §5.6.6 conformance is exercised by the test fixture.
 */
import { Command } from "commander";
import type { Host } from "../core/host.js";
import { DnisHostAdapter } from "../core/dnis/adapter.js";
import {
  type CommandMetadataMap,
  firstPositionalAfter,
  projectFromJsonField,
} from "./metadata.js";
import {
  type AgentId,
  type DnisHashAlgorithm,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../core/dnis/index.js";
import { mintUid } from "../core/identity/uid.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { emit, type OutputContext } from "./util.js";

function adapterFor(host: Host, workbookId: string): DnisHostAdapter {
  const adapter = new DnisHostAdapter(host, { workbookId });
  // Each CLI invocation is a fresh process — the adapter's in-memory
  // cache must be rebuilt from the persisted dnis:Document/dnis:Node
  // primitives before any read-or-mutate command runs. `create-doc`
  // also calls hydrate() so that subsequent writes within the same
  // process see the freshly-created document; the adapter's seed()
  // is idempotent.
  adapter.hydrate();
  return adapter;
}

export function buildDnisCommand(host: Host): Command {
  const cmd = new Command("dnis");
  cmd.description("Document Node Identity (SPEC-CORE §5.6 / SPEC-DNIS) operations");

  cmd
    .command("create-doc")
    .argument("<workbook>", "workbook id (must use profile:dnis:0.1)")
    .requiredOption("--created-by <agent>", "AgentId of the document creator")
    .requiredOption("--schema-version <version>", "SPEC-DNIS revision the document is created under (e.g. 0.1.7)")
    .option("--hash <algo>", "content-hash algorithm (sha256 | blake3)", "sha256")
    .option("--id <document-id>", "explicit DocumentId (NID); minted if omitted")
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      const document = await adapter.createDocument({
        ...(opts.id ? { id: opts.id as DocumentId } : {}),
        createdBy: opts.createdBy as AgentId,
        schemaVersion: opts.schemaVersion,
        hashAlgorithm: opts.hash as DnisHashAlgorithm,
      });
      emit(ctx, { document }, () =>
        `${document.id}\tcreated_by=${document.createdBy}\tschema=${document.schemaVersion}\thash=${document.hashAlgorithm}`,
      );
    });

  cmd
    .command("create-node")
    .argument("<workbook>", "workbook id")
    .requiredOption("--document <document-id>", "DocumentId the node belongs to")
    .requiredOption("--agent <agent>", "AgentId of the operation actor")
    .requiredOption("--kind <kind>", "node kind (e.g. paragraph, section)")
    .requiredOption("--content <json>", "node content as a JSON string")
    .option("--parent <node-id>", "parent NodeId; root-level if omitted")
    .option("--operation-id <ulid>", "explicit OperationId; minted if omitted")
    .option("--issued-at <iso>", "operation issuedAt timestamp", new Date().toISOString())
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      let content: unknown;
      try {
        content = JSON.parse(opts.content);
      } catch (err) {
        throw new FDPMException(
          "verification",
          `--content is not valid JSON: ${(err as Error).message}`,
        );
      }
      const documentId = opts.document as DocumentId;
      const parent = (opts.parent ?? null) as NodeId | null;
      const adapterDoc = adapter.getDocument(documentId);
      const position = adapter.nextPosition(adapterDoc.id, parent, null, null);
      const result = await adapter.apply({
        id: (opts.operationId ?? mintUid()) as OperationId,
        type: "create",
        documentId,
        agentId: opts.agent as AgentId,
        issuedAt: opts.issuedAt,
        payload: {
          kind: opts.kind,
          content,
          parentNodeId: parent,
          position,
        },
      });
      const nodeId = result.affectedNodeIds[0]!;
      const node = adapter.getNode(nodeId);
      emit(ctx, { result, node }, () =>
        `${nodeId}\tkind=${node.kind}\tposition=${node.position}\trev=${node.revision}\toperation_id=${result.operationId}`,
      );
    });

  cmd
    .command("list")
    .argument("<workbook>", "workbook id")
    .requiredOption("--document <document-id>", "DocumentId to list nodes from")
    .option("--parent <node-id>", "list children of this NodeId; root-level if omitted")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      const documentId = opts.document as DocumentId;
      const parent = (opts.parent ?? null) as NodeId | null;
      const nodes = adapter.listActiveNodes(documentId, parent);
      emit(ctx, { nodes }, () =>
        nodes
          .map((n) => `${n.id}\tkind=${n.kind}\tposition=${n.position}\trev=${n.revision}`)
          .join("\n"),
      );
    });

  cmd
    .command("edit")
    .argument("<workbook>", "workbook id")
    .requiredOption("--document <document-id>", "DocumentId the node belongs to")
    .requiredOption("--node <node-id>", "NodeId to edit")
    .requiredOption("--agent <agent>", "AgentId of the operation actor")
    .requiredOption("--content <json>", "new node content as a JSON string")
    .option("--expected-revision <n>", "fail unless node revision matches", (v) => Number.parseInt(v, 10))
    .option("--operation-id <ulid>", "explicit OperationId; minted if omitted")
    .option("--issued-at <iso>", "operation issuedAt timestamp", new Date().toISOString())
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      let content: unknown;
      try {
        content = JSON.parse(opts.content);
      } catch (err) {
        throw new FDPMException(
          "verification",
          `--content is not valid JSON: ${(err as Error).message}`,
        );
      }
      const result = await adapter.apply({
        id: (opts.operationId ?? mintUid()) as OperationId,
        type: "edit",
        documentId: opts.document as DocumentId,
        agentId: opts.agent as AgentId,
        issuedAt: opts.issuedAt,
        targetNodeId: opts.node as NodeId,
        ...(opts.expectedRevision !== undefined ? { expectedRevision: opts.expectedRevision } : {}),
        payload: { content },
      });
      const node = adapter.getNode(opts.node as NodeId);
      emit(ctx, { result, node }, () =>
        `${node.id}\trev=${node.revision}\toperation_id=${result.operationId}`,
      );
    });

  cmd
    .command("move")
    .argument("<workbook>", "workbook id")
    .requiredOption("--document <document-id>", "DocumentId the node belongs to")
    .requiredOption("--node <node-id>", "NodeId to move")
    .requiredOption("--agent <agent>", "AgentId of the operation actor")
    .option("--parent <node-id>", "new parent NodeId; if omitted, inferred from --after/--before; root-level otherwise. When given, overrides any sibling-inferred parent.")
    .option("--after <sibling-node-id>", "place immediately after this sibling (its parent is the inferred default unless --parent overrides)")
    .option("--before <sibling-node-id>", "place immediately before this sibling (its parent is the inferred default unless --parent overrides)")
    .option("--expected-revision <n>", "fail unless node revision matches", (v) => Number.parseInt(v, 10))
    .option("--operation-id <ulid>", "explicit OperationId; minted if omitted")
    .option("--issued-at <iso>", "operation issuedAt timestamp", new Date().toISOString())
    .option("--json", "emit JSON")
    .action(async (workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      const documentId = opts.document as DocumentId;

      const after = (opts.after ?? null) as NodeId | null;
      const before = (opts.before ?? null) as NodeId | null;
      const explicitParent = (opts.parent ?? null) as NodeId | null;

      // Sibling-inferred parent: --after/--before must agree if both
      // given. This is a correctness check (positionBetween across
      // different parents is meaningless), not a UX preference.
      let inferredParent: NodeId | null = null;
      let inferredFromSibling = false;
      if (after !== null) {
        inferredParent = adapter.getNode(after).parentNodeId;
        inferredFromSibling = true;
      }
      if (before !== null) {
        const parentOfBefore = adapter.getNode(before).parentNodeId;
        if (inferredFromSibling && inferredParent !== parentOfBefore) {
          throw new FDPMException(
            "verification",
            `--after and --before reference siblings under different parents (${inferredParent ?? "<root>"} vs ${parentOfBefore ?? "<root>"})`,
          );
        }
        inferredParent = parentOfBefore;
        inferredFromSibling = true;
      }

      // --parent overrides the sibling-inferred default. When the
      // override changes the parent, the sibling pointers no longer
      // identify real siblings under the new parent — drop them so
      // nextPosition computes an append-to-end position under the new
      // parent. (Mixing "place under parent X but after a child of
      // parent Y" has no well-defined meaning under SPEC-DNIS §6.)
      let newParent: NodeId | null;
      let effAfter: NodeId | null = after;
      let effBefore: NodeId | null = before;
      if (explicitParent !== null) {
        newParent = explicitParent;
        if (inferredFromSibling && inferredParent !== explicitParent) {
          effAfter = null;
          effBefore = null;
        }
      } else {
        newParent = inferredParent;
      }

      const newPosition = adapter.nextPosition(documentId, newParent, effAfter, effBefore);
      const result = await adapter.apply({
        id: (opts.operationId ?? mintUid()) as OperationId,
        type: "move",
        documentId,
        agentId: opts.agent as AgentId,
        issuedAt: opts.issuedAt,
        targetNodeId: opts.node as NodeId,
        ...(opts.expectedRevision !== undefined ? { expectedRevision: opts.expectedRevision } : {}),
        payload: { newParentNodeId: newParent, newPosition },
      });
      const node = adapter.getNode(opts.node as NodeId);
      emit(ctx, { result, node }, () =>
        `${node.id}\tparent=${node.parentNodeId ?? "<root>"}\tposition=${node.position}\trev=${node.revision}\toperation_id=${result.operationId}`,
      );
    });

  cmd
    .command("resolve")
    .argument("<workbook>", "workbook id")
    .requiredOption("--document <document-id>", "DocumentId scope of the reference")
    .requiredOption("--node <node-id>", "NodeId being resolved")
    .option("--json", "emit JSON")
    .action((workbook, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, workbook);
      const resolution = adapter.resolveReference(
        opts.document as DocumentId,
        opts.node as NodeId,
      );
      emit(ctx, { resolution }, () => `outcome=${resolution.outcome}`);
    });

  return cmd;
}

export const commandMetadata: CommandMetadataMap = {
  "dnis create-doc": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "dnis create-node": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "dnis list": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "dnis edit": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "dnis move": {
    readOnly: false,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
  "dnis resolve": {
    readOnly: true,
    projectIdsFromArgv: firstPositionalAfter(2),
    projectIdsFromJson: projectFromJsonField("workbook", "workbook_id"),
  },
};
