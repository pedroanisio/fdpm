/**
 * Ingest a DocumentPlan instance (JSON) into an FDPM workbook on
 * profile:document-plan-dnis:3.1.
 *
 * ⚠ ARCHITECTURAL CONTRACT (PALS's LAW) — the plan instance is untrusted
 * input regardless of who produced it. Step 1 runs the complete
 * DocumentPlanSchema (including its superRefine cross-reference, ordering,
 * budget and DAG rules) and refuses with a `verification` envelope carrying
 * every Zod issue. Nothing is written before that gate passes; every write
 * after it still runs the host's §7 pipeline.
 *
 * Phases (mirrors scripts/build-spec-core.ts):
 *   1. safeParse → typed plan with defaults applied.
 *   2. defineProject(): the header primitive + the five registries, plus the
 *      registry-only relations (asset → source, plan → translation source).
 *   3. DnisHostAdapter: one dnis:Document, then one dnis:Node per SectionNode
 *      in reading order (front matter, body, back matter), positions from
 *      positionBetween(), node.kind as the DNIS kind, the SectionNode's own
 *      fields (minus children) + region + slug as the content JSON.
 *   4. Node ↔ registry relations from the parsed plan (concept_ids,
 *      thread_ids, owner_id, evidence, asset.node_id, concept.introduced_in).
 */
import type { Host } from "../../src/core/host.js";
import { FDPMException } from "../../src/core/errors/fdpm-exception.js";
import {
  DnisHostAdapter,
  positionBetween,
  type AgentId,
  type DocumentId,
  type NodeId,
  type OperationId,
} from "../../src/core/dnis/index.js";
import { mintUid } from "../../src/core/identity/uid.js";
import { defineProject, type PrimitiveSpec, type RelationSpec } from "../../src/sdk.js";
import {
  DocumentPlanSchema,
  effectiveEvidence,
  primitiveId,
  type DocumentPlan,
  type SectionNode,
} from "../document_plan/index.js";
import { PROFILE_ID as COMPOSITION_PROFILE_ID, REL } from "./index.js";
import { findComparativeClaimsWithoutBaseline, type CoherenceFinding } from "./validators/coherence.js";

export { COMPOSITION_PROFILE_ID };

export interface BuildOptions {
  workbookId: string;
  workbookName?: string;
  description?: string;
  /** AgentId recorded on the dnis:Document and every node. */
  agentId?: string;
  /** Clock override for deterministic tests. */
  now?: () => string;
}

export interface BuildReport {
  workbookId: string;
  planId: string;
  profileId: string;
  primitives: number;
  relations: number;
  nodes: number;
  dnisDocumentId: string;
  /** SectionNode slug → dnis:Node primitive id. */
  nodePrimitiveIdBySlug: Record<string, string>;
  /**
   * Warning-level coherence findings computed on the committed workbook
   * (docplan:coherence.comparative-claim-without-baseline). The same rule
   * runs in the host pipeline on every node write; it is repeated here so
   * an ingest run surfaces it without a separate `fdpm validate`.
   */
  coherence_warnings: CoherenceFinding[];
}

type Region = "front_matter" | "body" | "back_matter";

/** JSON round-trip: drops `undefined` so field_values are exactly what the log stores. */
function jsonClean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Validate an untrusted plan. Returns the typed plan or throws a
 * `verification` FDPMException whose findings are the Zod issues.
 */
export function parseDocumentPlan(input: unknown): DocumentPlan {
  const result = DocumentPlanSchema.safeParse(input);
  if (!result.success) {
    throw new FDPMException(
      "verification",
      `document plan rejected by DocumentPlanSchema (${result.error.issues.length} issue(s)); first: ${result.error.issues[0]?.path.join(".") || "<root>"}: ${result.error.issues[0]?.message ?? ""}`,
      { findings: result.error.issues, evidence: { issue_count: result.error.issues.length } },
    );
  }
  return result.data;
}

