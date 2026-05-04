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
 * Out of CLI scope (use SDK / DnisHostAdapter directly): `edit`,
 * `move`, `split`, `merge`, `retire`, `compact`. These take payloads
 * complex enough that JSON-on-stdin or scripted callers are the right
 * surface; a CLI form would be little more than a thin JSON-pass-through
 * and would obscure rather than clarify operator intent. SPEC-CORE
 * §5.6.6 conformance is exercised by the test fixture, not by these
 * commands.
 */
import { Command } from "commander";
import type { Host } from "../core/host.js";
import { DnisHostAdapter } from "../core/dnis/adapter.js";
import {
  positionBetween,
  type AgentId,
  type DnisHashAlgorithm,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../core/dnis/index.js";
import { mintUid } from "../core/identity/uid.js";
import { FDPMException } from "../core/errors/fdpm-exception.js";
import { emit, type OutputContext } from "./util.js";

function adapterFor(host: Host, projectId: string): DnisHostAdapter {
  return new DnisHostAdapter(host, { projectId });
}

export function buildDnisCommand(host: Host): Command {
  const cmd = new Command("dnis");
  cmd.description("Document Node Identity (SPEC-CORE §5.6 / SPEC-DNIS) operations");

  cmd
    .command("create-doc")
    .argument("<project>", "project id (must use profile:dnis:0.1)")
    .requiredOption("--created-by <agent>", "AgentId of the document creator")
    .requiredOption("--schema-version <version>", "SPEC-DNIS revision the document is created under (e.g. 0.1.7)")
    .option("--hash <algo>", "content-hash algorithm (sha256 | blake3)", "sha256")
    .option("--id <document-id>", "explicit DocumentId (NID); minted if omitted")
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, project);
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
    .argument("<project>", "project id")
    .requiredOption("--document <document-id>", "DocumentId the node belongs to")
    .requiredOption("--agent <agent>", "AgentId of the operation actor")
    .requiredOption("--kind <kind>", "node kind (e.g. paragraph, section)")
    .requiredOption("--content <json>", "node content as a JSON string")
    .option("--parent <node-id>", "parent NodeId; root-level if omitted")
    .option("--operation-id <ulid>", "explicit OperationId; minted if omitted")
    .option("--issued-at <iso>", "operation issuedAt timestamp", new Date().toISOString())
    .option("--json", "emit JSON")
    .action(async (project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, project);
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
    .argument("<project>", "project id")
    .requiredOption("--document <document-id>", "DocumentId to list nodes from")
    .option("--parent <node-id>", "list children of this NodeId; root-level if omitted")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, project);
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
    .command("resolve")
    .argument("<project>", "project id")
    .requiredOption("--document <document-id>", "DocumentId scope of the reference")
    .requiredOption("--node <node-id>", "NodeId being resolved")
    .option("--json", "emit JSON")
    .action((project, opts) => {
      const ctx: OutputContext = { json: !!opts.json };
      const adapter = adapterFor(host, project);
      const resolution = adapter.resolveReference(
        opts.document as DocumentId,
        opts.node as NodeId,
      );
      emit(ctx, { resolution }, () => `outcome=${resolution.outcome}`);
    });

  // Use positionBetween import so the symbol stays in scope (the CLI
  // uses adapter.nextPosition internally, which delegates to this
  // helper). The void below is a no-op safeguard; the import is kept
  // for downstream consumers who tree-shake from src/commands/dnis.
  void positionBetween;

  return cmd;
}