export async function buildDocumentPlanWorkbook(
  host: Host,
  planInput: unknown,
  opts: BuildOptions,
): Promise<BuildReport> {
  const plan = parseDocumentPlan(planInput);
  const agent = (opts.agentId ?? "agent:build-document-plan") as AgentId;
  const now = opts.now ?? (() => new Date().toISOString());

  // ── Phase 2: header + registries ───────────────────────────────────
  const { structure, threads, people, content, ...headerRest } = plan;
  const headerFields = jsonClean({
    ...headerRest,
    content: content.examples ? { examples: content.examples } : {},
  });
  const planPrimId = primitiveId("DocumentPlan", plan.id);

  const primitives: PrimitiveSpec[] = [
    { id: planPrimId, type: "docplan:DocumentPlan", fields: headerFields },
  ];
  for (const s of content.sources ?? []) {
    primitives.push({ id: primitiveId("ContentSource", s.id), type: "docplan:ContentSource", fields: jsonClean(s) });
  }
  for (const c of content.concepts ?? []) {
    primitives.push({ id: primitiveId("Concept", c.id), type: "docplan:Concept", fields: jsonClean(c) });
  }
  for (const a of content.assets ?? []) {
    primitives.push({ id: primitiveId("Asset", a.id), type: "docplan:Asset", fields: jsonClean(a) });
  }
  for (const t of threads ?? []) {
    primitives.push({ id: primitiveId("Thread", t.id), type: "docplan:Thread", fields: jsonClean(t) });
  }
  for (const p of people ?? []) {
    primitives.push({ id: primitiveId("Person", p.id), type: "docplan:Person", fields: jsonClean(p) });
  }

  const phase1Relations: RelationSpec[] = [];
  const knownPrimitiveIds = new Set(primitives.map((p) => p.id));
  for (const a of content.assets ?? []) {
    if (a.source_id) {
      phase1Relations.push({
        id: `docplan:asset-source:${a.id}`,
        type: REL.AssetReproducedFrom,
        from: primitiveId("Asset", a.id),
        to: primitiveId("ContentSource", a.source_id),
      });
    }
  }
  if (plan.translation_of && knownPrimitiveIds.has(primitiveId("DocumentPlan", plan.translation_of))) {
    phase1Relations.push({
      id: `docplan:translation-of:${plan.id}`,
      type: REL.PlanTranslationOf,
      from: planPrimId,
      to: primitiveId("DocumentPlan", plan.translation_of),
    });
  }

  const commit = await defineProject(host, {
    id: opts.workbookId,
    name: opts.workbookName ?? plan.title,
    profile: COMPOSITION_PROFILE_ID,
    description: opts.description ?? plan.description,
  })
    .primitives(primitives)
    .relations(phase1Relations)
    .commit();

  // ── Phase 3: DNIS document + node tree ─────────────────────────────
  const adapter = new DnisHostAdapter(host, { workbookId: opts.workbookId });
  const dnisDoc = await adapter.createDocument({
    createdBy: agent,
    createdAt: now(),
    schemaVersion: "0.1.7",
    hashAlgorithm: "sha256",
    metadata: { plan_id: plan.id, title: plan.title, plan_schema_version: plan.schema_version },
  });

  const nodeIdBySlug = new Map<string, NodeId>();
  const nodePrimitiveIdBySlug: Record<string, string> = {};
  let opCounter = 0;

  async function createNode(node: SectionNode, parent: NodeId | null, region: Region): Promise<void> {
    const { children, ...own } = node;
    const siblings = adapter.listActiveNodes(dnisDoc.id, parent);
    const last = siblings.length > 0 ? siblings[siblings.length - 1]! : null;
    const position = positionBetween(last?.position ?? null, null);
    opCounter += 1;
    const result = await adapter.apply({
      id: mintUid() as OperationId,
      type: "create",
      documentId: dnisDoc.id,
      agentId: agent,
      issuedAt: now(),
      payload: {
        kind: node.kind,
        content: jsonClean({ region, slug: node.id, ...own }),
        parentNodeId: parent,
        position,
      },
    });
    const nid = result.affectedNodeIds[0]!;
    nodeIdBySlug.set(node.id, nid);
    const located = host.lookupUid(nid);
    if (!located) {
      throw new FDPMException("internal", `dnis:Node ${nid} for slug "${node.id}" was not indexed after create`);
    }
    nodePrimitiveIdBySlug[node.id] = located.id;
    for (const child of children ?? []) await createNode(child, nid, region);
  }

  for (const n of structure.front_matter ?? []) await createNode(n, null, "front_matter");
  for (const n of structure.sections) await createNode(n, null, "body");
  for (const n of structure.back_matter ?? []) await createNode(n, null, "back_matter");

  // ── Phase 4: node ↔ registry relations ─────────────────────────────
  const docLocated = host.lookupUid(dnisDoc.id as unknown as string);
  if (!docLocated) {
    throw new FDPMException("internal", `dnis:Document ${dnisDoc.id} was not indexed after create`);
  }
  let relationCount = commit.relations_created;
  async function rel(id: string, type: string, from: string, to: string, fields?: Record<string, unknown>): Promise<void> {
    await host.createRelation(opts.workbookId, {
      id,
      type_id: type,
      source_id: from,
      target_id: to,
      ...(fields ? { field_values: jsonClean(fields) } : {}),
    });
    relationCount += 1;
  }

  await rel(`docplan:plan-has-document:${plan.id}`, REL.PlanHasDocument, planPrimId, docLocated.id);

  const walk = (nodes: readonly SectionNode[] | undefined): SectionNode[] => {
    const out: SectionNode[] = [];
    for (const n of nodes ?? []) {
      out.push(n);
      out.push(...walk(n.children));
    }
    return out;
  };
  const allNodes = [...walk(structure.front_matter), ...walk(structure.sections), ...walk(structure.back_matter)];

  for (const node of allNodes) {
    const nodePrim = nodePrimitiveIdBySlug[node.id]!;
    for (const cid of node.concept_ids ?? []) {
      // Concepts carried from an earlier series volume are not in this workbook.
      if (!knownPrimitiveIds.has(primitiveId("Concept", cid))) continue;
      await rel(`docplan:uses-concept:${node.id}:${cid}`, REL.NodeUsesConcept, nodePrim, primitiveId("Concept", cid));
    }
    for (const tid of node.thread_ids ?? []) {
      await rel(`docplan:advances-thread:${node.id}:${tid}`, REL.NodeAdvancesThread, nodePrim, primitiveId("Thread", tid));
    }
    if (node.owner_id) {
      await rel(`docplan:owned-by:${node.id}`, REL.NodeOwnedBy, nodePrim, primitiveId("Person", node.owner_id));
    }
    if (node.content) {
      const evidence = effectiveEvidence(node.content);
      for (let i = 0; i < evidence.length; i += 1) {
        const ev = evidence[i]!;
        await rel(
          `docplan:cites:${node.id}:${i + 1}`,
          REL.NodeCites,
          nodePrim,
          primitiveId("ContentSource", ev.source_id),
          {
            ...(ev.locator !== undefined ? { locator: ev.locator } : {}),
            supports: ev.supports,
            ...(ev.note !== undefined ? { note: ev.note } : {}),
          },
        );
      }
    }
  }
  for (const a of content.assets ?? []) {
    await rel(`docplan:placed-in:${a.id}`, REL.AssetPlacedIn, primitiveId("Asset", a.id), nodePrimitiveIdBySlug[a.node_id]!);
  }
  for (const c of content.concepts ?? []) {
    await rel(`docplan:introduced-in:${c.id}`, REL.ConceptIntroducedIn, primitiveId("Concept", c.id), nodePrimitiveIdBySlug[c.introduced_in]!);
  }

  const slice = host.getProject(opts.workbookId);
  return {
    workbookId: opts.workbookId,
    planId: plan.id,
    profileId: COMPOSITION_PROFILE_ID,
    primitives: Object.keys(slice.primitives).length,
    relations: Object.keys(slice.relations).length,
    nodes: allNodes.length,
    dnisDocumentId: dnisDoc.id as unknown as string,
    nodePrimitiveIdBySlug,
    coherence_warnings: findComparativeClaimsWithoutBaseline(slice.primitives),
  };
  // `relationCount` is kept for callers debugging partial builds; the slice count is authoritative.
  void relationCount;
  void (dnisDoc.id as DocumentId);
}
